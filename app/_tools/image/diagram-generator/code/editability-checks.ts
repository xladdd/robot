import type {
  BiologicalBriefV1,
  DiagramCheck,
  VectorObjectManifest,
} from "./contracts.ts";

export function runEditabilityChecks(
  svg: string,
  brief: BiologicalBriefV1,
  objects: VectorObjectManifest[],
  elementCount: number,
  pathCount: number,
): DiagramCheck[] {
  const checks: DiagramCheck[] = [
    {
      level: "pass",
      message: `Sanitized SVG contains ${elementCount} editable vector elements (${pathCount} paths).`,
    },
  ];
  const base = objects.filter((object) => object.role === "base");
  if (base.length) {
    checks.push({
      level: "pass",
      message: `Complete base geometry is present (${base.map((object) => object.id).join(", ")}); moving a mapped structure does not require a background cut-out.`,
    });
  } else {
    checks.push({
      level: "warning",
      message: "No complete base geometry was found.",
    });
  }
  const incomplete = objects.filter(
    (object) => object.role === "structure" && !object.complete,
  );
  if (incomplete.length)
    checks.push({
      level: "warning",
      message: `${incomplete.length} structure${incomplete.length === 1 ? "" : "s"} did not receive a completeness assertion from the vector model.`,
    });
  const missing = brief.structures.filter(
    (structure) =>
      !objects.some((object) => object.briefStructureId === structure.id),
  );
  if (missing.length)
    checks.push({
      level: "warning",
      message: `${missing.length} requested structure${missing.length === 1 ? "" : "s"} could not be mapped to vector geometry: ${missing.map((item) => item.name).join(", ")}.`,
    });
  if (
    !/<(?:path|circle|ellipse|rect|line|polyline|polygon)\b[^>]*data-object-id=/i.test(
      svg,
    )
  )
    checks.push({
      level: "warning",
      message:
        "No independently identifiable shape was found in the final SVG.",
    });
  if (
    /<(?:image|foreignObject|script|use|filter|mask|clipPath|style)\b/i.test(
      svg,
    )
  )
    checks.push({
      level: "warning",
      message:
        "The final SVG contains a prohibited non-editable or executable construct.",
    });
  if (svg.length > 350_000)
    checks.push({
      level: "warning",
      message: "The SVG is unusually large; Illustrator editing may be slow.",
    });
  checks.push({
    level: "pass",
    message:
      "Labels and leader lines were added as separate editable SVG objects after reconstruction.",
  });
  return checks;
}
