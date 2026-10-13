import type { ToolManifest } from "../../types";

export default {
  label: {
    en: "Concept Illustrator",
    cs: "Koncept ilustrace",
  },
  status: "alpha",
  openRouter: {
    envName: "OPENROUTER_CONCEPT_ILLUSTRATOR_API_KEY",
  },
  routes: [
    {
      path: "/api/concept-illustrations",
      handler: "code/server",
      methods: ["POST"],
      runtime: "nodejs",
      maxDuration: 300,
    },
  ],
} satisfies ToolManifest;
