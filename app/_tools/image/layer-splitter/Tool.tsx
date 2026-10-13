"use client";

import { useEffect, useRef, useState } from "react";
import type { ToolProps } from "../../types";
import { LayerSplitterMainInterface } from "./MainInterface";
import { layerSplitterUi } from "./copy";
import type { LayerSplitterQuality, LayerSplitterResult } from "./types";

export default function Tool({ language, active, onDiagnostics }: ToolProps) {
  const [layerSplitterImage, setLayerSplitterImage] = useState<string | null>(
    null,
  );
  const [layerSplitterImageName, setLayerSplitterImageName] = useState("");
  const [layerSplitterQuality, setLayerSplitterQuality] =
    useState<LayerSplitterQuality>("fidelity");
  const [layerSplitterResult, setLayerSplitterResult] =
    useState<LayerSplitterResult | null>(null);
  const [layerSplitterError, setLayerSplitterError] = useState("");
  const [isSplittingLayers, setIsSplittingLayers] = useState(false);
  const layerSplitterInputRef = useRef<HTMLInputElement>(null);
  const [fileMetadata, setFileMetadata] = useState<{ type: string; size: number } | null>(null);
  const layerSplitterT = layerSplitterUi[language];

  useEffect(() => {
    onDiagnostics?.({
      appStatus: isSplittingLayers ? "running" : layerSplitterError ? "error" : layerSplitterResult ? "completed" : "idle",
      progress: null,
      inputSummary: { hasInput: Boolean(layerSplitterImage), fileType: fileMetadata?.type ?? null, fileSize: fileMetadata?.size ?? null, referenceCount: 0, hasResult: Boolean(layerSplitterResult) },
    });
  }, [onDiagnostics, isSplittingLayers, layerSplitterError, layerSplitterResult, layerSplitterImage, fileMetadata]);

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.readAsDataURL(file);
    });
  }
  async function selectLayerSplitterFile(file: File) {
    if (!active || isSplittingLayers) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLayerSplitterError(layerSplitterT.error);
      return;
    }
    if (file.size > 18_000_000) {
      setLayerSplitterError(
        language === "cs"
          ? "Obrázek je příliš velký (maximum je 18 MB)."
          : "The image is too large (the maximum is 18 MB).",
      );
      return;
    }
    try {
      setLayerSplitterImage(await fileToDataUrl(file));
      setLayerSplitterImageName(file.name);
      setFileMetadata({ type: file.type, size: file.size });
      setLayerSplitterResult(null);
      setLayerSplitterError("");
    } catch (error) {
      setLayerSplitterError(
        error instanceof Error ? error.message : layerSplitterT.error,
      );
    }
  }

  function removeLayerSplitterImage() {
    setFileMetadata(null);
    setLayerSplitterImage(null);
    setLayerSplitterImageName("");
    setLayerSplitterResult(null);
    setLayerSplitterError("");
  }

  async function splitLayerSplitterImage() {
    if (!layerSplitterImage || isSplittingLayers) return;
    setIsSplittingLayers(true);
    setLayerSplitterResult(null);
    setLayerSplitterError("");
    try {
      const response = await fetch("/api/layers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: layerSplitterImage,
          quality: layerSplitterQuality,
        }),
      });
      const result = (await response.json()) as LayerSplitterResult & {
        error?: string;
      };
      if (!response.ok || !result.psdBase64)
        throw new Error(result.error || layerSplitterT.error);
      setLayerSplitterResult(result);
    } catch (error) {
      setLayerSplitterError(
        error instanceof Error ? error.message : layerSplitterT.error,
      );
    } finally {
      setIsSplittingLayers(false);
    }
  }

  function downloadLayerSplitterPsd() {
    if (!layerSplitterResult) return;
    const bytes = Uint8Array.from(
      atob(layerSplitterResult.psdBase64),
      (character) => character.charCodeAt(0),
    );
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "image/vnd.adobe.photoshop" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = layerSplitterResult.filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
          <LayerSplitterMainInterface
            language={language}
            inputRef={layerSplitterInputRef}
            imageData={layerSplitterImage}
            imageName={layerSplitterImageName}
            quality={layerSplitterQuality}
            result={layerSplitterResult}
            error={layerSplitterError}
            isSplitting={isSplittingLayers}
            onFile={(file) => void selectLayerSplitterFile(file)}
            onRemove={removeLayerSplitterImage}
            onQuality={setLayerSplitterQuality}
            onSplit={() => void splitLayerSplitterImage()}
            onDownload={downloadLayerSplitterPsd}
          />
  );
}
