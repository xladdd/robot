import { NextResponse } from "next/server";
import { loadCliopatriaTimeline } from "./cliopatria";
import { applyCliopatriaBoundaryCatalog, applyHistoricalBoundaryCatalog } from "./map-catalog";
import { createMapReport, renderMapSvg, type MapSpec } from "./map";
import worldAtlas from "world-atlas/countries-50m.json" with { type: "json" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  if (!Number.isInteger(year) || year < -3400 || year > 2026 || year === 0) return NextResponse.json({ error: "Timeline year must be between 3400 BCE and 2026 CE; there is no year zero." }, { status: 400 });
  const ancient = year < 1886;
  const contemporary = year >= 2019;
  const displayYear = year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
  const spec: MapSpec = {
    version: 1, kind: "map", title: `Political map of the world — ${displayYear}`, subtitle: "Dated state boundaries", place: "World", date: displayYear, projection: "schematic", geometry: "historical",
    categories: [{ id: "state", label: `States in ${year}`, color: "grey" }], regions: [], features: [], labels: [], viewport: { west: -180, south: -58, east: 180, north: 82 }, showScaleBar: true, showNorthArrow: false,
    sources: [{ id: "CLIOPATRIA", title: "Cliopatria — worldwide historical polities", url: "https://github.com/Seshat-Global-History-Databank/cliopatria" }], notes: [], referenceSummary: "Timeline view generated locally from Cliopatria.",
  };
  if (ancient) applyCliopatriaBoundaryCatalog(year, spec, await loadCliopatriaTimeline());
  else if (contemporary) {
    spec.geometry = "countries";
    spec.date = displayYear;
    spec.categories = [{ id: "state", label: `States in ${year}`, color: "grey" }];
    spec.regions = worldAtlas.objects.countries.geometries.map((country) => ({ label: country.properties?.name || String(country.id), category: "state", isoNumeric: String(country.id).padStart(3, "0"), atlasName: "", polygons: [], labelLon: 0, labelLat: 0, sourceIds: ["NATURAL_EARTH"] }));
    spec.sources = [{ id: "NATURAL_EARTH", title: "Natural Earth Admin 0 countries", url: "https://www.naturalearthdata.com/" }];
    spec.notes = ["Present-day borders use Natural Earth public-domain Admin 0 geometry."];
  } else applyHistoricalBoundaryCatalog(`Political map of the world in ${year}`, spec);
  spec.showScaleBar = false;
  const checks: Array<{ level: "pass" | "warning"; message: string }> = [
    { level: "pass", message: `${spec.regions.length} dated state records selected locally for ${year}.` },
  ];
  if (ancient) checks.push({ level: "warning", message: "Ancient territorial extents are scholarly reconstructions and may be uncertain or disputed." });
  else if (contemporary) checks.push({ level: "warning", message: "Current borders use Natural Earth’s generalized public-domain geometry; disputed boundaries require editorial review." });
  else checks.push({ level: "pass", message: "Historical boundaries use the licensed CShapes 2.0 dataset." });
  const model = ancient ? "local/cliopatria-timeline" : contemporary ? "local/natural-earth-current" : "local/cshapes-timeline";
  return NextResponse.json({ spec, svg: renderMapSvg(spec), checks, report: createMapReport(spec, checks, model, 0), model }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
