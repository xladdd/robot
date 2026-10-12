import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("correction preserves the source language unless translation is requested", async () => {
  const prompt = await readFile(
    new URL("../prompts/correction.md", import.meta.url),
    "utf8",
  );
  const server = await readFile(
    new URL("../code/correct-server.ts", import.meta.url),
    "utf8",
  );

  assert.match(prompt, /Apply only the change explicitly requested/);
  assert.match(prompt, /Never translate/);
  assert.match(prompt, /keep it unchanged/);
  assert.doesNotMatch(server, /Working language/);
});

test("Text Extractor prefers Mistral EU with regular Mistral fallback", async () => {
  const routing = await readFile(
    new URL("../code/openrouter-routing.ts", import.meta.url),
    "utf8",
  );
  const [ocrServer, correctionServer] = await Promise.all([
    readFile(new URL("../code/ocr-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../code/correct-server.ts", import.meta.url), "utf8"),
  ]);

  assert.match(routing, /only: \["mistral\/eu"\]/);
  assert.match(routing, /only: \["mistral"\]/);
  assert.match(
    routing,
    /ignore: \["mistral\/eu", "mistral\/us", "mistral\/zdr"\]/,
  );
  assert.match(routing, /regular Mistral endpoint/);
  assert.match(ocrServer, /requestOpenRouterWithEuFallback/);
  assert.match(correctionServer, /requestOpenRouterWithEuFallback/);
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
