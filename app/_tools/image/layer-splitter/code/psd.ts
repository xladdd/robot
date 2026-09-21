import { writePsdBuffer, type Psd, type PixelData } from "ag-psd";

export type PsdLayerInput = {
  name: string;
  pixels: Uint8ClampedArray;
};

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
    children: layers.map(({ name, pixels }) => ({
      name,
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      imageData: { data: pixels, width, height },
      opacity: 255,
    })),
  };
  return writePsdBuffer(psd, { compress: true, noBackground: true });
}
