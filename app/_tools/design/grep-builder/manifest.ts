import type { ToolManifest } from "../../types";

export default {
  "label": {
    "en": "GREP Builder",
    "cs": "Tvůrce GREP výrazů"
  },
  "openRouter": {
    "envName": "OPENROUTER_GREP_BUILDER_API_KEY"
  },
  "routes": [
    {
      "path": "/api/grep",
      "handler": "server",
      "methods": [
        "POST"
      ]
    }
  ]
} satisfies ToolManifest;
