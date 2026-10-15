export type MapLayers = {
  boundaries: boolean;
  labels: boolean;
  water: boolean;
  lakes: boolean;
  rivers: boolean;
  climate: boolean;
  terrain: boolean;
  mountains: boolean;
  cities: boolean;
  disputed: boolean;
  graticule: boolean;
  graticuleFront: boolean;
  waterLabels: boolean;
};

export const MAP_LAYER_KEYS = [
  "boundaries",
  "labels",
  "water",
  "lakes",
  "rivers",
  "climate",
  "terrain",
  "mountains",
  "cities",
  "disputed",
  "graticule",
  "graticuleFront",
  "waterLabels",
] as const satisfies readonly (keyof MapLayers)[];

export const MAP_CLIMATE_COLORS = [
  "#e45745",
  "#e6ad3c",
  "#69ad63",
  "#4f83cc",
  "#8d67b1",
] as const;

export type MapPurpose =
  "political" | "physical" | "historical" | "climate" | "blank";

export const MAP_PURPOSES = [
  "political",
  "physical",
  "historical",
  "climate",
  "blank",
] as const satisfies readonly MapPurpose[];

const layers = (enabled: readonly (keyof MapLayers)[]): MapLayers => {
  const enabledLayers = new Set<keyof MapLayers>(enabled);
  return Object.fromEntries(
    MAP_LAYER_KEYS.map((key) => [key, enabledLayers.has(key)]),
  ) as MapLayers;
};

export const MAP_LAYER_PRESETS: Readonly<Record<MapPurpose, MapLayers>> = {
  political: layers(["boundaries", "labels", "water", "lakes", "rivers"]),
  physical: layers([
    "water",
    "lakes",
    "rivers",
    "terrain",
    "mountains",
    "waterLabels",
  ]),
  historical: layers(["boundaries", "labels", "water"]),
  climate: layers(["boundaries", "labels", "water", "climate"]),
  blank: layers(["boundaries", "water"]),
};

export function matchingMapPurpose(mapLayers: MapLayers): MapPurpose | null {
  return (
    MAP_PURPOSES.find((purpose) =>
      MAP_LAYER_KEYS.every(
        (layer) => MAP_LAYER_PRESETS[purpose][layer] === mapLayers[layer],
      ),
    ) ?? null
  );
}

export type MapExportMetadata = {
  title: string;
  subtitle: string;
  source: string;
  projectionNote: string;
  copyright: string;
};

export const MAP_EXPORT_METADATA_FIELDS = [
  "title",
  "subtitle",
  "source",
  "projectionNote",
  "copyright",
] as const satisfies readonly (keyof MapExportMetadata)[];

export function createMapExportMetadataDefaults({
  title,
  subtitle,
  sources,
  projectionLabel,
  language,
}: {
  title: string;
  subtitle?: string;
  sources?: Array<{ title: string }>;
  projectionLabel: string;
  language: "en" | "cs";
}): MapExportMetadata {
  return {
    title: title.trim(),
    subtitle: subtitle?.trim() || "",
    source:
      sources
        ?.map((source) => source.title.trim())
        .filter(Boolean)
        .join("; ") || "",
    projectionNote: `${language === "cs" ? "Zobrazení" : "Projection"}: ${projectionLabel}`,
    copyright: "",
  };
}

export type MapLabelDensity = "essential" | "standard" | "detailed";

export const MAP_LABEL_DENSITIES = [
  "essential",
  "standard",
  "detailed",
] as const satisfies readonly MapLabelDensity[];

export type MapPrintPresetId = "original" | "90mm" | "135mm" | "180mm";

export type MapPrintPreset = {
  id: MapPrintPresetId;
  width: number;
  height: number;
  unit: "px" | "mm";
};

export const MAP_PRINT_PRESETS = [
  { id: "original", width: 1000, height: 700, unit: "px" },
  { id: "90mm", width: 90, height: 63, unit: "mm" },
  { id: "135mm", width: 135, height: 94.5, unit: "mm" },
  { id: "180mm", width: 180, height: 126, unit: "mm" },
] as const satisfies readonly MapPrintPreset[];

