import assert from "node:assert/strict";
import test from "node:test";
import { compositeLayers } from "../code/composite.ts";
import { extractChromaAlpha } from "../code/keying.ts";

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
