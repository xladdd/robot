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
