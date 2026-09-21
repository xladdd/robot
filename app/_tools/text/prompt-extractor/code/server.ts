import { NextResponse } from "next/server";
import { loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
} from "../../../openrouter/server";
import { normalizePrompt } from "./output";
import { type ExtractedAsset, validateInventory } from "./validation";

const MAX_BATCH_SIZE = 1;
const MAX_INVENTORY_ATTEMPTS = 3;
const MAX_DETAIL_IMAGES = 3;
const MAX_PAGE_IMAGE_CHARS = 6_000_000;

type PageImage = {
  page?: number;
  data?: string;
  details?: unknown;
};
type NormalizedPageImage = {
  page: number;
  data: string;
  details: string[];
};

type ModelResult = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type OpenRouterContext = NonNullable<
  Awaited<ReturnType<typeof getOpenRouterContext>>
>;

type PromptResponseFormat = {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: true;
    schema: Record<string, unknown>;
  };
};

const systemPrompt = loadPrompt("text/prompt-extractor/prompts/system.md");
const verificationPrompt = loadPrompt(
  "text/prompt-extractor/prompts/verify.md",
);

const responseFormat: PromptResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "illustration_asset_inventory",
    strict: true,
    schema: {
      type: "object",
      properties: {
        assets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              order: { type: "integer", minimum: 1 },
              relationship: {
                type: "string",
                enum: [
                  "independent",
                  "cohesive_composition",
                  "variation_set",
                  "background",
                ],
              },
              visibleCount: {
                anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
              },
              region: {
                type: "object",
                properties: {
                  x: { type: "number", minimum: 0, maximum: 1 },
                  y: { type: "number", minimum: 0, maximum: 1 },
                  width: { type: "number", exclusiveMinimum: 0, maximum: 1 },
                  height: { type: "number", exclusiveMinimum: 0, maximum: 1 },
                },
                required: ["x", "y", "width", "height"],
                additionalProperties: false,
              },
              subjects: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    color: { type: "string" },
                    pose: { type: "string" },
                  },
                  required: ["name", "color", "pose"],
                  additionalProperties: false,
                },
              },
              prompt: { type: "string" },
            },
            required: [
              "order",
              "relationship",
              "visibleCount",
              "region",
              "subjects",
              "prompt",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["assets"],
      additionalProperties: false,
    },
  },
};

function imageContent(
  page: number,
  data: string,
  details: string[],
): ContentPart[] {
  const content: ContentPart[] = [
    {
      type: "text",
      text: `PDF page ${page}, complete-page overview. Inspect the entire page and preserve visual reading order.`,
    },
    { type: "image_url", image_url: { url: data } },
  ];
  details.forEach((detail, index) => {
    content.push({
      type: "text",
      text: `PDF page ${page}, enlarged detail view ${index + 1} of the same page. Use this only to inspect small visual details; do not create duplicates.`,
    });
    content.push({ type: "image_url", image_url: { url: detail } });
  });
  return content;
}

function modelMessages(
  prompt: string,
  page: NormalizedPageImage,
  extraText?: string,
) {
  const content = imageContent(page.page, page.data, page.details);
  if (extraText) content.push({ type: "text", text: extraText });
  return [
    { role: "system" as const, content: prompt },
    { role: "user" as const, content },
  ];
}

async function requestInventory(
  openRouter: OpenRouterContext,
  page: NormalizedPageImage,
  correction: string | null,
  operation: string,
  prompt: string,
) {
  return requestOpenRouter<ModelResult>(
    openRouter,
    "chat/completions",
    operation,
    {
      model:
        process.env.OPENROUTER_PROMPT_EXTRACTOR_MODEL ||
        "qwen/qwen3.5-122b-a10b",
      messages: modelMessages(prompt, page, correction || undefined),
      temperature: 0,
      response_format: responseFormat,
    },
  );
}

function parseInventory(value: unknown) {
  return validateInventory(value);
}

function salvageInventory(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const rawAssets = (value as { assets?: unknown }).assets;
  if (!Array.isArray(rawAssets)) return null;
  const kept = rawAssets.flatMap((asset) =>
    validateInventory({ assets: [asset] }).valid ? [asset] : [],
  );
  if (!kept.length) return null;
  return validateInventory({
    assets: kept.map((asset, index) => ({
      ...(asset as Record<string, unknown>),
      order: index + 1,
    })),
  });
}

