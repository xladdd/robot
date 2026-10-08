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
const styleCatalog = await read(
  "app/_tools/image/cover-generator/code/style-catalog.ts",
);
const plannerPrompt = await read(
  "app/_tools/image/cover-generator/prompts/plan-concepts.md",
);
const interfaceSource = await read(
  "app/_tools/image/cover-generator/MainInterface.tsx",
);
const workspace = await read("app/Workspace.tsx");
const copy = await read("app/_tools/image/cover-generator/copy.ts");
const artboard = await read(
  "app/_tools/image/cover-generator/code/cover-artboard.ts",
);
const styles = await read("app/globals.css");

test("defines one structured concept prompt template with positive spatial invariants", async () => {
  assert.deepEqual(await readdir(promptDir), ["plan-concepts.md"]);
  assert.match(plannerPrompt, /FLUX\.2 Pro/);
  assert.match(plannerPrompt, /concept objects/);
  assert.match(plannerPrompt, /one or two specific hero_subjects/);
  assert.match(plannerPrompt, /one to three meaningful supporting_objects/);
  assert.match(
    plannerPrompt,
    /no more than four recognisable objects in total/,
  );
  assert.match(plannerPrompt, /choose one concept_mode/);
  assert.match(plannerPrompt, /one composition_strategy/);
  assert.match(
    plannerPrompt,
    /Supporting objects must relate clearly to the hero/,
  );
  assert.match(
    plannerPrompt,
    /application owns final object placement, scale, canvas coverage, title area, and background continuity/,
  );
  assert.match(plannerPrompt, /Do not provide coordinates, percentages/);
  assert.match(
    plannerPrompt,
    /upper_background only as the natural continuation/,
  );
  assert.match(plannerPrompt, /rather than as a separate region/);
  for (const treatment of [
    "atmospheric environmental photomontage",
    "tactile editorial object montage",
    "scientific macro or material study",
    "detailed stylized illustration montage",
    "coloured wood engraving",
    "modern risograph",
    "ink-lined watercolour",
    "20th century-style propaganda watercolour",
  ])
    assert.match(types, new RegExp(treatment));
  assert.match(plannerPrompt, /object- or environment-centred/);
  assert.match(plannerPrompt, /explicit medium keyword may guide/);
  assert.match(
    plannerPrompt,
    /required visual treatment[\s\S]*exact treatment/,
  );

  assert.doesNotMatch(
    plannerPrompt,
    /exactly four natural-language sentences|40–80 words|100 words/,
  );
  assert.doesNotMatch(plannerPrompt, /subject-specific template/);
});

test("uses Mistral Medium with Ministral fallback to write exactly 1, 2, or 4 concepts", () => {
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
    /supporting_objects:[\s\S]*minItems: 1[\s\S]*maxItems: 3/,
  );
  assert.match(planner, /hero_subjects\.length < 1/);
  assert.match(planner, /hero_subjects\.length > 2/);
  assert.match(planner, /supporting_objects\.length < 1/);
  assert.match(planner, /supporting_objects\.length > 3/);
  assert.match(planner, /subjects: concept\.hero_subjects\.map/);
  assert.match(
    planner,
    /styleSelection === "automatic"[\s\S]*concept\.style[\s\S]*explicitStylePrompts\[styleSelection\]/,
  );
  assert.match(
    planner,
    /styleSelection === "automatic" \? concept\.treatment : styleSelection/,
  );
  assert.match(planner, /style_details: concept\.style/);
  assert.match(planner, /concept_mode:[\s\S]*enum: coverConceptModes/);
  assert.match(
    planner,
    /composition_strategy:[\s\S]*enum: coverCompositionStrategies/,
  );
  assert.match(planner, /treatment:[\s\S]*enum: coverTreatments/);
  assert.match(
    types,
    /type CoverStyleSelection = "automatic" \| CoverTreatment/,
  );
  assert.match(types, /treatment: CoverTreatment/);
  assert.match(planner, /supporting_objects: concept\.supporting_objects\.map/);
  assert.match(
    planner,
    /description: object\.description,[\s\S]*position: heroPosition,[\s\S]*scale: heroScale,[\s\S]*action: object\.action/,
  );
  assert.match(
    planner,
    /position: supportingPosition,[\s\S]*scale: supportingScale/,
  );
  assert.match(planner, /concept_approach: concept\.concept_mode/);
  assert.match(
    planner,
    /composition: compositionFor\(concept\.composition_strategy\)/,
  );
  assert.match(planner, /Full-bleed edge-to-edge artwork/);
  assert.match(planner, /upper third remains calm and low-contrast/);
  assert.match(planner, /same continuous background/);
  assert.match(planner, /One continuous environment flows from bottom to top/);
  assert.doesNotMatch(
    planner,
    /overlay_usefulness|composition_constraints|upper_environment|viewpoint: concept\.viewpoint|40% image height|bounding box/,
  );
  assert.match(planner, /type: "image_url"/);
  assert.doesNotMatch(planner, /input\.references|Reference image \$\{index/);
  assert.match(planner, /School level:/);
  assert.match(planner, /Theme \/ keywords:/);
  assert.match(planner, /Visual treatment: automatic/);
  assert.match(planner, /Required visual treatment:/);
  assert.match(planner, /preferredImage/);
  assert.doesNotMatch(planner, /createFallbackCoverPlan|referenceGuidance/);
});

