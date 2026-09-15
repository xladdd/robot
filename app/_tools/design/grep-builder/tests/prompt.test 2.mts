import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prompt = readFileSync(
  new URL("../prompts/system.md", import.meta.url),
  "utf8",
);

test("documents the safe four-pass workflow for conditional date padding", () => {
  const datePaddingRule = prompt
    .split("\n")
    .find((line) => line.startsWith("- Conditional zero-padding of D/M/YYYY"));

  assert.ok(datePaddingRule, "the conditional date-padding rule is documented");
  assert.match(datePaddingRule, /\\b\(\\d\)\/\(\\d\)\/\(\\d\{4\}\)\\b` → Change `\$3-0\$2-0\$1`/);
  assert.match(datePaddingRule, /\\b\(\\d\)\/\(\\d\{2\}\)\/\(\\d\{4\}\)\\b` → Change `\$3-\$2-0\$1`/);
  assert.match(datePaddingRule, /\\b\(\\d\{2\}\)\/\(\\d\)\/\(\\d\{4\}\)\\b` → Change `\$3-0\$2-\$1`/);
  assert.match(datePaddingRule, /\\b\(\\d\{2\}\)\/\(\\d\{2\}\)\/\(\\d\{4\}\)\\b` → Change `\$3-\$2-\$1`/);
  assert.match(datePaddingRule, /Do not recommend Find Format, a placeholder, or a single one-pass expression/);
});
