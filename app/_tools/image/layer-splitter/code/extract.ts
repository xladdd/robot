export function extractLayerFromSource(
  sourcePixels: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (sourcePixels.length !== width * height * 4)
    throw new Error("Source pixel dimensions do not match.");
  if (mask.length !== width * height)
    throw new Error("Mask dimensions do not match the image.");
  const result = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    result[offset] = sourcePixels[offset];
    result[offset + 1] = sourcePixels[offset + 1];
    result[offset + 2] = sourcePixels[offset + 2];
    result[offset + 3] = Math.round((sourcePixels[offset + 3] * mask[i]) / 255);
  }
  return result;
}

export function eraseTransparentPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (pixels.length !== width * height * 4)
    throw new Error("Pixel dimensions do not match.");
  const result = new Uint8ClampedArray(pixels);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    if (result[offset + 3] > 8) continue;
    result[offset] = 0;
    result[offset + 1] = 0;
    result[offset + 2] = 0;
    result[offset + 3] = 0;
  }
  return result;
}

export function eraseMaskedPixels(
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (pixels.length !== width * height * 4)
    throw new Error("Pixel dimensions do not match.");
  if (mask.length !== width * height)
    throw new Error("Mask dimensions do not match the image.");
  const result = new Uint8ClampedArray(pixels);
  for (let i = 0; i < width * height; i++) {
    if (mask[i] !== 255) continue;
    const offset = i * 4;
    result[offset] = 0;
    result[offset + 1] = 0;
    result[offset + 2] = 0;
    result[offset + 3] = 0;
  }
  return result;
}

export function patchBackground(
  originalPixels: Uint8ClampedArray,
  generatedPixels: Uint8ClampedArray,
  hardHoleMask: Uint8Array,
  width: number,
  height: number,
  seamRadius = 0,
): Uint8ClampedArray {
  if (originalPixels.length !== width * height * 4)
    throw new Error("Original pixel dimensions do not match.");
  if (generatedPixels.length !== width * height * 4)
    throw new Error("Generated pixel dimensions do not match.");
  if (hardHoleMask.length !== width * height)
    throw new Error("Hole mask dimensions do not match the image.");
  if (!Number.isInteger(seamRadius) || seamRadius < 0)
    throw new Error("Background seam radius must be a non-negative integer.");
  const result = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    const mask = hardHoleMask[i];
    if (mask !== 0 && mask !== 255)
      throw new Error("Background patch masks must be binary.");
    const source = mask === 255 ? generatedPixels : originalPixels;
    result[offset] = source[offset];
    result[offset + 1] = source[offset + 1];
    result[offset + 2] = source[offset + 2];
    result[offset + 3] = 255;
  }
  if (seamRadius === 0) return result;

  const remaining = new Uint8Array(hardHoleMask);
  const ring = new Uint8Array(hardHoleMask.length);
  for (let distance = 1; distance <= seamRadius; distance++) {
    ring.fill(0);
    let ringSize = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (!remaining[index]) continue;
        if (
          x === 0 ||
          x + 1 === width ||
          y === 0 ||
          y + 1 === height ||
          !remaining[index - 1] ||
          !remaining[index + 1] ||
          !remaining[index - width] ||
          !remaining[index + width]
        ) {
          ring[index] = 1;
          ringSize++;
        }
      }
    if (!ringSize) break;
    const generatedWeight = distance / (seamRadius + 1);
    const originalWeight = 1 - generatedWeight;
    for (let index = 0; index < ring.length; index++) {
      if (!ring[index]) continue;
      const offset = index * 4;
      for (let channel = 0; channel < 3; channel++)
        result[offset + channel] = Math.round(
          originalPixels[offset + channel] * originalWeight +
            generatedPixels[offset + channel] * generatedWeight,
        );
      remaining[index] = 0;
    }
  }
  return result;
}

export function clipPixelsToMask(
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (pixels.length !== width * height * 4)
    throw new Error("Pixel dimensions do not match.");
  if (mask.length !== width * height)
    throw new Error("Mask dimensions do not match the image.");
  const result = new Uint8ClampedArray(pixels);
  for (let i = 0; i < width * height; i++)
    result[i * 4 + 3] = Math.round((result[i * 4 + 3] * mask[i]) / 255);
  return result;
}

export function compositeOriginalOverGenerated(
  originalPixels: Uint8ClampedArray,
  generatedPixels: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (originalPixels.length !== width * height * 4)
    throw new Error("Original pixel dimensions do not match.");
  if (generatedPixels.length !== width * height * 4)
    throw new Error("Generated pixel dimensions do not match.");
  const result = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    const srcAlpha = originalPixels[offset + 3] / 255;
    const dstAlpha = generatedPixels[offset + 3] / 255;
    const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
    if (outAlpha <= 0) continue;
    result[offset] = Math.round(
      (originalPixels[offset] * srcAlpha +
        generatedPixels[offset] * dstAlpha * (1 - srcAlpha)) /
        outAlpha,
    );
    result[offset + 1] = Math.round(
      (originalPixels[offset + 1] * srcAlpha +
        generatedPixels[offset + 1] * dstAlpha * (1 - srcAlpha)) /
        outAlpha,
    );
    result[offset + 2] = Math.round(
      (originalPixels[offset + 2] * srcAlpha +
        generatedPixels[offset + 2] * dstAlpha * (1 - srcAlpha)) /
        outAlpha,
    );
    result[offset + 3] = Math.round(outAlpha * 255);
  }
  return result;
}
