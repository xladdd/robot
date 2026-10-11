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
): Uint8ClampedArray {
  if (originalPixels.length !== width * height * 4)
    throw new Error("Original pixel dimensions do not match.");
  if (generatedPixels.length !== width * height * 4)
    throw new Error("Generated pixel dimensions do not match.");
  if (hardHoleMask.length !== width * height)
    throw new Error("Hole mask dimensions do not match the image.");
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
