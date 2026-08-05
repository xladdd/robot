import { NextResponse } from "next/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_BATCH_SIZE = 4;

type PageImage = { page?: number; data?: string };
type Illustration = { page: number; complexity: "simple" | "complex"; prompt: string };

const systemPrompt = `You inspect rendered manuscript PDF pages and describe only meaningful visual illustrations for a later image-generation system.

Rules:
- Ignore all written text. Never transcribe, quote, summarize, or include visible words in a prompt.
- Ignore blank spaces, lines, borders, page furniture, logos, icons, bullets, decorative flourishes, flat color blocks, backgrounds without a subject, and other elements with no meaningful pictorial content.
- Return one item for each distinct meaningful illustration. Do not combine unrelated illustrations on the same page.
- SIMPLE means a single object or character, or a straightforward subject and action. Write a short natural phrase focused on object/character and action, for example: "a girl jumping and smiling" or "an anthropomorphic mouse holding cheese".
- COMPLEX means a scene with several important subjects, interactions, or environmental details needed to reconstruct it. Describe those necessary details clearly, but stay concise.
- Describe depicted content only. Do not mention art style, colors, typography, page layout, framing, medium, or image quality.
- Do not infer hidden details or use surrounding manuscript text.
- If a page has no meaningful illustration, return no item for that page.
- Use the supplied page number exactly.`;

function parseIllustrations(value: unknown, validPages: Set<number>): Illustration[] {
  if (!value || typeof value !== "object") return [];
  const raw = (value as { illustrations?: unknown }).illustrations;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<Illustration>;
    const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim() : "";
    if (!Number.isInteger(candidate.page) || !validPages.has(candidate.page as number) || !prompt) return [];
    return [{
      page: candidate.page as number,
      complexity: candidate.complexity === "complex" ? "complex" : "simple",
      prompt,
    }];
  });
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured." }, { status: 503 });
    const { pages } = await request.json() as { pages?: PageImage[] };
    if (!Array.isArray(pages) || !pages.length || pages.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `Send between 1 and ${MAX_BATCH_SIZE} rendered PDF pages.` }, { status: 400 });
    }
    const normalized = pages.flatMap((item) =>
      Number.isInteger(item.page) && typeof item.data === "string" && item.data.startsWith("data:image/")
        ? [{ page: item.page as number, data: item.data }]
        : [],
    );
    if (normalized.length !== pages.length) return NextResponse.json({ error: "One or more page images are invalid." }, { status: 400 });

    const content = normalized.flatMap(({ page, data }) => [
      { type: "text" as const, text: `PDF page ${page}` },
      { type: "image_url" as const, image_url: { url: data } },
    ]);
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Taktik Automat",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_PROMPT_EXTRACTOR_MODEL || "mistralai/mistral-medium-3-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "illustration_prompts",
            strict: true,
            schema: {
              type: "object",
              properties: {
                illustrations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      page: { type: "integer" },
                      complexity: { type: "string", enum: ["simple", "complex"] },
                      prompt: { type: "string" },
                    },
                    required: ["page", "complexity", "prompt"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["illustrations"],
              additionalProperties: false,
            },
          },
        },
      }),
    });
    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    const raw = result.choices?.[0]?.message?.content;
    if (!response.ok || !raw) return NextResponse.json({ error: result.error?.message || "OpenRouter returned no prompts." }, { status: response.status || 502 });
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return NextResponse.json({ error: "The model returned an invalid prompt list." }, { status: 502 }); }
    return NextResponse.json({ illustrations: parseIllustrations(parsed, new Set(normalized.map(({ page }) => page))) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Prompt extraction failed." }, { status: 500 });
  }
}
