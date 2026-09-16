import assert from "node:assert/strict";
import test from "node:test";
import { createNumericDomain } from "../code/scales.ts";
import {
  applyGraphPresentationDefaults,
  renderGraphSvg,
  validateGraphSpec,
} from "../code/graph.ts";

const source = {
  id: "S1",
  title: "User-provided fixture",
  url: "https://example.com/fixture",
};
const valid = {
  version: 1,
  kind: "bar",
  title: "Safe <title>",
  subtitle: "Verified values",
  xLabel: "Year",
  yLabel: "Share",
  unit: "%",
  categories: ["2022", "2023", "2024"],
  series: [{ label: "Czechia", values: [18.2, 18.6, 19.1], sourceIds: ["S1"] }],
  sources: [source],
  notes: [],
};

function v2(overrides: Record<string, unknown>) {
  return {
    version: 2,
    kind: "bar",
    title: "Fixture",
    subtitle: "Verified values",
    xLabel: "Category",
    yLabel: "Value",
    unit: "units",
    rightYLabel: "",
    rightYUnit: "",
    categories: ["A", "B"],
    series: [
      {
        label: "Series",
        values: [1, 2],
        sourceIds: ["S1"],
        mark: "bar",
        axis: "left",
        showValues: false,
        showMarkers: false,
      },
    ],
    points: [],
    slices: [],
    yMin: null,
    yMax: null,
    rightYMin: null,
    rightYMax: null,
    xMin: null,
    xMax: null,
    showLegend: true,
    showGridlines: true,
    showVerticalGridlines: false,
    showValueLabels: false,
    trendLine: false,
    centerLabel: "",
    slicesArePercentages: true,
    locale: "en",
    sources: [source],
    notes: [],
    ...overrides,
  };
}

function count(svg: string, pattern: string) {
  return (svg.match(new RegExp(pattern, "g")) || []).length;
}

test("accepts complete cited numeric data and renders deterministic SVG", () => {
  const { spec, checks } = validateGraphSpec(valid);
  const svg = renderGraphSvg(spec);
  assert.equal(spec.series[0].values[2], 19.1);
  assert.ok(checks.every(({ level }) => level === "pass"));
  assert.match(svg, /^<svg xmlns=/);
  assert.match(svg, /Safe &lt;title&gt;/);
  assert.match(svg, /User-provided fixture/);
  assert.doesNotMatch(svg, /<script|foreignObject|onload=/i);
});

test("chooses rounded automatic ticks like the reference charts", () => {
  assert.deepEqual(
    createNumericDomain([1, 868]).ticks,
    [0, 250, 500, 750, 1000],
  );
  assert.deepEqual(createNumericDomain([12, 59]).ticks, [0, 20, 40, 60]);
});

test("labels short bar charts and annotates their exact change", () => {
  const { spec } = validateGraphSpec(
    v2({
      title: "Renewable energy share",
      xLabel: "Year",
      yLabel: "Share",
      unit: "%",
      categories: ["2021", "2022", "2023"],
      series: [
        {
          label: "Czechia",
          values: [17.7, 18.2, 18.6],
          sourceIds: ["S1"],
          mark: "bar",
          axis: "left",
          showValues: false,
          showMarkers: false,
        },
      ],
    }),
  );
  const svg = renderGraphSvg(applyGraphPresentationDefaults(spec));
  assert.equal(count(svg, 'data-chart-role="value-label"'), 3);
  assert.match(svg, />17\.7%<\/text>/);
  assert.match(svg, />18\.6%<\/text>/);
  assert.match(svg, /Change from 2021 to 2023: \+0\.9 percentage points/);
  assert.match(svg, /data-axis="y-left"[^>]*>0<\/text>/);

  const withoutLabels = renderGraphSvg(
    applyGraphPresentationDefaults(spec, false),
  );
  assert.equal(count(withoutLabels, 'data-chart-role="value-label"'), 0);
});

test("centers short titles and wraps long titles within the chart field", () => {
  const { spec } = validateGraphSpec(
    v2({
      title:
        "Relationship Between Hours Studied and Exam Score for Twenty Students in a Fictional Examination Dataset",
    }),
  );
  const svg = renderGraphSvg(spec);
  assert.match(
    svg,
    /id="figure-title-text" x="520" y="52" text-anchor="middle"/,
  );
  assert.ok(count(svg, "<tspan") > 1);
  assert.doesNotMatch(svg, /<text x="110" y="82" class="subtitle">/);
});

