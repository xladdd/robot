import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  normalizeStylePlan,
  STYLE_ID_PATTERN,
  stylePlanResponseSchema,
} from "../code/plan.ts";
import {
  MAX_STYLE_REFERENCES,
  MAX_SEED,
  validateSeed,
  validateStyleReferences,
  validateStyleSubmission,
} from "../code/validation.ts";
import {
  buildStyleTaskPayload,
  formatStyleTaskNotes,
  styleTaskTitle,
} from "../code/style-request.ts";

test("planner describes evidence before synthesizing an arbitrary FLUX style", () => {
  assert.equal(Object.keys(stylePlanResponseSchema.properties)[0], "analysis");
  const analyze = readFileSync(
    new URL("../prompts/analyze-style.md", import.meta.url),
    "utf8",
  );
  const refine = readFileSync(
    new URL("../prompts/refine-style.md", import.meta.url),
    "utf8",
  );
  assert.match(analyze, /any supplied image style/);
  assert.match(
    analyze,
    /one explicit (?:shared )?medium\/technique at the start/,
  );
  assert.match(analyze, /do not add volume to genuinely flat artwork/);
  assert.match(analyze, /acknowledge actual differences/);
  assert.match(analyze, /source capture\/production/);
  assert.match(analyze, /Do not invent a habitat/);
  assert.match(analyze, /Separate style from content/);
  assert.match(refine, /Reinspect the original references/);
  assert.match(refine, /correcting deviations/);
  assert.match(refine, /Seeds are selected separately/);
});

const validDataUrl = "data:image/jpeg;base64,aGVsbG8=";
const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  projectGid: "project-gid",
  sectionGid: "section-gid",
  assigneeGid: "assignee-gid",
};

test("accepts a complete style plan and rejects incomplete plans", () => {
  const plan = normalizeStylePlan({
    style_id: "warm-risograph",
    style_name: "Warm Risograph",
    style_prompt:
      "Modern full-bleed risograph image-making with layered spot colours.",
    analysis: "The references share layered spot colours and ink grain.",
  });
  assert.equal(plan?.id, "warm-risograph");
  assert.equal(plan?.name, "Warm Risograph");

  assert.equal(normalizeStylePlan(null), null);
  assert.equal(normalizeStylePlan({}), null);
  assert.equal(
    normalizeStylePlan({
      style_id: "Warm Risograph",
      style_name: "Warm Risograph",
      style_prompt: "text",
      analysis: "text",
    }),
    null,
  );
  assert.equal(
    normalizeStylePlan({
      style_id: "ok",
      style_name: "A style",
      style_prompt: "text",
      analysis: "text",
    }),
    null,
  );
  assert.equal(
    normalizeStylePlan({
      style_id: "warm-risograph",
      style_name: "A style",
      style_prompt: "   ",
      analysis: "text",
    }),
    null,
  );
});

test("requires kebab-case style ids within the length bound", () => {
  assert.ok(STYLE_ID_PATTERN.test("coloured-wood-engraving"));
  assert.ok(STYLE_ID_PATTERN.test("style-2"));
  assert.ok(!STYLE_ID_PATTERN.test("Style"));
  assert.ok(!STYLE_ID_PATTERN.test("a"));
  assert.ok(!STYLE_ID_PATTERN.test("-leading"));
  assert.ok(!STYLE_ID_PATTERN.test("x".repeat(61)));
});

test("validates reference images and caps the count", () => {
  const references = Array.from(
    { length: MAX_STYLE_REFERENCES },
    () => validDataUrl,
  );
  assert.equal(
    validateStyleReferences(references).length,
    MAX_STYLE_REFERENCES,
  );

  assert.throws(() => validateStyleReferences([]), /At least one/);
  assert.throws(
    () => validateStyleReferences([...references, validDataUrl]),
    /At most 6/,
  );
  assert.throws(
    () => validateStyleReferences(["data:text/html;base64,aGVsbG8="]),
    /did not pass validation/,
  );
  assert.throws(
    () =>
      validateStyleReferences([
        `data:image/png;base64,${"a".repeat(8_000_000)}`,
      ]),
    /did not pass validation/,
  );
});

test("bounds generation seeds like the Image Generator", () => {
  assert.equal(validateSeed(0), 0);
  assert.equal(validateSeed(MAX_SEED), MAX_SEED);
  assert.throws(() => validateSeed(-1), /seed/i);
  assert.throws(() => validateSeed(MAX_SEED + 1), /seed/i);
  assert.throws(() => validateSeed(1.5), /seed/i);
  assert.throws(() => validateSeed("12"), /seed/i);
});

test("re-validates the final review before an Asana task is created", () => {
  const request = validateStyleSubmission({
    styleId: "warm-risograph",
    styleName: "Warm Risograph",
    stylePrompt: "Layered spot colours, visible ink grain.",
    seed: 8701,
    testPrompt: "A red fox in a forest clearing",
    roundCount: 3,
    notes: " Please add to both generator modes. ",
  });
  assert.equal(request.notes, "Please add to both generator modes.");
  assert.equal(request.seed, 8701);

  assert.throws(
    () =>
      validateStyleSubmission({
        styleId: "Not Kebab",
        styleName: "Warm Risograph",
        stylePrompt: "text",
        seed: 1,
        testPrompt: "text",
        roundCount: 1,
      }),
    /styleId/,
  );
  assert.throws(
    () => validateStyleSubmission({ styleId: "warm-risograph" }),
    /styleName is required/,
  );
  assert.throws(
    () =>
      validateStyleSubmission({
        styleId: "warm-risograph",
        styleName: "Warm Risograph",
        stylePrompt: "text",
        seed: 1,
        testPrompt: "text",
        roundCount: 0,
      }),
    /roundCount/,
  );
});

test("builds a style task for the configured section with a paste-ready preset", () => {
  const request = validateStyleSubmission({
    styleId: "warm-risograph",
    styleName: "Warm Risograph",
    stylePrompt: 'Layered spot colours, visible ink "grain".',
    seed: 8701,
    testPrompt: "A red fox in a forest clearing",
    roundCount: 2,
    notes: "",
  });
  const receivedAt = "2026-10-12T10:00:00.000Z";
  const payload = buildStyleTaskPayload(
    request,
    "Vlad Frolov",
    config,
    receivedAt,
  );

  assert.match(styleTaskTitle(request), /^\[Robot\] Style request — Warm/);
  assert.equal(payload.data.assignee, "assignee-gid");
  assert.deepEqual(payload.data.projects, ["project-gid"]);
  assert.deepEqual(payload.data.memberships, [
    { project: "project-gid", section: "section-gid" },
  ]);

  const notes = formatStyleTaskNotes(request, "Vlad Frolov", receivedAt);
  assert.match(notes, /Requested by: Vlad Frolov \(Robot user\)/);
  assert.match(notes, /Pinned seed: 8701/);
  assert.match(notes, /style-presets\.ts/);
  assert.match(notes, /seed: 8701,/);
  // The embedded preset must stay a valid string literal even with quotes.
  assert.match(
    notes,
    /prompt: "Layered spot colours, visible ink \\"grain\\".",/,
  );
  assert.doesNotMatch(notes, /client-secret|refresh-token/);
  assert.doesNotMatch(notes, /data:image/);
});
