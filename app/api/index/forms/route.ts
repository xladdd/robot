import { NextResponse } from "next/server";

type FormEntry = { word?: unknown; forms?: unknown };

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });
    const { words } = await request.json() as { words?: unknown };
    if (!Array.isArray(words)) return NextResponse.json({ error: "A word list is required." }, { status: 400 });
    const cleanWords = words.filter((word): word is string => typeof word === "string").map((word) => word.trim()).filter(Boolean).slice(0, 12);
    if (!cleanWords.length) return NextResponse.json({ error: "At least one word is required." }, { status: 400 });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Taktik Robot",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_INDEX_MODEL || "mistralai/mistral-medium-3-5",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are a meticulous multilingual terminology and morphology engine for professional Czech, English, Slovak and Romanian textbook indexes. For every input lemma or phrase, return surface strings that may denote that same concept in running text. Before answering, deliberately verify whether each submitted headword is a recognized general or technical term in its likely language and subject. If it contains an evident minor spelling error, include the corrected canonical form and its inflections while preserving the exact submitted text in the word field. Include the complete valid inflectional paradigm. For conventional multi-word terms, include every accepted word-order variant, grammatically valid inflection, abbreviation expansion where strictly equivalent, and firmly equivalent established name used for the identical concept. Do not add translations, broader or narrower concepts, derivations, or merely related terminology. Return exactly one entry per submitted word and deduplicate every form. Use correct native Unicode and diacritics. Return only JSON in this exact shape: {\"entries\":[{\"word\":\"original\",\"forms\":[\"form\"]}]}",
          },
          { role: "user", content: JSON.stringify({ words: cleanWords }) },
        ],
      }),
    });
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    const content = result.choices?.[0]?.message?.content?.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    if (!response.ok || !content) return NextResponse.json({ error: result.error?.message || "The model returned no word forms." }, { status: response.status || 502 });
    const parsed = JSON.parse(content) as { entries?: FormEntry[] };
    const byOriginal = new Map(cleanWords.map((word) => [word.toLocaleLowerCase(), word]));
    const formsByOriginal = new Map(cleanWords.map((word) => [word, new Set([word])]));
    for (const entry of parsed.entries ?? []) {
      if (typeof entry.word !== "string") continue;
      const original = byOriginal.get(entry.word.trim().toLocaleLowerCase());
      if (!original || !Array.isArray(entry.forms)) continue;
      const forms = formsByOriginal.get(original);
      for (const form of entry.forms) if (typeof form === "string" && form.trim()) forms?.add(form.trim());
    }
    const entries = cleanWords.map((word) => ({ word, forms: [...(formsByOriginal.get(word) ?? [word])] }));
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Index preparation failed." }, { status: 500 });
  }
}
