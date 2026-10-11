import sharp from "sharp";

export const MASK_GRID_SIZE = 32;
export const MASK_FOREGROUND_THRESHOLD = 8;

export type ContourPoint = { x: number; y: number };
export type MaskComponent = {
  outer: ContourPoint[];
  holes: ContourPoint[][];
};
export type PixelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function samePoint(left: ContourPoint, right: ContourPoint) {
  return left.x === right.x && left.y === right.y;
}

function parseRing(
  value: unknown,
  label: string,
  minimumPoints: number,
): ContourPoint[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a point array.`);
  const points = value.map((entry) => {
    let x: unknown;
    let y: unknown;
    if (Array.isArray(entry) && entry.length === 2) [x, y] = entry;
    else if (entry && typeof entry === "object") {
      const point = entry as Record<string, unknown>;
      x = point.x;
      y = point.y;
    } else throw new Error(`${label} contains an invalid point.`);
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      x > 1000 ||
      y < 0 ||
      y > 1000
    )
      throw new Error(`${label} coordinates must be numbers from 0 to 1000.`);
    return { x, y };
  });
  if (points.length > 1 && samePoint(points[0], points[points.length - 1]))
    points.pop();
  if (
    points.length < minimumPoints ||
    new Set(points.map(({ x, y }) => `${x}:${y}`)).size < minimumPoints
  )
    throw new Error(
      `${label} needs at least ${minimumPoints} distinct points.`,
    );
  return points;
}

export function parseMaskComponents(value: unknown): {
  components: MaskComponent[];
  confidence: number;
} {
  const candidate =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const raw = candidate.components;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 32)
    throw new Error("The mask trace must contain 1 to 32 components.");
  let pointCount = 0;
  const components = raw.map((entry, componentIndex) => {
    if (!entry || typeof entry !== "object")
      throw new Error(`Component ${componentIndex + 1} is invalid.`);
    const component = entry as Record<string, unknown>;
    const outer = parseRing(
      component.outer,
      `Component ${componentIndex + 1} outer ring`,
      8,
    );
    const rawHoles = component.holes ?? [];
    if (!Array.isArray(rawHoles) || rawHoles.length > 32)
      throw new Error(`Component ${componentIndex + 1} holes are invalid.`);
    const holes = rawHoles.map((hole, holeIndex) =>
      parseRing(
        hole,
        `Component ${componentIndex + 1} hole ${holeIndex + 1}`,
        3,
      ),
    );
    pointCount += outer.length;
    for (const hole of holes) pointCount += hole.length;
    return { outer, holes };
  });
  if (pointCount > 1200)
    throw new Error("The mask trace returned too many boundary points.");
  const confidence = candidate.confidence;
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  )
    throw new Error("The mask trace returned an invalid confidence value.");
  return { components, confidence };
}

function ringToMask(
  contour: readonly ContourPoint[],
  width: number,
  height: number,
): Uint8Array {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("Mask dimensions must be positive integers.");
  if (contour.length < 3)
    throw new Error("The contour needs at least three points.");
  const subsamples = 2;
  const gridWidth = width * subsamples;
  const gridHeight = height * subsamples;
  const points = contour.map(({ x, y }) => ({
    x: (Math.min(1000, Math.max(0, x)) / 1000) * gridWidth,
    y: (Math.min(1000, Math.max(0, y)) / 1000) * gridHeight,
  }));
  const grid = new Uint8Array(gridWidth * gridHeight);
  for (let row = 0; row < gridHeight; row++) {
    const scanline = row + 0.5;
    const crossings: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (a.y === b.y) continue;
      const top = Math.min(a.y, b.y);
      const bottom = Math.max(a.y, b.y);
      if (scanline >= top && scanline < bottom)
        crossings.push(a.x + ((scanline - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    crossings.sort((left, right) => left - right);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const first = Math.max(0, Math.ceil(crossings[i] - 0.5));
      const last = Math.min(
        gridWidth - 1,
        Math.ceil(crossings[i + 1] - 0.5) - 1,
      );
      const offset = row * gridWidth;
      for (let x = first; x <= last; x++) grid[offset + x] = 1;
    }
  }
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let covered = 0;
      for (let dy = 0; dy < subsamples; dy++)
        for (let dx = 0; dx < subsamples; dx++)
          if (grid[(y * subsamples + dy) * gridWidth + x * subsamples + dx])
            covered++;
      mask[y * width + x] = Math.round(
        (covered * 255) / (subsamples * subsamples),
      );
    }
  return mask;
}

export function componentsToMask(
  components: readonly MaskComponent[],
  width: number,
  height: number,
): Uint8Array {
  if (!components.length)
    throw new Error("At least one mask component is required.");
  const result = new Uint8Array(width * height);
  for (const component of components) {
    const componentMask = ringToMask(component.outer, width, height);
    for (const hole of component.holes) {
      const holeMask = ringToMask(hole, width, height);
      for (let i = 0; i < componentMask.length; i++)
        componentMask[i] = Math.round(
          (componentMask[i] * (255 - holeMask[i])) / 255,
        );
    }
    for (let i = 0; i < result.length; i++)
      if (componentMask[i] > result[i]) result[i] = componentMask[i];
  }
  return result;
}

// Backwards-compatible helper used by focused rasterization tests.
export function polygonToMask(
  contour: readonly ContourPoint[],
  width: number,
  height: number,
): Uint8Array {
  return componentsToMask([{ outer: [...contour], holes: [] }], width, height);
}

export function boundsToMask(
  bounds: { x: number; y: number; width: number; height: number },
  gridSize: number,
): Uint8Array {
  const mask = new Uint8Array(gridSize * gridSize);
  const left = Math.floor(bounds.x * gridSize);
  const top = Math.floor(bounds.y * gridSize);
  const right = Math.min(
    gridSize,
    Math.ceil((bounds.x + bounds.width) * gridSize),
  );
  const bottom = Math.min(
    gridSize,
    Math.ceil((bounds.y + bounds.height) * gridSize),
  );
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) mask[y * gridSize + x] = 255;
  return mask;
}

export async function upscaleMask(
  mask: Uint8Array,
  gridSize: number,
  width: number,
  height: number,
  featherSigma = 0,
): Promise<Uint8Array> {
  let pipeline = sharp(Buffer.from(mask), {
    raw: { width: gridSize, height: gridSize, channels: 1 },
  }).resize(width, height, { kernel: "lanczos3" });
  if (featherSigma > 0) pipeline = pipeline.blur(featherSigma);
  // sharp promotes single-channel raw input to three channels during the
  // pipeline; force grayscale output so the buffer is exactly width*height.
  const { data } = await pipeline
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

export async function blurMask(
  mask: Uint8Array,
  width: number,
  height: number,
  sigma: number,
): Promise<Uint8Array> {
  const { data } = await sharp(Buffer.from(mask), {
    raw: { width, height, channels: 1 },
  })
    .blur(sigma)
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

export function combineMasks(
  masks: readonly Uint8Array[],
  width: number,
  height: number,
): Uint8Array {
  const combined = new Uint8Array(width * height);
  for (const mask of masks) {
    if (mask.length !== combined.length)
      throw new Error("Mask dimensions do not match the image.");
    for (let i = 0; i < combined.length; i++) {
      if (mask[i] > combined[i]) combined[i] = mask[i];
    }
  }
  return combined;
}

export function countOpaquePixels(mask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++)
    if (mask[i] > MASK_FOREGROUND_THRESHOLD) count++;
  return count;
}

export function hardenMask(
  mask: Uint8Array,
  threshold = MASK_FOREGROUND_THRESHOLD,
): Uint8Array {
  if (threshold < 0 || threshold > 254)
    throw new Error("Mask threshold must be from 0 to 254.");
  const result = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++)
    result[i] = mask[i] > threshold ? 255 : 0;
  return result;
}

export function makeMasksExclusive(
  masksTopFirst: readonly Uint8Array[],
  width: number,
  height: number,
): Uint8Array[] {
  const length = width * height;
  const claimed = new Uint8Array(length);
  return masksTopFirst.map((mask) => {
    if (mask.length !== length)
      throw new Error("Mask dimensions do not match the image.");
    const exclusive = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      if (claimed[i] || mask[i] <= MASK_FOREGROUND_THRESHOLD) continue;
      exclusive[i] = mask[i];
      claimed[i] = 1;
    }
    return exclusive;
  });
}

export function connectedMaskBounds(
  mask: Uint8Array,
  width: number,
  height: number,
): PixelBounds[] {
  if (mask.length !== width * height)
    throw new Error("Mask dimensions do not match the image.");
  const work = hardenMask(mask);
  const bounds: PixelBounds[] = [];
  const stack: number[] = [];
  for (let seed = 0; seed < work.length; seed++) {
    if (!work[seed]) continue;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    stack.push(seed);
    while (stack.length) {
      const index = stack.pop() as number;
      if (!work[index]) continue;
      const y = Math.floor(index / width);
      const seedX = index - y * width;
      let left = seedX;
      let right = seedX;
      while (left > 0 && work[y * width + left - 1]) left--;
      while (right + 1 < width && work[y * width + right + 1]) right++;
      for (let x = left; x <= right; x++) work[y * width + x] = 0;
      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const nextY of [y - 1, y + 1]) {
        if (nextY < 0 || nextY >= height) continue;
        let inRun = false;
        for (
          let x = Math.max(0, left - 1);
          x <= Math.min(width - 1, right + 1);
          x++
        ) {
          const neighbour = nextY * width + x;
          if (work[neighbour] && !inRun) {
            stack.push(neighbour);
            inRun = true;
          } else if (!work[neighbour]) inRun = false;
        }
      }
    }
    bounds.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    });
  }
  return bounds.sort((left, right) => left.y - right.y || left.x - right.x);
}

export function fractionInsideBounds(
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: { x: number; y: number; width: number; height: number },
): number {
  const marginX = Math.round(width * 0.05);
  const marginY = Math.round(height * 0.05);
  const left = Math.floor(bounds.x * width) - marginX;
  const top = Math.floor(bounds.y * height) - marginY;
  const right = Math.ceil((bounds.x + bounds.width) * width) + marginX;
  const bottom = Math.ceil((bounds.y + bounds.height) * height) + marginY;
  let inside = 0;
  let total = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (mask[index] <= 127) continue;
      total++;
      if (x >= left && x < right && y >= top && y < bottom) inside++;
    }
  return total ? inside / total : 0;
}

type Rgb = readonly [number, number, number];

function morphPass(
  current: Uint8Array,
  width: number,
  height: number,
  dilate: boolean,
): Uint8Array {
  const next = new Uint8Array(current.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let value = dilate ? 0 : 255;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++)
        for (
          let nx = Math.max(0, x - 1);
          nx <= Math.min(width - 1, x + 1);
          nx++
        ) {
          const sample = current[ny * width + nx];
          value = dilate ? Math.max(value, sample) : Math.min(value, sample);
        }
      next[y * width + x] = value;
    }
  return next;
}

function sampleColors(
  source: Uint8ClampedArray,
  candidates: number[],
  limit: number,
): Rgb[] {
  const step = Math.max(1, Math.floor(candidates.length / limit));
  const samples: Rgb[] = [];
  for (let i = 0; i < candidates.length && samples.length < limit; i += step) {
    const offset = candidates[i] * 4;
    samples.push([source[offset], source[offset + 1], source[offset + 2]]);
  }
  return samples;
}

function nearestColourDistance(
  red: number,
  green: number,
  blue: number,
  samples: readonly Rgb[],
): number {
  let best = Infinity;
  for (const [r, g, b] of samples) {
    const dr = red - r;
    const dg = green - g;
    const db = blue - b;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < best) best = distance;
  }
  return best;
}

// Snaps a coarse polygon mask onto actual image boundaries: pixels in the
// uncertainty ring around the mask edge are re-classified by colour affinity
// to the object interior versus the surrounding background, then smoothed.
export function refineMaskEdges(
  source: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  radius = 4,
): Uint8Array {
  if (source.length !== width * height * 4)
    throw new Error("Source pixel dimensions do not match.");
  if (mask.length !== width * height)
    throw new Error("Mask dimensions do not match the image.");
  const binary = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) binary[i] = mask[i] > 127 ? 255 : 0;
  let interior: Uint8Array = binary;
  let outer: Uint8Array = binary;
  for (let i = 0; i < radius; i++) {
    interior = morphPass(interior, width, height, false);
    outer = morphPass(outer, width, height, true);
  }
  const interiorIndices: number[] = [];
  const exteriorIndices: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (interior[i] > 0) interiorIndices.push(i);
    else if (outer[i] === 0) exteriorIndices.push(i);
  }
  const interiorSamples = sampleColors(source, interiorIndices, 24);
  const exteriorSamples = sampleColors(source, exteriorIndices, 24);
  if (interiorSamples.length < 4 || exteriorSamples.length < 4) return mask;
  const band: number[] = [];
  for (let i = 0; i < mask.length; i++)
    if (outer[i] > 0 && interior[i] === 0) band.push(i);
  const refined = new Uint8Array(mask);
  for (const index of band) {
    const offset = index * 4;
    const objectDistance = nearestColourDistance(
      source[offset],
      source[offset + 1],
      source[offset + 2],
      interiorSamples,
    );
    const backgroundDistance = nearestColourDistance(
      source[offset],
      source[offset + 1],
      source[offset + 2],
      exteriorSamples,
    );
    refined[index] = objectDistance <= backgroundDistance ? 255 : 0;
  }
  // One majority pass inside the band removes isolated speckles.
  const smoothed = new Uint8Array(refined);
  for (const index of band) {
    const x = index % width;
    const y = Math.floor(index / width);
    let objectCount = 0;
    let total = 0;
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++)
      for (
        let nx = Math.max(0, x - 1);
        nx <= Math.min(width - 1, x + 1);
        nx++
      ) {
        const neighbour = ny * width + nx;
        if (outer[neighbour] > 0 && interior[neighbour] === 0) {
          total++;
          if (refined[neighbour] > 127) objectCount++;
        }
      }
    smoothed[index] = objectCount * 2 > total ? 255 : 0;
  }
  return smoothed;
}
