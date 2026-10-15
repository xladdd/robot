import type { ModelStageDefinition } from "../../models.ts";

export const modelStages = {
  interpretation: {
    stageId: "interpretation",
    label: {
      en: "Prompt interpretation into structured map edits",
      cs: "Interpretace promptu do strukturovaných úprav mapy",
    },
    defaultModel: "mistralai/mistral-small-2603",
    environmentPrecedence: ["OPENROUTER_MAP_MAKER_MODEL"],
    failureFallbackModels: [
      {
        defaultModel: "mistralai/ministral-14b-2512",
        environmentPrecedence: [],
      },
    ],
    data: {
      en: "The model only returns country identifiers, colours, and label coordinates; map geometry is never model-generated.",
      cs: "Model vrací jen identifikátory států, barvy a souřadnice popisků; geometrie mapy se nikdy negeneruje modelem.",
    },
  },
} as const satisfies Record<string, ModelStageDefinition>;

export const modelDefinitions: readonly ModelStageDefinition[] =
  Object.values(modelStages);
