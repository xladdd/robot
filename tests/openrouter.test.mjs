import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  createSession,
  openRouterUserId,
  readSession,
} from "../app/lib/auth.ts";
import { openRouterApps } from "../app/_tools/openrouter/config.ts";
import { toolDefinitions } from "../app/_tools/generated/registry.data.ts";

const root = new URL("../", import.meta.url);

test("defines one unique OpenRouter key for every model-backed app", () => {
  const legacyIds = [
    "bio",
    "conceptIllustrator",
    "cover",
    "extraction",
    "graph",
    "grep",
    "image",
    "index",
    "layerSplitter",
    "prompt",
    "styleTrainer",
    "typesetter",
  ];
  for (const id of legacyIds) assert.ok(Object.hasOwn(openRouterApps, id), id);
  for (const id of Object.keys(openRouterApps)) {
    assert.ok(
      toolDefinitions.some((tool) => tool.id === id),
      `${id}: registered tool`,
    );
  }
  const envNames = Object.values(openRouterApps).map(({ envName }) => envName);
  assert.equal(new Set(envNames).size, envNames.length);
  assert.ok(
    envNames.every((name) => /^OPENROUTER_[A-Z0-9_]+_API_KEY$/.test(name)),
  );
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

test("routes legacy OpenRouter handlers through the shared tracked transport", async () => {
  const paths = [
    "app/_tools/text/text-extractor/code/ocr-server.ts",
    "app/_tools/text/text-extractor/code/correct-server.ts",
    "app/_tools/text/index-creator/code/forms-server.ts",

    "app/_tools/image/graph-generator/code/server.ts",
    "app/_tools/image/diagram-generator/code/server.ts",
    "app/_tools/image/cover-generator/code/server.ts",
    "app/_tools/image/concept-illustrator/code/server.ts",
    "app/_tools/image/image-generator/code/server.ts",
    "app/_tools/image/layer-splitter/code/server.ts",
    "app/_tools/design/grep-builder/server.ts",
    "app/_tools/design/style-trainer/code/server.ts",
    "app/_tools/design/typesetter/code/server.ts",
    "app/_tools/text/prompt-extractor/code/server.ts",
  ];
  const sources = await Promise.all(
    paths.map((path) => readFile(new URL(path, root), "utf8")),
  );

  for (const source of sources) {
    assert.match(source, /getOpenRouterContext/);
    assert.match(source, /requestOpenRouter/);
    assert.doesNotMatch(source, /process\.env\.OPENROUTER_API_KEY/);
  }
});

test("keeps Image Generator key and account balances distinct", async () => {
  const source = await readFile(
    new URL("app/_tools/image/image-generator/code/server.ts", root),
    "utf8",
  );

  assert.match(source, /const credit = keyCredit;/);
  assert.match(
    source,
    /const accountCredit =\s*managementTotalCredits !== null &&\s*managementTotalUsage !== null/,
  );
  assert.doesNotMatch(
    source,
    /appKeyAccountCredit|fetchOpenRouter<RawCredits>/,
  );
});

async function ownedServerSources(directory) {
  const sources = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["tests", "generated", "node_modules"].includes(entry.name)) continue;
    const path = new URL(
      entry.name + (entry.isDirectory() ? "/" : ""),
      directory,
    );
    if (entry.isDirectory()) sources.push(...(await ownedServerSources(path)));
    else if (entry.name.endsWith(".ts"))
      sources.push(await readFile(path, "utf8"));
  }
  return sources;
}

test("all registered AI tools retain manifest key metadata and declared native route handlers", async () => {
  for (const tool of toolDefinitions) {
    const directory = new URL(`app/_tools/${tool.folder}/`, root);
    const { default: manifest } = await import(
      new URL("manifest.ts", directory).href
    );
    const configuration = openRouterApps[tool.id];
    assert.equal(Boolean(configuration), Boolean(manifest.openRouter), tool.id);
    if (!configuration) continue;
    assert.equal(configuration.envName, manifest.openRouter.envName, tool.id);
    assert.equal(configuration.name, manifest.label.en, tool.id);
    assert.ok(manifest.routes?.length, `${tool.id}: declared routes`);
    for (const route of manifest.routes) {
      const handler = new URL(`${route.handler}.ts`, directory);
      const source = await readFile(handler, "utf8");
      const wrapper = await readFile(
        new URL(`app${route.path}/route.ts`, root),
        "utf8",
      );
      const references = [
        ...wrapper.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g),
      ];
      assert.ok(
        references.some((match) => {
          const imported = new URL(
            match[1],
            new URL(`app${route.path}/route.ts`, root),
          );
          return (
            imported.href === handler.href ||
            `${imported.href}.ts` === handler.href
          );
        }),
        `${tool.id}: ${route.path} references its declared handler`,
      );
      for (const method of route.methods)
        assert.match(wrapper, new RegExp(`\\b${method}\\b`));
      assert.doesNotMatch(
        source,
        /process\.env\.OPENROUTER_API_KEY/,
        `${tool.id}: ${route.handler}`,
      );
    }
    // GET catalogue/status handlers need not create a model context; the owning
    // pipeline must still use the shared context and tracked request transport.
    const pipeline = (await ownedServerSources(directory)).join("\n");
    assert.match(
      pipeline,
      /getOpenRouterContext/,
      `${tool.id}: shared context`,
    );
    assert.match(
      pipeline,
      /requestOpenRouter/,
      `${tool.id}: tracked transport`,
    );
  }
});

test("keeps map prompt interpretation structured and geometry-free", async () => {
  const source = await readFile(
    new URL("app/_tools/image/map-generator/code/generate-server.ts", root),
    "utf8",
  );
  assert.match(source, /requestOpenRouter/);
  assert.match(source, /response_format/);
  assert.match(source, /map-generator\/prompts\/map-prompt\.md/);
  assert.doesNotMatch(source, /polygons/);
});
