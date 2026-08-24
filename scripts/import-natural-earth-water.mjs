import fs from "node:fs/promises";
import path from "node:path";

const [riversPath, lakesPath, outputPath = "app/data/natural-earth-water.json"] = process.argv.slice(2);
const tolerance = Number(process.argv[5] || 0.035);
if (!riversPath || !lakesPath) throw new Error("Usage: node scripts/import-natural-earth-water.mjs <rivers.geojson> <lakes.geojson> [output] [tolerance]");

function distance(point, start, end) {
  let x = start[0], y = start[1], dx = end[0] - x, dy = end[1] - y;
  if (dx || dy) { const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy); if (t > 1) { x = end[0]; y = end[1]; } else if (t > 0) { x += dx * t; y += dy * t; } }
  return (point[0] - x) ** 2 + (point[1] - y) ** 2;
}
function simplify(points, closed = false) {
  const line = closed ? points.slice(0, -1) : points.slice();
  if (line.length <= 3) return points;
  const keep = new Uint8Array(line.length); keep[0] = keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]], threshold = tolerance * tolerance;
  while (stack.length) { const [first, last] = stack.pop(); let best = threshold, selected = -1; for (let i = first + 1; i < last; i++) { const value = distance(line[i], line[first], line[last]); if (value > best) { best = value; selected = i; } } if (selected >= 0) { keep[selected] = 1; stack.push([first, selected], [selected, last]); } }
  let result = line.filter((_, index) => keep[index]).map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
  if (closed && result.length >= 3) result.push(result[0]);
  return result;
}
const lineGeometry = (geometry) => geometry.type === "LineString" ? { type: "LineString", coordinates: simplify(geometry.coordinates) } : { type: "MultiLineString", coordinates: geometry.coordinates.map((line) => simplify(line)) };
const polygonGeometry = (geometry) => geometry.type === "Polygon" ? { type: "Polygon", coordinates: geometry.coordinates.map((ring) => simplify(ring, true)).filter((ring) => ring.length >= 4) } : { type: "MultiPolygon", coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => simplify(ring, true)).filter((ring) => ring.length >= 4)).filter((polygon) => polygon.length) };
const riversSource = JSON.parse(await fs.readFile(riversPath, "utf8")), lakesSource = JSON.parse(await fs.readFile(lakesPath, "utf8"));
const record = (feature, geometry) => ({ name: feature.properties?.name || "", rank: Number(feature.properties?.scalerank ?? 10), geometry });
const output = {
  source: { title: "Natural Earth 1:10m Rivers, Lake Centerlines, and Lakes", url: "https://www.naturalearthdata.com/", license: "Public domain", simplificationToleranceDegrees: tolerance },
  rivers: riversSource.features.map((feature) => record(feature, lineGeometry(feature.geometry))),
  lakes: lakesSource.features.map((feature) => record(feature, polygonGeometry(feature.geometry))),
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(output));
console.log(JSON.stringify({ outputPath, rivers: output.rivers.length, lakes: output.lakes.length, bytes: Buffer.byteLength(JSON.stringify(output)) }));
