import type { ToolManifest } from "../../types";

export default {
  "label": {
    "en": "Graph Generator",
    "cs": "Generátor grafů"
  },
  "openRouter": {
    "envName": "OPENROUTER_GRAPH_GENERATOR_API_KEY"
  },
  "routes": [
    {
      "path": "/api/graphs",
      "handler": "code/server",
      "methods": [
        "POST"
      ]
    }
  ]
} satisfies ToolManifest;
