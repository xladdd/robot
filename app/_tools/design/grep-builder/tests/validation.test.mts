import assert from "node:assert/strict";
import test from "node:test";

import { validateGrepCandidate } from "../validation.ts";

const kgCandidate = {
  findWhat: "(\\d+)\\s{0,}(?=kg)",
  replaceWith: "$1~S kg",
};

test("removes a literal duplicated after a terminal positive lookahead", () => {
  const result = validateGrepCandidate({
    findInstruction: "numbers immediately followed by kg",
    replaceInstruction:
      "the same number followed by a nonbreaking space and kg",
    candidate: kgCandidate,
  });

  assert.deepEqual(result, {
    candidate: {
      findWhat: "(\\d+)\\s{0,}(?=kg)",
      replaceWith: "$1~S",
    },
    corrections: ["preserved-lookahead-token"],
  });
});

test("leaves a correct lookahead replacement unchanged and is idempotent", () => {
  const input = {
    findInstruction: "numbers immediately followed by kg",
    replaceInstruction:
      "the same number followed by a nonbreaking space and kg",
    candidate: {
      findWhat: "(\\d+)\\s{0,}(?=kg)",
      replaceWith: "$1~S",
    },
  };
  const first = validateGrepCandidate(input);
  const second = validateGrepCandidate({
    ...input,
    candidate: first.candidate,
  });

  assert.deepEqual(first, {
    candidate: input.candidate,
    corrections: [],
  });
  assert.deepEqual(second, first);
});

test("does not rewrite a token consumed by Find What", () => {
  const candidate = {
    findWhat: "(\\d+)\\s*kg",
    replaceWith: "$1~S kg",
  };

  assert.deepEqual(
    validateGrepCandidate({
      findInstruction: "numbers followed by kg",
      replaceInstruction: "the same number with a nonbreaking space and kg",
      candidate,
    }),
    { candidate, corrections: [] },
  );
});

test("leaves the existing multi-unit lookahead unchanged", () => {
  const candidate = {
    findWhat: "(?<=\\d) (?=(?:kg|km|cm|%))",
    replaceWith: "~S",
  };

  assert.deepEqual(
    validateGrepCandidate({
      findInstruction: "a normal space between a number and kg, km, cm or %",
      replaceInstruction: "a nonbreaking space",
      candidate,
    }),
    { candidate, corrections: [] },
  );
});

test("normalizes a wrong English four-period ellipsis expression", () => {
  const result = validateGrepCandidate({
    findInstruction: "a literal period followed by three dots",
    replaceInstruction: "an ellipsis character",
    candidate: { findWhat: "\\.\\.{2}", replaceWith: "…" },
  });

  assert.deepEqual(result, {
    candidate: { findWhat: "\\.{4}", replaceWith: "…" },
    corrections: ["four-period-ellipsis"],
  });
});

test("normalizes the Czech four-period ellipsis intent", () => {
  const result = validateGrepCandidate({
    findInstruction: "doslovná tečka následovaná třemi tečkami",
    replaceInstruction: "znak elipsy",
    candidate: { findWhat: "\\.{3}", replaceWith: "…" },
  });

  assert.deepEqual(result, {
    candidate: { findWhat: "\\.{4}", replaceWith: "…" },
    corrections: ["four-period-ellipsis"],
  });
});

test("does not rewrite a different dot request or a correct ellipsis expression", () => {
  const threeDots = {
    findWhat: "\\.{3}",
    replaceWith: "…",
  };
  const fourDots = {
    findWhat: "\\.{4}",
    replaceWith: "…",
  };

  assert.deepEqual(
    validateGrepCandidate({
      findInstruction: "three dots",
      replaceInstruction: "an ellipsis character",
      candidate: threeDots,
    }),
    { candidate: threeDots, corrections: [] },
  );
  assert.deepEqual(
    validateGrepCandidate({
      findInstruction: "a literal period followed by three dots",
      replaceInstruction: "an ellipsis character",
      candidate: fourDots,
    }),
    { candidate: fourDots, corrections: [] },
  );
});

test("does not correct a limitation response", () => {
  assert.deepEqual(
    validateGrepCandidate({
      findInstruction: "a literal period followed by three dots",
      replaceInstruction: "an ellipsis character",
      candidate: { findWhat: "\\.\\.{2}", replaceWith: "…" },
      warning: "Use multiple passes.",
    }),
    {
      candidate: { findWhat: "\\.\\.{2}", replaceWith: "…" },
      corrections: [],
    },
  );
});
