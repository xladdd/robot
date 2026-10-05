import type {
  BiologicalBriefV1,
  DiagramCheck,
  VectorObjectManifest,
} from "./contracts.ts";

type LabelLayout = {
  structureId: string;
  text: string;
  object: VectorObjectManifest;
  x: number;
  y: number;
  side: "left" | "right";
};

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

function coordinate(value: number, scale: number) {
  return ((value / 100) * scale).toFixed(2);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function objectByStructure(objects: VectorObjectManifest[]) {
  const priority: Record<VectorObjectManifest["role"], number> = {
    background: 0,
    detail: 1,
    base: 2,
    structure: 3,
  };
  const mapped = new Map<string, VectorObjectManifest>();
  for (const object of objects) {
    if (!object.briefStructureId) continue;
    const existing = mapped.get(object.briefStructureId);
    if (!existing || priority[object.role] > priority[existing.role])
      mapped.set(object.briefStructureId, object);
  }
  return mapped;
}

function spreadLabels(items: LabelLayout[]) {
  for (const side of ["left", "right"] as const) {
    const sideItems = items
      .filter((item) => item.side === side)
      .sort(
        (left, right) =>
          left.y - right.y || left.structureId.localeCompare(right.structureId),
      );
    const gap =
      sideItems.length > 1 ? Math.min(5, 86 / (sideItems.length - 1)) : 0;
    for (let index = 0; index < sideItems.length; index += 1) {
      const previous = sideItems[index - 1];
      if (previous)
        sideItems[index].y = Math.max(sideItems[index].y, previous.y + gap);
    }
    const overflow = sideItems.at(-1)?.y
      ? Math.max(0, sideItems.at(-1)!.y - 95)
      : 0;
    if (overflow) sideItems.forEach((item) => (item.y -= overflow));
    const underflow = sideItems[0]?.y ? Math.max(0, 5 - sideItems[0].y) : 0;
    if (underflow) sideItems.forEach((item) => (item.y += underflow));
  }
  return items;
}

function createLabelLayouts(
  brief: BiologicalBriefV1,
  objects: VectorObjectManifest[],
  checks: DiagramCheck[],
) {
  const mapped = objectByStructure(objects);
  const layouts: LabelLayout[] = [];
  for (const structure of brief.structures) {
    const object = mapped.get(structure.id);
    if (!object) {
      checks.push({
        level: "warning",
        message: `No vector object was confidently mapped to “${structure.name}”; its label was not invented.`,
      });
      continue;
    }
    const desired = object.labelPosition || {
      x: object.anchor.x < 50 ? 92 : 8,
      y: object.anchor.y,
    };
    const side = desired.x < object.anchor.x ? "left" : "right";
    layouts.push({
      structureId: structure.id,
      text: structure.name,
      object,
      x: clamp(desired.x, 5, 95),
      y: clamp(desired.y, 5, 95),
      side,
    });
  }
  return { mapped, layouts: spreadLabels(layouts) };
}

function renderRelationships(
  brief: BiologicalBriefV1,
  mapped: Map<string, VectorObjectManifest>,
  checks: DiagramCheck[],
) {
  const paths: string[] = [];
  brief.relationships.forEach((relationship, index) => {
    if (relationship.direction === "none") return;
    const from = mapped.get(relationship.from);
    const to = mapped.get(relationship.to);
    if (!from || !to) {
      checks.push({
        level: "warning",
        message: `The relationship “${relationship.relationship}” could not be drawn because an endpoint is unmapped.`,
      });
      return;
    }
    const fromX = coordinate(from.anchor.x, 1000);
    const fromY = coordinate(from.anchor.y, 750);
    const toX = coordinate(to.anchor.x, 1000);
    const toY = coordinate(to.anchor.y, 750);
    const markerStart =
      relationship.direction === "bidirectional"
        ? ' marker-start="url(#diagram-arrow-start)"'
        : "";
    const markerEnd = ' marker-end="url(#diagram-arrow-end)"';
    const labelX = ((Number(fromX) + Number(toX)) / 2).toFixed(2);
    const labelY = ((Number(fromY) + Number(toY)) / 2 - 7).toFixed(2);
    paths.push(
      `<g id="relationship-${index + 1}" data-from="${escapeXml(from.id)}" data-to="${escapeXml(to.id)}"><path d="M ${fromX} ${fromY} L ${toX} ${toY}" fill="none" stroke="#1a1a1a" stroke-width="2"${markerStart}${markerEnd}/>${relationship.relationship ? `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-family="Verdana,Geneva,sans-serif" font-size="13" fill="#1a1a1a">${escapeXml(relationship.relationship)}</text>` : ""}</g>`,
    );
  });
  if (paths.length)
    checks.push({
      level: "pass",
      message: `${paths.length} biological relationship${paths.length === 1 ? " was" : "s were"} added as separate editable SVG arrows.`,
    });
  return paths.join("");
}

export function appendEditableAnnotations(
  inner: string,
  brief: BiologicalBriefV1,
  objects: VectorObjectManifest[],
) {
  const checks: DiagramCheck[] = [];
  const { mapped, layouts } = createLabelLayouts(brief, objects, checks);
  const relationships = renderRelationships(brief, mapped, checks);
  const labels = layouts.map((layout) => {
    const targetX = coordinate(layout.object.anchor.x, 1000);
    const targetY = coordinate(layout.object.anchor.y, 750);
    const x = coordinate(layout.x, 1000);
    const y = coordinate(layout.y, 750);
    const anchor = layout.side === "left" ? "end" : "start";
    const lineEnd = coordinate(layout.x + (anchor === "end" ? 2 : -2), 1000);
    const lineY = coordinate(layout.y - 1.5, 750);
    const middle = ((Number(targetX) + Number(lineEnd)) / 2).toFixed(2);
    return `<g id="label-${escapeXml(layout.structureId)}" data-target-id="${escapeXml(layout.object.id)}"><path d="M ${targetX} ${targetY} L ${middle} ${lineY} L ${lineEnd} ${lineY}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/><circle cx="${targetX}" cy="${targetY}" r="3" fill="#1a1a1a"/><text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Verdana,Geneva,sans-serif" font-size="16" font-weight="600" fill="#1a1a1a">${escapeXml(layout.text)}</text></g>`;
  });
  return { inner: `${inner}${relationships}${labels.join("")}`, checks };
}

export function buildCanonicalSvg(
  inner: string,
  brief: BiologicalBriefV1,
  objects: VectorObjectManifest[],
) {
  const annotated = appendEditableAnnotations(inner, brief, objects);
  const title = escapeXml(brief.title);
  const description = escapeXml(brief.subtitle || brief.subject);
  const markers = `<defs><marker id="diagram-arrow-end" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 Z" fill="#1a1a1a"/></marker><marker id="diagram-arrow-start" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse"><path d="M 8 0 L 0 4 L 8 8 Z" fill="#1a1a1a"/></marker></defs>`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 750" role="img" aria-labelledby="diagram-title diagram-description"><title id="diagram-title">${title}</title><desc id="diagram-description">${description}</desc>${markers}${annotated.inner}</svg>`,
    checks: annotated.checks,
  };
}
