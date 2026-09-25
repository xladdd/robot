import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { fillPrompt, loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
  type OpenRouterContext,
} from "../../../openrouter/server";
import {
  createFallbackCoverPlan,
  planCoverConcepts,
  type PlannerInput,
} from "./concept-plan";
import type {
  CoverAudience,
  CoverSubject,
  PlannedCoverConcept,
  ReferenceGuidance,
} from "./types";

const MAX_REFERENCE_SIZE = 7_000_000;
const MAX_KEYWORDS_LENGTH = 1_500;
const MAX_CUSTOM_SUBJECT_LENGTH = 300;
const MAX_PREFERENCE_LENGTH = 1_000;
const MAX_SEED = 2_000_000_000;
const FLUX_PRO_MODEL = "black-forest-labs/flux.2-pro" as const;
const GEMINI_MODEL = "google/gemini-3.1-flash-lite-image" as const;
const FLUX_KLEIN_MODEL = "black-forest-labs/flux.2-klein-4b" as const;
const DEFAULT_MODEL = FLUX_PRO_MODEL;
const COVER_MODE = "sketch" as const;

type CoverModel =
  typeof FLUX_PRO_MODEL | typeof GEMINI_MODEL | typeof FLUX_KLEIN_MODEL;
type GenerationCount = 2 | 4;

type ImageResult = {
  b64_json?: string;
  media_type?: string;
  url?: string;
};

type Usage = {
  cost?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type CoverRequest = {
  mode?: unknown;
  audience?: unknown;
  subject?: unknown;
  customSubject?: unknown;
  keywords?: unknown;
  references?: unknown;
  preference?: unknown;
  generationCount?: unknown;
  model?: unknown;
};

type DirectionPreference = {
  image?: string;
  text?: string;
};

type GeneratedCover = {
  data: string;
  generationId?: string;
  usage: {
    cost: number | null;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
};

class CoverRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoverRequestError";
  }
}

const coverPrompt = loadPrompt("image/cover-generator/prompts/sketch.md");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImageDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_REFERENCE_SIZE &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)
  );
}

function outputDataUrl(image: ImageResult): string {
  if (image.b64_json) {
    const mediaType = image.media_type?.trim() || "image/jpeg";
    if (!/^image\/[a-z0-9.+-]+$/i.test(mediaType))
      throw new Error("OpenRouter returned an invalid image media type.");
    return `data:${mediaType};base64,${image.b64_json}`;
  }
  return image.url || "";
}

function nextSeed(usedSeeds: Set<number>): number {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = randomInt(0, MAX_SEED);
    if (!usedSeeds.has(candidate)) {
      usedSeeds.add(candidate);
      return candidate;
    }
  }
  throw new Error("No unique FLUX seed is available.");
}

function parseGenerationCount(value: unknown): GenerationCount {
  if (value === undefined) return 4;
  if (value === 2 || value === 4) return value;
  throw new CoverRequestError("generationCount must be 2 or 4.");
}

function parseModel(value: unknown): CoverModel {
  if (value === undefined) return DEFAULT_MODEL;
  if (
    value === FLUX_PRO_MODEL ||
    value === GEMINI_MODEL ||
    value === FLUX_KLEIN_MODEL
  )
    return value;
  throw new CoverRequestError(
    `Unknown cover model. Use ${FLUX_PRO_MODEL}, ${GEMINI_MODEL}, or ${FLUX_KLEIN_MODEL}.`,
  );
}

const audiences: readonly CoverAudience[] = [
  "preschool",
  "primary",
  "lower-secondary",
  "upper-secondary",
];

const subjects: readonly CoverSubject[] = [
  "preschool-general",
  "primary-general",
  "czech-language",
  "literature",
  "foreign-language",
  "mathematics",
  "physics",
  "chemistry",
  "biology-natural-science",
  "geography",
  "history",
  "civics-social-science",
  "computing-technology",
  "vocational-subject",
  "exam-preparation",
  "other",
];

