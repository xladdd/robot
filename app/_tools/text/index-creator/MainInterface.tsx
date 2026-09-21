"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from "react";
import { LoadingText } from "../../../_components/LoadingText";
import {
  CrosshairInstruction,
  ProcessingBadge,
} from "../../../_components/ToolChrome";
import type { Language } from "../../registry";
import type { CandidateMatchKind, CandidateReason } from "./code/pdf-indexer";
import { indexCreatorCopy } from "./copy";

export type IndexCandidatePageView = {
  pdfPage: number;
  sourcePdfPage?: number;
  snippets: string[];
  score: number;
  decision: "recommended" | "possible";
  matchedForms: string[];
  matchKinds: CandidateMatchKind[];
  evidence: string[];
  reasons: CandidateReason[];
};

export type IndexMatch = {
  word: string;
  pdfPages: number[];
  otherPdfPages: number[];
  candidatePages: IndexCandidatePageView[];
};

export function IndexCreatorMainInterface({
  language,
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
  onTogglePage,
  onPdfAnchor,
  onPrintedAnchor,
}: {
  language: Language;
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
  onTogglePage: (word: string, page: number) => void;
  onPdfAnchor: (page: number) => void;
  onPrintedAnchor: (page: number) => void;
}) {
  const t = indexCreatorCopy[language];
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageInput, setPageInput] = useState(String(previewPage));

  useEffect(() => {
    setPageInput(String(previewPage));
  }, [previewPage]);

  useEffect(() => {
    if (!file) {
      setPageCount(null);
      return;
    }

    let cancelled = false;
    void import("./code/pdf-indexer")
      .then(({ getPdfPageCount }) => getPdfPageCount(file))
      .then((count) => {
        if (!cancelled) setPageCount(count);
      })
      .catch(() => {
        if (!cancelled) setPageCount(null);
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  function commitPreviewPage() {
    const requestedPage = Number(pageInput);
    const page =
      Number.isInteger(requestedPage) && requestedPage > 0
        ? Math.min(requestedPage, pageCount ?? requestedPage)
        : previewPage;
    setPageInput(String(page));
    onPreviewPage(page);
  }

  return (
    <div className="index-module has-file">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={onFileInput}
        hidden
      />
      <div className="document-active-workspace index-active-workspace">
        <div className="index-split">
          <section className="source-pane index-pdf-column">
            <div className="pane-label index-pdf-label">
              <span>{t.source}</span>
              <div className="index-pdf-actions">
                <span className="index-pdf-name" title={file?.name}>
                  {file?.name || "—"}
                </span>
                <label className="index-page-jump">
                  <span>{t.pdfPage}</span>
                  <input
                    type="number"
                    min="1"
                    max={pageCount ?? undefined}
                    value={pageInput}
                    onChange={(event) => setPageInput(event.target.value)}
                    onBlur={commitPreviewPage}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    aria-label={t.pdfPage}
                  />
                  <b>/ {pageCount ?? "—"}</b>
                </label>
              </div>
            </div>
            <div className="source-viewer">
              {!file && (
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
              {url && (
                <iframe
                  key={previewPage}
                  src={`${url}#page=${previewPage}`}
                  title={file?.name || t.source}
                />
              )}
            </div>
          </section>
          <div className="index-side-column">
            <div className="index-active-head document-active-head document-app-head">
              <div>
                <ProcessingBadge mode="ai" language={language} />
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
                  rows={2}
                />
              </div>
              <button
                className="index-run"
                onClick={onCreate}
                disabled={!file || !words.trim() || isIndexing}
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
                  {matches.map(
                    ({ word, pdfPages, otherPdfPages, candidatePages }) => {
                      const candidateByPage = new Map(
                        candidatePages.map((candidate) => [
                          candidate.pdfPage,
                          candidate,
                        ]),
                      );
                      const pageLabel = (pdfPage: number) =>
                        printedAnchor + pdfPage - pdfAnchor;
                      const titleFor = (pdfPage: number) => {
                        const candidate = candidateByPage.get(pdfPage);
                        const reasons = candidate?.reasons
                          .map((reason) => t.reasonLabels[reason])
                          .join("; ");
                        return `${t.printedPage} ${pageLabel(pdfPage)} · ${t.pdfPage} ${pdfPage}${reasons ? ` · ${reasons}` : ""}`;
                      };
                      return (
                        <div className="index-result-line" key={word}>
                          <span className="index-result-term">{word}</span>
                          <span className="index-result-pages index-result-accepted">
                            {pdfPages.length ? (
                              pdfPages.map((pdfPage, index) => (
                                <span
                                  className="index-page-control"
                                  key={pdfPage}
                                >
                                  {index > 0 && ", "}
                                  <button
                                    type="button"
                                    className="index-page-link"
                                    onClick={() => onPreviewPage(pdfPage)}
                                    title={titleFor(pdfPage)}
                                  >
                                    {pageLabel(pdfPage)}
                                  </button>
                                  <button
                                    type="button"
                                    className="index-page-toggle"
                                    onClick={() => onTogglePage(word, pdfPage)}
                                    aria-label={`${t.demotePage} ${pageLabel(pdfPage)}`}
                                    title={t.demotePage}
                                  >
                                    −
                                  </button>
                                </span>
                              ))
                            ) : (
                              <span className="index-empty">—</span>
                            )}
                          </span>
                          {otherPdfPages.length > 0 && (
                            <span className="index-review-pages">
                              <span className="index-review-label">
                                {t.possible}:
                              </span>
                              {otherPdfPages.map((pdfPage) => (
                                <span
                                  className="index-page-control"
                                  key={pdfPage}
                                >
                                  <button
                                    type="button"
                                    className="index-page-link index-page-possible"
                                    onClick={() => onPreviewPage(pdfPage)}
                                    title={titleFor(pdfPage)}
                                  >
                                    {pageLabel(pdfPage)}
                                  </button>
                                  <button
                                    type="button"
                                    className="index-page-toggle index-page-accept"
                                    onClick={() => onTogglePage(word, pdfPage)}
                                    aria-label={`${t.acceptPage} ${pageLabel(pdfPage)}`}
                                    title={t.acceptPage}
                                  >
                                    +
                                  </button>
                                </span>
                              ))}
                            </span>
                          )}
                          {candidatePages.length > 0 && (
                            <details className="index-evidence-details">
                              <summary>{t.matchDetails}</summary>
                              <div className="index-evidence-list">
                                {candidatePages.map((candidate) => (
                                  <div
                                    className="index-evidence-item"
                                    key={candidate.pdfPage}
                                  >
                                    <b>
                                      {pageLabel(candidate.pdfPage)} ·{" "}
                                      {t.pdfPage} {candidate.pdfPage} ·{" "}
                                      {candidate.score}
                                    </b>
                                    <span>
                                      {t.matchedForms}:{" "}
                                      {candidate.matchedForms.length
                                        ? candidate.matchedForms.join(", ")
                                        : "—"}{" "}
                                      ·{" "}
                                      {candidate.matchKinds
                                        .map((kind) => t.matchKindLabels[kind])
                                        .join(", ")}{" "}
                                      ·{" "}
                                      {candidate.reasons
                                        .map((reason) => t.reasonLabels[reason])
                                        .join("; ")}
                                      {candidate.sourcePdfPage
                                        ? ` · ${t.sourcePage} ${candidate.sourcePdfPage}`
                                        : ""}
                                    </span>
                                    {candidate.snippets.map(
                                      (snippet, index) => (
                                        <q
                                          key={`${candidate.pdfPage}-${index}`}
                                        >
                                          {snippet}
                                        </q>
                                      ),
                                    )}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      );
                    },
                  )}
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
      </div>
    </div>
  );
}
