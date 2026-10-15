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
type ImageMedium = "match" | "storybook-object" | "storybook-character";
type ImageResolution = "512" | "1K" | "2K";
type QueueConcurrency = 1 | 2 | 3;
type GeneratorMode = "default" | "advanced";
type AdvancedParameterId =
  | "scene"
  | "subjects"
  | "seed"
  | "lighting"
  | "mood"
  | "background"
  | "composition"
  | "colorPalette"
  | "cameraAngle"
  | "cameraLens"
  | "cameraDepthOfField";
type AdvancedTextField = Exclude<keyof AdvancedImageFields, "subjects">;
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

function previewValue(value: string, empty: string) {
  const trimmed = value.trim();
  if (!trimmed) return empty;
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
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
  const [concurrency, setConcurrency] = useState<QueueConcurrency>(1);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [zoomedId, setZoomedId] = useState<string | null>(null);
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
  const [openParameter, setOpenParameter] =
    useState<AdvancedParameterId | null>(null);
  const [compareModel, setCompareModel] = useState("");
  const [removeBackground, setRemoveBackground] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const activeControllersRef = useRef(new Set<AbortController>());
  const queueRunRef = useRef(0);
  // The registry flag is the only mode switch: advanced reveals the model
  // picker, structured prompt parameters, and the credits table.
  const mode: GeneratorMode = advancedModeEnabled ? "advanced" : "default";
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
    if (!advancedModeEnabled) return;
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
  }, [catalogRefresh, language, t.catalogError]);

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
  // Storybook presets double as full medium instructions on the server; every
  // other preset only appends its style text to the prompt line.
  const medium: ImageMedium =
    stylePreset === "storybook-object" || stylePreset === "storybook-character"
      ? stylePreset
      : "match";
  // Any structured parameter turns each prompt line into a structured FLUX
  // JSON prompt; the style field alone stays on the plain line-based path.
  const structuredFieldsFilled = Boolean(
    advancedFields.scene.trim() ||
    advancedFields.subjects.some(
      (subject) =>
        subject.description.trim() ||
        subject.position.trim() ||
        subject.action.trim(),
    ) ||
    advancedFields.lighting.trim() ||
    advancedFields.mood.trim() ||
    advancedFields.background.trim() ||
    advancedFields.composition.trim() ||
    advancedFields.colorPalette.trim() ||
    advancedFields.cameraAngle.trim() ||
    advancedFields.cameraLens.trim() ||
    advancedFields.cameraDepthOfField.trim(),
  );
  const selectedModel = models.find((entry) => entry.id === model);
  const compareModelActive = models.some((entry) => entry.id === compareModel);
  const comparisonCount = mode === "advanced" && compareModelActive ? 2 : 1;

  const detailParameters: {
    id: AdvancedParameterId;
    field: AdvancedTextField;
    inputId: string;
    label: string;
    tag: string;
    help: string;
    placeholder: string;
  }[] = [
    {
      id: "lighting",
      field: "lighting",
      inputId: "image-generator-lighting",
      label: t.lighting,
      tag: "lighting",
      help: t.paramHelpLighting,
      placeholder: t.lightingPlaceholder,
    },
    {
      id: "mood",
      field: "mood",
      inputId: "image-generator-mood",
      label: t.mood,
      tag: "mood",
      help: t.paramHelpMood,
      placeholder: t.moodPlaceholder,
    },
    {
      id: "background",
      field: "background",
      inputId: "image-generator-background",
      label: t.background,
      tag: "background",
      help: t.paramHelpBackground,
      placeholder: t.backgroundPlaceholder,
    },
    {
      id: "composition",
      field: "composition",
      inputId: "image-generator-composition",
      label: t.composition,
      tag: "composition",
      help: t.paramHelpComposition,
      placeholder: t.compositionPlaceholder,
    },
    {
      id: "colorPalette",
      field: "colorPalette",
      inputId: "image-generator-color-palette",
      label: t.colorPalette,
      tag: "color_palette",
      help: t.paramHelpColorPalette,
      placeholder: t.colorPalettePlaceholder,
    },
    {
      id: "cameraAngle",
      field: "cameraAngle",
      inputId: "image-generator-camera-angle",
      label: t.cameraAngle,
      tag: "camera.angle",
      help: t.paramHelpCameraAngle,
      placeholder: t.cameraAnglePlaceholder,
    },
    {
      id: "cameraLens",
      field: "cameraLens",
      inputId: "image-generator-camera-lens",
      label: t.cameraLens,
      tag: "camera.lens",
      help: t.paramHelpCameraLens,
      placeholder: t.cameraLensPlaceholder,
    },
    {
      id: "cameraDepthOfField",
      field: "cameraDepthOfField",
      inputId: "image-generator-camera-depth",
      label: t.cameraDepthOfField,
      tag: "camera.depth_of_field",
      help: t.paramHelpCameraDepthOfField,
      placeholder: t.cameraDepthOfFieldPlaceholder,
    },
  ];
  const parameterChips: {
    id: AdvancedParameterId;
    label: string;
    tag: string;
    help: string;
    value: string;
  }[] = [
    {
      id: "scene",
      label: t.scene,
      tag: "scene",
      help: t.paramHelpScene,
      value: previewValue(advancedFields.scene, t.creditUnavailable),
    },
    {
      id: "subjects",
      label: t.subjects,
      tag: "subjects",
      help: t.paramHelpSubjects,
      value: String(advancedFields.subjects.length),
    },
    {
      id: "seed",
      label: t.seed,
      tag: "seed",
      help: t.paramHelpSeed,
      value: seed.trim() || t.seedRandom,
    },
    ...detailParameters.map((parameter) => ({
      id: parameter.id,
      label: parameter.label,
      tag: parameter.tag,
      help: parameter.help,
      value: previewValue(advancedFields[parameter.field], t.creditUnavailable),
    })),
  ];
  const activeParameter =
    parameterChips.find((chip) => chip.id === openParameter) ?? null;
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

  function enableComparison() {
    if (isGenerating) return;
    const alternative = models.find((entry) => entry.id !== model);
    if (alternative) setCompareModel(alternative.id);
  }

  function jobRequest(job: QueueJob): ImageRequest {
    if (job.mode === "advanced")
      return {
        mode: "advanced",
        prompt: job.prompt,
        ...(job.model ? { model: job.model } : {}),
        ...(job.seed !== undefined ? { seed: job.seed } : {}),
      };
    // Storybook presets are sent as the medium, so the server already prepends
    // the preset text; any other style text is appended to the prompt line.
    const styleText = advancedFields.style.trim();
    return {
      prompt:
        medium === "match" && styleText
          ? `${job.prompt}\n\n${styleText}`
          : job.prompt,
      references: references.map((reference) => reference.data),
      medium,
      ...(job.model ? { model: job.model } : {}),
      ...(job.seed !== undefined ? { seed: job.seed } : {}),
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
    if (!queuedPrompts.length) {
      setError(t.promptRequired);
      return;
    }
    const requestedSeed = parseSeed(seed);
    if (Number.isNaN(requestedSeed)) {
      setError(t.seedInvalid);
      return;
    }
    if (mode === "advanced" && models.length && !model) {
      setError(t.modelRequired);
      return;
    }

    const runId = queueRunRef.current + 1;
    queueRunRef.current = runId;
    // Comparison generates every prompt line once per selected model.
    const targetModels: (string | undefined)[] =
      mode === "advanced"
        ? compareModelActive
          ? [model, compareModel]
          : [model]
        : [undefined];
    const nextJobs: QueueJob[] = [];
    queuedPrompts.forEach((line, lineIndex) => {
      targetModels.forEach((targetModel, modelIndex) => {
        nextJobs.push({
          id: `${Date.now()}-${lineIndex}-${modelIndex}`,
          prompt: structuredFieldsFilled
            ? buildAdvancedImagePrompt({ ...advancedFields, prompt: line })
            : line,
          status: "queued",
          ...(structuredFieldsFilled ? { mode: "advanced" as const } : {}),
          ...(targetModel ? { model: targetModel } : {}),
          ...(requestedSeed !== null ? { seed: requestedSeed } : {}),
        });
      });
    });
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
    setCatalogRefresh((count) => count + 1);
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
    queuedPrompts.length * comparisonCount === 1
      ? t.generateOne
      : t.generateMany.replace(
          "{count}",
          String(queuedPrompts.length * comparisonCount),
        );

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
          structuredFieldsFilled,
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
    structuredFieldsFilled,
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

        {mode === "advanced" && (
          <section className="cover-control cover-render-controls image-generator-section image-generator-model-section">
            <label htmlFor="image-generator-model">{t.model}</label>
            <select
              id="image-generator-model"
              value={model}
              onChange={(event) => {
                const nextModel = event.target.value;
                setModel(nextModel);
                setCompareModel((current) =>
                  current === nextModel ? "" : current,
                );
              }}
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

            {compareModelActive ? (
              <div className="image-generator-compare-row">
                <select
                  id="image-generator-compare-model"
                  value={compareModel}
                  onChange={(event) => setCompareModel(event.target.value)}
                  disabled={isGenerating}
                  aria-label={t.compareModel}
                >
                  {models
                    .filter((entry) => entry.id !== model)
                    .map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="image-generator-compare-remove"
                  onClick={() => setCompareModel("")}
                  disabled={isGenerating}
                  aria-label={t.removeComparison}
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="image-generator-add-button"
                onClick={enableComparison}
                disabled={
                  isGenerating || !models.some((entry) => entry.id !== model)
                }
              >
                + {t.compareModel}
              </button>
            )}
            {catalogError && (
              <p className="image-generator-limit" role="status">
                {catalogError}
              </p>
            )}
          </section>
        )}

        <section className="cover-control image-generator-prompt-control">
          <label htmlFor="image-generator-prompt">
            {t.prompt}
            <b>
              {Math.min(allPromptCount, MAX_IMAGE_QUEUE)} / {MAX_IMAGE_QUEUE} ·{" "}
              {t.promptCount}
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
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    disabled={isGenerating}
                    aria-label={`${t.remove} ${reference.name}`}
                  >
                    ×
                  </button>
                  <figcaption>{String(index + 1).padStart(2, "0")}</figcaption>
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

        <section className="cover-control cover-render-controls image-generator-section image-generator-style-section">
          <label htmlFor="image-generator-style">{t.style}</label>
          <textarea
            id="image-generator-style"
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
          <label htmlFor="image-generator-medium">{t.presets}</label>
          <select
            id="image-generator-medium"
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
            <option value="">{t.presetsCustom}</option>
            {imageStylePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {stylePresetLabels[preset.id]}
              </option>
            ))}
          </select>
          {mode === "advanced" && (
            <small className="image-generator-style-source">
              robot/app/_tools/image/image-generator/code/style-presets.ts
            </small>
          )}
        </section>

        <section className="cover-control image-generator-section image-generator-parameters-section">
          <div className="image-generator-section-head">
            <label>{t.parameters}</label>
          </div>
          <div
            className="image-generator-chips"
            role="group"
            aria-label={t.parameters}
          >
            {parameterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`image-generator-chip${openParameter === chip.id ? " active" : ""}`}
                aria-pressed={openParameter === chip.id}
                onClick={() =>
                  setOpenParameter((current) =>
                    current === chip.id ? null : chip.id,
                  )
                }
                disabled={isGenerating}
              >
                <span>{chip.label}</span>
                <b>{chip.value}</b>
              </button>
            ))}
          </div>
          {activeParameter && (
            <div className="image-generator-param-window">
              <div className="image-generator-param-head">
                <b className="image-generator-param-title">
                  {activeParameter.label}
                </b>
                <small className="image-generator-param-tag">
                  {activeParameter.tag}
                </small>
                <button
                  type="button"
                  className="image-generator-param-close"
                  onClick={() => setOpenParameter(null)}
                  disabled={isGenerating}
                  aria-label={t.close}
                >
                  ×
                </button>
              </div>
              <p className="image-generator-param-help">
                {activeParameter.help}
              </p>
              {activeParameter.id === "scene" && (
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
              )}
              {activeParameter.id === "subjects" && (
                <div className="image-generator-subjects">
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
                          updateSubject(index, {
                            description: event.target.value,
                          })
                        }
                        placeholder={t.subjectDescriptionPlaceholder}
                        rows={3}
                        disabled={isGenerating}
                      />
                      <label
                        htmlFor={`image-generator-subject-position-${index}`}
                      >
                        {t.position}
                      </label>
                      <input
                        id={`image-generator-subject-position-${index}`}
                        type="text"
                        value={subject.position}
                        onChange={(event) =>
                          updateSubject(index, {
                            position: event.target.value,
                          })
                        }
                        placeholder={t.subjectPositionPlaceholder}
                        disabled={isGenerating}
                      />
                      <label
                        htmlFor={`image-generator-subject-action-${index}`}
                      >
                        {t.action}
                      </label>
                      <input
                        id={`image-generator-subject-action-${index}`}
                        type="text"
                        value={subject.action}
                        onChange={(event) =>
                          updateSubject(index, {
                            action: event.target.value,
                          })
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
                </div>
              )}
              {activeParameter.id === "seed" && (
                <div className="image-generator-seed-row">
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
                  <button
                    type="button"
                    className="image-generator-seed-random"
                    onClick={() =>
                      setSeed(
                        String(Math.floor(Math.random() * (MAX_SEED + 1))),
                      )
                    }
                    disabled={isGenerating}
                    aria-label={t.randomSeed}
                    title={t.randomSeed}
                  >
                    ↻
                  </button>
                </div>
              )}
              {detailParameters.map((parameter) =>
                activeParameter.id === parameter.id ? (
                  <input
                    key={parameter.id}
                    id={parameter.inputId}
                    type="text"
                    value={advancedFields[parameter.field]}
                    onChange={(event) =>
                      setAdvancedFields((current) => {
                        const next = { ...current };
                        next[parameter.field] = event.target.value;
                        return next;
                      })
                    }
                    placeholder={parameter.placeholder}
                    disabled={isGenerating}
                  />
                ) : null,
              )}
            </div>
          )}
          <p className="image-generator-note">{t.advancedNote}</p>
        </section>

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
            <label>
              <span>{t.concurrency}</span>
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
            </label>
            <p className="cover-note image-generator-queue-note">
              {t.queueNote}
            </p>
            {mode === "advanced" && (
              <div className="image-generator-credits">
                <dl className="image-generator-credit-grid">
                  <div>
                    <dt>{t.pricePerImage}</dt>
                    <dd>
                      {selectedModel?.pricePerImage === null ||
                      selectedModel?.pricePerImage === undefined
                        ? t.creditUnavailable
                        : formatUsd(selectedModel.pricePerImage)}
                    </dd>
                  </div>
                  <div
                    title={`${t.creditHint}${
                      creditLimit === null
                        ? ""
                        : ` ${t.creditLimitHint.replace(
                            "{limit}",
                            formatUsd(creditLimit),
                          )}`
                    }`}
                  >
                    <dt>{t.credit}</dt>
                    <dd>
                      {credit === null
                        ? t.creditUnavailable
                        : formatUsd(credit)}
                    </dd>
                  </div>
                  <div title={t.accountCreditHint}>
                    <dt>{t.accountCredit}</dt>
                    <dd>
                      {accountCredit === null
                        ? t.creditUnavailable
                        : formatUsd(accountCredit)}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
            <button
              className={`cover-generate action-button action-button-primary ${isGenerating ? "image-generator-stop" : ""}`}
              onClick={() => void startGeneration()}
              disabled={!isGenerating && !queuedPrompts.length}
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
