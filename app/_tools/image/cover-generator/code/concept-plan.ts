import "server-only";

import { loadPrompt } from "../../../load-prompt";
import {
  requestOpenRouter,
  type OpenRouterContext,
} from "../../../openrouter/server";
import type {
  CoverAudience,
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

function responseSchema(count: 2 | 4) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      prompts: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: { type: "string" },
      },
    },
    required: ["prompts"],
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

// Reject an incomplete plan rather than sending generic local directions to the image model.
export function normalizeCoverPrompts(value: unknown, count: 2 | 4) {
  if (!value || typeof value !== "object" || !("prompts" in value)) return null;
  const prompts = value.prompts;
  if (!Array.isArray(prompts) || prompts.length !== count) return null;
  const normalized = prompts.map((prompt) =>
    typeof prompt === "string" ? prompt.trim() : "",
  );
  if (
    normalized.some((prompt) => !prompt || prompt.split(/\s+/).length > 200) ||
    new Set(normalized.map((prompt) => prompt.toLowerCase())).size !== count
  )
    return null;
  return normalized.map((prompt, index) => ({
    id: `concept-${String(index + 1).padStart(2, "0")}`,
    prompt,
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
    `Create ${input.count} different prompts for textbook cover art.`,
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
          name: "cover_art_prompts",
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
  const concepts = normalizeCoverPrompts(parsed, input.count);
  if (!concepts)
    throw new Error(
      "The cover concept planner did not return distinct prompts of 200 words or fewer.",
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