export const DEFAULT_MAP_PRINT_PRESET_ID: MapPrintPresetId = "original";

export function mapPrintPreset(id: MapPrintPresetId): MapPrintPreset {
  return (
    MAP_PRINT_PRESETS.find((preset) => preset.id === id) ?? MAP_PRINT_PRESETS[0]
  );
}

export function mapPrintUnits(viewBoxWidth: number, physicalWidthMm: number) {
  const unitsPerMm = viewBoxWidth / physicalWidthMm;
  return {
    unitsPerMm,
    mm: (value: number) => value * unitsPerMm,
    pt: (value: number) => ((value * 25.4) / 72) * unitsPerMm,
  };
}

export type MapPublicationPreflightId =
  | "physical-size"
  | "sources"
  | "date"
  | "text-size"
  | "stroke-width"
  | "rgb-colors"
  | "missing-fonts"
  | "labels-outside-crop"
  | "label-density"
  | "layer-complexity"
  | "temporal-layers";

export type MapPublicationPreflightCheck = {
  id: MapPublicationPreflightId;
  level: "pass" | "warning";
  actual?: number;
  threshold?: number;
  detail?: string;
};

export type MapPublicationInspection = {
  usesRgbColors: boolean;
  unavailableFonts: string[] | null;
  labelsOutsideCrop: number;
};

export function createMapPublicationPreflight({
  printPresetId,
  hasSources,
  hasDate,
  labelDensity,
  layers: mapLayers,
  politicalYear,
  inspection = {
    usesRgbColors: true,
    unavailableFonts: null,
    labelsOutsideCrop: 0,
  },
}: {
  printPresetId: MapPrintPresetId;
  hasSources: boolean;
  hasDate: boolean;
  labelDensity: MapLabelDensity;
  layers: MapLayers;
  politicalYear: number;
  inspection?: MapPublicationInspection;
}): MapPublicationPreflightCheck[] {
  const physical = printPresetId !== "original";
  const preset = mapPrintPreset(printPresetId);
  const thematicCount = [
    mapLayers.climate,
    mapLayers.terrain,
    mapLayers.mountains,
    mapLayers.cities,
    mapLayers.disputed,
    mapLayers.graticule,
    mapLayers.waterLabels,
  ].filter(Boolean).length;
  const presentDayLayers =
    mapLayers.climate ||
    mapLayers.terrain ||
    mapLayers.mountains ||
    mapLayers.cities ||
    mapLayers.disputed;

  return [
    { id: "physical-size", level: physical ? "pass" : "warning" },
    { id: "sources", level: hasSources ? "pass" : "warning" },
    { id: "date", level: hasDate ? "pass" : "warning" },
    {
      id: "text-size",
      level: physical ? "pass" : "warning",
      actual: physical ? 7 : undefined,
      threshold: 6,
    },
    {
      id: "stroke-width",
      level: physical ? "pass" : "warning",
      actual: physical ? 0.1 : undefined,
      threshold: 0.1,
    },
    {
      id: "rgb-colors",
      level: inspection.usesRgbColors ? "warning" : "pass",
    },
    {
      id: "missing-fonts",
      level:
        inspection.unavailableFonts === null ||
        inspection.unavailableFonts.length
          ? "warning"
          : "pass",
      actual: inspection.unavailableFonts?.length,
      detail: inspection.unavailableFonts?.join(", "),
    },
    {
      id: "labels-outside-crop",
      level: inspection.labelsOutsideCrop ? "warning" : "pass",
      actual: inspection.labelsOutsideCrop,
      threshold: 0,
    },
    {
      id: "label-density",
      level:
        preset.unit === "mm" &&
        preset.width <= 90 &&
        labelDensity !== "essential"
          ? "warning"
          : "pass",
    },
    {
      id: "layer-complexity",
      level: thematicCount > 3 ? "warning" : "pass",
      actual: thematicCount,
      threshold: 3,
    },
    {
      id: "temporal-layers",
      level: politicalYear !== 2026 && presentDayLayers ? "warning" : "pass",
    },
  ];
}
