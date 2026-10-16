import { modelStages } from "../model-definitions.ts";
import { resolveModel } from "../../../models-server.ts";
import "server-only";

import { loadPrompt } from "../../../load-prompt";
import {
  requestOpenRouter,
  type OpenRouterContext,
} from "../../../openrouter/server";
import {
  normalizeStylePlan,
  stylePlanResponseSchema,
  type StylePlan,
  type StylePlannerMetadata,
} from "./plan.ts";

export const STYLE_PLANNER_FALLBACK_MODEL =
  modelStages.planner.failureFallbackModels[0].defaultModel;

const analyzePrompt = loadPrompt(
  "design/style-trainer/prompts/analyze-style.md",
);
const refinePrompt = loadPrompt("design/style-trainer/prompts/refine-style.md");

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
    throw new Error("The style planner returned invalid JSON.");
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

type PlannerResult = {
  plan: StylePlan;
  metadata: StylePlannerMetadata;
};

type PlannerInput = {
  references: string[];
  preferredImage?: string;
};

async function runPlanner(
  openRouter: OpenRouterContext,
  input: PlannerInput,
  requestText: string,
  systemPrompt: string,
  operation: string,
): Promise<PlannerResult> {
  const model = resolveModel(modelStages["planner"]);
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: requestText },
  ];
  for (const [index, reference] of input.references.entries()) {
    content.push({
      type: "text",
      text: `Original style reference ${index + 1}:`,
    });
    content.push({ type: "image_url", image_url: { url: reference } });
  }
  if (input.preferredImage) {
    content.push({ type: "text", text: "Preferred earlier test image:" });
    content.push({
      type: "image_url",
      image_url: { url: input.preferredImage },
    });
  }

  const { response, result } = await requestOpenRouter<PlannerResponse>(
    openRouter,
    "chat/completions",
    operation,
    {
      model,
      models: [model, STYLE_PLANNER_FALLBACK_MODEL],
      route: "fallback",
      provider: { require_parameters: true },
      temperature: 0.15,
      max_tokens: 2_000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "style_plan",
          strict: true,
          schema: stylePlanResponseSchema,
        },
      },
    },
  );
  if (!response.ok)
    throw new Error(
      result.error?.message || "The style planner request failed.",
    );
  const plan = normalizeStylePlan(
    parsePlannerJson(parseContent(result.choices?.[0]?.message?.content)),
  );
  if (!plan)
    throw new Error(
      "The style planner did not return a valid structured style plan.",
    );
  const usedModel = result.model || model;
  return {
    plan,
    metadata: {
      model: usedModel,
      generationId: result.id ?? null,
      usedFallback: usedModel !== model,
      usage: usageFrom(result),
    },
  };
}

export async function analyzeStyle(
  openRouter: OpenRouterContext,
  input: PlannerInput,
): Promise<PlannerResult> {
  return runPlanner(
    openRouter,
    input,
    [
      "Inspect each supplied image for visible rendering evidence, summarize that evidence in analysis first, then write one reusable FLUX style prompt. Preserve the actual medium, dimensionality, texture and lighting; do not infer a medium from palette or subject alone.",
      "Return the JSON object defined by the supplied schema and no explanation.",
    ].join("\n"),
    analyzePrompt,
    "analyze-style",
  );
}

export async function refineStyle(
  openRouter: OpenRouterContext,
  input: PlannerInput & {
    currentPrompt: string;
    instruction: string;
  },
): Promise<PlannerResult> {
  return runPlanner(
    openRouter,
    input,
    [
      "Revise the current FLUX.2 Pro style prompt according to the user's instruction.",
      `Current style prompt:\n${input.currentPrompt}`,
      `User's revision instruction:\n${input.instruction}`,
      input.preferredImage
        ? "The supplied preferred image is the user's selected test generation. Compare its rendering with the originals, preserve successful style traits, and correct deviations unless the user explicitly requests them. Do not copy its subject."
        : "",
      "Return the complete revised JSON object defined by the supplied schema and no explanation.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    refinePrompt,
    "refine-style",
  );
}

export type { PlannerInput, PlannerResult };
