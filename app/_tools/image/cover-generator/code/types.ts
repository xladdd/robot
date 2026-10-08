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

export type CoverConceptObject = {
  description: string;
  action: string;
  appearance: string;
};

export const coverTreatments = [
  "atmospheric environmental photomontage",
  "tactile editorial object montage",
  "scientific macro or material study",
  "detailed stylized illustration montage",
  "coloured wood engraving",
  "modern risograph",
  "ink-lined watercolour",
  "20th century-style propaganda watercolour",
] as const;

export type CoverTreatment = (typeof coverTreatments)[number];
export type CoverStyleSelection = "automatic" | CoverTreatment;

export const coverConceptModes = [
  "iconic artifact",
  "process in motion",
  "material transformation",
  "conceptual metaphor",
  "environmental evidence",
  "connected object system",
] as const;

export type CoverConceptMode = (typeof coverConceptModes)[number];

export const coverCompositionStrategies = [
  "immersive edge crop",
  "diagonal progression",
  "layered editorial montage",
  "asymmetric counterpoint",
  "environmental sweep",
  "specimen constellation",
] as const;

export type CoverCompositionStrategy =
  (typeof coverCompositionStrategies)[number];

export type CoverOverlayTone = "black" | "white";
export type CoverLightboxOverlay = CoverOverlayTone | "none";

export type CoverConcept = {
  concept_mode: CoverConceptMode;
  composition_strategy: CoverCompositionStrategy;
  hero_subjects: CoverConceptObject[];
  supporting_objects: CoverConceptObject[];
  scene: string;
  upper_background: string;
  style: string;
  treatment: CoverTreatment;
  palette: string;
  lighting: string;
  mood_treatment: string;
};

export type PlannedCoverConcept = {
  id: string;
  concept: CoverConcept;
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
