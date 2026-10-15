import fs from "node:fs/promises";
import path from "node:path";
import { read as readShapefile } from "shapefile";
import { geoArea } from "d3-geo";

const landPath = process.argv[2];
const countriesPath = process.argv[3];
const outputDir = process.argv[4] || "app/_tools/image/map-generator/code/data";
const tolerance = Number(process.argv[5] || 0.02);
if (!landPath || !countriesPath) throw new Error("Usage: node app/_tools/image/map-generator/scripts/import-natural-earth-10m.mjs <ne_10m_land.shp> <ne_10m_admin_0_countries.shp> [output-dir] [tolerance-degrees]");

function distance(point, start, end) {
  let x = start[0], y = start[1], dx = end[0] - x, dy = end[1] - y;
  if (dx || dy) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = end[0]; y = end[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  return (point[0] - x) ** 2 + (point[1] - y) ** 2;
}
function simplify(points, threshold) {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]], squared = threshold * threshold;
  while (stack.length) {
    const [first, last] = stack.pop();
    let best = squared, selected = -1;
    for (let index = first + 1; index < last; index++) {
      const value = distance(points[index], points[first], points[last]);
      if (value > best) { best = value; selected = index; }
    }
    if (selected >= 0) { keep[selected] = 1; stack.push([first, selected], [selected, last]); }
  }
  return points.filter((_, index) => keep[index]);
}
const quantize = ([lon, lat]) => [Math.round(lon * 10000) / 10000, Math.round(lat * 10000) / 10000];
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
function sphericallyInverted(geometry) {
  return geoArea(geometry) > 2 * Math.PI;
}
function fixPolygonWinding(polygon) {
  const normalized = normalizeWinding(polygon);
  const probe = { type: "Polygon", coordinates: normalized };
  return sphericallyInverted(probe)
    ? normalized.map((ring) => ring.slice().reverse())
    : normalized;
}
function simplifyRing(ring) {
  const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const body = closed ? ring.slice(0, -1) : ring;
  const simplified = simplify(body, tolerance).map(quantize);
  if (simplified.length < 3) return [];
  if (closed) simplified.push(simplified[0]);
  return simplified;
}
function simplifyPolygon(polygon) {
  const rings = polygon.map(simplifyRing).filter((ring) => ring.length >= 4);
  if (!rings.length) return [];
  return fixPolygonWinding(rings);
}
function simplifyGeometry(geometry) {
  if (geometry.type === "Polygon") {
    const coordinates = simplifyPolygon(geometry.coordinates);
    return coordinates.length ? { type: "Polygon", coordinates } : null;
  }
  if (geometry.type === "MultiPolygon") {
    const coordinates = geometry.coordinates.map(simplifyPolygon).filter((polygon) => polygon.length);
    return coordinates.length ? { type: "MultiPolygon", coordinates } : null;
  }
  return null;
}
const clean = (value) => String(value ?? "").replace(/\u0000/g, "").trim();

const land = await readShapefile(landPath, undefined, { encoding: "utf-8" });
const landPolygons = [];
for (const feature of land.features) {
  if (!feature.geometry) continue;
  const geometry = simplifyGeometry(feature.geometry);
  if (!geometry) continue;
  if (geometry.type === "Polygon") landPolygons.push(geometry.coordinates);
  else landPolygons.push(...geometry.coordinates);
}
const countriesCollection = await readShapefile(countriesPath, undefined, { encoding: "utf-8" });
const countries = [];
for (const feature of countriesCollection.features) {
  const isoNumeric = [feature.properties.ISO_N3, feature.properties.ISO_N3_EH]
    .map(clean)
    .find((value) => /^\d{3}$/.test(value)) || "";
  const iso = isoNumeric;
  const name = clean(feature.properties.NAME) || clean(feature.properties.ADMIN);
  if (!iso || !feature.geometry) continue;
  const geometry = simplifyGeometry(feature.geometry);
  if (!geometry) continue;
  countries.push({ iso, name, geometry });
}

const source = {
  title: "Natural Earth 1:10m land and Admin 0 countries",
  url: "https://www.naturalearthdata.com/",
  license: "Public domain",
  simplificationToleranceDegrees: tolerance,
  adaptation: "Coordinates simplified and quantized to four decimals for interactive web rendering.",
  importedAt: new Date().toISOString(),
};
await fs.mkdir(outputDir, { recursive: true });
const landOutput = { source, geometry: { type: "MultiPolygon", coordinates: landPolygons } };
const countriesOutput = { source, countries };
const landFile = path.join(outputDir, "natural-earth-land.json");
const countriesFile = path.join(outputDir, "natural-earth-countries.json");
await fs.writeFile(landFile, JSON.stringify(landOutput));
await fs.writeFile(countriesFile, JSON.stringify(countriesOutput));
console.log(JSON.stringify({
  landFile, countriesFile,
  landPolygons: landPolygons.length,
  countries: countries.length,
  landBytes: Buffer.byteLength(JSON.stringify(landOutput)),
  countriesBytes: Buffer.byteLength(JSON.stringify(countriesOutput)),
}));
