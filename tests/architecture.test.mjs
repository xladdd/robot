import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("uses the standard local Next.js runtime", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
  );

  assert.equal(packageJson.scripts.dev, "next dev");
  assert.equal(packageJson.scripts.build, "next build --webpack");
  assert.equal(packageJson.devDependencies.vinext, undefined);
  assert.equal(packageJson.devDependencies.wrangler, undefined);
  assert.equal(packageJson.devDependencies.vite, undefined);
  assert.equal(packageJson.devDependencies.tailwindcss, undefined);
  assert.equal(packageJson.devDependencies["@tailwindcss/postcss"], undefined);
});

test("keeps one repository copy of the Cliopatria timeline", async () => {
  const appDataset = new URL(
    "app/_tools/image/map-generator/code/data/cliopatria-timeline.json",
    root,
  );
  const oldDataset = new URL("app/data/cliopatria-timeline.json", root);
  const route = await readFile(
    new URL("app/api/maps/timeline/route.ts", root),
    "utf8",
  );

  await access(appDataset);
  await assert.rejects(access(oldDataset));
  assert.match(route, /map-generator\/code\/timeline-server/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(route, /export \{[^}]*dynamic/);
});

test("loads the retained Cliopatria data from its single repository location", async () => {
  const { loadCliopatriaTimeline } =
    await import("../app/_tools/image/map-generator/code/cliopatria.ts");
  const timeline = await loadCliopatriaTimeline();

  assert.ok(Object.keys(timeline).length > 0);
});

test("keeps static content outside the main page component", async () => {
  const [workspace, ui, registry, englishManual, czechManual] =
    await Promise.all([
      readFile(new URL("app/Workspace.tsx", root), "utf8"),
      readFile(new URL("app/content/ui.ts", root), "utf8"),
      readFile(new URL("app/_tools/registry.ts", root), "utf8"),
      readFile(new URL("app/_tools/design-manual/manual.en.md", root), "utf8"),
      readFile(new URL("app/_tools/design-manual/manual.cs.md", root), "utf8"),
    ]);

  assert.match(workspace, /from ["']\.\/content\/ui["']/);
  assert.match(workspace, /ManualContent/);
  assert.doesNotMatch(workspace, /const copy =/);
  assert.match(ui, /export const copy =/);
  assert.match(registry, /design\/solutions-importer/);
  assert.match(registry, /design\/script-buffet/);
  assert.doesNotMatch(
    registry,
    /solutions-importer-alpha|solutions-importer-beta|solutionsBeta/,
  );
  assert.match(englishManual, /^# Introduction/m);
  assert.match(czechManual, /^# Úvod/m);
});

test("keeps figure handlers and compatibility dispatch in their owning apps", async () => {
  const [compatibilityRoute, graphRoute, diagramRoute, mapRoute, packageJson] =
    await Promise.all([
      readFile(new URL("app/api/figures/route.ts", root), "utf8"),
      readFile(new URL("app/api/graphs/route.ts", root), "utf8"),
      readFile(new URL("app/api/diagrams/route.ts", root), "utf8"),
      readFile(new URL("app/api/maps/generate/route.ts", root), "utf8"),
      readFile(new URL("package.json", root), "utf8"),
    ]);

  assert.match(compatibilityRoute, /graph-generator\/code\/server/);
  assert.match(compatibilityRoute, /diagram-generator\/code\/server/);
  assert.match(compatibilityRoute, /map-generator\/code\/generate-server/);
  assert.match(compatibilityRoute, /: generateGraph/);
  assert.match(compatibilityRoute, /body\.mode === "diagram"/);
  assert.match(compatibilityRoute, /body\.mode === "map"/);
  assert.match(graphRoute, /graph-generator\/code\/server/);
  assert.match(diagramRoute, /diagram-generator\/code\/server/);
  assert.match(mapRoute, /map-generator\/code\/generate-server/);
  assert.doesNotMatch(packageJson, /image\/shared/);
});

test("keeps app interface markup out of the shared workspace shell", async () => {
  const [
    workspace,
    manual,
    textExtractor,
    indexCreator,
    promptExtractor,
    coverGenerator,
    graphGenerator,
    diagramGenerator,
    mapGenerator,
  ] = await Promise.all([
    readFile(new URL("app/Workspace.tsx", root), "utf8"),
    readFile(
      new URL("app/_tools/design-manual/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/text/text-extractor/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/text/index-creator/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/design/prompt-extractor/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/cover-generator/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/graph-generator/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/diagram-generator/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/map-generator/MainInterface.tsx", root),
      "utf8",
    ),
  ]);

  for (const componentName of [
    "DesignManualMainInterface",
    "TextExtractorMainInterface",
    "IndexCreatorMainInterface",
    "PromptExtractorMainInterface",
    "CoverGeneratorMainInterface",
    "GraphMainInterface",
    "DiagramMainInterface",
    "MapMainInterface",
  ]) {
    assert.match(workspace, new RegExp(`<${componentName}`));
  }
  for (const className of [
    "manual-docs",
    "extraction-module",
    "index-module",
    "prompt-module",
    "cover-module",
    "figure-module",
  ]) {
    assert.doesNotMatch(workspace, new RegExp(className));
  }
  assert.match(manual, /className="manual-docs"/);
  assert.match(textExtractor, /extraction-module/);
  assert.match(indexCreator, /index-module/);
  assert.match(promptExtractor, /prompt-module/);
  assert.match(coverGenerator, /className="cover-module"/);
  assert.match(graphGenerator, /figure-module/);
  assert.match(diagramGenerator, /figure-module/);
  assert.match(mapGenerator, /map-module/);
});

test("parses Design Manual Markdown into the existing chapter view", async () => {
  const [{ loadDesignManual }, page] = await Promise.all([
    import("../app/_tools/design-manual/parse.ts"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  const [english, czech] = await Promise.all([
    loadDesignManual("en"),
    loadDesignManual("cs"),
  ]);

  assert.deepEqual(
    english.chapters.map(({ title }) => title),
    ["Introduction", "Typesetting", "Exporting and saving data", "Editors"],
  );
  assert.ok(czech.chapters.some(({ title }) => title === "Redaktoři"));
  assert.ok(
    english.chapters
      .flatMap(({ blocks }) => blocks)
      .some(({ images }) =>
        images?.includes("/design-manual/media/image1.png"),
      ),
  );
  assert.match(page, /loadDesignManual/);
});

test("uses each app's Markdown files as the info-drawer source", async () => {
  const [page, workspace, loader, englishInfo] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/Workspace.tsx", root), "utf8"),
    readFile(new URL("app/_tools/info.ts", root), "utf8"),
    readFile(
      new URL("app/_tools/text/text-extractor/info.en.md", root),
      "utf8",
    ),
  ]);

  assert.match(page, /loadInfoDrawers/);
  assert.match(workspace, /<ReactMarkdown>\{help\}<\/ReactMarkdown>/);
  assert.match(loader, /info\.\$\{language\}\.md/);
  assert.match(englishInfo, /What is this\?/);
});

test("keeps OpenRouter instructions in app-owned Markdown files", async () => {
  const [
    loader,
    ocrServer,
    ocrPrompt,
    coverServer,
    coverPrompt,
    graphServer,
    diagramServer,
    mapServer,
    mapPrompt,
  ] = await Promise.all([
    readFile(new URL("app/_tools/load-prompt.ts", root), "utf8"),
    readFile(
      new URL("app/_tools/text/text-extractor/code/ocr-server.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/text/text-extractor/prompts/transcription.md", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/cover-generator/code/server.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/cover-generator/prompts/sketch.md", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/graph-generator/code/server.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/diagram-generator/code/server.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/map-generator/code/generate-server.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/map-generator/prompts/system.md", root),
      "utf8",
    ),
  ]);

  assert.match(loader, /readFileSync/);
  assert.match(
    ocrServer,
    /loadPrompt\("text\/text-extractor\/prompts\/transcription\.md"\)/,
  );
  assert.match(ocrPrompt, /literal OCR transcription engine/);
  assert.match(coverServer, /cover-generator\/prompts\/sketch\.md/);
  assert.match(coverPrompt, /IMAGE-ONLY COVER ARTWORK/);
  assert.match(graphServer, /graph-generator\/prompts\/system\.md/);
  assert.match(diagramServer, /diagram-generator\/prompts\/system\.md/);
  assert.match(mapServer, /map-generator\/prompts\/system\.md/);
  assert.match(mapPrompt, /longitude\/latitude coordinates/);
});

test("ships Script Buffet and repeatable Design Manual PDF exports", async () => {
  const [workspace, buffet, packageJson, exporter, changelog] =
    await Promise.all([
      readFile(new URL("app/Workspace.tsx", root), "utf8"),
      readFile(
        new URL("app/_tools/design/script-buffet/MainInterface.tsx", root),
        "utf8",
      ),
      readFile(new URL("package.json", root), "utf8"),
      readFile(
        new URL("app/_tools/design-manual/scripts/export-pdf.mjs", root),
        "utf8",
      ),
      readFile(new URL("app/_tools/design-manual/changelog.md", root), "utf8"),
    ]);

  assert.match(workspace, /<ScriptBuffetMainInterface language=\{language\}/);
  assert.match(buffet, /className="buffet-grid"/);
  assert.match(buffet, /indesign|illustrator|photoshop/);
  assert.match(packageJson, /manual:pdf/);
  assert.match(exporter, /changelog\.md/);
  assert.match(changelog, /^# Changelog/m);
});
