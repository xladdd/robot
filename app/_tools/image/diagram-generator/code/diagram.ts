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

export type DiagramV1Spec = {
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

export type DiagramPrimitive =
  | "organic"
  | "open-path"
  | "ellipse"
  | "circle"
  | "tube"
  | "membrane-network"
  | "cisternae"
  | "vesicle"
  | "vacuole"
  | "dots"
  | "layer"
  | "chromosome"
  | "spindle"
  | "centrosome";

export type DiagramPanel = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DiagramElement = {
  id: string;
  type: DiagramPrimitive;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  panelId?: string;
  rotation: number;
  points?: DiagramPoint[];
};

export type DiagramLeaderMode = "straight" | "elbow" | "bracket" | "none";

export type DiagramLabel = {
  id: string;
  text: string;
  targetId: string;
  x: number;
  y: number;
  leader: DiagramLeaderMode;
};

export type DiagramArrow = "none" | "start" | "end" | "both";
export type DiagramConnectionRoute = "straight" | "elbow";

export type DiagramConnection = {
  id: string;
  from: string;
  to: string;
  arrow: DiagramArrow;
  route: DiagramConnectionRoute;
  label: string;
  points?: DiagramPoint[];
};

export type DiagramV2Spec = {
  version: 2;
  kind: "biology";
  title: string;
  subtitle: string;
  subject: string;
  diagramType: "anatomy" | "process" | "cross-section" | "sequence";
  canvas: { width: number; height: number };
  panels: DiagramPanel[];
  elements: DiagramElement[];
  labels: DiagramLabel[];
  connections: DiagramConnection[];
  notes: string[];
  referenceSummary: string;
};

export type DiagramSpec = DiagramV1Spec | DiagramV2Spec;
export type DiagramUsage = {
  generationId: string | null;
  cost: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};
export type RenderSwatch = {
  name: string;
  hex: string;
  model?: string;
  values?: number[];
  group?: string;
};

const diagramColors = new Set([
  "orange",
  "teal",
  "purple",
  "pink",
  "green",
  "yellow",
  "blue",
  "grey",
]);
const diagramPalette: Record<string, string> = {
  orange: "#ff9b66",
  teal: "#73d3cf",
  purple: "#aaa0ff",
  pink: "#ed98c0",
  green: "#86bf8d",
  yellow: "#f0ca68",
  blue: "#82b9e8",
  grey: "#c7c7c7",
};
const primitives = new Set<DiagramPrimitive>([
  "organic",
  "open-path",
  "ellipse",
  "circle",
  "tube",
  "membrane-network",
  "cisternae",
  "vesicle",
  "vacuole",
  "dots",
  "layer",
  "chromosome",
  "spindle",
  "centrosome",
]);
const leaderModes = new Set<DiagramLeaderMode>([
  "straight",
  "elbow",
  "bracket",
  "none",
]);
const arrows = new Set<DiagramArrow>(["none", "start", "end", "both"]);
const connectionRoutes = new Set<DiagramConnectionRoute>(["straight", "elbow"]);
const dangerousKeys = new Set([
  "d",
  "path",
  "paths",
  "svg",
  "markup",
  "html",
  "script",
  "scripts",
  "onload",
  "onclick",
  "onerror",
  "javascript",
]);

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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rejectExecutableFields(value: unknown, path = "diagram") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      rejectExecutableFields(item, `${path}[${index}]`),
    );
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (dangerousKeys.has(key.toLowerCase()))
      throw new Error(
        `${path}.${key} is not accepted; provide controlled diagram geometry instead.`,
      );
    rejectExecutableFields(child, `${path}.${key}`);
  }
}

function finiteNumber(value: unknown, name: string, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(
      `${name} must be a finite number between ${min} and ${max}.`,
    );
  return value;
}

function optionalCanvasDimension(
  value: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : fallback;
}

function v2Id(value: unknown, name: string) {
  const id = text(value, 64);
  if (!id || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id))
    throw new Error(`${name} must be a non-empty safe identifier.`);
  return id;
}

