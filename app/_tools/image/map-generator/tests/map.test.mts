import assert from "node:assert/strict";
import test from "node:test";
import { createMapReport, renderMapSvg, validateMapSpec } from "../code/map.ts";
import {
  placeMapLabels,
  type MapLabelCandidate,
  type MapLabelGroup,
} from "../code/label-layout.ts";
import {
  applyCliopatriaBoundaryCatalog,
  applyHistoricalBoundaryCatalog,
  applyPhysicalMapCatalog,
} from "../code/map-catalog.ts";
import timeline from "../code/data/cshapes-timeline.json" with { type: "json" };
import {
  boundariesAt,
  nearestBoundaryEvent,
  type HistoricalTimeline,
} from "../code/historical-boundaries.ts";

const map = {
  version: 1,
  kind: "map",
  title: "Empire <117>",
  subtitle: "Schematic extent",
  place: "Mediterranean",
  date: "117 CE",
  projection: "schematic",
  geometry: "historical",
  categories: [{ id: "roman", label: "Roman Empire", color: "red" }],
  regions: [
    {
      label: "Roman territory & provinces",
      category: "roman",
      isoNumeric: "",
      atlasName: "",
      polygons: [
        [
          { lon: -8, lat: 36 },
          { lon: 35, lat: 36 },
          { lon: 30, lat: 48 },
          { lon: -5, lat: 48 },
        ],
      ],
      labelLon: 14,
      labelLat: 42,
      sourceIds: ["S1"],
    },
  ],
  features: [],
  labels: [{ label: "Mediterranean Sea", kind: "water", lon: 15, lat: 34 }],
  viewport: { west: -15, south: 25, east: 45, north: 58 },
  showScaleBar: false,
  showNorthArrow: false,
  sources: [
    {
      id: "S1",
      title: "Historical atlas & source",
      url: "https://example.edu/atlas",
    },
  ],
  notes: ["Schematic boundaries."],
  referenceSummary: "No image supplied.",
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
  assert.deepEqual(
    validateMapSpec({
      ...map,
      regions: [{ ...map.regions[0], sourceIds: ["missing"] }],
    }).spec.regions[0].sourceIds,
    ["S1"],
  );
  assert.throws(
    () =>
      validateMapSpec({
        ...map,
        regions: [
          {
            ...map.regions[0],
            polygons: [
              [
                { lon: -181, lat: 2 },
                { lon: 4, lat: 5 },
                { lon: 6, lat: 7 },
              ],
            ],
          },
        ],
      }),
    /between -180 and 180/,
  );
});

test("renders contemporary countries with projected Natural Earth boundaries", () => {
  const contemporary = {
    ...map,
    geometry: "countries",
    labels: [],
    viewport: { west: -12, south: 35, east: 20, north: 56 },
    regions: [
      {
        ...map.regions[0],
        label: "France",
        isoNumeric: "250",
        polygons: [],
        labelX: 0,
        labelY: 0,
      },
      {
        ...map.regions[0],
        label: "Germany",
        isoNumeric: "276",
        polygons: [],
        labelX: 0,
        labelY: 0,
      },
    ],
  };
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
  const europe = {
    ...map,
    geometry: "countries",
    place: "Europe",
    labels: [],
    regions: [
      {
        ...map.regions[0],
        label: "France",
        isoNumeric: "250",
        atlasName: "",
        polygons: [],
      },
      {
        ...map.regions[0],
        label: "Russia",
        isoNumeric: "643",
        atlasName: "",
        polygons: [],
      },
    ],
  };
  const svg = renderMapSvg(validateMapSpec(europe).spec);
  const francePath =
    svg.match(/<path d="([^"]+)"[^>]+data-iso-numeric="250"/)?.[1] || "";
  const coordinates = [...francePath.matchAll(/-?\d+(?:\.\d+)?/g)].map(
    ([value]) => Number(value),
  );
  const xs = coordinates.filter((_, index) => index % 2 === 0);
  assert.ok(
    Math.max(...xs) - Math.min(...xs) > 50,
    "France should occupy a readable width in the European viewport",
  );
});

