import assert from "node:assert/strict";
import test from "node:test";
import { renderDiagramSvg, validateDiagramSpec } from "../code/diagram.ts";

const amoeba = {
  version: 1, kind: "biology", title: "Amoeba <schema>", subtitle: "Simplified anatomy", subject: "amoeba",
  outline: [{ x: 15, y: 45 }, { x: 24, y: 20 }, { x: 43, y: 15 }, { x: 55, y: 28 }, { x: 83, y: 18 }, { x: 76, y: 46 }, { x: 88, y: 72 }, { x: 57, y: 78 }, { x: 34, y: 90 }, { x: 18, y: 68 }],
  structures: [{ label: "Nucleus <x>", description: "Contains genetic material", shape: "circle", x: 48, y: 48, width: 14, height: 14, labelX: 90, labelY: 35, color: "purple" }],
  notes: ["Schematic; not to scale."], referenceSummary: "No reference image.",
};

test("validates and safely renders a constrained biological diagram", () => {
  const { spec, checks } = validateDiagramSpec(amoeba);
  const svg = renderDiagramSvg(spec);
  assert.ok(checks.some(({ level }) => level === "warning"));
  assert.match(svg, /Amoeba &lt;schema&gt;/);
  assert.match(svg, /Nucleus &lt;x&gt;/);
  assert.match(svg, /x="500" y="60" text-anchor="middle" class="title"/);
  assert.doesNotMatch(svg, /Simplified anatomy<\/text>|class="note"|not to scale/i);
  assert.doesNotMatch(svg, /<ellipse/);
  assert.doesNotMatch(svg, /<script|foreignObject|onload=/i);
});

test("accepts large-area structures such as cytoplasm", () => {
  const cytoplasm = { ...amoeba.structures[0], label: "Cytoplasm", shape: "ellipse", width: 72, height: 64 };
  const { spec } = validateDiagramSpec({ ...amoeba, structures: [cytoplasm] });
  assert.equal(spec.structures[0].width, 72);
});

test("rejects unbounded diagram geometry and unsupported styles", () => {
  assert.throws(() => validateDiagramSpec({ ...amoeba, outline: [{ x: 150, y: 20 }, ...amoeba.outline] }), /between 8 and 92/);
  assert.throws(() => validateDiagramSpec({ ...amoeba, structures: [{ ...amoeba.structures[0], color: "url(javascript:1)" }] }), /unsupported colour/);
});

test("normalizes slightly out-of-range model diagram coordinates", () => {
  const { spec, checks } = validateDiagramSpec({ ...amoeba, outline: [{ x: 7, y: 4 }, ...amoeba.outline.slice(1)] });
  assert.deepEqual(spec.outline[0], { x: 8, y: 8 });
  assert.ok(checks.some(({ message }) => /2 model coordinates were normalized/.test(message)));
});

test("renders membrane, cytoplasm and pseudopodia as organism annotations", () => {
  const structural = [
    { ...amoeba.structures[0], label: "Cell membrane", color: "green" },
    { ...amoeba.structures[0], label: "Cytoplasm", color: "teal", labelX: 88, labelY: 70 },
    { ...amoeba.structures[0], label: "Pseudopodia", color: "green", labelX: 90, labelY: 40 },
    amoeba.structures[0],
  ];
  const svg = renderDiagramSvg(validateDiagramSpec({ ...amoeba, title: "Schematic Diagram of an Amoeba", structures: structural }).spec);
  assert.match(svg, />Amoeba<\/text>/);
  assert.match(svg, /data-structural-role="membrane"/);
  assert.match(svg, /data-structural-role="cytoplasm"/);
  assert.match(svg, /data-structural-role="pseudopodia"/);
  assert.match(svg, new RegExp(`<path d="[^"]+" fill="${"#73d3cf"}" stroke="#1a1a1a" stroke-width="4"`));
});
