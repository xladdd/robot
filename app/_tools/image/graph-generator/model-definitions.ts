import type { ModelStageDefinition } from "../../models.ts";

export const evaluationModels = [
  "qwen/qwen3.6-35b-a3b",
  "openai/gpt-oss-120b",
  "google/gemma-4-26b-a4b-it",
  "meta-llama/llama-4-maverick",
] as const;

export const modelStages = {
  "structure": {
    "stageId": "structure",
    "label": {
      "en": "Chart structure",
      "cs": "Struktura grafu"
    },
    "defaultModel": "mistralai/mistral-large-2512",
    "environmentPrecedence": [
      "OPENROUTER_FIGURE_MODEL"
    ],
    "failureFallbackModels": [],
    "providerNotes": {
      "en": `The evaluation API can override this with: ${evaluationModels.join(", ")}.`,
      "cs": `Vyhodnocovací API může použít: ${evaluationModels.join(", ")}.`
    }
  }
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] = Object.values(modelStages);
