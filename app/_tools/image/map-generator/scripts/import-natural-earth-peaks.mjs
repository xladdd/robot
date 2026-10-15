import fs from "node:fs/promises";
import path from "node:path";
import shapefile from "shapefile";

const [
  shapefilePath,
  outputPath =
    "app/_tools/image/map-generator/code/data/natural-earth-peaks.json",
] = process.argv.slice(2);

if (!shapefilePath) {
  throw new Error(
    "Usage: node app/_tools/image/map-generator/scripts/import-natural-earth-peaks.mjs <elevation-points.shp> [output]",
  );
}

const source = await shapefile.open(shapefilePath);
const peaks = [];

for (;;) {
  const { done, value } = await source.read();
  if (done) break;
  const properties = value.properties || {};
  const coordinates = value.geometry?.coordinates;
  const elevation = Number(properties.elevation);
  const rank = Number(properties.scalerank ?? 10);
  const minZoom = Number(properties.min_zoom ?? 10);
  const name = String(
    properties.label || properties.name_en || properties.name || "",
  ).trim();

  if (
    properties.featurecla !== "mountain" ||
    value.geometry?.type !== "Point" ||
    !Array.isArray(coordinates) ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1]) ||
    !Number.isFinite(elevation) ||
    elevation <= 0 ||
    !Number.isFinite(rank) ||
    !Number.isFinite(minZoom) ||
    !name
  ) {
    continue;
  }

  peaks.push({
    name,
    elevation: Math.round(elevation),
    rank,
    minZoom,
    geometry: {
      type: "Point",
      coordinates: [coordinates[0], coordinates[1]],
    },
  });
}

peaks.sort(
  (a, b) =>
    a.rank - b.rank ||
    b.elevation - a.elevation ||
    a.name.localeCompare(b.name, "en"),
);

const output = {
  source: {
    title: "Natural Earth 1:10m geography regions elevation points",
    url: "https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-physical-labels/",
    downloadUrl:
      "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_geography_regions_elevation_points.zip",
    license: "Public domain",
  },
  peaks,
};
const json = JSON.stringify(output);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, json);
console.log(
  JSON.stringify({
    outputPath,
    peaks: peaks.length,
    rank0To2: peaks.filter(({ rank }) => rank <= 2).length,
    rank0To4: peaks.filter(({ rank }) => rank <= 4).length,
    bytes: Buffer.byteLength(json),
  }),
);
