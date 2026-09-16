import assert from "node:assert/strict";
import test from "node:test";

import { resolveDeterministicGrepIntent } from "../intent.ts";

function resolve(find: string, replace: string) {
  const result = resolveDeterministicGrepIntent(find, replace);
  assert.equal(result.matched, true);
  return result;
}

test("recognizes English spaces before punctuation", () => {
  assert.deepEqual(
    resolve(
      "spaces immediately before commas, periods, semicolons, colons, exclamation marks or question marks",
      "nothing, leaving the punctuation in place",
    ),
    {
      matched: true,
      ruleId: "spaces-before-punctuation",
      findWhat: " +(?=[,.;:!?])",
      replaceWith: "",
    },
  );
});

test("recognizes Czech spaces before punctuation", () => {
  const result = resolve(
    "mezery bezprostředně před čárkami, tečkami, středníky, dvojtečkami, vykřičníky nebo otazníky",
    "nic, interpunkce zůstane na místě",
  );
  assert.equal(result.ruleId, "spaces-before-punctuation");
  assert.equal(result.findWhat, " +(?=[,.;:!?])");
});

test("uses one capture layout for both phone separators", () => {
  assert.deepEqual(
    resolve(
      "phone numbers in the form 123-456-789 or 123.456.789",
      "the same number with spaces between the three groups",
    ),
    {
      matched: true,
      ruleId: "phone-number-spacing",
      findWhat: "(\\d{3})[-.](\\d{3})[-.](\\d{3})",
      replaceWith: "$1 $2 $3",
    },
  );

  assert.equal(
    resolve(
      "telefonní čísla ve tvaru 123-456-789 nebo 123.456.789",
      "stejné číslo s mezerami mezi třemi skupinami",
    ).ruleId,
    "phone-number-spacing",
  );
});

test("generates page references without a trailing replacement space", () => {
  assert.deepEqual(
    resolve(
      "page references written as p. followed by a number, with or without a space",
      "page followed by a space and the same number",
    ),
    {
      matched: true,
      ruleId: "page-reference",
      findWhat: "\\bp\\.\\s*(\\d+)\\b",
      replaceWith: "page $1",
    },
  );

  assert.equal(
    resolve(
      "odkazy na stránky zapsané jako p. následované číslem, s mezerou nebo bez mezery",
      "page následované mezerou a stejným číslem",
    ).ruleId,
    "page-reference",
  );
});

test("escapes explicitly requested literal text in both languages", () => {
  assert.deepEqual(
    resolve("the literal text (draft), including the parentheses", "[DRAFT]"),
    {
      matched: true,
      ruleId: "literal-text",
      findWhat: "\\(draft\\)",
      replaceWith: "[DRAFT]",
    },
  );

  assert.deepEqual(
    resolve("doslovný text (draft), včetně závorek", "[DRAFT]"),
    {
      matched: true,
      ruleId: "literal-text",
      findWhat: "\\(draft\\)",
      replaceWith: "[DRAFT]",
    },
  );
});

test("normalizes parenthesized uppercase codes in both languages", () => {
  assert.deepEqual(
    resolve(
      "parentheses around a code containing between 2 and 5 uppercase letters",
      "the code without the parentheses",
    ),
    {
      matched: true,
      ruleId: "parenthesized-uppercase-code",
      findWhat: "\\(([A-Z]{2,5})\\)",
      replaceWith: "$1",
    },
  );

  assert.equal(
    resolve(
      "závorky kolem kódu obsahujícího 2 až 5 velkých písmen",
      "kód bez závorek",
    ).ruleId,
    "parenthesized-uppercase-code",
  );
});

test("anchors an explicitly named word at paragraph start", () => {
  assert.deepEqual(
    resolve(
      "the word Chapter only when it is at the start of a paragraph",
      "CHAPTER",
    ),
    {
      matched: true,
      ruleId: "paragraph-start-literal",
      findWhat: "^Chapter",
      replaceWith: "CHAPTER",
    },
  );

  assert.equal(
    resolve("slovo Chapter pouze na začátku odstavce", "CHAPTER").findWhat,
    "^Chapter",
  );
});

test("removes only explicit square delimiters", () => {
  assert.deepEqual(
    resolve("text between [ and ]", "the same text without the brackets"),
    {
      matched: true,
      ruleId: "between-delimiters",
      findWhat: "\\[([^\\]]+)\\]",
      replaceWith: "$1",
    },
  );

  assert.equal(
    resolve("text mezi [ a ]", "stejný text bez hranatých závorek").ruleId,
    "between-delimiters",
  );
});

test("returns deterministic four-pass guidance for conditional date padding", () => {
  const english = resolve(
    "dates written as D/M/YYYY or DD/MM/YYYY",
    "YYYY-MM-DD, adding leading zeroes when the day or month has only one digit",
  );
  assert.equal(english.ruleId, "conditional-date-padding");
  assert.equal(english.findWhat, "");
  assert.equal(english.replaceWith, "");
  assert.ok(english.warning?.includes("\\b(\\d)/(\\d)/(\\d{4})\\b"));
  assert.ok((english.warning ?? "").includes("four separate Find/Change"));

  const czech = resolve(
    "data zapsaná jako D/M/RRRR nebo DD/MM/RRRR",
    "RRRR-MM-DD s doplněním úvodních nul, když má den nebo měsíc jen jednu číslici",
  );
  assert.equal(czech.ruleId, "conditional-date-padding");
  assert.match(czech.warning ?? "", /čtyři samostatné operace/);
  assert.equal(czech.warning?.includes("\\x08"), false);

  assert.deepEqual(
    resolveDeterministicGrepIntent(
      "dates written as DD/MM/YYYY",
      "the same date written as YYYY-MM-DD",
    ),
    { matched: false },
  );
});

test("returns a bilingual Find Format warning for formatting requests", () => {
  const english = resolve("all bold text", "XXX");
  assert.equal(english.ruleId, "formatting-only");
  assert.equal(english.findWhat, "");
  assert.equal(english.replaceWith, "");
  assert.match(english.warning ?? "", /Find Format/);

  const czech = resolve("veškerý tučný text", "XXX");
  assert.equal(czech.ruleId, "formatting-only");
  assert.match(czech.warning ?? "", /Najít formát/);
});

test("fails closed for ambiguous or unsupported requests", () => {
  assert.deepEqual(
    resolveDeterministicGrepIntent("spaces after punctuation", "nothing"),
    { matched: false },
  );
  assert.deepEqual(
    resolveDeterministicGrepIntent(
      "phone numbers of varying length",
      "format them nicely",
    ),
    { matched: false },
  );
  assert.deepEqual(
    resolveDeterministicGrepIntent(
      "the word Chapter anywhere in a paragraph",
      "CHAPTER",
    ),
    { matched: false },
  );
  assert.deepEqual(
    resolveDeterministicGrepIntent("translate the literal text", "nothing"),
    { matched: false },
  );
});
