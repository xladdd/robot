import { NextResponse } from "next/server";
import { createDiagramReport, createFigureReport, createMapReport, renderDiagramSvg, renderFigureSvg, renderMapSvg, validateDiagramSpec, validateFigureSpec, validateMapSpec, type RenderSwatch } from "./figure";
import { applyHistoricalBoundaryCatalog, applyPhysicalMapCatalog } from "../../map-generator/code/map-catalog";
import { fillPrompt, loadPrompt } from "../../../load-prompt";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_INPUT_LENGTH = 20_000;
const MAX_REFERENCES = 3;
const MAX_REFERENCE_LENGTH = 7_000_000;
type CitationAnnotation = { type?: string; url?: string; url_citation?: { url?: string; title?: string; content?: string } };

function citationUrl(annotation: CitationAnnotation) {
  return annotation.url_citation?.url || annotation.url || "";
}

function citationHost(url: string) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

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

const diagramPrompt = loadPrompt("image/diagram-generator/prompts/system.md");

const diagramSchema = {
  type: "object",
  properties: {
    error: { type: ["string", "null"] },
    diagram: {
      type: ["object", "null"], properties: {
        version: { type: "integer", enum: [1] }, kind: { type: "string", enum: ["biology"] }, title: { type: "string" }, subtitle: { type: "string" }, subject: { type: "string" },
        outline: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false } },
        structures: { type: "array", items: { type: "object", properties: { label: { type: "string" }, description: { type: "string" }, shape: { type: "string", enum: ["ellipse", "circle", "dots", "vacuole"] }, x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, labelX: { type: "number" }, labelY: { type: "number" }, color: { type: "string", enum: ["orange", "teal", "purple", "pink", "green", "yellow", "blue", "grey"] } }, required: ["label", "description", "shape", "x", "y", "width", "height", "labelX", "labelY", "color"], additionalProperties: false } },
        notes: { type: "array", items: { type: "string" } }, referenceSummary: { type: "string" },
      }, required: ["version", "kind", "title", "subtitle", "subject", "outline", "structures", "notes", "referenceSummary"], additionalProperties: false,
    },
  }, required: ["error", "diagram"], additionalProperties: false,
};

const mapPrompt = loadPrompt("image/map-generator/prompts/system.md");
const mapResearchPrompt = loadPrompt("image/map-generator/prompts/research.md");
const mapResearchContextPrompt = loadPrompt("image/map-generator/prompts/research-context.md");

