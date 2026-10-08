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
const styles = await read("app/globals.css");

test("defines one structured concept prompt template with positive spatial invariants", async () => {
  assert.deepEqual(await readdir(promptDir), ["plan-concepts.md"]);
  assert.match(plannerPrompt, /FLUX\.2 Pro/);
  assert.match(plannerPrompt, /concept objects/);
  assert.match(plannerPrompt, /one or two hero_subjects/);
  assert.match(plannerPrompt, /zero, one, or two supporting_objects/);
  assert.match(plannerPrompt, /concept-specific upper_background/);
  assert.match(
    plannerPrompt,
    /application exclusively owns object positioning, scale, camera distance, and composition/,
  );
  assert.match(
    plannerPrompt,
    /anchors every focal object beneath the horizontal midpoint/,
  );
  assert.match(plannerPrompt, /pulls the camera well back/);
  assert.match(plannerPrompt, /upper half.*soft detail and natural variation/);
  assert.match(
    plannerPrompt,
    /Perspective, depth, texture, light, and colour flow naturally.*upper background/,
  );
  assert.match(plannerPrompt, /Do not request close-up, macro, portrait/);
  assert.match(plannerPrompt, /premium editorial photomontage/);
  assert.match(
    plannerPrompt,
    /premium montage of detailed sophisticated stylized illustrations/,
  );
  assert.match(plannerPrompt, /explicit medium keyword[\s\S]*hard override/);
  assert.doesNotMatch(
    plannerPrompt,
    /exactly four natural-language sentences|40–80 words|100 words/,
  );
  assert.doesNotMatch(
    plannerPrompt,
    /blank|empty|title panel|negative-prompt list|negative lists/,
  );
});

test("uses Mistral Medium with Ministral fallback to write exactly 2 or 4 concepts", () => {
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
  assert.match(planner, /name: \"cover_art_concepts\"/);
  assert.doesNotMatch(planner, /split\(\/\\s\+\/\)|new Set\(normalized/);
  assert.match(planner, /minItems: count/);
  assert.match(planner, /maxItems: count/);
  assert.match(planner, /concepts\.length !== count/);
  assert.match(planner, /maxItems: 2/);
  assert.match(planner, /hero_subjects:[\s\S]*minItems: 1[\s\S]*maxItems: 2/);
  assert.match(
    planner,
    /supporting_objects:[\s\S]*minItems: 0[\s\S]*maxItems: 2/,
  );
  assert.match(planner, /hero_subjects\.length < 1/);
  assert.match(planner, /hero_subjects\.length > 2/);
  assert.match(planner, /supporting_objects\.length > 2/);
  assert.match(planner, /subjects: concept\.hero_subjects\.map/);
  assert.match(planner, /style: concept\.style/);
  assert.match(planner, /supporting_objects: concept\.supporting_objects\.map/);
  assert.match(
    planner,
    /description: object\.description,[\s\S]*position: subjectPosition,[\s\S]*scale: subjectScale,[\s\S]*action: object\.action/,
  );
  assert.match(planner, /composition,/);
  assert.match(
    planner,
    /framing: "Wide environmental composition with the camera pulled well back\."/,
  );
  assert.match(planner, /focal_cluster/);
  assert.match(planner, /headroom/);
  assert.match(planner, /continuity/);
  assert.doesNotMatch(
    planner,
    /overlay_usefulness|composition_constraints|upper_environment|viewpoint: concept\.viewpoint|40% image height|bounding box/,
  );
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
  assert.doesNotMatch(types, /coreIdea|referenceGuidance|overlay_usefulness/);
  assert.match(types, /hero_subjects/);
  assert.match(types, /supporting_objects/);
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

test("keeps the switchable cover text overlay preview-only", async () => {
  const [blackOverlay, whiteOverlay] = await Promise.all([
    readFile(new URL("public/cover-generator/cover-overlay-black.png", root)),
    readFile(new URL("public/cover-generator/cover-overlay-white.png", root)),
  ]);

  assert.ok(blackOverlay.length > 0);
  assert.ok(whiteOverlay.length > 0);
  assert.match(interfaceSource, /useState<"black" \| "white">\("black"\)/);
  assert.match(interfaceSource, /cover-overlay-\$\{overlayTone\}\.png/);
  assert.match(interfaceSource, /className="cover-text-overlay"/);
  assert.match(interfaceSource, /backgroundImage: `url\(\$\{overlaySrc\}\)`/);
  assert.match(interfaceSource, /aria-hidden="true"/);
  assert.match(interfaceSource, /aria-pressed=\{overlayTone === "black"\}/);
  assert.match(interfaceSource, /aria-pressed=\{overlayTone === "white"\}/);
  assert.match(
    styles,
    /\.cover-image \.cover-text-overlay[\s\S]*position: absolute/,
  );
  assert.match(
    styles,
    /\.cover-image \.cover-text-overlay[\s\S]*pointer-events: none/,
  );
  assert.match(
    copy,
    /Preview only\. Downloads and artboard exports contain the original artwork without text\./,
  );
  assert.match(workspace, /data: await toBytes\(item\.data\)/);
  assert.match(
    workspace,
    /visible\.map\(\(\{ item, number \}\) => \(\{ number, data: item\.data \}\)\)/,
  );
});

test("exports the actual generated prompts with image metadata", () => {
  assert.match(workspace, /item\.concept\.prompt/);
  assert.match(workspace, /planner: coverPlanner/);
  assert.match(workspace, /plannerCost/);
  assert.match(workspace, /audience: coverAudience/);
  assert.doesNotMatch(workspace, /item\.concept\.coreIdea|referenceGuidance/);
});
