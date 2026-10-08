export type ConceptAspectRatio = "1:1" | "4:3" | "3:2" | "16:9";

export type IllustrationConcept = {
  id: string;
  title: string;
  visual: string;
  meaning: string;
};

export type IllustrationUsage = {
  cost: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type IllustrationCritique = {
  summary: string;
  corrections: string[];
  suggestedEdit: string;
};

export type StyleReference = {
  id: string;
  name: string;
  data: string;
  createdAt: number;
};

export type StyleProfile = {
  id: "house-style";
  styleGuidance: string;
  aspectRatio: ConceptAspectRatio;
  references: StyleReference[];
  updatedAt: number;
};

export type ImageRevision = {
  id: string;
  parentId: string | null;
  concept: IllustrationConcept;
  image: string;
  prompt: string;
  model: string;
  seed: number;
  generationId?: string;
  usage: IllustrationUsage;
  instruction?: string;
  createdAt: number;
};

export type ConceptSet = [
  IllustrationConcept,
  IllustrationConcept,
  IllustrationConcept,
];

export type ProjectCritique = IllustrationCritique & {
  revisionId: string;
  createdAt: number;
};

export type EditorialFeedback = "pending" | "approved" | "rejected";

export type IllustrationProject = {
  id: string;
  article: string;
  concepts: ConceptSet;
  selectedConceptId: string | null;
  editedConcept: IllustrationConcept | null;
  compiledPrompt: string;
  compiledPromptIsManual: boolean;
  compiledPromptStale: boolean;
  revisions: ImageRevision[];
  activeRevisionId: string | null;
  finalRevisionId: string | null;
  critique: ProjectCritique | null;
  feedback: EditorialFeedback;
  note: string;
  createdAt: number;
  updatedAt: number;
};
