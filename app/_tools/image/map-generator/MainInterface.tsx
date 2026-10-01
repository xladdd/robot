"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
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
import type { MapCheck } from "./code/map";
import { mapProcessing, mapUi } from "./copy";

export type { MapCheck } from "./code/map";
export type MapOutput = {
  svg: string;
  report: string;
  checks: MapCheck[];
  model: string;
  spec: {
    title: string;
    date?: string;
    sources?: Array<{ id: string; title: string; url: string }>;
  };
};
export type MapLayers = {
  boundaries: boolean;
  labels: boolean;
  water: boolean;
  rivers: boolean;
  climate: boolean;
  terrain: boolean;
  mountains: boolean;
  cities: boolean;
  disputed: boolean;
};

type MapViewport = { zoom: number; pan: { x: number; y: number } };

function applyMapViewBox(container: HTMLDivElement, viewport: MapViewport) {
  const svg = container.querySelector("svg");
  if (!svg || !container.clientWidth || !container.clientHeight) return;
  const baseScale = Math.min(
    container.clientWidth / 1000,
    container.clientHeight / 700,
  );
  const scale = baseScale * viewport.zoom;
  const width = 1000 / viewport.zoom;
  const height = 700 / viewport.zoom;
  const centerX = 500 - viewport.pan.x / scale;
  const centerY = 350 - viewport.pan.y / scale;
  svg.setAttribute(
    "viewBox",
    `${centerX - width / 2} ${centerY - height / 2} ${width} ${height}`,
  );
}

