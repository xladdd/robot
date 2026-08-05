import { NextResponse } from "next/server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_BATCH_SIZE = 1;

type PageImage = { page?: number; data?: string };
type Illustration = { page: number; complexity: "simple" | "complex"; prompt: string };

const systemPrompt = `You inspect rendered manuscript PDF pages and describe only meaningful visual illustrations for a later image-generation system.

Rules:
- Ignore every visible letter, word, number, mathematical expression, label, caption, arrow annotation, and other alphanumeric or instructional mark. Also ignore the colored oval, circle, box, badge, or other container whose purpose is to hold such a label, even if its text is blank or unreadable. Never transcribe, quote, summarize, describe, or include any of these elements in a prompt, even when they appear inside or directly beside an illustration.
- Ignore blank spaces, lines, borders, page furniture, logos, icons, bullets, decorative flourishes, flat color blocks, backgrounds without a subject, and other elements with no meaningful pictorial content.
- First segment the page into reusable visual assets. Return one item for each independent asset or intentionally cohesive asset group. Do not treat an entire exercise, row, diagram, or page region as one illustration merely because its elements share nearby text, arrows, paths, numbers, or a common task.
- Return items in visual reading order: top to bottom, then left to right for items on the same row.
- Subjects separated by clear whitespace and not touching, overlapping, or interacting are normally separate illustrations and must receive separate prompts. For example, an isolated wild boar, an isolated deer, and an isolated fox are three prompts, not one group prompt.
- Keep subjects together only when they form one intentional asset: they overlap or touch, clearly interact, or visibly form a deliberate set that should be generated together. State an exact visible count when confident and include an important arrangement constraint. For example: "four children standing together, not overlapping" or "four dogs of different breeds standing together".
- If repeated variations are visibly intended as one generated set, consolidate them into one count-based prompt rather than repeating near-identical prompts. Ignore any printed numbers attached to the variations. For example: "eight different pairs of socks hanging from drying lines", never eight prompts distinguished only by printed number labels.
- Identify the depicted objects carefully before writing. Prefer the specific everyday object shown (for example, socks hanging on a drying line) over a visually similar but incorrect object (for example, shoes).
- SIMPLE is the default category. It includes single objects, characters, groups of characters or animals, landscapes, activities, and scenes with multiple subjects. Write a short natural phrase focused on the depicted subject and action, for example: "a girl jumping and smiling", "an anthropomorphic mouse holding cheese", "socks hanging on a drying line", or "a horse, a dog, and a cat standing together".
- COMPLEX is a source-layout category, not a measure of subject count. A source illustration is COMPLEX only when it has BOTH (1) a clearly visible border or self-contained framed boundary and (2) a clear, developed, detailed background or environment. If either condition is absent, classify its output items as SIMPLE. A mountain landscape, a group of characters, multiple animals, or a busy activity is SIMPLE unless it satisfies both conditions.
- Even when the source is COMPLEX, decompose it into the independent assets that the later image generator should create. Classify those extracted assets as COMPLEX so they remain grouped under the COMPLEX heading, but give each asset its own simple generation prompt. Ignore paths, exercise logic, spatial routes, labels, and mathematical context.
- For example, a framed maze containing a girl on a scooter, five visually different houses, six or seven trees, and a fountain should yield one COMPLEX item for the girl, one separate COMPLEX item for each visually distinct house, one count-based COMPLEX item for the trees, and one COMPLEX item for the fountain. Do not merge distinct houses into a group, lose the visible tree count, or produce one maze prompt.
- Treat educational diagram context as disposable. For example, a squirrel beside arithmetic arrows and acorns yields separate SIMPLE prompts for "a squirrel" and "acorns"; the pictured nuts are acorns, not hazelnuts. Do not describe collecting, addition, arrows, totals, or a journey unless that action is unambiguously depicted by the artwork itself without relying on instructional marks.
- Do not mention a source border in any generated prompt.
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
      { type: "text" as const, text: `PDF page ${page}. Attribute every item in the following image to page ${page}.` },
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
        model: process.env.OPENROUTER_PROMPT_EXTRACTOR_MODEL || "qwen/qwen3.5-122b-a10b",
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
