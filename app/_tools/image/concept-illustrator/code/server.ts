import "server-only";

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
  MAX_IMAGE_BYTES,
  MAX_PROMPT_LENGTH,
  isRecord,
  normalizeArticle,
  normalizeConcept,
  normalizeConceptBatch,
  normalizeConceptId,
  normalizeCritique,
  normalizeEdit,
  normalizeFeedback,
  normalizeImageDataUrl,
  normalizeImageReferences,
  normalizeOtherConcepts,
  normalizePrompt,
  normalizeReplacementConcept,
  normalizeStyle,
  parseAspectRatio,
  type ConceptModelMetadata,
  type GeneratedIllustration,
} from "./contracts.ts";
import type {
  ConceptAspectRatio,
  IllustrationConcept,
  IllustrationUsage,
} from "./types.ts";

const DEFAULT_PLAN_MODEL = "mistralai/mistral-medium-3-5";
const DEFAULT_PLAN_FALLBACK_MODEL = "mistralai/ministral-14b-2512";
const DEFAULT_IMAGE_MODEL = "black-forest-labs/flux.2-pro";
const DEFAULT_CRITIQUE_MODEL = "google/gemini-3.8-flash";
const MAX_SEED = 2_000_000_000;

const planPrompt = loadPrompt(
  "image/concept-illustrator/prompts/plan-concepts.md",
);
const regeneratePrompt = loadPrompt(
  "image/concept-illustrator/prompts/regenerate-concept.md",
);
const compilePrompt = loadPrompt(
  "image/concept-illustrator/prompts/compile-prompt.md",
);
const refinePrompt = loadPrompt(
  "image/concept-illustrator/prompts/refine-image.md",
);
const critiquePrompt = loadPrompt(
  "image/concept-illustrator/prompts/critique-image.md",
);

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

type ImageResult = {
  b64_json?: string;
  media_type?: string;
  url?: string;
};

type ImageApiResult = {
  id?: string;
  model?: string;
  data?: ImageResult[];
  usage?: Usage;
  error?: { message?: string };
};

type Action =
  | "plan-concepts"
  | "regenerate-concept"
  | "compile-prompt"
  | "generate-image"
  | "refine-image"
  | "critique-image";

class ConceptIllustratorRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConceptIllustratorRequestError";
  }
}

class OpenRouterResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterResultError";
  }
}

const conceptProperties = {
  title: { type: "string", minLength: 2, maxLength: 120 },
  visual: { type: "string", minLength: 8, maxLength: 700 },
  meaning: { type: "string", minLength: 4, maxLength: 500 },
} as const;

function conceptSchema(stableId?: string) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      id: stableId
        ? { type: "string", enum: [stableId] }
        : {
            type: "string",
            minLength: 1,
            maxLength: 64,
            pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$",
          },
      ...conceptProperties,
    },
    required: ["id", "title", "visual", "meaning"],
  } as const;
}

const planSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    concepts: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: conceptSchema(),
    },
  },
  required: ["concepts"],
} as const;

const compiledPromptSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    prompt: {
      type: "string",
      minLength: 8,
      maxLength: MAX_PROMPT_LENGTH,
    },
  },
  required: ["prompt"],
} as const;

const critiqueSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 800 },
    corrections: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 400 },
    },
    suggestedEdit: { type: "string", minLength: 1, maxLength: 800 },
  },
  required: ["summary", "corrections", "suggestedEdit"],
} as const;

function plannerModels() {
  const primary =
    process.env.OPENROUTER_CONCEPT_ILLUSTRATOR_PLAN_MODEL || DEFAULT_PLAN_MODEL;
  const fallback =
    process.env.OPENROUTER_CONCEPT_ILLUSTRATOR_PLAN_FALLBACK_MODEL ||
    DEFAULT_PLAN_FALLBACK_MODEL;
  return { primary, fallback };
}

