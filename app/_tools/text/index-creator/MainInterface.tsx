"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from "react";

import {
  CrosshairInstruction,
  ProcessingBadge,
} from "../../../_components/ToolChrome";
import type { Language } from "../../registry";
import type { CandidateMatchKind, CandidateReason } from "./code/pdf-indexer";
import { indexCreatorCopy } from "./copy";
import { IndexPdfPreview } from "./PdfPreview";

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
  previewPage,
  previewHighlightTerms,
  words,
  result,
  matches,
  pdfAnchor,
  printedAnchor,
  error,
  copied,
  isIndexing,
  progress,
  canUndo,
  onFileInput,
  onDrop,
  onWords,
  onCreate,
  onCopy,
  onDownload,
  onPreviewPage,
  onTogglePage,
  onUndo,
  onPdfAnchor,
  onPrintedAnchor,
}: {
  language: Language;
  inputRef: RefObject<HTMLInputElement | null>;
  file: File | null;
  previewPage: number;
  previewHighlightTerms: readonly string[];
  words: string;
  result: string;
  matches: IndexMatch[];
  pdfAnchor: number;
  printedAnchor: number;
  error: string;
  copied: boolean;
  isIndexing: boolean;
  progress: number;
  canUndo: boolean;
  onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onWords: (words: string) => void;
  onCreate: () => void;
  onCopy: () => void;
  onDownload: (text: string, filename: string, type: string) => void;
  onPreviewPage: (page: number, highlightTerms?: readonly string[]) => void;
  onTogglePage: (word: string, page: number) => void;
  onUndo: () => void;
  onPdfAnchor: (page: number) => void;
  onPrintedAnchor: (page: number) => void;
}) {
  const t = indexCreatorCopy[language];
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageInput, setPageInput] = useState(String(previewPage));

  useEffect(() => {
    setPageInput(String(previewPage));
  }, [previewPage]);

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
              {file && (
                <IndexPdfPreview
                  file={file}
                  pageNumber={previewPage}
                  highlightTerms={previewHighlightTerms}
                  label={`${file.name || t.source} · ${t.pdfPage} ${previewPage}`}
                  errorLabel={t.previewError}
                  highlightedMatchLabel={t.highlightedMatch}
                  onPageCount={setPageCount}
                />
              )}
            </div>
          </section>
          <div
            className={`index-side-column${progress === 0 ? " index-awaiting-generation" : ""}`}
          >
            <div className="index-active-head document-active-head document-app-head">
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
                className="index-run action-button action-button-primary"
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
                  className="download-button index-download-button action-button action-button-compact"
                  onClick={() =>
                    onDownload(result, "index.md", "text/markdown")
                  }
                  disabled={!result}
                >
                  MD
                </button>
                <button
                  className="download-button index-download-button action-button action-button-compact"
                  onClick={() => onDownload(result, "index.txt", "text/plain")}
                  disabled={!result}
                >
                  TXT
                </button>
              </div>
              {matches.length > 0 && (
                <button
                  type="button"
                  className="index-undo-button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  aria-label={t.undo}
                  title={t.undo}
                >
                  <span aria-hidden="true">↺</span>
                  <b>{t.undo}</b>
                </button>
              )}
              {isIndexing ? (
                <div className="measured-progress" role="status">
                  {t.createIndex} · {progress}%
                </div>
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
                      const highlightTermsFor = (pdfPage: number) =>
                        candidateByPage.get(pdfPage)?.matchedForms ?? [];
                      return (
                        <div className="index-result-line" key={word}>
                          <span className="index-result-term">{word}</span>
                          <span className="index-result-pages index-result-accepted">
                            {pdfPages.length ? (
                              pdfPages.map((pdfPage) => (
                                <span
                                  className="index-page-control"
                                  key={pdfPage}
                                >
                                  <button
                                    type="button"
                                    className="index-page-link"
                                    onClick={() =>
                                      onPreviewPage(
                                        pdfPage,
                                        highlightTermsFor(pdfPage),
                                      )
                                    }
                                    title={titleFor(pdfPage)}
                                  >
                                    {pageLabel(pdfPage)}
                                  </button>
                                  <button
                                    type="button"
                                    className="index-page-toggle"
                                    onClick={() => onTogglePage(word, pdfPage)}
                                    aria-label={`${t.demotePage}: ${word}, ${pageLabel(pdfPage)}`}
                                    title={t.demotePage}
                                  >
                                    ✕
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
                                  className="index-page-control index-page-control-possible"
                                  key={pdfPage}
                                >
                                  <button
                                    type="button"
                                    className="index-page-link index-page-possible"
                                    onClick={() =>
                                      onPreviewPage(
                                        pdfPage,
                                        highlightTermsFor(pdfPage),
                                      )
                                    }
                                    title={titleFor(pdfPage)}
                                  >
                                    {pageLabel(pdfPage)}
                                  </button>
                                  <button
                                    type="button"
                                    className="index-page-toggle index-page-accept"
                                    onClick={() => onTogglePage(word, pdfPage)}
                                    aria-label={`${t.acceptPage}: ${word}, ${pageLabel(pdfPage)}`}
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
