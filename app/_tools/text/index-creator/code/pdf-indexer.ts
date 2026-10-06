import { loadPdfJs } from "../../../load-pdfjs.ts";

export type ExtractedPage = {
  pdfPage: number;
  text: string;
  alternateText?: string;
  ocrText?: string;
  ocrConfidence?: number;
  printedCandidates: number[];
};

export type WordForms = { word: string; forms: string[] };
export type IndexMatches = {
  word: string;
  pdfPages: number[];
  otherPdfPages?: number[];
}[];

export type CandidateDecision = "recommended" | "possible";
export type CandidateMatchKind =
  | "exact-term"
  | "complete-inflection"
  | "formatting-variant"
  | "spelling-tolerance"
  | "contextual-short-name"
  | "stem-match"
  | "phrase-proximity"
  | "diacritic-variant"
  | "fuzzy-token"
  | "adjacent-page";
export type CandidateReason =
  | "exact-term"
  | "complete-inflection"
  | "formatting-variant"
  | "spelling-tolerance"
  | "near-page-heading"
  | "substantial-prose"
  | "repeated-treatment"
  | "question-heavy"
  | "caption-like"
  | "list-like"
  | "cross-reference-only"
  | "contextual-short-name"
  | "stem-match"
  | "phrase-proximity"
  | "diacritic-variant"
  | "fuzzy-token"
  | "adjacent-page"
  | "manual-review-required";

export type IndexCandidateEvidence = {
  pdfPage: number;
  matchedForms: string[];
  occurrences: number;
  reasons: CandidateReason[];
};

export type IndexCandidatePage = {
  pdfPage: number;
  sourcePdfPage?: number;
  snippets: string[];
  score: number;
  decision: CandidateDecision;
  matchedForms: string[];
  matchKinds: CandidateMatchKind[];
  evidence: string[];
  reasons: CandidateReason[];
};

export type IndexCandidate = {
  word: string;
  pages: IndexCandidatePage[];
  recommendedPages: number[];
  possiblePages: number[];
};

type TextItemLike = {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
};

type TextContentChunk = {
  items: TextItemLike[];
};

type SearchToken = {
  original: string;
  folded: string;
  start: number;
  end: number;
};

type BroadObservation = {
  form: string;
  kind: Extract<
    CandidateMatchKind,
    "stem-match" | "phrase-proximity" | "diacritic-variant" | "fuzzy-token"
  >;
  start: number;
  end: number;
  snippet: string;
};

type BroadPageEvidence = {
  matchedForms: string[];
  matchKinds: CandidateMatchKind[];
  evidence: string[];
  reasons: CandidateReason[];
  snippets: string[];
};

type PdfDocumentWithDestroy = {
  destroy?: () => Promise<void> | void;
};

/** Normalize PDF text without turning separate words into one token. */
export function normalizeIndexText(value: string) {
  return value
    .normalize("NFC")
    .replace(/\u00ad/gu, "")
    .replace(/-\s*(?:\r\n|\r|\n)\s*/gu, "")
    .replace(/[\r\n\u2028\u2029]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeFormattingPunctuation(value: string) {
  return value
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u02bc]/gu, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/gu, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/gu, "-");
}

function normalizeSearchText(value: string) {
  return normalizeFormattingPunctuation(normalizeIndexText(value));
}

function comparable(value: string) {
  return normalizeSearchText(value).toLocaleLowerCase("cs-CZ");
}

function tokens(value: string) {
  return normalizeSearchText(value).split(/\s+/u).filter(Boolean);
}

function romanTokens(value: string) {
  return tokens(value)
    .map((token) => token.replace(/[.,;:!?]+$/gu, ""))
    .filter((token) =>
      /^(?=[MDCLXVI]+$)(?:M{0,4}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))$/iu.test(
        token,
      ),
    )
    .map((token) => token.toLocaleUpperCase("en-US"));
}

function hasPreservedRomanIdentity(original: string, form: string) {
  const originalRoman = romanTokens(original);
  if (!originalRoman.length) return true;
  const formRoman = romanTokens(form);
  return originalRoman.every((roman) => formRoman.includes(roman));
}

function identityTokens(value: string) {
  const stopWords = new Set(["z", "ze", "von", "van", "de", "of", "the"]);
  return tokens(value).filter(
    (token) =>
      token.replace(/[.,;:!?]+$/gu, "").length >= 3 &&
      !romanTokens(token).length &&
      !stopWords.has(token.toLocaleLowerCase("cs-CZ")),
  );
}

