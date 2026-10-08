import "server-only";

import { loadPrompt } from "../../../load-prompt";
import {
  requestOpenRouter,
  type OpenRouterContext,
} from "../../../openrouter/server";
import {
  coverCompositionStrategies,
  coverConceptModes,
  coverTreatments,
  type CoverAudience,
  type CoverCompositionStrategy,
  type CoverConcept,
  type CoverConceptObject,
  type CoverPlannerMetadata,
  type CoverStyleSelection,
  type CoverSubject,
  type CoverTreatment,
  type PlannedCoverConcept,
} from "./types";
import { coverStylePrompts as explicitStylePrompts } from "./style-catalog";

export const COVER_PLANNER_MODEL = "mistralai/mistral-medium-3-5" as const;
export const COVER_PLANNER_FALLBACK_MODEL =
  "mistralai/ministral-14b-2512" as const;

const plannerPrompt = loadPrompt(
  "image/cover-generator/prompts/plan-concepts.md",
);

const objectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string" },
    action: { type: "string" },
    appearance: { type: "string" },
  },
  required: ["description", "action", "appearance"],
} as const;

const conceptProperties = {
  concept_mode: {
    type: "string",
    enum: coverConceptModes,
  },
  composition_strategy: {
    type: "string",
    enum: coverCompositionStrategies,
  },
  hero_subjects: {
    type: "array",
    minItems: 1,
    maxItems: 2,
    items: objectSchema,
  },
  supporting_objects: {
    type: "array",
    minItems: 1,
    maxItems: 3,
    items: objectSchema,
  },
  scene: { type: "string" },
  upper_background: { type: "string" },
  style: { type: "string" },
  treatment: {
    type: "string",
    enum: coverTreatments,
  },
  palette: { type: "string" },
  lighting: { type: "string" },
  mood_treatment: { type: "string" },
} as const;

function responseSchema(count: 1 | 2 | 4) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      concepts: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: {
          type: "object",
          additionalProperties: false,
          properties: conceptProperties,
          required: [
            "concept_mode",
            "composition_strategy",
            "hero_subjects",
            "supporting_objects",
            "scene",
            "upper_background",
            "style",
            "treatment",
            "palette",
            "lighting",
            "mood_treatment",
          ],
        },
      },
    },
    required: ["concepts"],
  } as const;
}

type PlannerResult = {
  concepts: PlannedCoverConcept[];
  metadata: CoverPlannerMetadata;
};

type PlannerResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }> };
  }>;
  usage?: {
    cost?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
};

type PlannerInput = {
  audience: CoverAudience;
  subject: CoverSubject;
  customSubject: string;
  keywords: string;
  style: CoverStyleSelection;
  preferredImage?: string;
  preferredText?: string;
  count: 1 | 2 | 4;
};

function parseContent(
  content: string | Array<{ type?: string; text?: string }> | undefined,
) {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((part) => (part.type === "text" ? part.text || "" : ""))
      .join("\n");
  return "";
}

