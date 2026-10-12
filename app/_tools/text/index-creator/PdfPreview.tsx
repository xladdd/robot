"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import { loadPdfJs } from "../../load-pdfjs";

type PdfViewport = {
  width: number;
  height: number;
  scale: number;
  transform: number[];
};

type PdfTextItem = {
  str: string;
  width: number;
  height: number;
  transform: number[];
};

type PdfPage = {
  getViewport: ({ scale }: { scale: number }) => PdfViewport;
  getTextContent: () => Promise<{ items: unknown[] }>;
  render: (parameters: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => { promise: Promise<void>; cancel: () => void };
  cleanup: () => void;
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};

type TextRange = PdfTextItem & {
  start: number;
  end: number;
};

type HighlightBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function isPdfTextItem(item: unknown): item is PdfTextItem {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Partial<PdfTextItem>;
  return (
    typeof candidate.str === "string" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    Array.isArray(candidate.transform) &&
    candidate.transform.length >= 6
  );
}

function multiplyTransforms(left: number[], right: number[]) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function searchableText(value: string) {
  let text = "";
  const sourceOffsets: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const folded = value[index]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/gu, "")
      .toLocaleLowerCase();

    for (const character of folded) {
      const normalized = /[\p{L}\p{N}]/u.test(character) ? character : " ";
      if (normalized === " " && text.endsWith(" ")) continue;
      text += normalized;
      sourceOffsets.push(index);
    }
  }

  return { text, sourceOffsets };
}

type SearchToken = {
  value: string;
  start: number;
  end: number;
};