function preservesIdentityComponents(original: string, form: string) {
  const formValues = identityTokens(form).map((token) =>
    token.replace(/[.,;:!?]+$/gu, "").toLocaleLowerCase("cs-CZ"),
  );
  return identityTokens(original).every((token) => {
    const stem = token
      .replace(/[.,;:!?]+$/gu, "")
      .toLocaleLowerCase("cs-CZ")
      .slice(0, 3);
    return formValues.some(
      (value) => value.startsWith(stem) || stem.startsWith(value.slice(0, 3)),
    );
  });
}

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "");
}

function commonPrefixLength(left: string, right: string) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function preservesSingleWordStem(original: string, form: string) {
  const originalWords = identityTokens(original);
  const formWords = identityTokens(form).map((token) =>
    stripDiacritics(
      token.replace(/[.,;:!?]+$/gu, "").toLocaleLowerCase("cs-CZ"),
    ),
  );
  return originalWords.every((token) => {
    const normalized = stripDiacritics(
      token.replace(/[.,;:!?]+$/gu, "").toLocaleLowerCase("cs-CZ"),
    );
    if (normalized.length < 6) return true;
    const minimumPrefix = Math.max(5, normalized.length - 2);
    return formWords.some(
      (value) => commonPrefixLength(normalized, value) >= minimumPrefix,
    );
  });
}

function isSafeForm(original: string, form: string) {
  const normalizedOriginal = normalizeSearchText(original);
  const normalizedForm = normalizeSearchText(form);
  if (
    !normalizedForm ||
    !hasPreservedRomanIdentity(original, form) ||
    !preservesIdentityComponents(original, form) ||
    !preservesSingleWordStem(original, form)
  )
    return false;

  // A phrase must stay a phrase. This prevents a model from converting a
  // person or place name into individually searchable components.
  if (tokens(normalizedOriginal).length > 1) {
    return tokens(normalizedForm).length >= tokens(normalizedOriginal).length;
  }
  return true;
}

function safeForms(entry: WordForms) {
  const forms = [entry.word, ...entry.forms]
    .map((form) => normalizeSearchText(form))
    .filter((form) => isSafeForm(entry.word, form));
  return [...new Set(forms)];
}

function formattingVariants(value: string) {
  const normalized = normalizeSearchText(value);
  const variants = [normalized];
  const withoutTerminalPunctuation = normalized.replace(/[.,;:]+$/u, "");
  if (withoutTerminalPunctuation !== normalized)
    variants.push(withoutTerminalPunctuation);
  return [...new Set(variants)].filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseExpression(value: string) {
  const pattern = escapeRegExp(value).replace(/\s+/gu, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "giu");
}

function phrasePatterns(entry: WordForms) {
  return safeForms(entry).flatMap((form) =>
    formattingVariants(form).map((variant) => ({ form, variant })),
  );
}

async function readTextItems(page: {
  streamTextContent: () => ReadableStream<TextContentChunk>;
}) {
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

function reconstructCoordinateText(items: TextItemLike[]) {
  const positioned = items
    .map((item) => ({
      value: normalizeFormattingPunctuation(item.str ?? "").trim(),
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
    }))
    .filter((item) => item.value);
  const lines: Array<{ y: number; items: typeof positioned }> = [];

  for (const item of positioned) {
    const line = lines.find(
      (candidate) => Math.abs(candidate.y - item.y) <= 2.5,
    );
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }

  return normalizeIndexText(
    lines
      .sort((left, right) => right.y - left.y)
      .map((line) =>
        line.items
          .sort((left, right) => left.x - right.x)
          .map((item) => item.value)
          .join(" "),
      )
      .join("\n"),
  );
}

export async function getPdfPageCount(file: File): Promise<number> {
  const { getDocument } = await loadPdfJs();
  const document = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;

  try {
    return document.numPages;
  } finally {
    await (document as unknown as PdfDocumentWithDestroy).destroy?.();
  }
}

export async function extractPdfPages(
  file: File,
  onProgress?: (done: number, total: number) => void,
) {
  const { getDocument } = await loadPdfJs();
  const document = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const pages: ExtractedPage[] = [];

  try {
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
        if (/^\d{1,3}$/u.test(numeric) && typeof y === "number") {
          const bottomDistance = y;
          const topDistance = viewport.height - y;
          const edgeDistance = Math.min(bottomDistance, topDistance);
          if (edgeDistance <= viewport.height * 0.13) {
            const parsed = Number(numeric);
            if (parsed > 0)
              marginNumbers.push({ value: parsed, distance: edgeDistance });
          }
        }
      }

      const streamText = normalizeIndexText(text);
      const alternateText = reconstructCoordinateText(items);
      pages.push({
        pdfPage: pageNumber,
        text: streamText,
        ...(alternateText && alternateText !== streamText
          ? { alternateText }
          : {}),
        printedCandidates: marginNumbers
          .sort((a, b) => a.distance - b.distance)
          .map((item) => item.value),
      });
      onProgress?.(pageNumber, document.numPages);
    }
  } finally {
    await (document as unknown as PdfDocumentWithDestroy).destroy?.();
  }

  return pages;
}

