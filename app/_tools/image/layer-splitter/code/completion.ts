const USEFUL_ALPHA_THRESHOLD = 8;
const MIN_HIDDEN_PIXELS = 32;
const MAX_COLOUR_CORRECTION = 64;
const MAX_REGISTRATION_SAMPLES = 1536;
const MAX_REGISTRATION_SHIFT = 160;
const MIN_REGISTRATION_COVERAGE = 0.2;

export type CompletionSelection = {
  hiddenPixels: Uint8ClampedArray;
  candidateIndex: number;
  hiddenPixelCount: number;
  score: number;
};

type CandidateAssessment = {
  candidateIndex: number;
  hiddenPixelCount: number;
  score: number;
  trimMask: Uint8Array;
  correction: readonly [number, number, number];
  offsetX: number;
  offsetY: number;
};

type CandidateRegistration = {
  offsetX: number;
  offsetY: number;
  score: number;
  coverage: number;
};

const NEIGHBOURS_FOUR: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function validateDimensions(
  sourceVisiblePixels: Uint8ClampedArray,
  visibleMask: Uint8Array,
  allowedMask: Uint8Array,
  candidates: readonly Uint8ClampedArray[],
  width: number,
  height: number,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("Completion dimensions must be positive integers.");
  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount))
    throw new Error("Completion dimensions are too large.");
  if (sourceVisiblePixels.length !== pixelCount * 4)
    throw new Error("Source pixel dimensions do not match the image.");
  if (visibleMask.length !== pixelCount || allowedMask.length !== pixelCount)
    throw new Error("Mask dimensions do not match the image.");
  for (const candidate of candidates)
    if (candidate.length !== pixelCount * 4)
      throw new Error("Candidate pixel dimensions do not match the image.");
}

function isHiddenAllowed(
  index: number,
  visibleMask: Uint8Array,
  allowedMask: Uint8Array,
) {
  return allowedMask[index] !== 0 && visibleMask[index] === 0;
}

function touchesVisible(
  index: number,
  visibleMask: Uint8Array,
  width: number,
  height: number,
) {
  const x = index % width;
  const y = Math.floor(index / width);
  for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++)
    for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
      if (nx === x && ny === y) continue;
      if (visibleMask[ny * width + nx] !== 0) return true;
    }
  return false;
}

function boundaryKind(
  index: number,
  visibleMask: Uint8Array,
  allowedMask: Uint8Array,
  width: number,
  height: number,
): "interior" | "join" | "forbidden" {
  if (touchesVisible(index, visibleMask, width, height)) return "join";
  const x = index % width;
  const y = Math.floor(index / width);
  for (const [dx, dy] of NEIGHBOURS_FOUR) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) return "forbidden";
    const neighbour = ny * width + nx;
    if (!isHiddenAllowed(neighbour, visibleMask, allowedMask))
      return visibleMask[neighbour] !== 0 ? "join" : "forbidden";
  }
  return "interior";
}

function colourSimilarity(
  left: Uint8ClampedArray,
  leftOffset: number,
  right: Uint8ClampedArray,
  rightOffset: number,
) {
  const difference =
    Math.abs(left[leftOffset] - right[rightOffset]) +
    Math.abs(left[leftOffset + 1] - right[rightOffset + 1]) +
    Math.abs(left[leftOffset + 2] - right[rightOffset + 2]);
  return 1 - difference / (255 * 3);
}

function shiftedCandidateOffset(
  index: number,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
) {
  const x = (index % width) - offsetX;
  const y = Math.floor(index / width) - offsetY;
  if (x < 0 || x >= width || y < 0 || y >= height) return -1;
  return (y * width + x) * 4;
}