test("warns instead of discarding a map when an identifier lacks 1:50m geometry", () => {
  const missing = {
    ...map,
    geometry: "countries",
    labels: [],
    regions: [
      {
        ...map.regions[0],
        label: "Unrepresented map unit",
        isoNumeric: "999",
        atlasName: "",
        polygons: [],
      },
    ],
  };
  const { checks } = validateMapSpec(missing);
  assert.ok(
    checks.some(
      ({ level, message }) =>
        level === "warning" && /Unrepresented map unit/.test(message),
    ),
  );
});

test("resolves the South America acceptance prompt from deterministic catalog geometry", () => {
  const { spec } = validateMapSpec({
    ...map,
    geometry: "countries",
    viewport: { west: -90, south: -60, east: -25, north: 15 },
    regions: [
      { ...map.regions[0], label: "Brazil", isoNumeric: "076", polygons: [] },
    ],
    features: [],
    labels: [],
  });
  assert.equal(
    applyPhysicalMapCatalog(
      "Map South America with the Andes and Amazon River",
      spec,
    ),
    true,
  );
  assert.equal(
    spec.features.find(({ label }) => label === "Amazon River")?.points.length,
    35,
  );
  const svg = renderMapSvg(spec);
  assert.match(svg, /Amazon River/);
  assert.match(svg, /1,000 km/);
  assert.doesNotMatch(svg, /schematic scale/);
});

test("renders modern historical polity geometry through the commercial-use Cliopatria adapter", () => {
  const { spec } = validateMapSpec(map);
  const historical = {
    records: [
      {
        id: "historical-1",
        name: "Test State",
        fromYear: 1900,
        toYear: 1920,
        wikidata: "Q1",
        wikipedia: "Test",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [5, 45],
              [15, 45],
              [15, 55],
              [5, 55],
              [5, 45],
            ],
          ],
        },
      },
    ],
  };
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
  assert.equal(
    applyHistoricalBoundaryCatalog(
      "Create a map of Europe in 1914 immediately before the First World War",
      spec,
    ),
    true,
  );
  assert.equal(spec.date, "1914-06-28");
  assert.ok(spec.regions.some(({ label }) => label === "German Empire"));
  assert.ok(spec.regions.every(({ sourceIds }) => sourceIds[0] === "CSHAPES2"));
  assert.doesNotMatch(spec.notes.join(" "), /non-commercial|CC BY-NC-SA/i);
  assert.match(renderMapSvg(spec), /German Empire/);
});

test("renders BCE polity geometry through the Cliopatria adapter", () => {
  const { spec } = validateMapSpec(map);
  const ancient = {
    records: [
      {
        id: "ancient-1",
        name: "Test Polity",
        fromYear: -600,
        toYear: -400,
        wikidata: "Q1",
        wikipedia: "Test",
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [10, 30],
              [20, 30],
              [20, 40],
              [10, 40],
              [10, 30],
            ],
          ],
        },
      },
    ],
  };
  assert.equal(applyCliopatriaBoundaryCatalog(-500, spec, ancient), true);
  assert.equal(spec.date, "500 BCE");
  assert.equal(spec.regions[0].sourceIds[0], "CLIOPATRIA");
  assert.match(renderMapSvg(spec), /id="countries-borders"/);
});

const labelOptions = {
  zoom: 1,
  layers: { labels: true, water: true, cities: true, mountains: true },
};

function label(
  key: string,
  overrides: Partial<MapLabelCandidate> = {},
): MapLabelCandidate {
  return {
    key,
    text: key,
    kind: "country",
    variant: "default",
    rank: 0,
    prominence: 0,
    required: false,
    anchor: "middle",
    rootX: 50,
    rootY: 50,
    ...overrides,
  };
}

