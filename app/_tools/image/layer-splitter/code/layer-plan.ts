import type {
  LayerPlan,
  LayerPlanItem,
  LayerSplitterQuality,
  NormalizedBounds,
  ShadowRegion,
  SubjectKind,
  SupportOcclusion,
  SupportSurface,
  TextRegion,
} from "../types";

export const MAX_LAYER_COUNT = 8;
const MAX_SUPPORT_SURFACE_COUNT = 8;
const MIN_REGENERATION_BOUNDS_AREA = 0.015;
const MIN_REGENERATION_BOUND_DIMENSION = 0.08;
const MIN_REGENERATION_PIXEL_FRACTION = 0.01;

const SUBJECT_KINDS = new Set<SubjectKind>([
  "person",
  "animal",
  "plant",
  "object",
]);
const FOREGROUND_BODY_PART_PATTERN =
  /\b(heads?|faces?|necks?|shoulders?|arms?|forearms?|elbows?|wrists?|hands?|fingers?|upper bod(?:y|ies)|torsos?|chests?|paws?|forelegs?|front legs?|hoofs?|hooves|wings?)\b/i;

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

function cleanId(value: unknown, fallback: string) {
  return cleanText(value, fallback, 50).replace(/^-|-$/g, "");
}

function parseSubjectKind(value: unknown): SubjectKind {
  return typeof value === "string" && SUBJECT_KINDS.has(value as SubjectKind)
    ? (value as SubjectKind)
    : "object";
}

