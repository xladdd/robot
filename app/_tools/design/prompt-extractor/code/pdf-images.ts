import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = "/pdf.worker.legacy.mjs";

export type PdfPageImage = {
  page: number;
  data: string;
};

export async function renderPdfPages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<PdfPageImage[]> {
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (pdf.numPages > 20) throw new Error("PDF_PAGE_LIMIT");

  const images: PdfPageImage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = Math.min(1.75, 1800 / Math.max(unscaled.width, unscaled.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Could not prepare a PDF page image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    images.push({ page: pageNumber, data: canvas.toDataURL("image/jpeg", 0.82) });
    page.cleanup();
    onProgress?.(pageNumber, pdf.numPages);
  }

  return images;
}
