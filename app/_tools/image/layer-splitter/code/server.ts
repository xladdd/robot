import { NextResponse } from "next/server";
import sharp from "sharp";
import { fillPrompt, loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
  type OpenRouterContext,
} from "../../../openrouter/server";
import { assertOpaqueBackground } from "./keying";
import { compositeLayers } from "./composite";
import { createLayeredPsd } from "./psd";
import { MAX_LAYER_COUNT, parseJsonObject, parseLayerPlan } from "./layer-plan";
import {
  combineMasks,
  componentsToMask,
  connectedMaskBounds,
  countOpaquePixels,
  fractionInsideBounds,
  hardenMask,
  makeMasksExclusive,
  parseMaskComponents,
  type PixelBounds,
} from "./mask";
import {
  compositeOriginalOverGenerated,
  eraseMaskedPixels,
  extractLayerFromSource,
  patchBackground,
} from "./extract";
import {
  backgroundModelForQuality,
  buildImageRequest,
  objectCompletionModel,
  type ImagePurpose,
} from "./image-model";
import {
  alphaMaskFromPixels,
  matchDecompositionMasks,
  retainVisibleLayerMasks,
} from "./decomposition";
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
const contourPrompt = loadPrompt(
  "image/layer-splitter/prompts/trace-contour.md",
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

function planModel() {
  return (
    process.env.OPENROUTER_LAYER_SPLITTER_PLAN_MODEL ||
    "mistralai/mistral-large-4-0"
  );
}

function planProviderRouting(model: string) {
  const configured = process.env.OPENROUTER_LAYER_SPLITTER_PLAN_PROVIDER;
  if (configured) return { only: [configured], allow_fallbacks: false };
  if (model.startsWith("mistralai/"))
    return { only: ["mistral/eu"], allow_fallbacks: false };
  return undefined;
}

async function analyseLayers(
  openRouter: OpenRouterContext,
  source: string,
  maxLayers: number,
  signal?: AbortSignal,
) {
  const model = planModel();
  const provider = planProviderRouting(model);
  const { response, result } = await requestOpenRouter<ChatResult>(
    openRouter,
    "chat/completions",
    "analyse-layer-plan",
    {
      model,
      ...(provider ? { provider } : {}),
      temperature: 0,
      reasoning: { enabled: false },
      max_tokens: 6_000,
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
  if (!response.ok)
    throw new Error(
      result.error?.message ||
        `Layer analysis failed with OpenRouter HTTP ${response.status}.`,
    );
  if (!raw)
    throw new Error(
      `Layer analysis returned no text from ${model} via ${provider?.only?.join(", ") || "automatic routing"}.`,
    );
  return { model, plan: parseLayerPlan(parseJsonObject(raw)) };
}

function maskModels() {
  return [
    process.env.OPENROUTER_LAYER_SPLITTER_MASK_MODEL || "qwen/qwen3.7-flash",
    process.env.OPENROUTER_LAYER_SPLITTER_MASK_FALLBACK_MODEL ||
      "google/gemini-3.6-flash",
  ].filter((model, index, models) => models.indexOf(model) === index);
}

function maskModel() {
  return maskModels()[0];
}

function maskProviderRouting(model: string) {
  const configured = process.env.OPENROUTER_LAYER_SPLITTER_MASK_PROVIDER;
  if (configured)
    return {
      only: [configured],
      allow_fallbacks: false,
      require_parameters: true,
    };
  if (model.startsWith("perceptron/"))
    return {
      only: ["perceptron"],
      allow_fallbacks: false,
      require_parameters: true,
    };
  return { require_parameters: true };
}

const maskResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "visible_object_mask",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["confidence", "components"],
      properties: {
        confidence: { type: "number", minimum: 0, maximum: 1 },
        components: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["outer", "holes"],
            properties: {
              outer: {
                type: "array",
                minItems: 8,
                items: { $ref: "#/$defs/point" },
              },
              holes: {
                type: "array",
                maxItems: 32,
                items: {
                  type: "array",
                  minItems: 3,
                  items: { $ref: "#/$defs/point" },
                },
              },
            },
          },
        },
      },
      $defs: {
        point: {
          type: "object",
          additionalProperties: false,
          required: ["x", "y"],
          properties: {
            x: { type: "number", minimum: 0, maximum: 1000 },
            y: { type: "number", minimum: 0, maximum: 1000 },
          },
        },
      },
    },
  },
};