function imageModel() {
  return (
    process.env.OPENROUTER_CONCEPT_ILLUSTRATOR_IMAGE_MODEL ||
    DEFAULT_IMAGE_MODEL
  );
}

function critiqueModel() {
  return (
    process.env.OPENROUTER_CONCEPT_ILLUSTRATOR_CRITIQUE_MODEL ||
    DEFAULT_CRITIQUE_MODEL
  );
}

function usageFrom(result: { usage?: Usage }): IllustrationUsage {
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

function metadata(
  result: { id?: string; model?: string; usage?: Usage },
  requestedModel: string,
): ConceptModelMetadata {
  return {
    model: result.model || requestedModel,
    generationId: result.id || null,
    usage: usageFrom(result),
  };
}

function messageText(result: ChatResult) {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(isRecord)
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n");
}

function parseStructuredJson(result: ChatResult, operation: string) {
  const content = messageText(result)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (!content)
    throw new OpenRouterResultError(
      `${operation} returned no structured data.`,
    );
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new OpenRouterResultError(`${operation} returned invalid JSON.`);
  }
}

function requestValue<T>(callback: () => T): T {
  try {
    return callback();
  } catch (error) {
    throw new ConceptIllustratorRequestError(
      error instanceof Error ? error.message : "Invalid request.",
    );
  }
}

function requestField(
  body: Record<string, unknown>,
  name: string,
  alias?: string,
) {
  return body[name] ?? (alias ? body[alias] : undefined);
}

function parseAction(value: unknown): Action {
  if (
    value === "plan-concepts" ||
    value === "regenerate-concept" ||
    value === "compile-prompt" ||
    value === "generate-image" ||
    value === "refine-image" ||
    value === "critique-image"
  )
    return value;
  throw new ConceptIllustratorRequestError(
    "action must be plan-concepts, regenerate-concept, compile-prompt, generate-image, refine-image, or critique-image.",
  );
}

async function completePlannerJson(
  openRouter: OpenRouterContext,
  operation: string,
  system: string,
  user: Record<string, unknown>,
  schemaName: string,
  schema: Record<string, unknown>,
  maxTokens: number,
  signal: AbortSignal,
) {
  const { primary, fallback } = plannerModels();
  const models = [...new Set([primary, fallback])];
  const { response, result } = await requestOpenRouter<ChatResult>(
    openRouter,
    "chat/completions",
    operation,
    {
      model: primary,
      models,
      route: "fallback",
      provider: { require_parameters: true },
      temperature: 0.35,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema },
      },
    },
    { signal },
  );
  if (!response.ok)
    throw new OpenRouterResultError(
      result.error?.message || `${operation} failed at OpenRouter.`,
    );
  return { result, parsed: parseStructuredJson(result, operation), primary };
}

async function planConcepts(
  openRouter: OpenRouterContext,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const { article, style, aspectRatio, feedback } = requestValue(() => ({
    article: normalizeArticle(body.article),
    style: normalizeStyle(requestField(body, "style", "styleGuidance")),
    aspectRatio: parseAspectRatio(body.aspectRatio),
    feedback: normalizeFeedback(
      requestField(body, "feedback", "feedbackContext"),
    ),
  }));
  const { result, parsed, primary } = await completePlannerJson(
    openRouter,
    "plan-concept-illustrations",
    planPrompt,
    {
      article,
      styleGuidance: style,
      aspectRatio,
      feedbackContext: feedback || "No relevant browser feedback was supplied.",
    },
    "concept_illustration_plan",
    planSchema,
    1_800,
    signal,
  );
  if (!isRecord(parsed))
    throw new OpenRouterResultError(
      "The concept planner returned an invalid object.",
    );
  let concepts: IllustrationConcept[];
  try {
    concepts = normalizeConceptBatch(parsed.concepts);
  } catch (error) {
    throw new OpenRouterResultError(
      error instanceof Error ? error.message : "The concept plan is invalid.",
    );
  }
  return { concepts, ...metadata(result, primary) };
}

