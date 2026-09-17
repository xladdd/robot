import { NextResponse } from "next/server";
import { loadPrompt } from "../../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
} from "../../../openrouter/server";
import { sanitizeFormEntries, type FormEntry } from "./form-validation";

const formsPrompt = loadPrompt("text/index-creator/prompts/forms.md");

export async function POST(request: Request) {
  try {
    const openRouter = await getOpenRouterContext(request, "index");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("index") },
        { status: 503 },
      );
    const { words } = (await request.json()) as { words?: unknown };
    if (!Array.isArray(words))
      return NextResponse.json(
        { error: "A word list is required." },
        { status: 400 },
      );
    const cleanWords = words
      .filter((word): word is string => typeof word === "string")
      .map((word) => word.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (!cleanWords.length)
      return NextResponse.json(
        { error: "At least one word is required." },
        { status: 400 },
      );

    const { response, result } = await requestOpenRouter<{
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    }>(openRouter, "chat/completions", "generate-word-forms", {
      model:
        process.env.OPENROUTER_INDEX_MODEL || "mistralai/mistral-medium-3-5",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: formsPrompt,
        },
        { role: "user", content: JSON.stringify({ words: cleanWords }) },
      ],
    });
    const content = result.choices?.[0]?.message?.content
      ?.replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    if (!response.ok || !content)
      return NextResponse.json(
        { error: result.error?.message || "The model returned no word forms." },
        { status: response.status || 502 },
      );
    const parsed = JSON.parse(content) as { entries?: FormEntry[] };
    const entries = sanitizeFormEntries(
      cleanWords,
      Array.isArray(parsed.entries) ? parsed.entries : [],
    );
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Index preparation failed.",
      },
      { status: 500 },
    );
  }
}