function parseAudience(value: unknown): CoverAudience {
  if (typeof value === "string" && audiences.includes(value as CoverAudience))
    return value as CoverAudience;
  throw new CoverRequestError("Choose an audience before generating.");
}

function parseSubject(value: unknown): CoverSubject {
  if (typeof value === "string" && subjects.includes(value as CoverSubject))
    return value as CoverSubject;
  throw new CoverRequestError("Choose a subject before generating.");
}

function parseShortText(
  value: unknown,
  maxLength: number,
  fieldName: string,
): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string")
    throw new CoverRequestError(`${fieldName} must be text.`);
  return value.trim().slice(0, maxLength);
}

function parseReferences(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new CoverRequestError(
      "references must be an array of image data URLs.",
    );
  if (value.length > 3)
    throw new CoverRequestError(
      "A maximum of three reference images is allowed.",
    );
  return value.map((reference, index) => {
    if (!isImageDataUrl(reference))
      throw new CoverRequestError(
        `Reference ${index + 1} must be a PNG, JPEG, or WebP data URL under 7 MB.`,
      );
    return reference;
  });
}

function parsePreference(value: unknown): DirectionPreference {
  if (value === undefined) return {};
  if (isImageDataUrl(value)) return { image: value };
  if (typeof value === "string" && !value.trim().startsWith("data:"))
    return { text: value.trim().slice(0, MAX_PREFERENCE_LENGTH) };
  throw new CoverRequestError(
    "preference must be an image data URL or short text.",
  );
}

async function generate(
  openRouter: OpenRouterContext,
  model: CoverModel,
  prompt: string,
  seed?: number,
  operation = "generate-cover-image",
): Promise<GeneratedCover> {
  const baseRequest = {
    model,
    prompt,
    aspect_ratio: "3:4" as const,
  };
  const isFluxModel = model === FLUX_PRO_MODEL || model === FLUX_KLEIN_MODEL;
  const requestBody = isFluxModel
    ? {
        ...baseRequest,
        resolution:
          model === FLUX_KLEIN_MODEL ? ("512" as const) : ("1K" as const),
        output_format: "jpeg" as const,
        seed,
      }
    : {
        ...baseRequest,
        resolution: "1K" as const,
        n: 1 as const,
      };

  const { response, result } = await requestOpenRouter<{
    id?: string;
    data?: ImageResult[];
    usage?: Usage;
    error?: { message?: string };
  }>(openRouter, "images", operation, requestBody);
  const data = result.data?.[0] ? outputDataUrl(result.data[0]) : "";
  if (!response.ok || !data)
    throw new Error(result.error?.message || "OpenRouter returned no image.");
  return {
    data,
    generationId: result.id,
    usage: {
      cost: typeof result.usage?.cost === "number" ? result.usage.cost : null,
      promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null,
      totalTokens: result.usage?.total_tokens ?? null,
    },
  };
}

function imageConcept(
  concept: PlannedCoverConcept,
  subject: CoverSubject,
): PlannedCoverConcept {
  if (subject !== "czech-language") return concept;
  return {
    ...concept,
    coreIdea:
      "A physical visual metaphor for exchange, interpretation, and shared ideas.",
    heroSubject:
      "a sculptural system of broad folded ribbons, solid blocks, and one coloured orb",
    supportingElements: [
      "large connected material forms",
      "open colour fields",
      "restrained layered shadows",
    ],
  };
}

function conceptInstruction(
  concept: PlannedCoverConcept,
  guidance: ReferenceGuidance,
  subject: CoverSubject,
): string {
  const imagePlan = imageConcept(concept, subject);
  return JSON.stringify({
    referenceGuidance: {
      audienceCharacter: guidance.audienceCharacter,
      paletteCharacter: guidance.paletteCharacter,
      finish: guidance.finish,
      energy: guidance.energy,
      recurringMaterials: guidance.recurringMaterials,
      acceptableRenderingApproaches: guidance.acceptableRenderingApproaches,
    },
    concept: {
      id: imagePlan.id,
      coreIdea: imagePlan.coreIdea,
      heroSubject: imagePlan.heroSubject,
      supportingElements: imagePlan.supportingElements,
      composition: imagePlan.composition,
      viewpoint: imagePlan.viewpoint,
      renderingApproach: imagePlan.renderingApproach,
      palette: imagePlan.palette,
      lighting: imagePlan.lighting,
      quietSpace: imagePlan.quietSpace,
    },
  });
}

