import type { ToolManifest } from "../../types";

export default {
  "label": {
    "en": "Prompt Extractor",
    "cs": "Extraktor promptů"
  },
  "openRouter": {
    "envName": "OPENROUTER_PROMPT_EXTRACTOR_API_KEY"
  },
  "routes": [
    {
      "path": "/api/prompts",
      "handler": "code/server",
      "methods": [
        "POST"
      ]
    }
  ]
} satisfies ToolManifest;
