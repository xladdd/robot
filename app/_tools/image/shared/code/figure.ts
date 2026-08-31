export type FigureKind = "line" | "bar";

export type FigureSource = {
  id: string;
  title: string;
  url: string;
};

export type FigureSeries = {
  label: string;
  values: number[];
  sourceIds: string[];
};

export type FigureSpec = {
  version: 1;
  kind: FigureKind;
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  unit: string;
  categories: string[];
  series: FigureSeries[];
  sources: FigureSource[];
  notes: string[];
};

export type FigureCheck = { level: "pass" | "warning"; message: string };

export type DiagramPoint = { x: number; y: number };
export type DiagramStructure = {
  label: string;
  description: string;
  shape: "ellipse" | "circle" | "dots" | "vacuole";
  x: number;
  y: number;
  width: number;
  height: number;
  labelX: number;
  labelY: number;
  color: string;
};
export type DiagramSpec = {
  version: 1;
  kind: "biology";
  title: string;
  subtitle: string;
  subject: string;
  outline: DiagramPoint[];
  structures: DiagramStructure[];
  notes: string[];
  referenceSummary: string;
};

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
  labels: Array<{ label: string; kind: "place" | "water"; lon: number; lat: number }>;
  viewport: { west: number; south: number; east: number; north: number };
  showScaleBar: boolean;
  showNorthArrow: boolean;
  sources: MapSource[];
  notes: string[];
  referenceSummary: string;
};

const MAX_CATEGORIES = 24;
const MAX_SERIES = 6;
const palette = ["#ff661a", "#00a5a0", "#6b5cff", "#d53f8c", "#3d7c47", "#9a6700"];
const diagramColors = new Set(["orange", "teal", "purple", "pink", "green", "yellow", "blue", "grey"]);
const diagramPalette: Record<string, string> = { orange: "#ff9b66", teal: "#73d3cf", purple: "#aaa0ff", pink: "#ed98c0", green: "#86bf8d", yellow: "#f0ca68", blue: "#82b9e8", grey: "#c7c7c7" };
const mapColors = new Set(["orange", "teal", "purple", "pink", "green", "yellow", "blue", "grey", "red", "brown"]);
const mapPalette: Record<string, string> = { ...diagramPalette, red: "#d76555", brown: "#a77b58" };
export type RenderSwatch = { name: string; hex: string; model?: string; values?: number[]; group?: string };

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function shortMapLabel(label: string) {
  const words = label.replace(/\([^)]*\)/g, " ").split(/[^\p{L}\p{N}]+/u).filter(Boolean).filter((word) => !/^(of|the|and)$/i.test(word));
  if (words.length > 1) return words.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
  return [...(words[0] || label)].slice(0, 2).join("").toUpperCase();
}