function registrationSamples(
  sourceVisiblePixels: Uint8ClampedArray,
  visibleMask: Uint8Array,
) {
  let count = 0;
  for (let index = 0; index < visibleMask.length; index++)
    if (
      visibleMask[index] !== 0 &&
      sourceVisiblePixels[index * 4 + 3] > USEFUL_ALPHA_THRESHOLD
    )
      count++;
  if (!count) return [];

  const stride = Math.max(1, Math.ceil(count / MAX_REGISTRATION_SAMPLES));
  const samples: number[] = [];
  let visibleIndex = 0;
  for (let index = 0; index < visibleMask.length; index++) {
    if (
      visibleMask[index] === 0 ||
      sourceVisiblePixels[index * 4 + 3] <= USEFUL_ALPHA_THRESHOLD
    )
      continue;
    if (visibleIndex % stride === 0) samples.push(index);
    visibleIndex++;
  }
  return samples;
}

function scoreRegistration(
  candidate: Uint8ClampedArray,
  sourceVisiblePixels: Uint8ClampedArray,
  samples: readonly number[],
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): CandidateRegistration {
  let sourceWeight = 0;
  let overlapWeight = 0;
  let similarity = 0;
  for (const index of samples) {
    const sourceOffset = index * 4;
    const sourceAlpha = sourceVisiblePixels[sourceOffset + 3];
    sourceWeight += sourceAlpha / 255;
    const candidateOffset = shiftedCandidateOffset(
      index,
      offsetX,
      offsetY,
      width,
      height,
    );
    if (candidateOffset < 0) continue;
    const candidateAlpha = candidate[candidateOffset + 3];
    if (candidateAlpha <= USEFUL_ALPHA_THRESHOLD) continue;
    const weight = Math.min(sourceAlpha, candidateAlpha) / 255;
    overlapWeight += weight;
    similarity +=
      colourSimilarity(
        sourceVisiblePixels,
        sourceOffset,
        candidate,
        candidateOffset,
      ) * weight;
  }
  const coverage = sourceWeight ? overlapWeight / sourceWeight : 0;
  const rgbSimilarity = overlapWeight ? similarity / overlapWeight : 0;
  return {
    offsetX,
    offsetY,
    coverage,
    score: coverage * 0.6 + rgbSimilarity * 0.4,
  };
}

function findCandidateRegistration(
  candidate: Uint8ClampedArray,
  sourceVisiblePixels: Uint8ClampedArray,
  visibleMask: Uint8Array,
  width: number,
  height: number,
) {
  const samples = registrationSamples(sourceVisiblePixels, visibleMask);
  const baseline = scoreRegistration(
    candidate,
    sourceVisiblePixels,
    samples,
    0,
    0,
    width,
    height,
  );
  if (!samples.length) return baseline;

  const maxX = Math.min(
    MAX_REGISTRATION_SHIFT,
    Math.max(8, Math.ceil(width * 0.2)),
  );
  const maxY = Math.min(
    MAX_REGISTRATION_SHIFT,
    Math.max(8, Math.ceil(height * 0.2)),
  );
  const coarseStep = Math.max(2, Math.ceil(Math.max(width, height) / 192));
  let best = baseline;
  const consider = (offsetX: number, offsetY: number) => {
    const registration = scoreRegistration(
      candidate,
      sourceVisiblePixels,
      samples,
      offsetX,
      offsetY,
      width,
      height,
    );
    const registrationDistance =
      Math.abs(registration.offsetX) + Math.abs(registration.offsetY);
    const bestDistance = Math.abs(best.offsetX) + Math.abs(best.offsetY);
    if (
      registration.score > best.score + 1e-6 ||
      (Math.abs(registration.score - best.score) <= 1e-6 &&
        registrationDistance < bestDistance)
    )
      best = registration;
  };

  for (let offsetY = -maxY; offsetY <= maxY; offsetY += coarseStep)
    for (let offsetX = -maxX; offsetX <= maxX; offsetX += coarseStep)
      consider(offsetX, offsetY);

  const coarseBest = best;
  for (
    let offsetY = Math.max(-maxY, coarseBest.offsetY - coarseStep);
    offsetY <= Math.min(maxY, coarseBest.offsetY + coarseStep);
    offsetY++
  )
    for (
      let offsetX = Math.max(-maxX, coarseBest.offsetX - coarseStep);
      offsetX <= Math.min(maxX, coarseBest.offsetX + coarseStep);
      offsetX++
    )
      consider(offsetX, offsetY);

  return best.score > baseline.score + 0.01 ? best : baseline;
}

