import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

const inputPath = process.argv[2];
const outputPath = process.argv[3] || "app/_tools/image/map-generator/code/data/cshapes-timeline.json";
const tolerance = Number(process.argv[4] || 0.06);
if (!inputPath) throw new Error("Usage: node app/_tools/image/map-generator/scripts/import-cshapes.mjs <CShapes-2.0.geojson> [output] [tolerance-degrees]");

const input = await fs.readFile(inputPath);
const source = JSON.parse(input.toString("utf8"));
if (source.type !== "FeatureCollection" || !Array.isArray(source.features)) throw new Error("Expected a GeoJSON FeatureCollection.");

const squareDistance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
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
  const closed = squareDistance(points[0], points.at(-1)) < 1e-16;
  const line = closed ? points.slice(0, -1) : points.slice();
  const keep = new Uint8Array(line.length); keep[0] = 1; keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]], squared = threshold * threshold;
  while (stack.length) {
    const [first, last] = stack.pop(); let maximum = squared, selected = -1;
    for (let index = first + 1; index < last; index++) {
      const distance = segmentDistance(line[index], line[first], line[last]);
      if (distance > maximum) { maximum = distance; selected = index; }
    }
    if (selected >= 0) { keep[selected] = 1; stack.push([first, selected], [selected, last]); }
  }
  let result = line.filter((_, index) => keep[index]);
  if (closed && result.length < 3) result = line.slice(0, 3);
  if (closed) result.push(result[0]);
  return result;
}
const quantize = (point) => point.map((value) => Math.round(value * 10000) / 10000);
const simplifyPolygon = (polygon) => polygon.map((ring) => simplifyLine(ring, tolerance).map(quantize)).filter((ring) => ring.length >= 4);
const simplifyGeometry = (geometry) => {
  if (geometry.type === "Polygon") return { type: "Polygon", coordinates: simplifyPolygon(geometry.coordinates) };
  if (geometry.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: geometry.coordinates.map(simplifyPolygon).filter((polygon) => polygon.length) };
  throw new Error(`Unsupported geometry: ${geometry.type}`);
};
const isoDate = (year, month, day) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const records = source.features.map((feature, index) => {
  const properties = feature.properties || {};
  const validFrom = isoDate(properties.gwsyear, properties.gwsmonth, properties.gwsday);
  const validTo = isoDate(properties.gweyear, properties.gwemonth, properties.gweday);
  return {
    id: `${properties.gwcode}-${validFrom}-${index}`,
    code: properties.gwcode,
    name: properties.cntry_name,
    validFrom,
    validTo,
    capital: properties.capname ? { name: properties.capname, lon: properties.caplong, lat: properties.caplat } : null,
    geometry: simplifyGeometry(feature.geometry),
  };
});
const eventDates = [...new Set(records.flatMap(({ validFrom, validTo }) => [validFrom, validTo]))].sort();
const output = {
  version: 1,
  source: {
    title: "CShapes 2.0",
    url: "https://icr.ethz.ch/data/cshapes/",
    downloadUrl: "https://icr.ethz.ch/data/cshapes/CShapes-2.0.geojson",
    citation: "Schvitz et al. (2022), Mapping the International System, 1886–2017: The CShapes 2.0 Dataset",
    license: "CC BY-NC-SA 4.0",
    sha256: crypto.createHash("sha256").update(input).digest("hex"),
    importedAt: new Date().toISOString(),
    simplificationToleranceDegrees: tolerance,
  },
  coverage: { globalFrom: "1886-01-01", through: "2019-12-31" },
  eventDates,
  records,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(output));
console.log(JSON.stringify({ outputPath, records: records.length, events: eventDates.length, bytes: Buffer.byteLength(JSON.stringify(output)), sha256: output.source.sha256 }));
