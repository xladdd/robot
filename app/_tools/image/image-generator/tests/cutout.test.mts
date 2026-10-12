import assert from "node:assert/strict";
import test from "node:test";
import { removeLightBackground } from "../code/cutout.ts";

type Pixel = [number, number, number];

function paint(
  rgba: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  pixel: Pixel,
) {
  const offset = (y * width + x) * 4;
  rgba[offset] = pixel[0];
  rgba[offset + 1] = pixel[1];
  rgba[offset + 2] = pixel[2];
  rgba[offset + 3] = 255;
}

function alphaAt(rgba: Uint8ClampedArray, width: number, x: number, y: number) {
  return rgba[(y * width + x) * 4 + 3];
}

const WHITE: Pixel = [255, 255, 255];
const BROWN: Pixel = [120, 90, 70];

function storybookScene(width = 64, height = 64) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) paint(rgba, width, x, y, WHITE);
  // Soft warm shadow with a gentle gradient so the fill can walk in.
  for (let y = 16; y < 48; y += 1) {
    for (let x = 44; x < 52; x += 1) {
      const step = x - 44;
      paint(rgba, width, x, y, [
        255 - step * 2,
        250 - step * 6,
        240 - step * 11,
      ]);
    }
  }
  // Solid subject with one anti-aliased edge pixel on its left side.
  for (let y = 20; y < 32; y += 1)
    for (let x = 21; x < 33; x += 1) paint(rgba, width, x, y, BROWN);
  for (let y = 20; y < 32; y += 1)
    paint(rgba, width, 20, y, [187, 172, 162]);
  return { rgba, width, height };
}

test("removes the white page and the warm shadow, keeps the subject", () => {
  const { rgba, width, height } = storybookScene();
  const result = removeLightBackground(rgba, width, height);

  assert.equal(result.changed, true);
  assert.equal(alphaAt(rgba, width, 1, 1), 0, "page corner must be transparent");
  assert.equal(alphaAt(rgba, width, 48, 30), 0, "shadow core must be transparent");
  assert.equal(alphaAt(rgba, width, 26, 26), 255, "subject must stay opaque");
  assert.deepEqual(
    [rgba[(26 * width + 26) * 4], rgba[(26 * width + 26) * 4 + 1], rgba[(26 * width + 26) * 4 + 2]],
    BROWN,
    "subject pixels must be untouched",
  );
  assert.ok(result.transparentRatio > 0.5, "most of the image is background");
});

test("un-blends anti-aliased rim pixels into partial alpha", () => {
  const { rgba, width, height } = storybookScene();
  removeLightBackground(rgba, width, height);

  const alpha = alphaAt(rgba, width, 20, 26);
  assert.ok(alpha > 0 && alpha < 255, `rim alpha should be partial, got ${alpha}`);
});

test("leaves images without a light border untouched", () => {
  const width = 16;
  const height = 16;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) paint(rgba, width, x, y, BROWN);
  const before = Array.from(rgba);

  const result = removeLightBackground(rgba, width, height);
  assert.equal(result.changed, false);
  assert.deepEqual(Array.from(rgba), before);
});

test("refuses to remove a dark surrounding subject fill", () => {
  const width = 24;
  const height = 24;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) paint(rgba, width, x, y, BROWN);
  // A light subject on a dark background: no light border to seed from.
  for (let y = 8; y < 16; y += 1)
    for (let x = 8; x < 16; x += 1) paint(rgba, width, x, y, WHITE);
  const before = Array.from(rgba);

  const result = removeLightBackground(rgba, width, height);
  assert.equal(result.changed, false);
  assert.deepEqual(Array.from(rgba), before);
});
