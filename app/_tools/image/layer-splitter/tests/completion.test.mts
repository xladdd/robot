import assert from "node:assert/strict";
import test from "node:test";
import { selectCompletionCandidate } from "../code/completion.ts";

function masks(width: number, height: number) {
  const visibleMask = new Uint8Array(width * height);
  const allowedMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (x < 4) visibleMask[index] = 255;
      else allowedMask[index] = 255;
    }
  return { visibleMask, allowedMask };
}

function objectPixels(
  width: number,
  height: number,
  rgb: readonly [number, number, number],
) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    pixels[offset] = rgb[0];
    pixels[offset + 1] = rgb[1];
    pixels[offset + 2] = rgb[2];
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function visibleSource(
  width: number,
  height: number,
  visibleMask: Uint8Array,
  rgb: readonly [number, number, number],
) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < visibleMask.length; index++) {
    if (visibleMask[index] === 0) continue;
    const offset = index * 4;
    pixels[offset] = rgb[0];
    pixels[offset + 1] = rgb[1];
    pixels[offset + 2] = rgb[2];
    pixels[offset + 3] = 255;
  }
  return pixels;
}

test("registers a shifted completion candidate before clipping and merging", () => {
  const width = 48;
  const height = 40;
  const visibleMask = new Uint8Array(width * height);
  const allowedMask = new Uint8Array(width * height);
  const source = new Uint8ClampedArray(width * height * 4);
  const shifted = new Uint8ClampedArray(width * height * 4);
  const colour = (x: number, y: number) =>
    [40 + x * 3, 50 + y * 3, 80 + ((x * 5 + y * 7) % 120)] as const;

  for (let y = 8; y < 32; y++)
    for (let x = 8; x < 32; x++) {
      const index = y * width + x;
      if (x < 20) {
        visibleMask[index] = 255;
        const offset = index * 4;
        const rgb = colour(x, y);
        source[offset] = rgb[0];
        source[offset + 1] = rgb[1];
        source[offset + 2] = rgb[2];
        source[offset + 3] = 255;
      } else allowedMask[index] = 255;

      const shiftedOffset = ((y + 6) * width + x + 4) * 4;
      const rgb = colour(x, y);
      shifted[shiftedOffset] = rgb[0] + 10;
      shifted[shiftedOffset + 1] = rgb[1] + 10;
      shifted[shiftedOffset + 2] = rgb[2] + 10;
      shifted[shiftedOffset + 3] = 255;
    }

  const sourceBefore = new Uint8ClampedArray(source);
  const result = selectCompletionCandidate(
    source,
    visibleMask,
    allowedMask,
    [shifted],
    width,
    height,
  );

  assert.ok(result);
  const hiddenOffset = (20 * width + 25) * 4;
  assert.deepEqual(
    [...result.hiddenPixels.slice(hiddenOffset, hiddenOffset + 4)],
    [...colour(25, 20), 255],
  );
  assert.deepEqual(source, sourceBefore);
});

test("selectCompletionCandidate chooses the better visible match and colour-corrects it", () => {
  const width = 12;
  const height = 8;
  const { visibleMask, allowedMask } = masks(width, height);
  const source = visibleSource(width, height, visibleMask, [180, 60, 40]);
  const poorMatch = objectPixels(width, height, [20, 190, 220]);
  const goodMatch = objectPixels(width, height, [170, 70, 50]);

  const result = selectCompletionCandidate(
    source,
    visibleMask,
    allowedMask,
    [poorMatch, goodMatch],
    width,
    height,
  );

  assert.ok(result);
  assert.equal(result.candidateIndex, 1);
  const interiorOffset = (4 * width + 8) * 4;
  assert.deepEqual(
    [...result.hiddenPixels.slice(interiorOffset, interiorOffset + 4)],
    [180, 60, 40, 255],
  );
});

test("candidate scoring rejects alpha invented in source-confirmed background", () => {
  const width = 12;
  const height = 8;
  const { visibleMask, allowedMask } = masks(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 10; x < width; x++) allowedMask[y * width + x] = 0;
  const source = visibleSource(width, height, visibleMask, [120, 80, 40]);
  const spilling = objectPixels(width, height, [120, 80, 40]);
  const clean = objectPixels(width, height, [120, 80, 40]);
  for (let y = 0; y < height; y++)
    for (let x = 10; x < width; x++) clean[(y * width + x) * 4 + 3] = 0;

  const result = selectCompletionCandidate(
    source,
    visibleMask,
    allowedMask,
    [spilling, clean],
    width,
    height,
  );

  assert.ok(result);
  assert.equal(result.candidateIndex, 1);
});