async function regenerateConcept(
  openRouter: OpenRouterContext,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const input = requestValue(() => {
    let rejected: IllustrationConcept | null;
    let slotId: string;
    let otherConcepts: IllustrationConcept[];
    if (body.concepts !== undefined || body.index !== undefined) {
      const concepts = normalizeConceptBatch(body.concepts);
      if (
        typeof body.index !== "number" ||
        !Number.isInteger(body.index) ||
        body.index < 0 ||
        body.index >= concepts.length
      )
        throw new Error("index must identify one of the three concept slots.");
      const selectedIndex = body.index;
      const selectedConcept = concepts[selectedIndex];
      if (!selectedConcept)
        throw new Error("index must identify one of the three concept slots.");
      rejected = selectedConcept;
      slotId = selectedConcept.id;
      otherConcepts = concepts.filter((_, index) => index !== selectedIndex);
    } else {
      rejected =
        body.concept === undefined ? null : normalizeConcept(body.concept);
      slotId = normalizeConceptId(
        requestField(body, "slotId", "conceptId") || rejected?.id,
        "slotId",
      );
      if (rejected && rejected.id !== slotId)
        throw new Error(
          "The rejected concept must use the requested stable slot ID.",
        );
      otherConcepts = normalizeOtherConcepts(body.otherConcepts, slotId);
    }
    return {
      article: normalizeArticle(body.article),
      style: normalizeStyle(requestField(body, "style", "styleGuidance")),
      aspectRatio: parseAspectRatio(body.aspectRatio),
      feedback: normalizeFeedback(
        requestField(body, "feedback", "feedbackContext"),
      ),
      slotId,
      rejected,
      otherConcepts,
    };
  });
  const replacementSchema = {
    type: "object",
    additionalProperties: false,
    properties: { concept: conceptSchema(input.slotId) },
    required: ["concept"],
  } as const;
  const { result, parsed, primary } = await completePlannerJson(
    openRouter,
    "regenerate-concept-illustration",
    regeneratePrompt,
    {
      article: input.article,
      styleGuidance: input.style,
      aspectRatio: input.aspectRatio,
      feedbackContext:
        input.feedback || "No relevant browser feedback was supplied.",
      stableSlotId: input.slotId,
      rejectedConcept: input.rejected,
      otherConceptSummaries: input.otherConcepts.map(
        ({ id, title, visual, meaning }) => ({ id, title, visual, meaning }),
      ),
    },
    "concept_illustration_replacement",
    replacementSchema,
    900,
    signal,
  );
  if (!isRecord(parsed))
    throw new OpenRouterResultError(
      "The concept regenerator returned an invalid object.",
    );
  let concept: IllustrationConcept;
  try {
    concept = normalizeReplacementConcept(
      parsed.concept,
      input.slotId,
      input.otherConcepts,
    );
  } catch (error) {
    throw new OpenRouterResultError(
      error instanceof Error
        ? error.message
        : "The replacement concept is invalid.",
    );
  }
  return { concept, ...metadata(result, primary) };
}

async function compileConceptPrompt(
  openRouter: OpenRouterContext,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const input = requestValue(() => ({
    concept: normalizeConcept(body.concept),
    style: normalizeStyle(requestField(body, "style", "styleGuidance")),
    aspectRatio: parseAspectRatio(body.aspectRatio),
    feedback: normalizeFeedback(
      requestField(body, "feedback", "feedbackContext"),
    ),
  }));
  const { result, parsed, primary } = await completePlannerJson(
    openRouter,
    "compile-concept-illustration-prompt",
    compilePrompt,
    {
      concept: input.concept,
      styleGuidance: input.style,
      aspectRatio: input.aspectRatio,
      feedbackContext:
        input.feedback || "No relevant browser feedback was supplied.",
    },
    "concept_illustration_prompt",
    compiledPromptSchema,
    700,
    signal,
  );
  if (!isRecord(parsed))
    throw new OpenRouterResultError(
      "The visual compiler returned an invalid object.",
    );
  let prompt: string;
  try {
    prompt = normalizePrompt(parsed.prompt);
  } catch (error) {
    throw new OpenRouterResultError(
      error instanceof Error
        ? error.message
        : "The compiled prompt is invalid.",
    );
  }
  return { prompt, ...metadata(result, primary) };
}

