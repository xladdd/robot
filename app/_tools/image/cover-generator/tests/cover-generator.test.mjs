import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const promptDir = new URL("app/_tools/image/cover-generator/prompts/", root);

const server = await read("app/_tools/image/cover-generator/code/server.ts");
const planner = await read(
  "app/_tools/image/cover-generator/code/concept-plan.ts",
);
const types = await read("app/_tools/image/cover-generator/code/types.ts");
const plannerPrompt = await read(
  "app/_tools/image/cover-generator/prompts/plan-concepts.md",
);
const interfaceSource = await read(
  "app/_tools/image/cover-generator/MainInterface.tsx",
);
const workspace = await read("app/Workspace.tsx");
const copy = await read("app/_tools/image/cover-generator/copy.ts");

test("keeps a single concise prompt template for image-ready concepts", async () => {
  assert.deepEqual(await readdir(promptDir), ["plan-concepts.md"]);
  assert.match(plannerPrompt, /FLUX\.2 Pro/);
  assert.match(plannerPrompt, /upper third clear of subjects and text/);
  assert.match(plannerPrompt, /one or two clearly named hero objects/);
  assert.match(plannerPrompt, /Prefer sparsity over complexity/);
  assert.match(plannerPrompt, /different directions/);
  assert.match(plannerPrompt, /80–150 words/);
  assert.match(plannerPrompt, /200 words/);
  assert.doesNotMatch(plannerPrompt, /40%|subject-specific templates for/);
});

test("uses Mistral Medium with Ministral fallback to write exactly 2 or 4 prompts", () => {
  assert.match(
    planner,
    /COVER_PLANNER_MODEL = "mistralai\/mistral-medium-3-5"/,
  );
  assert.match(
    planner,
    /COVER_PLANNER_FALLBACK_MODEL\s*=\s*"mistralai\/ministral-14b-2512"/,
  );
  assert.match(
    planner,
    /models: \[COVER_PLANNER_MODEL, COVER_PLANNER_FALLBACK_MODEL\]/,
  );
  assert.match(planner, /route: "fallback"/);
  assert.match(planner, /provider: \{ require_parameters: true \}/);
  assert.match(planner, /response_format/);
  assert.match(planner, /minItems: count/);
  assert.match(planner, /maxItems: count/);
  assert.match(planner, /prompts\.length !== count/);
  assert.match(planner, /prompt\.split\(\/\\s\+\/\)\.length > 200/);
  assert.match(planner, /new Set\(normalized\.map/);
  assert.match(planner, /type: "image_url"/);
  assert.match(planner, /School level:/);
  assert.match(planner, /Theme \/ keywords:/);
  assert.match(planner, /preferredImage/);
  assert.doesNotMatch(planner, /createFallbackCoverPlan|referenceGuidance/);
});

test("sends each prompt unchanged to the selected image model; no subject overrides", () => {
  assert.match(
    server,
    /const plan = await planCoverConcepts\(openRouter, plannerInput\)/,
  );
  assert.match(server, /concept\.prompt,/);
  assert.match(
    server,
    /plan\.concepts\.map\(\(concept\) => generateSketch\(concept\)\)/,
  );
  assert.doesNotMatch(
    server,
    /languageScene|withTopThirdClearance|buildPrompt|loadPrompt|createFallbackCoverPlan/,
  );
  assert.match(types, /prompt: string/);
  assert.doesNotMatch(types, /coreIdea|referenceGuidance/);
});

test("requires school level and subject and keeps references and keywords optional", () => {
  assert.match(server, /function parseAudience/);
  assert.match(server, /function parseSubject/);
  assert.match(server, /Choose an audience before generating/);
  assert.match(server, /Choose a subject before generating/);
  assert.match(server, /keywords = parseShortText/);
  assert.match(server, /subject === "other"/);
  assert.match(server, /A maximum of three reference images is allowed/);
  assert.match(interfaceSource, /value=\{audience\}/);
  assert.match(interfaceSource, /value=\{subject\}/);
  assert.match(interfaceSource, /value=\{keywords\}/);
  assert.match(interfaceSource, /references.length}\/3/);
  assert.match(copy, /How to get better cover concepts/);
  assert.match(copy, /Jak získat lepší návrhy obálek/);
});

test("offers FLUX.2 Pro by default and Gemini, but rejects Klein", () => {
  assert.match(server, /const DEFAULT_MODEL = FLUX_PRO_MODEL/);
  assert.match(server, /resolution: "1K"/);
  assert.match(server, /output_format: "jpeg"/);
  assert.match(server, /randomInt\(0, MAX_SEED\)/);
  assert.match(interfaceSource, /value="black-forest-labs\/flux\.2-pro"/);
  assert.match(interfaceSource, /value="google\/gemini-3\.1-flash-lite-image"/);
  assert.match(workspace, /"black-forest-labs\/flux\.2-pro"/);
  for (const source of [server, interfaceSource, copy])
    assert.doesNotMatch(source, /flux\.2-klein|modelFlux(?:Note)?:/);
});

test("exports the actual generated prompts with image metadata", () => {
  assert.match(workspace, /item\.concept\.prompt/);
  assert.match(workspace, /planner: coverPlanner/);
  assert.match(workspace, /plannerCost/);
  assert.match(workspace, /audience: coverAudience/);
  assert.doesNotMatch(workspace, /item\.concept\.coreIdea|referenceGuidance/);
});
