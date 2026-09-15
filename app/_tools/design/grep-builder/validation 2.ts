export type GrepCandidate = {
  findWhat: string;
  replaceWith: string;
};

export type GrepValidationInput = {
  findInstruction: string;
  replaceInstruction: string;
  candidate: GrepCandidate;
  warning?: string;
};

export type GrepCorrection =
  | "preserved-lookahead-token"
  | "four-period-ellipsis";

export type GrepValidationResult = {
  candidate: GrepCandidate;
  corrections: GrepCorrection[];
};

function normalizeInstruction(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fixesPreservedLookaheadToken(candidate: GrepCandidate) {
  const lookahead = candidate.findWhat.match(/\(\?=([A-Za-z]+)\)$/);
  if (!lookahead) return null;

  const token = lookahead[1];
  const duplicatedToken = new RegExp(
    `^(\\$\\d+~S)\\s*${escapeRegExp(token)}$`,
  );
  const replacement = candidate.replaceWith.match(duplicatedToken);
  if (!replacement) return null;

  return replacement[1];
}

function isFourPeriodEllipsisIntent(
  findInstruction: string,
  replaceInstruction: string,
  candidate: GrepCandidate,
) {
  const find = normalizeInstruction(findInstruction);
  const replace = normalizeInstruction(replaceInstruction);
  const describesFourPeriods =
    /literal\s+period.*(?:three|3)\s+dots?/.test(find) ||
    /tecka.*(?:tri|tremi|3)\s+teck/.test(find);

  return (
    describesFourPeriods &&
    (candidate.replaceWith === "…" || /ellipsis|elips/.test(replace))
  );
}

function hasWrongLiteralPeriodCount(findWhat: string) {
  return /^\\\.(?:\\\.)?\{[23]\}$/.test(findWhat);
}

export function validateGrepCandidate(
  input: GrepValidationInput,
): GrepValidationResult {
  if (input.warning)
    return { candidate: input.candidate, corrections: [] };

  let candidate = input.candidate;
  const corrections: GrepCorrection[] = [];

  const replacement = fixesPreservedLookaheadToken(candidate);
  if (replacement) {
    candidate = { ...candidate, replaceWith: replacement };
    corrections.push("preserved-lookahead-token");
  }

  if (
    isFourPeriodEllipsisIntent(
      input.findInstruction,
      input.replaceInstruction,
      candidate,
    ) && hasWrongLiteralPeriodCount(candidate.findWhat)
  ) {
    candidate = { findWhat: "\\.{4}", replaceWith: "…" };
    corrections.push("four-period-ellipsis");
  }

  return { candidate, corrections };
}
