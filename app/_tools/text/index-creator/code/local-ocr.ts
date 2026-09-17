import {
  GlobalWorkerOptions,
  getDocument,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ExtractedPage } from "./pdf-indexer";

GlobalWorkerOptions.workerSrc = "/pdf.worker.legacy.mjs";

const OCR_SCALE = 1.35;
const MIN_OCR_TEXT_LENGTH = 24;

type PdfDocumentWithDestroy = {
  destroy?: () => Promise<void> | void;
};

type TesseractWorker = {
  recognize: (
    image: HTMLCanvasElement,
    options?: { rotateAuto?: boolean },
  ) => Promise<{ data: { text: string; confidence?: number } }>;
  terminate: () => Promise<void>;
};

/** Select only pages whose live text layer is too small to search reliably. */
export function findLikelyOcrPages(pages: ExtractedPage[]) {
  return pages
    .filter((page) => page.text.trim().length < 180)
    .map((page) => page.pdfPage);
}

async function createLocalWorker() {
  const { createWorker } = await import("tesseract.js");
  return (await createWorker("ces", 1, {
    workerPath: "/index-creator-ocr/worker.min.js",
    corePath: "/index-creator-ocr/tesseract-core-lstm.wasm.js",
    langPath: "/index-creator-ocr/ces",
    gzip: true,
    logger: () => undefined,
  })) as unknown as TesseractWorker;
}

/**
 * OCR sparse pages locally and attach the result as possible-match evidence.
 * The PDF is rendered into an in-memory canvas and never leaves the browser.
 */
export async function addLocalOcrText(
  file: File,
  pages: ExtractedPage[],
  pageNumbers: number[],
  onProgress?: (done: number, total: number) => void,
) {
  if (!pageNumbers.length) return pages;

  const pageNumberSet = new Set(pageNumbers);
  const pdfDocument = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  let worker: TesseractWorker;
  try {
    worker = await createLocalWorker();
  } catch {
    await (pdfDocument as unknown as PdfDocumentWithDestroy).destroy?.();
    return pages;
  }
  const ocrByPage = new Map<number, { text: string; confidence?: number }>();

  try {
    for (let index = 0; index < pageNumbers.length; index += 1) {
      const pdfPage = await pdfDocument.getPage(pageNumbers[index]);
      const viewport = pdfPage.getViewport({ scale: OCR_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        onProgress?.(index + 1, pageNumbers.length);
        continue;
      }

      await pdfPage.render({
        canvas,
        canvasContext: context,
        viewport,
      }).promise;
      const result = await worker.recognize(canvas, { rotateAuto: true });
      const text = result.data.text.trim();
      if (text.length >= MIN_OCR_TEXT_LENGTH)
        ocrByPage.set(pageNumbers[index], {
          text,
          confidence: result.data.confidence,
        });
      canvas.width = 1;
      canvas.height = 1;
      onProgress?.(index + 1, pageNumbers.length);
    }
  } finally {
    await worker.terminate();
    await (pdfDocument as unknown as PdfDocumentWithDestroy).destroy?.();
  }

  return pages.map((page) => {
    if (!pageNumberSet.has(page.pdfPage)) return page;
    const ocr = ocrByPage.get(page.pdfPage);
    return ocr
      ? { ...page, ocrText: ocr.text, ocrConfidence: ocr.confidence }
      : page;
  });
}
