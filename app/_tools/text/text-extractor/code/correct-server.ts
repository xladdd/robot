import { NextResponse } from "next/server";
import { loadPrompt } from "../../../load-prompt";

const correctionPrompt = loadPrompt("text/text-extractor/prompts/correction.md");

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });
    const { text, instruction, language } = await request.json() as { text?: string; instruction?: string; language?: string };
    if (!text?.trim() || !instruction?.trim()) return NextResponse.json({ error: "Text and correction instructions are required." }, { status: 400 });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Taktik Robot",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_CORRECTION_MODEL || "mistralai/ministral-8b-2512",
        temperature: 0.1,
        messages: [
          { role: "system", content: `${correctionPrompt} Working language: ${language === "cs" ? "Czech" : "English"}.` },
          { role: "user", content: `INSTRUCTION:\n${instruction}\n\nTEXT:\n${text}` },
        ],
      }),
    });
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    const corrected = result.choices?.[0]?.message?.content?.trim();
    if (!response.ok || !corrected) return NextResponse.json({ error: result.error?.message || "OpenRouter returned no corrected text." }, { status: response.status || 502 });
    return NextResponse.json({ text: corrected });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Text correction failed." }, { status: 500 });
  }
}
