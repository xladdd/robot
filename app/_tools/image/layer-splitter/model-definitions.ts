import type { ModelStageDefinition } from "../../models.ts";

export const modelStages = {
  "planner": {
    "stageId": "planner",
    "label": {
      "en": "Scene and layer planning",
      "cs": "Plánování scény a vrstev"
    },
    "defaultModel": "mistralai/mistral-large-4-0",
    "environmentPrecedence": [
      "OPENROUTER_LAYER_SPLITTER_PLAN_MODEL"
    ],
    "failureFallbackModels": [],
    "providerNotes": {
      "en": "Mistral uses mistral/eu unless a planner provider override is configured.",
      "cs": "Mistral používá mistral/eu, pokud není nastaven jiný poskytovatel plánovače."
    }
  },
  "decomposition": {
    "stageId": "decomposition",
    "label": {
      "en": "RGBA decomposition",
      "cs": "Rozklad RGBA"
    },
    "defaultModel": "inclusionai/ming-image-0.1-design-layer",
    "environmentPrecedence": [
      "OPENROUTER_LAYER_SPLITTER_DECOMPOSITION_MODEL"
    ],
    "failureFallbackModels": []
  },
  "mask": {
    "stageId": "mask",
    "label": {
      "en": "Missing object masks",
      "cs": "Chybějící masky objektů"
    },
    "defaultModel": "qwen/qwen3.7-flash",
    "environmentPrecedence": [
      "OPENROUTER_LAYER_SPLITTER_MASK_MODEL"
    ],
    "failureFallbackModels": [
      {
        "defaultModel": "google/gemini-3.6-flash",
        "environmentPrecedence": [
          "OPENROUTER_LAYER_SPLITTER_MASK_FALLBACK_MODEL"
        ]
      }
    ]
  },
  "subject-mask": {
    "stageId": "subject-mask",
    "label": {
      "en": "Regenerated subject masks",
      "cs": "Masky znovu vytvořených subjektů"
    },
    "defaultModel": "google/gemini-3.6-flash",
    "environmentPrecedence": [
      "OPENROUTER_LAYER_SPLITTER_MASK_FALLBACK_MODEL"
    ],
    "failureFallbackModels": [
      {
        "defaultModel": "qwen/qwen3.7-flash",
        "environmentPrecedence": [
          "OPENROUTER_LAYER_SPLITTER_MASK_MODEL"
        ]
      }
    ]
  },
  "background-fast": {
    "stageId": "background-fast",
    "label": {
      "en": "Fast background cleanup",
      "cs": "Rychlé čištění pozadí"
    },
    "defaultModel": "bytedance-seed/seedream-5-0-flash",
    "environmentPrecedence": [
      "OPENROUTER_LAYER_SPLITTER_BACKGROUND_FAST_MODEL",
      "OPENROUTER_LAYER_SPLITTER_FAST_MODEL"
    ],
    "failureFallbackModels": []
  },
  "background-fidelity": {
    "stageId": "background-fidelity",
    "label": {
      "en": "Fidelity background cleanup",
      "cs": "Věrné čištění pozadí"
    },
    "defaultModel": "bytedance-seed/seedream-5-0-pro",
    "environmentPrecedence": [
      "OPENROUTER_LAYER_SPLITTER_BACKGROUND_FIDELITY_MODEL",
      "OPENROUTER_LAYER_SPLITTER_FIDELITY_MODEL"
    ],
    "failureFallbackModels": []
  },
  "completion": {
    "stageId": "completion",
    "label": {
      "en": "Fidelity hidden-part completion / eligible subject regeneration",
      "cs": "Věrné dokončení skrytých částí / regenerace vhodných subjektů"
    },
    "defaultModel": "openai/gpt-image-2.5-sunburst",
    "environmentPrecedence": [
      "OPENROUTER_LAYER_SPLITTER_OBJECT_COMPLETION_MODEL"
    ],
    "failureFallbackModels": []
  }
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] = Object.values(modelStages);