function v2Color(value: unknown, name: string) {
  const color = text(value, 20).toLowerCase();
  if (!diagramColors.has(color) && !/^#[0-9a-f]{6}$/.test(color))
    throw new Error(`${name} uses an unsupported colour.`);
  return color;
}

function v2Notes(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((note) => text(note, 240))
        .filter(Boolean)
        .slice(0, 8)
    : [];
}

function normalizeV2(raw: Record<string, unknown>): {
  spec: DiagramV2Spec;
  checks: DiagramCheck[];
} {
  if (raw.kind !== "biology")
    throw new Error("Only biological diagrams are supported in diagram mode.");
  const title = text(raw.title, 160);
  const subject = text(raw.subject, 100);
  if (!title || !subject)
    throw new Error("The diagram needs a title and subject.");
  const rawType = raw.diagramType ?? raw.type;
  if (
    rawType !== "anatomy" &&
    rawType !== "process" &&
    rawType !== "cross-section" &&
    rawType !== "sequence"
  )
    throw new Error(
      "Version 2 diagrams need a supported diagram type: anatomy, process, cross-section, or sequence.",
    );

  const rawCanvas = objectValue(raw.canvas);
  const canvas = {
    width: optionalCanvasDimension(
      rawCanvas.width,
      "Canvas width",
      1000,
      400,
      4000,
    ),
    height: optionalCanvasDimension(
      rawCanvas.height,
      "Canvas height",
      700,
      300,
      3000,
    ),
  };

  const rawPanels = raw.panels === undefined ? [] : raw.panels;
  if (!Array.isArray(rawPanels) || rawPanels.length > 12)
    throw new Error("Use no more than 12 diagram panels.");
  const panels: DiagramPanel[] = (
    rawPanels.length
      ? rawPanels
      : [{ id: "main", title: "", x: 5, y: 14, width: 90, height: 78 }]
  ).map((value, index) => {
    const item = objectValue(value);
    const id = v2Id(item.id, `Panel ${index + 1} id`);
    return {
      id,
      title: text(item.title, 100),
      x: finiteNumber(item.x, `${id} x`, 0, 100),
      y: finiteNumber(item.y, `${id} y`, 0, 100),
      width: finiteNumber(item.width, `${id} width`, 1, 100),
      height: finiteNumber(item.height, `${id} height`, 1, 100),
    };
  });

  const rawElements = Array.isArray(raw.elements) ? raw.elements : [];
  if (rawElements.length < 1 || rawElements.length > 80)
    throw new Error("Use between 1 and 80 controlled diagram elements.");
  let ignoredPointGeometry = 0;
  const elements: DiagramElement[] = rawElements.map((value, index) => {
    const item = objectValue(value);
    const id = v2Id(item.id, `Element ${index + 1} id`);
    const primitive = item.type ?? item.primitive ?? item.shape;
    if (
      typeof primitive !== "string" ||
      !primitives.has(primitive as DiagramPrimitive)
    )
      throw new Error(
        `Element ${id} uses an unsupported controlled primitive.`,
      );
    const pointsValue = item.points;
    let points: DiagramPoint[] | undefined;
    if (pointsValue !== undefined && pointsValue !== null) {
      const minimumPoints = primitive === "open-path" ? 2 : 3;
      if (
        !Array.isArray(pointsValue) ||
        pointsValue.length < minimumPoints ||
        pointsValue.length > 32
      ) {
        ignoredPointGeometry += 1;
      } else {
        points = pointsValue.map((point, pointIndex) => {
          const candidate = objectValue(point);
          return {
            x: finiteNumber(
              candidate.x,
              `${id} point ${pointIndex + 1} x`,
              0,
              100,
            ),
            y: finiteNumber(
              candidate.y,
              `${id} point ${pointIndex + 1} y`,
              0,
              100,
            ),
          };
        });
      }
    }
    const panelId =
      item.panelId === undefined || item.panelId === null || item.panelId === ""
        ? undefined
        : v2Id(item.panelId, `${id} panelId`);
    if (panelId && !panels.some((panel) => panel.id === panelId))
      throw new Error(`Element ${id} references unknown panel ${panelId}.`);
    return {
      id,
      type: primitive as DiagramPrimitive,
      description: text(item.description, 180),
      x: finiteNumber(item.x, `${id} x`, 0, 100),
      y: finiteNumber(item.y, `${id} y`, 0, 100),
      width: finiteNumber(item.width, `${id} width`, 0.5, 100),
      height: finiteNumber(item.height, `${id} height`, 0.5, 100),
      color: v2Color(item.color, `Element ${id}`),
      panelId,
      rotation:
        item.rotation === undefined
          ? 0
          : finiteNumber(item.rotation, `${id} rotation`, -360, 360),
      points,
    };
  });

  const rawLabels = raw.labels === undefined ? [] : raw.labels;
  if (!Array.isArray(rawLabels) || rawLabels.length > 80)
    throw new Error("Use no more than 80 separate diagram labels.");
  const elementIds = new Set(elements.map((element) => element.id));
  const labels: DiagramLabel[] = rawLabels.map((value, index) => {
    const item = objectValue(value);
    const id = v2Id(item.id, `Label ${index + 1} id`);
    const targetId = v2Id(item.targetId ?? item.target, `${id} targetId`);
    if (!elementIds.has(targetId))
      throw new Error(`Label ${id} references unknown element ${targetId}.`);
    const leader = item.leader ?? item.leaderMode ?? "elbow";
    if (
      typeof leader !== "string" ||
      !leaderModes.has(leader as DiagramLeaderMode)
    )
      throw new Error(`Label ${id} uses an unsupported leader mode.`);
    const labelText = text(item.text ?? item.label, 120);
    if (!labelText) throw new Error(`Label ${id} needs text.`);
    return {
      id,
      text: labelText,
      targetId,
      x: finiteNumber(item.x, `${id} x`, 0, 100),
      y: finiteNumber(item.y, `${id} y`, 0, 100),
      leader: leader as DiagramLeaderMode,
    };
  });

  const rawConnections = raw.connections === undefined ? [] : raw.connections;
  if (!Array.isArray(rawConnections) || rawConnections.length > 100)
    throw new Error("Use no more than 100 diagram connections.");
  const allTargetIds = new Set([
    ...elementIds,
    ...panels.map((panel) => panel.id),
  ]);
  const connections: DiagramConnection[] = rawConnections.map(
    (value, index) => {
      const item = objectValue(value);
      const id = v2Id(item.id, `Connection ${index + 1} id`);
      const from = v2Id(item.from ?? item.source, `${id} from`);
      const to = v2Id(item.to ?? item.target, `${id} to`);
      if (!allTargetIds.has(from) || !allTargetIds.has(to))
        throw new Error(`Connection ${id} references an unknown endpoint.`);
      const arrow = item.arrow ?? item.arrowhead ?? "end";
      const route = item.route ?? "straight";
      if (typeof arrow !== "string" || !arrows.has(arrow as DiagramArrow))
        throw new Error(`Connection ${id} uses an unsupported arrowhead mode.`);
      if (
        typeof route !== "string" ||
        !connectionRoutes.has(route as DiagramConnectionRoute)
      )
        throw new Error(`Connection ${id} uses an unsupported route.`);
      const connectionPointsValue = item.points;
      let points: DiagramPoint[] | undefined;
      if (
        connectionPointsValue !== undefined &&
        connectionPointsValue !== null
      ) {
        if (
          !Array.isArray(connectionPointsValue) ||
          connectionPointsValue.length > 32
        )
          throw new Error(`${id} points must contain no more than 32 points.`);
        if (connectionPointsValue.length >= 2)
          points = connectionPointsValue.map((point, pointIndex) => {
            const candidate = objectValue(point);
            return {
              x: finiteNumber(
                candidate.x,
                `${id} point ${pointIndex + 1} x`,
                0,
                100,
              ),
              y: finiteNumber(
                candidate.y,
                `${id} point ${pointIndex + 1} y`,
                0,
                100,
              ),
            };
          });
      }
      return {
        id,
        from,
        to,
        arrow: arrow as DiagramArrow,
        route: route as DiagramConnectionRoute,
        label: text(item.label, 100),
        points,
      };
    },
  );

  const ids = [
    ...panels.map(({ id }) => id),
    ...elements.map(({ id }) => id),
    ...labels.map(({ id }) => id),
    ...connections.map(({ id }) => id),
  ];
  if (new Set(ids).size !== ids.length)
    throw new Error(
      "Panel, element, label, and connection IDs must be unique.",
    );

  const spec: DiagramV2Spec = {
    version: 2,
    kind: "biology",
    title,
    subtitle: text(raw.subtitle, 240),
    subject,
    diagramType: rawType,
    canvas,
    panels,
    elements,
    labels,
    connections,
    notes: v2Notes(raw.notes),
    referenceSummary: text(raw.referenceSummary, 300),
  };
  const checks: DiagramCheck[] = [
    {
      level: "pass",
      message: `${elements.length} controlled ${rawType} diagram primitive${elements.length === 1 ? " is" : "s are"} ready to render.`,
    },
    {
      level: "pass",
      message: `${connections.length} directional connection${connections.length === 1 ? " uses" : "s use"} validated references and controlled arrowheads.`,
    },
    {
      level: "pass",
      message:
        "All geometry is finite, bounded, and rendered without executable or raw SVG content.",
    },
    {
      level: "warning",
      message:
        "Biological labels are model-generated and require editorial or subject-expert verification.",
    },
  ];
  if (ignoredPointGeometry)
    checks.splice(3, 0, {
      level: "warning",
      message: `${ignoredPointGeometry} optional element point list${ignoredPointGeometry === 1 ? " was" : "s were"} ignored because the controlled point count was invalid; the element bounding box was used instead.`,
    });
  const overlaps = approximateLabelOverlaps(spec);
  if (overlaps)
    checks.splice(3, 0, {
      level: "warning",
      message: `Approximate label overlap detected between ${overlaps} label pair${overlaps === 1 ? "" : "s"}; inspect spacing before publication.`,
    });
  return { spec, checks };
}

export function validateDiagramSpec(input: {
  outline: unknown;
  structures: unknown[];
}): { spec: DiagramV1Spec; checks: DiagramCheck[] };
export function validateDiagramSpec(input: { elements: unknown[] }): {
  spec: DiagramV2Spec;
  checks: DiagramCheck[];
};
export function validateDiagramSpec(input: unknown): {
  spec: DiagramSpec;
  checks: DiagramCheck[];
};
export function validateDiagramSpec(input: unknown): {
  spec: DiagramSpec;
  checks: DiagramCheck[];
} {
  if (!input || typeof input !== "object")
    throw new Error("The model did not return a diagram specification.");
  rejectExecutableFields(input);
  const raw = input as Record<string, unknown>;
  if (raw.version === 2) return normalizeV2(raw);
  if (raw.version !== undefined && raw.version !== 1)
    throw new Error(
      "Only diagram specification versions 1 and 2 are supported.",
    );
  if (raw.kind !== "biology")
    throw new Error("Only biological diagrams are supported in diagram mode.");
  const rawOutline = Array.isArray(raw.outline) ? raw.outline : [];
  if (rawOutline.length < 8 || rawOutline.length > 32)
    throw new Error(
      "The subject outline must contain between 8 and 32 points.",
    );
  let normalizedCoordinates = 0;
  const diagramNumber = (
    value: unknown,
    name: string,
    min: number,
    max: number,
  ) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min - 25 || number > max + 25)
      throw new Error(`${name} must be between ${min} and ${max}.`);
    const normalized = Math.min(max, Math.max(min, number));
    if (normalized !== number) normalizedCoordinates += 1;
    return normalized;
  };
  const outline = rawOutline.map((value, index) => {
    const point =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    return {
      x: diagramNumber(point.x, `Outline point ${index + 1} x`, 8, 92),
      y: diagramNumber(point.y, `Outline point ${index + 1} y`, 8, 92),
    };
  });
  const rawStructures = Array.isArray(raw.structures) ? raw.structures : [];
  if (rawStructures.length < 1 || rawStructures.length > 14)
    throw new Error("Use between 1 and 14 labelled structures.");
  const structures: DiagramStructure[] = rawStructures.map(
    (value, index): DiagramStructure => {
      const item =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : {};
      const shape: DiagramStructure["shape"] | null =
        item.shape === "circle" ||
        item.shape === "dots" ||
        item.shape === "vacuole"
          ? item.shape
          : item.shape === "ellipse"
            ? "ellipse"
            : null;
      if (!shape)
        throw new Error(`Structure ${index + 1} uses an unsupported shape.`);
      const label = text(item.label, 80);
      if (!label) throw new Error(`Structure ${index + 1} needs a label.`);
      const color = text(item.color, 20).toLowerCase();
      if (!diagramColors.has(color))
        throw new Error(`Structure ${index + 1} uses an unsupported colour.`);
      return {
        label,
        description: text(item.description, 180),
        shape,
        x: diagramNumber(item.x, `${label} x`, 5, 95),
        y: diagramNumber(item.y, `${label} y`, 8, 92),
        width: diagramNumber(item.width, `${label} width`, 2, 85),
        height: diagramNumber(item.height, `${label} height`, 2, 85),
        labelX: diagramNumber(item.labelX, `${label} label x`, 1, 99),
        labelY: diagramNumber(item.labelY, `${label} label y`, 2, 98),
        color,
      };
    },
  );
  const title = text(raw.title, 160);
  const subject = text(raw.subject, 100);
  if (!title || !subject)
    throw new Error("The diagram needs a title and subject.");
  const spec: DiagramV1Spec = {
    version: 1,
    kind: "biology",
    title,
    subtitle: text(raw.subtitle, 240),
    subject,
    outline,
    structures,
    notes: Array.isArray(raw.notes)
      ? raw.notes
          .map((note) => text(note, 240))
          .filter(Boolean)
          .slice(0, 8)
      : [],
    referenceSummary: text(raw.referenceSummary, 300),
  };
  const checks: DiagramCheck[] = [
    {
      level: "pass",
      message: `${structures.length} labelled structures use the controlled biological SVG vocabulary.`,
    },
    {
      level: "pass",
      message:
        "All geometry is finite, bounded, and rendered without executable SVG content.",
    },
    {
      level: "warning",
      message:
        "Biological labels are model-generated and require editorial or subject-expert verification.",
    },
  ];
  if (normalizedCoordinates)
    checks.splice(2, 0, {
      level: "pass",
      message: `${normalizedCoordinates} model coordinate${normalizedCoordinates === 1 ? " was" : "s were"} normalized to the safe diagram canvas.`,
    });
  return { spec, checks };
}

