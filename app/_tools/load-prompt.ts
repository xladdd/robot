import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadPrompt(relativePath: string) {
  return readFileSync(join(process.cwd(), "app", "_tools", relativePath), "utf8").trim();
}

export function fillPrompt(template: string, values: Record<string, string | number>) {
  return template.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (token, key: string) => {
    if (!(key in values)) throw new Error(`Missing prompt value for ${token}.`);
    return String(values[key]);
  });
}
