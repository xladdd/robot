import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeFormEntries } from "../code/form-validation.ts";
import {
  indexEvaluationMetrics,
  type IndexEvaluationRow,
} from "../scripts/evaluate-index.mts";
import { findLikelyOcrPages } from "../code/local-ocr.ts";
import {
  detectPrintedPageAnchor,
  findIndexCandidates,
  findIndexMatches,
  formatPageRanges,
  normalizeIndexText,
  type ExtractedPage,
} from "../code/pdf-indexer.ts";

function page(pdfPage: number, text: string): ExtractedPage {
  return { pdfPage, text, printedCandidates: [] };
}

test("selects only sparse pages for the local OCR fallback", () => {
  assert.deepEqual(
    findLikelyOcrPages([
      page(1, ""),
      page(2, "A short image-only page."),
      page(3, "A".repeat(180)),
    ]),
    [1, 2],
  );
});

test("normalizes NFC, soft hyphens, line-break hyphenation, and whitespace", () => {
  assert.equal(
    normalizeIndexText("Cafe\u0301\u00ad Veliký-\n  byl\u00a0král"),
    "Café Velikýbyl král",
  );
  assert.equal(normalizeIndexText("Karel\nVeliký"), "Karel Veliký");
});

test("rejects unsafe reductions while retaining complete inflections", () => {
  const entries = sanitizeFormEntries(
    ["Karel IV.", "Knut Veliký", "Blanka z Valois"],
    [
      {
        word: "Karel IV.",
        forms: ["Karel", "Karla", "Karla IV.", "Karel IV"],
      },
      {
        word: "Knut Veliký",
        forms: ["Veliký", "Velikého", "Knuta Velikého"],
      },
      {
        word: "Blanka z Valois",
        forms: ["Valois", "Blanky", "Blanky z Valois"],
      },
    ],
  );

  assert.deepEqual(entries[0].forms, ["Karel IV.", "Karla IV.", "Karel IV"]);
  assert.deepEqual(entries[1].forms, ["Knut Veliký", "Knuta Velikého"]);
  assert.deepEqual(entries[2].forms, ["Blanka z Valois", "Blanky z Valois"]);
});

test("matches complete phrases but never independent phrase components", () => {
  const pages = [
    page(1, "Karel Veliký byl významný panovník."),
    page(2, "Karel\nVeliký založil město."),
    page(3, "Karel byl zmíněn bez přívlastku."),
    page(4, "Veliký byl jen přídomek v jiné větě."),
  ];
  const entries = [
    {
      word: "Karel Veliký",
      forms: ["Karel Veliký", "Karel", "Veliký"],
    },
  ];

  assert.deepEqual(findIndexMatches(pages, entries), [
    { word: "Karel Veliký", pdfPages: [1, 2] },
  ]);
  assert.deepEqual(
    findIndexCandidates(pages, entries)[0].pages.map(
      (candidate) => candidate.pdfPage,
    ),
    [1, 2, 3],
  );
  assert.equal(
    findIndexCandidates(pages, entries)[0].pages[2].decision,
    "possible",
  );
  assert.deepEqual(
    findIndexCandidates(pages, entries)[0].recommendedPages,
    [1],
  );
});

test("keeps Roman numeral identity inside a phrase", () => {
  const pages = [
    page(1, "Ludvík XIV. byl francouzský král."),
    page(2, "Ludvík 14. byl v textu chybně přepsán."),
    page(3, "Ludvík byl uveden bez pořadového čísla."),
  ];
  const entries = [
    { word: "Ludvík XIV.", forms: ["Ludvíka XIV.", "Ludvík 14.", "Ludvík"] },
  ];

  assert.deepEqual(findIndexMatches(pages, entries)[0].pdfPages, [1]);
});

test("keeps shortened adjacent mentions as possible evidence only", () => {
  const pages = [
    page(1, "Boleslav popsal události v této části kapitoly."),
    page(2, "Boleslav I. byl český kníže a významný panovník."),
  ];
  const candidate = findIndexCandidates(pages, [
    { word: "Boleslav I.", forms: ["Boleslava I."] },
  ])[0];

  assert.deepEqual(candidate.recommendedPages, [2]);
  assert.deepEqual(candidate.possiblePages, [1, 2]);
  assert.equal(candidate.pages[0].decision, "possible");
  assert.ok(candidate.pages[0].evidence[0].includes("contextual shortened"));
});

