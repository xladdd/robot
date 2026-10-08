import type {
  ConceptAspectRatio,
  IllustrationConcept,
  IllustrationCritique,
  IllustrationUsage,
} from "./types.ts";

export const CONCEPT_COUNT = 3;
export const MAX_ARTICLE_LENGTH = 50_000;
export const MAX_IMAGE_BYTES = 7_000_000;
export const MAX_PROMPT_LENGTH = 2_000;
export const MAX_STYLE_REFERENCES = 3;

const aspectRatios: readonly ConceptAspectRatio[] = [
  "1:1",
  "4:3",
  "3:2",
  "16:9",
];
const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const imageDataUrlPattern = /^data:image\/(png|jpeg|webp);base64,(.+)$/i;

export type ConceptModelMetadata = {
  model: string;
  generationId: string | null;
  usage: IllustrationUsage;
};

export type GeneratedIllustration = ConceptModelMetadata & {
  data: string;
  prompt: string;
  seed: number;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactText(value: unknown, fieldName: string, maximum: number) {
  if (typeof value !== "string") throw new Error(`${fieldName} must be text.`);
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error(`${fieldName} must not be empty.`);
  if (normalized.length > maximum)
    throw new Error(`${fieldName} must be at most ${maximum} characters.`);
  return normalized;
}

export function normalizeOptionalText(
  value: unknown,
  fieldName: string,
  maximum: number,
) {
  if (value === undefined || value === null || value === "") return "";
  return compactText(value, fieldName, maximum);
}

export function normalizeArticle(value: unknown) {
  if (typeof value !== "string") throw new Error("article must be text.");
  const article = value.trim();
  if (!article) throw new Error("article must not be empty.");
  if (article.length > MAX_ARTICLE_LENGTH)
    throw new Error(
      `article must be at most ${MAX_ARTICLE_LENGTH.toLocaleString("en-US")} characters.`,
    );
  return article;
}

export function normalizeStyle(value: unknown) {
  return normalizeOptionalText(value, "style", 6_000);
}

export function normalizeFeedback(value: unknown) {
  return normalizeOptionalText(value, "feedback", 8_000);
}

export function normalizeEdit(value: unknown) {
  return compactText(value, "edit", 1_000);
}

export function normalizePrompt(value: unknown) {
  const prompt = compactText(value, "prompt", MAX_PROMPT_LENGTH);
  if (prompt.length < 8)
    throw new Error("prompt must contain useful concrete art direction.");
  return prompt;
}

export function parseAspectRatio(value: unknown): ConceptAspectRatio {
  if (
    typeof value === "string" &&
    aspectRatios.includes(value as ConceptAspectRatio)
  )
    return value as ConceptAspectRatio;
  throw new Error("aspectRatio must be 1:1, 4:3, 3:2, or 16:9.");
}

export function normalizeConceptId(value: unknown, fieldName = "concept id") {
  const id = compactText(value, fieldName, 64);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id))
    throw new Error(`${fieldName} must be a safe identifier.`);
  return id;
}

export function normalizeConcept(value: unknown): IllustrationConcept {
  if (!isRecord(value)) throw new Error("concept must be an object.");
  const concept = {
    id: normalizeConceptId(value.id),
    title: compactText(value.title, "concept title", 120),
    visual: compactText(value.visual, "concept visual", 700),
    meaning: compactText(value.meaning, "concept meaning", 500),
  } satisfies IllustrationConcept;
  if (
    concept.title.length < 2 ||
    concept.visual.length < 8 ||
    concept.meaning.length < 4
  )
    throw new Error("Every concept needs a useful title, visual, and meaning.");
  return concept;
}

function conceptSignature(concept: IllustrationConcept) {
  return [concept.title, concept.visual, concept.meaning]
    .map((part) => part.toLocaleLowerCase("en-US"))
    .join("\n");
}

function assertDistinctConcepts(concepts: readonly IllustrationConcept[]) {
  const ids = new Set(concepts.map(({ id }) => id));
  if (ids.size !== concepts.length)
    throw new Error("Concept IDs must be unique.");
  const signatures = new Set(concepts.map(conceptSignature));
  if (signatures.size !== concepts.length)
    throw new Error("Concepts must be meaningfully distinct, not duplicates.");
}

