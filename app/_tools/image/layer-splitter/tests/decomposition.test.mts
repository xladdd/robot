import assert from "node:assert/strict";
import test from "node:test";
import {
  alphaMaskFromPixels,
  matchDecompositionMasks,
  retainVisibleLayerMasks,
} from "../code/decomposition.ts";
import type { LayerPlanItem } from "../types.ts";

function layer(
  id: string,
  visibleBounds: LayerPlanItem["visibleBounds"],
): LayerPlanItem {
  return {
    id,
    name: id,
    description: id,
    order: 1,
    visibleBounds,
    reconstructionBounds: visibleBounds,
    occludedBy: [],
  };
}

function rectangularMask(
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

test("alphaMaskFromPixels extracts alpha without using generated RGB", () => {
  const pixels = new Uint8ClampedArray([
    200, 10, 10, 0, 10, 200, 10, 128, 10, 10, 200, 255,
  ]);
  assert.deepEqual([...alphaMaskFromPixels(pixels, 3, 1)], [0, 128, 255]);
});

test("matchDecompositionMasks assigns cutouts by spatial overlap", () => {
  const width = 100;
  const height = 100;
  const leftMask = rectangularMask(width, height, 5, 20, 40, 90);
  const rightMask = rectangularMask(width, height, 60, 10, 95, 80);
  const background = new Uint8Array(width * height).fill(255);
  const layers = [
    layer("right", { x: 0.55, y: 0.05, width: 0.45, height: 0.8 }),
    layer("left", { x: 0, y: 0.15, width: 0.45, height: 0.8 }),
    layer("missing", { x: 0.4, y: 0.8, width: 0.2, height: 0.2 }),
  ];
  const matched = matchDecompositionMasks(
    [leftMask, background, rightMask],
    layers,
    width,
    height,
  );
  assert.equal(matched[0], rightMask);
  assert.equal(matched[1], leftMask);
  assert.equal(matched[2], null);
});

test("retainVisibleLayerMasks omits a fully covered lower layer and reports it", () => {
  const top = layer("phone", { x: 0, y: 0, width: 1, height: 1 });
  const covered = layer("wooden table surface", {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  const visibleMask = new Uint8Array([0, 255, 128]);
  const emptyMask = new Uint8Array(3);

  const result = retainVisibleLayerMasks(
    [top, covered],
    [visibleMask, emptyMask],
  );

  assert.deepEqual(result.droppedLayerNames, ["wooden table surface"]);
  assert.equal(result.retained.length, 1);
  assert.equal(result.retained[0].layer, top);
  assert.equal(result.retained[0].mask, visibleMask);
  assert.equal(result.retained[0].sourceIndex, 0);
});

test("retainVisibleLayerMasks rejects mismatched input counts", () => {
  assert.throws(
    () =>
      retainVisibleLayerMasks(
        [layer("phone", { x: 0, y: 0, width: 1, height: 1 })],
        [],
      ),
    /counts do not match/,
  );
});
