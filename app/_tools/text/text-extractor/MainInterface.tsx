"use client";

import type { ChangeEvent, DragEvent, RefObject } from "react";
import { LoadingText } from "../../../_components/LoadingText";
import {
  CrosshairInstruction,
  ProcessingBadge,
} from "../../../_components/ToolChrome";
import type { Language } from "../../registry";
import { textExtractorCopy } from "./copy";

export type TextSourceKind = "image" | "pdf" | "text" | null;

export function TextExtractorMainInterface({
  language,
  inputRef,
  sourceKind,
  sourceFile,
  sourceUrl,
  text,
  correction,
  error,
  copied,
  isProcessing,
  isCorrecting,
  onFileInput,
  onDrop,
  onCopy,
  onDownload,
  onText,
  onCorrection,
  onCorrect,
}: {
  language: Language;
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
  const t = textExtractorCopy[language];
  return (
    <div className="extraction-module has-source">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        onChange={onFileInput}
        hidden
      />
      <div className="document-active-workspace extraction-active-workspace">
        <div className="extraction-body">
          <section className="source-pane extraction-source-pane">
            <div className="pane-label">
              <span>{t.source}</span>
              <span>
                {sourceFile?.name ||
                  (sourceKind === "text" ? "PASTED TEXT" : "—")}
              </span>
            </div>
            <div className="source-viewer">
              {!sourceKind && (
                <button
                  type="button"
                  className="text-workbench-crosshair-button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={onDrop}
                >
                  <CrosshairInstruction>{t.emptySource}</CrosshairInstruction>
                </button>
              )}
              {sourceKind === "image" && sourceUrl && (
                <img src={sourceUrl} alt={sourceFile?.name || t.source} />
              )}
              {sourceKind === "pdf" && sourceUrl && (
                <iframe src={sourceUrl} title={sourceFile?.name || t.source} />
              )}
              {sourceKind === "text" && (
                <div className="pasted-source">{text}</div>
              )}
            </div>
          </section>
          <div className="extraction-side-column">
            <div className="extraction-head document-active-head document-app-head">
              <div>
                <ProcessingBadge mode="ai" language={language} />
                <h1>{t.heading}</h1>
              </div>
              <button
                className="start-button action-button upload-button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
              >
                <span>{t.another}</span>
                <b>＋</b>
              </button>
              {error && (
                <p className="extraction-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <section className="text-pane extraction-text-pane">
              <div className="pane-label">
                <span>{t.extractedText}</span>
                <span>OCR / TXT</span>
              </div>
              <div className="output-actions">
                <button
                  className="copy-button"
                  onClick={onCopy}
                  disabled={!text}
                  aria-label={t.copyText}
                >
                  {copied ? "✓" : "▣"}
                  <span>{copied ? t.copied : t.copyText}</span>
                </button>
                <button
                  className="download-button action-button action-button-success action-button-compact"
                  onClick={() =>
                    onDownload(text, "extracted-text.md", "text/markdown")
                  }
                  disabled={!text}
                >
                  MD
                </button>
                <button
                  className="download-button action-button action-button-success action-button-compact"
                  onClick={() =>
                    onDownload(text, "extracted-text.txt", "text/plain")
                  }
                  disabled={!text}
                >
                  TXT
                </button>
              </div>
              {isProcessing || isCorrecting ? (
                <LoadingText items={t.processing} />
              ) : (
                <textarea
                  value={text}
                  onChange={(event) => onText(event.target.value)}
                  spellCheck
                />
              )}
            </section>
            <div className="correction-box">
              <textarea
                rows={2}
                value={correction}
                onChange={(event) => onCorrection(event.target.value)}
                placeholder={t.correctionPlaceholder}
                disabled={isCorrecting}
              />
              <button
                onClick={onCorrect}
                disabled={!text.trim() || !correction.trim() || isCorrecting}
                aria-label={t.correct}
              >
                {isCorrecting ? "…" : "→"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
