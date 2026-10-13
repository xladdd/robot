"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import { EmptyViewportState, ToolMeta } from "../../../_components/ToolChrome";
import { appRegistry, type Language } from "../../registry";
import type { ToolProps } from "../../types";
import { imageGeneratorUi } from "./copy";
import {
  buildAdvancedImagePrompt,
  emptyAdvancedImageFields,
  MAX_ADVANCED_SUBJECTS,
  MAX_IMAGE_QUEUE,
  readImagePromptFile,
  splitImagePrompts,
  type AdvancedImageFields,
  type AdvancedImageSubject,
} from "./code/prompts";
import { imageStylePresets } from "./code/style-presets";
import { cutoutDataUrl } from "./code/cutout";
import { createZip, type ZipEntry } from "./code/zip";

type ImageReference = { name: string; data: string };
type ImageMedium =
  | "match"
  | "photo"
  | "illustration"
  | "3d"
  | "storybook-object"
  | "storybook-character";
type ImageQuality = "fast" | "fidelity";
type ImageResolution = "512" | "1K" | "2K";
type QueueConcurrency = 1 | 2 | 3;
type GeneratorMode = "default" | "advanced";
type FluxModelOption = {
  id: string;
  name: string;
  pricePerImage: number | null;
};
type ImageUsage = {
  cost: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};
type GeneratedImage = {
  data: string;
  // The untouched FLUX output when in-browser background removal was
  // applied; the zip download keeps it alongside the cutout version.
  originalData?: string;
  seed: number;
  model: string;
  resolution: ImageResolution;
  generationId?: string;
  usage: ImageUsage;
};
type QueueJob = {
  id: string;
  prompt: string;
  status:
    "queued" | "generating" | "upscaling" | "complete" | "failed" | "stopped";
  image?: GeneratedImage;
  error?: string;
  mode?: GeneratorMode;
  model?: string;
  seed?: number;
};

type ImageRequest = {
  mode?: "upscale" | "advanced";
  prompt: string;
  references?: string[];
  medium?: ImageMedium;
  quality?: ImageQuality;
  image?: string;
  sourceResolution?: ImageResolution;
  model?: string;
  seed?: number;
};

const DEFAULT_ADVANCED_MODEL = "black-forest-labs/flux.2-pro";
const MAX_SEED = 2_000_000_000;

// Registry flag: when false, the mode switcher and the advanced panel are
// not rendered at all and the tool shows the default interface only.
const advancedModeEnabled = appRegistry.some(
  (app) => app.id === "image" && app.advancedMode,
);

function parseSeed(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[\s_]/g, ""));
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_SEED)
    return Number.NaN;
  return parsed;
}

function formatUsd(value: number) {
  return `$${value.toFixed(4).replace(/\.?0+$/, "")}`;
}

function prepareReferenceImage(file: File) {
  const supportedTypes = ["image/png", "image/jpeg", "image/webp"];
  if (!supportedTypes.includes(file.type))
    return Promise.reject(
      new Error(`${file.name}: use a PNG, JPEG, or WebP image.`),
    );
  if (file.size > 30_000_000)
    return Promise.reject(
      new Error(`${file.name}: the source image is larger than 30 MB.`),
    );

  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(
        1,
        1600 / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(
          new Error(`${file.name}: the browser could not prepare this image.`),
        );
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              new Error(`${file.name}: the image could not be compressed.`),
            );
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(new Error(`${file.name}: the image could not be read.`));
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.88,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`${file.name}: the image could not be opened.`));
    };
    image.src = objectUrl;
  });
}

function safeFileStem(
  prompt: string,
  index: number,
  resolution: ImageResolution,
) {
  const stem = prompt
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)
    .toLocaleLowerCase("en-US");
  return `${String(index + 1).padStart(2, "0")}-${stem || "image"}-${resolution}`;
}