function assertJpeg(bytes: Uint8Array) {
  if (
    bytes.length < 3 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  )
    throw new OpenRouterResultError(
      "OpenRouter did not return the requested JPEG image.",
    );
}

function jpegDataUrl(base64: string) {
  const dataUrl = normalizeImageDataUrl(
    `data:image/jpeg;base64,${base64}`,
    "generated image",
  );
  assertJpeg(Buffer.from(base64, "base64"));
  return dataUrl;
}

async function imageDataUrl(image: ImageResult, signal: AbortSignal) {
  if (image.b64_json) {
    if (image.media_type && image.media_type.toLowerCase() !== "image/jpeg")
      throw new OpenRouterResultError(
        "OpenRouter did not return the requested JPEG image.",
      );
    return jpegDataUrl(image.b64_json);
  }
  if (!image.url)
    throw new OpenRouterResultError("OpenRouter returned no generated image.");
  if (image.url.startsWith("data:")) {
    const dataUrl = normalizeImageDataUrl(image.url, "generated image");
    const match = dataUrl.match(/^data:image\/jpeg;base64,(.+)$/i);
    if (!match)
      throw new OpenRouterResultError(
        "OpenRouter did not return the requested JPEG image.",
      );
    assertJpeg(Buffer.from(match[1], "base64"));
    return dataUrl;
  }

  let url: URL;
  try {
    url = new URL(image.url);
  } catch {
    throw new OpenRouterResultError(
      "OpenRouter returned an invalid image URL.",
    );
  }
  if (url.protocol !== "https:")
    throw new OpenRouterResultError("OpenRouter returned an unsafe image URL.");
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new OpenRouterResultError(
      `The generated image download failed with HTTP ${response.status}.`,
    );
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES)
    throw new OpenRouterResultError("The generated image is larger than 7 MB.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new OpenRouterResultError("The generated image is larger than 7 MB.");
  assertJpeg(bytes);
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

async function generateFluxImage(
  openRouter: OpenRouterContext,
  operation: string,
  prompt: string,
  aspectRatio: ConceptAspectRatio,
  references: string[],
  signal: AbortSignal,
): Promise<GeneratedIllustration> {
  const model = imageModel();
  const seed = randomInt(0, MAX_SEED);
  const { response, result } = await requestOpenRouter<ImageApiResult>(
    openRouter,
    "images",
    operation,
    {
      model,
      prompt,
      ...(references.length
        ? {
            input_references: references.map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          }
        : {}),
      aspect_ratio: aspectRatio,
      resolution: "1K",
      output_format: "jpeg",
      seed,
    },
    { signal },
  );
  if (!response.ok)
    throw new OpenRouterResultError(
      result.error?.message || "OpenRouter image generation failed.",
    );
  if (!result.data || result.data.length !== 1)
    throw new OpenRouterResultError(
      "OpenRouter must return exactly one image.",
    );
  const data = await imageDataUrl(result.data[0], signal);
  return {
    data,
    prompt,
    seed,
    ...metadata(result, model),
  };
}

async function generateImage(
  openRouter: OpenRouterContext,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const input = requestValue(() => ({
    prompt: normalizePrompt(body.prompt),
    aspectRatio: parseAspectRatio(body.aspectRatio),
    references: normalizeImageReferences(
      requestField(body, "styleReferences", "references"),
    ),
  }));
  return {
    image: await generateFluxImage(
      openRouter,
      "generate-concept-illustration",
      input.prompt,
      input.aspectRatio,
      input.references,
      signal,
    ),
  };
}

async function refineImage(
  openRouter: OpenRouterContext,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const input = requestValue(() => ({
    source: normalizeImageDataUrl(
      requestField(body, "sourceImage", "image"),
      "sourceImage",
    ),
    styleReferences: normalizeImageReferences(
      requestField(body, "styleReferences", "references"),
      2,
    ),
    edit: normalizeEdit(requestField(body, "edit", "instruction")),
    aspectRatio: parseAspectRatio(body.aspectRatio),
  }));
  const prompt = normalizePrompt(
    fillPrompt(refinePrompt, { edit: input.edit }),
  );
  return {
    image: await generateFluxImage(
      openRouter,
      "refine-concept-illustration",
      prompt,
      input.aspectRatio,
      [input.source, ...input.styleReferences],
      signal,
    ),
  };
}

async function critiqueImage(
  openRouter: OpenRouterContext,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const input = requestValue(() => ({
    source: normalizeImageDataUrl(
      requestField(body, "sourceImage", "image"),
      "sourceImage",
    ),
    concept: normalizeConcept(body.concept),
    style: normalizeStyle(requestField(body, "style", "styleGuidance")),
  }));
  const model = critiqueModel();
  const { response, result } = await requestOpenRouter<ChatResult>(
    openRouter,
    "chat/completions",
    "critique-concept-illustration",
    {
      model,
      provider: { require_parameters: true },
      temperature: 0,
      max_tokens: 1_200,
      messages: [
        { role: "system", content: critiquePrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                concept: input.concept,
                styleGuidance: input.style,
              }),
            },
            { type: "image_url", image_url: { url: input.source } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "concept_illustration_critique",
          strict: true,
          schema: critiqueSchema,
        },
      },
    },
    { signal },
  );
  if (!response.ok)
    throw new OpenRouterResultError(
      result.error?.message || "OpenRouter image critique failed.",
    );
  const parsed = parseStructuredJson(result, "critique-concept-illustration");
  let critique;
  try {
    critique = normalizeCritique(parsed);
  } catch (error) {
    throw new OpenRouterResultError(
      error instanceof Error ? error.message : "The image critique is invalid.",
    );
  }
  return { critique, ...metadata(result, model) };
}

