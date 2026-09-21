import assert from "node:assert/strict";
import test from "node:test";

import { getDetailRegions } from "../code/render-geometry.ts";
import { formatPromptOutput, normalizePrompt } from "../code/output.ts";
import { validateInventory, validatePrompt } from "../code/validation.ts";

test("creates overlapping detail regions covering the complete page", () => {
  const regions = getDetailRegions(1000, 2700);
  assert.equal(regions.length, 3);
  assert.equal(regions[0].y, 0);
  assert.equal(regions[2].y + regions[2].height, 2700);
  assert.ok(regions[0].y + regions[0].height > regions[1].y);
  assert.ok(regions[1].y + regions[1].height > regions[2].y);
  for (const region of regions) {
    assert.equal(region.x, 0);
    assert.equal(region.width, 1000);
    assert.ok(region.y >= 0);
    assert.ok(region.y + region.height <= 2700);
  }
});

test("normalizes prompt whitespace and terminal punctuation", () => {
  assert.equal(
    normalizePrompt("  a   smiling squirrel.  "),
    "a smiling squirrel",
  );
});

test("formats prompts in page order with blank-line page breaks", () => {
  assert.equal(
    formatPromptOutput([
      { page: 2, prompt: "two children" },
      { page: 1, prompt: "a mountain" },
      { page: 2, prompt: "four dogs" },
      { page: 3, prompt: "a squirrel" },
    ]),
    "a mountain\n\ntwo children\nfour dogs\n\na squirrel",
  );
});

test("deduplicates only within a page", () => {
  assert.equal(
    formatPromptOutput([
      { page: 1, prompt: "a deer" },
      { page: 1, prompt: " A DEER! " },
      { page: 2, prompt: "a deer" },
    ]),
    "a deer\n\na deer",
  );
});

test("ignores empty prompts and emits no category headings", () => {
  assert.equal(
    formatPromptOutput([
      { page: 1, prompt: " " },
      { page: 1, prompt: "a mountain" },
    ]),
    "a mountain",
  );
});

test("rejects printed digits and manuscript-text leakage", () => {
  assert.equal(validatePrompt("eight socks"), null);
  assert.equal(
    validatePrompt("an illustrated pathway with arrows and empty boxes"),
    "Prompt must not contain manuscript text or labels.",
  );
  assert.equal(
    validatePrompt("socks with number labels"),
    "Prompt must not contain manuscript text or labels.",
  );
  assert.equal(
    validatePrompt("5 colorful socks"),
    "Prompt must not contain printed digits.",
  );
  assert.equal(
    validatePrompt("https://example.test/image"),
    "Prompt must not contain manuscript text or labels.",
  );
});

test("validates and orders a structured asset inventory", () => {
  const result = validateInventory({
    assets: [
      {
        order: 2,
        relationship: "variation_set",
        visibleCount: 5,
        region: { x: 0.4, y: 0.1, width: 0.5, height: 0.4 },
        subjects: [{ name: "house", color: "", pose: "" }],
        prompt: "five different houses",
      },
      {
        order: 1,
        relationship: "independent",
        visibleCount: 1,
        region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        subjects: [{ name: "mountain", color: "ochre", pose: "" }],
        prompt: "an ochre mountain",
      },
    ],
  });
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.deepEqual(
      result.assets.map(({ order, prompt }) => ({ order, prompt })),
      [
        { order: 1, prompt: "an ochre mountain" },
        { order: 2, prompt: "five different houses" },
      ],
    );
  }
});

test("rejects invalid asset regions", () => {
  const result = validateInventory({
    assets: [
      {
        order: 1,
        relationship: "independent",
        visibleCount: 1,
        region: { x: 0.9, y: 0, width: 0.3, height: 0.3 },
        subjects: [{ name: "boar", color: "", pose: "" }],
        prompt: "a boar",
      },
    ],
  });
  assert.deepEqual(result, {
    valid: false,
    error: "Asset 1 has an invalid region.",
  });
});
