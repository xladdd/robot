export type DiagramLanguage = "en" | "cs";
export type BiologicalDiagramType =
  "anatomy" | "process" | "cross-section" | "sequence";

export type BriefStructure = {
  id: string;
  name: string;
  role: string;
  required: boolean;
};

export type BriefRelationship = {
  from: string;
  to: string;
  relationship: string;
  direction: "none" | "from-to" | "bidirectional";
};

export type BiologicalBriefV1 = {
  version: 1;
  subject: string;
  diagramType: BiologicalDiagramType;
  title: string;
  subtitle: string;
  language: DiagramLanguage;
  audience: string;
  view: string;
  structures: BriefStructure[];
  relationships: BriefRelationship[];
  composition: {
    aspectRatio: "4:3" | "3:4" | "16:9" | "1:1";
    panelCount: number;
    notes: string;
  };
  selectedReferenceId: string | null;
  referenceRationale: string;
  uncertainties: string[];
};

export type ReferenceCatalogEntry = {
  id: string;
  subject: string;
  keywords: string[];
  view: string;
  diagramType: BiologicalDiagramType;
  suitableFor: string[];
  unsuitableFor: string[];
  source: string;
  licence: string;
  reviewer: string;
  reviewedAt: string;
  assetPath: string | null;
};

export type ReferenceSelection = {
  id: string | null;
  subject: string;
  view: string;
  rationale: string;
  source: string | null;
  licence: string | null;
  assetPath: string | null;
};

export type VectorObjectManifest = {
  id: string;
  briefStructureId: string | null;
  role: "background" | "base" | "structure" | "detail";
  description: string;
  anchor: { x: number; y: number };
  labelPosition: { x: number; y: number } | null;
  complete: boolean;
  underlyingObjectIds: string[];
};

export type VectorReconstructionV1 = {
  version: 1;
  canvas: { width: number; height: number };
  objects: VectorObjectManifest[];
  uncertainties: string[];
  svg: string;
};

export type DiagramCheck = {
  level: "pass" | "warning";
  message: string;
};

export type DiagramUsage = {
  generationId: string | null;
  model: string;
  cost: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type DiagramCandidate = {
  id: string;
  data: string;
  model: string;
  seed: number | null;
  generationId: string | null;
  usage: DiagramUsage;
};

export type DiagramReviewFinding = {
  severity: "warning" | "error";
  category: "fidelity" | "biology" | "editability" | "labels" | "completeness";
  message: string;
};

export type DiagramReview = {
  fidelity: number;
  editability: number;
  completeness: number;
  biologicalConfidence: number;
  summary: string;
  findings: DiagramReviewFinding[];
  repairRecommended: boolean;
};

export type DiagramPipelineOutput = {
  svg: string;
  report: string;
  checks: DiagramCheck[];
  model: string;
  brief: BiologicalBriefV1;
  reconstruction: VectorReconstructionV1;
  review: DiagramReview | null;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function safeId(value: unknown, name: string) {
  const id = text(value, 64);
  if (!id || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id))
    throw new Error(`${name} must be a safe identifier.`);
  return id;
}

export function finiteCoordinate(value: unknown, name: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  )
    throw new Error(`${name} must be a number between 0 and 100.`);
  return value;
}

const dangerousKeys = new Set([
  "script",
  "onclick",
  "onload",
  "onerror",
  "javascript",
  "foreignobject",
  "image",
  "filter",
  "mask",
  "clippath",
  "style",
]);

export function rejectDangerousKeys(value: unknown, path = "value") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      rejectDangerousKeys(item, `${path}[${index}]`),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (dangerousKeys.has(key.toLowerCase()))
      throw new Error(`${path}.${key} is not accepted.`);
    rejectDangerousKeys(child, `${path}.${key}`);
  }
}

