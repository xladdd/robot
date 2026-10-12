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
import { createLayeredPsd, type PsdLayerInput } from "./psd";
import {
  MAX_LAYER_COUNT,
  parseJsonObject,
  parseLayerPlan,
  shouldRegenerateFullSubject,
} from "./layer-plan";
import {
  combineMasks,
  componentsToMask,
  connectedMaskBounds,
  countOpaquePixels,
  dilateMask,
  fractionInsideBounds,
  hardenMask,
  makeMasksExclusive,
  parseMaskComponents,
  type PixelBounds,
} from "./mask";
import {
  clipPixelsToMask,
  compositeOriginalOverGenerated,
  eraseMaskedPixels,
  eraseTransparentPixels,
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
import { resolveOcclusions } from "./occlusion";
import { selectCompletionCandidate } from "./completion";
import {
  createSupportVisibilityMask,
  replaceAlpha,
  selectSubjectMaskAndAlignment,
  transformMask,
  transformRgbaPixels,
} from "./subject-regeneration";
import type {
  LayerPlanItem,
  LayerSplitterQuality,
  ShadowRegion,
  SupportSurface,
} from "../types";

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
const subjectPrompt = loadPrompt(
  "image/layer-splitter/prompts/regenerate-subject.md",
);
const contourPrompt = loadPrompt(
  "image/layer-splitter/prompts/trace-contour.md",
);
const shadowPrompt = loadPrompt("image/layer-splitter/prompts/trace-shadow.md");

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
  let lastError = "the model returned no usable layer plan";
  for (let attempt = 0; attempt < 2; attempt++) {
    const correction = attempt
      ? `\n\nYour previous response was invalid JSON: ${lastError}. Return the complete JSON object again, with a comma between every array element and object property.`
      : "";
    const { response, result } = await requestOpenRouter<ChatResult>(
      openRouter,
      "chat/completions",
      attempt ? "retry-layer-plan" : "analyse-layer-plan",
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
              {
                type: "text",
                text: `${fillPrompt(analysisPrompt, { maxLayers })}${correction}`,
              },
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
    try {
      if (!raw)
        throw new Error(
          `Layer analysis returned no text from ${model} via ${provider?.only?.join(", ") || "automatic routing"}.`,
        );
      return { model, plan: parseLayerPlan(parseJsonObject(raw)) };
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      if (!attempt)
        console.warn(
          `[layer-splitter] Retrying malformed layer plan with ${model}: ${lastError}`,
        );
    }
  }
  throw new Error(`Could not analyse image layers: ${lastError}`);
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

async function generateSemanticMask(
  openRouter: OpenRouterContext,
  sourceDataUrl: string,
  operation: string,
  target: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const models = [
    process.env.OPENROUTER_LAYER_SPLITTER_MASK_FALLBACK_MODEL ||
      "google/gemini-3.6-flash",
    process.env.OPENROUTER_LAYER_SPLITTER_MASK_MODEL || "qwen/qwen3.7-flash",
  ].filter((model, index, values) => values.indexOf(model) === index);
  let lastError = "the model returned no usable semantic mask";
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt];
    try {
      const prompt = `Inspect the supplied image and trace ${target}. Exclude every other body part, object, backdrop, glow, and shadow. Return JSON only as {"confidence":0.0,"components":[{"outer":[{"x":0,"y":0}],"holes":[]}]}. Coordinates use 0..1000 across the full image. Preserve disconnected components, fingers, and fine contours. Do not use a rectangle.`;
      const { response, result } = await requestOpenRouter<ChatResult>(
        openRouter,
        "chat/completions",
        attempt ? `fallback-${operation}` : operation,
        {
          model,
          provider: maskProviderRouting(model),
          temperature: 0,
          ...(model.startsWith("qwen/")
            ? { reasoning: { enabled: false } }
            : {}),
          max_tokens: 8_000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
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
      if (parsed.confidence < 0.45)
        throw new Error(
          `confidence ${parsed.confidence.toFixed(2)} is below the semantic-mask threshold`,
        );
      const mask = componentsToMask(parsed.components, width, height);
      if (countOpaquePixels(mask) < 16)
        throw new Error("the returned semantic mask is empty or too small");
      return mask;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Could not trace ${target}: ${lastError}`);
}

async function generateShadowMask(
  openRouter: OpenRouterContext,
  sourceDataUrl: string,
  shadow: ShadowRegion,
  ownerName: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const models = maskModels();
  const expectedBounds = normalizedToPixelBounds(shadow.bounds, width, height);
  const prompt = fillPrompt(shadowPrompt, {
    name: ownerName,
    description: shadow.description,
    region: regionHint(expectedBounds, width, height),
  });
  let lastError = "the model returned no usable shadow geometry";
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt];
    try {
      const correction = attempt
        ? `\n\nThe previous trace was unusable: ${lastError}. Trace the complete soft shadow footprint, not the object that casts it.`
        : "";
      const { response, result } = await requestOpenRouter<ChatResult>(
        openRouter,
        "chat/completions",
        attempt ? "fallback-shadow-mask" : "trace-shadow-mask",
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
      if (parsed.confidence < 0.45)
        throw new Error(
          `confidence ${parsed.confidence.toFixed(2)} is below the shadow threshold`,
        );
      const mask = componentsToMask(parsed.components, width, height);
      if (countOpaquePixels(mask) < 32)
        throw new Error("the returned shadow mask is empty or too small");
      if (fractionInsideBounds(mask, width, height, shadow.bounds) < 0.5)
        throw new Error(
          "the returned shadow mask does not match the planned region",
        );
      return mask;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt + 1 < models.length)
        console.warn(
          `[layer-splitter] Retrying shadow for "${ownerName}" with ${models[attempt + 1]}: ${lastError}`,
        );
    }
  }
  throw new Error(`Could not trace shadow for "${ownerName}": ${lastError}`);
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
  source: string | readonly string[],
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

async function generateSubjectIsolationMasks(
  openRouter: OpenRouterContext,
  generatedDataUrl: string,
  layer: LayerPlanItem,
  width: number,
  height: number,
  signal?: AbortSignal,
) {
  const model = decompositionModel();
  const { response, result } = await requestOpenRouter<ImageApiResult>(
    openRouter,
    "images",
    "isolate-regenerated-subject",
    buildImageRequest({
      model,
      prompt: `Isolate the single complete ${layer.subjectKind || "subject"} named "${layer.name}" as one precise RGBA foreground cutout. Preserve hair or fur, fingers or paws, every limb, clothing, torso, and all extremities. Exclude every backdrop pixel, glow, shadow, and halo. Also return the clean backdrop as a separate layer.`,
      reference: generatedDataUrl,
      purpose: "subject-regeneration",
      quality: "fidelity",
      width,
      height,
      seed: 0,
    }),
    { signal },
  );
  if (!response.ok)
    throw new Error(
      result.error?.message ||
        `Regenerated-subject isolation failed with OpenRouter HTTP ${response.status}.`,
    );
  if (!result.data?.length)
    throw new Error("The subject isolation model returned no images.");
  return Promise.all(
    result.data.map(async (image) => {
      const dataUrl = imageDataUrl(image);
      if (!dataUrl)
        throw new Error("The subject isolation model returned an empty image.");
      return alphaMaskFromPixels(
        await prepareImage(await fetchImageBytes(dataUrl), width, height),
        width,
        height,
      );
    }),
  );
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

function shadowBoundsFallbackMask(
  shadow: ShadowRegion,
  width: number,
  height: number,
) {
  const bounds = normalizedToPixelBounds(shadow.bounds, width, height, 0.03);
  const mask = new Uint8Array(width * height);
  for (let y = bounds.y; y < bounds.y + bounds.height; y++)
    for (let x = bounds.x; x < bounds.x + bounds.width; x++)
      mask[y * width + x] = 255;
  return mask;
}

function supportSurfaceMask(
  surface: SupportSurface,
  width: number,
  height: number,
) {
  const bounds = normalizedToPixelBounds(surface.bounds, width, height);
  const mask = new Uint8Array(width * height);
  for (let y = bounds.y; y < bounds.y + bounds.height; y++)
    for (let x = bounds.x; x < bounds.x + bounds.width; x++)
      mask[y * width + x] = 255;
  return mask;
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
  return Promise.all([
    pixelsDataUrl(erased, bounds.width, bounds.height),
    pixelsDataUrl(crop, bounds.width, bounds.height),
  ]);
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

    const tracedResults = await mapConcurrent(
      analysed.plan.layers,
      2,
      async (layer: LayerPlanItem, planIndex) => {
        const decomposed = decompositionMasks[planIndex];
        if (
          decomposed &&
          fractionInsideBounds(
            decomposed,
            source.width,
            source.height,
            layer.visibleBounds,
          ) >= 0.55
        )
          return { layer, mask: decomposed, planIndex, warning: "" };
        try {
          return {
            layer,
            mask: await generateMask(
              openRouter,
              source.pngDataUrl,
              layer,
              source.width,
              source.height,
              request.signal,
            ),
            planIndex,
            warning: "",
          };
        } catch (error) {
          if (request.signal.aborted) throw error;
          const message =
            error instanceof Error ? error.message : String(error);
          console.warn(
            `[layer-splitter] Dropping untraceable layer "${layer.name}": ${message}`,
          );
          return {
            layer,
            mask: null,
            planIndex,
            warning: `Could not trace ${layer.name}: ${message}`,
          };
        }
      },
    );
    const tracedObjects: Array<{
      layer: LayerPlanItem;
      mask: Uint8Array;
      planIndex: number;
    }> = [];
    const maskTraceWarnings: string[] = [];
    const untraceableLayerNames: string[] = [];
    for (const result of tracedResults)
      if (result.mask)
        tracedObjects.push({
          layer: result.layer,
          mask: result.mask,
          planIndex: result.planIndex,
        });
      else {
        untraceableLayerNames.push(result.layer.name);
        if (result.warning) maskTraceWarnings.push(result.warning);
      }
    if (!tracedObjects.length)
      throw new Error("No object layer could be traced from the source image.");

    const exclusiveMasks = makeMasksExclusive(
      tracedObjects.map(({ mask }) => mask),
      source.width,
      source.height,
    ).map((mask) => hardenMask(mask));
    const { retained, droppedLayerNames: overlapDroppedLayerNames } =
      retainVisibleLayerMasks(
        tracedObjects.map(({ layer }) => layer),
        exclusiveMasks,
      );
    const droppedLayerNames = [
      ...untraceableLayerNames,
      ...overlapDroppedLayerNames,
    ];
    if (!retained.length)
      throw new Error("No object layer retained any visible source pixels.");

    const extractedObjects = retained.map(({ layer, mask, sourceIndex }) => {
      const traced = tracedObjects[sourceIndex];
      return {
        layer,
        mask,
        usedDecomposition: traced.mask === decompositionMasks[traced.planIndex],
        pixels: extractLayerFromSource(
          source.pixels,
          mask,
          source.width,
          source.height,
        ),
      };
    });
    const decomposedLayerCount = extractedObjects.filter(
      ({ usedDecomposition }) => usedDecomposition,
    ).length;

    const resolvedOcclusions = resolveOcclusions(
      extractedObjects.map(({ layer, mask }) => ({ layer, mask })),
      source.width,
      source.height,
    );
    const completionModel = objectCompletionModel();
    const configuredCompletionCandidates = Number(
      process.env.OPENROUTER_LAYER_SPLITTER_COMPLETION_CANDIDATES,
    );
    const completionCandidateCount = Number.isInteger(
      configuredCompletionCandidates,
    )
      ? Math.min(3, Math.max(1, configuredCompletionCandidates))
      : 3;
    const supportSurfaceById = new Map(
      analysed.plan.supportSurfaces.map((surface) => [surface.id, surface]),
    );
    const objectCompletionResults = await mapConcurrent(
      extractedObjects,
      2,
      async ({ layer, mask, pixels }, index) => {
        const occlusion = resolvedOcclusions[index];
        let regenerationWarning = "";
        const visiblePixelFraction =
          countOpaquePixels(mask) / (source.width * source.height);
        if (shouldRegenerateFullSubject(layer, quality, visiblePixelFraction)) {
          try {
            const supportOcclusion = layer.supportOcclusion;
            const supportSurface = supportOcclusion
              ? supportSurfaceById.get(supportOcclusion.supportSurfaceId)
              : undefined;
            if (!supportOcclusion || !supportSurface)
              throw new Error("The planned support surface is unavailable.");
            const reference = await pixelsDataUrl(
              eraseTransparentPixels(pixels, source.width, source.height),
              source.width,
              source.height,
            );
            const generated = await generateImage(
              openRouter,
              "regenerate-complete-subject",
              completionModel,
              [reference, source.pngDataUrl],
              fillPrompt(subjectPrompt, {
                subjectKind: layer.subjectKind || "subject",
                name: layer.name,
                description: layer.description,
                visibleBounds: JSON.stringify(layer.visibleBounds),
                reconstructionBounds: JSON.stringify(
                  layer.reconstructionBounds,
                ),
                supportSurface: `${supportSurface.name}: ${supportSurface.description}`,
                foregroundParts: supportOcclusion.foregroundPartsDescription,
              }),
              "subject-regeneration",
              quality,
              source.width,
              source.height,
              baseSeed + 10_000 + index,
              request.signal,
            );
            const generatedPixels = await prepareImage(
              generated.bytes,
              source.width,
              source.height,
            );
            const generatedDataUrl = await pixelsDataUrl(
              generatedPixels,
              source.width,
              source.height,
            );
            const candidateMasks = await generateSubjectIsolationMasks(
              openRouter,
              generatedDataUrl,
              layer,
              source.width,
              source.height,
              request.signal,
            );
            const selected = selectSubjectMaskAndAlignment(
              generatedPixels,
              candidateMasks,
              pixels,
              mask,
              source.width,
              source.height,
            );
            if (!selected)
              throw new Error(
                "No isolated subject candidate aligned reliably with the source.",
              );
            const isolated = replaceAlpha(
              generatedPixels,
              selected.mask,
              source.width,
              source.height,
            );
            const completePixels = transformRgbaPixels(
              isolated,
              source.width,
              source.height,
              selected.alignment,
            );
            const foregroundPartsMask = await generateSemanticMask(
              openRouter,
              generatedDataUrl,
              "trace-regenerated-foreground-parts",
              `only ${supportOcclusion.foregroundPartsDescription} belonging to the single regenerated ${layer.subjectKind || "subject"}`,
              source.width,
              source.height,
              request.signal,
            );
            const transformedForegroundParts = transformMask(
              foregroundPartsMask,
              source.width,
              source.height,
              selected.alignment,
            );
            const completeAlpha = alphaMaskFromPixels(
              completePixels,
              source.width,
              source.height,
            );
            const visibilityMask = createSupportVisibilityMask(
              completeAlpha,
              supportSurface.bounds,
              transformedForegroundParts,
              source.width,
              source.height,
            );
            if (countOpaquePixels(visibilityMask) < 32)
              throw new Error("The editable subject visibility mask is empty.");
            return {
              name: layer.name,
              order: layer.order,
              pixels: completePixels,
              renderPixels: clipPixelsToMask(
                completePixels,
                visibilityMask,
                source.width,
                source.height,
              ),
              mask: visibilityMask,
              completed: false,
              regenerated: true,
              hiddenPixelCount: Math.max(
                0,
                countOpaquePixels(completeAlpha) -
                  countOpaquePixels(visibilityMask),
              ),
              warning: "",
            };
          } catch (error) {
            if (request.signal.aborted) throw error;
            const message =
              error instanceof Error ? error.message : String(error);
            regenerationWarning = `Could not fully regenerate ${layer.name}; used the source-preserving fallback: ${message}`;
            console.warn(`[layer-splitter] ${regenerationWarning}`);
          }
        }
        if (quality !== "fidelity" || occlusion.occluderIds.length === 0)
          return {
            name: layer.name,
            order: layer.order,
            pixels,
            renderPixels: pixels,
            completed: false,
            regenerated: false,
            hiddenPixelCount: 0,
            warning: regenerationWarning,
          };
        try {
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
            eraseTransparentPixels(
              visibleCrop,
              cropBounds.width,
              cropBounds.height,
            ),
            cropBounds.width,
            cropBounds.height,
          );
          const contextReference = await pixelsDataUrl(
            cropPixels(source.pixels, source.width, source.height, cropBounds),
            cropBounds.width,
            cropBounds.height,
          );
          const prompt = fillPrompt(objectPrompt, {
            name: layer.name,
            description: layer.description,
            visibleBounds: JSON.stringify(layer.visibleBounds),
            reconstructionBounds: JSON.stringify(layer.reconstructionBounds),
            occludedBy: occlusion.occluderNames.join(", "),
          });
          const settledCandidates = await Promise.allSettled(
            Array.from(
              { length: completionCandidateCount },
              async (_, candidateIndex) => {
                const generated = await generateImage(
                  openRouter,
                  `complete-layer-object-${candidateIndex + 1}`,
                  completionModel,
                  [reference, contextReference],
                  prompt,
                  "object-completion",
                  quality,
                  cropBounds.width,
                  cropBounds.height,
                  baseSeed +
                    index * completionCandidateCount +
                    candidateIndex +
                    1,
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
                return generatedPixels;
              },
            ),
          );
          const generatedCandidates: Uint8ClampedArray[] = [];
          for (const candidate of settledCandidates)
            if (candidate.status === "fulfilled")
              generatedCandidates.push(candidate.value);
          const selection = selectCompletionCandidate(
            pixels,
            mask,
            occlusion.completionMask,
            generatedCandidates,
            source.width,
            source.height,
          );
          if (!selection)
            throw new Error(
              "No generated candidate produced a consistent hidden continuation.",
            );
          const completedPixels = compositeOriginalOverGenerated(
            pixels,
            selection.hiddenPixels,
            source.width,
            source.height,
          );
          return {
            name: layer.name,
            order: layer.order,
            pixels: completedPixels,
            renderPixels: completedPixels,
            completed: true,
            regenerated: false,
            hiddenPixelCount: selection.hiddenPixelCount,
            warning: regenerationWarning,
          };
        } catch (error) {
          if (request.signal.aborted) throw error;
          const message =
            error instanceof Error ? error.message : String(error);
          console.warn(
            `[layer-splitter] Skipping hidden completion for "${layer.name}": ${message}`,
          );
          return {
            name: layer.name,
            order: layer.order,
            pixels,
            renderPixels: pixels,
            completed: false,
            regenerated: false,
            hiddenPixelCount: 0,
            warning: [
              regenerationWarning,
              `Could not reconstruct the hidden part of ${layer.name}: ${message}`,
            ]
              .filter(Boolean)
              .join(" "),
          };
        }
      },
    );
    const ownerNames = new Map(
      extractedObjects.map(({ layer }) => [layer.id, layer.name]),
    );
    const plannedShadows = analysed.plan.shadowRegions.filter(({ ownerId }) =>
      ownerNames.has(ownerId),
    );
    const shadowSafetyRadius = Math.max(
      4,
      Math.round(
        Math.min(source.width, source.height) *
          (quality === "fidelity" ? 0.02 : 0.015),
      ),
    );
    const shadowResults = await mapConcurrent(
      plannedShadows,
      2,
      async (shadow) => {
        const ownerName = ownerNames.get(shadow.ownerId) || shadow.ownerId;
        try {
          const traced = await generateShadowMask(
            openRouter,
            source.pngDataUrl,
            shadow,
            ownerName,
            source.width,
            source.height,
            request.signal,
          );
          return {
            ownerName,
            mask: dilateMask(
              traced,
              source.width,
              source.height,
              shadowSafetyRadius,
            ),
            usedFallback: false,
          };
        } catch (error) {
          if (request.signal.aborted) throw error;
          const message =
            error instanceof Error ? error.message : String(error);
          console.warn(
            `[layer-splitter] Using planned shadow bounds for "${ownerName}": ${message}`,
          );
          return {
            ownerName,
            mask: shadowBoundsFallbackMask(shadow, source.width, source.height),
            usedFallback: true,
          };
        }
      },
    );
    const objectHoleMask = hardenMask(
      combineMasks(
        extractedObjects.map(({ mask }) => mask),
        source.width,
        source.height,
      ),
    );
    const contactShadowRadius = Math.max(
      6,
      Math.round(
        Math.min(source.width, source.height) *
          (quality === "fidelity" ? 0.05 : 0.03),
      ),
    );
    const hardHoleMask = combineMasks(
      [
        dilateMask(
          objectHoleMask,
          source.width,
          source.height,
          contactShadowRadius,
        ),
        ...shadowResults.map(({ mask }) => mask),
      ],
      source.width,
      source.height,
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
      quality === "fidelity" ? 12 : 8,
    );
    assertOpaqueBackground(backgroundPixels);

    const supportLayers = analysed.plan.supportSurfaces.map((surface) => {
      const mask = supportSurfaceMask(surface, source.width, source.height);
      const pixels = extractLayerFromSource(
        backgroundPixels,
        mask,
        source.width,
        source.height,
      );
      return {
        name: surface.name,
        order: surface.order,
        pixels,
        renderPixels: pixels,
      };
    });
    const combinedSupportMask = supportLayers.length
      ? hardenMask(
          combineMasks(
            analysed.plan.supportSurfaces.map((surface) =>
              supportSurfaceMask(surface, source.width, source.height),
            ),
            source.width,
            source.height,
          ),
        )
      : new Uint8Array(source.width * source.height);
    const baseBackgroundPixels = supportLayers.length
      ? eraseMaskedPixels(
          backgroundPixels,
          combinedSupportMask,
          source.width,
          source.height,
        )
      : backgroundPixels;
    const orderedForegroundLayers = [
      ...objectCompletionResults,
      ...supportLayers,
    ].sort((left, right) => right.order - left.order);
    const backgroundLayer = {
      name: "Background — clean environment",
      pixels: baseBackgroundPixels,
      renderPixels: baseBackgroundPixels,
    };
    const renderLayers = [
      ...orderedForegroundLayers.map(({ name, renderPixels }) => ({
        name,
        pixels: renderPixels,
      })),
      { name: backgroundLayer.name, pixels: backgroundLayer.renderPixels },
    ];
    const psdLayers: PsdLayerInput[] = [
      ...orderedForegroundLayers.map((layer): PsdLayerInput => ({
        name: layer.name,
        pixels: layer.pixels,
        ...("mask" in layer && layer.mask instanceof Uint8Array
          ? { mask: layer.mask }
          : {}),
      })),
      { name: backgroundLayer.name, pixels: backgroundLayer.pixels },
    ];
    const composite = compositeLayers(
      source.width,
      source.height,
      renderLayers,
    );
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
      psdLayers,
    );
    const warnings = [
      "Ordinary object layers preserve original source RGB and alpha through validated masks.",
      "Eligible people and animals may be regenerated as complete subjects with editable support-surface masks.",
      "Background reconstruction is limited to object silhouettes, associated shadows, and a contact-shadow safety margin.",
      `${decomposedLayerCount} object masks came from direct RGBA decomposition; ${objectCompletionResults.length - decomposedLayerCount} used spatial tracing fallback.`,
    ];
    if (supportLayers.length)
      warnings.push(
        `Separated support surfaces from the clean environment: ${supportLayers
          .map(({ name }) => name)
          .join(", ")}.`,
      );
    if (decompositionWarning)
      warnings.push(
        `Direct layer decomposition was unavailable: ${decompositionWarning}`,
      );
    if (droppedLayerNames.length)
      warnings.push(
        `Dropped layers that could not retain a valid visible mask: ${droppedLayerNames.join(
          ", ",
        )}.`,
      );
    warnings.push(...maskTraceWarnings);
    if (plannedShadows.length)
      warnings.push(
        `${plannedShadows.length} planned shadow region${
          plannedShadows.length === 1 ? " was" : "s were"
        } removed from the reconstructed background.`,
      );
    const shadowFallbackNames = shadowResults
      .filter(({ usedFallback }) => usedFallback)
      .map(({ ownerName }) => ownerName);
    if (shadowFallbackNames.length)
      warnings.push(
        `Used expanded planned bounds for shadows belonging to: ${shadowFallbackNames.join(
          ", ",
        )}.`,
      );
    const regeneratedSubjectNames = objectCompletionResults
      .filter(({ regenerated }) => regenerated)
      .map(({ name }) => name);
    if (regeneratedSubjectNames.length)
      warnings.push(
        `Fully regenerated complete subjects with editable masks: ${regeneratedSubjectNames.join(
          ", ",
        )}.`,
      );
    const completedObjectNames = objectCompletionResults
      .filter(({ completed }) => completed)
      .map(({ name }) => name);
    if (completedObjectNames.length)
      warnings.push(
        `AI-reconstructed hidden pixels for: ${completedObjectNames.join(
          ", ",
        )}. Visible source pixels remain unchanged.`,
      );
    for (const { warning } of objectCompletionResults)
      if (warning) warnings.push(warning);
    const inferredOcclusionCount = resolvedOcclusions.reduce(
      (total, occlusion) => total + occlusion.inferredOccluderIds.length,
      0,
    );
    if (quality === "fidelity" && inferredOcclusionCount)
      warnings.push(
        `${inferredOcclusionCount} occlusion relationship${
          inferredOcclusionCount === 1 ? " was" : "s were"
        } inferred from layer geometry.`,
      );
    if (analysed.plan.textRegions.length)
      warnings.push(
        "Text outside extracted objects remains in the source-preserved background.",
      );

    return NextResponse.json({
      filename: layerFilename(),
      psdBase64: psd.toString("base64"),
      previewDataUrl: `data:image/png;base64,${preview.toString("base64")}`,
      layerNames: psdLayers.map(({ name }) => name),
      planModel: analysed.model,
      maskModel: decompositionModel(),
      maskFallbackModel: maskModel(),
      generationModel: backgroundModel,
      objectCompletionModel:
        quality === "fidelity" ? completionModel : undefined,
      subjectRegenerationModel: regeneratedSubjectNames.length
        ? completionModel
        : undefined,
      subjectIsolationModel: regeneratedSubjectNames.length
        ? decompositionModel()
        : undefined,
      quality,
      validation: {
        backgroundOpaque: true,
        validObjectLayers: objectCompletionResults.length,
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
