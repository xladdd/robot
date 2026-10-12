import {
  requestOpenRouter,
  type OpenRouterContext,
} from "../../../openrouter/server";

type OpenRouterEndpoint = "chat/completions" | "images";

export async function requestOpenRouterWithEuFallback<T extends object>(
  context: OpenRouterContext,
  endpoint: OpenRouterEndpoint,
  operation: string,
  body: Record<string, unknown>,
  options: { signal?: AbortSignal } = {},
) {
  const model = typeof body.model === "string" ? body.model : "";
  if (!model.startsWith("mistralai/"))
    return requestOpenRouter<T>(context, endpoint, operation, body, options);

  const provider =
    body.provider && typeof body.provider === "object"
      ? (body.provider as Record<string, unknown>)
      : {};
  try {
    const euResult = await requestOpenRouter<T>(
      context,
      endpoint,
      operation,
      {
        ...body,
        provider: {
          ...provider,
          only: ["mistral/eu"],
          allow_fallbacks: false,
        },
      },
      options,
    );
    if (euResult.response.ok) return euResult;

    console.warn(
      `[text-extractor] Mistral EU returned HTTP ${euResult.response.status}; retrying through the regular Mistral endpoint.`,
    );
  } catch (error) {
    console.warn(
      "[text-extractor] Mistral EU request failed; retrying through the regular Mistral endpoint.",
      error instanceof Error ? error.message : "Unknown transport error",
    );
  }

  return requestOpenRouter<T>(
    context,
    endpoint,
    operation,
    {
      ...body,
      provider: {
        ...provider,
        only: ["mistral"],
        ignore: ["mistral/eu", "mistral/us", "mistral/zdr"],
        allow_fallbacks: false,
      },
    },
    options,
  );
}
