import type { ModelStageDefinition } from "../../models.ts";

export const modelStages = {
  "ocr": {
    "stageId": "ocr",
    "trimEnvironmentValue": true,
    "label": {
      "en": "Image reading / PDF transcription",
      "cs": "Čtení obrázků / přepis PDF"
    },
    "defaultModel": "mistralai/mistral-small-2603",
    "environmentPrecedence": [
      "OPENROUTER_OCR_MODEL"
    ],
    "failureFallbackModels": [],
    "providerNotes": {
      "en": "Mistral models prefer mistral/eu, then retry on regular mistral; provider routing is not a residency guarantee.",
      "cs": "Modely Mistral preferují mistral/eu, poté zkusí běžný mistral; směrování poskytovatele nezaručuje rezidenci dat."
    }
  },
  "pdf-parser": {
    "stageId": "pdf-parser",
    "label": {
      "en": "PDF parser plugin",
      "cs": "Plugin pro čtení PDF"
    },
    "defaultModel": "mistral-ocr",
    "environmentPrecedence": [],
    "failureFallbackModels": [],
    "data": {
      "en": "PDF file-parser engine, not a selectable chat model.",
      "cs": "Engine pluginu file-parser pro PDF, nikoli volitelný chatový model."
    }
  },
  "correction": {
    "stageId": "correction",
    "label": {
      "en": "Text correction",
      "cs": "Oprava textu"
    },
    "defaultModel": "mistralai/ministral-8b-2512",
    "environmentPrecedence": [
      "OPENROUTER_CORRECTION_MODEL"
    ],
    "failureFallbackModels": []
  }
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] = Object.values(modelStages);
