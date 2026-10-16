import { modelStages } from "../model-definitions.ts";
import { resolveModel } from "../../../models-server.ts";
import { cookies } from "next/headers.js";
import { NextResponse } from "next/server.js";

import { authCookieName, readSession } from "../../../../lib/auth.ts";
import {
  AsanaConfigurationError,
  AsanaRequestError,
  getAsanaConfig,
  postAsanaTask,
} from "../../../../_feedback/asana.ts";
import { fillPrompt, loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
  type OpenRouterContext,
} from "../../../openrouter/server";
import { analyzeStyle, refineStyle } from "./style-plan.ts";
import {
  selectImageFormat,
  validateReferenceDimensions,
  type ImageDimensions,
  type ImageCapabilities,
} from "./image-format.ts";
import { StyleValidationError } from "./validation.ts";
import { normalizeImageOutput } from "./image-output.ts";
import {
  buildStyleTaskPayload,
  formatStyleTaskNotes,
} from "./style-request.ts";
import {
  validateInstruction,
  validateStylePrompt,
  validateStyleReferences,
  validateStyleSubmission,
  validateTestPrompt,
} from "./validation.ts";

const generationPrompt = loadPrompt("design/style-trainer/prompts/generate.md");

type ImageResult = { b64_json?: string; url?: string };
type Usage = {
  cost?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImageDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 7_000_000 &&
    /^data:image\/(png|jpeg|webp);base64,/i.test(value)
  );
}

function userFacingError(error: unknown) {
  if (error instanceof TypeError && error.message === "fetch failed") {
    const cause = error.cause instanceof Error ? error.cause.message : null;
    console.error("[style-trainer] OpenRouter connection failed", { cause });
    return "OpenRouter could not be reached. No result was returned; retry.";
  }
  return error instanceof Error ? error.message : "The request failed.";
}

function styleImageModel() {
  return resolveModel(modelStages["image"]);
}

async function generateTestImage(
  request: Request,
  openRouter: OpenRouterContext,
  stylePrompt: string,
  testPrompt: string,
  referenceDimensions: ImageDimensions[],
) {
  // Test generations deliberately do not use the reference images: the final
  // style ships to the Image Generator as a prompt plus pinned seed alone,
  // so the round must reproduce the style without references.
  const seed = Math.floor(Math.random() * 2_000_000_000);
  const model = styleImageModel();
  // Public discovery is not an inference call. Pin the endpoint whose capabilities
  // we inspected; model-level unions can overstate an individual provider's support.
  const discovery = await fetch(
    `https://openrouter.ai/api/v1/images/models/${model.split("/").map(encodeURIComponent).join("/")}/endpoints`,
    {
      next: { revalidate: 300 },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    },
  );
  if (!discovery.ok)
    throw new Error("Image provider capabilities could not be checked. Retry.");
  const catalog = (await discovery.json()) as {
    endpoints?: {
      provider_tag?: string;
      supported_parameters?: ImageCapabilities;
    }[];
  };
  const endpoint = catalog.endpoints?.find(
    (e) => e.provider_tag && e.supported_parameters,
  );
  if (!endpoint?.provider_tag || !endpoint.supported_parameters)
    throw new Error(
      "No image provider with declared capabilities is available.",
    );
  const format = selectImageFormat(
    referenceDimensions,
    endpoint.supported_parameters,
  );
  const { response, result } = await requestOpenRouter<{
    id?: string;
    data?: ImageResult[];
    usage?: Usage;
    error?: { message?: string };
  }>(
    openRouter,
    "images",
    "generate-style-test",
    {
      model,
      prompt: fillPrompt(generationPrompt, {
        stylePrompt,
        testPrompt,
      }),
      ...format.parameters,
      provider: { only: [endpoint.provider_tag], allow_fallbacks: false },
      output_format: "jpeg",
      seed,
    },
    { signal: request.signal },
  );
  const image = result.data?.[0];
  if (!response.ok || !image)
    throw new Error(result.error?.message || "OpenRouter returned no image.");
  const { data, ...outputFormat } = await normalizeImageOutput(
    image,
    format.requestedDimensions,
  );
  return {
    data,
    seed,
    model,
    // Compatibility label only; it is not a measurement of native output pixels.
    resolution: "1K" as const,
    format: { ...format, ...outputFormat },
    generationId: result.id,
    usage: {
      cost: typeof result.usage?.cost === "number" ? result.usage.cost : null,
      promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null,
      totalTokens: result.usage?.total_tokens ?? null,
    },
  };
}

async function handleSubmit(body: Record<string, unknown>) {
  const cookieStore = await cookies();
  const session = await readSession(cookieStore.get(authCookieName)?.value);
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  let submission;
  try {
    submission = validateStyleSubmission(body);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid style request.",
      },
      { status: 400 },
    );
  }

  let config;
  try {
    config = getAsanaConfig();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof AsanaConfigurationError
            ? "The style request service is not configured."
            : "The style request service is unavailable.",
      },
      { status: 503 },
    );
  }

  const receivedAt = new Date().toISOString();
  try {
    const task = await postAsanaTask(
      config,
      buildStyleTaskPayload(submission, session.username, config, receivedAt),
    );
    return NextResponse.json({
      ok: true,
      taskUrl: task.taskUrl,
      notesPreview: formatStyleTaskNotes(
        submission,
        session.username,
        receivedAt,
      ),
    });
  } catch (error) {
    if (error instanceof AsanaRequestError)
      console.error("[style-trainer] Asana request failed", error.status);
    else console.error("[style-trainer] Unexpected submission failure");
    return NextResponse.json(
      { error: "The style request could not be sent to Asana." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) throw new Error("invalid body");
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (body.mode === "submit") return handleSubmit(body);

  try {
    const openRouter = await getOpenRouterContext(request, "styleTrainer");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("styleTrainer") },
        { status: 503 },
      );

    if (body.mode === "analyze") {
      const references = validateStyleReferences(body.references);
      const result = await analyzeStyle(openRouter, { references });
      return NextResponse.json({
        plan: result.plan,
        metadata: result.metadata,
      });
    }

    if (body.mode === "refine") {
      const references = validateStyleReferences(body.references);
      const currentPrompt = validateStylePrompt(body.currentPrompt);
      const instruction = validateInstruction(body.instruction);
      const preferredImage = isImageDataUrl(body.preferredImage)
        ? body.preferredImage
        : undefined;
      const result = await refineStyle(openRouter, {
        references,
        currentPrompt,
        instruction,
        preferredImage,
      });
      return NextResponse.json({
        plan: result.plan,
        metadata: result.metadata,
      });
    }

    if (body.mode === "generate") {
      const stylePrompt = validateStylePrompt(body.stylePrompt);
      const testPrompt = validateTestPrompt(body.testPrompt);
      const referenceDimensions = validateReferenceDimensions(
        body.referenceDimensions,
      );
      const image = await generateTestImage(
        request,
        openRouter,
        stylePrompt,
        testPrompt,
        referenceDimensions,
      );
      return NextResponse.json({ image });
    }

    return NextResponse.json(
      { error: "Unknown request mode." },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      return new Response(null, { status: 499 });
    return NextResponse.json(
      { error: userFacingError(error) },
      { status: error instanceof StyleValidationError ? 400 : 500 },
    );
  }
}
