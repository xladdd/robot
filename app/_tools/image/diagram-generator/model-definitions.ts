import type { ModelStageDefinition } from "../../models.ts";

export const evaluationModels = [
  "qwen/qwen3.6-35b-a3b",
  "openai/gpt-oss-120b",
  "google/gemma-4-26b-a4b-it",
  "meta-llama/llama-4-maverick",
] as const;

export const modelStages = {
  "planner": {
    "stageId": "planner",
    "label": {
      "en": "Biological brief",
      "cs": "Biologické zadání"
    },
    "defaultModel": "openai/gpt-6.1-sol",
    "environmentPrecedence": [
      "OPENROUTER_DIAGRAM_PLANNER_MODEL"
    ],
    "failureFallbackModels": []
  },
  "draft": {
    "stageId": "draft",
    "label": {
      "en": "Draft candidate",
      "cs": "Pracovní návrh"
    },
    "defaultModel": "openai/gpt-image-2.5-flare",
    "environmentPrecedence": [
      "OPENROUTER_DIAGRAM_DRAFT_MODEL"
    ],
    "failureFallbackModels": []
  },
  "image": {
    "stageId": "image",
    "label": {
      "en": "Final candidate",
      "cs": "Finální návrh"
    },
    "defaultModel": "openai/gpt-image-2.5-sunburst",
    "environmentPrecedence": [
      "OPENROUTER_DIAGRAM_IMAGE_MODEL"
    ],
    "failureFallbackModels": []
  },
  "vector": {
    "stageId": "vector",
    "label": {
      "en": "Vector reconstruction and repair",
      "cs": "Vektorové překreslení a oprava"
    },
    "defaultModel": "anthropic/claude-opus-5.5",
    "environmentPrecedence": [
      "OPENROUTER_DIAGRAM_VECTOR_MODEL"
    ],
    "failureFallbackModels": []
  },
  "visual-review": {
    "stageId": "visual-review",
    "label": {
      "en": "Optional visual review",
      "cs": "Volitelná vizuální kontrola"
    },
    "defaultModel": "google/gemini-3.8-flash",
    "environmentPrecedence": [
      "OPENROUTER_DIAGRAM_VISUAL_REVIEW_MODEL"
    ],
    "failureFallbackModels": []
  },
  "content-review": {
    "stageId": "content-review",
    "label": {
      "en": "Optional biological review",
      "cs": "Volitelná biologická kontrola"
    },
    "defaultModel": "openai/gpt-6.1-sol",
    "environmentPrecedence": [
      "OPENROUTER_DIAGRAM_CONTENT_REVIEW_MODEL"
    ],
    "failureFallbackModels": []
  },
  "legacy": {
    "stageId": "legacy",
    "label": {
      "en": "Legacy direct-SVG endpoint",
      "cs": "Starší endpoint pro přímé SVG"
    },
    "defaultModel": "mistralai/mistral-large-2512",
    "environmentPrecedence": [
      "OPENROUTER_FIGURE_MODEL"
    ],
    "failureFallbackModels": [],
    "providerNotes": {
      "en": `Legacy evaluation requests can override this with: ${evaluationModels.join(", ")}.`,
      "cs": `Starší vyhodnocovací požadavky mohou použít: ${evaluationModels.join(", ")}.`
    }
  }
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] = Object.values(modelStages);