export type PrintedPageAnchor = {
  count: number;
  consecutiveRun: number;
  pdfPage: number;
  printedPage: number;
};

/** Prefer a sustained PDF-page/printed-page sequence over isolated numbers. */
export function detectPrintedPageAnchor(
  pages: ExtractedPage[],
): PrintedPageAnchor {
  const observations = pages.flatMap((page) =>
    [...new Set(page.printedCandidates.slice(0, 3))].map((printedPage) => ({
      pdfPage: page.pdfPage,
      printedPage,
      offset: page.pdfPage - printedPage,
    })),
  );
  const offsets = new Map<number, PrintedPageAnchor>();

  for (const observation of observations) {
    const current = offsets.get(observation.offset);
    offsets.set(
      observation.offset,
      current
        ? { ...current, count: current.count + 1 }
        : {
            count: 1,
            consecutiveRun: 1,
            pdfPage: observation.pdfPage,
            printedPage: observation.printedPage,
          },
    );
  }

  for (const [offset, anchor] of offsets) {
    const sequence = observations
      .filter((observation) => observation.offset === offset)
      .sort((left, right) => left.pdfPage - right.pdfPage);
    let bestRun = 0;
    let runLength = 0;
    let previous: (typeof sequence)[number] | undefined;

    for (const observation of sequence) {
      if (
        previous &&
        observation.pdfPage === previous.pdfPage + 1 &&
        observation.printedPage === previous.printedPage + 1
      ) {
        runLength += 1;
      } else {
        runLength = 1;
      }
      if (runLength > bestRun) bestRun = runLength;
      previous = observation;
    }
    const firstObservation = sequence[0];
    offsets.set(offset, {
      ...anchor,
      consecutiveRun: bestRun,
      pdfPage: firstObservation.pdfPage,
      printedPage: firstObservation.printedPage,
    });
  }

  return (
    [...offsets.values()].sort(
      (left, right) =>
        right.consecutiveRun - left.consecutiveRun ||
        right.count - left.count ||
        left.pdfPage - right.pdfPage,
    )[0] ?? {
      count: 0,
      consecutiveRun: 0,
      pdfPage: 1,
      printedPage: 1,
    }
  );
}

export function findIndexMatches(
  pages: ExtractedPage[],
  entries: WordForms[],
): IndexMatches {
  return entries.map((entry) => {
    const patterns = phrasePatterns(entry).map(({ variant }) =>
      phraseExpression(variant),
    );
    return {
      word: entry.word,
      pdfPages: pages
        .filter((page) => {
          const text = normalizeSearchText(page.text);
          return patterns.some((expression) => {
            expression.lastIndex = 0;
            const matched = expression.test(text);
            expression.lastIndex = 0;
            return matched;
          });
        })
        .map((page) => page.pdfPage),
    };
  });
}

function editDistance(left: string, right: string) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
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
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function buildVocabulary(pages: ExtractedPage[]) {
  const vocabulary = new Map<string, string>();
  for (const page of pages) {
    const text = normalizeSearchText(page.text);
    for (const match of text.matchAll(/\p{L}[\p{L}\p{M}-]{4,}/gu)) {
      const token = match[0].normalize("NFC");
      const key = token.toLocaleLowerCase("cs-CZ");
      if (!vocabulary.has(key)) vocabulary.set(key, token);
    }
  }
  return vocabulary;
}

function definitionContext(text: string, start: number, end: number) {
  const context = text.slice(Math.max(0, start - 140), end + 180);
  return /\b(?:je|jsou|byl|byla|bylo|znamená|označuje|patří|vznik|představuje|is|are|was|were|means|refers|known|is|este|sunt|înseamnă|reprezintă)\b/iu.test(
    context,
  );
}

