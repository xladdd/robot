import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-50m.json" with { type: "json" };
import worldLand from "world-atlas/land-50m.json" with { type: "json" };
import naturalEarthWater from "./data/natural-earth-water.json" with { type: "json" };
import koppenClimate from "./data/koppen-climate.json" with { type: "json" };
import naturalEarthGeography from "./data/natural-earth-geography.json" with { type: "json" };

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
  projection: "schematic";
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
const mapPalette: Record<string, string> = {
  orange: "#ff9b66",
  teal: "#73d3cf",
  purple: "#aaa0ff",
  pink: "#ed98c0",
  green: "#86bf8d",
  yellow: "#f0ca68",
  blue: "#82b9e8",
  grey: "#c7c7c7",
  red: "#d76555",
  brown: "#a77b58",
};
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
  const spec: MapSpec = {
    version: 1,
    kind: "map",
    title,
    subtitle: text(raw.subtitle, 240),
    place,
    date,
    projection: "schematic",
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
          ? `${regions.length} mapped countries use Natural Earth 1:50m boundaries.`
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
      message: `${missingBoundaryRegions.map(({ label }) => label).join(", ")} ${missingBoundaryRegions.length === 1 ? "is" : "are"} classified in the data but not drawn separately by the Natural Earth 1:50m boundary dataset.`,
    });
  if (geometry === "historical" && regions.length > 12)
    checks.push({
      level: "warning",
      message: `${regions.length} filled historical territories were retained. Consider simplifying the map if the overview is visually crowded.`,
    });
  return { spec, checks };
}

