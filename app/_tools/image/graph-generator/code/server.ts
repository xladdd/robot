import { NextResponse } from "next/server";
import { loadPrompt } from "../../../load-prompt";
import { createGraphReport, renderGraphSvg, validateGraphSpec, type RenderSwatch } from "./graph";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_INPUT_LENGTH = 20_000;
const MAX_REFERENCES = 3;
const MAX_REFERENCE_LENGTH = 7_000_000;
const systemPrompt = loadPrompt("image/graph-generator/prompts/system.md");

const responseSchema = {
  type: "object",
  properties: {
    error: { type: ["string", "null"] },
    figure: {
      type: ["object", "null"],
      properties: {
        version: { type: "integer", enum: [1] }, kind: { type: "string", enum: ["line", "bar"] },
        title: { type: "string" }, subtitle: { type: "string" }, xLabel: { type: "string" }, yLabel: { type: "string" }, unit: { type: "string" },
        categories: { type: "array", items: { type: "string" } },
        series: { type: "array", items: { type: "object", properties: { label: { type: "string" }, values: { type: "array", items: { type: "number" } }, sourceIds: { type: "array", items: { type: "string" } } }, required: ["label", "values", "sourceIds"], additionalProperties: false } },
        sources: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, url: { type: "string" } }, required: ["id", "title", "url"], additionalProperties: false } },
        notes: { type: "array", items: { type: "string" } },
      },
      required: ["version", "kind", "title", "subtitle", "xLabel", "yLabel", "unit", "categories", "series", "sources", "notes"], additionalProperties: false,
    },
  },
  required: ["error", "figure"], additionalProperties: false,
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });
    const body = await request.json() as { request?: unknown; references?: unknown; palette?: unknown; evaluationModel?: unknown };
    const userRequest = typeof body.request === "string" ? body.request.trim() : "";
    if (!userRequest || userRequest.length > MAX_INPUT_LENGTH) return NextResponse.json({ error: `Describe the chart in at most ${MAX_INPUT_LENGTH} characters.` }, { status: 400 });
    const references = Array.isArray(body.references) ? body.references : [];
    if (references.length > MAX_REFERENCES || references.some((value) => typeof value !== "string" || value.length > MAX_REFERENCE_LENGTH || !/^data:image\/(png|jpeg|webp);base64,/i.test(value))) return NextResponse.json({ error: `Use up to ${MAX_REFERENCES} PNG, JPEG, or WebP reference images.` }, { status: 400 });
    if (references.length) return NextResponse.json({ error: "Reference images are supported only for diagrams and maps." }, { status: 400 });
    const rawPalette = Array.isArray(body.palette) ? body.palette : [];
    if (rawPalette.length > 24) return NextResponse.json({ error: "Use no more than 24 palette swatches." }, { status: 400 });
    const swatches: RenderSwatch[] = rawPalette.map((value, index) => {
      const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const hex = typeof item.hex === "string" ? item.hex.toLowerCase() : "";
      if (!/^#[0-9a-f]{6}$/.test(hex)) throw new Error(`Palette swatch ${index + 1} has an invalid RGB colour.`);
      return { name: typeof item.name === "string" ? item.name.trim().slice(0, 100) : `Swatch ${index + 1}`, hex, model: typeof item.model === "string" ? item.model.slice(0, 12) : undefined, values: Array.isArray(item.values) ? item.values.map(Number).filter(Number.isFinite).slice(0, 4) : undefined, group: typeof item.group === "string" ? item.group.slice(0, 100) : undefined };
    });
    const configuredModel = process.env.OPENROUTER_FIGURE_MODEL || "mistralai/mistral-large-2512";
    const evaluationModels = new Set(["qwen/qwen3.6-35b-a3b", "openai/gpt-oss-120b", "google/gemma-4-26b-a4b-it", "meta-llama/llama-4-maverick"]);
    const model = typeof body.evaluationModel === "string" && evaluationModels.has(body.evaluationModel) ? body.evaluationModel : configuredModel;
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.APP_URL || "http://localhost:3000", "X-Title": "Taktik Robot" },
      body: JSON.stringify({ model, temperature: 0, ...(model.startsWith("qwen/") ? { reasoning: { enabled: false } } : {}), messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userRequest }], response_format: { type: "json_schema", json_schema: { name: "verified_chart", strict: true, schema: responseSchema } } }),
    });
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    const raw = result.choices?.[0]?.message?.content;
    if (!response.ok || !raw) return NextResponse.json({ error: result.error?.message || "OpenRouter returned no figure specification." }, { status: response.status || 502 });
    let parsed: { error?: unknown; figure?: unknown };
    try { parsed = JSON.parse(raw); } catch { return NextResponse.json({ error: "The model returned invalid structured data." }, { status: 502 }); }
    if (typeof parsed.error === "string" && parsed.error.trim()) return NextResponse.json({ error: parsed.error.trim() }, { status: 422 });
    const { spec, checks } = validateGraphSpec(parsed.figure);
    if (swatches.length) checks.push({ level: "pass", message: `${swatches.length} locally parsed Adobe swatches were applied in file order.` });
    return NextResponse.json({ spec, svg: renderGraphSvg(spec, swatches), checks, report: createGraphReport(spec, checks, model, swatches), model });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Figure generation failed." }, { status: 500 });
  }
}
