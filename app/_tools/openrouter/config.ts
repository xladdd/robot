export const openRouterApps = {
  extraction: {
    name: "Text Extractor",
    envName: "OPENROUTER_TEXT_EXTRACTOR_API_KEY",
  },
  index: {
    name: "Index Creator",
    envName: "OPENROUTER_INDEX_CREATOR_API_KEY",
  },
  graph: {
    name: "Graph Generator",
    envName: "OPENROUTER_GRAPH_GENERATOR_API_KEY",
  },
  bio: {
    name: "Diagram Generator",
    envName: "OPENROUTER_DIAGRAM_GENERATOR_API_KEY",
  },
  map: {
    name: "Map Generator",
    envName: "OPENROUTER_MAP_GENERATOR_API_KEY",
  },
  cover: {
    name: "Cover Generator",
    envName: "OPENROUTER_COVER_GENERATOR_API_KEY",
  },
  image: {
    name: "Image Generator",
    envName: "OPENROUTER_IMAGE_GENERATOR_API_KEY",
  },
  grep: {
    name: "GREP Builder",
    envName: "OPENROUTER_GREP_BUILDER_API_KEY",
  },
  prompt: {
    name: "Prompt Extractor",
    envName: "OPENROUTER_PROMPT_EXTRACTOR_API_KEY",
  },
} as const;

export type OpenRouterAppId = keyof typeof openRouterApps;
