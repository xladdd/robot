import sharp from "sharp";
import {
  MAX_PIXELS,
  validateReferenceDimensions,
  type ImageDimensions,
} from "./image-format.ts";

export const MAX_OUTPUT_BYTES = 32_000_000;
export type ImageOutput = { b64_json?: string; url?: string };

export async function normalizeImageOutput(
  image: ImageOutput,
  requestedDimensions: ImageDimensions | null,
) {
  const target = requestedDimensions
    ? validateReferenceDimensions([requestedDimensions])[0]
    : null;
  if (!image.b64_json) {
    if (target)
      throw new Error(
        "Exact-size output requires inline image bytes, but the provider returned only a URL. Use an image provider that returns b64_json; remote images are not downloaded for normalization.",
      );
    if (!image.url || !/^https:\/\//i.test(image.url))
      throw new Error("OpenRouter returned no usable image.");
    return {
      data: image.url,
      nativeDimensions: null,
      finalDimensions: null,
      nativeDimensionsVerified: false,
      resized: false,
    };
  }

  const encoded = image.b64_json;
  if (
    encoded.length > Math.ceil(MAX_OUTPUT_BYTES / 3) * 4 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  )
    throw new Error(
      "The provider returned invalid or oversized base64 image bytes.",
    );
  const bytes = Buffer.from(encoded, "base64");
  if (
    !bytes.length ||
    bytes.length > MAX_OUTPUT_BYTES ||
    bytes.toString("base64") !== encoded
  )
    throw new Error(
      "The generated image exceeds the safe byte limit or is empty.",
    );

  const input = sharp(bytes, {
    limitInputPixels: MAX_PIXELS,
    failOn: "warning",
  });
  const metadata = await input.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
    (metadata.pages ?? 1) !== 1
  )
    throw new Error(
      "The provider must return a single PNG, JPEG, or WebP image.",
    );
  const nativeDimensions = validateReferenceDimensions([
    { width: metadata.width, height: metadata.height },
  ])[0];
  const resized =
    target !== null &&
    (target.width !== nativeDimensions.width ||
      target.height !== nativeDimensions.height);
  if (!resized) {
    return {
      data: `data:image/${metadata.format};base64,${encoded}`,
      nativeDimensions,
      finalDimensions: nativeDimensions,
      nativeDimensionsVerified: true,
      resized: false,
    };
  }

  // Contain preserves the whole composition. A ratio mismatch adds white margins,
  // rather than cropping or stretching artwork to pretend the model matched it.
  const { data, info } = await input
    .resize({
      width: target.width,
      height: target.height,
      fit: "contain",
      background: "#ffffff",
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 95 })
    .toBuffer({ resolveWithObject: true });
  if (data.length > MAX_OUTPUT_BYTES)
    throw new Error("The normalized image exceeds the safe byte limit.");
  return {
    data: `data:image/jpeg;base64,${data.toString("base64")}`,
    nativeDimensions,
    finalDimensions: { width: info.width, height: info.height },
    nativeDimensionsVerified: true,
    resized: true,
  };
}
