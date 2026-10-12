import { writePsdBuffer, type Psd, type PixelData } from "ag-psd";

export type PsdLayerInput = {
  name: string;
  pixels: Uint8ClampedArray;
  mask?: Uint8Array;
};

function maskPixelData(
  mask: Uint8Array,
  width: number,
  height: number,
): PixelData {
  if (mask.length !== width * height)
    throw new Error("Layer mask dimensions do not match the PSD canvas.");

  const data = new Uint8ClampedArray(mask.length * 4);
  for (let index = 0; index < mask.length; index++) {
    const offset = index * 4;
    data[offset] = mask[index];
    data[offset + 1] = mask[index];
    data[offset + 2] = mask[index];
    data[offset + 3] = 255;
  }
  return { data, width, height };
}

export function createLayeredPsd(
  width: number,
  height: number,
  composite: Uint8ClampedArray,
  layers: readonly PsdLayerInput[],
) {
  const imageData: PixelData = { data: composite, width, height };
  const psd: Psd = {
    width,
    height,
    imageData,
    // ag-psd serializes children in Photoshop's bottom-to-top stack order,
    // while the rest of the splitter uses top-to-bottom order.
    children: [...layers].reverse().map(({ name, pixels, mask }) => ({
      name,
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      imageData: { data: pixels, width, height },
      opacity: 255,
      ...(mask
        ? {
            mask: {
              top: 0,
              left: 0,
              bottom: height,
              right: width,
              defaultColor: 0,
              positionRelativeToLayer: false,
              imageData: maskPixelData(mask, width, height),
            },
          }
        : {}),
    })),
  };
  return writePsdBuffer(psd, { compress: true, noBackground: true });
}
