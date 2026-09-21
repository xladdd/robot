import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const server = await read("app/_tools/image/cover-generator/code/server.ts");
const planner = await read(
  "app/_tools/image/cover-generator/code/concept-plan.ts",
);
const types = await read("app/_tools/image/cover-generator/code/types.ts");
const imagePrompt = await read(
  "app/_tools/image/cover-generator/prompts/sketch.md",
);
const plannerPrompt = await read(
  "app/_tools/image/cover-generator/prompts/plan-concepts.md",
);
const interfaceSource = await read(
  "app/_tools/image/cover-generator/MainInterface.tsx",
);
const workspace = await read("app/Workspace.tsx");
const copy = await read("app/_tools/image/cover-generator/copy.ts");

const obsolete =
  /Shutterstock|shutterstock|flux\.2-pro|analyse-assets|prompts\/(?:asset|master)|production assets|separate stems|coverMedium|coverBrief|mediumInstruction|creativeDirectionLenses/i;

test("uses the approved low-cost image models and defaults to FLUX.2 Klein", () => {
  assert.match(
    server,
    /const DEFAULT_MODEL = "black-forest-labs\/flux\.2-klein-4b"/,
  );
  assert.match(
    server,
    /const GEMINI_MODEL = "google\/gemini-3\.1-flash-lite-image"/,
  );
  assert.match(server, /if \(value === undefined\) return DEFAULT_MODEL/);
  assert.doesNotMatch(server, obsolete);
});

test("uses Mistral Small 4 as a single vision-capable planner", () => {
  assert.match(
    planner,
    /COVER_PLANNER_MODEL = "mistralai\/mistral-small-2603"/,
  );
  assert.match(planner, /type: "image_url"/);
  assert.match(planner, /response_format/);
  assert.match(planner, /json_schema/);
  assert.match(planner, /max_tokens: 4_000/);
  assert.match(plannerPrompt, /both Czech and English/i);
  assert.match(
    plannerPrompt,
    /Reference covers are rough stylistic guidance only/i,
  );
});

test("requires structured audience and subject inputs while keeping keywords optional", () => {
  assert.match(server, /function parseAudience/);
  assert.match(server, /function parseSubject/);
  assert.match(server, /Choose an audience before generating/);
  assert.match(server, /Choose a subject before generating/);
  assert.match(server, /keywords = parseShortText/);
  assert.match(server, /subject === "other"/);
  assert.match(interfaceSource, /value=\{audience\}/);
  assert.match(interfaceSource, /value=\{subject\}/);
  assert.match(interfaceSource, /value=\{keywords\}/);
  assert.match(interfaceSource, /value="other"/);
});

test("exposes all four audiences and the planned subject vocabulary in both languages", () => {
  for (const value of [
    "preschool",
    "primary",
    "lower-secondary",
    "upper-secondary",
    "czech-language",
    "mathematics",
    "biology-natural-science",
    "other",
  ])
    assert.match(interfaceSource, new RegExp(`value="${value}"`));
  assert.match(copy, /audiencePreschool: "Preschool"/);
  assert.match(copy, /audiencePreschool: "Mateřské školy"/);
  assert.match(copy, /audienceUpperSecondary: "Upper-secondary school"/);
  assert.match(copy, /audienceUpperSecondary: "Střední školy"/);
});

test("removes the style dropdown and old medium prompt files from the active flow", () => {
  assert.doesNotMatch(
    interfaceSource,
    /CoverMedium|cover-medium|mediumMatch|mediumPhoto/,
  );
  assert.doesNotMatch(workspace, /coverMedium|onMedium|medium=/);
  assert.doesNotMatch(server, /medium|subjectInstruction|mediumInstruction/);
  assert.doesNotMatch(server, /input_references/);
});

test("keeps provider-specific image parameters and independent FLUX seeds", () => {
  assert.match(server, /resolution: "512"/);
  assert.match(server, /output_format: "jpeg"/);
  assert.match(server, /resolution: "1K"/);
  assert.match(server, /n: 1/);
  assert.match(server, /randomInt\(0, MAX_SEED\)/);
  assert.match(server, /new Set<number>\(\)/);
  assert.match(server, /model === DEFAULT_MODEL \? nextSeed\(usedSeeds\)/);
  assert.doesNotMatch(server, /let seedSequence/);
  assert.doesNotMatch(server, /seed: undefined/);
});

test("requires text-free, simple artwork and sends a different planned concept per image", () => {
  assert.match(imagePrompt, /IMAGE-ONLY COVER ARTWORK/);
  assert.match(imagePrompt, /Never generate readable text or text-like marks/);
  assert.match(imagePrompt, /Optional keywords are soft inspiration only/);
  assert.match(imagePrompt, /substantially different from other concepts/);
  assert.match(
    server,
    /plan\.concepts\.map\(\(concept\) => generateSketch\(concept\)\)/,
  );
  assert.match(server, /buildPrompt\(/);
  assert.match(types, /renderingApproach/);
  assert.match(types, /viewpoint/);
});

test("planner schema and normalization require exactly two or four unique concepts", () => {
  assert.match(planner, /minItems: count/);
  assert.match(planner, /maxItems: count/);
  assert.match(planner, /value\.length !== count/);
  assert.match(planner, /ids\.size === count/);
  assert.match(planner, /createFallbackCoverPlan/);
});

test("planner failure has a local fallback and preferred concepts are summarized, not reused", () => {
  assert.match(server, /createFallbackCoverPlan\(plannerInput\)/);
  assert.match(planner, /preferredImage/);
  assert.match(planner, /preferred earlier concept/);
  assert.match(planner, /Broad preference from the user/);
  assert.doesNotMatch(server, /direction\.image/);
});

test("keeps references optional and limits them to three planner inputs", () => {
  assert.match(server, /if \(value === undefined\) return \[\]/);
  assert.match(server, /A maximum of three reference images is allowed/);
  assert.match(interfaceSource, /references.length}\/3/);
  assert.doesNotMatch(server, /input_references/);
});

test("keeps bilingual short-input help and the existing centered dialog", () => {
  assert.match(interfaceSource, /cover-prompt-help/);
  assert.match(interfaceSource, /promptHelpTitle/);
  assert.match(copy, /How to get better cover concepts/);
  assert.match(copy, /Jak získat lepší návrhy obálek/);
  assert.match(interfaceSource, /role="dialog"/);
});

test("records planner guidance and concept metadata in exports", () => {
  assert.match(workspace, /planner: coverPlanner/);
  assert.match(workspace, /referenceGuidance/);
  assert.match(workspace, /item\.concept\.viewpoint/);
  assert.match(workspace, /item\.concept\.renderingApproach/);
  assert.match(workspace, /plannerCost/);
  assert.match(workspace, /audience: coverAudience/);
  assert.match(workspace, /keywords: coverKeywords/);
});
