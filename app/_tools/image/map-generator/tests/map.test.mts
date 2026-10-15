import assert from "node:assert/strict";
import test from "node:test";
import {
  createMapReport,
  renderMapSvg,
  validateMapSpec,
  type MapSpec,
} from "../code/map.ts";
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
import { snapGeometryToCoast } from "../code/coast-snap.ts";
import {
  createTerritoryAliasLookup,
  normalizeTerritoryName,
} from "../code/territory-aliases.ts";
import {
  DEFAULT_MAP_PRINT_PRESET_ID,
  MAP_LABEL_DENSITIES,
  MAP_LAYER_KEYS,
  MAP_LAYER_PRESETS,
  MAP_PRINT_PRESETS,
  MAP_PURPOSES,
  createMapExportMetadataDefaults,
  createMapPublicationPreflight,
  mapPrintUnits,
  matchingMapPurpose,
} from "../code/editor-options.ts";
import naturalEarthLand10m from "../code/data/natural-earth-land.json" with { type: "json" };
import {
  boundariesAt,
  nearestBoundaryEvent,
  type HistoricalTimeline,
} from "../code/historical-boundaries.ts";

const map: MapSpec = {
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
  assert.match(checks[0].message, /Natural Earth 1:10m/);
  assert.match(svg, /data-iso-numeric="250"/);
  assert.match(svg, /data-iso-numeric="276"/);
  assert.match(svg, /class="climate-zones"/);
  assert.equal((svg.match(/<path class="climate-[A-E]"/g) ?? []).length, 5);
  assert.doesNotMatch(svg, /climate-soften|feGaussianBlur/);
  assert.doesNotMatch(svg, /<rect class="climate-[A-E]"/);
  assert.match(svg, /<path d="M/);
  assert.doesNotMatch(svg, /<polygon/);
});

test("uses print-weight physical strokes and standalone layer defaults", () => {
  const svg = renderMapSvg(validateMapSpec(structuredClone(map)).spec);
  assert.match(svg, /\.regions path\{[^}]*stroke-width:\.4/);
  assert.match(svg, /\.base-land path\{[^}]*stroke-width:\.35/);
  assert.match(svg, /\.coast-overlay path\{[^}]*stroke-width:\.35/);
  assert.match(svg, /\.natural-lakes path\{[^}]*stroke-width:\.3/);
  assert.match(svg, /\.natural-rivers path\{[^}]*stroke-width:\.3/);
  assert.match(svg, /\.disputed-boundaries path\{[^}]*stroke-width:\.55/);
  assert.match(svg, /\.graticule path\{[^}]*stroke-width:\.2/);
  assert.match(svg, /\.feature\.route\{stroke-width:4\}/);

  for (const className of [
    "climate-zones",
    "natural-terrain",
    "natural-mountains",
    "natural-cities",
    "disputed-boundaries",
    "graticule",
    "water-feature-labels",
  ]) {
    assert.match(
      svg,
      new RegExp(
        `svg:not\\(\\.map-layer-visibility-managed\\) \\.${className.replaceAll("-", "\\-")}`,
      ),
    );
  }
  assert.doesNotMatch(svg, /!important/);
  assert.match(svg, /id="land"[^>]*class="base-land"/);
  assert.match(svg, /id="countries-borders"[^>]*class="regions"/);
  assert.match(svg, /id="lakes"[^>]*class="natural-lakes"/);
  assert.match(svg, /id="rivers"[^>]*class="natural-rivers"/);
  assert.match(svg, /id="country-names"/);
  assert.match(svg, /\.climate-zones path\{stroke:none;fill-rule:evenodd\}/);
  assert.doesNotMatch(svg, /feGaussianBlur|climate-soften/);
});

