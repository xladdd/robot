"use client";

import type {
  ChangeEvent,
  CSSProperties,
  Dispatch,
  PointerEventHandler,
  RefObject,
  SetStateAction,
  WheelEventHandler,
} from "react";
import { LoadingText } from "../../../_components/LoadingText";
import { ToolHeader } from "../../../_components/ToolChrome";
import type { Language } from "../../registry";
import type { AseSwatch } from "./code/ase";
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

export function MapMainInterface({
  language,
  section,
  label,
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
  onWheel,
}: {
  language: Language;
  section: string | null;
  label: string | null;
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
  onWheel: WheelEventHandler<HTMLDivElement>;
}) {
  const t = mapUi[language];
  return (
    <div className="figure-module map-module">
      <div className="figure-workbench map-workbench">
        <section className="figure-controls editor-sidebar">
          <div className="map-editor-controls">
            <div className="map-year-field">
              <span>
                {t.timeline} · {t.negativeBce}
              </span>
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
          <ToolHeader className="figure-header editor-header" code={`${section} / MAP / SVG V1`} title={label || "Map Generator"} subtitle={t.subtitle} mode="local" />
          <section className="figure-result">
            <div className="pane-label">
              <span>{t.preview}</span>
              <span>1000 × 680 / SVG 1.1</span>
            </div>
            <div
              className={`figure-paper map-editor-canvas hide-information ${mapLayers.boundaries ? "" : "hide-boundaries"} ${mapLayers.labels ? "" : "hide-labels"} ${mapLayers.water ? "" : "hide-water"} ${mapLayers.climate ? "" : "hide-climate"} ${mapLayers.terrain ? "" : "hide-terrain"} ${mapLayers.mountains ? "" : "hide-mountains"} ${mapLayers.cities ? "" : "hide-cities"} ${mapLayers.disputed ? "" : "hide-disputed"}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onWheel={onWheel}
              onDragStart={(event) => event.preventDefault()}
            >
              {isGenerating ? (
                <LoadingText items={mapProcessing[language]} />
              ) : output ? (
                <>
                  <div
                    className={`map-transform ${mapZoom >= 8 ? "map-zoom-detail" : mapZoom >= 3 ? "map-zoom-regional" : "map-zoom-world"}`}
                    style={
                      {
                        width: `${mapZoom * 100}%`,
                        height: `${mapZoom * 100}%`,
                        left: `calc(50% + ${mapPan.x}px)`,
                        top: `calc(50% + ${mapPan.y}px)`,
                        "--map-country-label-size": `${(6 + mapZoom * 0.7) / mapZoom}px`,
                        "--map-country-halo-size": `${(1.5 + mapZoom * 0.12) / mapZoom}px`,
                        "--map-water-label-size": `${(7 + mapZoom * 0.8) / mapZoom}px`,
                        "--map-water-halo-size": `${(1.7 + mapZoom * 0.12) / mapZoom}px`,
                        "--map-city-radius": `${Math.max(0.45, 1.7 / mapZoom)}px`,
                        "--map-city-offset": `${Math.max(1.2, 4 / mapZoom)}px`,
                      } as CSSProperties
                    }
                    dangerouslySetInnerHTML={{ __html: output.svg }}
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