function parsePlannerJson(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("The cover concept planner returned invalid JSON.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isConceptObject(value: unknown): value is CoverConceptObject {
  if (!isRecord(value)) return false;
  return (
    text(value.description) && text(value.action) && text(value.appearance)
  );
}

function isConcept(value: unknown): value is CoverConcept {
  if (!isRecord(value)) return false;
  if (
    !coverConceptModes.includes(
      value.concept_mode as (typeof coverConceptModes)[number],
    ) ||
    !coverCompositionStrategies.includes(
      value.composition_strategy as CoverCompositionStrategy,
    ) ||
    !Array.isArray(value.hero_subjects) ||
    value.hero_subjects.length < 1 ||
    value.hero_subjects.length > 2 ||
    value.hero_subjects.some((item) => !isConceptObject(item)) ||
    !Array.isArray(value.supporting_objects) ||
    value.supporting_objects.length < 1 ||
    value.supporting_objects.length > 3 ||
    value.supporting_objects.some((item) => !isConceptObject(item))
  )
    return false;
  return (
    text(value.scene) &&
    text(value.upper_background) &&
    text(value.style) &&
    coverTreatments.includes(value.treatment as CoverTreatment) &&
    text(value.palette) &&
    text(value.lighting) &&
    text(value.mood_treatment)
  );
}

const heroPosition =
  "Primary focal anchor across the lower and middle image field.";
const heroScale =
  "Medium to medium-large and clearly readable at thumbnail size.";
const supportingPosition =
  "Subordinate element arranged in a clear visual relationship with the hero across the lower and middle image field, using varied depth and spacing.";
const supportingScale =
  "Small to medium, clearly secondary to the hero but still recognisable.";

const strategyInstructions: Record<CoverCompositionStrategy, string> = {
  "immersive edge crop":
    "Use a large asymmetrical focal crop entering naturally from a lower or side edge.",
  "diagonal progression":
    "Arrange related focal elements in a clear diagonal progression with visual movement.",
  "layered editorial montage":
    "Build overlapping foreground and middle-ground layers with controlled depth.",
  "asymmetric counterpoint":
    "Balance one dominant anchor with smaller related elements across the opposing side.",
  "environmental sweep":
    "Embed the focal elements in a broad continuous environmental or material flow.",
  "specimen constellation":
    "Arrange related elements as an intentionally spaced, connected visual system.",
};

function compositionFor(strategy: CoverCompositionStrategy) {
  return {
    strategy: strategyInstructions[strategy],
    canvas:
      "Full-bleed edge-to-edge artwork. The environment, colour fields, texture, and image-making marks continue naturally beyond all four canvas edges.",
    focal_field:
      "Focal subjects occupy the lower and middle image field with substantial presence, layered relationships, and varied scale.",
    title_area:
      "The upper third remains calm and low-contrast for later typography while preserving the same continuous background, atmospheric light, broad forms, and subtle texture.",
    background_continuity:
      "One continuous environment flows from bottom to top. Perspective, depth, material, texture, light, and colour continue naturally through the title area.",
    format: "Portrait 3:4.",
  };
}

function serializeHero(object: CoverConceptObject) {
  return {
    description: object.description,
    position: heroPosition,
    scale: heroScale,
    action: object.action,
    appearance: object.appearance,
  };
}

function serializeSupportingObject(object: CoverConceptObject) {
  return {
    description: object.description,
    position: supportingPosition,
    scale: supportingScale,
    action: object.action,
    appearance: object.appearance,
  };
}

export function serializeCoverConcept(
  concept: CoverConcept,
  styleSelection: CoverStyleSelection = "automatic",
): string {
  const treatment =
    styleSelection === "automatic" ? concept.treatment : styleSelection;
  return JSON.stringify({
    subjects: concept.hero_subjects.map(serializeHero),
    style:
      styleSelection === "automatic"
        ? concept.style
        : explicitStylePrompts[styleSelection],
    treatment,
    ...(styleSelection === "automatic" ? {} : { style_details: concept.style }),
    concept_approach: concept.concept_mode,
    composition: compositionFor(concept.composition_strategy),
    scene: concept.scene,
    upper_background: concept.upper_background,
    supporting_objects: concept.supporting_objects.map(
      serializeSupportingObject,
    ),
    palette: concept.palette,
    lighting: concept.lighting,
    mood_treatment: concept.mood_treatment,
  });
}

export function normalizeCoverConcepts(
  value: unknown,
  count: 1 | 2 | 4,
  styleSelection: CoverStyleSelection = "automatic",
) {
  if (!isRecord(value) || !Array.isArray(value.concepts)) return null;
  if (
    value.concepts.length !== count ||
    value.concepts.some((item) => !isConcept(item))
  )
    return null;
  return value.concepts.map((concept, index) => ({
    id: `concept-${String(index + 1).padStart(2, "0")}`,
    concept,
    prompt: serializeCoverConcept(concept, styleSelection),
  }));
}

function usageFrom(result: PlannerResponse) {
  return {
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

export async function planCoverConcepts(
  openRouter: OpenRouterContext,
  input: PlannerInput,
): Promise<PlannerResult> {
  const requestText = [
    `Create ${input.count} different structured concepts for textbook cover art.`,
    `School level: ${input.audience}`,
    `Subject: ${input.subject === "other" ? input.customSubject : input.subject}`,
    input.keywords ? `Theme / keywords: ${input.keywords}` : "",
    input.style === "automatic"
      ? "Visual treatment: automatic. Choose the most subject-appropriate treatment from the allowed enum."
      : `Required visual treatment: ${input.style}. Copy this exact treatment value and make the style description compatible with it; do not choose another medium.`,
    input.preferredText
      ? `Broad preference from the user: ${input.preferredText}`
      : "",
    input.preferredImage
      ? "The final image is a preferred earlier concept. Use it only as broad inspiration, not as a template."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: requestText },
  ];
  if (input.preferredImage) {
    content.push({ type: "text", text: "Preferred earlier concept:" });
    content.push({
      type: "image_url",
      image_url: { url: input.preferredImage },
    });
  }

  const { response, result } = await requestOpenRouter<PlannerResponse>(
    openRouter,
    "chat/completions",
    "plan-cover-concepts",
    {
      model: COVER_PLANNER_MODEL,
      models: [COVER_PLANNER_MODEL, COVER_PLANNER_FALLBACK_MODEL],
      route: "fallback",
      provider: { require_parameters: true },
      temperature: 0.4,
      max_tokens: 4_000,
      messages: [
        { role: "system", content: plannerPrompt },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "cover_art_concepts",
          strict: true,
          schema: responseSchema(input.count),
        },
      },
    },
  );
  if (!response.ok)
    throw new Error(
      result.error?.message || "The cover concept planner failed.",
    );
  const parsed = parsePlannerJson(
    parseContent(result.choices?.[0]?.message?.content),
  );
  const concepts = normalizeCoverConcepts(parsed, input.count, input.style);
  if (!concepts)
    throw new Error(
      "The cover concept planner did not return valid structured concepts.",
    );
  return {
    concepts,
    metadata: {
      model: result.model || COVER_PLANNER_MODEL,
      generationId: result.id,
      usage: usageFrom(result),
      usedFallback:
        (result.model || COVER_PLANNER_MODEL) !== COVER_PLANNER_MODEL,
    },
  };
}

export type { PlannerInput, PlannerResult };
