"use client";

import { useEffect, useState } from "react";
import type { ToolProps } from "../../types";
import { GrepMainInterface } from "./MainInterface";

export default function Tool({ language, onDiagnostics }: ToolProps) {
  const [grepFindPrompt, setGrepFindPrompt] = useState("");
  const [grepReplacePrompt, setGrepReplacePrompt] = useState("");
  const [grepResult, setGrepResult] = useState<{
    findWhat: string;
    replaceWith: string;
    warning?: string;
  } | null>(null);
  const [isGeneratingGrep, setIsGeneratingGrep] = useState(false);
  const [grepError, setGrepError] = useState("");
  const [grepCopied, setGrepCopied] = useState<"find" | "replace" | null>(null);
  async function generateGrep() {
    if (!grepFindPrompt.trim() || !grepReplacePrompt.trim() || isGeneratingGrep)
      return;
    setIsGeneratingGrep(true);
    setGrepError("");
    try {
      const response = await fetch("/api/grep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          find: grepFindPrompt,
          replace: grepReplacePrompt,
        }),
      });
      const result = (await response.json()) as {
        findWhat?: string;
        replaceWith?: string;
        warning?: string;
        error?: string;
      };
      if (
        !response.ok ||
        typeof result.findWhat !== "string" ||
        typeof result.replaceWith !== "string"
      )
        throw new Error(result.error || "Could not generate GREP code.");
      setGrepResult({
        findWhat: result.findWhat,
        replaceWith: result.replaceWith,
        warning: result.warning,
      });
    } catch (error) {
      setGrepError(
        error instanceof Error
          ? error.message
          : "Could not generate GREP code.",
      );
    } finally {
      setIsGeneratingGrep(false);
    }
  }

  async function copyGrep(value: string, field: "find" | "replace") {
    await navigator.clipboard.writeText(value);
    setGrepCopied(field);
    window.setTimeout(() => setGrepCopied(null), 1600);
  }
  const hasInput = Boolean(grepFindPrompt.trim() || grepReplacePrompt.trim());
  const hasResult = Boolean(grepResult);
  const appStatus = isGeneratingGrep
    ? "running"
    : grepError
      ? "error"
      : hasResult
        ? "completed"
        : "idle";
  const fileType = null;
  const fileSize = null;
  useEffect(() => {
    onDiagnostics?.({
      appStatus,
      progress: null,
      inputSummary: {
        hasInput,
        fileType,
        fileSize,
        referenceCount: 0,
        hasResult,
      },
    });
  }, [onDiagnostics, appStatus, hasInput, hasResult, fileType, fileSize]);

  return (
    <GrepMainInterface
      language={language}
      findPrompt={grepFindPrompt}
      replacePrompt={grepReplacePrompt}
      result={grepResult}
      error={grepError}
      copied={grepCopied}
      isGenerating={isGeneratingGrep}
      onFindPrompt={setGrepFindPrompt}
      onReplacePrompt={setGrepReplacePrompt}
      onCopy={(value, field) => void copyGrep(value, field)}
      onGenerate={() => void generateGrep()}
      onReset={() => setGrepResult(null)}
    />
  );
}