function normalizedToPixelBounds(
  bounds: LayerPlanItem["visibleBounds"],
  width: number,
  height: number,
  paddingFraction = 0,
): PixelBounds {
  const baseWidth = Math.max(1, Math.ceil(bounds.width * width));
  const baseHeight = Math.max(1, Math.ceil(bounds.height * height));
  const padding = Math.max(
    paddingFraction > 0 ? 12 : 0,
    Math.round(Math.max(baseWidth, baseHeight) * paddingFraction),
  );
  const left = Math.max(0, Math.floor(bounds.x * width) - padding);
  const top = Math.max(0, Math.floor(bounds.y * height) - padding);
  const right = Math.min(
    width,
    Math.ceil((bounds.x + bounds.width) * width) + padding,
  );
  const bottom = Math.min(
    height,
    Math.ceil((bounds.y + bounds.height) * height) + padding,
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function regionHint(bounds: PixelBounds, width: number, height: number) {
  return JSON.stringify({
    x: Math.round((bounds.x / width) * 1000),
    y: Math.round((bounds.y / height) * 1000),
    width: Math.round((bounds.width / width) * 1000),
    height: Math.round((bounds.height / height) * 1000),
  });
}

function maskConfidenceThreshold() {
  const configured = Number(
    process.env.OPENROUTER_LAYER_SPLITTER_MASK_MIN_CONFIDENCE,
  );
  return Number.isFinite(configured)
    ? Math.min(1, Math.max(0, configured))
    : 0.55;
}

async function generateMask(
  openRouter: OpenRouterContext,
  sourceDataUrl: string,
  layer: LayerPlanItem,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const models = maskModels().flatMap((model) => [model, model]);
  const visibleBounds = normalizedToPixelBounds(
    layer.visibleBounds,
    width,
    height,
  );
  const prompt = fillPrompt(contourPrompt, {
    name: layer.name,
    description: layer.description,
    region: regionHint(visibleBounds, width, height),
  });
  let lastError = "the model returned no usable geometry";
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt];
    try {
      const correction = attempt
        ? `\n\nA previous model returned an invalid or incomplete mask: ${lastError}. Trace the entire named object, not only its face, hand, logo, or most salient detail.`
        : "";
      const { response, result } = await requestOpenRouter<ChatResult>(
        openRouter,
        "chat/completions",
        attempt ? "fallback-object-mask" : "trace-object-mask",
        {
          model,
          provider: maskProviderRouting(model),
          temperature: 0,
          ...(model.startsWith("perceptron/") || model.startsWith("qwen/")
            ? { reasoning: { enabled: false } }
            : {}),
          max_tokens: 8_000,
          response_format: model.startsWith("perceptron/")
            ? maskResponseFormat
            : { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: `${prompt}${correction}` },
                { type: "image_url", image_url: { url: sourceDataUrl } },
              ],
            },
          ],
        },
        { signal },
      );
      const raw = messageText(result);
      if (!response.ok || !raw)
        throw new Error(
          result.error?.message ||
            `OpenRouter returned HTTP ${response.status}.`,
        );
      const parsed = parseMaskComponents(parseJsonObject(raw));
      if (parsed.confidence < maskConfidenceThreshold())
        throw new Error(
          `confidence ${parsed.confidence.toFixed(2)} is below the required threshold`,
        );
      const mask = componentsToMask(parsed.components, width, height);
      if (countOpaquePixels(mask) === 0)
        throw new Error("the returned mask is empty");
      if (fractionInsideBounds(mask, width, height, layer.visibleBounds) < 0.6)
        throw new Error("the returned mask does not match the planned region");
      const componentBounds = connectedMaskBounds(mask, width, height);
      const left = Math.min(...componentBounds.map(({ x }) => x));
      const top = Math.min(...componentBounds.map(({ y }) => y));
      const right = Math.max(
        ...componentBounds.map(
          ({ x, width: componentWidth }) => x + componentWidth,
        ),
      );
      const bottom = Math.max(
        ...componentBounds.map(
          ({ y, height: componentHeight }) => y + componentHeight,
        ),
      );
      const extentCoverage =
        ((right - left) * (bottom - top)) /
        (visibleBounds.width * visibleBounds.height);
      if (extentCoverage < 0.18)
        throw new Error(
          `the mask covers only ${(extentCoverage * 100).toFixed(1)}% of the planned object extent`,
        );
      return mask;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt + 1 < models.length)
        console.warn(
          `[layer-splitter] Retrying mask for "${layer.name}" with ${models[attempt + 1]}: ${lastError}`,
        );
    }
  }
  throw new Error(`Could not trace layer "${layer.name}": ${lastError}`);
}

