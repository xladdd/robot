import type { NormalizedBounds } from "../types";

export type SubjectAlignment = {
  scale: number;
  translateX: number;
  translateY: number;
  score: number;
  coverage: number;
  similarity: number;
};

type MaskBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type VisibleSample = {
  x: number;
  y: number;
  red: number;
  green: number;
  blue: number;
  weight: number;
};

type AlignmentScore = {
  score: number;
  coverage: number;
  similarity: number;
};

const MASK_THRESHOLD = 8;
const MAX_COARSE_SAMPLES = 768;
const MAX_FINE_SAMPLES = 2048;
const MIN_ALIGNMENT_SCALE = 0.35;
const MAX_ALIGNMENT_SCALE = 2.5;
const MIN_COVERAGE = 0.58;
const MIN_SIMILARITY = 0.34;
const MIN_SCORE = 0.56;
const NEAR_FULL_MASK_FRACTION = 0.9;
const COLOUR_SIGMA = 65;
const COLOUR_DENOMINATOR = 6 * COLOUR_SIGMA * COLOUR_SIGMA;

function validateDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || width <= 0)
    throw new Error("Image width must be a positive integer.");
  if (!Number.isInteger(height) || height <= 0)
    throw new Error("Image height must be a positive integer.");
}

function validatePixels(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  name: string,
) {
  if (pixels.length !== width * height * 4)
    throw new Error(`${name} dimensions do not match.`);
}

function validateMask(
  mask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  name: string,
) {
  if (mask.length !== width * height)
    throw new Error(`${name} dimensions do not match.`);
}

function validateAlignment(alignment: SubjectAlignment) {
  if (!Number.isFinite(alignment.scale) || alignment.scale <= 0)
    throw new Error("Subject alignment scale must be positive and finite.");
  if (
    !Number.isFinite(alignment.translateX) ||
    !Number.isFinite(alignment.translateY)
  )
    throw new Error("Subject alignment translation must be finite.");
}

function findMaskBounds(
  mask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): MaskBounds | null {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (mask[y * width + x] > MASK_THRESHOLD) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
  return left < right && top < bottom ? { left, top, right, bottom } : null;
}

function visibleIndices(mask: Uint8Array | Uint8ClampedArray): number[] {
  const indices: number[] = [];
  for (let index = 0; index < mask.length; index++)
    if (mask[index] > MASK_THRESHOLD) indices.push(index);
  return indices;
}

function makeSamples(
  pixels: Uint8Array | Uint8ClampedArray,
  mask: Uint8Array | Uint8ClampedArray,
  width: number,
  limit: number,
): VisibleSample[] {
  const indices = visibleIndices(mask);
  const sampleCount = Math.min(indices.length, limit);
  const samples: VisibleSample[] = [];
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const position = Math.floor(
      ((sampleIndex + 0.5) * indices.length) / sampleCount,
    );
    const index = indices[Math.min(indices.length - 1, position)];
    const offset = index * 4;
    samples.push({
      x: index % width,
      y: Math.floor(index / width),
      red: pixels[offset],
      green: pixels[offset + 1],
      blue: pixels[offset + 2],
      weight: mask[index] / 255,
    });
  }
  return samples;
}

function sampleChannel(
  values: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channels: number,
  channel: number,
) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fractionX = x - x0;
  const fractionY = y - y0;
  let value = 0;
  for (let row = 0; row < 2; row++) {
    const sampleY = y0 + row;
    if (sampleY < 0 || sampleY >= height) continue;
    const weightY = row ? fractionY : 1 - fractionY;
    for (let column = 0; column < 2; column++) {
      const sampleX = x0 + column;
      if (sampleX < 0 || sampleX >= width) continue;
      const weightX = column ? fractionX : 1 - fractionX;
      value +=
        values[(sampleY * width + sampleX) * channels + channel] *
        weightX *
        weightY;
    }
  }
  return value;
}

