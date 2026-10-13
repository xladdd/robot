import type { ModelStageDefinition } from "../../models.ts";

export const modelStages = {
  "forms": {
    "stageId": "forms",
    "label": {
      "en": "Grammatical forms",
      "cs": "Gramatické tvary"
    },
    "defaultModel": "mistralai/mistral-medium-3-5",
    "environmentPrecedence": [
      "OPENROUTER_INDEX_MODEL"
    ],
    "failureFallbackModels": []
  },
  "local-ocr": {
    "stageId": "local-ocr",
    "label": {
      "en": "Local Czech OCR",
      "cs": "Místní české OCR"
    },
    "defaultModel": "Tesseract.js / ces",
    "environmentPrecedence": [],
    "failureFallbackModels": [],
    "data": {
      "en": "Runs locally in the browser; runtime and language data may be downloaded.",
      "cs": "Běží místně v prohlížeči; runtime a jazyková data se mohou stahovat."
    }
  }
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] = Object.values(modelStages);
