export type DetailRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getDetailRegions(
  width: number,
  height: number,
  count = 3,
  overlap = 0.15,
): DetailRegion[] {
  if (width <= 0 || height <= 0 || count <= 0) return [];
  const safeOverlap = Math.min(Math.max(overlap, 0), 0.5);
  const bandHeight = height / (count - (count - 1) * safeOverlap);
  const stride = bandHeight * (1 - safeOverlap);
  return Array.from({ length: count }, (_, index) => {
    const y =
      index === count - 1
        ? height - bandHeight
        : Math.min(index * stride, height - bandHeight);
    return {
      x: 0,
      y: Math.max(0, y),
      width,
      height: Math.min(height, bandHeight),
    };
  });
}
