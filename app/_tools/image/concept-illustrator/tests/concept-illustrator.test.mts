import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PROMPT_LENGTH,
  normalizeConceptBatch,
  normalizeImageDataUrl,
  normalizeImageReferences,
  normalizePrompt,
  normalizeReplacementConcept,
  normalizeStyle,
  parseAspectRatio,
} from "../code/contracts.ts";

const concepts = [
  {
    id: "concept-1",
    title: "Shared current",
    visual: "A river joins three distinct landscapes in one clear panorama.",
    meaning: "Shows how one idea connects otherwise separate domains.",
  },
  {
    id: "concept-2",
    title: "Layered evidence",
    visual: "An overhead desk scene arranges objects into a visible sequence.",
    meaning: "Makes the article's progression tangible and easy to follow.",
  },
  {
    id: "concept-3",
    title: "Changing scale",
    visual:
      "One small object expands into a detailed environment from left to right.",
    meaning:
      "Expresses the article's movement from detail to broader consequence.",
  },
];

test("accepts exactly three useful concepts", () => {
  assert.deepEqual(normalizeConceptBatch(concepts), concepts);
  assert.throws(() => normalizeConceptBatch(concepts.slice(0, 2)), /exactly 3/);
  assert.throws(
    () =>
      normalizeConceptBatch([...concepts, { ...concepts[0], id: "concept-4" }]),
    /exactly 3/,
  );
  assert.throws(
    () =>
      normalizeConceptBatch([
        { ...concepts[0], visual: "short" },
        ...concepts.slice(1),
      ]),
    /useful title, visual, and meaning/,
  );
});

test("rejects duplicate concept IDs and duplicate concept content", () => {
  assert.throws(
    () =>
      normalizeConceptBatch([
        concepts[0],
        { ...concepts[1], id: "concept-1" },
        concepts[2],
      ]),
    /IDs must be unique/,
  );
  assert.throws(
    () =>
      normalizeConceptBatch([
        concepts[0],
        concepts[1],
        { ...concepts[0], id: "new-id" },
      ]),
    /not duplicates/,
  );
});

test("normalizes one regenerated concept into its stable slot", () => {
  const candidate = {
    id: "model-invented-id",
    title: "A new direction",
    visual:
      "A cutaway room reveals cause and effect through three linked actions.",
    meaning: "Connects the article's causes to their visible consequences.",
  };
  assert.deepEqual(
    normalizeReplacementConcept(candidate, "concept-1", concepts.slice(1)),
    { ...candidate, id: "concept-1" },
  );
  assert.throws(
    () => normalizeReplacementConcept([candidate, candidate], "concept-1"),
    /exactly one replacement/,
  );
  assert.throws(
    () =>
      normalizeReplacementConcept(
        { ...concepts[1], id: "other" },
        "concept-1",
        concepts.slice(1),
      ),
    /duplicates another concept/,
  );
});

test("accepts only supported image aspect ratios", () => {
  for (const ratio of ["1:1", "4:3", "3:2", "16:9"] as const)
    assert.equal(parseAspectRatio(ratio), ratio);
  assert.throws(() => parseAspectRatio("3:4"), /aspectRatio/);
  assert.throws(() => parseAspectRatio(undefined), /aspectRatio/);
});

test("allows written house-style guidance to remain optional", () => {
  assert.equal(normalizeStyle(undefined), "");
  assert.equal(
    normalizeStyle("  cut paper   with muted colour "),
    "cut paper with muted colour",
  );
});

test("normalizes concise prompts and enforces their size limit", () => {
  assert.equal(
    normalizePrompt(
      "  Editorial   illustration\nwith a single red focal point.  ",
    ),
    "Editorial illustration with a single red focal point.",
  );
  assert.throws(() => normalizePrompt("tiny"), /useful concrete art direction/);
  assert.throws(
    () => normalizePrompt("x".repeat(MAX_PROMPT_LENGTH + 1)),
    /at most 2000 characters/,
  );
});

test("validates supported image data URLs and reference count", () => {
  const image = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(normalizeImageDataUrl(image), image);
  assert.deepEqual(normalizeImageReferences([image, image, image]), [
    image,
    image,
    image,
  ]);
  assert.throws(
    () => normalizeImageReferences([image, image, image, image]),
    /at most 3 images/,
  );
  assert.throws(
    () => normalizeImageDataUrl("data:image/gif;base64,R0lGODlh"),
    /PNG, JPEG, or WebP/,
  );
});
