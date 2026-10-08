export type CoverAudience =
  "preschool" | "primary" | "lower-secondary" | "upper-secondary";

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
  prompt: string;
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

  usedFallback: boolean;
};
