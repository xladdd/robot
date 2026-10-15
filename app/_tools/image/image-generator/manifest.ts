import type { ToolManifest } from "../../types";

export default {
  label: {
    en: "Image Generator",
    cs: "Generátor obrázků",
  },
  featureFlags: {
    advancedMode: false,
  },
  openRouter: {
    envName: "OPENROUTER_IMAGE_GENERATOR_API_KEY",
  },
  routes: [
    {
      path: "/api/images",
      handler: "code/server",
      methods: ["GET", "POST"],
      dynamic: "force-dynamic",
    },
  ],
} satisfies ToolManifest;
