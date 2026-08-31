import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../../../", import.meta.url);

test("registers one Solutions Importer with one v2 extraction flow", async () => {
  const [workspace, registry, component] = await Promise.all([
    readFile(new URL("app/Workspace.tsx", root), "utf8"),
    readFile(new URL("app/_tools/registry.ts", root), "utf8"),
    readFile(new URL("app/_tools/design/solutions-importer/MainInterface.tsx", root), "utf8"),
  ]);

  assert.match(workspace, /selected === "solutions"/);
  assert.match(workspace, /<SolutionsImporterMainInterface language=\{language\}/);
  assert.doesNotMatch(workspace, /solutionsBeta|SolutionsBeta|SolutionsAlpha/);
  assert.equal((registry.match(/id: "solutions"/g) || []).length, 1);
  assert.match(registry, /folder: "design\/solutions-importer"/);
  assert.match(component, /indesign-solutions-v2/);
  assert.match(component, /\/solutions\/pyodide-worker\.js/);
});

test("ships one extractor and Simple and Advanced InDesign scripts for the same format", async () => {
  const [extractor, worker, simple, advanced, component] = await Promise.all([
    readFile(new URL("app/_tools/design/solutions-importer/public/extract_solution_operations.py", root), "utf8"),
    readFile(new URL("app/_tools/design/solutions-importer/public/pyodide-worker.js", root), "utf8"),
    readFile(new URL("app/_tools/design/solutions-importer/public/import_solutions_simple.jsx", root), "utf8"),
    readFile(new URL("app/_tools/design/solutions-importer/public/import_solutions_advanced.jsx", root), "utf8"),
    readFile(new URL("app/_tools/design/solutions-importer/MainInterface.tsx", root), "utf8"),
  ]);

  assert.match(extractor, /indesign-solutions-v2/);
  assert.match(extractor, /matching_page_geometries/);
  assert.match(extractor, /TrimBox/);
  assert.match(worker, /extract_solution_operations\.py/);
  assert.match(worker, /\/solutions\/extract_solution_operations\.py/);
  for (const importer of [simple, advanced]) {
    assert.match(importer, /LAYER_NAME = "SOLUTIONS"/);
    assert.match(importer, /TEXT_STYLE_NAME = "Solutions"/);
    assert.match(importer, /indesign-solutions-v2/);
    assert.match(importer, /Noto Sans/);
  }
  assert.match(simple, /failsafe importer/);
  assert.match(simple, /page\.textFrames\.add/);
  assert.doesNotMatch(simple, /locateGridPlacement|getTableCopy/);
  assert.match(advanced, /CELL_STYLE_NAME = "Cell Solutions"/);
  assert.match(advanced, /collectAnswerBoxes/);
  assert.match(advanced, /locateGridPlacement/);
  assert.match(advanced, /getTableCopy/);
  assert.match(advanced, /createContinuationFrame/);
  assert.match(component, /import_solutions_simple\.jsx/);
  assert.match(component, /import_solutions_advanced\.jsx/);
  assert.match(component, /scriptChoice/);
});
