import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdvancedImagePrompt,
  emptyAdvancedImageFields,
  MAX_ADVANCED_SUBJECTS,
  MAX_IMAGE_QUEUE,
  splitImagePrompts,
} from "../code/prompts.ts";

test("splits image prompts only at empty lines", () => {
  assert.deepEqual(
    splitImagePrompts("a goose\n\na boy\n\na dog"),
    ["a goose", "a boy", "a dog"],
  );
  assert.deepEqual(
    splitImagePrompts("first line\nsecond line\n \t\nnext prompt"),
    ["first line\nsecond line", "next prompt"],
  );
});

test("normalizes line endings and caps the queue at fifteen images", () => {
  const prompts = Array.from({ length: 20 }, (_, index) => `image ${index + 1}`);
  const parsed = splitImagePrompts(prompts.join("\r\n\r\n"));
  assert.equal(parsed.length, MAX_IMAGE_QUEUE);
  assert.equal(parsed.at(-1), "image 15");
});

test("ignores leading, trailing, and repeated empty lines", () => {
  assert.deepEqual(splitImagePrompts("\n\n  one  \n\n\n\n two \n\n"), [
    "one",
    "two",
  ]);
});

test("builds an empty JSON object when no advanced field is filled", () => {
  assert.equal(buildAdvancedImagePrompt(emptyAdvancedImageFields()), "{}");
});

test("assembles the full BFL JSON prompt schema from advanced fields", () => {
  const prompt = buildAdvancedImagePrompt({
    scene: "Studio product setup",
    subjects: [
      {
        description: "Matte black ceramic mug",
        position: "Center foreground",
        action: "Steam rising",
      },
      {
        description: "Yellow mug",
        position: "Right side",
        action: "",
      },
    ],
    style: "Product photography",
    prompt: "Commercial quality",
    lighting: "Three-point softbox",
    mood: "Clean and minimalist",
    background: "Polished concrete",
    composition: "Rule of thirds",
    colorPalette: "#111111, matte yellow ,",
    cameraAngle: "High angle",
    cameraLens: "85 mm",
    cameraDepthOfField: "Sharp focus",
  });

  assert.deepEqual(JSON.parse(prompt), {
    scene: "Studio product setup",
    subjects: [
      {
        description: "Matte black ceramic mug",
        position: "Center foreground",
        action: "Steam rising",
      },
      { description: "Yellow mug", position: "Right side" },
    ],
    style: "Product photography",
    color_palette: ["#111111", "matte yellow"],
    lighting: "Three-point softbox",
    mood: "Clean and minimalist",
    background: "Polished concrete",
    composition: "Rule of thirds",
    camera: {
      angle: "High angle",
      lens: "85 mm",
      depth_of_field: "Sharp focus",
    },
    prompt: "Commercial quality",
  });
});

test("drops empty subjects and keeps only filled subject fields", () => {
  const prompt = buildAdvancedImagePrompt({
    ...emptyAdvancedImageFields(),
    subjects: [
      { description: "", position: "", action: "" },
      { description: "  A goose  ", position: "", action: "Walking" },
    ],
  });

  assert.deepEqual(JSON.parse(prompt), {
    subjects: [{ description: "A goose", action: "Walking" }],
  });
});

test("omits the camera object when no camera field is filled", () => {
  const prompt = buildAdvancedImagePrompt({
    ...emptyAdvancedImageFields(),
    scene: "A quiet harbor",
  });

  assert.deepEqual(JSON.parse(prompt), { scene: "A quiet harbor" });
});

test("caps the advanced subject list at five entries", () => {
  assert.equal(MAX_ADVANCED_SUBJECTS, 5);
});
