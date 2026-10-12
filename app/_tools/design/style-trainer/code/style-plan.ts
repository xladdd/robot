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

export const STYLE_PLANNER_FALLBACK_MODEL = "mistralai/ministral-14b-2512";

const analyzePrompt = loadPrompt(
  "design/style-trainer/prompts/analyze-style.md",
);
const refinePrompt = loadPrompt(
  "design/style-trainer/prompts/refine-style.md",
);

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
  const model =
    process.env.OPENROUTER_STYLE_TRAINER_MODEL || "mistralai/mistral-medium-3-5";
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: requestText },
  ];
  for (const reference of input.references) {
    content.push({ type: "text", text: "Style reference:" });
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
      temperature: 0.3,
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
      "Study the supplied style reference images and write one reusable FLUX.2 Pro style prompt that captures the visual style they share.",
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
        ? "The supplied preferred image is the user's selected test generation; treat it as visual guidance for the revision."
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
