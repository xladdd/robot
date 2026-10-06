import { loadPdfJs } from "../../../load-pdfjs.ts";
import { getDetailRegions } from "./render-geometry";

export type PdfPageImage = {
  page: number;
  data: string;
  details: string[];
};

export async function renderPdfPages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<PdfPageImage[]> {
  const { getDocument } = await loadPdfJs();
  const pdf = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  if (pdf.numPages > 20) throw new Error("PDF_PAGE_LIMIT");

  const images: PdfPageImage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = Math.min(
      2.5,
      2200 / Math.max(unscaled.width, unscaled.height),
    );
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Could not prepare a PDF page image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const details = getDetailRegions(canvas.width, canvas.height).map(
      ({ x, y, width, height }) => {
        const detailCanvas = document.createElement("canvas");
        detailCanvas.width = Math.ceil(width);
        detailCanvas.height = Math.ceil(height);
        const detailContext = detailCanvas.getContext("2d", { alpha: false });
        if (!detailContext)
          throw new Error("Could not prepare a PDF detail image.");
        detailContext.fillStyle = "#ffffff";
        detailContext.fillRect(0, 0, detailCanvas.width, detailCanvas.height);
        detailContext.drawImage(
          canvas,
          x,
          y,
          width,
          height,
          0,
          0,
          detailCanvas.width,
          detailCanvas.height,
        );
        return detailCanvas.toDataURL("image/jpeg", 0.84);
      },
    );
    images.push({
      page: pageNumber,
      data: canvas.toDataURL("image/jpeg", 0.86),
      details,
    });
    page.cleanup();
    onProgress?.(pageNumber, pdf.numPages);
  }

  return images;
}