function smoothClosedPath(
  points: DiagramPoint[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scaled = points.map((point) => ({
    x: x + (point.x / 100) * width,
    y: y + (point.y / 100) * height,
  }));
  return (
    scaled
      .map((point, index) => {
        const next = scaled[(index + 1) % scaled.length];
        return `${index ? "" : `M ${point.x} ${point.y} `}Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`;
      })
      .join(" ") + " Z"
  );
}

function organicShapePath(
  cx: number,
  cy: number,
  width: number,
  height: number,
  seed: number,
) {
  const count = 14;
  const points = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const variation =
      1 +
      0.075 * Math.sin(angle * 3 + seed * 1.71) +
      0.045 * Math.cos(angle * 5 - seed * 0.93);
    return {
      x: cx + ((Math.cos(angle) * width) / 2) * variation,
      y: cy + ((Math.sin(angle) * height) / 2) * variation,
    };
  });
  const start = {
    x: (points[points.length - 1].x + points[0].x) / 2,
    y: (points[points.length - 1].y + points[0].y) / 2,
  };
  return (
    `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} ` +
    points
      .map((point, index) => {
        const next = points[(index + 1) % points.length];
        return `Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${((point.x + next.x) / 2).toFixed(2)} ${((point.y + next.y) / 2).toFixed(2)}`;
      })
      .join(" ") +
    " Z"
  );
}