function sampleMaskedColour(
  pixels: Uint8Array | Uint8ClampedArray,
  mask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fractionX = x - x0;
  const fractionY = y - y0;
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let row = 0; row < 2; row++) {
    const sampleY = y0 + row;
    if (sampleY < 0 || sampleY >= height) continue;
    const weightY = row ? fractionY : 1 - fractionY;
    for (let column = 0; column < 2; column++) {
      const sampleX = x0 + column;
      if (sampleX < 0 || sampleX >= width) continue;
      const index = sampleY * width + sampleX;
      const weight =
        weightY * (column ? fractionX : 1 - fractionX) * (mask[index] / 255);
      const offset = index * 4;
      alpha += weight;
      red += pixels[offset] * weight;
      green += pixels[offset + 1] * weight;
      blue += pixels[offset + 2] * weight;
    }
  }
  return alpha > 0
    ? { alpha, red: red / alpha, green: green / alpha, blue: blue / alpha }
    : { alpha: 0, red: 0, green: 0, blue: 0 };
}

function scoreAlignment(
  samples: readonly VisibleSample[],
  generatedPixels: Uint8Array | Uint8ClampedArray,
  generatedMask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  scale: number,
  translateX: number,
  translateY: number,
): AlignmentScore {
  let sourceWeight = 0;
  let coveredWeight = 0;
  let similarityWeight = 0;
  for (const sample of samples) {
    sourceWeight += sample.weight;
    const generatedX = (sample.x + 0.5 - translateX) / scale - 0.5;
    const generatedY = (sample.y + 0.5 - translateY) / scale - 0.5;
    const generated = sampleMaskedColour(
      generatedPixels,
      generatedMask,
      width,
      height,
      generatedX,
      generatedY,
    );
    if (generated.alpha <= 0) continue;

    // Alpha is coverage, not confidence. Comparing the intersection of the
    // source and generated coverage avoids rewarding an oversized mask merely
    // because its anti-aliased edge is more opaque.
    const weight = Math.min(sample.weight, generated.alpha);
    coveredWeight += weight;
    const redDifference = sample.red - generated.red;
    const greenDifference = sample.green - generated.green;
    const blueDifference = sample.blue - generated.blue;
    const distanceSquared =
      redDifference * redDifference +
      greenDifference * greenDifference +
      blueDifference * blueDifference;
    similarityWeight +=
      weight * Math.exp(-distanceSquared / COLOUR_DENOMINATOR);
  }

  const coverage = sourceWeight > 0 ? coveredWeight / sourceWeight : 0;
  const similarity = coveredWeight > 0 ? similarityWeight / coveredWeight : 0;
  return {
    coverage,
    similarity,
    score: coverage * 0.52 + similarity * 0.48,
  };
}

function uniqueSorted(values: readonly number[]) {
  const result: number[] = [];
  for (const value of [...values].sort((left, right) => left - right)) {
    const clamped = Math.max(
      MIN_ALIGNMENT_SCALE,
      Math.min(MAX_ALIGNMENT_SCALE, value),
    );
    if (!result.length || Math.abs(result[result.length - 1] - clamped) > 1e-6)
      result.push(clamped);
  }
  return result;
}

function coarseScales(source: MaskBounds, generated: MaskBounds) {
  const values: number[] = [];
  for (
    let scale = MIN_ALIGNMENT_SCALE;
    scale <= MAX_ALIGNMENT_SCALE * 1.001;
    scale *= 1.15
  )
    values.push(scale);
  const sourceWidth = source.right - source.left;
  const sourceHeight = source.bottom - source.top;
  const generatedWidth = generated.right - generated.left;
  const generatedHeight = generated.bottom - generated.top;
  values.push(
    sourceWidth / generatedWidth,
    sourceHeight / generatedHeight,
    Math.sqrt(
      (sourceWidth * sourceHeight) / (generatedWidth * generatedHeight),
    ),
    1,
  );
  return uniqueSorted(values);
}