function assessCandidate(
  candidate: Uint8ClampedArray,
  candidateIndex: number,
  sourceVisiblePixels: Uint8ClampedArray,
  visibleMask: Uint8Array,
  allowedMask: Uint8Array,
  width: number,
  height: number,
): CandidateAssessment | null {
  let usefulHiddenPixels = 0;
  let visiblePixels = 0;
  let visibleAlphaCoverage = 0;
  let overlapWeight = 0;
  let overlapSimilarity = 0;
  const correctionTotals = [0, 0, 0];
  let seamWeight = 0;
  let seamSimilarity = 0;
  let generatedBoundaryPixels = 0;
  let forbiddenBoundaryPixels = 0;
  let generatedOutsideAllowedPixels = 0;
  const trimMask = new Uint8Array(visibleMask.length);
  const registration = findCandidateRegistration(
    candidate,
    sourceVisiblePixels,
    visibleMask,
    width,
    height,
  );
  if (registration.coverage < MIN_REGISTRATION_COVERAGE) return null;

  for (let index = 0; index < visibleMask.length; index++) {
    const offset = index * 4;
    const candidateOffset = shiftedCandidateOffset(
      index,
      registration.offsetX,
      registration.offsetY,
      width,
      height,
    );
    const candidateAlpha =
      candidateOffset < 0 ? 0 : candidate[candidateOffset + 3];
    if (visibleMask[index] !== 0) {
      visiblePixels++;
      visibleAlphaCoverage += candidateAlpha / 255;
      const sourceAlpha = sourceVisiblePixels[offset + 3];
      if (
        sourceAlpha > USEFUL_ALPHA_THRESHOLD &&
        candidateAlpha > USEFUL_ALPHA_THRESHOLD
      ) {
        const weight = Math.min(sourceAlpha, candidateAlpha) / 255;
        overlapWeight += weight;
        overlapSimilarity +=
          colourSimilarity(
            sourceVisiblePixels,
            offset,
            candidate,
            candidateOffset,
          ) * weight;
        for (let channel = 0; channel < 3; channel++)
          correctionTotals[channel] +=
            (sourceVisiblePixels[offset + channel] -
              candidate[candidateOffset + channel]) *
            weight;
      }
      continue;
    }
    if (allowedMask[index] === 0) {
      if (candidateAlpha > USEFUL_ALPHA_THRESHOLD)
        generatedOutsideAllowedPixels++;
      continue;
    }
    if (candidateAlpha === 0) continue;
    if (candidateAlpha > USEFUL_ALPHA_THRESHOLD) usefulHiddenPixels++;

    const kind = boundaryKind(index, visibleMask, allowedMask, width, height);
    if (kind !== "interior" && candidateAlpha > USEFUL_ALPHA_THRESHOLD) {
      generatedBoundaryPixels++;
      if (kind === "forbidden") forbiddenBoundaryPixels++;
    }
    if (kind === "forbidden") trimMask[index] = 1;
    if (kind !== "join") continue;

    const x = index % width;
    const y = Math.floor(index / width);
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++)
      for (
        let nx = Math.max(0, x - 1);
        nx <= Math.min(width - 1, x + 1);
        nx++
      ) {
        const neighbour = ny * width + nx;
        if (visibleMask[neighbour] === 0) continue;
        const neighbourOffset = neighbour * 4;
        const sourceAlpha = sourceVisiblePixels[neighbourOffset + 3];
        if (sourceAlpha <= USEFUL_ALPHA_THRESHOLD) continue;
        const weight = Math.min(sourceAlpha, candidateAlpha) / 255;
        seamWeight += weight;
        seamSimilarity +=
          colourSimilarity(
            candidate,
            candidateOffset,
            sourceVisiblePixels,
            neighbourOffset,
          ) * weight;
      }
  }

  if (usefulHiddenPixels < MIN_HIDDEN_PIXELS) return null;
  let hiddenPixelCount = 0;
  for (let index = 0; index < allowedMask.length; index++) {
    if (
      isHiddenAllowed(index, visibleMask, allowedMask) &&
      trimMask[index] === 0 &&
      (() => {
        const candidateOffset = shiftedCandidateOffset(
          index,
          registration.offsetX,
          registration.offsetY,
          width,
          height,
        );
        return (
          candidateOffset >= 0 &&
          candidate[candidateOffset + 3] > USEFUL_ALPHA_THRESHOLD
        );
      })()
    )
      hiddenPixelCount++;
  }
  if (hiddenPixelCount < MIN_HIDDEN_PIXELS) return null;

  const coverage = visiblePixels ? visibleAlphaCoverage / visiblePixels : 0;
  const rgbSimilarity = overlapWeight ? overlapSimilarity / overlapWeight : 0;
  const seamConsistency = seamWeight ? seamSimilarity / seamWeight : 0;
  const boundaryRisk = generatedBoundaryPixels
    ? forbiddenBoundaryPixels / generatedBoundaryPixels
    : 0;
  const outsideRisk = Math.min(
    1,
    generatedOutsideAllowedPixels / Math.max(1, usefulHiddenPixels),
  );
  const score =
    coverage * 0.4 +
    rgbSimilarity * 0.35 +
    seamConsistency * 0.25 -
    boundaryRisk * 0.35 -
    outsideRisk * 0.5;
  const correction = correctionTotals.map((total) =>
    Math.max(
      -MAX_COLOUR_CORRECTION,
      Math.min(
        MAX_COLOUR_CORRECTION,
        overlapWeight ? total / overlapWeight : 0,
      ),
    ),
  ) as [number, number, number];

  return {
    candidateIndex,
    hiddenPixelCount,
    score,
    trimMask,
    correction,
    offsetX: registration.offsetX,
    offsetY: registration.offsetY,
  };
}