function searchTokens(value: string): SearchToken[] {
  return [...value.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({
    value: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function commonPrefixLength(left: string, right: string) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function editDistance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function broadTokenMatch(query: string, candidate: string) {
  if (query === candidate) return true;
  if (query.length >= 6) {
    const minimumPrefix = Math.max(5, query.length - 1);
    if (
      candidate.length >= minimumPrefix &&
      commonPrefixLength(query, candidate) >= minimumPrefix
    )
      return true;

    const shortNameStem =
      query.endsWith("s") &&
      query.length <= 7 &&
      commonPrefixLength(query, candidate) >= query.length - 2 &&
      /(?:ove|ovi|em|u|a|y|e)$/u.test(candidate);
    if (shortNameStem) return true;
  }

  const maximumDistance = query.length >= 9 ? 2 : 1;
  return (
    query.length >= 6 &&
    Math.abs(query.length - candidate.length) <= maximumDistance &&
    commonPrefixLength(query, candidate) >=
      Math.max(3, Math.floor(query.length / 2)) &&
    editDistance(query, candidate) <= maximumDistance
  );
}

function broadMatch(
  sourceTokens: SearchToken[],
  term: string,
): { start: number; end: number } | null {
  const components = searchTokens(term).map((token) => token.value);
  if (!components.length) return null;

  for (const firstToken of sourceTokens) {
    if (!broadTokenMatch(components[0], firstToken.value)) continue;
    const selected = [firstToken];
    let complete = true;

    for (const component of components.slice(1)) {
      const next = sourceTokens
        .filter(
          (token) =>
            !selected.includes(token) &&
            Math.abs(token.start - firstToken.start) <= 180 &&
            broadTokenMatch(component, token.value),
        )
        .sort(
          (left, right) =>
            Math.abs(left.start - firstToken.start) -
            Math.abs(right.start - firstToken.start),
        )[0];
      if (!next) {
        complete = false;
        break;
      }
      selected.push(next);
    }

    if (complete)
      return {
        start: Math.min(...selected.map((token) => token.start)),
        end: Math.max(...selected.map((token) => token.end)),
      };
  }

  return null;
}

function locateFirstMatch(source: string, terms: readonly string[]) {
  const normalizedSource = searchableText(source);
  const normalizedTerms = [
    ...new Set(
      terms
        .map((term) => searchableText(term).text.trim())
        .filter((term) => term.length > 0),
    ),
  ];
  const sourceTokens = searchTokens(normalizedSource.text);

  for (const term of normalizedTerms) {
    const exactStart = normalizedSource.text.indexOf(term);
    const match =
      exactStart >= 0
        ? { start: exactStart, end: exactStart + term.length }
        : broadMatch(sourceTokens, term);
    if (!match) continue;
    return {
      start: normalizedSource.sourceOffsets[match.start],
      end: normalizedSource.sourceOffsets[match.end - 1] + 1,
    };
  }

  return null;
}

function highlightBoxes(
  items: PdfTextItem[],
  viewport: PdfViewport,
  terms: readonly string[],
): HighlightBox[] {
  let pageText = "";
  const ranges: TextRange[] = [];

  for (const item of items) {
    if (!item.str) continue;
    if (pageText && !/\s$/u.test(pageText)) pageText += " ";
    const start = pageText.length;
    pageText += item.str;
    ranges.push({ ...item, start, end: pageText.length });
  }

  const match = locateFirstMatch(pageText, terms);
  if (!match) return [];

  return ranges.flatMap((item) => {
    const overlapStart = Math.max(item.start, match.start);
    const overlapEnd = Math.min(item.end, match.end);
    if (overlapStart >= overlapEnd) return [];

    const transform = multiplyTransforms(viewport.transform, item.transform);
    const fontHeight = Math.max(2, Math.hypot(transform[2], transform[3]));
    const itemWidth = Math.max(
      fontHeight * 0.4,
      Math.abs(item.width * viewport.scale),
    );
    const itemLength = Math.max(1, item.end - item.start);
    const startFraction = (overlapStart - item.start) / itemLength;
    const widthFraction = (overlapEnd - overlapStart) / itemLength;

    return [
      {
        left: transform[4] + itemWidth * startFraction - 1,
        top: transform[5] - fontHeight - 1,
        width: Math.max(4, itemWidth * widthFraction + 2),
        height: fontHeight + 3,
      },
    ];
  });
}

function IndexPdfPreviewPage({
  pdfDocument,
  pageNumber,
  availableWidth,
  shouldRender,
  isSelected,
  highlightTerms,
  highlightedMatchLabel,
  errorLabel,
  scrollContainerRef,
}: {
  pdfDocument: PdfDocument;
  pageNumber: number;
  availableWidth: number;
  shouldRender: boolean;
  isSelected: boolean;
  highlightTerms: readonly string[];
  highlightedMatchLabel: string;
  errorLabel: string;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aspectRatio, setAspectRatio] = useState(Math.SQRT2);
  const [highlights, setHighlights] = useState<HighlightBox[]>([]);
  const [accessibleText, setAccessibleText] = useState("");
  const [failed, setFailed] = useState(false);
  const highlightKey = highlightTerms.join("\u0000");
  const pageWidth = Math.max(1, availableWidth - 24);
  const pageHeight = Math.max(1, pageWidth * aspectRatio);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!shouldRender) {
      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = "0";
      canvas.style.height = "0";
      setHighlights([]);
      setAccessibleText("");
      return;
    }

    let cancelled = false;
    let page: PdfPage | null = null;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null =
      null;
    setHighlights([]);
    setAccessibleText("");
    setFailed(false);

    void (async () => {
      try {
        page = await pdfDocument.getPage(pageNumber);
        if (cancelled) return;
        const unscaled = page.getViewport({ scale: 1 });
        const scale = Math.max(0.2, Math.min(2, pageWidth / unscaled.width));
        const viewport = page.getViewport({ scale });
        setAspectRatio(viewport.height / viewport.width);
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("PDF_CANVAS_FAILED");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        const task = page.render({ canvas, canvasContext: context, viewport });
        renderTask = task;
        await task.promise;
        const content = await page.getTextContent();
        if (cancelled) return;
        const terms = highlightKey ? highlightKey.split("\u0000") : [];
        const textItems = content.items.filter(isPdfTextItem);
        const boxes = highlightBoxes(textItems, viewport, terms);
        setHighlights(boxes);
        setAccessibleText(textItems.map((item) => item.str).join(" "));

        if (isSelected && boxes[0]) {
          window.requestAnimationFrame(() => {
            const container = scrollContainerRef.current;
            const pageElement = pageRef.current;
            if (!container || !pageElement || cancelled) return;
            container.scrollTo({
              top: Math.max(
                0,
                pageElement.offsetTop +
                  boxes[0].top -
                  container.clientHeight / 3,
              ),
              left: 0,
            });
          });
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        page?.cleanup();
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [
    availableWidth,
    highlightKey,
    isSelected,
    pageNumber,
    pageWidth,
    pdfDocument,
    scrollContainerRef,
    shouldRender,
  ]);

  return (
    <div
      ref={pageRef}
      className="index-pdf-page"
      data-pdf-page={pageNumber}
      style={{ width: pageWidth, height: pageHeight }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      {highlights.map((highlight, index) => (
        <span
          className="index-pdf-highlight"
          key={`${highlight.left}-${highlight.top}-${index}`}
          style={highlight as CSSProperties}
        />
      ))}
      <p className="index-pdf-accessible-text">
        {highlights.length > 0 && highlightTerms[0]
          ? `${highlightedMatchLabel}: ${highlightTerms[0]}. `
          : ""}
        {accessibleText}
      </p>
      {failed && (
        <span className="index-pdf-page-error" role="alert">
          {errorLabel}
        </span>
      )}
    </div>
  );
}

export function IndexPdfPreview({
  file,
  pageNumber,
  highlightTerms,
  label,
  errorLabel,
  highlightedMatchLabel,
  onPageCount,
}: {
  file: File;
  pageNumber: number;
  highlightTerms: readonly string[];
  label: string;
  errorLabel: string;
  highlightedMatchLabel: string;
  onPageCount: (pageCount: number | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [nearbyPages, setNearbyPages] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      setContainerWidth((current) => (current === width ? current : width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PdfDocument | null = null;
    setPdfDocument(null);
    setNearbyPages(new Set());
    setFailed(false);
    setIsLoading(true);
    onPageCount(null);

    void (async () => {
      try {
        const { getDocument } = await loadPdfJs();
        loadedDocument = (await getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
        }).promise) as unknown as PdfDocument;
        if (cancelled) {
          await loadedDocument.destroy();
          loadedDocument = null;
          return;
        }
        setPdfDocument(loadedDocument);
        setIsLoading(false);
        onPageCount(loadedDocument.numPages);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (loadedDocument) void loadedDocument.destroy();
    };
  }, [file, onPageCount]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pdfDocument) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setNearbyPages((current) => {
          const next = new Set(current);
          let changed = false;
          for (const entry of entries) {
            const page = Number(
              (entry.target as HTMLElement).dataset.pdfPage ?? 0,
            );
            if (!page) continue;
            if (entry.isIntersecting && !next.has(page)) {
              next.add(page);
              changed = true;
            } else if (!entry.isIntersecting && next.delete(page)) {
              changed = true;
            }
          }
          return changed ? next : current;
        });
      },
      { root: container, rootMargin: "1200px 0px" },
    );

    container
      .querySelectorAll<HTMLElement>("[data-pdf-page]")
      .forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, [pdfDocument]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pdfDocument) return;
    const selectedPage = container.querySelector<HTMLElement>(
      `[data-pdf-page="${pageNumber}"]`,
    );
    if (!selectedPage) return;
    container.scrollTo({
      top: Math.max(0, selectedPage.offsetTop - 12),
      left: 0,
    });
  }, [pageNumber, pdfDocument]);

  return (
    <div
      ref={containerRef}
      className="index-pdf-preview"
      role="group"
      aria-label={label}
      aria-busy={isLoading}
    >
      {pdfDocument &&
        Array.from({ length: pdfDocument.numPages }, (_, index) => {
          const currentPage = index + 1;
          const isSelected = currentPage === pageNumber;
          return (
            <IndexPdfPreviewPage
              key={currentPage}
              pdfDocument={pdfDocument}
              pageNumber={currentPage}
              availableWidth={containerWidth}
              shouldRender={isSelected || nearbyPages.has(currentPage)}
              isSelected={isSelected}
              highlightTerms={isSelected ? highlightTerms : []}
              highlightedMatchLabel={highlightedMatchLabel}
              errorLabel={errorLabel}
              scrollContainerRef={containerRef}
            />
          );
        })}
      {failed && (
        <span className="index-pdf-preview-error" role="alert">
          {errorLabel}
        </span>
      )}
    </div>
  );
}
