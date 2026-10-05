import { NextResponse } from "next/server";
import sharp from "sharp";
import { fillPrompt, loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
  type OpenRouterContext,
} from "../../../openrouter/server";
import {
  isRecord,
  normalizeBrief,
  normalizeReview,
  type BiologicalBriefV1,
  type DiagramCandidate,
  type DiagramReview,
  type DiagramUsage,
  type ReferenceSelection,
  type VectorReconstructionV1,
} from "./contracts.ts";
import { getReferenceById, selectReference } from "./reference-catalog.ts";
import { runEditabilityChecks } from "./editability-checks.ts";
import { createPipelineReport } from "./pipeline-report.ts";
import { buildCanonicalSvg } from "./svg-labels.ts";
import {
  normalizeReconstruction,
  sanitizeSvg,
  validateManifestLayering,
} from "./svg-sanitize.ts";
import { POST as legacyDiagramPost } from "./legacy-server.ts";
import { verifyUnderlayCoverage } from "./underlay-check.ts";

const MAX_INPUT_LENGTH = 20_000;
const MAX_REFERENCE_COUNT = 3;
const MAX_REFERENCE_LENGTH = 7_000_000;
const MAX_CANDIDATE_LENGTH = 30_000_000;
const briefPrompt = loadPrompt(
  "image/diagram-generator/prompts/create-brief.md",
);
const rasterPrompt = loadPrompt(
  "image/diagram-generator/prompts/generate-raster.md",
);
const vectorPrompt = loadPrompt(
  "image/diagram-generator/prompts/reconstruct-vector.md",
);
const repairPrompt = loadPrompt(
  "image/diagram-generator/prompts/repair-vector.md",
);
const visualReviewPrompt = loadPrompt(
  "image/diagram-generator/prompts/review-visual.md",
);
const biologyReviewPrompt = loadPrompt(
  "image/diagram-generator/prompts/review-biology.md",
);

const imageDataUrl = /^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i;

type Usage = {
  cost?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};
type ChatResult = {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: Usage;
  error?: { message?: string };
};
type ImageResult = { b64_json?: string; url?: string };
type ImageApiResult = {
  id?: string;
  model?: string;
  data?: ImageResult[];
  usage?: Usage;
  error?: { message?: string };
};
type ImageCatalogResult = {
  data?: Array<{
    id?: string;
    supported_parameters?: Record<string, unknown>;
  }>;
};

let imageCapabilitiesPromise: Promise<Map<string, Set<string>>> | null = null;

async function imageCapabilities(openRouter: OpenRouterContext, model: string) {
  if (!imageCapabilitiesPromise)
    imageCapabilitiesPromise = fetch(
      "https://openrouter.ai/api/v1/images/models",
      {
        headers: { Authorization: `Bearer ${openRouter.apiKey}` },
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Image capability discovery failed.");
        const result = (await response.json()) as ImageCatalogResult;
        return new Map(
          (result.data || [])
            .filter((entry) => typeof entry.id === "string")
            .map((entry) => [
              entry.id!,
              new Set(Object.keys(entry.supported_parameters || {})),
            ]),
        );
      })
      .catch(() => new Map<string, Set<string>>());
  const discovered = (await imageCapabilitiesPromise).get(model);
  if (discovered) return discovered;
  return model.startsWith("openai/gpt-image-")
    ? new Set(["aspect_ratio", "quality", "background", "n"])
    : new Set(["aspect_ratio", "n"]);
}

