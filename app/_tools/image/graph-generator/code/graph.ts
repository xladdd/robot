import {
  createLinearDomain,
  createNumericDomain,
  formatNumber,
  type NumberLocale,
  type NumericDomain,
} from "./scales.ts";

export type GraphKind = "line" | "bar" | "combined" | "scatter" | "donut";
export type GraphSource = { id: string; title: string; url: string };
export type GraphMark = "bar" | "line";
export type GraphAxisSide = "left" | "right";
export type GraphSeries = {
  label: string;
  values: number[];
  sourceIds: string[];
  mark: GraphMark;
  axis: GraphAxisSide;
  showValues: boolean;
  showMarkers: boolean;
};
export type GraphPoint = { x: number; y: number; label: string };
export type GraphSlice = { label: string; value: number; sourceIds: string[] };
export type GraphSpec = {
  version: 2;
  kind: GraphKind;
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  unit: string;
  rightYLabel: string;
  rightYUnit: string;
  categories: string[];
  series: GraphSeries[];
  points: GraphPoint[];
  slices: GraphSlice[];
  yMin: number | null;
  yMax: number | null;
  rightYMin: number | null;
  rightYMax: number | null;
  xMin: number | null;
  xMax: number | null;
  showLegend: boolean;
  showGridlines: boolean;
  showVerticalGridlines: boolean;
  trendLine: boolean;
  centerLabel: string;
  slicesArePercentages: boolean;
  locale: NumberLocale;
  sources: GraphSource[];
  notes: string[];
};
export type GraphCheck = { level: "pass" | "warning"; message: string };
export type RenderSwatch = {
  name: string;
  hex: string;
  model?: string;
  values?: number[];
  group?: string;
};

type RawRecord = Record<string, unknown>;
type ValidationOptions = { language?: NumberLocale };

const MAX_CATEGORIES = 24;
const MAX_SERIES = 6;
const MAX_POINTS = 500;
const MAX_SLICES = 24;
const palette = [
  "#ff661a",
  "#00a5a0",
  "#6b5cff",
  "#d53f8c",
  "#3d7c47",
  "#9a6700",
];

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

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function sourceList(input: unknown) {
  return (Array.isArray(input) ? input : []).map((value) => {
    const source =
      value && typeof value === "object" ? (value as RawRecord) : {};
    return {
      id: text(source.id, 40),
      title: text(source.title, 160),
      url: text(source.url, 500),
    };
  });
}

function notesList(input: unknown) {
  return Array.isArray(input)
    ? input
        .map((note) => text(note, 240))
        .filter(Boolean)
        .slice(0, 8)
    : [];
}

function unitLabel(label: string, unit: string) {
  if (!unit) return label;
  const suffix = `(${unit})`;
  return label.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())
    ? label
    : `${label} ${suffix}`;
}

function checkMessages(locale: NumberLocale) {
  return locale === "cs"
    ? {
        complete: "Všechna dodaná číselná data jsou konečná a rozměrově úplná.",
        cited: "Každá řada odkazuje na deklarovaný zdroj.",
        deterministic:
          "Geometrie SVG se vypočítá deterministicky z ověřených hodnot.",
        noSource:
          "Nebyl uveden pojmenovaný zdroj; data jsou označena jako dodaná uživatelem.",
        noUrl:
          "Jeden nebo více zdrojů nemá URL. Bibliografický odkaz ověřte ručně.",
        zero: "Data procházejí nulou; pečlivě zkontrolujte osu a interpretaci.",
        percentage:
          "Hodnoty prstencového grafu jsou interpretovány jako procenta.",
      }
    : {
        complete:
          "All supplied numeric values are finite and dimensionally complete.",
        cited: "Every series cites a declared source.",
        deterministic:
          "SVG geometry will be calculated deterministically from the validated values.",
        noSource:
          "No named source was supplied; the data is marked as user-provided.",
        noUrl:
          "One or more sources has no URL. Verify the bibliographic reference manually.",
        zero: "The data crosses zero; inspect the axis and interpretation carefully.",
        percentage: "Donut values are interpreted as percentages.",
      };
}

function declaredSourceIds(sources: GraphSource[]) {
  return new Set(sources.map(({ id }) => id));
}

function validateSourceIds(
  ids: string[],
  sourceIds: Set<string>,
  hasSources: boolean,
) {
  if (!hasSources && ids.length)
    throw new Error("Source IDs cannot be used when no sources are declared.");
  if (ids.some((id) => !sourceIds.has(id)))
    throw new Error("Every series must cite only declared source IDs.");
  return [...new Set(ids)];
}

