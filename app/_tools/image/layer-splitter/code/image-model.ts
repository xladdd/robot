import type { LayerSplitterQuality } from "../types";

export type ImagePurpose = "background" | "object-completion";

export type ImageRequestInput = {
  model: string;
  prompt: string;
  reference: string;
  purpose: ImagePurpose;
  quality: LayerSplitterQuality;
  width: number;
  height: number;
  seed: number;
};

type Ratio = { value: string; ratio: number };

const GPT_RATIOS: Ratio[] = [
  { value: "1:1", ratio: 1 },
  { value: "3:2", ratio: 3 / 2 },
  { value: "2:3", ratio: 2 / 3 },
  { value: "4:3", ratio: 4 / 3 },
  { value: "3:4", ratio: 3 / 4 },
  { value: "16:9", ratio: 16 / 9 },
  { value: "9:16", ratio: 9 / 16 },
  { value: "21:9", ratio: 21 / 9 },
];

const SEEDREAM_RATIOS: Ratio[] = [
  { value: "1:1", ratio: 1 },
  { value: "1:2", ratio: 1 / 2 },
  { value: "2:1", ratio: 2 },
  { value: "2:3", ratio: 2 / 3 },
  { value: "3:2", ratio: 3 / 2 },
  { value: "3:4", ratio: 3 / 4 },
  { value: "4:3", ratio: 4 / 3 },
  { value: "4:5", ratio: 4 / 5 },
  { value: "5:4", ratio: 5 / 4 },
  { value: "9:16", ratio: 9 / 16 },
  { value: "16:9", ratio: 16 / 9 },
  { value: "9:21", ratio: 9 / 21 },
  { value: "21:9", ratio: 21 / 9 },
];

const FLUX_RATIOS: Ratio[] = [
  { value: "1:1", ratio: 1 },
  { value: "1:2", ratio: 1 / 2 },
  { value: "2:1", ratio: 2 },
  { value: "2:3", ratio: 2 / 3 },
  { value: "3:2", ratio: 3 / 2 },
  { value: "3:4", ratio: 3 / 4 },
  { value: "4:3", ratio: 4 / 3 },
  { value: "4:5", ratio: 4 / 5 },
  { value: "5:4", ratio: 5 / 4 },
  { value: "5:7", ratio: 5 / 7 },
  { value: "7:5", ratio: 7 / 5 },
  { value: "9:16", ratio: 9 / 16 },
  { value: "16:9", ratio: 16 / 9 },
  { value: "9:21", ratio: 9 / 21 },
  { value: "21:9", ratio: 21 / 9 },
];

function closestAspectRatio(width: number, height: number, ratios: Ratio[]) {
  const target = width / height;
  return ratios.reduce((best, candidate) =>
    Math.abs(candidate.ratio - target) < Math.abs(best.ratio - target)
      ? candidate
      : best,
  ).value;
}

function reference(url: string) {
  return [{ type: "image_url", image_url: { url } }];
}

export function backgroundModelForQuality(quality: LayerSplitterQuality) {
  if (quality === "fidelity")
    return (
      process.env.OPENROUTER_LAYER_SPLITTER_BACKGROUND_FIDELITY_MODEL ||
      process.env.OPENROUTER_LAYER_SPLITTER_FIDELITY_MODEL ||
      "bytedance-seed/seedream-5-0-pro"
    );
  return (
    process.env.OPENROUTER_LAYER_SPLITTER_BACKGROUND_FAST_MODEL ||
    process.env.OPENROUTER_LAYER_SPLITTER_FAST_MODEL ||
    "bytedance-seed/seedream-5-0-flash"
  );
}

export function objectCompletionModel() {
  return (
    process.env.OPENROUTER_LAYER_SPLITTER_OBJECT_COMPLETION_MODEL ||
    "openai/gpt-image-2.5-sunburst"
  );
}

export function buildImageRequest(
  input: ImageRequestInput,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    input_references: reference(input.reference),
    n: 1,
  };

  if (input.model.startsWith("bytedance-seed/seedream-5-0-"))
    return {
      ...base,
      provider: { only: ["seed"], allow_fallbacks: false },
      aspect_ratio: closestAspectRatio(
        input.width,
        input.height,
        SEEDREAM_RATIOS,
      ),
      resolution: input.quality === "fidelity" ? "2K" : "1K",
      seed: input.seed,
    };

  if (input.model.startsWith("openai/gpt-image-2.5-"))
    return {
      ...base,
      provider: { only: ["openai"], allow_fallbacks: false },
      aspect_ratio: closestAspectRatio(input.width, input.height, GPT_RATIOS),
      quality:
        input.model.endsWith("sunburst") && input.quality === "fidelity"
          ? "high"
          : "medium",
      background:
        input.purpose === "object-completion" ? "transparent" : "opaque",
    };

  if (input.model === "black-forest-labs/flux-3-image")
    return {
      ...base,
      provider: { only: ["black-forest-labs"], allow_fallbacks: false },
      aspect_ratio: closestAspectRatio(input.width, input.height, FLUX_RATIOS),
      resolution: input.quality === "fidelity" ? "2K" : "768",
    };

  if (input.model === "inclusionai/ming-image-0.1-design-layer")
    return {
      ...base,
      provider: { only: ["novita"], allow_fallbacks: false },
      output_format: "png",
    };

  if (input.model.startsWith("black-forest-labs/flux.2-"))
    return {
      ...base,
      aspect_ratio: closestAspectRatio(input.width, input.height, GPT_RATIOS),
      resolution: input.quality === "fidelity" ? "1K" : "512",
      output_format: "png",
      seed: input.seed,
    };

  return {
    ...base,
    aspect_ratio: closestAspectRatio(input.width, input.height, GPT_RATIOS),
  };
}
