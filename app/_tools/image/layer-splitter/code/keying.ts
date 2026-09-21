export type RgbaPixels = Uint8ClampedArray;

export type KeyColour = readonly [number, number, number];

export const KEY_COLOURS: readonly KeyColour[] = [
  [0, 255, 0],
  [255, 0, 255],
  [0, 220, 255],
];

function colourDistance(
  pixels: ArrayLike<number>,
  offset: number,
  key: KeyColour,
) {
  const red = pixels[offset] - key[0];
  const green = pixels[offset + 1] - key[1];
  const blue = pixels[offset + 2] - key[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

function isEdge(index: number, width: number, height: number) {
  const x = index % width;
  const y = Math.floor(index / width);
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

function neighbours(index: number, width: number, height: number) {
  const x = index % width;
  const y = Math.floor(index / width);
  const values: number[] = [];
  if (x > 0) values.push(index - 1);
  if (x + 1 < width) values.push(index + 1);
  if (y > 0) values.push(index - width);
  if (y + 1 < height) values.push(index + width);
  return values;
}

export function chooseKeyColour(
  source: ArrayLike<number>,
  width: number,
  height: number,
  bounds = { x: 0, y: 0, width: 1, height: 1 },
): KeyColour {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  const left = Math.floor(bounds.x * width);
  const top = Math.floor(bounds.y * height);
  const right = Math.min(width, Math.ceil((bounds.x + bounds.width) * width));
  const bottom = Math.min(height, Math.ceil((bounds.y + bounds.height) * height));
  for (let y = top; y < bottom; y += 2) {
    for (let x = left; x < right; x += 2) {
      const offset = (y * width + x) * 4;
      if (source[offset + 3] < 32) continue;
      red += source[offset];
      green += source[offset + 1];
      blue += source[offset + 2];
      count++;
    }
  }
  const average = count ? [red / count, green / count, blue / count] : [128, 128, 128];
  return KEY_COLOURS.reduce((best, candidate) => {
    const bestDistance = Math.sqrt(
      (average[0] - best[0]) ** 2 +
        (average[1] - best[1]) ** 2 +
        (average[2] - best[2]) ** 2,
    );
    const candidateDistance = Math.sqrt(
      (average[0] - candidate[0]) ** 2 +
        (average[1] - candidate[1]) ** 2 +
        (average[2] - candidate[2]) ** 2,
    );
    return candidateDistance > bestDistance ? candidate : best;
  });
}

export function extractChromaAlpha(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  key: KeyColour,
  threshold = 95,
) {
  if (pixels.length !== width * height * 4)
    throw new Error("The generated object has unexpected pixel dimensions.");
  const background = new Uint8Array(width * height);
  const queue: number[] = [];
  for (let index = 0; index < background.length; index++) {
    if (isEdge(index, width, height)) {
      const offset = index * 4;
      if (colourDistance(pixels, offset, key) <= threshold) {
        background[index] = 1;
        queue.push(index);
      }
    }
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    for (const next of neighbours(index, width, height)) {
      if (background[next]) continue;
      if (colourDistance(pixels, next * 4, key) <= threshold) {
        background[next] = 1;
        queue.push(next);
      }
    }
  }

  const result = new Uint8ClampedArray(pixels.length);
  let opaque = 0;
  let partial = 0;
  for (let index = 0; index < background.length; index++) {
    const sourceOffset = index * 4;
    result[sourceOffset] = pixels[sourceOffset];
    result[sourceOffset + 1] = pixels[sourceOffset + 1];
    result[sourceOffset + 2] = pixels[sourceOffset + 2];
    if (background[index]) {
      const distance = colourDistance(pixels, sourceOffset, key);
      const alpha = distance >= threshold ? 0 : Math.round((distance / threshold) * 255);
      result[sourceOffset + 3] = alpha;
      if (alpha > 0) partial++;
    } else {
      result[sourceOffset + 3] = 255;
      opaque++;
    }
    const alpha = result[sourceOffset + 3] / 255;
    if (alpha > 0 && alpha < 1) {
      const inverse = 1 - alpha;
      result[sourceOffset] = Math.max(0, Math.min(255, Math.round((result[sourceOffset] - key[0] * inverse) / alpha)));
      result[sourceOffset + 1] = Math.max(0, Math.min(255, Math.round((result[sourceOffset + 1] - key[1] * inverse) / alpha)));
      result[sourceOffset + 2] = Math.max(0, Math.min(255, Math.round((result[sourceOffset + 2] - key[2] * inverse) / alpha)));
    }
  }
  if (!opaque || opaque / background.length > 0.995)
    throw new Error("The generated object could not be isolated from its key background.");
  return { pixels: result, opaquePixels: opaque, partialPixels: partial };
}

export function assertOpaqueBackground(pixels: ArrayLike<number>) {
  if (pixels.length % 4 !== 0) throw new Error("The background has invalid pixel data.");
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 255)
      throw new Error("The generated background contains transparent holes.");
  }
}

export function hasVisiblePixels(pixels: ArrayLike<number>) {
  for (let index = 3; index < pixels.length; index += 4)
    if (pixels[index] > 8) return true;
  return false;
}
