import {
  geoDistance,
  geoGraticule,
  geoMercator,
  geoNaturalEarth1,
  geoPath,
} from "d3-geo";
import type { GeoPermissibleObjects, GeoProjection } from "d3-geo";
import { geoEckert4, geoRobinson } from "./extra-projections.ts";
import worldAtlas from "world-atlas/countries-50m.json" with { type: "json" };
import naturalEarthLand10m from "./data/natural-earth-land.json" with { type: "json" };
import naturalEarthCountries10m from "./data/natural-earth-countries.json" with { type: "json" };
import { mapPalette } from "./palette.ts";
import naturalEarthWater from "./data/natural-earth-water.json" with { type: "json" };
import koppenClimate from "./data/koppen-climate.json" with { type: "json" };
import naturalEarthGeography from "./data/natural-earth-geography.json" with { type: "json" };
import naturalEarthPeaks from "./data/natural-earth-peaks.json" with { type: "json" };
import pleiadesPlacesData from "./data/pleiades-places.json" with { type: "json" };
import czechNamesData from "./data/czech-names.json" with { type: "json" };

export type MapPoint = { lon: number; lat: number };
export type MapSource = { id: string; title: string; url: string };
export type MapRegion = {
  dataId?: string;
  label: string;
  category: string;
  isoNumeric: string;
  atlasName: string;
  polygons: MapPoint[][];
  labelLon: number;
  labelLat: number;
  labelVisible?: boolean;
  sourceIds: string[];
};
export type MapFeature = {
  label: string;
  kind: "area" | "line" | "route" | "point";
  style: "physical" | "river" | "mountain" | "route" | "city" | "battle";
  category: string;
  points: MapPoint[];
  sourceIds: string[];
};
export type MapSpec = {
  version: 1;
  kind: "map";
  title: string;
  subtitle: string;
  place: string;
  date: string;
  // Numeric political year used to select year-aware overlays such as ancient
  // Pleiades cities. Optional for compatibility; there is no year zero.
  politicalYear?: number;
  // Label language for translatable place names (countries, capitals).
  labelLanguage?: "en" | "cs";
  // Base map projection. "schematic" is the Mercator fit used historically.
  projection: "schematic" | "robinson" | "eckert4" | "naturalEarth";
  geometry: "countries" | "historical";
  categories: Array<{ id: string; label: string; color: string }>;
  regions: MapRegion[];
  features: MapFeature[];
  labels: Array<{
    label: string;
    kind: "place" | "water";
    lon: number;
    lat: number;
  }>;
  viewport: { west: number; south: number; east: number; north: number };
  showScaleBar: boolean;
  showNorthArrow: boolean;
  sources: MapSource[];
  notes: string[];
  referenceSummary: string;
};

export type MapCheck = { level: "pass" | "warning"; message: string };
const mapColors = new Set([
  "orange",
  "teal",
  "purple",
  "pink",
  "green",
  "yellow",
  "blue",
  "grey",
  "red",
  "brown",
]);
export type RenderSwatch = {
  name: string;
  hex: string;
  model?: string;
  values?: number[];
  group?: string;
};

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function escapeXml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

function shortMapLabel(label: string) {
  const words = label
    .replace(/\([^)]*\)/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .filter((word) => !/^(of|the|and)$/i.test(word));
  if (words.length > 1)
    return words
      .slice(0, 3)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  return [...(words[0] || label)].slice(0, 2).join("").toUpperCase();
}

function boundedNumber(value: unknown, name: string, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max)
    throw new Error(`${name} must be between ${min} and ${max}.`);
  return number;
}

function polygonArea(points: MapPoint[]) {
  return (
    Math.abs(
      points.reduce((area, point, index) => {
        const next = points[(index + 1) % points.length];
        return area + point.lon * next.lat - next.lon * point.lat;
      }, 0),
    ) / 2
  );
}

