export type MapLabelKind =
  "country" | "water" | "feature" | "city" | "mountain";

export type MapLabelLayers = {
  labels: boolean;
  water: boolean;
  cities: boolean;
  mountains: boolean;
};

export type MapLabelVariant = "default" | "full" | "short";

export type MapLabelCandidate = {
  key: string;
  text: string;
  kind: MapLabelKind;
  variant: MapLabelVariant;
  rank: number;
  prominence: number;
  required: boolean;
  anchor: "start" | "middle" | "end";
  rootX: number;
  rootY: number;
};

export type MapLabelGroup = {
  key: string;
  candidates: MapLabelCandidate[];
};

export type MapLabelPlacement = {
  key: string;
  variant: MapLabelVariant | null;
  dx: number;
  dy: number;
  hidden: boolean;
  overlaps: boolean;
};

export type MapLabelLayoutOptions = {
  zoom: number;
  layers: MapLabelLayers;
  width?: number;
  height?: number;
};

type Box = { left: number; top: number; right: number; bottom: number };
type CandidatePosition = {
  dx: number;
  dy: number;
  box: Box;
  overlap: number;
  penalty: number;
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 700;
const BOX_PADDING = 1.5;

function finiteNumber(value: string | undefined, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function labelFontSize(kind: MapLabelKind, zoom: number) {
  if (kind === "water") return (7 + zoom * 0.8) / zoom;
  if (kind === "feature") return 7;
  return (6 + zoom * 0.7) / zoom;
}

function characterWidth(character: string) {
  const normalized = character.normalize("NFD").replace(/\p{M}/gu, "");
  if (/\s/u.test(character)) return 0.34;
  if (/[ilIjtfr1|.,'’]/u.test(normalized)) return 0.32;
  if (/[MW@%&#]/u.test(normalized)) return 0.9;
  if (/[A-ZÁ-Ž]/u.test(character)) return 0.68;
  if (/[0-9]/u.test(character)) return 0.58;
  return 0.56;
}

export function estimateMapLabelBox(
  candidate: MapLabelCandidate,
  zoom: number,
) {
  const fontSize = labelFontSize(candidate.kind, zoom);
  const italicAllowance = candidate.kind === "water" ? fontSize * 0.3 : 0;
  const textWidth = [...candidate.text].reduce(
    (width, character) => width + characterWidth(character) * fontSize,
    italicAllowance,
  );
  const halo = candidate.kind === "water" ? 1.9 / zoom : 1.7 / zoom;
  return {
    width: textWidth + halo * 2 + BOX_PADDING * 2,
    height: fontSize * 1.3 + halo * 2 + BOX_PADDING * 2,
  };
}

function boxAt(
  candidate: MapLabelCandidate,
  zoom: number,
  dx: number,
  dy: number,
): Box {
  const size = estimateMapLabelBox(candidate, zoom);
  const x = candidate.rootX + dx;
  const baseline = candidate.rootY + dy;
  const left =
    candidate.anchor === "middle"
      ? x - size.width / 2
      : candidate.anchor === "end"
        ? x - size.width
        : x;
  return {
    left,
    top: baseline - size.height * 0.78,
    right: left + size.width,
    bottom: baseline + size.height * 0.22,
  };
}

function intersectionArea(left: Box, right: Box) {
  return (
    Math.max(
      0,
      Math.min(left.right, right.right) - Math.max(left.left, right.left),
    ) *
    Math.max(
      0,
      Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
    )
  );
}

function insideBounds(box: Box, width: number, height: number) {
  return (
    box.left >= BOX_PADDING &&
    box.top >= BOX_PADDING &&
    box.right <= width - BOX_PADDING &&
    box.bottom <= height - BOX_PADDING
  );
}

function offsetsFor(candidate: MapLabelCandidate, zoom: number) {
  const { width, height } = estimateMapLabelBox(candidate, zoom);
  const vertical = height * 0.95;
  const horizontal = Math.min(width * 0.58, height * 2.8);
  if (candidate.kind === "country") {
    const nudge = height * 0.85;
    return [
      [0, 0],
      [0, -nudge],
      [0, nudge],
      [-nudge, 0],
      [nudge, 0],
      [-nudge, -nudge],
      [nudge, -nudge],
      [-nudge, nudge],
      [nudge, nudge],
    ] as const;
  }
  if (candidate.kind === "city" || candidate.kind === "feature") {
    return [
      [0, 0],
      [0, -vertical],
      [0, vertical],
      [-width - height * 0.7, 0],
      [-width - height * 0.7, -vertical],
      [-width - height * 0.7, vertical],
      [horizontal, -vertical],
      [horizontal, vertical],
    ] as const;
  }
  return [
    [0, 0],
    [0, -vertical],
    [0, vertical],
    [-horizontal, 0],
    [horizontal, 0],
    [-horizontal, -vertical],
    [horizontal, -vertical],
    [-horizontal, vertical],
    [horizontal, vertical],
    [0, -vertical * 2],
    [0, vertical * 2],
  ] as const;
}

function kindPriority(kind: MapLabelKind) {
  if (kind === "feature") return 0;
  if (kind === "water") return 1;
  if (kind === "country") return 2;
  if (kind === "city") return 3;
  return 4;
}

function layerVisible(
  candidate: MapLabelCandidate,
  options: MapLabelLayoutOptions,
) {
  if (candidate.kind === "country" || candidate.kind === "feature")
    return options.layers.labels;
  if (candidate.kind === "water") return options.layers.water;
  if (candidate.kind === "city") return options.layers.cities;
  return options.layers.mountains;
}

function rankVisible(candidate: MapLabelCandidate, zoom: number) {
  if (candidate.kind !== "city" && candidate.kind !== "mountain") return true;
  if (zoom >= 8) return true;
  if (candidate.kind === "city") return candidate.rank <= (zoom >= 3 ? 6 : 3);
  return candidate.rank <= (zoom >= 3 ? 5 : 2);
}

function orderedGroups(
  groups: MapLabelGroup[],
  options: MapLabelLayoutOptions,
) {
  return groups
    .filter(({ candidates }) => {
      const candidate = candidates[0];
      return (
        candidate &&
        layerVisible(candidate, options) &&
        rankVisible(candidate, options.zoom)
      );
    })
    .slice()
    .sort((left, right) => {
      const a = left.candidates[0];
      const b = right.candidates[0];
      return (
        Number(b.required) - Number(a.required) ||
        kindPriority(a.kind) - kindPriority(b.kind) ||
        a.rank - b.rank ||
        b.prominence - a.prominence ||
        a.key.localeCompare(b.key)
      );
    });
}

export function placeMapLabels(
  groups: MapLabelGroup[],
  options: MapLabelLayoutOptions,
) {
  const width = options.width ?? MAP_WIDTH;
  const height = options.height ?? MAP_HEIGHT;
  const occupied: Box[] = [];
  const placements = new Map<string, MapLabelPlacement>();

  for (const group of orderedGroups(groups, options)) {
    const variants = group.candidates.slice().sort((a, b) => {
      const variantOrder = (value: MapLabelVariant) =>
        value === "full" ? 0 : value === "short" ? 1 : 0;
      return variantOrder(a.variant) - variantOrder(b.variant);
    });
    let bestFallback:
      (CandidatePosition & { variant: MapLabelVariant }) | null = null;
    let selected: (CandidatePosition & { variant: MapLabelVariant }) | null =
      null;

    for (const candidate of variants) {
      const variantPenalty = candidate.variant === "short" ? 0.25 : 0;
      for (const [index, [dx, dy]] of offsetsFor(
        candidate,
        options.zoom,
      ).entries()) {
        const box = boxAt(candidate, options.zoom, dx, dy);
        if (!insideBounds(box, width, height)) continue;
        const overlap = occupied.reduce(
          (total, occupiedBox) => total + intersectionArea(box, occupiedBox),
          0,
        );
        const position = {
          dx,
          dy,
          box,
          overlap,
          penalty:
            overlap * 1000 +
            Math.hypot(dx, dy) +
            variantPenalty +
            index * 0.001,
          variant: candidate.variant,
        };
        if (!bestFallback || position.penalty < bestFallback.penalty)
          bestFallback = position;
        if (overlap === 0 && (!selected || position.penalty < selected.penalty))
          selected = position;
      }
    }

    const required = variants.some(({ required }) => required);
    const placement = selected || (required ? bestFallback : null);
    if (!placement) {
      placements.set(group.key, {
        key: group.key,
        variant: null,
        dx: 0,
        dy: 0,
        hidden: true,
        overlaps: false,
      });
      continue;
    }
    occupied.push(placement.box);
    placements.set(group.key, {
      key: group.key,
      variant: placement.variant,
      dx: Number(placement.dx.toFixed(3)),
      dy: Number(placement.dy.toFixed(3)),
      hidden: false,
      overlaps: placement.overlap > 0,
    });
  }

  for (const group of groups) {
    if (!placements.has(group.key)) {
      placements.set(group.key, {
        key: group.key,
        variant: null,
        dx: 0,
        dy: 0,
        hidden: true,
        overlaps: false,
      });
    }
  }
  return placements;
}

function readCandidate(element: SVGTextElement): MapLabelCandidate | null {
  const key = element.dataset.mapLabelKey;
  const kind = element.dataset.mapLabelKind as MapLabelKind | undefined;
  if (!key || !kind) return null;
  const variant = (element.dataset.mapLabelVariant ||
    "default") as MapLabelVariant;
  return {
    key,
    text: element.textContent || "",
    kind,
    variant,
    rank: finiteNumber(element.dataset.mapLabelRank, 0),
    prominence: finiteNumber(element.dataset.mapLabelProminence, 0),
    required: element.dataset.mapLabelRequired === "true",
    anchor: (element.getAttribute("text-anchor") || "start") as
      "start" | "middle" | "end",
    rootX: finiteNumber(element.dataset.mapLabelRootX),
    rootY: finiteNumber(element.dataset.mapLabelRootY),
  };
}

export function layoutMapSvgLabels(
  root: SVGSVGElement,
  options: MapLabelLayoutOptions,
) {
  const elements = [
    ...root.querySelectorAll<SVGTextElement>("text[data-map-label-key]"),
  ];
  const groupsByKey = new Map<string, MapLabelGroup>();
  for (const element of elements) {
    const candidate = readCandidate(element);
    if (!candidate) continue;
    const group = groupsByKey.get(candidate.key) || {
      key: candidate.key,
      candidates: [],
    };
    group.candidates.push(candidate);
    groupsByKey.set(candidate.key, group);
  }
  const placements = placeMapLabels([...groupsByKey.values()], options);

  for (const element of elements) {
    const key = element.dataset.mapLabelKey;
    const placement = key ? placements.get(key) : null;
    const variant = (element.dataset.mapLabelVariant ||
      "default") as MapLabelVariant;
    const baseX = finiteNumber(element.dataset.mapLabelBaseX);
    const baseY = finiteNumber(element.dataset.mapLabelBaseY);
    element.setAttribute(
      "x",
      String(Number((baseX + (placement?.dx || 0)).toFixed(3))),
    );
    element.setAttribute(
      "y",
      String(Number((baseY + (placement?.dy || 0)).toFixed(3))),
    );
    element.style.removeProperty("display");
    element.removeAttribute("data-label-state");

    if (!placement || placement.hidden || placement.variant !== variant) {
      element.style.display = "none";
      element.setAttribute(
        "data-label-state",
        placement?.hidden ? "collision-suppressed" : "alternate-variant",
      );
    } else if (variant === "short") {
      element.style.display = "inline";
      element.setAttribute("data-label-state", "abbreviated");
    } else if (placement.overlaps) {
      element.setAttribute("data-label-state", "minimum-overlap");
    }
  }
  return placements;
}
