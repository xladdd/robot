"use client";

import Image from "next/image";
import { EmptyViewportState, ToolMeta } from "../../../_components/ToolChrome";
import type { ChangeEvent, DragEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { Language } from "../../registry";
import {
  renderFirstPdfPage,
  renderSplitPdfPanel,
  type CoverRasterFormat,
  type PdfFirstPagePreview,
} from "./code/pdf-preview";
import { coverSplitterCopy } from "./copy";

export type CoverSizeChoice = "A5" | "A4" | "B5" | "half";

type CoverSplitterMainInterfaceProps = {
  language: Language;
  section: string | null;
};

type CoverFileEntry = {
  id: string;
  file: File;
  previewUrl: string;
  widthPoints: number;
  heightPoints: number;
  sizeChoice: CoverSizeChoice;
};

type OutputFile = {
  name: string;
  buffer: ArrayBuffer;
};

type ZipResult = {
  buffer: ArrayBuffer;
  filename: string;
  url: string;
  pdfFiles: OutputFile[];
};

type WorkerFile = {
  name: string;
  buffer: ArrayBuffer;
  size: CoverSizeChoice;
};

type ExportFormat = CoverRasterFormat | "pdf";

type WorkerLogMessage = {
  type: "log";
  message?: string;
  progress?: number;
  fileName?: string;
};

type WorkerResultMessage = {
  type: "result";
  buffer?: ArrayBuffer;
  filename?: string;
  files?: Array<{ name?: string; buffer?: ArrayBuffer }>;
};

type WorkerRequest =
  | {
      action: "split";
      files: WorkerFile[];
      includeInside: boolean;
    }
  | {
      action: "package";
      files: OutputFile[];
    };

type WorkerErrorMessage = {
  type: "error";
  message?: string;
};

type CoverWorkerMessage =
  WorkerLogMessage | WorkerResultMessage | WorkerErrorMessage;

type PreviewOutcome =
  | {
      file: File;
      preview: PdfFirstPagePreview;
    }
  | {
      file: File;
      error: true;
    };

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const POINTS_PER_MM = 72 / 25.4;
const SIZE_HEIGHTS_MM: ReadonlyArray<{
  choice: Exclude<CoverSizeChoice, "half">;
  height: number;
}> = [
  { choice: "A5", height: 210 },
  { choice: "B5", height: 250 },
  { choice: "A4", height: 297 },
];
const HEIGHT_TOLERANCE_MM = 3;

function normalizedOutputStem(file: File): string {
  return file.name
    .normalize("NFKC")
    .trim()
    .replace(/\.pdf$/i, "")
    .toLocaleLowerCase();
}

async function hasPdfHeader(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d];

  for (let offset = 0; offset <= bytes.length - signature.length; offset += 1) {
    if (signature.every((byte, index) => bytes[offset + index] === byte)) {
      return true;
    }
  }
  return false;
}

function inferSizeChoice(heightPoints: number): CoverSizeChoice {
  const heightMillimetres = heightPoints / POINTS_PER_MM;
  let closest: (typeof SIZE_HEIGHTS_MM)[number] | null = null;
  let closestDifference = Number.POSITIVE_INFINITY;

  for (const standard of SIZE_HEIGHTS_MM) {
    const difference = Math.abs(heightMillimetres - standard.height);
    if (difference < closestDifference) {
      closest = standard;
      closestDifference = difference;
    }
  }

  return closest && closestDifference <= HEIGHT_TOLERANCE_MM
    ? closest.choice
    : "half";
}

function formatFileSize(bytes: number, language: Language): string {
  const locale = language === "cs" ? "cs-CZ" : "en-GB";
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    }).format(megabytes)} MB`;
  }

  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(bytes / 1024)} KB`;
}

function formatDimensions(
  widthPoints: number,
  heightPoints: number,
  language: Language,
): string {
  const locale = language === "cs" ? "cs-CZ" : "en-GB";
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return `${formatter.format(widthPoints / POINTS_PER_MM)} × ${formatter.format(
    heightPoints / POINTS_PER_MM,
  )} mm`;
}