test("renders rainfall bars with requested value labels and rounded ticks", () => {
  const { spec } = validateGraphSpec(
    v2({
      title: "Average Monthly Rainfall in Four Cities",
      xLabel: "Month",
      yLabel: "Rainfall",
      unit: "mm",
      categories: ["January", "April", "July", "October"],
      series: [
        {
          label: "London",
          values: [55, 44, 46, 68],
          sourceIds: ["S1"],
          mark: "bar",
          axis: "left",
          showValues: true,
          showMarkers: false,
        },
        {
          label: "Rome",
          values: [78, 55, 18, 94],
          sourceIds: ["S1"],
          mark: "bar",
          axis: "left",
          showValues: true,
          showMarkers: false,
        },
        {
          label: "Cairo",
          values: [5, 1, 0, 1],
          sourceIds: ["S1"],
          mark: "bar",
          axis: "left",
          showValues: true,
          showMarkers: false,
        },
        {
          label: "Mumbai",
          values: [1, 2, 868, 91],
          sourceIds: ["S1"],
          mark: "bar",
          axis: "left",
          showValues: true,
          showMarkers: false,
        },
      ],
    }),
  );
  const svg = renderGraphSvg(spec);
  assert.equal(count(svg, 'data-chart-role="bar"'), 16);
  assert.equal(count(svg, 'data-chart-role="value-label"'), 16);
  assert.match(svg, />250<\/text>/);
  assert.match(svg, />500<\/text>/);
  assert.match(svg, />750<\/text>/);
  assert.match(svg, />1,000<\/text>/);
  assert.equal(count(svg, String.raw`Rainfall \(mm\)`), 1);
  assert.match(svg, /data-series="Cairo"><rect[^>]*height="0"/);
});

test("renders population lines with rounded ticks and all markers", () => {
  const { spec } = validateGraphSpec(
    v2({
      kind: "line",
      title: "Population of Five Fictional Countries",
      yLabel: "Population",
      unit: "millions",
      categories: ["1960", "1970", "1980", "1990", "2000", "2010", "2020"],
      series: [
        {
          label: "Aronia",
          values: [28, 31, 35, 40, 46, 52, 59],
          sourceIds: ["S1"],
          mark: "line",
          axis: "left",
          showValues: false,
          showMarkers: true,
        },
        {
          label: "Belvaria",
          values: [42, 45, 47, 49, 48, 46, 43],
          sourceIds: ["S1"],
          mark: "line",
          axis: "left",
          showValues: false,
          showMarkers: true,
        },
        {
          label: "Cordinia",
          values: [19, 22, 27, 33, 39, 44, 50],
          sourceIds: ["S1"],
          mark: "line",
          axis: "left",
          showValues: false,
          showMarkers: true,
        },
        {
          label: "Deltora",
          values: [31, 34, 37, 39, 42, 45, 48],
          sourceIds: ["S1"],
          mark: "line",
          axis: "left",
          showValues: false,
          showMarkers: true,
        },
        {
          label: "Estavia",
          values: [12, 14, 17, 21, 26, 32, 39],
          sourceIds: ["S1"],
          mark: "line",
          axis: "left",
          showValues: false,
          showMarkers: true,
        },
      ],
    }),
  );
  const svg = renderGraphSvg(spec);
  assert.equal(count(svg, 'data-chart-role="line"'), 5);
  assert.equal(count(svg, 'data-chart-role="point"'), 35);
  assert.match(svg, />20<\/text>/);
  assert.match(svg, />40<\/text>/);
  assert.match(svg, />60<\/text>/);
  assert.equal(count(svg, String.raw`Population \(millions\)`), 1);
});

test("renders a climograph with independent axes and mixed marks", () => {
  const { spec } = validateGraphSpec(
    v2({
      kind: "combined",
      title: "Climograph",
      xLabel: "Month",
      yLabel: "Precipitation",
      unit: "mm",
      rightYLabel: "Temperature",
      rightYUnit: "°C",
      categories: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
      series: [
        {
          label: "Precipitation",
          values: [82, 68, 57, 48, 32, 15, 5, 8, 28, 61, 79, 91],
          sourceIds: ["S1"],
          mark: "bar",
          axis: "left",
          showValues: false,
          showMarkers: false,
        },
        {
          label: "Temperature",
          values: [9, 10, 13, 16, 21, 26, 29, 29, 25, 19, 14, 10],
          sourceIds: ["S1"],
          mark: "line",
          axis: "right",
          showValues: false,
          showMarkers: true,
        },
      ],
      yMin: 0,
      yMax: 100,
      rightYMin: 0,
      rightYMax: 35,
    }),
  );
  const svg = renderGraphSvg(spec);
  assert.equal(count(svg, 'data-chart-role="bar"'), 12);
  assert.equal(count(svg, 'data-chart-role="line"'), 1);
  assert.equal(count(svg, 'data-chart-role="point"'), 12);
  assert.match(svg, /data-axis="y-right"/);
  assert.match(svg, /data-series="Temperature"><polyline[^>]*stroke="#00a5a0"/);
  assert.match(svg, />100<\/text>/);
  assert.match(svg, /data-axis="y-right"[^>]*>35<\/text>/);
  assert.equal(count(svg, String.raw`Precipitation \(mm\)`), 1);
  assert.equal(count(svg, String.raw`Temperature \(°C\)`), 1);
});

