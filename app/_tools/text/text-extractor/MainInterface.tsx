"use client";

import type { ChangeEvent, DragEvent, RefObject } from "react";
import { LoadingText } from "../../../_components/LoadingText";
import { copy } from "../../../content/ui";
import type { Language } from "../../registry";

export type TextSourceKind = "image" | "pdf" | "text" | null;

export function TextExtractorMainInterface({ language, section, inputRef, sourceKind, sourceFile, sourceUrl, text, correction, error, copied, isProcessing, isCorrecting, onFileInput, onDrop, onCopy, onDownload, onText, onCorrection, onCorrect }: {
  language: Language;
  section: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  sourceKind: TextSourceKind;
  sourceFile: File | null;
  sourceUrl: string | null;
  text: string;
  correction: string;
  error: string;
  copied: boolean;
  isProcessing: boolean;
  isCorrecting: boolean;
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onCopy: () => void;
  onDownload: (text: string, filename: string, type: string) => void;
  onText: (text: string) => void;
  onCorrection: (instruction: string) => void;
  onCorrect: () => void;
}) {
  const t = copy[language];
  return <div className={`extraction-module ${sourceKind ? "has-source" : ""}`}>
    <div className="extraction-head">
      {!sourceKind && <div className="module-code">{section} / EXTRACTION</div>}
      <h1>{t.apps.extraction}</h1>
      <input ref={inputRef} type="file" accept="application/pdf,image/png,image/jpeg" onChange={onFileInput} hidden />
      <button className="start-button upload-button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        <span>{sourceKind ? t.another : t.upload}</span><b>＋</b>
      </button>
      {error && <p className="extraction-error" role="alert">{error}</p>}
    </div>
    {sourceKind && <div className="extraction-body">
      <div className="extraction-panes">
        <section className="source-pane">
          <div className="pane-label"><span>{t.source}</span><span>{sourceFile?.name || "PASTED TEXT"}</span></div>
          <div className="source-viewer">
            {sourceKind === "image" && sourceUrl && <img src={sourceUrl} alt={sourceFile?.name || t.source} />}
            {sourceKind === "pdf" && sourceUrl && <iframe src={sourceUrl} title={sourceFile?.name || t.source} />}
            {sourceKind === "text" && <div className="pasted-source">{text}</div>}
          </div>
        </section>
        <section className="text-pane">
          <div className="pane-label"><span>{t.extractedText}</span><span>OCR / TXT</span></div>
          <div className="output-actions">
            <button className="copy-button" onClick={onCopy} disabled={!text} aria-label={t.copyText}>{copied ? "✓" : "▣"}<span>{copied ? t.copied : t.copyText}</span></button>
            <button className="download-button" onClick={() => onDownload(text, "extracted-text.md", "text/markdown")} disabled={!text}>MD</button>
            <button className="download-button" onClick={() => onDownload(text, "extracted-text.txt", "text/plain")} disabled={!text}>TXT</button>
          </div>
          {isProcessing || isCorrecting ? <LoadingText items={t.processing} /> : <textarea value={text} onChange={(event) => onText(event.target.value)} spellCheck />}
        </section>
      </div>
      <div className="correction-box">
        <textarea rows={2} value={correction} onChange={(event) => onCorrection(event.target.value)} placeholder={t.correctionPlaceholder} disabled={isCorrecting} />
        <button onClick={onCorrect} disabled={!text.trim() || !correction.trim() || isCorrecting} aria-label={t.correct}>{isCorrecting ? "…" : "→"}</button>
      </div>
    </div>}
  </div>;
}
