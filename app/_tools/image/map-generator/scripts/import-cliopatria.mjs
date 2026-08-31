import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

const inputPath = process.argv[2];
const outputPath = process.argv[3] || "app/_tools/image/map-generator/code/data/cliopatria-timeline.json";
const tolerance = Number(process.argv[4] || 0.12);
if (!inputPath) throw new Error("Usage: node app/_tools/image/map-generator/scripts/import-cliopatria.mjs <cliopatria.geojson> [output] [tolerance-degrees]");

const input = await fs.readFile(inputPath);
const source = JSON.parse(input.toString("utf8"));
if (source.type !== "FeatureCollection" || !Array.isArray(source.features)) throw new Error("Expected a GeoJSON FeatureCollection.");

function segmentDistance(point, start, end) {
  let x = start[0], y = start[1], dx = end[0] - x, dy = end[1] - y;
  if (dx || dy) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = end[0]; y = end[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  return (point[0] - x) ** 2 + (point[1] - y) ** 2;
}
function simplifyLine(points, threshold) {
  if (points.length <= 4) return points;
  const line = points.slice(0, -1), keep = new Uint8Array(points.length - 1);
  keep[0] = 1; keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]], squared = threshold * threshold;
  while (stack.length) {
    const [first, last] = stack.pop(); let maximum = squared, selected = -1;
    for (let index = first + 1; index < last; index++) {
      const distance = segmentDistance(line[index], line[first], line[last]);
      if (distance > maximum) { maximum = distance; selected = index; }
    }
    if (selected >= 0) { keep[selected] = 1; stack.push([first, selected], [selected, last]); }
  }
  const result = line.filter((_, index) => keep[index]);
  if (result.length < 3) return points;
  result.push(result[0]);
  return result;
}
const quantize = ([lon, lat]) => [Math.round(lon * 10000) / 10000, Math.round(lat * 10000) / 10000];
const simplifyPolygon = (polygon) => polygon.map((ring) => simplifyLine(ring, tolerance).map(quantize)).filter((ring) => ring.length >= 4);
function simplifyGeometry(geometry) {
  if (geometry.type === "Polygon") return { type: "Polygon", coordinates: simplifyPolygon(geometry.coordinates) };
  if (geometry.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: geometry.coordinates.map(simplifyPolygon).filter((polygon) => polygon.length) };
  throw new Error(`Unsupported geometry: ${geometry.type}`);
}

const records = source.features.filter((feature) => feature.geometry && feature.properties?.Type === "POLITY").map((feature, index) => ({
  id: `cliopatria-${index}`,
  name: String(feature.properties.Name),
  fromYear: Number(feature.properties.FromYear),
  toYear: Number(feature.properties.ToYear),
  wikidata: String(feature.properties.Wikidata || ""),
  wikipedia: String(feature.properties.Wikipedia || ""),
  geometry: simplifyGeometry(feature.geometry),
}));
const output = {
  version: 1,
  source: {
    title: "Cliopatria",
    url: "https://github.com/Seshat-Global-History-Databank/cliopatria",
    citation: "Seshat Global History Databank, Cliopatria geospatial database of worldwide political entities",
    license: "CC BY 4.0",
    sha256: crypto.createHash("sha256").update(input).digest("hex"),
    importedAt: new Date().toISOString(),
    simplificationToleranceDegrees: tolerance,
    adaptation: "Geometry simplified and coordinates quantized for interactive web rendering.",
  },
  coverage: { fromYear: -3400, throughYear: 2024 },
  records,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(output));
console.log(JSON.stringify({ outputPath, records: records.length, bytes: Buffer.byteLength(JSON.stringify(output)), sha256: output.source.sha256 }));
