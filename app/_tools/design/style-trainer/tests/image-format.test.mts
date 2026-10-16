import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DEFAULT_RATIOS, selectImageFormat, validateReferenceDimensions } from "../code/image-format.ts";
const capabilities = { aspect_ratio: { type: "enum", values: [...DEFAULT_RATIOS] } };
const dims = (width: number, height: number) => ({ width, height });

test("validates bounded original dimensions without coercion or mutation", () => {
  const input = [dims(1920, 1080)];
  assert.deepEqual(validateReferenceDimensions(input), input);
  assert.notEqual(validateReferenceDimensions(input)[0], input[0]);
  assert.deepEqual(validateReferenceDimensions(undefined), []);
  for (const value of [null, [], Array(7).fill(dims(1, 1)), [null], [dims(0, 1)], [dims(-1, 1)], [dims(1.5, 1)], [dims(NaN, 1)], [dims(Infinity, 1)], [dims(16385, 1)], [dims(10000, 10000)], [{ width: "100", height: 100 }]])
    assert.throws(() => validateReferenceDimensions(value));
});

test("equal originals use explicit supported sizes without conflicting ratio or tier", () => {
  const references = [dims(1920, 1080), dims(1920, 1080)];
  const result = selectImageFormat(references, { size: { type: "enum", values: ["1920x1080"] } });
  assert.deepEqual(result.parameters, { size: "1920x1080" });
  assert.equal(result.exactSizeRequested, true);
  assert.deepEqual(selectImageFormat(references, {
    width: { type: "range", min: 256, max: 2048 },
    height: { type: "range", min: 256, max: 2048 },
  }).parameters, { width: 1920, height: 1080 });
});

test("FLUX aspect-only capabilities do not imply native exact pixels or resolution support", () => {
  const result = selectImageFormat([dims(1920, 1080)], capabilities);
  assert.deepEqual(result.parameters, { aspect_ratio: "16:9" });
  assert.equal(result.exactSizeRequested, false);
  assert.deepEqual(result.requestedDimensions, dims(1920, 1080));
  assert.deepEqual(selectImageFormat([dims(1080, 1920)], capabilities).parameters, { aspect_ratio: "9:16" });
});

test("mixed sizes vote by ratio rather than largest pixel area, with order-independent ties", () => {
  const references = [dims(800, 600), dims(400, 300), dims(4000, 4000)];
  assert.deepEqual(selectImageFormat(references, capabilities).parameters, { aspect_ratio: "4:3" });
  const tie = [dims(1920, 1080), dims(600, 800)];
  assert.deepEqual(selectImageFormat(tie, capabilities), selectImageFormat([...tie].reverse(), capabilities));
  assert.equal(selectImageFormat(references, capabilities).requestedDimensions, null);
  assert.deepEqual(selectImageFormat([], capabilities).parameters, { aspect_ratio: "1:1" });
});

test("unsupported exact sizes and extreme ratios fall back to provider-supported formats", () => {
  assert.deepEqual(selectImageFormat([dims(16000, 1)], capabilities).parameters, { aspect_ratio: "21:9" });
  assert.deepEqual(selectImageFormat([dims(1920, 1080)], {
    ...capabilities, width: { type: "range", min: 256, max: 1024 }, height: { type: "range", min: 256, max: 1024 },
  }).parameters, { aspect_ratio: "16:9" });
  assert.throws(() => selectImageFormat([], { aspect_ratio: { type: "enum", values: ["auto"] } }), /no usable/);
});

test("generation wrapper does not force square composition", () => {
  assert.doesNotMatch(readFileSync(new URL("../prompts/generate.md", import.meta.url), "utf8"), /square/i);
});
