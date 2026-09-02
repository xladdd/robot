import type { MapSpec } from "./map";
import { geoArea, geoCentroid } from "d3-geo";
import timelineData from "./data/cshapes-timeline.json" with { type: "json" };
import { boundariesAt, type HistoricalBoundaryRecord, type HistoricalTimeline } from "./historical-boundaries.ts";

export type CliopatriaRecord = { id: string; name: string; fromYear: number; toYear: number; wikidata: string; wikipedia: string; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon };
export type CliopatriaTimeline = { records: CliopatriaRecord[] };

const amazonRiver = [[-73.488637,-4.444838],[-73.372914,-4.130222],[-73.213938,-3.903497],[-72.849965,-3.454115],[-71.725209,-3.568048],[-71.220896,-3.87241],[-70.399973,-3.83172],[-69.887074,-4.337091],[-69.398427,-3.935724],[-68.938832,-3.39894],[-67.942006,-3.303725],[-67.467763,-2.733738],[-67.017161,-2.718764],[-66.519236,-2.420424],[-66.140981,-2.4367],[-65.514027,-2.585951],[-65.178049,-2.874933],[-64.648305,-3.342218],[-64.040517,-3.738214],[-63.694081,-3.880792],[-62.972035,-4.01808],[-62.101674,-3.843927],[-61.593373,-3.765964],[-60.811757,-3.484552],[-60.2683,-3.297296],[-59.654368,-3.081231],[-59.02831,-3.244561],[-58.605824,-3.253595],[-57.840484,-2.769464],[-57.202707,-2.562839],[-56.539947,-2.527358],[-55.514882,-1.949558],[-54.721344,-2.151707],[-54.066151,-2.1513],[-52.711781,-1.583836]];
const points = (values: number[][]) => values.map(([lon, lat]) => ({ lon, lat }));

export function applyPhysicalMapCatalog(request: string, spec: MapSpec) {
  const normalized = request.toLowerCase();
  if (!normalized.includes("south america") || !normalized.includes("andes") || !normalized.includes("amazon river")) return false;

  const datasetSourceId = "NE_RIVERS_10M";
  const overviewSourceId = "PHYSICAL_OVERVIEW";
  spec.sources = [
    { id: datasetSourceId, title: "Natural Earth 1:10m Rivers + Lake Centerlines", url: "https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/" },
    { id: overviewSourceId, title: "Encyclopaedia Britannica: South America physical features", url: "https://www.britannica.com/place/South-America" },
  ];
  const requiredCategories = [
    { id: "physical-area", label: "Generalized physical region", color: "green" },
    { id: "river", label: "Dataset river centerline", color: "blue" },
    { id: "mountain", label: "Mountain chain", color: "brown" },
  ];
  spec.categories = [...spec.categories.filter(({ id }) => !requiredCategories.some((item) => item.id === id)), ...requiredCategories];
  spec.features = [
    { label: "Amazon Basin", kind: "area", style: "physical", category: "physical-area", sourceIds: [overviewSourceId], points: points([[-79,2],[-72,5],[-63,5],[-53,2],[-47,-4],[-50,-12],[-58,-18],[-67,-16],[-73,-10],[-79,2]]) },
    { label: "Atacama Desert", kind: "area", style: "physical", category: "physical-area", sourceIds: [overviewSourceId], points: points([[-71.7,-18],[-68.5,-19],[-68.8,-27],[-70.8,-27],[-71.7,-18]]) },
    { label: "Brazilian Highlands", kind: "area", style: "physical", category: "physical-area", sourceIds: [overviewSourceId], points: points([[-55,-7],[-45,-5],[-39,-14],[-43,-24],[-51,-22],[-55,-14],[-55,-7]]) },
    { label: "Andes Mountains", kind: "line", style: "mountain", category: "mountain", sourceIds: [overviewSourceId], points: points([[-73,-46],[-71,-38],[-70,-30],[-69,-23],[-71,-16],[-74,-8],[-77,-1],[-78,7]]) },
    { label: "Amazon River", kind: "line", style: "river", category: "river", sourceIds: [datasetSourceId], points: points(amazonRiver) },
  ];
  const countryLabels: Record<string, string> = { "068": "Bolivia", "238": "Falkland Is.", "862": "Venezuela" };
  for (const region of spec.regions) if (countryLabels[region.isoNumeric]) region.label = countryLabels[region.isoNumeric];
  spec.labels = [
    { label: "Pacific Ocean", kind: "water", lon: -88, lat: -31 },
    { label: "Atlantic Ocean", kind: "water", lon: -31, lat: -12 },
  ];
  spec.viewport = { west: -96, south: -58, east: -26, north: 14 };
  spec.showNorthArrow = true;
  spec.showScaleBar = true;
  spec.notes = [
    "Amazon River geometry: Natural Earth 1:10m dataset.",
    "Mountain, basin, desert and highland extents are generalized educational overviews, not legal or survey boundaries.",
  ];
  return true;
}

