import type { ToolManifest } from "../../types";

export default {
  label: {
    en: "Map Maker",
    cs: "Tvůrce map",
  },
  status: "alpha",
  openRouter: {
    envName: "OPENROUTER_MAP_GENERATOR_API_KEY",
  },
  routes: [
    {
      path: "/api/maps/generate",
      handler: "code/generate-server",
      methods: ["POST"],
    },
    {
      path: "/api/maps/timeline",
      handler: "code/timeline-server",
      methods: ["GET"],
      dynamic: "force-dynamic",
    },
  ],
  assets: [
    {
      source: "code/data/cliopatria-timeline.json",
      publicPath: "/data/cliopatria-timeline.json",
    },
    {
      source: "public/natural-earth-relief-schematic.jpg",
      publicPath: "/data/natural-earth-relief-schematic.jpg",
    },
    {
      source: "public/natural-earth-relief-robinson.jpg",
      publicPath: "/data/natural-earth-relief-robinson.jpg",
    },
    {
      source: "public/natural-earth-relief-eckert4.jpg",
      publicPath: "/data/natural-earth-relief-eckert4.jpg",
    },
    {
      source: "public/natural-earth-relief-naturalEarth.jpg",
      publicPath: "/data/natural-earth-relief-naturalEarth.jpg",
    },
  ],
} satisfies ToolManifest;
