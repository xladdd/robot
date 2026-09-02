import assert from "node:assert/strict";
import test from "node:test";
import { renderGraphSvg, validateGraphSpec } from "../code/graph.ts";

const valid = {
  version: 1, kind: "bar", title: "Safe <title>", subtitle: "Verified values", xLabel: "Year", yLabel: "Share", unit: "%",
  categories: ["2022", "2023", "2024"],
  series: [{ label: "Czechia", values: [18.2, 18.6, 19.1], sourceIds: ["S1"] }],
  sources: [{ id: "S1", title: "Eurostat & source", url: "https://ec.europa.eu/eurostat" }], notes: [],
};

test("accepts complete cited numeric data and renders deterministic SVG", () => {
  const { spec, checks } = validateGraphSpec(valid);
  const svg = renderGraphSvg(spec);
  assert.equal(spec.series[0].values[2], 19.1);
  assert.ok(checks.every(({ level }) => level === "pass"));
  assert.match(svg, /^<svg xmlns=/);
  assert.match(svg, /Safe &lt;title&gt;/);
  assert.match(svg, /Eurostat &amp; source/);
  assert.doesNotMatch(svg, /<script|foreignObject|onload=/i);
});

test("rejects mismatched value dimensions", () => {
  assert.throws(() => validateGraphSpec({ ...valid, series: [{ ...valid.series[0], values: [1, 2] }] }), /one finite number per category/);
});

test("rejects undeclared citations and unsafe source protocols", () => {
  assert.throws(() => validateGraphSpec({ ...valid, series: [{ ...valid.series[0], sourceIds: ["missing"] }] }), /declared source IDs/);
  assert.throws(() => validateGraphSpec({ ...valid, sources: [{ ...valid.sources[0], url: "javascript:alert(1)" }] }), /HTTP or HTTPS/);
});

test("warns when values cross zero and renders negative bars", () => {
  const { spec, checks } = validateGraphSpec({ ...valid, series: [{ ...valid.series[0], values: [-2, 0, 3] }] });
  assert.ok(checks.some(({ level }) => level === "warning"));
  assert.doesNotMatch(renderGraphSvg(spec), /height="-/);
});
