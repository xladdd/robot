import type { ToolManifest } from "../../types";

export default {
  label: {
    en: "Index Creator",
    cs: "Tvůrce rejstříku",
  },
  openRouter: {
    envName: "OPENROUTER_INDEX_CREATOR_API_KEY",
  },
  routes: [
    {
      path: "/api/index/forms",
      handler: "code/forms-server",
      methods: ["POST"],
    },
  ],
  assets: [
    {
      source: "public",
      publicPath: "/index-creator-ocr",
    },
  ],
} satisfies ToolManifest;
