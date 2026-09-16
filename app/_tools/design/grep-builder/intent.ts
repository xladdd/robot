export type DeterministicGrepIntentId =
  | "spaces-before-punctuation"
  | "phone-number-spacing"
  | "page-reference"
  | "literal-text"
  | "parenthesized-uppercase-code"
  | "paragraph-start-literal"
  | "between-delimiters"
  | "formatting-only"
  | "conditional-date-padding";

export type DeterministicGrepResult = {
  matched: true;
  ruleId: DeterministicGrepIntentId;
  findWhat: string;
  replaceWith: string;
  warning?: string;
};

type UnmatchedResult = { matched: false };

const unmatched: UnmatchedResult = { matched: false };

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function escapeGrepLiteral(value: string) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function success(
  ruleId: DeterministicGrepIntentId,
  findWhat: string,
  replaceWith: string,
): DeterministicGrepResult {
  return { matched: true, ruleId, findWhat, replaceWith };
}

function warning(
  ruleId: DeterministicGrepIntentId,
  message: string,
): DeterministicGrepResult {
  return {
    matched: true,
    ruleId,
    findWhat: "",
    replaceWith: "",
    warning: message,
  };
}

function isCzech(findInstruction: string, replaceInstruction: string) {
  const text = `${normalize(findInstruction)} ${normalize(replaceInstruction)}`;
  return hasAny(text, [
    /\b(?:az|na|pouze|vse|vesker|stejny|zmenit|najit|odstranit|nic|mezi|odstavec|odstavce|zavork|hranat|tucn|kurziv|zapsan|mesic|rrrr)\w*\b/,
  ]);
}

function matchesSpacesBeforePunctuation(find: string, replace: string) {
  return (
    hasAny(find, [
      /\b(?:space|spaces|whitespace|mezera|mezery|bile znaky)\b/,
    ]) &&
    hasAny(find, [
      /\b(?:before|immediately before|pred|bezprostredne pred)\b/,
    ]) &&
    hasAny(find, [
      /\b(?:comma|commas|period|periods|full stop|semicolon|colon|exclamation|question|carka|tecka|strednik|dvojtecka|vykricnik|otaznik)/,
    ]) &&
    hasAny(replace, [/\b(?:nothing|remove|delete|nic|odstranit|smazat)\b/])
  );
}

function matchesPhoneSpacing(find: string, replace: string) {
  return (
    hasAny(find, [/\b(?:phone|telephone|telefon|telefonn)\w*\b/]) &&
    /\b\d{3}[-.]\d{3}[-.]\d{3}\b/.test(find) &&
    hasAny(replace, [/\b(?:space|spaces|mezer|mezerami)\w*\b/])
  );
}

function matchesPageReference(find: string, replace: string) {
  return (
    /\bp\./.test(find) &&
    hasAny(find, [
      /\b(?:page|pages|reference|references|odkaz|odkazy|strank|strana)\w*\b/,
    ]) &&
    hasAny(find, [/\b(?:number|numbers|cislo|cislice|cisel|cis)\w*\b/]) &&
    hasAny(replace, [/\b(?:page|strana)\b/]) &&
    hasAny(replace, [/\b(?:space|spaces|mezera|mezerou|mezerou)\w*\b/]) &&
    hasAny(replace, [/\b(?:same|identical|stejny|stejnym)\b/])
  );
}

function extractParenthesizedLiteral(value: string) {
  const match = value.match(/\(([^()\r\n]{1,80})\)/);
  return match ? match[0] : null;
}

function extractBracketedLiteral(value: string) {
  const match = value.match(/\[([^\[\]\r\n]{1,80})\]/);
  return match ? match[0] : null;
}

function matchesLiteralText(find: string, replace: string) {
  return (
    hasAny(find, [
      /\bliteral\s+(?:text|string|expression)\b/,
      /\bdoslovn(?:y|e)\s+(?:text|retezec|vyraz)\b/,
    ]) &&
    Boolean(
      extractParenthesizedLiteral(find) || extractBracketedLiteral(find),
    ) &&
    !hasAny(replace, [/\b(?:nothing|nic|remove|odstranit|smazat)\b/])
  );
}

function extractReplacementLiteral(value: string) {
  return extractBracketedLiteral(value) || extractParenthesizedLiteral(value);
}

function matchesParenthesizedUppercaseCode(find: string, replace: string) {
  return (
    hasAny(find, [/\b(?:parenthes|zavork)\w*\b/]) &&
    hasAny(find, [/\b(?:code|kod)\w*\b/]) &&
    hasAny(find, [/\b(?:uppercase|capital|velk|velke|velky|pismen)\w*\b/]) &&
    /\b(?:two\s+to\s+five|2\s+(?:to|and|az)\s+5|2\s*[-–]\s*5)\b/.test(find) &&
    hasAny(replace, [
      /\b(?:without|remove|bez|odstranit)\b.*\b(?:parenthes|zavor)\w*\b/,
    ])
  );
}

