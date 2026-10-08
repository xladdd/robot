type SidebarCategory = "text" | "image" | "design";

type SidebarApp = {
  readonly id: string;
  readonly category: SidebarCategory;
  readonly hidden: boolean;
};

export function createSidebarGroups<T extends SidebarApp>(
  registry: readonly T[],
): Array<{ key: SidebarCategory; items: Array<T["id"]> }> {
  return (["text", "image", "design"] as const)
    .map((key) => ({
      key,
      items: registry
        .filter((app) => app.category === key && !app.hidden)
        .map((app) => app.id),
    }))
    .filter((group) => group.items.length > 0);
}

// `hidden` controls sidebar visibility; `available` keeps its existing enabled/coming-soon behavior.
export const appRegistry = [
  {
    id: "extraction",
    category: "text",
    folder: "text/text-extractor",
    available: true,
    hidden: false,
  },
  {
    id: "index",
    category: "text",
    folder: "text/index-creator",
    available: true,
    hidden: false,
  },
  {
    id: "map",
    category: "image",
    folder: "image/map-generator",
    available: true,
    hidden: false,
  },
  {
    id: "bio",
    category: "image",
    folder: "image/diagram-generator",
    available: true,
    hidden: false,
  },
  {
    id: "graph",
    category: "image",
    folder: "image/graph-generator",
    available: true,
    hidden: true,
  },
  {
    id: "image",
    category: "image",
    folder: "image/image-generator",
    available: true,
    hidden: false,
  },
  {
    id: "cover",
    category: "image",
    folder: "image/cover-generator",
    available: true,
    hidden: false,
  },
  {
    id: "conceptIllustrator",
    category: "image",
    folder: "image/concept-illustrator",
    available: false,
    hidden: true,
  },
  {
    id: "layerSplitter",
    category: "image",
    folder: "image/layer-splitter",
    available: true,
    hidden: false,
  },
  {
    id: "grep",
    category: "design",
    folder: "design/grep-builder",
    available: true,
    hidden: false,
  },
  {
    id: "coverSplitter",
    category: "design",
    folder: "design/cover-splitter",
    available: true,
    hidden: false,
  },
  {
    id: "solutions",
    category: "design",
    folder: "design/solutions-importer",
    available: true,
    hidden: false,
  },
  {
    id: "scriptBuffet",
    category: "design",
    folder: "design/script-buffet",
    available: false,
    hidden: false,
  },
  {
    id: "barcode",
    category: "design",
    folder: "design/barcode-generator",
    available: true,
    hidden: false,
  },
  {
    id: "prompt",
    category: "text",
    folder: "text/prompt-extractor",
    available: true,
    hidden: false,
  },
  {
    id: "typesetter",
    category: "design",
    folder: "design/typesetter",
    available: true,
    hidden: true,
  },
] as const;

export type AppId = (typeof appRegistry)[number]["id"];
export type SidebarStatus = "tested" | "to-test" | "alpha";
export type Language = "en" | "cs";

export const sidebarStatuses: Partial<Record<AppId, SidebarStatus>> = {
  extraction: "tested",
  prompt: "to-test",
  index: "to-test",
  map: "alpha",
  bio: "alpha",
  image: "to-test",
  cover: "tested",
  conceptIllustrator: "alpha",
  layerSplitter: "to-test",
  barcode: "tested",
  grep: "tested",
  coverSplitter: "tested",
  solutions: "tested",
  typesetter: "alpha",
};
export type InfoDrawers = Record<Language, Record<string, string>>;

export const groups = createSidebarGroups(appRegistry);

export const completedApps: ReadonlySet<string> = new Set(
  appRegistry.filter((app) => app.available).map((app) => app.id),
);
