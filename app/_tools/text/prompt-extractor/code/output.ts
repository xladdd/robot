export type IllustrationPrompt = {
  page: number;
  prompt: string;
};

export function normalizePrompt(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
}

export function formatPromptOutput(items: IllustrationPrompt[]) {
  const pages = new Map<number, { seen: Set<string>; prompts: string[] }>();

  for (const item of [...items].sort((left, right) => left.page - right.page)) {
    if (!Number.isInteger(item.page)) continue;
    const prompt = normalizePrompt(item.prompt);
    if (!prompt) continue;

    const page = pages.get(item.page) || { seen: new Set(), prompts: [] };
    const key = prompt.toLocaleLowerCase("en-US");
    if (!page.seen.has(key)) {
      page.seen.add(key);
      page.prompts.push(prompt);
    }
    pages.set(item.page, page);
  }

  return [...pages.values()]
    .map((page) => page.prompts.join("\n"))
    .filter(Boolean)
    .join("\n\n");
}
