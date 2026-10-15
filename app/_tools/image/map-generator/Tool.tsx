"use client";

import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ToolProps } from "../../types";
import {
  MapMainInterface,
  type MapLayers,
  type MapOutput,
  type MapProjection,
} from "./MainInterface";
import { parseAse, type AseSwatch } from "./code/ase";
import { mapPalette as paletteColors } from "./code/palette";
import { layoutMapSvgLabels } from "./code/label-layout";
import {
  DEFAULT_MAP_PRINT_PRESET_ID,
  MAP_CLIMATE_COLORS,
  MAP_EXPORT_METADATA_FIELDS,
  MAP_LAYER_PRESETS,
  createMapExportMetadataDefaults,
  createMapPublicationPreflight,
  mapPrintPreset,
  mapPrintUnits,
  matchingMapPurpose,
  type MapExportMetadata,
  type MapLabelDensity,
  type MapPrintPresetId,
  type MapPublicationInspection,
  type MapPurpose,
} from "./code/editor-options";
import { mapUi } from "./copy";

const escapeLegendText = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!,
  );

export type DrawKind = "battle" | "city" | "peak" | "port" | "text" | "route";
export type MapAiOperation =
  | { type: "fill"; ids: string[]; targets: string[]; color: string }
  | { type: "label"; text: string; x: number; y: number };
export type MapAiPreview = {
  prompt: string;
  operations: Array<{ operation: MapAiOperation; approved: boolean }>;
  unresolved: string[];
  notes: string;
};
export type MapAiHistoryEntry = {
  prompt: string;
  status: "applied" | "dismissed";
  approved: number;
  total: number;
};
type MapDrawItem =
  | { kind: Exclude<DrawKind, "route">; label: string; x: number; y: number }
  | { kind: "route"; label: string; points: Array<{ x: number; y: number }> };

const dataBackedLayerIds: Partial<Record<keyof MapLayers, string>> = {
  climate: "climate-zones",
  terrain: "terrain",
  mountains: "mountains",
  cities: "cities",
  disputed: "disputed-boundaries",
};

function drawItemMarkup(item: MapDrawItem) {
  const label = (x: number, y: number) =>
    item.label
      ? `<text x="${(x + 6).toFixed(1)}" y="${(y - 5).toFixed(1)}" class="draw-label" font-size="7">${escapeLegendText(item.label)}</text>`
      : "";
  if (item.kind === "text")
    return `<text x="${item.x.toFixed(1)}" y="${item.y.toFixed(1)}" class="draw-item draw-text draw-label" font-size="7">${escapeLegendText(item.label)}</text>`;
  if (item.kind === "battle")
    return `<g class="draw-item draw-battle" transform="translate(${item.x.toFixed(1)} ${item.y.toFixed(1)})"><path d="M-4,-4 L4,4 M4,-4 L-4,4" stroke="#d76555" stroke-width="2.4"/>${label(0, 0)}</g>`;
  if (item.kind === "peak")
    return `<g class="draw-item draw-peak" transform="translate(${item.x.toFixed(1)} ${item.y.toFixed(1)})"><path d="M-4,3 L0,-4.5 L4,3 Z" fill="#8b6a52" stroke="#654936" stroke-width="0.5"/>${label(0, 0)}</g>`;
  if (item.kind === "route") {
    if (item.points.length < 2) return "";
    const path = item.points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
      )
      .join("");
    const before = item.points[item.points.length - 2];
    const last = item.points[item.points.length - 1];
    const angle =
      (Math.atan2(last.y - before.y, last.x - before.x) * 180) / Math.PI;
    return `<g class="draw-item draw-route"><path d="${path}" fill="none" stroke="#d76555" stroke-width="2.2"/><path d="M0,0 L-7,3 L-7,-3 Z" fill="#d76555" transform="translate(${last.x.toFixed(1)} ${last.y.toFixed(1)}) rotate(${angle.toFixed(1)})"/>${label(last.x, last.y)}</g>`;
  }
  return `<g class="draw-item draw-${item.kind}" transform="translate(${item.x.toFixed(1)} ${item.y.toFixed(1)})"><circle r="3.2" fill="#1a1a1a" stroke="#fff" stroke-width="1"/>${label(0, 0)}</g>`;
}

function readDrawStack(document: Document): MapDrawItem[] {
  const group = document.getElementById("editor-draw");
  if (!group) return [];
  try {
    return JSON.parse(
      group.getAttribute("data-draw-items") || "[]",
    ) as MapDrawItem[];
  } catch {
    return [];
  }
}

function writeDrawStack(document: Document, items: MapDrawItem[]) {
  let group: Element | null = document.getElementById("editor-draw");
  if (!group) {
    group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("id", "editor-draw");
    group.setAttribute("data-name", "Editor annotations");
    const labels = document.getElementById("labels");
    if (labels?.parentNode) labels.parentNode.insertBefore(group, labels);
    else document.documentElement.appendChild(group);
  }
  group.setAttribute("data-draw-items", JSON.stringify(items));
  group.innerHTML = items.map(drawItemMarkup).join("");
}

type MapViewport = { zoom: number; pan: { x: number; y: number } };
type ManualLabelPosition = {
  dx: number;
  dy: number;
  variant: "default" | "full" | "short";
};
type ManualLabelUndo = {
  key: string;
  previous: ManualLabelPosition | null;
};

function labelElements(document: Document, key: string) {
  return [
    ...document.querySelectorAll<SVGTextElement>("text[data-map-label-key]"),
  ].filter((element) => element.dataset.mapLabelKey === key);
}

function readManualLabelPosition(
  document: Document,
  key: string,
): ManualLabelPosition | null {
  const element = labelElements(document, key)[0];
  if (
    !element ||
    element.dataset.labelManualDx === undefined ||
    element.dataset.labelManualDy === undefined
  )
    return null;
  return {
    dx: Number(element.dataset.labelManualDx) || 0,
    dy: Number(element.dataset.labelManualDy) || 0,
    variant: (element.dataset.labelManualVariant || "default") as
      "default" | "full" | "short",
  };
}

function writeManualLabelPosition(
  document: Document,
  key: string,
  position: ManualLabelPosition | null,
) {
  for (const element of labelElements(document, key)) {
    if (position) {
      element.dataset.labelManualDx = String(Number(position.dx.toFixed(3)));
      element.dataset.labelManualDy = String(Number(position.dy.toFixed(3)));
      element.dataset.labelManualVariant = position.variant;
    } else {
      delete element.dataset.labelManualDx;
      delete element.dataset.labelManualDy;
      delete element.dataset.labelManualVariant;
    }
  }
}

function copyManualLabelPositions(previous: Document, next: Document) {
  const keys = new Set(
    [...previous.querySelectorAll<SVGTextElement>("text[data-label-manual-dx]")]
      .map((element) => element.dataset.mapLabelKey)
      .filter((key): key is string => Boolean(key)),
  );
  for (const key of keys)
    writeManualLabelPosition(next, key, readManualLabelPosition(previous, key));
}

