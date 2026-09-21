export type CompositeLayer = {
  pixels: ArrayLike<number>;
  name: string;
};

export function compositeLayers(
  width: number,
  height: number,
  layersTopFirst: readonly CompositeLayer[],
) {
  const length = width * height * 4;
  const result = new Uint8ClampedArray(length);
  for (let layerIndex = layersTopFirst.length - 1; layerIndex >= 0; layerIndex--) {
    const layer = layersTopFirst[layerIndex].pixels;
    if (layer.length !== length) throw new Error("Layer dimensions do not match.");
    for (let offset = 0; offset < length; offset += 4) {
      const sourceAlpha = layer[offset + 3] / 255;
      if (sourceAlpha <= 0) continue;
      const destinationAlpha = result[offset + 3] / 255;
      const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
      if (outputAlpha <= 0) continue;
      result[offset] = Math.round(
        (layer[offset] * sourceAlpha + result[offset] * destinationAlpha * (1 - sourceAlpha)) /
          outputAlpha,
      );
      result[offset + 1] = Math.round(
        (layer[offset + 1] * sourceAlpha + result[offset + 1] * destinationAlpha * (1 - sourceAlpha)) /
          outputAlpha,
      );
      result[offset + 2] = Math.round(
        (layer[offset + 2] * sourceAlpha + result[offset + 2] * destinationAlpha * (1 - sourceAlpha)) /
          outputAlpha,
      );
      result[offset + 3] = Math.round(outputAlpha * 255);
    }
  }
  return result;
}

export function isOpaque(pixels: ArrayLike<number>) {
  for (let offset = 3; offset < pixels.length; offset += 4)
    if (pixels[offset] !== 255) return false;
  return true;
}