function imageSubject(subject: CoverSubject, customSubject: string) {
  if (subject === "czech-language")
    return "communication, expression, interpretation, and shared ideas";
  return subject === "other" ? customSubject : subject;
}

function buildPrompt(
  plan: PlannedCoverConcept,
  guidance: ReferenceGuidance,
  audience: CoverAudience,
  subject: CoverSubject,
  customSubject: string,
) {
  return fillPrompt(coverPrompt, {
    audience,
    subject: imageSubject(subject, customSubject),
    referenceGuidance: JSON.stringify(guidance),
    concept: conceptInstruction(plan, guidance, subject),
  });
}

function requestError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const openRouter = await getOpenRouterContext(request, "cover");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("cover") },
        { status: 503 },
      );

    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      return requestError("The cover request must contain valid JSON.");
    }
    if (!isRecord(parsedBody)) return requestError("Invalid cover request.");
    const body = parsedBody as CoverRequest;
    if (body.mode !== COVER_MODE)
      return requestError("Unknown cover generation mode.");

    const audience = parseAudience(body.audience);
    const subject = parseSubject(body.subject);
    const customSubject = parseShortText(
      body.customSubject,
      MAX_CUSTOM_SUBJECT_LENGTH,
      "customSubject",
    );
    if (subject === "other" && !customSubject)
      throw new CoverRequestError(
        "Describe the custom subject before generating.",
      );
    const keywords = parseShortText(
      body.keywords,
      MAX_KEYWORDS_LENGTH,
      "keywords",
    );
    const references = parseReferences(body.references);
    const preference = parsePreference(body.preference);
    const generationCount = parseGenerationCount(body.generationCount);
    const model = parseModel(body.model);
    const plannerInput: PlannerInput = {
      audience,
      subject,
      customSubject,
      keywords,
      references,
      preferredImage: preference.image,
      preferredText: preference.text,
      count: generationCount,
    };

    let plan;
    try {
      plan = await planCoverConcepts(openRouter, plannerInput);
    } catch (error) {
      plan = createFallbackCoverPlan(plannerInput);
      plan.metadata.warning =
        error instanceof Error
          ? `The concept planner was unavailable (${error.message}); local directions were used.`
          : plan.metadata.warning;
    }

    const usedSeeds = new Set<number>();
    const generateSketch = async (concept: PlannedCoverConcept) => {
      const seed =
        model === FLUX_PRO_MODEL || model === FLUX_KLEIN_MODEL
          ? nextSeed(usedSeeds)
          : undefined;
      const generated = await generate(
        openRouter,
        model,
        buildPrompt(
          concept,
          plan.referenceGuidance,
          audience,
          subject,
          customSubject,
        ),
        seed,
      );
      return {
        ...generated,
        model,
        seed: seed ?? null,
        direction: concept.id,
        concept,
      };
    };

    const settled = await Promise.allSettled(
      plan.concepts.map((concept) => generateSketch(concept)),
    );
    const images = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const warnings = [
      ...(plan.metadata.warning ? [plan.metadata.warning] : []),
      ...settled.flatMap((result, index) =>
        result.status === "rejected"
          ? [
              `Concept ${index + 1} failed with the selected image model: ${result.reason instanceof Error ? result.reason.message : "generation failed"}`,
            ]
          : [],
      ),
    ];
    if (!images.length)
      throw new Error(warnings[0] || "All cover concepts failed.");
    return NextResponse.json({
      images,
      warnings,
      planner: plan.metadata,
    });
  } catch (error) {
    if (error instanceof CoverRequestError) return requestError(error.message);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Cover generation failed.",
      },
      { status: 500 },
    );
  }
}