function group(...candidates: MapLabelCandidate[]): MapLabelGroup {
  return { key: candidates[0].key, candidates };
}

function placementEntries(groups: MapLabelGroup[]) {
  return [...placeMapLabels(groups, labelOptions).entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
}

test("places map labels repeatably and independently of input order", () => {
  const groups = [
    group(label("beta", { rootX: 54, required: true })),
    group(label("alpha", { rootX: 50, required: true })),
    group(label("gamma", { rootX: 58 })),
  ];
  assert.deepEqual(
    placementEntries(groups),
    placementEntries(groups.slice().reverse()),
  );
  assert.deepEqual(
    placementEntries(groups),
    placementEntries(groups.toReversed()),
  );
});

test("falls back from a full country name to its short label", () => {
  const placements = placeMapLabels(
    [
      group(
        label("country", {
          text: "A country name far too long for this map",
          variant: "full",
        }),
        label("country", { text: "AC", variant: "short" }),
      ),
    ],
    { ...labelOptions, width: 100, height: 100 },
  );
  assert.equal(placements.get("country")?.variant, "short");
  assert.equal(placements.get("country")?.hidden, false);
});

test("keeps a country abbreviation centered instead of moving its full name far away", () => {
  const placements = placeMapLabels(
    [
      group(
        label("obstacle", {
          text: "X",
          kind: "feature",
          required: true,
          rootX: 135,
          rootY: 50,
        }),
      ),
      group(
        label("country", {
          text: "Very Long Country Name",
          variant: "full",
          rootX: 100,
          rootY: 50,
        }),
        label("country", {
          text: "VC",
          variant: "short",
          rootX: 100,
          rootY: 50,
        }),
      ),
    ],
    { ...labelOptions, width: 200, height: 100 },
  );
  assert.deepEqual(placements.get("country"), {
    key: "country",
    variant: "short",
    dx: 0,
    dy: 0,
    hidden: false,
    overlaps: false,
  });
});

test("suppresses optional collisions but retains required labels as a minimum-overlap fallback", () => {
  const blocker = group(
    label("blocker", {
      text: "BLOCKER",
      required: true,
      rootX: 25,
      rootY: 14,
    }),
  );
  const optional = group(
    label("optional", { text: "OPTIONAL", rootX: 25, rootY: 14 }),
  );
  const required = group(
    label("required", {
      text: "REQUIRED",
      required: true,
      rootX: 25,
      rootY: 14,
    }),
  );
  const constrained = { ...labelOptions, width: 50, height: 20 };
  const optionalPlacements = placeMapLabels([blocker, optional], constrained);
  assert.equal(optionalPlacements.get("optional")?.hidden, true);
  const requiredPlacements = placeMapLabels([blocker, required], constrained);
  assert.equal(requiredPlacements.get("required")?.hidden, false);
  assert.equal(requiredPlacements.get("required")?.overlaps, true);
});

test("keeps placeable labels collision-free", () => {
  const placements = placeMapLabels(
    [
      group(label("west", { rootX: 100, rootY: 100 })),
      group(label("east", { rootX: 800, rootY: 500 })),
    ],
    labelOptions,
  );
  assert.ok(
    [...placements.values()].every(
      ({ hidden, overlaps }) => hidden || !overlaps,
    ),
  );
});

test("renders stable collision metadata and identifies reports as Map Maker", () => {
  const { spec, checks } = validateMapSpec(map);
  const svg = renderMapSvg(spec);
  assert.match(svg, /data-map-label-key="historical-0"/);
  assert.match(svg, /data-map-label-variant="full"/);
  assert.match(svg, /data-map-label-variant="short"/);
  assert.match(svg, /\.label-short\{display:none\}/);
  assert.equal(
    JSON.parse(createMapReport(spec, checks, "local", 0)).generator,
    "Taktik Robot Map Maker",
  );
});
