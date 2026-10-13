import type { ModelStageDefinition } from "../../models.ts";

export const modelStages = {
  "inventory-verification": {
    "stageId": "inventory-verification",
    "label": {
      "en": "Inventory and best-effort verification",
      "cs": "Inventář a nezaručené ověření"
    },
    "defaultModel": "qwen/qwen3.5-122b-a10b",
    "environmentPrecedence": [
      "OPENROUTER_PROMPT_EXTRACTOR_MODEL"
    ],
    "failureFallbackModels": []
  }
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] = Object.values(modelStages);
