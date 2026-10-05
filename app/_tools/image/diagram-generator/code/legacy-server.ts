import { NextResponse } from "next/server";
import { loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
} from "../../../openrouter/server";
import {
  createDiagramReport,
  renderDiagramSvg,
  validateDiagramSpec,
  type DiagramUsage,
  type RenderSwatch,
} from "./diagram";
const MAX_INPUT_LENGTH = 20_000;
const MAX_REFERENCES = 3;
const MAX_REFERENCE_LENGTH = 7_000_000;
const diagramPrompt = loadPrompt("image/diagram-generator/prompts/system.md");

const diagramSchema = {
  type: "object",
  properties: {
    error: { type: ["string", "null"] },
    diagram: {
      type: ["object", "null"],
      properties: {
        version: { type: "integer", enum: [2] },
        kind: { type: "string", enum: ["biology"] },
        title: { type: "string" },
        subtitle: { type: "string" },
        subject: { type: "string" },
        diagramType: {
          type: "string",
          enum: ["anatomy", "process", "cross-section", "sequence"],
        },
        canvas: {
          type: "object",
          properties: {
            width: { type: "number" },
            height: { type: "number" },
          },
          required: ["width", "height"],
          additionalProperties: false,
        },
        panels: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["id", "title", "x", "y", "width", "height"],
            additionalProperties: false,
          },
        },
        elements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              type: {
                type: "string",
                enum: [
                  "organic",
                  "open-path",
                  "ellipse",
                  "circle",
                  "tube",
                  "membrane-network",
                  "cisternae",
                  "vesicle",
                  "vacuole",
                  "dots",
                  "layer",
                  "chromosome",
                  "spindle",
                  "centrosome",
                ],
              },
              description: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
              color: { type: "string" },
              panelId: { type: ["string", "null"] },
              rotation: { type: "number" },
              points: {
                type: ["array", "null"],
                items: {
                  type: "object",
                  properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                  },
                  required: ["x", "y"],
                  additionalProperties: false,
                },
              },
            },
            required: [
              "id",
              "type",
              "description",
              "x",
              "y",
              "width",
              "height",
              "color",
              "panelId",
              "rotation",
              "points",
            ],
            additionalProperties: false,
          },
        },
        labels: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              targetId: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              leader: {
                type: "string",
                enum: ["straight", "elbow", "bracket", "none"],
              },
            },
            required: ["id", "text", "targetId", "x", "y", "leader"],
            additionalProperties: false,
          },
        },
        connections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              from: { type: "string" },
              to: { type: "string" },
              arrow: { type: "string", enum: ["none", "start", "end", "both"] },
              route: { type: "string", enum: ["straight", "elbow"] },
              label: { type: "string" },
              points: {
                type: ["array", "null"],
                items: {
                  type: "object",
                  properties: {
                    x: { type: "number" },
                    y: { type: "number" },
                  },
                  required: ["x", "y"],
                  additionalProperties: false,
                },
              },
            },
            required: ["id", "from", "to", "arrow", "route", "label", "points"],
            additionalProperties: false,
          },
        },
        notes: { type: "array", items: { type: "string" } },
        referenceSummary: { type: "string" },
      },
      required: [
        "version",
        "kind",
        "title",
        "subtitle",
        "subject",
        "diagramType",
        "canvas",
        "panels",
        "elements",
        "labels",
        "connections",
        "notes",
        "referenceSummary",
      ],
      additionalProperties: false,
    },
  },
  required: ["error", "diagram"],
  additionalProperties: false,
};

