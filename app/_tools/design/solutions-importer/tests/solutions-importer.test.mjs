import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../../../", import.meta.url);

test("registers one Solutions Importer with one v2 extraction flow", async () => {
  const [workspace, registry, component] = await Promise.all([
    readFile(new URL("app/Workspace.tsx", root), "utf8"),
    readFile(new URL("app/_tools/registry.ts", root), "utf8"),
    readFile(
      new URL("app/_tools/design/solutions-importer/MainInterface.tsx", root),
      "utf8",
    ),
  ]);

  assert.match(workspace, /selected === "solutions"/);
  assert.match(
    workspace,
    /<SolutionsImporterMainInterface language=\{language\}/,
  );
  assert.doesNotMatch(workspace, /solutionsBeta|SolutionsBeta|SolutionsAlpha/);
  assert.equal((registry.match(/id: "solutions"/g) || []).length, 1);
  assert.match(registry, /folder: "design\/solutions-importer"/);
  assert.match(component, /indesign-solutions-v2/);
  assert.match(component, /\/solutions\/pyodide-worker\.js/);
});

test("ships one extractor and one mode-selecting InDesign importer", async () => {
  const [extractor, worker, importer, component, publicFiles] =
    await Promise.all([
      readFile(
        new URL(
          "app/_tools/design/solutions-importer/public/extract_solution_operations.py",
          root,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "app/_tools/design/solutions-importer/public/pyodide-worker.js",
          root,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "app/_tools/design/solutions-importer/public/import_solutions.jsx",
          root,
        ),
        "utf8",
      ),
      readFile(
        new URL("app/_tools/design/solutions-importer/MainInterface.tsx", root),
        "utf8",
      ),
      readdir(new URL("app/_tools/design/solutions-importer/public/", root)),
    ]);

  assert.match(extractor, /indesign-solutions-v2/);
  assert.match(extractor, /matching_page_geometries/);
  assert.match(extractor, /grouped_match/);
  assert.match(extractor, /comparison_text/);
  assert.match(extractor, /TrimBox/);
  assert.match(worker, /extract_solution_operations\.py/);
  assert.match(worker, /\/solutions\/extract_solution_operations\.py/);
  const pdfSource = await readFile(
    new URL("app/_tools/design/solutions-importer/code/pdf.ts", root),
    "utf8",
  );
  assert.match(pdfSource, /export function displayedBounds/);
  assert.match(pdfSource, /page\.view/);
  assert.match(pdfSource, /page\.rotate/);
  assert.deepEqual(publicFiles.sort(), [
    "extract_solution_operations.py",
    "import_solutions.jsx",
    "pyodide-worker.js",
  ]);
  assert.match(importer, /LAYER_NAME = "SOLUTIONS"/);
  assert.match(importer, /TEXT_STYLE_NAME = "Solutions"/);
  assert.match(importer, /indesign-solutions-v2/);
  assert.match(importer, /Noto Sans/);
  assert.match(importer, /function chooseImportMode/);
  assert.match(importer, /__SOLUTIONS_IMPORT_MODE__/);
  assert.match(importer, /function runSimpleImport/);
  assert.match(importer, /CELL_STYLE_NAME = "Cell Solutions"/);
  assert.match(importer, /collectAnswerBoxes/);
  assert.match(importer, /locateGridPlacement/);
  assert.match(importer, /function expandOperationGlyphs/);
  assert.match(importer, /getTableCopy/);
  assert.match(importer, /createContinuationFrame/);
  assert.match(
    importer,
    /If Advanced doesn't work as expected, undo the action and rerun the script in Simple mode\./,
  );

  assert.match(component, /\/solutions\/import_solutions\.jsx/);
  assert.doesNotMatch(
    component,
    /href="\/solutions\/import_solutions_(?:simple|advanced)\.jsx"/,
  );
  assert.match(component, /scriptChoice/);
});

test("canonical importer preserves verified Simple and Advanced modes", async () => {
  const experimental = await readFile(
    new URL(
      "app/_tools/design/solutions-importer/public/import_solutions.jsx",
      root,
    ),
    "utf8",
  );

  assert.match(
    experimental,
    /Advanced: use tables, answer boxes, and continuation alignment/,
  );
  assert.match(
    experimental,
    /Simple: place text directly at its PDF coordinates/,
  );
  assert.doesNotMatch(experimental, /Coming soon!/);
  assert.match(
    experimental,
    /If Advanced doesn't work as expected, undo the action and rerun the script in Simple mode\./,
  );
  assert.match(experimental, /function runAdvancedImport/);
  assert.match(experimental, /function runSimpleImport/);
  assert.match(experimental, /function createProgressPalette/);
  assert.match(experimental, /function updateProgress/);
  assert.match(experimental, /Solutions Simple:/);
  assert.match(experimental, /FRAME_STYLE_NAME = "Solutions No Stroke"/);
  assert.match(experimental, /function ensureNoStrokeObjectStyle/);
  assert.match(experimental, /style\.enableStroke = true/);
  assert.match(experimental, /style\.strokeWeight = "0 pt"/);
  assert.match(experimental, /function applyNoStrokeObjectStyle/);
  assert.match(experimental, /fillColor: noneSwatch/);
  assert.match(experimental, /strokeColor: noneSwatch/);
  assert.match(experimental, /strokeWeight: "0 pt"/);
  assert.match(experimental, /function verifyFrameAppearance/);
  assert.doesNotMatch(experimental, /var firstSwatch = doc\.swatches\[0\]/);

  const simpleStart = experimental.indexOf("function runSimpleImport");
  const simpleEnd = experimental.indexOf("function readJson", simpleStart);
  assert.notEqual(simpleStart, -1);
  assert.notEqual(simpleEnd, -1);
  const simpleImplementation = experimental.slice(simpleStart, simpleEnd);
  assert.doesNotMatch(simpleImplementation, /frame\.strokeWeight\s*=/);

  assert.match(experimental, /CELL_STYLE_NAME = "Cell Solutions"/);
  assert.match(experimental, /function collectTables/);
  assert.match(experimental, /function getTableCopy/);
  assert.match(experimental, /function locateGridPlacement/);
  assert.match(experimental, /function createContinuationFrame/);
});