function numberLabel(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

export function validateFigureSpec(input: unknown): { spec: FigureSpec; checks: FigureCheck[] } {
  if (!input || typeof input !== "object") throw new Error("The model did not return a figure specification.");
  const raw = input as Record<string, unknown>;
  const kind = raw.kind === "bar" ? "bar" : raw.kind === "line" ? "line" : null;
  if (!kind) throw new Error("Only line and bar charts are supported in this release.");
  const categories = Array.isArray(raw.categories) ? raw.categories.map((value) => text(value, 48)).filter(Boolean) : [];
  if (categories.length < 2 || categories.length > MAX_CATEGORIES) throw new Error(`Use between 2 and ${MAX_CATEGORIES} categories.`);
  if (new Set(categories).size !== categories.length) throw new Error("Category labels must be unique.");

  const rawSources = Array.isArray(raw.sources) ? raw.sources : [];
  const sources = rawSources.map((value) => {
    const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { id: text(source.id, 40), title: text(source.title, 160), url: text(source.url, 500) };
  });
  if (!sources.length || sources.some((source) => !source.id || !source.title)) throw new Error("Every figure needs at least one named source.");
  if (new Set(sources.map(({ id }) => id)).size !== sources.length) throw new Error("Source IDs must be unique.");
  for (const source of sources) {
    if (source.url && !/^https?:\/\//i.test(source.url)) throw new Error(`Source ${source.id} must use an HTTP or HTTPS URL.`);
  }
  const sourceIds = new Set(sources.map(({ id }) => id));

  const rawSeries = Array.isArray(raw.series) ? raw.series : [];
  if (!rawSeries.length || rawSeries.length > MAX_SERIES) throw new Error(`Use between 1 and ${MAX_SERIES} data series.`);
  const series = rawSeries.map((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const values = Array.isArray(item.values) ? item.values.map(Number) : [];
    const itemSourceIds = Array.isArray(item.sourceIds) ? item.sourceIds.map((id) => text(id, 40)).filter(Boolean) : [];
    if (!text(item.label, 80)) throw new Error("Every series needs a label.");
    if (values.length !== categories.length || values.some((number) => !Number.isFinite(number))) throw new Error("Every series must contain one finite number per category.");
    if (!itemSourceIds.length || itemSourceIds.some((id) => !sourceIds.has(id))) throw new Error("Every series must cite one or more declared source IDs.");
    return { label: text(item.label, 80), values, sourceIds: [...new Set(itemSourceIds)] };
  });

  const title = text(raw.title, 160);
  if (!title) throw new Error("The figure needs a title.");
  const spec: FigureSpec = {
    version: 1,
    kind,
    title,
    subtitle: text(raw.subtitle, 240),
    xLabel: text(raw.xLabel, 80),
    yLabel: text(raw.yLabel, 80),
    unit: text(raw.unit, 40),
    categories,
    series,
    sources,
    notes: Array.isArray(raw.notes) ? raw.notes.map((note) => text(note, 240)).filter(Boolean).slice(0, 8) : [],
  };
  const values = series.flatMap(({ values: row }) => row);
  const checks: FigureCheck[] = [
    { level: "pass", message: `${values.length} numeric values are finite and dimensionally complete.` },
    { level: "pass", message: `Every series cites a declared source.` },
    { level: "pass", message: `SVG geometry will be calculated deterministically from the validated values.` },
  ];
  if (Math.min(...values) < 0 && Math.max(...values) > 0) checks.push({ level: "warning", message: "The data crosses zero; inspect the axis and interpretation carefully." });
  if (sources.some(({ url }) => !url)) checks.push({ level: "warning", message: "One or more sources has no URL. Verify the bibliographic reference manually." });
  return { spec, checks };
}

export function renderFigureSvg(spec: FigureSpec, swatches: RenderSwatch[] = []) {
  const colors = swatches.length ? swatches.map(({ hex }) => hex) : palette;
  const width = 1000;
  const height = 680;
  const plot = { x: 110, y: 150, width: 820, height: 390 };
  const allValues = spec.series.flatMap(({ values }) => values);
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const min = Math.min(0, rawMin);
  const max = Math.max(0, rawMax);
  const span = max - min || 1;
  const y = (value: number) => plot.y + plot.height - ((value - min) / span) * plot.height;
  const zeroY = y(0);
  const categoryStep = plot.width / spec.categories.length;
  const grid = Array.from({ length: 6 }, (_, index) => {
    const value = min + (span * index) / 5;
    const py = y(value);
    return `<line x1="${plot.x}" y1="${py}" x2="${plot.x + plot.width}" y2="${py}" stroke="#d7d7d7"/><text x="${plot.x - 14}" y="${py + 4}" text-anchor="end" class="tick">${escapeXml(numberLabel(value))}</text>`;
  }).join("");
  const categoryLabels = spec.categories.map((label, index) => `<text x="${plot.x + categoryStep * (index + .5)}" y="${plot.y + plot.height + 28}" text-anchor="middle" class="tick">${escapeXml(label)}</text>`).join("");
  const marks = spec.kind === "line"
    ? spec.series.map((series, seriesIndex) => {
        const points = series.values.map((value, index) => `${plot.x + categoryStep * (index + .5)},${y(value)}`).join(" ");
        const dots = series.values.map((value, index) => `<circle cx="${plot.x + categoryStep * (index + .5)}" cy="${y(value)}" r="5" fill="${colors[seriesIndex % colors.length]}"/>`).join("");
        return `<polyline points="${points}" fill="none" stroke="${colors[seriesIndex % colors.length]}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
      }).join("")
    : spec.series.map((series, seriesIndex) => {
        const groupWidth = categoryStep * .72;
        const barWidth = groupWidth / spec.series.length;
        return series.values.map((value, index) => {
          const px = plot.x + categoryStep * index + (categoryStep - groupWidth) / 2 + seriesIndex * barWidth;
          const py = Math.min(y(value), zeroY);
          return `<rect x="${px}" y="${py}" width="${Math.max(2, barWidth - 3)}" height="${Math.max(1, Math.abs(zeroY - y(value)))}" fill="${colors[seriesIndex % colors.length]}"/>`;
        }).join("");
      }).join("");
  const legend = spec.series.map((series, index) => `<g transform="translate(${plot.x + index * 150} 112)"><rect width="18" height="8" y="-7" fill="${colors[index % colors.length]}"/><text x="27" class="legend">${escapeXml(series.label)}</text></g>`).join("");
  const sourceLine = spec.sources.map(({ id, title }) => `${id}: ${title}`).join(" · ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="figure-title figure-desc"><title id="figure-title">${escapeXml(spec.title)}</title><desc id="figure-desc">${escapeXml(spec.subtitle || `${spec.kind} chart`)}</desc><style>text{font-family:Verdana,Geneva,sans-serif;fill:#1a1a1a}.title{font-size:30px;font-weight:700}.subtitle{font-size:14px;fill:#666}.tick{font-size:11px}.legend{font-size:12px}.axis-label{font-size:13px;font-weight:700}.source{font-size:9px;fill:#666}</style><rect width="1000" height="680" fill="#fff"/><text id="figure-title-text" x="${plot.x}" y="55" class="title">${escapeXml(spec.title)}</text><text x="${plot.x}" y="82" class="subtitle">${escapeXml(spec.subtitle)}</text>${legend}${grid}<line x1="${plot.x}" y1="${zeroY}" x2="${plot.x + plot.width}" y2="${zeroY}" stroke="#1a1a1a" stroke-width="1.5"/>${marks}${categoryLabels}<text x="${plot.x + plot.width / 2}" y="${plot.y + plot.height + 62}" text-anchor="middle" class="axis-label">${escapeXml(spec.xLabel)}</text><text transform="translate(34 ${plot.y + plot.height / 2}) rotate(-90)" text-anchor="middle" class="axis-label">${escapeXml(`${spec.yLabel}${spec.unit ? ` (${spec.unit})` : ""}`)}</text><text x="${plot.x}" y="640" class="source">Sources: ${escapeXml(sourceLine)}</text></svg>`;
}

export function createFigureReport(spec: FigureSpec, checks: FigureCheck[], model: string, swatches: RenderSwatch[] = []) {
  return JSON.stringify({ generatedAt: new Date().toISOString(), generator: "Taktik Robot Figure Generator", model, palette: swatches, spec, checks }, null, 2);
}

function boundedNumber(value: unknown, name: string, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return number;
}

function polygonArea(points: MapPoint[]) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.lon * next.lat - next.lon * point.lat;
  }, 0)) / 2;
}

