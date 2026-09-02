"use client";

import type { ChangeEvent, RefObject } from "react";
import { localizedCoverUi } from "./copy";
import type { Language } from "../../registry";

export type CoverReference = { name: string; data: string; artData: string };
export type CoverUsage = { cost: number | null; promptTokens: number | null; completionTokens: number | null; totalTokens: number | null };
export type CoverStock = { id: string; description: string; sourceUrl: string };
export type CoverGeneration = { id: string; data: string; seed: number; status: "active" | "selected" | "rejected" | "layer"; name?: string; createdAt: string; model: string; generationId?: string; usage: CoverUsage; stock?: CoverStock };
export type CoverAnalysis = { assets: Array<{ name: string; description: string }>; model: string; generationId?: string; usage: CoverUsage };
export type CoverMedium = "match" | "photo" | "illustration" | "3d";
export type CoverQuality = "fast" | "fidelity";
export type CoverProductionStage = "analyzing" | "master" | "assets" | "complete" | null;

export function CoverLightbox({ language, cover, onMove, onClose }: { language: Language; cover: CoverGeneration; onMove: (direction: number) => void; onClose: () => void }) {
  const t = localizedCoverUi[language];
  return <div className="manual-lightbox cover-lightbox" role="dialog" aria-modal="true" aria-label={cover.name || t.heading} onClick={onClose}>
    <button className="manual-lightbox-close" onClick={onClose} aria-label={t.close}>×</button>
    <button className="cover-lightbox-arrow previous" onClick={(event) => { event.stopPropagation(); onMove(-1); }} aria-label={language === "cs" ? "Předchozí obrázek" : "Previous image"}>←</button>
    <figure onClick={(event) => event.stopPropagation()}><img src={cover.data} alt={cover.name || t.heading} /><figcaption>{cover.name || `${t.sketch} · seed ${cover.seed}`}</figcaption></figure>
    <button className="cover-lightbox-arrow next" onClick={(event) => { event.stopPropagation(); onMove(1); }} aria-label={language === "cs" ? "Další obrázek" : "Next image"}>→</button>
  </div>;
}

