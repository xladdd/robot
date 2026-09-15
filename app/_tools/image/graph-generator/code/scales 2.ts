export type NumericDomain = {
  min: number;
  max: number;
  step: number;
  ticks: number[];
};

export type NumberLocale = "en" | "cs";

function finiteOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function decimalPlaces(value: number) {
  if (!Number.isFinite(value) || value === 0) return 0;
  const rendered = Math.abs(value).toString().toLowerCase();
  if (rendered.includes("e-")) {
    const exponent = Number(rendered.split("e-")[1]);
    return Math.min(6, exponent);
  }
  const decimal = rendered.split(".")[1];
  return Math.min(6, decimal?.length ?? 0);
}

export function formatNumber(value: number, locale: NumberLocale = "en") {
  const safeValue = Math.abs(value) < 1e-10 ? 0 : value;
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-US", {
    maximumFractionDigits: decimalPlaces(safeValue),
  }).format(safeValue);
}

export function niceStep(span: number, targetIntervals = 4) {
  const safeSpan = Math.abs(span) || 1;
  const rough = safeSpan / Math.max(1, targetIntervals);
  const exponent = Math.floor(Math.log10(rough));
  const scale = 10 ** exponent;
  const normalized = rough / scale;
  const multiplier =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 2.5
          ? 2.5
          : normalized <= 5
            ? 5
            : 10;
  return multiplier * scale;
}

function tickValues(min: number, max: number, step: number) {
  const ticks: number[] = [];
  const first = Math.ceil((min - step * 1e-9) / step) * step;
  const last = Math.floor((max + step * 1e-9) / step) * step;
  for (
    let value = first, index = 0;
    value <= last + step * 1e-9 && index < 100;
    value += step, index += 1
  ) {
    const rounded = Number(value.toPrecision(12));
    if (!ticks.length || rounded !== ticks[ticks.length - 1])
      ticks.push(rounded);
  }
  return ticks.length >= 2 ? ticks : [min, max];
}

export function createNumericDomain(
  values: number[],
  options: {
    min?: number | null;
    max?: number | null;
    includeZero?: boolean;
    targetIntervals?: number;
  } = {},
): NumericDomain {
  const finiteValues = values.filter(Number.isFinite);
  const rawMin = finiteValues.length ? Math.min(...finiteValues) : 0;
  const rawMax = finiteValues.length ? Math.max(...finiteValues) : 1;
  const includeZero = options.includeZero ?? true;
  const explicitMin = finiteOr(options.min, Number.NaN);
  const explicitMax = finiteOr(options.max, Number.NaN);
  const hasExplicitBounds =
    Number.isFinite(explicitMin) &&
    Number.isFinite(explicitMax) &&
    explicitMin < explicitMax;
  const baseMin = hasExplicitBounds
    ? explicitMin
    : includeZero
      ? Math.min(0, rawMin)
      : rawMin;
  const baseMax = hasExplicitBounds
    ? explicitMax
    : includeZero
      ? Math.max(0, rawMax)
      : rawMax;
  const targetIntervals =
    options.targetIntervals ?? (hasExplicitBounds ? 6 : 4);
  const step = niceStep(baseMax - baseMin, targetIntervals);
  const min = hasExplicitBounds ? baseMin : Math.floor(baseMin / step) * step;
  const max = hasExplicitBounds
    ? baseMax
    : Math.ceil(baseMax / step) * step || min + step;
  const ticks = tickValues(min, max, step);
  if (hasExplicitBounds) {
    if (ticks[0] !== min) ticks.unshift(min);
    if (ticks[ticks.length - 1] !== max) ticks.push(max);
  }
  return { min, max, step, ticks };
}

export function createLinearDomain(
  values: number[],
  options: {
    min?: number | null;
    max?: number | null;
  } = {},
) {
  return createNumericDomain(values, {
    ...options,
    includeZero: false,
  });
}
