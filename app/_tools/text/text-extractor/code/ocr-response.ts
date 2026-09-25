export const DEFAULT_OCR_MODEL = "mistralai/mistral-small-2603";

export type OcrErrorCode = "provider_rate_limited" | "provider_error";

type OpenRouterErrorResult = {
  error?: {
    code?: number;
    message?: string;
    metadata?: {
      limit_source?: string;
      raw?: string;
    };
  };
};

export function ocrModel(configuredModel?: string): string {
  return configuredModel?.trim() || DEFAULT_OCR_MODEL;
}

export function isOcrRateLimited(
  result: OpenRouterErrorResult,
  responseStatus: number,
): boolean {
  return (
    responseStatus === 429 ||
    result.error?.code === 429 ||
    result.error?.metadata?.limit_source === "upstream_provider_shared_pool"
  );
}

export function ocrProviderError(
  result: OpenRouterErrorResult,
  responseStatus: number,
  fallbackMessage: string,
): { code: OcrErrorCode; message: string } {
  const providerError = result.error;

  if (isOcrRateLimited(result, responseStatus)) {
    return {
      code: "provider_rate_limited",
      message:
        "The OCR provider is temporarily rate-limited. Please retry shortly.",
    };
  }

  const rawMessage = providerError?.metadata?.raw?.trim();
  return {
    code: "provider_error",
    message: rawMessage || providerError?.message || fallbackMessage,
  };
}
