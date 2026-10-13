import type { ToolManifest } from "../../types";

export default {
  label: {
    en: "Layer Splitter",
    cs: "Rozdělovač vrstev",
  },
  openRouter: {
    envName: "OPENROUTER_LAYER_SPLITTER_API_KEY",
  },
  routes: [
    {
      path: "/api/layers",
      handler: "code/server",
      methods: ["POST"],
      runtime: "nodejs",
      maxDuration: 300,
    },
  ],
} satisfies ToolManifest;
