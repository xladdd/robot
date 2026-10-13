import type { ModelStageDefinition } from "../../models.ts";

export const modelStages = {
  "planner": {
    "stageId": "planner",
    "label": {
      "en": "Concepts and prompt compilation",
      "cs": "Koncepty a sestavení promptu"
    },
    "defaultModel": "mistralai/mistral-medium-3-5",
    "environmentPrecedence": [
      "OPENROUTER_CONCEPT_ILLUSTRATOR_PLAN_MODEL"
    ],
    "failureFallbackModels": [
      {
        "defaultModel": "mistralai/ministral-14b-2512",
        "environmentPrecedence": [
          "OPENROUTER_CONCEPT_ILLUSTRATOR_PLAN_FALLBACK_MODEL"
        ]
      }
    ]
  },
  "image": {
    "stageId": "image",
    "label": {
      "en": "Generation and editing",
      "cs": "Generování a úpravy"
    },
    "defaultModel": "black-forest-labs/flux.2-pro",
    "environmentPrecedence": [
      "OPENROUTER_CONCEPT_ILLUSTRATOR_IMAGE_MODEL"
    ],
    "failureFallbackModels": []
  },
  "critique": {
    "stageId": "critique",
    "label": {
      "en": "Explicit critique",
      "cs": "Výslovná kritika"
    },
    "defaultModel": "google/gemini-3.8-flash",
    "environmentPrecedence": [
      "OPENROUTER_CONCEPT_ILLUSTRATOR_CRITIQUE_MODEL"
    ],
    "failureFallbackModels": []
  }
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] = Object.values(modelStages);
