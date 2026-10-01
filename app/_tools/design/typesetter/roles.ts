import type { SemanticRoleId, TypesetterLanguage } from "./types";

export type SemanticRole = {
  id: SemanticRoleId;
  name: Record<TypesetterLanguage, string>;
  description: Record<TypesetterLanguage, string>;
  requiresParagraphStyle: boolean;
  supportsObjectStyle: boolean;
};

export const semanticRoles: readonly SemanticRole[] = [
  {
    id: "heading.chapter",
    name: { en: "Chapter heading", cs: "Nadpis kapitoly" },
    description: {
      en: "The main title of a chapter or other top-level division.",
      cs: "Hlavní název kapitoly nebo jiné nejvyšší části.",
    },
    requiresParagraphStyle: true,
    supportsObjectStyle: false,
  },
  {
    id: "heading.section",
    name: { en: "Section heading", cs: "Nadpis oddílu" },
    description: {
      en: "A heading that introduces a major section inside a chapter.",
      cs: "Nadpis, který uvádí hlavní oddíl uvnitř kapitoly.",
    },
    requiresParagraphStyle: true,
    supportsObjectStyle: false,
  },
  {
    id: "heading.subsection",
    name: { en: "Subheading", cs: "Mezinadpis" },
    description: {
      en: "A lower-level heading inside a section.",
      cs: "Nadpis nižší úrovně uvnitř oddílu.",
    },
    requiresParagraphStyle: true,
    supportsObjectStyle: false,
  },
  {
    id: "body",
    name: { en: "Body text", cs: "Základní text" },
    description: {
      en: "Ordinary running text.",
      cs: "Běžný průběžný text.",
    },
    requiresParagraphStyle: true,
    supportsObjectStyle: false,
  },
  {
    id: "list.item",
    name: { en: "List item", cs: "Položka seznamu" },
    description: {
      en: "A bulleted or numbered list item.",
      cs: "Položka odrážkového nebo číslovaného seznamu.",
    },
    requiresParagraphStyle: true,
    supportsObjectStyle: false,
  },
  {
    id: "quote",
    name: { en: "Quotation", cs: "Citace" },
    description: {
      en: "A displayed quotation or excerpt.",
      cs: "Samostatně vysazená citace nebo ukázka.",
    },
    requiresParagraphStyle: true,
    supportsObjectStyle: false,
  },
  {
    id: "caption",
    name: { en: "Caption", cs: "Popisek" },
    description: {
      en: "A caption belonging to an image or figure.",
      cs: "Popisek patřící k obrázku nebo ilustraci.",
    },
    requiresParagraphStyle: true,
    supportsObjectStyle: false,
  },
  {
    id: "image.request",
    name: { en: "Image request", cs: "Požadavek na obrázek" },
    description: {
      en: "An instruction or placeholder describing an image to create or source.",
      cs: "Pokyn nebo zástupný text popisující obrázek, který je třeba vytvořit či dohledat.",
    },
    requiresParagraphStyle: true,
    supportsObjectStyle: true,
  },
  {
    id: "unsupported",
    name: { en: "Unsupported / review", cs: "Nepodporováno / kontrola" },
    description: {
      en: "Content that cannot be placed safely by the first importer.",
      cs: "Obsah, který první verze importéru nedokáže bezpečně vložit.",
    },
    requiresParagraphStyle: false,
    supportsObjectStyle: false,
  },
] as const;

export const semanticRoleIds = semanticRoles.map(({ id }) => id);

export function isSemanticRoleId(value: unknown): value is SemanticRoleId {
  return (
    typeof value === "string" &&
    semanticRoleIds.includes(value as SemanticRoleId)
  );
}
