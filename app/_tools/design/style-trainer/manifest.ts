import type { ToolManifest } from "../../types";

export default {
  "label": {
    "en": "Style Trainer",
    "cs": "Trénování stylů"
  },
  "status": "alpha",
  "openRouter": {
    "envName": "OPENROUTER_STYLE_TRAINER_API_KEY"
  },
  "routes": [
    {
      "path": "/api/style-trainer",
      "handler": "code/server",
      "methods": [
        "POST"
      ],
      "dynamic": "force-dynamic"
    }
  ]
} satisfies ToolManifest;
