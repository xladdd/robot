import type { ToolManifest } from "../../types";

export default {
  "label": {
    "en": "Cover Generator",
    "cs": "Generátor obálek"
  },
  "openRouter": {
    "envName": "OPENROUTER_COVER_GENERATOR_API_KEY"
  },
  "routes": [
    {
      "path": "/api/covers",
      "handler": "code/server",
      "methods": [
        "POST"
      ]
    }
  ]
} satisfies ToolManifest;
