import sharp from "sharp";
import type { VectorObjectManifest } from "./contracts.ts";

const WIDTH = 500;
const HEIGHT = 375;

type Raster = Awaited<ReturnType<typeof renderObjects>>;

async function renderObjects(inner: string, objectIds: string[]) {
  const selectors = objectIds.map((id) => `[data-object-id="${id}"]`).join(",");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 750" width="${WIDTH}" height="${HEIGHT}"><style>[data-object-id]{display:none!important}${selectors}{display:inline!important}</style>${inner}</svg>`;
  return sharp(Buffer.from(svg), { density: 72 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function assertRaster(raster: Raster) {
  if (
    raster.info.width !== WIDTH ||
    raster.info.height !== HEIGHT ||
    raster.info.channels < 4
  )
    throw new Error(
      "The underlay coverage probe returned invalid raster data.",
    );
}

function alphaAt(raster: Raster, pixel: number) {
  return raster.data[pixel * raster.info.channels + raster.info.channels - 1];
}

function footprintCoverage(foreground: Raster, underlay: Raster) {
  assertRaster(foreground);
  assertRaster(underlay);
  let foregroundPixels = 0;
  let coveredPixels = 0;
  let minimumX = WIDTH;
  let minimumY = HEIGHT;
  let maximumX = -1;
  let maximumY = -1;
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    const foregroundAlpha = alphaAt(foreground, pixel);
    if (foregroundAlpha < 24) continue;
    foregroundPixels += 1;
    const x = pixel % WIDTH;
    const y = Math.floor(pixel / WIDTH);
    minimumX = Math.min(minimumX, x);
    minimumY = Math.min(minimumY, y);
    maximumX = Math.max(maximumX, x);
    maximumY = Math.max(maximumY, y);
    const underlayAlpha = alphaAt(underlay, pixel);
    if (underlayAlpha >= Math.max(16, foregroundAlpha * 0.5))
      coveredPixels += 1;
  }
  if (foregroundPixels < 12)
    throw new Error(
      "A movable semantic object has no usable visible footprint.",
    );
  const boundsArea = (maximumX - minimumX + 1) * (maximumY - minimumY + 1);
  return {
    coverage: coveredPixels / foregroundPixels,
    footprintDensity: foregroundPixels / boundsArea,
  };
}

export async function verifyUnderlayCoverage(
  inner: string,
  objects: VectorObjectManifest[],
) {
  const movable = objects.filter(
    (object) => object.role === "structure" || object.role === "detail",
  );
  const cache = new Map<string, Raster>();
  const render = async (ids: string[]) => {
    const key = [...ids].sort().join("|");
    let raster = cache.get(key);
    if (!raster) {
      raster = await renderObjects(inner, ids);
      cache.set(key, raster);
    }
    return raster;
  };
  for (const object of movable) {
    const [foreground, underlay] = await Promise.all([
      render([object.id]),
      render(object.underlyingObjectIds),
    ]);
    const { coverage, footprintDensity } = footprintCoverage(
      foreground,
      underlay,
    );
    const boundaryLike =
      footprintDensity < 0.3 &&
      /(?:membrane|boundary|outline|envelope)/i.test(
        `${object.id} ${object.description}`,
      );
    const requiredCoverage = boundaryLike ? 0.45 : 0.985;
    if (coverage < requiredCoverage)
      throw new Error(
        `Underlying geometry covers only ${(coverage * 100).toFixed(1)}% of ${object.id}; moving it could expose a hole.`,
      );
  }
  return movable.length;
}
