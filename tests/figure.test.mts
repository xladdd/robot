import assert from "node:assert/strict";
import test from "node:test";
import { renderDiagramSvg, renderFigureSvg, renderMapSvg, validateDiagramSpec, validateFigureSpec, validateMapSpec } from "../app/lib/figure.ts";
import { applyCliopatriaBoundaryCatalog, applyHistoricalBoundaryCatalog, applyPhysicalMapCatalog } from "../app/lib/map-catalog.ts";
import timeline from "../app/data/cshapes-timeline.json" with { type: "json" };
import { boundariesAt, nearestBoundaryEvent, type HistoricalTimeline } from "../app/lib/historical-boundaries.ts";

const valid = {
  version: 1, kind: "bar", title: "Safe <title>", subtitle: "Verified values", xLabel: "Year", yLabel: "Share", unit: "%",
  categories: ["2022", "2023", "2024"],
  series: [{ label: "Czechia", values: [18.2, 18.6, 19.1], sourceIds: ["S1"] }],
  sources: [{ id: "S1", title: "Eurostat & source", url: "https://ec.europa.eu/eurostat" }], notes: [],
};

test("accepts complete cited numeric data and renders deterministic SVG", () => {
  const { spec, checks } = validateFigureSpec(valid);
  const svg = renderFigureSvg(spec);
  assert.equal(spec.series[0].values[2], 19.1);
  assert.ok(checks.every(({ level }) => level === "pass"));
  assert.match(svg, /^<svg xmlns=/);
  assert.match(svg, /Safe &lt;title&gt;/);
  assert.match(svg, /Eurostat &amp; source/);
  assert.doesNotMatch(svg, /<script|foreignObject|onload=/i);
});

test("rejects mismatched value dimensions", () => {
  assert.throws(() => validateFigureSpec({ ...valid, series: [{ ...valid.series[0], values: [1, 2] }] }), /one finite number per category/);
});

test("rejects undeclared citations and unsafe source protocols", () => {
  assert.throws(() => validateFigureSpec({ ...valid, series: [{ ...valid.series[0], sourceIds: ["missing"] }] }), /declared source IDs/);
  assert.throws(() => validateFigureSpec({ ...valid, sources: [{ ...valid.sources[0], url: "javascript:alert(1)" }] }), /HTTP or HTTPS/);
});

test("warns when values cross zero and renders negative bars", () => {
  const { spec, checks } = validateFigureSpec({ ...valid, series: [{ ...valid.series[0], values: [-2, 0, 3] }] });
  assert.ok(checks.some(({ level }) => level === "warning"));
  assert.doesNotMatch(renderFigureSvg(spec), /height="-/);
});

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

const map = {
  version: 1, kind: "map", title: "Empire <117>", subtitle: "Schematic extent", place: "Mediterranean", date: "117 CE", projection: "schematic", geometry: "historical",
  categories: [{ id: "roman", label: "Roman Empire", color: "red" }],
  regions: [{ label: "Roman territory & provinces", category: "roman", isoNumeric: "", atlasName: "", polygons: [[{ lon: -8, lat: 36 }, { lon: 35, lat: 36 }, { lon: 30, lat: 48 }, { lon: -5, lat: 48 }]], labelLon: 14, labelLat: 42, sourceIds: ["S1"] }],
  features: [], labels: [{ label: "Mediterranean Sea", kind: "water", lon: 15, lat: 34 }], viewport: { west: -15, south: 25, east: 45, north: 58 }, showScaleBar: false, showNorthArrow: false,
  sources: [{ id: "S1", title: "Historical atlas & source", url: "https://example.edu/atlas" }], notes: ["Schematic boundaries."], referenceSummary: "No image supplied.",
};

test("validates and safely renders a cited schematic map", () => {
  const { spec, checks } = validateMapSpec(map);
  const svg = renderMapSvg(spec);
  assert.ok(checks.some(({ level }) => level === "warning"));
  assert.match(svg, /Empire &lt;117&gt;/);
  assert.match(svg, /Roman territory &amp; provinces/);
  assert.doesNotMatch(svg, /<script|foreignObject|onload=/i);
});

test("repairs unknown map source IDs and rejects out-of-bounds geometry", () => {
  assert.deepEqual(validateMapSpec({ ...map, regions: [{ ...map.regions[0], sourceIds: ["missing"] }] }).spec.regions[0].sourceIds, ["S1"]);
  assert.throws(() => validateMapSpec({ ...map, regions: [{ ...map.regions[0], polygons: [[{ lon: -181, lat: 2 }, { lon: 4, lat: 5 }, { lon: 6, lat: 7 }]] }] }), /between -180 and 180/);
});

test("renders contemporary countries with projected Natural Earth boundaries", () => {
  const contemporary = { ...map, geometry: "countries", labels: [], viewport: { west: -12, south: 35, east: 20, north: 56 }, regions: [
    { ...map.regions[0], label: "France", isoNumeric: "250", polygons: [], labelX: 0, labelY: 0 },
    { ...map.regions[0], label: "Germany", isoNumeric: "276", polygons: [], labelX: 0, labelY: 0 },
  ] };
  const { spec, checks } = validateMapSpec(contemporary);
  const svg = renderMapSvg(spec);
  assert.equal(spec.labels.length, 0);
  assert.match(checks[0].message, /Natural Earth/);
  assert.match(svg, /data-iso-numeric="250"/);
  assert.match(svg, /data-iso-numeric="276"/);
  assert.match(svg, /class="climate-zones"/);
  assert.match(svg, /<rect class="climate-[A-E]"/);
  assert.match(svg, /<path d="M/);
  assert.doesNotMatch(svg, /<polygon/);
});

test("uses a clipped European viewport instead of fitting transcontinental Russia", () => {
  const europe = { ...map, geometry: "countries", place: "Europe", labels: [], regions: [
    { ...map.regions[0], label: "France", isoNumeric: "250", atlasName: "", polygons: [] },
    { ...map.regions[0], label: "Russia", isoNumeric: "643", atlasName: "", polygons: [] },
  ] };
  const svg = renderMapSvg(validateMapSpec(europe).spec);
  const francePath = svg.match(/<path d="([^"]+)"[^>]+data-iso-numeric="250"/)?.[1] || "";
  const coordinates = [...francePath.matchAll(/-?\d+(?:\.\d+)?/g)].map(([value]) => Number(value));
  const xs = coordinates.filter((_, index) => index % 2 === 0);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 50, "France should occupy a readable width in the European viewport");
});