test("normalizes PDF text bounds against non-zero page origins", async () => {
  const { displayedBounds } = await import(
    new URL("../code/pdf.ts", import.meta.url)
  );
  const view = [35, 35, 630, 877];
  const raw = { left: 50, right: 80, bottom: 750, top: 780 };

  assert.deepEqual(displayedBounds(raw, view, 0), {
    x0: 15,
    x1: 45,
    top: 97,
    bottom: 127,
  });
  assert.deepEqual(displayedBounds(raw, view, 90), {
    x0: 715,
    x1: 745,
    top: 15,
    bottom: 45,
  });
});

test("keeps the completed Solutions report compact by default", async () => {
  const [component, copy, styles] = await Promise.all([
    readFile(
      new URL("app/_tools/design/solutions-importer/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(
      new URL("app/_tools/design/solutions-importer/copy.ts", root),
      "utf8",
    ),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(
    component,
    /\[reviewExpanded, setReviewExpanded\] = useState\(false\)/,
  );
  assert.match(component, /aria-expanded=\{reviewExpanded\}/);
  assert.match(component, /aria-controls="solutions-report-details"/);
  assert.match(component, /<h2 className="solutions-detail-review-heading">/);

  const reportStart = component.indexOf("solutions-detail-review-head");
  const statsStart = component.indexOf("solutions-detail-stats", reportStart);
  const detailsStart = component.indexOf("{reviewExpanded &&", reportStart);
  const filterStart = component.indexOf("solutions-detail-filter", reportStart);
  const pagesStart = component.indexOf("solutions-detail-pages", reportStart);
  assert.ok(reportStart < statsStart && statsStart < detailsStart);
  assert.ok(detailsStart < filterStart && detailsStart < pagesStart);

  assert.match(
    component,
    /solutionPreviewFont\s*=\s*solutionFont === "Times New Roman" \? solutionFont : "Arial"/,
  );
  assert.match(component, /`\$\{sourceName\}_Solutions\.json`/);
  assert.match(
    component,
    /solutions-create\$\{analysisComplete \? " is-complete"/,
  );
  assert.match(
    component,
    /solutions-progress\$\{analysisComplete \? " is-complete"/,
  );
  assert.match(copy, /reviewHeading: "Solutions Report"/);
  assert.match(copy, /downloadJson: "Download JSON"/);
  assert.match(copy, /reviewHeading: "Přehled řešení"/);
  assert.match(copy, /downloadJson: "Stáhnout JSON"/);
  assert.match(
    styles,
    /solutions-console\s*\{\s*display:\s*flex;\s*max-height:\s*190px/,
  );
  assert.match(
    component,
    /analysisComplete \? "action-button-success" : "action-button-primary"/,
  );
  assert.match(
    styles,
    /solutions-progress\.is-complete \.solutions-console\s*\{\s*max-height:\s*95px/,
  );
});

test("Advanced importer expands grouped PDF text into grid-cell tokens", async () => {
  const advanced = await readFile(
    new URL(
      "app/_tools/design/solutions-importer/public/import_solutions.jsx",
      root,
    ),
    "utf8",
  );
  const blockStart = advanced.indexOf("function parseGridPrefix");
  const blockEnd = advanced.indexOf("function isQuestionLine", blockStart);
  assert.notEqual(blockStart, -1);
  assert.notEqual(blockEnd, -1);

  const parseGridPrefix = Function(
    `${advanced.slice(blockStart, blockEnd)}; return parseGridPrefix;`,
  )();
  const groupedGlyph = (text) => ({
    text,
    bounds: [100, 20, 112, 20 + text.length * 8],
  });

  assert.equal(
    parseGridPrefix({ glyphs: [groupedGlyph("92 - 75 = 17")] })
      .glyphs.map((glyph) => glyph.text)
      .join(""),
    "92-75=17",
  );
  assert.equal(
    parseGridPrefix({ glyphs: [groupedGlyph("× ÷ ± ≤ ≥ ≠ /")] })
      .glyphs.map((glyph) => glyph.text)
      .join(""),
    "×÷±≤≥≠/",
  );
  assert.deepEqual(
    parseGridPrefix({ glyphs: [groupedGlyph("multe")] }).glyphs,
    [],
  );
  assert.equal(
    parseGridPrefix({ glyphs: [groupedGlyph("A")] }).glyphs[0].text,
    "A",
  );
  assert.deepEqual(
    parseGridPrefix({ glyphs: [groupedGlyph("AB")] }).glyphs,
    [],
  );
  assert.equal(
    parseGridPrefix({
      glyphs: [
        { text: "A", bounds: [100, 20, 112, 28] },
        { text: "B", bounds: [100, 36, 112, 44] },
      ],
    })
      .glyphs.map((glyph) => glyph.text)
      .join(""),
    "AB",
  );
});
