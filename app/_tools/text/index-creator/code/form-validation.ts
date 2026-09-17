export type FormEntry = { word?: unknown; forms?: unknown };
export type ValidatedFormEntry = { word: string; forms: string[] };

function normalizeFormText(value: string) {
  return value
    .normalize("NFC")
    .replace(/\u00ad/gu, "")
    .replace(/-\s*(?:\r\n|\r|\n)\s*/gu, "")
    .replace(/[\r\n\u2028\u2029]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function comparable(value: string) {
  return normalizeFormText(value)
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u02bc]/gu, "'")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/gu, "-")
    .toLocaleLowerCase("cs-CZ");
}

function formTokens(value: string) {
  return normalizeFormText(value).split(/\s+/u).filter(Boolean);
}

function romanTokens(value: string) {
  return formTokens(value)
    .map((token) => token.replace(/[.,;:!?]+$/gu, ""))
    .filter((token) =>
      /^(?=[MDCLXVI]+$)(?:M{0,4}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3}))$/iu.test(
        token,
      ),
    )
    .map((token) => token.toLocaleUpperCase("en-US"));
}

function preservesRomanNumerals(original: string, form: string) {
  const originalRoman = romanTokens(original);
  if (!originalRoman.length) return true;
  const formRoman = romanTokens(form);
  return originalRoman.every((roman) => formRoman.includes(roman));
}

function identityTokens(value: string) {
  const stopWords = new Set(["z", "ze", "von", "van", "de", "of", "the"]);
  return formTokens(value).filter(
    (token) =>
      token.replace(/[.,;:!?]+$/gu, "").length >= 3 &&
      !romanTokens(token).length &&
      !stopWords.has(token.toLocaleLowerCase("cs-CZ")),
  );
}

function preservesIdentityComponents(original: string, form: string) {
  const formValues = identityTokens(form).map((token) =>
    token.replace(/[.,;:!?]+$/gu, "").toLocaleLowerCase("cs-CZ"),
  );
  return identityTokens(original).every((token) => {
    const stem = token
      .replace(/[.,;:!?]+$/gu, "")
      .toLocaleLowerCase("cs-CZ")
      .slice(0, 3);
    return formValues.some(
      (value) => value.startsWith(stem) || stem.startsWith(value.slice(0, 3)),
    );
  });
}

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "");
}

function commonPrefixLength(left: string, right: string) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function preservesSingleWordStem(original: string, form: string) {
  const originalWords = identityTokens(original);
  const formWords = identityTokens(form).map((token) =>
    stripDiacritics(
      token.replace(/[.,;:!?]+$/gu, "").toLocaleLowerCase("cs-CZ"),
    ),
  );
  return originalWords.every((token) => {
    const normalized = stripDiacritics(
      token.replace(/[.,;:!?]+$/gu, "").toLocaleLowerCase("cs-CZ"),
    );
    if (normalized.length < 6) return true;
    const minimumPrefix = Math.max(5, normalized.length - 1);
    return formWords.some(
      (value) => commonPrefixLength(normalized, value) >= minimumPrefix,
    );
  });
}

function isSafeModelForm(original: string, form: string) {
  const normalizedForm = normalizeFormText(form);
  if (!normalizedForm || normalizedForm.length > 240) return false;
  if (!preservesRomanNumerals(original, normalizedForm)) return false;
  if (!preservesIdentityComponents(original, normalizedForm)) return false;
  if (!preservesSingleWordStem(original, normalizedForm)) return false;

  return (
    formTokens(original).length <= 1 ||
    formTokens(normalizedForm).length >= formTokens(original).length
  );
}

/** Validate untrusted model output while retaining one entry per submitted word. */
export function sanitizeFormEntries(
  words: readonly string[],
  rawEntries: readonly FormEntry[],
): ValidatedFormEntry[] {
  const entriesByWord = new Map<string, FormEntry>();
  for (const entry of rawEntries) {
    if (typeof entry.word !== "string") continue;
    const key = comparable(entry.word);
    if (key && !entriesByWord.has(key)) entriesByWord.set(key, entry);
  }

  return words.map((word) => {
    const original = word.trim();
    const entry = entriesByWord.get(comparable(original));
    const forms = new Set<string>([original]);
    if (Array.isArray(entry?.forms)) {
      for (const form of entry.forms) {
        if (typeof form !== "string") continue;
        const normalized = normalizeFormText(form);
        if (!isSafeModelForm(original, normalized)) continue;
        const key = comparable(normalized);
        if (key && ![...forms].some((item) => comparable(item) === key))
          forms.add(normalized);
      }
    }
    return { word: original, forms: [...forms] };
  });
}

export const validateModelForms = sanitizeFormEntries;