function parseSupportOcclusion(value: unknown): SupportOcclusion | undefined {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const supportSurfaceId = cleanId(source.supportSurfaceId, "");
  const foregroundPartsDescription = cleanText(
    source.foregroundPartsDescription,
    "",
    500,
  );
  if (!supportSurfaceId || !foregroundPartsDescription) return undefined;
  return { supportSurfaceId, foregroundPartsDescription };
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

const SUPPORT_SURFACE_PATTERN =
  /\b(table(?:top)?|desk(?:top)?|counter(?:top)?|floor|ground|work surface)\b/i;

function isSceneSpanningSupportSurface(layer: LayerPlanItem) {
  const bounds = layer.visibleBounds;
  const description = `${layer.name} ${layer.description}`;
  const reachesLeft = bounds.x <= 0.08;
  const reachesRight = bounds.x + bounds.width >= 0.92;
  const reachesBottom = bounds.y + bounds.height >= 0.95;
  return (
    SUPPORT_SURFACE_PATTERN.test(description) &&
    bounds.y >= 0.35 &&
    bounds.width >= 0.75 &&
    reachesLeft &&
    reachesRight &&
    reachesBottom
  );
}

function parseSupportSurfaces(value: unknown): SupportSurface[] {
  if (!Array.isArray(value)) return [];
  const surfaces: SupportSurface[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const source =
      value[index] && typeof value[index] === "object"
        ? (value[index] as Record<string, unknown>)
        : {};
    const name = cleanText(source.name, `Support surface ${index + 1}`, 80);
    const id = cleanId(
      source.id,
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    );
    const bounds = parseBounds(source.bounds ?? source.visibleBounds);
    if (!id || seen.has(id) || !validBounds(bounds)) continue;
    seen.add(id);
    surfaces.push({
      id,
      name,
      description: cleanText(
        source.description,
        `The complete visible ${name.toLowerCase()}.`,
        700,
      ),
      order: number(source.order, index),
      bounds,
    });
    if (surfaces.length >= MAX_SUPPORT_SURFACE_COUNT) break;
  }
  return surfaces;
}

function supportSurfaceFromLayer(layer: LayerPlanItem): SupportSurface {
  return {
    id: layer.id,
    name: layer.name,
    description: layer.description,
    order: layer.order,
    bounds: layer.visibleBounds,
  };
}

function hasMaterialReconstructionExpansion(layer: LayerPlanItem) {
  const visible = layer.visibleBounds;
  const reconstruction = layer.reconstructionBounds;
  const visibleArea = visible.width * visible.height;
  const reconstructionArea = reconstruction.width * reconstruction.height;
  const edgeExpansion = Math.max(
    visible.x - reconstruction.x,
    visible.y - reconstruction.y,
    reconstruction.x + reconstruction.width - (visible.x + visible.width),
    reconstruction.y + reconstruction.height - (visible.y + visible.height),
  );
  return reconstructionArea >= visibleArea * 1.2 || edgeExpansion >= 0.03;
}

export function shouldRegenerateFullSubject(
  layer: LayerPlanItem,
  quality: LayerSplitterQuality,
  visiblePixelFraction?: number,
) {
  if (quality !== "fidelity") return false;
  if (layer.subjectKind !== "person" && layer.subjectKind !== "animal")
    return false;
  const supportOcclusion = layer.supportOcclusion;
  if (
    !supportOcclusion?.supportSurfaceId ||
    !supportOcclusion.foregroundPartsDescription.trim()
  )
    return false;

  const visibleArea = layer.visibleBounds.width * layer.visibleBounds.height;
  if (
    layer.visibleBounds.width < MIN_REGENERATION_BOUND_DIMENSION ||
    layer.visibleBounds.height < MIN_REGENERATION_BOUND_DIMENSION ||
    visibleArea < MIN_REGENERATION_BOUNDS_AREA
  )
    return false;
  if (
    visiblePixelFraction !== undefined &&
    (!Number.isFinite(visiblePixelFraction) ||
      visiblePixelFraction < MIN_REGENERATION_PIXEL_FRACTION ||
      visiblePixelFraction > 1)
  )
    return false;

  return (
    hasMaterialReconstructionExpansion(layer) ||
    FOREGROUND_BODY_PART_PATTERN.test(
      supportOcclusion.foregroundPartsDescription,
    )
  );
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

function parseShadowRegions(value: unknown): ShadowRegion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const source =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      return {
        ownerId: cleanText(source.ownerId, "", 50),
        description: cleanText(
          source.description,
          "Cast and contact shadow caused by the foreground object.",
          400,
        ),
        bounds: parseBounds(source.bounds, {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        }),
      };
    })
    .filter(({ ownerId, bounds }) => ownerId && validBounds(bounds))
    .slice(0, MAX_LAYER_COUNT * 2);
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
  const plannedLayers: LayerPlanItem[] = rawItems
    .map((item, index) => {
      const source =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      const name = cleanText(source.name, `Object ${index + 1}`, 80);
      const idBase =
        cleanId(source.id, name.toLowerCase().replace(/[^a-z0-9]+/g, "-")) ||
        `object-${index + 1}`;
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
      const supportOcclusion = parseSupportOcclusion(source.supportOcclusion);
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
        subjectKind: parseSubjectKind(source.subjectKind),
        ...(supportOcclusion ? { supportOcclusion } : {}),
      };
    })
    .filter(
      ({ visibleBounds, reconstructionBounds }) =>
        validBounds(visibleBounds) && validBounds(reconstructionBounds),
    );

  const explicitSupportSurfaces = parseSupportSurfaces(
    candidate.supportSurfaces,
  );
  const supportSurfaces: SupportSurface[] = [];
  const seenSupportSurfaceIds = new Set<string>();
  for (const surface of [
    ...explicitSupportSurfaces,
    ...plannedLayers
      .filter(isSceneSpanningSupportSurface)
      .map(supportSurfaceFromLayer),
  ]) {
    if (seenSupportSurfaceIds.has(surface.id)) continue;
    seenSupportSurfaceIds.add(surface.id);
    supportSurfaces.push(surface);
    if (supportSurfaces.length >= MAX_SUPPORT_SURFACE_COUNT) break;
  }
  supportSurfaces.sort((a, b) => b.order - a.order);

  const layers = plannedLayers
    .filter((layer) => !isSceneSpanningSupportSurface(layer))
    .slice(0, MAX_LAYER_COUNT);
  if (!layers.length)
    throw new Error("No separable objects were detected in the image.");

  const ids = new Set(layers.map((layer) => layer.id));
  const supportSurfaceIds = new Set(
    supportSurfaces.map((surface) => surface.id),
  );
  return {
    backgroundDescription: cleanText(
      candidate.backgroundDescription,
      "A complete uninterrupted background with all foreground objects and text removed.",
      1000,
    ),
    textRegions: parseTextRegions(candidate.textRegions),
    shadowRegions: parseShadowRegions(candidate.shadowRegions).filter(
      ({ ownerId }) => ids.has(ownerId),
    ),
    supportSurfaces,
    layers: layers
      .map((layer) => {
        const {
          supportOcclusion: plannedSupportOcclusion,
          ...layerWithoutSupportOcclusion
        } = layer;
        const supportOcclusion =
          plannedSupportOcclusion &&
          supportSurfaceIds.has(plannedSupportOcclusion.supportSurfaceId)
            ? plannedSupportOcclusion
            : undefined;
        return {
          ...layerWithoutSupportOcclusion,
          occludedBy: layer.occludedBy.filter(
            (id) => ids.has(id) && id !== layer.id,
          ),
          ...(supportOcclusion ? { supportOcclusion } : {}),
        };
      })
      .sort((a, b) => b.order - a.order),
  };
}