const briefSchema = {
  type: "object",
  properties: {
    version: { type: "integer", enum: [1] },
    subject: { type: "string" },
    diagramType: {
      type: "string",
      enum: ["anatomy", "process", "cross-section", "sequence"],
    },
    title: { type: "string" },
    subtitle: { type: "string" },
    language: { type: "string", enum: ["en", "cs"] },
    audience: { type: "string" },
    view: { type: "string" },
    structures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          role: { type: "string" },
          required: { type: "boolean" },
        },
        required: ["id", "name", "role", "required"],
        additionalProperties: false,
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          relationship: { type: "string" },
          direction: {
            type: "string",
            enum: ["none", "from-to", "bidirectional"],
          },
        },
        required: ["from", "to", "relationship", "direction"],
        additionalProperties: false,
      },
    },
    composition: {
      type: "object",
      properties: {
        aspectRatio: { type: "string", enum: ["4:3", "3:4", "16:9", "1:1"] },
        panelCount: { type: "integer" },
        notes: { type: "string" },
      },
      required: ["aspectRatio", "panelCount", "notes"],
      additionalProperties: false,
    },
    selectedReferenceId: { type: ["string", "null"] },
    referenceRationale: { type: "string" },
    uncertainties: { type: "array", items: { type: "string" } },
  },
  required: [
    "version",
    "subject",
    "diagramType",
    "title",
    "subtitle",
    "language",
    "audience",
    "view",
    "structures",
    "relationships",
    "composition",
    "selectedReferenceId",
    "referenceRationale",
    "uncertainties",
  ],
  additionalProperties: false,
};

const reconstructionSchema = {
  type: "object",
  properties: {
    version: { type: "integer", enum: [1] },
    canvas: {
      type: "object",
      properties: {
        width: { type: "integer", enum: [1000] },
        height: { type: "integer", enum: [750] },
      },
      required: ["width", "height"],
      additionalProperties: false,
    },
    objects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          briefStructureId: { type: ["string", "null"] },
          role: {
            type: "string",
            enum: ["background", "base", "structure", "detail"],
          },
          description: { type: "string" },
          anchor: {
            type: "object",
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"],
            additionalProperties: false,
          },
          labelPosition: {
            type: ["object", "null"],
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"],
            additionalProperties: false,
          },
          complete: { type: "boolean" },
          underlyingObjectIds: { type: "array", items: { type: "string" } },
        },
        required: [
          "id",
          "briefStructureId",
          "role",
          "description",
          "anchor",
          "labelPosition",
          "complete",
          "underlyingObjectIds",
        ],
        additionalProperties: false,
      },
    },
    uncertainties: { type: "array", items: { type: "string" } },
    svg: { type: "string" },
  },
  required: ["version", "canvas", "objects", "uncertainties", "svg"],
  additionalProperties: false,
};

const reviewSchema = {
  type: "object",
  properties: {
    fidelity: { type: "number" },
    editability: { type: "number" },
    completeness: { type: "number" },
    biologicalConfidence: { type: "number" },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["warning", "error"] },
          category: {
            type: "string",
            enum: [
              "fidelity",
              "biology",
              "editability",
              "labels",
              "completeness",
            ],
          },
          message: { type: "string" },
        },
        required: ["severity", "category", "message"],
        additionalProperties: false,
      },
    },
    repairRecommended: { type: "boolean" },
  },
  required: [
    "fidelity",
    "editability",
    "completeness",
    "biologicalConfidence",
    "summary",
    "findings",
    "repairRecommended",
  ],
  additionalProperties: false,
};

function contentText(result: ChatResult) {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is { text?: unknown } => isRecord(item))
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .join("\n");
}

function parseJson(value: string) {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start)
      return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    throw new Error("OpenRouter returned invalid structured data.");
  }
}

function usage(
  result: { id?: string; model?: string; usage?: Usage },
  requestedModel: string,
): DiagramUsage {
  return {
    generationId: result.id || null,
    model: result.model || requestedModel,
    cost: typeof result.usage?.cost === "number" ? result.usage.cost : null,
    promptTokens:
      typeof result.usage?.prompt_tokens === "number"
        ? result.usage.prompt_tokens
        : null,
    completionTokens:
      typeof result.usage?.completion_tokens === "number"
        ? result.usage.completion_tokens
        : null,
    totalTokens:
      typeof result.usage?.total_tokens === "number"
        ? result.usage.total_tokens
        : null,
  };
}

