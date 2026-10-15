export type AliasableTerritory = {
  label: string;
  atlasName?: string;
};

const territoryAliasGroups = [
  ["Czechia", "Czech Republic", "Česko", "Česká republika"],
  [
    "United States of America",
    "United States",
    "USA",
    "US",
    "U.S.",
    "Spojené státy americké",
    "Spojené státy",
  ],
  [
    "United Kingdom",
    "Great Britain",
    "Britain",
    "UK",
    "U.K.",
    "Spojené království",
    "Velká Británie",
  ],
  ["Russia", "Russian Federation", "Rusko", "Ruská federace"],
  [
    "South Korea",
    "Republic of Korea",
    "Korea, South",
    "Jižní Korea",
    "Korejská republika",
  ],
  [
    "North Korea",
    "Democratic People's Republic of Korea",
    "Korea, North",
    "Severní Korea",
    "KLDR",
  ],
  ["Côte d'Ivoire", "Ivory Coast", "Pobřeží slonoviny"],
  [
    "Democratic Republic of the Congo",
    "DR Congo",
    "DRC",
    "Congo-Kinshasa",
    "Demokratická republika Kongo",
  ],
  [
    "Republic of the Congo",
    "Congo Republic",
    "Congo-Brazzaville",
    "Konžská republika",
  ],
  [
    "Bosnia and Herzegovina",
    "Bosnia & Herzegovina",
    "Bosna a Hercegovina",
  ],
  ["North Macedonia", "Macedonia", "Severní Makedonie", "Makedonie"],
  ["Türkiye", "Turkey", "Turecko"],
  ["Myanmar", "Burma", "Barma"],
  ["Eswatini", "Swaziland", "Svazijsko"],
  ["Timor-Leste", "East Timor", "Východní Timor"],
  ["Vatican City", "Vatican", "Holy See", "Vatikán"],
  ["Cabo Verde", "Cape Verde", "Kapverdy"],
  ["Roman Empire", "Římská říše", "Římské impérium"],
  ["Eastern Roman Empire", "Byzantine Empire", "Byzantská říše"],
  ["Ottoman Empire", "Osmanská říše", "Osmanská říše turecká"],
  ["Holy Roman Empire", "Svatá říše římská"],
  ["Austria-Hungary", "Austro-Hungarian Empire", "Rakousko-Uhersko"],
  ["Czechoslovakia", "Československo", "Czecho-Slovakia"],
] as const;

export function normalizeTerritoryName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&/gu, " and ")
    .replace(/[’']/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/^the\s+/u, "")
    .replace(/\s+/gu, " ");
}

export function createTerritoryAliasLookup<T extends AliasableTerritory>(
  territories: readonly T[],
) {
  const lookup = new Map<string, T>();
  for (const territory of territories)
    for (const name of [territory.label, territory.atlasName]) {
      if (!name?.trim()) continue;
      lookup.set(normalizeTerritoryName(name), territory);
    }

  for (const group of territoryAliasGroups) {
    const territory = group
      .map((name) => lookup.get(normalizeTerritoryName(name)))
      .find((candidate): candidate is T => Boolean(candidate));
    if (!territory) continue;
    for (const alias of group)
      lookup.set(normalizeTerritoryName(alias), territory);
  }
  return lookup;
}