type JsonTokenKind =
  | "open-object"
  | "close-object"
  | "open-array"
  | "close-array"
  | "colon"
  | "comma"
  | "string"
  | "number"
  | "literal"
  | "unknown";

type JsonToken = {
  kind: JsonTokenKind;
  start: number;
  end: number;
};

function tokenizeJson(value: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  const punctuation: Record<string, JsonTokenKind> = {
    "{": "open-object",
    "}": "close-object",
    "[": "open-array",
    "]": "close-array",
    ":": "colon",
    ",": "comma",
  };
  let index = 0;
  while (index < value.length) {
    if (/\s/.test(value[index])) {
      index++;
      continue;
    }
    const punctuationKind = punctuation[value[index]];
    if (punctuationKind) {
      tokens.push({ kind: punctuationKind, start: index, end: index + 1 });
      index++;
      continue;
    }
    if (value[index] === '"') {
      const start = index++;
      while (index < value.length) {
        if (value[index] === "\\") {
          index += 2;
          continue;
        }
        if (value[index++] === '"') break;
      }
      tokens.push({ kind: "string", start, end: index });
      continue;
    }
    const numberMatch = value
      .slice(index)
      .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (numberMatch) {
      tokens.push({
        kind: "number",
        start: index,
        end: index + numberMatch[0].length,
      });
      index += numberMatch[0].length;
      continue;
    }
    const literal = ["true", "false", "null"].find((candidate) =>
      value.startsWith(candidate, index),
    );
    if (literal) {
      tokens.push({
        kind: "literal",
        start: index,
        end: index + literal.length,
      });
      index += literal.length;
      continue;
    }
    tokens.push({ kind: "unknown", start: index, end: index + 1 });
    index++;
  }
  return tokens;
}

const JSON_VALUE_STARTS = new Set<JsonTokenKind>([
  "open-object",
  "open-array",
  "string",
  "number",
  "literal",
]);
const JSON_VALUE_ENDS = new Set<JsonTokenKind>([
  "close-object",
  "close-array",
  "string",
  "number",
  "literal",
]);

function repairCommonJsonSeparators(value: string) {
  const tokens = tokenizeJson(value);
  const insertBefore = new Set<number>();
  const remove = new Set<number>();
  const containers: Array<"object" | "array"> = [];
  let previous: JsonToken | undefined;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (
      token.kind === "comma" &&
      (next?.kind === "close-object" || next?.kind === "close-array")
    ) {
      remove.add(token.start);
      continue;
    }
    if (
      containers.length > 0 &&
      previous &&
      JSON_VALUE_ENDS.has(previous.kind) &&
      JSON_VALUE_STARTS.has(token.kind)
    )
      insertBefore.add(token.start);

    if (token.kind === "open-object") containers.push("object");
    else if (token.kind === "open-array") containers.push("array");
    else if (token.kind === "close-object" || token.kind === "close-array")
      containers.pop();
    previous = token;
  }

  if (!insertBefore.size && !remove.size) return value;
  let repaired = "";
  let cursor = 0;
  for (const token of tokens) {
    repaired += value.slice(cursor, token.start);
    if (insertBefore.has(token.start)) repaired += ",";
    if (!remove.has(token.start))
      repaired += value.slice(token.start, token.end);
    cursor = token.end;
  }
  return repaired + value.slice(cursor);
}

export function parseJsonObject(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const extracted =
    start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const candidates = [cleaned, extracted];
  for (const candidate of [
    ...candidates,
    ...candidates.map(repairCommonJsonSeparators),
  ])
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next normalization before reporting the final parser error.
    }
  if (start < 0 || end <= start)
    throw new Error("The layer analysis returned invalid JSON.");
  return JSON.parse(repairCommonJsonSeparators(extracted));
}