export default function Tool({ language, active, onDiagnostics }: ToolProps) {
  const [mapOutput, setMapOutput] = useState<MapOutput | null>(null);
  const [mapError, setMapError] = useState("");
  const [mapPalette, setMapPalette] = useState<AseSwatch[]>([]);
  const [mapPaletteFile, setMapPaletteFile] = useState<File | null>(null);
  const mapPaletteInputRef = useRef<HTMLInputElement>(null);
  const toolRootRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const initialLoadRef = useRef(false);
  const loadedLanguageRef = useRef(language);
  const mapT = mapUi[language];
  const [timelineYear, setTimelineYear] = useState(2026);
  const [timelineYearInput, setTimelineYearInput] = useState("2026");
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const timelineRequestRef = useRef(0);
  const [mapLayers, setMapLayers] = useState<MapLayers>(() => ({
    ...MAP_LAYER_PRESETS.political,
  }));
  const [mapLabelDensity, setMapLabelDensity] =
    useState<MapLabelDensity>("standard");
  const [mapPrintPresetId, setMapPrintPresetId] = useState<MapPrintPresetId>(
    DEFAULT_MAP_PRINT_PRESET_ID,
  );
  const [mapExportMetadata, setMapExportMetadata] = useState<MapExportMetadata>(
    {
      title: "",
      subtitle: "",
      source: "",
      projectionNote: "",
      copyright: "",
    },
  );
  const mapExportMetadataDirtyRef = useRef(new Set<keyof MapExportMetadata>());
  const [mapPreflightInspection, setMapPreflightInspection] =
    useState<MapPublicationInspection>({
      usesRgbColors: true,
      unavailableFonts: null,
      labelsOutsideCrop: 0,
    });
  const [mapLabelMode, setMapLabelMode] = useState(false);
  const [mapLabelPositionMode, setMapLabelPositionMode] = useState(false);
  const [positionedMapLabels, setPositionedMapLabels] = useState<string[]>([]);
  const [mapLabelPositionUndo, setMapLabelPositionUndo] = useState<
    ManualLabelUndo[]
  >([]);
  const [hiddenMapLabels, setHiddenMapLabels] = useState<string[]>([]);
  const [mapDrawMode, setMapDrawMode] = useState(false);
  const [mapDrawKind, setMapDrawKind] = useState<DrawKind>("battle");
  const [mapDrawLabel, setMapDrawLabel] = useState("");
  const [mapDrawRoute, setMapDrawRoute] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const [mapDrawCount, setMapDrawCount] = useState(0);
  const [mapProjection, setMapProjection] =
    useState<MapProjection>("schematic");
  const mapProjectionRef = useRef<MapProjection>("schematic");
  const mapOutputProjectionRef = useRef<MapProjection>("schematic");
  const [mapFillMode, setMapFillMode] = useState(false);
  const [mapPromptText, setMapPromptText] = useState("");
  const [mapPromptStatus, setMapPromptStatus] = useState("");
  const [isMapPromptRunning, setIsMapPromptRunning] = useState(false);
  const [mapAiPreview, setMapAiPreview] = useState<MapAiPreview | null>(null);
  const [mapAiHistory, setMapAiHistory] = useState<MapAiHistoryEntry[]>([]);
  const [mapViewport, setMapViewport] = useState<MapViewport>({
    zoom: 1,
    pan: { x: 0, y: 0 },
  });
  const mapViewportRef = useRef(mapViewport);
  const mapViewportFrameRef = useRef<number | null>(null);
  const mapPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const mapPinchRef = useRef<{
    distance: number;
    midpoint: { x: number; y: number };
    viewport: MapViewport;
  } | null>(null);
  const mapDragRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
    regionId: string | null;
    labelKey: string | null;
    labelVariant: "default" | "full" | "short";
  } | null>(null);
  const mapZoom = mapViewport.zoom;
  const mapPan = mapViewport.pan;
  const mapPurpose = useMemo(() => matchingMapPurpose(mapLayers), [mapLayers]);

  useEffect(() => {
    if (!mapOutput) return;
    const defaults = createMapExportMetadataDefaults({
      title: mapOutput.spec.title,
      subtitle: mapOutput.spec.subtitle,
      sources: mapOutput.spec.sources,
      projectionLabel: mapT.projectionOptions[mapProjection],
      language,
    });
    setMapExportMetadata(
      (current) =>
        Object.fromEntries(
          MAP_EXPORT_METADATA_FIELDS.map((field) => [
            field,
            mapExportMetadataDirtyRef.current.has(field)
              ? current[field]
              : defaults[field],
          ]),
        ) as unknown as MapExportMetadata,
    );
  }, [language, mapOutput, mapProjection, mapT]);

  const mapPreflight = useMemo(
    () =>
      createMapPublicationPreflight({
        printPresetId: mapPrintPresetId,
        hasSources: Boolean(mapExportMetadata.source.trim()),
        hasDate: Boolean(mapOutput?.spec.date?.trim()),
        labelDensity: mapLabelDensity,
        layers: mapLayers,
        politicalYear: timelineYear,
        inspection: mapPreflightInspection,
      }),
    [
      mapPrintPresetId,
      mapOutput,
      mapExportMetadata.source,
      mapLabelDensity,
      mapLayers,
      timelineYear,
      mapPreflightInspection,
    ],
  );

  const loadTimelineYear = useCallback(
    async (year: number, projection?: MapProjection) => {
      const requestId = ++timelineRequestRef.current;
      setIsLoadingTimeline(true);
      setMapError("");
      setMapAiPreview(null);
      try {
        const response = await fetch(
          `/api/maps/timeline?year=${year}&projection=${projection ?? mapProjectionRef.current}&lang=${language === "cs" ? "cs" : "en"}`,
          {
            cache: "no-store",
          },
        );
        const result = (await response.json()) as MapOutput & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error || "Historical timeline failed.");
        if (!mountedRef.current || requestId !== timelineRequestRef.current)
          return;
        // Editor annotations (drawn markers and routes) survive year changes;
        // a projection change re-projects the canvas, so they are dropped there.
        const requestProjection = projection ?? mapProjectionRef.current;
        const projectionChanged =
          requestProjection !== mapOutputProjectionRef.current;
        setMapOutput((current) => {
          if (!current || projectionChanged) return result;
          const previous = new DOMParser().parseFromString(
            current.svg,
            "image/svg+xml",
          );
          const items = readDrawStack(previous);
          const hasManualLabels = previous.querySelector(
            "text[data-label-manual-dx]",
          );
          if (!items.length && !hasManualLabels) return result;
          const parsed = new DOMParser().parseFromString(
            result.svg,
            "image/svg+xml",
          );
          if (items.length) writeDrawStack(parsed, items);
          copyManualLabelPositions(previous, parsed);
          return {
            ...result,
            svg: new XMLSerializer().serializeToString(parsed.documentElement),
          };
        });
        mapOutputProjectionRef.current = requestProjection;
      } catch (error) {
        if (!mountedRef.current || requestId !== timelineRequestRef.current)
          return;
        setMapError(
          error instanceof Error
            ? error.message
            : "Historical timeline failed.",
        );
      } finally {
        if (mountedRef.current && requestId === timelineRequestRef.current)
          setIsLoadingTimeline(false);
      }
    },
    [language],
  );

  useEffect(() => {
    mountedRef.current = true;
    // Keep the initial request singular even when Strict Mode replays effects.
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      loadedLanguageRef.current = language;
      void loadTimelineYear(2026);
    } else if (loadedLanguageRef.current !== language) {
      loadedLanguageRef.current = language;
      void loadTimelineYear(timelineYear);
    }
    return () => {
      mountedRef.current = false;
      if (mapViewportFrameRef.current !== null) {
        cancelAnimationFrame(mapViewportFrameRef.current);
        mapViewportFrameRef.current = null;
      }
    };
  }, [language, loadTimelineYear, timelineYear]);

  useEffect(() => {
    if (active) return;
    mapPointersRef.current.clear();
    mapPinchRef.current = null;
    mapDragRef.current = null;
  }, [active]);

  useEffect(() => {
    onDiagnostics?.({
      appStatus: isLoadingTimeline
        ? "running"
        : mapError
          ? "error"
          : mapOutput
            ? "completed"
            : "idle",
      progress: null,
      inputSummary: {
        hasInput: true,
        fileType: mapPaletteFile?.type || null,
        fileSize: mapPaletteFile?.size ?? null,
        referenceCount: 0,
        hasResult: Boolean(mapOutput),
      },
    });
  }, [onDiagnostics, isLoadingTimeline, mapError, mapOutput, mapPaletteFile]);
  useEffect(() => {
    if (!active) return;
    const handleMapZoomKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']"))
        return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setMapViewport((current) => {
          const zoom = Math.min(40, current.zoom * 1.25);
          const ratio = zoom / current.zoom;
          const next = {
            zoom,
            pan: { x: current.pan.x * ratio, y: current.pan.y * ratio },
          };
          mapViewportRef.current = next;
          return next;
        });
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setMapViewport((current) => {
          const zoom = Math.max(0.5, current.zoom / 1.25);
          const ratio = zoom / current.zoom;
          const next = {
            zoom,
            pan: { x: current.pan.x * ratio, y: current.pan.y * ratio },
          };
          mapViewportRef.current = next;
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleMapZoomKey);
    return () => window.removeEventListener("keydown", handleMapZoomKey);
  }, [active]);

  function commitTimelineYear() {
    let year = Math.max(
      -3400,
      Math.min(2026, Number.parseInt(timelineYearInput, 10) || timelineYear),
    );
    if (year === 0) year = timelineYear < 0 ? 1 : -1;
    setTimelineYear(year);
    setTimelineYearInput(String(year));
    void loadTimelineYear(year);
  }

  function changeTimelineYearInput(value: string) {
    setTimelineYearInput(value);
    const year = Number(value);
    if (!Number.isInteger(year) || year < -3400 || year > 2026 || year === 0)
      return;
    setTimelineYear(year);
    void loadTimelineYear(year);
  }

  function stepTimelineYear(delta: number) {
    let year = Math.max(-3400, Math.min(2026, timelineYear + delta));
    if (year === 0) year = delta > 0 ? 1 : -1;
    setTimelineYear(year);
    setTimelineYearInput(String(year));
    void loadTimelineYear(year);
  }

  function changeMapProjection(projection: MapProjection) {
    if (projection === mapProjection) return;
    mapProjectionRef.current = projection;
    setMapProjection(projection);
    setPositionedMapLabels([]);
    setMapLabelPositionUndo([]);
    void loadTimelineYear(timelineYear, projection);
  }

  function toggleMapCountry(regionId: string) {
    if (!mapOutput) return;
    const document = new DOMParser().parseFromString(
      mapOutput.svg,
      "image/svg+xml",
    );
    const paths = [
      ...document.querySelectorAll(
        `path[data-region-id="${CSS.escape(regionId)}"], path[data-iso-numeric="${CSS.escape(regionId)}"], path[data-map-unit="${CSS.escape(regionId)}"]`,
      ),
    ];
    const selected = paths.some(
      (path) => path.getAttribute("data-selected") === "true",
    );
    for (const path of paths) {
      if (selected) {
        path.removeAttribute("data-selected");
        path.removeAttribute("style");
      } else {
        path.setAttribute("data-selected", "true");
        path.setAttribute("style", "fill:#ff661a");
      }
    }
    setMapOutput((current) =>
      current
        ? {
            ...current,
            svg: new XMLSerializer().serializeToString(
              document.documentElement,
            ),
          }
        : current,
    );
  }

  function serializeMapDocument(document: Document) {
    setMapOutput((current) =>
      current
        ? {
            ...current,
            svg: new XMLSerializer().serializeToString(
              document.documentElement,
            ),
          }
        : current,
    );
  }

  function hideMapLabel(labelKey: string) {
    if (!mapOutput) return;
    const parsed = new DOMParser().parseFromString(
      mapOutput.svg,
      "image/svg+xml",
    );
    const elements = [
      ...parsed.querySelectorAll(
        `text[data-map-label-key="${CSS.escape(labelKey)}"]`,
      ),
    ];
    if (!elements.length || hiddenMapLabels.includes(labelKey)) return;
    for (const element of elements) {
      element.setAttribute("data-label-hidden", "true");
      element.setAttribute("style", "display:none");
    }
    setHiddenMapLabels((current) => [...current, labelKey]);
    serializeMapDocument(parsed);
  }

  function undoHiddenMapLabel() {
    const labelKey = hiddenMapLabels[hiddenMapLabels.length - 1];
    if (!mapOutput || !labelKey) return;
    const parsed = new DOMParser().parseFromString(
      mapOutput.svg,
      "image/svg+xml",
    );
    for (const element of parsed.querySelectorAll(
      `text[data-map-label-key="${CSS.escape(labelKey)}"]`,
    )) {
      element.removeAttribute("data-label-hidden");
      element.removeAttribute("style");
    }
    setHiddenMapLabels((current) => current.slice(0, -1));
    serializeMapDocument(parsed);
  }

  function unhideAllMapLabels() {
    if (!mapOutput || !hiddenMapLabels.length) return;
    const parsed = new DOMParser().parseFromString(
      mapOutput.svg,
      "image/svg+xml",
    );
    for (const element of parsed.querySelectorAll(
      "text[data-label-hidden='true']",
    )) {
      element.removeAttribute("data-label-hidden");
      element.removeAttribute("style");
    }
    setHiddenMapLabels([]);
    serializeMapDocument(parsed);
  }

  function moveMapLabel(
    labelKey: string,
    variant: ManualLabelPosition["variant"],
    screenDx: number,
    screenDy: number,
  ) {
    const parsed = parseMapDocument();
    const displayedSvg =
      toolRootRef.current?.querySelector<SVGSVGElement>(".map-transform svg");
    if (!parsed || !displayedSvg) return;
    const bounds = displayedSvg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const previous = readManualLabelPosition(parsed, labelKey);
    const next = {
      dx: (previous?.dx ?? 0) + (screenDx * 1000) / bounds.width,
      dy: (previous?.dy ?? 0) + (screenDy * 700) / bounds.height,
      variant,
    };
    writeManualLabelPosition(parsed, labelKey, next);
    setMapLabelPositionUndo((current) => [
      ...current,
      { key: labelKey, previous },
    ]);
    setPositionedMapLabels((current) =>
      current.includes(labelKey) ? current : [...current, labelKey],
    );
    serializeMapDocument(parsed);
  }

  function undoMapLabelPosition() {
    const operation = mapLabelPositionUndo[mapLabelPositionUndo.length - 1];
    const parsed = parseMapDocument();
    if (!operation || !parsed) return;
    writeManualLabelPosition(parsed, operation.key, operation.previous);
    setMapLabelPositionUndo((current) => current.slice(0, -1));
    if (!operation.previous)
      setPositionedMapLabels((current) =>
        current.filter((key) => key !== operation.key),
      );
    serializeMapDocument(parsed);
  }

  function resetMapLabelPositions() {
    const parsed = parseMapDocument();
    if (!parsed || !positionedMapLabels.length) return;
    for (const key of positionedMapLabels)
      writeManualLabelPosition(parsed, key, null);
    setPositionedMapLabels([]);
    setMapLabelPositionUndo([]);
    serializeMapDocument(parsed);
  }

  function parseMapDocument() {
    if (!mapOutput) return null;
    return new DOMParser().parseFromString(mapOutput.svg, "image/svg+xml");
  }

  function commitDrawItems(items: MapDrawItem[]) {
    const parsed = parseMapDocument();
    if (!parsed) return;
    writeDrawStack(parsed, items);
    setMapDrawCount(items.length);
    serializeMapDocument(parsed);
  }

  function mapPointToCanvas(event: ReactPointerEvent<HTMLDivElement>) {
    const transform =
      event.currentTarget.querySelector<HTMLElement>(".map-transform");
    if (!transform) return null;
    const rect = transform.getBoundingClientRect();
    const baseScale = Math.min(rect.width / 1000, rect.height / 700);
    if (!baseScale) return null;
    const viewport = mapViewportRef.current;
    const scale = baseScale * viewport.zoom;
    return {
      x:
        500 +
        (event.clientX - (rect.left + rect.width / 2) - viewport.pan.x) / scale,
      y:
        350 +
        (event.clientY - (rect.top + rect.height / 2) - viewport.pan.y) / scale,
    };
  }

  function placeDrawItem(x: number, y: number) {
    const parsed = parseMapDocument();
    if (!parsed) return;
    const items = readDrawStack(parsed);
    if (mapDrawKind === "route") {
      if (mapDrawRoute.length) {
        const last = items[items.length - 1];
        if (last?.kind === "route") last.points.push({ x, y });
      } else {
        items.push({ kind: "route", label: mapDrawLabel, points: [{ x, y }] });
      }
      setMapDrawRoute((current) => [...current, { x, y }]);
    } else {
      items.push({ kind: mapDrawKind, label: mapDrawLabel, x, y });
    }
    commitDrawItems(items);
  }

  function undoDrawItem() {
    const parsed = parseMapDocument();
    if (!parsed) return;
    const items = readDrawStack(parsed);
    if (!items.length) return;
    if (mapDrawRoute.length) {
      const last = items[items.length - 1];
      if (last?.kind === "route") {
        last.points.pop();
        setMapDrawRoute(last.points.slice());
        if (!last.points.length) items.pop();
      }
    } else items.pop();
    commitDrawItems(items);
  }

  function clearDrawItems() {
    setMapDrawRoute([]);
    commitDrawItems([]);
  }

  function finishDrawRoute() {
    setMapDrawRoute([]);
  }

  async function applyMapPrompt() {
    if (!mapOutput || !mapPromptText.trim() || isMapPromptRunning) return;
    setIsMapPromptRunning(true);
    setMapPromptStatus("");
    try {
      const response = await fetch("/api/maps/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: mapPromptText,
          year: timelineYear,
          projection: mapProjectionRef.current,
          lang: language === "cs" ? "cs" : "en",
        }),
      });
      const result = (await response.json()) as {
        operations?: MapAiOperation[];
        unresolved?: string[];
        notes?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || mapT.promptFailed);
      const operations = result.operations ?? [];
      const unresolved = result.unresolved ?? [];
      setMapAiPreview({
        prompt: mapPromptText.trim(),
        operations: operations.map((operation) => ({
          operation,
          approved: true,
        })),
        unresolved,
        notes: result.notes ?? "",
      });
      setMapPromptStatus(
        operations.length
          ? mapT.promptPreviewReady(operations.length)
          : unresolved.length
            ? mapT.promptUnresolved(unresolved.length)
            : mapT.promptNoOperations,
      );
    } catch (error) {
      setMapPromptStatus(
        error instanceof Error ? error.message : mapT.promptFailed,
      );
    } finally {
      setIsMapPromptRunning(false);
    }
  }

  function toggleMapAiOperation(index: number) {
    setMapAiPreview((current) =>
      current
        ? {
            ...current,
            operations: current.operations.map((item, itemIndex) =>
              itemIndex === index
                ? { ...item, approved: !item.approved }
                : item,
            ),
          }
        : current,
    );
  }

  function applyMapAiPreview() {
    if (!mapOutput || !mapAiPreview) return;
    const parsed = new DOMParser().parseFromString(
      mapOutput.svg,
      "image/svg+xml",
    );
    const selected = mapAiPreview.operations.filter(({ approved }) => approved);
    let fills = 0;
    let labels = 0;
    const drawItems = readDrawStack(parsed);
    for (const { operation } of selected) {
      if (operation.type === "fill") {
        const color = paletteColors[operation.color];
        if (!color) continue;
        for (const id of operation.ids) {
          const paths = parsed.querySelectorAll(
            `path[data-iso-numeric="${CSS.escape(id)}"], path[data-region-id="${CSS.escape(id)}"]`,
          );
          for (const path of paths) {
            path.setAttribute("fill", color);
            path.setAttribute("data-prompt-fill", "true");
            fills += 1;
          }
        }
      } else {
        drawItems.push({
          kind: "text",
          label: operation.text,
          x: operation.x,
          y: operation.y,
        });
        labels += 1;
      }
    }
    if (labels) writeDrawStack(parsed, drawItems);
    setMapDrawCount(drawItems.length);
    setMapAiHistory((current) =>
      [
        {
          prompt: mapAiPreview.prompt,
          status: "applied" as const,
          approved: selected.length,
          total: mapAiPreview.operations.length,
        },
        ...current,
      ].slice(0, 10),
    );
    const unresolvedCount = mapAiPreview.unresolved.length;
    setMapPromptStatus(
      `${mapT.promptApplied} ${fills ? `(${fills})` : ""}${labels ? ` +${labels}` : ""}${unresolvedCount ? ` ${mapT.promptUnresolved(unresolvedCount)}` : ""}${mapAiPreview.notes ? ` ${mapAiPreview.notes}` : ""}`.trim(),
    );
    setMapAiPreview(null);
    serializeMapDocument(parsed);
  }

  function dismissMapAiPreview() {
    if (!mapAiPreview) return;
    setMapAiHistory((current) =>
      [
        {
          prompt: mapAiPreview.prompt,
          status: "dismissed" as const,
          approved: 0,
          total: mapAiPreview.operations.length,
        },
        ...current,
      ].slice(0, 10),
    );
    setMapAiPreview(null);
    setMapPromptStatus(mapT.promptDismissed);
  }

  function applyMapPalette(shuffle = false) {
    if (!mapOutput || !mapPalette.length) return;
    const shade = (hex: string, factor: number) =>
      `#${[1, 3, 5]
        .map((index) =>
          Math.round(Number.parseInt(hex.slice(index, index + 2), 16) * factor)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;
    let colors = mapPalette.flatMap(({ hex }) => [
      shade(hex, 1),
      shade(hex, 0.75),
      shade(hex, 0.5),
    ]);
    if (shuffle) colors = colors.slice().sort(() => Math.random() - 0.5);
    const parsed = new DOMParser().parseFromString(
      mapOutput.svg,
      "image/svg+xml",
    );
    const paths = [...parsed.querySelectorAll(".regions path")];
    const colorByRegion = new Map<string, string>();
    paths.forEach((path, index) => {
      const key =
        path.getAttribute("data-region-id") ||
        path.getAttribute("data-iso-numeric") ||
        path.getAttribute("data-map-unit") ||
        String(index);
      if (!colorByRegion.has(key))
        colorByRegion.set(key, colors[colorByRegion.size % colors.length]);
      path.setAttribute("fill", colorByRegion.get(key)!);
    });
    setMapOutput((current) =>
      current
        ? {
            ...current,
            svg: new XMLSerializer().serializeToString(parsed.documentElement),
          }
        : current,
    );
  }

  function commitMapViewport(viewport: MapViewport) {
    mapViewportRef.current = viewport;
    setMapViewport(viewport);
  }

  function scheduleMapViewport(viewport: MapViewport) {
    mapViewportRef.current = viewport;
    if (mapViewportFrameRef.current !== null) return;
    mapViewportFrameRef.current = requestAnimationFrame(() => {
      mapViewportFrameRef.current = null;
      setMapViewport(mapViewportRef.current);
    });
  }

  function updateMapZoom(update: number | ((zoom: number) => number)) {
    const current = mapViewportRef.current;
    const requested =
      typeof update === "function" ? update(current.zoom) : update;
    const zoom = Math.max(0.5, Math.min(40, requested));
    const ratio = zoom / current.zoom;
    commitMapViewport({
      zoom,
      pan: { x: current.pan.x * ratio, y: current.pan.y * ratio },
    });
  }

  function updateMapPan(pan: { x: number; y: number }) {
    commitMapViewport({ ...mapViewportRef.current, pan });
  }

  function mapPoint(clientX: number, clientY: number, canvas: HTMLDivElement) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: clientX - bounds.left - bounds.width / 2,
      y: clientY - bounds.top - bounds.height / 2,
    };
  }

  function mapPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!active) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    mapPointersRef.current.set(
      event.pointerId,
      mapPoint(event.clientX, event.clientY, event.currentTarget),
    );

    if (mapPointersRef.current.size === 2) {
      const [first, second] = [...mapPointersRef.current.values()];
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      mapPinchRef.current = {
        distance: Math.hypot(dx, dy),
        midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
        viewport: mapViewportRef.current,
      };
      mapDragRef.current = null;
      return;
    }

    const labelText =
      mapLabelMode || mapLabelPositionMode
        ? (event.target as Element).closest?.("text[data-map-label-key]")
        : null;
    const regionSelector =
      "path[data-region-id], path[data-iso-numeric], path[data-map-unit]";
    const directPath = (event.target as Element).closest?.(regionSelector);
    const path = mapFillMode
      ? (directPath ??
        document
          .elementsFromPoint(event.clientX, event.clientY)
          .find((element) => element.matches(regionSelector)))
      : null;
    const viewport = mapViewportRef.current;
    mapDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: viewport.pan.x,
      panY: viewport.pan.y,
      moved: false,
      regionId:
        path?.getAttribute("data-region-id") ??
        path?.getAttribute("data-iso-numeric") ??
        path?.getAttribute("data-map-unit") ??
        null,
      labelKey: labelText?.getAttribute("data-map-label-key") ?? null,
      labelVariant: (labelText?.getAttribute("data-map-label-variant") ||
        "default") as "default" | "full" | "short",
    };
  }

  function mapPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!active) return;
    if (!mapPointersRef.current.has(event.pointerId)) return;
    mapPointersRef.current.set(
      event.pointerId,
      mapPoint(event.clientX, event.clientY, event.currentTarget),
    );
    const pinch = mapPinchRef.current;
    if (pinch && mapPointersRef.current.size === 2) {
      const [first, second] = [...mapPointersRef.current.values()];
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.hypot(dx, dy);
      if (!distance || !pinch.distance) return;
      const midpoint = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
      const zoom = Math.max(
        0.5,
        Math.min(40, pinch.viewport.zoom * (distance / pinch.distance)),
      );
      const ratio = zoom / pinch.viewport.zoom;
      scheduleMapViewport({
        zoom,
        pan: {
          x: midpoint.x - ratio * (pinch.midpoint.x - pinch.viewport.pan.x),
          y: midpoint.y - ratio * (pinch.midpoint.y - pinch.viewport.pan.y),
        },
      });
      return;
    }

    const drag = mapDragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.labelKey && mapLabelPositionMode) return;
    scheduleMapViewport({
      ...mapViewportRef.current,
      pan: { x: drag.panX + dx, y: drag.panY + dy },
    });
  }

  function finishMapPointer(
    event: ReactPointerEvent<HTMLDivElement>,
    shouldSelectCountry: boolean,
  ) {
    const drag = mapDragRef.current;
    mapPointersRef.current.delete(event.pointerId);
    mapPinchRef.current = null;
    mapDragRef.current = null;
    if (shouldSelectCountry && drag && !drag.moved && drag.regionId)
      toggleMapCountry(drag.regionId);
    if (
      shouldSelectCountry &&
      drag &&
      drag.moved &&
      drag.labelKey &&
      mapLabelPositionMode
    )
      moveMapLabel(
        drag.labelKey,
        drag.labelVariant,
        event.clientX - drag.x,
        event.clientY - drag.y,
      );
    if (
      shouldSelectCountry &&
      drag &&
      !drag.moved &&
      drag.labelKey &&
      mapLabelMode
    )
      hideMapLabel(drag.labelKey);
    if (shouldSelectCountry && drag && !drag.moved && mapDrawMode) {
      const point = mapPointToCanvas(event);
      if (point) placeDrawItem(point.x, point.y);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function mapPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    finishMapPointer(event, true);
  }

  function mapPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    finishMapPointer(event, false);
  }

  function mapWheel(event: WheelEvent) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    if (!(event.currentTarget instanceof HTMLDivElement)) return;
    const point = mapPoint(event.clientX, event.clientY, event.currentTarget);
    const viewport = mapViewportRef.current;
    const zoom = Math.max(
      0.5,
      Math.min(40, viewport.zoom * Math.exp(-event.deltaY * 0.0015)),
    );
    const ratio = zoom / viewport.zoom;
    scheduleMapViewport({
      zoom,
      pan: {
        x: point.x - ratio * (point.x - viewport.pan.x),
        y: point.y - ratio * (point.y - viewport.pan.y),
      },
    });
  }

  async function addMapPalette(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (
      !file ||
      !file.name.toLowerCase().endsWith(".ase") ||
      file.size > 2_000_000
    ) {
      setMapError(mapT.paletteFileError);
      return;
    }
    try {
      setMapPalette(parseAse(await file.arrayBuffer()));
      setMapPaletteFile(file);
      setMapError("");
    } catch (error) {
      setMapError(
        error instanceof Error ? error.message : mapT.paletteReadError,
      );
    }
  }

  function applyMapLayers(nextLayers: MapLayers) {
    const needsTimelineReload = Object.entries(dataBackedLayerIds).some(
      ([layer, id]) =>
        nextLayers[layer as keyof MapLayers] &&
        !mapLayers[layer as keyof MapLayers] &&
        id &&
        !mapOutput?.svg.includes(`id="${id}"`),
    );
    setMapLayers(nextLayers);
    if (needsTimelineReload) void loadTimelineYear(timelineYear);
  }

  function toggleMapLayer(layer: keyof MapLayers, enabled: boolean) {
    applyMapLayers({ ...mapLayers, [layer]: enabled });
  }

  function applyMapPurpose(purpose: MapPurpose) {
    applyMapLayers({ ...MAP_LAYER_PRESETS[purpose] });
  }

  function changeMapExportMetadata(
    field: keyof MapExportMetadata,
    value: string,
  ) {
    mapExportMetadataDirtyRef.current.add(field);
    setMapExportMetadata((current) => ({ ...current, [field]: value }));
  }

  function downloadMapFile(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadCroppedMap() {
    if (!active) return;
    if (!mapOutput) return;
    const displayedSvg =
      toolRootRef.current?.querySelector<SVGSVGElement>(".map-transform svg");
    const crop =
      toolRootRef.current?.querySelector<HTMLElement>(".map-export-crop");
    if (!displayedSvg || !crop)
      return downloadMapFile(mapOutput.svg, "map.svg", "image/svg+xml");
    const svgBounds = displayedSvg.getBoundingClientRect(),
      cropBounds = crop.getBoundingClientRect();
    // The SVG bounds already include its CSS pan/zoom transform. Recover the
    // rendered content box directly instead of applying mapZoom a second time.
    const scale = Math.min(svgBounds.width / 1000, svgBounds.height / 700);
    if (!scale)
      return downloadMapFile(mapOutput.svg, "map.svg", "image/svg+xml");
    const contentLeft = svgBounds.left + (svgBounds.width - 1000 * scale) / 2;
    const contentTop = svgBounds.top + (svgBounds.height - 700 * scale) / 2;
    const viewBox = {
      x: (cropBounds.left - contentLeft) / scale,
      y: (cropBounds.top - contentTop) / scale,
      width: cropBounds.width / scale,
      height: cropBounds.height / scale,
    };
    const printPreset = mapPrintPreset(mapPrintPresetId);
    const printUnits =
      printPreset.unit === "mm"
        ? mapPrintUnits(viewBox.width, printPreset.width)
        : null;
    const parsed = new DOMParser().parseFromString(
      mapOutput.svg,
      "image/svg+xml",
    );
    const root = parsed.documentElement;
    const reliefImage = root.querySelector<SVGImageElement>(
      ".shaded-relief-image",
    );
    const reliefHref = reliefImage?.getAttribute("href");
    if (reliefImage && reliefHref)
      try {
        const reliefBlob = await fetch(reliefHref).then((response) => {
          if (!response.ok)
            throw new Error(`Relief image returned ${response.status}`);
          return response.blob();
        });
        const reliefDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener("load", () => resolve(String(reader.result)));
          reader.addEventListener("error", () => reject(reader.error));
          reader.readAsDataURL(reliefBlob);
        });
        reliefImage.setAttribute("href", reliefDataUrl);
      } catch {
        // Keep the stable public URL if embedding fails; the SVG remains usable.
      }
    const setExportLayerVisible = (id: string, visible: boolean) => {
      const element = root.querySelector<SVGElement>(`#${id}`);
      if (!element) return;
      if (visible) element.style.removeProperty("display");
      else element.style.display = "none";
    };
    setExportLayerVisible("climate-zones", mapLayers.climate);
    setExportLayerVisible("terrain", mapLayers.terrain);
    setExportLayerVisible("mountains", mapLayers.mountains);
    setExportLayerVisible("graphic-scale", true);

    setExportLayerVisible("cities", mapLayers.cities);
    setExportLayerVisible("disputed-boundaries", mapLayers.disputed);
    setExportLayerVisible("rivers", mapLayers.rivers);
    setExportLayerVisible("lakes", mapLayers.lakes);
    setExportLayerVisible("seas-oceans", mapLayers.water);
    setExportLayerVisible(
      "graticule-behind",
      mapLayers.graticule && !mapLayers.graticuleFront,
    );
    setExportLayerVisible(
      "graticule-front",
      mapLayers.graticule && mapLayers.graticuleFront,
    );
    setExportLayerVisible("country-names", true);
    setExportLayerVisible("country-abbreviations", true);
    if (!mapLayers.boundaries)
      for (const element of root.querySelectorAll<SVGElement>(
        "#countries-borders path",
      ))
        element.style.stroke = "none";
    const exportStrokeWidths: Array<
      [selector: string, screenWidth: number, printWidthMm: number]
    > = [
      ["#countries-borders path", 0.4, 0.15],
      ["#land path, #coastline path", 0.35, 0.12],
      ["#rivers path", 0.3, 0.12],
      ["#lakes path", 0.3, 0.12],
      ["#disputed-boundaries path", 0.55, 0.18],
      ["#graticule-behind path, #graticule-front path", 0.26, 0.1],
      [".summit-marker .summit-symbol", 0.45, 0.18],
      [".scale .scale-outline", 0.6, 0.15],
      [".natural-cities circle", 0.6, 0.12],
    ];
    for (const [selector, screenWidth, printWidthMm] of exportStrokeWidths)
      for (const element of root.querySelectorAll<SVGElement>(selector))
        element.style.strokeWidth = `${printUnits ? printUnits.mm(printWidthMm) : screenWidth / mapZoom}px`;
    const exportUnit = viewBox.width / 1000;
    for (const symbol of root.querySelectorAll<SVGElement>(
      ".summit-marker .summit-symbol",
    ))
      symbol.setAttribute("transform", `scale(${exportUnit})`);
    root.querySelector("#map-information")?.remove();
    const legacyCountryFontSize = (6 + mapZoom * 0.7) / mapZoom;
    const countryFontSize = printUnits
      ? printUnits.pt(7)
      : legacyCountryFontSize;
    const countryHaloSize = printUnits
      ? printUnits.mm(0.35)
      : (1.5 + mapZoom * 0.12) / mapZoom;
    const waterFontSize = printUnits
      ? printUnits.pt(8)
      : (7 + mapZoom * 0.8) / mapZoom;
    const waterHaloSize = printUnits
      ? printUnits.mm(0.35)
      : (1.7 + mapZoom * 0.12) / mapZoom;
    for (const element of root.querySelectorAll<SVGElement>(
      ".map-label,.natural-cities text,.natural-mountains text",
    )) {
      element.style.fontSize = `${countryFontSize}px`;
      element.style.strokeWidth = `${countryHaloSize}px`;
    }
    for (const element of root.querySelectorAll<SVGElement>(
      ".free-label.water",
    )) {
      element.style.fontSize = `${waterFontSize}px`;
      element.style.strokeWidth = `${waterHaloSize}px`;
    }
    const waterFeatureFontSize = printUnits
      ? printUnits.pt(7)
      : (6 + mapZoom * 0.7) / mapZoom;
    const waterFeatureHaloSize = printUnits
      ? printUnits.mm(0.35)
      : (1.4 + mapZoom * 0.1) / mapZoom;
    for (const element of root.querySelectorAll<SVGElement>(
      ".natural-lakes text,.natural-rivers text",
    )) {
      element.style.fontSize = `${waterFeatureFontSize}px`;
      element.style.strokeWidth = `${waterFeatureHaloSize}px`;
    }
    for (const element of root.querySelectorAll<SVGElement>(
      ".feature-label,.draw-label",
    )) {
      element.style.fontSize = `${countryFontSize}px`;
      element.style.strokeWidth = `${countryHaloSize}px`;
    }
    layoutMapSvgLabels(root as unknown as SVGSVGElement, {
      zoom: mapZoom,
      density: mapLabelDensity,
      fontScale: countryFontSize / legacyCountryFontSize,
      layers: {
        labels: mapLayers.labels,
        water: mapLayers.water,
        waterLabels: mapLayers.waterLabels,
        lakes: mapLayers.lakes,
        rivers: mapLayers.rivers,
        cities: mapLayers.cities,
        mountains: mapLayers.mountains,
      },
    });
    const contentLayer = parsed.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    contentLayer.setAttribute("id", "map-content");
    contentLayer.setAttribute("data-name", "Map content");
    contentLayer.setAttribute(
      "transform",
      `translate(${-viewBox.x} ${-viewBox.y})`,
    );
    const movableChildren = [...root.children].filter(
      (element) =>
        !["defs", "style", "desc"].includes(element.tagName.toLowerCase()),
    );
    for (const element of movableChildren) contentLayer.appendChild(element);
    root.appendChild(contentLayer);
    const graphicScale =
      contentLayer.querySelector<SVGGElement>("#graphic-scale");
    if (graphicScale) {
      const scaleInset = 16 * exportUnit;
      graphicScale.setAttribute(
        "transform",
        `translate(${(viewBox.x + scaleInset).toFixed(2)} ${(viewBox.y + viewBox.height - 18 * exportUnit).toFixed(2)}) scale(${exportUnit})`,
      );
      const segmentKilometres = Number(
        graphicScale.getAttribute("data-segment-km") || 0,
      );
      const labels = graphicScale.querySelectorAll<SVGTextElement>(
        "text:not(.scale-unit)",
      );
      labels.forEach((label, index) => {
        label.textContent = (
          segmentKilometres *
          index *
          exportUnit
        ).toLocaleString("en", { maximumFractionDigits: 0 });
      });
    }
    // Legend, bottom-right inside the crop, sized relative to the crop so it
    // stays legible at every zoom. Coordinates live in canvas space, so the
    // content translate shifts them into the exported viewBox.
    const legendEntries: Array<{
      label: string;
      fill?: string;
      kind?: string;
    }> = [];
    for (const category of mapOutput.spec.categories ?? [])
      legendEntries.push({ label: category.label, fill: category.color });
    if (mapLayers.climate)
      MAP_CLIMATE_COLORS.forEach((fill, index) =>
        legendEntries.push({ label: mapT.climateLabels[index], fill }),
      );
    if (mapLayers.cities)
      legendEntries.push({ label: mapT.legendCity, kind: "city" });
    if (mapLayers.mountains)
      legendEntries.push({ label: mapT.legendMountain, kind: "peak" });
    if (mapLayers.rivers)
      legendEntries.push({ label: mapT.legendRiver, kind: "river" });
    if (mapLayers.lakes)
      legendEntries.push({ label: mapT.legendLake, kind: "lake" });
    if (legendEntries.length) {
      const unit = exportUnit;
      const legendWidth = printUnits ? printUnits.mm(34) : 170 * unit;
      const rowHeight = printUnits ? printUnits.mm(4.5) : 13 * unit;
      const fontSize = printUnits ? printUnits.pt(7) : 7.5 * unit;
      const legendHeight =
        legendEntries.length * rowHeight +
        (printUnits ? printUnits.mm(7) : 20 * unit);
      const safeInset = printUnits ? printUnits.mm(4) : 16 * unit;
      const legendX = viewBox.x + viewBox.width - safeInset - legendWidth;
      const legendY = viewBox.y + viewBox.height - safeInset - legendHeight;
      const legend = parsed.createElementNS("http://www.w3.org/2000/svg", "g");
      legend.setAttribute("id", "map-legend");
      legend.setAttribute("data-name", "Map legend");
      legend.setAttribute(
        "transform",
        `translate(${legendX.toFixed(2)} ${legendY.toFixed(2)})`,
      );
      const padding = printUnits ? printUnits.mm(2) : 8 * unit;
      const symbolGap = printUnits ? printUnits.mm(1.5) : 6 * unit;
      let markup = `<rect x="0" y="0" width="${legendWidth.toFixed(1)}" height="${legendHeight.toFixed(1)}" fill="#ffffff" fill-opacity="0.85" stroke="#1a1a1a" stroke-width="${(0.8 * unit).toFixed(2)}"/>`;
      markup += `<text x="${padding.toFixed(1)}" y="${(fontSize + 4 * unit).toFixed(1)}" font-size="${fontSize.toFixed(1)}" font-weight="700" letter-spacing="${(0.5 * unit).toFixed(2)}">${escapeLegendText(mapT.legendTitle.toUpperCase())}</text>`;
      legendEntries.forEach((entry, index) => {
        const y =
          fontSize +
          (printUnits ? printUnits.mm(2.5) : 10 * unit) +
          index * rowHeight;
        const swatchWidth = printUnits ? printUnits.mm(3) : 10 * unit;
        const swatchHeight = printUnits ? printUnits.mm(2) : 7 * unit;
        if (entry.fill)
          markup += `<rect x="${padding.toFixed(1)}" y="${(y - swatchHeight).toFixed(1)}" width="${swatchWidth.toFixed(1)}" height="${swatchHeight.toFixed(1)}" fill="${entry.fill.startsWith("#") ? entry.fill : (paletteColors[entry.fill] ?? "#c7c7c7")}" stroke="#1a1a1a" stroke-width="${(0.5 * unit).toFixed(2)}"/>`;
        else if (entry.kind === "city")
          markup += `<circle cx="${(padding + swatchWidth / 2).toFixed(1)}" cy="${(y - swatchHeight / 2).toFixed(1)}" r="${(2.5 * unit).toFixed(1)}" fill="#1a1a1a" stroke="#ffffff" stroke-width="${(0.5 * unit).toFixed(2)}"/>`;
        else if (entry.kind === "peak")
          markup += `<path d="M${padding.toFixed(1)},${y.toFixed(1)} l${(swatchWidth / 2).toFixed(1)},${(-swatchHeight * 1.2).toFixed(1)} l${(swatchWidth / 2).toFixed(1)},${(swatchHeight * 1.2).toFixed(1)} Z" fill="#8b6a52" stroke="#654936" stroke-width="${(0.5 * unit).toFixed(2)}"/>`;
        else if (entry.kind === "river")
          markup += `<line x1="${padding.toFixed(1)}" y1="${(y - swatchHeight / 2).toFixed(1)}" x2="${(padding + swatchWidth).toFixed(1)}" y2="${(y - swatchHeight / 2).toFixed(1)}" stroke="#69a9c0" stroke-width="${(1.5 * unit).toFixed(2)}"/>`;
        else if (entry.kind === "lake")
          markup += `<rect x="${padding.toFixed(1)}" y="${(y - swatchHeight).toFixed(1)}" width="${swatchWidth.toFixed(1)}" height="${swatchHeight.toFixed(1)}" fill="#eaf6fa" stroke="#69a9c0" stroke-width="${(0.5 * unit).toFixed(2)}"/>`;
        markup += `<text x="${(padding + swatchWidth + symbolGap).toFixed(1)}" y="${y.toFixed(1)}" font-size="${fontSize.toFixed(1)}">${escapeLegendText(entry.label)}</text>`;
      });
      legend.innerHTML = markup;
      contentLayer.appendChild(legend);
    }

    const publicationMetadata = parsed.createElementNS(
      "http://www.w3.org/2000/svg",
      "metadata",
    );
    publicationMetadata.setAttribute("id", "publication-metadata-json");
    publicationMetadata.textContent = JSON.stringify(mapExportMetadata);
    root.insertBefore(publicationMetadata, contentLayer);

    const metadataGroup = parsed.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    metadataGroup.setAttribute("id", "publication-metadata");
    metadataGroup.setAttribute("data-name", "Publication metadata");
    const titleGroup = parsed.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    titleGroup.setAttribute("id", "map-title");
    titleGroup.setAttribute("data-name", "Map title");
    const creditsGroup = parsed.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    creditsGroup.setAttribute("id", "map-credits");
    creditsGroup.setAttribute("data-name", "Map credits");
    const metadataInset = printUnits
      ? printUnits.mm(4)
      : 16 * (viewBox.width / 1000);
    const maxMetadataWidth = viewBox.width - metadataInset * 2;
    const appendMetadataText = ({
      group,
      value,
      x,
      y,
      fontSize,
      weight = "400",
      name,
    }: {
      group: Element;
      value: string;
      x: number;
      y: number;
      fontSize: number;
      weight?: string;
      name: string;
    }) => {
      if (!value.trim()) return;
      const element = parsed.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      element.setAttribute("x", x.toFixed(2));
      element.setAttribute("y", y.toFixed(2));
      element.setAttribute("font-family", "Verdana, Geneva, sans-serif");
      element.setAttribute("font-size", fontSize.toFixed(2));
      element.setAttribute("font-weight", weight);
      element.setAttribute("paint-order", "stroke");
      element.setAttribute("stroke", "#ffffff");
      element.setAttribute("stroke-width", (fontSize * 0.28).toFixed(2));
      element.setAttribute("stroke-linejoin", "round");
      element.setAttribute("data-name", name);
      if (value.length * fontSize * 0.56 > maxMetadataWidth) {
        element.setAttribute("textLength", maxMetadataWidth.toFixed(2));
        element.setAttribute("lengthAdjust", "spacingAndGlyphs");
      }
      element.textContent = value.trim();
      group.appendChild(element);
    };
    const titleSize = printUnits
      ? printUnits.pt(12)
      : 14 * (viewBox.width / 1000);
    const subtitleSize = printUnits
      ? printUnits.pt(8)
      : 9 * (viewBox.width / 1000);
    const creditSize = printUnits
      ? printUnits.pt(6)
      : 6.5 * (viewBox.width / 1000);
    appendMetadataText({
      group: titleGroup,
      value: mapExportMetadata.title,
      x: viewBox.x + metadataInset,
      y: viewBox.y + metadataInset + titleSize,
      fontSize: titleSize,
      weight: "700",
      name: "Title",
    });
    appendMetadataText({
      group: titleGroup,
      value: mapExportMetadata.subtitle,
      x: viewBox.x + metadataInset,
      y: viewBox.y + metadataInset + titleSize + subtitleSize * 1.35,
      fontSize: subtitleSize,
      name: "Subtitle",
    });
    const creditLines = [
      [mapExportMetadata.source, "Source"],
      [mapExportMetadata.projectionNote, "Projection note"],
      [mapExportMetadata.copyright, "Copyright"],
    ] as const;
    creditLines.forEach(([value, name], index) =>
      appendMetadataText({
        group: creditsGroup,
        value,
        x: viewBox.x + metadataInset,
        y:
          viewBox.y +
          viewBox.height -
          metadataInset -
          (creditLines.length - 1 - index) * creditSize * 1.35,
        fontSize: creditSize,
        name,
      }),
    );
    metadataGroup.append(titleGroup, creditsGroup);
    contentLayer.appendChild(metadataGroup);

    root.setAttribute("viewBox", `0 0 ${viewBox.width} ${viewBox.height}`);
    if (printPreset.unit === "mm") {
      root.setAttribute("width", `${printPreset.width}mm`);
      root.setAttribute("height", `${printPreset.height}mm`);
      root.setAttribute("data-print-preset", printPreset.id);
    } else {
      root.setAttribute("width", "1000");
      root.setAttribute("height", "700");
      root.removeAttribute("data-print-preset");
    }
    const backgroundLayer = parsed.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    backgroundLayer.setAttribute("id", "export-background");
    backgroundLayer.setAttribute("data-name", "Export background");
    const background = parsed.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", String(viewBox.width));
    background.setAttribute("height", String(viewBox.height));
    background.setAttribute("fill", mapLayers.water ? "#eaf6fa" : "#ffffff");
    background.setAttribute("data-export-background", "true");
    backgroundLayer.appendChild(background);
    root.insertBefore(backgroundLayer, contentLayer);
    const filename = `${
      mapExportMetadata.title
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "map"
    }.svg`;
    downloadMapFile(
      new XMLSerializer().serializeToString(root),
      filename,
      "image/svg+xml",
    );
  }

  return (
    <div ref={toolRootRef} style={{ display: "contents" }}>
      <MapMainInterface
        language={language}
        active={active}
        palette={mapPalette}
        output={mapOutput}
        error={mapError}
        isGenerating={false}
        timelineYear={timelineYear}
        timelineYearInput={timelineYearInput}
        isLoadingTimeline={isLoadingTimeline}
        mapLayers={mapLayers}
        mapPurpose={mapPurpose}
        mapLabelDensity={mapLabelDensity}
        mapPrintPresetId={mapPrintPresetId}
        mapPreflight={mapPreflight}
        mapExportMetadata={mapExportMetadata}
        onMapPreflightInspection={setMapPreflightInspection}
        mapFillMode={mapFillMode}
        mapZoom={mapZoom}
        mapPan={mapPan}
        paletteInputRef={mapPaletteInputRef}
        onTimelineStep={stepTimelineYear}
        onTimelineInput={changeTimelineYearInput}
        onTimelineCommit={commitTimelineYear}
        onTimelineSlider={(value) => {
          const year = value === 0 ? 1 : value;
          setTimelineYear(year);
          setTimelineYearInput(String(year));
        }}
        onTimelineSliderCommit={(value) =>
          void loadTimelineYear(value === 0 ? 1 : value)
        }
        onToggleLayer={toggleMapLayer}
        onApplyMapPurpose={applyMapPurpose}
        onChangeMapLabelDensity={setMapLabelDensity}
        onChangeMapPrintPreset={setMapPrintPresetId}
        onChangeMapExportMetadata={changeMapExportMetadata}
        mapProjection={mapProjection}
        onChangeMapProjection={changeMapProjection}
        mapLabelMode={mapLabelMode}
        mapLabelPositionMode={mapLabelPositionMode}
        hiddenMapLabelCount={hiddenMapLabels.length}
        positionedMapLabelCount={positionedMapLabels.length}
        onMapLabelMode={(update) =>
          setMapLabelMode((current) => {
            const next =
              typeof update === "function" ? update(current) : update;
            if (next) setMapLabelPositionMode(false);
            return next;
          })
        }
        onMapLabelPositionMode={(update) =>
          setMapLabelPositionMode((current) => {
            const next =
              typeof update === "function" ? update(current) : update;
            if (next) setMapLabelMode(false);
            return next;
          })
        }
        onUndoMapLabelPosition={undoMapLabelPosition}
        onResetMapLabelPositions={resetMapLabelPositions}
        onUndoHiddenMapLabel={undoHiddenMapLabel}
        onUnhideAllMapLabels={unhideAllMapLabels}
        mapDrawMode={mapDrawMode}
        mapDrawKind={mapDrawKind}
        mapDrawLabel={mapDrawLabel}
        mapDrawCount={mapDrawCount}
        mapDrawRoutePoints={mapDrawRoute.length}
        onMapDrawMode={setMapDrawMode}
        onChangeDrawKind={setMapDrawKind}
        onChangeDrawLabel={setMapDrawLabel}
        onUndoDrawItem={undoDrawItem}
        onClearDrawItems={clearDrawItems}
        onFinishDrawRoute={finishDrawRoute}
        mapPromptText={mapPromptText}
        mapPromptStatus={mapPromptStatus}
        isMapPromptRunning={isMapPromptRunning}
        mapAiPreview={mapAiPreview}
        mapAiHistory={mapAiHistory}
        onChangeMapPromptText={setMapPromptText}
        onApplyMapPrompt={() => void applyMapPrompt()}
        onToggleMapAiOperation={toggleMapAiOperation}
        onApplyMapAiPreview={applyMapAiPreview}
        onDismissMapAiPreview={dismissMapAiPreview}
        onMapFillMode={setMapFillMode}
        onMapZoom={updateMapZoom}
        onMapPan={updateMapPan}
        onPaletteInput={(event) => void addMapPalette(event)}
        onApplyPalette={applyMapPalette}
        onDownloadCroppedMap={downloadCroppedMap}
        onPointerDown={mapPointerDown}
        onPointerMove={mapPointerMove}
        onPointerUp={mapPointerUp}
        onPointerCancel={mapPointerCancel}
        onWheel={mapWheel}
      />
    </div>
  );
}