function normalizeCategories(raw: RawRecord, kind: GraphKind) {
  const categories = Array.isArray(raw.categories)
    ? raw.categories.map((value) => text(value, 48)).filter(Boolean)
    : [];
  if (["bar", "line", "combined"].includes(kind)) {
    if (categories.length < 2 || categories.length > MAX_CATEGORIES)
      throw new Error(`Use between 2 and ${MAX_CATEGORIES} categories.`);
    if (new Set(categories).size !== categories.length)
      throw new Error("Category labels must be unique.");
  }
  return categories;
}

function normalizeSeries(
  raw: RawRecord,
  kind: GraphKind,
  categories: string[],
  sources: GraphSource[],
  sourceIds: Set<string>,
) {
  const rawSeries = Array.isArray(raw.series) ? raw.series : [];
  if (
    ["bar", "line", "combined"].includes(kind) &&
    (!rawSeries.length || rawSeries.length > MAX_SERIES)
  )
    throw new Error(`Use between 1 and ${MAX_SERIES} data series.`);
  if (kind === "scatter" && rawSeries.length > 1)
    throw new Error(
      "Scatter charts use points rather than multiple value series.",
    );
  if (kind === "donut" && rawSeries.length)
    throw new Error("Donut charts use slices rather than value series.");

  return rawSeries.map((value) => {
    const item = value && typeof value === "object" ? (value as RawRecord) : {};
    const values = Array.isArray(item.values) ? item.values.map(Number) : [];
    const ids = Array.isArray(item.sourceIds)
      ? item.sourceIds.map((id) => text(id, 40)).filter(Boolean)
      : [];
    const label = text(item.label, 80);
    if (!label) throw new Error("Every series needs a label.");
    if (
      values.length !== categories.length ||
      values.some((itemValue) => !Number.isFinite(itemValue))
    )
      throw new Error(
        "Every series must contain one finite number per category.",
      );
    const mark =
      item.mark === "line"
        ? "line"
        : item.mark === "bar"
          ? "bar"
          : kind === "line"
            ? "line"
            : "bar";
    const axis = item.axis === "right" ? "right" : "left";
    if (axis === "right" && kind !== "combined")
      throw new Error("A right y-axis is supported only for combined charts.");
    return {
      label,
      values,
      sourceIds: validateSourceIds(ids, sourceIds, sources.length > 0),
      mark,
      axis,
      showValues: boolean(
        item.showValues,
        boolean(raw.showValueLabels, kind === "bar" && mark === "bar"),
      ),
      showMarkers: boolean(item.showMarkers, mark === "line"),
    } satisfies GraphSeries;
  });
}

function normalizePoints(
  raw: RawRecord,
  kind: GraphKind,
  sources: GraphSource[],
  sourceIds: Set<string>,
) {
  const rawPoints = Array.isArray(raw.points) ? raw.points : [];
  if (
    kind === "scatter" &&
    (rawPoints.length < 2 || rawPoints.length > MAX_POINTS)
  )
    throw new Error(`Use between 2 and ${MAX_POINTS} scatter points.`);
  if (kind !== "scatter" && rawPoints.length)
    throw new Error("Points are supported only for scatter charts.");
  return rawPoints
    .map((value) => {
      const item =
        value && typeof value === "object" ? (value as RawRecord) : {};
      const x = number(item.x);
      const y = number(item.y);
      if (x === null || y === null)
        throw new Error(
          "Every scatter point needs finite numeric x and y values.",
        );
      const ids = Array.isArray(item.sourceIds)
        ? item.sourceIds.map((id) => text(id, 40)).filter(Boolean)
        : [];
      return {
        x,
        y,
        label: text(item.label, 48),
        sourceIds: validateSourceIds(ids, sourceIds, sources.length > 0),
      };
    })
    .map(({ x, y, label }) => ({ x, y, label }));
}

function cleanSliceLabel(label: string) {
  return label.replace(/\s*(?:\(\s*)?\d+(?:[.,]\d+)?\s*%\s*\)?\s*$/, "").trim();
}

