import { NextResponse } from "next/server";
import { loadPrompt } from "../../../load-prompt";

const selectionPrompt = loadPrompt("text/index-creator/prompts/select-pages.md");

type RawCandidate = {
  word?: unknown;
  pages?: unknown;
};

type RawSelection = {
  word?: unknown;
  pages?: unknown;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });

    const body = await request.json() as { candidates?: unknown };
    if (!Array.isArray(body.candidates)) return NextResponse.json({ error: "Candidate pages are required." }, { status: 400 });

    const candidates = (body.candidates as RawCandidate[]).slice(0, 4).flatMap((candidate) => {
      if (typeof candidate.word !== "string" || !Array.isArray(candidate.pages)) return [];
      const pages = candidate.pages.slice(0, 48).flatMap((page) => {
        if (!page || typeof page !== "object") return [];
        const value = page as { pdfPage?: unknown; snippets?: unknown };
        if (!Number.isInteger(value.pdfPage) || !Array.isArray(value.snippets)) return [];
        return [{
          pdfPage: value.pdfPage as number,
          snippets: value.snippets.filter((snippet): snippet is string => typeof snippet === "string").slice(0, 3).map((snippet) => snippet.slice(0, 450)),
        }];
      });
      return [{ word: candidate.word, pages }];
    });

    if (!candidates.length) return NextResponse.json({ selections: [] });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Taktik Robot",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_INDEX_SELECTION_MODEL || "mistralai/mistral-medium-3-5",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: selectionPrompt,
          },
          { role: "user", content: JSON.stringify({ candidates }) },
        ],
      }),
    });

    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    const content = result.choices?.[0]?.message?.content?.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    if (!response.ok || !content) return NextResponse.json({ error: result.error?.message || "The model returned no page selections." }, { status: response.status || 502 });

    const parsed = JSON.parse(content) as { selections?: RawSelection[] };
    const allowed = new Map(candidates.map((candidate) => [candidate.word, new Set(candidate.pages.map((page) => page.pdfPage))]));
    const selections = candidates.map((candidate) => {
      const selection = parsed.selections?.find((item) => item.word === candidate.word);
      const pages = Array.isArray(selection?.pages)
        ? selection.pages.filter((page): page is number => Number.isInteger(page) && Boolean(allowed.get(candidate.word)?.has(page as number)))
        : [];
      return { word: candidate.word, pages: [...new Set(pages)].sort((a, b) => a - b) };
    });

    return NextResponse.json({ selections });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Index page selection failed." }, { status: 500 });
  }
}
