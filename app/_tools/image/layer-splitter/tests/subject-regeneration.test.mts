import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupportVisibilityMask,
  findSubjectAlignment,
  replaceAlpha,
  selectSubjectMaskAndAlignment,
  transformMask,
  transformRgbaPixels,
  type SubjectAlignment,
} from "../code/subject-regeneration.ts";

function alignment(
  scale: number,
  translateX: number,
  translateY: number,
): SubjectAlignment {
  return {
    scale,
    translateX,
    translateY,
    score: 1,
    coverage: 1,
    similarity: 1,
  };
}

function makeOrganicSubject(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const ellipse =
        ((x - 29) * (x - 29)) / (20 * 20) + ((y - 27) * (y - 27)) / (19 * 19) <=
        1;
      const notch = x < 22 && y < 22;
      const tail = x >= 43 && x <= 51 && y >= 29 && y <= 34;
      const subject = (ellipse && !notch) || tail;
      const index = y * width + x;
      const offset = index * 4;
      pixels[offset] = subject ? 35 + x * 3 : 8;
      pixels[offset + 1] = subject ? 40 + y * 4 : 15;
      pixels[offset + 2] = subject ? 220 - x * 2 + ((x + y) % 5) * 5 : 25;
      pixels[offset + 3] = subject ? 255 : 0;
      if (subject) mask[index] = 255;
    }
  return { pixels, mask };
}

function rectangleMask(
  width: number,
  height: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  const mask = new Uint8Array(width * height);
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) mask[y * width + x] = 255;
  return mask;
}

test("findSubjectAlignment recovers a 0.7 scale and translation from partial visibility", () => {
  const width = 64;
  const height = 56;
  const generated = makeOrganicSubject(width, height);
  const expected = alignment(0.7, 13, 8);
  const sourceVisiblePixels = transformRgbaPixels(
    generated.pixels,
    width,
    height,
    expected,
  );
  const visibleMask = transformMask(generated.mask, width, height, expected);

  // Simulate the middle of the regenerated subject being hidden by a support.
  const originalVisibleMask = new Uint8Array(visibleMask);
  for (let y = 22; y < 37; y++)
    for (let x = 25; x < 40; x++) visibleMask[y * width + x] = 0;

  const found = findSubjectAlignment(
    sourceVisiblePixels,
    visibleMask,
    generated.pixels,
    generated.mask,
    width,
    height,
  );

  assert.ok(found);
  assert.ok(
    Math.abs(found.scale - expected.scale) < 0.035,
    JSON.stringify(found),
  );
  assert.ok(
    Math.abs(found.translateX - expected.translateX) < 1.25,
    `${found.translateX}`,
  );
  assert.ok(
    Math.abs(found.translateY - expected.translateY) < 1.25,
    `${found.translateY}`,
  );
  assert.ok(found.coverage > 0.9, `${found.coverage}`);
  assert.ok(found.similarity > 0.9, `${found.similarity}`);
  assert.deepEqual(
    [...originalVisibleMask],
    [...transformMask(generated.mask, width, height, expected)],
  );
});

test("findSubjectAlignment rejects a mask whose pixels do not resemble the source", () => {
  const width = 24;
  const height = 20;
  const visibleMask = rectangleMask(width, height, 5, 4, 18, 16);
  const source = new Uint8ClampedArray(width * height * 4);
  const generated = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    source[index * 4] = 240;
    source[index * 4 + 1] = 20;
    source[index * 4 + 2] = 20;
    source[index * 4 + 3] = 255;
    generated[index * 4] = 10;
    generated[index * 4 + 1] = 210;
    generated[index * 4 + 2] = 230;
    generated[index * 4 + 3] = 255;
  }
  assert.equal(
    findSubjectAlignment(
      source,
      visibleMask,
      generated,
      visibleMask,
      width,
      height,
    ),
    null,
  );
});