export function validateMapSpec(input: unknown): {
  spec: MapSpec;
  checks: MapCheck[];
} {
  if (!input || typeof input !== "object")
    throw new Error("The model did not return a map specification.");
  const raw = input as Record<string, unknown>;
  if (raw.kind !== "map")
    throw new Error("The generated artifact is not a map.");
  const geometry =
    raw.geometry === "historical"
      ? "historical"
      : raw.geometry === "countries"
        ? "countries"
        : null;
  if (!geometry)
    throw new Error(
      "The map must declare country-boundary or historical geometry.",
    );
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).map(
    (value) => {
      const item =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : {};
      return {
        id: text(item.id, 40),
        title: text(item.title, 180),
        url: text(item.url, 500),
      };
    },
  );
  if (
    !sources.length ||
    sources.some(
      ({ id, title, url }) => !id || !title || !/^https?:\/\//i.test(url),
    )
  )
    throw new Error("Every map needs at least one named HTTP(S) source.");
  if (new Set(sources.map(({ id }) => id)).size !== sources.length)
    throw new Error("Map source IDs must be unique.");
  const sourceIds = new Set(sources.map(({ id }) => id));
  const categories = (Array.isArray(raw.categories) ? raw.categories : []).map(
    (value) => {
      const item =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : {};
      const id = text(item.id, 40),
        label = text(item.label, 80),
        color = text(item.color, 20).toLowerCase();
      if (!id || !label || !mapColors.has(color))
        throw new Error(
          "Every map category needs a unique ID, label, and supported colour.",
        );
      return { id, label, color };
    },
  );
  if (
    !categories.length ||
    categories.length > 10 ||
    new Set(categories.map(({ id }) => id)).size !== categories.length
  )
    throw new Error("Use between 1 and 10 uniquely identified map categories.");
  const categoryIds = new Set(categories.map(({ id }) => id));
  const geoPoint = (value: unknown, name: string): MapPoint => {
    const point =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    return {
      lon: boundedNumber(point.lon, `${name} longitude`, -180, 180),
      lat: boundedNumber(point.lat, `${name} latitude`, -90, 90),
    };
  };
  const regions = (Array.isArray(raw.regions) ? raw.regions : []).map(
    (value, regionIndex): MapRegion => {
      const item =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : {};
      const label = text(item.label, 100),
        category = text(item.category, 40);
      if (!label || !categoryIds.has(category))
        throw new Error(
          `Map region ${regionIndex + 1} needs a label and declared category.`,
        );
      const isoNumeric = text(item.isoNumeric, 3);
      const atlasName = text(item.atlasName, 100);
      const polygons = (Array.isArray(item.polygons) ? item.polygons : []).map(
        (polygon, polygonIndex) => {
          if (
            !Array.isArray(polygon) ||
            polygon.length < 3 ||
            polygon.length > 80
          )
            throw new Error(
              `${label} polygon ${polygonIndex + 1} must contain 3–80 points.`,
            );
          const points = polygon.map((point, pointIndex) =>
            geoPoint(point, `${label} point ${pointIndex + 1}`),
          );
          if (geometry === "historical" && polygonArea(points) < 0.05)
            throw new Error(
              `${label} polygon ${polygonIndex + 1} is collapsed or too small to map.`,
            );
          return points;
        },
      );
      if (
        (!/^\d{3}$/.test(isoNumeric) && !atlasName && !polygons.length) ||
        polygons.length > 12
      )
        throw new Error(
          `${label} needs a three-digit ISO numeric code, a Natural Earth map-unit name, or custom historical polygons.`,
        );
      const requestedSourceIds = Array.isArray(item.sourceIds)
        ? [...new Set(item.sourceIds.map((id) => text(id, 40)).filter(Boolean))]
        : [];
      const regionSourceIds = requestedSourceIds.filter((id) =>
        sourceIds.has(id),
      );
      if (!regionSourceIds.length) regionSourceIds.push(...sourceIds);
      return {
        label,
        category,
        isoNumeric,
        atlasName,
        polygons,
        labelLon:
          geometry === "countries"
            ? 0
            : boundedNumber(
                item.labelLon,
                `${label} label longitude`,
                -180,
                180,
              ),
        labelLat:
          geometry === "countries"
            ? 0
            : boundedNumber(item.labelLat, `${label} label latitude`, -90, 90),
        sourceIds: regionSourceIds,
      };
    },
  );
  if (regions.length > 240 || (geometry === "countries" && !regions.length))
    throw new Error(
      "Country maps need 1–240 regions; overlay maps may use features instead.",
    );
  const features: MapFeature[] = (
    Array.isArray(raw.features) ? raw.features : []
  )
    .map((value): MapFeature | null => {
      const item =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : {};
      const label = text(item.label, 100),
        kind = ["area", "line", "route", "point"].includes(String(item.kind))
          ? (item.kind as MapFeature["kind"])
          : null;
      const style = [
        "physical",
        "river",
        "mountain",
        "route",
        "city",
        "battle",
      ].includes(String(item.style))
        ? (item.style as MapFeature["style"])
        : null;
      const category = text(item.category, 40);
      if (!label || !kind || !style || !categoryIds.has(category)) return null;
      const points = (Array.isArray(item.points) ? item.points : []).map(
        (point, pointIndex) =>
          geoPoint(point, `${label} point ${pointIndex + 1}`),
      );
      const minimum = kind === "point" ? 1 : kind === "area" ? 3 : 2;
      if (points.length < minimum || points.length > 120) return null;
      const requestedSourceIds = Array.isArray(item.sourceIds)
        ? [...new Set(item.sourceIds.map((id) => text(id, 40)).filter(Boolean))]
        : [];
      const featureSourceIds = requestedSourceIds.filter((id) =>
        sourceIds.has(id),
      );
      if (!featureSourceIds.length) featureSourceIds.push(...sourceIds);
      return {
        label,
        kind,
        style,
        category,
        points,
        sourceIds: featureSourceIds,
      };
    })
    .filter((feature): feature is MapFeature => feature !== null);
  if (features.length > 80)
    throw new Error("Use no more than 80 geographic features.");
  if (features.some(({ kind }) => kind === "route"))
    regions.splice(0, regions.length);
  const usedCategoryIds = new Set([
    ...regions.map(({ category }) => category),
    ...features.map(({ category }) => category),
  ]);
  categories.splice(
    0,
    categories.length,
    ...categories.filter(({ id }) => usedCategoryIds.has(id)),
  );
  const labels: MapSpec["labels"] = (
    Array.isArray(raw.labels) ? raw.labels : []
  ).map((value, index): MapSpec["labels"][number] => {
    const item =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    const label = text(item.label, 100);
    const kind =
      item.kind === "water" ? "water" : item.kind === "place" ? "place" : null;
    if (!label || !kind)
      throw new Error(
        `Map label ${index + 1} needs text and a supported kind.`,
      );
    return { label, kind, ...geoPoint(item, label) };
  });
  if (labels.length > 40)
    throw new Error("Use no more than 40 free-standing map labels.");
  const title = text(raw.title, 160),
    place = text(raw.place, 120),
    date = text(raw.date, 100);
  if (!title || !place || !date)
    throw new Error(
      "The map needs a title, geographic scope, and explicit date or period.",
    );
  if (
    geometry === "countries" &&
    regions.some(
      ({ isoNumeric, atlasName }) => !/^\d{3}$/.test(isoNumeric) && !atlasName,
    )
  )
    throw new Error(
      "Every region on a contemporary country map needs an ISO numeric code or Natural Earth map-unit name.",
    );
  const atlasGeometries = worldAtlas.objects.countries.geometries as Array<{
    id?: string;
    properties?: { name?: string };
  }>;
  const atlasIds = new Set(atlasGeometries.map(({ id }) => id).filter(Boolean));
  const atlasNames = new Set(
    atlasGeometries.map(({ properties }) => properties?.name).filter(Boolean),
  );
  const missingBoundaryRegions =
    geometry === "countries"
      ? regions.filter(({ isoNumeric, atlasName }) =>
          /^\d{3}$/.test(isoNumeric)
            ? !atlasIds.has(isoNumeric)
            : !atlasNames.has(atlasName),
        )
      : [];
  const viewportRaw =
    raw.viewport && typeof raw.viewport === "object"
      ? (raw.viewport as Record<string, unknown>)
      : {};
  const viewport = {
    west: boundedNumber(viewportRaw.west, "Viewport west", -180, 180),
    south: boundedNumber(viewportRaw.south, "Viewport south", -90, 90),
    east: boundedNumber(viewportRaw.east, "Viewport east", -180, 180),
    north: boundedNumber(viewportRaw.north, "Viewport north", -90, 90),
  };
  if (viewport.west >= viewport.east || viewport.south >= viewport.north)
    throw new Error("The geographic viewport bounds are invalid.");
  const projections = new Set([
    "schematic",
    "robinson",
    "eckert4",
    "naturalEarth",
  ]);
  const projection = projections.has(String(raw.projection))
    ? (String(raw.projection) as MapSpec["projection"])
    : null;
  if (!projection)
    throw new Error(
      "The map projection must be schematic (Mercator), robinson, eckert4, or naturalEarth.",
    );
  const spec: MapSpec = {
    version: 1,
    kind: "map",
    title,
    subtitle: text(raw.subtitle, 240),
    place,
    date,
    politicalYear:
      raw.politicalYear === undefined || raw.politicalYear === null
        ? undefined
        : (() => {
            const year = Number(raw.politicalYear);
            if (
              !Number.isInteger(year) ||
              year === 0 ||
              year < -3400 ||
              year > 2026
            )
              throw new Error(
                "Political year must be an integer between 3400 BCE and 2026 CE; there is no year zero.",
              );
            return year;
          })(),
    projection,
    labelLanguage: raw.labelLanguage === "cs" ? "cs" : "en",
    geometry,
    categories,
    regions,
    features,
    labels,
    viewport,
    showScaleBar: raw.showScaleBar === true,
    showNorthArrow: raw.showNorthArrow === true,
    sources,
    notes: Array.isArray(raw.notes)
      ? raw.notes
          .map((note) => text(note, 240))
          .filter(Boolean)
          .slice(0, 8)
      : [],
    referenceSummary: text(raw.referenceSummary, 300),
  };
  const checks: MapCheck[] = [
    {
      level: "pass",
      message:
        geometry === "countries"
          ? `${regions.length} mapped countries use Natural Earth 1:10m boundaries.`
          : `${regions.length} historical regions use bounded, non-executable polygon geometry.`,
    },
    {
      level: "pass",
      message: "Every mapped region cites a declared web source.",
    },
    { level: "pass", message: `Temporal scope is explicit: ${date}.` },
    {
      level: "warning",
      message:
        "Boundaries are schematic. Editorial review against the cited sources is required before publication.",
    },
  ];
  if (missingBoundaryRegions.length)
    checks.push({
      level: "warning",
      message: `${missingBoundaryRegions.map(({ label }) => label).join(", ")} ${missingBoundaryRegions.length === 1 ? "is" : "are"} classified in the data but not drawn separately by the Natural Earth 1:10m boundary dataset.`,
    });
  if (geometry === "historical" && regions.length > 12)
    checks.push({
      level: "warning",
      message: `${regions.length} filled historical territories were retained. Consider simplifying the map if the overview is visually crowded.`,
    });
  return { spec, checks };
}

