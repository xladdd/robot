import "server-only";

import { loadPrompt } from "../../../load-prompt";
import {
  requestOpenRouter,
  type OpenRouterContext,
} from "../../../openrouter/server";
import type {
  CoverAudience,
  CoverConcept,
  CoverConceptObject,
  CoverPlannerMetadata,
  CoverSubject,
  PlannedCoverConcept,
} from "./types";

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
  hero_subjects: {
    type: "array",
    minItems: 1,
    maxItems: 2,
    items: objectSchema,
  },
  supporting_objects: {
    type: "array",
    minItems: 0,
    maxItems: 2,
    items: objectSchema,
  },
  scene: { type: "string" },
  upper_background: { type: "string" },
  style: { type: "string" },
  palette: { type: "string" },
  lighting: { type: "string" },
  mood_treatment: { type: "string" },
} as const;

function responseSchema(count: 2 | 4) {
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
            "hero_subjects",
            "supporting_objects",
            "scene",
            "upper_background",
            "style",
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
  references: string[];
  preferredImage?: string;
  preferredText?: string;
  count: 2 | 4;
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
    !Array.isArray(value.hero_subjects) ||
    value.hero_subjects.length < 1 ||
    value.hero_subjects.length > 2 ||
    value.hero_subjects.some((item) => !isConceptObject(item)) ||
    !Array.isArray(value.supporting_objects) ||
    value.supporting_objects.length > 2 ||
    value.supporting_objects.some((item) => !isConceptObject(item))
  )
    return false;
  return (
    text(value.scene) &&
    text(value.upper_background) &&
    text(value.style) &&
    text(value.palette) &&
    text(value.lighting) &&
    text(value.mood_treatment)
  );
}

const subjectPosition =
  "Small focal subject anchored close to the bottom edge, entirely beneath the horizontal midpoint.";
const subjectScale =
  "Compact, occupying only the bottom quarter of the portrait.";
const composition = {
  framing: "Wide environmental composition with the camera pulled well back.",
  focal_cluster:
    "All focal subjects and props form one compact cluster near the bottom edge.",
  headroom:
    "The upper half is dominated by a softly detailed, naturally varied continuation of the same environment.",
  continuity:
    "Perspective, depth, texture, light, and colour flow naturally from the lower scene through the upper background.",
  format: "Portrait 3:4 full bleed.",
};

function serializeObject(object: CoverConceptObject) {
  return {
    description: object.description,
    position: subjectPosition,
    scale: subjectScale,
    action: object.action,
    appearance: object.appearance,
  };
}

export function serializeCoverConcept(concept: CoverConcept): string {
  return JSON.stringify({
    subjects: concept.hero_subjects.map(serializeObject),
    style: concept.style,
    scene: concept.scene,
    upper_background: concept.upper_background,
    composition,
    supporting_objects: concept.supporting_objects.map(serializeObject),
    palette: concept.palette,
    lighting: concept.lighting,
    mood_treatment: concept.mood_treatment,
  });
}

export function normalizeCoverConcepts(value: unknown, count: 2 | 4) {
  if (!isRecord(value) || !Array.isArray(value.concepts)) return null;
  if (
    value.concepts.length !== count ||
    value.concepts.some((item) => !isConcept(item))
  )
    return null;
  return value.concepts.map((concept, index) => ({
    id: `concept-${String(index + 1).padStart(2, "0")}`,
    concept,
    prompt: serializeCoverConcept(concept),
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
    input.preferredText
      ? `Broad preference from the user: ${input.preferredText}`
      : "",
    input.references.length
      ? `The following ${input.references.length} image(s) are reference covers for loose visual inspiration only.`
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
  input.references.forEach((url, index) => {
    content.push({ type: "text", text: `Reference cover ${index + 1}:` });
    content.push({ type: "image_url", image_url: { url } });
  });
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
  const concepts = normalizeCoverConcepts(parsed, input.count);
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