/**
 * Selects a generated object using its agreement with known source pixels and
 * returns only its colour-corrected hidden fragment. Visible source pixels are
 * excluded from the result even if the two masks overlap.
 */
export function selectCompletionCandidate(
  sourceVisiblePixels: Uint8ClampedArray,
  visibleMask: Uint8Array,
  allowedMask: Uint8Array,
  candidates: readonly Uint8ClampedArray[],
  width: number,
  height: number,
): CompletionSelection | null {
  validateDimensions(
    sourceVisiblePixels,
    visibleMask,
    allowedMask,
    candidates,
    width,
    height,
  );

  let best: CandidateAssessment | null = null;
  for (
    let candidateIndex = 0;
    candidateIndex < candidates.length;
    candidateIndex++
  ) {
    const assessment = assessCandidate(
      candidates[candidateIndex],
      candidateIndex,
      sourceVisiblePixels,
      visibleMask,
      allowedMask,
      width,
      height,
    );
    if (assessment && (!best || assessment.score > best.score))
      best = assessment;
  }
  if (!best) return null;

  const candidate = candidates[best.candidateIndex];
  const hiddenPixels = new Uint8ClampedArray(candidate.length);
  for (let index = 0; index < allowedMask.length; index++) {
    if (
      !isHiddenAllowed(index, visibleMask, allowedMask) ||
      best.trimMask[index] !== 0
    )
      continue;
    const offset = index * 4;
    const candidateOffset = shiftedCandidateOffset(
      index,
      best.offsetX,
      best.offsetY,
      width,
      height,
    );
    if (candidateOffset < 0 || candidate[candidateOffset + 3] === 0) continue;
    for (let channel = 0; channel < 3; channel++)
      hiddenPixels[offset + channel] = Math.round(
        candidate[candidateOffset + channel] + best.correction[channel],
      );
    hiddenPixels[offset + 3] = candidate[candidateOffset + 3];
  }

  return {
    hiddenPixels,
    candidateIndex: best.candidateIndex,
    hiddenPixelCount: best.hiddenPixelCount,
    score: best.score,
  };
}
