import assert from "node:assert/strict";
import test from "node:test";
import { readPsd } from "ag-psd";
import { createLayeredPsd } from "../code/psd.ts";

test("writes a readable layered PSD with a reconstructed composite", () => {
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
    ["Foreground", "Background"],
  );
});
