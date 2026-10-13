import type { ModelStageDefinition } from "../../models.ts";

export const modelStages = {
  "prescan": {
    "stageId": "prescan",
    "label": {
      "en": "Role pre-scan",
      "cs": "Předběžný návrh rolí"
    },
    "defaultModel": "mistralai/ministral-14b-2512",
    "environmentPrecedence": [
      "OPENROUTER_TYPESETTER_PRESCAN_MODEL"
    ],
    "failureFallbackModels": []
  },
  "classification": {
    "stageId": "classification",
    "label": {
      "en": "Full block classification",
      "cs": "Úplná klasifikace bloků"
    },
    "defaultModel": "mistralai/mistral-large-2512",
    "environmentPrecedence": [
      "OPENROUTER_TYPESETTER_MODEL"
    ],
    "failureFallbackModels": []
  }
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] = Object.values(modelStages);