function normalizePriorUsage(value: unknown): DiagramUsage[] {
  return (Array.isArray(value) ? value : [])
    .filter(isRecord)
    .slice(0, 12)
    .map((record) => ({
      generationId:
        typeof record.generationId === "string"
          ? record.generationId.slice(0, 200)
          : null,
      model:
        typeof record.model === "string"
          ? record.model.slice(0, 200)
          : "unknown",
      cost:
        typeof record.cost === "number" && Number.isFinite(record.cost)
          ? Math.max(0, record.cost)
          : null,
      promptTokens:
        typeof record.promptTokens === "number" &&
        Number.isFinite(record.promptTokens)
          ? Math.max(0, Math.round(record.promptTokens))
          : null,
      completionTokens:
        typeof record.completionTokens === "number" &&
        Number.isFinite(record.completionTokens)
          ? Math.max(0, Math.round(record.completionTokens))
          : null,
      totalTokens:
        typeof record.totalTokens === "number" &&
        Number.isFinite(record.totalTokens)
          ? Math.max(0, Math.round(record.totalTokens))
          : null,
    }));
}

function validateImage(
  value: unknown,
  name: string,
  maximumLength = MAX_REFERENCE_LENGTH,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > maximumLength ||
    !imageDataUrl.test(value)
  )
    throw new Error(`${name} must be a supported image data URL.`);
}

function normalizePalette(value: unknown) {
  if (typeof value === "string") return value.trim().slice(0, 2_000);
  if (!Array.isArray(value) || value.length > 24) return "";
  return value
    .map((entry, index) => {
      if (!isRecord(entry))
        throw new Error(`Palette swatch ${index + 1} is invalid.`);
      const hex = typeof entry.hex === "string" ? entry.hex.toLowerCase() : "";
      if (!/^#[0-9a-f]{6}$/.test(hex))
        throw new Error(
          `Palette swatch ${index + 1} has an invalid RGB colour.`,
        );
      const name =
        typeof entry.name === "string"
          ? entry.name.trim().slice(0, 100)
          : `Swatch ${index + 1}`;
      return `${name}: ${hex}`;
    })
    .join(", ");
}

function validateReferences(value: unknown) {
  const references = Array.isArray(value) ? value : [];
  if (references.length > MAX_REFERENCE_COUNT)
    throw new Error(
      `Use no more than ${MAX_REFERENCE_COUNT} reference images.`,
    );
  references.forEach((item, index) =>
    validateImage(item, `Reference ${index + 1}`),
  );
  return references as string[];
}

function languageInstruction(language: "en" | "cs") {
  return language === "cs"
    ? "Výstupní jazyk: čeština. Všechny viditelné titulky a názvy struktur piš česky a zachovej diakritiku."
    : "Output language: English. Write visible titles and structure names in English.";
}

async function completeJson<T>(
  openRouter: Awaited<ReturnType<typeof getOpenRouterContext>>,
  model: string,
  operation: string,
  messages: Array<Record<string, unknown>>,
  schema: Record<string, unknown>,
  signal?: AbortSignal,
) {
  if (!openRouter) throw new Error("OpenRouter is not configured.");
  const { response, result } = await requestOpenRouter<ChatResult>(
    openRouter,
    "chat/completions",
    operation,
    {
      model,
      temperature: 0,
      max_tokens: 12_000,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: operation.replace(/[^a-z0-9]+/gi, "_").slice(0, 50),
          strict: true,
          schema,
        },
      },
    },
    { signal },
  );
  const raw = contentText(result);
  if (!response.ok || !raw)
    throw new Error(
      result.error?.message || "OpenRouter returned no structured result.",
    );
  return { value: parseJson(raw) as T, usage: usage(result, model) };
}

function referenceSelectionForBrief(
  brief: BiologicalBriefV1,
): ReferenceSelection {
  const selected = getReferenceById(brief.selectedReferenceId);
  if (selected)
    return {
      id: selected.id,
      subject: selected.subject,
      view: selected.view,
      rationale:
        brief.referenceRationale ||
        `Matched to the reviewed composition category “${selected.subject}”.`,
      source: selected.source,
      licence: selected.licence,
      assetPath: selected.assetPath,
    };
  return selectReference(`${brief.subject} ${brief.view}`, brief.diagramType);
}