test("selectSubjectMaskAndAlignment is order-independent and rejects background masks", () => {
  const width = 48;
  const height = 44;
  const generated = makeOrganicSubject(width, height);
  const expected = alignment(0.74, 7, 5);
  const source = transformRgbaPixels(generated.pixels, width, height, expected);
  const visibleMask = transformMask(generated.mask, width, height, expected);
  const background = new Uint8Array(width * height).fill(255);
  const empty = new Uint8Array(width * height);
  const distractor = rectangleMask(width, height, 0, 0, 7, 9);

  const first = selectSubjectMaskAndAlignment(
    generated.pixels,
    [background, empty, distractor, generated.mask],
    source,
    visibleMask,
    width,
    height,
  );
  const second = selectSubjectMaskAndAlignment(
    generated.pixels,
    [generated.mask, distractor, background, empty],
    source,
    visibleMask,
    width,
    height,
  );

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.mask, generated.mask);
  assert.equal(second.mask, generated.mask);
  assert.ok(Math.abs(first.alignment.scale - expected.scale) < 0.04);
  assert.ok(Math.abs(second.alignment.scale - expected.scale) < 0.04);
  assert.equal(
    selectSubjectMaskAndAlignment(
      generated.pixels,
      [empty, background],
      source,
      visibleMask,
      width,
      height,
    ),
    null,
  );
});

test("replaceAlpha copies RGB, replaces alpha, and leaves both inputs unchanged", () => {
  const pixels = new Uint8ClampedArray([
    10, 20, 30, 1, 40, 50, 60, 2, 70, 80, 90, 3,
  ]);
  const mask = new Uint8Array([0, 128, 255]);
  const originalPixels = new Uint8ClampedArray(pixels);
  const originalMask = new Uint8Array(mask);

  const result = replaceAlpha(pixels, mask, 3, 1);

  assert.deepEqual(
    [...result],
    [10, 20, 30, 0, 40, 50, 60, 128, 70, 80, 90, 255],
  );
  assert.deepEqual([...pixels], [...originalPixels]);
  assert.deepEqual([...mask], [...originalMask]);
});

test("RGBA and mask transforms translate onto a full transparent canvas", () => {
  const pixels = new Uint8ClampedArray([
    200, 10, 20, 255, 20, 210, 30, 128, 40, 50, 220, 255, 90, 80, 70, 255, 60,
    50, 40, 255, 30, 20, 10, 255,
  ]);
  const mask = new Uint8Array([255, 128, 64, 32, 16, 8]);
  const originalPixels = new Uint8ClampedArray(pixels);
  const originalMask = new Uint8Array(mask);
  const translated = alignment(1, 1, 0);

  const transformedPixels = transformRgbaPixels(pixels, 3, 2, translated);
  const transformedMask = transformMask(mask, 3, 2, translated);

  assert.equal(transformedPixels.length, pixels.length);
  assert.deepEqual(
    [...transformedPixels],
    [
      0, 0, 0, 0, 200, 10, 20, 255, 20, 210, 30, 128, 0, 0, 0, 0, 90, 80, 70,
      255, 60, 50, 40, 255,
    ],
  );
  assert.deepEqual([...transformedMask], [0, 255, 128, 0, 32, 16]);
  assert.deepEqual([...pixels], [...originalPixels]);
  assert.deepEqual([...mask], [...originalMask]);
});

test("createSupportVisibilityMask reveals the subject outside support and foreground parts inside", () => {
  const subjectAlpha = new Uint8Array([255, 255, 128, 64, 200, 160, 120, 80]);
  const foregroundParts = new Uint8Array([0, 255, 128, 0, 255, 128, 255, 255]);
  const originalSubject = new Uint8Array(subjectAlpha);
  const originalForeground = new Uint8Array(foregroundParts);

  const result = createSupportVisibilityMask(
    subjectAlpha,
    { x: 0.25, y: 0, width: 0.5, height: 1 },
    foregroundParts,
    4,
    2,
  );

  assert.deepEqual([...result], [255, 255, 64, 64, 200, 80, 120, 80]);
  assert.deepEqual([...subjectAlpha], [...originalSubject]);
  assert.deepEqual([...foregroundParts], [...originalForeground]);
});

test("subject regeneration helpers reject dimension mismatches", () => {
  assert.throws(
    () => replaceAlpha(new Uint8ClampedArray(4), new Uint8Array(2), 1, 1),
    /Mask dimensions/,
  );
  assert.throws(
    () =>
      createSupportVisibilityMask(
        new Uint8Array(1),
        { x: 0, y: 0, width: 1, height: 1 },
        new Uint8Array(2),
        1,
        1,
      ),
    /Foreground-parts mask dimensions/,
  );
});