const MAX_IMAGE_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 2_000;

function isTransientImageFailure(response: Response, result: ImageApiResult) {
  if (response.status === 429 || response.status >= 500) return true;
  const message = result.error?.message || "";
  return (
    response.status === 404 ||
    /temporarily unavailable|unavailable dependency|overloaded|try again/i.test(
      message,
    )
  );
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    function abort() {
      clearTimeout(timer);
      reject(new Error("The request was cancelled."));
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function generateImage(
  openRouter: OpenRouterContext,
  operation: string,
  model: string,
  source: string,
  prompt: string,
  purpose: ImagePurpose,
  quality: LayerSplitterQuality,
  width: number,
  height: number,
  seed: number,
  signal?: AbortSignal,
) {
  let lastError = "OpenRouter returned no generated image.";
  for (let attempt = 0; attempt < MAX_IMAGE_ATTEMPTS; attempt += 1) {
    const { response, result } = await requestOpenRouter<ImageApiResult>(
      openRouter,
      "images",
      operation,
      buildImageRequest({
        model,
        prompt,
        reference: source,
        purpose,
        quality,
        width,
        height,
        seed,
      }),
      { signal },
    );
    const dataUrl = result.data?.[0] ? imageDataUrl(result.data[0]) : "";
    if (response.ok && dataUrl)
      return { model, bytes: await fetchImageBytes(dataUrl) };
    lastError = result.error?.message || lastError;
    if (
      attempt + 1 >= MAX_IMAGE_ATTEMPTS ||
      !isTransientImageFailure(response, result)
    )
      throw new Error(lastError);
    await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt, signal);
  }
  throw new Error(lastError);
}

function decompositionModel() {
  return (
    process.env.OPENROUTER_LAYER_SPLITTER_DECOMPOSITION_MODEL ||
    "inclusionai/ming-image-0.1-design-layer"
  );
}

async function generateDecompositionMasks(
  openRouter: OpenRouterContext,
  source: DecodedSource,
  layers: readonly LayerPlanItem[],
  seed: number,
  signal?: AbortSignal,
) {
  const model = decompositionModel();
  const { response, result } = await requestOpenRouter<ImageApiResult>(
    openRouter,
    "images",
    "decompose-source-layers",
    buildImageRequest({
      model,
      prompt:
        "Decompose this flattened image into separate accurate RGBA cutout layers for every major foreground object and one clean completed background. Preserve fine object silhouettes, openings, and disconnected parts.",
      reference: source.pngDataUrl,
      purpose: "background",
      quality: "fast",
      width: source.width,
      height: source.height,
      seed,
    }),
    { signal },
  );
  if (!response.ok)
    throw new Error(
      result.error?.message ||
        `Layer decomposition failed with OpenRouter HTTP ${response.status}.`,
    );
  if (!result.data || result.data.length < 2)
    throw new Error("The layer decomposition model returned too few images.");
  const masks = await Promise.all(
    result.data.map(async (image) => {
      const dataUrl = imageDataUrl(image);
      if (!dataUrl)
        throw new Error(
          "The layer decomposition model returned an empty image.",
        );
      const pixels = await prepareImage(
        await fetchImageBytes(dataUrl),
        source.width,
        source.height,
      );
      return alphaMaskFromPixels(pixels, source.width, source.height);
    }),
  );
  return {
    model,
    masks: matchDecompositionMasks(masks, layers, source.width, source.height),
  };
}

function cropPixels(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  bounds: PixelBounds,
) {
  if (pixels.length !== imageWidth * imageHeight * 4)
    throw new Error("Source pixel dimensions do not match.");
  const result = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y++) {
    const sourceStart = ((bounds.y + y) * imageWidth + bounds.x) * 4;
    const targetStart = y * bounds.width * 4;
    result.set(
      pixels.subarray(sourceStart, sourceStart + bounds.width * 4),
      targetStart,
    );
  }
  return result;
}

