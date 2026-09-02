"use client";

import type { ChangeEvent, RefObject } from "react";
import { LoadingText } from "../../../_components/LoadingText";
import type { Language } from "../../registry";
import type { AseSwatch } from "./code/ase";
import type { DiagramCheck, DiagramSpec } from "./code/diagram";
import { diagramProcessing, diagramUi } from "./copy";

export type DiagramReference = { name: string; data: string };
export type DiagramOutput = { svg: string; report: string; checks: DiagramCheck[]; model: string; spec: DiagramSpec };

function formatCountdown(seconds: number) {
  const sign = seconds < 0 ? "−" : "";
  const absolute = Math.abs(seconds);
  return `${sign}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, "0")}`;
}

export function DiagramMainInterface({ language, section, label, request, references, palette, paletteName, output, error, isGenerating, secondsLeft, referenceInputRef, paletteInputRef, onPaletteInput, onClearPalette, onReferenceInput, onRemoveReference, onRequest, onGenerate, onDownload, onVerificationMarkdown }: {
  language: Language;
  section: string | null;
  label: string | null;
  request: string;
  references: DiagramReference[];
  palette: AseSwatch[];
  paletteName: string;
  output: DiagramOutput | null;
  error: string;
  isGenerating: boolean;
  secondsLeft: number;
  referenceInputRef: RefObject<HTMLInputElement | null>;
  paletteInputRef: RefObject<HTMLInputElement | null>;
  onPaletteInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearPalette: () => void;
  onReferenceInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveReference: (index: number) => void;
  onRequest: (request: string) => void;
  onGenerate: () => void;
  onDownload: (content: string, filename: string, type: string) => void;
  onVerificationMarkdown: (report: string) => string;
}) {
  const t = diagramUi[language];
  const example = language === "cs" ? "Popsané biologické schéma měňavky pro žáky 2. stupně. Zobraz buněčnou membránu, cytoplazmu, jádro, potravní vakuolu, stažitelnou vakuolu a panožky." : "A labelled biological diagram of an amoeba for lower-secondary students. Show the cell membrane, cytoplasm, nucleus, food vacuole, contractile vacuole, and pseudopodia.";

  return <div className="figure-module">
    <div className="figure-workbench">
      <section className="figure-controls">
        <div className="figure-label-row"><label htmlFor="diagram-request">{t.label}</label><button type="button" onClick={() => onRequest(example)}>{t.example}</button></div>
        <textarea id="diagram-request" value={request} onChange={(event) => onRequest(event.target.value)} placeholder={t.placeholder} rows={7} disabled={isGenerating} />
        <div className="figure-palette"><span>{t.palette}</span><input ref={paletteInputRef} type="file" accept=".ase,application/octet-stream" onChange={onPaletteInput} hidden />{palette.length ? <><div className="figure-palette-head"><b>{paletteName}</b><button type="button" onClick={onClearPalette}>{t.clearPalette}</button></div><div className="figure-swatches">{palette.map((swatch, index) => <i key={`${swatch.name}-${index}`} title={`${swatch.name} · ${swatch.model} · ${swatch.hex}`} style={{ background: swatch.hex }} />)}</div></> : <button type="button" className="figure-add-palette" onClick={() => paletteInputRef.current?.click()}><b>＋</b>{t.addPalette}</button>}</div>
        <div className="figure-references"><span>{t.references}</span><input ref={referenceInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onReferenceInput} hidden /><div>{references.map((reference, index) => <figure key={`${reference.name}-${index}`}><img src={reference.data} alt={reference.name} /><figcaption>{reference.name}</figcaption><button onClick={() => onRemoveReference(index)} aria-label={`${t.remove} ${reference.name}`}>×</button></figure>)}{references.length < 3 && <button className="figure-add-reference" onClick={() => referenceInputRef.current?.click()}><b>＋</b>{t.addReference}</button>}</div></div>
        {error && <p className="extraction-error" role="alert">{error}</p>}
        <button className="figure-generate" onClick={onGenerate} disabled={!request.trim() || isGenerating}><span>{isGenerating ? `${t.generating} · ${formatCountdown(secondsLeft)}` : t.generate}</span><b>{isGenerating ? "…" : "→"}</b></button>
        <p className="figure-warning">{t.warning}</p>
        {output && <div className="figure-checks"><span>{t.checks}</span>{output.checks.map((check, index) => <p className={check.level} key={`${check.message}-${index}`}><b>{check.level === "pass" ? "✓" : "!"}</b>{check.message}</p>)}</div>}
      </section>
      <div className="figure-preview-column">
        <header className="figure-header"><div><div className="figure-meta"><span className="module-code">{section} / DIAGRAM / SVG V1</span><span className="figure-badge"><i />{t.badge}</span></div><h1>{label}</h1><p>{t.subtitle}</p></div></header>
        <section className="figure-result">
          <div className="pane-label"><span>{t.preview}</span><span>1000 × 680 / SVG 1.1</span></div>
          <div className="figure-paper">{isGenerating ? <LoadingText items={diagramProcessing[language]} /> : output ? <div dangerouslySetInnerHTML={{ __html: output.svg }} /> : <p>{t.empty}</p>}</div>
          {output && <div className="figure-actions"><button onClick={() => onDownload(output.svg, `${output.spec.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "figure"}.svg`, "image/svg+xml")}>{t.downloadSvg}<b>↓</b></button><button onClick={() => onDownload(onVerificationMarkdown(output.report), "figure-verification.md", "text/markdown")}>{t.downloadReport}<b>↓</b></button></div>}
        </section>
      </div>
    </div>
  </div>;
}
