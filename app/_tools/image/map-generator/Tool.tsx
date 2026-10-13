"use client";

import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ToolProps } from "../../types";
import {
  MapMainInterface,
  type MapLayers,
  type MapOutput,
} from "./MainInterface";
import { parseAse, type AseSwatch } from "./code/ase";
import { layoutMapSvgLabels } from "./code/label-layout";
import { mapUi } from "./copy";

type MapViewport = { zoom: number; pan: { x: number; y: number } };

export default function Tool({ language, active, onDiagnostics }: ToolProps) {
  const [mapOutput, setMapOutput] = useState<MapOutput | null>(null);
  const [mapError, setMapError] = useState("");
  const [mapPalette, setMapPalette] = useState<AseSwatch[]>([]);
  const [mapPaletteFile, setMapPaletteFile] = useState<File | null>(null);
  const mapPaletteInputRef = useRef<HTMLInputElement>(null);
  const toolRootRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const initialLoadRef = useRef(false);
  const mapT = mapUi[language];
  const [timelineYear, setTimelineYear] = useState(1914);
  const [timelineYearInput, setTimelineYearInput] = useState("1914");
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const timelineRequestRef = useRef(0);
  const [mapLayers, setMapLayers] = useState<MapLayers>({
    boundaries: true,
    labels: true,
    water: true,
    rivers: true,
    climate: false,
    terrain: false,
    mountains: false,
    cities: false,
    disputed: false,
  });
  const [mapFillMode, setMapFillMode] = useState(false);
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
  } | null>(null);
  const mapZoom = mapViewport.zoom;
  const mapPan = mapViewport.pan;

  const loadTimelineYear = useCallback(async (year: number) => {
    const requestId = ++timelineRequestRef.current;
    setIsLoadingTimeline(true);
    setMapError("");
    try {
      const response = await fetch(`/api/maps/timeline?year=${year}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as MapOutput & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Historical timeline failed.");
      if (!mountedRef.current || requestId !== timelineRequestRef.current)
        return;
      setMapOutput(result);
    } catch (error) {
      if (!mountedRef.current || requestId !== timelineRequestRef.current)
        return;
      setMapError(
        error instanceof Error ? error.message : "Historical timeline failed.",
      );
    } finally {
      if (mountedRef.current && requestId === timelineRequestRef.current)
        setIsLoadingTimeline(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Keep the initial request singular even when Strict Mode replays effects.
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      void loadTimelineYear(1914);
    }
    return () => {
      mountedRef.current = false;
      if (mapViewportFrameRef.current !== null) {
        cancelAnimationFrame(mapViewportFrameRef.current);
        mapViewportFrameRef.current = null;
      }
    };
  }, [loadTimelineYear]);

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
          const next = { ...current, zoom: Math.min(40, current.zoom * 1.25) };
          mapViewportRef.current = next;
          return next;
        });
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setMapViewport((current) => {
          const next = { ...current, zoom: Math.max(0.5, current.zoom / 1.25) };
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

  function toggleMapCountry(regionId: string) {
    if (!mapOutput) return;
    const document = new DOMParser().parseFromString(
      mapOutput.svg,
      "image/svg+xml",
    );
    const paths = [
      ...document.querySelectorAll(
        `path[data-region-id="${CSS.escape(regionId)}"]`,
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
    const zoom = typeof update === "function" ? update(current.zoom) : update;
    commitMapViewport({ ...current, zoom });
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

    const path = mapFillMode
      ? (event.target as Element).closest?.("path[data-region-id]")
      : null;
    const viewport = mapViewportRef.current;
    mapDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: viewport.pan.x,
      panY: viewport.pan.y,
      moved: false,
      regionId: path?.getAttribute("data-region-id") ?? null,
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

  function downloadMapFile(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCroppedMap() {
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
    const scale =
      Math.min(svgBounds.width / 1000, svgBounds.height / 700) * mapZoom;
    const contentLeft =
      svgBounds.left + svgBounds.width / 2 + mapPan.x - 500 * scale;
    const contentTop =
      svgBounds.top + svgBounds.height / 2 + mapPan.y - 350 * scale;
    const viewBox = {
      x: (cropBounds.left - contentLeft) / scale,
      y: (cropBounds.top - contentTop) / scale,
      width: cropBounds.width / scale,
      height: cropBounds.height / scale,
    };
    const parsed = new DOMParser().parseFromString(
      mapOutput.svg,
      "image/svg+xml",
    );
    const root = parsed.documentElement;
    const setExportLayerVisible = (id: string, visible: boolean) => {
      const element = root.querySelector<SVGElement>(`#${id}`);
      if (!element) return;
      if (visible) element.style.removeProperty("display");
      else element.style.display = "none";
    };
    setExportLayerVisible("climate-zones", mapLayers.climate);
    setExportLayerVisible("terrain", mapLayers.terrain);
    setExportLayerVisible("mountains", mapLayers.mountains);
    setExportLayerVisible("cities", mapLayers.cities);
    setExportLayerVisible("disputed-boundaries", mapLayers.disputed);
    setExportLayerVisible("rivers", mapLayers.rivers);
    setExportLayerVisible("lakes", mapLayers.water);
    setExportLayerVisible("country-names", true);
    setExportLayerVisible("country-abbreviations", true);
    if (!mapLayers.boundaries)
      for (const element of root.querySelectorAll<SVGElement>(
        "#countries-borders path",
      ))
        element.style.stroke = "none";
    root.querySelector("#map-information")?.remove();
    const countryFontSize = (6 + mapZoom * 0.7) / mapZoom;
    const countryHaloSize = (1.5 + mapZoom * 0.12) / mapZoom;
    const waterFontSize = (7 + mapZoom * 0.8) / mapZoom;
    const waterHaloSize = (1.7 + mapZoom * 0.12) / mapZoom;
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
    layoutMapSvgLabels(root as unknown as SVGSVGElement, {
      zoom: mapZoom,
      layers: {
        labels: mapLayers.labels,
        water: mapLayers.water,
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
    root.setAttribute("viewBox", `0 0 ${viewBox.width} ${viewBox.height}`);
    root.setAttribute("width", "1000");
    root.setAttribute("height", "700");
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
    background.setAttribute("fill", "#eaf6fa");
    background.setAttribute("data-export-background", "true");
    backgroundLayer.appendChild(background);
    root.insertBefore(backgroundLayer, contentLayer);
    const filename = `${
      mapOutput.spec.title
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
        onToggleLayer={(layer, enabled) => {
          setMapLayers((current) => ({ ...current, [layer]: enabled }));
          if (
            ["climate", "terrain", "mountains", "cities", "disputed"].includes(
              layer,
            ) &&
            enabled &&
            !mapOutput?.svg.includes(
              `id="${layer === "disputed" ? "disputed-boundaries" : layer === "climate" ? "climate-zones" : layer}"`,
            )
          )
            void loadTimelineYear(timelineYear);
        }}
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
