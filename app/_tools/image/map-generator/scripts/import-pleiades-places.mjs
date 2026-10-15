import fs from "node:fs/promises";
import path from "node:path";

const inputPath = process.argv[2];
const outputPath = process.argv[3] || "app/_tools/image/map-generator/code/data/pleiades-places.json";
if (!inputPath) throw new Error("Usage: node app/_tools/image/map-generator/scripts/import-pleiades-places.mjs <pleiades-places.csv> [output]");

const text = await fs.readFile(inputPath, "utf8");
const lines = text.split("\n");

function parseCsvLine(line) {
  const out = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (inQuotes) {
      if (character === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
      else if (character === '"') inQuotes = false;
      else current += character;
    } else if (character === '"') inQuotes = true;
    else if (character === ",") { out.push(current); current = ""; }
    else current += character;
  }
  out.push(current);
  return out;
}

const header = parseCsvLine(lines[0]).map((name) => name.trim());
const column = (name) => header.indexOf(name);
for (const required of ["id", "title", "featureTypes", "minDate", "maxDate", "reprLat", "reprLong"]) {
  if (column(required) < 0) throw new Error(`Missing required column: ${required}`);
}

// Prominent ancient settlements shown at world zoom; every other settlement
// appears from regional zoom. Matched against a normalized title.
const majorTitles = new Set([
  "roma", "athenai", "athens", "korinthos", "corinth", "sparte", "sparta", "syrakousai", "syracuse",
  "carthago", "carthage", "alexandreia", "alexandria", "antiocheia", "antioch", "babylon", "babylon_",
  "hierosolyma", "jerusalem", "byzantion", "constantinopolis", "selinous", "akragas", "massalia",
  "tyros", "sidon", "memphis", "thebai", "thebes", "efesos", "ephesos", "pergamon", "rhodos", "rhodes",
  "ptolemais", "seleukeia", "nineveh", "uruk", "persepolis", "susa", "knossos", "panormos", "leptis",
  "tarraco", "emerita", "londinium", "lugdunum", "colonia", "aquitania",
].map((name) => name.toLowerCase()));
const normalizeTitle = (title) => title.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();

const places = [];
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const cols = parseCsvLine(lines[i]);
  const types = (cols[column("featureTypes")] || "").split(/[,;]\s*/).filter(Boolean);
  const isSettlement = types.some((type) => /^settlement$/i.test(type));
  if (!isSettlement) continue;
  const lon = Number(cols[column("reprLong")]);
  const lat = Number(cols[column("reprLat")]);
  const fromYear = Number(cols[column("minDate")]);
  const toYear = Number(cols[column("maxDate")]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
  if (!Number.isFinite(fromYear) || !Number.isFinite(toYear)) continue;
  const title = (cols[column("title")] || "").trim().slice(0, 80);
  if (!title) continue;
  places.push({
    id: String(cols[column("id")] || `pleiades-${i}`),
    title,
    fromYear,
    toYear,
    lon: Math.round(lon * 10000) / 10000,
    lat: Math.round(lat * 10000) / 10000,
    rank: majorTitles.has(normalizeTitle(title)) ? 3 : 6,
  });
}
places.sort((a, b) => a.id.localeCompare(b.id, "en"));
const output = {
  source: {
    title: "Pleiades gazetteer of ancient places",
    url: "https://pleiades.stoa.org/",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    citation: "Pleiades: A Gazetteer of Places Past. Pleiades.stoa.org, Ancient World Mapping Center and ISAW, NYU.",
    adaptation: "Settlements with representative point locations and temporal extents; coordinates quantized to four decimals.",
    importedAt: new Date().toISOString(),
  },
  places,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(output));
console.log(JSON.stringify({ outputPath, places: places.length, bytes: Buffer.byteLength(JSON.stringify(output)) }));
