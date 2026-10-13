"use client";

import { useEffect, useState } from "react";
import type { ToolProps } from "../../types";
import { BarcodeMainInterface } from "./MainInterface";
import { barcodeUi } from "./copy";
import { createEan13Pdf, normalizeIsbn } from "./code/ean13";

export default function Tool({ language, onDiagnostics }: ToolProps) {
  const [barcodeInput, setBarcodeInput] = useState("");
  const barcodeT = barcodeUi[language];
  let barcodeResult: ReturnType<typeof normalizeIsbn> | null = null;
  let barcodeError = "";
  if (barcodeInput.trim()) {
    try {
      barcodeResult = normalizeIsbn(barcodeInput);
    } catch (error) {
      barcodeError = error instanceof Error ? error.message : "Invalid ISBN.";
    }
  }

  function downloadBarcode() {
    if (!barcodeResult) return;
    const url = URL.createObjectURL(createEan13Pdf(barcodeResult.digits));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `EAN13_${barcodeResult.digits}.pdf`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const hasInput = Boolean(barcodeInput.trim());
  const hasResult = Boolean(barcodeResult);
  const appStatus = barcodeError ? "error" : hasResult ? "completed" : "idle";
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
    <BarcodeMainInterface
      language={language}
      copy={barcodeT}
      input={barcodeInput}
      error={barcodeError}
      result={barcodeResult}
      onInput={setBarcodeInput}
      onDownload={downloadBarcode}
    />
  );
}
