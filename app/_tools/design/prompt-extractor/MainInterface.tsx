"use client";

import type { ChangeEvent, DragEvent, RefObject } from "react";
import { LoadingText } from "../../../_components/LoadingText";
import { ProcessingBadge, ToolMeta } from "../../../_components/ToolChrome";
import type { Language } from "../../registry";
import { promptExtractorCopy } from "./copy";

export function PromptExtractorMainInterface({
  language,
  section,
  inputRef,
  file,
  url,
  result,
  progress,
  error,
  copied,
  isExtracting,
  onFileInput,
  onDrop,
  onCopy,
  onDownload,
  onResult,
}: {
  language: Language;
  section: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  file: File | null;
  url: string | null;
  result: string;
  progress: number;
  error: string;
  copied: boolean;
  isExtracting: boolean;
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onCopy: () => void;
  onDownload: (text: string, filename: string, type: string) => void;
  onResult: (result: string) => void;
}) {
  const t = promptExtractorCopy[language];
  return (
    <div className={`prompt-module tool-family tool-family-document ${file ? "has-file" : ""}`}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={onFileInput}
        hidden
      />
      {!file ? (
        <div className="index-head document-start">
          <ToolMeta code={`${section} / PROMPT`} mode="ai" />
          <h1>{t.heading}</h1>
          <p>
            {language === "cs"
              ? "Z obrázků v rukopisu vytvoří jednoduché prompty bez textu a stylu."
              : "Turn manuscript illustrations into simple prompts without text or styling."}
          </p>
          <button
            className="start-button upload-button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
          >
            <span>{t.upload}</span>
            <b>＋</b>
          </button>
          {error && (
            <p className="extraction-error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="prompt-split">
          <section className="source-pane prompt-pdf-column">
            <div className="pane-label">
              <span>{t.source}</span>
              <span>{file.name}</span>
            </div>
            <div className="source-viewer">
              {url && <iframe src={url} title={file.name} />}
            </div>
          </section>
          <div className="prompt-side-column">
            <div className="prompt-active-head">
              <div>
                <ProcessingBadge mode="ai" />
                <h1>{t.heading}</h1>
                <span>{isExtracting ? `${progress}%` : "PDF → TXT"}</span>
              </div>
              <button
                className="start-button upload-button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
                disabled={isExtracting}
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
            <section className="text-pane prompt-output-pane">
              <div className="pane-label">
                <span>{t.extractedPrompts}</span>
                <span>
                  {language === "cs"
                    ? "JEDNODUCHÉ / SLOŽITÉ"
                    : "SIMPLE / COMPLEX"}
                </span>
              </div>
              <div className="output-actions">
                <button
                  className="copy-button"
                  onClick={onCopy}
                  disabled={!result}
                  aria-label={t.copyText}
                >
                  {copied ? "✓" : "▣"}
                  <span>{copied ? t.copied : t.copyText}</span>
                </button>
                <button
                  className="download-button"
                  onClick={() =>
                    onDownload(
                      result,
                      "illustration-prompts.md",
                      "text/markdown",
                    )
                  }
                  disabled={!result}
                >
                  MD
                </button>
                <button
                  className="download-button"
                  onClick={() =>
                    onDownload(result, "illustration-prompts.txt", "text/plain")
                  }
                  disabled={!result}
                >
                  TXT
                </button>
              </div>
              {isExtracting ? (
                <LoadingText items={t.processing} />
              ) : (
                <textarea
                  value={result}
                  onChange={(event) => onResult(event.target.value)}
                  placeholder={error ? "" : t.noIllustrations}
                  spellCheck
                />
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
