import type { ModelStageDefinition } from "../../models.ts";

export const modelStages = {
  "fast": {
    "stageId": "fast",
    "label": {
      "en": "Fast 512 px generation",
      "cs": "Rychlé generování 512 px"
    },
    "defaultModel": "black-forest-labs/flux.2-klein-4b",
    "environmentPrecedence": [
      "OPENROUTER_COVER_SKETCH_MODEL"
    ],
    "failureFallbackModels": []
  },
  "fidelity": {
    "stageId": "fidelity",
    "label": {
      "en": "Fidelity / Advanced default",
      "cs": "Věrný režim / výchozí pokročilý model"
    },
    "defaultModel": "black-forest-labs/flux.2-pro",
    "environmentPrecedence": [
      "OPENROUTER_COVER_FIDELITY_MODEL"
    ],
    "failureFallbackModels": [],
    "providerNotes": {
      "en": "When enabled, Advanced uses the requested model from the live FLUX catalogue; this row is its default.",
      "cs": "Je-li zapnutý pokročilý režim, použije zvolený model z živého katalogu FLUX; zde je jeho výchozí model."
    }
  },
  "upscale": {
    "stageId": "upscale",
    "label": {
      "en": "Generative upscale",
      "cs": "Generativní zvětšení"
    },
    "defaultModel": "black-forest-labs/flux.2-pro",
    "environmentPrecedence": [
      "OPENROUTER_IMAGE_UPSCALE_MODEL",
      "OPENROUTER_COVER_PRODUCTION_MODEL"
    ],
    "failureFallbackModels": []
  }
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] = Object.values(modelStages);