async function pixelsDataUrl(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const png = await sharp(Buffer.from(pixels), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

function placePixels(
  target: Uint8ClampedArray,
  targetWidth: number,
  targetHeight: number,
  patch: Uint8ClampedArray,
  bounds: PixelBounds,
) {
  if (target.length !== targetWidth * targetHeight * 4)
    throw new Error("Target pixel dimensions do not match.");
  if (patch.length !== bounds.width * bounds.height * 4)
    throw new Error("Patch pixel dimensions do not match its bounds.");
  for (let y = 0; y < bounds.height; y++) {
    const targetStart = ((bounds.y + y) * targetWidth + bounds.x) * 4;
    const patchStart = y * bounds.width * 4;
    target.set(
      patch.subarray(patchStart, patchStart + bounds.width * 4),
      targetStart,
    );
  }
}

function expandBounds(
  bounds: PixelBounds,
  width: number,
  height: number,
  fraction = 0.45,
): PixelBounds {
  const padding = Math.max(
    32,
    Math.round(Math.max(bounds.width, bounds.height) * fraction),
  );
  const x = Math.max(0, bounds.x - padding);
  const y = Math.max(0, bounds.y - padding);
  const right = Math.min(width, bounds.x + bounds.width + padding);
  const bottom = Math.min(height, bounds.y + bounds.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}

function boundsIntersect(left: PixelBounds, right: PixelBounds) {
  return (
    left.x <= right.x + right.width &&
    right.x <= left.x + left.width &&
    left.y <= right.y + right.height &&
    right.y <= left.y + left.height
  );
}

function mergeBounds(bounds: PixelBounds[]): PixelBounds[] {
  const merged: PixelBounds[] = [];
  for (const candidate of bounds) {
    let current = candidate;
    for (let i = merged.length - 1; i >= 0; i--) {
      if (!boundsIntersect(current, merged[i])) continue;
      const other = merged.splice(i, 1)[0];
      const x = Math.min(current.x, other.x);
      const y = Math.min(current.y, other.y);
      const right = Math.max(current.x + current.width, other.x + other.width);
      const bottom = Math.max(
        current.y + current.height,
        other.y + other.height,
      );
      current = { x, y, width: right - x, height: bottom - y };
      i = merged.length;
    }
    merged.push(current);
  }
  return merged.sort((left, right) => left.y - right.y || left.x - right.x);
}

function backgroundCropBounds(mask: Uint8Array, width: number, height: number) {
  return mergeBounds(
    connectedMaskBounds(mask, width, height).map((bounds) =>
      expandBounds(bounds, width, height),
    ),
  );
}

async function backgroundReference(
  source: DecodedSource,
  hardHoleMask: Uint8Array,
  bounds: PixelBounds,
) {
  const crop = cropPixels(source.pixels, source.width, source.height, bounds);
  const cropMask = new Uint8Array(bounds.width * bounds.height);
  for (let y = 0; y < bounds.height; y++)
    for (let x = 0; x < bounds.width; x++) {
      const sourceIndex = (bounds.y + y) * source.width + bounds.x + x;
      cropMask[y * bounds.width + x] = hardHoleMask[sourceIndex];
    }
  const erased = eraseMaskedPixels(crop, cropMask, bounds.width, bounds.height);
  return pixelsDataUrl(erased, bounds.width, bounds.height);
}

function assertTransparentObject(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  let visible = 0;
  for (let offset = 3; offset < pixels.length; offset += 4)
    if (pixels[offset] > 8) visible++;
  if (visible === 0)
    throw new Error("The object completion model returned an empty image.");
  const corners = [
    3,
    (width - 1) * 4 + 3,
    (height - 1) * width * 4 + 3,
    (height * width - 1) * 4 + 3,
  ];
  if (corners.filter((offset) => pixels[offset] > 8).length >= 3)
    throw new Error(
      "The object completion model returned an opaque background instead of transparency.",
    );
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
    const analysed = await analyseLayers(
      openRouter,
      source.pngDataUrl,
      MAX_LAYER_COUNT,
      request.signal,
    );
    const aspect = aspectRatio(source.width, source.height);
    const baseSeed = Math.floor(Math.random() * 2_000_000_000);
    let decompositionMasks: Array<Uint8Array | null> = analysed.plan.layers.map(
      () => null,
    );
    let decompositionWarning = "";
    try {
      const decomposition = await generateDecompositionMasks(
        openRouter,
        source,
        analysed.plan.layers,
        baseSeed,
        request.signal,
      );
      decompositionMasks = decomposition.masks;
    } catch (error) {
      if (request.signal.aborted) throw error;
      decompositionWarning =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `[layer-splitter] Falling back from direct layer decomposition: ${decompositionWarning}`,
      );
    }

    const tracedObjects = await mapConcurrent(
      analysed.plan.layers,
      2,
      async (layer: LayerPlanItem, index) => {
        const decomposed = decompositionMasks[index];
        const mask =
          decomposed &&
          fractionInsideBounds(
            decomposed,
            source.width,
            source.height,
            layer.visibleBounds,
          ) >= 0.55
            ? decomposed
            : await generateMask(
                openRouter,
                source.pngDataUrl,
                layer,
                source.width,
                source.height,
                request.signal,
              );
        return { layer, mask };
      },
    );
    const exclusiveMasks = makeMasksExclusive(
      tracedObjects.map(({ mask }) => mask),
      source.width,
      source.height,
    ).map((mask) => hardenMask(mask));
    const { retained, droppedLayerNames } = retainVisibleLayerMasks(
      tracedObjects.map(({ layer }) => layer),
      exclusiveMasks,
    );
    if (!retained.length)
      throw new Error("No object layer retained any visible source pixels.");

    const extractedObjects = retained.map(({ layer, mask, sourceIndex }) => ({
      layer,
      mask,
      usedDecomposition:
        tracedObjects[sourceIndex].mask === decompositionMasks[sourceIndex],
      pixels: extractLayerFromSource(
        source.pixels,
        mask,
        source.width,
        source.height,
      ),
    }));
    const decomposedLayerCount = extractedObjects.filter(
      ({ usedDecomposition }) => usedDecomposition,
    ).length;

    const completionModel = objectCompletionModel();
    const objectLayers = await mapConcurrent(
      extractedObjects,
      2,
      async ({ layer, pixels }, index) => {
        if (quality !== "fidelity" || layer.occludedBy.length === 0)
          return { name: layer.name, pixels };
        const cropBounds = normalizedToPixelBounds(
          layer.reconstructionBounds,
          source.width,
          source.height,
        );
        const visibleCrop = cropPixels(
          pixels,
          source.width,
          source.height,
          cropBounds,
        );
        const reference = await pixelsDataUrl(
          visibleCrop,
          cropBounds.width,
          cropBounds.height,
        );
        const generated = await generateImage(
          openRouter,
          "complete-layer-object",
          completionModel,
          reference,
          fillPrompt(objectPrompt, {
            name: layer.name,
            description: layer.description,
            visibleBounds: JSON.stringify(layer.visibleBounds),
            reconstructionBounds: JSON.stringify(layer.reconstructionBounds),
            occludedBy: layer.occludedBy.join(", "),
          }),
          "object-completion",
          quality,
          cropBounds.width,
          cropBounds.height,
          baseSeed + index + 1,
          request.signal,
        );
        const generatedCrop = await prepareImage(
          generated.bytes,
          cropBounds.width,
          cropBounds.height,
        );
        assertTransparentObject(
          generatedCrop,
          cropBounds.width,
          cropBounds.height,
        );
        const generatedPixels = new Uint8ClampedArray(
          source.width * source.height * 4,
        );
        placePixels(
          generatedPixels,
          source.width,
          source.height,
          generatedCrop,
          cropBounds,
        );
        return {
          name: layer.name,
          pixels: compositeOriginalOverGenerated(
            pixels,
            generatedPixels,
            source.width,
            source.height,
          ),
        };
      },
    );

    const hardHoleMask = hardenMask(
      combineMasks(
        extractedObjects.map(({ mask }) => mask),
        source.width,
        source.height,
      ),
    );
    const backgroundModel = backgroundModelForQuality(quality);
    const generatedBackgroundPixels = new Uint8ClampedArray(source.pixels);
    for (let offset = 3; offset < generatedBackgroundPixels.length; offset += 4)
      generatedBackgroundPixels[offset] = 255;
    const generatedCrops = await mapConcurrent(
      backgroundCropBounds(hardHoleMask, source.width, source.height),
      2,
      async (bounds, index) => {
        const reference = await backgroundReference(
          source,
          hardHoleMask,
          bounds,
        );
        const generated = await generateImage(
          openRouter,
          "fill-background-hole",
          backgroundModel,
          reference,
          fillPrompt(backgroundPrompt, {
            backgroundDescription: analysed.plan.backgroundDescription,
          }),
          "background",
          quality,
          bounds.width,
          bounds.height,
          baseSeed + 1000 + index,
          request.signal,
        );
        return {
          bounds,
          pixels: await prepareImage(
            generated.bytes,
            bounds.width,
            bounds.height,
          ),
        };
      },
    );
    for (const { bounds, pixels } of generatedCrops)
      placePixels(
        generatedBackgroundPixels,
        source.width,
        source.height,
        pixels,
        bounds,
      );
    const backgroundPixels = patchBackground(
      source.pixels,
      generatedBackgroundPixels,
      hardHoleMask,
      source.width,
      source.height,
    );
    assertOpaqueBackground(backgroundPixels);

    const backgroundLayer = { name: "Background", pixels: backgroundPixels };
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
    const warnings = [
      "Object layers preserve original source RGB and alpha through validated masks.",
      "Only pixels hidden by extracted objects are replaced in the background.",
      `${decomposedLayerCount} object masks came from direct RGBA decomposition; ${objectLayers.length - decomposedLayerCount} used spatial tracing fallback.`,
    ];
    if (decompositionWarning)
      warnings.push(
        `Direct layer decomposition was unavailable: ${decompositionWarning}`,
      );
    if (droppedLayerNames.length)
      warnings.push(
        `Dropped layers with no exclusive visible pixels: ${droppedLayerNames.join(
          ", ",
        )}.`,
      );
    if (
      quality === "fidelity" &&
      extractedObjects.some(({ layer }) => layer.occludedBy.length)
    )
      warnings.push(
        "Hidden parts of occluded objects are AI reconstructions and may differ from the source.",
      );
    if (analysed.plan.textRegions.length)
      warnings.push(
        "Text outside extracted objects remains in the source-preserved background.",
      );

    return NextResponse.json({
      filename: layerFilename(),
      psdBase64: psd.toString("base64"),
      previewDataUrl: `data:image/png;base64,${preview.toString("base64")}`,
      layerNames: allLayers.map(({ name }) => name),
      planModel: analysed.model,
      maskModel: decompositionModel(),
      maskFallbackModel: maskModel(),
      generationModel: backgroundModel,
      objectCompletionModel:
        quality === "fidelity" ? completionModel : undefined,
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