function nearbyValues(center: number, radius: number, step: number) {
  const values: number[] = [];
  const count = Math.max(1, Math.ceil(radius / step));
  for (let index = -count; index <= count; index++)
    values.push(center + index * step);
  return values;
}

function anchorTranslations(
  sourceStart: number,
  sourceEnd: number,
  generatedStart: number,
  generatedEnd: number,
  scale: number,
) {
  return [
    sourceStart - generatedStart * scale,
    sourceEnd - generatedEnd * scale,
    (sourceStart + sourceEnd) / 2 -
      ((generatedStart + generatedEnd) / 2) * scale,
  ];
}

function evaluatedAlignment(
  score: AlignmentScore,
  scale: number,
  translateX: number,
  translateY: number,
): SubjectAlignment {
  return { scale, translateX, translateY, ...score };
}

function betterAlignment(
  candidate: SubjectAlignment,
  current: SubjectAlignment | null,
) {
  if (!current || candidate.score > current.score + 1e-9) return true;
  if (Math.abs(candidate.score - current.score) > 1e-9) return false;
  if (candidate.coverage > current.coverage + 1e-9) return true;
  if (Math.abs(candidate.coverage - current.coverage) > 1e-9) return false;
  if (Math.abs(candidate.scale - 1) < Math.abs(current.scale - 1) - 1e-9)
    return true;
  return false;
}