function collectPhraseEvidence(text: string, entry: WordForms) {
  const seen = new Set<string>();
  const matches: Array<{
    start: number;
    end: number;
    form: string;
    variant: string;
  }> = [];

  for (const { form, variant } of phrasePatterns(entry)) {
    for (const match of text.matchAll(phraseExpression(variant))) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      const key = `${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({ start, end, form, variant });
    }
  }

  return matches.sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
}

function contextualNameTokens(word: string) {
  const ignored = new Set(["z", "ze", "von", "van", "de", "of", "the"]);
  return identityTokens(word)
    .filter((token) => !romanTokens(token).length)
    .filter((token) => !ignored.has(token.toLocaleLowerCase("cs-CZ")))
    .slice(0, 1)
    .map((token) => token.replace(/[.,;:!?]+$/gu, ""));
}

function hasStandaloneToken(text: string, token: string) {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(token)}(?![\\p{L}\\p{N}])`,
    "iu",
  ).test(text);
}

function uniqueValues<T>(values: T[]) {
  return [...new Set(values)];
}

function foldedSearchText(value: string) {
  return stripDiacritics(normalizeSearchText(value)).toLocaleLowerCase("cs-CZ");
}

function normalizeSearchToken(value: string) {
  return foldedSearchText(value).replace(
    /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,
    "",
  );
}

function searchTokens(value: string): SearchToken[] {
  const result: SearchToken[] = [];
  for (const match of normalizeSearchText(value).matchAll(
    /[\p{L}][\p{L}\p{M}\p{N}'’-]*/gu,
  )) {
    const original = match[0];
    const start = match.index ?? 0;
    result.push({
      original,
      folded: normalizeSearchToken(original),
      start,
      end: start + original.length,
    });
    const parts = original.split(/[-–—]/u);
    if (parts.length <= 1) continue;
    let offset = 0;
    for (const part of parts) {
      const partStart = original.indexOf(part, offset);
      result.push({
        original: part,
        folded: normalizeSearchToken(part),
        start: start + partStart,
        end: start + partStart + part.length,
      });
      offset = partStart + part.length;
    }
  }
  return result;
}

function pageSearchTexts(page: ExtractedPage) {
  return uniqueValues(
    [page.text, page.alternateText, page.ocrText]
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeSearchText(value)),
  );
}

function broadTokenKind(
  query: string,
  candidate: SearchToken,
): Extract<
  CandidateMatchKind,
  "stem-match" | "diacritic-variant" | "fuzzy-token"
> | null {
  const normalizedQuery = normalizeSearchToken(query);
  if (!normalizedQuery || !candidate.folded) return null;
  const rawQuery = normalizeSearchText(query).toLocaleLowerCase("cs-CZ");
  const rawCandidate = normalizeSearchText(
    candidate.original,
  ).toLocaleLowerCase("cs-CZ");
  if (normalizedQuery === candidate.folded) {
    return rawQuery === rawCandidate ? "stem-match" : "diacritic-variant";
  }
  if (normalizedQuery.length >= 6) {
    const minimumPrefix = Math.max(5, normalizedQuery.length - 1);
    if (
      candidate.folded.length >= minimumPrefix &&
      commonPrefixLength(normalizedQuery, candidate.folded) >= minimumPrefix
    )
      return "stem-match";

    // Some Czech proper names change the final nominative ending in the
    // oblique forms, for example Kosmas → Kosmově. Keep this deliberately
    // narrow so ordinary related scientific words are not treated alike.
    const shortNameStem =
      normalizedQuery.endsWith("s") &&
      normalizedQuery.length <= 7 &&
      commonPrefixLength(normalizedQuery, candidate.folded) >=
        normalizedQuery.length - 2 &&
      /(?:ove|ovi|em|u|a|y|e)$/u.test(candidate.folded);
    if (shortNameStem) return "stem-match";
  }
  const maximumDistance = normalizedQuery.length >= 9 ? 2 : 1;
  if (
    normalizedQuery.length >= 6 &&
    Math.abs(normalizedQuery.length - candidate.folded.length) <=
      maximumDistance &&
    commonPrefixLength(normalizedQuery, candidate.folded) >=
      Math.max(3, Math.floor(normalizedQuery.length / 2)) &&
    editDistance(normalizedQuery, candidate.folded) <= maximumDistance
  )
    return "fuzzy-token";
  return null;
}

function broadIdentityTokens(value: string) {
  return identityTokens(value)
    .flatMap((token) => token.split(/[-–—]/u))
    .map((token) => normalizeSearchToken(token))
    .filter(Boolean);
}

