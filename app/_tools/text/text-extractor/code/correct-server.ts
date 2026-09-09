import { NextResponse } from "next/server";
import { loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
} from "../../../openrouter/server";

const correctionPrompt = loadPrompt(
  "text/text-extractor/prompts/correction.md",
);

export async function POST(request: Request) {
  try {
    const openRouter = await getOpenRouterContext(request, "extraction");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("extraction") },
        { status: 503 },
      );
    const { text, instruction, language } = (await request.json()) as {
      text?: string;
      instruction?: string;
      language?: string;
    };
    if (!text?.trim() || !instruction?.trim())
      return NextResponse.json(
        { error: "Text and correction instructions are required." },
        { status: 400 },
      );

    const { response, result } = await requestOpenRouter<{
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    }>(openRouter, "chat/completions", "correct-text", {
      model:
        process.env.OPENROUTER_CORRECTION_MODEL ||
        "mistralai/ministral-8b-2512",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `${correctionPrompt} Working language: ${language === "cs" ? "Czech" : "English"}.`,
        },
        {
          role: "user",
          content: `INSTRUCTION:\n${instruction}\n\nTEXT:\n${text}`,
        },
      ],
    });
    const corrected = result.choices?.[0]?.message?.content?.trim();
    if (!response.ok || !corrected)
      return NextResponse.json(
        {
          error:
            result.error?.message || "OpenRouter returned no corrected text.",
        },
        { status: response.status || 502 },
      );
    return NextResponse.json({ text: corrected });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Text correction failed.",
      },
      { status: 500 },
    );
  }
}