function exteriorPolygons(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map(([exterior]) => {
    const forward = exterior.slice();
    const reversed = exterior.slice().reverse();
    const forwardArea = geoArea({ type: "Polygon", coordinates: [forward] });
    const reversedArea = geoArea({ type: "Polygon", coordinates: [reversed] });
    return (forwardArea <= reversedArea ? forward : reversed).map(([lon, lat]) => ({ lon, lat }));
  });
}

function geometryPoints(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  return geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
}

function intersectsViewport(record: HistoricalBoundaryRecord, viewport: MapSpec["viewport"]) {
  return geometryPoints(record.geometry).some(([lon, lat]) => lon >= viewport.west && lon <= viewport.east && lat >= viewport.south && lat <= viewport.north);
}

function largestLandLabelPoint(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const candidates = polygons.map(([exterior]) => {
    const forward = exterior.slice();
    const reversed = exterior.slice().reverse();
    const forwardArea = geoArea({ type: "Polygon", coordinates: [forward] });
    const reversedArea = geoArea({ type: "Polygon", coordinates: [reversed] });
    const ring = forwardArea <= reversedArea ? forward : reversed;
    const polygon: GeoJSON.Polygon = { type: "Polygon", coordinates: [ring] };
    return { area: Math.min(forwardArea, reversedArea), point: geoCentroid(polygon) };
  }).filter(({ point }) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  return candidates.sort((a, b) => b.area - a.area)[0]?.point || geoCentroid(geometry);
}

export function applyHistoricalBoundaryCatalog(request: string, spec: MapSpec) {
  const normalized = request.toLowerCase();
  const yearMatch = normalized.match(/\b(18(?:8[6-9]|9\d)|19\d{2}|20(?:0\d|1\d))\b/);
  if (!yearMatch) return false;
  const year = Number(yearMatch[1]);
  const date = normalized.includes("immediately before") && year === 1914 ? "1914-06-28" : `${year}-01-01`;
  spec.geometry = "historical";
  spec.date = date;
  const worldMode = normalized.includes("world") || !normalized.includes("europe");
  spec.place = worldMode ? "World" : "Europe";
  spec.viewport = worldMode ? { west: -180, south: -58, east: 180, north: 82 } : { west: -25, south: 34, east: 45, north: 72 };
  const centralCodes = new Set([255, 300, 640]);
  const ententeCodes = new Set([200, 220, 365]);
  const allianceMode = year === 1914 && /alliance|first world war|world war i|wwi/.test(normalized);
  spec.categories = allianceMode ? [
    { id: "entente", label: "Triple Entente", color: "blue" },
    { id: "central", label: "Central Powers", color: "red" },
    { id: "other", label: "Other states", color: "grey" },
  ] : [{ id: "state", label: `States in ${year}`, color: "grey" }];
  const requestedLabels = new Set([200, 210, 211, 220, 255, 300, 325, 340, 350, 355, 360, 365, 640]);
  const displayNames: Record<number, string> = { 200: "United Kingdom", 220: "France", 255: "German Empire", 300: "Austria-Hungary", 325: "Italy", 360: "Romania", 365: "Russian Empire", 640: "Ottoman Empire" };
  const records = boundariesAt(timelineData as HistoricalTimeline, date).filter((record) => worldMode || intersectsViewport(record, spec.viewport));
  spec.regions = records.map((record) => {
    const [labelLon, labelLat] = largestLandLabelPoint(record.geometry);
    return {
      dataId: record.id,
      label: displayNames[record.code] || record.name.split("/")[0],
      category: allianceMode ? centralCodes.has(record.code) ? "central" : ententeCodes.has(record.code) ? "entente" : "other" : "state",
      isoNumeric: "",
      atlasName: "",
      polygons: exteriorPolygons(record.geometry),
      labelLon,
      labelLat,
      labelVisible: Boolean(record.capital) && (worldMode || requestedLabels.has(record.code)),
      sourceIds: ["CSHAPES2"],
    };
  });
  spec.features = [];
  spec.labels = [
    { label: "North Sea", kind: "water", lon: 3, lat: 56 },
    { label: "Baltic Sea", kind: "water", lon: 19, lat: 58 },
    { label: "Mediterranean Sea", kind: "water", lon: 15, lat: 35.5 },
    { label: "Black Sea", kind: "water", lon: 34, lat: 43 },
  ];
  spec.sources = [{ id: "CSHAPES2", title: "CShapes 2.0 historical state boundaries", url: "https://icr.ethz.ch/data/cshapes/" }];
  spec.notes = ["Boundary geometry from licensed CShapes 2.0.", ...(allianceMode ? ["Alliance categories represent the situation immediately before the First World War and require editorial review for associated or later belligerents."] : [])];
  spec.showNorthArrow = false;
  spec.showScaleBar = true;
  spec.referenceSummary = "Timeline view generated locally from licensed CShapes 2.0 data.";
  return true;
}

export function applyCliopatriaBoundaryCatalog(year: number, spec: MapSpec, timeline: CliopatriaTimeline) {
  const records = timeline.records.filter((record) => record.fromYear <= year && year <= record.toYear);
  const rankedLabels = new Set(records.slice().sort((a, b) => geoArea(b.geometry) - geoArea(a.geometry)).slice(0, 70).map(({ id }) => id));
  spec.geometry = "historical";
  spec.date = year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
  spec.place = "World";
  spec.viewport = { west: -180, south: -58, east: 180, north: 82 };
  spec.categories = [{ id: "polity", label: year < 0 ? `Polities in ${Math.abs(year)} BCE` : `Polities in ${year} CE`, color: "grey" }];
  spec.regions = records.map((record) => {
    const [labelLon, labelLat] = largestLandLabelPoint(record.geometry);
    return {
      dataId: record.id,
      label: record.name,
      category: "polity",
      isoNumeric: "",
      atlasName: "",
      polygons: exteriorPolygons(record.geometry),
      labelLon,
      labelLat,
      labelVisible: rankedLabels.has(record.id),
      sourceIds: ["CLIOPATRIA"],
    };
  });
  spec.features = [];
  spec.labels = [];
  spec.sources = [{ id: "CLIOPATRIA", title: "Cliopatria — worldwide historical polities", url: "https://github.com/Seshat-Global-History-Databank/cliopatria" }];
  spec.notes = ["Cliopatria data licensed CC BY 4.0.", "Geometry simplified and coordinates quantized for this interactive adaptation.", "Historical territorial extents are scholarly reconstructions and may be uncertain or disputed."];
  spec.showNorthArrow = false;
  spec.showScaleBar = false;
  spec.referenceSummary = "Timeline view generated locally from the Cliopatria dataset by Seshat Global History Databank.";
  return records.length > 0;
}