async function planDiagram(
  openRouter: NonNullable<Awaited<ReturnType<typeof getOpenRouterContext>>>,
  request: string,
  language: "en" | "cs",
  references: string[],
  signal?: AbortSignal,
) {
  const model =
    process.env.OPENROUTER_DIAGRAM_PLANNER_MODEL || "openai/gpt-6.1-sol";
  const catalogue = JSON.stringify(selectReference(request));
  const prompt = `${briefPrompt}\n\n${languageInstruction(language)}\n\nUser request:\n${request}\n\nBest local catalogue match:\n${catalogue}`;
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: prompt },
  ];
  content.push(
    ...references.map((url) => ({ type: "image_url", image_url: { url } })),
  );
  const result = await completeJson<{ brief: unknown }>(
    openRouter,
    model,
    "plan-biological-brief",
    [{ role: "user", content }],
    {
      type: "object",
      properties: { brief: briefSchema },
      required: ["brief"],
      additionalProperties: false,
    },
    signal,
  );
  const candidate = isRecord(result.value) ? result.value.brief : null;
  const brief = normalizeBrief(candidate);
  const selected = selectReference(request, brief.diagramType);
  const finalBrief = normalizeBrief({
    ...brief,
    language,
    selectedReferenceId: selected.id,
  });
  return { brief: finalBrief, reference: selected, usage: result.usage };
}

