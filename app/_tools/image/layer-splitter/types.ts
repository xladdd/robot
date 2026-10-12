export type LayerSplitterQuality = "fast" | "fidelity";

export type NormalizedBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SubjectKind = "person" | "animal" | "plant" | "object";

export type SupportSurface = {
  id: string;
  name: string;
  description: string;
  order: number;
  bounds: NormalizedBounds;
};

export type SupportOcclusion = {
  supportSurfaceId: string;
  foregroundPartsDescription: string;
};

export type LayerPlanItem = {
  id: string;
  name: string;
  description: string;
  order: number;
  visibleBounds: NormalizedBounds;
  reconstructionBounds: NormalizedBounds;
  occludedBy: string[];
  /** Legacy callers may omit this; parsed plans always receive a concrete kind. */
  subjectKind?: SubjectKind;
  supportOcclusion?: SupportOcclusion;
};

export type TextRegion = {
  description: string;
  bounds: NormalizedBounds;
};

export type ShadowRegion = {
  ownerId: string;
  description: string;
  bounds: NormalizedBounds;
};

export type LayerPlan = {
  backgroundDescription: string;
  textRegions: TextRegion[];
  shadowRegions: ShadowRegion[];
  supportSurfaces: SupportSurface[];
  layers: LayerPlanItem[];
};

export type LayerSplitterValidation = {
  backgroundOpaque: boolean;
  validObjectLayers: number;
  requestedObjectLayers: number;
  textDetected: boolean;
  warnings: string[];
};

export type LayerSplitterResult = {
  filename: string;
  psdBase64: string;
  previewDataUrl: string;
  layerNames: string[];
  planModel: string;
  maskModel?: string;
  maskFallbackModel?: string;
  generationModel: string;
  objectCompletionModel?: string;
  subjectRegenerationModel?: string;
  subjectIsolationModel?: string;
  quality: LayerSplitterQuality;
  validation: LayerSplitterValidation;
};
