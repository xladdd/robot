import type { ToolManifest } from "../../types";

export default {
  "label": {
    "en": "Diagram Generator",
    "cs": "Generátor diagramů"
  },
  "status": "alpha",
  "openRouter": {
    "envName": "OPENROUTER_DIAGRAM_GENERATOR_API_KEY"
  },
  "routes": [
    {
      "path": "/api/diagrams",
      "handler": "code/server",
      "methods": [
        "POST"
      ]
    }
  ]
} satisfies ToolManifest;
