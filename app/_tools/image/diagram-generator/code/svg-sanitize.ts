import {
  finiteCoordinate,
  isRecord,
  normalizeBrief,
  rejectDangerousKeys,
  safeId,
  text,
  type BiologicalBriefV1,
  type VectorObjectManifest,
  type VectorReconstructionV1,
} from "./contracts.ts";

const allowedTags = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
]);
const allowedAttributes = new Set([
  "xmlns",
  "viewbox",
  "width",
  "height",
  "id",
  "data-object-id",
  "data-role",
  "data-layer",
  "transform",
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "opacity",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "points",
  "d",
]);
const colour = /^(?:none|#[0-9a-f]{3,8})$/i;
const numeric = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?$/i;
const transform = /^(?:(?:translate|rotate|scale)\s*\([^()]{1,80}\)\s*)+$/;

function escapedAttribute(value: string) {
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

function parseAttributes(source: string, tagName: string) {
  const attributes: Array<[string, string]> = [];
  let offset = 0;
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(["'])([\s\S]*?)\2/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    if (source.slice(offset, match.index).trim())
      throw new Error(`Unexpected SVG attribute syntax on <${tagName}>.`);
    const name = match[1];
    const lower = name.toLowerCase();
    if (!allowedAttributes.has(lower))
      throw new Error(`SVG attribute ${name} is not allowed.`);
    if (attributes.some(([existing]) => existing.toLowerCase() === lower))
      throw new Error(`SVG attribute ${name} is duplicated.`);
    attributes.push([name, match[3]]);
    offset = pattern.lastIndex;
  }
  if (source.slice(offset).trim())
    throw new Error(`Malformed SVG attributes on <${tagName}>.`);
  return attributes;
}

function validateAttribute(tagName: string, name: string, value: string) {
  const lower = name.toLowerCase();
  if (lower === "xmlns" && value !== "http://www.w3.org/2000/svg")
    throw new Error("SVG must use the standard SVG namespace.");
  if (["fill", "stroke"].includes(lower) && !colour.test(value))
    throw new Error(`SVG ${lower} values must be solid colours or none.`);
  if (lower.endsWith("opacity")) {
    if (!numeric.test(value) || Number(value) < 0 || Number(value) > 1)
      throw new Error(`SVG ${name} must be between 0 and 1.`);
  }
  if (lower === "stroke-width" || lower === "stroke-miterlimit") {
    if (!numeric.test(value) || Number(value) < 0 || Number(value) > 100)
      throw new Error(`SVG ${name} has an invalid numeric value.`);
  }
  if (lower === "stroke-linecap" && !/^(butt|round|square)$/.test(value))
    throw new Error("SVG stroke-linecap is invalid.");
  if (lower === "stroke-linejoin" && !/^(miter|round|bevel)$/.test(value))
    throw new Error("SVG stroke-linejoin is invalid.");
  if (
    [
      "x",
      "y",
      "x1",
      "y1",
      "x2",
      "y2",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "width",
      "height",
    ].includes(lower)
  ) {
    if (!numeric.test(value) || Math.abs(Number(value)) > 100_000)
      throw new Error(`SVG ${name} has an invalid coordinate.`);
  }
  if (
    lower === "transform" &&
    (!transform.test(value) || /url|matrix/i.test(value))
  )
    throw new Error(
      "SVG transforms are limited to translate, rotate, and scale.",
    );
  if (lower === "d") {
    if (
      value.length > 20_000 ||
      /[^\d\s.,eE+\-MmLlHhVvCcSsQqTtAaZz]/.test(value)
    )
      throw new Error(
        "SVG path data contains unsupported commands or is too complex.",
      );
  }
  if (lower === "points") {
    if (value.length > 20_000 || /[^\d\s.,eE+\-]/.test(value))
      throw new Error("SVG polygon geometry contains unsupported data.");
  }
  if (lower === "data-object-id") safeId(value, `${tagName} data-object-id`);
  if (lower === "id") safeId(value, `${tagName} id`);
  if (/[<>]|javascript:|data:|url\s*\(/i.test(value))
    throw new Error("SVG contains an external or executable value.");
}

function sanitizeElement(
  tagName: string,
  rawAttributes: string,
  selfClosing: string,
) {
  const lowerTag = tagName.toLowerCase();
  if (!allowedTags.has(lowerTag))
    throw new Error(`SVG element <${tagName}> is not allowed.`);
  const attributes = parseAttributes(rawAttributes, tagName);
  for (const [name, value] of attributes)
    validateAttribute(tagName, name, value);
  if (
    lowerTag === "svg" &&
    !attributes.some(([name]) => name.toLowerCase() === "viewbox")
  )
    throw new Error("SVG root must define a viewBox.");
  return `<${lowerTag}${attributes.map(([name, value]) => ` ${name}="${escapedAttribute(value)}"`).join("")}${selfClosing ? "/" : ""}>`;
}

export function sanitizeSvg(
  input: string,
  expectedWidth: number,
  expectedHeight: number,
) {
  if (typeof input !== "string" || input.length < 20 || input.length > 500_000)
    throw new Error("The vector model returned an SVG of an invalid size.");
  if (
    /<!DOCTYPE|<!--|<\?xml|<\s*(script|style|foreignObject|image|use|filter|mask|clipPath|pattern|animate)\b/i.test(
      input,
    )
  )
    throw new Error(
      "The vector SVG contains a prohibited element or declaration.",
    );
  const root = input.match(/^\s*<svg\b([^>]*)>([\s\S]*)<\/svg\s*>\s*$/i);
  if (!root) throw new Error("The vector model did not return one SVG root.");
  const rootStart = sanitizeElement("svg", root[1], "");
  const rootAttributes = parseAttributes(root[1], "svg");
  const viewBox =
    rootAttributes.find(([name]) => name.toLowerCase() === "viewbox")?.[1] ||
    "";
  const viewValues = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    viewValues.length !== 4 ||
    viewValues.some((value) => !Number.isFinite(value) || value < 0)
  )
    throw new Error("The vector SVG has an invalid viewBox.");
  if (
    viewValues[0] !== 0 ||
    viewValues[1] !== 0 ||
    viewValues[2] !== expectedWidth ||
    viewValues[3] !== expectedHeight
  )
    throw new Error(
      `The vector SVG viewBox must be 0 0 ${expectedWidth} ${expectedHeight}.`,
    );

  const body = root[2];
  let output = "";
  let cursor = 0;
  const stack: string[] = [];
  const token = /<\s*(\/?)\s*([A-Za-z][A-Za-z0-9]*)\b([^>]*?)(\/?)\s*>/g;
  let match: RegExpExecArray | null;
  let elementCount = 0;
  let pathCount = 0;
  const objectIds = new Set<string>();
  const objectPositions = new Map<string, number[]>();
  while ((match = token.exec(body))) {
    if (body.slice(cursor, match.index).trim())
      throw new Error("SVG text nodes are not allowed in the model layer.");
    cursor = token.lastIndex;
    const closing = Boolean(match[1]);
    const tagName = match[2].toLowerCase();
    if (closing) {
      if (match[3].trim() || match[4])
        throw new Error("Malformed SVG closing tag.");
      if (stack.pop() !== tagName)
        throw new Error("SVG elements are not correctly nested.");
      output += `</${tagName}>`;
      continue;
    }
    if (tagName === "svg") throw new Error("Nested SVG roots are not allowed.");
    const start = sanitizeElement(tagName, match[3], match[4] ? "/" : "");
    const attrs = parseAttributes(match[3], tagName);
    const objectId = attrs.find(
      ([name]) => name.toLowerCase() === "data-object-id",
    )?.[1];
    if (objectId) {
      objectIds.add(objectId);
      const positions = objectPositions.get(objectId) || [];
      positions.push(elementCount);
      objectPositions.set(objectId, positions);
    }
    if (tagName !== "g" && !objectId)
      throw new Error(
        `Every SVG shape must have a data-object-id (${tagName}).`,
      );
    elementCount += 1;
    if (tagName === "path") pathCount += 1;
    if (elementCount > 400 || pathCount > 160)
      throw new Error("The vector SVG is too complex for an editable diagram.");
    output += start;
    if (!match[4]) stack.push(tagName);
  }
  if (body.slice(cursor).trim())
    throw new Error("SVG contains unsupported text or malformed markup.");
  if (stack.length) throw new Error("SVG elements are not correctly nested.");
  if (!output) throw new Error("The vector model returned an empty SVG.");
  return {
    inner: output,
    elementCount,
    pathCount,
    objectIds,
    objectPositions,
    root: rootStart,
  };
}

export function validateManifestLayering(
  objects: VectorObjectManifest[],
  objectIds: Set<string>,
  objectPositions: Map<string, number[]>,
) {
  const manifestIds = new Set(objects.map((object) => object.id));
  const firstManifestPosition = Math.min(
    ...objects.flatMap((object) => objectPositions.get(object.id) || []),
  );
  const decorativeBackgroundIds = new Set(["background", "canvas-background"]);
  for (const object of objects)
    if (!objectIds.has(object.id))
      throw new Error(
        `Vector manifest object ${object.id} is missing from the SVG.`,
      );
  for (const objectId of objectIds) {
    if (manifestIds.has(objectId)) continue;
    const positions = objectPositions.get(objectId) || [];
    const isRearBackground =
      decorativeBackgroundIds.has(objectId) &&
      positions.length > 0 &&
      positions.every((position) => position < firstManifestPosition);
    if (!isRearBackground)
      throw new Error(
        `SVG object ${objectId} is missing from the vector manifest.`,
      );
  }
  for (const object of objects) {
    const foreground = objectPositions.get(object.id) || [];
    const firstForeground = Math.min(...foreground);
    for (const underlyingId of object.underlyingObjectIds) {
      const underlying = objectPositions.get(underlyingId) || [];
      const lastUnderlying = Math.max(...underlying);
      if (lastUnderlying >= firstForeground)
        throw new Error(
          `Underlying object ${underlyingId} must be fully behind ${object.id} in SVG order.`,
        );
    }
  }
}

function normalizedPoint(value: unknown, name: string) {
  if (!isRecord(value)) throw new Error(`${name} is missing.`);
  return {
    x: finiteCoordinate(value.x, `${name}.x`),
    y: finiteCoordinate(value.y, `${name}.y`),
  };
}

export function normalizeReconstruction(
  input: unknown,
  briefInput: BiologicalBriefV1 | unknown,
): VectorReconstructionV1 {
  rejectDangerousKeys(input, "reconstruction");
  const brief = normalizeBrief(briefInput);
  if (!isRecord(input) || input.version !== 1)
    throw new Error("The vector model did not return VectorReconstructionV1.");
  const rawCanvas = isRecord(input.canvas) ? input.canvas : {};
  const width = rawCanvas.width;
  const height = rawCanvas.height;
  if (width !== 1000 || height !== 750)
    throw new Error("Vector reconstruction canvas must be 1000 by 750.");
  const rawObjects = Array.isArray(input.objects) ? input.objects : [];
  if (!rawObjects.length || rawObjects.length > 80)
    throw new Error(
      "Vector reconstruction must contain between 1 and 80 objects.",
    );
  const briefIds = new Set(brief.structures.map((item) => item.id));
  const objectIds = new Set<string>();
  const objects: VectorObjectManifest[] = rawObjects.map((value, index) => {
    if (!isRecord(value))
      throw new Error(`Vector object ${index + 1} is invalid.`);
    const id = safeId(value.id, `Vector object ${index + 1} id`);
    if (objectIds.has(id))
      throw new Error(`Vector object ID ${id} is duplicated.`);
    objectIds.add(id);
    const role = value.role;
    if (
      role !== "background" &&
      role !== "base" &&
      role !== "structure" &&
      role !== "detail"
    )
      throw new Error(`Vector object ${id} uses an unsupported role.`);
    const briefStructureId =
      value.briefStructureId === null || value.briefStructureId === undefined
        ? null
        : safeId(value.briefStructureId, `${id} briefStructureId`);
    if (briefStructureId && !briefIds.has(briefStructureId))
      throw new Error(
        `Vector object ${id} references an unknown brief structure.`,
      );
    const underlying = (
      Array.isArray(value.underlyingObjectIds) ? value.underlyingObjectIds : []
    )
      .slice(0, 16)
      .map((item, childIndex) =>
        safeId(item, `${id} underlyingObjectIds[${childIndex}]`),
      );
    return {
      id,
      briefStructureId,
      role,
      description: text(value.description, 240),
      anchor: normalizedPoint(value.anchor, `${id} anchor`),
      labelPosition:
        value.labelPosition === null || value.labelPosition === undefined
          ? null
          : normalizedPoint(value.labelPosition, `${id} labelPosition`),
      complete: value.complete === true,
      underlyingObjectIds: underlying,
    };
  });
  const baseObjects = objects.filter((item) => item.role === "base");
  if (!baseObjects.length || baseObjects.some((item) => !item.complete))
    throw new Error(
      "Vector reconstruction must contain a base shape declared complete.",
    );
  for (const object of objects) {
    if (
      (object.role === "structure" || object.role === "detail") &&
      !object.complete
    )
      throw new Error(
        `Movable vector object ${object.id} must be declared complete.`,
      );
    for (const underlyingId of object.underlyingObjectIds) {
      if (underlyingId === object.id || !objectIds.has(underlyingId))
        throw new Error(
          `Vector object ${object.id} references an invalid underlying object ${underlyingId}.`,
        );
    }
    if (
      (object.role === "structure" || object.role === "detail") &&
      !object.underlyingObjectIds.length
    )
      throw new Error(
        `Movable vector object ${object.id} must identify its complete underlying object.`,
      );
  }
  const dependencies = new Map(
    objects.map((object) => [object.id, object.underlyingObjectIds]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id))
      throw new Error(
        `Vector underlay relationships contain a cycle at ${id}.`,
      );
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of dependencies.get(id) || []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const object of objects) visit(object.id);
  const mappedBriefIds = new Set(
    objects.map((object) => object.briefStructureId).filter(Boolean),
  );
  const missingRequired = brief.structures.filter(
    (structure) => structure.required && !mappedBriefIds.has(structure.id),
  );
  if (missingRequired.length)
    throw new Error(
      `Vector reconstruction is missing required structures: ${missingRequired.map((item) => item.name).join(", ")}.`,
    );
  const svg = text(input.svg, 500_000);
  if (!svg) throw new Error("Vector reconstruction is missing SVG markup.");
  const uncertainties = (
    Array.isArray(input.uncertainties) ? input.uncertainties : []
  )
    .map((item) => text(item, 240))
    .filter(Boolean)
    .slice(0, 16);
  return {
    version: 1,
    canvas: { width: 1000, height: 750 },
    objects,
    uncertainties,
    svg,
  };
}
