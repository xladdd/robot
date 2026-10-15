"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { geoMercator, geoNaturalEarth1 } from "d3-geo";
import { geoEckert4, geoRobinson } from "./code/extra-projections.ts";
import type {
  ChangeEvent,
  CSSProperties,
  Dispatch,
  PointerEventHandler,
  RefObject,
  SetStateAction,
} from "react";
import { LoadingText } from "../../../_components/LoadingText";
import { ProcessingBadge } from "../../../_components/ToolChrome";
import type { Language } from "../../registry";
import type { AseSwatch } from "./code/ase";
import { layoutMapSvgLabels } from "./code/label-layout";
import {
  MAP_CLIMATE_COLORS,
  MAP_LABEL_DENSITIES,
  MAP_LAYER_KEYS,
  MAP_PRINT_PRESETS,
  MAP_PURPOSES,
  type MapExportMetadata,
  type MapLabelDensity,
  type MapLayers,
  type MapPrintPresetId,
  type MapPublicationInspection,
  type MapPublicationPreflightCheck,
  type MapPurpose,
} from "./code/editor-options";
import { mapPalette as legendPalette } from "./code/palette";
import type { MapCheck } from "./code/map";
import { mapProcessing, mapUi } from "./copy";
import type { DrawKind, MapAiHistoryEntry, MapAiPreview } from "./Tool";

export type { MapCheck } from "./code/map";
export type MapOutput = {
  svg: string;
  report: string;
  checks: MapCheck[];
  model: string;
  spec: {
    title: string;
    subtitle?: string;
    date?: string;
    sources?: Array<{ id: string; title: string; url: string }>;
    categories?: Array<{ id: string; label: string; color: string }>;
  };
};
export type { MapLayers } from "./code/editor-options";

export type MapProjection =
  "schematic" | "robinson" | "eckert4" | "naturalEarth";

type MapViewport = { zoom: number; pan: { x: number; y: number } };

const mapRegions: Record<
  string,
  { west: number; south: number; east: number; north: number }
> = {
  world: { west: -180, south: -58, east: 180, north: 82 },
  europe: { west: -25, south: 34, east: 45, north: 72 },
  mediterranean: { west: -15, south: 30, east: 45, north: 47 },
  middleEast: { west: 25, south: 12, east: 75, north: 45 },
  africa: { west: -20, south: -38, east: 52, north: 38 },
  asia: { west: 40, south: 5, east: 150, north: 60 },
  americas: { west: -170, south: -58, east: -30, north: 70 },
  oceania: { west: 105, south: -48, east: 180, north: 0 },
};

// Temporarily locked to the current year: year controls stay visible but grey
// out and explain themselves instead of navigating the timeline.
const TIME_TRAVEL_ENABLED = false;

function applyMapViewBox(container: HTMLDivElement, viewport: MapViewport) {
  const svg = container.querySelector("svg");
  if (!svg || !container.clientWidth || !container.clientHeight) return;
  // The viewBox stays fixed; pan and zoom run as a composited CSS transform so
  // dragging a large SVG never re-rasterizes the map geometry.
  svg.setAttribute("viewBox", "0 0 1000 700");
  svg.style.transformOrigin = "center";
  svg.style.transform = `translate(${viewport.pan.x}px, ${viewport.pan.y}px) scale(${viewport.zoom})`;
}

