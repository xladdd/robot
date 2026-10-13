import type { ToolManifest } from "../../types";

export default {
  "label": {
    "en": "Map Maker",
    "cs": "Tvůrce map"
  },
  "status": "alpha",
  "routes": [
    {
      "path": "/api/maps/generate",
      "handler": "code/generate-server",
      "methods": [
        "POST"
      ]
    },
    {
      "path": "/api/maps/timeline",
      "handler": "code/timeline-server",
      "methods": [
        "GET"
      ],
      "dynamic": "force-dynamic"
    }
  ],
  "assets": [
    {
      "source": "code/data/cliopatria-timeline.json",
      "publicPath": "/data/cliopatria-timeline.json"
    }
  ]
} satisfies ToolManifest;