function safeSwatchColor(
  swatches: RenderSwatch[],
  index: number,
  fallback: string,
) {
  const candidate =
    swatches[index % Math.max(1, swatches.length)]?.hex?.toLowerCase();
  return candidate && /^#[0-9a-f]{6}$/.test(candidate)
    ? candidate
    : diagramPalette[fallback] || "#c7c7c7";
}

function displayTitle(title: string) {
  return (
    title
      .replace(
        /^\s*(?:a\s+)?(?:labelled\s+)?schematic\s+(?:diagram|drawing|illustration)\s+of\s+(?:an?\s+|the\s+)?/i,
        "",
      )
      .trim() || title
  );
}

function renderV1(spec: DiagramV1Spec, swatches: RenderSwatch[]) {
  const canvas = { x: 135, y: 125, width: 730, height: 470 };
  const px = (value: number) => canvas.x + (value / 100) * canvas.width;
  const py = (value: number) => canvas.y + (value / 100) * canvas.height;
  const normalizedLabel = (label: string) =>
    label.toLowerCase().replace(/[^a-z]/g, "");
  const semanticRole = (label: string) => {
    const normalized = normalizedLabel(label);
    if (/cytoplasm|cytosol/.test(normalized)) return "cytoplasm";
    if (/membrane|cellwall|outerboundary/.test(normalized)) return "membrane";
    if (/pseudopod/.test(normalized)) return "pseudopodia";
    return null;
  };
  const outlinePoints = spec.outline.map(({ x, y }) => ({
    x: px(x),
    y: py(y),
  }));
  const cytoplasmIndex = spec.structures.findIndex(
    (item) => semanticRole(item.label) === "cytoplasm",
  );
  const subjectFill =
    cytoplasmIndex >= 0
      ? safeSwatchColor(
          swatches,
          cytoplasmIndex,
          spec.structures[cytoplasmIndex].color,
        )
      : "#dff3e4";
  const leader = (item: DiagramStructure, targetX: number, targetY: number) => {
    const labelX = px(item.labelX),
      labelY = py(item.labelY);
    const anchor = labelX < targetX ? "end" : "start";
    const lineEnd = labelX + (anchor === "end" ? 8 : -8);
    const elbowX = targetX + (lineEnd - targetX) * 0.55;
    return `<circle cx="${targetX}" cy="${targetY}" r="3" fill="#1a1a1a"/><path d="M ${targetX} ${targetY} L ${elbowX} ${labelY - 4} L ${lineEnd} ${labelY - 4}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/><text x="${labelX}" y="${labelY}" text-anchor="${anchor}" class="label">${escapeXml(item.label)}</text>`;
  };
  const structures = spec.structures
    .map((item, index) => {
      const role = semanticRole(item.label);
      const x = px(item.x),
        y = py(item.y),
        width = (item.width / 100) * canvas.width,
        height = (item.height / 100) * canvas.height;
      const fill = safeSwatchColor(swatches, index, item.color);
      if (role) {
        let target = { x, y };
        if (role === "membrane" || role === "pseudopodia") {
          const labelX = px(item.labelX),
            labelY = py(item.labelY);
          const candidates =
            role === "pseudopodia"
              ? outlinePoints.filter((point) =>
                  labelX < canvas.x + canvas.width / 2
                    ? point.x < canvas.x + canvas.width / 2
                    : point.x >= canvas.x + canvas.width / 2,
                )
              : outlinePoints;
          target = candidates.reduce(
            (best, point) =>
              Math.hypot(point.x - labelX, point.y - labelY) <
              Math.hypot(best.x - labelX, best.y - labelY)
                ? point
                : best,
            candidates[0] || outlinePoints[0],
          );
        }
        if (role === "cytoplasm")
          target = {
            x: canvas.x + canvas.width * 0.58,
            y: canvas.y + canvas.height * 0.58,
          };
        return `<g id="structure-${index + 1}" data-structural-role="${role}">${leader(item, target.x, target.y)}</g>`;
      }
      const organicPath = organicShapePath(
        x,
        y,
        width,
        item.shape === "circle" ? width : height,
        index + 1,
      );
      const shape =
        item.shape === "dots"
          ? Array.from({ length: 7 }, (_, dot) => {
              const angle = dot * 2.399;
              const radius = (Math.sqrt(dot) * Math.min(width, height)) / 5;
              return `<circle cx="${x + Math.cos(angle) * radius}" cy="${y + Math.sin(angle) * radius}" r="4" fill="${fill}" stroke="#1a1a1a" stroke-width="1"/>`;
            }).join("")
          : item.shape === "vacuole"
            ? `<path d="${organicPath}" fill="${fill}" fill-opacity=".45" stroke="#1a1a1a" stroke-width="2"/><path d="${organicShapePath(x, y, width * 0.62, height * 0.62, index + 17)}" fill="#fff" fill-opacity=".45"/>`
            : `<path d="${organicPath}" fill="${fill}" stroke="#1a1a1a" stroke-width="2" stroke-linejoin="round"/>`;
      return `<g id="structure-${index + 1}">${shape}${leader(item, x, y)}</g>`;
    })
    .join("");
  const outline = smoothClosedPath(
    spec.outline,
    canvas.x,
    canvas.y,
    canvas.width,
    canvas.height,
  );
  const title = displayTitle(spec.title);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" role="img" aria-labelledby="diagram-title diagram-desc"><title id="diagram-title">${escapeXml(title)}</title><desc id="diagram-desc">${escapeXml(spec.subtitle || spec.subject)}</desc><style>text{font-family:Verdana,Geneva,sans-serif;fill:#1a1a1a}.title{font-size:30px;font-weight:700}.label{font-size:13px;font-weight:700}</style><rect width="1000" height="700" fill="#fff"/><text x="500" y="60" text-anchor="middle" class="title">${escapeXml(title)}</text><path d="${outline}" fill="${subjectFill}" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/>${structures}</svg>`;
}

