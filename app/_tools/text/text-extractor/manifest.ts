import type { ToolManifest } from "../../types";

export default {
  "label": {
    "en": "Text Extractor",
    "cs": "Extraktor textu"
  },
  "openRouter": {
    "envName": "OPENROUTER_TEXT_EXTRACTOR_API_KEY"
  },
  "routes": [
    {
      "path": "/api/correct",
      "handler": "code/correct-server",
      "methods": [
        "POST"
      ]
    },
    {
      "path": "/api/ocr",
      "handler": "code/ocr-server",
      "methods": [
        "POST"
      ]
    }
  ]
} satisfies ToolManifest;