export function MapMainInterface({
  language,
  palette,
  output,
  error,
  isGenerating,
  timelineYear,
  timelineYearInput,
  isLoadingTimeline,
  mapLayers,
  mapFillMode,
  mapZoom,
  mapPan,
  paletteInputRef,
  onTimelineStep,
  onTimelineInput,
  onTimelineCommit,
  onTimelineSlider,
  onTimelineSliderCommit,
  onToggleLayer,
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
  palette: AseSwatch[];
  output: MapOutput | null;
  error: string;
  isGenerating: boolean;
  timelineYear: number;
  timelineYearInput: string;
  isLoadingTimeline: boolean;
  mapLayers: MapLayers;
  mapFillMode: boolean;
  mapZoom: number;
  mapPan: { x: number; y: number };
  paletteInputRef: RefObject<HTMLInputElement | null>;
  onTimelineStep: (delta: number) => void;
  onTimelineInput: (value: string) => void;
  onTimelineCommit: () => void;
  onTimelineSlider: (year: number) => void;
  onTimelineSliderCommit: (year: number) => void;
  onToggleLayer: (layer: keyof MapLayers, enabled: boolean) => void;
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
    layers: {
      labels: mapLayers.labels,
      water: mapLayers.water,
      cities: mapLayers.cities,
      mountains: mapLayers.mountains,
    },
  });
  const svgMarkup = output?.svg ?? "";

  useLayoutEffect(() => {
    labelOptionsRef.current = {
      zoom: mapZoom,
      layers: {
        labels: mapLayers.labels,
        water: mapLayers.water,
        cities: mapLayers.cities,
        mountains: mapLayers.mountains,
      },
    };
  }, [
    mapZoom,
    mapLayers.labels,
    mapLayers.water,
    mapLayers.cities,
    mapLayers.mountains,
  ]);

  useLayoutEffect(() => {
    const container = mapTransformRef.current;
    if (!container) return;
    container.innerHTML = svgMarkup;
    const svg = container.querySelector<SVGSVGElement>("svg");
    if (svg) layoutMapSvgLabels(svg, labelOptionsRef.current);
  }, [svgMarkup]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const svg = mapTransformRef.current?.querySelector<SVGSVGElement>("svg");
      if (!svg) return;
      layoutMapSvgLabels(svg, {
        zoom: mapZoom,
        layers: {
          labels: mapLayers.labels,
          water: mapLayers.water,
          cities: mapLayers.cities,
          mountains: mapLayers.mountains,
        },
      });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [
    svgMarkup,
    mapZoom,
    mapLayers.labels,
    mapLayers.water,
    mapLayers.cities,
    mapLayers.mountains,
  ]);

  useLayoutEffect(() => {
    const viewport = { zoom: mapZoom, pan: mapPan };
    viewportRef.current = viewport;
    if (mapTransformRef.current)
      applyMapViewBox(mapTransformRef.current, viewport);
  }, [mapZoom, mapPan, output]);

  useLayoutEffect(() => {
    wheelHandlerRef.current = onWheel;
  }, [onWheel]);

  useEffect(() => {
    const container = mapTransformRef.current;
    if (!container || !output) return;
    const observer = new ResizeObserver(() =>
      applyMapViewBox(container, viewportRef.current),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [output]);

  useEffect(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => wheelHandlerRef.current(event);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);
  return (
    <div className="figure-module map-module">
      <div className="figure-workbench map-workbench">
        <section className="figure-controls editor-sidebar">
          <ProcessingBadge mode="local" language={language} />
          <div className="map-editor-controls">
            <div className="map-year-field">
              <div>
                <button
                  type="button"
                  onClick={() => onTimelineStep(-1)}
                  disabled={timelineYear <= -3400}
                  aria-label={t.previousYear}
                >
                  <i />
                </button>
                <input
                  aria-label={t.mapYear}
                  type="number"
                  min="-3400"
                  max="2026"
                  value={timelineYearInput}
                  onChange={(event) => onTimelineInput(event.target.value)}
                  onBlur={onTimelineCommit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <button
                  type="button"
                  onClick={() => onTimelineStep(1)}
                  disabled={timelineYear >= 2026}
                  aria-label={t.nextYear}
                >
                  <i />
                </button>
              </div>
              <p className="map-year-note">
                {t.timeline} · {t.negativeBce}
              </p>
            </div>
            <div className="map-year-slider">
              <input
                aria-label={t.historicalTimeline}
                type="range"
                min="-3400"
                max="2026"
                value={timelineYear}
                onChange={(event) =>
                  onTimelineSlider(Number(event.currentTarget.value))
                }
                onPointerUp={(event) =>
                  onTimelineSliderCommit(Number(event.currentTarget.value))
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
            <fieldset>
              <legend>{t.layers}</legend>
              {Object.entries(mapLayers).map(([layer, enabled]) => (
                <label className={`map-layer-${layer}`} key={layer}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() =>
                      onToggleLayer(layer as keyof MapLayers, !enabled)
                    }
                  />
                  {t.mapLayers[layer as keyof typeof t.mapLayers]}
                </label>
              ))}
            </fieldset>
            {mapLayers.climate && (
              <div className="map-climate-key">
                <p className="map-layer-note">{t.climateNote}</p>
                <div>
                  {["#e45745", "#e6ad3c", "#69ad63", "#4f83cc", "#8d67b1"].map(
                    (color, index) => (
                      <span key={color}>
                        <i style={{ background: color }} />
                        {t.climateLabels[index]}
                      </span>
                    ),
                  )}
                </div>
              </div>
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
              <div className="map-export-actions">
                <button type="button" onClick={onDownloadCroppedMap}>
                  {t.downloadSvg}
                  <b>↓</b>
                </button>
              </div>
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
              className={`figure-paper map-editor-canvas hide-information ${mapLayers.boundaries ? "" : "hide-boundaries"} ${mapLayers.labels ? "" : "hide-labels"} ${mapLayers.water ? "" : "hide-water"} ${mapLayers.climate ? "" : "hide-climate"} ${mapLayers.terrain ? "" : "hide-terrain"} ${mapLayers.mountains ? "" : "hide-mountains"} ${mapLayers.cities ? "" : "hide-cities"} ${mapLayers.disputed ? "" : "hide-disputed"}`}
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
                        width: "100%",
                        height: "100%",
                        left: 0,
                        top: 0,
                        transform: "none",
                        "--map-country-label-size": `${(6 + mapZoom * 0.7) / mapZoom}px`,
                        "--map-country-halo-size": `${(1.5 + mapZoom * 0.12) / mapZoom}px`,
                        "--map-water-label-size": `${(7 + mapZoom * 0.8) / mapZoom}px`,
                        "--map-water-halo-size": `${(1.7 + mapZoom * 0.12) / mapZoom}px`,
                        "--map-city-radius": `${Math.max(0.45, 1.7 / mapZoom)}px`,
                        "--map-city-offset": `${Math.max(1.2, 4 / mapZoom)}px`,
                      } as CSSProperties
                    }
                  />
                  <i className="map-export-crop" aria-hidden="true" />
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