function percentToCanvas(value: number, size: number) {
  return (value / 100) * size;
}

function renderPrimitive(
  element: DiagramElement,
  index: number,
  width: number,
  height: number,
  color: string,
) {
  const cx = percentToCanvas(element.x, width),
    cy = percentToCanvas(element.y, height);
  const elementWidth = percentToCanvas(element.width, width),
    elementHeight = percentToCanvas(element.height, height);
  const x = cx - elementWidth / 2,
    y = cy - elementHeight / 2;
  const stroke = "#1a1a1a";
  const rotation = element.rotation
    ? ` transform="rotate(${element.rotation.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"`
    : "";
  const ellipse = `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${(elementWidth / 2).toFixed(2)}" ry="${(elementHeight / 2).toFixed(2)}" fill="${color}" stroke="${stroke}" stroke-width="2"/>`;
  let content: string;
  switch (element.type) {
    case "open-path": {
      const path = element.points
        ? smoothOpenPath(element.points, 0, 0, width, height)
        : `M ${x.toFixed(2)} ${cy.toFixed(2)} L ${(x + elementWidth).toFixed(2)} ${cy.toFixed(2)}`;
      content = `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${Math.max(2, Math.min(4, Math.min(elementWidth, elementHeight) * 0.02)).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    }
    case "ellipse":
      content = ellipse;
      break;
    case "circle":
      content = `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(Math.min(elementWidth, elementHeight) / 2).toFixed(2)}" fill="${color}" stroke="${stroke}" stroke-width="2"/>`;
      break;
    case "organic": {
      if (isDiagramBackground(element)) {
        content = "";
      } else if (isMembraneBoundary(element)) {
        const path = element.points
          ? smoothOpenPath(element.points, 0, 0, width, height)
          : `M ${x.toFixed(2)} ${cy.toFixed(2)} Q ${cx.toFixed(2)} ${(y - elementHeight * 0.35).toFixed(2)} ${(x + elementWidth).toFixed(2)} ${cy.toFixed(2)}`;
        content = `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
      } else {
        const path = element.points
          ? smoothClosedPath(element.points, 0, 0, width, height)
          : organicShapePath(cx, cy, elementWidth, elementHeight, index + 11);
        content = `<path d="${path}" fill="${color}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>`;
      }
      break;
    }
    case "tube":
      content = `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${elementWidth.toFixed(2)}" height="${elementHeight.toFixed(2)}" rx="${Math.min(elementWidth, elementHeight) / 2}" fill="${color}" fill-opacity=".7" stroke="${stroke}" stroke-width="2"/><line x1="${(x + elementWidth * 0.15).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${(x + elementWidth * 0.85).toFixed(2)}" y2="${cy.toFixed(2)}" stroke="${stroke}" stroke-width="1.5"/>`;
      break;
    case "membrane-network": {
      const lines = Array.from({ length: 5 }, (_, line) => {
        const yy = y + elementHeight * (0.18 + line * 0.16);
        return `<path d="M ${x.toFixed(2)} ${yy.toFixed(2)} Q ${(x + elementWidth * 0.25).toFixed(2)} ${(yy - elementHeight * 0.12).toFixed(2)} ${(x + elementWidth * 0.5).toFixed(2)} ${yy.toFixed(2)} T ${(x + elementWidth).toFixed(2)} ${yy.toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
      }).join("");
      content = `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${(elementWidth / 2).toFixed(2)}" ry="${(elementHeight / 2).toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="2"/>${lines}`;
      break;
    }
    case "cisternae":
      content = Array.from({ length: 4 }, (_, row) => {
        const yy = y + elementHeight * (0.2 + row * 0.2);
        return `<path d="M ${x.toFixed(2)} ${yy.toFixed(2)} Q ${(x + elementWidth * 0.25).toFixed(2)} ${(yy - elementHeight * 0.12).toFixed(2)} ${(x + elementWidth * 0.5).toFixed(2)} ${yy.toFixed(2)} T ${(x + elementWidth).toFixed(2)} ${yy.toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/>`;
      }).join("");
      break;
    case "vesicle":
      content = `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(Math.min(elementWidth, elementHeight) / 2).toFixed(2)}" fill="${color}" fill-opacity=".7" stroke="${stroke}" stroke-width="2"/><circle cx="${(cx - elementWidth * 0.12).toFixed(2)}" cy="${(cy - elementHeight * 0.15).toFixed(2)}" r="${Math.max(2, Math.min(elementWidth, elementHeight) * 0.08).toFixed(2)}" fill="#fff" fill-opacity=".65"/>`;
      break;
    case "vacuole":
      content = `<path d="${organicShapePath(cx, cy, elementWidth, elementHeight, index + 23)}" fill="${color}" fill-opacity=".45" stroke="${stroke}" stroke-width="2"/><path d="${organicShapePath(cx, cy, elementWidth * 0.62, elementHeight * 0.62, index + 41)}" fill="#fff" fill-opacity=".5"/>`;
      break;
    case "dots":
      content = Array.from({ length: 9 }, (_, dot) => {
        const angle = dot * 2.399;
        const radius =
          (Math.sqrt(dot) * Math.min(elementWidth, elementHeight)) / 5;
        return `<circle cx="${(cx + Math.cos(angle) * radius).toFixed(2)}" cy="${(cy + Math.sin(angle) * radius).toFixed(2)}" r="${Math.max(2, Math.min(elementWidth, elementHeight) * 0.055).toFixed(2)}" fill="${color}" stroke="${stroke}" stroke-width="1"/>`;
      }).join("");
      break;
    case "layer":
      content = `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${elementWidth.toFixed(2)}" height="${elementHeight.toFixed(2)}" fill="${color}" stroke="${stroke}" stroke-width="2"/><line x1="${x.toFixed(2)}" y1="${(y + elementHeight * 0.33).toFixed(2)}" x2="${(x + elementWidth).toFixed(2)}" y2="${(y + elementHeight * 0.33).toFixed(2)}" stroke="${stroke}"/><line x1="${x.toFixed(2)}" y1="${(y + elementHeight * 0.66).toFixed(2)}" x2="${(x + elementWidth).toFixed(2)}" y2="${(y + elementHeight * 0.66).toFixed(2)}" stroke="${stroke}"/>`;
      break;
    case "chromosome":
      content = `<path d="M ${(cx - elementWidth * 0.32).toFixed(2)} ${(cy - elementHeight * 0.42).toFixed(2)} Q ${(cx - elementWidth * 0.08).toFixed(2)} ${(cy - elementHeight * 0.12).toFixed(2)} ${(cx + elementWidth * 0.32).toFixed(2)} ${(cy + elementHeight * 0.42).toFixed(2)} M ${(cx + elementWidth * 0.32).toFixed(2)} ${(cy - elementHeight * 0.42).toFixed(2)} Q ${(cx + elementWidth * 0.08).toFixed(2)} ${(cy - elementHeight * 0.12).toFixed(2)} ${(cx - elementWidth * 0.32).toFixed(2)} ${(cy + elementHeight * 0.42).toFixed(2)}" fill="none" stroke="${color}" stroke-width="${Math.max(3, elementWidth * 0.12).toFixed(2)}" stroke-linecap="round"/>`;
      break;
    case "spindle":
      content = `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${(elementWidth / 2).toFixed(2)}" ry="${(elementHeight / 2).toFixed(2)}" fill="${color}" fill-opacity=".12" stroke="${stroke}" stroke-width="2"/>${Array.from(
        { length: 5 },
        (_, ray) => {
          const offset = (ray - 2) * elementWidth * 0.12;
          return `<line x1="${(cx - elementWidth * 0.4).toFixed(2)}" y1="${(cy + offset).toFixed(2)}" x2="${(cx + elementWidth * 0.4).toFixed(2)}" y2="${(cy - offset).toFixed(2)}" stroke="${stroke}" stroke-width="1.5"/>`;
        },
      ).join("")}`;
      break;
    case "centrosome":
      content = `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(Math.min(elementWidth, elementHeight) * 0.18).toFixed(2)}" fill="${color}" stroke="${stroke}" stroke-width="2"/>${Array.from(
        { length: 8 },
        (_, ray) => {
          const angle = (ray * Math.PI) / 4;
          return `<line x1="${(cx + Math.cos(angle) * elementWidth * 0.12).toFixed(2)}" y1="${(cy + Math.sin(angle) * elementHeight * 0.12).toFixed(2)}" x2="${(cx + Math.cos(angle) * elementWidth * 0.42).toFixed(2)}" y2="${(cy + Math.sin(angle) * elementHeight * 0.42).toFixed(2)}" stroke="${stroke}" stroke-width="1.5"/>`;
        },
      ).join("")}`;
      break;
  }
  return `<g id="${svgObjectId(element.id, "element")}" data-element-id="${escapeXml(element.id)}" data-primitive="${element.type}"${rotation}>${content}</g>`;
}

function svgObjectId(id: string, prefix: string) {
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) return `${prefix}-${id}`;
  return `${prefix}-${Array.from(id)
    .map((character) => character.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("")}`;
}

function endpointPoint(
  id: string,
  elements: Map<string, DiagramElement>,
  panels: Map<string, DiagramPanel>,
  width: number,
  height: number,
) {
  const element = elements.get(id);
  if (element)
    return {
      x: percentToCanvas(element.x, width),
      y: percentToCanvas(element.y, height),
    };
  const panel = panels.get(id);
  if (panel)
    return {
      x: percentToCanvas(panel.x + panel.width / 2, width),
      y: percentToCanvas(panel.y + panel.height / 2, height),
    };
  return { x: 0, y: 0 };
}

function smoothOpenPath(
  points: DiagramPoint[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const distinctPoints =
    points.length > 2 &&
    points[0].x === points.at(-1)!.x &&
    points[0].y === points.at(-1)!.y
      ? points.slice(0, -1)
      : points;
  const scaled = distinctPoints.map((point) => ({
    x: x + (point.x / 100) * width,
    y: y + (point.y / 100) * height,
  }));
  if (scaled.length === 2)
    return `M ${scaled[0].x.toFixed(2)} ${scaled[0].y.toFixed(2)} L ${scaled[1].x.toFixed(2)} ${scaled[1].y.toFixed(2)}`;
  return (
    `M ${scaled[0].x.toFixed(2)} ${scaled[0].y.toFixed(2)} ` +
    scaled
      .slice(1)
      .map((point, index) => {
        const previous = scaled[index];
        return `Q ${previous.x.toFixed(2)} ${previous.y.toFixed(2)} ${((previous.x + point.x) / 2).toFixed(2)} ${((previous.y + point.y) / 2).toFixed(2)}`;
      })
      .join(" ") +
    ` L ${scaled.at(-1)!.x.toFixed(2)} ${scaled.at(-1)!.y.toFixed(2)}`
  );
}

function renderConnection(
  connection: DiagramConnection,
  elements: Map<string, DiagramElement>,
  panels: Map<string, DiagramPanel>,
  width: number,
  height: number,
) {
  const start = endpointPoint(connection.from, elements, panels, width, height);
  const end = endpointPoint(connection.to, elements, panels, width, height);
  const markerStart =
    connection.arrow === "start" || connection.arrow === "both"
      ? ` marker-start="url(#arrow-start)"`
      : "";
  const markerEnd =
    connection.arrow === "end" || connection.arrow === "both"
      ? ` marker-end="url(#arrow-end)"`
      : "";
  const routePoints = connection.points?.map((point) => ({
    x: percentToCanvas(point.x, width),
    y: percentToCanvas(point.y, height),
  }));
  const points = routePoints?.length ? routePoints : [start, end];
  const pointPath = points
    .map(
      (point, index) =>
        `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const geometry = connection.points?.length
    ? `<path d="${pointPath}" fill="none" stroke="#1a1a1a" stroke-width="2"${markerStart}${markerEnd}/>`
    : connection.route === "elbow"
      ? `<path d="M ${start.x.toFixed(2)} ${start.y.toFixed(2)} L ${end.x.toFixed(2)} ${start.y.toFixed(2)} L ${end.x.toFixed(2)} ${end.y.toFixed(2)}" fill="none" stroke="#1a1a1a" stroke-width="2"${markerStart}${markerEnd}/>`
      : `<line x1="${start.x.toFixed(2)}" y1="${start.y.toFixed(2)}" x2="${end.x.toFixed(2)}" y2="${end.y.toFixed(2)}" stroke="#1a1a1a" stroke-width="2"${markerStart}${markerEnd}/>`;
  const midpoint = points[Math.floor(points.length / 2)];
  const label = connection.label
    ? `<text x="${midpoint.x.toFixed(2)}" y="${(midpoint.y - 6).toFixed(2)}" text-anchor="middle" class="connection-label">${escapeXml(connection.label)}</text>`
    : "";
  return `<g id="${svgObjectId(connection.id, "connection")}" data-from="${escapeXml(connection.from)}" data-to="${escapeXml(connection.to)}">${geometry}${label}</g>`;
}

function approximateLabelOverlaps(spec: DiagramV2Spec) {
  let overlaps = 0;
  const boxes = spec.labels.map((label) => {
    const target = spec.elements.find(
      (element) => element.id === label.targetId,
    );
    const targetX = target?.x ?? label.x;
    const anchorEnd = label.x < targetX;
    const width = Math.min(28, Math.max(3, label.text.length * 0.72 + 1.5));
    return {
      left: label.x - (anchorEnd ? width : 0),
      right: label.x + (anchorEnd ? 0 : width),
      top: label.y - 3,
      bottom: label.y + 1.5,
    };
  });
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      if (
        boxes[first].left < boxes[second].right &&
        boxes[first].right > boxes[second].left &&
        boxes[first].top < boxes[second].bottom &&
        boxes[first].bottom > boxes[second].top
      )
        overlaps += 1;
    }
  }
  return overlaps;
}

function isDiagramBackground(element: DiagramElement) {
  const semanticText = `${element.id} ${element.description}`.toLowerCase();
  return /cytosol|cytoplasm|cytoplazm|cell\s+interior|interior\s+field|background/.test(
    semanticText,
  );
}

function isMembraneBoundary(element: DiagramElement) {
  const semanticText = `${element.id} ${element.description}`.toLowerCase();
  return /plasma\s+membrane|cell\s+membrane|outer\s+membrane|cell\s+boundary|outer\s+boundary|boundary\s+membrane|plazmatick|buněčn/.test(
    semanticText,
  );
}

function renderLayerRank(element: DiagramElement) {
  if (isDiagramBackground(element)) return 0;
  if (isMembraneBoundary(element)) return 1;
  return 2;
}

function renderV2(spec: DiagramV2Spec, swatches: RenderSwatch[]) {
  const width = spec.canvas.width,
    height = spec.canvas.height;
  const renderElements = spec.elements
    .map((element, index) => ({
      element,
      index,
      color: safeSwatchColor(swatches, index, element.color),
    }))
    .sort(
      (first, second) =>
        renderLayerRank(first.element) - renderLayerRank(second.element) ||
        first.index - second.index,
    );
  const elements = new Map(
    spec.elements.map((element) => [element.id, element]),
  );
  const panels = new Map(spec.panels.map((panel) => [panel.id, panel]));
  const title = displayTitle(spec.title);
  const panelMarkup = spec.panels
    .map(
      (panel) =>
        `<g id="${svgObjectId(panel.id, "panel")}" data-panel-id="${escapeXml(panel.id)}"><rect x="${percentToCanvas(panel.x, width).toFixed(2)}" y="${percentToCanvas(panel.y, height).toFixed(2)}" width="${percentToCanvas(panel.width, width).toFixed(2)}" height="${percentToCanvas(panel.height, height).toFixed(2)}" fill="#fff" stroke="#b5b5b5" stroke-width="2"/>${panel.title ? `<text x="${percentToCanvas(panel.x + 1.5, width).toFixed(2)}" y="${percentToCanvas(panel.y + 4, height).toFixed(2)}" class="panel-title">${escapeXml(panel.title)}</text>` : ""}</g>`,
    )
    .join("");
  const connectionMarkup = spec.connections
    .map((connection) =>
      renderConnection(connection, elements, panels, width, height),
    )
    .join("");
  const elementMarkup = renderElements
    .map(({ element, index, color }) =>
      renderPrimitive(element, index, width, height, color),
    )
    .join("");
  const labelMarkup = spec.labels
    .map((label) => {
      const target = endpointPoint(
        label.targetId,
        elements,
        panels,
        width,
        height,
      );
      const labelX = percentToCanvas(label.x, width),
        labelY = percentToCanvas(label.y, height);
      const anchor = labelX < target.x ? "end" : "start";
      const lineEnd = labelX + (anchor === "end" ? 8 : -8);
      let leader = "";
      if (label.leader === "straight")
        leader = `<line x1="${target.x.toFixed(2)}" y1="${target.y.toFixed(2)}" x2="${lineEnd.toFixed(2)}" y2="${(labelY - 4).toFixed(2)}" stroke="#1a1a1a" stroke-width="1.5"/>`;
      if (label.leader === "elbow")
        leader = `<path d="M ${target.x.toFixed(2)} ${target.y.toFixed(2)} L ${((target.x + lineEnd) / 2).toFixed(2)} ${(labelY - 4).toFixed(2)} L ${lineEnd.toFixed(2)} ${(labelY - 4).toFixed(2)}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`;
      if (label.leader === "bracket")
        leader = `<path d="M ${target.x.toFixed(2)} ${target.y.toFixed(2)} L ${lineEnd.toFixed(2)} ${target.y.toFixed(2)} L ${lineEnd.toFixed(2)} ${(labelY - 4).toFixed(2)}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`;
      return `<g id="${svgObjectId(label.id, "label")}" data-target-id="${escapeXml(label.targetId)}">${leader}${label.leader === "none" ? "" : `<circle cx="${target.x.toFixed(2)}" cy="${target.y.toFixed(2)}" r="3" fill="#1a1a1a"/>`}<text x="${labelX.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="${anchor}" class="label">${escapeXml(label.text)}</text></g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="diagram-title diagram-desc"><title id="diagram-title">${escapeXml(title)}</title><desc id="diagram-desc">${escapeXml(spec.subtitle || spec.subject)}</desc><defs><marker id="arrow-end" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 Z" fill="#1a1a1a"/></marker><marker id="arrow-start" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse"><path d="M 8 0 L 0 4 L 8 8 Z" fill="#1a1a1a"/></marker></defs><style>text{font-family:Verdana,Geneva,sans-serif;fill:#1a1a1a}.title{font-size:30px;font-weight:700}.label{font-size:13px;font-weight:700}.panel-title{font-size:15px;font-weight:700}.connection-label{font-size:11px}</style><rect width="${width}" height="${height}" fill="#fff"/><text x="${(width / 2).toFixed(2)}" y="60" text-anchor="middle" class="title">${escapeXml(title)}</text>${panelMarkup}${elementMarkup}${connectionMarkup}${labelMarkup}</svg>`;
}

export function renderDiagramSvg(
  spec: DiagramSpec,
  swatches: RenderSwatch[] = [],
) {
  return spec.version === 2
    ? renderV2(spec, swatches)
    : renderV1(spec, swatches);
}

export function createDiagramReport(
  spec: DiagramSpec,
  checks: DiagramCheck[],
  model: string,
  referenceCount: number,
  swatches: RenderSwatch[] = [],
  usage: DiagramUsage | null = null,
) {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      generator: "Taktik Robot Biological Diagram Generator",
      model,
      referenceCount,
      palette: swatches,
      usage,
      spec,
      checks,
    },
    null,
    2,
  );
}
