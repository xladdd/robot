"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { ToolProps } from "../../types";
import { PromptExtractorMainInterface } from "./MainInterface";
import { promptExtractorCopy } from "./copy";
import { formatPromptOutput, type IllustrationPrompt } from "./code/output";

export default function Tool({ language, active, onDiagnostics }: ToolProps) {
  const [promptFile, setPromptFile] = useState<File | null>(null);
  const [promptUrl, setPromptUrl] = useState<string | null>(null);
  const [promptResult, setPromptResult] = useState("");
  const [isExtractingPrompts, setIsExtractingPrompts] = useState(false);
  const [promptError, setPromptError] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const promptFileInputRef = useRef<HTMLInputElement>(null);
  const promptExtractorT = promptExtractorCopy[language];
  useEffect(
    () => () => {
      if (promptUrl) URL.revokeObjectURL(promptUrl);
    },
    [promptUrl],
  );
  async function extractPrompts(file: File) {
    if (file.type !== "application/pdf") {
      setPromptError(promptExtractorT.invalidFile);
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setPromptError(promptExtractorT.fileTooLarge);
      return;
    }
    setPromptFile(file);
    setPromptUrl(URL.createObjectURL(file));
    setPromptResult("");
    setPromptError("");
    setIsExtractingPrompts(true);
    try {
      const renderer =
        await import("./code/pdf-images");
      const pages = await renderer.renderPdfPages(file);
      const illustrations: IllustrationPrompt[] = [];
      const batchSize = 1;
      const batches = Array.from(
        { length: Math.ceil(pages.length / batchSize) },
        (_, index) => pages.slice(index * batchSize, (index + 1) * batchSize),
      );
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const response = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pages: batches[batchIndex] }),
        });
        const result = (await response.json()) as {
          illustrations?: IllustrationPrompt[];
          error?: string;
        };
        if (!response.ok || !Array.isArray(result.illustrations))
          throw new Error(result.error || "Prompt extraction failed.");
        illustrations.push(...result.illustrations);
      }
      setPromptResult(formatPromptOutput(illustrations));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Prompt extraction failed.";
      setPromptError(
        message === "PDF_PAGE_LIMIT"
          ? "The PDF has more than 20 pages."
          : message,
      );
    } finally {
      setIsExtractingPrompts(false);
    }
  }

  function handlePromptFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void extractPrompts(file);
    event.target.value = "";
  }

  function handlePromptDrop(event: DragEvent<HTMLButtonElement>) {
    if (!active) return;
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void extractPrompts(file);
  }

  async function copyPrompts() {
    await navigator.clipboard.writeText(promptResult);
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1600);
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
        void extractPrompts(file);
        return;
      }
      
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  });
  const hasInput = Boolean(promptFile);
  const hasResult = Boolean(promptResult);
  const appStatus = isExtractingPrompts ? "running" : promptError ? "error" : hasResult ? "completed" : "idle";
  const fileType = promptFile?.type ?? null;
  const fileSize = promptFile?.size ?? null;
  useEffect(() => {
    onDiagnostics?.({ appStatus, progress: null, inputSummary: { hasInput, fileType, fileSize, referenceCount: 0, hasResult } });
  }, [onDiagnostics, appStatus, hasInput, hasResult, fileType, fileSize]);

  return (
          <PromptExtractorMainInterface
            language={language}
            inputRef={promptFileInputRef}
            file={promptFile}
            url={promptUrl}
            result={promptResult}
            error={promptError}
            copied={promptCopied}
            isExtracting={isExtractingPrompts}
            onFileInput={handlePromptFileInput}
            onDrop={handlePromptDrop}
            onCopy={() => void copyPrompts()}
            onDownload={downloadText}
            onResult={setPromptResult}
          />
  );
}
