export type TypesetterLanguage = "en" | "cs";

export type SemanticRoleId =
  | "heading.chapter"
  | "heading.section"
  | "heading.subsection"
  | "body"
  | "list.item"
  | "quote"
  | "caption"
  | "image.request"
  | "unsupported";

export type SourceBlockKind =
  | "paragraph"
  | "list-item"
  | "table-row"
  | "image";

export type TypesetterSourceBlock = {
  id: string;
  order: number;
  text: string;
  kind: SourceBlockKind;
  sourceStyle: string | null;
  listLevel: number | null;
  tableId: string | null;
  imageDescription: string | null;
};

export type TypesetterStyle = {
  id: string;
  name: string;
  path: string;
};

export type TypesetterInventory = {
  filename: string;
  paragraphStyles: TypesetterStyle[];
  characterStyles: TypesetterStyle[];
  objectStyles: TypesetterStyle[];
  labels: string[];
  layers: string[];
  page: { width: number | null; height: number | null };
};

export type LocalTypesetterInput = {
  manuscript: {
    filename: string;
    blocks: TypesetterSourceBlock[];
  };
  template: TypesetterInventory;
  warnings: string[];
};

export type RoleSuggestion = {
  role: SemanticRoleId;
  confidence: number;
  reason: string;
  examples: string[];
};

export type RoleMapping = {
  paragraphStyle: string;
  objectStyle?: string;
};

export type AnalysedBlock = TypesetterSourceBlock & {
  role: SemanticRoleId;
  confidence: number;
  warning: string | null;
  imagePrompt: string | null;
  reviewed: boolean;
};

export type TypesetterManifest = {
  format: "indesign-typesetter-v1";
  version: 1;
  createdAt: string;
  language: TypesetterLanguage;
  manuscript: { filename: string; blockCount: number };
  template: {
    filename: string;
    id: string;
    version: string;
    mainStoryLabel: "typesetter:story:main";
  };
  mappings: Partial<Record<SemanticRoleId, RoleMapping>>;
  imageRequests: {
    layer: "IMAGE REQUESTS";
    placement: "pasteboard-by-related-spread";
  };
  summary: {
    blocks: number;
    imageRequests: number;
    lowConfidence: number;
    unsupported: number;
    unresolved: number;
  };
  blocks: AnalysedBlock[];
};
