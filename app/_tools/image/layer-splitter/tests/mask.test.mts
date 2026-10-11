import assert from "node:assert/strict";
import test from "node:test";
import { compositeLayers } from "../code/composite.ts";
import { extractChromaAlpha } from "../code/keying.ts";
import {
  blurMask,
  combineMasks,
  componentsToMask,
  connectedMaskBounds,
  countOpaquePixels,
  fractionInsideBounds,
  hardenMask,
  makeMasksExclusive,
  parseMaskComponents,
  polygonToMask,
  refineMaskEdges,
  upscaleMask,
} from "../code/mask.ts";
import {
  compositeOriginalOverGenerated,
  eraseMaskedPixels,
  extractLayerFromSource,
  patchBackground,
} from "../code/extract.ts";

test("extracts edge-connected chroma background while preserving an enclosed colour", () => {
  const width = 3;
  const height = 3;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    pixels[index * 4] = 0;
    pixels[index * 4 + 1] = 255;
    pixels[index * 4 + 2] = 0;
    pixels[index * 4 + 3] = 255;
  }
  const centre = (1 * width + 1) * 4;
  pixels[centre] = 220;
  pixels[centre + 1] = 20;
  pixels[centre + 2] = 20;
  const result = extractChromaAlpha(pixels, width, height, [0, 255, 0]);
  assert.equal(result.pixels[3], 0);
  assert.equal(result.pixels[centre + 3], 255);
});

test("composites complete rear objects beneath front objects", () => {
  const background = new Uint8ClampedArray([10, 10, 10, 255, 10, 10, 10, 255]);
  const book = new Uint8ClampedArray([30, 80, 140, 255, 30, 80, 140, 255]);
  const pen = new Uint8ClampedArray([200, 40, 40, 255, 0, 0, 0, 0]);
  const composite = compositeLayers(2, 1, [
    { name: "Pen", pixels: pen },
    { name: "Book", pixels: book },
    { name: "Background", pixels: background },
  ]);
  assert.deepEqual([...composite], [200, 40, 40, 255, 30, 80, 140, 255]);
  const withoutPen = compositeLayers(2, 1, [
    { name: "Book", pixels: book },
    { name: "Background", pixels: background },
  ]);
  assert.deepEqual([...withoutPen], [30, 80, 140, 255, 30, 80, 140, 255]);
});

test("extractLayerFromSource multiplies source alpha by mask alpha", () => {
  const width = 3;
  const height = 1;
  const source = new Uint8ClampedArray([
    10, 20, 30, 255, 40, 50, 60, 128, 70, 80, 90, 0,
  ]);
  const mask = new Uint8Array([128, 128, 255]);
  const result = extractLayerFromSource(source, mask, width, height);
  assert.deepEqual(
    [...result],
    [10, 20, 30, 128, 40, 50, 60, 64, 70, 80, 90, 0],
  );
});

test("eraseMaskedPixels removes hidden RGB as well as alpha", () => {
  const source = new Uint8ClampedArray([10, 20, 30, 255, 200, 150, 100, 255]);
  const result = eraseMaskedPixels(source, new Uint8Array([0, 255]), 2, 1);
  assert.deepEqual([...result], [10, 20, 30, 255, 0, 0, 0, 0]);
  assert.deepEqual([...source], [10, 20, 30, 255, 200, 150, 100, 255]);
});

test("patchBackground uses original where mask is 0 and generated where mask is 255", () => {
  const width = 2;
  const height = 1;
  const original = new Uint8ClampedArray([
    100, 100, 100, 255, 100, 100, 100, 255,
  ]);
  const generated = new Uint8ClampedArray([
    200, 200, 200, 255, 200, 200, 200, 255,
  ]);
  const holeMask = new Uint8Array([0, 255]);
  const result = patchBackground(original, generated, holeMask, width, height);
  assert.deepEqual([...result], [100, 100, 100, 255, 200, 200, 200, 255]);
});

test("patchBackground rejects partial mask values instead of interpolating", () => {
  const original = new Uint8ClampedArray([0, 0, 0, 255]);
  const generated = new Uint8ClampedArray([200, 200, 200, 255]);
  assert.throws(
    () => patchBackground(original, generated, new Uint8Array([128]), 1, 1),
    /binary/,
  );
});

