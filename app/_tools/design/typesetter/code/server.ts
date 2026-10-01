import { NextResponse } from "next/server";
import { loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
} from "../../../openrouter/server";
import { isSemanticRoleId, semanticRoleIds } from "../roles";
import type { SemanticRoleId, TypesetterSourceBlock } from "../types";

const prescanPrompt = loadPrompt("design/typesetter/prompts/prescan.md");
const classifyPrompt = loadPrompt("design/typesetter/prompts/classify.md");
const MAX_BLOCKS = 120;
const MAX_TEXT = 80_000;

function sourceBlock(value: unknown): value is TypesetterSourceBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as Partial<TypesetterSourceBlock>;
  return (
    typeof block.id === "string" &&
    typeof block.order === "number" &&
    typeof block.text === "string" &&
    typeof block.kind === "string"
  );
}

function parseContent(result: {
  choices?: Array<{ message?: { content?: string } }>;
}) {
  const content = result.choices?.[0]?.message?.content
    ?.replace(/^```json\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  if (!content) throw new Error("The model returned no structured result.");
  return JSON.parse(content) as unknown;
}

function roleEnum(allowedRoles: SemanticRoleId[]) {
  return [...new Set([...allowedRoles, "unsupported"])] as SemanticRoleId[];
}

function prescanSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["suggestions", "notes"],
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["role", "confidence", "reason", "examples"],
          properties: {
            role: { type: "string", enum: semanticRoleIds },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reason: { type: "string" },
            examples: {
              type: "array",
              maxItems: 3,
              items: { type: "string" },
            },
          },
        },
      },
      notes: { type: "array", items: { type: "string" } },
    },
  };
}

function classificationSchema(allowedRoles: SemanticRoleId[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "role", "confidence", "warning", "imagePrompt"],
          properties: {
            id: { type: "string" },
            role: { type: "string", enum: roleEnum(allowedRoles) },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            warning: { type: ["string", "null"] },
            imagePrompt: { type: ["string", "null"] },
          },
        },
      },
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      mode?: unknown;
      language?: unknown;
      blocks?: unknown;
      allowedRoles?: unknown;
    };
    const mode = body.mode === "prescan" ? "prescan" : body.mode === "classify" ? "classify" : null;
    if (!mode)
      return NextResponse.json({ error: "Unknown Typesetter operation." }, { status: 400 });
    if (!Array.isArray(body.blocks) || !body.blocks.every(sourceBlock))
      return NextResponse.json({ error: "Invalid manuscript blocks." }, { status: 400 });
    if (body.blocks.length < 1 || body.blocks.length > MAX_BLOCKS)
      return NextResponse.json(
        { error: `Send between 1 and ${MAX_BLOCKS} blocks per request.` },
        { status: 400 },
      );
    const totalText = body.blocks.reduce((sum, block) => sum + block.text.length, 0);
    if (totalText > MAX_TEXT)
      return NextResponse.json(
        { error: `The batch exceeds ${MAX_TEXT} manuscript characters.` },
        { status: 413 },
      );

    const allowedRoles = Array.isArray(body.allowedRoles)
      ? body.allowedRoles.filter(isSemanticRoleId)
      : [];
    if (mode === "classify" && allowedRoles.length < 1)
      return NextResponse.json({ error: "Choose at least one semantic role." }, { status: 400 });

    const openRouter = await getOpenRouterContext(request, "typesetter");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("typesetter") },
        { status: 503 },
      );

    const prescan = mode === "prescan";
    const model = prescan
      ? process.env.OPENROUTER_TYPESETTER_PRESCAN_MODEL || "mistralai/ministral-14b-2512"
      : process.env.OPENROUTER_TYPESETTER_MODEL || "mistralai/mistral-large-2512";
    const payload = {
      language: body.language === "cs" ? "cs" : "en",
      allowedRoles: prescan ? semanticRoleIds : allowedRoles,
      blocks: body.blocks,
    };
    const { response, result } = await requestOpenRouter<{
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    }>(openRouter, "chat/completions", `typesetter-${mode}`, {
      model,
      temperature: 0,
      max_tokens: prescan ? 3_000 : 8_000,
      provider: { require_parameters: true },
      messages: [
        { role: "system", content: prescan ? prescanPrompt : classifyPrompt },
        { role: "user", content: JSON.stringify(payload) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: prescan ? "typesetter_prescan" : "typesetter_classification",
          strict: true,
          schema: prescan ? prescanSchema() : classificationSchema(allowedRoles),
        },
      },
    });
    if (!response.ok)
      return NextResponse.json(
        { error: result.error?.message || "Typesetter analysis failed." },
        { status: response.status || 502 },
      );
    return NextResponse.json(parseContent(result));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Typesetter analysis failed." },
      { status: 500 },
    );
  }
}