function releaseObjectUrl(url: string, registry: Set<string>): void {
  URL.revokeObjectURL(url);
  registry.delete(url);
}

export function CoverSplitterMainInterface({
  language,
  section,
}: CoverSplitterMainInterfaceProps) {
  const t = coverSplitterCopy[language];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef<boolean>(true);
  const resultRef = useRef<ZipResult | null>(null);
  const [files, setFiles] = useState<CoverFileEntry[]>([]);
  const [error, setError] = useState<string>("");
  const [isPreparing, setIsPreparing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [result, setResult] = useState<ZipResult | null>(null);
  const [includeInside, setIncludeInside] = useState<boolean>(false);
  const [rasterFiles, setRasterFiles] = useState<
    Partial<Record<CoverRasterFormat, OutputFile[]>>
  >({});
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(
    null,
  );
  const [consoleLines, setConsoleLines] = useState<string[]>([]);

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
      for (const url of objectUrls) URL.revokeObjectURL(url);
      objectUrls.clear();
      resultRef.current = null;
    };
  }, []);

  function replaceResult(nextResult: ZipResult | null): void {
    const current = resultRef.current;
    if (current) releaseObjectUrl(current.url, objectUrlsRef.current);
    resultRef.current = nextResult;
    setResult(nextResult);
  }

  function appendConsole(message: string): void {
    setConsoleLines((current) =>
      current.at(-1) === message ? current : [...current, message].slice(-10),
    );
  }

  function resetGeneratedResult(): void {
    replaceResult(null);
    setRasterFiles({});
    setProgress(0);
    setConsoleLines([]);
  }

  async function addFiles(selectedFiles: File[]): Promise<void> {
    if (
      selectedFiles.length === 0 ||
      isPreparing ||
      isProcessing ||
      exportingFormat
    )
      return;

    setIsPreparing(true);
    setError("");
    const notices: string[] = [];
    const accepted: File[] = [];
    const reservedStems = new Set(files.map((entry) => entry.id));

    try {
      for (const file of selectedFiles) {
        if (file.size > MAX_FILE_BYTES) {
          notices.push(t.fileTooLarge(file.name));
          continue;
        }

        const id = normalizedOutputStem(file);
        if (!id || reservedStems.has(id)) {
          notices.push(t.duplicateFile(file.name));
          continue;
        }

        let isPdf = false;
        try {
          isPdf = await hasPdfHeader(file);
        } catch {
          isPdf = false;
        }
        if (!isPdf) {
          notices.push(t.invalidFile(file.name));
          continue;
        }

        reservedStems.add(id);
        accepted.push(file);
      }

      const outcomes = await Promise.all(
        accepted.map(async (file): Promise<PreviewOutcome> => {
          try {
            return { file, preview: await renderFirstPdfPage(file) };
          } catch {
            return { file, error: true };
          }
        }),
      );

      if (!mountedRef.current) return;

      const additions: CoverFileEntry[] = [];
      for (const outcome of outcomes) {
        if ("error" in outcome) {
          notices.push(t.previewFailed(outcome.file.name));
          continue;
        }

        const previewUrl = URL.createObjectURL(outcome.preview.blob);
        objectUrlsRef.current.add(previewUrl);
        additions.push({
          id: normalizedOutputStem(outcome.file),
          file: outcome.file,
          previewUrl,
          widthPoints: outcome.preview.widthPoints,
          heightPoints: outcome.preview.heightPoints,
          sizeChoice: inferSizeChoice(outcome.preview.heightPoints),
        });
      }

      if (additions.length > 0) {
        resetGeneratedResult();
        setFiles((current) => [...current, ...additions]);
      }
      setError(notices.join(" "));
    } finally {
      if (mountedRef.current) setIsPreparing(false);
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>): void {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    void addFiles(selectedFiles);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>): void {
    event.preventDefault();
    void addFiles(Array.from(event.dataTransfer.files));
  }

  function removeFile(entry: CoverFileEntry): void {
    if (isProcessing || isPreparing || exportingFormat) return;
    releaseObjectUrl(entry.previewUrl, objectUrlsRef.current);
    resetGeneratedResult();
    setFiles((current) => current.filter((file) => file.id !== entry.id));
    setError("");
  }

  function updateSize(id: string, sizeChoice: CoverSizeChoice): void {
    if (isProcessing || exportingFormat) return;
    resetGeneratedResult();
    setFiles((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, sizeChoice } : entry,
      ),
    );
  }

  function localizedProgressMessage(
    nextProgress: number,
    fileName?: string,
  ): string {
    if (nextProgress < 8) return t.loadingRuntime;
    if (nextProgress < 20) return t.loadingPdfTools;
    if (nextProgress < 30) return t.preparingFiles;
    if (nextProgress < 35) return t.loadingSplitter;
    if (nextProgress < 90) return t.splittingFile(fileName ?? "");
    if (nextProgress < 100) return t.packaging;
    return t.ready;
  }

  function localizedWorkerError(message: string): string {
    if (message.includes("requires at least")) return t.sizeDoesNotFit;
    if (message.includes("does not contain any PDF pages")) return t.emptyPdf;
    if (message.includes("does not contain a second inside-cover page"))
      return t.missingInsidePage;
    if (message.includes("page 2 dimensions do not match page 1"))
      return t.insideSizeMismatch;
    if (message === "WORKER_FAILED") return t.workerFailed;
    return t.splitFailed;
  }

  function getWorker(): Worker {
    if (!workerRef.current) {
      workerRef.current = new Worker("/cover-splitter/pyodide-worker.js");
    }
    return workerRef.current;
  }

  function runWorker(
    request: WorkerRequest,
    transfer: Transferable[] = [],
  ): Promise<WorkerResultMessage> {
    return new Promise<WorkerResultMessage>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = getWorker();
      } catch {
        reject(new Error("WORKER_FAILED"));
        return;
      }

      worker.onmessage = (event: MessageEvent<CoverWorkerMessage>) => {
        const message = event.data;
        if (message.type === "log") {
          if (typeof message.progress === "number") {
            const nextProgress = Math.max(
              0,
              Math.min(100, Math.round(message.progress)),
            );
            setProgress(nextProgress);
            const localizedMessage = localizedProgressMessage(
              nextProgress,
              message.fileName,
            );
            appendConsole(localizedMessage);
          }
          return;
        }

        if (message.type === "result") {
          if (message.buffer instanceof ArrayBuffer) resolve(message);
          else reject(new Error("INVALID_WORKER_RESULT"));
          return;
        }

        reject(new Error(message.message || "INVALID_WORKER_RESULT"));
      };

      worker.onerror = (event: ErrorEvent) => {
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        reject(new Error(event.message || "WORKER_FAILED"));
      };

      worker.postMessage(request, transfer);
    });
  }

  function outputFilesFromResponse(
    response: WorkerResultMessage,
  ): OutputFile[] {
    if (!Array.isArray(response.files))
      throw new Error("INVALID_WORKER_RESULT");
    const files = response.files.filter(
      (file): file is { name: string; buffer: ArrayBuffer } =>
        typeof file.name === "string" && file.buffer instanceof ArrayBuffer,
    );
    if (files.length !== response.files.length || files.length === 0) {
      throw new Error("INVALID_WORKER_RESULT");
    }
    return files;
  }

  function createResultUrl(buffer: ArrayBuffer): string {
    const url = URL.createObjectURL(
      new Blob([buffer], { type: "application/zip" }),
    );
    objectUrlsRef.current.add(url);
    return url;
  }

  async function splitCovers(): Promise<void> {
    if (files.length === 0 || isPreparing || isProcessing || exportingFormat)
      return;

    setIsProcessing(true);
    setError("");
    replaceResult(null);
    setRasterFiles({});
    setProgress(1);
    setConsoleLines([t.consoleStarting]);

    try {
      const workerFiles = await Promise.all(
        files.map(async (entry): Promise<WorkerFile> => ({
          name: entry.file.name,
          buffer: await entry.file.arrayBuffer(),
          size: entry.sizeChoice,
        })),
      );
      if (!mountedRef.current) return;

      const response = await runWorker(
        { action: "split", files: workerFiles, includeInside },
        workerFiles.map((file) => file.buffer),
      );
      if (!mountedRef.current || !(response.buffer instanceof ArrayBuffer))
        return;

      replaceResult({
        buffer: response.buffer,
        filename: response.filename || "cover-splits.zip",
        url: createResultUrl(response.buffer),
        pdfFiles: outputFilesFromResponse(response),
      });
      setProgress(100);
      appendConsole(t.ready);
    } catch (problem) {
      const message = problem instanceof Error ? problem.message : "";
      const localizedError = localizedWorkerError(message);
      setError(localizedError);
      appendConsole(localizedError);
      setProgress(0);
    } finally {
      if (mountedRef.current) setIsProcessing(false);
    }
  }

  function downloadResult(): void {
    if (!result) return;
    const link = document.createElement("a");
    link.href = result.url;
    link.download = result.filename;
    link.click();
  }

  function downloadArchive(buffer: ArrayBuffer, filename: string): void {
    const url = URL.createObjectURL(
      new Blob([buffer], { type: "application/zip" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async function downloadFormatArchive(
    format: string,
    filesToDownload: OutputFile[],
  ): Promise<void> {
    appendConsole(t.packagingFormat(format));
    const response = await runWorker({
      action: "package",
      files: filesToDownload,
    });
    if (!mountedRef.current || !(response.buffer instanceof ArrayBuffer))
      return;
    downloadArchive(
      response.buffer,
      `cover-splits-${format.toLowerCase()}.zip`,
    );
    appendConsole(t.formatArchiveReady(format));
  }

  async function downloadPdfFiles(): Promise<void> {
    if (!result || exportingFormat) return;

    setExportingFormat("pdf");
    setError("");
    try {
      await downloadFormatArchive("PDF", result.pdfFiles);
    } catch (problem) {
      const detail =
        problem instanceof Error && problem.message
          ? problem.message
          : "UNKNOWN_EXPORT_ERROR";
      setError(t.exportFailed("PDF"));
      appendConsole(t.exportFailed("PDF"));
      appendConsole(t.exportFailureDetail(detail));
    } finally {
      if (mountedRef.current) setExportingFormat(null);
    }
  }

  async function exportRasterFiles(format: CoverRasterFormat): Promise<void> {
    if (!result || exportingFormat) return;

    setExportingFormat(format);
    setError("");
    const formatLabel = format.toUpperCase();
    const existingFiles = rasterFiles[format];

    try {
      if (existingFiles) {
        await downloadFormatArchive(formatLabel, existingFiles);
        return;
      }

      setProgress(0);
      appendConsole(t.exportStarting(formatLabel, result.pdfFiles.length));
      const generatedFiles: OutputFile[] = [];
      for (const [index, pdfFile] of result.pdfFiles.entries()) {
        appendConsole(
          t.renderingFile(
            formatLabel,
            index + 1,
            result.pdfFiles.length,
            pdfFile.name,
          ),
        );
        setProgress(Math.round((index / result.pdfFiles.length) * 80));
        const blob = await renderSplitPdfPanel(pdfFile.buffer, format);
        generatedFiles.push({
          name: pdfFile.name.replace(/\.pdf$/i, `.${format}`),
          buffer: await blob.arrayBuffer(),
        });
      }

      const nextRasterFiles = { ...rasterFiles, [format]: generatedFiles };
      appendConsole(t.updatingArchive);
      setProgress(84);
      const archiveFiles = [
        ...result.pdfFiles,
        ...Object.values(nextRasterFiles).flatMap(
          (filesForFormat) => filesForFormat ?? [],
        ),
      ];
      const response = await runWorker({
        action: "package",
        files: archiveFiles,
      });
      if (!mountedRef.current || !(response.buffer instanceof ArrayBuffer))
        return;

      replaceResult({
        ...result,
        buffer: response.buffer,
        filename: response.filename || result.filename,
        url: createResultUrl(response.buffer),
      });
      setRasterFiles(nextRasterFiles);
      setProgress(100);
      await downloadFormatArchive(formatLabel, generatedFiles);
      appendConsole(t.exportReady(formatLabel));
    } catch (problem) {
      const exportError = t.exportFailed(formatLabel);
      const detail =
        problem instanceof Error && problem.message
          ? problem.message
          : "UNKNOWN_EXPORT_ERROR";
      setError(exportError);
      appendConsole(exportError);
      appendConsole(t.exportFailureDetail(detail));
      setProgress(0);
    } finally {
      if (mountedRef.current) setExportingFormat(null);
    }
  }

  const hasFiles = files.length > 0;
  const uploadDisabled =
    isPreparing || isProcessing || exportingFormat !== null;

  return (
    <div className="cover-splitter-module has-files">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={handleFileInput}
        hidden
      />

      <main className="cover-splitter-workbench">
        <aside
          className="cover-splitter-controls editor-sidebar"
          aria-label={t.controls}
        >
          <button
            type="button"
            className="start-button action-button upload-button cover-splitter-add"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            disabled={uploadDisabled}
          >
            <span>{hasFiles ? t.addMore : t.upload}</span>
            <b aria-hidden="true">＋</b>
          </button>

          {isPreparing && (
            <p className="cover-splitter-preparing" role="status">
              {t.preparingPreviews}
            </p>
          )}

          <div className="cover-splitter-inside-option">
            <label>
              <input
                type="checkbox"
                checked={includeInside}
                onChange={(event) => {
                  setIncludeInside(event.target.checked);
                  resetGeneratedResult();
                }}
                disabled={isProcessing || exportingFormat !== null}
              />
              <span>{t.splitInside}</span>
            </label>
            <p>{t.firstPageOnly}</p>
            <small>{t.insideMapping}</small>
          </div>

          <section className="cover-splitter-file-controls">
            <span>{t.files}</span>
            {files.map((entry) => (
              <div key={entry.id}>
                <p>
                  <b>{entry.file.name}</b>
                  <small>
                    {entry.sizeChoice === "half"
                      ? t.splitInHalf
                      : entry.sizeChoice}
                  </small>
                </p>
              </div>
            ))}
          </section>

          {error && (
            <p className="extraction-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            className="solutions-create cover-splitter-run action-button action-button-primary"
            onClick={() => void splitCovers()}
            disabled={
              !hasFiles ||
              isProcessing ||
              isPreparing ||
              exportingFormat !== null
            }
          >
            <span>{isProcessing ? t.splitting : t.split}</span>
            <b aria-hidden="true">→</b>
          </button>

          {result && (
            <div className="cover-splitter-downloads">
              <div className="cover-splitter-export-actions">
                <button
                  type="button"
                  className="cover-splitter-export action-button"
                  onClick={() => void downloadPdfFiles()}
                  disabled={exportingFormat !== null}
                  aria-label={t.downloadFilesLabel("PDF")}
                >
                  <span>{exportingFormat === "pdf" ? t.exporting : "PDF"}</span>
                  <b aria-hidden="true">↓</b>
                </button>
                <button
                  type="button"
                  className="cover-splitter-export action-button"
                  onClick={() => void exportRasterFiles("png")}
                  disabled={exportingFormat !== null}
                  aria-label={t.downloadFilesLabel("PNG")}
                >
                  <span>{exportingFormat === "png" ? t.exporting : "PNG"}</span>
                  <b aria-hidden="true">↓</b>
                </button>
                <button
                  type="button"
                  className="cover-splitter-export action-button"
                  onClick={() => void exportRasterFiles("jpg")}
                  disabled={exportingFormat !== null}
                  aria-label={t.downloadFilesLabel("JPG")}
                >
                  <span>{exportingFormat === "jpg" ? t.exporting : "JPG"}</span>
                  <b aria-hidden="true">↓</b>
                </button>
              </div>
              <button
                type="button"
                className="solutions-create is-complete cover-splitter-download action-button action-button-success"
                onClick={downloadResult}
                aria-label={t.downloadLabel}
              >
                <span>{t.download}</span>
                <b aria-hidden="true">↓</b>
              </button>
            </div>
          )}

          <p className="solutions-privacy">{t.localProcessing}</p>

          {consoleLines.length > 0 && (
            <section className="cover-splitter-console" aria-label={t.console}>
              <header>
                <span>{t.console}</span>
                <b>{progress}%</b>
              </header>
              <div aria-live="polite">
                {consoleLines.map((line, index) => (
                  <p key={`${line}-${index}`}>
                    <i aria-hidden="true">›</i>
                    {line}
                  </p>
                ))}
              </div>
              <div
                className="cover-splitter-progress"
                role="progressbar"
                aria-label={t.progressLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-valuetext={t.percentComplete(progress)}
              >
                <i style={{ width: `${progress}%` }} />
              </div>
            </section>
          )}
        </aside>

        <section className="cover-splitter-preview-column">
          <header className="cover-stage-head cover-splitter-active-head">
            <div className="tool-header-copy">
              <ToolMeta
                code={`${section ? `${section} / ` : ""}${t.moduleCode}`}
                mode="local"
                language={language}
              />
              <div className="cover-title-row">
                <h1>{t.heading}</h1>
              </div>
            </div>
          </header>

          <div className="cover-splitter-grid visual-multiple-grid">
            {files.length === 0 && (
              <button
                type="button"
                className="cover-splitter-empty"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                disabled={uploadDisabled}
              >
                <EmptyViewportState>{t.upload}</EmptyViewportState>
              </button>
            )}
            {files.map((entry) => (
              <article
                key={entry.id}
                className="cover-splitter-card visual-multiple-card"
              >
                <div className="cover-splitter-preview">
                  <Image
                    src={entry.previewUrl}
                    alt={t.previewAlt(entry.file.name)}
                    width={Math.max(1, Math.round(entry.widthPoints))}
                    height={Math.max(1, Math.round(entry.heightPoints))}
                    className="cover-splitter-preview-image"
                    unoptimized
                  />
                </div>
                <h2>{entry.file.name}</h2>
                <p
                  className="cover-splitter-details"
                  title={`${entry.widthPoints.toFixed(2)} × ${entry.heightPoints.toFixed(2)} pt`}
                >
                  {formatFileSize(entry.file.size, language)} ·{" "}
                  {formatDimensions(
                    entry.widthPoints,
                    entry.heightPoints,
                    language,
                  )}
                </p>
                <button
                  type="button"
                  className="cover-splitter-remove"
                  onClick={() => removeFile(entry)}
                  disabled={uploadDisabled}
                  aria-label={t.removeFile(entry.file.name)}
                >
                  ×
                </button>
                <select
                  value={entry.sizeChoice}
                  onChange={(event) =>
                    updateSize(entry.id, event.target.value as CoverSizeChoice)
                  }
                  disabled={isProcessing || exportingFormat !== null}
                  aria-label={`${t.sizeLabel}: ${entry.file.name}`}
                  className="cover-splitter-size"
                >
                  <option value="A5">A5</option>
                  <option value="A4">A4</option>
                  <option value="B5">B5</option>
                  <option value="half">{t.splitInHalf}</option>
                </select>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
