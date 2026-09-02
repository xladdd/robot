export type GraphKind = "line" | "bar";

export type GraphSource = { id: string; title: string; url: string };
export type GraphSeries = { label: string; values: number[]; sourceIds: string[] };
export type GraphSpec = { version: 1; kind: GraphKind; title: string; subtitle: string; xLabel: string; yLabel: string; unit: string; categories: string[]; series: GraphSeries[]; sources: GraphSource[]; notes: string[] };
export type GraphCheck = { level: "pass" | "warning"; message: string };
export type RenderSwatch = { name: string; hex: string; model?: string; values?: number[]; group?: string };

const MAX_CATEGORIES = 24;
const MAX_SERIES = 6;
const palette = ["#ff661a", "#00a5a0", "#6b5cff", "#d53f8c", "#3d7c47", "#9a6700"];

function text(value: unknown, limit: number) { return typeof value === "string" ? value.trim().slice(0, limit) : ""; }
function escapeXml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!); }
function numberLabel(value: number) { return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value); }

export function validateGraphSpec(input: unknown): { spec: GraphSpec; checks: GraphCheck[] } {
  if (!input || typeof input !== "object") throw new Error("The model did not return a figure specification.");
  const raw = input as Record<string, unknown>;
  const kind = raw.kind === "bar" ? "bar" : raw.kind === "line" ? "line" : null;
  if (!kind) throw new Error("Only line and bar charts are supported in this release.");
  const categories = Array.isArray(raw.categories) ? raw.categories.map((value) => text(value, 48)).filter(Boolean) : [];
  if (categories.length < 2 || categories.length > MAX_CATEGORIES) throw new Error(`Use between 2 and ${MAX_CATEGORIES} categories.`);
  if (new Set(categories).size !== categories.length) throw new Error("Category labels must be unique.");
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).map((value) => {
    const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { id: text(source.id, 40), title: text(source.title, 160), url: text(source.url, 500) };
  });
  if (!sources.length || sources.some((source) => !source.id || !source.title)) throw new Error("Every figure needs at least one named source.");
  if (new Set(sources.map(({ id }) => id)).size !== sources.length) throw new Error("Source IDs must be unique.");
  for (const source of sources) if (source.url && !/^https?:\/\//i.test(source.url)) throw new Error(`Source ${source.id} must use an HTTP or HTTPS URL.`);
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
  const spec: GraphSpec = { version: 1, kind, title, subtitle: text(raw.subtitle, 240), xLabel: text(raw.xLabel, 80), yLabel: text(raw.yLabel, 80), unit: text(raw.unit, 40), categories, series, sources, notes: Array.isArray(raw.notes) ? raw.notes.map((note) => text(note, 240)).filter(Boolean).slice(0, 8) : [] };
  const values = series.flatMap(({ values: row }) => row);
  const checks: GraphCheck[] = [{ level: "pass", message: `${values.length} numeric values are finite and dimensionally complete.` }, { level: "pass", message: "Every series cites a declared source." }, { level: "pass", message: "SVG geometry will be calculated deterministically from the validated values." }];
  if (Math.min(...values) < 0 && Math.max(...values) > 0) checks.push({ level: "warning", message: "The data crosses zero; inspect the axis and interpretation carefully." });
  if (sources.some(({ url }) => !url)) checks.push({ level: "warning", message: "One or more sources has no URL. Verify the bibliographic reference manually." });
  return { spec, checks };
}

