import type {
  LayerPlan,
  LayerPlanItem,
  NormalizedBounds,
  TextRegion,
} from "../types";

export const MAX_LAYER_COUNT = 8;

const DEFAULT_BOUNDS: NormalizedBounds = {
  x: 0.05,
  y: 0.05,
  width: 0.9,
  height: 0.9,
};

function cleanText(value: unknown, fallback: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}

function number(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function parseBounds(
  value: unknown,
  fallback = DEFAULT_BOUNDS,
): NormalizedBounds {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const x = Math.min(1, Math.max(0, number(source.x, fallback.x)));
  const y = Math.min(1, Math.max(0, number(source.y, fallback.y)));
  const right = Math.min(
    1,
    Math.max(x, number(source.x, x) + number(source.width, fallback.width)),
  );
  const bottom = Math.min(
    1,
    Math.max(y, number(source.y, y) + number(source.height, fallback.height)),
  );
  return { x, y, width: right - x, height: bottom - y };
}

function validBounds(bounds: NormalizedBounds) {
  return bounds.width >= 0.005 && bounds.height >= 0.005;
}

function parseTextRegions(value: unknown): TextRegion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const source =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      const bounds = parseBounds(source.bounds, {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      });
      return {
        description: cleanText(
          source.description,
          "Visible text in the supplied image.",
          300,
        ),
        bounds,
      };
    })
    .filter(({ bounds }) => validBounds(bounds))
    .slice(0, 20);
}

export function parseLayerPlan(value: unknown): LayerPlan {
  const candidate =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  if (!Array.isArray(candidate.layers))
    throw new Error("The layer analysis did not return a layer list.");

  const rawItems = candidate.layers.slice(0, MAX_LAYER_COUNT * 2);
  const seen = new Set<string>();
  const layers: LayerPlanItem[] = rawItems
    .map((item, index) => {
      const source =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      const name = cleanText(source.name, `Object ${index + 1}`, 80);
      const idBase =
        cleanText(
          source.id,
          name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          50,
        ).replace(/^-|-$/g, "") || `object-${index + 1}`;
      let id = idBase;
      let suffix = 2;
      while (seen.has(id)) id = `${idBase}-${suffix++}`;
      seen.add(id);

      const visibleBounds = parseBounds(source.visibleBounds ?? source.bounds);
      const reconstructionBounds = parseBounds(
        source.reconstructionBounds ?? source.bounds ?? visibleBounds,
        visibleBounds,
      );
      const expanded = {
        x: Math.min(visibleBounds.x, reconstructionBounds.x),
        y: Math.min(visibleBounds.y, reconstructionBounds.y),
        width:
          Math.max(
            visibleBounds.x + visibleBounds.width,
            reconstructionBounds.x + reconstructionBounds.width,
          ) - Math.min(visibleBounds.x, reconstructionBounds.x),
        height:
          Math.max(
            visibleBounds.y + visibleBounds.height,
            reconstructionBounds.y + reconstructionBounds.height,
          ) - Math.min(visibleBounds.y, reconstructionBounds.y),
      };
      const order = number(source.order, index);
      const occludedBy = Array.isArray(source.occludedBy)
        ? source.occludedBy.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
      return {
        id,
        name,
        description: cleanText(
          source.description,
          `The complete visible and hidden parts of the ${name.toLowerCase()}.`,
          700,
        ),
        order,
        visibleBounds,
        reconstructionBounds: parseBounds(expanded, visibleBounds),
        occludedBy,
      };
    })
    .filter(
      ({ visibleBounds, reconstructionBounds }) =>
        validBounds(visibleBounds) && validBounds(reconstructionBounds),
    )
    .slice(0, MAX_LAYER_COUNT);

  if (!layers.length)
    throw new Error("No separable objects were detected in the image.");

  const ids = new Set(layers.map((layer) => layer.id));
  return {
    backgroundDescription: cleanText(
      candidate.backgroundDescription,
      "A complete uninterrupted background with all foreground objects and text removed.",
      1000,
    ),
    textRegions: parseTextRegions(candidate.textRegions),
    layers: layers
      .map((layer) => ({
        ...layer,
        occludedBy: layer.occludedBy.filter(
          (id) => ids.has(id) && id !== layer.id,
        ),
      }))
      .sort((a, b) => b.order - a.order),
  };
}

export function parseJsonObject(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start)
      throw new Error("The layer analysis returned invalid JSON.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}
