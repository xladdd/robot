import catalogData from "../references/catalog.json";
import type {
  BiologicalDiagramType,
  ReferenceCatalogEntry,
  ReferenceSelection,
} from "./contracts.ts";

const catalog = catalogData as ReferenceCatalogEntry[];

function normalized(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export function getReferenceCatalog() {
  return catalog.map((entry) => ({ ...entry }));
}

export function getReferenceById(id: string | null) {
  return id ? catalog.find((entry) => entry.id === id) || null : null;
}

export function selectReference(
  request: string,
  diagramType?: BiologicalDiagramType,
): ReferenceSelection {
  const query = normalized(request);
  const ranked = catalog
    .map((entry) => {
      const terms = [
        entry.subject,
        ...entry.keywords,
        ...entry.suitableFor,
      ].map(normalized);
      const score = terms.reduce(
        (total, term) =>
          total + (query.includes(term) ? (term.length > 5 ? 3 : 1) : 0),
        diagramType && entry.diagramType === diagramType ? 2 : 0,
      );
      return { entry, score };
    })
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score === 0)
    return {
      id: null,
      subject: "general biological subject",
      view: "clear flat textbook composition",
      rationale:
        "No catalogue subject matched confidently; use the written brief and any uploaded reference.",
      source: null,
      licence: null,
      assetPath: null,
    };
  return {
    id: best.entry.id,
    subject: best.entry.subject,
    view: best.entry.view,
    rationale: `Matched the request to the reviewed composition category “${best.entry.subject}”. The catalogue entry is a compositional hint, not a biological authority.`,
    source: best.entry.source,
    licence: best.entry.licence,
    assetPath: best.entry.assetPath,
  };
}

export function referenceCatalogForPrompt() {
  return catalog.map(
    ({ id, subject, keywords, view, diagramType, suitableFor }) => ({
      id,
      subject,
      keywords,
      view,
      diagramType,
      suitableFor,
    }),
  );
}