function requestError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const openRouter = await getOpenRouterContext(
      request,
      "conceptIllustrator",
    );
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("conceptIllustrator") },
        { status: 503 },
      );

    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch (error) {
      if (
        (error instanceof Error && error.name === "AbortError") ||
        request.signal.aborted
      )
        throw error;
      return requestError(
        "The concept illustration request must contain valid JSON.",
      );
    }
    if (!isRecord(parsed))
      return requestError("Invalid concept illustration request.");

    const action = parseAction(parsed.action);
    switch (action) {
      case "plan-concepts":
        return NextResponse.json(
          await planConcepts(openRouter, parsed, request.signal),
        );
      case "regenerate-concept":
        return NextResponse.json(
          await regenerateConcept(openRouter, parsed, request.signal),
        );
      case "compile-prompt":
        return NextResponse.json(
          await compileConceptPrompt(openRouter, parsed, request.signal),
        );
      case "generate-image":
        return NextResponse.json(
          await generateImage(openRouter, parsed, request.signal),
        );
      case "refine-image":
        return NextResponse.json(
          await refineImage(openRouter, parsed, request.signal),
        );
      case "critique-image":
        return NextResponse.json(
          await critiqueImage(openRouter, parsed, request.signal),
        );
    }
  } catch (error) {
    if (
      (error instanceof Error && error.name === "AbortError") ||
      request.signal.aborted
    )
      return new Response(null, { status: 499 });
    if (error instanceof ConceptIllustratorRequestError)
      return requestError(error.message);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Concept illustration processing failed.",
      },
      { status: error instanceof OpenRouterResultError ? 502 : 500 },
    );
  }
}