test("sends references directly to the image model without subject overrides", () => {
  assert.match(
    server,
    /const plan = await planCoverConcepts\(openRouter, plannerInput\)/,
  );
  assert.match(server, /concept\.prompt,[\s\S]*references,[\s\S]*seed/);
  assert.match(server, /input_references: references\.map/);
  assert.match(server, /type: "image_url" as const/);
  assert.match(server, /addReferenceGuidance\(prompt, references\.length\)/);
  assert.match(
    server,
    /visual guidance for palette, atmosphere, material finish, and treatment/,
  );
  assert.match(server, /edge-to-edge continuous scene/);
  assert.doesNotMatch(server, /const plannerInput:[\s\S]{0,400}\breferences,/);
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

test("supports explicit visual treatment and one, two, or four concepts", () => {
  assert.match(server, /type GenerationCount = 1 \| 2 \| 4/);
  assert.match(server, /if \(value === 1 \|\| value === 2 \|\| value === 4\)/);
  assert.match(server, /if \(value === undefined\) return 2/);
  assert.match(server, /function parseStyle/);
  assert.match(server, /coverTreatments\.includes/);
  assert.match(workspace, /useState<CoverStyleSelection>\("automatic"\)/);
  assert.match(workspace, /style: coverStyle/);
  assert.match(interfaceSource, /id="cover-style"/);
  assert.ok(
    interfaceSource.indexOf('id="cover-audience"') <
      interfaceSource.indexOf('id="cover-subject"'),
  );
  assert.ok(
    interfaceSource.indexOf('id="cover-subject"') <
      interfaceSource.indexOf('id="cover-style"'),
  );
  assert.ok(
    interfaceSource.indexOf('id="cover-style"') <
      interfaceSource.indexOf('id="cover-keywords"'),
  );
  assert.match(interfaceSource, /value=\{style\}/);
  assert.match(interfaceSource, /value="automatic"/);
  for (const treatment of [
    "atmospheric environmental photomontage",
    "tactile editorial object montage",
    "scientific macro or material study",
    "detailed stylized illustration montage",
    "coloured wood engraving",
    "modern risograph",
    "ink-lined watercolour",
    "20th century-style propaganda watercolour",
  ])
    assert.match(interfaceSource, new RegExp(`value="${treatment}"`));
  assert.match(interfaceSource, /useState<1 \| 2 \| 4>\(2\)/);
  assert.match(interfaceSource, /<option value=\{1\}>1<\/option>/);
  assert.match(copy, /generateOne: "GENERATE 1"/);
  assert.match(copy, /generateSelectedOne: "GENERATE 1 WITH THIS PREFERENCE"/);
  assert.match(styles, /\.cover-keywords-label label[\s\S]*margin-bottom: 0/);
  assert.match(
    styles,
    /\.cover-keywords-label \+ textarea[\s\S]*margin-top: -4px/,
  );
});

test("previews every explicit visual treatment with its production prompt", async () => {
  const previewFiles = await readdir(
    new URL("public/cover-generator/style-previews/", root),
  );

  assert.deepEqual(previewFiles, [
    "01-atmospheric-environmental-photomontage.jpg",
    "02-tactile-editorial-object-montage.jpg",
    "03-scientific-macro-material-study.jpg",
    "04-detailed-stylized-illustration-montage.jpg",
    "05-coloured-wood-engraving.jpg",
    "06-modern-risograph.jpg",
    "07-ink-lined-watercolour.jpg",
    "08-propaganda-watercolour.jpg",
  ]);
  assert.match(planner, /coverStylePrompts as explicitStylePrompts/);
  assert.match(interfaceSource, /id="cover-style-help"/);
  assert.match(interfaceSource, /className="cover-style-list"/);
  assert.match(interfaceSource, /className="cover-style-detail"/);
  assert.match(interfaceSource, /navigator\.clipboard\.writeText/);
  assert.match(interfaceSource, /coverStylePrompts\[selectedStylePreview\]/);
  assert.match(
    styles,
    /grid-template-columns: minmax\(0, 2fr\) minmax\(230px, 1fr\)/,
  );
  assert.match(copy, /Visual treatment examples/);
  assert.match(copy, /Ukázky výtvarného zpracování/);
  for (const treatment of [
    "atmospheric environmental photomontage",
    "tactile editorial object montage",
    "scientific macro or material study",
    "detailed stylized illustration montage",
    "coloured wood engraving",
    "modern risograph",
    "ink-lined watercolour",
    "20th century-style propaganda watercolour",
  ])
    assert.match(styleCatalog, new RegExp(treatment));
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

test("uses the selected overlay for cards and PDFs but keeps ZIP artwork raw", async () => {
  const [blackOverlay, whiteOverlay] = await Promise.all([
    readFile(new URL("public/cover-generator/cover-overlay-black.png", root)),
    readFile(new URL("public/cover-generator/cover-overlay-white.png", root)),
  ]);

  assert.ok(blackOverlay.length > 0);
  assert.ok(whiteOverlay.length > 0);
  assert.match(workspace, /useState<CoverOverlayTone>\("black"\)/);
  assert.match(interfaceSource, /overlayTone: CoverOverlayTone/);
  assert.match(
    interfaceSource,
    /overlayChoices: Record<string, CoverLightboxOverlay>/,
  );
  assert.match(interfaceSource, /onOverlayTone: \(tone: CoverOverlayTone\)/);
  assert.match(
    interfaceSource,
    /const cardOverlay = overlayChoices\[item\.id\] \?\? overlayTone/,
  );
  assert.match(interfaceSource, /cardOverlay !== "none"/);
  assert.match(interfaceSource, /className="cover-text-overlay"/);
  assert.match(interfaceSource, /cover-overlay-\$\{cardOverlay\}\.png/);
  assert.match(interfaceSource, /aria-hidden="true"/);
  assert.match(interfaceSource, /aria-pressed=\{overlayTone === "black"\}/);
  assert.match(interfaceSource, /aria-pressed=\{overlayTone === "white"\}/);
  assert.match(workspace, /overlayTone=\{coverOverlayTone\}/);
  assert.match(workspace, /overlayChoices=\{coverOverlayChoices\}/);
  assert.match(workspace, /onOverlayTone=\{selectCoverOverlayTone\}/);
  assert.match(
    workspace,
    /function selectCoverOverlayTone[\s\S]*setCoverOverlayChoices\(\{\}\)/,
  );
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
    /ZIP downloads contain the original artwork\. Artboard PDFs use the selected overlay colour\./,
  );
  assert.match(artboard, /cover-overlay-\$\{tone\}\.png/);
  assert.match(artboard, /cover\.overlay === "none"/);
  assert.match(
    artboard,
    /if \(overlay\)[\s\S]*context\.drawImage\(overlay, 0, 0, canvas\.width, canvas\.height\)/,
  );
  assert.match(workspace, /data: await toBytes\(item\.data\)/);
  assert.match(
    workspace,
    /overlay: coverOverlayChoices\[item\.id\] \?\? coverOverlayTone/,
  );
});

test("places references after inputs and persists each lightbox overlay on its card", () => {
  assert.ok(
    interfaceSource.indexOf("cover-input-control") <
      interfaceSource.indexOf("cover-reference-control"),
  );
  assert.match(
    workspace,
    /Record<string, CoverLightboxOverlay>[\s\S]*\>\(\{\}\)/,
  );
  assert.match(interfaceSource, /overlay: CoverLightboxOverlay/);
  assert.match(
    interfaceSource,
    /onOverlay: \(overlay: CoverLightboxOverlay\) => void/,
  );
  assert.match(interfaceSource, /className="cover-lightbox-preview"/);
  assert.match(interfaceSource, /className="cover-lightbox-text-overlay"/);
  assert.match(interfaceSource, />\s*W\s*<\/button>/);
  assert.match(interfaceSource, />\s*B\s*<\/button>/);
  assert.match(interfaceSource, />\s*None\s*<\/button>/);
  assert.match(
    workspace,
    /overlay=\{coverOverlayChoices\[zoomedCover\.id\] \?\? coverOverlayTone\}/,
  );
  assert.match(workspace, /\[zoomedCover\.id\]: overlay/);
  assert.match(
    styles,
    /\.cover-lightbox-text-overlay[\s\S]*position: absolute[\s\S]*pointer-events: none/,
  );
  assert.match(
    styles,
    /\.cover-lightbox figcaption[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto[\s\S]*align-items: center[\s\S]*text-align: left/,
  );
  assert.match(
    styles,
    /\.cover-lightbox-overlay-switch[\s\S]*justify-content: flex-end/,
  );
});

test("exports the actual generated prompts with image metadata", () => {
  assert.match(workspace, /item\.concept\.prompt/);
  assert.match(workspace, /planner: coverPlanner/);
  assert.match(workspace, /plannerCost/);
  assert.match(workspace, /audience: coverAudience/);
  assert.doesNotMatch(workspace, /item\.concept\.coreIdea|referenceGuidance/);
});
