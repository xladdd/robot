export type CoverAudience =
  | "preschool"
  | "primary"
  | "lower-secondary"
  | "upper-secondary";

export type CoverSubject =
  | "preschool-general"
  | "primary-general"
  | "czech-language"
  | "literature"
  | "foreign-language"
  | "mathematics"
  | "physics"
  | "chemistry"
  | "biology-natural-science"
  | "geography"
  | "history"
  | "civics-social-science"
  | "computing-technology"
  | "vocational-subject"
  | "exam-preparation"
  | "other";

export type PlannedCoverConcept = {
  id: string;
  coreIdea: string;
  heroSubject: string;
  supportingElements: string[];
  composition: string;
  viewpoint: string;
  renderingApproach: string;
  palette: string;
  lighting: string;
  quietSpace: string;
  avoid: string[];
};

export type ReferenceGuidance = {
  audienceCharacter: string;
  paletteCharacter: string;
  finish: string;
  energy: string;
  recurringMaterials: string[];
  acceptableRenderingApproaches: string[];
  avoidCopying: string[];
};

export type CoverPlannerMetadata = {
  model: string;
  generationId?: string;
  usage: {
    cost: number | null;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  referenceGuidance: ReferenceGuidance;
  usedFallback: boolean;
  warning?: string;
};
