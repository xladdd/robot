import { NextResponse } from "next/server";
import sharp from "sharp";
import { fillPrompt, loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
  type OpenRouterContext,
} from "../../../openrouter/server";
import {
  assertOpaqueBackground,
  chooseKeyColour,
  extractChromaAlpha,
  hasVisiblePixels,
} from "./keying";
import { compositeLayers } from "./composite";
import { createLayeredPsd } from "./psd";
import { MAX_LAYER_COUNT, parseJsonObject, parseLayerPlan } from "./layer-plan";
import type { LayerPlanItem, LayerSplitterQuality } from "../types";

const MAX_SOURCE_DATA_URL_LENGTH = 24_000_000;
const MAX_PIXELS = 36_000_000;
const IMAGE_DATA_URL =
  /^data:image\/(png|jpeg|jpg|webp);base64,([a-z0-9+/=]+)$/i;
const analysisPrompt = loadPrompt(
  "image/layer-splitter/prompts/analyse-layers.md",
);
const backgroundPrompt = loadPrompt(
  "image/layer-splitter/prompts/reconstruct-background.md",
);
const objectPrompt = loadPrompt(
  "image/layer-splitter/prompts/reconstruct-object.md",
);

type Usage = {
  cost?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type ChatResult = {
  id?: string;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: Usage;
  error?: { message?: string };
};

type ImageResult = {
  b64_json?: string;
  url?: string;
};

type ImageApiResult = {
  id?: string;
  data?: ImageResult[];
  usage?: Usage;
  error?: { message?: string };
};

type DecodedSource = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  pngDataUrl: string;
};

function isImageDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_SOURCE_DATA_URL_LENGTH &&
    IMAGE_DATA_URL.test(value)
  );
}

function decodeDataUrl(value: string) {
  const match = value.match(IMAGE_DATA_URL);
  if (!match) throw new Error("The supplied file is not a supported image.");
  return Buffer.from(match[2], "base64");
}

async function decodeSource(dataUrl: string): Promise<DecodedSource> {
  const source = decodeDataUrl(dataUrl);
  const image = sharp(source, { limitInputPixels: MAX_PIXELS }).ensureAlpha();
  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height || info.width * info.height > MAX_PIXELS)
    throw new Error(
      "The image is too large. Please use an image up to 36 megapixels.",
    );
  const png = await sharp(source).png().toBuffer();
  return {
    width: info.width,
    height: info.height,
    pixels: new Uint8ClampedArray(data),
    pngDataUrl: `data:image/png;base64,${png.toString("base64")}`,
  };
}

function messageText(result: ChatResult) {
  const content = result.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { text?: string } =>
      Boolean(part && typeof part === "object"),
    )
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n");
}

async function fetchImageBytes(value: string) {
  if (value.startsWith("data:")) return decodeDataUrl(value);
  const response = await fetch(value, { redirect: "error" });
  if (!response.ok)
    throw new Error(
      "The generated image could not be downloaded from OpenRouter.",
    );
  const contentType = response.headers.get("content-type") || "image/png";
  if (!contentType.startsWith("image/"))
    throw new Error("OpenRouter returned a non-image response.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 24_000_000)
    throw new Error("The returned image is too large.");
  return bytes;
}

function imageDataUrl(image: ImageResult) {
  if (image.b64_json) return `data:image/png;base64,${image.b64_json}`;
  return image.url || "";
}

function aspectRatio(width: number, height: number) {
  const ratios = [
    { value: "1:1", ratio: 1 },
    { value: "4:3", ratio: 4 / 3 },
    { value: "3:4", ratio: 3 / 4 },
    { value: "3:2", ratio: 3 / 2 },
    { value: "2:3", ratio: 2 / 3 },
    { value: "16:9", ratio: 16 / 9 },
    { value: "9:16", ratio: 9 / 16 },
  ];
  const target = width / height;
  return ratios.reduce((best, candidate) =>
    Math.abs(candidate.ratio - target) < Math.abs(best.ratio - target)
      ? candidate
      : best,
  ).value;
}

async function prepareImage(bytes: Buffer, width: number, height: number) {
  const { data } = await sharp(bytes, { limitInputPixels: MAX_PIXELS })
    .ensureAlpha()
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8ClampedArray(data);
}

async function analyseLayers(
  openRouter: OpenRouterContext,
  source: string,
  maxLayers: number,
  signal?: AbortSignal,
) {
  const model =
    process.env.OPENROUTER_LAYER_SPLITTER_PLAN_MODEL ||
    "mistralai/mistral-small-2603";
  const { response, result } = await requestOpenRouter<ChatResult>(
    openRouter,
    "chat/completions",
    "analyse-layer-plan",
    {
      model,
      temperature: 0,
      max_tokens: 3_000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: fillPrompt(analysisPrompt, { maxLayers }) },
            { type: "image_url", image_url: { url: source } },
          ],
        },
      ],
    },
    { signal },
  );
  const raw = messageText(result);
  if (!response.ok || !raw)
    throw new Error(
      result.error?.message || "The image could not be analysed.",
    );
  return { model, plan: parseLayerPlan(parseJsonObject(raw)) };
}

function modelForQuality(quality: LayerSplitterQuality) {
  return quality === "fidelity"
    ? process.env.OPENROUTER_LAYER_SPLITTER_FIDELITY_MODEL ||
        "black-forest-labs/flux.2-pro"
    : process.env.OPENROUTER_LAYER_SPLITTER_FAST_MODEL ||
        "black-forest-labs/flux.2-klein-4b";
}

function resolutionForQuality(quality: LayerSplitterQuality) {
  return quality === "fidelity" ? "1K" : "512";
}

