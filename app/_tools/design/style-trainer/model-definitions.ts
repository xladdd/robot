import type { ModelStageDefinition } from "../../models.ts";

export const modelStages = {
  "planner": {
    "stageId": "planner",
    "label": {
      "en": "Style planning and revision",
      "cs": "Plánování a revize stylu"
    },
    "defaultModel": "mistralai/mistral-medium-3-5",
    "environmentPrecedence": [
      "OPENROUTER_STYLE_TRAINER_MODEL"
    ],
    "failureFallbackModels": [
      {
        "defaultModel": "mistralai/ministral-14b-2512",
        "environmentPrecedence": []
      }
    ]
  },
  "image": {
    "stageId": "image",
    "label": {
      "en": "Seeded test rounds",
      "cs": "Testovací kola se seedem"
    },
    "defaultModel": "black-forest-labs/flux.2-pro",
    "environmentPrecedence": [
      "OPENROUTER_STYLE_TRAINER_IMAGE_MODEL",
      "OPENROUTER_COVER_FIDELITY_MODEL"
    ],
    "failureFallbackModels": []
  }
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] = Object.values(modelStages);
