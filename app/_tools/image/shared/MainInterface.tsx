"use client";

import type { ChangeEvent, CSSProperties, Dispatch, PointerEventHandler, RefObject, SetStateAction, WheelEventHandler } from "react";
import { LoadingText } from "../../../_components/LoadingText";
import { copy, figureUi } from "../../../content/ui";
import type { Language } from "../../registry";
import type { AseSwatch } from "./code/ase";

export type FigureMode = "chart" | "diagram" | "map";
export type FigureCheck = { level: "pass" | "warning"; message: string };
export type FigureOutput = { svg: string; report: string; checks: FigureCheck[]; model: string; spec: { title: string; date?: string; sources?: Array<{ id: string; title: string; url: string }> } };
export type FigureReference = { name: string; data: string };
export type MapLayers = { boundaries: boolean; labels: boolean; water: boolean; rivers: boolean; climate: boolean; terrain: boolean; mountains: boolean; cities: boolean; disputed: boolean };

function formatCountdown(seconds: number) {
  const sign = seconds < 0 ? "−" : "";
  const absolute = Math.abs(seconds);
  return `${sign}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, "0")}`;
}

export function FigureMainInterface({ language, section, label, mode, request, references, palette, paletteName, output, error, isGenerating, secondsLeft, timelineYear, timelineYearInput, isLoadingTimeline, mapLayers, mapFillMode, mapZoom, mapPan, mapEditPrompt, referenceInputRef, paletteInputRef, onTimelineStep, onTimelineInput, onTimelineCommit, onTimelineSlider, onTimelineSliderCommit, onToggleLayer, onMapFillMode, onMapZoom, onMapPan, onMapEditPrompt, onPaletteInput, onApplyPalette, onClearPalette, onReferenceInput, onRemoveReference, onRequest, onGenerate, onDownloadCroppedMap, onDownload, onVerificationMarkdown, onPointerDown, onPointerMove, onPointerUp, onWheel }: {
  language: Language;
  section: string | null;
  label: string | null;
  mode: FigureMode;
  request: string;
  references: FigureReference[];
  palette: AseSwatch[];
  paletteName: string;
  output: FigureOutput | null;
  error: string;
  isGenerating: boolean;
  secondsLeft: number;
  timelineYear: number;
  timelineYearInput: string;
  isLoadingTimeline: boolean;
  mapLayers: MapLayers;
  mapFillMode: boolean;
  mapZoom: number;
  mapPan: { x: number; y: number };
  mapEditPrompt: string;
  referenceInputRef: RefObject<HTMLInputElement | null>;
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
  onMapEditPrompt: (prompt: string) => void;
  onPaletteInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onApplyPalette: (shuffle: boolean) => void;
  onClearPalette: () => void;
  onReferenceInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveReference: (index: number) => void;
  onRequest: (request: string) => void;
  onGenerate: () => void;
  onDownloadCroppedMap: () => void;
  onDownload: (content: string, filename: string, type: string) => void;
  onVerificationMarkdown: (report: string) => string;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onWheel: WheelEventHandler<HTMLDivElement>;
}) {
  const t = copy[language];
  const figureT = figureUi[language];
  const example = mode === "diagram"
    ? language === "cs" ? "Popsané biologické schéma měňavky pro žáky 2. stupně. Zobraz buněčnou membránu, cytoplazmu, jádro, potravní vakuolu, stažitelnou vakuolu a panožky." : "A labelled biological diagram of an amoeba for lower-secondary students. Show the cell membrane, cytoplasm, nucleus, food vacuole, contractile vacuole, and pseudopodia."
    : language === "cs" ? "Vytvoř sloupcový graf s názvem Podíl obnovitelné energie. Česko: 2021 17,7; 2022 18,2; 2023 18,6. Jednotka: %. Zdroj S1: Eurostat, https://ec.europa.eu/eurostat" : "Create a bar chart titled Renewable energy share. Czechia: 2021 17.7; 2022 18.2; 2023 18.6. Unit: %. Source S1: Eurostat, https://ec.europa.eu/eurostat";

  return <div className={`figure-module ${mode === "map" ? "map-module" : ""}`}>
    <div className={`figure-workbench ${mode === "map" ? "map-workbench" : ""}`}>
      <section className="figure-controls">
        {mode === "map" ? <div className="map-editor-controls">
          <div className="map-year-field"><span>{figureT.timeline} · {figureT.negativeBce}</span><div><button type="button" onClick={() => onTimelineStep(-1)} disabled={timelineYear <= -3400} aria-label={figureT.previousYear}><i /></button><input aria-label={figureT.mapYear} type="number" min="-3400" max="2026" value={timelineYearInput} onChange={(event) => onTimelineInput(event.target.value)} onBlur={onTimelineCommit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><button type="button" onClick={() => onTimelineStep(1)} disabled={timelineYear >= 2026} aria-label={figureT.nextYear}><i /></button></div></div>
          <div className="map-year-slider"><input aria-label={figureT.historicalTimeline} type="range" min="-3400" max="2026" value={timelineYear} onChange={(event) => onTimelineSlider(Number(event.currentTarget.value))} onPointerUp={(event) => onTimelineSliderCommit(Number(event.currentTarget.value))} /><div><span>3400 {figureT.bce}</span><span>1 {figureT.ce}</span><span>2026</span></div></div>
          {isLoadingTimeline && <p className="map-timeline-status">Loading {timelineYear < 0 ? `${Math.abs(timelineYear)} BCE` : timelineYear}…</p>}
          {error && <p className="extraction-error" role="alert">{error}</p>}
          <fieldset><legend>{figureT.layers}</legend>{Object.entries(mapLayers).map(([layer, enabled]) => <label className={`map-layer-${layer}`} key={layer}><input type="checkbox" checked={enabled} onChange={() => onToggleLayer(layer as keyof MapLayers, !enabled)} />{figureT.mapLayers[layer as keyof typeof figureT.mapLayers]}</label>)}</fieldset>
          {mapLayers.climate && <div className="map-climate-key"><p className="map-layer-note">{figureT.climateNote}</p><div>{["#e45745", "#e6ad3c", "#69ad63", "#4f83cc", "#8d67b1"].map((color, index) => <span key={color}><i style={{ background: color }} />{figureT.climateLabels[index]}</span>)}</div></div>}
          {(mapLayers.terrain || mapLayers.mountains || mapLayers.cities || mapLayers.disputed) && <p className="map-layer-note">{figureT.presentLayersNote}</p>}
          <button type="button" className={`map-fill-toggle ${mapFillMode ? "active" : ""}`} aria-pressed={mapFillMode} onClick={() => onMapFillMode((active) => !active)}><i /><span>{figureT.fillCountries}{mapFillMode ? `: ${figureT.on}` : ""}</span></button>
          <div className="map-view-buttons"><button type="button" onClick={() => onMapZoom((value) => Math.min(40, value * 1.5))}>{figureT.zoomIn}</button><button type="button" onClick={() => onMapZoom((value) => Math.max(.5, value / 1.5))}>{figureT.zoomOut}</button><button type="button" onClick={() => { onMapZoom(1); onMapPan({ x: 0, y: 0 }); }}>{figureT.resetView}</button></div>
          <p>{figureT.mapInstructions}</p>
          <div className="map-palette"><span>{figureT.adobePalette}</span><input ref={paletteInputRef} type="file" accept=".ase,application/octet-stream" onChange={onPaletteInput} hidden />{palette.length ? <><div className="map-palette-swatches">{palette.map((swatch, index) => <i key={`${swatch.name}-${index}`} style={{ background: swatch.hex }} title={swatch.name} />)}</div><div><button type="button" onClick={() => paletteInputRef.current?.click()}>{figureT.replacePalette}</button><button type="button" onClick={() => onApplyPalette(false)}>{figureT.applyPalette}</button><button type="button" onClick={() => onApplyPalette(true)}>{figureT.shufflePalette}</button></div></> : <button type="button" onClick={() => paletteInputRef.current?.click()}>{figureT.importPalette}</button>}</div>
          <label className="map-prompt-field"><span>{figureT.editMap}</span><textarea value={mapEditPrompt} onChange={(event) => onMapEditPrompt(event.target.value)} placeholder={figureT.mapPrompt} rows={4} /></label>
          {output && <div className="map-export-actions"><button type="button" onClick={onDownloadCroppedMap}>{figureT.downloadSvg}<b>↓</b></button></div>}
          {output?.checks.some(({ level }) => level === "warning") && <div className="map-panel-warnings"><span>{figureT.warnings}</span>{output.checks.filter(({ level }) => level === "warning").map((check, index) => <p key={`${check.message}-${index}`}><b>!</b>{check.message}</p>)}</div>}
        </div> : <>
          <div className="figure-label-row"><label htmlFor="figure-request">{figureT.label}</label><button type="button" onClick={() => onRequest(example)}>{figureT.example}</button></div>
          <textarea className={mode === "chart" ? "chart-request" : ""} id="figure-request" value={request} onChange={(event) => onRequest(event.target.value)} placeholder={mode === "diagram" ? (language === "cs" ? "Například: Popsané biologické schéma měňavky pro žáky 2. stupně." : "For example: A labelled biological diagram of an amoeba for lower-secondary students.") : figureT.placeholder} rows={mode === "chart" ? 12 : 7} disabled={isGenerating} />
          <div className="figure-palette"><span>{figureT.palette}</span><input ref={paletteInputRef} type="file" accept=".ase,application/octet-stream" onChange={onPaletteInput} hidden />{palette.length ? <><div className="figure-palette-head"><b>{paletteName}</b><button type="button" onClick={onClearPalette}>{figureT.clearPalette}</button></div><div className="figure-swatches">{palette.map((swatch, index) => <i key={`${swatch.name}-${index}`} title={`${swatch.name} · ${swatch.model} · ${swatch.hex}`} style={{ background: swatch.hex }} />)}</div></> : <button type="button" className="figure-add-palette" onClick={() => paletteInputRef.current?.click()}><b>＋</b>{figureT.addPalette}</button>}</div>
          {mode !== "chart" && <div className="figure-references"><span>{figureT.references}</span><input ref={referenceInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onReferenceInput} hidden /><div>{references.map((reference, index) => <figure key={`${reference.name}-${index}`}><img src={reference.data} alt={reference.name} /><figcaption>{reference.name}</figcaption><button onClick={() => onRemoveReference(index)} aria-label={`${figureT.remove} ${reference.name}`}>×</button></figure>)}{references.length < 3 && <button className="figure-add-reference" onClick={() => referenceInputRef.current?.click()}><b>＋</b>{figureT.addReference}</button>}</div></div>}
          {error && <p className="extraction-error" role="alert">{error}</p>}
          <button className="figure-generate" onClick={onGenerate} disabled={!request.trim() || isGenerating}><span>{isGenerating ? `${figureT.generating} · ${formatCountdown(secondsLeft)}` : figureT.generate}</span><b>{isGenerating ? "…" : "→"}</b></button>
          <p className="figure-warning">{figureT.warning}</p>
          {output && <div className="figure-checks"><span>{figureT.checks}</span>{output.checks.map((check, index) => <p className={check.level} key={`${check.message}-${index}`}><b>{check.level === "pass" ? "✓" : "!"}</b>{check.message}</p>)}</div>}
        </>}
      </section>
      <div className="figure-preview-column">
        <header className="figure-header"><div><div className="figure-meta"><span className="module-code">{section} / {mode.toUpperCase()} / SVG V1</span><span className="figure-badge"><i />{figureT.badge}</span></div><h1>{label}</h1><p>{figureT.subtitle}</p></div></header>
        <section className="figure-result">
          <div className="pane-label"><span>{figureT.preview}</span><span>1000 × 680 / SVG 1.1</span></div>
          <div className={`figure-paper ${mode === "map" ? `map-editor-canvas hide-information ${mapLayers.boundaries ? "" : "hide-boundaries"} ${mapLayers.labels ? "" : "hide-labels"} ${mapLayers.water ? "" : "hide-water"} ${mapLayers.climate ? "" : "hide-climate"} ${mapLayers.terrain ? "" : "hide-terrain"} ${mapLayers.mountains ? "" : "hide-mountains"} ${mapLayers.cities ? "" : "hide-cities"} ${mapLayers.disputed ? "" : "hide-disputed"}` : ""}`} onPointerDown={mode === "map" ? onPointerDown : undefined} onPointerMove={mode === "map" ? onPointerMove : undefined} onPointerUp={mode === "map" ? onPointerUp : undefined} onWheel={mode === "map" ? onWheel : undefined} onDragStart={mode === "map" ? (event) => event.preventDefault() : undefined}>
            {isGenerating ? <LoadingText items={mode === "diagram" ? t.diagramProcessing : mode === "chart" ? t.graphProcessing : t.figureProcessing} /> : output ? <><div className={`map-transform ${mapZoom >= 8 ? "map-zoom-detail" : mapZoom >= 3 ? "map-zoom-regional" : "map-zoom-world"}`} style={mode === "map" ? { width: `${mapZoom * 100}%`, height: `${mapZoom * 100}%`, left: `calc(50% + ${mapPan.x}px)`, top: `calc(50% + ${mapPan.y}px)`, "--map-country-label-size": `${(6 + mapZoom * .7) / mapZoom}px`, "--map-country-halo-size": `${(1.5 + mapZoom * .12) / mapZoom}px`, "--map-water-label-size": `${(7 + mapZoom * .8) / mapZoom}px`, "--map-water-halo-size": `${(1.7 + mapZoom * .12) / mapZoom}px`, "--map-city-radius": `${Math.max(.45, 1.7 / mapZoom)}px`, "--map-city-offset": `${Math.max(1.2, 4 / mapZoom)}px` } as CSSProperties : undefined} dangerouslySetInnerHTML={{ __html: output.svg }} />{mode === "map" && <i className="map-export-crop" aria-hidden="true" />}</> : <p>{figureT.empty}</p>}
          </div>
          {output && mode !== "map" && <div className="figure-actions"><button onClick={() => onDownload(output.svg, `${output.spec.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "figure"}.svg`, "image/svg+xml")}>{figureT.downloadSvg}<b>↓</b></button><button onClick={() => onDownload(onVerificationMarkdown(output.report), "figure-verification.md", "text/markdown")}>{figureT.downloadReport}<b>↓</b></button></div>}
        </section>
      </div>
    </div>
  </div>;
}