const pointSchema = { type: "object", properties: { lon: { type: "number" }, lat: { type: "number" } }, required: ["lon", "lat"], additionalProperties: false };
const mapSchema = {
  type: "object",
  properties: {
    error: { type: ["string", "null"] },
    map: {
      type: ["object", "null"], properties: {
        version: { type: "integer", enum: [1] }, kind: { type: "string", enum: ["map"] }, title: { type: "string" }, subtitle: { type: "string" }, place: { type: "string" }, date: { type: "string" }, projection: { type: "string", enum: ["schematic"] }, geometry: { type: "string", enum: ["countries", "historical"] },
        categories: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, color: { type: "string", enum: ["orange", "teal", "purple", "pink", "green", "yellow", "blue", "grey", "red", "brown"] } }, required: ["id", "label", "color"], additionalProperties: false } },
        regions: { type: "array", items: { type: "object", properties: { label: { type: "string" }, category: { type: "string" }, isoNumeric: { type: "string" }, atlasName: { type: "string" }, polygons: { type: "array", items: { type: "array", items: pointSchema } }, labelLon: { type: "number" }, labelLat: { type: "number" }, sourceIds: { type: "array", items: { type: "string" } } }, required: ["label", "category", "isoNumeric", "atlasName", "polygons", "labelLon", "labelLat", "sourceIds"], additionalProperties: false } },
        features: { type: "array", items: { type: "object", properties: { label: { type: "string" }, kind: { type: "string", enum: ["area", "line", "route", "point"] }, style: { type: "string", enum: ["physical", "river", "mountain", "route", "city", "battle"] }, category: { type: "string" }, points: { type: "array", items: pointSchema }, sourceIds: { type: "array", items: { type: "string" } } }, required: ["label", "kind", "style", "category", "points", "sourceIds"], additionalProperties: false } },
        labels: { type: "array", items: { type: "object", properties: { label: { type: "string" }, kind: { type: "string", enum: ["place", "water"] }, lon: { type: "number" }, lat: { type: "number" } }, required: ["label", "kind", "lon", "lat"], additionalProperties: false } },
        viewport: { type: "object", properties: { west: { type: "number" }, south: { type: "number" }, east: { type: "number" }, north: { type: "number" } }, required: ["west", "south", "east", "north"], additionalProperties: false },
        showScaleBar: { type: "boolean" }, showNorthArrow: { type: "boolean" },
        sources: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, url: { type: "string" } }, required: ["id", "title", "url"], additionalProperties: false } },
        notes: { type: "array", items: { type: "string" } }, referenceSummary: { type: "string" },
      }, required: ["version", "kind", "title", "subtitle", "place", "date", "projection", "geometry", "categories", "regions", "features", "labels", "viewport", "showScaleBar", "showNorthArrow", "sources", "notes", "referenceSummary"], additionalProperties: false,
    },
  }, required: ["error", "map"], additionalProperties: false,
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });
    const body = await request.json() as { request?: unknown; mode?: unknown; references?: unknown; palette?: unknown; evaluationModel?: unknown };
    const userRequest = typeof body.request === "string" ? body.request.trim() : "";
    const mode = body.mode === "diagram" || body.mode === "map" ? body.mode : "chart";
    if (!userRequest || userRequest.length > MAX_INPUT_LENGTH) return NextResponse.json({ error: `Describe the ${mode} in at most ${MAX_INPUT_LENGTH} characters.` }, { status: 400 });
    const references = Array.isArray(body.references) ? body.references : [];
    if (references.length > MAX_REFERENCES || references.some((value) => typeof value !== "string" || value.length > MAX_REFERENCE_LENGTH || !/^data:image\/(png|jpeg|webp);base64,/i.test(value))) return NextResponse.json({ error: `Use up to ${MAX_REFERENCES} PNG, JPEG, or WebP reference images.` }, { status: 400 });
    if (mode === "chart" && references.length) return NextResponse.json({ error: "Reference images are supported only for diagrams and maps." }, { status: 400 });
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
    const userContent = mode !== "chart" && references.length
      ? [{ type: "text", text: userRequest }, ...references.map((url) => ({ type: "image_url", image_url: { url } }))]
      : userRequest;
    const schema = mode === "diagram" ? diagramSchema : mode === "map" ? mapSchema : responseSchema;
    let prompt = mode === "diagram" ? diagramPrompt : mode === "map" ? `${mapPrompt}\nToday is ${new Date().toISOString().slice(0, 10)}.` : systemPrompt;
    let researchedUrls = new Set<string>();
    if (mode === "map") {
      const researchResponse = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.APP_URL || "http://localhost:3000", "X-Title": "Taktik Robot" },
        body: JSON.stringify({
          model: configuredModel, temperature: 0,
          messages: [
            { role: "system", content: fillPrompt(mapResearchPrompt, { date: new Date().toISOString().slice(0, 10) }) },
            { role: "user", content: userRequest },
          ],
          tools: [{ type: "openrouter:web_search", parameters: { max_results: 5, max_total_results: 10, max_uses: 3 } }],
        }),
      });
      const researchResult = await researchResponse.json() as { choices?: Array<{ message?: { content?: string; annotations?: CitationAnnotation[] } }>; error?: { message?: string } };
      const researchMessage = researchResult.choices?.[0]?.message;
      researchedUrls = new Set((researchMessage?.annotations ?? []).map(citationUrl).filter(Boolean).map((url) => url.replace(/\/$/, "")));
      if (!researchResponse.ok || !researchMessage?.content) return NextResponse.json({ error: researchResult.error?.message || "Map research failed." }, { status: researchResponse.status || 502 });
      if (!researchedUrls.size) return NextResponse.json({ error: "Map research returned no verifiable web citations. Please try again." }, { status: 422 });
      prompt += `\n\n${mapResearchContextPrompt}\n\n${researchMessage.content}\n\nAllowed source URLs:\n${[...researchedUrls].join("\n")}`;
    }
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.APP_URL || "http://localhost:3000", "X-Title": "Taktik Robot" },
      body: JSON.stringify({ model, temperature: 0, ...(model.startsWith("qwen/") ? { reasoning: { enabled: false } } : {}), messages: [{ role: "system", content: prompt }, { role: "user", content: userContent }], response_format: { type: "json_schema", json_schema: { name: mode === "diagram" ? "biological_diagram" : mode === "map" ? "factual_map" : "verified_chart", strict: true, schema } } }),
    });
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    const raw = result.choices?.[0]?.message?.content;
    if (!response.ok || !raw) return NextResponse.json({ error: result.error?.message || "OpenRouter returned no figure specification." }, { status: response.status || 502 });
    let parsed: { error?: unknown; figure?: unknown; diagram?: unknown; map?: unknown };
    try { parsed = JSON.parse(raw); } catch { return NextResponse.json({ error: "The model returned invalid structured data." }, { status: 502 }); }
    if (typeof parsed.error === "string" && parsed.error.trim()) return NextResponse.json({ error: parsed.error.trim() }, { status: 422 });
    if (mode === "diagram") {
      const { spec, checks } = validateDiagramSpec(parsed.diagram);
      if (swatches.length) checks.push({ level: "pass", message: `${swatches.length} locally parsed Adobe swatches were applied in file order.` });
      return NextResponse.json({ spec, svg: renderDiagramSvg(spec, swatches), checks, report: createDiagramReport(spec, checks, model, references.length, swatches), model });
    }
    if (mode === "map") {
      const { spec, checks } = validateMapSpec(parsed.map);
      for (const source of spec.sources) {
        const normalized = source.url.replace(/\/$/, "");
        if (researchedUrls.has(normalized)) continue;
        const host = citationHost(source.url);
        const researchedUrl = [...researchedUrls].find((url) => host && citationHost(url) === host);
        if (researchedUrl) source.url = researchedUrl;
      }
      const removedSourceIds = new Set(spec.sources.filter(({ url }) => !researchedUrls.has(url.replace(/\/$/, ""))).map(({ id }) => id));
      spec.sources = spec.sources.filter(({ id }) => !removedSourceIds.has(id));
      const usedResearchUrls = new Set(spec.sources.map(({ url }) => url.replace(/\/$/, "")));
      for (const url of researchedUrls) {
        if (usedResearchUrls.has(url)) continue;
        spec.sources.push({ id: `WEB${spec.sources.length + 1}`, title: citationHost(url) || "Web research source", url });
      }
      if (!spec.sources.length) return NextResponse.json({ error: "Map research returned no usable cited sources." }, { status: 422 });
      const verifiedSourceIds = spec.sources.map(({ id }) => id);
      for (const region of spec.regions) {
        region.sourceIds = region.sourceIds.filter((id) => !removedSourceIds.has(id));
        if (!region.sourceIds.length) region.sourceIds = [...verifiedSourceIds];
      }
      for (const feature of spec.features) {
        feature.sourceIds = feature.sourceIds.filter((id) => !removedSourceIds.has(id));
        if (!feature.sourceIds.length) feature.sourceIds = [...verifiedSourceIds];
      }
      if (removedSourceIds.size) checks.push({ level: "warning", message: `${removedSourceIds.size} model-suggested bibliography ${removedSourceIds.size === 1 ? "entry was" : "entries were"} omitted because it was not returned by web research.` });
      checks.splice(2, 0, { level: "pass", message: `${researchedUrls.size} web citation${researchedUrls.size === 1 ? "" : "s"} grounded the map specification.` });
      if (applyPhysicalMapCatalog(userRequest, spec)) checks.push({ level: "pass", message: "Known physical features were resolved from the local geographic catalogue instead of model-generated geometry." });
      if (applyHistoricalBoundaryCatalog(userRequest, spec)) checks.push({ level: "pass", message: "Historical state boundaries were resolved from the licensed CShapes 2.0 catalogue instead of model-generated polygons." });
      if (swatches.length) checks.push({ level: "pass", message: `${swatches.length} locally parsed Adobe swatches were applied in file order.` });
      return NextResponse.json({ spec, svg: renderMapSvg(spec, swatches), checks, report: createMapReport(spec, checks, model, references.length, swatches), model });
    }
    const { spec, checks } = validateFigureSpec(parsed.figure);
    if (swatches.length) checks.push({ level: "pass", message: `${swatches.length} locally parsed Adobe swatches were applied in file order.` });
    return NextResponse.json({ spec, svg: renderFigureSvg(spec, swatches), checks, report: createFigureReport(spec, checks, model, swatches), model });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Figure generation failed." }, { status: 500 });
  }
}