export function validateDiagramSpec(input: unknown): { spec: DiagramSpec; checks: FigureCheck[] } {
  if (!input || typeof input !== "object") throw new Error("The model did not return a diagram specification.");
  const raw = input as Record<string, unknown>;
  if (raw.kind !== "biology") throw new Error("Only biological diagrams are supported in diagram mode.");
  const rawOutline = Array.isArray(raw.outline) ? raw.outline : [];
  if (rawOutline.length < 8 || rawOutline.length > 32) throw new Error("The subject outline must contain between 8 and 32 points.");
  let normalizedCoordinates = 0;
  const diagramNumber = (value: unknown, name: string, min: number, max: number) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min - 25 || number > max + 25) throw new Error(`${name} must be between ${min} and ${max}.`);
    const normalized = Math.min(max, Math.max(min, number));
    if (normalized !== number) normalizedCoordinates += 1;
    return normalized;
  };
  const outline = rawOutline.map((value, index) => {
    const point = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { x: diagramNumber(point.x, `Outline point ${index + 1} x`, 8, 92), y: diagramNumber(point.y, `Outline point ${index + 1} y`, 8, 92) };
  });
  const rawStructures = Array.isArray(raw.structures) ? raw.structures : [];
  if (rawStructures.length < 1 || rawStructures.length > 14) throw new Error("Use between 1 and 14 labelled structures.");
  const structures: DiagramStructure[] = rawStructures.map((value, index): DiagramStructure => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const shape: DiagramStructure["shape"] | null = item.shape === "circle" || item.shape === "dots" || item.shape === "vacuole" ? item.shape : item.shape === "ellipse" ? "ellipse" : null;
    if (!shape) throw new Error(`Structure ${index + 1} uses an unsupported shape.`);
    const label = text(item.label, 80);
    if (!label) throw new Error(`Structure ${index + 1} needs a label.`);
    const color = text(item.color, 20).toLowerCase();
    if (!diagramColors.has(color)) throw new Error(`Structure ${index + 1} uses an unsupported colour.`);
    return { label, description: text(item.description, 180), shape, x: diagramNumber(item.x, `${label} x`, 5, 95), y: diagramNumber(item.y, `${label} y`, 8, 92), width: diagramNumber(item.width, `${label} width`, 2, 85), height: diagramNumber(item.height, `${label} height`, 2, 85), labelX: diagramNumber(item.labelX, `${label} label x`, 1, 99), labelY: diagramNumber(item.labelY, `${label} label y`, 2, 98), color };
  });
  const title = text(raw.title, 160);
  const subject = text(raw.subject, 100);
  if (!title || !subject) throw new Error("The diagram needs a title and subject.");
  const spec: DiagramSpec = { version: 1, kind: "biology", title, subtitle: text(raw.subtitle, 240), subject, outline, structures, notes: Array.isArray(raw.notes) ? raw.notes.map((note) => text(note, 240)).filter(Boolean).slice(0, 8) : [], referenceSummary: text(raw.referenceSummary, 300) };
  const checks: FigureCheck[] = [
    { level: "pass", message: `${structures.length} labelled structures use the controlled biological SVG vocabulary.` },
    { level: "pass", message: "All geometry is finite, bounded, and rendered without executable SVG content." },
    { level: "warning", message: "Biological labels are model-generated and require editorial or subject-expert verification." },
  ];
  if (normalizedCoordinates) checks.splice(2, 0, { level: "pass", message: `${normalizedCoordinates} model coordinate${normalizedCoordinates === 1 ? " was" : "s were"} normalized to the safe diagram canvas.` });
  return { spec, checks };
}

function smoothClosedPath(points: DiagramPoint[], x: number, y: number, width: number, height: number) {
  const scaled = points.map((point) => ({ x: x + point.x / 100 * width, y: y + point.y / 100 * height }));
  return scaled.map((point, index) => {
    const next = scaled[(index + 1) % scaled.length];
    return `${index ? "" : `M ${point.x} ${point.y} `}Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`;
  }).join(" ") + " Z";
}

function organicShapePath(cx: number, cy: number, width: number, height: number, seed: number) {
  const count = 14;
  const points = Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    const variation = 1 + .075 * Math.sin(angle * 3 + seed * 1.71) + .045 * Math.cos(angle * 5 - seed * .93);
    return { x: cx + Math.cos(angle) * width / 2 * variation, y: cy + Math.sin(angle) * height / 2 * variation };
  });
  const start = { x: (points.at(-1)!.x + points[0].x) / 2, y: (points.at(-1)!.y + points[0].y) / 2 };
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} ` + points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return `Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${((point.x + next.x) / 2).toFixed(2)} ${((point.y + next.y) / 2).toFixed(2)}`;
  }).join(" ") + " Z";
}

export function renderDiagramSvg(spec: DiagramSpec, swatches: RenderSwatch[] = []) {
  const canvas = { x: 135, y: 125, width: 730, height: 470 };
  const px = (value: number) => canvas.x + value / 100 * canvas.width;
  const py = (value: number) => canvas.y + value / 100 * canvas.height;
  const normalizedLabel = (label: string) => label.toLowerCase().replace(/[^a-z]/g, "");
  const semanticRole = (label: string) => {
    const normalized = normalizedLabel(label);
    if (/cytoplasm|cytosol/.test(normalized)) return "cytoplasm";
    if (/membrane|cellwall|outerboundary/.test(normalized)) return "membrane";
    if (/pseudopod/.test(normalized)) return "pseudopodia";
    return null;
  };
  const outlinePoints = spec.outline.map(({ x, y }) => ({ x: px(x), y: py(y) }));
  const cytoplasmIndex = spec.structures.findIndex((item) => semanticRole(item.label) === "cytoplasm");
  const subjectFill = cytoplasmIndex >= 0 ? (swatches.length ? swatches[cytoplasmIndex % swatches.length].hex : diagramPalette[spec.structures[cytoplasmIndex].color]) : "#dff3e4";
  const leader = (item: DiagramStructure, targetX: number, targetY: number) => {
    const labelX = px(item.labelX), labelY = py(item.labelY);
    const anchor = labelX < targetX ? "end" : "start";
    const lineEnd = labelX + (anchor === "end" ? 8 : -8);
    const elbowX = targetX + (lineEnd - targetX) * .55;
    return `<circle cx="${targetX}" cy="${targetY}" r="3" fill="#1a1a1a"/><path d="M ${targetX} ${targetY} L ${elbowX} ${labelY - 4} L ${lineEnd} ${labelY - 4}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/><text x="${labelX}" y="${labelY}" text-anchor="${anchor}" class="label">${escapeXml(item.label)}</text>`;
  };
  const structures = spec.structures.map((item, index) => {
    const role = semanticRole(item.label);
    const x = px(item.x), y = py(item.y), width = item.width / 100 * canvas.width, height = item.height / 100 * canvas.height;
    const fill = swatches.length ? swatches[index % swatches.length].hex : diagramPalette[item.color];
    if (role) {
      let target = { x, y };
      if (role === "membrane" || role === "pseudopodia") {
        const labelX = px(item.labelX), labelY = py(item.labelY);
        const candidates = role === "pseudopodia"
          ? outlinePoints.filter((point) => labelX < canvas.x + canvas.width / 2 ? point.x < canvas.x + canvas.width / 2 : point.x >= canvas.x + canvas.width / 2)
          : outlinePoints;
        target = candidates.reduce((best, point) => Math.hypot(point.x - labelX, point.y - labelY) < Math.hypot(best.x - labelX, best.y - labelY) ? point : best, candidates[0] || outlinePoints[0]);
      }
      if (role === "cytoplasm") target = { x: canvas.x + canvas.width * .58, y: canvas.y + canvas.height * .58 };
      return `<g id="structure-${index + 1}" data-structural-role="${role}">${leader(item, target.x, target.y)}</g>`;
    }
    const organicPath = organicShapePath(x, y, width, item.shape === "circle" ? width : height, index + 1);
    const shape = item.shape === "dots"
      ? Array.from({ length: 7 }, (_, dot) => { const angle = dot * 2.399; const radius = Math.sqrt(dot) * Math.min(width, height) / 5; return `<circle cx="${x + Math.cos(angle) * radius}" cy="${y + Math.sin(angle) * radius}" r="4" fill="${fill}" stroke="#1a1a1a" stroke-width="1"/>`; }).join("")
      : item.shape === "vacuole"
        ? `<path d="${organicPath}" fill="${fill}" fill-opacity=".45" stroke="#1a1a1a" stroke-width="2"/><path d="${organicShapePath(x, y, width * .62, height * .62, index + 17)}" fill="#fff" fill-opacity=".45"/>`
        : `<path d="${organicPath}" fill="${fill}" stroke="#1a1a1a" stroke-width="2" stroke-linejoin="round"/>`;
    return `<g id="structure-${index + 1}">${shape}${leader(item, x, y)}</g>`;
  }).join("");
  const outline = smoothClosedPath(spec.outline, canvas.x, canvas.y, canvas.width, canvas.height);
  const displayTitle = spec.title.replace(/^\s*(?:a\s+)?(?:labelled\s+)?schematic\s+(?:diagram|drawing|illustration)\s+of\s+(?:an?\s+|the\s+)?/i, "").trim() || spec.title;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" role="img" aria-labelledby="diagram-title diagram-desc"><title id="diagram-title">${escapeXml(displayTitle)}</title><desc id="diagram-desc">${escapeXml(spec.subtitle || spec.subject)}</desc><style>text{font-family:Verdana,Geneva,sans-serif;fill:#1a1a1a}.title{font-size:30px;font-weight:700}.label{font-size:13px;font-weight:700}</style><rect width="1000" height="700" fill="#fff"/><text x="500" y="60" text-anchor="middle" class="title">${escapeXml(displayTitle)}</text><path d="${outline}" fill="${subjectFill}" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/>${structures}</svg>`;
}

