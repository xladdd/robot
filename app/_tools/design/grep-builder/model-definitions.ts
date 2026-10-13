import type { ModelStageDefinition } from "../../models.ts";

export const modelStages = {
  "conversion": {
    "stageId": "conversion",
    "label": {
      "en": "Non-deterministic GREP conversion",
      "cs": "Převod GREP mimo deterministická pravidla"
    },
    "defaultModel": "mistralai/ministral-8b-2512",
    "environmentPrecedence": [
      "OPENROUTER_GREP_MODEL"
    ],
    "failureFallbackModels": [],
    "data": {
      "en": "Only instructions not handled by deterministic rules reach OpenRouter.",
      "cs": "OpenRouter dostane jen pokyny, které nezpracují deterministická pravidla."
    }
  }
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] = Object.values(modelStages);