test("completion alpha never escapes the allowed mask or covers visible source pixels", () => {
  const width = 12;
  const height = 8;
  const { visibleMask, allowedMask } = masks(width, height);
  allowedMask[2 * width + 3] = 255;
  const source = visibleSource(width, height, visibleMask, [120, 80, 40]);
  const result = selectCompletionCandidate(
    source,
    visibleMask,
    allowedMask,
    [
      objectPixels(width, height, [120, 80, 40]),
      new Uint8ClampedArray(width * height * 4),
    ],
    width,
    height,
  );

  assert.ok(result);
  for (let index = 0; index < width * height; index++)
    if (allowedMask[index] === 0 || visibleMask[index] !== 0)
      assert.equal(result.hiddenPixels[index * 4 + 3], 0, `pixel ${index}`);
});

test("forbidden allowed-mask exits are trimmed while the visible join remains", () => {
  const width = 12;
  const height = 8;
  const { visibleMask, allowedMask } = masks(width, height);
  const source = visibleSource(width, height, visibleMask, [90, 130, 170]);
  const result = selectCompletionCandidate(
    source,
    visibleMask,
    allowedMask,
    [
      objectPixels(width, height, [90, 130, 170]),
      new Uint8ClampedArray(width * height * 4),
    ],
    width,
    height,
  );

  assert.ok(result);
  assert.equal(result.hiddenPixels[(4 * width + 4) * 4 + 3], 255);
  assert.equal(result.hiddenPixels[(4 * width + 11) * 4 + 3], 0);
  assert.equal(result.hiddenPixels[(0 * width + 7) * 4 + 3], 0);
  assert.equal(result.hiddenPixels[(4 * width + 10) * 4 + 3], 255);
  assert.equal(result.hiddenPixelCount, 44);
});

test("returns null when no candidate has at least 32 useful hidden pixels", () => {
  const width = 12;
  const height = 8;
  const { visibleMask, allowedMask } = masks(width, height);
  const source = visibleSource(width, height, visibleMask, [100, 100, 100]);
  const sparse = new Uint8ClampedArray(width * height * 4);
  let hiddenPixels = 0;
  for (
    let index = 0;
    index < allowedMask.length && hiddenPixels < 31;
    index++
  ) {
    if (allowedMask[index] === 0) continue;
    sparse[index * 4 + 3] = 255;
    hiddenPixels++;
  }

  assert.equal(
    selectCompletionCandidate(
      source,
      visibleMask,
      allowedMask,
      [sparse, new Uint8ClampedArray(sparse.length)],
      width,
      height,
    ),
    null,
  );
});

test("does not mutate source pixels, masks, or candidates", () => {
  const width = 12;
  const height = 8;
  const { visibleMask, allowedMask } = masks(width, height);
  const source = visibleSource(width, height, visibleMask, [150, 90, 30]);
  const candidates = [
    objectPixels(width, height, [145, 95, 35]),
    objectPixels(width, height, [30, 90, 150]),
  ];
  const sourceBefore = new Uint8ClampedArray(source);
  const visibleBefore = new Uint8Array(visibleMask);
  const allowedBefore = new Uint8Array(allowedMask);
  const candidatesBefore = candidates.map(
    (candidate) => new Uint8ClampedArray(candidate),
  );

  assert.ok(
    selectCompletionCandidate(
      source,
      visibleMask,
      allowedMask,
      candidates,
      width,
      height,
    ),
  );
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(visibleMask, visibleBefore);
  assert.deepEqual(allowedMask, allowedBefore);
  assert.deepEqual(candidates, candidatesBefore);
});

test("validates source, mask, and candidate dimensions", () => {
  const source = new Uint8ClampedArray(4);
  const mask = new Uint8Array(1);
  assert.throws(
    () => selectCompletionCandidate(source, mask, mask, [], 0, 1),
    /positive integers/,
  );
  assert.throws(
    () => selectCompletionCandidate(source, new Uint8Array(2), mask, [], 1, 1),
    /Mask dimensions/,
  );
  assert.throws(
    () =>
      selectCompletionCandidate(
        source,
        mask,
        mask,
        [new Uint8ClampedArray(8)],
        1,
        1,
      ),
    /Candidate pixel dimensions/,
  );
});
