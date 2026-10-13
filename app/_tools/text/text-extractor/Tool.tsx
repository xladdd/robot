"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { ToolProps } from "../../types";
import { TextExtractorMainInterface } from "./MainInterface";
import { textExtractorCopy } from "./copy";
import type { OcrErrorCode } from "./code/ocr-response";

export default function Tool({ language, active, onDiagnostics }: ToolProps) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<"image" | "pdf" | "text" | null>(
    null,
  );
  const [ocrText, setOcrText] = useState("");
  const [correctionPrompt, setCorrectionPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [extractionError, setExtractionError] = useState("");
  const [extractionErrorCode, setExtractionErrorCode] =
    useState<OcrErrorCode | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractionRequestId = useRef(0);
  const correctionRequestId = useRef(0);
  const textExtractorT = textExtractorCopy[language];
  useEffect(
    () => () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    },
    [sourceUrl],
  );
  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.readAsDataURL(file);
    });
  }
  function resetSourceUrl() {
    setSourceUrl(null);
  }

  function loadPastedText(text: string) {
    extractionRequestId.current += 1;
    correctionRequestId.current += 1;
    resetSourceUrl();
    setSourceFile(null);
    setSourceKind("text");
    setOcrText(text);
    setExtractionError("");
    setExtractionErrorCode(null);
    setIsProcessing(false);
    setIsCorrecting(false);
  }

  async function processFile(file: File) {
    const allowed =
      file.type === "application/pdf" ||
      file.type === "image/png" ||
      file.type === "image/jpeg";
    if (!allowed) {
      setExtractionError(textExtractorT.invalidFile);
      setExtractionErrorCode(null);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setExtractionError(textExtractorT.fileTooLarge);
      setExtractionErrorCode(null);
      return;
    }
    const requestId = extractionRequestId.current + 1;
    extractionRequestId.current = requestId;
    correctionRequestId.current += 1;
    resetSourceUrl();
    setSourceFile(file);
    setSourceUrl(URL.createObjectURL(file));
    setSourceKind(file.type === "application/pdf" ? "pdf" : "image");
    setOcrText("");
    setExtractionError("");
    setExtractionErrorCode(null);
    setIsProcessing(true);
    setIsCorrecting(false);
    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          type: file.type,
          data: await fileToDataUrl(file),
        }),
      });
      const result = (await response.json()) as {
        text?: string;
        error?: string;
        code?: OcrErrorCode;
      };
      if (requestId !== extractionRequestId.current) return;
      if (!response.ok || !result.text) {
        setExtractionError(
          result.code === "provider_rate_limited"
            ? textExtractorT.providerRateLimited
            : result.error || "Text extraction failed.",
        );
        setExtractionErrorCode(result.code ?? null);
        return;
      }
      setOcrText(result.text);
    } catch (error) {
      if (requestId !== extractionRequestId.current) return;
      setExtractionError(
        error instanceof Error ? error.message : "Text extraction failed.",
      );
      setExtractionErrorCode(null);
    } finally {
      if (requestId === extractionRequestId.current) setIsProcessing(false);
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!active) return;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    void processFile(file);
  }

  async function correctText() {
    if (!ocrText.trim() || !correctionPrompt.trim() || isCorrecting) return;
    const requestId = correctionRequestId.current + 1;
    correctionRequestId.current = requestId;
    setIsCorrecting(true);
    setExtractionError("");
    setExtractionErrorCode(null);
    try {
      const response = await fetch("/api/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: ocrText,
          instruction: correctionPrompt,
        }),
      });
      const result = (await response.json()) as {
        text?: string;
        error?: string;
      };
      if (requestId !== correctionRequestId.current) return;
      if (!response.ok || !result.text)
        throw new Error(result.error || "Text correction failed.");
      setOcrText(result.text);
      setCorrectionPrompt("");
    } catch (error) {
      if (requestId !== correctionRequestId.current) return;
      setExtractionError(
        error instanceof Error ? error.message : "Text correction failed.",
      );
    } finally {
      if (requestId === correctionRequestId.current) setIsCorrecting(false);
    }
  }

  async function copyOcrText() {
    await navigator.clipboard.writeText(ocrText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/") || item.type === "application/pdf");
      if (file) {
        event.preventDefault();
        void processFile(file);
        return;
      }
      const text = event.clipboardData?.getData("text/plain").trim(); if (text && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); loadPastedText(text); }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  });
  const hasInput = Boolean(sourceFile || ocrText.trim());
  const hasResult = Boolean(ocrText);
  const appStatus = isProcessing || isCorrecting ? "running" : extractionError ? "error" : hasResult ? "completed" : "idle";
  const fileType = sourceFile?.type ?? null;
  const fileSize = sourceFile?.size ?? null;
  useEffect(() => {
    onDiagnostics?.({ appStatus, progress: null, inputSummary: { hasInput, fileType, fileSize, referenceCount: 0, hasResult } });
  }, [onDiagnostics, appStatus, hasInput, hasResult, fileType, fileSize]);

  return (
          <TextExtractorMainInterface
            language={language}
            inputRef={fileInputRef}
            sourceKind={sourceKind}
            sourceFile={sourceFile}
            sourceUrl={sourceUrl}
            text={ocrText}
            correction={correctionPrompt}
            error={extractionError}
            copied={copied}
            isProcessing={isProcessing}
            isCorrecting={isCorrecting}
            canRetry={
              extractionErrorCode === "provider_rate_limited" && !!sourceFile
            }
            onFileInput={handleFileInput}
            onDrop={handleDrop}
            onRetry={() => {
              if (sourceFile) void processFile(sourceFile);
            }}
            onCopy={() => void copyOcrText()}
            onDownload={downloadText}
            onText={setOcrText}
            onCorrection={setCorrectionPrompt}
            onCorrect={() => void correctText()}
          />
  );
}
