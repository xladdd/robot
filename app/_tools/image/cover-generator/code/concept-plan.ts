import "server-only";

import { fillPrompt, loadPrompt } from "../../../load-prompt";
import {
  requestOpenRouter,
  type OpenRouterContext,
} from "../../../openrouter/server";
import type {
  CoverAudience,
  CoverPlannerMetadata,
  CoverSubject,
  PlannedCoverConcept,
  ReferenceGuidance,
} from "./types";

export const COVER_PLANNER_MODEL = "mistralai/mistral-medium-3-5" as const;
export const COVER_PLANNER_FALLBACK_MODEL =
  "mistralai/ministral-14b-2512" as const;

const plannerPrompt = loadPrompt(
  "image/cover-generator/prompts/plan-concepts.md",
);

const emptyUsage = {
  cost: null,
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
};

const referenceGuidanceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    audienceCharacter: { type: "string" },
    paletteCharacter: { type: "string" },
    finish: { type: "string" },
    energy: { type: "string" },
    recurringMaterials: { type: "array", items: { type: "string" } },
    acceptableRenderingApproaches: {
      type: "array",
      items: { type: "string" },
    },
    avoidCopying: { type: "array", items: { type: "string" } },
  },
  required: [
    "audienceCharacter",
    "paletteCharacter",
    "finish",
    "energy",
    "recurringMaterials",
    "acceptableRenderingApproaches",
    "avoidCopying",
  ],
} as const;

const conceptSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    coreIdea: { type: "string" },
    heroSubject: { type: "string" },
    supportingElements: { type: "array", items: { type: "string" } },
    composition: { type: "string" },
    viewpoint: { type: "string" },
    renderingApproach: { type: "string" },
    palette: { type: "string" },
    lighting: { type: "string" },
    quietSpace: { type: "string" },
    avoid: { type: "array", items: { type: "string" } },
  },
  required: [
    "id",
    "coreIdea",
    "heroSubject",
    "supportingElements",
    "composition",
    "viewpoint",
    "renderingApproach",
    "palette",
    "lighting",
    "quietSpace",
    "avoid",
  ],
} as const;

function responseSchema(count: 2 | 4) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      referenceGuidance: referenceGuidanceSchema,
      concepts: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: conceptSchema,
      },
    },
    required: ["referenceGuidance", "concepts"],
  } as const;
}

type PlannerResult = {
  referenceGuidance: ReferenceGuidance;
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

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function stringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isReferenceGuidance(value: unknown): value is ReferenceGuidance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.audienceCharacter === "string" &&
    typeof candidate.paletteCharacter === "string" &&
    typeof candidate.finish === "string" &&
    typeof candidate.energy === "string" &&
    stringArray(candidate.recurringMaterials).length >= 0 &&
    stringArray(candidate.acceptableRenderingApproaches).length >= 0 &&
    stringArray(candidate.avoidCopying).length >= 0
  );
}

function normalizeConcepts(value: unknown, count: 2 | 4) {
  if (!Array.isArray(value) || value.length !== count) return null;
  const concepts = value.map((item, index) => {
    const candidate = item && typeof item === "object" ? item : {};
    const source = candidate as Record<string, unknown>;
    return {
      id: text(source.id, `concept-${String(index + 1).padStart(2, "0")}`),
      coreIdea: text(source.coreIdea),
      heroSubject: text(source.heroSubject),
      supportingElements: stringArray(source.supportingElements),
      composition: text(source.composition),
      viewpoint: text(source.viewpoint),
      renderingApproach: text(source.renderingApproach),
      palette: text(source.palette),
      lighting: text(source.lighting),
      quietSpace: text(source.quietSpace),
      avoid: stringArray(source.avoid),
    } satisfies PlannedCoverConcept;
  });
  if (
    concepts.some(
      (concept) =>
        !concept.coreIdea ||
        !concept.heroSubject ||
        !concept.composition ||
        !concept.viewpoint ||
        !concept.renderingApproach ||
        !concept.palette ||
        !concept.lighting ||
        !concept.quietSpace,
    )
  )
    return null;
  const ids = new Set(concepts.map((concept) => concept.id));
  return ids.size === count ? concepts : null;
}

function parseContent(
  content: string | Array<{ type?: string; text?: string }> | undefined,
) {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((part: { type?: string; text?: string }) =>
        part.type === "text" ? part.text || "" : "",
      )
      .join("\n");
  return "";
}

function parsePlannerJson(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("The cover concept planner returned invalid JSON.");
  }
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

function subjectText(subject: CoverSubject, customSubject: string) {
  return subject === "other"
    ? customSubject || "an unspecified subject"
    : subject;
}

function defaultGuidance(hasReferences: boolean): ReferenceGuidance {
  return {
    audienceCharacter:
      "clear, welcoming, age-appropriate educational publishing",
    paletteCharacter:
      "purposeful, print-friendly colour with one memorable accent",
    finish:
      "slick and commercially polished, with readable shapes at thumbnail size",
    energy: "confident and focused rather than frantic or overly cinematic",
    recurringMaterials: [],
    acceptableRenderingApproaches: [
      "editorial illustration",
      "graphic still life",
      "polished 3D or tactile collage when suitable",
    ],
    avoidCopying: hasReferences
      ? [
          "reference composition, crop, object positions, characters, typography, and distinctive arrangements",
        ]
      : [],
  };
}

