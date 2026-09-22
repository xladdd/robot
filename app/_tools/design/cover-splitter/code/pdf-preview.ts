import {
  GlobalWorkerOptions,
  getDocument,
} from "pdfjs-dist/legacy/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = "/pdf.worker.legacy.mjs";

export type PdfFirstPagePreview = {
  blob: Blob;
  widthPoints: number;
  heightPoints: number;
};

const MAX_PREVIEW_DIMENSION = 1600;
const EXPORT_RENDER_SCALE = 300 / 72;
const MAX_EXPORT_DIMENSION = 16_384;
const MAX_EXPORT_PIXELS = 40_000_000;

export type CoverRasterFormat = "png" | "jpg";

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PDF_JPEG_FAILED"));
      },
      "image/jpeg",
      0.84,
    );
  });
}

function canvasToRaster(
  canvas: HTMLCanvasElement,
  format: CoverRasterFormat,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PDF_RASTER_FAILED"));
      },
      format === "png" ? "image/png" : "image/jpeg",
      format === "jpg" ? 0.92 : undefined,
    );
  });
}

function exportScale(width: number, height: number): number {
  const dimensionsScale = MAX_EXPORT_DIMENSION / Math.max(width, height);
  const pixelsScale = Math.sqrt(MAX_EXPORT_PIXELS / (width * height));
  return Math.min(EXPORT_RENDER_SCALE, dimensionsScale, pixelsScale);
}

export async function renderFirstPdfPage(
  file: File,
): Promise<PdfFirstPagePreview> {
  const loadingTask = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });

  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages < 1) throw new Error("PDF_EMPTY");

    const page = await pdf.getPage(1);
    try {
      const pointViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        1.75,
        MAX_PREVIEW_DIMENSION /
          Math.max(pointViewport.width, pointViewport.height),
      );
      const renderViewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(renderViewport.width));
      canvas.height = Math.max(1, Math.ceil(renderViewport.height));

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("PDF_CANVAS_FAILED");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas,
        canvasContext: context,
        viewport: renderViewport,
      }).promise;

      return {
        blob: await canvasToJpeg(canvas),
        widthPoints: pointViewport.width,
        heightPoints: pointViewport.height,
      };
    } finally {
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}

export async function renderSplitPdfPanel(
  buffer: ArrayBuffer,
  format: CoverRasterFormat,
): Promise<Blob> {
  // PDF.js may transfer its input to its own worker, so retain the panel bytes
  // that the caller needs later when rebuilding the combined ZIP.
  const loadingTask = getDocument({ data: new Uint8Array(buffer.slice(0)) });

  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages < 1) throw new Error("PDF_EMPTY");

    const page = await pdf.getPage(1);
    try {
      const pointViewport = page.getViewport({ scale: 1 });
      const renderViewport = page.getViewport({
        scale: exportScale(pointViewport.width, pointViewport.height),
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(renderViewport.width));
      canvas.height = Math.max(1, Math.ceil(renderViewport.height));

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("PDF_CANVAS_FAILED");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas,
        canvasContext: context,
        viewport: renderViewport,
      }).promise;

      return canvasToRaster(canvas, format);
    } finally {
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}
