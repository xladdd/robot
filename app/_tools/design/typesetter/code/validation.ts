import { isSemanticRoleId } from "../roles.ts";
import type {
  AnalysedBlock,
  RoleMapping,
  SemanticRoleId,
  TypesetterInventory,
  TypesetterManifest,
  TypesetterSourceBlock,
} from "../types";

export const TYPESETTER_FORMAT = "indesign-typesetter-v1" as const;
export const TYPESETTER_VERSION = 1 as const;
export const MAIN_STORY_LABEL = "typesetter:story:main" as const;
export const IMAGE_LAYER = "IMAGE REQUESTS" as const;
export const REVIEW_CONFIDENCE = 0.75;

export function stylePaths(inventory: TypesetterInventory) {
  return new Set(inventory.paragraphStyles.map(({ path }) => path));
}

export function objectStylePaths(inventory: TypesetterInventory) {
  return new Set(inventory.objectStyles.map(({ path }) => path));
}

export function validateMappings(
  roles: SemanticRoleId[],
  mappings: Partial<Record<SemanticRoleId, RoleMapping>>,
  inventory: TypesetterInventory,
): string[] {
  const errors: string[] = [];
  const paragraphStyles = stylePaths(inventory);
  const objectStyles = objectStylePaths(inventory);
  for (const role of roles) {
    if (role === "unsupported") continue;
    const mapping = mappings[role];
    if (!mapping?.paragraphStyle) {
      errors.push(`Missing paragraph style for ${role}.`);
      continue;
    }
    if (!paragraphStyles.has(mapping.paragraphStyle))
      errors.push(
        `Paragraph style no longer exists: ${mapping.paragraphStyle}.`,
      );
    if (
      role === "image.request" &&
      mapping.objectStyle &&
      !objectStyles.has(mapping.objectStyle)
    )
      errors.push(`Object style no longer exists: ${mapping.objectStyle}.`);
  }
  return errors;
}

export function requiresReview(block: AnalysedBlock) {
  return (
    block.role === "unsupported" ||
    block.confidence < REVIEW_CONFIDENCE ||
    Boolean(block.warning)
  );
}

export function manifestSummary(blocks: AnalysedBlock[]) {
  return {
    blocks: blocks.length,
    imageRequests: blocks.filter(({ role }) => role === "image.request").length,
    lowConfidence: blocks.filter(
      ({ confidence }) => confidence < REVIEW_CONFIDENCE,
    ).length,
    unsupported: blocks.filter(({ role }) => role === "unsupported").length,
    unresolved: blocks.filter(
      (block) => requiresReview(block) && !block.reviewed,
    ).length,
  };
}

export function validateAnalysedBlocks(
  source: TypesetterSourceBlock[],
  analysed: AnalysedBlock[],
  allowedRoles: SemanticRoleId[],
): string[] {
  const errors: string[] = [];
  const allowed = new Set<SemanticRoleId>([...allowedRoles, "unsupported"]);
  if (source.length !== analysed.length)
    errors.push("The analysed block count does not match the manuscript.");
  for (let index = 0; index < source.length; index += 1) {
    const original = source[index];
    const result = analysed[index];
    if (!result || result.id !== original.id)
      errors.push(`Missing or reordered source block ${original.id}.`);
    else if (result.text !== original.text)
      errors.push(`Source text changed in block ${original.id}.`);
    if (result && (!isSemanticRoleId(result.role) || !allowed.has(result.role)))
      errors.push(`Invalid role in block ${original.id}.`);
  }
  return errors;
}

export function validateManifest(manifest: TypesetterManifest) {
  const errors: string[] = [];
  if (manifest.format !== TYPESETTER_FORMAT)
    errors.push("Unsupported Typesetter format.");
  if (manifest.version !== TYPESETTER_VERSION)
    errors.push("Unsupported Typesetter version.");
  if (!manifest.template.id.trim()) errors.push("Template ID is required.");
  if (!manifest.template.version.trim())
    errors.push("Template version is required.");
  if (manifest.template.mainStoryLabel !== MAIN_STORY_LABEL)
    errors.push("Unexpected main story label.");
  if (manifest.summary.unresolved > 0)
    errors.push("Review every uncertain block before export.");
  return errors;
}