export async function POST(request: Request) {
  try {
    const openRouter = await getOpenRouterContext(request, "bio");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("bio") },
        { status: 503 },
      );
    const body = (await request.json()) as {
      request?: unknown;
      mode?: unknown;
      references?: unknown;
      palette?: unknown;
      language?: unknown;
      evaluationModel?: unknown;
    };
    const userRequest =
      typeof body.request === "string" ? body.request.trim() : "";
    if (!userRequest || userRequest.length > MAX_INPUT_LENGTH)
      return NextResponse.json(
        {
          error: `Describe the diagram in at most ${MAX_INPUT_LENGTH} characters.`,
        },
        { status: 400 },
      );
    if (body.mode !== undefined && body.mode !== "diagram")
      return NextResponse.json(
        { error: "Only diagram mode is supported by this endpoint." },
        { status: 400 },
      );
    const references = Array.isArray(body.references) ? body.references : [];
    if (
      references.length > MAX_REFERENCES ||
      references.some(
        (value) =>
          typeof value !== "string" ||
          value.length > MAX_REFERENCE_LENGTH ||
          !/^data:image\/(png|jpeg|webp);base64,/i.test(value),
      )
    )
      return NextResponse.json(
        {
          error: `Use up to ${MAX_REFERENCES} PNG, JPEG, or WebP reference images.`,
        },
        { status: 400 },
      );
    const rawPalette = Array.isArray(body.palette) ? body.palette : [];
    if (rawPalette.length > 24)
      return NextResponse.json(
        { error: "Use no more than 24 palette swatches." },
        { status: 400 },
      );
    const swatches: RenderSwatch[] = rawPalette.map((value, index) => {
      const item =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : {};
      const hex = typeof item.hex === "string" ? item.hex.toLowerCase() : "";
      if (!/^#[0-9a-f]{6}$/.test(hex))
        throw new Error(
          `Palette swatch ${index + 1} has an invalid RGB colour.`,
        );
      return {
        name:
          typeof item.name === "string"
            ? item.name.trim().slice(0, 100)
            : `Swatch ${index + 1}`,
        hex,
        model:
          typeof item.model === "string" ? item.model.slice(0, 12) : undefined,
        values: Array.isArray(item.values)
          ? item.values.map(Number).filter(Number.isFinite).slice(0, 4)
          : undefined,
        group:
          typeof item.group === "string" ? item.group.slice(0, 100) : undefined,
      };
    });
    const configuredModel =
      process.env.OPENROUTER_FIGURE_MODEL || "mistralai/mistral-large-2512";
    const evaluationModels = new Set([
      "qwen/qwen3.6-35b-a3b",
      "openai/gpt-oss-120b",
      "google/gemma-4-26b-a4b-it",
      "meta-llama/llama-4-maverick",
    ]);
    const model =
      typeof body.evaluationModel === "string" &&
      evaluationModels.has(body.evaluationModel)
        ? body.evaluationModel
        : configuredModel;
    const outputLanguage =
      body.language === "cs" || body.language === "en"
        ? body.language
        : /[ěščřžýáíéúůďťňó]/i.test(userRequest)
          ? "cs"
          : "en";
    const languageInstruction =
      outputLanguage === "cs"
        ? "Výstupní jazyk: čeština. Všechny viditelné názvy, titulky a popisky napiš česky."
        : "Output language: English. Write all visible titles and labels in English.";
    const userText = `${languageInstruction}\n\nUser request:\n${userRequest}`;
    const userContent = references.length
      ? [
          { type: "text", text: userText },
          ...references.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ]
      : userText;
    const { response, result } = await requestOpenRouter<{
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    }>(openRouter, "chat/completions", "generate-diagram", {
      model,
      temperature: 0,
      ...(model.startsWith("qwen/") ? { reasoning: { enabled: false } } : {}),
      messages: [
        { role: "system", content: diagramPrompt },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "biological_diagram",
          strict: true,
          schema: diagramSchema,
        },
      },
    });
    const raw = result.choices?.[0]?.message?.content;
    if (!response.ok || !raw)
      return NextResponse.json(
        {
          error:
            result.error?.message ||
            "OpenRouter returned no figure specification.",
        },
        { status: response.status || 502 },
      );
    let parsed: { error?: unknown; diagram?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "The model returned invalid structured data." },
        { status: 502 },
      );
    }
    if (typeof parsed.error === "string" && parsed.error.trim())
      return NextResponse.json({ error: parsed.error.trim() }, { status: 422 });
    const { spec, checks } = validateDiagramSpec(parsed.diagram);
    if (swatches.length)
      checks.push({
        level: "pass",
        message: `${swatches.length} locally parsed Adobe swatches were applied in file order.`,
      });
    const usage: DiagramUsage = {
      generationId: typeof result.id === "string" ? result.id : null,
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
    return NextResponse.json({
      spec,
      svg: renderDiagramSvg(spec, swatches),
      checks,
      report: createDiagramReport(
        spec,
        checks,
        model,
        references.length,
        swatches,
        usage,
      ),
      model,
      generationId: usage.generationId,
      usage,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Figure generation failed.",
      },
      { status: 500 },
    );
  }
}