function normalizeSlices(
  raw: RawRecord,
  kind: GraphKind,
  sources: GraphSource[],
  sourceIds: Set<string>,
) {
  const rawSlices = Array.isArray(raw.slices) ? raw.slices : [];
  if (
    kind === "donut" &&
    (rawSlices.length < 2 || rawSlices.length > MAX_SLICES)
  )
    throw new Error(`Use between 2 and ${MAX_SLICES} donut slices.`);
  if (kind !== "donut" && rawSlices.length)
    throw new Error("Slices are supported only for donut charts.");
  const slices = rawSlices.map((value) => {
    const item = value && typeof value === "object" ? (value as RawRecord) : {};
    const sliceValue = number(item.value);
    const label = cleanSliceLabel(text(item.label, 80));
    const ids = Array.isArray(item.sourceIds)
      ? item.sourceIds.map((id) => text(id, 40)).filter(Boolean)
      : [];
    if (!label || sliceValue === null || sliceValue < 0)
      throw new Error(
        "Every donut slice needs a label and a non-negative finite value.",
      );
    return {
      label,
      value: sliceValue,
      sourceIds: validateSourceIds(ids, sourceIds, sources.length > 0),
    };
  });
  if (new Set(slices.map(({ label }) => label)).size !== slices.length)
    throw new Error("Donut slice labels must be unique.");
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (kind === "donut" && total <= 0)
    throw new Error("Donut values must have a positive total.");
  const percentages = boolean(raw.slicesArePercentages, true);
  if (kind === "donut" && percentages && Math.abs(total - 100) > 0.01)
    throw new Error("Donut percentages must sum to 100%.");
  return { slices, percentages };
}

