import { NextResponse } from "next/server";
import { loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
} from "../../../openrouter/server";

const transcriptionPrompt = loadPrompt(
  "text/text-extractor/prompts/transcription.md",
);

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

    const { response, result } = await requestOpenRouter<{
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    }>(openRouter, "chat/completions", "extract-text", {
      model: process.env.OPENROUTER_OCR_MODEL || "mistralai/mistral-small-2603",
      messages: [{ role: "user", content }],
      temperature: 0,
      ...(isPdf
        ? { plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }] }
        : {}),
    });
    const rawText = result.choices?.[0]?.message?.content;
    const text = rawText ? normalizeTranscription(rawText) : "";
    if (!response.ok || !text)
      return NextResponse.json(
        { error: result.error?.message || "OpenRouter returned no text." },
        { status: response.status || 502 },
      );
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
