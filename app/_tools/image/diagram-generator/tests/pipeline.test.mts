import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBrief } from "../code/contracts.ts";
import { buildCanonicalSvg } from "../code/svg-labels.ts";
import {
  normalizeReconstruction,
  sanitizeSvg,
  validateManifestLayering,
} from "../code/svg-sanitize.ts";
import { runEditabilityChecks } from "../code/editability-checks.ts";
import { verifyUnderlayCoverage } from "../code/underlay-check.ts";

const brief = normalizeBrief({
  version: 1,
  subject: "animal cell",
  diagramType: "anatomy",
  title: "Animal cell",
  subtitle: "Complete cytoplasm with a nucleus",
  language: "en",
  audience: "school textbook",
  view: "flat cutaway",
  structures: [
    {
      id: "cytoplasm",
      name: "Cytoplasm",
      role: "complete underlying cell field",
      required: true,
    },
    {
      id: "nucleus",
      name: "Nucleus",
      role: "genetic material",
      required: true,
    },
  ],
  relationships: [],
  composition: { aspectRatio: "4:3", panelCount: 1, notes: "" },
  selectedReferenceId: "animal-cell-overview",
  referenceRationale: "cell overview",
  uncertainties: [],
});

const reconstruction = {
  version: 1,
  canvas: { width: 1000, height: 750 },
  objects: [
    {
      id: "cytoplasm-base",
      briefStructureId: "cytoplasm",
      role: "base",
      description: "Complete cytoplasm behind all organelles",
      anchor: { x: 45, y: 50 },
      labelPosition: { x: 8, y: 50 },
      complete: true,
      underlyingObjectIds: [],
    },
    {
      id: "nucleus",
      briefStructureId: "nucleus",
      role: "structure",
      description: "Complete nucleus placed above the cytoplasm",
      anchor: { x: 48, y: 48 },
      labelPosition: { x: 90, y: 35 },
      complete: true,
      underlyingObjectIds: ["cytoplasm-base"],
    },
  ],
  uncertainties: [],
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 750"><g data-layer="art"><path data-object-id="cytoplasm-base" data-role="base" d="M 100 400 C 100 150 800 100 900 375 C 800 650 150 650 100 400 Z" fill="#dff3e4" stroke="#1a1a1a" stroke-width="4"/><ellipse data-object-id="nucleus" data-role="structure" cx="480" cy="360" rx="100" ry="90" fill="#c6a8ed" stroke="#1a1a1a" stroke-width="4"/></g></svg>`,
};

test("sanitizes semantic SVGs and preserves a complete nucleus underlay contract", () => {
  const normalized = normalizeReconstruction(reconstruction, brief);
  const sanitized = sanitizeSvg(normalized.svg, 1000, 750);
  validateManifestLayering(
    normalized.objects,
    sanitized.objectIds,
    sanitized.objectPositions,
  );
  const canonical = buildCanonicalSvg(
    sanitized.inner,
    brief,
    normalized.objects,
  );
  assert.match(canonical.svg, /data-object-id="cytoplasm-base"/);
  assert.match(canonical.svg, /data-object-id="nucleus"/);
  assert.match(canonical.svg, /id="label-nucleus"/);
  assert.doesNotMatch(canonical.svg, /<mask|<clipPath|<image|<script|<style/i);
  assert.ok(
    normalized.objects
      .find((item) => item.id === "nucleus")
      ?.underlyingObjectIds.includes("cytoplasm-base"),
  );
  const checks = runEditabilityChecks(
    canonical.svg,
    brief,
    normalized.objects,
    sanitized.elementCount,
    sanitized.pathCount,
  );
  assert.ok(
    checks.some(({ message }) => /complete base geometry/i.test(message)),
  );
});

test("rejects model SVGs that smuggle in executable, raster, or hole-making constructs", () => {
  assert.throws(
    () =>
      sanitizeSvg(
        `<svg viewBox="0 0 1000 750"><path data-object-id="x" d="M 0 0 Z" fill="url(#paint)"/></svg>`,
        1000,
        750,
      ),
    /solid colours|external|unsupported/i,
  );
  assert.throws(
    () =>
      sanitizeSvg(
        `<svg viewBox="0 0 1000 750"><mask id="hole"><rect data-object-id="x" width="1" height="1"/></mask></svg>`,
        1000,
        750,
      ),
    /prohibited|not allowed/i,
  );
  assert.throws(
    () =>
      sanitizeSvg(
        `<svg viewBox="10 10 1000 750"><rect data-object-id="x" x="0" y="0" width="10" height="10"/></svg>`,
        1000,
        750,
      ),
    /viewBox must be 0 0/i,
  );
  assert.throws(
    () =>
      sanitizeSvg(
        `junk<svg viewBox="0 0 1000 750"><rect data-object-id="x" x="0" y="0" width="10" height="10"/></svg>`,
        1000,
        750,
      ),
    /one SVG root/i,
  );
  assert.doesNotThrow(() =>
    sanitizeSvg(
      `<svg viewBox="0 0 1000 750"><path data-object-id="x" d="M 0 0 L 10 10" fill="none" stroke="#111111" stroke-linecap="round" stroke-linejoin="bevel"/></svg>`,
      1000,
      750,
    ),
  );
  assert.throws(
    () =>
      sanitizeSvg(
        `<svg viewBox="0 0 1000 750"><path data-object-id="x" d="M 0 0 L 10 10" stroke="#111111" stroke-linecap="invalid"/></svg>`,
        1000,
        750,
      ),
    /stroke-linecap is invalid/i,
  );
});