export function validateGraphSpec(
  input: unknown,
  options: ValidationOptions = {},
): { spec: GraphSpec; checks: GraphCheck[] } {
  if (!input || typeof input !== "object")
    throw new Error("The model did not return a figure specification.");
  const raw = input as RawRecord;
  const kind = ["bar", "line", "combined", "scatter", "donut"].includes(
    raw.kind as string,
  )
    ? (raw.kind as GraphKind)
    : null;
  if (!kind)
    throw new Error(
      "Supported chart types are bar, line, combined, scatter, and donut.",
    );
  const title = text(raw.title, 160);
  if (!title) throw new Error("The figure needs a title.");

  const sources = sourceList(raw.sources);
  if (sources.some((source) => !source.id || !source.title))
    throw new Error("Every declared source needs an ID and title.");
  if (new Set(sources.map(({ id }) => id)).size !== sources.length)
    throw new Error("Source IDs must be unique.");
  for (const source of sources)
    if (source.url && !/^https?:\/\//i.test(source.url))
      throw new Error(`Source ${source.id} must use an HTTP or HTTPS URL.`);
  const sourceIds = declaredSourceIds(sources);
  const categories = normalizeCategories(raw, kind);
  const series = normalizeSeries(raw, kind, categories, sources, sourceIds);
  const points = normalizePoints(raw, kind, sources, sourceIds);
  const { slices, percentages } = normalizeSlices(
    raw,
    kind,
    sources,
    sourceIds,
  );
  if (kind === "scatter" && series.length)
    throw new Error("Scatter charts cannot contain value series.");
  if (kind === "donut" && (categories.length || series.length))
    throw new Error(
      "Donut charts cannot contain Cartesian categories or series.",
    );
  if (kind !== "scatter" && kind !== "donut" && !series.length)
    throw new Error("Cartesian charts need at least one data series.");

  const locale: NumberLocale =
    raw.locale === "cs" || options.language === "cs" ? "cs" : "en";
  const yMin = number(raw.yMin);
  const yMax = number(raw.yMax);
  const rightYMin = number(raw.rightYMin);
  const rightYMax = number(raw.rightYMax);
  const xMin = number(raw.xMin);
  const xMax = number(raw.xMax);
  for (const [label, min, max] of [
    ["y", yMin, yMax],
    ["right y", rightYMin, rightYMax],
    ["x", xMin, xMax],
  ] as const)
    if (
      (min === null) !== (max === null) ||
      (min !== null && max !== null && min >= max)
    )
      throw new Error(
        `${label} axis bounds must provide a finite minimum below the maximum.`,
      );

  const spec: GraphSpec = {
    version: 2,
    kind,
    title,
    subtitle: text(raw.subtitle, 240),
    xLabel: text(raw.xLabel, 80),
    yLabel: text(raw.yLabel, 80),
    unit: text(raw.unit, 40),
    rightYLabel: text(raw.rightYLabel, 80),
    rightYUnit: text(raw.rightYUnit, 40),
    categories,
    series,
    points,
    slices,
    yMin,
    yMax,
    rightYMin,
    rightYMax,
    xMin,
    xMax,
    showLegend: boolean(raw.showLegend, true),
    showGridlines: boolean(raw.showGridlines, true),
    showVerticalGridlines: boolean(
      raw.showVerticalGridlines,
      kind === "scatter",
    ),
    trendLine: boolean(raw.trendLine, false),
    centerLabel: text(raw.centerLabel, 100),
    slicesArePercentages: percentages,
    locale,
    sources,
    notes: notesList(raw.notes),
  };
  const leftValues = series
    .filter(({ axis }) => axis === "left")
    .flatMap(({ values }) => values);
  const rightValues = series
    .filter(({ axis }) => axis === "right")
    .flatMap(({ values }) => values);
  if (
    yMin !== null &&
    yMax !== null &&
    leftValues.some((value) => value < yMin || value > yMax)
  )
    throw new Error("Some values are outside the declared y axis bounds.");
  if (
    rightYMin !== null &&
    rightYMax !== null &&
    rightValues.some((value) => value < rightYMin || value > rightYMax)
  )
    throw new Error(
      "Some values are outside the declared right y axis bounds.",
    );
  if (
    xMin !== null &&
    xMax !== null &&
    points.some(({ x }) => x < xMin || x > xMax)
  )
    throw new Error("Some points are outside the declared x axis bounds.");
  if (spec.trendLine && kind !== "scatter")
    throw new Error("A trend line is supported only for scatter charts.");
  if (kind === "combined" && !series.some(({ axis }) => axis === "right"))
    throw new Error(
      "Combined charts need a series assigned to the right y-axis.",
    );
  if (kind !== "combined" && series.some(({ axis }) => axis === "right"))
    throw new Error("Only combined charts may use a right y-axis.");

  const numericValues =
    kind === "scatter"
      ? points.flatMap(({ x, y }) => [x, y])
      : kind === "donut"
        ? slices.map(({ value }) => value)
        : series.flatMap(({ values }) => values);
  const messages = checkMessages(locale);
  const checks: GraphCheck[] = [
    { level: "pass", message: messages.complete },
    {
      level: "pass",
      message: sources.length ? messages.cited : messages.noSource,
    },
    { level: "pass", message: messages.deterministic },
  ];
  if (Math.min(...numericValues) < 0 && Math.max(...numericValues) > 0)
    checks.push({ level: "warning", message: messages.zero });
  if (sources.some(({ url }) => !url))
    checks.push({ level: "warning", message: messages.noUrl });
  if (kind === "donut" && percentages)
    checks.push({ level: "pass", message: messages.percentage });
  return { spec, checks };
}

export function applyGraphPresentationDefaults(
  spec: GraphSpec,
  showValueLabels = true,
): GraphSpec {
  const barCount = spec.series
    .filter(({ mark }) => mark === "bar")
    .reduce((count, series) => count + series.values.length, 0);
  const labelShortBarChart =
    showValueLabels && spec.kind === "bar" && barCount <= 12;

  return {
    ...spec,
    series: spec.series.map((series) => ({
      ...series,
      showValues:
        series.mark === "bar"
          ? labelShortBarChart
            ? true
            : showValueLabels
              ? series.showValues
              : false
          : series.showValues,
    })),
  };
}

function round(value: number) {
  return Number(value.toFixed(3));
}

function regression(points: GraphPoint[]) {
  const xMean = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const yMean = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const denominator = points.reduce(
    (sum, point) => sum + (point.x - xMean) ** 2,
    0,
  );
  const slope = denominator
    ? points.reduce(
        (sum, point) => sum + (point.x - xMean) * (point.y - yMean),
        0,
      ) / denominator
    : 0;
  return { slope, intercept: yMean - slope * xMean };
}

function axisTicks(
  domain: NumericDomain,
  plot: { x: number; y: number; width: number; height: number },
  locale: NumberLocale,
  side: "left" | "right",
  showGridlines: boolean,
) {
  const x = side === "left" ? plot.x - 14 : plot.x + plot.width + 14;
  return domain.ticks
    .map((value) => {
      const py = round(
        plot.y +
          plot.height -
          ((value - domain.min) / (domain.max - domain.min)) * plot.height,
      );
      const grid =
        showGridlines && side === "left"
          ? `<line data-axis="y-left" x1="${plot.x}" y1="${py}" x2="${plot.x + plot.width}" y2="${py}" stroke="#d7d7d7"/>`
          : "";
      return `${grid}<text data-axis="y-${side}" x="${x}" y="${py + 4}" text-anchor="${side === "left" ? "end" : "start"}" class="tick">${escapeXml(formatNumber(value, locale))}</text>`;
    })
    .join("");
}

function legend(
  items: Array<{ label: string; color: string; mark: "bar" | "line" }>,
  plotX: number,
  y = 112,
) {
  return items
    .map((item, index) => {
      const x = plotX + index * 150;
      const symbol =
        item.mark === "line"
          ? `<line x1="0" y1="-3" x2="18" y2="-3" stroke="${item.color}" stroke-width="3"/><circle cx="9" cy="-3" r="3" fill="${item.color}"/>`
          : `<rect width="18" height="8" y="-7" fill="${item.color}"/>`;
      return `<g data-chart-role="legend-item" transform="translate(${x} ${y})">${symbol}<text x="27" class="legend">${escapeXml(item.label)}</text></g>`;
    })
    .join("");
}

function categoryLabels(
  spec: GraphSpec,
  plot: { x: number; y: number; width: number; height: number },
) {
  const step = plot.width / spec.categories.length;
  return spec.categories
    .map(
      (label, index) =>
        `<text data-axis="x" x="${round(plot.x + step * (index + 0.5))}" y="${plot.y + plot.height + 28}" text-anchor="middle" class="tick">${escapeXml(label)}</text>`,
    )
    .join("");
}

function formatValueLabel(value: number, unit: string, locale: NumberLocale) {
  const formatted = formatNumber(value, locale);
  if (!unit) return formatted;
  return unit === "%" ? `${formatted}%` : `${formatted} ${unit}`;
}

function cartesianMarks(
  spec: GraphSpec,
  colors: string[],
  plot: { x: number; y: number; width: number; height: number },
  leftDomain: NumericDomain,
  rightDomain: NumericDomain | null,
) {
  const categoryStep = plot.width / Math.max(1, spec.categories.length);
  const leftY = (value: number) =>
    plot.y +
    plot.height -
    ((value - leftDomain.min) / (leftDomain.max - leftDomain.min)) *
      plot.height;
  const rightY = rightDomain
    ? (value: number) =>
        plot.y +
        plot.height -
        ((value - rightDomain.min) / (rightDomain.max - rightDomain.min)) *
          plot.height
    : leftY;
  const zeroY = leftY(0);
  const barSeries = spec.series.filter(({ mark }) => mark === "bar");
  const bars = spec.series
    .filter(({ mark }) => mark === "bar")
    .map((series) => {
      const seriesIndex = spec.series.indexOf(series);
      const barWidth = (categoryStep * 0.72) / Math.max(1, barSeries.length);
      return series.values
        .map((value, index) => {
          const groupWidth = categoryStep * 0.72;
          const px =
            plot.x +
            categoryStep * index +
            (categoryStep - groupWidth) / 2 +
            seriesIndex * barWidth;
          const valueY = (series.axis === "right" ? rightY : leftY)(value);
          const py = Math.min(valueY, zeroY);
          const height = Math.abs(zeroY - valueY);
          const color = colors[seriesIndex % colors.length];
          const label = series.showValues
            ? `<text data-chart-role="value-label" x="${round(px + barWidth / 2)}" y="${round(value >= 0 ? py - 6 : py + height + 14)}" text-anchor="middle" class="value-label">${escapeXml(formatValueLabel(value, series.axis === "right" ? spec.rightYUnit : spec.unit, spec.locale))}</text>`
            : "";
          return `<g data-chart-role="bar" data-series="${escapeXml(series.label)}"><rect x="${round(px)}" y="${round(py)}" width="${round(Math.max(0, barWidth - 3))}" height="${round(height)}" fill="${color}"/>${label}</g>`;
        })
        .join("");
    })
    .join("");
  const lines = spec.series
    .filter(({ mark }) => mark === "line")
    .map((series) => {
      const seriesIndex = spec.series.indexOf(series);
      const y = series.axis === "right" ? rightY : leftY;
      const points = series.values
        .map(
          (value, index) =>
            `${round(plot.x + categoryStep * (index + 0.5))},${round(y(value))}`,
        )
        .join(" ");
      const color = colors[seriesIndex % colors.length];
      const dots = series.showMarkers
        ? series.values
            .map(
              (value, index) =>
                `<circle data-chart-role="point" data-series="${escapeXml(series.label)}" cx="${round(plot.x + categoryStep * (index + 0.5))}" cy="${round(y(value))}" r="5" fill="${color}"/>`,
            )
            .join("")
        : "";
      return `<g data-chart-role="line" data-series="${escapeXml(series.label)}"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>${dots}</g>`;
    })
    .join("");
  return `<g data-chart-role="marks" clip-path="url(#plot-clip)">${bars}${lines}</g>`;
}

function scatterMarks(
  spec: GraphSpec,
  plot: { x: number; y: number; width: number; height: number },
  colors: string[],
  xDomain: NumericDomain,
  yDomain: NumericDomain,
) {
  const x = (value: number) =>
    plot.x + ((value - xDomain.min) / (xDomain.max - xDomain.min)) * plot.width;
  const y = (value: number) =>
    plot.y +
    plot.height -
    ((value - yDomain.min) / (yDomain.max - yDomain.min)) * plot.height;
  const points = spec.points
    .map(
      (point) =>
        `<circle data-chart-role="point"${point.label ? ` data-point-label="${escapeXml(point.label)}"` : ""} cx="${round(x(point.x))}" cy="${round(y(point.y))}" r="5" fill="${colors[0]}"/>`,
    )
    .join("");
  const trend = spec.trendLine
    ? (() => {
        const { slope, intercept } = regression(spec.points);
        return `<line data-chart-role="trend-line" x1="${round(x(xDomain.min))}" y1="${round(y(slope * xDomain.min + intercept))}" x2="${round(x(xDomain.max))}" y2="${round(y(slope * xDomain.max + intercept))}" stroke="${colors[1] || "#1a1a1a"}" stroke-width="2" stroke-dasharray="7 5"/>`;
      })()
    : "";
  return `<g data-chart-role="marks" clip-path="url(#plot-clip)">${trend}${points}</g>`;
}

function donutPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
) {
  const point = (radius: number, angle: number) => [
    round(cx + radius * Math.cos(angle)),
    round(cy + radius * Math.sin(angle)),
  ];
  const [outerStartX, outerStartY] = point(outer, start);
  const [outerEndX, outerEndY] = point(outer, end);
  const [innerEndX, innerEndY] = point(inner, end);
  const [innerStartX, innerStartY] = point(inner, start);
  const largeArc = end - start > Math.PI ? 1 : 0;
  return `M ${outerStartX} ${outerStartY} A ${outer} ${outer} 0 ${largeArc} 1 ${outerEndX} ${outerEndY} L ${innerEndX} ${innerEndY} A ${inner} ${inner} 0 ${largeArc} 0 ${innerStartX} ${innerStartY} Z`;
}

