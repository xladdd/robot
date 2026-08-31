import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = "/pdf.worker.legacy.mjs";

function ensureReadableStreamAsyncIterator() {
  const Stream = globalThis.ReadableStream;
  if (!Stream || !Symbol.asyncIterator) return;
  const prototype = Stream.prototype as ReadableStream<unknown> & {
    [Symbol.asyncIterator]?: () => AsyncIterableIterator<unknown>;
  };
  if (prototype[Symbol.asyncIterator]) return;

  Object.defineProperty(prototype, Symbol.asyncIterator, {
    configurable: true,
    value: async function* (this: ReadableStream<unknown>) {
      const reader = this.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export type PositionedPdfTextPage = {
  chars: Array<{
    text: string;
    x0: number;
    x1: number;
    top: number;
    bottom: number;
    size: number;
  }>;
};

type TextItemLike = {
  str: string;
  width: number;
  height: number;
  transform: number[];
};

function itemBounds(item: TextItemLike) {
  const [a, b, c, d, x, y] = item.transform;
  const horizontalLength = Math.hypot(a, b) || 1;
  const verticalLength = Math.hypot(c, d) || 1;
  const horizontal = [(a / horizontalLength) * item.width, (b / horizontalLength) * item.width];
  const vertical = [(c / verticalLength) * item.height, (d / verticalLength) * item.height];
  const corners = [
    [x, y],
    [x + horizontal[0], y + horizontal[1]],
    [x + vertical[0], y + vertical[1]],
    [x + horizontal[0] + vertical[0], y + horizontal[1] + vertical[1]],
  ];
  return {
    left: Math.min(...corners.map((corner) => corner[0])),
    right: Math.max(...corners.map((corner) => corner[0])),
    bottom: Math.min(...corners.map((corner) => corner[1])),
    top: Math.max(...corners.map((corner) => corner[1])),
  };
}

/** Extract positioned text without expanding the PDF's vector artwork. */
export async function extractPositionedPdfText(
  file: File,
  onProgress: (page: number, total: number) => void,
): Promise<PositionedPdfTextPage[]> {
  ensureReadableStreamAsyncIterator();
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const pages: PositionedPdfTextPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: true });
      const pageHeight = page.view[3] - page.view[1];
      const chars = content.items.flatMap((rawItem) => {
        if (!("str" in rawItem) || !rawItem.str) return [];
        const item = rawItem as TextItemLike;
        const bounds = itemBounds(item);
        return [{
          text: item.str,
          x0: bounds.left,
          x1: bounds.right,
          top: pageHeight - bounds.top,
          bottom: pageHeight - bounds.bottom,
          size: Math.max(item.height, Math.hypot(item.transform[2], item.transform[3])),
        }];
      });
      pages.push({ chars });
      onProgress(pageNumber, pdf.numPages);
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages;
}
