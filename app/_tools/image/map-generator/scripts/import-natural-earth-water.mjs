import fs from "node:fs/promises";
import path from "node:path";
import { geoArea } from "d3-geo";
import { read as readShapefile } from "shapefile";

const [riversPath, lakesPath, outputPath = "app/_tools/image/map-generator/code/data/natural-earth-water.json"] = process.argv.slice(2);
const tolerance = Number(process.argv[5] || 0.035);
if (!riversPath || !lakesPath) throw new Error("Usage: node app/_tools/image/map-generator/scripts/import-natural-earth-water.mjs <ne_10m_rivers_lake_centerlines.shp> <ne_10m_lakes.shp> [output] [tolerance]");

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
// Shapefile-derived rings can carry inverted winding, which renders as the
// whole-sphere complement. Normalize planar winding, then verify spherically.
const signedArea = (ring) => ring.slice(0, -1).reduce((area, [x, y], index) => {
  const [nextX, nextY] = ring[(index + 1) % ring.length];
  return area + x * nextY - nextX * y;
}, 0) / 2;
function normalizeWinding(polygon) {
  const [exterior, ...holes] = polygon;
  const fixedExterior = signedArea(exterior) < 0 ? exterior.slice().reverse() : exterior;
  const fixedHoles = holes.map((hole) => (signedArea(hole) > 0 ? hole.slice().reverse() : hole));
  return [fixedExterior, ...fixedHoles];
}
function fixPolygonWinding(polygon) {
  const normalized = normalizeWinding(polygon);
  return geoArea({ type: "Polygon", coordinates: normalized }) > 2 * Math.PI
    ? normalized.map((ring) => ring.slice().reverse())
    : normalized;
}
function simplifyPolygon(polygon) {
  const rings = polygon.map((ring) => simplify(ring, true)).filter((ring) => ring.length >= 4);
  return rings.length ? fixPolygonWinding(rings) : [];
}
const polygonGeometry = (geometry) => {
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: simplifyPolygon(geometry.coordinates) };
  }
  const coordinates = geometry.coordinates.map(simplifyPolygon).filter((polygon) => polygon.length);
  return { type: "MultiPolygon", coordinates };
};
const clean = (value) => String(value ?? "").replace(/\u0000/g, "").trim();
const riversSource = await readShapefile(riversPath, undefined, { encoding: "utf-8" }), lakesSource = await readShapefile(lakesPath, undefined, { encoding: "utf-8" });
const record = (feature, geometry) => ({ name: clean(feature.properties?.name), rank: Number(feature.properties?.scalerank ?? 10), geometry });
const output = {
  source: { title: "Natural Earth 1:10m Rivers, Lake Centerlines, and Lakes", url: "https://www.naturalearthdata.com/", license: "Public domain", simplificationToleranceDegrees: tolerance },
  rivers: riversSource.features.map((feature) => record(feature, lineGeometry(feature.geometry))),
  lakes: lakesSource.features.map((feature) => record(feature, polygonGeometry(feature.geometry))).filter((lake) => lake.geometry.coordinates.length),
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(output));
console.log(JSON.stringify({ outputPath, rivers: output.rivers.length, lakes: output.lakes.length, bytes: Buffer.byteLength(JSON.stringify(output)) }));
