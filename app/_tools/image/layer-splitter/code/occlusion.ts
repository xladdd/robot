import type { LayerPlanItem, NormalizedBounds } from "../types";
import { countOpaquePixels, type PixelBounds } from "./mask.ts";

export type OcclusionObject = {
  layer: LayerPlanItem;
  mask: Uint8Array;
};

export type ResolvedOcclusion = {
  completionMask: Uint8Array;
  occluderIds: string[];
  occluderNames: string[];
  inferredOccluderIds: string[];
};

function maskBounds(
  mask: Uint8Array,
  width: number,
  height: number,
): PixelBounds | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let index = 0; index < mask.length; index++) {
    if (mask[index] === 0) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return right < left
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function boundsIntersect(left: PixelBounds, right: PixelBounds, margin = 0) {
  return (
    left.x <= right.x + right.width - 1 + margin &&
    right.x <= left.x + left.width - 1 + margin &&
    left.y <= right.y + right.height - 1 + margin &&
    right.y <= left.y + left.height - 1 + margin
  );
}

function masksTouch(
  backMask: Uint8Array,
  frontMask: Uint8Array,
  backBounds: PixelBounds,
  frontBounds: PixelBounds,
  width: number,
  height: number,
) {
  const radius = 3;
  if (!boundsIntersect(backBounds, frontBounds, radius)) return false;
  const left = Math.max(0, Math.max(backBounds.x, frontBounds.x - radius));
  const top = Math.max(0, Math.max(backBounds.y, frontBounds.y - radius));
  const right = Math.min(
    width,
    Math.min(
      backBounds.x + backBounds.width,
      frontBounds.x + frontBounds.width + radius,
    ),
  );
  const bottom = Math.min(
    height,
    Math.min(
      backBounds.y + backBounds.height,
      frontBounds.y + frontBounds.height + radius,
    ),
  );
  const requiredContact = Math.max(
    8,
    Math.round(Math.min(width, height) * 0.01),
  );
  let contact = 0;
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) {
      if (backMask[y * width + x] === 0) continue;
      let touches = false;
      for (
        let ny = Math.max(0, y - radius);
        ny <= Math.min(height - 1, y + radius) && !touches;
        ny++
      )
        for (
          let nx = Math.max(0, x - radius);
          nx <= Math.min(width - 1, x + radius);
          nx++
        ) {
          if (Math.abs(nx - x) + Math.abs(ny - y) > radius) continue;
          if (frontMask[ny * width + nx]) {
            touches = true;
            break;
          }
        }
      if (touches && ++contact >= requiredContact) return true;
    }
  return false;
}

function normalizedToPixelBounds(
  bounds: NormalizedBounds,
  width: number,
  height: number,
): PixelBounds {
  const x = Math.max(0, Math.floor(bounds.x * width));
  const y = Math.max(0, Math.floor(bounds.y * height));
  const right = Math.min(width, Math.ceil((bounds.x + bounds.width) * width));
  const bottom = Math.min(
    height,
    Math.ceil((bounds.y + bounds.height) * height),
  );
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function hasReconstructionExpansion(layer: LayerPlanItem) {
  const visible = layer.visibleBounds;
  const reconstruction = layer.reconstructionBounds;
  const visibleRight = visible.x + visible.width;
  const visibleBottom = visible.y + visible.height;
  const reconstructionRight = reconstruction.x + reconstruction.width;
  const reconstructionBottom = reconstruction.y + reconstruction.height;
  const minimumExpansion = 0.005;
  return (
    reconstruction.x < visible.x - minimumExpansion ||
    reconstruction.y < visible.y - minimumExpansion ||
    reconstructionRight > visibleRight + minimumExpansion ||
    reconstructionBottom > visibleBottom + minimumExpansion
  );
}

function candidateContributes(
  frontMask: Uint8Array,
  backMask: Uint8Array,
  bounds: PixelBounds,
  width: number,
) {
  for (let y = bounds.y; y < bounds.y + bounds.height; y++)
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const index = y * width + x;
      if (frontMask[index] && !backMask[index]) return true;
    }
  return false;
}

export function resolveOcclusions(
  objectsTopFirst: readonly OcclusionObject[],
  width: number,
  height: number,
): ResolvedOcclusion[] {
  const length = width * height;
  for (const { mask } of objectsTopFirst)
    if (mask.length !== length)
      throw new Error("Mask dimensions do not match the image.");

  const bounds = objectsTopFirst.map(({ mask }) =>
    maskBounds(mask, width, height),
  );
  return objectsTopFirst.map(({ layer, mask }, backIndex) => {
    const reconstructionBounds = normalizedToPixelBounds(
      layer.reconstructionBounds,
      width,
      height,
    );
    const explicitIds = new Set(layer.occludedBy);
    const occluders: Array<{
      id: string;
      name: string;
      mask: Uint8Array;
      inferred: boolean;
    }> = [];

    for (let frontIndex = 0; frontIndex < backIndex; frontIndex++) {
      const front = objectsTopFirst[frontIndex];
      const explicit = explicitIds.has(front.layer.id);
      const backBounds = bounds[backIndex];
      const frontBounds = bounds[frontIndex];
      const inferred =
        !explicit &&
        hasReconstructionExpansion(layer) &&
        backBounds !== null &&
        frontBounds !== null &&
        masksTouch(mask, front.mask, backBounds, frontBounds, width, height);
      if (
        (explicit || inferred) &&
        candidateContributes(front.mask, mask, reconstructionBounds, width)
      )
        occluders.push({
          id: front.layer.id,
          name: front.layer.name,
          mask: front.mask,
          inferred,
        });
    }

    const completionMask = new Uint8Array(length);
    for (
      let y = reconstructionBounds.y;
      y < reconstructionBounds.y + reconstructionBounds.height;
      y++
    )
      for (
        let x = reconstructionBounds.x;
        x < reconstructionBounds.x + reconstructionBounds.width;
        x++
      ) {
        const index = y * width + x;
        if (mask[index]) continue;
        if (occluders.some((occluder) => occluder.mask[index]))
          completionMask[index] = 255;
      }

    if (countOpaquePixels(completionMask) < 32)
      return {
        completionMask: new Uint8Array(length),
        occluderIds: [],
        occluderNames: [],
        inferredOccluderIds: [],
      };
    return {
      completionMask,
      occluderIds: occluders.map(({ id }) => id),
      occluderNames: occluders.map(({ name }) => name),
      inferredOccluderIds: occluders
        .filter(({ inferred }) => inferred)
        .map(({ id }) => id),
    };
  });
}
