import assert from "node:assert/strict";
import test from "node:test";
import { buildImageRequest } from "../code/image-model.ts";

const common = {
  prompt: "Fill the transparent hole.",
  reference: "data:image/png;base64,AA==",
  width: 800,
  height: 600,
  seed: 123,
} as const;

test("buildImageRequest emits only Seedream image parameters", () => {
  const request = buildImageRequest({
    ...common,
    model: "bytedance-seed/seedream-5-0-flash",
    purpose: "background",
    quality: "fast",
  });
  assert.equal(request.resolution, "1K");
  assert.equal(request.seed, 123);
  assert.equal(request.aspect_ratio, "4:3");
  assert.equal(request.n, 1);
  assert.ok(!("output_format" in request));
  assert.ok(!("background" in request));
});

test("buildImageRequest requests transparent GPT object completion", () => {
  const request = buildImageRequest({
    ...common,
    model: "openai/gpt-image-2.5-sunburst",
    purpose: "object-completion",
    quality: "fidelity",
  });
  assert.equal(request.background, "transparent");
  assert.equal(request.quality, "high");
  assert.equal(request.aspect_ratio, "4:3");
  assert.ok(!("resolution" in request));
  assert.ok(!("seed" in request));
  assert.ok(!("output_format" in request));
});

test("buildImageRequest requests an opaque GPT subject regeneration", () => {
  const request = buildImageRequest({
    ...common,
    model: "openai/gpt-image-2.5-sunburst",
    purpose: "subject-regeneration",
    quality: "fidelity",
  });
  assert.equal(request.background, "opaque");
  assert.equal(request.quality, "high");
  assert.ok(!("resolution" in request));
  assert.ok(!("seed" in request));
});

test("buildImageRequest preserves multiple ordered image references", () => {
  const request = buildImageRequest({
    ...common,
    reference: ["data:image/png;base64,FIRST", "data:image/png;base64,SECOND"],
    model: "openai/gpt-image-2.5-sunburst",
    purpose: "object-completion",
    quality: "fidelity",
  });
  assert.deepEqual(request.input_references, [
    {
      type: "image_url",
      image_url: { url: "data:image/png;base64,FIRST" },
    },
    {
      type: "image_url",
      image_url: { url: "data:image/png;base64,SECOND" },
    },
  ]);
});

test("buildImageRequest uses FLUX.3-supported fidelity parameters", () => {
  const request = buildImageRequest({
    ...common,
    model: "black-forest-labs/flux-3-image",
    purpose: "background",
    quality: "fidelity",
  });
  assert.equal(request.resolution, "2K");
  assert.equal(request.aspect_ratio, "4:3");
  assert.ok(!("seed" in request));
  assert.ok(!("output_format" in request));
});

test("buildImageRequest isolates Ming's unusual contract", () => {
  const request = buildImageRequest({
    ...common,
    model: "inclusionai/ming-image-0.1-design-layer",
    purpose: "background",
    quality: "fast",
  });
  assert.equal(request.output_format, "png");
  assert.ok(!("resolution" in request));
  assert.ok(!("aspect_ratio" in request));
  assert.ok(!("seed" in request));
});