export function normalizeBrief(input: unknown): BiologicalBriefV1 {
  rejectDangerousKeys(input, "brief");
  if (!isRecord(input) || input.version !== 1)
    throw new Error("The planner did not return BiologicalBriefV1.");
  const diagramType = input.diagramType;
  if (
    diagramType !== "anatomy" &&
    diagramType !== "process" &&
    diagramType !== "cross-section" &&
    diagramType !== "sequence"
  )
    throw new Error("The brief uses an unsupported biological diagram type.");
  const language = input.language === "cs" ? "cs" : "en";
  const subject = text(input.subject, 180);
  const title = text(input.title, 180);
  if (!subject || !title)
    throw new Error("The biological brief needs a subject and title.");
  const rawStructures = Array.isArray(input.structures) ? input.structures : [];
  if (!rawStructures.length || rawStructures.length > 32)
    throw new Error("The brief must contain between 1 and 32 structures.");
  const structures = rawStructures.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Structure ${index + 1} is invalid.`);
    return {
      id: safeId(value.id, `Structure ${index + 1} id`),
      name: text(value.name, 120),
      role: text(value.role, 180),
      required: true,
    };
  });
  if (structures.some((item) => !item.name || !item.role))
    throw new Error("Every brief structure needs a name and role.");
  const ids = new Set(structures.map((item) => item.id));
  if (ids.size !== structures.length)
    throw new Error("Brief structure IDs must be unique.");
  const relationships = (
    Array.isArray(input.relationships) ? input.relationships : []
  )
    .slice(0, 48)
    .map((value, index) => {
      if (!isRecord(value))
        throw new Error(`Relationship ${index + 1} is invalid.`);
      const from = safeId(value.from, `Relationship ${index + 1} from`);
      const to = safeId(value.to, `Relationship ${index + 1} to`);
      if (!ids.has(from) || !ids.has(to))
        throw new Error(
          `Relationship ${index + 1} references an unknown structure.`,
        );
      const direction: BriefRelationship["direction"] =
        value.direction === "from-to" || value.direction === "bidirectional"
          ? value.direction
          : "none";
      return {
        from,
        to,
        relationship: text(value.relationship, 160),
        direction,
      };
    });
  const rawComposition = isRecord(input.composition) ? input.composition : {};
  const aspectRatio =
    rawComposition.aspectRatio === "3:4" ||
    rawComposition.aspectRatio === "16:9" ||
    rawComposition.aspectRatio === "1:1"
      ? rawComposition.aspectRatio
      : "4:3";
  const panelCount =
    typeof rawComposition.panelCount === "number" &&
    Number.isInteger(rawComposition.panelCount) &&
    rawComposition.panelCount >= 1 &&
    rawComposition.panelCount <= 8
      ? rawComposition.panelCount
      : 1;
  return {
    version: 1,
    subject,
    diagramType,
    title,
    subtitle: text(input.subtitle, 240),
    language,
    audience: text(input.audience, 160) || "educational textbook",
    view: text(input.view, 500) || "clear flat textbook view",
    structures,
    relationships,
    composition: {
      aspectRatio,
      panelCount,
      notes: text(rawComposition.notes, 1_000),
    },
    selectedReferenceId:
      input.selectedReferenceId === null ||
      input.selectedReferenceId === undefined
        ? null
        : safeId(input.selectedReferenceId, "selectedReferenceId"),
    referenceRationale: text(input.referenceRationale, 400),
    uncertainties: (Array.isArray(input.uncertainties)
      ? input.uncertainties
      : []
    )
      .map((item) => text(item, 240))
      .filter(Boolean)
      .slice(0, 12),
  };
}

export function normalizeReview(input: unknown): DiagramReview {
  if (!isRecord(input))
    throw new Error("The review response is not an object.");
  const score = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.min(100, Math.round(value)))
      : 0;
  const findings: DiagramReviewFinding[] = (
    Array.isArray(input.findings) ? input.findings : []
  )
    .slice(0, 20)
    .filter(isRecord)
    .map((item): DiagramReviewFinding => ({
      severity: item.severity === "error" ? "error" : "warning",
      category:
        item.category === "biology" ||
        item.category === "editability" ||
        item.category === "labels" ||
        item.category === "completeness"
          ? item.category
          : "fidelity",
      message: text(item.message, 300),
    }))
    .filter((item) => item.message);
  return {
    fidelity: score(input.fidelity),
    editability: score(input.editability),
    completeness: score(input.completeness),
    biologicalConfidence: score(input.biologicalConfidence),
    summary: text(input.summary, 600),
    findings,
    repairRecommended: input.repairRecommended === true,
  };
}