function donutMarks(spec: GraphSpec, colors: string[]) {
  const cx = 520;
  const cy = 350;
  const outer = 145;
  const inner = 82;
  const total = spec.slices.reduce((sum, slice) => sum + slice.value, 0);
  let angle = -Math.PI / 2;
  const marks = spec.slices
    .map((slice, index) => {
      const next = angle + (slice.value / total) * Math.PI * 2;
      const middle = (angle + next) / 2;
      const color = colors[index % colors.length];
      const percentage = (slice.value / total) * 100;
      const labelRadius = outer + 28;
      const labelX = cx + labelRadius * Math.cos(middle);
      const labelY = cy + labelRadius * Math.sin(middle);
      const anchor = Math.cos(middle) >= 0 ? "start" : "end";
      const lineEndX = cx + outer * Math.cos(middle);
      const lineEndY = cy + outer * Math.sin(middle);
      const lineStartX = cx + (outer + 10) * Math.cos(middle);
      const lineStartY = cy + (outer + 10) * Math.sin(middle);
      angle = next;
      return `<g data-chart-role="donut-slice" data-slice="${escapeXml(slice.label)}"><path d="${donutPath(cx, cy, outer, inner, angle - (slice.value / total) * Math.PI * 2, angle)}" fill="${color}"/><line x1="${round(lineEndX)}" y1="${round(lineEndY)}" x2="${round(lineStartX)}" y2="${round(lineStartY)}" stroke="${color}"/><text data-chart-role="slice-label" x="${round(labelX)}" y="${round(labelY)}" text-anchor="${anchor}" class="slice-label">${escapeXml(slice.label)} ${escapeXml(formatNumber(percentage, spec.locale))}%</text></g>`;
    })
    .join("");
  const center = spec.centerLabel
    ? `<text data-chart-role="center-label" x="${cx}" y="${cy}" text-anchor="middle" class="center-label">${escapeXml(spec.centerLabel)}</text>`
    : "";
  return `<g data-chart-role="donut">${marks}${center}</g>`;
}