test("rejects incomplete, unmapped, and incorrectly layered semantic objects", () => {
  assert.throws(
    () =>
      normalizeReconstruction(
        {
          ...reconstruction,
          objects: reconstruction.objects.map((object) =>
            object.id === "cytoplasm-base"
              ? { ...object, complete: false }
              : object,
          ),
        },
        brief,
      ),
    /base shape declared complete/i,
  );
  assert.throws(
    () =>
      normalizeReconstruction(
        {
          ...reconstruction,
          objects: reconstruction.objects.map((object) =>
            object.id === "nucleus"
              ? { ...object, underlyingObjectIds: ["missing"] }
              : object,
          ),
        },
        brief,
      ),
    /invalid underlying object/i,
  );
  assert.throws(
    () =>
      normalizeReconstruction(
        {
          ...reconstruction,
          objects: reconstruction.objects.slice(0, 1),
        },
        brief,
      ),
    /missing required structures/i,
  );
  const normalized = normalizeReconstruction(reconstruction, brief);
  const reversed = sanitizeSvg(
    `<svg viewBox="0 0 1000 750"><ellipse data-object-id="nucleus" cx="480" cy="360" rx="100" ry="90"/><path data-object-id="cytoplasm-base" d="M 100 400 L 900 400 Z"/></svg>`,
    1000,
    750,
  );
  assert.throws(
    () =>
      validateManifestLayering(
        normalized.objects,
        reversed.objectIds,
        reversed.objectPositions,
      ),
    /must be fully behind/i,
  );
  const withBackground = sanitizeSvg(
    reconstruction.svg.replace(
      ">",
      `><rect data-object-id="background" x="0" y="0" width="1000" height="750" fill="#ffffff"/>`,
    ),
    1000,
    750,
  );
  assert.doesNotThrow(() =>
    validateManifestLayering(
      normalized.objects,
      withBackground.objectIds,
      withBackground.objectPositions,
    ),
  );
});

test("rasterized underlay probes detect transparent geometry beneath a movable object", async () => {
  const normalized = normalizeReconstruction(reconstruction, brief);
  const complete = sanitizeSvg(normalized.svg, 1000, 750);
  assert.equal(
    await verifyUnderlayCoverage(complete.inner, normalized.objects),
    1,
  );
  const emptyBase = sanitizeSvg(
    `<svg viewBox="0 0 1000 750"><path data-object-id="cytoplasm-base" d="M 100 400 C 100 150 800 100 900 375 C 800 650 150 650 100 400 Z" fill="none" stroke="#1a1a1a"/><ellipse data-object-id="nucleus" cx="480" cy="360" rx="100" ry="90"/></svg>`,
    1000,
    750,
  );
  await assert.rejects(
    () => verifyUnderlayCoverage(emptyBase.inner, normalized.objects),
    /could expose a hole/i,
  );
  const boundary = sanitizeSvg(
    `<svg viewBox="0 0 1000 750"><circle data-object-id="cytoplasm-base" cx="500" cy="375" r="250" fill="#dff3e4"/><circle data-object-id="cell-membrane" cx="500" cy="375" r="250" fill="none" stroke="#278b89" stroke-width="20"/></svg>`,
    1000,
    750,
  );
  assert.equal(
    await verifyUnderlayCoverage(boundary.inner, [
      normalized.objects[0],
      {
        id: "cell-membrane",
        briefStructureId: "cytoplasm",
        role: "structure",
        description: "complete cell membrane boundary outline",
        anchor: { x: 50, y: 17 },
        labelPosition: null,
        complete: true,
        underlyingObjectIds: ["cytoplasm-base"],
      },
    ]),
    1,
  );
});

test("adds deterministic editable relationship arrows after reconstruction", () => {
  const processBrief = normalizeBrief({
    ...brief,
    diagramType: "process",
    relationships: [
      {
        from: "nucleus",
        to: "cytoplasm",
        relationship: "signal",
        direction: "from-to",
      },
    ],
  });
  const normalized = normalizeReconstruction(reconstruction, processBrief);
  const sanitized = sanitizeSvg(normalized.svg, 1000, 750);
  const canonical = buildCanonicalSvg(
    sanitized.inner,
    processBrief,
    normalized.objects,
  );
  assert.match(canonical.svg, /id="relationship-1"/);
  assert.match(canonical.svg, /marker-end="url\(#diagram-arrow-end\)"/);
  assert.match(canonical.svg, />signal<\/text>/);
  assert.ok(
    canonical.checks.some(({ message }) =>
      /editable SVG arrows/i.test(message),
    ),
  );
});
