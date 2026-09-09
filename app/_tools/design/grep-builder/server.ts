import { NextResponse } from "next/server";
import { loadPrompt } from "../../load-prompt";
import {
  getOpenRouterContext,
  openRouterConfigurationError,
  requestOpenRouter,
} from "../../openrouter/server";

const grepPrompt = loadPrompt("design/grep-builder/prompts/system.md");

export async function POST(request: Request) {
  try {
    const openRouter = await getOpenRouterContext(request, "grep");
    if (!openRouter)
      return NextResponse.json(
        { error: openRouterConfigurationError("grep") },
        { status: 503 },
      );
    const body = (await request.json()) as {
      find?: unknown;
      replace?: unknown;
    };
    const find = typeof body.find === "string" ? body.find.trim() : "";
    const replace = typeof body.replace === "string" ? body.replace.trim() : "";
    if (!find || !replace)
      return NextResponse.json(
        { error: "Both Find what and Change to are required." },
        { status: 400 },
      );
    if (find.length > 1000 || replace.length > 1000)
      return NextResponse.json(
        { error: "The request is too long." },
        { status: 400 },
      );

    const { response, result } = await requestOpenRouter<{
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    }>(openRouter, "chat/completions", "generate-grep", {
      model: process.env.OPENROUTER_GREP_MODEL || "mistralai/ministral-3b-2512",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: grepPrompt,
        },
        {
          role: "user",
          content: JSON.stringify({
            find: "multiple tabs",
            replace: "single tab",
          }),
        },
        {
          role: "assistant",
          content: JSON.stringify({ findWhat: "\\t{2,}", replaceWith: "\\t" }),
        },
        { role: "user", content: JSON.stringify({ find, replace }) },
      ],
    });
    const content = result.choices?.[0]?.message?.content
      ?.replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    if (!response.ok || !content)
      return NextResponse.json(
        { error: result.error?.message || "The model returned no GREP code." },
        { status: response.status || 502 },
      );
    const parsed = JSON.parse(content) as {
      findWhat?: unknown;
      replaceWith?: unknown;
    };
    if (
      typeof parsed.findWhat !== "string" ||
      typeof parsed.replaceWith !== "string"
    )
      return NextResponse.json(
        { error: "The model returned an invalid GREP response." },
        { status: 502 },
      );
    // Models occasionally return literal control characters. InDesign expects
    // their visible GREP metacharacters, and literal tabs look empty in inputs.
    const normalizeControlCharacters = (value: string) =>
      value.replace(/\t/g, "\\t").replace(/\r\n|\r|\n/g, "\\r");
    const findWhat = normalizeControlCharacters(parsed.findWhat);
    const replaceWith = normalizeControlCharacters(parsed.replaceWith);
    if (!findWhat || !replaceWith)
      return NextResponse.json(
        {
          error:
            "The model returned an empty GREP expression. Please try again.",
        },
        { status: 502 },
      );
    const combined = `${findWhat}\n${replaceWith}`;
    if (
      /tab\s*\[\s*tabindex|<\/?[a-z]|querySelector|document\.|\[[a-z-]+\s*=/i.test(
        combined,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "The model returned web code instead of an InDesign GREP expression. Please try again.",
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ findWhat, replaceWith });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "GREP generation failed.",
      },
      { status: 500 },
    );
  }
}