export function renderMapSvg(spec: MapSpec, swatches: RenderSwatch[] = []) {
  const canvas = { x: 0, y: 0, width: 1000, height: 700 };
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
  }) =>
    `<text x="${x}" y="${y}" class="${className}" text-anchor="${anchor}" data-map-label-key="${escapeXml(key)}" data-map-label-kind="${kind}" data-map-label-variant="${variant}" data-map-label-rank="${rank}" data-map-label-prominence="${prominence.toFixed(3)}" data-map-label-required="${required}" data-map-label-root-x="${rootX}" data-map-label-root-y="${rootY}" data-map-label-base-x="${x}" data-map-label-base-y="${y}">${escapeXml(label)}</text>`;

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
  const projection = geoMercator()
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
  const arrows =
    `<filter id="climate-soften" x="-2%" y="-2%" width="104%" height="104%"><feGaussianBlur stdDeviation=".48"/></filter>` +
    spec.categories
      .map(
        (category, index) =>
          `<marker id="arrow-${index}" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${swatches.length ? swatches[index % swatches.length].hex : mapPalette[category.color]}"/></marker>`,
      )
      .join("");
  const midLatitude = (spec.viewport.south + spec.viewport.north) / 2;
  const viewportKilometres =
    (spec.viewport.east - spec.viewport.west) *
    111.32 *
    Math.cos((midLatitude * Math.PI) / 180);
  const scaleKilometres =
    viewportKilometres > 5000
      ? 1000
      : viewportKilometres > 2000
        ? 500
        : viewportKilometres > 800
          ? 200
          : 100;
  const scaleWidth = Math.max(
    70,
    Math.min(220, (scaleKilometres / viewportKilometres) * canvas.width),
  );
  const ornaments = `${spec.showNorthArrow ? `<g class="north" transform="translate(952 54)"><path d="M0,24 L10,0 L20,24 L10,18 Z" fill="#1a1a1a"/><text x="10" y="-7" text-anchor="middle">N</text></g>` : ""}${spec.showScaleBar ? `<g class="scale" transform="translate(${950 - scaleWidth} 660)"><rect width="${scaleWidth}" height="8" fill="#fff" stroke="#1a1a1a"/><rect width="${scaleWidth / 2}" height="8" fill="#1a1a1a"/><text x="${scaleWidth / 2}" y="-6" text-anchor="middle">${scaleKilometres.toLocaleString("en")} km</text></g>` : ""}`;
  const sharedStyle = `text{font-family:Verdana,Geneva,sans-serif;fill:#1a1a1a}.map-label{font-size:6px;font-weight:400;paint-order:stroke;stroke:#fff;stroke-width:1.6px;stroke-linejoin:round}.label-short{display:none}.free-label,.feature-label{font-size:7px;font-weight:400;paint-order:stroke;stroke:#fff;stroke-width:1.8px}.free-label.water{font-size:7.5px;fill:#256a86;font-style:italic}.base-land path{fill:#eeeeec;stroke:#777;stroke-width:.7;stroke-linejoin:round}.regions path{stroke:#1a1a1a;stroke-width:.8;stroke-linejoin:round}.feature.area{stroke:#1a1a1a;stroke-width:1;fill-opacity:.42}.feature.line,.feature.route{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.feature.river{stroke-width:2}.feature.mountain{stroke-dasharray:2 4;stroke-width:5}.feature.route{stroke-width:4}.coast-overlay path{fill:none;stroke:#555;stroke-width:.7}.north text,.scale text{font-size:7px;font-weight:400}`;
  const geographyStyle = `.natural-terrain path{stroke:none;fill-opacity:.32}.terrain-desert{fill:#e3b85f}.terrain-plateau{fill:#ad8b64}.terrain-plain{fill:#9fc98d}.terrain-basin{fill:#8db5a1}.natural-mountains path{fill:#8b6a52;fill-opacity:.3;stroke:#654936;stroke-width:.45}.natural-mountains text,.natural-cities text{font-size:6px;font-weight:400;paint-order:stroke;stroke:#fff;stroke-width:1.6px;stroke-linejoin:round}.natural-mountains text{fill:#654936;font-style:italic}.disputed-boundaries path{fill:none;stroke:#d35a40;stroke-width:1.2;stroke-dasharray:4 2}.natural-cities circle{fill:#1a1a1a;stroke:#fff;stroke-width:.6}`;
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
  const climateZones = (
    koppenClimate.runs as Array<[string, number, number, number, number]>
  )
    .map(([group, west, south, east, north]) => {
      if (
        east < spec.viewport.west ||
        west > spec.viewport.east ||
        north < spec.viewport.south ||
        south > spec.viewport.north
      )
        return "";
      const topLeft = projection([west, north]),
        bottomRight = projection([east, south]);
      if (!topLeft || !bottomRight) return "";
      const color =
        koppenClimate.groups[group as keyof typeof koppenClimate.groups].color;
      return `<rect class="climate-${group}" x="${topLeft[0].toFixed(2)}" y="${topLeft[1].toFixed(2)}" width="${Math.max(0, bottomRight[0] - topLeft[0]).toFixed(2)}" height="${Math.max(0, bottomRight[1] - topLeft[1]).toFixed(2)}" fill="${color}"/>`;
    })
    .join("");
  const lakeLayer = layer("lakes", "Lakes", lakes, "natural-lakes");
  const riverLayer = layer("rivers", "Rivers", rivers, "natural-rivers");
  const climateLayer = `<g id="climate-zones" data-name="Climate zones (Köppen–Geiger, 1980–2016)" class="climate-zones" style="filter:url(#climate-soften)" aria-label="Köppen–Geiger climate zones, 1980–2016">${climateZones}</g>`;
  const terrain = naturalEarthGeography.terrain
    .map(
      ({ geometry, kind, name }) =>
        `<path d="${path(geometry as GeoJSON.Geometry) || ""}" class="terrain-${kind.toLowerCase()}" data-name="${escapeXml(name)}"/>`,
    )
    .join("");
  const mountains = naturalEarthGeography.mountains
    .map(({ geometry, name, rank }, mountainIndex) => {
      const mapGeometry = geometry as GeoJSON.Geometry,
        [x, y] = path.centroid(mapGeometry);
      const label =
        name && Number.isFinite(x) && Number.isFinite(y)
          ? mapLabel({
              key: `mountain-${mountainIndex}`,
              label: name,
              kind: "mountain",
              rootX: x,
              rootY: y,
              className: "mountain-label",
              anchor: "middle",
              rank,
              prominence: path.area(mapGeometry),
            })
          : "";
      return `<g class="mountain-rank-${rank}" data-name="${escapeXml(name)}"><path d="${path(mapGeometry) || ""}"/>${label}</g>`;
    })
    .join("");
  const disputed = naturalEarthGeography.disputed
    .map(
      ({ geometry, name }) =>
        `<path d="${path(geometry as GeoJSON.Geometry) || ""}" data-name="${escapeXml(name)}"/>`,
    )
    .join("");
  const cities = naturalEarthGeography.cities
    .map(({ geometry, name, rank }, cityIndex) => {
      const position = projection(
        (geometry as GeoJSON.Point).coordinates as [number, number],
      );
      return position
        ? `<g class="city-rank-${rank}" data-name="${escapeXml(name)}" transform="translate(${position[0]} ${position[1]})"><circle r="1.7"/>${mapLabel({ key: `city-${cityIndex}`, label: name, kind: "city", rootX: position[0] + 4, rootY: position[1] + 2, x: 4, y: 2, className: "city-label", rank })}</g>`
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
      `${layer("land", "Land", baseLand, "base-land")}${lakeLayer}`,
    );
    const politicalGeography = layer(
      "political-geography",
      "Political geography",
      `${layer("countries-borders", "Countries and borders", countries, "regions")}${disputedLayer}`,
    );
    const thematicOverlays = layer(
      "thematic-overlays",
      "Thematic overlays",
      `${terrainLayer}${climateLayer}${mountainLayer}${riverLayer}`,
    );
    const labelLayers = layer(
      "labels",
      "Labels",
      `${cityLayer}<g id="country-abbreviations" data-name="Country abbreviations">${shortLabels}</g>${layer("country-names", "Country names", fullLabels)}${layer("geographic-labels", "Geographic labels", freeLabels)}`,
    );
    return `${layer("seas-oceans", "Seas and oceans", `<rect width="1000" height="700" fill="#eaf6fa"/>`)}${baseGeography}${politicalGeography}${thematicOverlays}${layer("map-features", "Map features", featureMarkup)}${labelLayers}${layer("coastline", "Coastline", baseLand, "coast-overlay")}${layer("map-ornaments", "Map ornaments", ornaments)}`;
  };
  if (spec.geometry === "countries") {
    const atlas = feature(
      worldAtlas as never,
      worldAtlas.objects.countries as never,
    ) as unknown as GeoJSON.FeatureCollection<
      GeoJSON.Geometry,
      { name?: string }
    >;
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
    const regionForFeature = (item: GeoJSON.Feature) =>
      regionById.get(item.id == null ? "" : String(item.id).padStart(3, "0")) ||
      regionByName.get(String(item.properties?.name || ""));
    const selected = {
      type: "FeatureCollection",
      features: atlas.features.filter(regionForFeature),
    } as GeoJSON.FeatureCollection;
    const baseLand = atlas.features
      .map((item) => `<path d="${path(item) || ""}"/>`)
      .join("");
    const shapes = selected.features
      .map((item) => {
        const id = item.id == null ? "" : String(item.id).padStart(3, "0"),
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
        return `<path d="${path(item) || ""}" fill="${fill}"${id ? ` data-iso-numeric="${id}"` : ` data-map-unit="${escapeXml(region.atlasName)}"`}/>`;
      })
      .join("");
    const labelParts = selected.features.map((item) => {
      const region = regionForFeature(item)!;
      const [x, y] = path.centroid(item);
      const key = `country-${
        item.id == null
          ? region.atlasName || region.label
          : String(item.id).padStart(3, "0")
      }`;
      const prominence = path.area(item);
      return Number.isFinite(x) && Number.isFinite(y)
        ? {
            short: mapLabel({
              key,
              label: shortMapLabel(region.label),
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
              label: region.label,
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
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" role="img" aria-label="${escapeXml(spec.title)}" aria-describedby="map-desc"><desc id="map-desc">${escapeXml(`${spec.subtitle} ${spec.place}, ${spec.date}. Country boundaries from Natural Earth. Optional climate zones use Beck et al. 2018 normals for 1980–2016.`)}</desc><defs>${arrows}</defs><style>${sharedStyle}${geographyStyle}.natural-lakes path{fill:#eaf6fa;stroke:#69a9c0;stroke-width:.45}.natural-rivers path{fill:none;stroke:#69a9c0;stroke-width:.45;stroke-linecap:round;stroke-linejoin:round}.climate-zones{opacity:.58;pointer-events:none}.climate-zones rect{stroke:none}</style>${composeLayers(baseLand, shapes, shortLabels, fullLabels)}</svg>`;
  }
  const land = feature(
    worldLand as never,
    worldLand.objects.land as never,
  ) as unknown as GeoJSON.Feature<GeoJSON.Geometry>;
  const landPath = path(land) || "";
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
            label: shortMapLabel(region.label),
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
            label: region.label,
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" role="img" aria-label="${escapeXml(spec.title)}" aria-describedby="map-desc"><desc id="map-desc">${escapeXml(`${spec.subtitle} ${spec.place}, ${spec.date}. Historical political geometry clipped to Natural Earth coastlines. Optional climate zones use Beck et al. 2018 normals for 1980–2016.`)}</desc><defs>${arrows}<clipPath id="historical-land-clip"><path d="${landPath}"/></clipPath></defs><style>${sharedStyle}${geographyStyle}.natural-lakes path{fill:#eaf6fa;stroke:#69a9c0;stroke-width:.45}.natural-rivers path{fill:none;stroke:#69a9c0;stroke-width:.45;stroke-linecap:round;stroke-linejoin:round}.climate-zones{opacity:.58;pointer-events:none}.climate-zones rect{stroke:none}</style>${composeLayers(baseLand, clippedRegions, shortRegionLabels, fullRegionLabels)}</svg>`;
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
