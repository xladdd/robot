import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createSession, openRouterUserId, readSession } from "../app/lib/auth.ts";
import { openRouterApps } from "../app/_tools/openrouter/config.ts";

const root = new URL("../", import.meta.url);

test("defines one unique OpenRouter key for every model-backed app", () => {
  assert.deepEqual(Object.keys(openRouterApps).sort(), [
    "bio",
    "cover",
    "extraction",
    "graph",
    "grep",
    "index",
    "map",
    "prompt",
  ]);
  const envNames = Object.values(openRouterApps).map(({ envName }) => envName);
  assert.equal(new Set(envNames).size, envNames.length);
  assert.ok(envNames.every((name) => /^OPENROUTER_[A-Z_]+_API_KEY$/.test(name)));
});

test("derives stable pseudonymous OpenRouter users from valid Robot sessions", async (context) => {
  const originalSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-only-openrouter-auth-secret";
  context.after(() => {
    if (originalSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalSecret;
  });

  const expires = new Date(Date.now() + 60_000);
  const token = await createSession("alice@example.test", expires);
  const session = await readSession(token);
  const first = await openRouterUserId(session?.username || "");
  const second = await openRouterUserId("alice@example.test");
  const other = await openRouterUserId("bob@example.test");

  assert.equal(session?.username, "alice@example.test");
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first, /^robot_[A-Za-z0-9_-]{32}$/);
  assert.doesNotMatch(first, /alice/i);
});

test("routes every OpenRouter handler through the shared tracked transport", async () => {
  const paths = [
    "app/_tools/text/text-extractor/code/ocr-server.ts",
    "app/_tools/text/text-extractor/code/correct-server.ts",
    "app/_tools/text/index-creator/code/forms-server.ts",
    "app/_tools/text/index-creator/code/select-server.ts",
    "app/_tools/image/graph-generator/code/server.ts",
    "app/_tools/image/diagram-generator/code/server.ts",
    "app/_tools/image/map-generator/code/generate-server.ts",
    "app/_tools/image/cover-generator/code/server.ts",
    "app/_tools/design/grep-builder/server.ts",
    "app/_tools/design/prompt-extractor/code/server.ts",
  ];
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, root), "utf8")));

  for (const source of sources) {
    assert.match(source, /getOpenRouterContext/);
    assert.match(source, /requestOpenRouter/);
    assert.doesNotMatch(source, /process\.env\.OPENROUTER_API_KEY/);
  }
});
