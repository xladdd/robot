import assert from "node:assert/strict";
import test from "node:test";
import {
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