function hasRequiredRomanTokens(text: string, form: string) {
  const foldedText = foldedSearchText(text);
  return romanTokens(form).every((roman) =>
    new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(roman.toLocaleLowerCase("en-US"))}(?![\\p{L}\\p{N}])`,
      "u",
    ).test(foldedText),
  );
}

function collectBroadObservations(
  text: string,
  entry: WordForms,
): BroadObservation[] {
  const normalizedText = normalizeSearchText(text);
  const pageTokens = searchTokens(normalizedText);
  const observations: BroadObservation[] = [];
  const seen = new Set<string>();
  const forms = safeForms(entry);
  const addObservation = (observation: BroadObservation) => {
    const key = `${observation.form}:${observation.start}:${observation.end}:${observation.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    observations.push(observation);
  };

  for (const form of forms) {
    const components = broadIdentityTokens(form);
    if (!components.length || !hasRequiredRomanTokens(normalizedText, form))
      continue;

    if (components.length === 1) {
      for (const token of pageTokens) {
        const kind = broadTokenKind(components[0], token);
        if (!kind) continue;
        addObservation({
          form,
          kind,
          start: token.start,
          end: token.end,
          snippet: normalizedText
            .slice(Math.max(0, token.start - 180), token.end + 220)
            .trim(),
        });
      }
      continue;
    }

    for (const firstToken of pageTokens) {
      const firstKind = broadTokenKind(components[0], firstToken);
      if (!firstKind) continue;
      const selected = [firstToken];
      const kinds = [firstKind];
      let complete = true;
      for (const component of components.slice(1)) {
        const next = pageTokens
          .filter(
            (token) =>
              !selected.includes(token) &&
              Math.abs(token.start - firstToken.start) <= 180,
          )
          .map((token) => ({
            token,
            kind: broadTokenKind(component, token),
          }))
          .filter(
            (item): item is { token: SearchToken; kind: typeof firstKind } =>
              item.kind !== null,
          )
          .sort(
            (left, right) =>
              Math.abs(left.token.start - firstToken.start) -
              Math.abs(right.token.start - firstToken.start),
          )[0];
        if (!next) {
          complete = false;
          break;
        }
        selected.push(next.token);
        kinds.push(next.kind);
      }
      if (!complete) continue;
      const start = Math.min(...selected.map((token) => token.start));
      const end = Math.max(...selected.map((token) => token.end));
      const kind = kinds.includes("fuzzy-token")
        ? "fuzzy-token"
        : kinds.includes("stem-match")
          ? "phrase-proximity"
          : "diacritic-variant";
      addObservation({
        form,
        kind,
        start,
        end,
        snippet: normalizedText
          .slice(Math.max(0, start - 180), end + 220)
          .trim(),
      });
    }
  }
  return observations;
}

function collectBroadEvidence(
  page: ExtractedPage,
  entry: WordForms,
): BroadPageEvidence | null {
  const observations = pageSearchTexts(page).flatMap((text) =>
    collectBroadObservations(text, entry),
  );
  if (!observations.length) return null;
  const uniqueObservations = observations.filter(
    (observation, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.form === observation.form &&
          candidate.start === observation.start &&
          candidate.end === observation.end &&
          candidate.kind === observation.kind,
      ) === index,
  );
  const matchedForms = uniqueValues(
    uniqueObservations.map((observation) => observation.form),
  );
  const matchKinds = uniqueValues(
    uniqueObservations.map((observation) => observation.kind),
  );
  return {
    matchedForms,
    matchKinds,
    evidence: uniqueObservations.map(
      (observation) =>
        `broad ${observation.kind} “${observation.form}” at character ${observation.start}-${observation.end}`,
    ),
    reasons: uniqueValues(
      uniqueObservations.map((observation) => observation.kind),
    ),
    snippets: uniqueValues(
      uniqueObservations.map((observation) => observation.snippet),
    ).slice(0, 3),
  };
}

function matchKindFor(
  form: string,
  entry: WordForms,
  discoveredSpellings: ReadonlySet<string>,
): CandidateMatchKind {
  if (discoveredSpellings.has(comparable(form))) return "spelling-tolerance";
  if (comparable(form) === comparable(entry.word)) return "exact-term";
  return "complete-inflection";
}

