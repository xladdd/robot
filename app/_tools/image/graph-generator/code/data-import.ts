import readXlsxFile from "read-excel-file";

export type TableCell = unknown;

function formatCell(value: TableCell) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function trimRows(rows: TableCell[][]) {
  const lastColumn = rows.reduce((maximum, row) => {
    let index = row.length - 1;
    while (index >= 0 && formatCell(row[index]) === "") index -= 1;
    return Math.max(maximum, index);
  }, -1);

  return rows
    .map((row) => row.slice(0, lastColumn + 1))
    .filter((row) => row.some((cell) => formatCell(cell) !== ""));
}

export function rowsToMarkdown(rows: TableCell[][]) {
  const normalized = trimRows(rows);
  if (!normalized.length)
    throw new Error("The file does not contain any data.");
  const width = Math.max(...normalized.map((row) => row.length));
  const padded = normalized.map((row) =>
    Array.from({ length: width }, (_, index) => formatCell(row[index])),
  );
  const header = padded[0];
  const body = padded.slice(1);
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function detectDelimiter(text: string) {
  const candidates = [",", ";", "\t"];
  const counts = new Map(candidates.map((candidate) => [candidate, 0]));
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === "\n" || character === "\r")) break;
    else if (!quoted && counts.has(character))
      counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  return candidates.reduce((best, candidate) =>
    (counts.get(candidate) ?? 0) > (counts.get(best) ?? 0) ? candidate : best,
  );
}

export function parseDelimitedText(text: string) {
  const normalizedText = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(normalizedText);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const character = normalizedText[index];
    if (quoted) {
      if (character === '"' && normalizedText[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === delimiter) {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && normalizedText[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

export async function tableFileToMarkdown(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv")
    return rowsToMarkdown(parseDelimitedText(await file.text()));
  if (extension === "xlsx") return rowsToMarkdown(await readXlsxFile(file));
  throw new Error("Choose an Excel (.xlsx) or CSV (.csv) file.");
}
