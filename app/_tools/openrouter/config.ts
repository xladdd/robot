export const openRouterApps = {
  extraction: {
    name: "Text Extractor",
    slug: "text-extractor",
    envName: "OPENROUTER_TEXT_EXTRACTOR_API_KEY",
  },
  index: {
    name: "Index Creator",
    slug: "index-creator",
    envName: "OPENROUTER_INDEX_CREATOR_API_KEY",
  },
  graph: {
    name: "Graph Generator",
    slug: "graph-generator",
    envName: "OPENROUTER_GRAPH_GENERATOR_API_KEY",
  },
  bio: {
    name: "Diagram Generator",
    slug: "diagram-generator",
    envName: "OPENROUTER_DIAGRAM_GENERATOR_API_KEY",
  },

  cover: {
    name: "Cover Generator",
    slug: "cover-generator",
    envName: "OPENROUTER_COVER_GENERATOR_API_KEY",
  },
  conceptIllustrator: {
    name: "Concept Illustrator",
    slug: "concept-illustrator",
    envName: "OPENROUTER_CONCEPT_ILLUSTRATOR_API_KEY",
  },
  layerSplitter: {
    name: "Layer Splitter",
    slug: "layer-splitter",
    envName: "OPENROUTER_LAYER_SPLITTER_API_KEY",
  },
  image: {
    name: "Image Generator",
    slug: "image-generator",
    envName: "OPENROUTER_IMAGE_GENERATOR_API_KEY",
  },
  styleTrainer: {
    name: "Style Trainer",
    slug: "style-trainer",
    envName: "OPENROUTER_STYLE_TRAINER_API_KEY",
  },
  grep: {
    name: "GREP Builder",
    slug: "grep-builder",
    envName: "OPENROUTER_GREP_BUILDER_API_KEY",
  },
  prompt: {
    name: "Prompt Extractor",
    slug: "prompt-extractor",
    envName: "OPENROUTER_PROMPT_EXTRACTOR_API_KEY",
  },
  typesetter: {
    name: "Typesetter",
    slug: "typesetter",
    envName: "OPENROUTER_TYPESETTER_API_KEY",
  },
} as const;

export type OpenRouterAppId = keyof typeof openRouterApps;