export function CoverGeneratorMainInterface({ language, inputRef, references, brief, sketches, layers, selectedId, detectedAssets, productionStage, useShutterstock, stockInputs, medium, quality, artOnlyReferences, generationCount, error, isGenerating, isGeneratingLayers, onReferenceInput, onAddReferenceFiles, onRemoveReference, onBrief, onSelectSketch, onRejectSketch, onZoom, onExportArtboard, onDownload, onUseShutterstock, onStockInput, onRemoveStockInput, onAddStockInput, onMedium, onQuality, onArtOnlyReferences, onGenerateSketches, onGenerateLayers }: {
  language: Language;
  inputRef: RefObject<HTMLInputElement | null>;
  references: CoverReference[];
  brief: string;
  sketches: CoverGeneration[];
  layers: CoverGeneration[];
  selectedId: string | null;
  detectedAssets: Array<{ name: string; description: string }>;
  productionStage: CoverProductionStage;
  useShutterstock: boolean;
  stockInputs: string[];
  medium: CoverMedium;
  quality: CoverQuality;
  artOnlyReferences: boolean;
  generationCount: 2 | 4;
  error: string;
  isGenerating: boolean;
  isGeneratingLayers: boolean;
  onReferenceInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onAddReferenceFiles: (files: File[]) => void;
  onRemoveReference: (index: number) => void;
  onBrief: (brief: string) => void;
  onSelectSketch: (id: string) => void;
  onRejectSketch: (id: string) => void;
  onZoom: (cover: CoverGeneration) => void;
  onExportArtboard: () => void;
  onDownload: () => void;
  onUseShutterstock: (enabled: boolean) => void;
  onStockInput: (index: number, value: string) => void;
  onRemoveStockInput: (index: number) => void;
  onAddStockInput: () => void;
  onMedium: (medium: CoverMedium) => void;
  onQuality: (quality: CoverQuality) => void;
  onArtOnlyReferences: (enabled: boolean) => void;
  onGenerateSketches: (count: 2 | 4) => void;
  onGenerateLayers: () => void;
}) {
  const t = localizedCoverUi[language];
  const activeSketches = sketches.filter((item) => item.status !== "rejected");

  return <div className="cover-module">
    <section className={`cover-stage ${!sketches.length && !isGenerating ? "initial" : ""}`}>
      {!sketches.length && !isGenerating
        ? <header className="cover-stage-head"><div><span className="module-code">{t.code}</span><h1>{t.heading}</h1><p>0 / 16 {t.active}</p></div><div className="cover-export-actions"><button className="cover-export cover-artboard-export" disabled>{t.exportArtboard}</button><button className="cover-export" disabled>{t.download}</button></div></header>
        : <header className="cover-stage-head cover-stage-head-compact"><p>{activeSketches.length} / 16 {t.active}{selectedId ? ` · ${t.selected}` : ""}</p><div className="cover-export-actions"><button className="cover-export cover-artboard-export" onClick={onExportArtboard} disabled={!activeSketches.length}>{t.exportArtboard}</button><button className="cover-export" onClick={onDownload} disabled={!sketches.length && !layers.length}>{t.download}</button></div></header>}
      <div className={`cover-grid ${sketches.length || isGenerating ? "has-results" : ""}`} aria-live="polite">
        {activeSketches.map((item, index) => <article className={`cover-card ${item.status === "selected" ? "selected" : ""}`} data-cover-id={item.id} key={item.id}>
          <button className="cover-image" onClick={() => onZoom(item)} aria-label={`${t.zoom} ${index + 1}`}><img src={item.data} alt={`${t.sketch} ${index + 1}`} /></button>
          <footer><span>{t.sketch} {String(index + 1).padStart(2, "0")}</span><small>seed {item.seed} · {item.usage.cost === null ? "—" : `${item.usage.cost.toFixed(4)} cr`}</small><button className="cover-upvote" onClick={() => onSelectSketch(item.id)} aria-pressed={item.status === "selected"}>{item.status === "selected" ? t.choose : t.upvote}</button><button className="cover-reject" onClick={() => onRejectSketch(item.id)} aria-label={t.reject}>×</button></footer>
        </article>)}
        {!activeSketches.length && !isGenerating && <div className="cover-empty"><div className="crosshair" aria-hidden="true"><span /><span /></div><p>{t.empty}</p></div>}
        {isGenerating && Array.from({ length: generationCount }, (_, index) => <div className="cover-card cover-loading" key={`loading-${index}`}><span>{t.generating}<br />{String(index + 1).padStart(2, "0")}</span></div>)}
      </div>
      {(layers.length > 0 || isGeneratingLayers) && <section className="cover-layers"><header><span>{t.assets}</span><small>{t.assetsNote}</small></header><div>{layers.map((item, index) => <article key={item.id}><button onClick={() => onZoom(item)}><img src={item.data} alt={item.name || `${t.asset} ${index + 1}`} /></button><span>{item.name || `${t.asset} ${index + 1}`} · {item.usage.cost === null ? "—" : `${item.usage.cost.toFixed(4)} cr`}</span></article>)}{isGeneratingLayers && <div className="cover-layer-loading">{t.generating}<br />…</div>}</div></section>}
    </section>
    <aside className="cover-toolbar">
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onReferenceInput} hidden />
      <section className="cover-control cover-reference-control">
        <label>{t.references} <b>{references.length}/3 · {t.minimum}</b></label>
        <div className="cover-references">{Array.from({ length: 3 }, (_, index) => {
          const reference = references[index];
          return reference
            ? <figure key={`${reference.name}-${index}`}><img src={reference.data} alt={reference.name} /><button onClick={() => onRemoveReference(index)} aria-label={`${t.remove} ${reference.name}`}>×</button><figcaption>{String(index + 1).padStart(2, "0")}</figcaption></figure>
            : <button className="cover-add-reference" key={`empty-${index}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onAddReferenceFiles(Array.from(event.dataTransfer.files)); }} aria-label={`${t.addCover.replace("\n", " ")} ${index + 1}`}><b>+</b><span>{t.addCover.split("\n").map((line, lineIndex) => <span key={line}>{line}{lineIndex === 0 && <br />}</span>)}</span><small>{String(index + 1).padStart(2, "0")}</small></button>;
        })}</div>
        <label className="cover-checkbox cover-ignore-text"><input type="checkbox" checked={artOnlyReferences} onChange={(event) => onArtOnlyReferences(event.target.checked)} /><span><b>{t.artOnly}</b><small>{t.artOnlyHelp}</small></span></label>
      </section>
      <section className="cover-control"><label htmlFor="cover-brief">{t.brief}</label><textarea id="cover-brief" value={brief} onChange={(event) => onBrief(event.target.value)} placeholder={t.placeholder} rows={8} /></section>
      <section className="cover-control cover-render-controls">
        <label htmlFor="cover-medium">{t.medium}</label>
        <select id="cover-medium" value={medium} onChange={(event) => onMedium(event.target.value as CoverMedium)}><option value="match">{t.mediumMatch}</option><option value="photo">{t.mediumPhoto}</option><option value="illustration">{t.mediumIllustration}</option><option value="3d">{t.medium3d}</option></select>
        <label htmlFor="cover-quality">{t.sketchQuality}</label>
        <select id="cover-quality" value={quality} onChange={(event) => onQuality(event.target.value as CoverQuality)}><option value="fidelity">{t.qualityFidelity}</option><option value="fast">{t.qualityFast}</option></select>
        {quality === "fidelity" && <small>{t.fidelityNote}</small>}
      </section>
      <section className="cover-control cover-stock-control">
        <label className="cover-checkbox"><input type="checkbox" checked={useShutterstock} onChange={(event) => onUseShutterstock(event.target.checked)} /><span><b>{t.stock}</b><small>{t.stockHelp}</small></span></label>
        {useShutterstock && <><div className="cover-stock-inputs">{stockInputs.map((input, index) => <div key={index}><input value={input} onChange={(event) => onStockInput(index, event.target.value)} placeholder={`${index + 1}. ${t.stockInput}`} /><button onClick={() => onRemoveStockInput(index)} aria-label={t.remove}>×</button></div>)}{stockInputs.length < 4 && <button className="cover-add-stock-input" onClick={onAddStockInput}>{t.addStockInput}</button>}</div><p className="cover-stock-warning" role="note"><strong>!</strong>{t.stockWarning}</p></>}
      </section>
      {error && <p className="extraction-error" role="alert">{error}</p>}
      <div className="cover-generate-group">
        <button className="cover-generate" onClick={() => onGenerateSketches(2)} disabled={references.length < 2 || !brief.trim() || isGenerating || activeSketches.length + 2 > 16}><span>{isGenerating && generationCount === 2 ? `${t.generatingCount} 2…` : selectedId ? t.generateSelectedTwo : t.generateTwo}</span><b>→</b></button>
        <button className="cover-generate" onClick={() => onGenerateSketches(4)} disabled={references.length < 2 || !brief.trim() || isGenerating || activeSketches.length + 4 > 16}><span>{isGenerating && generationCount === 4 ? `${t.generatingCount} 4…` : selectedId ? t.generateSelectedFour : t.generateFour}</span><b>→</b></button>
      </div>
      <p className="cover-note">{t.note}</p>
      {sketches.length > 0 && <section className="cover-assets-control"><label>{t.manifest}</label><p>{t.manifestNote}</p><div className={`cover-production-selection ${selectedId ? "ready" : ""}`}>{selectedId ? `✓ ${t.sketch} ${String(activeSketches.findIndex((item) => item.id === selectedId) + 1).padStart(2, "0")} · black-forest-labs/flux.2-pro · 2K` : language === "cs" ? "Nejprve nahoře vyberte koncept." : "Select a concept above first."}</div>{detectedAssets.length > 0 && <div className="cover-detected-assets"><b>{language === "cs" ? "ROZPOZNANÉ PODKLADY" : "DETECTED STEMS"}</b><ol>{detectedAssets.map((asset) => <li key={asset.name}><span>{asset.name}</span><small>{asset.description}</small></li>)}</ol></div>}<button className="cover-production" onClick={onGenerateLayers} disabled={!selectedId || isGeneratingLayers}><span>{isGeneratingLayers ? t.generatingAssets : t.generateAssets}</span><b>→</b></button></section>}
      {productionStage && <div className={`cover-production-progress ${productionStage === "complete" ? "complete" : ""}`} role="status" aria-live="polite"><i /><span>{productionStage === "analyzing" ? language === "cs" ? "1/3 · Rozpoznávání jednotlivých objektů · mistralai/mistral-small-2603" : "1/3 · Detecting individual objects · mistralai/mistral-small-2603" : productionStage === "master" ? language === "cs" ? "2/3 · Vytváření hlavní obálky ve 2K · black-forest-labs/flux.2-pro" : "2/3 · Recreating the 2K cover master · black-forest-labs/flux.2-pro" : productionStage === "assets" ? language === "cs" ? "3/3 · Izolování, regenerování a zvětšování podkladů · black-forest-labs/flux.2-pro" : "3/3 · Isolating, regenerating and upscaling stems · black-forest-labs/flux.2-pro" : language === "cs" ? "Hotovo · 2K obálka a samostatné podklady jsou připravené" : "Complete · 2K master and separate stems are ready"}</span></div>}
    </aside>
  </div>;
}
