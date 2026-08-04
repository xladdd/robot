import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = "/pdf.worker.legacy.mjs";

export type ExtractedPage = {
  pdfPage: number;
  text: string;
  printedCandidates: number[];
};

export type WordForms = { word: string; forms: string[] };
export type IndexMatches = { word: string; pdfPages: number[]; otherPdfPages?: number[] }[];
export type IndexCandidate = {
  word: string;
  pages: Array<{ pdfPage: number; snippets: string[] }>;
};

type TextItemLike = {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
};

type TextContentChunk = {
  items: TextItemLike[];
};

async function readTextItems(page: Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>["promise"]>["getPage"]>>) {
  const reader = page.streamTextContent().getReader();
  const items: TextItemLike[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      items.push(...((value as TextContentChunk | undefined)?.items ?? []));
    }
  } finally {
    reader.releaseLock();
  }

  return items;
}

export async function extractPdfPages(file: File, onProgress?: (done: number, total: number) => void) {
  const document = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: ExtractedPage[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    // Avoid PDF.js's async iteration over ReadableStream, which older WebKit
    // versions don't implement even though their reader API works correctly.
    const items = await readTextItems(page);
    let text = "";
    const marginNumbers: Array<{ value: number; distance: number }> = [];

    for (const item of items) {
      const value = item.str ?? "";
      text += value;
      text += item.hasEOL ? "\n" : " ";

      const numeric = value.trim();
      const y = item.transform?.[5];
      if (/^\d{1,3}$/.test(numeric) && typeof y === "number") {
        const bottomDistance = y;
        const topDistance = viewport.height - y;
        const edgeDistance = Math.min(bottomDistance, topDistance);
        if (edgeDistance <= viewport.height * 0.13) {
          const parsed = Number(numeric);
          if (parsed > 0) marginNumbers.push({ value: parsed, distance: edgeDistance });
        }
      }
    }

    pages.push({
      pdfPage: pageNumber,
      text: text.normalize("NFC").replace(/\u00ad/g, "").replace(/-\s*\n\s*/g, "").replace(/[ \t]+/g, " "),
      printedCandidates: marginNumbers.sort((a, b) => a.distance - b.distance).map((item) => item.value),
    });
    onProgress?.(pageNumber, document.numPages);
  }

  return pages;
}

export function detectPrintedPageAnchor(pages: ExtractedPage[]) {
  const offsets = new Map<number, { count: number; pdfPage: number; printedPage: number }>();
  for (const page of pages) {
    for (const printedPage of page.printedCandidates.slice(0, 2)) {
      const offset = page.pdfPage - printedPage;
      const current = offsets.get(offset);
      offsets.set(offset, current
        ? { ...current, count: current.count + 1 }
        : { count: 1, pdfPage: page.pdfPage, printedPage });
    }
  }
  return [...offsets.values()].sort((a, b) => b.count - a.count)[0] ?? { count: 0, pdfPage: 1, printedPage: 1 };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findIndexMatches(pages: ExtractedPage[], entries: WordForms[]): IndexMatches {
  return entries.map(({ word, forms }) => {
    const patterns = [...new Set([word, ...forms].map((form) => form.normalize("NFC").trim()).filter(Boolean))]
      .map((form) => escapeRegExp(form).replace(/\s+/g, "\\s+"));
    const expression = patterns.length
      ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${patterns.join("|")})(?![\\p{L}\\p{N}])`, "iu")
      : null;
    return {
      word,
      pdfPages: expression ? pages.filter((page) => expression.test(page.text)).map((page) => page.pdfPage) : [],
    };
  });
}

function isReferencePage(text: string) {
  const beginning = text.slice(0, 1400);
  const heading = beginning.toLocaleUpperCase("cs-CZ");
  const dottedLeaders = beginning.match(/\.{4,}/g)?.length ?? 0;
  return /(?:^|\n)\s*(?:REJSTŘÍK|INDEX|OBSAH)\b/u.test(heading) || dottedLeaders >= 5;
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function buildVocabulary(pages: ExtractedPage[]) {
  const vocabulary = new Map<string, string>();
  for (const page of pages) {
    for (const match of page.text.matchAll(/\p{L}[\p{L}\p{M}-]{4,}/gu)) {
      const token = match[0].normalize("NFC");
      const key = token.toLocaleLowerCase("cs-CZ");
      if (!vocabulary.has(key)) vocabulary.set(key, token);
    }
  }
  return vocabulary;
}

export function findIndexCandidates(pages: ExtractedPage[], entries: WordForms[]): IndexCandidate[] {
  const searchablePages = pages.filter((page) => !isReferencePage(page.text));
  const vocabulary = buildVocabulary(searchablePages);

  return entries.map(({ word, forms }) => {
    const submittedTokens = word.trim().split(/\s+/);
    const discoveredSpellings: string[] = [];
    if (submittedTokens.length === 1 && submittedTokens[0].length >= 7) {
      const submitted = submittedTokens[0].normalize("NFC").toLocaleLowerCase("cs-CZ");
      const maximumDistance = submitted.length >= 9 ? 2 : 1;
      for (const [candidate, original] of vocabulary) {
        if (candidate.slice(0, 3) === submitted.slice(0, 3) && Math.abs(candidate.length - submitted.length) <= maximumDistance && editDistance(submitted, candidate) <= maximumDistance) {
          discoveredSpellings.push(original);
          if (discoveredSpellings.length === 8) break;
        }
      }
    }

    const distinctivePhraseTokens = submittedTokens.length > 1
      ? submittedTokens.filter((token, index) => index > 0 && /^\p{Lu}/u.test(token) && token.length >= 5)
      : [];
    const patternValues = [...new Set([word, ...forms, ...discoveredSpellings, ...distinctivePhraseTokens].map((form) => form.normalize("NFC").trim()).filter(Boolean))];
    const patterns = patternValues
      .sort((a, b) => b.length - a.length)
      .map((form) => escapeRegExp(form).replace(/\s+/g, "\\s+"));
    if (!patterns.length) return { word, pages: [] };

    const source = `(?<![\\p{L}\\p{N}])(?:${patterns.join("|")})(?![\\p{L}\\p{N}])`;
    const matches = searchablePages.flatMap((page) => {
      const snippets: string[] = [];
      for (const match of page.text.matchAll(new RegExp(source, "giu"))) {
        const start = Math.max(0, (match.index ?? 0) - 180);
        const end = Math.min(page.text.length, (match.index ?? 0) + match[0].length + 220);
        snippets.push(page.text.slice(start, end).replace(/\s+/g, " ").trim());
        if (snippets.length === 3) break;
      }
      return snippets.length ? [{ pdfPage: page.pdfPage, snippets }] : [];
    });

    return { word, pages: matches.slice(0, 48) };
  });
}

export function formatIndex(matches: IndexMatches, pdfAnchor: number, printedAnchor: number) {
  return matches.map(({ word, pdfPages, otherPdfPages = [] }) => {
    const printedPages = [...new Set(pdfPages.map((page) => printedAnchor + page - pdfAnchor).filter((page) => page > 0))].sort((a, b) => a - b);
    const otherPrintedPages = [...new Set(otherPdfPages.map((page) => printedAnchor + page - pdfAnchor).filter((page) => page > 0))].sort((a, b) => a - b);
    return `${word}\t${printedPages.join(", ")}\t(${otherPrintedPages.join(", ")})`;
  }).join("\n");
}