function barChangeAnnotation(spec: GraphSpec, plotX: number) {
  if (
    spec.kind !== "bar" ||
    spec.series.length !== 1 ||
    spec.series[0].mark !== "bar" ||
    spec.categories.length < 2 ||
    spec.categories.length > 12
  )
    return "";

  const series = spec.series[0];
  const change = series.values.at(-1)! - series.values[0];
  if (change === 0) return "";
  const sign = change > 0 ? "+" : "−";
  const amount = `${sign}${formatNumber(Math.abs(change), spec.locale)}`;
  const isPercentage = spec.unit === "%";
  const unit = isPercentage
    ? spec.locale === "cs"
      ? " procentního bodu"
      : " percentage points"
    : spec.unit
      ? ` ${spec.unit}`
      : "";
  const prefix =
    spec.locale === "cs"
      ? `Změna ${spec.categories[0]}–${spec.categories.at(-1)}: `
      : `Change from ${spec.categories[0]} to ${spec.categories.at(-1)}: `;
  return `<text data-chart-role="change-annotation" x="${plotX}" y="620" class="change-note">${escapeXml(`${prefix}${amount}${unit}`)}</text>`;
}

function estimatedTextWidth(value: string, fontSize: number) {
  return [...value].reduce((width, character) => {
    if (character === " ") return width + fontSize * 0.28;
    if ("ilI.,'".includes(character)) return width + fontSize * 0.28;
    if ("MW@#%&".includes(character)) return width + fontSize * 0.9;
    return width + fontSize * 0.56;
  }, 0);
}