test("anchors modern multipolygon labels on the largest projected land polygon", () => {
  const world = structuredClone(map);
  world.geometry = "countries";
  world.projection = "naturalEarth";
  world.viewport = { west: -180, south: -90, east: 180, north: 90 };
  world.labels = [];
  world.categories = [{ id: "state", label: "States", color: "grey" }];
  world.regions = [
    {
      ...world.regions[0],
      label: "France",
      category: "state",
      isoNumeric: "250",
      atlasName: "",
      polygons: [],
    },
  ];
  const svg = renderMapSvg(validateMapSpec(world).spec);
  const labelMatch = svg.match(
    /<text[^>]+data-map-label-key="country-250"[^>]+data-map-label-variant="full"[^>]+data-map-label-root-x="([^"]+)"[^>]+data-map-label-root-y="([^"]+)"/,
  );
  assert.ok(labelMatch, "expected a projected France country label");
  const [, x, y] = labelMatch.map(Number);
  assert.ok(x > 480 && x < 540, `France label should be in Europe, got x=${x}`);
  assert.ok(y > 200 && y < 360, `France label should be in Europe, got y=${y}`);
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

test("warns instead of discarding a map when an identifier lacks 1:10m geometry", () => {
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
        level === "warning" &&
        /Unrepresented map unit/.test(message) &&
        /Natural Earth 1:10m/.test(message),
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
  assert.equal((svg.match(/class="scale-segment /g) ?? []).length, 4);
  assert.match(svg, /class="scale-segment scale-segment-dark"/);
  assert.match(svg, /class="scale-segment scale-segment-light"/);
  assert.match(svg, />0<\/text>/);
  assert.match(svg, /class="scale-unit"[^>]*>km<\/text>/);
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

test("resolves common English, Czech, and historical territory aliases exactly", () => {
  const czechia = { label: "Czechia", atlasName: "Czechia", id: "203" };
  const byzantium = { label: "Eastern Roman Empire", id: "byzantium" };
  const congo = { label: "Republic of the Congo", id: "178" };
  const lookup = createTerritoryAliasLookup([czechia, byzantium, congo]);
  assert.equal(lookup.get(normalizeTerritoryName("Česká republika")), czechia);
  assert.equal(
    lookup.get(normalizeTerritoryName("the Czech Republic")),
    czechia,
  );
  assert.equal(lookup.get(normalizeTerritoryName("Byzantská říše")), byzantium);
  assert.equal(lookup.get(normalizeTerritoryName("Congo-Brazzaville")), congo);
  assert.equal(lookup.get(normalizeTerritoryName("DRC")), undefined);
  assert.equal(normalizeTerritoryName("Côte d’Ivoire"), "cote divoire");
});

test("defines complete, exactly matchable map-purpose presets", () => {
  assert.deepEqual(MAP_PURPOSES, [
    "political",
    "physical",
    "historical",
    "climate",
    "blank",
  ]);
  for (const purpose of MAP_PURPOSES) {
    assert.deepEqual(Object.keys(MAP_LAYER_PRESETS[purpose]), MAP_LAYER_KEYS);
    assert.equal(MAP_LAYER_PRESETS[purpose].graticuleFront, false);
  }
  assert.equal(matchingMapPurpose(MAP_LAYER_PRESETS.political), "political");
  const custom = { ...MAP_LAYER_PRESETS.political, rivers: false };
  assert.equal(matchingMapPurpose(custom), null);
  assert.equal(matchingMapPurpose({ ...custom, rivers: true }), "political");
});

test("creates localized publication metadata defaults from map-owned fields", () => {
  assert.deepEqual(
    createMapExportMetadataDefaults({
      title: "  Europe  ",
      subtitle: " Political map ",
      sources: [{ title: "Natural Earth" }, { title: "" }],
      projectionLabel: "Robinson",
      language: "en",
    }),
    {
      title: "Europe",
      subtitle: "Political map",
      source: "Natural Earth",
      projectionNote: "Projection: Robinson",
      copyright: "",
    },
  );
  assert.equal(
    createMapExportMetadataDefaults({
      title: "Evropa",
      projectionLabel: "Robinsonovo",
      language: "cs",
    }).projectionNote,
    "Zobrazení: Robinsonovo",
  );
});

test("defines 10:7 pixel and physical print presets with exact unit conversion", () => {
  assert.equal(DEFAULT_MAP_PRINT_PRESET_ID, "original");
  assert.deepEqual(
    MAP_PRINT_PRESETS.map(({ id, width, height, unit }) => ({
      id,
      width,
      height,
      unit,
    })),
    [
      { id: "original", width: 1000, height: 700, unit: "px" },
      { id: "90mm", width: 90, height: 63, unit: "mm" },
      { id: "135mm", width: 135, height: 94.5, unit: "mm" },
      { id: "180mm", width: 180, height: 126, unit: "mm" },
    ],
  );
  for (const preset of MAP_PRINT_PRESETS)
    assert.ok(Math.abs(preset.width / preset.height - 10 / 7) < 1e-12);
  const units = mapPrintUnits(900, 90);
  assert.equal(units.unitsPerMm, 10);
  assert.equal(units.mm(0.15), 1.5);
  assert.ok(Math.abs(units.pt(7) - 24.694444444444443) < 1e-12);
});

test("reports publication preflight warnings without inventing pixel print sizes", () => {
  const original = createMapPublicationPreflight({
    printPresetId: "original",
    hasSources: false,
    hasDate: false,
    labelDensity: "standard",
    layers: {
      ...MAP_LAYER_PRESETS.political,
      climate: true,
      terrain: true,
      mountains: true,
      cities: true,
    },
    politicalYear: 1914,
  });
  for (const id of [
    "physical-size",
    "sources",
    "date",
    "text-size",
    "stroke-width",
    "layer-complexity",
    "temporal-layers",
  ])
    assert.equal(original.find((check) => check.id === id)?.level, "warning");
  assert.equal(
    original.find((check) => check.id === "text-size")?.actual,
    undefined,
  );

  const physical = createMapPublicationPreflight({
    printPresetId: "90mm",
    hasSources: true,
    hasDate: true,
    labelDensity: "essential",
    layers: MAP_LAYER_PRESETS.political,
    politicalYear: 2026,
    inspection: {
      usesRgbColors: false,
      unavailableFonts: [],
      labelsOutsideCrop: 0,
    },
  });
  assert.ok(physical.every(({ level }) => level === "pass"));
  assert.equal(physical.find((check) => check.id === "text-size")?.actual, 7);
  assert.equal(
    physical.find((check) => check.id === "stroke-width")?.actual,
    0.1,
  );

  const inspected = createMapPublicationPreflight({
    printPresetId: "135mm",
    hasSources: true,
    hasDate: true,
    labelDensity: "standard",
    layers: MAP_LAYER_PRESETS.political,
    politicalYear: 2026,
    inspection: {
      usesRgbColors: true,
      unavailableFonts: ["Verdana"],
      labelsOutsideCrop: 2,
    },
  });
  assert.equal(
    inspected.find(({ id }) => id === "rgb-colors")?.level,
    "warning",
  );
  assert.equal(
    inspected.find(({ id }) => id === "missing-fonts")?.detail,
    "Verdana",
  );
  assert.equal(
    inspected.find(({ id }) => id === "labels-outside-crop")?.actual,
    2,
  );
});

const labelOptions = {
  zoom: 1,
  density: "standard" as const,
  layers: {
    labels: true,
    water: true,
    waterLabels: true,
    lakes: true,
    rivers: true,
    cities: true,
    mountains: true,
  },
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

test("makes optional ranked labels monotonically denser", () => {
  assert.deepEqual(MAP_LABEL_DENSITIES, ["essential", "standard", "detailed"]);
  const groups = [
    group(
      label("ranked-city", {
        kind: "city",
        rank: 4,
        rootX: 500,
        rootY: 350,
      }),
    ),
  ];
  const essential = placeMapLabels(groups, {
    ...labelOptions,
    density: "essential",
  });
  const standard = placeMapLabels(groups, {
    ...labelOptions,
    density: "standard",
  });
  const detailed = placeMapLabels(groups, {
    ...labelOptions,
    density: "detailed",
  });
  assert.equal(essential.get("ranked-city")?.hidden, true);
  assert.equal(standard.get("ranked-city")?.hidden, true);
  assert.equal(detailed.get("ranked-city")?.hidden, false);
});

test("keeps required labels eligible under Essential but respects disabled layers", () => {
  const groups = [
    group(
      label("required-city", {
        kind: "city",
        rank: 99,
        required: true,
        rootX: 500,
        rootY: 350,
      }),
    ),
  ];
  assert.equal(
    placeMapLabels(groups, { ...labelOptions, density: "essential" }).get(
      "required-city",
    )?.hidden,
    false,
  );
  assert.equal(
    placeMapLabels(groups, {
      ...labelOptions,
      density: "detailed",
      layers: { ...labelOptions.layers, cities: false },
    }).get("required-city")?.hidden,
    true,
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

test("preserves serialized manual label offsets and variants", () => {
  const placements = placeMapLabels(
    [
      group(
        label("country", {
          text: "Long country name",
          variant: "full",
          manualDx: 18,
          manualDy: -11,
          manualVariant: "short",
        }),
        label("country", {
          text: "LC",
          variant: "short",
          manualDx: 18,
          manualDy: -11,
          manualVariant: "short",
        }),
      ),
    ],
    labelOptions,
  );
  assert.deepEqual(placements.get("country"), {
    key: "country",
    variant: "short",
    dx: 18,
    dy: -11,
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

test("leaves inland Cliopatria geometry untouched by coastline conflation", () => {
  const geometry: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [16, 46],
        [19, 46],
        [19, 48],
        [16, 48],
        [16, 46],
      ],
    ],
  };
  assert.deepEqual(snapGeometryToCoast(geometry), geometry);
});

test("snaps near-coast Cliopatria vertices onto the rendered coastline", () => {
  const polygons = naturalEarthLand10m.geometry.coordinates;
  const coastSegments: Array<[number[], number[]]> = [];
  for (const polygon of polygons)
    for (const ring of polygon)
      for (let i = 0; i + 1 < ring.length; i++) {
        const a = ring[i],
          b = ring[i + 1];
        const mx = (a[0] + b[0]) / 2,
          my = (a[1] + b[1]) / 2;
        if (mx > 10 && mx < 15 && my > 39 && my < 44)
          coastSegments.push([a, b]);
      }
  assert.ok(
    coastSegments.length > 20,
    "expected Tyrrhenian coastline segments near Rome",
  );
  const distanceToCoast = (point: [number, number]) => {
    let nearest = Infinity;
    for (const [a, b] of coastSegments) {
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      let x = a[0],
        y = a[1];
      if (dx || dy) {
        const t = Math.max(
          0,
          Math.min(
            1,
            ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy),
          ),
        );
        x += dx * t;
        y += dy * t;
      }
      const distance = Math.hypot(point[0] - x, point[1] - y);
      if (distance < nearest) nearest = distance;
    }
    return nearest;
  };
  const nearestCoast = (point: [number, number]): [number, number] => {
    let nearest = Infinity;
    let result: [number, number] = point;
    for (const [a, b] of coastSegments) {
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      let x = a[0],
        y = a[1];
      if (dx || dy) {
        const t = Math.max(
          0,
          Math.min(
            1,
            ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy),
          ),
        );
        x += dx * t;
        y += dy * t;
      }
      const distance = Math.hypot(point[0] - x, point[1] - y);
      if (distance < nearest) {
        nearest = distance;
        result = [x, y];
      }
    }
    return result;
  };
  // One vertex floats 0.15 degrees seaward of the Tyrrhenian coast near Rome.
  const coastPoint = nearestCoast([12.27, 41.55]);
  const seaward: [number, number] = [coastPoint[0], coastPoint[1] - 0.15];
  assert.ok(
    distanceToCoast(seaward) > 0.1,
    "expected the test vertex to float away from the coastline",
  );
  const geometry: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [[[11.5, 41.5], [13.5, 41.5], seaward, [11.5, 41.5]]],
  };
  const snapped = snapGeometryToCoast(geometry);
  assert.notDeepEqual(snapped, geometry);
  const vertices = (snapped as GeoJSON.Polygon).coordinates[0];
  const nearestSnapped = Math.min(
    ...vertices.map(([lon, lat]) =>
      distanceToCoast([lon, lat] as [number, number]),
    ),
  );
  assert.ok(
    nearestSnapped < 0.02,
    `expected a snapped vertex to sit on the coastline, nearest is ${nearestSnapped}`,
  );
  assert.deepEqual(snapped, snapGeometryToCoast(geometry));
});

test("validates the optional political year for year-aware overlays", () => {
  const base = structuredClone(map);
  base.politicalYear = -200;
  assert.equal(validateMapSpec(base).spec.politicalYear, -200);
  base.politicalYear = 2020;
  assert.equal(validateMapSpec(base).spec.politicalYear, 2020);
  for (const invalid of [0, 1.5, -4000, 3000]) {
    const broken = structuredClone(map);
    broken.politicalYear = invalid;
    assert.throws(() => validateMapSpec(broken), /no year zero|integer/);
  }
  const without = structuredClone(map);
  delete without.politicalYear;
  assert.equal(validateMapSpec(without).spec.politicalYear, undefined);
});

test("renders Pleiades ancient cities for ancient years only", () => {
  const { spec } = validateMapSpec(structuredClone(map));
  spec.politicalYear = -200;
  const ancientSvg = renderMapSvg(spec);
  assert.match(ancientSvg, /city-kind-pleiades/);
  assert.match(ancientSvg, /data-map-label-kind="city"[^>]*>Roma</);
  assert.doesNotMatch(ancientSvg, />Washington DC</);
  const modern = structuredClone(spec);
  modern.politicalYear = 1914;
  const modernSvg = renderMapSvg(modern);
  assert.doesNotMatch(modernSvg, /city-kind-pleiades/);
  assert.match(modernSvg, />Prague</);
});

test("renders projected shaded relief and compact Natural Earth summit markers", () => {
  const { spec } = validateMapSpec(structuredClone(map));
  spec.viewport = { west: -180, south: -58, east: 180, north: 82 };
  const svg = renderMapSvg(spec);
  assert.match(svg, /id="terrain" data-name="Shaded relief"/);
  assert.match(
    svg,
    /class="shaded-relief-image"[^>]+natural-earth-relief-schematic\.jpg/,
  );
  assert.match(svg, /clip-path="url\(#relief-land-clip\)"/);
  assert.doesNotMatch(svg, /d="<path/);
  assert.match(svg, /id="summit-markers" data-name="Summit markers"/);
  assert.ok((svg.match(/class="summit-marker /g) || []).length > 600);
  assert.match(svg, /data-name="HIMALAYAS"/);
  assert.match(svg, /data-name="Mount Everest"/);
  assert.match(svg, /Mount Everest · 8,848 m/);
  assert.match(svg, /class="summit-symbol" d="M0,-1\.9/);
  assert.doesNotMatch(
    svg,
    /relief-ridge|relief-shadow|range-shape|mountain-relief/,
  );
});

test("renders lakes above political fills so lake fills stay visible", () => {
  const { spec } = validateMapSpec(structuredClone(map));
  spec.politicalYear = -200;
  const historical = renderMapSvg(spec);
  assert.ok(
    historical.indexOf('id="lakes"') >
      historical.indexOf('id="countries-borders"'),
    "lakes layer must follow political fills in historical maps",
  );
  const countries = structuredClone(spec);
  countries.geometry = "countries";
  countries.politicalYear = 2020;
  countries.categories = [{ id: "state", label: "States", color: "grey" }];
  countries.regions = [
    {
      label: "Czechia",
      category: "state",
      isoNumeric: "203",
      atlasName: "",
      polygons: [],
      labelLon: 0,
      labelLat: 0,
      sourceIds: spec.regions[0].sourceIds,
    },
  ];
  const countrySvg = renderMapSvg(countries);
  assert.ok(
    countrySvg.indexOf('id="lakes"') >
      countrySvg.indexOf('id="countries-borders"'),
    "lakes layer must follow political fills in country maps",
  );
});

test("validates the base map projection", () => {
  for (const projection of [
    "schematic",
    "robinson",
    "eckert4",
    "naturalEarth",
  ] as const) {
    const spec = structuredClone(map);
    spec.projection = projection;
    assert.equal(validateMapSpec(spec).spec.projection, projection);
  }
  const broken = structuredClone(map);
  (broken as { projection: string }).projection = "gall-peters";
  assert.throws(() => validateMapSpec(broken), /projection/i);
});

test("renders Robinson, Eckert IV and Natural Earth projections with graticule layers", () => {
  const graticules: Record<string, string> = {};
  for (const projection of [
    "schematic",
    "robinson",
    "eckert4",
    "naturalEarth",
  ] as const) {
    const spec = structuredClone(map);
    spec.projection = projection;
    spec.showScaleBar = true;
    const svg = renderMapSvg(spec);
    assert.match(
      svg,
      /\.graticule path\{fill:none;stroke:#8faab7;stroke-width:\.26;stroke-opacity:\.74\}/,
    );
    const scaleKilometres = Number(
      svg.match(/data-segment-km="([\de.+-]+)"/)?.[1] ?? 0,
    );
    assert.ok(
      scaleKilometres >= 1,
      `${projection} scale must use a useful non-zero distance`,
    );
    assert.ok(
      svg.indexOf('id="graticule-behind"') < svg.indexOf('id="base-geography"'),
      "behind graticule must precede base geography",
    );
    assert.ok(
      svg.indexOf('id="graticule-front"') >
        svg.indexOf('id="thematic-overlays"'),
      "front graticule must follow thematic overlays",
    );
    const graticule =
      svg.match(/<g id="graticule-behind"[^>]*><path d="([^"]{40})/)?.[1] ?? "";
    assert.ok(
      graticule.length > 30,
      `${projection} graticule must render lines`,
    );
    graticules[projection] = graticule;
  }
  assert.notEqual(graticules.schematic, graticules.robinson);
  assert.notEqual(graticules.robinson, graticules.eckert4);
  assert.notEqual(graticules.eckert4, graticules.naturalEarth);
});

test("renders lake and river name labels as water-feature labels", () => {
  const { spec } = validateMapSpec(structuredClone(map));
  const svg = renderMapSvg(spec);
  assert.ok(
    (svg.match(/data-map-label-water-feature="lake"/g) || []).length > 20,
    "expected named lake labels in the lakes layer",
  );
  assert.ok(
    (svg.match(/data-map-label-water-feature="river"/g) || []).length > 40,
    "expected named river labels in the rivers layer",
  );
  assert.match(svg, /data-map-label-kind="water"[^>]*>Lake Balaton</);
  assert.match(svg, /data-map-label-kind="water"[^>]*>Danube</);
});

test("gates water-feature labels behind the water-labels layer switch", () => {
  const lake = label("lake-0", {
    kind: "water",
    text: "Caspian Sea",
    waterFeature: "lake",
  });
  const river = label("river-0", {
    kind: "water",
    text: "Amazon",
    waterFeature: "river",
  });
  const ocean = label("ocean-0", { kind: "water", text: "Pacific Ocean" });
  const groups = [lake, river, ocean].map((candidate) => ({
    key: candidate.key,
    candidates: [candidate],
  }));
  const shown = placeMapLabels(groups, {
    ...labelOptions,
    layers: { ...labelOptions.layers, waterLabels: true },
  });
  assert.equal(shown.get("lake-0")?.hidden, false);
  assert.equal(shown.get("river-0")?.hidden, false);
  assert.equal(shown.get("ocean-0")?.hidden, false);
  const hidden = placeMapLabels(groups, {
    ...labelOptions,
    layers: { ...labelOptions.layers, waterLabels: false },
  });
  assert.equal(hidden.get("lake-0")?.hidden, true);
  assert.equal(hidden.get("river-0")?.hidden, true);
  assert.equal(hidden.get("ocean-0")?.hidden, false);
  const lakesOff = placeMapLabels(groups, {
    ...labelOptions,
    layers: { ...labelOptions.layers, lakes: false },
  });
  assert.equal(lakesOff.get("lake-0")?.hidden, true);
  assert.equal(lakesOff.get("river-0")?.hidden, false);
  const riversOff = placeMapLabels(groups, {
    ...labelOptions,
    layers: { ...labelOptions.layers, rivers: false },
  });
  assert.equal(riversOff.get("river-0")?.hidden, true);
  assert.equal(riversOff.get("lake-0")?.hidden, false);
});

test("renders the Natural Earth 1:10m land outline and Admin 0 countries", async () => {
  const land = (
    await import("../code/data/natural-earth-land.json", {
      with: { type: "json" },
    })
  ).default as { geometry: { coordinates: number[][][][] } };
  assert.ok(
    land.geometry.coordinates.length > 5000,
    "expected 10m land polygons",
  );
  const countriesData = (
    await import("../code/data/natural-earth-countries.json", {
      with: { type: "json" },
    })
  ).default as { countries: Array<{ iso: string; name: string }> };
  assert.ok(countriesData.countries.some(({ iso }) => iso === "203"));
  const { spec } = validateMapSpec(structuredClone(map));
  spec.geometry = "countries";
  spec.categories = [{ id: "state", label: "States", color: "grey" }];
  spec.regions = [
    {
      label: "Czechia",
      category: "state",
      isoNumeric: "203",
      atlasName: "",
      polygons: [],
      labelLon: 0,
      labelLat: 0,
      sourceIds: spec.regions[0].sourceIds,
    },
  ];
  const svg = renderMapSvg(spec);
  assert.match(svg, /data-iso-numeric="203"/);
  assert.match(svg, /id="lakes"/);
});
