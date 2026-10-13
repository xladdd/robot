import type { ToolManifest } from "../../types";

export default {
  "label": {
    "en": "Solutions Importer",
    "cs": "Importér řešení"
  },
  "assets": [
    {
      "source": "public",
      "publicPath": "/solutions"
    },
    {
      "source": "public",
      "publicPath": "/solutions-beta"
    }
  ]
} satisfies ToolManifest;