function contextSignals(
  text: string,
  observations: Array<{ start: number; end: number }>,
) {
  const sentenceCount = text
    .split(/[.!?]+/u)
    .filter((sentence) => sentence.trim()).length;
  const questionCount = (text.match(/\?/gu) ?? []).length;
  const listMarkerCount = (
    text.match(/(?:^|\s)(?:\d+[.)]|[•▪◦])(?=\s)/gu) ?? []
  ).length;
  const captionLike =
    text.length <= 260 &&
    /\b(?:obr(?:ázek|\.)?|tab(?:ulka|\.)?|graf|schéma|mapa|foto|ilustrace|figure|table|caption)\b/iu.test(
      text,
    );
  const listLike =
    (listMarkerCount >= 3 &&
      (text.length <= 420 || listMarkerCount * 80 >= text.length)) ||
    (text.length <= 220 && (text.match(/;/gu) ?? []).length >= 2);
  const crossReferenceOnly =
    text.length <= 220 &&
    /\b(?:viz|srov(?:nej|nání)?|stran[ayě]|str\.|see|compare|odkaz|kapitola)\b/iu.test(
      text,
    ) &&
    sentenceCount <= 2;
  const substantialProse =
    text.length >= 360 || (text.length >= 220 && sentenceCount >= 3);
  const explanatoryContext = observations.some(({ start, end }) =>
    definitionContext(text, start, end),
  );

  return {
    nearHeading: observations.some(({ start }) => start < 220),
    substantialProse,
    explanatoryContext,
    repeatedTreatment: observations.length >= 2,
    questionHeavy:
      (questionCount >= 3 && questionCount >= sentenceCount) ||
      (text.length <= 260 && questionCount >= 2),
    captionLike,
    listLike,
    crossReferenceOnly,
  };
}

