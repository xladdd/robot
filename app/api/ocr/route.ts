import { NextResponse } from "next/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const transcriptionPrompt = [
  "Act only as a literal OCR transcription engine.",
  "Transcribe every visible character in reading order and preserve paragraphs, headings, lists, punctuation, capitalization and line breaks.",
  "Do not interpret, explain, summarize, correct, complete or add any text.",
  "Do not identify the programming language. Do not add Markdown code fences or formatting markers unless those exact characters are visibly present in the source.",
  "If text is unreadable, write [illegible]. Return only the transcription.",
].join(" ");

function normalizeTranscription(raw: string) {
  let text = raw.trim();
  const fullyFenced = text.match(/^(?:[A-Za-z][\w +#.-]*\s*\n+)?```[^\n]*\n([\s\S]*?)\n```\s*$/);
  if (fullyFenced?.[1]) return fullyFenced[1].trim();
  text = text.replace(/^```[^\n]*$/gm, "").trim();
  return text;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });
    const { name, type, data } = await request.json() as { name?: string; type?: string; data?: string };
    if (!name || !type || !data) return NextResponse.json({ error: "A file is required." }, { status: 400 });

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

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Taktik Automat",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_OCR_MODEL || "mistralai/mistral-small-2603",
        messages: [{ role: "user", content }],
        temperature: 0,
        ...(isPdf ? { plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }] } : {}),
      }),
    });
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    const rawText = result.choices?.[0]?.message?.content;
    const text = rawText ? normalizeTranscription(rawText) : "";
    if (!response.ok || !text) return NextResponse.json({ error: result.error?.message || "OpenRouter returned no text." }, { status: response.status || 502 });
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Text extraction failed." }, { status: 500 });
  }
}