export function ImageGeneratorMainInterface({
  language,
  onDiagnostics,
  active = true,
}: {
  language: Language;
  onDiagnostics?: ToolProps["onDiagnostics"];
  active?: boolean;
}) {
  const t = imageGeneratorUi[language];
  const [prompt, setPrompt] = useState("");
  const [references, setReferences] = useState<ImageReference[]>([]);
  const [medium, setMedium] = useState<ImageMedium>("match");
  const [quality, setQuality] = useState<ImageQuality>("fidelity");
  const [concurrency, setConcurrency] = useState<QueueConcurrency>(1);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const [mode, setMode] = useState<GeneratorMode>("default");
  const [advancedFields, setAdvancedFields] = useState<AdvancedImageFields>(
    emptyAdvancedImageFields,
  );
  const [models, setModels] = useState<FluxModelOption[]>([]);
  const [credit, setCredit] = useState<number | null>(null);
  const [creditLimit, setCreditLimit] = useState<number | null>(null);
  const [accountCredit, setAccountCredit] = useState<number | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [model, setModel] = useState("");
  const [seed, setSeed] = useState("");
  const [stylePreset, setStylePreset] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [removeBackground, setRemoveBackground] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const activeControllersRef = useRef(new Set<AbortController>());
  const queueRunRef = useRef(0);
  const stylePresetLabels: Record<string, string> = {
    "atmospheric environmental photomontage":
      t.stylePresetAtmosphericPhotomontage,
    "tactile editorial object montage": t.stylePresetObjectMontage,
    "scientific macro or material study": t.stylePresetScientificStudy,
    "detailed stylized illustration montage": t.stylePresetIllustrationMontage,
    "coloured wood engraving": t.stylePresetWoodEngraving,
    "modern risograph": t.stylePresetRisograph,
    "ink-lined watercolour": t.stylePresetInkWatercolour,
    "20th century-style propaganda watercolour":
      t.stylePresetPropagandaWatercolour,
    "storybook-object": t.stylePresetStorybookObject,
    "storybook-character": t.stylePresetStorybookCharacter,
  };

  useEffect(
    () => () => {
      queueRunRef.current += 1;
      activeControllersRef.current.forEach((controller) => controller.abort());
    },
    [],
  );

  useEffect(() => {
    if (mode !== "advanced") return;
    setCatalogLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/images");
        const result = (await response.json()) as {
          models?: FluxModelOption[];
          credit?: number | null;
          creditLimit?: number | null;
          accountCredit?: number | null;
          error?: string;
        };
        if (!response.ok || !Array.isArray(result.models))
          throw new Error(result.error || t.catalogError);
        setModels(result.models);
        setCredit(typeof result.credit === "number" ? result.credit : null);
        setCreditLimit(
          typeof result.creditLimit === "number" ? result.creditLimit : null,
        );
        setAccountCredit(
          typeof result.accountCredit === "number"
            ? result.accountCredit
            : null,
        );
        setCatalogError("");
      } catch (reason) {
        setCatalogError(
          reason instanceof Error ? reason.message : t.catalogError,
        );
      } finally {
        setCatalogLoading(false);
      }
    })();
  }, [mode, catalogRefresh, language, t.catalogError]);

  useEffect(() => {
    if (model || !models.length) return;
    setModel(
      models.some((entry) => entry.id === DEFAULT_ADVANCED_MODEL)
        ? DEFAULT_ADVANCED_MODEL
        : models[0].id,
    );
  }, [models, model]);

  const allPromptCount = useMemo(
    () => splitImagePrompts(prompt, Number.MAX_SAFE_INTEGER).length,
    [prompt],
  );
  const queuedPrompts = useMemo(() => splitImagePrompts(prompt), [prompt]);
  const advancedJson = useMemo(
    () => buildAdvancedImagePrompt(advancedFields),
    [advancedFields],
  );
  const advancedReady = advancedJson !== "{}";
  const selectedModel = models.find((entry) => entry.id === model);
  const completedJobs = jobs.filter(
    (job): job is QueueJob & { image: GeneratedImage } =>
      job.status === "complete" && Boolean(job.image),
  );
  const zoomedIndex = completedJobs.findIndex((job) => job.id === zoomedId);
  const completedCount = completedJobs.length;
  const zoomedJob = zoomedIndex >= 0 ? completedJobs[zoomedIndex] : null;

  async function addReferenceFiles(files: File[]) {
    if (isGenerating) return;
    const selected = files
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 3 - references.length);
    if (!selected.length) return;
    try {
      const additions = await Promise.all(
        selected.map(async (file) => ({
          name: file.name,
          data: await prepareReferenceImage(file),
        })),
      );
      setReferences((current) => [...current, ...additions].slice(0, 3));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.referenceError);
    }
  }

  function handleReferenceInput(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    void addReferenceFiles(files);
  }

  async function importPromptFile(file: File) {
    if (isGenerating) return;
    try {
      const imported = await readImagePromptFile(file);
      setPrompt(imported);
      setError(imported ? "" : t.promptRequired);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.importError);
    }
  }

  function handleDocumentInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void importPromptFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    const promptFile = files.find((file) =>
      /\.(docx?|md|markdown|txt)$/i.test(file.name),
    );
    if (promptFile) {
      void importPromptFile(promptFile);
      return;
    }
    void addReferenceFiles(files);
  }

  function updateJob(id: string, update: Partial<QueueJob>) {
    setJobs((current) =>
      current.map((job) => (job.id === id ? { ...job, ...update } : job)),
    );
  }

  function updateSubject(index: number, update: Partial<AdvancedImageSubject>) {
    setAdvancedFields((current) => ({
      ...current,
      subjects: current.subjects.map((subject, itemIndex) =>
        itemIndex === index ? { ...subject, ...update } : subject,
      ),
    }));
  }

  function addSubject() {
    setAdvancedFields((current) =>
      current.subjects.length >= MAX_ADVANCED_SUBJECTS
        ? current
        : {
            ...current,
            subjects: [
              ...current.subjects,
              { description: "", position: "", action: "" },
            ],
          },
    );
  }

  function removeSubject(index: number) {
    setAdvancedFields((current) => ({
      ...current,
      subjects: current.subjects.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function jobRequest(job: QueueJob): ImageRequest {
    if (job.mode === "advanced" && job.model)
      return {
        mode: "advanced",
        prompt: job.prompt,
        model: job.model,
        seed: job.seed,
      };
    // Storybook styles pin their seed the same way Advanced mode does; other
    // media leave the seed unset so the server picks a random one.
    const storybookSeed = imageStylePresets.find(
      (entry) => entry.id === medium,
    )?.seed;
    return {
      prompt: job.prompt,
      references: references.map((reference) => reference.data),
      medium,
      quality,
      seed: storybookSeed,
    };
  }

  async function requestImage(
    job: QueueJob,
    request: ImageRequest,
    status: "generating" | "upscaling",
    runId?: number,
  ) {
    updateJob(job.id, { status, error: undefined });
    const controller = new AbortController();
    activeControllersRef.current.add(controller);
    try {
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(request),
      });
      const result = (await response.json()) as {
        image?: GeneratedImage;
        error?: string;
      };
      if (!response.ok || !result.image)
        throw new Error(result.error || t.generationError);
      if (runId !== undefined && queueRunRef.current !== runId) return;
      let image = result.image;
      if (removeBackground) {
        // Best-effort in-browser cutout: on failure the untouched
        // FLUX output is kept so a generation is never lost.
        try {
          const cutout = await cutoutDataUrl(image.data);
          if (cutout)
            image = { ...image, data: cutout, originalData: image.data };
        } catch {
          // Keep the original image.
        }
      }
      updateJob(job.id, { status: "complete", image });
    } catch (reason) {
      if (
        controller.signal.aborted ||
        (runId !== undefined && queueRunRef.current !== runId)
      )
        return;
      const message =
        reason instanceof Error ? reason.message : t.generationError;
      updateJob(job.id, {
        status: job.image ? "complete" : "failed",
        error: message,
      });
      setError(message);
    } finally {
      activeControllersRef.current.delete(controller);
    }
  }

  function stopGeneration() {
    queueRunRef.current += 1;
    activeControllersRef.current.forEach((controller) => controller.abort());
    activeControllersRef.current.clear();
    setIsGenerating(false);
    setJobs((current) =>
      current.map((job) => {
        if (job.status === "upscaling") return { ...job, status: "complete" };
        if (job.status === "queued" || job.status === "generating")
          return { ...job, status: "stopped" };
        return job;
      }),
    );
  }

  async function startGeneration() {
    if (isGenerating) {
      stopGeneration();
      return;
    }
    if (mode === "advanced") {
      if (!advancedReady) {
        setError(t.advancedRequired);
        return;
      }
      if (!model) {
        setError(t.modelRequired);
        return;
      }
      const requestedSeed = parseSeed(seed);
      if (Number.isNaN(requestedSeed)) {
        setError(t.seedInvalid);
        return;
      }
      const runId = queueRunRef.current + 1;
      queueRunRef.current = runId;
      const job: QueueJob = {
        id: `advanced-${runId}`,
        prompt: advancedJson,
        status: "queued",
        mode: "advanced",
        model,
        ...(requestedSeed !== null ? { seed: requestedSeed } : {}),
      };
      setJobs((current) => [...current, job]);
      setError("");
      setIsGenerating(true);
      await requestImage(
        job,
        {
          mode: "advanced",
          prompt: advancedJson,
          model,
          seed: job.seed,
        },
        "generating",
        runId,
      );
      if (queueRunRef.current === runId) setIsGenerating(false);
      setCatalogRefresh((count) => count + 1);
      return;
    }
    if (!queuedPrompts.length) {
      setError(t.promptRequired);
      return;
    }

    const runId = queueRunRef.current + 1;
    queueRunRef.current = runId;
    const nextJobs = queuedPrompts.map((item, index) => ({
      id: `${Date.now()}-${index}`,
      prompt: item,
      status: "queued" as const,
    }));
    setJobs((current) => [...current, ...nextJobs]);
    setError(allPromptCount > MAX_IMAGE_QUEUE ? t.limit : "");
    setIsGenerating(true);

    let nextIndex = 0;
    const runWorker = async () => {
      while (queueRunRef.current === runId) {
        const job = nextJobs[nextIndex];
        nextIndex += 1;
        if (!job) return;
        await requestImage(job, jobRequest(job), "generating", runId);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, nextJobs.length) }, runWorker),
    );

    if (queueRunRef.current === runId) setIsGenerating(false);
  }

  async function retryJob(job: QueueJob) {
    if (isGenerating) return;
    setError("");
    setIsGenerating(true);
    await requestImage(job, jobRequest(job), "generating");
    setIsGenerating(false);
  }

  async function upscaleJob(job: QueueJob) {
    const image = job.image;
    if (!image || isGenerating || image.resolution === "2K") return;
    setError("");
    setIsGenerating(true);
    await requestImage(
      job,
      {
        mode: "upscale",
        prompt: job.prompt,
        image: image.data,
        sourceResolution: image.resolution,
      },
      "upscaling",
    );
    setIsGenerating(false);
  }

  function downloadImage(job: QueueJob, index: number) {
    if (!job.image) return;
    const link = document.createElement("a");
    link.href = job.image.data;
    link.download = `${safeFileStem(job.prompt, index, job.image.resolution)}.${
      job.image.originalData ? "png" : "jpg"
    }`;
    link.click();
  }

  async function dataUrlBytes(dataUrl: string): Promise<Uint8Array | null> {
    try {
      const response = await fetch(dataUrl);
      return new Uint8Array(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  async function downloadAll() {
    const jobs = completedJobs.filter((job) => job.image);
    if (!jobs.length) return;
    const hasCutouts = jobs.some((job) => job.image?.originalData);
    const entries: ZipEntry[] = [];
    for (const [index, job] of jobs.entries()) {
      const image = job.image;
      if (!image) continue;
      const stem = safeFileStem(job.prompt, index, image.resolution);
      const originalBytes = await dataUrlBytes(
        image.originalData ?? image.data,
      );
      if (!originalBytes) continue;
      entries.push({
        name: hasCutouts ? `originals/${stem}.jpg` : `${stem}.jpg`,
        data: originalBytes,
      });
      if (image.originalData) {
        const cutoutBytes = await dataUrlBytes(image.data);
        if (cutoutBytes)
          entries.push({ name: `transparent/${stem}.png`, data: cutoutBytes });
      }
    }
    if (!entries.length) return;
    const url = URL.createObjectURL(
      new Blob([createZip(entries)], { type: "application/zip" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "images.zip";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  function moveLightbox(direction: number) {
    if (!completedJobs.length) return;
    const nextIndex =
      (zoomedIndex + direction + completedJobs.length) % completedJobs.length;
    setZoomedId(completedJobs[nextIndex].id);
  }

  const generateLabel =
    mode === "advanced" || queuedPrompts.length === 1
      ? t.generateOne
      : t.generateMany.replace("{count}", String(queuedPrompts.length));

  useEffect(() => {
    if (!active || !onDiagnostics) return;
    onDiagnostics({
      appStatus: isGenerating
        ? "running"
        : error || catalogError
          ? "error"
          : jobs.some((job) => job.status === "complete")
            ? "completed"
            : "idle",
      progress: null,
      inputSummary: {
        hasInput:
          Boolean(prompt.trim()) ||
          references.length > 0 ||
          (mode === "advanced" &&
            Boolean(
              advancedFields.scene.trim() ||
              advancedFields.prompt.trim() ||
              advancedFields.subjects.some(
                (subject) =>
                  subject.description.trim() ||
                  subject.position.trim() ||
                  subject.action.trim(),
              ),
            )),
        fileType: null,
        fileSize: null,
        referenceCount: references.length,
        hasResult: jobs.some((job) => job.status === "complete"),
      },
    });
  }, [
    active,
    onDiagnostics,
    isGenerating,
    jobs,
    prompt,
    references.length,
    mode,
    advancedFields,
    error,
    catalogError,
  ]);

  return (
    <div
      className="cover-module image-generator-module"
      onDragOver={(event) => {
        if (active) event.preventDefault();
      }}
      onDrop={active ? handleDrop : undefined}
    >
      <section
        className={`cover-stage ${!jobs.length && !isGenerating ? "initial" : ""}`}
      >
        <header className="cover-stage-head">
          <div className="tool-header-copy">
            <ToolMeta mode="ai" language={language} />
            <div className="cover-title-row">
              <h1>{t.heading}</h1>
            </div>
          </div>
        </header>
        <div
          className={`cover-grid visual-multiple-grid image-generator-grid ${jobs.length ? "has-results" : ""}`}
          aria-live="polite"
        >
          {jobs.map((job, index) => (
            <article
              className={`cover-card visual-multiple-card image-generator-card image-generator-card-${job.status} ${job.image ? "" : "cover-loading"}`}
              key={job.id}
            >
              {job.image ? (
                <button
                  className="cover-image"
                  onClick={() => setZoomedId(job.id)}
                  aria-label={`${t.zoom} ${index + 1}`}
                >
                  <img src={job.image.data} alt={job.prompt} />
                </button>
              ) : (
                <span>
                  {job.status === "generating"
                    ? t.generating
                    : job.status === "failed"
                      ? t.failed
                      : job.status === "stopped"
                        ? t.stopped
                        : t.queued}
                  <br />
                  {String(index + 1).padStart(2, "0")}
                </span>
              )}
              {job.image ? (
                <footer className="image-generator-card-actions">
                  <button
                    className="action-button action-button-compact image-generator-download"
                    onClick={() => downloadImage(job, index)}
                  >
                    ↓ {t.download}
                  </button>
                  <button
                    className="action-button action-button-compact image-generator-upscale"
                    onClick={() => void upscaleJob(job)}
                    disabled={isGenerating || job.image.resolution === "2K"}
                  >
                    {job.status === "upscaling"
                      ? t.upscaling
                      : job.image.resolution === "2K"
                        ? t.upscaleMaximum
                        : t.upscale}
                  </button>
                </footer>
              ) : job.status === "failed" && !isGenerating ? (
                <footer className="image-generator-card-actions">
                  <button
                    className="action-button action-button-compact image-generator-retry"
                    onClick={() => void retryJob(job)}
                  >
                    ↻ {t.retry}
                  </button>
                </footer>
              ) : null}
            </article>
          ))}
          {!jobs.length && !isGenerating && (
            <EmptyViewportState className="cover-empty">
              {t.empty}
            </EmptyViewportState>
          )}
        </div>
      </section>

      <aside className="cover-toolbar editor-sidebar image-generator-toolbar">
        <input
          ref={referenceInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={handleReferenceInput}
          hidden
        />
        <input
          ref={documentInputRef}
          type="file"
          accept=".doc,.docx,.md,.markdown,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
          onChange={handleDocumentInput}
          hidden
        />

        {advancedModeEnabled && (
          <section className="cover-control cover-overlay-control image-generator-mode-control">
            <label>{t.mode}</label>
            <div
              className="cover-overlay-options"
              role="group"
              aria-label={t.mode}
            >
              <button
                type="button"
                className={mode === "default" ? "active" : ""}
                aria-pressed={mode === "default"}
                onClick={() => setMode("default")}
                disabled={isGenerating}
              >
                {t.modeDefault}
              </button>
              <button
                type="button"
                className={mode === "advanced" ? "active" : ""}
                aria-pressed={mode === "advanced"}
                onClick={() => setMode("advanced")}
                disabled={isGenerating}
              >
                {t.modeAdvanced}
              </button>
            </div>
            <small>{t.modeHelp}</small>
          </section>
        )}

        {mode === "default" ? (
          <>
            <section className="cover-control image-generator-prompt-control">
              <label htmlFor="image-generator-prompt">
                {t.prompt}
                <b>
                  {Math.min(allPromptCount, MAX_IMAGE_QUEUE)} /{" "}
                  {MAX_IMAGE_QUEUE} · {t.promptCount}
                </b>
              </label>
              <textarea
                id="image-generator-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t.promptPlaceholder}
                rows={9}
                disabled={isGenerating}
              />
              <button
                className="image-generator-import"
                onClick={() => documentInputRef.current?.click()}
                disabled={isGenerating}
              >
                {t.importFile}
              </button>
              <small>{t.importHelp}</small>
              {allPromptCount > MAX_IMAGE_QUEUE && (
                <p className="image-generator-limit" role="status">
                  {t.limit}
                </p>
              )}
            </section>

            <section className="cover-control cover-reference-control">
              <label>
                {t.references}{" "}
                <b>
                  {references.length}/3 · {t.referencesOptional}
                </b>
              </label>
              <div className="cover-references image-generator-references">
                {Array.from({ length: 3 }, (_, index) => {
                  const reference = references[index];
                  return reference ? (
                    <figure key={`${reference.name}-${index}`}>
                      <img src={reference.data} alt={reference.name} />
                      <button
                        onClick={() =>
                          setReferences((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                        disabled={isGenerating}
                        aria-label={`${t.remove} ${reference.name}`}
                      >
                        ×
                      </button>
                      <figcaption>
                        {String(index + 1).padStart(2, "0")}
                      </figcaption>
                    </figure>
                  ) : (
                    <button
                      className="cover-add-reference"
                      key={`empty-${index}`}
                      onClick={() => referenceInputRef.current?.click()}
                      onDragOver={(event) => {
                        if (active) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        if (!active) return;
                        event.preventDefault();
                        event.stopPropagation();
                        void addReferenceFiles(
                          Array.from(event.dataTransfer.files),
                        );
                      }}
                      disabled={isGenerating}
                      aria-label={`${t.addImage.replace("\n", " ")} ${index + 1}`}
                    >
                      <b>+</b>
                      <span>
                        {t.addImage.split("\n").map((line, lineIndex) => (
                          <span key={line}>
                            {line}
                            {lineIndex === 0 && <br />}
                          </span>
                        ))}
                      </span>
                      <small>{String(index + 1).padStart(2, "0")}</small>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="cover-control cover-render-controls">
              <label htmlFor="image-generator-medium">{t.style}</label>
              <select
                id="image-generator-medium"
                value={medium}
                onChange={(event) =>
                  setMedium(event.target.value as ImageMedium)
                }
                disabled={isGenerating}
              >
                <option value="match">{t.styleMatch}</option>
                <option value="photo">{t.stylePhoto}</option>
                <option value="illustration">{t.styleIllustration}</option>
                <option value="3d">{t.style3d}</option>
                <option value="storybook-object">
                  {t.stylePresetStorybookObject}
                </option>
                <option value="storybook-character">
                  {t.stylePresetStorybookCharacter}
                </option>
              </select>
              <label htmlFor="image-generator-quality">{t.quality}</label>
              <select
                id="image-generator-quality"
                value={quality}
                onChange={(event) =>
                  setQuality(event.target.value as ImageQuality)
                }
                disabled={isGenerating}
              >
                <option value="fidelity">{t.qualityFidelity}</option>
                <option value="fast">{t.qualityFast}</option>
              </select>
              <label htmlFor="image-generator-concurrency">
                {t.concurrency}
              </label>
              <select
                id="image-generator-concurrency"
                value={concurrency}
                onChange={(event) =>
                  setConcurrency(Number(event.target.value) as QueueConcurrency)
                }
                disabled={isGenerating}
              >
                <option value={1}>{t.concurrencyOne}</option>
                <option value={2}>{t.concurrencyTwo}</option>
                <option value={3}>{t.concurrencyThree}</option>
              </select>
              {quality === "fidelity" && <small>{t.fidelityNote}</small>}
            </section>

            <p className="cover-note">{t.queueNote}</p>
          </>
        ) : (
          <>
            <section className="cover-control cover-render-controls image-generator-model-control">
              <label htmlFor="image-generator-model">{t.model}</label>
              <select
                id="image-generator-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                disabled={isGenerating || !models.length}
              >
                {models.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
                {!models.length && (
                  <option value="">
                    {catalogLoading ? t.modelLoading : t.catalogError}
                  </option>
                )}
              </select>
              <div className="image-generator-model-meta">
                <div>
                  <small>{t.pricePerImage}</small>
                  <b>
                    {selectedModel?.pricePerImage === null ||
                    selectedModel?.pricePerImage === undefined
                      ? t.creditUnavailable
                      : formatUsd(selectedModel.pricePerImage)}
                  </b>
                </div>
                <div title={creditLimit !== null ? t.creditHint : undefined}>
                  <small>{t.credit}</small>
                  <b>
                    {credit === null
                      ? t.creditUnavailable
                      : creditLimit !== null
                        ? `${formatUsd(credit)} / ${formatUsd(creditLimit)}`
                        : formatUsd(credit)}
                  </b>
                </div>
                <div title={t.accountCreditHint}>
                  <small>{t.accountCredit}</small>
                  <b>
                    {accountCredit === null
                      ? t.creditUnavailable
                      : formatUsd(accountCredit)}
                  </b>
                </div>
              </div>
              {catalogError && (
                <p className="image-generator-limit" role="status">
                  {catalogError}
                </p>
              )}
            </section>

            <section className="cover-control cover-input-control image-generator-subjects-control">
              <label>
                {t.subjects}{" "}
                <b>
                  {advancedFields.subjects.length} · {t.subjectsHint}
                </b>
              </label>
              {advancedFields.subjects.map((subject, index) => (
                <div className="image-generator-subject" key={index}>
                  <div className="image-generator-subject-head">
                    <label>
                      {t.subject} {String(index + 1).padStart(2, "0")}
                    </label>
                    {advancedFields.subjects.length > 1 && (
                      <button
                        type="button"
                        className="image-generator-remove-subject"
                        onClick={() => removeSubject(index)}
                        disabled={isGenerating}
                        aria-label={`${t.removeSubject} ${index + 1}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <label
                    htmlFor={`image-generator-subject-description-${index}`}
                  >
                    {t.description}
                  </label>
                  <textarea
                    id={`image-generator-subject-description-${index}`}
                    value={subject.description}
                    onChange={(event) =>
                      updateSubject(index, { description: event.target.value })
                    }
                    placeholder={t.subjectDescriptionPlaceholder}
                    rows={3}
                    disabled={isGenerating}
                  />
                  <label htmlFor={`image-generator-subject-position-${index}`}>
                    {t.position}
                  </label>
                  <input
                    id={`image-generator-subject-position-${index}`}
                    type="text"
                    value={subject.position}
                    onChange={(event) =>
                      updateSubject(index, { position: event.target.value })
                    }
                    placeholder={t.subjectPositionPlaceholder}
                    disabled={isGenerating}
                  />
                  <label htmlFor={`image-generator-subject-action-${index}`}>
                    {t.action}
                  </label>
                  <input
                    id={`image-generator-subject-action-${index}`}
                    type="text"
                    value={subject.action}
                    onChange={(event) =>
                      updateSubject(index, { action: event.target.value })
                    }
                    placeholder={t.subjectActionPlaceholder}
                    disabled={isGenerating}
                  />
                </div>
              ))}
              <button
                type="button"
                className="image-generator-add-subject"
                onClick={addSubject}
                disabled={
                  isGenerating ||
                  advancedFields.subjects.length >= MAX_ADVANCED_SUBJECTS
                }
              >
                + {t.addSubject}
              </button>
            </section>

            <section className="cover-control cover-input-control image-generator-scene-control">
              <label htmlFor="image-generator-scene">{t.scene}</label>
              <textarea
                id="image-generator-scene"
                value={advancedFields.scene}
                onChange={(event) =>
                  setAdvancedFields((current) => ({
                    ...current,
                    scene: event.target.value,
                  }))
                }
                placeholder={t.scenePlaceholder}
                rows={3}
                disabled={isGenerating}
              />
              <label htmlFor="image-generator-advanced-style">{t.style}</label>
              <textarea
                id="image-generator-advanced-style"
                value={advancedFields.style}
                onChange={(event) => {
                  setStylePreset("");
                  setAdvancedFields((current) => ({
                    ...current,
                    style: event.target.value,
                  }));
                }}
                placeholder={t.stylePlaceholder}
                rows={4}
                disabled={isGenerating}
              />
              <label htmlFor="image-generator-style-preset">
                {t.stylePreset}
              </label>
              <select
                id="image-generator-style-preset"
                value={stylePreset}
                onChange={(event) => {
                  const presetId = event.target.value;
                  setStylePreset(presetId);
                  const preset = imageStylePresets.find(
                    (entry) => entry.id === presetId,
                  );
                  if (!preset) return;
                  setAdvancedFields((current) => ({
                    ...current,
                    style: preset.prompt,
                  }));
                  if (preset.seed !== undefined) setSeed(String(preset.seed));
                }}
                disabled={isGenerating}
              >
                <option value="">{t.stylePresetCustom}</option>
                {imageStylePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {stylePresetLabels[preset.id]}
                  </option>
                ))}
              </select>
              <small>{t.stylePresetHelp}</small>
              <label htmlFor="image-generator-advanced-prompt">
                {t.advancedPrompt}
              </label>
              <textarea
                id="image-generator-advanced-prompt"
                value={advancedFields.prompt}
                onChange={(event) =>
                  setAdvancedFields((current) => ({
                    ...current,
                    prompt: event.target.value,
                  }))
                }
                placeholder={t.advancedPromptPlaceholder}
                rows={4}
                disabled={isGenerating}
              />
            </section>

            <section className="cover-control cover-input-control image-generator-details-control">
              <div className="image-generator-details-head">
                <label>
                  {t.advancedDetails} <b>{t.advancedDetailsHint}</b>
                </label>
                <button
                  type="button"
                  className="image-generator-details-toggle"
                  onClick={() => setDetailsOpen((open) => !open)}
                  aria-expanded={detailsOpen}
                  aria-controls="image-generator-details"
                  disabled={isGenerating}
                >
                  {detailsOpen ? "−" : "+"}
                </button>
              </div>
              {detailsOpen && (
                <div
                  id="image-generator-details"
                  className="image-generator-details"
                >
                  <label htmlFor="image-generator-lighting">{t.lighting}</label>
                  <input
                    id="image-generator-lighting"
                    type="text"
                    value={advancedFields.lighting}
                    onChange={(event) =>
                      setAdvancedFields((current) => ({
                        ...current,
                        lighting: event.target.value,
                      }))
                    }
                    placeholder={t.lightingPlaceholder}
                    disabled={isGenerating}
                  />
                  <label htmlFor="image-generator-mood">{t.mood}</label>
                  <input
                    id="image-generator-mood"
                    type="text"
                    value={advancedFields.mood}
                    onChange={(event) =>
                      setAdvancedFields((current) => ({
                        ...current,
                        mood: event.target.value,
                      }))
                    }
                    placeholder={t.moodPlaceholder}
                    disabled={isGenerating}
                  />
                  <label htmlFor="image-generator-background">
                    {t.background}
                  </label>
                  <input
                    id="image-generator-background"
                    type="text"
                    value={advancedFields.background}
                    onChange={(event) =>
                      setAdvancedFields((current) => ({
                        ...current,
                        background: event.target.value,
                      }))
                    }
                    placeholder={t.backgroundPlaceholder}
                    disabled={isGenerating}
                  />
                  <label htmlFor="image-generator-composition">
                    {t.composition}
                  </label>
                  <input
                    id="image-generator-composition"
                    type="text"
                    value={advancedFields.composition}
                    onChange={(event) =>
                      setAdvancedFields((current) => ({
                        ...current,
                        composition: event.target.value,
                      }))
                    }
                    placeholder={t.compositionPlaceholder}
                    disabled={isGenerating}
                  />
                  <label htmlFor="image-generator-color-palette">
                    {t.colorPalette}
                  </label>
                  <input
                    id="image-generator-color-palette"
                    type="text"
                    value={advancedFields.colorPalette}
                    onChange={(event) =>
                      setAdvancedFields((current) => ({
                        ...current,
                        colorPalette: event.target.value,
                      }))
                    }
                    placeholder={t.colorPalettePlaceholder}
                    disabled={isGenerating}
                  />
                  <label>{t.camera}</label>
                  <label htmlFor="image-generator-camera-angle">
                    {t.cameraAngle}
                  </label>
                  <input
                    id="image-generator-camera-angle"
                    type="text"
                    value={advancedFields.cameraAngle}
                    onChange={(event) =>
                      setAdvancedFields((current) => ({
                        ...current,
                        cameraAngle: event.target.value,
                      }))
                    }
                    placeholder={t.cameraAnglePlaceholder}
                    disabled={isGenerating}
                  />
                  <label htmlFor="image-generator-camera-lens">
                    {t.cameraLens}
                  </label>
                  <input
                    id="image-generator-camera-lens"
                    type="text"
                    value={advancedFields.cameraLens}
                    onChange={(event) =>
                      setAdvancedFields((current) => ({
                        ...current,
                        cameraLens: event.target.value,
                      }))
                    }
                    placeholder={t.cameraLensPlaceholder}
                    disabled={isGenerating}
                  />
                  <label htmlFor="image-generator-camera-depth">
                    {t.cameraDepthOfField}
                  </label>
                  <input
                    id="image-generator-camera-depth"
                    type="text"
                    value={advancedFields.cameraDepthOfField}
                    onChange={(event) =>
                      setAdvancedFields((current) => ({
                        ...current,
                        cameraDepthOfField: event.target.value,
                      }))
                    }
                    placeholder={t.cameraDepthOfFieldPlaceholder}
                    disabled={isGenerating}
                  />
                </div>
              )}
            </section>

            <p className="cover-note">{t.advancedNote}</p>

            <section className="cover-control cover-input-control image-generator-seed-control">
              <label htmlFor="image-generator-seed">
                {t.seed} <b>{t.seedHint}</b>
              </label>
              <input
                id="image-generator-seed"
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={seed}
                onChange={(event) =>
                  setSeed(event.target.value.replace(/[^\d]/g, ""))
                }
                placeholder={t.seedPlaceholder}
                disabled={isGenerating}
              />
            </section>
          </>
        )}

        {error && (
          <p className="extraction-error" role="alert">
            {error}
          </p>
        )}

        <div className="image-generator-bottom-actions">
          {completedJobs.length > 0 && (
            <div className="cover-export-actions cover-toolbar-exports">
              <button
                className="cover-export image-generator-clear action-button"
                onClick={() => {
                  setJobs([]);
                  setError("");
                }}
                disabled={isGenerating}
              >
                {t.clear}
              </button>
              <button
                className="cover-export action-button action-button-success"
                onClick={() => void downloadAll()}
              >
                {t.downloadAll}
              </button>
            </div>
          )}
          <label className="cover-checkbox image-generator-transparent-control">
            <input
              type="checkbox"
              checked={removeBackground}
              onChange={(event) => setRemoveBackground(event.target.checked)}
              disabled={isGenerating}
            />
            <span>
              <b>{t.transparentBackground}</b>
              <small>{t.transparentBackgroundHelp}</small>
            </span>
          </label>
          <div className="cover-generate-group image-generator-generate-group">
            <button
              className={`cover-generate action-button action-button-primary ${isGenerating ? "image-generator-stop" : ""}`}
              onClick={() => void startGeneration()}
              disabled={
                !isGenerating &&
                (mode === "advanced"
                  ? !advancedReady || !model
                  : !queuedPrompts.length)
              }
            >
              <span>
                {isGenerating
                  ? `${t.stop} · ${t.progress
                      .replace("{complete}", String(completedCount))
                      .replace("{total}", String(jobs.length))}`
                  : generateLabel}
              </span>
              <b>{isGenerating ? "×" : "→"}</b>
            </button>
          </div>
        </div>
      </aside>

      {active &&
        zoomedJob &&
        createPortal(
          <div
            className="manual-lightbox cover-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={zoomedJob.prompt}
            onClick={() => setZoomedId(null)}
          >
            <button
              className="manual-lightbox-close"
              onClick={() => setZoomedId(null)}
              aria-label={t.close}
            >
              ×
            </button>
            <button
              className="cover-lightbox-arrow previous"
              onClick={(event) => {
                event.stopPropagation();
                moveLightbox(-1);
              }}
              aria-label={t.previous}
            >
              ←
            </button>
            <figure onClick={(event) => event.stopPropagation()}>
              <img src={zoomedJob.image.data} alt={zoomedJob.prompt} />
              <figcaption>
                <span>{zoomedJob.prompt}</span>
                <small>
                  {`${zoomedJob.image.model} · ${zoomedJob.image.resolution} · seed ${zoomedJob.image.seed} · ${zoomedJob.image.usage.cost === null ? "credits unavailable" : `${zoomedJob.image.usage.cost.toFixed(4)} cr`}`}
                </small>
              </figcaption>
            </figure>
            <button
              className="cover-lightbox-arrow next"
              onClick={(event) => {
                event.stopPropagation();
                moveLightbox(1);
              }}
              aria-label={t.next}
            >
              →
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