test("compositeOriginalOverGenerated places original on top of generated", () => {
  const width = 2;
  const height = 1;
  const original = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
  const generated = new Uint8ClampedArray([0, 0, 255, 255, 0, 255, 0, 255]);
  const result = compositeOriginalOverGenerated(
    original,
    generated,
    width,
    height,
  );
  assert.deepEqual([...result], [255, 0, 0, 255, 0, 255, 0, 255]);
});

test("combineMasks takes the maximum of overlapping masks", () => {
  const width = 2;
  const height = 1;
  const maskA = new Uint8Array([255, 0]);
  const maskB = new Uint8Array([0, 128]);
  const combined = combineMasks([maskA, maskB], width, height);
  assert.deepEqual([...combined], [255, 128]);
});

test("countOpaquePixels counts pixels above the visibility threshold", () => {
  const mask = new Uint8Array([0, 8, 9, 255]);
  assert.equal(countOpaquePixels(mask), 2);
});

test("hardenMask supports foreground and opaque-interior thresholds", () => {
  const mask = new Uint8Array([0, 8, 9, 128, 250, 251, 255]);
  assert.deepEqual([...hardenMask(mask)], [0, 0, 255, 255, 255, 255, 255]);
  assert.deepEqual([...hardenMask(mask, 250)], [0, 0, 0, 0, 0, 255, 255]);
});

test("makeMasksExclusive gives overlap to the topmost visible mask", () => {
  const top = new Uint8Array([0, 8, 9, 128, 255]);
  const middle = new Uint8Array([255, 255, 255, 255, 255]);
  const bottom = new Uint8Array([255, 255, 255, 255, 255]);
  const result = makeMasksExclusive([top, middle, bottom], 5, 1);
  assert.deepEqual([...result[0]], [0, 0, 9, 128, 255]);
  assert.deepEqual([...result[1]], [255, 255, 0, 0, 0]);
  assert.deepEqual([...result[2]], [0, 0, 0, 0, 0]);
  assert.deepEqual([...top], [0, 8, 9, 128, 255]);
});

test("connectedMaskBounds uses eight-connectivity and deterministic order", () => {
  const mask = new Uint8Array(6 * 5);
  mask[0] = 255;
  mask[1 * 6 + 1] = 255;
  mask[2 * 6 + 4] = 255;
  mask[3 * 6 + 4] = 255;
  assert.deepEqual(connectedMaskBounds(mask, 6, 5), [
    { x: 0, y: 0, width: 2, height: 2 },
    { x: 4, y: 2, width: 1, height: 2 },
  ]);
  assert.deepEqual(connectedMaskBounds(new Uint8Array(4), 2, 2), []);
});

test("upscaleMask returns exactly width*height single-channel bytes", async () => {
  const grid = new Uint8Array(32 * 32).fill(255);
  const mask = await upscaleMask(grid, 32, 96, 128, 1.5);
  assert.equal(mask.length, 96 * 128);
  assert.equal(countOpaquePixels(mask), 96 * 128);
});

test("upscaleMask preserves opaque and transparent regions", async () => {
  const grid = new Uint8Array(32 * 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 16; x++) grid[y * 32 + x] = 255;
  const mask = await upscaleMask(grid, 32, 64, 64, 0);
  assert.equal(mask[0], 255);
  assert.equal(mask[63], 0);
});

test("blurMask returns exactly width*height single-channel bytes", async () => {
  const mask = new Uint8Array(64 * 64).fill(255);
  const blurred = await blurMask(mask, 64, 64, 2);
  assert.equal(blurred.length, 64 * 64);
});

test("polygonToMask rasterizes a square contour with anti-aliased edges", () => {
  const mask = polygonToMask(
    [
      { x: 250, y: 250 },
      { x: 750, y: 250 },
      { x: 750, y: 750 },
      { x: 250, y: 750 },
    ],
    100,
    100,
  );
  assert.equal(mask.length, 100 * 100);
  assert.equal(mask[50 * 100 + 50], 255);
  assert.equal(mask[10 * 100 + 10], 0);
  const opaque = countOpaquePixels(mask);
  assert.ok(opaque > 2300 && opaque < 2700, `unexpected area ${opaque}`);
});

test("polygonToMask handles concave diamond contours", () => {
  const mask = polygonToMask(
    [
      { x: 500, y: 100 },
      { x: 900, y: 500 },
      { x: 500, y: 900 },
      { x: 100, y: 500 },
    ],
    100,
    100,
  );
  assert.equal(mask[50 * 100 + 50], 255);
  assert.equal(mask[5 * 100 + 5], 0);
  assert.equal(mask[50 * 100 + 3], 0);
});

