import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_OCR_MODEL,
  isOcrRateLimited,
  ocrModel,
  ocrProviderError,
} from "../code/ocr-response.ts";

test("OCR keeps the configured model instead of selecting a fallback", () => {
  assert.equal(ocrModel(), DEFAULT_OCR_MODEL);
  assert.equal(ocrModel("custom/vision-model"), "custom/vision-model");
  assert.equal(ocrModel("  custom/vision-model  "), "custom/vision-model");
});

test("OCR identifies nested upstream rate-limit errors", () => {
  const result = {
    error: {
      code: 429,
      message: "Provider returned error",
      metadata: {
        limit_source: "upstream_provider_shared_pool",
        raw: "The model is temporarily rate-limited upstream.",
      },
    },
  };
  assert.equal(isOcrRateLimited(result, 429), true);
  assert.deepEqual(
    ocrProviderError(result, 429, "OpenRouter returned no text."),
    {
      code: "provider_rate_limited",
      message:
        "The OCR provider is temporarily rate-limited. Please retry shortly.",
    },
  );
});

test("OCR exposes useful nested provider details for other failures", () => {
  assert.deepEqual(
    ocrProviderError(
      {
        error: {
          message: "Provider returned error",
          metadata: { raw: "The image format is not supported." },
        },
      },
      400,
      "OpenRouter returned no text.",
    ),
    {
      code: "provider_error",
      message: "The image format is not supported.",
    },
  );
});
