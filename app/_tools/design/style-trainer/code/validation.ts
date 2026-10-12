// Pure request validation for the Style Trainer endpoint. Shared by the
// server and Node tests; no server-only imports allowed here.

export const MAX_STYLE_REFERENCES = 6;
export const MAX_REFERENCE_SIZE = 7_000_000;
export const MAX_TEST_PROMPT_LENGTH = 2_000;
export const MAX_STYLE_PROMPT_LENGTH = 2_000;
export const MAX_STYLE_REQUEST_NOTES = 2_000;
export const MAX_SEED = 2_000_000_000;

export class StyleValidationError extends Error {}

const isImageDataUrl = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= MAX_REFERENCE_SIZE &&
  /^data:image\/(png|jpeg|webp);base64,/i.test(value);

function requiredString(value: unknown, field: string, maximum: number) {
  if (typeof value !== "string" || !value.trim())
    throw new StyleValidationError(`${field} is required.`);
  const result = value.trim();
  if (result.length > maximum)
    throw new StyleValidationError(`${field} is too long.`);
  return result;
}

export function validateStyleReferences(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1)
    throw new StyleValidationError("At least one reference image is required.");
  if (value.length > MAX_STYLE_REFERENCES)
    throw new StyleValidationError(
      `At most ${MAX_STYLE_REFERENCES} reference images are allowed.`,
    );
  const references = value.filter(isImageDataUrl);
  if (references.length !== value.length)
    throw new StyleValidationError(
      "One or more reference images did not pass validation.",
    );
  return references;
}

export function validateTestPrompt(value: unknown): string {
  return requiredString(value, "testPrompt", MAX_TEST_PROMPT_LENGTH);
}

export function validateStylePrompt(value: unknown): string {
  return requiredString(value, "stylePrompt", MAX_STYLE_PROMPT_LENGTH);
}

export function validateInstruction(value: unknown): string {
  return requiredString(value, "instruction", MAX_TEST_PROMPT_LENGTH);
}

export function validateSeed(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_SEED
  )
    throw new StyleValidationError(
      "The seed must be a whole number between 0 and 2,000,000,000.",
    );
  return value;
}

export type StyleSubmissionRequest = {
  styleId: string;
  styleName: string;
  stylePrompt: string;
  seed: number;
  testPrompt: string;
  roundCount: number;
  notes: string;
};

const STYLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,59}$/;

// The final review values are re-validated on the server before an Asana
// task is created, exactly like the feedback endpoint re-validates its body.
export function validateStyleSubmission(
  value: unknown,
): StyleSubmissionRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new StyleValidationError("Request body must be an object.");
  const source = value as Record<string, unknown>;

  const styleId =
    typeof source.styleId === "string" ? source.styleId.trim() : "";
  if (!STYLE_ID_PATTERN.test(styleId))
    throw new StyleValidationError("styleId has an invalid value.");

  const styleName = requiredString(source.styleName, "styleName", 60);

  const roundCount =
    typeof source.roundCount === "number" &&
    Number.isInteger(source.roundCount) &&
    source.roundCount >= 1 &&
    source.roundCount <= 200
      ? source.roundCount
      : null;
  if (roundCount === null)
    throw new StyleValidationError("roundCount has an invalid value.");

  const notes =
    typeof source.notes === "string"
      ? source.notes.trim().slice(0, MAX_STYLE_REQUEST_NOTES)
      : "";

  return {
    styleId,
    styleName,
    stylePrompt: validateStylePrompt(source.stylePrompt),
    seed: validateSeed(source.seed),
    testPrompt: validateTestPrompt(source.testPrompt),
    roundCount,
    notes,
  };
}