function fallbackConcepts(input: PlannerInput): PlannedCoverConcept[] {
  const subject = subjectText(input.subject, input.customSubject);
  const theme = input.keywords || "the core ideas of the subject";
  const audience = input.audience.replaceAll("-", " ");
  const families = [
    {
      coreIdea: `A single memorable hero metaphor for ${subject}: ${theme}`,
      heroSubject: `one bold symbolic object or visual metaphor connected to ${subject}`,
      supportingElements: ["two or three small contextual forms"],
      composition:
        "central hero with generous surrounding space and a gentle vertical flow",
      viewpoint: "slightly elevated three-quarter view",
      renderingApproach: "slick editorial illustration with tactile surfaces",
      palette: "bright but controlled colour with one dominant accent",
      lighting: "clean directional light with soft separation",
      quietSpace: "calm upper third with broad simple colour fields",
    },
    {
      coreIdea: `An overhead visual system that turns ${subject} into an elegant collection of relationships`,
      heroSubject: `a top-down arrangement of a few essential forms from ${subject}`,
      supportingElements: [
        "simple connecting shapes",
        "one contrasting material",
      ],
      composition: "asymmetrical overhead layout with a clear diagonal rhythm",
      viewpoint: "directly overhead",
      renderingApproach: "graphic editorial collage with crisp cut shapes",
      palette: "light ground with saturated colour blocks and dark anchors",
      lighting: "soft studio light with restrained shadows",
      quietSpace: "open upper-left field without objects or marks",
    },
    {
      coreIdea: `A dynamic transformation or journey through ${subject}, guided by the theme ${theme}`,
      heroSubject: `a flowing structure that changes from simple to complex while remaining recognisable as ${subject}`,
      supportingElements: ["a small human-scale cue", "layered depth planes"],
      composition:
        "strong diagonal movement from lower corner toward the quiet upper field",
      viewpoint: "close oblique view with visible depth layers",
      renderingApproach:
        "polished mixed-media image with restrained material contrast",
      palette: "fresh complementary colours with a warm highlight",
      lighting: "focused glow on the transformation, muted edges",
      quietSpace: "uncluttered upper-right area created by the movement path",
    },
    {
      coreIdea: `A calm miniature world that makes ${subject} feel tangible for ${audience} learners`,
      heroSubject: `one carefully designed small environment or modular object representing ${subject}`,
      supportingElements: [
        "a few oversized tactile details",
        "one unexpected scale contrast",
      ],
      composition:
        "layered foreground and middle ground with an off-centre focal point",
      viewpoint: "low, intimate viewpoint at the level of the hero object",
      renderingApproach:
        "minimal premium 3D or tactile constructed illustration",
      palette: "playful but refined colour harmony with a quiet neutral field",
      lighting: "soft theatrical side light with a clear focal highlight",
      quietSpace: "simple upper band with no competing detail",
    },
  ];
  return families.slice(0, input.count).map((family, index) => ({
    id: `fallback-${String(index + 1).padStart(2, "0")}`,
    ...family,
    avoid: [
      "text, pseudo-writing, logos, labels, badges, and dense object inventories",
      "copying any supplied reference composition",
    ],
  }));
}

export function createFallbackCoverPlan(input: PlannerInput): PlannerResult {
  return {
    referenceGuidance: defaultGuidance(input.references.length > 0),
    concepts: fallbackConcepts(input),
    metadata: {
      model: "local-fallback",
      usage: emptyUsage,
      referenceGuidance: defaultGuidance(input.references.length > 0),
      usedFallback: true,
      warning:
        "The concept planner was unavailable; local directions were used.",
    },
  };
}

export async function planCoverConcepts(
  openRouter: OpenRouterContext,
  input: PlannerInput,
): Promise<PlannerResult> {
  const requestText = [
    "Plan a new batch of textbook cover-art concepts.",
    `Audience: ${input.audience}`,
    `Subject: ${subjectText(input.subject, input.customSubject)}`,
    `Optional keywords (soft guidance): ${input.keywords || "none"}`,
    `Number of distinct concepts: ${input.count}`,
    input.preferredText
      ? `Broad preference from the user: ${input.preferredText}`
      : "No earlier concept preference was supplied.",
    input.references.length
      ? `The following ${input.references.length} image(s) are reference covers. Analyze their shared broad visual language only.`
      : "No reference covers were supplied.",
    input.preferredImage
      ? "The final image in the message is a preferred earlier concept. Use it only as broad preference guidance, not as a template."
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
        {
          role: "system",
          content: fillPrompt(plannerPrompt, {}),
        },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "cover_concept_plan",
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
  const contentText = parseContent(result.choices?.[0]?.message?.content);
  const parsed = parsePlannerJson(contentText);
  if (!isReferenceGuidance(parsed.referenceGuidance))
    throw new Error(
      "The cover concept planner returned invalid reference guidance.",
    );
  const concepts = normalizeConcepts(parsed.concepts, input.count);
  if (!concepts)
    throw new Error(
      "The cover concept planner did not return distinct concepts.",
    );
  return {
    referenceGuidance: parsed.referenceGuidance,
    concepts,
    metadata: {
      model: result.model || COVER_PLANNER_MODEL,
      generationId: result.id,
      usage: usageFrom(result),
      referenceGuidance: parsed.referenceGuidance,
      usedFallback:
        (result.model || COVER_PLANNER_MODEL) !== COVER_PLANNER_MODEL,
    },
  };
}

export type { PlannerInput, PlannerResult };