test("formats accepted pages as deterministic ranges", () => {
  assert.equal(formatPageRanges([]), "");
  assert.equal(formatPageRanges([17]), "17");
  assert.equal(formatPageRanges([17, 16, 17, 19]), "16–17, 19");
  assert.equal(formatPageRanges([74, 75, 76, 77]), "74–77");
});

test("scores local evidence deterministically", () => {
  const pages = [
    page(
      1,
      "Karel Veliký je označení významného panovníka. Karel Veliký vládl dlouho.",
    ),
    page(2, "Později text připomíná Karel Veliký jen v jedné větě."),
  ];
  const entries = [{ word: "Karel Veliký", forms: ["Karel Veliký"] }];
  const first = findIndexCandidates(pages, entries)[0];
  const second = findIndexCandidates(pages, entries)[0];

  assert.deepEqual(first, second);
  assert.deepEqual(first.recommendedPages, [1]);
  assert.deepEqual(first.possiblePages, [1, 2]);
  assert.equal(first.pages[0].decision, "recommended");
  assert.equal(first.pages[1].decision, "possible");
  assert.ok(first.pages[0].score > first.pages[1].score);
  assert.ok(first.pages[0].reasons.includes("substantial-prose"));
  assert.ok(first.pages[0].reasons.includes("repeated-treatment"));
  assert.ok(first.pages[0].evidence[0].includes("matched form"));
  assert.deepEqual(first.pages[0].matchedForms, ["Karel Veliký"]);
  assert.ok(first.pages[0].matchKinds.includes("exact-term"));
});

test("rejects similar scientific words while retaining complete inflections", () => {
  const entries = sanitizeFormEntries(
    ["protein"],
    [{ word: "protein", forms: ["proteinu", "proteiny", "proteáza"] }],
  );
  assert.deepEqual(entries[0].forms, ["protein", "proteinu", "proteiny"]);

  const candidate = findIndexCandidates(
    [
      page(1, "Struktura proteinu je důležitá. Proteiny mají různé funkce."),
      page(2, "Proteáza štěpí jiné látky."),
    ],
    entries,
  )[0];
  assert.deepEqual(
    candidate.pages.map((item) => item.pdfPage),
    [1, 2],
  );
  assert.deepEqual(candidate.recommendedPages, [1]);
  assert.ok(candidate.pages[0].matchKinds.includes("complete-inflection"));
  assert.ok(candidate.pages[1].matchKinds.includes("adjacent-page"));
  assert.deepEqual(candidate.pages[1].matchedForms, []);
});

test("adds high-recall stem, proximity, and diacritic candidates", () => {
  const stem = findIndexCandidates(
    [page(1, "Aerenchymu najdeme v pletivu.")],
    [{ word: "aerenchym", forms: [] }],
  )[0];
  assert.deepEqual(stem.possiblePages, [1]);
  assert.ok(stem.pages[0].matchKinds.includes("stem-match"));

  const phrase = findIndexCandidates(
    [page(1, "Ameriga Vespucciho objevy změnily mapy.")],
    [{ word: "Amerigo Vespucci", forms: [] }],
  )[0];
  assert.deepEqual(phrase.possiblePages, [1]);
  assert.ok(phrase.pages[0].matchKinds.includes("phrase-proximity"));

  const hyphen = findIndexCandidates(
    [page(1, "al Idrisi byl arabský geograf.")],
    [{ word: "al-Idrísí", forms: [] }],
  )[0];
  assert.deepEqual(hyphen.possiblePages, [1]);
  assert.ok(
    hyphen.pages[0].matchKinds.includes("phrase-proximity") ||
      hyphen.pages[0].matchKinds.includes("diacritic-variant"),
  );

  const componentOnly = findIndexCandidates(
    [page(1, "Amerigo byl cestovatel.")],
    [{ word: "Amerigo Vespucci", forms: [] }],
  )[0];
  assert.deepEqual(componentOnly.possiblePages, []);
});

test("keeps short Czech name inflections as possible matches", () => {
  const candidate = findIndexCandidates(
    [
      page(1, "V Kosmově Kronice české se pověsti zapisují latinsky."),
      page(2, "Kosmas je uveden jako heslo v rejstříku."),
    ],
    [{ word: "Kosmas", forms: [] }],
  )[0];

  assert.deepEqual(candidate.possiblePages, [1, 2]);
  assert.equal(candidate.pages[0].decision, "possible");
  assert.ok(candidate.pages[0].matchKinds.includes("stem-match"));
});

