import path from "node:path";
import sharp from "sharp";
import { geoMercator, geoNaturalEarth1 } from "d3-geo";
import * as projectionModule from "d3-geo-projection";

const sourcePath = process.argv[2];
const outputDir = process.argv[3] || "app/_tools/image/map-generator/public";
const outputWidth = Number(process.argv[4] || 6000);
const outputHeight = Math.round((outputWidth * 7) / 10);

if (!sourcePath)
  throw new Error(
    "Usage: node app/_tools/image/map-generator/scripts/import-natural-earth-relief.mjs <Natural-Earth-relief.tif> [output-dir] [width]",
  );

const projections =
  projectionModule && typeof projectionModule === "object"
    ? projectionModule
    : {};
const geoRobinson = projections.geoRobinson;
const geoEckert4 = projections.geoEckert4;
if (typeof geoRobinson !== "function" || typeof geoEckert4 !== "function")
  throw new Error("d3-geo-projection did not expose Robinson and Eckert IV");

const sourceMetadata = await sharp(sourcePath).metadata();
const samplingWidth = Math.min(
  sourceMetadata.width || outputWidth * 2,
  Math.max(5400, outputWidth * 2),
);
const samplingHeight = Math.round(samplingWidth / 2);
const source = await sharp(sourcePath)
  .resize({ width: samplingWidth, height: samplingHeight, fit: "fill" })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const sourcePixels = source.data;
const sourceWidth = source.info.width;
const sourceHeight = source.info.height;
const channels = source.info.channels;

const projectionFactories = {
  schematic: geoMercator,
  robinson: geoRobinson,
  eckert4: geoEckert4,
  naturalEarth: geoNaturalEarth1,
};
const sample = (lon, lat, channel) => {
  const x = Math.max(
    0,
    Math.min(
      sourceWidth - 1,
      Math.round(((lon + 180) / 360) * (sourceWidth - 1)),
    ),
  );
  const y = Math.max(
    0,
    Math.min(
      sourceHeight - 1,
      Math.round(((90 - lat) / 180) * (sourceHeight - 1)),
    ),
  );
  return sourcePixels[(y * sourceWidth + x) * channels + channel];
};

for (const [id, createProjection] of Object.entries(projectionFactories)) {
  const projection = createProjection().fitExtent(
    [
      [0, 0],
      [1000, 700],
    ],
    { type: "Sphere" },
  );
  const output = Buffer.alloc(outputWidth * outputHeight * 3, 255);
  const xScale = 1000 / outputWidth;
  const yScale = 700 / outputHeight;
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const targetX = (x + 0.5) * xScale;
      const targetY = (y + 0.5) * yScale;
      const coordinate = projection.invert?.([targetX, targetY]);
      if (
        !coordinate ||
        !Number.isFinite(coordinate[0]) ||
        !Number.isFinite(coordinate[1]) ||
        coordinate[0] < -180 ||
        coordinate[0] > 180 ||
        coordinate[1] < -90 ||
        coordinate[1] > 90
      )
        continue;
      const projected = projection(coordinate);
      if (
        !projected ||
        Math.abs(projected[0] - targetX) > xScale * 1.5 ||
        Math.abs(projected[1] - targetY) > yScale * 1.5
      )
        continue;
      const offset = (y * outputWidth + x) * 3;
      output[offset] = sample(coordinate[0], coordinate[1], 0);
      output[offset + 1] = sample(coordinate[0], coordinate[1], 1);
      output[offset + 2] = sample(coordinate[0], coordinate[1], 2);
    }
  }
  await sharp(output, {
    raw: { width: outputWidth, height: outputHeight, channels: 3 },
  })
    .jpeg({ quality: 86, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toFile(path.join(outputDir, `natural-earth-relief-${id}.jpg`));
  console.log(`Wrote ${id} relief (${outputWidth} × ${outputHeight})`);
}