export function renderGraphSvg(spec: GraphSpec, swatches: RenderSwatch[] = []) {
  const colors = swatches.length ? swatches.map(({ hex }) => hex) : palette;
  const width = 1000, height = 680, plot = { x: 110, y: 150, width: 820, height: 390 };
  const allValues = spec.series.flatMap(({ values }) => values), rawMin = Math.min(...allValues), rawMax = Math.max(...allValues), min = Math.min(0, rawMin), max = Math.max(0, rawMax), span = max - min || 1;
  const y = (value: number) => plot.y + plot.height - ((value - min) / span) * plot.height;
  const zeroY = y(0), categoryStep = plot.width / spec.categories.length;
  const grid = Array.from({ length: 6 }, (_, index) => { const value = min + (span * index) / 5, py = y(value); return `<line x1="${plot.x}" y1="${py}" x2="${plot.x + plot.width}" y2="${py}" stroke="#d7d7d7"/><text x="${plot.x - 14}" y="${py + 4}" text-anchor="end" class="tick">${escapeXml(numberLabel(value))}</text>`; }).join("");
  const categoryLabels = spec.categories.map((label, index) => `<text x="${plot.x + categoryStep * (index + .5)}" y="${plot.y + plot.height + 28}" text-anchor="middle" class="tick">${escapeXml(label)}</text>`).join("");
  const marks = spec.kind === "line" ? spec.series.map((series, seriesIndex) => { const points = series.values.map((value, index) => `${plot.x + categoryStep * (index + .5)},${y(value)}`).join(" "); const dots = series.values.map((value, index) => `<circle cx="${plot.x + categoryStep * (index + .5)}" cy="${y(value)}" r="5" fill="${colors[seriesIndex % colors.length]}"/>`).join(""); return `<polyline points="${points}" fill="none" stroke="${colors[seriesIndex % colors.length]}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>${dots}`; }).join("") : spec.series.map((series, seriesIndex) => { const groupWidth = categoryStep * .72, barWidth = groupWidth / spec.series.length; return series.values.map((value, index) => { const px = plot.x + categoryStep * index + (categoryStep - groupWidth) / 2 + seriesIndex * barWidth, py = Math.min(y(value), zeroY); return `<rect x="${px}" y="${py}" width="${Math.max(2, barWidth - 3)}" height="${Math.max(1, Math.abs(zeroY - y(value)))}" fill="${colors[seriesIndex % colors.length]}"/>`; }).join(""); }).join("");
  const legend = spec.series.map((series, index) => `<g transform="translate(${plot.x + index * 150} 112)"><rect width="18" height="8" y="-7" fill="${colors[index % colors.length]}"/><text x="27" class="legend">${escapeXml(series.label)}</text></g>`).join("");
  const sourceLine = spec.sources.map(({ id, title }) => `${id}: ${title}`).join(" · ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="figure-title figure-desc"><title id="figure-title">${escapeXml(spec.title)}</title><desc id="figure-desc">${escapeXml(spec.subtitle || `${spec.kind} chart`)}</desc><style>text{font-family:Verdana,Geneva,sans-serif;fill:#1a1a1a}.title{font-size:30px;font-weight:700}.subtitle{font-size:14px;fill:#666}.tick{font-size:11px}.legend{font-size:12px}.axis-label{font-size:13px;font-weight:700}.source{font-size:9px;fill:#666}</style><rect width="1000" height="680" fill="#fff"/><text id="figure-title-text" x="${plot.x}" y="55" class="title">${escapeXml(spec.title)}</text><text x="${plot.x}" y="82" class="subtitle">${escapeXml(spec.subtitle)}</text>${legend}${grid}<line x1="${plot.x}" y1="${zeroY}" x2="${plot.x + plot.width}" y2="${zeroY}" stroke="#1a1a1a" stroke-width="1.5"/>${marks}${categoryLabels}<text x="${plot.x + plot.width / 2}" y="${plot.y + plot.height + 62}" text-anchor="middle" class="axis-label">${escapeXml(spec.xLabel)}</text><text transform="translate(34 ${plot.y + plot.height / 2}) rotate(-90)" text-anchor="middle" class="axis-label">${escapeXml(`${spec.yLabel}${spec.unit ? ` (${spec.unit})` : ""}`)}</text><text x="${plot.x}" y="640" class="source">Sources: ${escapeXml(sourceLine)}</text></svg>`;
}

export function createGraphReport(spec: GraphSpec, checks: GraphCheck[], model: string, swatches: RenderSwatch[] = []) { return JSON.stringify({ generatedAt: new Date().toISOString(), generator: "Taktik Robot Figure Generator", model, palette: swatches, spec, checks }, null, 2); }
