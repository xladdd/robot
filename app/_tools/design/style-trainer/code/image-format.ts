import { MAX_STYLE_REFERENCES, StyleValidationError } from "./validation.ts";

export type ImageDimensions = { width: number; height: number };
// Application safety limits, not a claim about any provider's native resolution.
export const MAX_DIMENSION = 16_384;
export const MAX_PIXELS = 40_000_000;
export const DEFAULT_RATIOS = [
  "1:1",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "16:9",
  "9:16",
  "21:9",
] as const;
type Capability = {
  type?: string;
  values?: unknown[];
  min?: number;
  max?: number;
};
export type ImageCapabilities = Record<string, Capability>;

export function validateReferenceDimensions(value: unknown): ImageDimensions[] {
  // Older clients do not send dimensions.
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_STYLE_REFERENCES
  )
    throw new StyleValidationError(
      "referenceDimensions must contain 1–6 dimensions.",
    );
  return value.map((item: unknown) => {
    if (typeof item !== "object" || item === null || Array.isArray(item))
      throw new StyleValidationError("Invalid referenceDimensions entry.");
    const { width, height } = item as Record<string, unknown>;
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > MAX_DIMENSION ||
      height > MAX_DIMENSION ||
      width * height > MAX_PIXELS
    )
      throw new StyleValidationError(
        "Reference dimensions exceed safe integer/pixel limits.",
      );
    return { width, height };
  });
}

function inRange(value: number, capability?: Capability) {
  return (
    capability?.type === "range" &&
    typeof capability.min === "number" &&
    typeof capability.max === "number" &&
    value >= capability.min &&
    value <= capability.max
  );
}

export function selectImageFormat(
  dimensions: readonly ImageDimensions[],
  capabilities: ImageCapabilities,
) {
  const first = dimensions[0];
  const exact =
    first &&
    dimensions.every(
      (d) => d.width === first.width && d.height === first.height,
    )
      ? first
      : null;
  const size = exact ? `${exact.width}x${exact.height}` : null;
  if (
    size &&
    capabilities.size?.type === "enum" &&
    capabilities.size.values?.includes(size)
  )
    return {
      parameters: { size },
      requestedDimensions: exact,
      exactSizeRequested: true,
    };
  if (
    exact &&
    inRange(exact.width, capabilities.width) &&
    inRange(exact.height, capabilities.height)
  )
    return {
      parameters: { width: exact.width, height: exact.height },
      requestedDimensions: exact,
      exactSizeRequested: true,
    };

  const advertised = capabilities.aspect_ratio;
  const ratios =
    advertised?.type === "enum"
      ? (advertised.values?.filter(
          (r): r is string =>
            typeof r === "string" && /^[1-9]\d*:[1-9]\d*$/.test(r),
        ) ?? [])
      : [];
  if (!ratios.length)
    throw new Error("The image provider advertises no usable aspect ratio.");
  const ratioValue = (ratio: string) => {
    const [w, h] = ratio.split(":").map(Number);
    return w / h;
  };
  // Stable numeric ordering makes ties independent of upload and provider ordering.
  ratios.sort((a, b) => ratioValue(a) - ratioValue(b) || a.localeCompare(b));
  const nearest = (target: number) =>
    ratios.reduce((best, ratio) =>
      Math.abs(Math.log(ratioValue(ratio) / target)) <
      Math.abs(Math.log(ratioValue(best) / target)) - 1e-12
        ? ratio
        : best,
    );
  const votes = new Map<string, number>();
  for (const d of dimensions) {
    const ratio = nearest(d.width / d.height);
    votes.set(ratio, (votes.get(ratio) ?? 0) + 1);
  }
  const aspectRatio = dimensions.length
    ? ratios.reduce((best, ratio) =>
        (votes.get(ratio) ?? 0) > (votes.get(best) ?? 0) ? ratio : best,
      )
    : nearest(1);
  return {
    parameters: { aspect_ratio: aspectRatio },
    requestedDimensions: exact,
    exactSizeRequested: false,
  };
}