test("componentsToMask supports disconnected regions and holes", () => {
  const mask = componentsToMask(
    [
      {
        outer: [
          { x: 100, y: 100 },
          { x: 500, y: 100 },
          { x: 500, y: 900 },
          { x: 100, y: 900 },
        ],
        holes: [
          [
            { x: 200, y: 300 },
            { x: 400, y: 300 },
            { x: 400, y: 700 },
            { x: 200, y: 700 },
          ],
        ],
      },
      {
        outer: [
          { x: 700, y: 200 },
          { x: 900, y: 200 },
          { x: 900, y: 400 },
          { x: 700, y: 400 },
        ],
        holes: [],
      },
    ],
    100,
    100,
  );
  assert.equal(mask[20 * 100 + 20], 255);
  assert.equal(mask[50 * 100 + 30], 0);
  assert.equal(mask[30 * 100 + 80], 255);
  assert.equal(mask[50 * 100 + 60], 0);
  assert.equal(connectedMaskBounds(mask, 100, 100).length, 2);
});

test("parseMaskComponents validates confidence and normalizes closed rings", () => {
  const parsed = parseMaskComponents({
    confidence: 0.9,
    components: [
      {
        outer: [
          { x: 100, y: 100 },
          { x: 500, y: 100 },
          { x: 900, y: 100 },
          { x: 900, y: 500 },
          { x: 900, y: 900 },
          { x: 500, y: 900 },
          { x: 100, y: 900 },
          { x: 100, y: 500 },
          { x: 100, y: 100 },
        ],
        holes: [],
      },
    ],
  });
  assert.equal(parsed.components[0].outer.length, 8);
  assert.throws(
    () => parseMaskComponents({ confidence: 2, components: [] }),
    /components|confidence/,
  );
  assert.throws(
    () =>
      parseMaskComponents({
        confidence: 0.8,
        components: [
          {
            outer: [
              { x: -1, y: 0 },
              { x: 1, y: 0 },
              { x: 1, y: 1 },
            ],
            holes: [],
          },
        ],
      }),
    /0 to 1000/,
  );
});

test("refineMaskEdges snaps an oversized mask onto the object boundary", () => {
  const width = 40;
  const height = 40;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const isObject = x >= 10 && x <= 29 && y >= 10 && y <= 29;
      source[offset] = isObject ? 200 : 30;
      source[offset + 1] = isObject ? 30 : 60;
      source[offset + 2] = isObject ? 30 : 200;
      source[offset + 3] = 255;
    }
  // Coarse polygon mask two pixels too large on every side (8..31)
  const coarse = polygonToMask(
    [
      { x: 200, y: 200 },
      { x: 800, y: 200 },
      { x: 800, y: 800 },
      { x: 200, y: 800 },
    ],
    width,
    height,
  );
  const refined = refineMaskEdges(source, coarse, width, height);
  // Blue pixels inside the oversized mask are trimmed to background
  assert.equal(refined[20 * width + 9], 0);
  assert.equal(refined[9 * width + 20], 0);
  assert.equal(refined[20 * width + 30], 0);
  // Red pixels stay in the mask, including at the true boundary
  assert.equal(refined[20 * width + 10], 255);
  assert.equal(refined[20 * width + 29], 255);
  assert.equal(refined[20 * width + 20], 255);
  const opaque = countOpaquePixels(refined);
  assert.ok(opaque >= 380 && opaque <= 420, `unexpected area ${opaque}`);
});

test("fractionInsideBounds reports mask containment", () => {
  const width = 100;
  const height = 100;
  const mask = new Uint8Array(width * height);
  for (let y = 25; y < 75; y++)
    for (let x = 25; x < 75; x++) mask[y * width + x] = 255;
  assert.equal(
    fractionInsideBounds(mask, width, height, {
      x: 0.2,
      y: 0.2,
      width: 0.6,
      height: 0.6,
    }),
    1,
  );
  const displaced = fractionInsideBounds(mask, width, height, {
    x: 0.7,
    y: 0.7,
    width: 0.2,
    height: 0.2,
  });
  assert.ok(displaced < 0.5, `unexpected fraction ${displaced}`);
});
