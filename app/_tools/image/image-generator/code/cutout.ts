// In-browser background removal for illustrations drawn on a light page.
// The pixel pass is a port of the flood-fill cutout validated against
// the storybook styles: it removes the page and the soft warm contact
// shadow while leaving the subject's pixels untouched, and it estimates
// alpha on the anti-aliased rim by un-blending against white so the
// edges stay free of halos.

const LIGHT_MIN = 180;
const SPREAD_MAX = 95;
const SEED_LIGHT_MIN = 240;
const SEED_SPREAD_MAX = 30;
const GRADIENT_MAX = 40;
const RIM_DILATIONS = 2;
const CORE_PROPAGATION = 4;
const RIM_ALPHA_MIN = 0.05;

const UNKNOWN = 0;
const BACKGROUND = 1;

export type CutoutResult = {
  // True when at least one pixel was made transparent; false means the
  // image had no removable light border and should stay untouched.
  changed: boolean;
  // Share of pixels that became fully transparent.
  transparentRatio: number;
};

export function removeLightBackground(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): CutoutResult {
  const pixelCount = width * height;
  if (!pixelCount) return { changed: false, transparentRatio: 0 };

  const state = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let tail = 0;

  const minChannel = (index: number) =>
    Math.min(rgba[index * 4], rgba[index * 4 + 1], rgba[index * 4 + 2]);
  const spread = (index: number) =>
    Math.max(rgba[index * 4], rgba[index * 4 + 1], rgba[index * 4 + 2]) -
    minChannel(index);
  const maxDiff = (a: number, b: number) =>
    Math.max(
      Math.abs(rgba[a * 4] - rgba[b * 4]),
      Math.abs(rgba[a * 4 + 1] - rgba[b * 4 + 1]),
      Math.abs(rgba[a * 4 + 2] - rgba[b * 4 + 2]),
    );

  // Seed the fill with pure page pixels on the image border.
  for (let x = 0; x < width; x += 1) {
    for (const y of [0, height - 1]) {
      const index = y * width + x;
      if (
        state[index] === UNKNOWN &&
        minChannel(index) >= SEED_LIGHT_MIN &&
        spread(index) <= SEED_SPREAD_MAX
      ) {
        state[index] = BACKGROUND;
        queue[tail] = index;
        tail += 1;
      }
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (const x of [0, width - 1]) {
      const index = y * width + x;
      if (
        state[index] === UNKNOWN &&
        minChannel(index) >= SEED_LIGHT_MIN &&
        spread(index) <= SEED_SPREAD_MAX
      ) {
        state[index] = BACKGROUND;
        queue[tail] = index;
        tail += 1;
      }
    }
  }
  if (tail === 0) return { changed: false, transparentRatio: 0 };

  // Flood fill with a local gradient guard: a pixel joins the
  // background when it is light and low-chroma enough and sits within
  // a small color step of the background it grows from. Soft shadow
  // gradients pass; the subject's painted outline does not.
  for (let head = 0; head < tail; head += 1) {
    const current = queue[head];
    const x = current % width;
    const y = (current - x) / width;
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const neighbor = ny * width + nx;
      if (state[neighbor] !== UNKNOWN) continue;
      if (minChannel(neighbor) < LIGHT_MIN || spread(neighbor) > SPREAD_MAX)
        continue;
      if (maxDiff(neighbor, current) > GRADIENT_MAX) continue;
      state[neighbor] = BACKGROUND;
      queue[tail] = neighbor;
      tail += 1;
    }
  }

  let backgroundCount = 0;
  for (let index = 0; index < pixelCount; index += 1)
    if (state[index] === BACKGROUND) backgroundCount += 1;
  if (backgroundCount === 0) return { changed: false, transparentRatio: 0 };

  // Rim: subject pixels within RIM_DILATIONS of the background. Their
  // alpha is estimated against white using the nearest core color, so
  // anti-aliased edges do not keep a light fringe.
  const nearBackground = new Uint8Array(pixelCount);
  let frontier: number[] = [];
  for (let index = 0; index < pixelCount; index += 1) {
    if (state[index] === BACKGROUND) {
      nearBackground[index] = 1;
      frontier.push(index);
    }
  }
  const isSubject = (index: number) => state[index] !== BACKGROUND;
  for (let step = 0; step < RIM_DILATIONS; step += 1) {
    const next: number[] = [];
    for (const index of frontier) {
      const x = index % width;
      const y = (index - x) / width;
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ] as const) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighbor = ny * width + nx;
        if (nearBackground[neighbor]) continue;
        nearBackground[neighbor] = 1;
        if (isSubject(neighbor)) next.push(neighbor);
      }
    }
    frontier = next;
  }

  const isRim = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    if (nearBackground[index] && isSubject(index)) isRim[index] = 1;
  }

  // Propagate core subject colors outward so every rim pixel knows the
  // solid color it is blending toward.
  const coreColor = new Int32Array(pixelCount).fill(-1);
  let colorFrontier: number[] = [];
  for (let index = 0; index < pixelCount; index += 1) {
    if (isSubject(index) && !isRim[index]) {
      coreColor[index] = index;
      colorFrontier.push(index);
    }
  }
  for (let step = 0; step < CORE_PROPAGATION && colorFrontier.length; step += 1) {
    const next: number[] = [];
    for (const index of colorFrontier) {
      const x = index % width;
      const y = (index - x) / width;
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ] as const) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighbor = ny * width + nx;
        if (coreColor[neighbor] !== -1) continue;
        coreColor[neighbor] = coreColor[index];
        next.push(neighbor);
      }
    }
    colorFrontier = next;
  }

  // Apply: background becomes transparent, rim pixels get estimated
  // alpha and their color un-blended from white.
  for (let index = 0; index < pixelCount; index += 1) {
    if (state[index] === BACKGROUND) {
      rgba[index * 4 + 3] = 0;
      continue;
    }
    if (!isRim[index] || coreColor[index] === -1) continue;
    const source = coreColor[index];
    let denom = 0;
    let numerator = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const subjectDelta = rgba[source * 4 + channel] - 255;
      const pixelDelta = rgba[index * 4 + channel] - 255;
      denom += subjectDelta * subjectDelta;
      numerator += pixelDelta * subjectDelta;
    }
    const alpha = denom === 0 ? 0 : Math.min(1, Math.max(0, numerator / denom));
    if (alpha <= RIM_ALPHA_MIN) {
      rgba[index * 4 + 3] = 0;
      continue;
    }
    for (let channel = 0; channel < 3; channel += 1) {
      const unblended =
        (rgba[index * 4 + channel] - (1 - alpha) * 255) / alpha;
      rgba[index * 4 + channel] = Math.min(255, Math.max(0, unblended));
    }
    rgba[index * 4 + 3] = Math.round(alpha * 255);
  }

  return {
    changed: true,
    transparentRatio: backgroundCount / pixelCount,
  };
}

// Browser wrapper: decodes the generated image on a canvas, runs the
// pixel pass, and returns a PNG data URL — or null when the image has
// no removable light background (or cannot be processed).
export async function cutoutDataUrl(dataUrl: string): Promise<string | null> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("The image could not be decoded."));
    element.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = removeLightBackground(
    imageData.data,
    canvas.width,
    canvas.height,
  );
  if (!result.changed) return null;
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}
