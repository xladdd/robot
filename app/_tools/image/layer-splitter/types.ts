export type LayerSplitterQuality = "fast" | "fidelity";

export type NormalizedBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LayerPlanItem = {
  id: string;
  name: string;
  description: string;
  order: number;
  visibleBounds: NormalizedBounds;
  reconstructionBounds: NormalizedBounds;
  occludedBy: string[];
};

export type TextRegion = {
  description: string;
  bounds: NormalizedBounds;
};

export type LayerPlan = {
  backgroundDescription: string;
  textRegions: TextRegion[];
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
  generationModel: string;
  quality: LayerSplitterQuality;
  validation: LayerSplitterValidation;
};
