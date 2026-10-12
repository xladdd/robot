import assert from "node:assert/strict";
import test from "node:test";
import { createZip } from "../code/zip.ts";

test("builds a store-only archive with local headers, directory, and EOCD", () => {
  const zip = createZip([
    { name: "originals/01-deer-1K.jpg", data: Uint8Array.from([1, 2, 3, 4]) },
    { name: "transparent/01-deer-1K.png", data: Uint8Array.from([9, 8, 7]) },
  ]);

  const view = new DataView(zip.buffer);
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
  assert.equal(view.getUint32(0, true), 0x04034b50, "local file signature");

  const eocdOffset = zip.length - 22;
  assert.equal(
    view.getUint32(eocdOffset, true),
    0x06054b50,
    "end-of-central-directory signature",
  );
  assert.equal(view.getUint16(eocdOffset + 8, true), 2, "entry count");
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  assert.equal(
    view.getUint32(centralOffset, true),
    0x02014b50,
    "central directory signature",
  );
});

test("stores every entry name and payload byte for byte", () => {
  const first = Uint8Array.from([10, 20, 30, 40, 50]);
  const second = Uint8Array.from([99, 98]);
  const zip = createZip([
    { name: "originals/a.jpg", data: first },
    { name: "transparent/b.png", data: second },
  ]);
  const text = Buffer.from(zip).toString("latin1");

  assert.ok(text.includes("originals/a.jpg"));
  assert.ok(text.includes("transparent/b.png"));

  const firstAt = text.indexOf("originals/a.jpg");
  const payload = zip.slice(
    firstAt + "originals/a.jpg".length,
    firstAt + "originals/a.jpg".length + first.length,
  );
  assert.deepEqual(Array.from(payload), Array.from(first));

  const secondAt = text.indexOf("transparent/b.png");
  const secondPayload = zip.slice(
    secondAt + "transparent/b.png".length,
    secondAt + "transparent/b.png".length + second.length,
  );
  assert.deepEqual(Array.from(secondPayload), Array.from(second));
});

test("reports correct sizes and crc in the central directory", () => {
  const data = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const zip = createZip([{ name: "img.png", data }]);
  const view = new DataView(zip.buffer);
  const eocdOffset = zip.length - 22;
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  assert.equal(view.getUint32(centralOffset + 20, true), data.length);
  assert.equal(view.getUint32(centralOffset + 24, true), data.length);
  // CRC-32 of the bytes 1..8.
  assert.equal(view.getUint32(centralOffset + 16, true), 0x3fca88c5);
});
