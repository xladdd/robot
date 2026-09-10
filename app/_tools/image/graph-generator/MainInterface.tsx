"use client";

import type { ChangeEvent, RefObject } from "react";
import { LoadingText } from "../../../_components/LoadingText";
import { EmptyViewportState, ToolHeader } from "../../../_components/ToolChrome";
import type { Language } from "../../registry";
import type { AseSwatch } from "./code/ase";
import { graphProcessing, graphUi } from "./copy";

export type GraphCheck = { level: "pass" | "warning"; message: string };
export type GraphOutput = { svg: string; report: string; checks: GraphCheck[]; model: string; spec: { title: string; sources?: Array<{ id: string; title: string; url: string }> } };

function formatCountdown(seconds: number) {
  const sign = seconds < 0 ? "−" : "";
  const absolute = Math.abs(seconds);
  return `${sign}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, "0")}`;
}

export function GraphMainInterface({ language, section, label, request, palette, paletteName, output, error, isGenerating, secondsLeft, paletteInputRef, onPaletteInput, onClearPalette, onRequest, onGenerate, onDownload, onVerificationMarkdown }: {
  language: Language;
  section: string | null;
  label: string | null;
  request: string;
  palette: AseSwatch[];
  paletteName: string;
  output: GraphOutput | null;
  error: string;
  isGenerating: boolean;
  secondsLeft: number;
  paletteInputRef: RefObject<HTMLInputElement | null>;
  onPaletteInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearPalette: () => void;
  onRequest: (request: string) => void;
  onGenerate: () => void;
  onDownload: (content: string, filename: string, type: string) => void;
  onVerificationMarkdown: (report: string) => string;
}) {
  const t = graphUi[language];
  const example = language === "cs" ? "Vytvoř sloupcový graf s názvem Podíl obnovitelné energie. Česko: 2021 17,7; 2022 18,2; 2023 18,6. Jednotka: %. Zdroj S1: Eurostat, https://ec.europa.eu/eurostat" : "Create a bar chart titled Renewable energy share. Czechia: 2021 17.7; 2022 18.2; 2023 18.6. Unit: %. Source S1: Eurostat, https://ec.europa.eu/eurostat";

  return <div className="figure-module">
    <ToolHeader className="figure-header" code={`${section} / CHART`} title={label || "Graph Generator"} subtitle={t.subtitle} mode="ai" language={language} />
    <div className="figure-workbench">
      <section className="figure-controls">
        <div className="figure-label-row"><label htmlFor="figure-request">{t.label}</label><button type="button" onClick={() => onRequest(example)}>{t.example}</button></div>
        <textarea className="chart-request" id="figure-request" value={request} onChange={(event) => onRequest(event.target.value)} placeholder={t.placeholder} rows={12} disabled={isGenerating} />
        <div className="figure-palette"><span>{t.palette}</span><input ref={paletteInputRef} type="file" accept=".ase,application/octet-stream" onChange={onPaletteInput} hidden />{palette.length ? <><div className="figure-palette-head"><b>{paletteName}</b><button type="button" onClick={onClearPalette}>{t.clearPalette}</button></div><div className="figure-swatches">{palette.map((swatch, index) => <i key={`${swatch.name}-${index}`} title={`${swatch.name} · ${swatch.model} · ${swatch.hex}`} style={{ background: swatch.hex }} />)}</div></> : <button type="button" className="figure-add-palette" onClick={() => paletteInputRef.current?.click()}><b>＋</b>{t.addPalette}</button>}</div>
        {error && <p className="extraction-error" role="alert">{error}</p>}
        <button className="figure-generate" onClick={onGenerate} disabled={!request.trim() || isGenerating}><span>{isGenerating ? `${t.generating} · ${formatCountdown(secondsLeft)}` : t.generate}</span><b>{isGenerating ? "…" : "→"}</b></button>
        <p className="figure-warning">{t.warning}</p>
        {output && <div className="figure-checks"><span>{t.checks}</span>{output.checks.map((check, index) => <p className={check.level} key={`${check.message}-${index}`}><b>{check.level === "pass" ? "✓" : "!"}</b>{check.message}</p>)}</div>}
      </section>
      <div className="figure-preview-column">
        <section className="figure-result">
          <div className="pane-label"><span>{t.preview}</span><span>1000 × 680 / SVG 1.1</span></div>
          <div className="figure-paper">{isGenerating ? <LoadingText items={graphProcessing[language]} /> : output ? <div dangerouslySetInnerHTML={{ __html: output.svg }} /> : <EmptyViewportState>{t.empty}</EmptyViewportState>}</div>
          {output && <div className="figure-actions"><button onClick={() => onDownload(output.svg, `${output.spec.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "figure"}.svg`, "image/svg+xml")}>{t.downloadSvg}<b>↓</b></button><button onClick={() => onDownload(onVerificationMarkdown(output.report), "figure-verification.md", "text/markdown")}>{t.downloadReport}<b>↓</b></button></div>}
        </section>
      </div>
    </div>
  </div>;
}