async function extractPageInventory(
  openRouter: OpenRouterContext,
  page: NormalizedPageImage,
): Promise<ExtractedAsset[]> {
  let correction: string | null = null;
  let lastError = "The model returned an invalid asset inventory.";
  let lastParsed: unknown = null;

  for (let attempt = 0; attempt < MAX_INVENTORY_ATTEMPTS; attempt += 1) {
    const { response, result } = await requestInventory(
      openRouter,
      page,
      correction,
      "extract-prompt-inventory",
      systemPrompt,
    );
    const raw = result.choices?.[0]?.message?.content;
    if (!response.ok || !raw)
      throw new Error(
        result.error?.message || "OpenRouter returned no asset inventory.",
      );

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      lastError = "The model returned invalid JSON.";
      correction =
        "Return only valid JSON matching the required asset inventory schema. Do not include analysis or Markdown.";
      continue;
    }

    lastParsed = parsed;
    const validated = parseInventory(parsed);
    if (validated.valid) return validated.assets;
    lastError = validated.error;
    correction = `Correct the complete inventory and return it again. Validation failure: ${lastError} Remove any candidate that is only a pathway, arrow route, empty box, flat-color backdrop, decorative leaf, or other instructional/decorative mark; do not merely rephrase it. Do not omit valid visual assets while correcting it.`;
  }

  const salvaged = salvageInventory(lastParsed);
  if (salvaged?.valid) return salvaged.assets;
  throw new Error(lastError);
}

async function verifyPageInventory(
  openRouter: OpenRouterContext,
  page: NormalizedPageImage,
  draft: ExtractedAsset[],
): Promise<ExtractedAsset[]> {
  const draftText = `Audit this draft inventory against the page images and return the complete corrected inventory. Draft JSON:\n${JSON.stringify({ assets: draft })}`;
  try {
    const { response, result } = await requestInventory(
      openRouter,
      page,
      draftText,
      "verify-prompt-inventory",
      verificationPrompt,
    );
    const raw = result.choices?.[0]?.message?.content;
    if (!response.ok || !raw) return draft;

    const validated = parseInventory(JSON.parse(raw));
    return validated.valid ? validated.assets : draft;
  } catch {
    return draft;
  }
}

function normalizePages(pages: PageImage[]) {
  return pages.flatMap((item): NormalizedPageImage[] => {
    if (
      !Number.isInteger(item.page) ||
      (item.page as number) < 1 ||
      typeof item.data !== "string" ||
      !item.data.startsWith("data:image/")
    )
      return [];
    const details = Array.isArray(item.details) ? item.details : [];
    if (
      details.length > MAX_DETAIL_IMAGES ||
      details.some(
        (detail) =>
          typeof detail !== "string" || !detail.startsWith("data:image/"),
      )
    )
      return [];
    const images = [item.data, ...details];
    if (images.some((image) => image.length > MAX_PAGE_IMAGE_CHARS)) return [];
    const totalChars = images.reduce((total, image) => total + image.length, 0);
    if (totalChars > MAX_PAGE_IMAGE_CHARS) return [];
    return [
      {
        page: item.page as number,
        data: item.data,
        details: details as string[],
      },
    ];
  });
}

export async function POST(request: Request) {
  try {
    const openRouter = await getOpenRouterContext(request, "prompt");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("prompt") },
        { status: 503 },
      );
    const { pages } = (await request.json()) as { pages?: PageImage[] };
    if (!Array.isArray(pages) || !pages.length || pages.length > MAX_BATCH_SIZE)
      return NextResponse.json(
        { error: `Send between 1 and ${MAX_BATCH_SIZE} rendered PDF pages.` },
        { status: 400 },
      );

    const normalized = normalizePages(pages);
    if (normalized.length !== pages.length)
      return NextResponse.json(
        { error: "One or more page images are invalid or too large." },
        { status: 400 },
      );

    const results = await Promise.all(
      normalized.map(async (page) => {
        const draft = await extractPageInventory(openRouter, page);
        const assets = await verifyPageInventory(openRouter, page, draft);
        return assets.map((asset) => ({
          page: page.page,
          prompt: normalizePrompt(asset.prompt),
        }));
      }),
    );
    return NextResponse.json({ illustrations: results.flat() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Prompt extraction failed.",
      },
      { status: 500 },
    );
  }
}