function scoreCandidatePage(
  page: ExtractedPage,
  entry: WordForms,
  discoveredSpellings: ReadonlySet<string>,
): IndexCandidatePage | null {
  const text = normalizeSearchText(page.text);
  const observations = collectPhraseEvidence(text, entry);
  if (!observations.length) return null;

  const matchKinds = uniqueValues(
    observations.flatMap(({ form, variant }) => {
      const kinds: CandidateMatchKind[] = [
        matchKindFor(form, entry, discoveredSpellings),
      ];
      if (form !== variant) kinds.push("formatting-variant");
      return kinds;
    }),
  );
  const matchedForms = uniqueValues(observations.map(({ form }) => form));
  const signals = contextSignals(text, observations);
  const reasons: CandidateReason[] = [];
  const addReason = (reason: CandidateReason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  let score = matchKinds.includes("exact-term")
    ? 64
    : matchKinds.includes("complete-inflection")
      ? 61
      : matchKinds.includes("formatting-variant")
        ? 58
        : 43;

  if (matchKinds.includes("exact-term")) addReason("exact-term");
  if (matchKinds.includes("complete-inflection"))
    addReason("complete-inflection");
  if (matchKinds.includes("spelling-tolerance"))
    addReason("spelling-tolerance");
  if (observations.some(({ form, variant }) => form !== variant)) {
    addReason("formatting-variant");
    score -= 2;
  }
  if (signals.nearHeading) {
    score += 3;
    addReason("near-page-heading");
  }
  if (signals.substantialProse || signals.explanatoryContext) {
    score += 8;
    addReason("substantial-prose");
  }
  if (signals.repeatedTreatment) {
    score += 10;
    addReason("repeated-treatment");
  }
  if (signals.questionHeavy) {
    score -= 18;
    addReason("question-heavy");
  }
  if (signals.captionLike) {
    score -= 16;
    addReason("caption-like");
  }
  if (signals.listLike) {
    score -= 12;
    addReason("list-like");
  }
  if (signals.crossReferenceOnly) {
    score -= 20;
    addReason("cross-reference-only");
  }

  const strongLexicalMatch =
    matchKinds.includes("exact-term") ||
    matchKinds.includes("complete-inflection");
  const weakContext =
    signals.questionHeavy ||
    signals.captionLike ||
    signals.listLike ||
    signals.crossReferenceOnly;
  const meaningfulContext =
    signals.repeatedTreatment ||
    signals.substantialProse ||
    signals.explanatoryContext ||
    text.length >= 80;
  const decision: CandidateDecision =
    strongLexicalMatch && meaningfulContext && !weakContext && score >= 60
      ? "recommended"
      : "possible";
  if (decision === "possible") addReason("manual-review-required");

  const evidence = observations.map(({ form, start, end }) => {
    const kind = matchKindFor(form, entry, discoveredSpellings);
    return `matched form “${form}” (${kind}) at character ${start}-${end}`;
  });
  const snippets = observations
    .slice(0, 3)
    .map(({ start, end }) =>
      text
        .slice(Math.max(0, start - 180), Math.min(text.length, end + 220))
        .trim(),
    );

  return {
    pdfPage: page.pdfPage,
    snippets,
    score: Math.max(0, score),
    decision,
    matchedForms,
    matchKinds,
    evidence,
    reasons,
  };
}

function mergeCandidatePages(
  existing: IndexCandidatePage,
  addition: Partial<IndexCandidatePage> & {
    matchedForms?: string[];
    matchKinds?: CandidateMatchKind[];
    evidence?: string[];
    reasons?: CandidateReason[];
    snippets?: string[];
  },
): IndexCandidatePage {
  return {
    ...existing,
    decision: addition.decision ?? existing.decision,
    sourcePdfPage: existing.sourcePdfPage ?? addition.sourcePdfPage,
    matchedForms: uniqueValues([
      ...existing.matchedForms,
      ...(addition.matchedForms ?? []),
    ]),
    matchKinds: uniqueValues([
      ...existing.matchKinds,
      ...(addition.matchKinds ?? []),
    ]),
    evidence: uniqueValues([
      ...existing.evidence,
      ...(addition.evidence ?? []),
    ]),
    reasons: uniqueValues([...existing.reasons, ...(addition.reasons ?? [])]),
    snippets: uniqueValues([
      ...existing.snippets,
      ...(addition.snippets ?? []),
    ]).slice(0, 3),
  };
}

export function findIndexCandidates(
  pages: ExtractedPage[],
  entries: WordForms[],
): IndexCandidate[] {
  const searchablePages = pages;
  const vocabulary = buildVocabulary(searchablePages);

  return entries.map((entry) => {
    const submittedTokens = tokens(entry.word);
    const discoveredSpellings: string[] = [];
    const knownForms = new Set(
      [entry.word, ...entry.forms].map((form) => comparable(form)),
    );
    if (submittedTokens.length === 1 && submittedTokens[0].length >= 7) {
      const submitted = comparable(submittedTokens[0]);
      const maximumDistance = submitted.length >= 9 ? 2 : 1;
      for (const [candidate, original] of vocabulary) {
        if (
          candidate !== submitted &&
          !knownForms.has(candidate) &&
          candidate.slice(0, 3) === submitted.slice(0, 3) &&
          Math.abs(candidate.length - submitted.length) <= maximumDistance &&
          editDistance(submitted, candidate) <= maximumDistance
        ) {
          discoveredSpellings.push(original);
          if (discoveredSpellings.length === 8) break;
        }
      }
    }

    const searchEntry: WordForms = {
      word: entry.word,
      forms: [...entry.forms, ...discoveredSpellings],
    };
    const discoveredSpellingSet = new Set(
      discoveredSpellings.map((spelling) => comparable(spelling)),
    );
    const strictPages = searchablePages
      .map((page) =>
        scoreCandidatePage(page, searchEntry, discoveredSpellingSet),
      )
      .filter((page): page is IndexCandidatePage => page !== null);
    const candidateMap = new Map(
      strictPages.map((candidate) => [candidate.pdfPage, candidate]),
    );
    const broadPages = searchablePages.flatMap((page) => {
      const broad = collectBroadEvidence(page, searchEntry);
      if (!broad) return [];
      const existing = candidateMap.get(page.pdfPage);
      if (existing) {
        candidateMap.set(
          page.pdfPage,
          mergeCandidatePages(existing, {
            ...broad,
            reasons: [...broad.reasons, "manual-review-required"],
          }),
        );
        return [];
      }
      return [
        {
          pdfPage: page.pdfPage,
          snippets: broad.snippets,
          score: 38,
          decision: "possible" as const,
          matchedForms: broad.matchedForms,
          matchKinds: broad.matchKinds,
          evidence: broad.evidence,
          reasons: [
            ...broad.reasons,
            "manual-review-required",
          ] as CandidateReason[],
        },
      ];
    });
    for (const page of broadPages) candidateMap.set(page.pdfPage, page);

    const strictPageNumbers = new Set(
      strictPages.map((candidate) => candidate.pdfPage),
    );
    const shortTokens =
      tokens(entry.word).length > 1 ? contextualNameTokens(entry.word) : [];
    const contextualPages = shortTokens.length
      ? searchablePages.flatMap((page) => {
          if (
            strictPageNumbers.has(page.pdfPage) ||
            !shortTokens.some((token) =>
              hasStandaloneToken(normalizeSearchText(page.text), token),
            )
          )
            return [];
          const adjacentStrongPage = [page.pdfPage - 1, page.pdfPage + 1].some(
            (number) => strictPageNumbers.has(number),
          );
          if (!adjacentStrongPage) return [];
          return [
            {
              pdfPage: page.pdfPage,
              snippets: shortTokens.flatMap((token) => {
                const match = new RegExp(
                  `(?<![\\p{L}\\p{N}])${escapeRegExp(token)}(?![\\p{L}\\p{N}])`,
                  "iu",
                ).exec(normalizeSearchText(page.text));
                if (!match || match.index === undefined) return [];
                return [
                  normalizeSearchText(page.text).slice(
                    Math.max(0, match.index - 180),
                    match.index + match[0].length + 220,
                  ),
                ];
              }),
              score: 30,
              decision: "possible" as const,
              matchedForms: [shortTokens[0]],
              matchKinds: ["contextual-short-name"] as CandidateMatchKind[],
              evidence: [`contextual shortened name “${shortTokens[0]}”`],
              reasons: [
                "contextual-short-name",
                "manual-review-required",
              ] as CandidateReason[],
            },
          ];
        })
      : [];
    for (const page of contextualPages) {
      const existing = candidateMap.get(page.pdfPage);
      candidateMap.set(
        page.pdfPage,
        existing ? mergeCandidatePages(existing, page) : page,
      );
    }

    const searchablePageNumbers = new Set(
      searchablePages.map((page) => page.pdfPage),
    );
    const directPages = strictPages.filter(
      (page) =>
        page.decision === "recommended" &&
        (page.matchKinds.includes("exact-term") ||
          page.matchKinds.includes("complete-inflection") ||
          page.matchKinds.includes("formatting-variant")),
    );
    for (const sourcePage of directPages) {
      for (const neighbour of [
        sourcePage.pdfPage - 1,
        sourcePage.pdfPage + 1,
      ]) {
        if (
          neighbour < 1 ||
          !searchablePageNumbers.has(neighbour) ||
          candidateMap.has(neighbour)
        ) {
          if (candidateMap.has(neighbour) && neighbour !== sourcePage.pdfPage) {
            const existing = candidateMap.get(neighbour) as IndexCandidatePage;
            candidateMap.set(
              neighbour,
              mergeCandidatePages(existing, {
                sourcePdfPage: sourcePage.pdfPage,
                matchKinds: ["adjacent-page"],
                evidence: [`neighbour of PDF page ${sourcePage.pdfPage}`],
                reasons: ["adjacent-page", "manual-review-required"],
              }),
            );
          }
          continue;
        }
        candidateMap.set(neighbour, {
          pdfPage: neighbour,
          sourcePdfPage: sourcePage.pdfPage,
          snippets: [],
          score: 20,
          decision: "possible",
          matchedForms: [],
          matchKinds: ["adjacent-page"],
          evidence: [`neighbour of PDF page ${sourcePage.pdfPage}`],
          reasons: ["adjacent-page", "manual-review-required"],
        });
      }
    }

    const recommendedByScore = strictPages
      .filter((page) => page.decision === "recommended")
      .sort(
        (left, right) =>
          right.score - left.score || left.pdfPage - right.pdfPage,
      )
      .slice(0, 4);
    const recommendedSet = new Set(
      recommendedByScore.map((page) => page.pdfPage),
    );
    for (const page of strictPages) {
      if (page.decision !== "recommended" || recommendedSet.has(page.pdfPage))
        continue;
      const current = candidateMap.get(page.pdfPage) as IndexCandidatePage;
      candidateMap.set(
        page.pdfPage,
        mergeCandidatePages(current, {
          decision: "possible",
          reasons: ["manual-review-required"],
        }),
      );
    }

    const scoredPages = [...candidateMap.values()].sort(
      (left, right) => left.pdfPage - right.pdfPage,
    );
    return {
      word: entry.word,
      pages: scoredPages,
      recommendedPages: scoredPages
        .filter((page) => page.decision === "recommended")
        .map((page) => page.pdfPage),
      possiblePages: scoredPages.map((page) => page.pdfPage),
    };
  });
}

export function formatPageRanges(pages: number[]) {
  const sorted = [...new Set(pages)]
    .filter((page) => Number.isInteger(page) && page > 0)
    .sort((left, right) => left - right);
  const ranges: string[] = [];
  let start: number | null = null;
  let end: number | null = null;

  for (const page of sorted) {
    if (start === null) {
      start = page;
      end = page;
    } else if (page === (end as number) + 1) {
      end = page;
    } else {
      ranges.push(start === end ? String(start) : `${start}–${end}`);
      start = page;
      end = page;
    }
  }
  if (start !== null && end !== null)
    ranges.push(start === end ? String(start) : `${start}–${end}`);
  return ranges.join(", ");
}

export function formatIndex(
  matches: IndexMatches,
  pdfAnchor: number,
  printedAnchor: number,
) {
  return matches
    .map(({ word, pdfPages }) => {
      const printedPages = pdfPages.map(
        (page) => printedAnchor + page - pdfAnchor,
      );
      return `${word}\t${formatPageRanges(printedPages)}`;
    })
    .join("\n");
}
