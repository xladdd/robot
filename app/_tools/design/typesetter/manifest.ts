import type { ToolManifest } from "../../types";

export default {
  label: {
    en: "Typesetter",
    cs: "Sazeč",
  },
  status: "alpha",
  openRouter: {
    envName: "OPENROUTER_TYPESETTER_API_KEY",
  },
  routes: [
    {
      path: "/api/typesetter",
      handler: "code/server",
      methods: ["POST"],
      runtime: "nodejs",
      maxDuration: 300,
    },
  ],
  assets: [
    {
      source: "public",
      publicPath: "/typesetter",
    },
  ],
} satisfies ToolManifest;