test("adds adjacent pages only around strong matches", () => {
  const candidate = findIndexCandidates(
    [
      page(1, "Předchozí strana."),
      page(2, "A protein je důležitý pojem. Protein se zde opakuje."),
      page(3, "Následující strana."),
    ],
    [{ word: "protein", forms: [] }],
  )[0];
  assert.deepEqual(candidate.recommendedPages, [2]);
  assert.deepEqual(candidate.possiblePages, [1, 2, 3]);
  assert.ok(candidate.pages[0].matchKinds.includes("adjacent-page"));
  assert.ok(candidate.pages[2].matchKinds.includes("adjacent-page"));
  assert.equal(candidate.pages[0].sourcePdfPage, 2);
});

test("keeps weak page contexts available without recommending them", () => {
  const candidate = findIndexCandidates(
    [
      page(1, "Co je protein? Protein?"),
      page(2, "Obr. 4: protein"),
      page(3, "1. protein 2. protein 3. protein"),
      page(4, "Viz protein, strana 12."),
    ],
    [{ word: "protein", forms: [] }],
  )[0];

  assert.deepEqual(candidate.recommendedPages, []);
  assert.deepEqual(candidate.possiblePages, [1, 2, 3, 4]);
  assert.ok(candidate.pages.every((item) => item.decision === "possible"));
  assert.ok(candidate.pages[0].reasons.includes("question-heavy"));
  assert.ok(candidate.pages[1].reasons.includes("caption-like"));
  assert.ok(candidate.pages[2].reasons.includes("list-like"));
  assert.ok(candidate.pages[3].reasons.includes("cross-reference-only"));
});

test("limits automatic recommendations while retaining ranked evidence", () => {
  const pages = Array.from({ length: 8 }, (_, index) =>
    page(
      index + 1,
      `Protein je pojem v této vysvětlující větě. Protein se zde opakuje ${index}.`,
    ),
  );
  const candidate = findIndexCandidates(pages, [
    { word: "protein", forms: [] },
  ])[0];

  assert.equal(candidate.recommendedPages.length, 4);
  assert.equal(
    candidate.pages.filter((item) => item.decision === "possible").length,
    4,
  );
  assert.deepEqual(
    candidate.pages.map((item) => item.pdfPage),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test("does not discard direct candidates after the old display limit", () => {
  const pages = Array.from({ length: 60 }, (_, index) =>
    page(
      index + 1,
      `Protein appears in this explanatory sentence on page ${index + 1}. Protein appears again in the explanation.`,
    ),
  );
  const candidate = findIndexCandidates(pages, [
    { word: "protein", forms: [] },
  ])[0];
  assert.equal(candidate.possiblePages.length, 60);
  assert.equal(candidate.recommendedPages.length, 4);
});

test("calculates recommendation and candidate precision separately", () => {
  const row: IndexEvaluationRow = {
    term: "protein",
    expectedPrintedPages: [1, 2],
    recommendedPrintedPages: [1, 3],
    candidatePrintedPages: [1, 2, 3],
    recommendedTruePositives: [1],
    recommendedFalsePositives: [3],
    missedByRecommendations: [2],
    missedByCandidates: [],
  };
  assert.deepEqual(indexEvaluationMetrics([row]), {
    terms: 1,
    termsWithAnyExpectedCandidate: 1,
    termsCompletelyMissed: 0,
    termHitRate: 1,
    expected: 2,
    recommended: 2,
    candidate: 3,
    recommendedTruePositives: 1,
    candidateTruePositives: 2,
    recommendedPrecision: 0.5,
    recommendedRecall: 0.5,
    candidateRecall: 1,
  });
});

test("detects printed-page anchors from consecutive sequences", () => {
  const anchor = detectPrintedPageAnchor([
    { pdfPage: 1, text: "", printedCandidates: [1, 99] },
    { pdfPage: 2, text: "", printedCandidates: [2, 100] },
    { pdfPage: 3, text: "", printedCandidates: [3, 101] },
    { pdfPage: 4, text: "", printedCandidates: [4, 102] },
  ]);
  assert.deepEqual(anchor, {
    count: 4,
    consecutiveRun: 4,
    pdfPage: 1,
    printedPage: 1,
  });
});
