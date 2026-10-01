import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  manifestSummary,
  validateAnalysedBlocks,
  validateMappings,
} from "../code/validation.ts";
import type {
  AnalysedBlock,
  TypesetterInventory,
  TypesetterSourceBlock,
} from "../types.ts";

const root = new URL("../../../../../", import.meta.url);
const inventory: TypesetterInventory = {
  filename: "template.idml",
  paragraphStyles: [
    { id: "body", name: "Body", path: "Text/Body" },
    { id: "heading", name: "Heading", path: "Headings/Heading" },
  ],
  characterStyles: [],
  objectStyles: [{ id: "image", name: "Image", path: "Production/Image" }],
  labels: ["typesetter:story:main"],
  layers: [],
  page: { width: 595, height: 842 },
};

const source: TypesetterSourceBlock[] = [
  {
    id: "block-00001",
    order: 0,
    text: "Chapter one",
    kind: "paragraph",
    sourceStyle: null,
    listLevel: null,
    tableId: null,
    imageDescription: null,
  },
];

test("validates inventory-backed Typesetter mappings", () => {
  assert.deepEqual(
    validateMappings(
      ["body", "image.request"],
      {
        body: { paragraphStyle: "Text/Body" },
        "image.request": {
          paragraphStyle: "Text/Body",
          objectStyle: "Production/Image",
        },
      },
      inventory,
    ),
    [],
  );
  assert.match(
    validateMappings(
      ["body"],
      { body: { paragraphStyle: "Missing" } },
      inventory,
    )[0],
    /no longer exists/,
  );
});

test("rejects changed or reordered AI manuscript output", () => {
  const analysed: AnalysedBlock[] = [
    {
      ...source[0],
      role: "heading.chapter",
      confidence: 0.9,
      warning: null,
      imagePrompt: null,
      reviewed: true,
    },
  ];
  assert.deepEqual(
    validateAnalysedBlocks(source, analysed, ["heading.chapter"]),
    [],
  );
  assert.match(
    validateAnalysedBlocks(
      source,
      [{ ...analysed[0], text: "Rewritten" }],
      ["heading.chapter"],
    )[0],
    /changed/,
  );
});

test("counts unresolved review items deterministically", () => {
  const blocks: AnalysedBlock[] = [
    {
      ...source[0],
      role: "body",
      confidence: 0.98,
      warning: null,
      imagePrompt: null,
      reviewed: true,
    },
    {
      ...source[0],
      id: "block-00002",
      order: 1,
      role: "unsupported",
      confidence: 0.4,
      warning: "Table row",
      imagePrompt: null,
      reviewed: false,
    },
  ];
  assert.deepEqual(manifestSummary(blocks), {
    blocks: 2,
    imageRequests: 0,
    lowConfidence: 1,
    unsupported: 1,
    unresolved: 1,
  });
});

test("uses the Solutions Importer library-app archetype", async () => {
  const [component, styles] = await Promise.all([
    readFile(
      new URL("app/_tools/design/typesetter/MainInterface.tsx", root),
      "utf8",
    ),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(
    component,
    /solutions-module solutions-detail-module typesetter-module/,
  );
  assert.match(component, /className="solutions-generator"/);
  assert.match(
    component,
    /className="solutions-detail-review typesetter-review"/,
  );
  assert.match(
    component,
    /className="library-guide solutions-guide typesetter-guide"/,
  );
  assert.doesNotMatch(component, /typesetter-stepper/);
  assert.match(component, /className="typesetter-guide-progress"/);
  assert.match(component, /className="typesetter-progress-cards"/);
  assert.match(component, /aria-current=/);
  assert.match(
    component,
    /className="action-button"\s+href="\/typesetter\/import_typesetter\.jsx"/,
  );
  assert.doesNotMatch(
    component,
    /className="action-button action-button-success"\s+href="\/typesetter\/import_typesetter\.jsx"/,
  );
  assert.ok(
    component.indexOf('className="typesetter-guide-progress"') >
      component.indexOf("</details>"),
    "progress cards must remain outside and below the import-guide roll-down",
  );
  assert.match(
    styles,
    /\.solutions-module,\s*\.buffet-module\s*{\s*inset: var\(--wide-app-gutter\) 0 0;/,
  );
  assert.doesNotMatch(styles, /\.solutions-detail-module\s*{[^}]*width:/s);
  assert.match(styles, /\.solutions-downloads\s*{\s*display: grid;\s*}/);
});

test("ships local extraction and an unanchored InDesign importer", async () => {
  const [worker, extractor, importer] = await Promise.all([
    readFile(
      new URL("app/_tools/design/typesetter/public/pyodide-worker.js", root),
      "utf8",
    ),
    readFile(
      new URL(
        "app/_tools/design/typesetter/public/extract_typesetter.py",
        root,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "app/_tools/design/typesetter/public/import_typesetter.jsx",
        root,
      ),
      "utf8",
    ),
  ]);
  assert.match(worker, /\/typesetter\/extract_typesetter\.py/);
  assert.match(extractor, /word\/document\.xml/);
  assert.match(extractor, /Resources\/Styles\.xml/);
  assert.match(importer, /typesetter:story:main/);
  assert.match(importer, /IMAGE REQUESTS/);
  assert.match(importer, /UndoModes\.ENTIRE_SCRIPT/);
  assert.doesNotMatch(importer, /anchoredObjectSettings|anchoredObject/);
});
