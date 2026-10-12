import type { LayerPlanItem, NormalizedBounds } from "../types";
import { connectedMaskBounds, countOpaquePixels } from "./mask.ts";

export function alphaMaskFromPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (pixels.length !== width * height * 4)
    throw new Error("Layer pixel dimensions do not match.");
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3];
  return mask;
}

function maskBounds(
  mask: Uint8Array,
  width: number,
  height: number,
): NormalizedBounds | null {
  const components = connectedMaskBounds(mask, width, height);
  if (!components.length) return null;
  const left = Math.min(...components.map(({ x }) => x));
  const top = Math.min(...components.map(({ y }) => y));
  const right = Math.max(
    ...components.map(({ x, width: componentWidth }) => x + componentWidth),
  );
  const bottom = Math.max(
    ...components.map(({ y, height: componentHeight }) => y + componentHeight),
  );
  return {
    x: left / width,
    y: top / height,
    width: (right - left) / width,
    height: (bottom - top) / height,
  };
}

function intersectionOverUnion(
  left: NormalizedBounds,
  right: NormalizedBounds,
) {
  const intersectionLeft = Math.max(left.x, right.x);
  const intersectionTop = Math.max(left.y, right.y);
  const intersectionRight = Math.min(
    left.x + left.width,
    right.x + right.width,
  );
  const intersectionBottom = Math.min(
    left.y + left.height,
    right.y + right.height,
  );
  const intersection =
    Math.max(0, intersectionRight - intersectionLeft) *
    Math.max(0, intersectionBottom - intersectionTop);
  const union =
    left.width * left.height + right.width * right.height - intersection;
  return union > 0 ? intersection / union : 0;
}

export function retainVisibleLayerMasks(
  layers: readonly LayerPlanItem[],
  masks: readonly Uint8Array[],
) {
  if (layers.length !== masks.length)
    throw new Error("Layer and mask counts do not match.");

  const retained: Array<{
    layer: LayerPlanItem;
    mask: Uint8Array;
    sourceIndex: number;
  }> = [];
  const droppedLayerNames: string[] = [];
  for (let sourceIndex = 0; sourceIndex < layers.length; sourceIndex++) {
    const layer = layers[sourceIndex];
    const mask = masks[sourceIndex];
    if (countOpaquePixels(mask) === 0) {
      droppedLayerNames.push(layer.name);
      continue;
    }
    retained.push({ layer, mask, sourceIndex });
  }
  return { retained, droppedLayerNames };
}

export function matchDecompositionMasks(
  masks: readonly Uint8Array[],
  layers: readonly LayerPlanItem[],
  width: number,
  height: number,
): Array<Uint8Array | null> {
  const candidates = masks
    .map((mask, index) => ({
      index,
      mask,
      opaque: countOpaquePixels(mask),
      bounds: maskBounds(mask, width, height),
    }))
    .filter(
      (candidate) =>
        candidate.bounds &&
        candidate.opaque >= 32 &&
        candidate.opaque < width * height * 0.9,
    ) as Array<{
    index: number;
    mask: Uint8Array;
    opaque: number;
    bounds: NormalizedBounds;
  }>;

  const pairs = candidates.flatMap((candidate) =>
    layers.map((layer, layerIndex) => ({
      candidate,
      layerIndex,
      score: intersectionOverUnion(candidate.bounds, layer.visibleBounds),
    })),
  );
  pairs.sort((left, right) => right.score - left.score);

  const result: Array<Uint8Array | null> = layers.map(() => null);
  const usedCandidates = new Set<number>();
  for (const pair of pairs) {
    if (pair.score < 0.12) break;
    if (result[pair.layerIndex] || usedCandidates.has(pair.candidate.index))
      continue;
    result[pair.layerIndex] = pair.candidate.mask;
    usedCandidates.add(pair.candidate.index);
  }
  return result;
}
