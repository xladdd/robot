"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ToolProps } from "../../types";
import { GraphMainInterface, type GraphOutput } from "./MainInterface";
import { parseAse, type AseSwatch } from "./code/ase";
import { graphUi } from "./copy";

export default function Tool({
  language,
  active,
  section,
  label,
  onDiagnostics,
}: ToolProps) {
  const [prompt, setPrompt] = useState("");
  const [data, setData] = useState("");
  const [palette, setPalette] = useState<AseSwatch[]>([]);
  const [paletteName, setPaletteName] = useState("");
  const [showValueLabels, setShowValueLabels] = useState(true);
  const [output, setOutput] = useState<GraphOutput | null>(null);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const hasInput = Boolean(prompt.trim() || data.trim());
  const hasResult = Boolean(output);

  useEffect(() => {
    if (!active) return;
    onDiagnostics?.({
      appStatus: isGenerating
        ? "running"
        : error
          ? "error"
          : hasResult
            ? "completed"
            : "idle",
      progress: null,
      inputSummary: {
        hasInput,
        fileType: null,
        fileSize: null,
        referenceCount: 0,
        hasResult,
      },
    });
  }, [active, onDiagnostics, isGenerating, error, hasInput, hasResult]);

  async function generate() {
    if (pending.current || !prompt.trim() || !data.trim()) return;
    pending.current = true;
    setIsGenerating(true);
    setError("");
    setOutput(null);
    try {
      const response = await fetch("/api/graphs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: `${prompt.trim()}\n\nDATA:\n${data.trim()}`,
          language,
          showValueLabels,
          palette,
        }),
      });
      const result = (await response.json()) as GraphOutput & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Figure generation failed.");
      setOutput(result);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Figure generation failed.",
      );
    } finally {
      pending.current = false;
      setIsGenerating(false);
    }
  }

  async function addPalette(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (
      !file ||
      !file.name.toLowerCase().endsWith(".ase") ||
      file.size > 2_000_000
    ) {
      setError(graphUi[language].paletteFileError);
      return;
    }
    try {
      setPalette(parseAse(await file.arrayBuffer()));
      setPaletteName(file.name);
      setError("");
      setOutput(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : graphUi[language].paletteReadError,
      );
    }
  }

  function download(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <GraphMainInterface
      language={language}
      section={section}
      label={label}
      prompt={prompt}
      data={data}
      palette={palette}
      paletteName={paletteName}
      showValueLabels={showValueLabels}
      output={output}
      error={error}
      isGenerating={isGenerating}
      paletteInputRef={paletteInputRef}
      onPaletteInput={addPalette}
      onClearPalette={() => {
        setPalette([]);
        setPaletteName("");
        setOutput(null);
      }}
      onShowValueLabels={setShowValueLabels}
      onPrompt={setPrompt}
      onData={setData}
      onGenerate={generate}
      onDownload={download}
    />
  );
}