export function createDiagramReport(spec: DiagramSpec, checks: FigureCheck[], model: string, referenceCount: number, swatches: RenderSwatch[] = []) {
  return JSON.stringify({ generatedAt: new Date().toISOString(), generator: "Taktik Robot Biological Diagram Generator", model, referenceCount, palette: swatches, spec, checks }, null, 2);
}

export function validateMapSpec(input: unknown): { spec: MapSpec; checks: FigureCheck[] } {
  if (!input || typeof input !== "object") throw new Error("The model did not return a map specification.");
  const raw = input as Record<string, unknown>;
  if (raw.kind !== "map") throw new Error("The generated artifact is not a map.");
  const geometry = raw.geometry === "historical" ? "historical" : raw.geometry === "countries" ? "countries" : null;
  if (!geometry) throw new Error("The map must declare country-boundary or historical geometry.");
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).map((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { id: text(item.id, 40), title: text(item.title, 180), url: text(item.url, 500) };
  });
  if (!sources.length || sources.some(({ id, title, url }) => !id || !title || !/^https?:\/\//i.test(url))) throw new Error("Every map needs at least one named HTTP(S) source.");
  if (new Set(sources.map(({ id }) => id)).size !== sources.length) throw new Error("Map source IDs must be unique.");
  const sourceIds = new Set(sources.map(({ id }) => id));
  const categories = (Array.isArray(raw.categories) ? raw.categories : []).map((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const id = text(item.id, 40), label = text(item.label, 80), color = text(item.color, 20).toLowerCase();
    if (!id || !label || !mapColors.has(color)) throw new Error("Every map category needs a unique ID, label, and supported colour.");
    return { id, label, color };
  });
  if (!categories.length || categories.length > 10 || new Set(categories.map(({ id }) => id)).size !== categories.length) throw new Error("Use between 1 and 10 uniquely identified map categories.");
  const categoryIds = new Set(categories.map(({ id }) => id));
  const geoPoint = (value: unknown, name: string): MapPoint => {
    const point = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { lon: boundedNumber(point.lon, `${name} longitude`, -180, 180), lat: boundedNumber(point.lat, `${name} latitude`, -90, 90) };
  };
  const regions = (Array.isArray(raw.regions) ? raw.regions : []).map((value, regionIndex): MapRegion => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const label = text(item.label, 100), category = text(item.category, 40);
    if (!label || !categoryIds.has(category)) throw new Error(`Map region ${regionIndex + 1} needs a label and declared category.`);
    const isoNumeric = text(item.isoNumeric, 3);
    const atlasName = text(item.atlasName, 100);
    const polygons = (Array.isArray(item.polygons) ? item.polygons : []).map((polygon, polygonIndex) => {
      if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 80) throw new Error(`${label} polygon ${polygonIndex + 1} must contain 3–80 points.`);
      const points = polygon.map((point, pointIndex) => geoPoint(point, `${label} point ${pointIndex + 1}`));
      if (geometry === "historical" && polygonArea(points) < .05) throw new Error(`${label} polygon ${polygonIndex + 1} is collapsed or too small to map.`);
      return points;
    });
    if ((!/^\d{3}$/.test(isoNumeric) && !atlasName && !polygons.length) || polygons.length > 12) throw new Error(`${label} needs a three-digit ISO numeric code, a Natural Earth map-unit name, or custom historical polygons.`);
    const requestedSourceIds = Array.isArray(item.sourceIds) ? [...new Set(item.sourceIds.map((id) => text(id, 40)).filter(Boolean))] : [];
    const regionSourceIds = requestedSourceIds.filter((id) => sourceIds.has(id));
    if (!regionSourceIds.length) regionSourceIds.push(...sourceIds);
    return { label, category, isoNumeric, atlasName, polygons, labelLon: geometry === "countries" ? 0 : boundedNumber(item.labelLon, `${label} label longitude`, -180, 180), labelLat: geometry === "countries" ? 0 : boundedNumber(item.labelLat, `${label} label latitude`, -90, 90), sourceIds: regionSourceIds };
  });
  if (regions.length > 240 || (geometry === "countries" && !regions.length)) throw new Error("Country maps need 1–240 regions; overlay maps may use features instead.");
  const features: MapFeature[] = (Array.isArray(raw.features) ? raw.features : []).map((value, index): MapFeature | null => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const label = text(item.label, 100), kind = ["area", "line", "route", "point"].includes(String(item.kind)) ? item.kind as MapFeature["kind"] : null;
    const style = ["physical", "river", "mountain", "route", "city", "battle"].includes(String(item.style)) ? item.style as MapFeature["style"] : null;
    const category = text(item.category, 40);
    if (!label || !kind || !style || !categoryIds.has(category)) return null;
    const points = (Array.isArray(item.points) ? item.points : []).map((point, pointIndex) => geoPoint(point, `${label} point ${pointIndex + 1}`));
    const minimum = kind === "point" ? 1 : kind === "area" ? 3 : 2;
    if (points.length < minimum || points.length > 120) return null;
    const requestedSourceIds = Array.isArray(item.sourceIds) ? [...new Set(item.sourceIds.map((id) => text(id, 40)).filter(Boolean))] : [];
    const featureSourceIds = requestedSourceIds.filter((id) => sourceIds.has(id));
    if (!featureSourceIds.length) featureSourceIds.push(...sourceIds);
    return { label, kind, style, category, points, sourceIds: featureSourceIds };
  }).filter((feature): feature is MapFeature => feature !== null);
  if (features.length > 80) throw new Error("Use no more than 80 geographic features.");
  if (features.some(({ kind }) => kind === "route")) regions.splice(0, regions.length);
  const usedCategoryIds = new Set([...regions.map(({ category }) => category), ...features.map(({ category }) => category)]);
  categories.splice(0, categories.length, ...categories.filter(({ id }) => usedCategoryIds.has(id)));
  const labels: MapSpec["labels"] = (Array.isArray(raw.labels) ? raw.labels : []).map((value, index): MapSpec["labels"][number] => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const label = text(item.label, 100);
    const kind = item.kind === "water" ? "water" : item.kind === "place" ? "place" : null;
    if (!label || !kind) throw new Error(`Map label ${index + 1} needs text and a supported kind.`);
    return { label, kind, ...geoPoint(item, label) };
  });
  if (labels.length > 40) throw new Error("Use no more than 40 free-standing map labels.");
  const title = text(raw.title, 160), place = text(raw.place, 120), date = text(raw.date, 100);
  if (!title || !place || !date) throw new Error("The map needs a title, geographic scope, and explicit date or period.");
  if (geometry === "countries" && regions.some(({ isoNumeric, atlasName }) => !/^\d{3}$/.test(isoNumeric) && !atlasName)) throw new Error("Every region on a contemporary country map needs an ISO numeric code or Natural Earth map-unit name.");
  const atlasGeometries = worldAtlas.objects.countries.geometries as Array<{ id?: string; properties?: { name?: string } }>;
  const atlasIds = new Set(atlasGeometries.map(({ id }) => id).filter(Boolean));
  const atlasNames = new Set(atlasGeometries.map(({ properties }) => properties?.name).filter(Boolean));
  const missingBoundaryRegions = geometry === "countries" ? regions.filter(({ isoNumeric, atlasName }) => /^\d{3}$/.test(isoNumeric) ? !atlasIds.has(isoNumeric) : !atlasNames.has(atlasName)) : [];
  const viewportRaw = raw.viewport && typeof raw.viewport === "object" ? raw.viewport as Record<string, unknown> : {};
  const viewport = { west: boundedNumber(viewportRaw.west, "Viewport west", -180, 180), south: boundedNumber(viewportRaw.south, "Viewport south", -90, 90), east: boundedNumber(viewportRaw.east, "Viewport east", -180, 180), north: boundedNumber(viewportRaw.north, "Viewport north", -90, 90) };
  if (viewport.west >= viewport.east || viewport.south >= viewport.north) throw new Error("The geographic viewport bounds are invalid.");
  const spec: MapSpec = { version: 1, kind: "map", title, subtitle: text(raw.subtitle, 240), place, date, projection: "schematic", geometry, categories, regions, features, labels, viewport, showScaleBar: raw.showScaleBar === true, showNorthArrow: raw.showNorthArrow === true, sources, notes: Array.isArray(raw.notes) ? raw.notes.map((note) => text(note, 240)).filter(Boolean).slice(0, 8) : [], referenceSummary: text(raw.referenceSummary, 300) };
  const checks: FigureCheck[] = [
    { level: "pass", message: geometry === "countries" ? `${regions.length} mapped countries use Natural Earth 1:50m boundaries.` : `${regions.length} historical regions use bounded, non-executable polygon geometry.` },
    { level: "pass", message: "Every mapped region cites a declared web source." },
    { level: "pass", message: `Temporal scope is explicit: ${date}.` },
    { level: "warning", message: "Boundaries are schematic. Editorial review against the cited sources is required before publication." },
  ];
  if (missingBoundaryRegions.length) checks.push({ level: "warning", message: `${missingBoundaryRegions.map(({ label }) => label).join(", ")} ${missingBoundaryRegions.length === 1 ? "is" : "are"} classified in the data but not drawn separately by the Natural Earth 1:50m boundary dataset.` });
  if (geometry === "historical" && regions.length > 12) checks.push({ level: "warning", message: `${regions.length} filled historical territories were retained. Consider simplifying the map if the overview is visually crowded.` });
  return { spec, checks };
}