function refineAlignments(
  seeds: readonly SubjectAlignment[],
  samples: readonly VisibleSample[],
  generatedPixels: Uint8Array | Uint8ClampedArray,
  generatedMask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  scaleRadiusFraction: number,
  translationStep: number,
) {
  const refined: SubjectAlignment[] = [];
  const seen = new Set<string>();
  for (const seed of seeds) {
    let best: SubjectAlignment | null = null;
    const scaleRadius = Math.max(0.0125, seed.scale * scaleRadiusFraction);
    const scaleStep = scaleRadius / 2;
    for (const scale of uniqueSorted(
      nearbyValues(seed.scale, scaleRadius, scaleStep),
    ))
      for (const translateX of nearbyValues(
        seed.translateX,
        translationStep * 2,
        translationStep,
      ))
        for (const translateY of nearbyValues(
          seed.translateY,
          translationStep * 2,
          translationStep,
        )) {
          const key = `${scale.toFixed(6)}:${translateX.toFixed(3)}:${translateY.toFixed(3)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const candidate = evaluatedAlignment(
            scoreAlignment(
              samples,
              generatedPixels,
              generatedMask,
              width,
              height,
              scale,
              translateX,
              translateY,
            ),
            scale,
            translateX,
            translateY,
          );
          if (betterAlignment(candidate, best)) best = candidate;
        }
    if (best) refined.push(best);
  }
  refined.sort((left, right) => right.score - left.score);
  return refined;
}

export function findSubjectAlignment(
  sourceVisiblePixels: Uint8ClampedArray,
  visibleMask: Uint8Array,
  generatedPixels: Uint8ClampedArray,
  generatedMask: Uint8Array,
  width: number,
  height: number,
): SubjectAlignment | null {
  validateDimensions(width, height);
  validatePixels(sourceVisiblePixels, width, height, "Source pixels");
  validateMask(visibleMask, width, height, "Visible mask");
  validatePixels(generatedPixels, width, height, "Generated pixels");
  validateMask(generatedMask, width, height, "Generated mask");

  const sourceBounds = findMaskBounds(visibleMask, width, height);
  const generatedBounds = findMaskBounds(generatedMask, width, height);
  if (!sourceBounds || !generatedBounds) return null;

  const coarseSamples = makeSamples(
    sourceVisiblePixels,
    visibleMask,
    width,
    MAX_COARSE_SAMPLES,
  );
  const fineSamples = makeSamples(
    sourceVisiblePixels,
    visibleMask,
    width,
    MAX_FINE_SAMPLES,
  );
  if (!coarseSamples.length) return null;

  const translationStep = Math.max(1, Math.round(Math.min(width, height) / 32));
  const bestByScale: SubjectAlignment[] = [];
  for (const scale of coarseScales(sourceBounds, generatedBounds)) {
    const transformedWidth =
      (generatedBounds.right - generatedBounds.left) * scale;
    const transformedHeight =
      (generatedBounds.bottom - generatedBounds.top) * scale;
    const searchRadiusX = Math.max(width * 0.035, transformedWidth * 0.12);
    const searchRadiusY = Math.max(height * 0.035, transformedHeight * 0.12);
    const xAnchors = anchorTranslations(
      sourceBounds.left,
      sourceBounds.right,
      generatedBounds.left,
      generatedBounds.right,
      scale,
    );
    const yAnchors = anchorTranslations(
      sourceBounds.top,
      sourceBounds.bottom,
      generatedBounds.top,
      generatedBounds.bottom,
      scale,
    );
    let best: SubjectAlignment | null = null;
    const seen = new Set<string>();
    for (const xAnchor of xAnchors)
      for (const yAnchor of yAnchors)
        for (const translateX of nearbyValues(
          xAnchor,
          searchRadiusX,
          translationStep,
        ))
          for (const translateY of nearbyValues(
            yAnchor,
            searchRadiusY,
            translationStep,
          )) {
            const key = `${translateX.toFixed(3)}:${translateY.toFixed(3)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const candidate = evaluatedAlignment(
              scoreAlignment(
                coarseSamples,
                generatedPixels,
                generatedMask,
                width,
                height,
                scale,
                translateX,
                translateY,
              ),
              scale,
              translateX,
              translateY,
            );
            if (betterAlignment(candidate, best)) best = candidate;
          }
    if (best) bestByScale.push(best);
  }

  bestByScale.sort((left, right) => right.score - left.score);
  const medium = refineAlignments(
    bestByScale.slice(0, 8),
    fineSamples,
    generatedPixels,
    generatedMask,
    width,
    height,
    0.09,
    Math.max(0.5, translationStep / 2),
  );
  const fine = refineAlignments(
    medium.slice(0, 5),
    fineSamples,
    generatedPixels,
    generatedMask,
    width,
    height,
    0.025,
    Math.max(0.25, translationStep / 4),
  );
  const best = fine[0] ?? medium[0] ?? bestByScale[0] ?? null;
  if (
    !best ||
    best.coverage < MIN_COVERAGE ||
    best.similarity < MIN_SIMILARITY ||
    best.score < MIN_SCORE
  )
    return null;
  return best;
}

export function selectSubjectMaskAndAlignment(
  generatedPixels: Uint8ClampedArray,
  candidateMasks: readonly Uint8Array[],
  sourceVisiblePixels: Uint8ClampedArray,
  visibleMask: Uint8Array,
  width: number,
  height: number,
): { mask: Uint8Array; alignment: SubjectAlignment } | null {
  validateDimensions(width, height);
  validatePixels(generatedPixels, width, height, "Generated pixels");
  validatePixels(sourceVisiblePixels, width, height, "Source pixels");
  validateMask(visibleMask, width, height, "Visible mask");

  let selected: { mask: Uint8Array; alignment: SubjectAlignment } | null = null;
  for (const mask of candidateMasks) {
    validateMask(mask, width, height, "Candidate mask");
    let opaque = 0;
    for (const alpha of mask) if (alpha > MASK_THRESHOLD) opaque++;
    const fraction = opaque / mask.length;
    if (!opaque || fraction >= NEAR_FULL_MASK_FRACTION) continue;
    const alignment = findSubjectAlignment(
      sourceVisiblePixels,
      visibleMask,
      generatedPixels,
      mask,
      width,
      height,
    );
    if (!alignment) continue;
    if (!selected || betterAlignment(alignment, selected.alignment))
      selected = { mask, alignment };
  }
  return selected;
}

export function replaceAlpha(
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
) {
  validateDimensions(width, height);
  validatePixels(pixels, width, height, "Pixels");
  validateMask(mask, width, height, "Mask");
  const result = new Uint8ClampedArray(pixels);
  for (let index = 0; index < mask.length; index++)
    result[index * 4 + 3] = mask[index];
  return result;
}

export function transformRgbaPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  alignment: SubjectAlignment,
) {
  validateDimensions(width, height);
  validatePixels(pixels, width, height, "Pixels");
  validateAlignment(alignment);
  const result = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sourceX = (x + 0.5 - alignment.translateX) / alignment.scale - 0.5;
      const sourceY = (y + 0.5 - alignment.translateY) / alignment.scale - 0.5;
      const x0 = Math.floor(sourceX);
      const y0 = Math.floor(sourceY);
      const fractionX = sourceX - x0;
      const fractionY = sourceY - y0;
      let alpha = 0;
      let premultipliedRed = 0;
      let premultipliedGreen = 0;
      let premultipliedBlue = 0;
      for (let row = 0; row < 2; row++) {
        const sampleY = y0 + row;
        if (sampleY < 0 || sampleY >= height) continue;
        const weightY = row ? fractionY : 1 - fractionY;
        for (let column = 0; column < 2; column++) {
          const sampleX = x0 + column;
          if (sampleX < 0 || sampleX >= width) continue;
          const weight = weightY * (column ? fractionX : 1 - fractionX);
          const offset = (sampleY * width + sampleX) * 4;
          const sampleAlpha = pixels[offset + 3] / 255;
          alpha += sampleAlpha * weight;
          premultipliedRed += pixels[offset] * sampleAlpha * weight;
          premultipliedGreen += pixels[offset + 1] * sampleAlpha * weight;
          premultipliedBlue += pixels[offset + 2] * sampleAlpha * weight;
        }
      }
      const offset = (y * width + x) * 4;
      if (alpha > 0) {
        result[offset] = Math.round(premultipliedRed / alpha);
        result[offset + 1] = Math.round(premultipliedGreen / alpha);
        result[offset + 2] = Math.round(premultipliedBlue / alpha);
        result[offset + 3] = Math.round(alpha * 255);
      }
    }
  return result;
}

