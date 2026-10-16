import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildModelMarkdown,
  type ModelStageDefinition,
} from "../app/_tools/models.ts";
import {
  openRouterApps,
  toolDefinitions,
} from "../app/_tools/generated/registry.data.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const serverSource = await read("app/_tools/models-server.ts");
const boundary = /^import ["']server-only["'];\s*$/m;
assert.match(serverSource, boundary);
// The real resolver is compiled in memory; only Next's poison-pill import is removed.
// Every resolver call below injects a getter, so no runtime environment is read.
const fixture = stripTypeScriptTypes(serverSource.replace(boundary, ""));
assert.doesNotMatch(fixture, /^import\s/m);
const { resolveModel, resolveFailureFallbackModels, resolveModelDefinitions } =
  (await import(
    `data:text/javascript;base64,${Buffer.from(fixture).toString("base64")}`
  )) as typeof import("../app/_tools/models-server.ts");
const unset = () => undefined;

const legacyAiFolders = [
  "text/text-extractor",
  "text/index-creator",
  "text/prompt-extractor",
  "design/grep-builder",
  "design/style-trainer",
  "design/typesetter",
  "image/graph-generator",
  "image/diagram-generator",
  "image/cover-generator",
  "image/image-generator",
  "image/concept-illustrator",
  "image/layer-splitter",
].sort();
const registeredAiTools = toolDefinitions.filter((tool) =>
  Object.hasOwn(openRouterApps, tool.id),
);
const tools: Array<{
  folder: string;
  definitions: readonly ModelStageDefinition[];
}> = [];
for (const tool of toolDefinitions) {
  const directory = new URL(`app/_tools/${tool.folder}/`, root);
  if (!(await readdir(directory)).includes("model-definitions.ts")) continue;
  const { modelDefinitions } = (await import(
    new URL("model-definitions.ts", directory).href
  )) as {
    modelDefinitions: readonly ModelStageDefinition[];
  };
  tools.push({ folder: tool.folder, definitions: modelDefinitions });
}

const sample: ModelStageDefinition = {
  stageId: "planning",
  label: { en: "Planning", cs: "Plánování" },
  defaultModel: "example/default",
  environmentPrecedence: ["PRIMARY_MODEL", "LEGACY_MODEL"],
  failureFallbackModels: [
    {
      defaultModel: "example/fallback",
      environmentPrecedence: ["FALLBACK_MODEL"],
    },
    { defaultModel: "example/fallback", environmentPrecedence: [] },
  ],
  data: { en: "Extracted text only.", cs: "Pouze extrahovaný text." },
  providerNotes: {
    en: "Routing is not a residency guarantee.",
    cs: "Směrování nezaručuje rezidenci.",
  },
};

async function sourceFiles(directory: URL): Promise<URL[]> {
  const files: URL[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["tests", "generated", "node_modules"].includes(entry.name)) continue;
    const path = new URL(
      entry.name + (entry.isDirectory() ? "/" : ""),
      directory,
    );
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

function stageReference(stageId: string): string {
  const escaped = stageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `modelStages(?:\\.${escaped}\\b|\\[[^\\]]*["']${escaped}["'][^\\]]*\\])`;
}

test("all registered AI tools own unique bilingual, configurable stage definitions", async () => {
  for (const folder of legacyAiFolders) {
    assert.ok(
      registeredAiTools.some((tool) => tool.folder === folder),
      folder,
    );
  }
  for (const registered of registeredAiTools) {
    assert.ok(
      tools.some(
        (tool) => tool.folder === registered.folder && tool.definitions.length,
      ),
      registered.folder,
    );
  }
  for (const { folder, definitions } of tools) {
    assert.ok(definitions.length, folder);
    assert.equal(
      new Set(definitions.map((stage) => stage.stageId)).size,
      definitions.length,
      folder,
    );
    const definitionSource = await read(
      `app/_tools/${folder}/model-definitions.ts`,
    );
    assert.doesNotMatch(
      definitionSource,
      /process\.env|server-only|models-server|requestOpenRouter|fetch\s*\(/,
    );
    const resolved = resolveModelDefinitions(definitions, unset);
    assert.equal(resolved.length, definitions.length);
    for (const [index, stage] of definitions.entries()) {
      assert.match(stage.stageId, /^[a-z][a-z0-9-]*$/);
      assert.ok(stage.defaultModel.trim(), `${folder}/${stage.stageId}`);
      assert.equal(resolved[index].configuredModel, stage.defaultModel);
      for (const language of ["en", "cs"] as const) {
        assert.ok(stage.label[language]?.trim());
        for (const note of [stage.data, stage.providerNotes]) {
          if (note) assert.ok(note[language]?.trim());
        }
        const markdown = buildModelMarkdown([resolved[index]], language);
        assert.ok(markdown.includes(stage.label[language]));
        assert.ok(markdown.includes(`\`${stage.defaultModel} `));
      }
      for (const choice of [stage, ...stage.failureFallbackModels]) {
        assert.ok(choice.defaultModel.trim());
        assert.equal(
          new Set(choice.environmentPrecedence).size,
          choice.environmentPrecedence.length,
        );
        for (const name of choice.environmentPrecedence)
          assert.match(name, /^[A-Z_][A-Z0-9_]*$/);
        if (choice.environmentPrecedence.length) {
          const last = choice.environmentPrecedence.at(-1);
          assert.equal(
            resolveModel(choice, (name) =>
              name === last ? "example/configured" : undefined,
            ),
            "example/configured",
          );
        }
      }
    }
  }
});

test("environment precedence stops at the first value and preserves historical trim behavior", () => {
  const reads: string[] = [];
  assert.equal(
    resolveModel(sample, (name) => {
      reads.push(name);
      return "example/primary";
    }),
    "example/primary",
  );
  assert.deepEqual(reads, ["PRIMARY_MODEL"]);
  assert.equal(
    resolveModel(sample, (name) =>
      name === "LEGACY_MODEL" ? "example/legacy" : "",
    ),
    "example/legacy",
  );
  assert.equal(resolveModel(sample, unset), sample.defaultModel);
  assert.equal(
    resolveModel(sample, () => ""),
    sample.defaultModel,
  );
  assert.equal(
    resolveModel(sample, () => "  "),
    "  ",
  );
  const ocr = tools
    .find((tool) => tool.folder === "text/text-extractor")!
    .definitions.find((stage) => stage.stageId === "ocr")!;
  assert.equal(ocr.trimEnvironmentValue, true);
  assert.equal(
    resolveModel(ocr, () => "  example/ocr  "),
    "example/ocr",
  );
  assert.equal(
    resolveModel(ocr, () => "  "),
    ocr.defaultModel,
  );
  assert.equal(
    resolveModel({ ...sample, trimEnvironmentValue: true }, (name) =>
      name === "PRIMARY_MODEL" ? "  " : " example/legacy ",
    ),
    "example/legacy",
  );
});

test("failure fallbacks are configured separately, deduplicated and exclude the primary", () => {
  assert.deepEqual(resolveFailureFallbackModels(sample, unset), [
    "example/fallback",
  ]);
  const getter = (name: string) =>
    (
      ({
        PRIMARY_MODEL: "example/configured",
        FALLBACK_MODEL: "example/configured-fallback",
      }) as Record<string, string>
    )[name];
  assert.deepEqual(resolveFailureFallbackModels(sample, getter), [
    "example/configured-fallback",
    "example/fallback",
  ]);
  assert.deepEqual(
    resolveFailureFallbackModels(sample, (name) =>
      name === "FALLBACK_MODEL" ? sample.defaultModel : undefined,
    ),
    ["example/fallback"],
  );
  assert.deepEqual(
    resolveFailureFallbackModels(
      { ...sample, failureFallbackModels: [] },
      unset,
    ),
    [],
  );
  const original = JSON.stringify(sample);
  resolveModelDefinitions([sample], getter);
  assert.equal(JSON.stringify(sample), original);
});

test("bilingual model prose keeps configured IDs, distinct defaults, fallbacks and notes together", () => {
  const resolved = resolveModelDefinitions([sample], (name) =>
    name === "PRIMARY_MODEL"
      ? "example/configured"
      : name === "FALLBACK_MODEL"
        ? "example/backup"
        : undefined,
  );
  for (const language of ["en", "cs"] as const) {
    const markdown = buildModelMarkdown(resolved, language);
    assert.ok(markdown.includes(sample.label[language]));
    const defaultLabel = language === "cs" ? "výchozí" : "default";
    const fallbackLabel =
      language === "cs" ? "Záloha při selhání" : "Failure fallback";
    assert.ok(
      markdown.includes(
        `${sample.label[language]}: \`example/configured\` (${defaultLabel}: \`example/default\`). ${fallbackLabel}: \`example/backup\`, \`example/fallback\`. ${sample.data![language]} ${sample.providerNotes![language]}`,
      ),
    );
    assert.doesNotMatch(markdown, /^\s*(?:#|[-*] |\d+\. |\|)|\*\*/m);
    assert.ok(markdown.includes(sample.data![language]));
    assert.ok(markdown.includes(sample.providerNotes![language]));
    assert.ok(
      !markdown.includes(sample.data![language === "en" ? "cs" : "en"]),
    );
    assert.doesNotMatch(
      markdown,
      /PRIMARY_MODEL|LEGACY_MODEL|FALLBACK_MODEL|process\.env/,
    );
    assert.equal(buildModelMarkdown([], language), "");
    const defaults = buildModelMarkdown([sample], language);
    assert.ok(
      defaults.includes(`${sample.label[language]}: \`example/default\`.`),
    );
    assert.ok(defaults.includes(`${fallbackLabel}: \`example/fallback\``));
    assert.doesNotMatch(defaults, new RegExp(`${defaultLabel}:`));
    assert.equal(defaults.split("`example/default`").length - 1, 1);
    const noFallback = buildModelMarkdown(
      [{ ...sample, failureFallbackModels: [] }],
      language,
    );
    assert.ok(
      noFallback.includes(`${sample.label[language]}: \`example/default\`.`),
    );
    assert.ok(!noFallback.includes(fallbackLabel));
  }
  assert.match(
    buildModelMarkdown(resolved, "en"),
    /Models reflect the server configuration/,
  );
  assert.match(
    buildModelMarkdown(resolved, "cs"),
    /Modely odpovídají konfiguraci serveru/,
  );
  const escaped = buildModelMarkdown(
    [
      {
        ...sample,
        label: { en: "Stage | label\nline", cs: "Krok" },
        defaultModel: "example/`model|id\nnext",
      },
    ],
    "en",
  );
  assert.ok(escaped.includes("Stage \\| label line"));
  assert.ok(escaped.includes("`example/model\\|id next`"));
});

test("every registered default and fallback model includes native origin flag emoji inside its code span", () => {
  const flag =
    /^(?:\p{Regional_Indicator}{2})(?: \p{Regional_Indicator}{2})*`/u;
  for (const { folder, definitions } of tools) {
    for (const stage of definitions) {
      for (const language of ["en", "cs"] as const) {
        const markdown = buildModelMarkdown([stage], language);
        for (const choice of [stage, ...stage.failureFallbackModels]) {
          const marker = `\`${choice.defaultModel} `;
          const position = markdown.indexOf(marker);
          assert.ok(position >= 0, `${folder}/${stage.stageId}: ${marker}`);
          assert.match(markdown.slice(position + marker.length), flag);
        }
        assert.doesNotMatch(markdown, /!\[|<img|<svg/);
      }
    }
  }
});

test("origin flags track actual configured developers, defaults and fallbacks in both languages", () => {
  const resolved = resolveModelDefinitions(
    [
      {
        ...sample,
        defaultModel: "mistralai/default",
        failureFallbackModels: [
          { defaultModel: "qwen/backup", environmentPrecedence: [] },
        ],
      },
    ],
    () => "openai/configured",
  );
  const origins = [
    ["anthropic/model", "🇺🇸"],
    ["black-forest-labs/model", "🇩🇪"],
    ["bytedance-seed/model", "🇨🇳"],
    ["google/model", "🇺🇸"],
    ["inclusionai/model", "🇨🇳"],
    ["mistral-ocr", "🇫🇷"],
    ["Tesseract.js / ces", "🇬🇧 🇺🇸"],
  ];
  for (const language of ["en", "cs"] as const) {
    const markdown = buildModelMarkdown(resolved, language);
    for (const [id, emoji] of [
      ["openai/configured", "🇺🇸"],
      ["mistralai/default", "🇫🇷"],
      ["qwen/backup", "🇨🇳"],
    ])
      assert.ok(markdown.includes(`\`${id} ${emoji}\``));
    for (const [id, emoji] of origins) {
      assert.ok(
        buildModelMarkdown(
          [
            {
              ...sample,
              defaultModel: id,
              failureFallbackModels: [],
            },
          ],
          language,
        ).includes(`\`${id} ${emoji}\``),
      );
    }
    for (const unknown of [
      "unknown/model",
      "constructor/model",
      "__proto__/model",
    ]) {
      const prose = buildModelMarkdown(
        [
          {
            ...sample,
            defaultModel: unknown,
            failureFallbackModels: [],
          },
        ],
        language,
      );
      assert.ok(prose.includes(`\`${unknown}\`.`));
      assert.doesNotMatch(prose, /\p{Regional_Indicator}/u);
    }
  }
});

test("every remote stage uses its owning definition in server selection rather than duplicated environment chains", async () => {
  for (const { folder, definitions } of tools) {
    const files = await sourceFiles(new URL(`app/_tools/${folder}/`, root));
    const selections: string[] = [];
    for (const file of files) {
      if (file.pathname.endsWith("/model-definitions.ts")) continue;
      const source = await readFile(file, "utf8");
      assert.doesNotMatch(
        source,
        /process\.env(?:\.[A-Z_]*MODEL\b|\[["'][A-Z_]*MODEL["']\])/,
        fileURLToPath(file),
      );
      if (!/\b(?:modelStages|modelDefinitions)\b/.test(source)) continue;
      const ownerImport = source.match(
        /import\s*\{[^}]*\b(?:modelStages|modelDefinitions)\b[^}]*\}\s*from\s*["']([^"']+)["']/,
      );
      assert.ok(ownerImport, fileURLToPath(file));
      assert.equal(
        new URL(ownerImport[1], file).href,
        new URL(`app/_tools/${folder}/model-definitions.ts`, root).href,
      );
      selections.push(source);
    }
    const source = selections.join("\n");
    if (!legacyAiFolders.includes(folder)) {
      assert.ok(
        selections.length,
        `${folder}: imports its own model definitions`,
      );
      assert.match(
        source,
        /resolveModel(?:Definitions)?\s*\(|\.defaultModel\b/,
        `${folder}: selects models from definitions`,
      );
      continue;
    }
    for (const stage of definitions) {
      if (stage.stageId === "local-ocr") {
        assert.deepEqual(stage.environmentPrecedence, []);
        assert.match(stage.defaultModel, /Tesseract/);
        continue;
      }
      const reference = stageReference(stage.stageId);
      assert.match(
        source,
        new RegExp(
          `(?:resolveModel\\(\\s*${reference}\\s*\\)|${reference}\\.defaultModel)`,
        ),
        `${folder}/${stage.stageId}`,
      );
    }
  }
  const layers = await read("app/_tools/image/layer-splitter/code/server.ts");
  assert.match(layers, /resolveFailureFallbackModels\(modelStages\.mask\)/);
  assert.match(
    layers,
    /resolveFailureFallbackModels\(modelStages\[["']subject-mask["']\]\)/,
  );
});

test("server-only guards remain intact and client components cannot import model configuration", async () => {
  assert.match(serverSource, boundary);
  assert.match(await read("app/_tools/generated/registry.models.ts"), boundary);
  assert.match(await read("app/_tools/info.ts"), boundary);
  assert.doesNotMatch(
    await read("app/_tools/models.ts"),
    /process\.env|server-only|models-server/,
  );
  for (const file of await sourceFiles(new URL("app/", root))) {
    const source = await readFile(file, "utf8");
    if (!/^\s*["']use client["'];/m.test(source)) continue;
    assert.doesNotMatch(
      source,
      /(?:import|export)[\s\S]*?from\s*["'][^"']*(?:models-server|registry\.models|model-definitions)[^"']*["']|import\(["'][^"']*(?:models-server|registry\.models|model-definitions)/,
      fileURLToPath(file),
    );
  }
});

test("generated server model mapping covers the registered tools without manual manifest imports", async () => {
  const generated = await read("app/_tools/generated/registry.models.ts");
  for (const tool of toolDefinitions) {
    const entry = generated.match(
      new RegExp(`"${tool.folder}":\\s*(models\\d+|\\[\\])`),
    );
    assert.ok(entry, tool.folder);
    if (
      tools.some(
        (owner) => owner.folder === tool.folder && owner.definitions.length,
      )
    ) {
      assert.notEqual(entry[1], "[]");
      assert.ok(
        generated.includes(
          `modelDefinitions as ${entry[1]} } from "../${tool.folder}/model-definitions"`,
        ),
      );
    } else assert.equal(entry[1], "[]");
    const manifest = await read(`app/_tools/${tool.folder}/manifest.ts`);
    assert.doesNotMatch(
      manifest,
      /model-definitions|models-server|registry\.models/,
    );
  }
});
