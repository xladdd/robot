"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { ToolProps } from "../../types";
import { IndexCreatorMainInterface, type IndexMatch } from "./MainInterface";
import { indexCreatorCopy } from "./copy";
const INDEX_MATCH_HISTORY_LIMIT = 20;

export default function Tool({ language, active, onDiagnostics }: ToolProps) {
  const [indexFile, setIndexFile] = useState<File | null>(null);
  const [indexPreviewPage, setIndexPreviewPage] = useState(1);
  const [indexPreviewHighlightTerms, setIndexPreviewHighlightTerms] = useState<
    string[]
  >([]);
  const [indexWords, setIndexWords] = useState("");
  const [indexResult, setIndexResult] = useState("");
  const [indexMatches, setIndexMatches] = useState<IndexMatch[]>([]);
  const [indexMatchHistory, setIndexMatchHistory] = useState<IndexMatch[][]>(
    [],
  );
  const [pdfAnchor, setPdfAnchor] = useState(1);
  const [printedAnchor, setPrintedAnchor] = useState(1);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState(0);
  const [indexError, setIndexError] = useState("");
  const [indexCopied, setIndexCopied] = useState(false);
  const indexFileInputRef = useRef<HTMLInputElement>(null);
  const indexCreatorT = indexCreatorCopy[language];
  useEffect(() => {
    if (indexMatches.length)
      setIndexResult(formatIndexOutput(indexMatches, pdfAnchor, printedAnchor));
  }, [indexMatches, pdfAnchor, printedAnchor]);
  function selectIndexFile(file: File) {
    if (file.type !== "application/pdf") {
      setIndexError(indexCreatorT.invalidFile);
      return;
    }
    setIndexFile(file);
    setIndexPreviewPage(1);
    setIndexPreviewHighlightTerms([]);
    setIndexResult("");
    setIndexMatches([]);
    setIndexMatchHistory([]);
    setIndexProgress(0);
    setIndexError("");
  }

  function handleIndexFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) selectIndexFile(file);
    event.target.value = "";
  }

  function handleIndexDrop(event: DragEvent<HTMLButtonElement>) {
    if (!active) return;
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) selectIndexFile(file);
  }

  function previewIndexPage(
    pdfPage: number,
    highlightTerms: readonly string[] = [],
  ) {
    setIndexPreviewPage(pdfPage);
    setIndexPreviewHighlightTerms([...highlightTerms]);
  }

  function toggleIndexPage(word: string, pdfPage: number) {
    const nextMatches = indexMatches.map((match) => {
      if (match.word !== word) return match;
      const accepted = match.pdfPages.includes(pdfPage);
      const pdfPages = accepted
        ? match.pdfPages.filter((page) => page !== pdfPage)
        : [...match.pdfPages, pdfPage].sort((a, b) => a - b);
      const otherPdfPages = match.candidatePages
        .map((candidate) => candidate.pdfPage)
        .filter((page) => page !== pdfPage && !pdfPages.includes(page))
        .sort((a, b) => a - b);
      return { ...match, pdfPages, otherPdfPages };
    });
    setIndexMatchHistory((history) =>
      [...history, indexMatches].slice(-INDEX_MATCH_HISTORY_LIMIT),
    );
    setIndexMatches(nextMatches);
  }

  function undoIndexPageToggle() {
    const previousMatches = indexMatchHistory.at(-1);
    if (!previousMatches) return;
    setIndexMatches(previousMatches);
    setIndexMatchHistory((history) => history.slice(0, -1));
  }

  async function createIndex() {
    const words = [
      ...new Set(
        indexWords
          .split(/\r?\n/)
          .map((word) => word.trim())
          .filter(Boolean),
      ),
    ];
    if (!indexFile || !words.length || isIndexing) return;
    setIsIndexing(true);
    setIndexResult("");
    setIndexMatches([]);
    setIndexMatchHistory([]);
    setIndexPreviewHighlightTerms([]);
    setIndexError("");
    setIndexProgress(1);
    try {
      const indexer =
        await import("./code/pdf-indexer");
      let pages = await indexer.extractPdfPages(indexFile, (done, total) =>
        setIndexProgress(Math.max(2, Math.round((done / total) * 65))),
      );
      const { addLocalOcrText, findLikelyOcrPages } =
        await import("./code/local-ocr");
      const ocrPageNumbers = findLikelyOcrPages(pages);
      if (ocrPageNumbers.length) {
        pages = await addLocalOcrText(
          indexFile,
          pages,
          ocrPageNumbers,
          (done, total) =>
            setIndexProgress(65 + Math.round((done / total) * 6)),
        );
      }
      const anchor = indexer.detectPrintedPageAnchor(pages);
      const detectedPdfAnchor = anchor.pdfPage;
      const detectedPrintedAnchor = anchor.printedPage;
      setPdfAnchor(detectedPdfAnchor);
      setPrintedAnchor(detectedPrintedAnchor);
      setIndexProgress(72);

      const entries: Array<{ word: string; forms: string[] }> = [];
      const batchSize = 12;
      const batches = Array.from(
        { length: Math.ceil(words.length / batchSize) },
        (_, index) => words.slice(index * batchSize, (index + 1) * batchSize),
      );

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const response = await fetch("/api/index/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ words: batches[batchIndex] }),
        });
        const result = (await response.json()) as {
          entries?: Array<{ word: string; forms: string[] }>;
          error?: string;
        };
        if (!response.ok || !result.entries)
          throw new Error(
            result.error || "Could not prepare multilingual word forms.",
          );
        entries.push(...result.entries);
        setIndexProgress(
          72 + Math.round(((batchIndex + 1) / batches.length) * 10),
        );
      }

      const candidates = indexer.findIndexCandidates(pages, entries);
      setIndexProgress(96);
      const matches = words.map((word) => {
        const candidate = candidates.find((item) => item.word === word);
        const candidatePages = candidate?.pages ?? [];
        const pdfPages = candidate?.recommendedPages ?? [];
        const selectedPages = new Set(pdfPages);
        const otherPdfPages = candidatePages
          .map((page) => page.pdfPage)
          .filter((page) => !selectedPages.has(page));
        return { word, pdfPages, otherPdfPages, candidatePages };
      });
      setIndexMatches(matches);
      setIndexResult(
        formatIndexOutput(matches, detectedPdfAnchor, detectedPrintedAnchor),
      );
      setIndexProgress(100);
    } catch (error) {
      setIndexError(
        error instanceof Error ? error.message : "Index creation failed.",
      );
    } finally {
      setIsIndexing(false);
    }
  }

  async function copyIndex() {
    await navigator.clipboard.writeText(indexResult);
    setIndexCopied(true);
    window.setTimeout(() => setIndexCopied(false), 1600);
  }
  function downloadText(text: string, filename: string, type: string) {
    if (!text) return;
    const url = URL.createObjectURL(
      new Blob([text], { type: `${type};charset=utf-8` }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (!active) return;
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type === "application/pdf");
      if (file) {
        event.preventDefault();
        selectIndexFile(file);
        return;
      }
      
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  });
  const hasInput = Boolean(indexFile || indexWords.trim());
  const hasResult = Boolean(indexResult);
  const appStatus = isIndexing ? "running" : indexError ? "error" : hasResult ? "completed" : "idle";
  const fileType = indexFile?.type ?? null;
  const fileSize = indexFile?.size ?? null;
  useEffect(() => {
    onDiagnostics?.({ appStatus, progress: indexProgress, inputSummary: { hasInput, fileType, fileSize, referenceCount: 0, hasResult } });
  }, [onDiagnostics, appStatus, hasInput, hasResult, fileType, fileSize, indexProgress]);

  return (
          <IndexCreatorMainInterface
            language={language}
            inputRef={indexFileInputRef}
            file={indexFile}
            previewPage={indexPreviewPage}
            previewHighlightTerms={indexPreviewHighlightTerms}
            words={indexWords}
            result={indexResult}
            matches={indexMatches}
            pdfAnchor={pdfAnchor}
            printedAnchor={printedAnchor}
            error={indexError}
            copied={indexCopied}
            isIndexing={isIndexing}
            progress={indexProgress}
            canUndo={indexMatchHistory.length > 0}
            onFileInput={handleIndexFileInput}
            onDrop={handleIndexDrop}
            onWords={setIndexWords}
            onCreate={() => void createIndex()}
            onCopy={() => void copyIndex()}
            onDownload={downloadText}
            onPreviewPage={previewIndexPage}
            onTogglePage={toggleIndexPage}
            onUndo={undoIndexPageToggle}
            onPdfAnchor={setPdfAnchor}
            onPrintedAnchor={setPrintedAnchor}
          />
  );
}
function formatPageRanges(pages: number[]) {
  const sorted = [...new Set(pages)].sort((left, right) => left - right);
  const ranges: string[] = [];
  let start: number | null = null;
  let end: number | null = null;

  for (const page of sorted) {
    if (page <= 0) continue;
    if (start === null) {
      start = page;
      end = page;
      continue;
    }
    if (page === (end as number) + 1) {
      end = page;
      continue;
    }
    ranges.push(start === end ? String(start) : `${start}–${end}`);
    start = page;
    end = page;
  }

  if (start !== null && end !== null)
    ranges.push(start === end ? String(start) : `${start}–${end}`);
  return ranges.join(", ");
}

function formatIndexOutput(
  matches: Array<{ word: string; pdfPages: number[] }>,
  pdfAnchor: number,
  printedAnchor: number,
) {
  return matches
    .map(({ word, pdfPages }) => {
      const printedPages = pdfPages
        .map((page) => printedAnchor + page - pdfAnchor)
        .filter((page) => page > 0);
      return `${word}\t${formatPageRanges(printedPages)}`;
    })
    .join("\n");
}
