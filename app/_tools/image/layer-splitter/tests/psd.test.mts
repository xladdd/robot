import assert from "node:assert/strict";
import test from "node:test";
import { initializeCanvas, readPsd } from "ag-psd";
import { createLayeredPsd } from "../code/psd.ts";

initializeCanvas(
  () => {
    throw new Error("Canvas output was not expected.");
  },
  (width, height) =>
    ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }) as ImageData,
);

test("writes a readable PSD with the background at the bottom", () => {
  const background = new Uint8ClampedArray([
    10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
  ]);
  const object = new Uint8ClampedArray([
    200, 10, 10, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const psd = createLayeredPsd(2, 2, background, [
    { name: "Foreground", pixels: object },
    { name: "Background", pixels: background },
  ]);
  assert.equal(psd.toString("ascii", 0, 4), "8BPS");
  const parsed = readPsd(psd, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  assert.equal(parsed.width, 2);
  assert.equal(parsed.height, 2);
  assert.deepEqual(
    parsed.children?.map((layer) => layer.name),
    ["Background", "Foreground"],
  );
});

test("round-trips editable full-canvas layer masks", () => {
  const completeLayer = new Uint8ClampedArray([
    200, 10, 20, 255, 30, 210, 40, 255, 50, 60, 220, 255, 230, 240, 70, 255,
  ]);
  const ordinaryLayer = new Uint8ClampedArray([
    10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
  ]);
  const mask = new Uint8Array([255, 0, 128, 64]);
  const psd = createLayeredPsd(2, 2, ordinaryLayer, [
    { name: "Masked", pixels: completeLayer, mask },
    { name: "Ordinary", pixels: ordinaryLayer },
  ]);

  const parsed = readPsd(psd, {
    useImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  assert.deepEqual(
    parsed.children?.map((layer) => layer.name),
    ["Ordinary", "Masked"],
  );

  const [ordinary, masked] = parsed.children ?? [];
  assert.equal(ordinary.mask, undefined);
  assert.deepEqual(Array.from(masked.imageData?.data ?? []), [
    ...completeLayer,
  ]);
  assert.deepEqual(
    {
      top: masked.mask?.top,
      left: masked.mask?.left,
      bottom: masked.mask?.bottom,
      right: masked.mask?.right,
      defaultColor: masked.mask?.defaultColor,
      positionRelativeToLayer: masked.mask?.positionRelativeToLayer,
      width: masked.mask?.imageData?.width,
      height: masked.mask?.imageData?.height,
    },
    {
      top: 0,
      left: 0,
      bottom: 2,
      right: 2,
      defaultColor: 0,
      positionRelativeToLayer: false,
      width: 2,
      height: 2,
    },
  );
  assert.deepEqual(
    Array.from(masked.mask?.imageData?.data ?? []),
    [255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255, 64, 64, 64, 255],
  );
});
