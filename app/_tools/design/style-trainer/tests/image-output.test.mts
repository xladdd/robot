import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { MAX_OUTPUT_BYTES, normalizeImageOutput } from "../code/image-output.ts";
import { DEFAULT_RATIOS, selectImageFormat } from "../code/image-format.ts";

async function fixture(width: number, height: number, format: "png" | "jpeg" | "webp" = "png") {
  return sharp({ create: { width, height, channels: 3, background: "#ff0000" } })
    .toFormat(format).toBuffer();
}
const inline = (bytes: Buffer) => ({ b64_json: bytes.toString("base64") });
const decode = (data: string) => Buffer.from(data.slice(data.indexOf(",") + 1), "base64");

test("equal originals receive exact final dimensions without claiming native resolution", async () => {
  const target = { width: 1920, height: 1080 };
  const format = selectImageFormat([target, target], {
    aspect_ratio: { type: "enum", values: [...DEFAULT_RATIOS] },
  });
  assert.equal(format.exactSizeRequested, false);
  assert.deepEqual(format.parameters, { aspect_ratio: "16:9" });
  const output = await normalizeImageOutput(inline(await fixture(1024, 576)), format.requestedDimensions);
  assert.deepEqual(output.nativeDimensions, { width: 1024, height: 576 });
  assert.deepEqual(output.finalDimensions, target);
  assert.equal(output.nativeDimensionsVerified, true);
  assert.equal(output.resized, true);
  const metadata = await sharp(decode(output.data)).metadata();
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 1080);
});

test("contain adds white margins instead of cropping or stretching mismatched ratios", async () => {
  const output = await normalizeImageOutput(inline(await fixture(100, 50)), { width: 100, height: 100 });
  const { data, info } = await sharp(decode(output.data)).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
  assert.ok(pixel(50, 5).every(c => c > 245));
  assert.ok(pixel(50, 95).every(c => c > 245));
  const center = pixel(50, 50);
  assert.ok(center[0] > 245 && center[1] < 10 && center[2] < 10);
  assert.deepEqual(output.finalDimensions, { width: 100, height: 100 });
});

test("matching native pixels and mixed-dimension output preserve original image bytes and MIME", async () => {
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await fixture(100, 60, format);
    for (const target of [null, { width: 100, height: 60 }]) {
      const output = await normalizeImageOutput(inline(bytes), target);
      assert.equal(output.resized, false);
      assert.ok(output.data.startsWith(`data:image/${format};base64,`));
      assert.deepEqual(decode(output.data), bytes);
      assert.deepEqual(output.finalDimensions, { width: 100, height: 60 });
    }
  }
});

test("downsampling and native exact-size requests still verify actual returned pixels", async () => {
  const target = { width: 80, height: 60 };
  const output = await normalizeImageOutput(inline(await fixture(400, 300)), target);
  assert.deepEqual(output.finalDimensions, target);
  assert.equal(output.resized, true);
});

test("URL-only exact-size results are refused without fetching any remote resource", async () => {
  await assert.rejects(normalizeImageOutput({ url: "https://127.0.0.1/private" }, { width: 100, height: 100 }), /requires inline image bytes.*b64_json/);
  const output = await normalizeImageOutput({ url: "https://example.com/image.jpg" }, null);
  assert.equal(output.nativeDimensions, null);
  assert.equal(output.finalDimensions, null);
  assert.equal(output.nativeDimensionsVerified, false);
  assert.equal(output.resized, false);
  await assert.rejects(normalizeImageOutput({ url: "file:///private/image.jpg" }, null), /no usable image/);
});

test("rejects invalid bytes, unsafe target dimensions, and oversized native headers", async () => {
  for (const b64_json of ["!bad", "a===", "abcd====", Buffer.from("not an image").toString("base64")])
    await assert.rejects(normalizeImageOutput({ b64_json }, null));
  await assert.rejects(normalizeImageOutput({}, null), /no usable image/);
  await assert.rejects(normalizeImageOutput({}, { width: 10000, height: 10000 }), /safe integer\/pixel limits/);
  await assert.rejects(normalizeImageOutput(inline(await fixture(16385, 1)), null), /safe integer\/pixel limits/);
  await assert.rejects(normalizeImageOutput({ b64_json: "A".repeat(Math.ceil(MAX_OUTPUT_BYTES / 3) * 4 + 4) }, null), /oversized/);
});
