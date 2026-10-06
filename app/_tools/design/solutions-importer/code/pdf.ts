import { loadPdfJs } from "../../../load-pdfjs.ts";

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
  const horizontal = [
    (a / horizontalLength) * item.width,
    (b / horizontalLength) * item.width,
  ];
  const vertical = [
    (c / verticalLength) * item.height,
    (d / verticalLength) * item.height,
  ];
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

type RawBounds = {
  left: number;
  right: number;
  bottom: number;
  top: number;
};

export function displayedBounds(
  bounds: RawBounds,
  view: number[],
  pageRotate: number,
) {
  const [pageLeft, pageBottom, pageRight, pageTop] = view;
  const rotation = ((pageRotate % 360) + 360) % 360;
  switch (rotation) {
    case 0:
      return {
        x0: bounds.left - pageLeft,
        x1: bounds.right - pageLeft,
        top: pageTop - bounds.top,
        bottom: pageTop - bounds.bottom,
      };
    case 90:
      return {
        x0: bounds.bottom - pageBottom,
        x1: bounds.top - pageBottom,
        top: bounds.left - pageLeft,
        bottom: bounds.right - pageLeft,
      };
    case 180:
      return {
        x0: pageRight - bounds.right,
        x1: pageRight - bounds.left,
        top: bounds.bottom - pageBottom,
        bottom: bounds.top - pageBottom,
      };
    case 270:
      return {
        x0: pageTop - bounds.top,
        x1: pageTop - bounds.bottom,
        top: pageRight - bounds.right,
        bottom: pageRight - bounds.left,
      };
    default:
      throw new Error(`Unsupported PDF page rotation: ${pageRotate}`);
  }
}

/** Extract positioned text without expanding the PDF's vector artwork. */
export async function extractPositionedPdfText(
  file: File,
  onProgress: (page: number, total: number) => void,
): Promise<PositionedPdfTextPage[]> {
  ensureReadableStreamAsyncIterator();
  const { getDocument } = await loadPdfJs();
  const loadingTask = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const pdf = await loadingTask.promise;
  const pages: PositionedPdfTextPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: true });
      const chars = content.items.flatMap((rawItem) => {
        if (!("str" in rawItem) || !rawItem.str) return [];
        const item = rawItem as TextItemLike;
        const bounds = displayedBounds(
          itemBounds(item),
          page.view,
          page.rotate,
        );
        return [
          {
            text: item.str,
            x0: bounds.x0,
            x1: bounds.x1,
            top: bounds.top,
            bottom: bounds.bottom,
            size: Math.max(
              item.height,
              Math.hypot(item.transform[2], item.transform[3]),
            ),
          },
        ];
      });
      pages.push({ chars });
      onProgress(pageNumber, pdf.numPages);
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages;
}
