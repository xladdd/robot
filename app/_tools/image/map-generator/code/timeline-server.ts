import { NextResponse } from "next/server";
import { loadCliopatriaTimeline } from "./cliopatria";
import {
  applyCliopatriaBoundaryCatalog,
  applyHistoricalBoundaryCatalog,
} from "./map-catalog";
import { createMapReport, renderMapSvg, type MapSpec } from "./map";
import worldAtlas from "world-atlas/countries-50m.json" with { type: "json" };

export const mapProjections = [
  "schematic",
  "robinson",
  "eckert4",
  "naturalEarth",
] as const;
export type TimelineProjection = (typeof mapProjections)[number];

export function buildTimelineSpec(
  year: number,
  projection: TimelineProjection,
  labelLanguage: "en" | "cs",
) {
  const ancient = year < 1886;
  const contemporary = year >= 2019;
  const displayYear = year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
  const spec: MapSpec = {
    version: 1,
    kind: "map",
    title: `Political map of the world — ${displayYear}`,
    subtitle: "Dated state boundaries",
    place: "World",
    date: displayYear,
    politicalYear: year,
    labelLanguage,
    projection,
    geometry: "historical",
    categories: [{ id: "state", label: `States in ${year}`, color: "grey" }],
    regions: [],
    features: [],
    labels: [],
    viewport: { west: -180, south: -58, east: 180, north: 82 },
    showScaleBar: true,
    showNorthArrow: false,
    sources: [
      {
        id: "CLIOPATRIA",
        title: "Cliopatria — worldwide historical polities",
        url: "https://github.com/Seshat-Global-History-Databank/cliopatria",
      },
    ],
    notes: [],
    referenceSummary: "Timeline view generated locally from Cliopatria.",
  };
  if (ancient)
    applyCliopatriaBoundaryCatalog(year, spec, loadCliopatriaTimelineCache());
  else if (contemporary) {
    spec.geometry = "countries";
    spec.date = displayYear;
    spec.categories = [
      { id: "state", label: `States in ${year}`, color: "grey" },
    ];
    spec.regions = worldAtlas.objects.countries.geometries.map((country) => ({
      label: country.properties?.name || String(country.id),
      category: "state",
      isoNumeric: String(country.id).padStart(3, "0"),
      atlasName: "",
      polygons: [],
      labelLon: 0,
      labelLat: 0,
      sourceIds: ["NATURAL_EARTH"],
    }));
    spec.sources = [
      {
        id: "NATURAL_EARTH",
        title: "Natural Earth Admin 0 countries",
        url: "https://www.naturalearthdata.com/",
      },
    ];
    spec.notes = [
      "Present-day borders use Natural Earth public-domain Admin 0 geometry.",
    ];
  } else
    applyHistoricalBoundaryCatalog(
      `Political map of the world in ${year}`,
      spec,
    );
  // Keep the projection-aware scale available as a standard map ornament in
  // every editor preset and standalone export.
  spec.showScaleBar = true;
  const checks: Array<{ level: "pass" | "warning"; message: string }> = [
    {
      level: "pass",
      message: `${spec.regions.length} dated state records selected locally for ${year}.`,
    },
  ];
  if (ancient)
    checks.push({
      level: "warning",
      message:
        "Ancient territorial extents are scholarly reconstructions and may be uncertain or disputed.",
    });
  else if (contemporary)
    checks.push({
      level: "warning",
      message:
        "Current borders use Natural Earth’s generalized public-domain geometry; disputed boundaries require editorial review.",
    });
  else
    checks.push({
      level: "pass",
      message: "Historical boundaries use the licensed CShapes 2.0 dataset.",
    });
  checks.push({
    level: "warning",
    message: ancient
      ? "Attribution required in publication: “Contains Cliopatria data by the Seshat Global History Databank (CC BY 4.0)” and “Contains Pleiades data (pleiades.stoa.org, CC BY 4.0)” when city labels are shown."
      : contemporary
        ? "Base geography and boundaries from Natural Earth (public domain); no attribution is legally required."
        : "Boundaries from CShapes 2.0 under a separate licence; retain the agreed attribution. Natural Earth (public domain) supplies base geography.",
  });
  const model = ancient
    ? "local/cliopatria-timeline"
    : contemporary
      ? "local/natural-earth-current"
      : "local/cshapes-timeline";
  return { spec, checks, ancient, contemporary, model };
}

// The catalog application is synchronous once the timeline is loaded; callers
// preload the cache with ensureCliopatriaTimeline() for years before 1886.
let cliopatriaCache: Awaited<ReturnType<typeof loadCliopatriaTimeline>> | null =
  null;
let cliopatriaCachePromise: Promise<
  Awaited<ReturnType<typeof loadCliopatriaTimeline>>
> | null = null;
export function loadCliopatriaTimelineCache() {
  if (!cliopatriaCache)
    throw new Error("Cliopatria timeline is not loaded yet.");
  return cliopatriaCache;
}

export async function ensureCliopatriaTimeline() {
  if (!cliopatriaCache) {
    cliopatriaCachePromise ??= loadCliopatriaTimeline().then((timeline) => {
      cliopatriaCache = timeline;
      return timeline;
    });
    await cliopatriaCachePromise;
  }
  return cliopatriaCache;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  if (!Number.isInteger(year) || year < -3400 || year > 2026 || year === 0)
    return NextResponse.json(
      {
        error:
          "Timeline year must be between 3400 BCE and 2026 CE; there is no year zero.",
      },
      { status: 400 },
    );
  const projectionParam = url.searchParams.get("projection") || "schematic";
  if (!mapProjections.includes(projectionParam as TimelineProjection))
    return NextResponse.json(
      { error: `Projection must be one of: ${mapProjections.join(", ")}.` },
      { status: 400 },
    );
  const projection = projectionParam as TimelineProjection;
  const langParam = url.searchParams.get("lang") === "cs" ? "cs" : "en";
  if (year < 1886) await ensureCliopatriaTimeline();
  const { spec, checks, model } = buildTimelineSpec(
    year,
    projection,
    langParam,
  );
  return NextResponse.json(
    {
      spec,
      svg: renderMapSvg(spec),
      checks,
      report: createMapReport(spec, checks, model, 0),
      model,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
