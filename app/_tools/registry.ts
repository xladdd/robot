export const appRegistry = [
  {
    id: "extraction",
    category: "text",
    folder: "text/text-extractor",
    available: true,
  },
  {
    id: "index",
    category: "text",
    folder: "text/index-creator",
    available: true,
  },
  {
    id: "map",
    category: "image",
    folder: "image/map-generator",
    available: true,
  },
  {
    id: "bio",
    category: "image",
    folder: "image/diagram-generator",
    available: true,
  },
  {
    id: "graph",
    category: "image",
    folder: "image/graph-generator",
    available: true,
  },
  {
    id: "image",
    category: "image",
    folder: "image/image-generator",
    available: false,
  },
  {
    id: "cover",
    category: "image",
    folder: "image/cover-generator",
    available: true,
  },
  {
    id: "grep",
    category: "design",
    folder: "design/grep-builder",
    available: true,
  },
  {
    id: "coverSplitter",
    category: "design",
    folder: "design/cover-splitter",
    available: true,
  },
  {
    id: "solutions",
    category: "design",
    folder: "design/solutions-importer",
    available: true,
  },
  {
    id: "scriptBuffet",
    category: "design",
    folder: "design/script-buffet",
    available: true,
  },
  {
    id: "barcode",
    category: "design",
    folder: "design/barcode-generator",
    available: true,
  },
  {
    id: "prompt",
    category: "design",
    folder: "design/prompt-extractor",
    available: true,
  },
  {
    id: "typesetter",
    category: "design",
    folder: "design/typesetter",
    available: false,
  },
] as const;

export type AppId = (typeof appRegistry)[number]["id"];
export type SidebarStatus = "tested" | "to-test" | "alpha";
export type Language = "en" | "cs";

export const sidebarStatuses: Partial<Record<AppId, SidebarStatus>> = {
  extraction: "tested",
  index: "to-test",
  map: "alpha",
  bio: "alpha",
  graph: "tested",
  cover: "to-test",
  grep: "tested",
  coverSplitter: "tested",
  solutions: "tested",
  barcode: "tested",
  prompt: "to-test",
};
export type InfoDrawers = Record<Language, Record<string, string>>;

export const groups = [
  {
    key: "text" as const,
    items: appRegistry
      .filter((app) => app.category === "text")
      .map((app) => app.id),
  },
  {
    key: "image" as const,
    items: appRegistry
      .filter((app) => app.category === "image")
      .map((app) => app.id),
  },
  {
    key: "design" as const,
    items: appRegistry
      .filter((app) => app.category === "design")
      .map((app) => app.id),
  },
];

export const completedApps: ReadonlySet<string> = new Set(
  appRegistry.filter((app) => app.available).map((app) => app.id),
);