async function imageData(result: ImageApiResult) {
  const image = result.data?.[0];
  if (!image) return "";
  if (image.b64_json) return `data:image/png;base64,${image.b64_json}`;
  if (!image.url || !/^https:\/\/[^\s]+$/i.test(image.url)) return "";
  const response = await fetch(image.url, { redirect: "error" });
  if (!response.ok)
    throw new Error(
      "The generated diagram candidate could not be downloaded from OpenRouter.",
    );
  const contentType = (response.headers.get("content-type") || "")
    .split(";")[0]
    .toLowerCase();
  if (!/^image\/(png|jpeg|webp)$/.test(contentType))
    throw new Error("OpenRouter returned an unsupported candidate image type.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 22_000_000)
    throw new Error(
      "The generated diagram candidate has an invalid file size.",
    );
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function generateCandidate(
  openRouter: NonNullable<Awaited<ReturnType<typeof getOpenRouterContext>>>,
  brief: BiologicalBriefV1,
  references: string[],
  palette: string,
  model: string,
  index: number,
  signal?: AbortSignal,
) {
  const seed = Math.floor(Math.random() * 2_000_000_000);
  const capabilities = await imageCapabilities(openRouter, model);
  if (references.length && !capabilities.has("input_references"))
    throw new Error(
      `Configured image model ${model} does not support reference images.`,
    );
  const prompt = fillPrompt(rasterPrompt, {
    brief: JSON.stringify(brief, null, 2),
    referenceInstruction: references.length
      ? `Use ${references.length} uploaded reference image${references.length === 1 ? "" : "s"} as visual guidance without copying labels or watermarks.`
      : "No uploaded reference image is available; follow the brief.",
    paletteInstruction:
      palette || "Use a restrained educational palette with clear contrast.",
  });
  const { response, result } = await requestOpenRouter<ImageApiResult>(
    openRouter,
    "images",
    "generate-diagram-candidate",
    {
      model,
      prompt,
      ...(references.length && capabilities.has("input_references")
        ? {
            input_references: references.map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          }
        : {}),
      ...(capabilities.has("aspect_ratio")
        ? { aspect_ratio: brief.composition.aspectRatio }
        : {}),
      ...(capabilities.has("resolution") ? { resolution: "1K" } : {}),
      ...(capabilities.has("output_format") ? { output_format: "png" } : {}),
      ...(capabilities.has("seed") ? { seed } : {}),
      ...(capabilities.has("quality")
        ? { quality: index === 0 ? "medium" : "high" }
        : {}),
      ...(capabilities.has("background") ? { background: "opaque" } : {}),
      ...(capabilities.has("n") ? { n: 1 } : {}),
    },
    { signal },
  );
  const data = await imageData(result);
  if (!response.ok || !data)
    throw new Error(
      result.error?.message ||
        "OpenRouter returned no diagram candidate image.",
    );
  validateImage(data, "Generated diagram candidate", MAX_CANDIDATE_LENGTH);
  return {
    id: `candidate-${index + 1}`,
    data,
    model,
    seed: capabilities.has("seed") ? seed : null,
    generationId: result.id || null,
    usage: usage(result, model),
  } satisfies DiagramCandidate;
}

async function reconstruct(
  openRouter: NonNullable<Awaited<ReturnType<typeof getOpenRouterContext>>>,
  brief: BiologicalBriefV1,
  candidate: string,
  palette: string,
  promptTemplate: string,
  operation: string,
  repairContext: { findings: string; reconstruction: string } | null,
  signal?: AbortSignal,
) {
  validateImage(candidate, "Candidate image", MAX_CANDIDATE_LENGTH);
  const prompt = fillPrompt(promptTemplate, {
    brief: JSON.stringify(brief, null, 2),
    paletteInstruction: palette || "Use a restrained educational palette.",
    findings: repairContext?.findings || "",
    reconstruction: repairContext?.reconstruction || "",
  });
  const result = await completeJson<{ reconstruction: unknown }>(
    openRouter,
    process.env.OPENROUTER_DIAGRAM_VECTOR_MODEL || "anthropic/claude-opus-5.5",
    operation,
    [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: candidate } },
        ],
      },
    ],
    {
      type: "object",
      properties: { reconstruction: reconstructionSchema },
      required: ["reconstruction"],
      additionalProperties: false,
    },
    signal,
  );
  const normalized = normalizeReconstruction(
    result.value && isRecord(result.value) ? result.value.reconstruction : null,
    brief,
  );
  const sanitized = sanitizeSvg(
    normalized.svg,
    normalized.canvas.width,
    normalized.canvas.height,
  );
  validateManifestLayering(
    normalized.objects,
    sanitized.objectIds,
    sanitized.objectPositions,
  );
  const probedUnderlays = await verifyUnderlayCoverage(
    sanitized.inner,
    normalized.objects,
  );
  const canonical = buildCanonicalSvg(
    sanitized.inner,
    brief,
    normalized.objects,
  );
  const checks = runEditabilityChecks(
    canonical.svg,
    brief,
    normalized.objects,
    sanitized.elementCount,
    sanitized.pathCount,
  );
  checks.push(...canonical.checks);
  checks.push({
    level: "pass",
    message: `Rasterized hide-object probes confirmed underlay coverage for ${probedUnderlays} movable object${probedUnderlays === 1 ? "" : "s"}.`,
  });
  if (brief.uncertainties.length)
    checks.push({
      level: "warning",
      message: `The brief records ${brief.uncertainties.length} biological uncertainty${brief.uncertainties.length === 1 ? "" : "ies"}; review them before publication.`,
    });
  return {
    reconstruction: normalized,
    svg: canonical.svg,
    checks,
    usage: result.usage,
    model: result.usage.model,
  };
}

async function renderSvgPreview(svg: string) {
  const png = await sharp(Buffer.from(svg), { density: 144 })
    .resize(1000, 750, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
  if (!png.length || png.length > 12_000_000)
    throw new Error("The rendered SVG preview has an invalid file size.");
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function reviewOne(
  openRouter: NonNullable<Awaited<ReturnType<typeof getOpenRouterContext>>>,
  model: string,
  operation: string,
  prompt: string,
  images: string[],
  signal?: AbortSignal,
) {
  const result = await completeJson<DiagramReview>(
    openRouter,
    model,
    operation,
    [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...images.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ],
      },
    ],
    reviewSchema,
    signal,
  );
  return { review: normalizeReview(result.value), usage: result.usage };
}

