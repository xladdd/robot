import { NextResponse } from "next/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/images";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const SHUTTERSTOCK_SEARCH_URL = "https://api.shutterstock.com/v2/images/search";
const MAX_REFERENCE_SIZE = 7_000_000;
const isImageDataUrl = (value: unknown): value is string => typeof value === "string" && value.length <= MAX_REFERENCE_SIZE && /^data:image\/(png|jpeg|webp);base64,/i.test(value);

type ImageResult = { b64_json?: string; url?: string };
type Usage = { cost?: number; prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
type StockImage = { id: string; description: string; sourceUrl: string; previewData: string };

function outputDataUrl(image: ImageResult) {
  if (image.b64_json) return `data:image/jpeg;base64,${image.b64_json}`;
  return image.url || "";
}

function stockPageUrl(id: string, description: string) {
  const slug = description.toLocaleLowerCase("en-US").normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "stock-photo";
  return `https://www.shutterstock.com/image-photo/${slug}-${id}`;
}

async function fetchPreviewDataUrl(url: string) {
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith("shutterstock.com") && !parsed.hostname.endsWith("shutterstockcdn.com")) throw new Error("Shutterstock returned an unexpected preview host.");
  const response = await fetch(parsed, { headers: { "User-Agent": "Taktik Robot Cover Generator" } });
  if (!response.ok) throw new Error("A Shutterstock preview could not be downloaded.");
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) throw new Error("Shutterstock returned an invalid preview.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > 5_000_000) throw new Error("A Shutterstock preview was too large.");
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function searchShutterstock(brief: string, count: number): Promise<StockImage[]> {
  const token = process.env.SHUTTERSTOCK_API_TOKEN;
  const key = process.env.SHUTTERSTOCK_API_KEY;
  const secret = process.env.SHUTTERSTOCK_API_SECRET;
  if (!token && !(key && secret)) throw new Error("Shutterstock search is enabled, but its API credentials are not configured.");

  const url = new URL(SHUTTERSTOCK_SEARCH_URL);
  url.searchParams.set("query", brief.replace(/\s+/g, " ").slice(0, 300));
  url.searchParams.set("orientation", "vertical");
  url.searchParams.set("image_type", "photo,illustration");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("per_page", String(Math.max(1, Math.min(count, 4))));
  const authorization = token ? `Bearer ${token}` : `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
  const response = await fetch(url, { headers: { Authorization: authorization, "User-Agent": "Taktik Robot Cover Generator", Accept: "application/json" } });
  const result = await response.json() as { data?: Array<{ id?: string; description?: string; assets?: { preview?: { url?: string } } }>; message?: string };
  if (!response.ok) throw new Error(result.message || "Shutterstock search failed.");
  const matches = (result.data || []).filter((item) => item.id && item.assets?.preview?.url).slice(0, count);
  if (!matches.length) throw new Error("Shutterstock found no suitable vertical previews for this brief.");
  return Promise.all(matches.map(async (item) => {
    const id = String(item.id);
    const description = item.description?.trim() || `Shutterstock image ${id}`;
    return { id, description, sourceUrl: stockPageUrl(id, description), previewData: await fetchPreviewDataUrl(item.assets!.preview!.url!) };
  }));
}

function decodeHtmlAttribute(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

async function resolveShutterstockInput(input: string): Promise<StockImage> {
  if (!/^https?:\/\//i.test(input)) return (await searchShutterstock(input, 1))[0];
  const source = new URL(input);
  if (!source.hostname.endsWith("shutterstock.com") && !source.hostname.endsWith("shutterstockcdn.com")) throw new Error("Direct research URLs must point to Shutterstock.");
  if (source.hostname.endsWith("shutterstockcdn.com")) {
    return { id: `direct-${Date.now()}`, description: "Direct Shutterstock preview", sourceUrl: source.toString(), previewData: await fetchPreviewDataUrl(source.toString()) };
  }
  const response = await fetch(source, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Taktik Robot Cover Generator)", Accept: "text/html" } });
  if (!response.ok) throw new Error("The Shutterstock page URL could not be opened.");
  const html = await response.text();
  const imageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!imageMatch?.[1]) throw new Error("The Shutterstock page did not expose a free preview image.");
  const descriptionMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  const id = source.pathname.match(/-(\d+)(?:\/)?$/)?.[1] || `direct-${Date.now()}`;
  return {
    id,
    description: descriptionMatch?.[1] ? decodeHtmlAttribute(descriptionMatch[1]).slice(0, 240) : `Shutterstock image ${id}`,
    sourceUrl: source.toString(),
    previewData: await fetchPreviewDataUrl(decodeHtmlAttribute(imageMatch[1])),
  };
}

async function resolveShutterstockResearch(inputs: string[], fallbackBrief: string, fallbackCount: number) {
  const requests = inputs.map((input) => input.trim()).filter(Boolean).slice(0, 4);
  if (!requests.length) return searchShutterstock(fallbackBrief, fallbackCount);
  const resolved = await Promise.all(requests.map(resolveShutterstockInput));
  return [...new Map(resolved.map((item) => [item.sourceUrl, item])).values()];
}

async function generate(apiKey: string, model: string, prompt: string, references: string[], seed: number, resolution: "512" | "1K" | "2K") {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.APP_URL || "http://localhost:3000", "X-Title": "Taktik Robot" },
    body: JSON.stringify({
      model, prompt, input_references: references.map((url) => ({ type: "image_url", image_url: { url } })),
      aspect_ratio: "3:4", resolution, output_format: "jpeg", seed,
    }),
  });
  const result = await response.json() as { id?: string; data?: ImageResult[]; usage?: Usage; error?: { message?: string } };
  const data = result.data?.[0] ? outputDataUrl(result.data[0]) : "";
  if (!response.ok || !data) throw new Error(result.error?.message || "OpenRouter returned no image.");
  return {
    data,
    generationId: result.id,
    usage: {
      cost: typeof result.usage?.cost === "number" ? result.usage.cost : null,
      promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null,
      totalTokens: result.usage?.total_tokens ?? null,
    },
  };
}

async function analyzeCoverAssets(apiKey: string, direction: string, brief: string, maxAssets: 2 | 3) {
  const model = process.env.OPENROUTER_COVER_ANALYSIS_MODEL || process.env.OPENROUTER_OCR_MODEL || "mistralai/mistral-small-2603";
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.APP_URL || "http://localhost:3000", "X-Title": "Taktik Robot" },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: "user", content: [
        { type: "text", text: `Analyse the selected textbook-cover concept and identify exactly ${maxAssets} essential visual objects or object groups that a designer would need as separate editable assets. Do not list typography, logos, frames, colour fields, generic lighting, or the entire background. Prefer coherent groups such as "human evolution figure sequence", "solar and wind energy installation", or "foreground DNA double helix" rather than tiny fragments. Return JSON only as {"assets":[{"name":"short filename-safe name","description":"precise visual description including pose, angle, materials and crop"}]}. Book brief: ${brief}` },
        { type: "image_url", image_url: { url: direction } },
      ] }],
      response_format: { type: "json_object" },
    }),
  });
  const result = await response.json() as { id?: string; choices?: Array<{ message?: { content?: string } }>; usage?: Usage; error?: { message?: string } };
  const raw = result.choices?.[0]?.message?.content;
  if (!response.ok || !raw) throw new Error(result.error?.message || "The selected cover could not be analysed.");
  const parsed = JSON.parse(raw) as { assets?: Array<{ name?: unknown; description?: unknown }> };
  const assets = (parsed.assets || []).flatMap((asset) => {
    const name = typeof asset.name === "string" ? asset.name.trim().slice(0, 100) : "";
    const description = typeof asset.description === "string" ? asset.description.trim().slice(0, 600) : "";
    return name && description ? [{ name, description }] : [];
  }).slice(0, maxAssets);
  if (assets.length < 1) throw new Error("No separable cover objects were detected.");
  return {
    assets,
    model,
    generationId: result.id,
    usage: {
      cost: typeof result.usage?.cost === "number" ? result.usage.cost : null,
      promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null,
      totalTokens: result.usage?.total_tokens ?? null,
    },
  };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });
    const body = await request.json() as { mode?: unknown; brief?: unknown; references?: unknown; direction?: unknown; layers?: unknown; useShutterstock?: unknown; stockInputs?: unknown; medium?: unknown; sketchQuality?: unknown; generationCount?: unknown; maxAssets?: unknown };
    const brief = typeof body.brief === "string" ? body.brief.trim().slice(0, 8_000) : "";
    const submittedReferences = Array.isArray(body.references) ? body.references.slice(0, 3) : [];
    const references = submittedReferences.filter(isImageDataUrl);
    const direction = isImageDataUrl(body.direction) ? body.direction : undefined;
    const useShutterstock = body.useShutterstock === true;
    const stockInputs = Array.isArray(body.stockInputs) ? body.stockInputs.filter((input): input is string => typeof input === "string").map((input) => input.trim().slice(0, 500)).filter(Boolean).slice(0, 4) : [];
    const medium = body.medium === "photo" || body.medium === "illustration" || body.medium === "3d" ? body.medium : "match";
    const mediumInstruction = medium === "photo"
      ? "The output must be a premium editorial photo-composite. Preserve real source-photo texture, sharply controlled cut-out edges, credible anatomy and materials, coherent atmospheric colour grading, and deliberate depth separation. Treat it as professionally retouched stock photography assembled into one composition—not as a single camera exposure, painterly illustration, cartoon, plastic 3D render, or generic AI fantasy art."
      : medium === "illustration"
        ? "The output must be a polished editorial illustration that closely matches the references' specific illustration technique, mark-making, texture, and finish."
        : medium === "3d"
          ? "The output must be a polished 3D editorial render that closely matches the references' materials, lighting, camera, and rendering finish."
          : "First infer the dominant visual medium shared by the reference covers—editorial photo-composite, illustration, or 3D—and reproduce that same medium faithfully. Preserve the references' actual construction technique: a deliberate photographic collage should retain real source-photo texture and crisp composited edges rather than becoming either a single cinematic camera scene or a painterly/generic AI image.";
    const subjectInstruction = /\b(evolution|hominin|human origins|human evolution)\b/i.test(brief)
      ? "For human evolution, show a scientifically recognisable left-to-right paleoanthropological reconstruction sequence—Australopithecus, Homo habilis, Homo erectus, Neanderthal, and Homo sapiens—not ordinary modern people of different ages. Keep every figure classroom-safe, non-explicit, and covered with simple neutral museum-diorama garments."
      : "Interpret every requested subject literally and preserve meaningful scientific, historical, or product distinctions rather than replacing them with generic visual substitutes.";
    if (!brief) return NextResponse.json({ error: "Write a cover brief before generating." }, { status: 400 });
    if (references.length < 2) return NextResponse.json({ error: `Only ${references.length} of ${submittedReferences.length} submitted reference covers passed validation. Add at least two PNG, JPEG, or WebP covers; large images are resized automatically.` }, { status: 400 });

    if (body.mode === "analyze") {
      if (!direction) return NextResponse.json({ error: "Select one concept before automatic object detection." }, { status: 400 });
      return NextResponse.json(await analyzeCoverAssets(apiKey, direction, brief, body.maxAssets === 2 ? 2 : 3));
    }

    if (body.mode === "sketch") {
      const highFidelity = body.sketchQuality !== "fast";
      const model = highFidelity ? (process.env.OPENROUTER_COVER_FIDELITY_MODEL || "black-forest-labs/flux.2-pro") : (process.env.OPENROUTER_COVER_SKETCH_MODEL || "black-forest-labs/flux.2-klein-4b");
      const generationCount = body.generationCount === 1 ? 1 : body.generationCount === 2 ? 2 : 4;
      const seeds = Array.from({ length: generationCount }, () => Math.floor(Math.random() * 2_000_000_000));
      const stock = useShutterstock ? await resolveShutterstockResearch(stockInputs, brief, generationCount) : [];
      const generateSketch = async (seed: number, index: number) => {
        const stockImage = stock[index % stock.length];
        const seriesReferences = direction && stockImage ? references.slice(0, 2) : references.slice(0, 3);
        const sketchReferences = [...seriesReferences, ...(direction ? [direction] : []), ...(stockImage ? [stockImage.previewData] : [])].slice(0, 4);
        const stockInstruction = stockImage ? " The final reference is a watermarked Shutterstock preview used only as subject and visual research. Reinterpret it; do not reproduce the watermark or treat it as licensed production artwork." : "";
        const directionInstruction = direction
          ? `Reference images 1–${seriesReferences.length} are examples of the established cover series. Reference image ${seriesReferences.length + 1} is the selected composition from the previous round: keep its main subject hierarchy and spatial arrangement while bringing its finish closer to the established series.`
          : `Reference images 1–${seriesReferences.length} are equally weighted examples of one established cover series. Infer the visual grammar repeated across them rather than copying the particular subject matter of any one image.`;
        const prompt = `IMAGE-ONLY COVER ARTWORK. The upper title-safe area must remain uninterrupted image or colour: no title, pseudo-title, glyphs, lettering, numerals, logos, seals, badges, watermarks, labels, frames, author panels, or publisher template elements anywhere.

${directionInstruction}

Create only the full-bleed artwork for a new portrait educational textbook cover. Match the series' repeated visual grammar with high fidelity: medium and source-image texture, cut-out or mark-making technique, realism level, edge treatment, palette and colour grading, lighting logic, foreground/middle-ground/background layering, visual density, focal hierarchy, age appropriateness, and the location and size of quiet space reserved for the publisher's template.

${mediumInstruction}

${subjectInstruction} Build a legible cover composition with clear depth layers and an intentional, uninterrupted image-only upper third. Do not reuse identifiable people or exact objects from the source covers.${stockInstruction}

Requested new subject: ${brief}`;
        const generated = await generate(apiKey, model, prompt, sketchReferences, seed, highFidelity ? "1K" : "512");
        return { ...generated, seed, model, stock: stockImage ? { id: stockImage.id, description: stockImage.description, sourceUrl: stockImage.sourceUrl } : undefined };
      };
      const firstAttempts = await Promise.allSettled(seeds.map(generateSketch));
      const settled = await Promise.all(firstAttempts.map(async (result, index) => {
        if (result.status === "fulfilled") return result;
        try {
          return { status: "fulfilled", value: await generateSketch(Math.floor(Math.random() * 2_000_000_000), index) } as const;
        } catch (reason) {
          return { status: "rejected", reason } as const;
        }
      }));
      const images = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const warnings = settled.flatMap((result, index) => result.status === "rejected" ? [`Sketch ${index + 1} also failed on its replacement attempt: ${result.reason instanceof Error ? result.reason.message : "generation failed"}`] : []);
      if (!images.length) throw new Error(warnings[0] || "All cover sketches failed.");
      return NextResponse.json({ images, warnings });
    }

    if (body.mode === "master") {
      if (!direction) return NextResponse.json({ error: "Select one concept before creating a 2K master." }, { status: 400 });
      const model = process.env.OPENROUTER_COVER_PRODUCTION_MODEL || "black-forest-labs/flux.2-pro";
      const seed = Math.floor(Math.random() * 2_000_000_000);
      const productionReferences = [...references.slice(0, 3), direction].slice(0, 4);
      const prompt = `Reference images 1–${Math.min(3, references.length)} establish the cover series. The final reference is the selected cover direction.

Create a high-resolution 2K cover master from the selected direction. Preserve its complete composition, subject hierarchy, positions, crop, perspective, style, palette, lighting and photographic or illustrative character while improving edge quality, coherent detail and print finish. Keep the intentional title-safe area. Render image-only artwork with no typography, pseudo-letters, numerals, logos, seals, badges, watermarks, author panels or publisher template elements. ${mediumInstruction}

Book brief: ${brief}`;
      const generated = await generate(apiKey, model, prompt, productionReferences, seed, "2K");
      return NextResponse.json({ images: [{ ...generated, seed, name: "2K cover master", model }] });
    }

    if (body.mode === "layers") {
      if (!direction) return NextResponse.json({ error: "Select one sketch before generating production assets." }, { status: 400 });
      const layers = Array.isArray(body.layers) ? body.layers.filter((name): name is string => typeof name === "string" && name.trim().length > 0).slice(0, 8) : [];
      if (!layers.length) return NextResponse.json({ error: "Add at least one production asset." }, { status: 400 });
      const model = process.env.OPENROUTER_COVER_PRODUCTION_MODEL || "black-forest-labs/flux.2-pro";
      const stock = useShutterstock ? await resolveShutterstockResearch(stockInputs, brief, Math.min(4, layers.length)) : [];
      const tasks = layers.map((name) => ({ name, master: false }));
      const settled = await Promise.allSettled(tasks.map(async (task, index) => {
        const seed = Math.floor(Math.random() * 2_000_000_000);
        const stockImage = stock.length ? stock[index % stock.length] : undefined;
        const productionReferences = stockImage ? [...references.slice(0, 2), direction, stockImage.previewData] : [...references.slice(0, 3), direction];
        const stockInstruction = stockImage ? " The final reference is an unlicensed, watermarked Shutterstock preview for subject research only; reinterpret it and do not reproduce its watermark." : "";
        const prompt = `Reference images 1–${stockImage ? Math.min(2, references.length) : references.length} establish the cover series. The next reference is the selected cover direction and controls this asset's subject identity, perspective, lighting, and colour. ${stockImage ? "The final reference is Shutterstock subject research only." : ""}

Create one print-oriented production asset for that selected textbook cover: "${task.name}". Preserve the selected direction's visual medium, source-image texture, realism, colours, lighting, subject identity, viewing angle, and edge treatment. ${mediumInstruction}

Show only the requested asset, isolated cleanly against a plain light-neutral background with generous margins. Render it complete and unobstructed. Include no typography, logos, frames, unrelated props, cast shadows from absent objects, or other named assets. Target an A4 portrait print workflow at the highest available native detail.${stockInstruction}

Book brief: ${brief}`;
        const generated = await generate(apiKey, model, prompt, productionReferences, seed, "2K");
        return { ...generated, seed, name: task.name, model, stock: stockImage ? { id: stockImage.id, description: stockImage.description, sourceUrl: stockImage.sourceUrl } : undefined };
      }));
      const images = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const warnings = settled.flatMap((result, index) => result.status === "rejected" ? [`${tasks[index].name}: ${result.reason instanceof Error ? result.reason.message : "generation failed"}`] : []);
      if (!images.length) throw new Error(warnings[0] || "All production assets failed.");
      return NextResponse.json({ images, warnings });
    }
    return NextResponse.json({ error: "Unknown cover generation mode." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cover generation failed." }, { status: 500 });
  }
}
