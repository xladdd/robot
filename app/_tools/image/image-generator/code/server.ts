import { NextResponse } from "next/server";
import { fillPrompt, loadPrompt } from "../../../load-prompt";
import {
  fetchOpenRouter,
  fetchOpenRouterPublicImageModels,
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
} from "../../../openrouter/server";

const MAX_REFERENCE_SIZE = 7_000_000;
const isImageDataUrl = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= MAX_REFERENCE_SIZE &&
  /^data:image\/(png|jpeg|webp);base64,/i.test(value);

type ImageResolution = "512" | "1K" | "2K";
type ImageResult = { b64_json?: string; url?: string };
type Usage = {
  cost?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

const generationPrompt = loadPrompt(
  "image/image-generator/prompts/generate.md",
);
const upscalePrompt = loadPrompt("image/image-generator/prompts/upscale.md");

const mediumInstructions = {
  match:
    "Infer and faithfully match the dominant visual medium, texture, realism level, palette, lighting, and finish of the reference images. If no references are supplied, use a polished editorial illustration.",
  photo:
    "Create a premium editorial photograph or photo-composite with credible anatomy and materials, coherent lighting, realistic texture, and professionally controlled edges.",
  illustration:
    "Create a polished editorial illustration with intentional mark-making, texture, colour, depth, and a publication-ready finish.",
  "3d": "Create a polished 3D editorial render with coherent materials, lighting, camera perspective, depth, and a publication-ready finish.",
} as const;

function outputDataUrl(image: ImageResult) {
  if (image.b64_json) return `data:image/jpeg;base64,${image.b64_json}`;
  return image.url || "";
}

function userFacingError(error: unknown) {
  if (error instanceof TypeError && error.message === "fetch failed") {
    const cause = error.cause instanceof Error ? error.cause.message : null;
    console.error("[image-generator] OpenRouter connection failed", { cause });
    return "OpenRouter could not be reached. No image was returned; retry this image.";
  }
  return error instanceof Error ? error.message : "Image generation failed.";
}

type RawCatalogModel = {
  id?: unknown;
  name?: unknown;
  architecture?: { output_modalities?: unknown };
  pricing?: { image?: unknown; image_output?: unknown };
};

type RawCredits = {
  data?: { total_credits?: unknown; total_usage?: unknown };
};

type RawKeyInfo = {
  data?: { limit?: unknown; limit_remaining?: unknown; usage?: unknown };
};

export async function GET(request: Request) {
  try {
    const openRouter = await getOpenRouterContext(request, "image");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("image") },
        { status: 503 },
      );

    const [modelsRequest, creditsRequest, keyRequest] = await Promise.all([
      fetchOpenRouterPublicImageModels<{ data?: RawCatalogModel[] }>({
        signal: request.signal,
      }),
      fetchOpenRouter<RawCredits>(openRouter, "credits", {
        signal: request.signal,
      }).catch(() => null),
      fetchOpenRouter<RawKeyInfo>(openRouter, "key", {
        signal: request.signal,
      }).catch(() => null),
    ]);
    if (!modelsRequest.response.ok)
      throw new Error("The OpenRouter model catalog could not be loaded.");

    const entries = Array.isArray(modelsRequest.result.data)
      ? modelsRequest.result.data
      : [];
    const models = entries
      .filter(
        (entry): entry is RawCatalogModel & { id: string } =>
          typeof entry?.id === "string" &&
          entry.id.toLowerCase().includes("flux") &&
          Array.isArray(entry.architecture?.output_modalities) &&
          (entry.architecture.output_modalities as unknown[]).includes(
            "image",
          ),
      )
      .map((entry) => {
        // pricing.image is the flat per-image rate; per-token image models
        // bill 4096 image tokens per megapixel and this tool generates 1K
        // (~1MP) images, so the token price approximates the per-image cost.
        const flatPrice =
          typeof entry.pricing?.image === "string" &&
          Number.isFinite(Number(entry.pricing.image))
            ? Number(entry.pricing.image)
            : null;
        const tokenPrice =
          typeof entry.pricing?.image_output === "string" &&
          Number.isFinite(Number(entry.pricing.image_output))
            ? Number(entry.pricing.image_output)
            : null;
        const price =
          flatPrice !== null
            ? flatPrice
            : tokenPrice !== null
              ? tokenPrice * 4096
              : null;
        return {
          id: entry.id,
          name:
            typeof entry.name === "string" && entry.name.trim()
              ? entry.name
              : entry.id,
          pricePerImage: price,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    const credits = creditsRequest?.result.data;
    const totalCredits =
      typeof credits?.total_credits === "number" ? credits.total_credits : null;
    const totalUsage =
      typeof credits?.total_usage === "number" ? credits.total_usage : null;
    const accountCredit =
      totalCredits !== null && totalUsage !== null
        ? Math.max(0, totalCredits - totalUsage)
        : null;

    // /credits requires a management key; inference keys fall back to the
    // remaining credit the key itself reports via /key.
    const keyInfo = keyRequest?.result.data;
    const limitRemaining =
      typeof keyInfo?.limit_remaining === "number"
        ? keyInfo.limit_remaining
        : null;
    const keyLimit =
      typeof keyInfo?.limit === "number" ? keyInfo.limit : null;
    const keyUsage =
      typeof keyInfo?.usage === "number" ? keyInfo.usage : null;
    const keyCredit =
      limitRemaining !== null
        ? Math.max(0, limitRemaining)
        : keyLimit !== null && keyUsage !== null
          ? Math.max(0, keyLimit - keyUsage)
          : null;
    const credit = accountCredit ?? keyCredit;

    return NextResponse.json(
      { models, credit },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      return new Response(null, { status: 499 });
    return NextResponse.json(
      { error: userFacingError(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const openRouter = await getOpenRouterContext(request, "image");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("image") },
        { status: 503 },
      );

    const body = (await request.json()) as {
      mode?: unknown;
      prompt?: unknown;
      references?: unknown;
      medium?: unknown;
      quality?: unknown;
      image?: unknown;
      sourceResolution?: unknown;
      model?: unknown;
      seed?: unknown;
    };
    const prompt =
      typeof body.prompt === "string" ? body.prompt.trim().slice(0, 8_000) : "";
    if (!prompt)
      return NextResponse.json(
        { error: "Write an image prompt before generating." },
        { status: 400 },
      );

    const isUpscale = body.mode === "upscale";
    let model: string;
    let completePrompt: string;
    let inputReferences: string[];
    let resolution: ImageResolution;
    let operation: "generate-image" | "upscale-image";

    if (isUpscale) {
      if (!isImageDataUrl(body.image))
        return NextResponse.json(
          { error: "The source image for upscaling did not pass validation." },
          { status: 400 },
        );
      if (body.sourceResolution === "512") resolution = "1K";
      else if (body.sourceResolution === "1K") resolution = "2K";
      else
        return NextResponse.json(
          { error: "This image is already at the maximum 2K upscale size." },
          { status: 400 },
        );
      model =
        process.env.OPENROUTER_IMAGE_UPSCALE_MODEL ||
        process.env.OPENROUTER_COVER_PRODUCTION_MODEL ||
        "black-forest-labs/flux.2-pro";
      completePrompt = fillPrompt(upscalePrompt, { prompt });
      inputReferences = [body.image];
      operation = "upscale-image";
    } else {
      const submittedReferences = Array.isArray(body.references)
        ? body.references.slice(0, 3)
        : [];
      const references = submittedReferences.filter(isImageDataUrl);
      if (references.length !== submittedReferences.length)
        return NextResponse.json(
          { error: "One or more reference images did not pass validation." },
          { status: 400 },
        );
      if (body.mode === "advanced") {
        const requestedModel =
          typeof body.model === "string" ? body.model.trim() : "";
        model = /^[\w][\w.-]*\/[\w][\w.:-]*$/.test(requestedModel)
          ? requestedModel
          : process.env.OPENROUTER_COVER_FIDELITY_MODEL ||
            "black-forest-labs/flux.2-pro";
        try {
          JSON.parse(prompt);
        } catch {
          return NextResponse.json(
            { error: "The structured prompt is not valid JSON." },
            { status: 400 },
          );
        }
        completePrompt = prompt;
        inputReferences = references;
        resolution = "1K";
        operation = "generate-image";
      } else {
        const medium =
          body.medium === "photo" ||
          body.medium === "illustration" ||
          body.medium === "3d"
            ? body.medium
            : "match";
        const highFidelity = body.quality !== "fast";
        model = highFidelity
          ? process.env.OPENROUTER_COVER_FIDELITY_MODEL ||
            "black-forest-labs/flux.2-pro"
          : process.env.OPENROUTER_COVER_SKETCH_MODEL ||
            "black-forest-labs/flux.2-klein-4b";
        completePrompt = fillPrompt(generationPrompt, {
          referenceInstruction: references.length
            ? `Use the ${references.length} supplied reference image${references.length === 1 ? "" : "s"} as visual guidance. Preserve relevant style and requested subject traits without copying watermarks, logos, or incidental text.`
            : "No reference images are supplied. Build the image entirely from the written request.",
          mediumInstruction: mediumInstructions[medium],
          prompt,
        });
        inputReferences = references;
        resolution = highFidelity ? "1K" : "512";
        operation = "generate-image";
      }
    }

    const requestedSeed =
      typeof body.seed === "number" &&
      Number.isInteger(body.seed) &&
      body.seed >= 0 &&
      body.seed <= 2_000_000_000
        ? body.seed
        : null;
    const seed = requestedSeed ?? Math.floor(Math.random() * 2_000_000_000);
    const { response, result } = await requestOpenRouter<{
      id?: string;
      data?: ImageResult[];
      usage?: Usage;
      error?: { message?: string };
    }>(
      openRouter,
      "images",
      operation,
      {
        model,
        prompt: completePrompt,
        ...(inputReferences.length
          ? {
              input_references: inputReferences.map((url) => ({
                type: "image_url",
                image_url: { url },
              })),
            }
          : {}),
        aspect_ratio: "1:1",
        resolution,
        output_format: "jpeg",
        seed,
      },
      { signal: request.signal },
    );
    const data = result.data?.[0] ? outputDataUrl(result.data[0]) : "";
    if (!response.ok || !data)
      throw new Error(result.error?.message || "OpenRouter returned no image.");

    return NextResponse.json({
      image: {
        data,
        seed,
        model,
        resolution,
        generationId: result.id,
        usage: {
          cost:
            typeof result.usage?.cost === "number" ? result.usage.cost : null,
          promptTokens: result.usage?.prompt_tokens ?? null,
          completionTokens: result.usage?.completion_tokens ?? null,
          totalTokens: result.usage?.total_tokens ?? null,
        },
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      return new Response(null, { status: 499 });
    return NextResponse.json(
      { error: userFacingError(error) },
      { status: 500 },
    );
  }
}
