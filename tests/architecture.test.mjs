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

test("traces runtime Markdown into the deployed page bundle", async () => {
  const { default: nextConfig } = await import("../next.config.ts");
  const pageIncludes = nextConfig.outputFileTracingIncludes?.["/"];

  assert.ok(pageIncludes?.includes("./app/_tools/**/info.*.md"));
  assert.ok(pageIncludes?.includes("./app/_tools/design-manual/manual.*.md"));
});

test("loads browser PDF.js lazily instead of during server rendering", async () => {
  const paths = [
    "app/_tools/design/cover-splitter/code/pdf-preview.ts",
    "app/_tools/design/solutions-importer/code/pdf.ts",
    "app/_tools/text/index-creator/code/local-ocr.ts",
    "app/_tools/text/index-creator/code/pdf-indexer.ts",
    "app/_tools/text/prompt-extractor/code/pdf-images.ts",
  ];
  const [loader, ...consumers] = await Promise.all([
    readFile(new URL("app/_tools/load-pdfjs.ts", root), "utf8"),
    ...paths.map((path) => readFile(new URL(path, root), "utf8")),
  ]);

  assert.match(loader, /import\("pdfjs-dist\/legacy\/build\/pdf\.mjs"\)/);
  for (const source of consumers) {
    assert.match(source, /loadPdfJs/);
    assert.doesNotMatch(source, /from ["']pdfjs-dist/);
  }
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
  assert.match(englishManual, /^# Basics/m);
  assert.match(czechManual, /^# Základy/m);
});

test("keeps figure handlers and compatibility dispatch in their owning apps", async () => {
  const [
    compatibilityRoute,
    graphRoute,
    diagramRoute,
    mapRoute,
    diagramServer,
    legacyDiagramServer,
    packageJson,
  ] = await Promise.all([
    readFile(new URL("app/api/figures/route.ts", root), "utf8"),
    readFile(new URL("app/api/graphs/route.ts", root), "utf8"),
    readFile(new URL("app/api/diagrams/route.ts", root), "utf8"),
    readFile(new URL("app/api/maps/generate/route.ts", root), "utf8"),
    readFile(
      new URL("app/_tools/image/diagram-generator/code/server.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/diagram-generator/code/legacy-server.ts", root),
      "utf8",
    ),
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
  assert.match(diagramServer, /legacyDiagramPost\(legacyRequest\)/);
  assert.match(legacyDiagramServer, /validateDiagramSpec/);
  assert.match(legacyDiagramServer, /renderDiagramSvg/);
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
    imageGenerator,
    conceptIllustrator,
    graphGenerator,
    diagramGenerator,
    mapGenerator,
    typesetter,
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
      new URL("app/_tools/text/prompt-extractor/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/cover-generator/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/image-generator/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/concept-illustrator/MainInterface.tsx", root),
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
    readFile(
      new URL("app/_tools/design/typesetter/MainInterface.tsx", root),
      "utf8",
    ),
  ]);

  for (const componentName of [
    "DesignManualMainInterface",
    "TextExtractorMainInterface",
    "IndexCreatorMainInterface",
    "PromptExtractorMainInterface",
    "CoverGeneratorMainInterface",
    "ImageGeneratorMainInterface",
    "ConceptIllustratorMainInterface",
    "GraphMainInterface",
    "DiagramMainInterface",
    "MapMainInterface",
    "TypesetterMainInterface",
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
  assert.match(imageGenerator, /image-generator-module/);
  assert.match(imageGenerator, /if \(!active\) return null/);
  assert.doesNotMatch(imageGenerator, /hidden=\{!active\}/);
  assert.match(conceptIllustrator, /concept-illustrator-module/);
  assert.match(conceptIllustrator, /if \(!active\) return null/);
  assert.doesNotMatch(conceptIllustrator, /hidden=\{!active\}/);
  assert.match(
    graphGenerator,
    /cover-module visual-single-module graph-module/,
  );
  assert.match(
    diagramGenerator,
    /cover-module visual-single-module diagram-module/,
  );
  assert.match(mapGenerator, /map-module/);
  assert.match(typesetter, /typesetter-module/);
});

test("opens text document tools directly in their main workspaces", async () => {
  const [registry, textExtractor, indexCreator, promptExtractor] =
    await Promise.all([
      readFile(new URL("app/_tools/registry.ts", root), "utf8"),
      readFile(
        new URL("app/_tools/text/text-extractor/MainInterface.tsx", root),
        "utf8",
      ),
      readFile(
        new URL("app/_tools/text/index-creator/MainInterface.tsx", root),
        "utf8",
      ),
      readFile(
        new URL("app/_tools/text/prompt-extractor/MainInterface.tsx", root),
        "utf8",
      ),
    ]);

  assert.match(
    registry,
    /id: "prompt",\s+category: "text",\s+folder: "text\/prompt-extractor"/,
  );
  assert.match(textExtractor, /className="extraction-module has-source"/);
  assert.match(textExtractor, /document-active-head document-app-head/);
  assert.match(indexCreator, /document-active-head document-app-head/);
  assert.ok(
    textExtractor.indexOf("extraction-source-pane") <
      textExtractor.indexOf("extraction-side-column"),
  );
  assert.ok(
    textExtractor.indexOf("extraction-head") <
      textExtractor.indexOf("extraction-text-pane") &&
      textExtractor.indexOf("extraction-text-pane") <
        textExtractor.indexOf("correction-box"),
  );
  assert.match(indexCreator, /className="index-module has-file"/);
  assert.match(promptExtractor, /className="prompt-module has-file"/);
  assert.match(promptExtractor, /document-active-head document-app-head/);
  assert.doesNotMatch(promptExtractor, /PDF → TXT|progress/);
  for (const source of [textExtractor, indexCreator, promptExtractor]) {
    assert.match(
      source,
      /<CrosshairInstruction>\{t\.emptySource\}<\/CrosshairInstruction>/,
    );
    assert.match(source, /text-workbench-crosshair-button/);
  }
  assert.doesNotMatch(textExtractor, /\{sourceKind &&/);
  assert.doesNotMatch(indexCreator, /\{!file \?/);
  assert.doesNotMatch(promptExtractor, /\{!file \?/);
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
    ["Basics", "Typesetting", "Exporting and saving data", "Editors"],
  );
  assert.ok(czech.chapters.some(({ title }) => title === "Redaktoři"));
  assert.ok(
    english.chapters
      .flatMap(({ blocks }) => blocks)
      .some(({ images }) =>
        images?.includes("/design-manual/media/solutions-off.png"),
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
    coverPlanner,
    coverPrompt,
    graphServer,
    diagramServer,
    mapServer,
    mapPrompt,
    typesetterServer,
    typesetterPrompt,
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
      new URL("app/_tools/image/cover-generator/code/concept-plan.ts", root),
      "utf8",
    ),
    readFile(
      new URL(
        "app/_tools/image/cover-generator/prompts/plan-concepts.md",
        root,
      ),
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
    readFile(
      new URL("app/_tools/design/typesetter/code/server.ts", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/design/typesetter/prompts/classify.md", root),
      "utf8",
    ),
  ]);

  assert.match(loader, /readFileSync/);
  assert.match(
    ocrServer,
    /loadPrompt\(\s*"text\/text-extractor\/prompts\/transcription\.md"\s*,?\s*\)/,
  );
  assert.match(ocrPrompt, /literal OCR transcription engine/);
  assert.match(coverPlanner, /cover-generator\/prompts\/plan-concepts\.md/);
  assert.match(coverPrompt, /FLUX\.2 Pro textbook cover artwork/);
  assert.match(coverPrompt, /upper third clear of subjects and text/);
  assert.match(graphServer, /graph-generator\/prompts\/system\.md/);
  assert.match(
    diagramServer,
    /diagram-generator\/prompts\/(?:create-brief|reconstruct-vector)\.md/,
  );
  assert.match(mapServer, /status:\s*410/);
  assert.match(mapServer, /local-only/);
  assert.doesNotMatch(mapServer, /loadPrompt|requestOpenRouter/);
  assert.match(mapPrompt, /longitude\/latitude coordinates/);
  assert.match(typesetterServer, /typesetter\/prompts\/classify\.md/);
  assert.match(typesetterPrompt, /Never rewrite, correct, translate/);
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
  assert.match(buffet, /Make Silhouette Fill/);
  assert.match(buffet, /Opacity Set/);
  assert.match(buffet, /Split Text Frames into Characters/);
  assert.doesNotMatch(buffet, /Solutions Importer: (Simple|Advanced)/);
  await Promise.all(
    [
      "Make Silhouette Fill.jsx",
      "Opacity Set.jsx",
      "Split Text Frames into Characters.jsx",
    ].map((name) =>
      access(new URL(`app/_tools/design/script-buffet/public/${name}`, root)),
    ),
  );
  assert.match(packageJson, /manual:pdf/);
  assert.match(exporter, /changelog\.md/);
  assert.match(changelog, /^# Changelog/m);
});

test("uses one explicit processing badge across tool interfaces", async () => {
  const chrome = await readFile(
    new URL("app/_components/ToolChrome.tsx", root),
    "utf8",
  );
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(chrome, /AI ENABLED/);
  assert.match(chrome, /PROCESSED LOCALLY/);
  assert.match(chrome, /AI AKTIVNÍ/);
  assert.match(chrome, /ZPRACOVÁNO MÍSTNĚ/);
  assert.match(chrome, /processing-badge-\$\{mode\}/);
  assert.match(chrome, /export function ToolMeta/);
  assert.match(css, /\.processing-badge\s*\{[^}]*font-weight:\s*400/s);

  const classifications = {
    ai: [
      "text/text-extractor",
      "text/index-creator",
      "image/diagram-generator",
      "image/graph-generator",
      "image/image-generator",
      "image/cover-generator",
      "image/layer-splitter",
      "design/grep-builder",
      "design/typesetter",
      "text/prompt-extractor",
    ],
    local: [
      "image/map-generator",
      "design/cover-splitter",
      "design/solutions-importer",
      "design/script-buffet",
      "design/barcode-generator",
    ],
  };

  for (const [mode, apps] of Object.entries(classifications)) {
    for (const app of apps) {
      const source = await readFile(
        new URL(`app/_tools/${app}/MainInterface.tsx`, root),
        "utf8",
      );
      assert.match(source, new RegExp(`mode=["']${mode}["']`), app);
    }
  }
});

test("keeps one app-title scale and inline GREP results", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  const grep = await readFile(
    new URL("app/_tools/design/grep-builder/MainInterface.tsx", root),
    "utf8",
  );

  assert.match(
    css,
    /\.buffet-header h1,[\s\S]*font-size:\s*clamp\(32px, 4vw, 52px\)/,
  );
  assert.match(grep, /result\?\.findWhat \?\? props\.findPrompt/);
  assert.match(
    grep,
    /onClick=\{result \? props\.onReset : props\.onGenerate\}/,
  );
});

test("keeps the documented document and visual workspace families", async () => {
  const [
    cover,
    image,
    splitter,
    map,
    barcode,
    graph,
    diagram,
    index,
    prompt,
    css,
  ] = await Promise.all([
    readFile(
      new URL("app/_tools/image/cover-generator/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/image-generator/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/design/cover-splitter/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/image/map-generator/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/design/barcode-generator/MainInterface.tsx", root),
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
      new URL("app/_tools/text/index-creator/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/text/prompt-extractor/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(splitter, /cover-stage-head cover-splitter-active-head/);
  for (const source of [cover, image, splitter]) {
    assert.match(source, /visual-multiple-grid/);
    assert.match(source, /visual-multiple-card/);
  }
  assert.match(
    image,
    /setJobs\(\(current\) => \[\.\.\.current, \.\.\.nextJobs\]\)/,
  );
  assert.doesNotMatch(image, /setJobs\(nextJobs\)/);
  assert.match(
    css,
    /\.visual-multiple-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/,
  );
  for (const source of [cover, splitter, map]) {
    assert.match(source, /editor-sidebar/);
  }
  assert.doesNotMatch(splitter, /ToolHeader/);
  assert.doesNotMatch(map, /ToolHeader/);
  assert.match(cover, /cover-toolbar-exports/);
  for (const source of [barcode, graph, diagram]) {
    assert.match(source, /cover-module visual-single-module/);
    assert.match(source, /cover-stage visual-single-stage/);
    assert.match(source, /cover-toolbar editor-sidebar visual-single-toolbar/);
    assert.match(source, /className="pane-label"/);
  }
  for (const source of [barcode, graph])
    assert.match(source, /1000 × 700 \/ SVG 1\.1/);
  assert.match(diagram, /1000 × 750 \/ SVG 1\.1/);
  assert.match(graph, /cover-toolbar-exports/);
  assert.match(diagram, /cover-toolbar-exports/);
  for (const source of [index, prompt]) {
    assert.match(source, /document-active-workspace/);
  }
  assert.doesNotMatch(css, /\.prompt-active-head div > span/);
  assert.ok(
    barcode.indexOf("barcode-preview-card") <
      barcode.indexOf("barcode-controls"),
  );
  assert.match(css, /--wide-app-width:\s*1160px/);
  assert.match(css, /calc\(\(100% - var\(--wide-app-width\)\) \/ 2\)/);
  assert.match(
    css,
    /\.solutions-module,\s*\n\.buffet-module\s*\{[^}]*var\(--wide-app-width\)/s,
  );
  assert.match(
    css,
    /grid-template-columns:\s*minmax\(0, 2fr\) minmax\(300px, 1fr\)/,
  );
  assert.match(
    css,
    /\.figure-result,[\s\S]{0,240}\.solutions-detail-review\s*\{\s*box-shadow:\s*none/s,
  );
  assert.match(
    css,
    /\.cover-toolbar\.editor-sidebar\s*\{[^}]*box-shadow:\s*5px 5px 0 var\(--ink\)/s,
  );
  assert.match(css, /\.visual-single-toolbar\.editor-sidebar/);
  assert.match(
    css,
    /\.visual-single-stage > \.cover-stage-head\.tool-header\s*\{[^}]*padding:\s*7px 0 0;[^}]*border:\s*0;/s,
  );
});
