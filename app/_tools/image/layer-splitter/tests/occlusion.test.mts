import assert from "node:assert/strict";
import test from "node:test";
import { resolveOcclusions } from "../code/occlusion.ts";
import type { LayerPlanItem } from "../types.ts";

function layer(
  id: string,
  order: number,
  occludedBy: string[] = [],
): LayerPlanItem {
  return {
    id,
    name: id,
    description: id,
    order,
    visibleBounds: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    reconstructionBounds: { x: 0, y: 0, width: 1, height: 1 },
    occludedBy,
  };
}

function rectangle(
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

test("resolveOcclusions infers a front layer touching a lower object", () => {
  const width = 20;
  const height = 12;
  const frontMask = rectangle(width, height, 5, 5, 15, 10);
  const backMask = rectangle(width, height, 3, 1, 17, 5);
  const resolved = resolveOcclusions(
    [
      { layer: layer("letter", 2), mask: frontMask },
      { layer: layer("telephone", 1), mask: backMask },
    ],
    width,
    height,
  );

  assert.deepEqual(resolved[1].occluderIds, ["letter"]);
  assert.deepEqual(resolved[1].inferredOccluderIds, ["letter"]);
  assert.equal(resolved[1].completionMask[6 * width + 10], 255);
  assert.equal(resolved[1].completionMask[2 * width + 10], 0);
  assert.equal(resolved[0].occluderIds.length, 0);
});

test("resolveOcclusions does not infer occlusion without reserved reconstruction area", () => {
  const width = 20;
  const height = 12;
  const backLayer = layer("telephone", 1);
  backLayer.reconstructionBounds = { ...backLayer.visibleBounds };
  const resolved = resolveOcclusions(
    [
      {
        layer: layer("letter", 2),
        mask: rectangle(width, height, 5, 5, 15, 10),
      },
      {
        layer: backLayer,
        mask: rectangle(width, height, 3, 1, 17, 5),
      },
    ],
    width,
    height,
  );

  assert.deepEqual(resolved[1].occluderIds, []);
  assert.equal(resolved[1].completionMask.some(Boolean), false);
});

test("resolveOcclusions honours an explicit front occluder without contact", () => {
  const width = 20;
  const height = 12;
  const frontMask = rectangle(width, height, 10, 5, 18, 10);
  const backMask = rectangle(width, height, 1, 1, 6, 5);
  const resolved = resolveOcclusions(
    [
      { layer: layer("letter", 2), mask: frontMask },
      {
        layer: layer("telephone", 1, ["letter"]),
        mask: backMask,
      },
    ],
    width,
    height,
  );

  assert.deepEqual(resolved[1].occluderIds, ["letter"]);
  assert.deepEqual(resolved[1].inferredOccluderIds, []);
  assert.equal(resolved[1].completionMask[6 * width + 14], 255);
});

test("resolveOcclusions ignores separated layers without an explicit relation", () => {
  const width = 20;
  const height = 12;
  const resolved = resolveOcclusions(
    [
      {
        layer: layer("letter", 2),
        mask: rectangle(width, height, 10, 5, 18, 10),
      },
      {
        layer: layer("telephone", 1),
        mask: rectangle(width, height, 1, 1, 6, 5),
      },
    ],
    width,
    height,
  );

  assert.deepEqual(resolved[1].occluderIds, []);
  assert.equal(resolved[1].completionMask.some(Boolean), false);
});