export function MapMainInterface({
  language,
  active = true,
  palette,
  output,
  error,
  isGenerating,
  timelineYear,
  timelineYearInput,
  isLoadingTimeline,
  mapLayers,
  mapPurpose,
  mapLabelDensity,
  mapPrintPresetId,
  mapPreflight,
  mapExportMetadata,
  onMapPreflightInspection,
  mapFillMode,
  mapProjection,
  mapLabelMode,
  mapLabelPositionMode,
  hiddenMapLabelCount,
  positionedMapLabelCount,
  mapDrawMode,
  mapDrawKind,
  mapDrawLabel,
  mapDrawCount,
  mapDrawRoutePoints,
  mapZoom,
  mapPan,
  paletteInputRef,
  onTimelineStep,
  onTimelineInput,
  onTimelineCommit,
  onTimelineSlider,
  onTimelineSliderCommit,
  onToggleLayer,
  onApplyMapPurpose,
  onChangeMapLabelDensity,
  onChangeMapPrintPreset,
  onChangeMapExportMetadata,
  onChangeMapProjection,
  onMapLabelMode,
  onMapLabelPositionMode,
  onUndoMapLabelPosition,
  onResetMapLabelPositions,
  onUndoHiddenMapLabel,
  onUnhideAllMapLabels,
  onMapDrawMode,
  onChangeDrawKind,
  onChangeDrawLabel,
  onUndoDrawItem,
  onClearDrawItems,
  onFinishDrawRoute,
  mapPromptText,
  mapPromptStatus,
  isMapPromptRunning,
  mapAiPreview,
  mapAiHistory,
  onChangeMapPromptText,
  onApplyMapPrompt,
  onToggleMapAiOperation,
  onApplyMapAiPreview,
  onDismissMapAiPreview,
  onMapFillMode,
  onMapZoom,
  onMapPan,
  onPaletteInput,
  onApplyPalette,
  onDownloadCroppedMap,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onWheel,
}: {
  language: Language;
  active?: boolean;
  palette: AseSwatch[];
  output: MapOutput | null;
  error: string;
  isGenerating: boolean;
  timelineYear: number;
  timelineYearInput: string;
  isLoadingTimeline: boolean;
  mapLayers: MapLayers;
  mapPurpose: MapPurpose | null;
  mapLabelDensity: MapLabelDensity;
  mapPrintPresetId: MapPrintPresetId;
  mapPreflight: MapPublicationPreflightCheck[];
  mapExportMetadata: MapExportMetadata;
  onMapPreflightInspection: (inspection: MapPublicationInspection) => void;
  mapFillMode: boolean;
  mapProjection: MapProjection;
  mapLabelMode: boolean;
  mapLabelPositionMode: boolean;
  hiddenMapLabelCount: number;
  positionedMapLabelCount: number;
  mapDrawMode: boolean;
  mapDrawKind: DrawKind;
  mapDrawLabel: string;
  mapDrawCount: number;
  mapDrawRoutePoints: number;
  mapZoom: number;
  mapPan: { x: number; y: number };
  paletteInputRef: RefObject<HTMLInputElement | null>;
  onTimelineStep: (delta: number) => void;
  onTimelineInput: (value: string) => void;
  onTimelineCommit: () => void;
  onTimelineSlider: (year: number) => void;
  onTimelineSliderCommit: (year: number) => void;
  onToggleLayer: (layer: keyof MapLayers, enabled: boolean) => void;
  onApplyMapPurpose: (purpose: MapPurpose) => void;
  onChangeMapLabelDensity: (density: MapLabelDensity) => void;
  onChangeMapPrintPreset: (preset: MapPrintPresetId) => void;
  onChangeMapExportMetadata: (
    field: keyof MapExportMetadata,
    value: string,
  ) => void;
  onChangeMapProjection: (projection: MapProjection) => void;
  onMapLabelMode: Dispatch<SetStateAction<boolean>>;
  onMapLabelPositionMode: Dispatch<SetStateAction<boolean>>;
  onUndoMapLabelPosition: () => void;
  onResetMapLabelPositions: () => void;
  onUndoHiddenMapLabel: () => void;
  onUnhideAllMapLabels: () => void;
  onMapDrawMode: Dispatch<SetStateAction<boolean>>;
  onChangeDrawKind: (kind: DrawKind) => void;
  onChangeDrawLabel: (label: string) => void;
  onUndoDrawItem: () => void;
  onClearDrawItems: () => void;
  onFinishDrawRoute: () => void;
  mapPromptText: string;
  mapPromptStatus: string;
  isMapPromptRunning: boolean;
  mapAiPreview: MapAiPreview | null;
  mapAiHistory: MapAiHistoryEntry[];
  onChangeMapPromptText: Dispatch<SetStateAction<string>>;
  onApplyMapPrompt: () => void;
  onToggleMapAiOperation: (index: number) => void;
  onApplyMapAiPreview: () => void;
  onDismissMapAiPreview: () => void;
  onMapFillMode: Dispatch<SetStateAction<boolean>>;
  onMapZoom: (zoom: number | ((current: number) => number)) => void;
  onMapPan: (pan: { x: number; y: number }) => void;
  onPaletteInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onApplyPalette: (shuffle: boolean) => void;
  onDownloadCroppedMap: () => void;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onWheel: (event: WheelEvent) => void;
}) {
  const t = mapUi[language];
  const mapCanvasRef = useRef<HTMLDivElement>(null);
  const mapTransformRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<MapViewport>({ zoom: mapZoom, pan: mapPan });
  const wheelHandlerRef = useRef(onWheel);
  const labelOptionsRef = useRef({
    zoom: mapZoom,
    density: mapLabelDensity,
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
  const [isMapRendering, setIsMapRendering] = useState(false);
  const [timeTravelNotice, setTimeTravelNotice] = useState(false);
  const [timeTooltipPos, setTimeTooltipPos] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const yearFieldRef = useRef<HTMLDivElement | null>(null);
  const timeTravelTimerRef = useRef<number | null>(null);
  const showTimeTravelNotice = () => {
    const rect = yearFieldRef.current?.getBoundingClientRect();
    const panel = yearFieldRef.current
      ?.closest<HTMLElement>(".figure-controls")
      ?.getBoundingClientRect();
    if (rect && panel)
      setTimeTooltipPos({
        top: rect.top + rect.height / 2,
        right: window.innerWidth - panel.left + 10,
      });
    setTimeTravelNotice(true);
    if (timeTravelTimerRef.current !== null)
      window.clearTimeout(timeTravelTimerRef.current);
    timeTravelTimerRef.current = window.setTimeout(
      () => setTimeTravelNotice(false),
      4000,
    );
  };
  useEffect(
    () => () => {
      if (timeTravelTimerRef.current !== null)
        window.clearTimeout(timeTravelTimerRef.current);
    },
    [],
  );
  const svgMarkup = output?.svg ?? "";

  useLayoutEffect(() => {
    labelOptionsRef.current = {
      zoom: mapZoom,
      density: mapLabelDensity,
      layers: {
        labels: mapLayers.labels,
        water: mapLayers.water,
        waterLabels: mapLayers.waterLabels,
        lakes: mapLayers.lakes,
        rivers: mapLayers.rivers,
        cities: mapLayers.cities,
        mountains: mapLayers.mountains,
      },
    };
  }, [
    mapZoom,
    mapLabelDensity,
    mapLayers.labels,
    mapLayers.water,
    mapLayers.waterLabels,
    mapLayers.lakes,
    mapLayers.rivers,
    mapLayers.cities,
    mapLayers.mountains,
  ]);

  useLayoutEffect(() => {
    const container = mapTransformRef.current;
    if (!container) return;
    container.innerHTML = svgMarkup;
  }, [svgMarkup]);

  useLayoutEffect(() => {
    if (!active) return;
    const svg = mapTransformRef.current?.querySelector<SVGSVGElement>("svg");
    if (svg) layoutMapSvgLabels(svg, labelOptionsRef.current);
  }, [svgMarkup, active]);

  useEffect(() => {
    if (!active) return;
    // Coalesce label relayout while the user pans or zooms; one pass runs after
    // the interaction settles, behind a small "rendering" status overlay.
    setIsMapRendering(true);
    const timeout = window.setTimeout(() => {
      const svg = mapTransformRef.current?.querySelector<SVGSVGElement>("svg");
      if (!svg) {
        setIsMapRendering(false);
        return;
      }
      layoutMapSvgLabels(svg, {
        zoom: mapZoom,
        density: mapLabelDensity,
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
      const crop =
        mapCanvasRef.current?.querySelector<HTMLElement>(".map-export-crop");
      const cropBounds = crop?.getBoundingClientRect();
      let labelsOutsideCrop = 0;
      if (cropBounds)
        for (const label of svg.querySelectorAll<SVGTextElement>(
          "text[data-map-label-key]",
        )) {
          const bounds = label.getBoundingClientRect();
          if (!bounds.width || !bounds.height) continue;
          const intersects =
            bounds.right > cropBounds.left &&
            bounds.left < cropBounds.right &&
            bounds.bottom > cropBounds.top &&
            bounds.top < cropBounds.bottom;
          const contained =
            bounds.left >= cropBounds.left &&
            bounds.right <= cropBounds.right &&
            bounds.top >= cropBounds.top &&
            bounds.bottom <= cropBounds.bottom;
          if (intersects && !contained) labelsOutsideCrop += 1;
        }
      onMapPreflightInspection({
        usesRgbColors: /(?:#[0-9a-f]{3,8}|rgba?\()/iu.test(svgMarkup),
        unavailableFonts:
          "fonts" in document && document.fonts.check('12px "Verdana"')
            ? []
            : ["Verdana"],
        labelsOutsideCrop,
      });
      setIsMapRendering(false);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [
    active,
    svgMarkup,
    mapZoom,
    mapLabelDensity,
    mapLayers.labels,
    mapLayers.water,
    mapLayers.waterLabels,
    mapLayers.lakes,
    mapLayers.rivers,
    mapLayers.cities,
    mapLayers.mountains,
    mapPan.x,
    mapPan.y,
    onMapPreflightInspection,
  ]);

  useLayoutEffect(() => {
    const viewport = { zoom: mapZoom, pan: mapPan };
    viewportRef.current = viewport;
    if (active && mapTransformRef.current)
      applyMapViewBox(mapTransformRef.current, viewport);
  }, [active, mapZoom, mapPan, output]);

  useLayoutEffect(() => {
    wheelHandlerRef.current = onWheel;
  }, [onWheel]);

  useEffect(() => {
    const container = mapTransformRef.current;
    if (!active || !container || !output) return;
    const observer = new ResizeObserver(() =>
      applyMapViewBox(container, viewportRef.current),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [active, output]);

  useEffect(() => {
    const canvas = mapCanvasRef.current;
    if (!active || !canvas) return;
    const handleWheel = (event: WheelEvent) => wheelHandlerRef.current(event);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [active]);

  function selectMapRegion(region: string) {
    const bounds = mapRegions[region];
    const container = mapTransformRef.current;
    if (!bounds || !container) return;
    if (region === "world") {
      onMapZoom(1);
      onMapPan({ x: 0, y: 0 });
      return;
    }
    const projection = (
      mapProjection === "robinson"
        ? geoRobinson()
        : mapProjection === "eckert4"
          ? geoEckert4()
          : mapProjection === "naturalEarth"
            ? geoNaturalEarth1()
            : geoMercator()
    ).fitExtent(
      [
        [0, 0],
        [1000, 700],
      ],
      { type: "Sphere" },
    );
    const topLeft = projection([bounds.west, bounds.north]);
    const bottomRight = projection([bounds.east, bounds.south]);
    if (!topLeft || !bottomRight) return;
    const width = Math.abs(bottomRight[0] - topLeft[0]);
    const height = Math.abs(bottomRight[1] - topLeft[1]);
    if (!width || !height) return;
    const zoom = Math.max(
      0.5,
      Math.min(40, Math.min((1000 * 0.8) / width, (700 * 0.8) / height)),
    );
    const rect = container.getBoundingClientRect();
    const baseScale = Math.min(rect.width / 1000, rect.height / 700);
    const centerX = (topLeft[0] + bottomRight[0]) / 2;
    const centerY = (topLeft[1] + bottomRight[1]) / 2;
    onMapZoom(zoom);
    onMapPan({
      x: -zoom * baseScale * (centerX - 500),
      y: -zoom * baseScale * (centerY - 350),
    });
  }

  return (
    <div className="figure-module map-module">
      <div className="figure-workbench map-workbench">
        <section className="figure-controls editor-sidebar">
          <ProcessingBadge mode="ai" language={language} />
          <div className="map-editor-controls">
            <div
              className={`map-year-field ${TIME_TRAVEL_ENABLED ? "" : "map-time-locked"}`}
              ref={yearFieldRef}
            >
              <div>
                <button
                  type="button"
                  onClick={() =>
                    TIME_TRAVEL_ENABLED
                      ? onTimelineStep(-1)
                      : showTimeTravelNotice()
                  }
                  aria-disabled={!TIME_TRAVEL_ENABLED}
                  aria-label={t.previousYear}
                >
                  <i />
                </button>
                <input
                  aria-label={t.mapYear}
                  type="number"
                  min="-3400"
                  max="2026"
                  value={TIME_TRAVEL_ENABLED ? timelineYearInput : "2026"}
                  readOnly={!TIME_TRAVEL_ENABLED}
                  aria-disabled={!TIME_TRAVEL_ENABLED}
                  onChange={(event) =>
                    TIME_TRAVEL_ENABLED
                      ? onTimelineInput(event.target.value)
                      : showTimeTravelNotice()
                  }
                  onBlur={TIME_TRAVEL_ENABLED ? onTimelineCommit : undefined}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    TIME_TRAVEL_ENABLED
                      ? onTimelineStep(1)
                      : showTimeTravelNotice()
                  }
                  aria-disabled={!TIME_TRAVEL_ENABLED}
                  aria-label={t.nextYear}
                >
                  <i />
                </button>
              </div>
              {timeTravelNotice &&
                timeTooltipPos !== null &&
                createPortal(
                  <span
                    className="map-time-tooltip"
                    role="status"
                    style={{
                      top: timeTooltipPos.top,
                      right: timeTooltipPos.right,
                    }}
                  >
                    {t.timeTravelNotice}
                  </span>,
                  document.body,
                )}
            </div>
            <div
              className={`map-year-slider ${TIME_TRAVEL_ENABLED ? "" : "map-time-locked"}`}
              onPointerDownCapture={(event) => {
                if (!TIME_TRAVEL_ENABLED) {
                  event.preventDefault();
                  event.stopPropagation();
                  showTimeTravelNotice();
                }
              }}
            >
              <input
                aria-label={t.historicalTimeline}
                type="range"
                min="-3400"
                max="2026"
                value={timelineYear}
                onChange={(event) =>
                  TIME_TRAVEL_ENABLED
                    ? onTimelineSlider(Number(event.currentTarget.value))
                    : showTimeTravelNotice()
                }
                onPointerUp={(event) =>
                  TIME_TRAVEL_ENABLED
                    ? onTimelineSliderCommit(Number(event.currentTarget.value))
                    : showTimeTravelNotice()
                }
              />
              <div>
                <span>3400 {t.bce}</span>
                <span>1 {t.ce}</span>
                <span>2026</span>
              </div>
            </div>
            {isLoadingTimeline && (
              <p className="map-timeline-status">
                Loading{" "}
                {timelineYear < 0
                  ? `${Math.abs(timelineYear)} BCE`
                  : timelineYear}
                …
              </p>
            )}
            {error && (
              <p className="extraction-error" role="alert">
                {error}
              </p>
            )}
            <div className="map-view-buttons">
              <button
                type="button"
                onClick={() => onMapZoom((value) => Math.min(40, value * 1.5))}
              >
                {t.zoomIn}
              </button>
              <button
                type="button"
                onClick={() => onMapZoom((value) => Math.max(0.5, value / 1.5))}
              >
                {t.zoomOut}
              </button>
              <button
                type="button"
                onClick={() => {
                  onMapZoom(1);
                  onMapPan({ x: 0, y: 0 });
                }}
              >
                {t.resetView}
              </button>
            </div>
            <section className="map-control-section map-projection">
              <h2>{t.projection}</h2>
              <label>
                <span>{t.projection}</span>
                <select
                  aria-label={t.projection}
                  value={mapProjection}
                  onChange={(event) =>
                    onChangeMapProjection(event.target.value as MapProjection)
                  }
                >
                  {(Object.keys(t.projectionOptions) as MapProjection[]).map(
                    (projection) => (
                      <option key={projection} value={projection}>
                        {t.projectionOptions[projection]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                <span className="map-projection-region">{t.region}</span>
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value) selectMapRegion(event.target.value);
                    event.target.value = "";
                  }}
                >
                  <option value="">{t.regionChoose}</option>
                  {(
                    Object.keys(t.regionOptions) as Array<
                      keyof typeof t.regionOptions
                    >
                  ).map((region) => (
                    <option key={region} value={region}>
                      {t.regionOptions[region]}
                    </option>
                  ))}
                </select>
              </label>
              {mapLayers.graticule && (
                <p className="map-layer-note">{t.graticuleNote}</p>
              )}
            </section>
            <section className="map-control-section map-purpose-controls">
              <h2>{t.purpose}</h2>
              <div className="map-purpose-grid">
                {MAP_PURPOSES.map((purpose) => (
                  <button
                    key={purpose}
                    type="button"
                    className="map-choice-button"
                    aria-pressed={mapPurpose === purpose}
                    onClick={() => onApplyMapPurpose(purpose)}
                  >
                    {t.purposeOptions[purpose]}
                  </button>
                ))}
              </div>
              {mapPurpose === null && (
                <p className="map-purpose-custom">{t.customPurpose}</p>
              )}
              <p className="map-layer-note">{t.purposeNote}</p>
              <h2>{t.labelDensity}</h2>
              <div className="map-density-grid">
                {MAP_LABEL_DENSITIES.map((density) => (
                  <button
                    key={density}
                    type="button"
                    className="map-choice-button"
                    aria-pressed={mapLabelDensity === density}
                    onClick={() => onChangeMapLabelDensity(density)}
                  >
                    {t.labelDensityOptions[density]}
                  </button>
                ))}
              </div>
              <p className="map-layer-note">{t.labelDensityNote}</p>
            </section>
            <section className="map-control-section map-prompt-field">
              <h2>{t.editMap}</h2>
              <textarea
                value={mapPromptText}
                maxLength={600}
                placeholder={t.mapPrompt}
                onChange={(event) => onChangeMapPromptText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
                    onApplyMapPrompt();
                }}
              />
              <button
                type="button"
                disabled={isMapPromptRunning || !mapPromptText.trim()}
                onClick={onApplyMapPrompt}
              >
                {isMapPromptRunning ? t.promptRunning : t.applyPrompt}
              </button>
              {mapPromptStatus && (
                <p className="map-layer-note">{mapPromptStatus}</p>
              )}
              {mapAiPreview && (
                <div className="map-ai-preview">
                  <span>{t.promptPreview}</span>
                  {mapAiPreview.operations.map(
                    ({ operation, approved }, index) => (
                      <label key={`${operation.type}-${index}`}>
                        <input
                          type="checkbox"
                          checked={approved}
                          onChange={() => onToggleMapAiOperation(index)}
                        />
                        <span>
                          {operation.type === "fill"
                            ? t.aiFillSummary(
                                operation.targets,
                                operation.color,
                              )
                            : t.aiLabelSummary(operation.text)}
                        </span>
                      </label>
                    ),
                  )}
                  {mapAiPreview.unresolved.length > 0 && (
                    <p className="map-layer-note">
                      {t.promptUnresolved(mapAiPreview.unresolved.length)}{" "}
                      {mapAiPreview.unresolved.join(", ")}
                    </p>
                  )}
                  <div>
                    <button
                      type="button"
                      disabled={
                        !mapAiPreview.operations.some(
                          ({ approved }) => approved,
                        )
                      }
                      onClick={onApplyMapAiPreview}
                    >
                      {t.approveSelected}
                    </button>
                    <button type="button" onClick={onDismissMapAiPreview}>
                      {t.dismissPreview}
                    </button>
                  </div>
                </div>
              )}
              {mapAiHistory.length > 0 && (
                <details className="map-ai-history">
                  <summary>{t.promptHistory}</summary>
                  {mapAiHistory.map((entry, index) => (
                    <p key={`${entry.prompt}-${index}`}>
                      <b>{entry.status === "applied" ? "✓" : "×"}</b>
                      <span>{entry.prompt}</span>
                      <small>
                        {entry.status === "applied"
                          ? t.historyApplied(entry.approved, entry.total)
                          : t.historyDismissed}
                      </small>
                    </p>
                  ))}
                </details>
              )}
            </section>
            <section className="map-control-section map-layers">
              <h2>{t.layers}</h2>
              <div className="map-layer-grid">
                {MAP_LAYER_KEYS.map((layer) => (
                  <label className={`map-layer-${layer}`} key={layer}>
                    <input
                      type="checkbox"
                      checked={mapLayers[layer]}
                      onChange={() => onToggleLayer(layer, !mapLayers[layer])}
                    />
                    {t.mapLayers[layer]}
                  </label>
                ))}
              </div>
            </section>
            {mapLayers.climate && (
              <p className="map-layer-note">{t.climateNote}</p>
            )}
            {(mapLayers.terrain ||
              mapLayers.mountains ||
              mapLayers.cities ||
              mapLayers.disputed) && (
              <p className="map-layer-note">{t.presentLayersNote}</p>
            )}
            <button
              type="button"
              className={`map-fill-toggle ${mapFillMode ? "active" : ""}`}
              aria-pressed={mapFillMode}
              onClick={() => onMapFillMode((active) => !active)}
            >
              <i />
              <span>
                {t.fillCountries}
                {mapFillMode ? `: ${t.on}` : ""}
              </span>
            </button>
            <button
              type="button"
              className={`map-label-toggle ${mapLabelMode ? "active" : ""}`}
              aria-pressed={mapLabelMode}
              onClick={() => onMapLabelMode((active) => !active)}
            >
              <i />
              <span>
                {t.hideLabels}
                {mapLabelMode ? `: ${t.on}` : ""}
              </span>
            </button>
            {(mapLabelMode || hiddenMapLabelCount > 0) && (
              <div className="map-label-tools">
                <button
                  type="button"
                  disabled={hiddenMapLabelCount === 0}
                  onClick={onUndoHiddenMapLabel}
                >
                  {t.undoHiddenLabel}
                </button>
                <button
                  type="button"
                  disabled={hiddenMapLabelCount === 0}
                  onClick={onUnhideAllMapLabels}
                >
                  {t.unhideAllLabels}
                </button>
                {hiddenMapLabelCount > 0 && (
                  <span className="map-label-count">{hiddenMapLabelCount}</span>
                )}
              </div>
            )}
            <button
              type="button"
              className={`map-label-toggle map-label-position-toggle ${mapLabelPositionMode ? "active" : ""}`}
              aria-pressed={mapLabelPositionMode}
              onClick={() => onMapLabelPositionMode((active) => !active)}
            >
              <i />
              <span>
                {t.positionLabels}
                {mapLabelPositionMode ? `: ${t.on}` : ""}
              </span>
            </button>
            {(mapLabelPositionMode || positionedMapLabelCount > 0) && (
              <div className="map-label-tools">
                <button
                  type="button"
                  disabled={positionedMapLabelCount === 0}
                  onClick={onUndoMapLabelPosition}
                >
                  {t.undoHiddenLabel}
                </button>
                <button
                  type="button"
                  disabled={positionedMapLabelCount === 0}
                  onClick={onResetMapLabelPositions}
                >
                  {t.resetLabelPositions}
                </button>
                {positionedMapLabelCount > 0 && (
                  <span className="map-label-count">
                    {positionedMapLabelCount}
                  </span>
                )}
              </div>
            )}
            <button
              type="button"
              className={`map-label-toggle map-draw-toggle ${mapDrawMode ? "active" : ""}`}
              aria-pressed={mapDrawMode}
              onClick={() => onMapDrawMode((active) => !active)}
            >
              <i />
              <span>
                {t.drawMode}
                {mapDrawMode ? `: ${t.on}` : ""}
              </span>
            </button>
            {mapDrawMode && (
              <div className="map-draw-tools">
                <label className="map-draw-kind">
                  <span>{t.drawKind}</span>
                  <select
                    value={mapDrawKind}
                    onChange={(event) =>
                      onChangeDrawKind(event.target.value as DrawKind)
                    }
                  >
                    {(Object.keys(t.drawKinds) as DrawKind[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {t.drawKinds[kind]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="map-draw-label">
                  <span>{t.drawLabel}</span>
                  <input
                    type="text"
                    value={mapDrawLabel}
                    maxLength={60}
                    placeholder={t.drawLabelPlaceholder}
                    onChange={(event) => onChangeDrawLabel(event.target.value)}
                  />
                </label>
                <div className="map-label-tools">
                  {mapDrawKind === "route" && (
                    <button
                      type="button"
                      disabled={mapDrawRoutePoints === 0}
                      onClick={onFinishDrawRoute}
                    >
                      {t.finishRoute}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={mapDrawCount === 0}
                    onClick={onUndoDrawItem}
                  >
                    {t.undoHiddenLabel}
                  </button>
                  <button
                    type="button"
                    disabled={mapDrawCount === 0}
                    onClick={onClearDrawItems}
                  >
                    {t.clearDrawItems}
                  </button>
                </div>
                <p className="map-layer-note">{t.drawNote}</p>
              </div>
            )}
            <p>{t.mapInstructions}</p>
            <div className="map-palette">
              <span>{t.adobePalette}</span>
              <input
                ref={paletteInputRef}
                type="file"
                accept=".ase,application/octet-stream"
                onChange={onPaletteInput}
                hidden
              />
              {palette.length ? (
                <>
                  <div className="map-palette-swatches">
                    {palette.map((swatch, index) => (
                      <i
                        key={`${swatch.name}-${index}`}
                        style={{ background: swatch.hex }}
                        title={swatch.name}
                      />
                    ))}
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => paletteInputRef.current?.click()}
                    >
                      {t.replacePalette}
                    </button>
                    <button type="button" onClick={() => onApplyPalette(false)}>
                      {t.applyPalette}
                    </button>
                    <button type="button" onClick={() => onApplyPalette(true)}>
                      {t.shufflePalette}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => paletteInputRef.current?.click()}
                >
                  {t.importPalette}
                </button>
              )}
            </div>
            {output && (
              <section className="map-control-section map-print-controls">
                <h2>{t.printSize}</h2>
                <select
                  data-testid="map-print-preset"
                  aria-label={t.printSize}
                  value={mapPrintPresetId}
                  onChange={(event) =>
                    onChangeMapPrintPreset(
                      event.target.value as MapPrintPresetId,
                    )
                  }
                >
                  {MAP_PRINT_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {t.printOptions[preset.id]}
                    </option>
                  ))}
                </select>
                <div className="map-export-metadata-fields">
                  {(
                    [
                      ["title", t.metadataFields.title, 120],
                      ["subtitle", t.metadataFields.subtitle, 180],
                      ["source", t.metadataFields.source, 300],
                      ["projectionNote", t.metadataFields.projectionNote, 180],
                      ["copyright", t.metadataFields.copyright, 180],
                    ] as const
                  ).map(([field, label, maxLength]) => (
                    <label key={field}>
                      <span>{label}</span>
                      <input
                        type="text"
                        value={mapExportMetadata[field]}
                        maxLength={maxLength}
                        onChange={(event) =>
                          onChangeMapExportMetadata(field, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
                <div
                  className="map-publication-preflight"
                  data-testid="map-publication-preflight"
                >
                  <span>
                    {t.publicationPreflight}:{" "}
                    {mapPreflight.some(({ level }) => level === "warning")
                      ? t.preflightReview
                      : t.preflightReady}
                  </span>
                  {mapPreflight.map((check) => (
                    <p className={check.level} key={check.id}>
                      <b>{check.level === "pass" ? "✓" : "!"}</b>
                      {check.level === "pass"
                        ? check.id === "text-size"
                          ? `7 pt ≥ ${check.threshold} pt`
                          : check.id === "stroke-width"
                            ? `0.1 mm ≥ ${check.threshold} mm`
                            : t.preflightReady
                        : t.preflightMessages[check.id]}
                    </p>
                  ))}
                </div>
              </section>
            )}
            {output?.checks.some(({ level }) => level === "warning") && (
              <div className="map-panel-warnings">
                <span>{t.warnings}</span>
                {output.checks
                  .filter(({ level }) => level === "warning")
                  .map((check, index) => (
                    <p key={`${check.message}-${index}`}>
                      <b>!</b>
                      {check.message}
                    </p>
                  ))}
              </div>
            )}
            {output && (
              <div className="map-export-actions">
                <button type="button" onClick={onDownloadCroppedMap}>
                  {t.downloadSvg}
                  <b>↓</b>
                </button>
              </div>
            )}
          </div>
        </section>
        <div className="figure-preview-column">
          <section className="figure-result">
            <div className="pane-label">
              <span>{t.preview}</span>
              <span>1000 × 680 / SVG 1.1</span>
            </div>
            <div
              ref={mapCanvasRef}
              className={`figure-paper map-editor-canvas hide-information ${mapLayers.boundaries ? "" : "hide-boundaries"} ${mapLayers.labels ? "" : "hide-labels"} ${mapLayers.water ? "" : "hide-water"} ${mapLayers.lakes ? "" : "hide-lakes"} ${mapLayers.climate ? "" : "hide-climate"} ${mapLayers.terrain ? "" : "hide-terrain"} ${mapLayers.mountains ? "" : "hide-mountains"} ${mapLayers.terrain && mapLayers.mountains ? "" : "hide-scale"} ${mapLayers.cities ? "" : "hide-cities"} ${mapLayers.disputed ? "" : "hide-disputed"} ${mapLayers.graticule ? "" : "hide-graticule"} ${mapLayers.graticuleFront ? "graticule-position-front" : ""} ${mapLabelMode ? "label-hide-mode" : ""} ${mapLabelPositionMode ? "label-position-mode" : ""}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onDragStart={(event) => event.preventDefault()}
            >
              {isGenerating ? (
                <LoadingText items={mapProcessing[language]} />
              ) : output ? (
                <>
                  <div
                    ref={mapTransformRef}
                    className={`map-transform ${mapZoom >= 8 ? "map-zoom-detail" : mapZoom >= 3 ? "map-zoom-regional" : "map-zoom-world"}`}
                    style={
                      {
                        "--map-country-label-size": `${(6 + mapZoom * 0.7) / mapZoom}px`,
                        "--map-country-halo-size": `${(1.5 + mapZoom * 0.12) / mapZoom}px`,
                        "--map-water-label-size": `${(7 + mapZoom * 0.8) / mapZoom}px`,
                        "--map-water-halo-size": `${(1.7 + mapZoom * 0.12) / mapZoom}px`,
                        "--map-city-radius": `${Math.max(0.45, 1.7 / mapZoom)}px`,
                        "--map-city-offset": `${Math.max(1.2, 4 / mapZoom)}px`,
                        "--map-water-feature-size": `${(6 + mapZoom * 0.7) / mapZoom}px`,
                        "--map-water-feature-halo": `${(1.4 + mapZoom * 0.1) / mapZoom}px`,
                        "--map-border-width": `${0.4 / mapZoom}px`,
                        "--map-coast-width": `${0.35 / mapZoom}px`,
                        "--map-river-width": `${0.3 / mapZoom}px`,
                        "--map-lake-width": `${0.3 / mapZoom}px`,
                        "--map-disputed-width": `${0.55 / mapZoom}px`,
                        "--map-graticule-width": `${0.2 / mapZoom}px`,
                      } as CSSProperties
                    }
                  />
                  <i className="map-export-crop" aria-hidden="true">
                    {output && (
                      <span className="map-legend">
                        <b>{t.legendTitle}</b>
                        {(output.spec.categories ?? []).map((category) => (
                          <span key={category.id} className="map-legend-row">
                            <i
                              style={{
                                background:
                                  legendPalette[category.color] ?? "#c7c7c7",
                              }}
                            />
                            {category.label}
                          </span>
                        ))}
                        {mapLayers.climate &&
                          MAP_CLIMATE_COLORS.map((color, index) => (
                            <span
                              key={`climate-${color}`}
                              className="map-legend-row"
                            >
                              <i style={{ background: color }} />
                              {t.climateLabels[index]}
                            </span>
                          ))}
                        {mapLayers.cities && (
                          <span className="map-legend-row">
                            <i className="map-legend-symbol-city" />
                            {t.legendCity}
                          </span>
                        )}
                        {mapLayers.mountains && (
                          <span className="map-legend-row">
                            <i className="map-legend-symbol-peak" />
                            {t.legendMountain}
                          </span>
                        )}
                        {mapLayers.rivers && (
                          <span className="map-legend-row">
                            <i className="map-legend-symbol-river" />
                            {t.legendRiver}
                          </span>
                        )}
                        {mapLayers.lakes && (
                          <span className="map-legend-row">
                            <i className="map-legend-symbol-lake" />
                            {t.legendLake}
                          </span>
                        )}
                      </span>
                    )}
                  </i>
                  {isMapRendering && (
                    <p className="map-rendering-status" role="status">
                      {t.rendering}
                    </p>
                  )}
                </>
              ) : (
                <p>{t.empty}</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
