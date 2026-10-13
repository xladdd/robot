import type { ModelStageDefinition } from "../../models.ts";

export const modelStages = {
  "planner": {
    "stageId": "planner",
    "label": {
      "en": "Concept planning",
      "cs": "Plánování konceptů"
    },
    "defaultModel": "mistralai/mistral-medium-3-5",
    "environmentPrecedence": [],
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
      "en": "Default artwork",
      "cs": "Výchozí ilustrace"
    },
    "defaultModel": "black-forest-labs/flux.2-pro",
    "environmentPrecedence": [],
    "failureFallbackModels": []
  },
  "alternative-image": {
    "stageId": "alternative-image",
    "label": {
      "en": "Selectable alternative artwork",
      "cs": "Volitelná alternativní ilustrace"
    },
    "defaultModel": "google/gemini-3.1-flash-lite-image",
    "environmentPrecedence": [],
    "failureFallbackModels": []
  }
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] = Object.values(modelStages);