async function generateImage(
  openRouter: OpenRouterContext,
  operation: string,
  source: string,
  prompt: string,
  quality: LayerSplitterQuality,
  width: number,
  height: number,
  seed: number,
  signal?: AbortSignal,
) {
  const model = modelForQuality(quality);
  const { response, result } = await requestOpenRouter<ImageApiResult>(
    openRouter,
    "images",
    operation,
    {
      model,
      prompt,
      input_references: [{ type: "image_url", image_url: { url: source } }],
      aspect_ratio: aspectRatio(width, height),
      resolution: resolutionForQuality(quality),
      output_format: "png",
      seed,
    },
    { signal },
  );
  const dataUrl = result.data?.[0] ? imageDataUrl(result.data[0]) : "";
  if (!response.ok || !dataUrl)
    throw new Error(
      result.error?.message || "OpenRouter returned no generated image.",
    );
  return { model, bytes: await fetchImageBytes(dataUrl) };
}

function keyColourText(key: readonly number[]) {
  return `#${key.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  limit: number,
  callback: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      results[index] = await callback(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, values.length)) }, () =>
      worker(),
    ),
  );
  return results;
}

function layerFilename() {
  return "robot-layered-image.psd";
}

export async function POST(request: Request) {
  try {
    const openRouter = await getOpenRouterContext(request, "layerSplitter");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("layerSplitter") },
        { status: 503 },
      );
    const body = (await request.json()) as {
      image?: unknown;
      quality?: unknown;
    };
    if (!isImageDataUrl(body.image))
      return NextResponse.json(
        { error: "Please provide one PNG, JPEG, or WebP image." },
        { status: 400 },
      );
    const quality =
      body.quality === "fast" || body.quality === "fidelity"
        ? body.quality
        : null;
    if (!quality)
      return NextResponse.json(
        { error: "Please choose a valid quality setting." },
        { status: 400 },
      );

    const source = await decodeSource(body.image);
    const maxLayers = quality === "fidelity" ? MAX_LAYER_COUNT : 4;
    const analysed = await analyseLayers(
      openRouter,
      source.pngDataUrl,
      maxLayers,
      request.signal,
    );
    const aspect = aspectRatio(source.width, source.height);
    const baseSeed = Math.floor(Math.random() * 2_000_000_000);
    const background = await generateImage(
      openRouter,
      "reconstruct-layer-background",
      source.pngDataUrl,
      fillPrompt(backgroundPrompt, {
        backgroundDescription: analysed.plan.backgroundDescription,
      }),
      quality,
      source.width,
      source.height,
      baseSeed,
      request.signal,
    );
    const backgroundPixels = await prepareImage(
      background.bytes,
      source.width,
      source.height,
    );
    for (let offset = 3; offset < backgroundPixels.length; offset += 4)
      backgroundPixels[offset] = 255;
    assertOpaqueBackground(backgroundPixels);

    const generatedObjects = await mapConcurrent(
      analysed.plan.layers,
      2,
      async (layer: LayerPlanItem, index) => {
        const key = chooseKeyColour(
          source.pixels,
          source.width,
          source.height,
          layer.reconstructionBounds,
        );
        const generated = await generateImage(
          openRouter,
          "reconstruct-layer-object",
          source.pngDataUrl,
          fillPrompt(objectPrompt, {
            name: layer.name,
            description: layer.description,
            visibleBounds: JSON.stringify(layer.visibleBounds),
            reconstructionBounds: JSON.stringify(layer.reconstructionBounds),
            occludedBy: layer.occludedBy.join(", ") || "none",
            keyColour: keyColourText(key),
          }),
          quality,
          source.width,
          source.height,
          baseSeed + index + 1,
          request.signal,
        );
        const generatedPixels = await prepareImage(
          generated.bytes,
          source.width,
          source.height,
        );
        const keyed = extractChromaAlpha(
          generatedPixels,
          source.width,
          source.height,
          key,
        );
        if (!hasVisiblePixels(keyed.pixels))
          throw new Error(`The generated layer ${layer.name} is empty.`);
        return { layer, pixels: keyed.pixels };
      },
    );

    const backgroundLayer = { name: "Background", pixels: backgroundPixels };
    const objectLayers = generatedObjects.map(({ layer, pixels }) => ({
      name: layer.name,
      pixels,
    }));
    const allLayers = [...objectLayers, backgroundLayer];
    const composite = compositeLayers(source.width, source.height, allLayers);
    assertOpaqueBackground(composite);
    const preview = await sharp(Buffer.from(composite), {
      raw: { width: source.width, height: source.height, channels: 4 },
    })
      .png()
      .toBuffer();
    const psd = createLayeredPsd(
      source.width,
      source.height,
      composite,
      allLayers,
    );
    const generationModel = modelForQuality(quality);
    const warnings = [
      "Hidden object areas and removed text are reconstructed by AI and may differ from the source.",
    ];
    if (analysed.plan.textRegions.length)
      warnings.push(
        "The source contained text regions; generated output was instructed to remove them.",
      );

    return NextResponse.json({
      filename: layerFilename(),
      psdBase64: psd.toString("base64"),
      previewDataUrl: `data:image/png;base64,${preview.toString("base64")}`,
      layerNames: allLayers.map(({ name }) => name),
      planModel: analysed.model,
      generationModel,
      quality,
      validation: {
        backgroundOpaque: true,
        validObjectLayers: objectLayers.length,
        requestedObjectLayers: analysed.plan.layers.length,
        textDetected: analysed.plan.textRegions.length > 0,
        warnings,
      },
      aspect,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The image could not be reconstructed.";
    console.error(`[layer-splitter] ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