export function renderMapSvg(spec: MapSpec, swatches: RenderSwatch[] = []) {
  const canvas = { x: 0, y: 0, width: 1000, height: 700 };
  const layer = (id: string, name: string, content: string, className = "") => `<g id="${id}" data-name="${name}"${className ? ` class="${className}"` : ""}>${content}</g>`;
  const short = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
  const wrappedLines = (value: string, limit: number, maximum = 2) => {
    const words = value.trim().split(/\s+/); const lines: string[] = [];
    for (const word of words) {
      const current = lines.at(-1);
      if (!current || current.length + word.length + 1 > limit) lines.push(word);
      else lines[lines.length - 1] = `${current} ${word}`;
    }
    if (lines.length > maximum) lines.splice(maximum - 1, lines.length, short(lines.slice(maximum - 1).join(" "), limit));
    return lines;
  };
  const infoPanel = () => {
    const featureCategoryIds = new Set(spec.features.map(({ category }) => category));
    const legendCategories = featureCategoryIds.size ? spec.categories.filter(({ id }) => featureCategoryIds.has(id)) : spec.categories;
    const titleLines = wrappedLines(spec.title, 28), subtitleLines = wrappedLines(`${spec.subtitle}${spec.subtitle ? " · " : ""}${spec.date}`, 42);
    const legendY = 46 + titleLines.length * 21 + subtitleLines.length * 13;
    const rows = legendCategories.length + Math.min(spec.sources.length, 5);
    const height = legendY + rows * 20 + (spec.sources.length ? 26 : 10);
    const legend = legendCategories.map((category, index) => `<g transform="translate(22 ${legendY + index * 20})"><rect width="13" height="13" y="-10" fill="${swatches.length ? swatches[index % swatches.length].hex : mapPalette[category.color]}" stroke="#1a1a1a"/><text x="20" class="panel-row">${escapeXml(short(category.label, 36))}</text></g>`).join("");
    const sourceY = legendY + 13 + legendCategories.length * 20;
    const sources = spec.sources.slice(0, 5).map(({ title }, index) => `<text x="22" y="${sourceY + 18 + index * 20}" class="panel-source">${escapeXml(short(title, 54))}</text>`).join("");
    const title = titleLines.map((line, index) => `<tspan x="24" y="${40 + index * 21}">${escapeXml(line)}</tspan>`).join("");
    const subtitleStart = 47 + titleLines.length * 21;
    const subtitle = subtitleLines.map((line, index) => `<tspan x="24" y="${subtitleStart + index * 13}">${escapeXml(line)}</tspan>`).join("");
    return `<g class="info-panel"><rect x="14" y="14" width="310" height="${height}" rx="2"/><text class="panel-title">${title}</text><text class="panel-subtitle">${subtitle}</text>${legend}${spec.sources.length ? `<text x="22" y="${sourceY}" class="panel-heading">SOURCES</text>${sources}` : ""}</g>`;
  };
  const viewportGeometry: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[spec.viewport.west, spec.viewport.south], [spec.viewport.west, spec.viewport.north], [spec.viewport.east, spec.viewport.north], [spec.viewport.east, spec.viewport.south], [spec.viewport.west, spec.viewport.south]]] };
  const fittingGeometry = spec.viewport.east - spec.viewport.west >= 350 ? { type: "Sphere" as const } : viewportGeometry;
  const projection = geoMercator().fitExtent([[canvas.x, canvas.y], [canvas.x + canvas.width, canvas.y + canvas.height]], fittingGeometry).clipExtent([[canvas.x, canvas.y], [canvas.x + canvas.width, canvas.y + canvas.height]]);
  const path = geoPath(projection);
  const categoryById = new Map(spec.categories.map((category, index) => [category.id, { ...category, index }]));
  const featureMarkup = spec.features.map((item) => {
    const category = categoryById.get(item.category)!;
    const color = swatches.length ? swatches[category.index % swatches.length].hex : mapPalette[category.color];
    const coordinates = item.points.map(({ lon, lat }) => [lon, lat]);
    if (item.kind === "area") {
      const geometry: GeoJSON.Polygon = { type: "Polygon", coordinates: [[...coordinates, coordinates[0]]] };
      return `<path class="feature area ${item.style}" d="${path(geometry) || ""}" fill="${color}"/><text class="feature-label" x="${path.centroid(geometry)[0]}" y="${path.centroid(geometry)[1]}" text-anchor="middle">${escapeXml(item.label)}</text>`;
    }
    if (item.kind === "line" || item.kind === "route") {
      const geometry: GeoJSON.LineString = { type: "LineString", coordinates };
      const last = projection(coordinates[coordinates.length - 1] as [number, number]);
      return `<path class="feature ${item.kind} ${item.style}" d="${path(geometry) || ""}" stroke="${color}"${item.kind === "route" ? ` marker-end="url(#arrow-${category.index})"` : ""}/>${item.kind === "line" && last ? `<text class="feature-label" x="${last[0] + 6}" y="${last[1] - 6}">${escapeXml(item.label)}</text>` : ""}`;
    }
    const position = projection(coordinates[0] as [number, number]);
    if (!position) return "";
    return `<g class="feature point ${item.style}" transform="translate(${position[0]} ${position[1]})">${item.style === "battle" ? `<path d="M-6,-6 L6,6 M6,-6 L-6,6" stroke="${color}" stroke-width="3"/>` : `<circle r="4" fill="${color}" stroke="#fff" stroke-width="1.5"/>`}<text class="feature-label" x="8" y="-7">${escapeXml(item.label)}</text></g>`;
  }).join("");
  const freeLabels = spec.labels.map(({ label, kind, lon, lat }) => {
    const position = projection([lon, lat]);
    return position ? `<text x="${position[0]}" y="${position[1]}" class="free-label ${kind}" text-anchor="middle">${escapeXml(label)}</text>` : "";
  }).join("");
  const arrows = `<filter id="climate-soften" x="-2%" y="-2%" width="104%" height="104%"><feGaussianBlur stdDeviation=".48"/></filter>` + spec.categories.map((category, index) => `<marker id="arrow-${index}" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="${swatches.length ? swatches[index % swatches.length].hex : mapPalette[category.color]}"/></marker>`).join("");
  const midLatitude = (spec.viewport.south + spec.viewport.north) / 2;
  const viewportKilometres = (spec.viewport.east - spec.viewport.west) * 111.32 * Math.cos(midLatitude * Math.PI / 180);
  const scaleKilometres = viewportKilometres > 5000 ? 1000 : viewportKilometres > 2000 ? 500 : viewportKilometres > 800 ? 200 : 100;
  const scaleWidth = Math.max(70, Math.min(220, scaleKilometres / viewportKilometres * canvas.width));
  const ornaments = `${spec.showNorthArrow ? `<g class="north" transform="translate(952 54)"><path d="M0,24 L10,0 L20,24 L10,18 Z" fill="#1a1a1a"/><text x="10" y="-7" text-anchor="middle">N</text></g>` : ""}${spec.showScaleBar ? `<g class="scale" transform="translate(${950 - scaleWidth} 660)"><rect width="${scaleWidth}" height="8" fill="#fff" stroke="#1a1a1a"/><rect width="${scaleWidth / 2}" height="8" fill="#1a1a1a"/><text x="${scaleWidth / 2}" y="-6" text-anchor="middle">${scaleKilometres.toLocaleString("en")} km</text></g>` : ""}`;
  const sharedStyle = `text{font-family:Verdana,Geneva,sans-serif;fill:#1a1a1a}.map-label{font-size:6px;font-weight:400;paint-order:stroke;stroke:#fff;stroke-width:1.6px;stroke-linejoin:round}.free-label,.feature-label{font-size:7px;font-weight:400;paint-order:stroke;stroke:#fff;stroke-width:1.8px}.free-label.water{font-size:7.5px;fill:#256a86;font-style:italic}.base-land path{fill:#eeeeec;stroke:#777;stroke-width:.7;stroke-linejoin:round}.regions path{stroke:#1a1a1a;stroke-width:.8;stroke-linejoin:round}.feature.area{stroke:#1a1a1a;stroke-width:1;fill-opacity:.42}.feature.line,.feature.route{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.feature.river{stroke-width:2}.feature.mountain{stroke-dasharray:2 4;stroke-width:5}.feature.route{stroke-width:4}.coast-overlay path{fill:none;stroke:#555;stroke-width:.7}.north text,.scale text{font-size:7px;font-weight:400}`;
  const geographyStyle = `.natural-terrain path{stroke:none;fill-opacity:.32}.terrain-desert{fill:#e3b85f}.terrain-plateau{fill:#ad8b64}.terrain-plain{fill:#9fc98d}.terrain-basin{fill:#8db5a1}.natural-mountains path{fill:#8b6a52;fill-opacity:.3;stroke:#654936;stroke-width:.45}.natural-mountains text,.natural-cities text{font-size:6px;font-weight:400;paint-order:stroke;stroke:#fff;stroke-width:1.6px;stroke-linejoin:round}.natural-mountains text{fill:#654936;font-style:italic}.disputed-boundaries path{fill:none;stroke:#d35a40;stroke-width:1.2;stroke-dasharray:4 2}.natural-cities circle{fill:#1a1a1a;stroke:#fff;stroke-width:.6}`;
  const rivers = naturalEarthWater.rivers.map(({ geometry, rank }) => `<path class="water-rank-${rank}" d="${path(geometry as GeoJSON.Geometry) || ""}"/>`).join("");
  const lakes = naturalEarthWater.lakes.map(({ geometry, rank }) => `<path class="water-rank-${rank}" d="${path(geometry as GeoJSON.Geometry) || ""}"/>`).join("");
  const climateZones = (koppenClimate.runs as Array<[string, number, number, number, number]>).map(([group, west, south, east, north]) => {
    if (east < spec.viewport.west || west > spec.viewport.east || north < spec.viewport.south || south > spec.viewport.north) return "";
    const topLeft = projection([west, north]), bottomRight = projection([east, south]);
    if (!topLeft || !bottomRight) return "";
    const color = koppenClimate.groups[group as keyof typeof koppenClimate.groups].color;
    return `<rect class="climate-${group}" x="${topLeft[0].toFixed(2)}" y="${topLeft[1].toFixed(2)}" width="${Math.max(0, bottomRight[0] - topLeft[0]).toFixed(2)}" height="${Math.max(0, bottomRight[1] - topLeft[1]).toFixed(2)}" fill="${color}"/>`;
  }).join("");
  const lakeLayer = layer("lakes", "Lakes", lakes, "natural-lakes");
  const riverLayer = layer("rivers", "Rivers", rivers, "natural-rivers");
  const climateLayer = `<g id="climate-zones" data-name="Climate zones (Köppen–Geiger, 1980–2016)" class="climate-zones" style="filter:url(#climate-soften)" aria-label="Köppen–Geiger climate zones, 1980–2016">${climateZones}</g>`;
  const terrain = naturalEarthGeography.terrain.map(({ geometry, kind, name }) => `<path d="${path(geometry as GeoJSON.Geometry) || ""}" class="terrain-${kind.toLowerCase()}" data-name="${escapeXml(name)}"/>`).join("");
  const mountains = naturalEarthGeography.mountains.map(({ geometry, name, rank }) => {
    const mapGeometry = geometry as GeoJSON.Geometry, [x, y] = path.centroid(mapGeometry);
    const label = name && Number.isFinite(x) && Number.isFinite(y) ? `<text x="${x}" y="${y}" text-anchor="middle">${escapeXml(name)}</text>` : "";
    return `<g class="mountain-rank-${rank}" data-name="${escapeXml(name)}"><path d="${path(mapGeometry) || ""}"/>${label}</g>`;
  }).join("");
  const disputed = naturalEarthGeography.disputed.map(({ geometry, name }) => `<path d="${path(geometry as GeoJSON.Geometry) || ""}" data-name="${escapeXml(name)}"/>`).join("");
  const cities = naturalEarthGeography.cities.map(({ geometry, name, rank }) => {
    const position = projection((geometry as GeoJSON.Point).coordinates as [number, number]);
    return position ? `<g class="city-rank-${rank}" data-name="${escapeXml(name)}" transform="translate(${position[0]} ${position[1]})"><circle r="1.7"/><text x="4" y="2">${escapeXml(name)}</text></g>` : "";
  }).join("");
  const terrainLayer = layer("terrain", "Terrain regions", terrain, "natural-terrain");
  const mountainLayer = layer("mountains", "Mountain ranges", mountains, "natural-mountains");
  const disputedLayer = layer("disputed-boundaries", "Disputed boundaries", disputed, "disputed-boundaries");
  const cityLayer = layer("cities", "Cities and capitals", cities, "natural-cities");
  const composeLayers = (baseLand: string, countries: string, shortLabels: string, fullLabels: string) => {
    const baseGeography = layer("base-geography", "Base geography", `${layer("land", "Land", baseLand, "base-land")}${lakeLayer}`);
    const politicalGeography = layer("political-geography", "Political geography", `${layer("countries-borders", "Countries and borders", countries, "regions")}${disputedLayer}`);
    const thematicOverlays = layer("thematic-overlays", "Thematic overlays", `${terrainLayer}${climateLayer}${mountainLayer}${riverLayer}`);
    const labelLayers = layer("labels", "Labels", `${cityLayer}<g id="country-abbreviations" data-name="Country abbreviations" style="display:none">${shortLabels}</g>${layer("country-names", "Country names", fullLabels)}${layer("geographic-labels", "Geographic labels", freeLabels)}`);
    return `${layer("seas-oceans", "Seas and oceans", `<rect width="1000" height="700" fill="#eaf6fa"/>`)}${baseGeography}${politicalGeography}${thematicOverlays}${layer("map-features", "Map features", featureMarkup)}${labelLayers}${layer("coastline", "Coastline", baseLand, "coast-overlay")}${layer("map-ornaments", "Map ornaments", ornaments)}`;
  };
  if (spec.geometry === "countries") {
    const atlas = feature(worldAtlas as never, worldAtlas.objects.countries as never) as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, { name?: string }>;
    const regionById = new Map(spec.regions.filter(({ isoNumeric }) => isoNumeric).map((region) => [region.isoNumeric, region]));
    const regionByName = new Map(spec.regions.filter(({ atlasName }) => atlasName).map((region) => [region.atlasName, region]));
    const regionForFeature = (item: GeoJSON.Feature) => regionById.get(item.id == null ? "" : String(item.id).padStart(3, "0")) || regionByName.get(String(item.properties?.name || ""));
    const selected = { type: "FeatureCollection", features: atlas.features.filter(regionForFeature) } as GeoJSON.FeatureCollection;
    const baseLand = atlas.features.map((item) => `<path d="${path(item) || ""}"/>`).join("");
    const shapes = selected.features.map((item) => {
      const id = item.id == null ? "" : String(item.id).padStart(3, "0"), region = regionForFeature(item)!;
      const category = spec.categories.find(({ id: categoryId }) => categoryId === region.category)!;
      const categoryIndex = spec.categories.findIndex(({ id }) => id === category.id);
      const fill = swatches.length ? swatches[categoryIndex % swatches.length].hex : mapPalette[category.color];
      return `<path d="${path(item) || ""}" fill="${fill}"${id ? ` data-iso-numeric="${id}"` : ` data-map-unit="${escapeXml(region.atlasName)}"`}/>`;
    }).join("");
    const labelParts = selected.features.map((item) => {
      const region = regionForFeature(item)!;
      const [x, y] = path.centroid(item);
      return Number.isFinite(x) && Number.isFinite(y) ? { short: `<text x="${x}" y="${y}" class="map-label label-short" text-anchor="middle">${escapeXml(shortMapLabel(region.label))}</text>`, full: `<text x="${x}" y="${y}" class="map-label label-full" text-anchor="middle">${escapeXml(region.label)}</text>` } : { short: "", full: "" };
    });
    const shortLabels = labelParts.map(({ short }) => short).join("");
    const fullLabels = labelParts.map(({ full }) => full).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" role="img" aria-label="${escapeXml(spec.title)}" aria-describedby="map-desc"><desc id="map-desc">${escapeXml(`${spec.subtitle} ${spec.place}, ${spec.date}. Country boundaries from Natural Earth. Optional climate zones use Beck et al. 2018 normals for 1980–2016.`)}</desc><defs>${arrows}</defs><style>${sharedStyle}${geographyStyle}.natural-lakes path{fill:#eaf6fa;stroke:#69a9c0;stroke-width:.45}.natural-rivers path{fill:none;stroke:#69a9c0;stroke-width:.45;stroke-linecap:round;stroke-linejoin:round}.climate-zones{opacity:.58;pointer-events:none}.climate-zones rect{stroke:none}</style>${composeLayers(baseLand, shapes, shortLabels, fullLabels)}</svg>`;
  }
  const land = feature(worldLand as never, worldLand.objects.land as never) as unknown as GeoJSON.Feature<GeoJSON.Geometry>;
  const landPath = path(land) || "";
  const baseLand = `<path d="${landPath}"/>`;
  const regionParts = spec.regions.map((region) => {
    const category = categoryById.get(region.category)!;
    const fill = swatches.length ? swatches[category.index % swatches.length].hex : mapPalette[category.color];
    const shapes = region.polygons.map((polygon) => {
      const coordinates = polygon.map(({ lon, lat }) => [lon, lat]);
      const geometry: GeoJSON.Polygon = { type: "Polygon", coordinates: [[...coordinates, coordinates[0]]] };
      return `<path d="${path(geometry) || ""}" fill="${fill}"${region.dataId ? ` data-region-id="${escapeXml(region.dataId)}" data-region-label="${escapeXml(region.label)}"` : ""}/>`;
    }).join("");
    const labelPosition = projection([region.labelLon, region.labelLat]);
    const shortLabel = region.labelVisible !== false && labelPosition ? `<text x="${labelPosition[0]}" y="${labelPosition[1]}" class="map-label label-short" text-anchor="middle">${escapeXml(shortMapLabel(region.label))}</text>` : "";
    const fullLabel = region.labelVisible !== false && labelPosition ? `<text x="${labelPosition[0]}" y="${labelPosition[1]}" class="map-label label-full" text-anchor="middle">${escapeXml(region.label)}</text>` : "";
    return { shapes: `<g data-name="${escapeXml(region.label)}">${shapes}</g>`, shortLabel, fullLabel };
  });
  const regions = regionParts.map(({ shapes }) => shapes).join("");
  const shortRegionLabels = regionParts.map(({ shortLabel }) => shortLabel).join("");
  const fullRegionLabels = regionParts.map(({ fullLabel }) => fullLabel).join("");
  const clippedRegions = `<g clip-path="url(#historical-land-clip)">${regions}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" role="img" aria-label="${escapeXml(spec.title)}" aria-describedby="map-desc"><desc id="map-desc">${escapeXml(`${spec.subtitle} ${spec.place}, ${spec.date}. Historical political geometry clipped to Natural Earth coastlines. Optional climate zones use Beck et al. 2018 normals for 1980–2016.`)}</desc><defs>${arrows}<clipPath id="historical-land-clip"><path d="${landPath}"/></clipPath></defs><style>${sharedStyle}${geographyStyle}.natural-lakes path{fill:#eaf6fa;stroke:#69a9c0;stroke-width:.45}.natural-rivers path{fill:none;stroke:#69a9c0;stroke-width:.45;stroke-linecap:round;stroke-linejoin:round}.climate-zones{opacity:.58;pointer-events:none}.climate-zones rect{stroke:none}</style>${composeLayers(baseLand, clippedRegions, shortRegionLabels, fullRegionLabels)}</svg>`;
}

export function createMapReport(spec: MapSpec, checks: FigureCheck[], model: string, referenceCount: number, swatches: RenderSwatch[] = []) {
  return JSON.stringify({ generatedAt: new Date().toISOString(), generator: "Taktik Robot Map Generator", model, referenceCount, palette: swatches, spec, checks }, null, 2);
}
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-50m.json" with { type: "json" };
import worldLand from "world-atlas/land-50m.json" with { type: "json" };
import naturalEarthWater from "../../map-generator/code/data/natural-earth-water.json" with { type: "json" };
import koppenClimate from "../../map-generator/code/data/koppen-climate.json" with { type: "json" };
import naturalEarthGeography from "../../map-generator/code/data/natural-earth-geography.json" with { type: "json" };
