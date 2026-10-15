import fs from "node:fs/promises";
import path from "node:path";
import { read as readShapefile } from "shapefile";

// Usage: node import-czech-names.mjs <ne_10m_admin_0_countries.shp> <cldr-cs-territories.json> <wikidata-cs-cities.json> [output]
// The CLDR file comes from https://github.com/unicode-org/cldr-json (Unicode license).
// The Wikidata city map is produced by this SPARQL query against query.wikidata.org:
//   SELECT ?en ?cs WHERE { ?item rdfs:label ?en. ?item rdfs:label ?cs.
//     FILTER(LANG(?cs) = 'cs') VALUES ?en { "Prague"@en ... } }
// with the 200 Natural Earth capital names as VALUES.

const [countriesPath, cldrPath, citiesPath, outputPath = "app/_tools/image/map-generator/code/data/czech-names.json"] = process.argv.slice(2);
if (!countriesPath || !cldrPath || !citiesPath) throw new Error("Usage: node app/_tools/image/map-generator/scripts/import-czech-names.mjs <ne_10m_admin_0_countries.shp> <cldr-cs-territories.json> <wikidata-cs-cities.json> [output]");

const clean = (value) => String(value ?? "").replace(/\u0000/g, "").trim();
const countriesCollection = await readShapefile(countriesPath, undefined, { encoding: "utf-8" });
const cldr = JSON.parse(await fs.readFile(cldrPath, "utf8"));
const territories = cldr.main.cs.localeDisplayNames.territories;
const cityLabels = JSON.parse(await fs.readFile(citiesPath, "utf8"));

const countries = {};
for (const feature of countriesCollection.features) {
  const iso2 = clean(feature.properties.ISO_A2);
  const name = clean(feature.properties.NAME) || clean(feature.properties.ADMIN);
  const czech = territories[iso2];
  if (name && czech) countries[name] = czech;
}

const output = {
  source: {
    title: "Czech place names",
    url: "https://github.com/unicode-org/cldr-json",
    license: "Unicode License (CLDR) and CC0 (Wikidata labels)",
    citation: "CLDR Czech territory names; Czech capital labels from Wikidata",
    importedAt: new Date().toISOString(),
  },
  countries,
  cities: cityLabels,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(output));
console.log(JSON.stringify({ outputPath, countries: Object.keys(countries).length, cities: Object.keys(cityLabels).length }));