test("warns instead of discarding a map when an identifier lacks 1:50m geometry", () => {
  const missing = { ...map, geometry: "countries", labels: [], regions: [{ ...map.regions[0], label: "Unrepresented map unit", isoNumeric: "999", atlasName: "", polygons: [] }] };
  const { checks } = validateMapSpec(missing);
  assert.ok(checks.some(({ level, message }) => level === "warning" && /Unrepresented map unit/.test(message)));
});

test("resolves the South America acceptance prompt from deterministic catalog geometry", () => {
  const { spec } = validateMapSpec({ ...map, geometry: "countries", viewport: { west: -90, south: -60, east: -25, north: 15 }, regions: [{ ...map.regions[0], label: "Brazil", isoNumeric: "076", polygons: [] }], features: [], labels: [] });
  assert.equal(applyPhysicalMapCatalog("Map South America with the Andes and Amazon River", spec), true);
  assert.equal(spec.features.find(({ label }) => label === "Amazon River")?.points.length, 35);
  const svg = renderMapSvg(spec);
  assert.match(svg, /Amazon River/);
  assert.match(svg, /1,000 km/);
  assert.doesNotMatch(svg, /schematic scale/);
});

test("renders modern historical polity geometry through the commercial-use Cliopatria adapter", () => {
  const { spec } = validateMapSpec(map);
  const historical = { records: [{ id: "historical-1", name: "Test State", fromYear: 1900, toYear: 1920, wikidata: "Q1", wikipedia: "Test", geometry: { type: "Polygon" as const, coordinates: [[[5, 45], [15, 45], [15, 55], [5, 55], [5, 45]]] } }] };
  assert.equal(applyCliopatriaBoundaryCatalog(1914, spec, historical), true);
  assert.equal(spec.date, "1914 CE");
  assert.equal(spec.regions[0].label, "Test State");
  assert.equal(spec.regions[0].sourceIds[0], "CLIOPATRIA");
  assert.match(spec.notes[0], /CC BY 4\.0/);
  const svg = renderMapSvg(spec);
  assert.match(svg, /Test State/);
  assert.match(svg, /clipPath id="historical-land-clip"/);
  assert.match(svg, /clip-path="url\(#historical-land-clip\)"/);
  assert.doesNotMatch(svg, /id="map-information"/);
});

test("selects licensed CShapes records and renders a 1914 Europe map", () => {
  const data = timeline as HistoricalTimeline;
  assert.ok(boundariesAt(data, "1914-06-28").length > 100);
  assert.equal(nearestBoundaryEvent(data, "1914-06-28"), "1914-04-21");
  const { spec } = validateMapSpec(map);
  assert.equal(applyHistoricalBoundaryCatalog("Create a map of Europe in 1914 immediately before the First World War", spec), true);
  assert.equal(spec.date, "1914-06-28");
  assert.ok(spec.regions.some(({ label }) => label === "German Empire"));
  assert.ok(spec.regions.every(({ sourceIds }) => sourceIds[0] === "CSHAPES2"));
  assert.doesNotMatch(spec.notes.join(" "), /non-commercial|CC BY-NC-SA/i);
  assert.match(renderMapSvg(spec), /German Empire/);
});

test("renders BCE polity geometry through the Cliopatria adapter", () => {
  const { spec } = validateMapSpec(map);
  const ancient = { records: [{ id: "ancient-1", name: "Test Polity", fromYear: -600, toYear: -400, wikidata: "Q1", wikipedia: "Test", geometry: { type: "Polygon" as const, coordinates: [[[10, 30], [20, 30], [20, 40], [10, 40], [10, 30]]] } }] };
  assert.equal(applyCliopatriaBoundaryCatalog(-500, spec, ancient), true);
  assert.equal(spec.date, "500 BCE");
  assert.equal(spec.regions[0].sourceIds[0], "CLIOPATRIA");
  assert.match(renderMapSvg(spec), /id="countries-borders"/);
});
