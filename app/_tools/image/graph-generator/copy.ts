export const graphProcessing = {
  en: [
    "reading the supplied data",
    "choosing sensible axes",
    "measuring the longest label",
    "counting the data points",
    "lining up the tick marks",
    "looking for a missing unit",
    "balancing the chart margins",
    "drawing the bars with a ruler",
    "joining the points",
    "checking the legend",
    "giving the SVG a final polish",
  ],
  cs: [
    "čtení dodaných dat",
    "volba rozumných os",
    "měření nejdelšího popisku",
    "počítání datových bodů",
    "rovnání značek na ose",
    "hledání chybějící jednotky",
    "vyvažování okrajů grafu",
    "rýsování sloupců",
    "spojování bodů",
    "kontrola legendy",
    "závěrečné leštění SVG",
  ],
} as const;

export const graphUi = {
  en: {
    subtitle:
      "Create source-backed, editable SVG charts from your instructions and data.",
    promptLabel: "PROMPT",
    promptPlaceholder:
      "Example: Create a line chart titled … Unit: percent. Source: Statistical office, https://…",
    dataLabel: "DATA",
    dataPlaceholder: "Type or paste data here, or drop an Excel or CSV file…",
    dataHelp: "Excel and CSV files are converted locally to a Markdown table.",
    importData: "Import Excel or CSV",
    dataFileError:
      "Could not read the file. Choose an Excel (.xlsx) or CSV (.csv) file containing data.",
    dataFileSizeError: "Choose an Excel or CSV file up to 10 MB.",
    generate: "Generate SVG (about 30 seconds)",
    generating: "Generating SVG",
    preview: "SVG PREVIEW",
    downloadSvg: "Download SVG",
    empty: "Nothing scarier than an empty page.",
    example: "Insert example",
    palette: "COLOR PALETTE (OPTIONAL)",
    addPalette: "Add Adobe swatches (.ase)",
    clearPalette: "Remove palette",
    paletteFileError: "Choose an Adobe Swatch Exchange (.ase) file up to 2 MB.",
    paletteReadError: "Could not read the ASE palette.",
    valueLabels: "Show bar values",
    valueLabelsHelp: "Short bar charts show exact values by default.",
  },
  cs: {
    subtitle: "Vytváří zdrojované a upravitelné SVG grafy z pokynů a dat.",
    promptLabel: "POKYN",
    promptPlaceholder:
      "Příklad: Vytvoř spojnicový graf s názvem … Jednotka: procenta. Zdroj: Statistický úřad, https://…",
    dataLabel: "DATA",
    dataPlaceholder:
      "Data napište či vložte sem nebo přetáhněte soubor Excel či CSV…",
    dataHelp: "Soubory Excel a CSV se místně převedou na tabulku Markdown.",
    importData: "Importovat Excel nebo CSV",
    dataFileError:
      "Soubor se nepodařilo přečíst. Vyberte soubor Excel (.xlsx) nebo CSV (.csv) s daty.",
    dataFileSizeError:
      "Vyberte soubor Excel nebo CSV o velikosti nejvýše 10 MB.",
    generate: "Vytvořit SVG (asi 30 sekund)",
    generating: "Vytváření SVG",
    preview: "NÁHLED SVG",
    downloadSvg: "Stáhnout SVG",
    empty: "Není nic děsivějšího než prázdná stránka.",
    example: "Vložit příklad",
    palette: "BAREVNÁ PALETA (VOLITELNÉ)",
    addPalette: "Přidat vzorník Adobe (.ase)",
    clearPalette: "Odstranit paletu",
    paletteFileError:
      "Vyberte soubor Adobe Swatch Exchange (.ase) o velikosti nejvýše 2 MB.",
    paletteReadError: "Paletu ASE se nepodařilo načíst.",
    valueLabels: "Zobrazit hodnoty sloupců",
    valueLabelsHelp:
      "Krátké sloupcové grafy standardně zobrazují přesné hodnoty.",
  },
} as const;