export function transformMask(
  mask: Uint8Array,
  width: number,
  height: number,
  alignment: SubjectAlignment,
) {
  validateDimensions(width, height);
  validateMask(mask, width, height, "Mask");
  validateAlignment(alignment);
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sourceX = (x + 0.5 - alignment.translateX) / alignment.scale - 0.5;
      const sourceY = (y + 0.5 - alignment.translateY) / alignment.scale - 0.5;
      result[y * width + x] = Math.round(
        sampleChannel(mask, width, height, sourceX, sourceY, 1, 0),
      );
    }
  return result;
}

export function createSupportVisibilityMask(
  subjectAlpha: Uint8Array,
  supportBounds: NormalizedBounds,
  foregroundPartsMask: Uint8Array,
  width: number,
  height: number,
) {
  validateDimensions(width, height);
  validateMask(subjectAlpha, width, height, "Subject alpha");
  validateMask(foregroundPartsMask, width, height, "Foreground-parts mask");
  if (
    !Number.isFinite(supportBounds.x) ||
    !Number.isFinite(supportBounds.y) ||
    !Number.isFinite(supportBounds.width) ||
    !Number.isFinite(supportBounds.height) ||
    supportBounds.width < 0 ||
    supportBounds.height < 0
  )
    throw new Error("Support bounds must be finite and non-negative.");

  const left = Math.max(0, Math.floor(supportBounds.x * width));
  const top = Math.max(0, Math.floor(supportBounds.y * height));
  const right = Math.min(
    width,
    Math.ceil((supportBounds.x + supportBounds.width) * width),
  );
  const bottom = Math.min(
    height,
    Math.ceil((supportBounds.y + supportBounds.height) * height),
  );
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const insideSupport = x >= left && x < right && y >= top && y < bottom;
      result[index] = insideSupport
        ? Math.round((subjectAlpha[index] * foregroundPartsMask[index]) / 255)
        : subjectAlpha[index];
    }
  return result;
}
