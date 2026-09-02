export type DiagramCheck = { level: "pass" | "warning"; message: string };
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
export type RenderSwatch = { name: string; hex: string; model?: string; values?: number[]; group?: string };

const diagramColors = new Set(["orange", "teal", "purple", "pink", "green", "yellow", "blue", "grey"]);
const diagramPalette: Record<string, string> = { orange: "#ff9b66", teal: "#73d3cf", purple: "#aaa0ff", pink: "#ed98c0", green: "#86bf8d", yellow: "#f0ca68", blue: "#82b9e8", grey: "#c7c7c7" };

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

export function validateDiagramSpec(input: unknown): { spec: DiagramSpec; checks: DiagramCheck[] } {
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
  const checks: DiagramCheck[] = [
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

export function createDiagramReport(spec: DiagramSpec, checks: DiagramCheck[], model: string, referenceCount: number, swatches: RenderSwatch[] = []) {
  return JSON.stringify({ generatedAt: new Date().toISOString(), generator: "Taktik Robot Biological Diagram Generator", model, referenceCount, palette: swatches, spec, checks }, null, 2);
}