function matchesParagraphStart(find: string, replace: string) {
  return (
    hasAny(find, [/\b(?:start|beginning|zacatku|zacatek)\b/]) &&
    hasAny(find, [/\b(?:paragraph|paragraphs|odstavec|odstavce)\b/]) &&
    /\b(?:word|slovo)\s+[\p{L}][\p{L}'-]*/u.test(find) &&
    !hasAny(find, [/\b(?:any|every|kazde|kazdy|vsechny)\s+word\b/]) &&
    /[\p{L}]/u.test(replace)
  );
}

function extractNamedWord(value: string) {
  const match = value.match(/\b(?:word|slovo)\s+([\p{L}][\p{L}'-]*)/iu);
  return match ? match[1] : null;
}

function extractTrailingWord(value: string) {
  const match = value.match(/([\p{L}][\p{L}'-]*)\s*[.!?]?\s*$/u);
  return match ? match[1] : null;
}

function matchesBetweenDelimiters(find: string, replace: string) {
  const hasBetween = hasAny(find, [
    /\bbetween\b.*\[\s*(?:and|a)\s*\]/,
    /\bmezi\b.*\[\s*a\s*\]/,
  ]);
  const requestsInnerText = hasAny(replace, [
    /\b(?:same|stejny|stejnym)\b.*\b(?:text|content|obsah)\b/,
  ]);
  const removesDelimiters = hasAny(replace, [
    /\b(?:without|remove|bez|odstranit)\b.*\b(?:bracket|brackets|zavork|hranat)\w*\b/,
  ]);

  return hasBetween && requestsInnerText && removesDelimiters;
}

function matchesConditionalDatePadding(find: string, replace: string) {
  return (
    hasAny(find, [
      /\b(?:date|dates|datum|data)\b/,
      /\bd\/m\/(?:yyyy|rrrr)\b/,
      /\bdd\/mm\/(?:yyyy|rrrr)\b/,
    ]) &&
    hasAny(find, [/\bd\/m\/(?:yyyy|rrrr)\b/, /\bdd\/mm\/(?:yyyy|rrrr)\b/]) &&
    hasAny(replace, [/\b(?:yyyy|rrrr)-mm-dd\b/]) &&
    hasAny(replace, [/\b(?:leading zero|zero[- ]pad|dopln\w*|nuly|nul)\w*\b/])
  );
}

function conditionalDateWarning(czech: boolean) {
  const passes = [
    "1. Find \\b(\\d)/(\\d)/(\\d{4})\\b -> Change $3-0$2-0$1",
    "2. Find \\b(\\d)/(\\d{2})/(\\d{4})\\b -> Change $3-$2-0$1",
    "3. Find \\b(\\d{2})/(\\d)/(\\d{4})\\b -> Change $3-0$2-$1",
    "4. Find \\b(\\d{2})/(\\d{2})/(\\d{4})\\b -> Change $3-$2-$1",
  ].join("\n");
  return czech
    ? `Tento požadavek nelze bezpečně vyřešit jedním GREP dotazem. Použijte čtyři samostatné operace Find/Change v tomto pořadí:\n${passes}\nKaždý krok proveďte samostatně; nepoužívejte Find Format ani zástupný text.`
    : `This request cannot be safely solved by one GREP operation. Use these four separate Find/Change passes in order:\n${passes}\nRun each pass separately; do not use Find Format or a placeholder.`;
}

function matchesFormattingOnly(find: string) {
  const hasFormattingTerm = hasAny(find, [
    /\b(?:bold|italic|kurziv|tucn|font|typeface|format|style|barv|velikost)\w*\b/,
  ]);
  const hasTextOrSelection = hasAny(find, [
    /\b(?:text|textu|pismo|vse|vesker|all|every|veker)\w*\b/,
  ]);
  return hasFormattingTerm && hasTextOrSelection;
}

function formattingWarning(czech: boolean) {
  return czech
    ? "Tento požadavek se týká formátování, ne textu. Použijte v InDesignu Najít formát; samotný GREP textový výraz tučné nebo jiné formátování nerozpozná."
    : "This request targets formatting rather than text. Use InDesign Find Format; text-only GREP cannot identify bold or other formatting.";
}

export function resolveDeterministicGrepIntent(
  findInstruction: string,
  replaceInstruction: string,
): DeterministicGrepResult | UnmatchedResult {
  const find = normalize(findInstruction);
  const replace = normalize(replaceInstruction);
  if (!find || !replace) return unmatched;

  const czech = isCzech(findInstruction, replaceInstruction);

  if (matchesFormattingOnly(find)) {
    return warning("formatting-only", formattingWarning(czech));
  }

  if (matchesConditionalDatePadding(find, replace)) {
    return warning("conditional-date-padding", conditionalDateWarning(czech));
  }

  if (matchesSpacesBeforePunctuation(find, replace)) {
    return success("spaces-before-punctuation", " +(?=[,.;:!?])", "");
  }

  if (matchesPhoneSpacing(find, replace)) {
    return success(
      "phone-number-spacing",
      "(\\d{3})[-.](\\d{3})[-.](\\d{3})",
      "$1 $2 $3",
    );
  }

  if (matchesPageReference(find, replace)) {
    const prefix = /\bstrana\b/.test(replace) ? "strana" : "page";
    return success("page-reference", "\\bp\\.\\s*(\\d+)\\b", `${prefix} $1`);
  }

  if (matchesLiteralText(find, replace)) {
    const literal =
      extractParenthesizedLiteral(findInstruction) ||
      extractBracketedLiteral(findInstruction);
    const replacement = extractReplacementLiteral(replaceInstruction);
    if (literal && replacement) {
      return success("literal-text", escapeGrepLiteral(literal), replacement);
    }
  }

  if (matchesParenthesizedUppercaseCode(find, replace)) {
    return success("parenthesized-uppercase-code", "\\(([A-Z]{2,5})\\)", "$1");
  }

  if (matchesParagraphStart(find, replace)) {
    const literal = extractNamedWord(findInstruction);
    const replacement = extractTrailingWord(replaceInstruction);
    if (literal && replacement) {
      return success(
        "paragraph-start-literal",
        `^${escapeGrepLiteral(literal)}`,
        replacement,
      );
    }
  }

  if (matchesBetweenDelimiters(find, replace)) {
    return success("between-delimiters", "\\[([^\\]]+)\\]", "$1");
  }

  return unmatched;
}
