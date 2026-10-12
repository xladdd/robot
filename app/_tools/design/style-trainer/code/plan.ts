// Pure style-plan contract shared by the Style Trainer server and tests.
// Keep this module free of server-only imports so Node tests can use it.

export const STYLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,59}$/;
export const MAX_STYLE_PROMPT_LENGTH = 2_000;
export const MAX_STYLE_NAME_LENGTH = 60;
export const MAX_ANALYSIS_LENGTH = 1_200;

export type StylePlan = {
  id: string;
  name: string;
  prompt: string;
  analysis: string;
};

export type StylePlannerMetadata = {
  model: string;
  generationId: string | null;
  usedFallback: boolean;
  usage: {
    cost: number | null;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maximum)
    : null;
}

// Accepts the Mistral planner's JSON only when every deliverable field is a
// usable non-empty string; anything else is rejected so the caller can retry.
export function normalizeStylePlan(value: unknown): StylePlan | null {
  if (!isRecord(value)) return null;
  const id = typeof value.style_id === "string" ? value.style_id.trim() : "";
  const name = text(value.style_name, MAX_STYLE_NAME_LENGTH);
  const prompt = text(value.style_prompt, MAX_STYLE_PROMPT_LENGTH);
  const analysis = text(value.analysis, MAX_ANALYSIS_LENGTH);
  if (!STYLE_ID_PATTERN.test(id) || !name || !prompt || !analysis) return null;
  return { id, name, prompt, analysis };
}

export const stylePlanResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    style_id: { type: "string" },
    style_name: { type: "string" },
    style_prompt: { type: "string" },
    analysis: { type: "string" },
  },
  required: ["style_id", "style_name", "style_prompt", "analysis"],
} as const;