const EARTH_RADIUS_KM = 6371.0088;

export function createMapScaleBar(projection: GeoProjection) {
  const maximumWidth = 220;
  let maximumKilometres = 0;
  for (const y of [640, 620, 600, 560, 500]) {
    const west = projection.invert?.([500 - maximumWidth / 2, y]);
    const east = projection.invert?.([500 + maximumWidth / 2, y]);
    if (
      !west ||
      !east ||
      !west.every(Number.isFinite) ||
      !east.every(Number.isFinite)
    )
      continue;
    const distance = geoDistance(west, east) * EARTH_RADIUS_KM;
    if (Number.isFinite(distance) && distance > 0) {
      maximumKilometres = distance;
      break;
    }
  }
  if (!maximumKilometres) maximumKilometres = 1000;

  const rawStep = maximumKilometres / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const multiplier =
    [1, 2, 2.5, 5, 10].filter((candidate) => candidate <= normalized).at(-1) ??
    1;
  const segmentKilometres = multiplier * magnitude;
  const segmentCount = 4;
  const totalKilometres = segmentKilometres * segmentCount;
  return {
    segmentCount,
    segmentKilometres,
    totalKilometres,
    width: (totalKilometres / maximumKilometres) * maximumWidth,
  };
}

export function renderMapSvg(spec: MapSpec, swatches: RenderSwatch[] = []) {
  const canvas = { x: 0, y: 0, width: 1000, height: 700 };
  const localizedCountryName = (label: string) =>
    spec.labelLanguage === "cs"
      ? ((czechNamesData.countries as Record<string, string>)[label] ?? label)
      : label;
  const localizedName = (label: string) =>
    spec.labelLanguage === "cs"
      ? ((czechNamesData.cities as Record<string, string>)[label] ?? label)
      : label;
  const layer = (id: string, name: string, content: string, className = "") =>
    `<g id="${id}" data-name="${name}"${className ? ` class="${className}"` : ""}>${content}</g>`;
  const mapLabel = ({
    key,
    label,
    kind,
    rootX,
    rootY,
    x = rootX,
    y = rootY,
    className,
    anchor = "start",
    variant = "default",
    rank = 0,
    prominence = 0,
    required = false,
    waterFeature = "",
  }: {
    key: string;
    label: string;
    kind: "country" | "water" | "feature" | "city" | "mountain";
    rootX: number;
    rootY: number;
    x?: number;
    y?: number;
    className: string;
    anchor?: "start" | "middle" | "end";
    variant?: "default" | "full" | "short";
    rank?: number;
    prominence?: number;
    required?: boolean;
    waterFeature?: "lake" | "river" | "";
  }) =>
    `<text x="${x}" y="${y}" class="${className}" text-anchor="${anchor}" data-map-label-key="${escapeXml(key)}" data-map-label-kind="${kind}" data-map-label-variant="${variant}" data-map-label-rank="${rank}" data-map-label-prominence="${prominence.toFixed(3)}" data-map-label-required="${required}" data-map-label-water-feature="${waterFeature}" data-map-label-root-x="${rootX}" data-map-label-root-y="${rootY}" data-map-label-base-x="${x}" data-map-label-base-y="${y}">${escapeXml(label)}</text>`;

  const viewportGeometry: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [spec.viewport.west, spec.viewport.south],
        [spec.viewport.west, spec.viewport.north],
        [spec.viewport.east, spec.viewport.north],
        [spec.viewport.east, spec.viewport.south],
        [spec.viewport.west, spec.viewport.south],
      ],
    ],
  };
  const fittingGeometry =
    spec.viewport.east - spec.viewport.west >= 350
      ? { type: "Sphere" as const }
      : viewportGeometry;
  const baseProjection =
    spec.projection === "robinson"
      ? geoRobinson()
      : spec.projection === "eckert4"
        ? geoEckert4()
        : spec.projection === "naturalEarth"
          ? geoNaturalEarth1()
          : geoMercator();
  const projection = baseProjection
    .fitExtent(
      [
        [canvas.x, canvas.y],
        [canvas.x + canvas.width, canvas.y + canvas.height],
      ],
      fittingGeometry,
    )
    .clipExtent([
      [canvas.x, canvas.y],
      [canvas.x + canvas.width, canvas.y + canvas.height],
    ]);
  const path = geoPath(projection);
  const largestProjectedPolygon = (
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  ): GeoJSON.Polygon => {
    if (geometry.type === "Polygon") return geometry;
    let largest: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: geometry.coordinates[0] || [],
    };
    let largestArea = -Infinity;
    for (const coordinates of geometry.coordinates) {
      const polygon: GeoJSON.Polygon = { type: "Polygon", coordinates };
      const area = path.area(polygon);
      if (area > largestArea) {
        largest = polygon;
        largestArea = area;
      }
    }
    return largest;
  };
  // Graticule is rendered twice — behind and in front of the land — and the
  // editor/export show exactly one copy, so no re-render is needed to move it.
  // The graticule is sampled every 10 degrees and projection.clipExtent
  // disables d3's adaptive resampling, so densify to 2-degree steps or the
  // curved projections render meridians as angular chords.
  const graticuleLines = geoGraticule()().coordinates.map((line) => {
    const dense: [number, number][] = [];
    for (let index = 0; index < line.length - 1; index += 1) {
      const [lon1, lat1] = line[index];
      const [lon2, lat2] = line[index + 1];
      dense.push([lon1, lat1]);
      const steps = Math.max(
        1,
        Math.round(Math.max(Math.abs(lon2 - lon1), Math.abs(lat2 - lat1)) / 2),
      );
      for (let step = 1; step < steps; step += 1) {
        dense.push([
          lon1 + ((lon2 - lon1) * step) / steps,
          lat1 + ((lat2 - lat1) * step) / steps,
        ]);
      }
    }
    const last = line[line.length - 1];
    dense.push([last[0], last[1]]);
    return dense;
  });
  const graticulePath =
    path({
      type: "MultiLineString",
      coordinates: graticuleLines,
    } as GeoPermissibleObjects) || "";
  const graticuleBehind = layer(
    "graticule-behind",
    "Graticule behind land",
    `<path d="${graticulePath}"/>`,
    "graticule",
  );
  const graticuleFront = layer(
    "graticule-front",
    "Graticule in front of land",
    `<path d="${graticulePath}"/>`,
    "graticule",
  );
  const categoryById = new Map(
    spec.categories.map((category, index) => [
      category.id,
      { ...category, index },
    ]),
  );
  const featureMarkup = spec.features
    .map((item, featureIndex) => {
      const category = categoryById.get(item.category)!;
      const color = swatches.length
        ? swatches[category.index % swatches.length].hex
        : mapPalette[category.color];
      const coordinates = item.points.map(({ lon, lat }) => [lon, lat]);
      if (item.kind === "area") {
        const geometry: GeoJSON.Polygon = {
          type: "Polygon",
          coordinates: [[...coordinates, coordinates[0]]],
        };
        const [x, y] = path.centroid(geometry);
        return `<path class="feature area ${item.style}" d="${path(geometry) || ""}" fill="${color}"/>${mapLabel({ key: `feature-${featureIndex}`, label: item.label, kind: "feature", rootX: x, rootY: y, className: "feature-label", anchor: "middle", prominence: path.area(geometry), required: true })}`;
      }
      if (item.kind === "line" || item.kind === "route") {
        const geometry: GeoJSON.LineString = {
          type: "LineString",
          coordinates,
        };
        const last = projection(
          coordinates[coordinates.length - 1] as [number, number],
        );
        return `<path class="feature ${item.kind} ${item.style}" d="${path(geometry) || ""}" stroke="${color}"${item.kind === "route" ? ` marker-end="url(#arrow-${category.index})"` : ""}/>${item.kind === "line" && last ? mapLabel({ key: `feature-${featureIndex}`, label: item.label, kind: "feature", rootX: last[0] + 6, rootY: last[1] - 6, className: "feature-label", required: true }) : ""}`;
      }
      const position = projection(coordinates[0] as [number, number]);
      if (!position) return "";
      return `<g class="feature point ${item.style}" transform="translate(${position[0]} ${position[1]})">${item.style === "battle" ? `<path d="M-6,-6 L6,6 M6,-6 L-6,6" stroke="${color}" stroke-width="3"/>` : `<circle r="4" fill="${color}" stroke="#fff" stroke-width="1.5"/>`}${mapLabel({ key: `feature-${featureIndex}`, label: item.label, kind: "feature", rootX: position[0] + 8, rootY: position[1] - 7, x: 8, y: -7, className: "feature-label", required: true })}</g>`;
    })
    .join("");
  const freeLabels = spec.labels
    .map(({ label, kind, lon, lat }, labelIndex) => {
      const position = projection([lon, lat]);
      return position
        ? mapLabel({
            key: `free-${labelIndex}`,
            label,
            kind: kind === "water" ? "water" : "feature",
            rootX: position[0],
            rootY: position[1],
            className: `free-label ${kind}`,
            anchor: "middle",
            required: true,
          })
        : "";
    })
    .join("");
  const arrows = spec.categories
    .map(
      (category, index) =>
        `<marker id="arrow-${index}" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${swatches.length ? swatches[index % swatches.length].hex : mapPalette[category.color]}"/></marker>`,
    )
    .join("");
  const scaleBar = createMapScaleBar(projection);
  const formatScaleNumber = (value: number) =>
    value.toLocaleString("en", { maximumFractionDigits: 1 });
  const scaleSegments = Array.from(
    { length: scaleBar.segmentCount },
    (_, index) =>
      `<rect class="scale-segment scale-segment-${index % 2 ? "light" : "dark"}" x="${(scaleBar.width * index) / scaleBar.segmentCount}" width="${scaleBar.width / scaleBar.segmentCount}" height="9"/>`,
  ).join("");
  const scaleLabels = Array.from(
    { length: scaleBar.segmentCount + 1 },
    (_, index) =>
      `<text x="${(scaleBar.width * index) / scaleBar.segmentCount}" y="-5" text-anchor="middle">${formatScaleNumber(scaleBar.segmentKilometres * index)}</text>`,
  ).join("");
  const scaleMarkup = `<g id="graphic-scale" class="scale" data-name="Graphic scale" transform="translate(${950 - scaleBar.width} 660)">${scaleSegments}<rect class="scale-outline" width="${scaleBar.width}" height="9"/>${scaleLabels}<text class="scale-unit" x="${scaleBar.width + 8}" y="8">km</text></g>`;
  const ornaments = `${spec.showNorthArrow ? `<g class="north" transform="translate(952 54)"><path d="M0,24 L10,0 L20,24 L10,18 Z" fill="#1a1a1a"/><text x="10" y="-7" text-anchor="middle">N</text></g>` : ""}${spec.showScaleBar ? scaleMarkup : ""}`;
  const sharedStyle = `text{font-family:Verdana,Geneva,sans-serif;fill:#1a1a1a}.map-label{font-size:6px;font-weight:400;paint-order:stroke;stroke:#fff;stroke-width:1.6px;stroke-linejoin:round}.label-short{display:none}.free-label,.feature-label{font-size:7px;font-weight:400;paint-order:stroke;stroke:#fff;stroke-width:1.8px}.free-label.water{font-size:7.5px;fill:#256a86;font-style:italic}.base-land path{fill:#eeeeec;stroke:#777;stroke-width:.35;stroke-linejoin:round}.regions path{stroke:#1a1a1a;stroke-width:.4;stroke-linejoin:round}.feature.area{stroke:#1a1a1a;stroke-width:1;fill-opacity:.42}.feature.line,.feature.route{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.feature.river{stroke-width:2}.feature.mountain{stroke-dasharray:2 4;stroke-width:5}.feature.route{stroke-width:4}.coast-overlay path{fill:none;stroke:#555;stroke-width:.35}.north text,.scale text{font-size:7px;font-weight:400}.scale text{paint-order:stroke;stroke:#fff;stroke-width:2px;stroke-linejoin:round}.scale-segment-dark{fill:#1a1a1a}.scale-segment-light{fill:#fff}.scale-outline{fill:none;stroke:#1a1a1a;stroke-width:.6}.scale-unit{dominant-baseline:auto}svg:not(.map-layer-visibility-managed) .climate-zones,svg:not(.map-layer-visibility-managed) .natural-terrain,svg:not(.map-layer-visibility-managed) .natural-mountains,svg:not(.map-layer-visibility-managed) .natural-cities,svg:not(.map-layer-visibility-managed) .disputed-boundaries,svg:not(.map-layer-visibility-managed) .graticule,svg:not(.map-layer-visibility-managed) .water-feature-labels{display:none}`;
  const geographyStyle = `.graticule path{fill:none;stroke:#9cb6c2;stroke-width:.2;stroke-opacity:.65}.natural-lakes text,.natural-rivers text{font-size:6px;font-weight:400;paint-order:stroke;stroke:#fff;stroke-width:1.6px;stroke-linejoin:round;fill:#256a86;font-style:italic}.natural-terrain path{stroke:none;fill-opacity:.1}.terrain-desert{fill:#e3b85f}.terrain-plateau{fill:#ad8b64}.terrain-plain{fill:#9fc98d}.terrain-basin{fill:#8db5a1}.natural-mountains .range-shape{fill:#b77b72;fill-opacity:.025;stroke:#76554a;stroke-opacity:.18;stroke-width:.35}.mountain-relief path{fill:none;stroke-linecap:round;stroke-linejoin:round}.mountain-relief .relief-ridge{stroke:#8e5f58;stroke-opacity:.68;stroke-width:.65}.mountain-relief .relief-shadow{stroke:#9b6768;stroke-opacity:.46;stroke-width:.6}.summit-marker{display:none}.summit-rank-1,.summit-rank-2{display:inline}.summit-marker .summit-symbol{fill:#76554a;stroke:#fff;stroke-width:1.1;stroke-linejoin:round;paint-order:stroke fill}.natural-mountains text,.natural-cities text{font-size:6px;font-weight:400;paint-order:stroke;stroke:#fff;stroke-width:1.6px;stroke-linejoin:round}.natural-mountains text{fill:#654936;font-style:italic}.disputed-boundaries path{fill:none;stroke:#d35a40;stroke-width:.55;stroke-dasharray:3 2}.natural-cities circle{fill:#1a1a1a;stroke:#fff;stroke-width:.6}`;
  const physicalStyle = `.natural-lakes path{fill:#eaf6fa;stroke:#69a9c0;stroke-width:.3}.natural-rivers path{fill:none;stroke:#69a9c0;stroke-width:.3;stroke-linecap:round;stroke-linejoin:round}.climate-zones{opacity:.58;pointer-events:none}.climate-zones path{stroke:none;fill-rule:evenodd}`;
  const rivers = naturalEarthWater.rivers
    .map(
      ({ geometry, rank }) =>
        `<path class="water-rank-${rank}" d="${path(geometry as GeoJSON.Geometry) || ""}"/>`,
    )
    .join("");
  const lakes = naturalEarthWater.lakes
    .map(
      ({ geometry, rank }) =>
        `<path class="water-rank-${rank}" d="${path(geometry as GeoJSON.Geometry) || ""}"/>`,
    )
    .join("");
  const lakeLabels = naturalEarthWater.lakes
    .map(({ geometry, name, rank }, lakeIndex) => {
      if (!name) return "";
      const mapGeometry = geometry as GeoJSON.Geometry;
      const [x, y] = path.centroid(mapGeometry);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return "";
      return mapLabel({
        key: `lake-${lakeIndex}`,
        label: name,
        kind: "water",
        rootX: x,
        rootY: y,
        className: `water-feature-label rank-${rank}`,
        anchor: "middle",
        rank,
        prominence: path.area(mapGeometry),
        waterFeature: "lake",
      });
    })
    .join("");
  const riverLabels = naturalEarthWater.rivers
    .map(({ geometry, name, rank }, riverIndex) => {
      if (!name) return "";
      const coordinates =
        geometry.type === "LineString"
          ? [geometry.coordinates]
          : (geometry as GeoJSON.MultiLineString).coordinates;
      let best: [number, number] | null = null;
      let bestLength = 0;
      for (const line of coordinates)
        for (let i = 0; i + 1 < line.length; i++) {
          const start = projection(line[i] as [number, number]);
          const end = projection(line[i + 1] as [number, number]);
          if (!start || !end) continue;
          const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
          if (length > bestLength) {
            bestLength = length;
            best = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
          }
        }
      if (!best) return "";
      return mapLabel({
        key: `river-${riverIndex}`,
        label: name,
        kind: "water",
        rootX: best[0],
        rootY: best[1],
        className: `water-feature-label rank-${rank}`,
        anchor: "middle",
        rank,
        prominence: bestLength,
        waterFeature: "river",
      });
    })
    .join("");
  const climateZones = Object.entries(koppenClimate.polygons)
    .map(([group, coordinates]) => {
      const color =
        koppenClimate.groups[group as keyof typeof koppenClimate.groups].color;
      const geometry = {
        type: "MultiPolygon" as const,
        coordinates,
      } as GeoJSON.MultiPolygon;
      return `<path class="climate-${group}" d="${path(geometry) || ""}" fill="${color}"/>`;
    })
    .join("");
  const lakeLayer = layer(
    "lakes",
    "Lakes",
    `${lakes}<g class="water-feature-labels">${lakeLabels}</g>`,
    "natural-lakes",
  );
  const riverLayer = layer(
    "rivers",
    "Rivers",
    `${rivers}<g class="water-feature-labels">${riverLabels}</g>`,
    "natural-rivers",
  );
  const climateLayer = `<g id="climate-zones" data-name="Climate zones (Köppen–Geiger, 1980–2016)" class="climate-zones" aria-label="Köppen–Geiger climate zones, 1980–2016">${climateZones}</g>`;
  const terrain = naturalEarthGeography.terrain
    .map(
      ({ geometry, kind, name }) =>
        `<path d="${path(geometry as GeoJSON.Geometry) || ""}" class="terrain-${kind.toLowerCase()}" data-name="${escapeXml(name)}"/>`,
    )
    .join("");
  const mountainClipDefinitions: string[] = [];
  const mountainRelief = (
    mapGeometry: GeoJSON.Geometry,
    rank: number,
    mountainIndex: number,
    shape: string,
  ) => {
    const polygons =
      mapGeometry.type === "Polygon"
        ? [mapGeometry.coordinates]
        : (mapGeometry as GeoJSON.MultiPolygon).coordinates;
    const vertices: Array<[number, number]> = [];
    for (const polygon of polygons)
      for (const ring of polygon)
        for (const coordinate of ring) {
          const position = projection([coordinate[0], coordinate[1]]);
          if (position) vertices.push(position);
        }
    if (vertices.length < 4) return "";

    const centerX = vertices.reduce((sum, [x]) => sum + x, 0) / vertices.length;
    const centerY =
      vertices.reduce((sum, [, y]) => sum + y, 0) / vertices.length;
    let sumXX = 0;
    let sumXY = 0;
    let sumYY = 0;
    for (const [x, y] of vertices) {
      const dx = x - centerX;
      const dy = y - centerY;
      sumXX += dx * dx;
      sumXY += dx * dy;
      sumYY += dy * dy;
    }
    const angle = 0.5 * Math.atan2(2 * sumXY, sumXX - sumYY);
    const alongX = Math.cos(angle);
    const alongY = Math.sin(angle);
    const acrossX = -alongY;
    const acrossY = alongX;
    const transformed = vertices.map(([x, y]) => ({
      along: alongX * (x - centerX) + alongY * (y - centerY),
      across: acrossX * (x - centerX) + acrossY * (y - centerY),
    }));
    const minimumAlong = Math.min(...transformed.map(({ along }) => along));
    const maximumAlong = Math.max(...transformed.map(({ along }) => along));
    const minimumAcross = Math.min(...transformed.map(({ across }) => across));
    const maximumAcross = Math.max(...transformed.map(({ across }) => across));
    const extent = maximumAlong - minimumAlong;
    const crossExtent = maximumAcross - minimumAcross;
    if (extent < 2 || crossExtent < 1) return "";

    const clipId = `mountain-range-clip-${mountainIndex}`;
    mountainClipDefinitions.push(
      `<clipPath id="${clipId}"><path d="${shape}"/></clipPath>`,
    );
    const inset = Math.min(extent * 0.08, 5);
    const ridgeStart = minimumAlong + inset;
    const ridgeEnd = maximumAlong - inset;
    const ridgePoint = (along: number, across = 0) => [
      centerX + alongX * along + acrossX * across,
      centerY + alongY * along + acrossY * across,
    ];
    const ridgeWave = (ratio: number) =>
      Math.sin(ratio * Math.PI * 2 + mountainIndex * 0.73) *
      Math.min(crossExtent * 0.12, 3.2) *
      Math.sin(Math.PI * ratio);
    const ridgeSamples = Array.from({ length: 7 }, (_, index) => {
      const ratio = index / 6;
      return ridgePoint(
        ridgeStart + ratio * (ridgeEnd - ridgeStart),
        ridgeWave(ratio),
      );
    });
    const ridgePath = ridgeSamples
      .map(([x, y], index) =>
        index === 0
          ? `M${x.toFixed(2)},${y.toFixed(2)}`
          : `L${x.toFixed(2)},${y.toFixed(2)}`,
      )
      .join(" ");
    const ridge = `<path class="relief-ridge" d="${ridgePath}"/>`;
    const strokeCount = Math.min(
      rank <= 2 ? 34 : 24,
      Math.max(4, Math.round(extent / (rank <= 2 ? 4 : 5.5))),
    );
    const hachures: string[] = [];
    for (let index = 0; index < strokeCount; index += 1) {
      const ratio = (index + 0.5) / strokeCount;
      const along = ridgeStart + ratio * (ridgeEnd - ridgeStart);
      const deterministicWave = Math.sin(
        (mountainIndex + 1) * 1.618 + index * 2.414,
      );
      const ridgeOffset =
        ridgeWave(ratio) +
        deterministicWave * Math.min(crossExtent * 0.045, 1.1);
      const taper = Math.sin(Math.PI * ratio);
      const length = Math.max(1.8, Math.min(13, crossExtent * 0.48 * taper));
      const [ridgeX, ridgeY] = ridgePoint(along, ridgeOffset);
      const [shadowX, shadowY] = ridgePoint(along, ridgeOffset + length);
      const curveAlong = deterministicWave * Math.min(length * 0.24, 2.2);
      const [shadowControlX, shadowControlY] = ridgePoint(
        along + curveAlong,
        ridgeOffset + length * 0.5,
      );
      hachures.push(
        `<path class="relief-shadow" d="M${ridgeX.toFixed(2)},${ridgeY.toFixed(2)} Q${shadowControlX.toFixed(2)},${shadowControlY.toFixed(2)} ${shadowX.toFixed(2)},${shadowY.toFixed(2)}"/>`,
      );
    }
    return `<g class="mountain-relief" clip-path="url(#${clipId})">${ridge}${hachures.join("")}</g>`;
  };
  const mountainParts = naturalEarthGeography.mountains.map(
    ({ geometry, name, rank }, mountainIndex) => {
      const mapGeometry = geometry as GeoJSON.Geometry;
      const shape = path(mapGeometry) || "";
      const [x, y] = path.centroid(mapGeometry);
      if (!shape) return { relief: "", label: "" };
      const label =
        name && Number.isFinite(x) && Number.isFinite(y)
          ? `<g class="mountain-rank-${rank}" data-name="${escapeXml(name)}">${mapLabel(
              {
                key: `mountain-${mountainIndex}`,
                label: name,
                kind: "mountain",
                rootX: x,
                rootY: y,
                className: "mountain-label",
                anchor: "middle",
                rank,
                prominence: path.area(mapGeometry),
              },
            )}</g>`
          : "";
      return {
        relief: `<g class="mountain-rank-${rank}" data-name="${escapeXml(name)}"><path class="range-shape" d="${shape}"/>${mountainRelief(mapGeometry, rank, mountainIndex, shape)}</g>`,
        label,
      };
    },
  );
  const mountainRanges = mountainParts.map(({ relief }) => relief).join("");
  const mountainLabels = mountainParts.map(({ label }) => label).join("");
  const summitMarkers = (
    naturalEarthPeaks.peaks as Array<{
      name: string;
      elevation: number;
      rank: number;
      minZoom: number;
      geometry: { type: "Point"; coordinates: [number, number] };
    }>
  )
    .map(({ geometry, name, elevation, rank, minZoom }, peakIndex) => {
      const position = projection(geometry.coordinates);
      if (!position) return "";
      const [x, y] = position;
      const size = rank <= 2 ? 4.2 : rank <= 4 ? 3.5 : 2.8;
      const symbolPath = `M0,${(-size).toFixed(1)} L${(size * 0.86).toFixed(1)},${(size * 0.55).toFixed(1)} L${(-size * 0.86).toFixed(1)},${(size * 0.55).toFixed(1)} Z`;
      const label = mapLabel({
        key: `summit-${peakIndex}`,
        label: `${name} · ${elevation.toLocaleString("en")} m`,
        kind: "mountain",
        rootX: x + size + 2,
        rootY: y - 1,
        x: size + 2,
        y: -1,
        className: "summit-label",
        rank,
        prominence: elevation,
      });
      return `<g class="summit-marker summit-rank-${rank}" data-rank="${rank}" data-min-zoom="${minZoom}" data-name="${escapeXml(name)}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"><path class="summit-symbol" d="${symbolPath}"/>${label}</g>`;
    })
    .join("");
  const mountains = `${layer("mountain-relief", "Mountain relief", mountainRanges)}${layer("mountain-range-labels", "Mountain range labels", mountainLabels)}${layer("summit-markers", "Summit markers", summitMarkers)}`;
  const disputed = naturalEarthGeography.disputed
    .map(
      ({ geometry, name }) =>
        `<path d="${path(geometry as GeoJSON.Geometry) || ""}" data-name="${escapeXml(name)}"/>`,
    )
    .join("");
  const ancientCities =
    typeof spec.politicalYear === "number" && spec.politicalYear < 1000
      ? (
          pleiadesPlacesData as {
            places: Array<{
              id: string;
              title: string;
              fromYear: number;
              toYear: number;
              lon: number;
              lat: number;
              rank: number;
            }>;
          }
        ).places.filter(
          (place) =>
            place.fromYear <= spec.politicalYear! &&
            spec.politicalYear! <= place.toYear,
        )
      : null;
  const cities = ancientCities
    ? ancientCities
        .map((place, cityIndex) => {
          const position = projection([place.lon, place.lat]);
          return position
            ? `<g class="city-kind-pleiades city-rank-${place.rank}" data-name="${escapeXml(place.title)}" transform="translate(${position[0]} ${position[1]})"><circle r="1.7"/>${mapLabel({ key: `pleiades-city-${cityIndex}`, label: place.title, kind: "city", rootX: position[0] + 4, rootY: position[1] + 2, x: 4, y: 2, className: "city-label", rank: place.rank })}</g>`
            : "";
        })
        .join("")
    : naturalEarthGeography.cities
        .map(({ geometry, name, rank }, cityIndex) => {
          const position = projection(
            (geometry as GeoJSON.Point).coordinates as [number, number],
          );
          return position
            ? `<g class="city-rank-${rank}" data-name="${escapeXml(name)}" transform="translate(${position[0]} ${position[1]})"><circle r="1.7"/>${mapLabel({ key: `city-${cityIndex}`, label: localizedName(name), kind: "city", rootX: position[0] + 4, rootY: position[1] + 2, x: 4, y: 2, className: "city-label", rank })}</g>`
            : "";
        })
        .join("");
  const terrainLayer = layer(
    "terrain",
    "Terrain regions",
    terrain,
    "natural-terrain",
  );
  const mountainLayer = layer(
    "mountains",
    "Mountain ranges",
    mountains,
    "natural-mountains",
  );
  const disputedLayer = layer(
    "disputed-boundaries",
    "Disputed boundaries",
    disputed,
    "disputed-boundaries",
  );
  const cityLayer = layer(
    "cities",
    "Cities and capitals",
    cities,
    "natural-cities",
  );
  const composeLayers = (
    baseLand: string,
    countries: string,
    shortLabels: string,
    fullLabels: string,
  ) => {
    const baseGeography = layer(
      "base-geography",
      "Base geography",
      layer("land", "Land", baseLand, "base-land"),
    );
    const politicalGeography = layer(
      "political-geography",
      "Political geography",
      `${layer("countries-borders", "Countries and borders", countries, "regions")}${disputedLayer}`,
    );
    const thematicOverlays = layer(
      "thematic-overlays",
      "Thematic overlays",
      `${terrainLayer}${climateLayer}${mountainLayer}${lakeLayer}${riverLayer}`,
    );
    const labelLayers = layer(
      "labels",
      "Labels",
      `${cityLayer}<g id="country-abbreviations" data-name="Country abbreviations">${shortLabels}</g>${layer("country-names", "Country names", fullLabels)}${layer("geographic-labels", "Geographic labels", freeLabels)}`,
    );
    return `${layer("seas-oceans", "Seas and oceans", `<rect width="1000" height="700" fill="#eaf6fa"/>`)}${graticuleBehind}${baseGeography}${politicalGeography}${thematicOverlays}${graticuleFront}${layer("map-features", "Map features", featureMarkup)}${labelLayers}${layer("coastline", "Coastline", baseLand, "coast-overlay")}${layer("map-ornaments", "Map ornaments", ornaments)}`;
  };
  if (spec.geometry === "countries") {
    const countryFeatures = naturalEarthCountries10m.countries as Array<{
      iso: string;
      name: string;
      geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    }>;
    const regionById = new Map(
      spec.regions
        .filter(({ isoNumeric }) => isoNumeric)
        .map((region) => [region.isoNumeric, region]),
    );
    const regionByName = new Map(
      spec.regions
        .filter(({ atlasName }) => atlasName)
        .map((region) => [region.atlasName, region]),
    );
    const regionForFeature = (item: { iso: string; name: string }) =>
      regionById.get(item.iso) || regionByName.get(item.name);
    const selected = countryFeatures.filter(regionForFeature);
    const baseLand = countryFeatures
      .map((item) => `<path d="${path(item.geometry) || ""}"/>`)
      .join("");
    const shapes = selected
      .map((item) => {
        const id = item.iso,
          region = regionForFeature(item)!;
        const category = spec.categories.find(
          ({ id: categoryId }) => categoryId === region.category,
        )!;
        const categoryIndex = spec.categories.findIndex(
          ({ id }) => id === category.id,
        );
        const fill = swatches.length
          ? swatches[categoryIndex % swatches.length].hex
          : mapPalette[category.color];
        return `<path d="${path(item.geometry) || ""}" fill="${fill}"${id ? ` data-iso-numeric="${id}"` : ` data-map-unit="${escapeXml(region.atlasName)}"`}/>`;
      })
      .join("");
    const labelParts = selected.map((item) => {
      const region = regionForFeature(item)!;
      const labelGeometry = largestProjectedPolygon(item.geometry);
      const [x, y] = path.centroid(labelGeometry);
      const key = `country-${item.iso}`;
      const prominence = path.area(labelGeometry);
      return Number.isFinite(x) && Number.isFinite(y)
        ? {
            short: mapLabel({
              key,
              label: shortMapLabel(localizedCountryName(region.label)),
              kind: "country",
              rootX: x,
              rootY: y,
              className: "map-label label-short",
              anchor: "middle",
              variant: "short",
              prominence,
            }),
            full: mapLabel({
              key,
              label: localizedCountryName(region.label),
              kind: "country",
              rootX: x,
              rootY: y,
              className: "map-label label-full",
              anchor: "middle",
              variant: "full",
              prominence,
            }),
          }
        : { short: "", full: "" };
    });
    const shortLabels = labelParts.map(({ short }) => short).join("");
    const fullLabels = labelParts.map(({ full }) => full).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" role="img" aria-label="${escapeXml(spec.title)}" aria-describedby="map-desc"><desc id="map-desc">${escapeXml(`${spec.subtitle} ${spec.place}, ${spec.date}. Country boundaries from Natural Earth. Optional climate zones use Beck et al. 2018 normals for 1980–2016.`)}</desc><defs>${arrows}${mountainClipDefinitions.join("")}</defs><style>${sharedStyle}${geographyStyle}${physicalStyle}</style>${composeLayers(baseLand, shapes, shortLabels, fullLabels)}</svg>`;
  }
  const landPath =
    path(naturalEarthLand10m.geometry as GeoJSON.MultiPolygon) || "";
  const baseLand = `<path d="${landPath}"/>`;
  const regionParts = spec.regions.map((region, regionIndex) => {
    const category = categoryById.get(region.category)!;
    const fill = swatches.length
      ? swatches[category.index % swatches.length].hex
      : mapPalette[category.color];
    const shapes = region.polygons
      .map((polygon) => {
        const coordinates = polygon.map(({ lon, lat }) => [lon, lat]);
        const geometry: GeoJSON.Polygon = {
          type: "Polygon",
          coordinates: [[...coordinates, coordinates[0]]],
        };
        return `<path d="${path(geometry) || ""}" fill="${fill}"${region.dataId ? ` data-region-id="${escapeXml(region.dataId)}" data-region-label="${escapeXml(region.label)}"` : ""}/>`;
      })
      .join("");
    const labelPosition = projection([region.labelLon, region.labelLat]);
    const labelKey = `historical-${region.dataId || regionIndex}`;
    const prominence = region.polygons.reduce((total, polygon) => {
      const coordinates = polygon.map(({ lon, lat }) => [lon, lat]);
      const geometry: GeoJSON.Polygon = {
        type: "Polygon",
        coordinates: [[...coordinates, coordinates[0]]],
      };
      return total + path.area(geometry);
    }, 0);
    const shortLabel =
      region.labelVisible !== false && labelPosition
        ? mapLabel({
            key: labelKey,
            label: shortMapLabel(localizedCountryName(region.label)),
            kind: "country",
            rootX: labelPosition[0],
            rootY: labelPosition[1],
            className: "map-label label-short",
            anchor: "middle",
            variant: "short",
            prominence,
          })
        : "";
    const fullLabel =
      region.labelVisible !== false && labelPosition
        ? mapLabel({
            key: labelKey,
            label: localizedCountryName(region.label),
            kind: "country",
            rootX: labelPosition[0],
            rootY: labelPosition[1],
            className: "map-label label-full",
            anchor: "middle",
            variant: "full",
            prominence,
          })
        : "";
    return {
      shapes: `<g data-name="${escapeXml(region.label)}">${shapes}</g>`,
      shortLabel,
      fullLabel,
    };
  });
  const regions = regionParts.map(({ shapes }) => shapes).join("");
  const shortRegionLabels = regionParts
    .map(({ shortLabel }) => shortLabel)
    .join("");
  const fullRegionLabels = regionParts
    .map(({ fullLabel }) => fullLabel)
    .join("");
  const clippedRegions = `<g clip-path="url(#historical-land-clip)">${regions}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" role="img" aria-label="${escapeXml(spec.title)}" aria-describedby="map-desc"><desc id="map-desc">${escapeXml(`${spec.subtitle} ${spec.place}, ${spec.date}. Historical political geometry clipped to Natural Earth coastlines. Optional climate zones use Beck et al. 2018 normals for 1980–2016.`)}</desc><defs>${arrows}${mountainClipDefinitions.join("")}<clipPath id="historical-land-clip"><path d="${landPath}"/></clipPath></defs><style>${sharedStyle}${geographyStyle}${physicalStyle}</style>${composeLayers(baseLand, clippedRegions, shortRegionLabels, fullRegionLabels)}</svg>`;
}

export function createMapReport(
  spec: MapSpec,
  checks: MapCheck[],
  model: string,
  referenceCount: number,
  swatches: RenderSwatch[] = [],
) {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      generator: "Taktik Robot Map Maker",
      model,
      referenceCount,
      palette: swatches,
      spec,
      checks,
    },
    null,
    2,
  );
}
