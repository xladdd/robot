"use client";

import type { ChangeEvent, DragEvent, RefObject } from "react";
import { LoadingText } from "../../../_components/LoadingText";
import { ProcessingBadge, ToolMeta } from "../../../_components/ToolChrome";
import type { Language } from "../../registry";
import { indexCreatorCopy } from "./copy";

export type IndexMatch = {
  word: string;
  pdfPages: number[];
  otherPdfPages: number[];
};

export function IndexCreatorMainInterface({
  language,
  section,
  inputRef,
  file,
  url,
  previewPage,
  words,
  result,
  matches,
  pdfAnchor,
  printedAnchor,
  error,
  copied,
  isIndexing,
  progress,
  onFileInput,
  onDrop,
  onWords,
  onCreate,
  onCopy,
  onDownload,
  onPreviewPage,
  onPdfAnchor,
  onPrintedAnchor,
}: {
  language: Language;
  section: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  file: File | null;
  url: string | null;
  previewPage: number;
  words: string;
  result: string;
  matches: IndexMatch[];
  pdfAnchor: number;
  printedAnchor: number;
  error: string;
  copied: boolean;
  isIndexing: boolean;
  progress: number;
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onWords: (words: string) => void;
  onCreate: () => void;
  onCopy: () => void;
  onDownload: (text: string, filename: string, type: string) => void;
  onPreviewPage: (page: number) => void;
  onPdfAnchor: (page: number) => void;
  onPrintedAnchor: (page: number) => void;
}) {
  const t = indexCreatorCopy[language];
  return (
    <div className={`index-module ${file ? "has-file" : ""}`}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={onFileInput}
        hidden
      />
      {!file ? (
        <div className="index-head">
          <ToolMeta code={`${section} / INDEX`} mode="ai" />
          <h1>{t.heading}</h1>
          <button
            className="start-button upload-button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
          >
            <span>{t.upload}</span>
            <b>＋</b>
          </button>
          <textarea
            className="word-list-input"
            value={words}
            onChange={(event) => onWords(event.target.value)}
            placeholder={t.wordList}
            rows={7}
          />
          <span className="data-note">{t.localExtraction}</span>
          {error && (
            <p className="extraction-error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="index-split">
          <section className="source-pane index-pdf-column">
            <div className="pane-label">
              <span>{t.source}</span>
              <span>{file.name}</span>
            </div>
            <div className="source-viewer">
              {url && (
                <iframe
                  key={previewPage}
                  src={`${url}#page=${previewPage}`}
                  title={file.name}
                />
              )}
            </div>
          </section>
          <div className="index-side-column">
            <div className="index-active-head">
              <div>
                <ProcessingBadge mode="ai" />
                <h1>{t.heading}</h1>
              </div>
              <button
                className="start-button upload-button"
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
            <div className="index-controls">
              <div className="index-words-block">
                <label>{t.wordList}</label>
                <textarea
                  value={words}
                  onChange={(event) => onWords(event.target.value)}
                  rows={5}
                />
              </div>
              <button
                className="index-run"
                onClick={onCreate}
                disabled={!words.trim() || isIndexing}
              >
                <span>{t.createIndex}</span>
                <b>{isIndexing ? `${progress}%` : "→"}</b>
              </button>
              <span className="data-note">{t.localExtraction}</span>
            </div>
            <section className="text-pane index-output-pane">
              <div className="pane-label index-output-label">
                <span>{t.indexOutput}</span>
                <span>{t.indexLegend}</span>
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
                    onDownload(result, "index.md", "text/markdown")
                  }
                  disabled={!result}
                >
                  MD
                </button>
                <button
                  className="download-button"
                  onClick={() => onDownload(result, "index.txt", "text/plain")}
                  disabled={!result}
                >
                  TXT
                </button>
              </div>
              {isIndexing ? (
                <LoadingText items={t.processing} />
              ) : matches.length ? (
                <div className="index-result-view" aria-label={t.indexOutput}>
                  {matches.map(({ word, pdfPages, otherPdfPages }) => (
                    <div className="index-result-line" key={word}>
                      <span className="index-result-term">{word}</span>
                      <span className="index-result-pages">
                        {pdfPages.map((pdfPage, index) => {
                          const printedPage =
                            printedAnchor + pdfPage - pdfAnchor;
                          return (
                            <span key={pdfPage}>
                              {index > 0 && ", "}
                              <button
                                type="button"
                                onClick={() => onPreviewPage(pdfPage)}
                                title={`${t.printedPage} ${printedPage} · ${t.pdfPage} ${pdfPage}`}
                              >
                                {printedPage}
                              </button>
                            </span>
                          );
                        })}
                      </span>
                      <span className="index-result-pages index-result-other">
                        (
                        {otherPdfPages.map((pdfPage, index) => {
                          const printedPage =
                            printedAnchor + pdfPage - pdfAnchor;
                          return (
                            <span key={pdfPage}>
                              {index > 0 && ", "}
                              <button
                                type="button"
                                onClick={() => onPreviewPage(pdfPage)}
                                title={`${t.printedPage} ${printedPage} · ${t.pdfPage} ${pdfPage}`}
                              >
                                {printedPage}
                              </button>
                            </span>
                          );
                        })}
                        )
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <textarea value={result} readOnly spellCheck={false} />
              )}
            </section>
            <div className="page-map">
              <span>{t.pageMapping}</span>
              <label>
                {t.pdfPage}
                <input
                  type="number"
                  min="1"
                  value={pdfAnchor}
                  onChange={(event) =>
                    onPdfAnchor(Math.max(1, Number(event.target.value)))
                  }
                />
              </label>
              <span>→</span>
              <label>
                {t.printedPage}
                <input
                  type="number"
                  min="1"
                  value={printedAnchor}
                  onChange={(event) =>
                    onPrintedAnchor(Math.max(1, Number(event.target.value)))
                  }
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