export function normalizeConceptBatch(value: unknown): IllustrationConcept[] {
  if (!Array.isArray(value) || value.length !== CONCEPT_COUNT)
    throw new Error(
      `The planner must return exactly ${CONCEPT_COUNT} concepts.`,
    );
  const concepts = value.map(normalizeConcept);
  assertDistinctConcepts(concepts);
  return concepts;
}

export function normalizeOtherConcepts(
  value: unknown,
  stableSlotId: string,
): IllustrationConcept[] {
  if (!Array.isArray(value) || value.length !== CONCEPT_COUNT - 1)
    throw new Error(
      "Regeneration requires summaries of the other two concepts.",
    );
  const concepts = value.map(normalizeConcept);
  assertDistinctConcepts(concepts);
  if (concepts.some(({ id }) => id === stableSlotId))
    throw new Error(
      "Other concept summaries must not use the regenerated slot ID.",
    );
  return concepts;
}

export function normalizeReplacementConcept(
  value: unknown,
  stableSlotId: string,
  otherConcepts: readonly IllustrationConcept[] = [],
): IllustrationConcept {
  if (Array.isArray(value))
    throw new Error(
      "Regeneration must return exactly one replacement concept.",
    );
  const replacement = normalizeConcept(value);
  const stableId = normalizeConceptId(stableSlotId, "stable slot id");
  const normalized = { ...replacement, id: stableId };
  if (otherConcepts.some((concept) => concept.id === stableId))
    throw new Error("The stable slot ID conflicts with another concept.");
  if (
    otherConcepts.some(
      (concept) => conceptSignature(concept) === conceptSignature(normalized),
    )
  )
    throw new Error("The replacement concept duplicates another concept.");
  return normalized;
}

function decodedBase64Size(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function hasImageSignature(mediaType: string, payload: string) {
  let header: string;
  try {
    header = atob(payload.slice(0, 24));
  } catch {
    return false;
  }
  const byte = (index: number) => header.charCodeAt(index);
  if (mediaType === "png")
    return (
      byte(0) === 0x89 &&
      header.slice(1, 4) === "PNG" &&
      byte(4) === 0x0d &&
      byte(5) === 0x0a &&
      byte(6) === 0x1a &&
      byte(7) === 0x0a
    );
  if (mediaType === "jpeg")
    return byte(0) === 0xff && byte(1) === 0xd8 && byte(2) === 0xff;
  return header.slice(0, 4) === "RIFF" && header.slice(8, 12) === "WEBP";
}

export function normalizeImageDataUrl(value: unknown, fieldName = "image") {
  if (typeof value !== "string")
    throw new Error(`${fieldName} must be a PNG, JPEG, or WebP data URL.`);
  const match = value.match(imageDataUrlPattern);
  const mediaType = match?.[1].toLowerCase() || "";
  const payload = match?.[2] || "";
  if (
    !match ||
    !base64Pattern.test(payload) ||
    decodedBase64Size(payload) > MAX_IMAGE_BYTES ||
    !hasImageSignature(mediaType, payload)
  )
    throw new Error(
      `${fieldName} must be a valid PNG, JPEG, or WebP data URL no larger than 7 MB.`,
    );
  return value;
}

export function normalizeImageReferences(
  value: unknown,
  maximum = MAX_STYLE_REFERENCES,
  fieldName = "styleReferences",
) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array.`);
  if (value.length > maximum)
    throw new Error(`${fieldName} accepts at most ${maximum} images.`);
  return value.map((reference, index) =>
    normalizeImageDataUrl(reference, `${fieldName}[${index}]`),
  );
}

export function normalizeCritique(value: unknown): IllustrationCritique {
  if (!isRecord(value)) throw new Error("The critique must be an object.");
  if (!Array.isArray(value.corrections) || value.corrections.length > 8)
    throw new Error("The critique must contain at most eight corrections.");
  const corrections = value.corrections.map((correction, index) =>
    compactText(correction, `corrections[${index}]`, 400),
  );
  return {
    summary: compactText(value.summary, "critique summary", 800),
    corrections,
    suggestedEdit: compactText(value.suggestedEdit, "suggested edit", 800),
  };
}
