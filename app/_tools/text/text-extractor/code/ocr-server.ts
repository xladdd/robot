import { NextResponse } from "next/server";
import { loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
} from "../../../openrouter/server";
import { isOcrRateLimited, ocrModel, ocrProviderError } from "./ocr-response";

const transcriptionPrompt = loadPrompt(
  "text/text-extractor/prompts/transcription.md",
);
const OCR_RATE_LIMIT_RETRY_DELAY_MS = 1_000;

type OcrResult = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: {
    code?: number;
    message?: string;
    metadata?: { limit_source?: string; raw?: string };
  };
};

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeTranscription(raw: string) {
  let text = raw.trim();
  const fullyFenced = text.match(
    /^(?:[A-Za-z][\w +#.-]*\s*\n+)?```[^\n]*\n([\s\S]*?)\n```\s*$/,
  );
  if (fullyFenced?.[1]) return fullyFenced[1].trim();
  text = text.replace(/^```[^\n]*$/gm, "").trim();
  return text;
}

export async function POST(request: Request) {
  try {
    const openRouter = await getOpenRouterContext(request, "extraction");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("extraction") },
        { status: 503 },
      );
    const { name, type, data } = (await request.json()) as {
      name?: string;
      type?: string;
      data?: string;
    };
    if (!name || !type || !data)
      return NextResponse.json(
        { error: "A file is required." },
        { status: 400 },
      );

    const isPdf = type === "application/pdf";
    const content = isPdf
      ? [
          { type: "text", text: transcriptionPrompt },
          { type: "file", file: { filename: name, file_data: data } },
        ]
      : [
          { type: "text", text: transcriptionPrompt },
          { type: "image_url", image_url: { url: data } },
        ];

    const body = {
      model: ocrModel(process.env.OPENROUTER_OCR_MODEL),
      messages: [{ role: "user", content }],
      temperature: 0,
      ...(isPdf
        ? { plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }] }
        : {}),
    };
    let openRouterResult = await requestOpenRouter<OcrResult>(
      openRouter,
      "chat/completions",
      "extract-text",
      body,
    );
    if (
      isOcrRateLimited(
        openRouterResult.result,
        openRouterResult.response.status,
      )
    ) {
      await wait(OCR_RATE_LIMIT_RETRY_DELAY_MS);
      openRouterResult = await requestOpenRouter<OcrResult>(
        openRouter,
        "chat/completions",
        "extract-text-retry",
        body,
      );
    }
    const { response, result } = openRouterResult;
    const rawText = result.choices?.[0]?.message?.content;
    const text = rawText ? normalizeTranscription(rawText) : "";
    if (!response.ok || !text) {
      const providerError = ocrProviderError(
        result,
        response.status,
        "OpenRouter returned no text.",
      );
      return NextResponse.json(
        { error: providerError.message, code: providerError.code },
        { status: response.status || 502 },
      );
    }
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Text extraction failed.",
      },
      { status: 500 },
    );
  }
}