function mergeReviews(
  first: DiagramReview,
  second: DiagramReview,
): DiagramReview {
  return {
    fidelity: first.fidelity,
    editability: first.editability,
    completeness: first.completeness,
    biologicalConfidence: second.biologicalConfidence,
    summary: [first.summary, second.summary].filter(Boolean).join(" "),
    findings: [...first.findings, ...second.findings].slice(0, 20),
    repairRecommended: first.repairRecommended || second.repairRecommended,
  };
}

function reportFor(
  brief: BiologicalBriefV1,
  reference: ReferenceSelection,
  reconstruction: VectorReconstructionV1,
  checks: ReturnType<typeof runEditabilityChecks>,
  model: string,
  candidateModel: string,
  referenceCount: number,
  usageRecords: DiagramUsage[],
  review: DiagramReview | null,
) {
  return createPipelineReport({
    brief,
    reference,
    reconstruction,
    checks,
    model,
    candidateModel,
    referenceCount,
    usage: usageRecords,
    review,
  });
}

export async function POST(request: Request) {
  try {
    const legacyRequest = request.clone();
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    if (!action && typeof body.request === "string")
      return legacyDiagramPost(legacyRequest);
    const openRouter = await getOpenRouterContext(request, "bio");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("bio") },
        { status: 503 },
      );
    const language = body.language === "cs" ? "cs" : "en";
    const references =
      action === "plan" || action === "candidates"
        ? validateReferences(body.references)
        : [];
    const referenceCount =
      typeof body.referenceCount === "number" &&
      Number.isInteger(body.referenceCount) &&
      body.referenceCount >= 0 &&
      body.referenceCount <= MAX_REFERENCE_COUNT
        ? body.referenceCount
        : references.length;
    if (action === "plan") {
      const input = typeof body.request === "string" ? body.request.trim() : "";
      if (!input || input.length > MAX_INPUT_LENGTH)
        return NextResponse.json(
          {
            error: `Describe the diagram in at most ${MAX_INPUT_LENGTH} characters.`,
          },
          { status: 400 },
        );
      const planned = await planDiagram(
        openRouter,
        input,
        language,
        references,
        request.signal,
      );
      return NextResponse.json(planned);
    }
    if (action === "candidates") {
      const brief = normalizeBrief(body.brief);
      const palette = normalizePalette(body.palette);
      const draftModel =
        process.env.OPENROUTER_DIAGRAM_DRAFT_MODEL ||
        "openai/gpt-image-2.5-flare";
      const finalModel =
        process.env.OPENROUTER_DIAGRAM_IMAGE_MODEL ||
        "openai/gpt-image-2.5-sunburst";
      const generated = await Promise.allSettled([
        generateCandidate(
          openRouter,
          brief,
          references,
          palette,
          draftModel,
          0,
          request.signal,
        ),
        generateCandidate(
          openRouter,
          brief,
          references,
          palette,
          finalModel,
          1,
          request.signal,
        ),
      ]);
      const candidates = generated
        .filter(
          (result): result is PromiseFulfilledResult<DiagramCandidate> =>
            result.status === "fulfilled",
        )
        .map((result) => result.value);
      if (!candidates.length) {
        const reasons = generated
          .filter(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected",
          )
          .map((result) =>
            result.reason instanceof Error
              ? result.reason.message
              : "Candidate generation failed.",
          );
        throw new Error(reasons.join(" "));
      }
      return NextResponse.json({
        brief,
        reference: referenceSelectionForBrief(brief),
        candidates,
        warnings: generated
          .filter((result) => result.status === "rejected")
          .map(() => "One configured image model did not return a candidate."),
      });
    }
    if (action === "vectorize" || action === "repair") {
      const brief = normalizeBrief(body.brief);
      const candidate = body.candidate;
      validateImage(candidate, "Candidate image", MAX_CANDIDATE_LENGTH);
      const palette = normalizePalette(body.palette);
      let repairContext: { findings: string; reconstruction: string } | null =
        null;
      if (action === "repair") {
        const previous = normalizeReconstruction(body.reconstruction, brief);
        const previousSvg = sanitizeSvg(
          previous.svg,
          previous.canvas.width,
          previous.canvas.height,
        );
        validateManifestLayering(
          previous.objects,
          previousSvg.objectIds,
          previousSvg.objectPositions,
        );
        await verifyUnderlayCoverage(previousSvg.inner, previous.objects);
        const findings = (Array.isArray(body.findings) ? body.findings : [])
          .filter(isRecord)
          .map((finding) => ({
            severity: finding.severity === "error" ? "error" : "warning",
            category:
              typeof finding.category === "string"
                ? finding.category.slice(0, 40)
                : "editability",
            message:
              typeof finding.message === "string"
                ? finding.message.trim().slice(0, 300)
                : "",
          }))
          .filter((finding) => finding.message)
          .slice(0, 20);
        if (!findings.length)
          throw new Error("A repair request needs validated review findings.");
        repairContext = {
          findings: JSON.stringify(findings, null, 2),
          reconstruction: JSON.stringify(previous, null, 2),
        };
      }
      const result = await reconstruct(
        openRouter,
        brief,
        candidate,
        palette,
        action === "repair" ? repairPrompt : vectorPrompt,
        action === "repair" ? "repair-vector" : "reconstruct-vector",
        repairContext,
        request.signal,
      );
      const reference = referenceSelectionForBrief(brief);
      const candidateModel =
        typeof body.candidateModel === "string"
          ? body.candidateModel
          : "unknown";
      const report = reportFor(
        brief,
        reference,
        result.reconstruction,
        result.checks,
        result.model,
        candidateModel,
        referenceCount,
        [...normalizePriorUsage(body.priorUsage), result.usage],
        null,
      );
      return NextResponse.json({
        svg: result.svg,
        report,
        checks: result.checks,
        model: result.model,
        brief,
        reconstruction: result.reconstruction,
        review: null,
        usage: result.usage,
      });
    }
    if (action === "review") {
      const brief = normalizeBrief(body.brief);
      const candidate = body.candidate;
      validateImage(candidate, "Candidate image", MAX_CANDIDATE_LENGTH);
      const reconstruction = normalizeReconstruction(
        body.reconstruction,
        brief,
      );
      const sanitized = sanitizeSvg(
        reconstruction.svg,
        reconstruction.canvas.width,
        reconstruction.canvas.height,
      );
      validateManifestLayering(
        reconstruction.objects,
        sanitized.objectIds,
        sanitized.objectPositions,
      );
      await verifyUnderlayCoverage(sanitized.inner, reconstruction.objects);
      const canonical = buildCanonicalSvg(
        sanitized.inner,
        brief,
        reconstruction.objects,
      );
      const vectorPreview = await renderSvgPreview(canonical.svg);
      const visualModel =
        process.env.OPENROUTER_DIAGRAM_VISUAL_REVIEW_MODEL ||
        "google/gemini-3.8-flash";
      const biologyModel =
        process.env.OPENROUTER_DIAGRAM_CONTENT_REVIEW_MODEL ||
        "openai/gpt-6.1-sol";
      const context = `\n\nThe first image is the approved raster candidate. The second image is the rendered canonical SVG.\n\nBIOLOGICAL BRIEF:\n${JSON.stringify(brief, null, 2)}\n\nSEMANTIC OBJECT MANIFEST:\n${JSON.stringify(reconstruction.objects, null, 2)}`;
      const reviewImages = [candidate, vectorPreview];
      const [visual, biology] = await Promise.all([
        reviewOne(
          openRouter,
          visualModel,
          "review-diagram-visual",
          `${visualReviewPrompt}${context}`,
          reviewImages,
          request.signal,
        ),
        reviewOne(
          openRouter,
          biologyModel,
          "review-diagram-biology",
          `${biologyReviewPrompt}${context}`,
          reviewImages,
          request.signal,
        ),
      ]);
      return NextResponse.json({
        review: mergeReviews(visual.review, biology.review),
        usage: [visual.usage, biology.usage],
      });
    }
    return NextResponse.json(
      { error: "Unknown diagram pipeline action." },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      return new Response(null, { status: 499 });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Diagram pipeline failed.",
      },
      { status: 500 },
    );
  }
}
