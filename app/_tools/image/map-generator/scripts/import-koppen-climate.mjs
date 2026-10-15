import fs from "node:fs/promises";
import sharp from "sharp";
import { contours } from "d3-contour";

const input =
  process.argv[2] || "/private/tmp/beck-kg/Beck_KG_V1_present_0p083.tif";
const output = new URL("../code/data/koppen-climate.json", import.meta.url);
const { data, info } = await sharp(input)
  .raw()
  .toBuffer({ resolveWithObject: true });
const sourceResolution = 360 / info.width;
if (Math.abs(180 / info.height - sourceResolution) > 1e-9)
  throw new Error(
    `Expected a global 2:1 raster, received ${info.width} × ${info.height}.`,
  );
const colors = [
  [0, 0, 255],
  [0, 120, 255],
  [70, 170, 250],
  [255, 0, 0],
  [255, 150, 150],
  [245, 165, 0],
  [255, 220, 100],
  [255, 255, 0],
  [200, 200, 0],
  [150, 150, 0],
  [150, 255, 150],
  [100, 200, 100],
  [50, 150, 50],
  [200, 255, 80],
  [100, 255, 80],
  [50, 200, 0],
  [255, 0, 255],
  [200, 0, 200],
  [150, 50, 150],
  [150, 100, 150],
  [170, 175, 255],
  [90, 120, 220],
  [75, 80, 180],
  [50, 0, 135],
  [0, 255, 255],
  [55, 200, 255],
  [0, 125, 125],
  [0, 70, 95],
  [178, 178, 178],
  [102, 102, 102],
];
const colorClass = new Map(
  colors.map((rgb, index) => [rgb.join(","), index + 1]),
);
const broad = (value) =>
  value <= 3
    ? "A"
    : value <= 7
      ? "B"
      : value <= 16
        ? "C"
        : value <= 28
          ? "D"
          : "E";
const groupIndex = { A: 1, B: 2, C: 3, D: 4, E: 5 };
const sourceGrid = new Uint8Array(info.width * info.height);
for (let y = 0; y < info.height; y += 1)
  for (let x = 0; x < info.width; x += 1) {
    const offset = (y * info.width + x) * info.channels;
    const climateClass = colorClass.get(
      `${data[offset]},${data[offset + 1]},${data[offset + 2]}`,
    );
    if (climateClass)
      sourceGrid[y * info.width + x] = groupIndex[broad(climateClass)];
  }

const aggregate = 2;
const width = info.width / aggregate;
const height = info.height / aggregate;
if (!Number.isInteger(width) || !Number.isInteger(height))
  throw new Error(
    "Climate raster dimensions must divide by the aggregation factor.",
  );
const grid = new Uint8Array(width * height);
for (let y = 0; y < height; y += 1)
  for (let x = 0; x < width; x += 1) {
    const counts = [0, 0, 0, 0, 0, 0];
    for (let dy = 0; dy < aggregate; dy += 1)
      for (let dx = 0; dx < aggregate; dx += 1)
        counts[
          sourceGrid[(y * aggregate + dy) * info.width + (x * aggregate + dx)]
        ] += 1;
    let selected = 0;
    for (let group = 1; group < counts.length; group += 1)
      if (counts[group] > counts[selected]) selected = group;
    grid[y * width + x] = selected;
  }
const resolution = sourceResolution * aggregate;
const ringArea = (ring) =>
  Math.abs(
    ring.reduce((area, [x, y], index) => {
      const [nextX, nextY] = ring[(index + 1) % ring.length];
      return area + x * nextY - nextX * y;
    }, 0) / 2,
  );
const pointSegmentDistanceSquared = ([x, y], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  if (!dx && !dy) return (x - ax) ** 2 + (y - ay) ** 2;
  const t = Math.max(
    0,
    Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)),
  );
  const nearestX = ax + t * dx;
  const nearestY = ay + t * dy;
  return (x - nearestX) ** 2 + (y - nearestY) ** 2;
};
const simplifyLine = (points, toleranceSquared) => {
  if (points.length <= 2) return points;
  let furthestIndex = 0;
  let furthestDistance = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointSegmentDistanceSquared(
      points[index],
      points[0],
      points[points.length - 1],
    );
    if (distance > furthestDistance) {
      furthestDistance = distance;
      furthestIndex = index;
    }
  }
  if (furthestDistance <= toleranceSquared)
    return [points[0], points[points.length - 1]];
  return [
    ...simplifyLine(points.slice(0, furthestIndex + 1), toleranceSquared).slice(
      0,
      -1,
    ),
    ...simplifyLine(points.slice(furthestIndex), toleranceSquared),
  ];
};
const simplifyRing = (ring, tolerance = 0.4) => {
  const points = ring.slice(0, -1);
  if (points.length <= 4) return ring;
  let west = 0;
  let east = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index][0] < points[west][0]) west = index;
    if (points[index][0] > points[east][0]) east = index;
  }
  if (west > east) [west, east] = [east, west];
  const first = simplifyLine(points.slice(west, east + 1), tolerance ** 2);
  const second = simplifyLine(
    [...points.slice(east), ...points.slice(0, west + 1)],
    tolerance ** 2,
  );
  const simplified = [...first.slice(0, -1), ...second.slice(0, -1)];
  return [...simplified, simplified[0]];
};
const coordinate = ([x, y]) => [
  Number((x * resolution - 180).toFixed(4)),
  Number((90 - y * resolution).toFixed(4)),
];
const polygons = {};
for (const [group, value] of Object.entries(groupIndex)) {
  const mask = Uint8Array.from(grid, (cell) => (cell === value ? 1 : 0));
  const contour = contours()
    .size([width, height])
    .smooth(true)
    .thresholds([0.5])(mask)[0];
  polygons[group] = contour.coordinates
    .filter((polygon) => ringArea(polygon[0]) >= 2)
    .map((polygon) =>
      polygon.map((ring) => simplifyRing(ring).map(coordinate)),
    );
}
const result = {
  source: {
    title: "Present-day Köppen–Geiger climate classification",
    authors: "Beck et al. (2018)",
    period: "1980–2016",
    resolution: `${Number(resolution.toFixed(6))}° broad-group majority grid derived from the official ${Number(sourceResolution.toFixed(6))}° raster`,
    doi: "10.1038/sdata.2018.214",
    archive: "https://doi.org/10.6084/m9.figshare.6396959",
    file: "Beck_KG_V1_present_0p083.tif",
    license: "CC BY 4.0",
  },
  geometry: "smoothed raster contours",
  groups: {
    A: { label: "Tropical", color: "#e45745" },
    B: { label: "Arid", color: "#e6ad3c" },
    C: { label: "Temperate", color: "#69ad63" },
    D: { label: "Cold", color: "#4f83cc" },
    E: { label: "Polar", color: "#8d67b1" },
  },
  polygons,
};
await fs.writeFile(output, JSON.stringify(result));
console.log(
  `Wrote ${Object.values(polygons).reduce((total, group) => total + group.length, 0)} climate-zone polygons to ${output.pathname}`,
);