function wrapTitle(value: string, maxWidth: number, fontSize: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && estimatedTextWidth(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function renderGraphSvg(spec: GraphSpec, swatches: RenderSwatch[] = []) {
  const colors = swatches.length ? swatches.map(({ hex }) => hex) : palette;
  const width = 1000;
  const height = 680;
  const titleLines = wrapTitle(spec.title, 680, 30);
  const titleOffset = (titleLines.length - 1) * 32;
  const plot = {
    x: 110,
    y: 150 + titleOffset,
    width: 820,
    height: 390 - titleOffset,
  };
  const axisValues =
    spec.kind === "scatter"
      ? spec.points.map(({ y }) => y)
      : spec.kind === "donut"
        ? []
        : spec.series
            .filter(({ axis }) => axis === "left")
            .flatMap(({ values }) => values);
  const leftDomain = createNumericDomain(axisValues, {
    min: spec.yMin,
    max: spec.yMax,
    includeZero: true,
  });
  const rightValues = spec.series
    .filter(({ axis }) => axis === "right")
    .flatMap(({ values }) => values);
  const rightDomain = rightValues.length
    ? createNumericDomain(rightValues, {
        min: spec.rightYMin,
        max: spec.rightYMax,
        includeZero: true,
      })
    : null;
  const xDomain =
    spec.kind === "scatter"
      ? createLinearDomain(
          spec.points.map(({ x }) => x),
          { min: spec.xMin, max: spec.xMax },
        )
      : null;
  const defs = `<defs><clipPath id="plot-clip"><rect x="${plot.x}" y="${plot.y}" width="${plot.width}" height="${plot.height}"/></clipPath></defs>`;
  const legendItems =
    spec.kind === "donut"
      ? spec.slices.map((slice, index) => ({
          label: slice.label,
          color: colors[index % colors.length],
          mark: "bar" as const,
        }))
      : spec.series.map((series, index) => ({
          label: series.label,
          color: colors[index % colors.length],
          mark: series.mark,
        }));
  const chartLegend = spec.showLegend
    ? legend(legendItems, plot.x, 112 + titleOffset)
    : "";
  let body = "";
  if (spec.kind === "donut") {
    body = donutMarks(spec, colors);
  } else if (spec.kind === "scatter" && xDomain) {
    const grid = axisTicks(
      leftDomain,
      plot,
      spec.locale,
      "left",
      spec.showGridlines,
    );
    const vertical = spec.showVerticalGridlines
      ? xDomain.ticks
          .map((value) => {
            const px = round(
              plot.x +
                ((value - xDomain.min) / (xDomain.max - xDomain.min)) *
                  plot.width,
            );
            return `<line data-axis="x-grid" x1="${px}" y1="${plot.y}" x2="${px}" y2="${plot.y + plot.height}" stroke="#d7d7d7"/><text data-axis="x" x="${px}" y="${plot.y + plot.height + 28}" text-anchor="middle" class="tick">${escapeXml(formatNumber(value, spec.locale))}</text>`;
          })
          .join("")
      : "";
    body = `${grid}${vertical}<line x1="${plot.x}" y1="${plot.y + plot.height}" x2="${plot.x + plot.width}" y2="${plot.y + plot.height}" stroke="#1a1a1a" stroke-width="1.5"/>${scatterMarks(spec, plot, colors, xDomain, leftDomain)}<text x="${plot.x + plot.width / 2}" y="${plot.y + plot.height + 62}" text-anchor="middle" class="axis-label">${escapeXml(spec.xLabel)}</text><text transform="translate(34 ${plot.y + plot.height / 2}) rotate(-90)" text-anchor="middle" class="axis-label">${escapeXml(unitLabel(spec.yLabel, spec.unit))}</text>`;
  } else {
    const grid = axisTicks(
      leftDomain,
      plot,
      spec.locale,
      "left",
      spec.showGridlines,
    );
    const rightTicks = rightDomain
      ? axisTicks(rightDomain, plot, spec.locale, "right", false)
      : "";
    const vertical = spec.showVerticalGridlines
      ? spec.categories
          .map((_, index) => {
            const step = plot.width / spec.categories.length;
            const px = round(plot.x + step * (index + 0.5));
            return `<line data-axis="x-grid" x1="${px}" y1="${plot.y}" x2="${px}" y2="${plot.y + plot.height}" stroke="#d7d7d7"/>`;
          })
          .join("")
      : "";
    const zeroY = round(
      plot.y +
        plot.height -
        ((0 - leftDomain.min) / (leftDomain.max - leftDomain.min)) *
          plot.height,
    );
    const axisLabels = `${categoryLabels(spec, plot)}<text x="${plot.x + plot.width / 2}" y="${plot.y + plot.height + 62}" text-anchor="middle" class="axis-label">${escapeXml(spec.xLabel)}</text><text transform="translate(34 ${plot.y + plot.height / 2}) rotate(-90)" text-anchor="middle" class="axis-label">${escapeXml(unitLabel(spec.yLabel, spec.unit))}</text>${rightDomain ? `<text transform="translate(976 ${plot.y + plot.height / 2}) rotate(90)" text-anchor="middle" class="axis-label">${escapeXml(unitLabel(spec.rightYLabel, spec.rightYUnit))}</text>` : ""}`;
    body = `${grid}${rightTicks}${vertical}<line x1="${plot.x}" y1="${zeroY}" x2="${plot.x + plot.width}" y2="${zeroY}" stroke="#1a1a1a" stroke-width="1.5"/>${cartesianMarks(spec, colors, plot, leftDomain, rightDomain)}${axisLabels}`;
  }
  const sourceText = spec.sources.length
    ? spec.sources.map(({ id, title }) => `${id}: ${title}`).join(" · ")
    : spec.locale === "cs"
      ? "Data poskytnutá uživatelem"
      : "User-provided data";
  const title = escapeXml(spec.title);
  const subtitle = escapeXml(spec.subtitle || `${spec.kind} chart`);
  const sourcePrefix = spec.locale === "cs" ? "Zdroje" : "Sources";
  const changeAnnotation = barChangeAnnotation(spec, plot.x);
  const styles =
    "text{font-family:Verdana,Geneva,sans-serif;fill:#1a1a1a}.title{font-size:30px;font-weight:700}.subtitle{font-size:14px;fill:#666}.tick{font-size:11px}.legend{font-size:12px}.axis-label{font-size:13px;font-weight:700}.value-label,.slice-label{font-size:11px}.change-note{font-size:10px;font-weight:700}.center-label{font-size:17px;font-weight:700}.source{font-size:9px;fill:#666}";
  const titleMarkup = `<text id="figure-title-text" x="${plot.x + plot.width / 2}" y="52" text-anchor="middle" class="title">${titleLines.map((line, index) => `<tspan x="${plot.x + plot.width / 2}" dy="${index ? 32 : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="figure-title figure-desc" data-chart-kind="${spec.kind}">${defs}<title id="figure-title">${title}</title><desc id="figure-desc">${subtitle}</desc><style>${styles}</style><rect width="${width}" height="${height}" fill="#fff"/>${titleMarkup}<text x="${plot.x}" y="${82 + titleOffset}" class="subtitle">${subtitle}</text>${chartLegend}${body}${changeAnnotation}<text x="${plot.x}" y="640" class="source">${sourcePrefix}: ${escapeXml(sourceText)}</text></svg>`;
}

export function createGraphReport(
  spec: GraphSpec,
  checks: GraphCheck[],
  model: string,
  swatches: RenderSwatch[] = [],
) {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      generator: "Taktik Robot Figure Generator",
      model,
      palette: swatches,
      spec,
      checks,
    },
    null,
    2,
  );
}
