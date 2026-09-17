import { readFile } from "node:fs/promises";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  detectPrintedPageAnchor,
  extractPdfPages,
  findIndexCandidates,
  type WordForms,
} from "../code/pdf-indexer.ts";

export type IndexEvaluationCase = {
  term: string;
  expectedPrintedPages: number[];
};

export type IndexEvaluationRow = {
  term: string;
  expectedPrintedPages: number[];
  recommendedPrintedPages: number[];
  candidatePrintedPages: number[];
  recommendedTruePositives: number[];
  recommendedFalsePositives: number[];
  missedByRecommendations: number[];
  missedByCandidates: number[];
};

export type IndexEvaluationResult = {
  pdfPages: number;
  pdfAnchor: number;
  printedAnchor: number;
  rows: IndexEvaluationRow[];
};

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function toPrintedPages(
  pdfPages: number[],
  pdfAnchor: number,
  printedAnchor: number,
) {
  return uniqueSorted(
    pdfPages
      .map((page) => printedAnchor + page - pdfAnchor)
      .filter((page) => page > 0),
  );
}

function difference(left: number[], right: number[]) {
  const values = new Set(right);
  return left.filter((value) => !values.has(value));
}

export function indexEvaluationMetrics(rows: IndexEvaluationRow[]) {
  const expected = rows.flatMap((row) => row.expectedPrintedPages).length;
  const recommended = rows.flatMap((row) => row.recommendedPrintedPages).length;
  const candidate = rows.flatMap((row) => row.candidatePrintedPages).length;
  const recommendedTruePositives = rows.flatMap(
    (row) => row.recommendedTruePositives,
  ).length;
  const candidateTruePositives = rows.reduce(
    (total, row) =>
      total +
      row.expectedPrintedPages.filter((page) =>
        row.candidatePrintedPages.includes(page),
      ).length,
    0,
  );
  const terms = rows.length;
  const termsWithAnyExpectedCandidate = rows.filter((row) =>
    row.expectedPrintedPages.some((page) =>
      row.candidatePrintedPages.includes(page),
    ),
  ).length;
  const termsCompletelyMissed = terms - termsWithAnyExpectedCandidate;
  return {
    terms,
    termsWithAnyExpectedCandidate,
    termsCompletelyMissed,
    termHitRate: terms ? termsWithAnyExpectedCandidate / terms : 0,
    expected,
    recommended,
    candidate,
    recommendedTruePositives,
    candidateTruePositives,
    recommendedPrecision: recommended
      ? recommendedTruePositives / recommended
      : 0,
    recommendedRecall: expected ? recommendedTruePositives / expected : 0,
    candidateRecall: expected ? candidateTruePositives / expected : 0,
  };
}

/**
 * Runs the same local PDF extraction and candidate ranking used by Index Creator.
 * The supplied `getForms` callback must call the normal authenticated forms route;
 * the evaluator itself never sends PDF text or snippets over the network.
 */
export async function evaluateIndexBook({
  pdfPath,
  cases,
  getForms,
}: {
  pdfPath: string;
  cases: IndexEvaluationCase[];
  getForms: (terms: string[]) => Promise<WordForms[]>;
}): Promise<IndexEvaluationResult> {
  GlobalWorkerOptions.workerSrc = new URL(
    "../../../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).href;
  const file = new File(
    [await readFile(pdfPath)],
    pdfPath.split("/").at(-1) || "source.pdf",
    { type: "application/pdf" },
  );
  const pages = await extractPdfPages(file);
  const anchor = detectPrintedPageAnchor(pages);
  const entries = await getForms(cases.map(({ term }) => term));
  const candidates = findIndexCandidates(pages, entries);

  return {
    pdfPages: pages.length,
    pdfAnchor: anchor.pdfPage,
    printedAnchor: anchor.printedPage,
    rows: cases.map((item) => {
      const candidate = candidates.find(({ word }) => word === item.term);
      const expectedPrintedPages = uniqueSorted(item.expectedPrintedPages);
      const recommendedPrintedPages = toPrintedPages(
        candidate?.recommendedPages ?? [],
        anchor.pdfPage,
        anchor.printedPage,
      );
      const candidatePrintedPages = toPrintedPages(
        candidate?.possiblePages ?? [],
        anchor.pdfPage,
        anchor.printedPage,
      );
      return {
        term: item.term,
        expectedPrintedPages,
        recommendedPrintedPages,
        candidatePrintedPages,
        recommendedTruePositives: recommendedPrintedPages.filter((page) =>
          expectedPrintedPages.includes(page),
        ),
        recommendedFalsePositives: difference(
          recommendedPrintedPages,
          expectedPrintedPages,
        ),
        missedByRecommendations: difference(
          expectedPrintedPages,
          recommendedPrintedPages,
        ),
        missedByCandidates: difference(
          expectedPrintedPages,
          candidatePrintedPages,
        ),
      };
    }),
  };
}