test("renders donut slices, labels, legend, and center text", () => {
  const { spec } = validateGraphSpec(
    v2({
      kind: "donut",
      title: "Total biomass",
      categories: [],
      series: [],
      slices: [
        { label: "Trees (42%)", value: 42, sourceIds: ["S1"] },
        { label: "Shrubs", value: 18, sourceIds: ["S1"] },
        { label: "Grasses", value: 16, sourceIds: ["S1"] },
        { label: "Fungi", value: 11, sourceIds: ["S1"] },
        { label: "Animals", value: 8, sourceIds: ["S1"] },
        { label: "Other organisms", value: 5, sourceIds: ["S1"] },
      ],
      centerLabel: "Total biomass",
    }),
  );
  const svg = renderGraphSvg(spec);
  assert.equal(count(svg, 'data-chart-role="donut-slice"'), 6);
  assert.equal(count(svg, 'data-chart-role="slice-label"'), 6);
  assert.equal(count(svg, 'data-chart-role="legend-item"'), 6);
  assert.equal(count(svg, 'data-chart-role="center-label"'), 1);
  assert.match(svg, /Trees 42%/);
  assert.match(svg, /Other organisms 5%/);
});

test("renders scatter points and a locally calculated trend line", () => {
  const points = Array.from({ length: 20 }, (_, index) => ({
    x: 1 + index * 0.5,
    y: 48 + index * 2,
    label: String(index + 1),
    sourceIds: ["S1"],
  }));
  const { spec } = validateGraphSpec(
    v2({
      kind: "scatter",
      title: "Hours studied and exam score",
      xLabel: "Hours studied",
      yLabel: "Exam score",
      unit: "",
      categories: [],
      series: [],
      points,
      xMin: null,
      xMax: null,
      yMin: 40,
      yMax: 100,
      showVerticalGridlines: true,
      trendLine: true,
    }),
  );
  const svg = renderGraphSvg(spec);
  assert.equal(count(svg, 'data-chart-role="point"'), 20);
  assert.equal(count(svg, 'data-chart-role="trend-line"'), 1);
  assert.match(svg, />40<\/text>/);
  assert.match(svg, />100<\/text>/);
  assert.match(svg, /data-axis="x-grid"/);
});

test("allows source-free user data but reports its provenance warning", () => {
  const { checks } = validateGraphSpec(
    v2({
      sources: [],
      series: [
        {
          label: "Series",
          values: [1, 2],
          sourceIds: [],
          mark: "bar",
          axis: "left",
          showValues: false,
          showMarkers: false,
        },
      ],
    }),
  );
  assert.ok(
    checks.some(
      ({ level, message }) =>
        level === "pass" && message.includes("user-provided"),
    ),
  );
});

test("keeps explicit domains and formats ticks in Czech", () => {
  const { spec } = validateGraphSpec(
    v2({
      locale: "cs",
      yMin: 0,
      yMax: 35,
      series: [
        {
          label: "Řada",
          values: [1.5, 2.5],
          sourceIds: ["S1"],
          mark: "line",
          axis: "left",
          showValues: false,
          showMarkers: true,
        },
      ],
    }),
  );
  const svg = renderGraphSvg(spec);
  assert.match(svg, /data-axis="y-left"[^>]*>35<\/text>/);
  assert.match(svg, /Řada/);
});

test("rejects values outside explicit axis bounds", () => {
  assert.throws(
    () => validateGraphSpec(v2({ yMin: 0, yMax: 1 })),
    /outside the declared y axis bounds/,
  );
});

test("rejects mismatched value dimensions", () => {
  assert.throws(
    () =>
      validateGraphSpec({
        ...valid,
        series: [{ ...valid.series[0], values: [1, 2] }],
      }),
    /one finite number per category/,
  );
});

test("rejects undeclared citations and unsafe source protocols", () => {
  assert.throws(
    () =>
      validateGraphSpec({
        ...valid,
        series: [{ ...valid.series[0], sourceIds: ["missing"] }],
      }),
    /declared source IDs/,
  );
  assert.throws(
    () =>
      validateGraphSpec({
        ...valid,
        sources: [{ ...valid.sources[0], url: "javascript:alert(1)" }],
      }),
    /HTTP or HTTPS/,
  );
});

test("warns when values cross zero and renders negative bars", () => {
  const { spec, checks } = validateGraphSpec({
    ...valid,
    series: [{ ...valid.series[0], values: [-2, 0, 3] }],
  });
  assert.ok(checks.some(({ level }) => level === "warning"));
  assert.doesNotMatch(renderGraphSvg(spec), /height="-/);
});
