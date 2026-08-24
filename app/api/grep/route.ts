import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });
    const body = await request.json() as { find?: unknown; replace?: unknown };
    const find = typeof body.find === "string" ? body.find.trim() : "";
    const replace = typeof body.replace === "string" ? body.replace.trim() : "";
    if (!find || !replace) return NextResponse.json({ error: "Both Find what and Change to are required." }, { status: 400 });
    if (find.length > 1000 || replace.length > 1000) return NextResponse.json({ error: "The request is too long." }, { status: 400 });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Taktik Robot",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_GREP_MODEL || "mistralai/ministral-3b-2512",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are an expert Adobe InDesign Find/Change GREP assistant. Convert the user's plain-language Find what and Change to intentions into exact strings for Adobe InDesign's GREP tab. The user is describing characters and typography inside a publication—not HTML, CSS, UI controls, accessibility attributes, DOM elements, or JavaScript. In InDesign GREP, a tab character is \\t; multiple consecutive tabs can be expressed as \\t{2,}. Use InDesign GREP syntax and Change To metacharacters, never regex delimiters, code, prose, Markdown, or surrounding quotation marks. Never return selectors such as tab[tabindex], HTML tags, attribute selectors, or pipe-separated UI elements. Preserve literal publication text when requested. Use capture groups and replacement references only when necessary. Return only valid JSON in exactly this shape: {\"findWhat\":\"InDesign GREP expression\",\"replaceWith\":\"InDesign Change To expression\"}.",
          },
          { role: "user", content: JSON.stringify({ find: "multiple tabs", replace: "single tab" }) },
          { role: "assistant", content: JSON.stringify({ findWhat: "\\t{2,}", replaceWith: "\\t" }) },
          { role: "user", content: JSON.stringify({ find, replace }) },
        ],
      }),
    });

    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    const content = result.choices?.[0]?.message?.content?.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    if (!response.ok || !content) return NextResponse.json({ error: result.error?.message || "The model returned no GREP code." }, { status: response.status || 502 });
    const parsed = JSON.parse(content) as { findWhat?: unknown; replaceWith?: unknown };
    if (typeof parsed.findWhat !== "string" || typeof parsed.replaceWith !== "string") return NextResponse.json({ error: "The model returned an invalid GREP response." }, { status: 502 });
    // Models occasionally return literal control characters. InDesign expects
    // their visible GREP metacharacters, and literal tabs look empty in inputs.
    const normalizeControlCharacters = (value: string) => value
      .replace(/\t/g, "\\t")
      .replace(/\r\n|\r|\n/g, "\\r");
    const findWhat = normalizeControlCharacters(parsed.findWhat);
    const replaceWith = normalizeControlCharacters(parsed.replaceWith);
    if (!findWhat || !replaceWith) return NextResponse.json({ error: "The model returned an empty GREP expression. Please try again." }, { status: 502 });
    const combined = `${findWhat}\n${replaceWith}`;
    if (/tab\s*\[\s*tabindex|<\/?[a-z]|querySelector|document\.|\[[a-z-]+\s*=/i.test(combined)) {
      return NextResponse.json({ error: "The model returned web code instead of an InDesign GREP expression. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ findWhat, replaceWith });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "GREP generation failed." }, { status: 500 });
  }
}
