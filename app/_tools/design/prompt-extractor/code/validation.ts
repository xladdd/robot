import { normalizePrompt } from "./output.ts";

const MAX_PROMPT_LENGTH = 500;
const MAX_ASSETS_PER_PAGE = 40;
const MAX_SUBJECTS_PER_ASSET = 50;
const forbiddenPromptContent =
  /https?:\/\/|\b(?:caption|label|labels|number|numbers|numbered|printed|text|word|words|arrow|arrows|pathway|route|maze|exercise|background)\b|\b(?:flat[- ]color|cloud-like shape|empty boxes?)\b/i;

export type AssetRelationship =
  "independent" | "cohesive_composition" | "variation_set" | "background";

export type AssetSubject = {
  name: string;
  color: string;
  pose: string;
};

export type AssetRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExtractedAsset = {
  order: number;
  relationship: AssetRelationship;
  visibleCount: number | null;
  region: AssetRegion;
  subjects: AssetSubject[];
  prompt: string;
};

export function validatePrompt(value: unknown) {
  if (typeof value !== "string") return "Prompt must be text.";
  const prompt = normalizePrompt(value);
  if (!prompt) return "Prompt must not be empty.";
  if (prompt.length > MAX_PROMPT_LENGTH)
    return "Prompt is longer than the permitted limit.";
  if (/\d/.test(prompt)) return "Prompt must not contain printed digits.";
  if (forbiddenPromptContent.test(prompt))
    return "Prompt must not contain manuscript text or labels.";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function validateSubject(
  value: unknown,
  assetIndex: number,
  subjectIndex: number,
) {
  if (!isRecord(value))
    return `Asset ${assetIndex + 1}, subject ${subjectIndex + 1} must be an object.`;
  for (const field of ["name", "color", "pose"]) {
    if (typeof value[field] !== "string")
      return `Asset ${assetIndex + 1}, subject ${subjectIndex + 1} has an invalid ${field}.`;
  }
  const name = value.name;
  if (typeof name !== "string" || !name.trim())
    return `Asset ${assetIndex + 1}, subject ${subjectIndex + 1} needs a name.`;
  return null;
}

export function validateInventory(
  value: unknown,
): { valid: true; assets: ExtractedAsset[] } | { valid: false; error: string } {
  if (!isRecord(value) || !Array.isArray(value.assets))
    return {
      valid: false,
      error: "The model did not return an asset inventory.",
    };
  if (value.assets.length > MAX_ASSETS_PER_PAGE)
    return {
      valid: false,
      error: "The model returned too many assets for one page.",
    };

  const orders = new Set<number>();
  const assets: ExtractedAsset[] = [];
  for (let index = 0; index < value.assets.length; index += 1) {
    const candidate = value.assets[index];
    if (!isRecord(candidate))
      return { valid: false, error: `Asset ${index + 1} must be an object.` };
    const order = candidate.order;
    const relationship = candidate.relationship;
    const visibleCount = candidate.visibleCount;
    const region = candidate.region;
    const subjects = candidate.subjects;
    const prompt = candidate.prompt;

    if (!Number.isInteger(order) || (order as number) < 1)
      return {
        valid: false,
        error: `Asset ${index + 1} has an invalid order.`,
      };
    if (orders.has(order as number))
      return { valid: false, error: `Asset order ${order} is duplicated.` };
    orders.add(order as number);
    if (
      relationship !== "independent" &&
      relationship !== "cohesive_composition" &&
      relationship !== "variation_set" &&
      relationship !== "background"
    )
      return {
        valid: false,
        error: `Asset ${index + 1} has an invalid relationship.`,
      };
    if (
      visibleCount !== null &&
      (!Number.isInteger(visibleCount) || (visibleCount as number) < 1)
    )
      return {
        valid: false,
        error: `Asset ${index + 1} has an invalid visible count.`,
      };
    if (!isRecord(region))
      return {
        valid: false,
        error: `Asset ${index + 1} has an invalid region.`,
      };
    const regionValues = [region.x, region.y, region.width, region.height];
    if (
      regionValues.some(
        (value) => typeof value !== "number" || !Number.isFinite(value),
      ) ||
      (region.x as number) < 0 ||
      (region.y as number) < 0 ||
      (region.width as number) <= 0 ||
      (region.height as number) <= 0 ||
      (region.x as number) + (region.width as number) > 1 ||
      (region.y as number) + (region.height as number) > 1
    )
      return {
        valid: false,
        error: `Asset ${index + 1} has an invalid region.`,
      };
    if (!Array.isArray(subjects) || subjects.length > MAX_SUBJECTS_PER_ASSET)
      return {
        valid: false,
        error: `Asset ${index + 1} has invalid subjects.`,
      };

    for (
      let subjectIndex = 0;
      subjectIndex < subjects.length;
      subjectIndex += 1
    ) {
      const subjectError = validateSubject(
        subjects[subjectIndex],
        index,
        subjectIndex,
      );
      if (subjectError) return { valid: false, error: subjectError };
    }

    const promptError = validatePrompt(prompt);
    if (promptError)
      return { valid: false, error: `Asset ${index + 1}: ${promptError}` };

    if (
      relationship === "variation_set" &&
      (visibleCount === null || (visibleCount as number) < 2)
    )
      return {
        valid: false,
        error: `Asset ${index + 1}: variation sets need a count of at least two.`,
      };
    if (relationship === "background" && subjects.length < 1)
      return {
        valid: false,
        error: `Asset ${index + 1}: backgrounds need a subject description.`,
      };

    assets.push({
      order: order as number,
      relationship,
      visibleCount: visibleCount as number | null,
      region: {
        x: region.x as number,
        y: region.y as number,
        width: region.width as number,
        height: region.height as number,
      },
      subjects: subjects.map((subject) => {
        const item = subject as Record<string, string>;
        return {
          name: item.name.trim(),
          color: item.color.trim(),
          pose: item.pose.trim(),
        };
      }),
      prompt: normalizePrompt(prompt as string),
    });
  }

  return {
    valid: true,
    assets: assets.sort((left, right) => left.order - right.order),
  };
}
