"use client";

import { ChangeEvent, DragEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { czechNamedays } from "./czechNamedays";
import manualCzechContent from "../public/design-manual/content-cs.json";
import manualEnglishContent from "../public/design-manual/content-en.json";
import { createEan13Pdf, eanModules, normalizeIsbn } from "./lib/ean13";
import { parseAse, type AseSwatch } from "./lib/ase";
import { createCoverArtboardPdf } from "./lib/cover-artboard";

type Language = "en" | "cs";
type Theme = "light" | "dark";
type IllustrationPrompt = { page: number; complexity: "simple" | "complex"; prompt: string };
type FigureCheck = { level: "pass" | "warning"; message: string };
type FigureOutput = { svg: string; report: string; checks: FigureCheck[]; model: string; spec: { title: string; date?: string; sources?: Array<{ id: string; title: string; url: string }> } };
type ManualSourceBlock = { type: string; text?: string; images?: string[]; style?: string; rows?: string[][] };
type ManualChapterView = { title: string; blocks?: ManualSourceBlock[]; sections?: ReadonlyArray<readonly [string, string]> };
type CoverReference = { name: string; data: string; artData: string };
type CoverUsage = { cost: number | null; promptTokens: number | null; completionTokens: number | null; totalTokens: number | null };
type CoverStock = { id: string; description: string; sourceUrl: string };
type CoverGeneration = { id: string; data: string; seed: number; status: "active" | "selected" | "rejected" | "layer"; name?: string; createdAt: string; model: string; generationId?: string; usage: CoverUsage; stock?: CoverStock };
type CoverAnalysis = { assets: Array<{ name: string; description: string }>; model: string; generationId?: string; usage: CoverUsage };

const copy = {
  en: {
    prompt: "Let’s go!",
    text: "Text",
    image: "Image",
    design: "Design",
    apps: {
      extraction: "Text Extractor",
      index: "Index Creator",
      typesetter: "Typesetter",
      prompt: "Prompt Extractor",
      image: "Image Generator",
      cover: "Cover Generator",
      graph: "Graph Generator",
      bio: "Diagram Generator",
      map: "Map Generator",
      grep: "GREP Builder",
      solutions: "Solutions Importer",
      barcode: "Barcode Generator",
      manual: "Design Manual",
      brand: "Brand Manual",
    },
    ready: "Ready to start",
    upload: "Drag image/PDF, paste, or click here to select file",
    another: "Another one",
    extractedText: "Extracted text",
    source: "Source",
    copyText: "Copy text",
    copied: "Copied",
    correctionPlaceholder: "Describe how the extracted text should be corrected…",
    correct: "Correct text",
    indexUpload: "Drag PDF, or click here to select file",
    wordList: "One index word or phrase per line",
    createIndex: "Create index",
    indexOutput: "Index output",
    indexLegend: "Term [Tab] Best match [Tab] All other matches",
    grepFind: "Find what",
    grepReplace: "Change to",
    generateGrep: "Generate GREP code",
    tryAgain: "Try again",
    pdfPage: "PDF page",
    printedPage: "Printed page",
    pageMapping: "Page-number anchor",
    localExtraction: "The PDF text stays in this browser",
    promptUpload: "Drag a manuscript PDF (up to 20 pages), or select",
    extractedPrompts: "Extracted prompts",
    noIllustrations: "No meaningful illustrations found.",
    comingSoon: "It’s nice to have something to look forward to.",
    processing: ["pouring a coffee", "sharpening pencils", "looking out of the window", "reading the small print", "straightening the paper", "finding the first line", "squinting at punctuation", "counting paragraphs", "checking the margins", "recognising letters", "putting words back in order"],
    indexProcessing: ["communicating", "calculating", "slicing bread", "spreading butter", "packing lunch", "looking up the way to the library", "waiting for the tram", "looking for a place to sit", "2+2=???", "hm…", "looking for a bench in the park", "consuming sandwich", "staring into space", "looking at trees"],
    promptProcessing: ["polishing the magnifier", "playing with the pen", "turning a page", "looking out of the window", "turning on the lamp", "hunching over the computer", "thinking about stuff", "procrastinating", "checking the horoscope", "taking a deep sigh", "thinking about things", "pouring a coffee", "doing some push-ups"],
    figureProcessing: ["unfolding a very large map", "looking for the tiny countries", "asking history what year it is", "checking whether the borders moved again", "putting the islands back", "consulting a suspiciously thick atlas", "straightening the coastlines", "negotiating with the label positions", "moving the legend out of the sea", "counting countries twice", "giving the SVG a final polish", "folding the map correctly on the first try"],
    diagramProcessing: ["checking the specimen labels", "peering through the microscope", "arranging the organelles", "untangling the leader lines", "counting the vacuoles", "centering the specimen", "sharpening the diagram pencils", "comparing the reference images", "checking what belongs where", "simplifying the anatomy", "making room for the labels", "giving the SVG a final polish"],
    graphProcessing: ["checking every supplied number", "reading the source line twice", "choosing sensible axes", "measuring the longest label", "counting the data points", "lining up the tick marks", "looking for a missing unit", "balancing the chart margins", "drawing the bars with a ruler", "joining the points", "checking the legend", "giving the SVG a final polish"],
    about: "About Taktik Robot",
    aboutBody:
      "A focused workspace for preparing textbook content, layouts and visual materials.",
    close: "Close information",
    home: "Taktik Robot home", changeLanguage: "Change language", toggleTheme: "Toggle color theme", openInformation: "Open information", tools: "Tools",
    pdfImageOnly: "Please use a PDF, PNG or JPG file.", pdfOnly: "Please use a PDF file.", fileTooLarge20: "The file is larger than the 20 MB limit.", fileTooLarge30: "The file is larger than the 30 MB limit.",
  },
  cs: {
    prompt: "Jdeme na to!",
    text: "Text",
    image: "Obraz",
    design: "Design",
    apps: {
      extraction: "Extraktor textu",
      index: "Tvůrce rejstříku",
      typesetter: "Sazeč",
      prompt: "Extraktor promptů",
      image: "Generátor obrázků",
      cover: "Generátor obálek",
      graph: "Generátor grafů",
      bio: "Generátor diagramů",
      map: "Generátor map",
      grep: "Tvůrce GREP výrazů",
      solutions: "Importér řešení",
      barcode: "Generátor čárových kódů",
      manual: "Grafický manuál",
      brand: "Brand manuál",
    },
    ready: "Připraveno",
    upload: "Přetáhněte obrázek/PDF, vložte, nebo klikněte pro výběr",
    another: "Další",
    extractedText: "Extrahovaný text",
    source: "Zdroj",
    copyText: "Kopírovat text",
    copied: "Zkopírováno",
    correctionPlaceholder: "Popište, jak má být extrahovaný text opraven…",
    correct: "Opravit text",
    indexUpload: "Přetáhněte PDF nebo klikněte pro výběr",
    wordList: "Jedno slovo nebo slovní spojení na řádek",
    createIndex: "Vytvořit rejstřík",
    indexOutput: "Výstup rejstříku",
    indexLegend: "Heslo [Tab] Nejlepší shoda [Tab] Všechny ostatní shody",
    grepFind: "Najít",
    grepReplace: "Změnit na",
    generateGrep: "Vygenerovat GREP kód",
    tryAgain: "Zkusit znovu",
    pdfPage: "Strana PDF",
    printedPage: "Tištěná strana",
    pageMapping: "Kotva číslování stran",
    localExtraction: "Text PDF zůstává v tomto prohlížeči",
    promptUpload: "Přetáhněte rukopis v PDF (max. 20 stran), nebo vyberte",
    extractedPrompts: "Extrahované prompty",
    noIllustrations: "Nebyly nalezeny žádné smysluplné ilustrace.",
    comingSoon: "Je to fajn mít se na co těšit.",
    processing: ["nalévání kávy", "ořezávání tužek", "koukání z okna", "čtení drobného písma", "rovnání papíru", "hledání prvního řádku", "mhouření očí nad interpunkcí", "počítání odstavců", "kontrola okrajů", "rozpoznávání písmen", "skládání slov do správného pořadí"],
    indexProcessing: ["komunikace", "kalkulace", "krájení chleba", "mazání chleba máslem", "balení svačiny", "vyhledávání cesty do knihovny", "čekání na tramvaj", "hledání místa k sezení", "2+2=???", "hm…", "hledání lavičky v parku", "konzumace svačiny", "koukání do blba", "koukání na stromy"],
    promptProcessing: ["leštění lupy", "hraní si s propiskou", "otáčení stránky", "koukání z okna", "rozsvěcení lampy", "hrbení se nad počítačem", "přemýšlení o všem možném", "prokrastinování", "kontrolování horoskopu", "hluboké povzdechnutí", "přemýšlení nad věcmi", "nalévání kávy", "dělání kliků"],
    figureProcessing: ["rozkládání opravdu velké mapy", "hledání těch nejmenších států", "dotazování historie, jaký je právě rok", "kontrola, zda se hranice zase neposunuly", "vracení ostrovů na jejich místa", "listování podezřele tlustým atlasem", "narovnávání pobřeží", "vyjednávání s pozicemi popisků", "stěhování legendy z moře", "dvojí počítání států", "závěrečné leštění SVG", "skládání mapy správně hned napoprvé"],
    diagramProcessing: ["kontrola popisků preparátu", "nahlížení do mikroskopu", "rovnání organel", "rozmotávání odkazových čar", "počítání vakuol", "centrování preparátu", "ořezávání tužek na schéma", "porovnávání referenčních obrázků", "kontrola, co kam patří", "zjednodušování anatomie", "uvolňování místa pro popisky", "závěrečné leštění SVG"],
    graphProcessing: ["kontrola každého zadaného čísla", "dvojí čtení zdroje", "volba rozumných os", "měření nejdelšího popisku", "počítání datových bodů", "rovnání značek na ose", "hledání chybějící jednotky", "vyvažování okrajů grafu", "rýsování sloupců", "spojování bodů", "kontrola legendy", "závěrečné leštění SVG"],
    about: "O aplikaci Taktik Robot",
    aboutBody:
      "Soustředěné pracovní prostředí pro přípravu učebnic, sazby a obrazových materiálů.",
    close: "Zavřít informace",
    home: "Domovská stránka Taktik Robot", changeLanguage: "Změnit jazyk", toggleTheme: "Přepnout barevný motiv", openInformation: "Otevřít informace", tools: "Nástroje",
    pdfImageOnly: "Použijte soubor PDF, PNG nebo JPG.", pdfOnly: "Použijte soubor PDF.", fileTooLarge20: "Soubor překračuje limit 20 MB.", fileTooLarge30: "Soubor překračuje limit 30 MB.",
  },
} as const;

const coverUi = {
  en: {
    code: "IMAGE / COVER CONCEPTS", heading: "Cover Generator", active: "active sketches", selected: "direction selected", download: "DOWNLOAD ZIP ↓", exportArtboard: "EXPORT ARTBOARD ↓", artboardError: "No generated covers are visible in the viewport.", sketch: "SKETCH", choose: "↑ UPVOTED", upvote: "↑ UPVOTE", reject: "Delete cover", empty: "Add at least two existing covers, write a brief, and generate the first directions.", generating: "GENERATING", assets: "2K COVER MASTER & SEPARATE ASSETS", assetsNote: "AI-recreated from the selected composition with FLUX.2 Pro", artDirection: "ART DIRECTION", references: "REFERENCE COVERS", minimum: "2–3 covers", addCover: "ADD\nCOVER", remove: "Remove", brief: "WHAT SHOULD BE GENERATED?", placeholder: "Example: A lower-secondary science textbook cover about ecosystems. An intelligent, tactile illustration of a wetland food web; leave a calm clear area in the upper third for typography. Preserve the palette and visual rhythm of the reference covers.", generateTwo: "GENERATE 2", generateFour: "GENERATE 4", generateSelectedTwo: "GENERATE 2 FROM UPVOTE", generateSelectedFour: "GENERATE 4 FROM UPVOTE", generatingCount: "GENERATING", note: "If you like one of the generated covers and want to move in that direction, you can ‘Upvote it’ so that it’s used as an additional reference in the next batch. You can also delete the ones you don’t like.", manifest: "UPSCALE & SEPARATE ASSETS", manifestNote: "Select a concept above, then Robot automatically detects its essential objects, recreates a 2K cover master, and produces isolated 2K stems. This is AI recreation, not pixel-perfect layer extraction.", addObject: "+ ADD SEPARATE ASSET", newObject: "Describe another asset", generateAssets: "CREATE 2K MASTER & AUTOMATIC STEMS", generatingAssets: "CREATING 2K MASTER & STEMS…", asset: "Asset", close: "Close", zoom: "Zoom sketch", stock: "SHUTTERSTOCK RESEARCH", stockHelp: "Add one search phrase or direct Shutterstock URL per row. Empty rows fall back to the main brief.", stockInput: "Search phrase or direct Shutterstock URL", addStockInput: "+ ADD RESEARCH IMAGE", stockWarning: "Shutterstock previews are watermarked and unlicensed. License every used asset before publication; source links are included in the ZIP report.", limit: "Keep no more than 16 active sketches. Delete a few before generating more.", sketchError: "OpenRouter returned no cover sketches.", generationError: "Cover generation failed.", assetError: "OpenRouter returned no production assets.", productionError: "Production asset generation failed.", detectionError: "Automatic object detection failed.", masterError: "The 2K cover master failed.", referenceError: "A reference cover could not be prepared.", reportTitle: "Cover generation report", medium: "STYLE", mediumMatch: "Match references", mediumPhoto: "Photorealistic composite", mediumIllustration: "Illustration", medium3d: "3D render", sketchQuality: "GENERATION QUALITY", qualityFast: "Low quality, faster · flux.2-klein-4b · 512 px", qualityFidelity: "High quality, slower · flux.2-pro · 1K", fidelityNote: "High quality costs more, but follows photographic references and complex composites more reliably. The 2K master and stems use flux.2-pro.", artOnly: "IGNORE TEXT IN REFERENCE IMAGES", artOnlyHelp: "Ignore book titles, grade labels, publisher logos and other text in the reference images. This may help generate cleaner cover art.",
  },
  cs: {
    code: "OBRAZ / NÁVRHY OBÁLEK", heading: "Generátor obálek", active: "aktivních návrhů", selected: "směr vybrán", download: "STÁHNOUT ZIP ↓", exportArtboard: "EXPORTOVAT PLOCHU ↓", artboardError: "V aktuálním výřezu nejsou viditelné žádné vygenerované obálky.", sketch: "NÁVRH", choose: "↑ HLAS PŘIDÁN", upvote: "↑ HLASOVAT PRO", reject: "Smazat obálku", empty: "Přidejte alespoň dvě existující obálky, napište zadání a vygenerujte první směry.", generating: "GENERUJI", assets: "2K HLAVNÍ OBÁLKA A SAMOSTATNÉ PODKLADY", assetsNote: "Nově vytvořeno z vybrané kompozice modelem FLUX.2 Pro", artDirection: "VÝTVARNÝ SMĚR", references: "REFERENČNÍ OBÁLKY", minimum: "2–3 obálky", addCover: "PŘIDAT\nOBÁLKU", remove: "Odstranit", brief: "CO SE MÁ VYGENEROVAT?", placeholder: "Příklad: Obálka učebnice přírodopisu pro 2. stupeň o ekosystémech. Inteligentní, haptická ilustrace potravní sítě mokřadu; v horní třetině ponechte klidné místo pro typografii. Zachovejte barevnost a vizuální rytmus referenčních obálek.", generateTwo: "VYGENEROVAT 2", generateFour: "VYGENEROVAT 4", generateSelectedTwo: "VYGENEROVAT 2 PODLE HLASU", generateSelectedFour: "VYGENEROVAT 4 PODLE HLASU", generatingCount: "GENERUJI", note: "Pokud se vám některá vygenerovaná obálka líbí a chcete pokračovat tímto směrem, můžete pro ni hlasovat; v další sadě se použije jako dodatečná reference. Obálky, které se vám nelíbí, můžete také smazat.", manifest: "ZVĚTŠIT A VYTVOŘIT SAMOSTATNÉ PODKLADY", manifestNote: "Vyberte koncept nahoře. Robot automaticky rozpozná hlavní objekty, vytvoří hlavní obálku ve 2K a izolované 2K podklady. Jde o novou tvorbu AI, nikoli přesné vytažení vrstev z pixelů.", addObject: "+ PŘIDAT SAMOSTATNÝ PODKLAD", newObject: "Popište další podklad", generateAssets: "VYTVOŘIT 2K OBÁLKU A AUTOMATICKÉ PODKLADY", generatingAssets: "VYTVÁŘÍM 2K OBÁLKU A PODKLADY…", asset: "Podklad", close: "Zavřít", zoom: "Zvětšit návrh", stock: "REŠERŠE SHUTTERSTOCK", stockHelp: "Přidejte do každého řádku jeden vyhledávací dotaz nebo přímý odkaz Shutterstock. Prázdné řádky použijí hlavní zadání.", stockInput: "Vyhledávací dotaz nebo přímý odkaz Shutterstock", addStockInput: "+ PŘIDAT OBRÁZEK PRO REŠERŠI", stockWarning: "Náhledy Shutterstock jsou opatřené vodoznakem a bez licence. Každý použitý podklad před publikací licencujte; odkazy budou v reportu uvnitř ZIP.", limit: "Ponechte nejvýše 16 aktivních návrhů. Před dalším generováním některé smažte.", sketchError: "OpenRouter nevrátil žádné návrhy obálky.", generationError: "Generování obálky selhalo.", assetError: "OpenRouter nevrátil žádné produkční podklady.", productionError: "Generování produkčních podkladů selhalo.", detectionError: "Automatické rozpoznání objektů selhalo.", masterError: "Vytvoření hlavní obálky ve 2K selhalo.", referenceError: "Referenční obálku se nepodařilo připravit.", reportTitle: "Report generování obálky", medium: "STYL", mediumMatch: "Podle referencí", mediumPhoto: "Fotorealistická koláž", mediumIllustration: "Ilustrace", medium3d: "3D render", sketchQuality: "KVALITA GENEROVÁNÍ", qualityFast: "Nižší kvalita, rychlejší · flux.2-klein-4b · 512 px", qualityFidelity: "Vyšší kvalita, pomalejší · flux.2-pro · 1K", fidelityNote: "Vyšší kvalita stojí více, ale spolehlivěji následuje fotografické reference a složité koláže. Hlavní obálka a podklady ve 2K používají flux.2-pro.", artOnly: "IGNOROVAT TEXT V REFERENČNÍCH OBRÁZCÍCH", artOnlyHelp: "Ignorovat názvy knih, označení ročníků, loga nakladatele a další text v referenčních obrázcích. To může pomoci vytvořit čistší obrazovou část obálky.",
  },
} as const;

const localizedCoverUi = {
  en: { ...coverUi.en, exportArtboard: "EXPORT ARTBOARD PDF ↓" },
  cs: { ...coverUi.cs, exportArtboard: "EXPORTOVAT PLOCHU DO PDF ↓" },
} as const;

const robotStatusPhrases = {
  en: ["CONNECTED TO THE MATRIX", "ČAPEK IS ONLINE", "ROSSUM'S SERVER IS RUNNING", "THE ROBOTS REPORT READY", "DOMIN'S TERMINAL RESPONDS"],
  cs: ["PŘIPOJENO K MATRIXU", "ČAPEK JE ONLINE", "ROSSUMŮV SERVER BĚŽÍ", "ROBOTI HLÁSÍ PŘIPRAVENO", "DOMINŮV TERMINÁL ODPOVÍDÁ"],
} as const;

const groups = [
  { key: "text" as const, items: ["extraction", "index"] as const },
  { key: "image" as const, items: ["map", "bio", "graph", "image", "cover"] as const },
  {
    key: "design" as const,
    items: ["grep", "solutions", "barcode", "prompt", "typesetter"] as const,
  },
];

const completedApps = new Set(["extraction", "index", "grep", "prompt", "solutions", "barcode", "graph", "bio", "map", "cover"]);
const figureUi = {
  en: {
    heading: "Figure Generator", subtitle: "Create source-backed SVG charts, diagrams, and factual maps. Specifications are validated and coordinates are rendered by code.", badge: "VERIFIED PIPELINE",
    label: "FACTS, VALUES AND SOURCES", placeholder: "Example: Make a line chart titled …\n2022: 18.4\n2023: 21.1\n2024: 23.7\nUnit: percent\nSource: Statistical office, https://…",
    generate: "Generate SVG (about 30 seconds)", generating: "Generating SVG", preview: "SVG PREVIEW", checks: "AUTOMATED CHECKS", downloadSvg: "Download SVG", downloadReport: "Download verification report (.md)", empty: "Nothing scarier than an empty page.", warning: "Charts validate supplied data. Diagrams and schematic maps require editorial review; maps research and cite web sources for every region.", example: "Insert example", chart: "Data graph", diagram: "Biological diagram", map: "Factual map", references: "REFERENCE IMAGES (OPTIONAL, MAX. 3)", addReference: "Add reference image", remove: "Remove", palette: "COLOR PALETTE (OPTIONAL)", addPalette: "Add Adobe swatches (.ase)", clearPalette: "Remove palette", timeline: "HISTORICAL BOUNDARY TIMELINE", timelineLoading: "Loading dated boundaries…",
    negativeBce: "NEGATIVE = BCE", previousYear: "Previous year", nextYear: "Next year", mapYear: "Map year; use negative numbers for BCE", historicalTimeline: "Historical timeline", bce: "BCE", ce: "CE", layers: "LAYERS", mapLayers: { boundaries: "borders", labels: "country names", water: "seas and oceans", rivers: "rivers", climate: "climate zones", terrain: "terrain regions", mountains: "mountain ranges", cities: "cities and capitals", disputed: "disputed boundaries" }, climateNote: "Köppen–Geiger zones represent 1980–2016 climate normals, independently of the selected political year.", climateLabels: ["Tropical", "Arid", "Temperate", "Cold", "Polar"], presentLayersNote: "These Natural Earth layers describe present-day geography and boundaries, independently of the selected historical year.", fillCountries: "FILL COUNTRIES", on: "ON", zoomIn: "Zoom +", zoomOut: "Zoom −", resetView: "Reset view", mapInstructions: "Drag to pan. Activate Fill countries before clicking territories. Changes are preserved in the downloaded SVG.", adobePalette: "ADOBE PALETTE", replacePalette: "Replace .ase", applyPalette: "Apply", shufflePalette: "Shuffle", importPalette: "Import .ase palette", editMap: "EDIT MAP WITH A PROMPT", mapPrompt: "For example: Fill NATO members blue and label the Baltic Sea.", warnings: "WARNINGS", paletteFileError: "Choose an Adobe Swatch Exchange (.ase) file up to 2 MB.", paletteReadError: "Could not read the ASE palette.",
  },
  cs: {
    heading: "Generátor ilustrací", subtitle: "Vytváří zdrojované SVG grafy, schémata a faktické mapy. Specifikace ověří a souřadnice vykreslí kód.", badge: "OVĚŘOVANÝ POSTUP",
    label: "FAKTA, HODNOTY A ZDROJE", placeholder: "Příklad: Vytvoř spojnicový graf s názvem …\n2022: 18,4\n2023: 21,1\n2024: 23,7\nJednotka: procenta\nZdroj: Statistický úřad, https://…",
    generate: "Vytvořit SVG (asi 30 sekund)", generating: "Vytváření SVG", preview: "NÁHLED SVG", checks: "AUTOMATICKÉ KONTROLY", downloadSvg: "Stáhnout SVG", downloadReport: "Stáhnout protokol kontroly (.md)", empty: "Není nic děsivějšího než prázdná stránka.", warning: "Grafy ověřují dodaná data. Schémata i schematické mapy vyžadují redakční kontrolu; mapy vyhledávají a citují webové zdroje pro každou oblast.", example: "Vložit příklad", chart: "Datový graf", diagram: "Biologické schéma", map: "Faktická mapa", references: "REFERENČNÍ OBRÁZKY (VOLITELNÉ, MAX. 3)", addReference: "Přidat referenční obrázek", remove: "Odstranit", palette: "BAREVNÁ PALETA (VOLITELNÉ)", addPalette: "Přidat vzorník Adobe (.ase)", clearPalette: "Odstranit paletu", timeline: "ČASOVÁ OSA HISTORICKÝCH HRANIC", timelineLoading: "Načítám dobové hranice…",
    negativeBce: "ZÁPORNÉ ČÍSLO = PŘ. N. L.", previousYear: "Předchozí rok", nextYear: "Následující rok", mapYear: "Rok mapy; pro období př. n. l. použijte záporné číslo", historicalTimeline: "Historická časová osa", bce: "PŘ. N. L.", ce: "N. L.", layers: "VRSTVY", mapLayers: { boundaries: "hranice", labels: "názvy států", water: "moře a oceány", rivers: "řeky", climate: "klimatická pásma", terrain: "oblasti reliéfu", mountains: "pohoří", cities: "města a hlavní města", disputed: "sporné hranice" }, climateNote: "Pásma Köppenovy–Geigerovy klasifikace představují klimatické normály z let 1980–2016 bez ohledu na zvolený politický rok.", climateLabels: ["Tropické", "Suché", "Mírné", "Chladné", "Polární"], presentLayersNote: "Tyto vrstvy Natural Earth popisují současnou geografii a hranice bez ohledu na zvolený historický rok.", fillCountries: "VYBARVIT STÁTY", on: "ZAPNUTO", zoomIn: "Přiblížit +", zoomOut: "Oddálit −", resetView: "Obnovit pohled", mapInstructions: "Tažením mapu posunete. Před kliknutím na území zapněte Vybarvit státy. Změny se zachovají ve staženém SVG.", adobePalette: "PALETA ADOBE", replacePalette: "Nahradit .ase", applyPalette: "Použít", shufflePalette: "Promíchat", importPalette: "Importovat paletu .ase", editMap: "UPRAVIT MAPU PROMPTEM", mapPrompt: "Například: Vybarvi členy NATO modře a popiš Baltské moře.", warnings: "UPOZORNĚNÍ", paletteFileError: "Vyberte soubor Adobe Swatch Exchange (.ase) o velikosti nejvýše 2 MB.", paletteReadError: "Paletu ASE se nepodařilo načíst.",
  },
} as const;
const solutionsUi = {
  en: {
    heading: "Solutions Importer", subtitle: "Choose the clean preview and its matching solutions PDF. Robot compares them locally and downloads the JSON file for InDesign.", local: "PROCESSED LOCALLY",
    clean: "CLEAN PREVIEW PDF", answers: "SOLUTIONS PDF", choose: "Drop PDF here or choose file", compare: "Create and download JSON", again: "Create and download again", comparing: "Comparing PDFs…", log: "LOCAL PROCESS LOG", success: "JSON downloaded. Keep it with the matching InDesign chapter.", privacy: "Python and pdfplumber run inside this browser. The PDFs stay on this computer and are never uploaded.",
    download: "DOWNLOAD FOR INDESIGN", importer: "InDesign importer", need: "YOU WILL NEED", needs: ["The blank preview PDF", "The matching solutions PDF", "The matching InDesign chapter", "The downloaded InDesign importer"], warningTitle: "Work on a copy first.", warning: "Both PDFs must contain the same pages, in the same order, with the same layout.",
    steps: [
      ["Prepare matching PDFs", "Export or split both PDFs so they contain only the pages in one InDesign chapter. The first is the clean preview; the second is the same unchanged document with typed answers. Their page counts must match the INDD file."],
      ["Create the JSON", "Choose both PDFs at the top of this page, then click Create and download JSON. The comparison happens on this computer. Keep the downloaded JSON with its InDesign chapter."],
      ["Install the InDesign script", "Download import_solution_text.jsx. In InDesign, choose Window → Utilities → Scripts. Right-click User, choose Reveal in Finder or Reveal in Explorer, open Scripts Panel, and copy the JSX file there. You only need to install it once."],
      ["Import and check", "Open the matching InDesign chapter. Make sure it contains a paragraph style named exactly Solutions. Double-click import_solution_text.jsx in the Scripts panel and choose your new JSON file."],
    ],
    checks: ["Check the new SOLUTIONS layer page by page.", "Correct any small position differences before saving.", "If something is wrong, one Undo removes the complete import.", "Before running again, delete the existing SOLUTIONS layer to avoid duplicates."],
    trouble: "If it does not work", troubles: [["Page-count mismatch", "Split both PDFs again so they match the exact pages in the InDesign chapter."], ["Page-size mismatch", "Make sure both PDFs were exported from the same unchanged layout and use identical page dimensions."], ["Missing “Solutions” style", "Create or copy a paragraph style named exactly Solutions, including the capital S."], ["Some answers are missing", "The extractor reads typed PDF text only. Handwriting, outlined letters, images, and drawing annotations cannot be imported."]],
    pdfError: "Please choose a PDF file.", failed: "Could not compare the PDFs.", starting: "Starting local browser comparison. No files will be uploaded.", cleanLog: "Clean preview", answersLog: "Solutions PDF", worker: "Starting isolated Python worker…", jsonReady: "Python JSON ready", downloading: "Starting download…", downloaded: "Downloaded successfully.", error: "ERROR",
  },
  cs: {
    heading: "Importér řešení", subtitle: "Vyberte čisté náhledové PDF a odpovídající PDF s řešeními. Robot je porovná místně a stáhne soubor JSON pro InDesign.", local: "ZPRACOVÁNO MÍSTNĚ",
    clean: "ČISTÉ NÁHLEDOVÉ PDF", answers: "PDF S ŘEŠENÍMI", choose: "Přetáhněte PDF nebo vyberte soubor", compare: "Vytvořit a stáhnout JSON", again: "Vytvořit a stáhnout znovu", comparing: "Porovnávání PDF…", log: "MÍSTNÍ PROTOKOL ZPRACOVÁNÍ", success: "JSON byl stažen. Uložte jej k odpovídající kapitole InDesignu.", privacy: "Python a pdfplumber běží v tomto prohlížeči. PDF zůstávají v tomto počítači a nikam se nenahrávají.",
    download: "STÁHNOUT PRO INDESIGN", importer: "Importér pro InDesign", need: "BUDETE POTŘEBOVAT", needs: ["Čisté náhledové PDF", "Odpovídající PDF s řešeními", "Odpovídající kapitolu InDesignu", "Stažený importér pro InDesign"], warningTitle: "Nejprve pracujte na kopii.", warning: "Obě PDF musí obsahovat stejné strany ve stejném pořadí a se stejným layoutem.",
    steps: [
      ["Připravte odpovídající PDF", "Exportujte nebo rozdělte obě PDF tak, aby obsahovala pouze strany jedné kapitoly InDesignu. První soubor je čistý náhled, druhý je stejný nezměněný dokument s vepsanými řešeními. Počet stran musí odpovídat souboru INDD."],
      ["Vytvořte JSON", "Nahoře na této stránce vyberte obě PDF a klikněte na Vytvořit a stáhnout JSON. Porovnání proběhne v tomto počítači. Stažený JSON uložte k příslušné kapitole InDesignu."],
      ["Nainstalujte skript InDesignu", "Stáhněte import_solution_text.jsx. V InDesignu zvolte Okna → Pomůcky → Skripty. Klikněte pravým tlačítkem na User, zvolte Reveal in Finder nebo Reveal in Explorer, otevřete složku Scripts Panel a zkopírujte do ní soubor JSX. Instalaci stačí provést jednou."],
      ["Importujte a zkontrolujte", "Otevřete odpovídající kapitolu InDesignu. Ověřte, že obsahuje odstavcový styl s přesným názvem Solutions. V panelu Skripty dvakrát klikněte na import_solution_text.jsx a vyberte nový soubor JSON."],
    ],
    checks: ["Zkontrolujte novou vrstvu SOLUTIONS stranu po straně.", "Před uložením opravte případné drobné odchylky polohy.", "Pokud něco není v pořádku, jeden krok Zpět odstraní celý import.", "Před opakovaným spuštěním odstraňte stávající vrstvu SOLUTIONS, aby nevznikly duplicity."],
    trouble: "Když něco nefunguje", troubles: [["Nesouhlasí počet stran", "Znovu rozdělte obě PDF tak, aby přesně odpovídala stranám kapitoly InDesignu."], ["Nesouhlasí velikost stran", "Ověřte, že obě PDF byla exportována ze stejného nezměněného layoutu a mají shodné rozměry stran."], ["Chybí styl „Solutions“", "Vytvořte nebo zkopírujte odstavcový styl s přesným názvem Solutions, včetně velkého S."], ["Některá řešení chybí", "Extraktor čte pouze živý text PDF. Rukopis, text převedený do křivek, obrázky a kreslené anotace nelze importovat."]],
    pdfError: "Vyberte soubor PDF.", failed: "PDF se nepodařilo porovnat.", starting: "Spouštím místní porovnání v prohlížeči. Žádné soubory se nebudou nahrávat.", cleanLog: "Čistý náhled", answersLog: "PDF s řešeními", worker: "Spouštím izolovaný proces Pythonu…", jsonReady: "Python JSON je připraven", downloading: "Spouštím stahování…", downloaded: "Soubor byl úspěšně stažen.", error: "CHYBA",
  },
} as const;
const barcodeUi = {
  en: {
    heading: "Barcode Generator", subtitle: "Enter an ISBN with or without hyphens. Download a press-ready vector EAN-13 PDF.", local: "CREATED LOCALLY",
    label: "ISBN-10 OR ISBN-13", placeholder: "978-80-7563-123-4", generate: "Download vector PDF", ready: "READY FOR PRODUCTION", empty: "Enter an ISBN to preview the barcode.",
    valid: "CHECKSUM VALID", converted: "ISBN-10 CONVERTED", format: "EAN-13", size: "37.29 × 25.93 MM", colour: "CMYK 0 / 0 / 0 / 100", type: "VERDANA · OUTLINED", privacy: "Everything is generated in this browser. No ISBN is uploaded.",
  },
  cs: {
    heading: "Generátor čárových kódů", subtitle: "Zadejte ISBN s pomlčkami nebo bez nich. Stáhněte tiskové vektorové PDF EAN-13.", local: "VYTVOŘENO MÍSTNĚ",
    label: "ISBN-10 NEBO ISBN-13", placeholder: "978-80-7563-123-4", generate: "Stáhnout vektorové PDF", ready: "PŘIPRAVENO PRO TISK", empty: "Zadejte ISBN pro náhled čárového kódu.",
    valid: "KONTROLNÍ ČÍSLICE PLATÍ", converted: "ISBN-10 PŘEVEDENO", format: "EAN-13", size: "37,29 × 25,93 MM", colour: "CMYK 0 / 0 / 0 / 100", type: "VERDANA · V KŘIVKÁCH", privacy: "Vše se generuje v tomto prohlížeči. ISBN se nikam neodesílá.",
  },
} as const;
const brandGuidelinesUrl = "https://drive.google.com/open?id=1RGk5Wju28DMBMia1gd9ONdjYH0mQmiTC&usp=drive_fs";
const manualEnglishPages = [
  {
    title: "Introduction & typesetting",
    sections: [
      ["Typography and typesetting", "Typesetting turns an editor’s structured Word manuscript into a professional print file. We use the latest available Adobe InDesign. The manuscript should clearly contain every publication element; the designer’s priority is faithful, visually strong production."],
      ["Performance and planning", "A designer normally completes 6–8 pages in an eight-hour day, depending on layout complexity. Allow roughly 1–1.5 hours per page and include corrections when estimating. Time is divided when several projects run in parallel."],
      ["Storage and fonts", "Google Drive is for working documents and sharing; Dropbox is only for final source packages and print PDFs. When moving InDesign files between Windows and macOS, replace unrecognised fonts with the current system’s versions and compare the result with the exported PDF."],
      ["Layout recommendations", "Keep alignment, colours, fonts, numbering and headings consistent throughout. Continue the visual language of earlier titles in an existing series. Use justified text unless instructed otherwise, reuse a restrained colour palette, and derive colours from printed publications to avoid washed-out or oversaturated results."],
      ["Type area", "Keep content comfortably away from page edges, using golden-ratio principles and allowing for the binding. Perfect binding (V2) can lose about 6–7 mm at the spine. Header text should remain at least 5 mm inside the trim."],
    ],
  },
  {
    title: "Layout, codes & artwork",
    sections: [
      ["Bleed", "Use 5 mm bleed as standard; 3 mm is the absolute minimum when necessary."],
      ["Page make-up", "Begin with a publication dummy showing page and chapter structure. Define paragraph and character styles, master pages, headers, footers, automatic pagination and a colour swatch set. Name everything clearly. Split larger publications into an InDesign Book so parts can be exported, packaged and corrected independently. Always design for the publication’s real use—workbooks need enough space to write, ideally tested on paper."],
      ["Barcodes", "Generate vector artwork (SVG, EPS or AI). Convert it to outlines and use pure CMYK black: C0 M0 Y0 K100. Publications use ISBN in EAN-13 form—the same digits without hyphens."],
      ["QR codes", "Prefer InDesign’s Object → Generate QR Code command. Keep the result as outlined CMYK artwork in pure black. Colour variants can suit larger formats for younger children. Recommended minimum size: 12 mm."],
      ["Images and illustrations", "Primary sources are Shutterstock, Wikimedia and commissioned illustrators. AI-generated imagery may be used when the editor agrees. Always verify licensing for other sources."],
      ["Answer layer", "Interactive workbooks need a separate top layer for answers that can be switched on and off. It is normally excluded from print. Set answers in a handwriting-style font, preferably dark blue, and confirm the desired format with the editor. Every exercise needs an answer; report omissions."],
    ],
  },
  {
    title: "Exporting & packaging",
    sections: [
      ["Package InDesign documents", "Package the complete document with fonts, links and IDML. IDML supports older InDesign versions and other platforms. Adobe Creative Cloud fonts may need reactivation. Check colour spaces, resolution and that all links are present. Convert Photoshop duotones to CMYK. Include the completed print PDF."],
      ["Colour", "A manual CMYK conversion of every image is not always required: PDF/X-1a converts through the selected output profile, such as FOGRA39. Check hidden layers before export. Images should be at least 240 dpi, ideally 300 dpi, and normally should not be enlarged beyond 120%. Always inspect the exported PDF visually."],
      ["Preflight", "Use a custom InDesign Preflight profile. Check missing or modified links, spot colours, registration black, image resolution (270 dpi target), missing fonts, overset text, minimum type size and bleed settings."],
    ],
  },
  {
    title: "Print PDF settings",
    sections: [
      ["PDF export", "Set bleed and crop marks. Most printers do not need registration or bleed marks, so retain crop marks only unless told otherwise. Use PDF/X-1a with Acrobat 8/9 compatibility, high resolution and FOGRA39 output. Export single pages, not spreads."],
      ["Acrobat check", "Before uploading to Dropbox, visually inspect the PDF in Adobe Acrobat. Check bleed, crop marks, colour separations and image sharpness. When possible, also review the printer’s rendered CTP pages."],
    ],
  },
  {
    title: "Accessible PDFs",
    sections: [
      ["Document structure", "Use paragraph and heading styles to create a correct hierarchy. Give every important image alternative text and group related objects properly."],
      ["Articles panel", "Open Window → Articles and place text frames, images and other elements in the correct reading order."],
      ["Tagging", "Enable View → Structure → Show Structure and use meaningful tags such as H1 and P."],
      ["Export and verification", "Export as Adobe PDF (Interactive) or Adobe PDF (Print). Enable Create Tagged PDF and Use Structure for Tab Order. In Acrobat, run Tools → Accessibility → Full Check and verify reading order, alternative text and heading hierarchy."],
    ],
  },
  {
    title: "Uploading to Dropbox",
    sections: [
      ["Keep files current", "Upload after every change, including small ones, and update both source and print data. Missing files or mismatched upload dates force others to investigate which version is current."],
      ["Naming system", "Use a consistent hierarchy: school level → subject/stage → series → year → publication/type/part. Folder names use spaces and no diacritics; exported filenames use underscores and include the date. Keep separate print and source folders for each publication. Never delete older files—move them to an archive folder."],
      ["Source package", "A source folder should contain the dated InDesign package, Document Fonts, Links, INDD and IDML files. Keep cover and interior packages distinct where appropriate."],
    ],
  },
  {
    title: "Dropbox links in Specifications",
    sections: [
      ["Create the link", "Hover over the filename and choose Share. Open sharing settings with the gear icon. Under Link for viewing, set the link parameters. If no link exists, choose Create link."],
      ["Required settings", "Anyone with the link; Expiry Off; Require password On (password: printer); Disable downloads Off. Save the settings, then choose Copy Link."],
    ],
  },
  {
    title: "Submitting Dropbox links",
    sections: [
      ["Copy and submit", "Confirm the required sharing settings, copy the link and paste it into the relevant publication Specification field, then submit it for review."],
      ["Admin path", "In Admin, open Print → Specifications and use the green edit button beside the project ID. In Print data—cover or interior—paste the link into the URL field and select Submit data for review."],
    ],
  },
  {
    title: "For editors",
    sections: [
      ["Roles", "The designer/typesetter defines the layout, colours, fonts and type sizes. The editor prepares the publication content. All material must be approved by the subject expert before hand-off; major content changes after typesetting are disruptive."],
      ["Document structure and images", "Structure the Word file clearly with headings, text, exercises and other elements. Approximate the final PDF layout, number every page and make its position clear. Insert image crops or mark placement precisely, include exact image links, and write direct instructions rather than vague requests."],
      ["Communication and corrections", "Comments must be concise and clearly attached to the relevant part of the page. The designer is not responsible for textual accuracy. Every correction round creates a new PDF; always annotate the newest version and name files systematically."],
      ["Approval", "Keep answers on a separate switchable InDesign layer and warn the designer if they will arrive later. Before print, the editor, team leader and—when required—the owner approve the publication. Only then does the designer export the print PDF, upload to Dropbox and place links in Admin."],
    ],
  },
  {
    title: "Version history",
    sections: [
      ["Version 1", "Date: 2026-05-27 · Author: Vlad Frolov · Change: Manual merged and created."],
    ],
  },
] as const;
const manualCzechPages = [
  { title: "Úvod a sazba", sections: [["Typografie a sazba", "Sazba převádí strukturovaný rukopis z Wordu do profesionálního tiskového souboru. Používáme nejnovější dostupný Adobe InDesign."], ["Výkon a plánování", "Za pracovní den grafik obvykle zpracuje 6–8 stran, přibližně 1–1,5 hodiny na stranu. Odhad musí zahrnovat opravy."], ["Data a fonty", "Google Drive slouží pro pracovní dokumenty, Dropbox pro finální zdrojové balíčky a tisková PDF. Po výměně fontů mezi Windows a macOS vždy porovnejte dokument s PDF."], ["Layout", "Udržujte zarovnání, barvy, fonty, číslování a nadpisy konzistentní. Navazujte na předchozí díly řady a používejte omezený, opakovatelný vzorník."], ["Zrcadlo sazby", "Obsah nesmí být příliš blízko okrajům. U V2 počítejte se ztrátou 6–7 mm ve hřbetu; záhlaví držte alespoň 5 mm od ořezu."]]},
  { title: "Zlom, kódy a obrazové podklady", sections: [["Spadávka", "Standard je 5 mm, v krajním případě minimálně 3 mm."], ["Zlom", "Připravte maketu, styly, vzorové strany, automatickou paginaci a vzorník barev. Vše jasně pojmenujte; větší publikace rozdělte do InDesignové knihy."], ["Čárové a QR kódy", "Používejte vektory v CMYK a čistou černou C0 M0 Y0 K100. ISBN převádějte na EAN-13 bez pomlček. QR kód generujte ideálně v InDesignu, minimálně 12 mm."], ["Obrázky", "Zdrojem je především Shutterstock, Wikimedia nebo vlastní ilustrátoři; u ostatních zdrojů ověřte licence."], ["Vrstva řešení", "Řešení patří do samostatné horní vrstvy, kterou lze vypnout. Použijte rukopisný font a tmavě modrou barvu; chybějící řešení hlaste redaktorovi."]]},
  { title: "Export a balení", sections: [["Sbalení dokumentu", "Balte fonty, vazby, INDD a IDML. Zkontrolujte barevnost, rozlišení a úplnost vazeb; duplexy převeďte ve Photoshopu do CMYK."], ["Barevnost", "PDF/X-1a převádí barvy podle výstupního profilu. Obrázky mají mít alespoň 240 dpi, ideálně 300 dpi, a nemají být zvětšené nad 120 %."], ["Preflight", "Kontrolujte vazby, přímé barvy, registrační černou, rozlišení, fonty, přesahující text, minimální písmo a spadávku."]]},
  { title: "Nastavení tiskového PDF", sections: [["Export", "Použijte PDF/X-1a, kompatibilitu Acrobat 8/9, profil FOGRA39, vysoké rozlišení, spadávku a ořezové značky. Exportujte jednotlivé strany."], ["Kontrola", "V Acrobatu zkontrolujte spadávky, značky, barevné pláty a ostrost. Ideální je také kontrola naripovaných CTP stran z tiskárny."]]},
  { title: "Přístupná PDF", sections: [["Struktura", "Používejte styly nadpisů a odstavců, přidejte důležitým obrázkům alternativní text a správně seskupujte objekty."], ["Pořadí a tagy", "V panelu Articles nastavte pořadí čtení a ve struktuře používejte správné tagy jako H1 a P."], ["Export a kontrola", "Zapněte Create Tagged PDF a Use Structure for Tab Order. V Acrobatu spusťte úplnou kontrolu přístupnosti."]]},
  { title: "Nahrávání na Dropbox", sections: [["Aktuální data", "Po každé úpravě aktualizujte zdrojová i tisková data."], ["Názvy a složky", "Dodržujte hierarchii stupeň → předmět → řada → ročník → publikace. Složky jsou bez diakritiky, soubory bez mezer s podtržítky a datem."], ["Archiv", "Udržujte zvlášť tisková a zdrojová data. Starší verze nemažte, přesuňte je do archivu."]]},
  { title: "Dropbox odkazy do Specifikací", sections: [["Vytvoření odkazu", "U souboru zvolte Share, otevřete nastavení a vytvořte Link for viewing."], ["Povinné nastavení", "Anyone with the link; Expiry Off; Require password On (printer); Disable downloads Off. Nastavení uložte a odkaz zkopírujte."]]},
  { title: "Odeslání odkazu", sections: [["Specifikace", "Odkaz vložte do příslušného pole Specifikace a odešlete ke kontrole."], ["Cesta v Adminu", "Tisk → Specifikace → zelené editovací tlačítko → Tisková data (obálka nebo vnitřek) → URL → Odeslat data ke kontrole."]]},
  { title: "Redaktoři", sections: [["Role", "Grafik určuje layout; redaktor připravuje obsah. Materiály musí před sazbou schválit odborný garant."], ["Struktura a obrázky", "Rukopis musí být jasně strukturovaný, stránky očíslované a umístění obrázků přesné včetně odkazů."], ["Komunikace a korektury", "Komentáře pište stručně a jednoznačně do nejnovějšího PDF. Po každém kole vzniká nová verze."], ["Schválení", "Před tiskem publikaci kontroluje redaktor, team leader a případně majitel. Poté grafik exportuje PDF a nahraje data."]]},
  { title: "Historie verzí", sections: [["Verze 1", "27. 5. 2026 · Vlad Frolov · Sloučení a vytvoření manuálu."]]},
] as const;
const manualImages = Array.from({ length: 14 }, (_, index) => `/design-manual/media/image${index + 1}.png`);

const contextualHelp = {
  en: {
    extraction: {
      what: [
        "Text Extraction extracts text 🤯",
        "It can do so from a short PDF (just a few pages) or a JPG/PNG file. The file can be dragged and dropped, pasted directly, or uploaded by clicking the button.",
        "Once you receive the text, you can copy it with the orange button, download it as an MD or TXT file, or refine it further using the prompt box underneath.",
        "Always check the output text against the input file. AI can make mistakes.",
      ],
      how: "Your file travels through a protected server route, so the OpenRouter key never appears in the browser. Images are read by a fixed Mistral vision model; short PDFs are processed with Mistral OCR. The service returns plain text to the editor. If you refine it, the current text and your instruction are sent to a smaller fixed Ministral model, and its corrected version replaces the text in the editor.",
    },
    index: {
      what: [
        "Index Creator finds requested words—and their grammatical forms—throughout a large textbook PDF.",
        "Upload a live-text PDF, paste one index word or phrase per line, and create the index. Each line contains the original term, the strongest index pages, and all remaining matches in parentheses. Columns are separated by tabs.",
        "Copy the finished index with the orange button, or download it directly as an MD or TXT file.",
        "Check the automatically detected page-number mapping before using the result. You can correct the PDF-page and printed-page anchor underneath the output.",
        "Always review the finished index. Languages are wonderfully untidy, and AI can miss or over-include an unusual form.",
      ],
      how: "PDF.js reads the live text locally, one page at a time, and looks for printed page numbers near the page edges. The PDF itself is not sent to an AI service. Only your short word list goes through OpenRouter to fixed Mistral Medium 3.5, which proposes Czech, English, Slovak or Romanian grammatical forms. The browser then searches those forms on every page and assembles the tab-separated index locally.",
    },
    grep: {
      what: [
          "GREP Builder turns a plain-language Find what / Change to instruction into code for Adobe InDesign’s GREP tab.",
        "Describe what should be found in the first field and what should replace it in the second. Generated fields turn orange and can be copied individually.",
        "Choose Try again to return to your original editable instructions. Always test the result on a copy or a small selection before changing an entire document.",
      ],
      how: "Your two short instructions are sent through the protected server route to the fixed Ministral 3 3B 2512 model on OpenRouter. It returns separate InDesign Find What and Change To strings. No InDesign document or document text is uploaded.",
    },
    prompt: {
      what: [
        "Prompt Extractor finds meaningful illustrations in a manuscript PDF of up to 20 pages.",
        "The extractor separates independent visual assets, while keeping intentional groups together with useful counts and arrangement details. Assets extracted from a framed illustration with a developed background are grouped under COMPLEX.",
        "Empty areas, borders, logos, decorative marks and visible writing are ignored. Copy the finished list or download it as MD or TXT.",
        "Always compare the prompts with the manuscript. Visual AI can miss an illustration or misunderstand an action.",
      ],
      how: "PDF.js checks the page count and renders every page locally as an image. The PDF text layer is never extracted or uploaded. Page images travel in small batches through the protected server route to the fixed Mistral Medium 3.5 vision model on OpenRouter, which returns structured illustration descriptions. The browser groups and formats those descriptions.",
    },
    solutions: {
      what: [
        "Solutions Importer compares a clean preview PDF with the matching PDF that contains typed answers and provides a small JSON file that the downloadable InDesign script uses to place the new answer text on a SOLUTIONS layer automatically.",
        "Always review the imported layer before saving.",
        "For editors: add answers as real, selectable typed text directly onto a copy of the clean preview PDF. Keep every answer close to the exercise or answer space where it belongs. Do not use comments, sticky notes, drawing annotations, handwriting, outlined text, screenshots or scanned answers—the importer cannot extract those reliably. Do not move, resize, reflow or otherwise alter the original page content while adding answers.",
        "Both PDFs must contain the same pages, in the same order, and use the same unchanged layout.",
      ],
      how: "Python and pdfplumber read and compare both PDFs entirely inside this browser through Pyodide. The PDFs and their text are never uploaded to Robot, an AI service, or any other server. Only the JSON file you download is used later by the local InDesign script.",
    },
    barcode: {
      what: ["Barcode Generator validates ISBN-10 and ISBN-13 numbers and creates the corresponding EAN-13 publication barcode.", "The PDF is vector artwork at the standard nominal size, with outlined Verdana digits and pure process black throughout."],
      how: "The ISBN, checksum, bars, digit outlines and PDF are produced locally in this browser. Nothing is uploaded and no external barcode service is used.",
    },
    map: {
      what: [
        "Map Generator is an interactive world-map editor for current and historical political boundaries.",
        "Choose a year from 3400 BCE to 2026 CE, pan and zoom the map, switch geographic layers on or off, and optionally fill countries with an imported Adobe Swatch Exchange palette.",
        "The orange 10:7 frame is the exported area. Downloaded SVGs preserve the current crop, zoom, colours, label scale and layer visibility in named groups for further editing in Illustrator.",
        "Some datasets have licence or time-period limitations. Read the warnings shown in the editor before commercial use, and remember that present-day physical overlays do not change with the historical timeline.",
      ],
      how: "Geographic shapes come from locally bundled Natural Earth, licensed CShapes 2.0 and Cliopatria datasets. The map is rendered deterministically rather than drawn by AI. The selected year chooses the appropriate boundary catalogue, and the browser applies viewport, palette and layer edits. The prompt field is reserved for a future constrained map-editing resolver and does not currently change the map.",
    },
    bio: {
      what: [
        "Diagram Generator creates simplified, labelled biological diagrams as editable SVG artwork.",
        "Describe the subject and structures to show. You can add up to three PNG, JPEG or WebP reference images and import an Adobe Swatch Exchange palette.",
        "The result includes an SVG and a verification report, but biological labels and relationships must always be checked by an editor or subject expert. Diagrams are schematic and not to scale.",
      ],
      how: "Your instruction, optional reference images and locally parsed palette colours are sent through a protected server route. A fixed model returns a constrained diagram specification—not finished SVG code—and the server validates it and renders the SVG with deterministic shapes, labels and leader lines.",
    },
    graph: {
      what: [
        "Graph Generator turns supplied numeric data into an editable bar or line chart in SVG format.",
        "Include a title, values, units and a named source in your instruction. You can also import an Adobe Swatch Exchange palette.",
        "The generator preserves the numbers you provide and returns both the SVG and a verification report. Always compare the chart with the original source before publication.",
      ],
      how: "Your text is sent through a protected server route to a fixed model, which may only structure the explicit values and sources you supplied. It cannot research, estimate or add data. The returned specification is validated, then deterministic code calculates the axes and renders either a bar or line chart.",
    },
    cover: {
      what: [
        "Cover Generator creates new textbook-cover artwork from two or three existing covers that define a visual series.",
        "Choose a style and generation quality, describe the new subject, and generate two or four concepts. Upvoting a concept uses it as an additional direction reference for the next batch; unwanted concepts can be deleted.",
        "Ignore text in reference images sends artwork-focused crops so book titles, grade labels and publisher logos are less likely to be copied. This may help generate cleaner cover art.",
        "Optional Shutterstock research accepts one search phrase or direct Shutterstock URL per row. Previews are unlicensed, watermarked research references; every used source must be licensed before publication.",
        "After selecting a concept, automatic stemming detects essential objects, creates an AI-recreated 2K cover master, and regenerates each detected object as a separate isolated 2K asset. These are new AI recreations, not pixel-perfect extracted layers.",
        "The ZIP contains concepts, the 2K master, stems, project metadata, and a Markdown report with each task’s model, seed, credits and Shutterstock source links.",
      ],
      how: "Reference images and the brief travel through a protected server route. Fast concepts use FLUX.2 Klein 4B at 512 px; high-quality concepts use FLUX.2 Pro at 1K. Automatic object detection uses Mistral Small 2603, while the 2K master and isolated stems use FLUX.2 Pro. Failed concept slots are retried once, and successful parallel results are preserved. OpenRouter usage costs and generation IDs are stored for the ZIP report.",
    },
    general: {
      what: ["Taktik Robot is a focused set of tools for preparing textbook content, layouts and visual materials."],
      how: "Choose a tool from the left. Each module explains what it does here, including which parts stay local and which AI services it uses.",
    },
  },
  cs: {
    extraction: {
      what: [
        "Extrakce textu extrahuje text 🤯",
        "Zvládne krátké PDF (jen několik stran) nebo soubor JPG/PNG. Soubor můžete přetáhnout, vložit přímo ze schránky nebo nahrát kliknutím na tlačítko.",
        "Hotový text můžete zkopírovat oranžovým tlačítkem, stáhnout jako soubor MD nebo TXT nebo jej dál upravovat pomocí pole pro prompt pod textem.",
        "Výstup vždy porovnejte se vstupním souborem. AI může dělat chyby.",
      ],
      how: "Soubor prochází chráněnou serverovou cestou, takže klíč OpenRouteru se nikdy neobjeví v prohlížeči. Obrázky čte pevně zvolený vizuální model Mistral; krátká PDF zpracovává Mistral OCR. Služba vrátí prostý text do editoru. Při další úpravě se aktuální text a váš pokyn odešlou menšímu pevně zvolenému modelu Ministral a jeho opravená verze nahradí text v editoru.",
    },
    index: {
      what: [
        "Tvůrce rejstříku hledá zadaná slova i jejich gramatické tvary v rozsáhlém PDF učebnice.",
        "Nahrajte PDF s živým textem, vložte na každý řádek jedno slovo nebo slovní spojení a vytvořte rejstřík. Každý řádek obsahuje původní heslo, nejlepší stránky pro rejstřík a v závorkách všechny ostatní výskyty. Sloupce oddělují tabulátory.",
        "Hotový rejstřík můžete zkopírovat oranžovým tlačítkem nebo stáhnout jako soubor MD či TXT.",
        "Před použitím výsledku zkontrolujte automaticky rozpoznané číslování stran. Kotvu mezi stranou PDF a tištěnou stranou můžete opravit pod výstupem.",
        "Hotový rejstřík vždy zkontrolujte. Jazyky jsou krásně nepořádné a AI může neobvyklý tvar vynechat nebo zahrnout navíc.",
      ],
      how: "PDF.js čte živý text místně v prohlížeči, stranu po straně, a hledá čísla tištěných stran u okrajů. Samotné PDF se žádné službě AI neposílá. Přes OpenRouter odchází pouze krátký seznam hesel do pevně zvoleného modelu Mistral Medium 3.5, který navrhne české, anglické, slovenské nebo rumunské gramatické tvary. Prohlížeč pak tyto tvary vyhledá na každé straně a místně sestaví tabulátorový rejstřík.",
    },
    grep: {
      what: [
        "Tvůrce GREP výrazů převádí běžně napsaný pokyn Najít / Změnit na do kódu pro kartu GREP v aplikaci Adobe InDesign.",
        "Do prvního pole popište, co se má najít, a do druhého, čím se to má nahradit. Vygenerovaná pole se zbarví oranžově a každý kód lze samostatně zkopírovat.",
        "Tlačítkem Zkusit znovu se vrátíte k původním upravitelným pokynům. Výsledek vždy nejdříve vyzkoušejte na kopii nebo malém výběru textu.",
      ],
      how: "Dva krátké pokyny se odešlou chráněnou serverovou cestou do pevně zvoleného modelu Ministral 3 3B 2512 přes OpenRouter. Model vrátí samostatný výraz Najít a výraz Změnit na pro InDesign. Žádný dokument ani jeho text se neodesílá.",
    },
    prompt: {
      what: [
        "Extraktor promptů vyhledá smysluplné ilustrace v rukopisu v PDF o rozsahu nejvýše 20 stran.",
        "Extraktor oddělí samostatné obrazové prvky, zatímco záměrné skupiny ponechá pohromadě a doplní užitečný počet či uspořádání. Prvky získané z ohraničené ilustrace s rozvinutým pozadím zařadí pod nadpis COMPLEX.",
        "Prázdná místa, rámečky, loga, dekorace a viditelný text ignoruje. Hotový seznam můžete zkopírovat nebo stáhnout jako MD či TXT.",
        "Prompty vždy porovnejte s rukopisem. Vizuální AI může ilustraci přehlédnout nebo nesprávně pochopit děj.",
      ],
      how: "PDF.js místně zkontroluje počet stran a každou stranu vykreslí jako obrázek. Textová vrstva PDF se neextrahuje ani neodesílá. Obrázky stran putují v malých dávkách přes chráněnou serverovou cestu do pevně zvoleného vizuálního modelu Mistral Medium 3.5 na OpenRouteru. Prohlížeč vrácené strukturované popisy seskupí a naformátuje.",
    },
    solutions: {
      what: [
        "Importér řešení porovná čisté náhledové PDF s odpovídajícím PDF obsahujícím vepsaná řešení a vytvoří malý soubor JSON. Stažitelný skript pro InDesign jej použije k automatickému umístění nového textu řešení do vrstvy SOLUTIONS.",
        "Importovanou vrstvu před uložením vždy zkontrolujte.",
        "Pro redaktory: řešení vepisujte jako skutečný označitelný text přímo do kopie čistého náhledového PDF. Každé řešení umístěte blízko příslušného cvičení nebo prostoru pro odpověď. Nepoužívejte komentáře, lístečky, kreslené anotace, rukopis, text převedený do křivek, snímky obrazovky ani naskenované odpovědi—importér je nedokáže spolehlivě extrahovat. Při doplňování řešení původní obsah stran neposouvejte, neměňte jeho velikost ani zalomení.",
        "Obě PDF musí obsahovat stejné strany ve stejném pořadí a používat stejný nezměněný layout.",
      ],
      how: "Python a pdfplumber načtou a porovnají obě PDF výhradně v tomto prohlížeči prostřednictvím Pyodide. PDF ani jejich text se nikdy nenahrávají do Robota, služby AI ani na jiný server. Místní skript InDesignu později použije pouze stažený soubor JSON.",
    },
    barcode: {
      what: ["Generátor ověří ISBN-10 nebo ISBN-13 a vytvoří odpovídající publikační čárový kód EAN-13.", "PDF obsahuje vektorovou kresbu ve standardní jmenovité velikosti, číslice Verdana převedené do křivek a čistou procesní černou."],
      how: "ISBN, kontrolní číslice, pruhy, obrysy číslic i PDF vznikají místně v tomto prohlížeči. Nic se neodesílá a nepoužívá se žádná externí služba.",
    },
    map: {
      what: [
        "Generátor map je interaktivní editor mapy světa se současnými i historickými politickými hranicemi.",
        "Zvolte rok od 3400 př. n. l. do roku 2026 n. l., mapu posouvejte a přibližujte, zapínejte geografické vrstvy a případně vybarvujte státy barvami z importovaného vzorníku Adobe Swatch Exchange.",
        "Oranžový rám 10:7 vymezuje exportovanou oblast. Stažené SVG zachová ořez, přiblížení, barvy, velikost popisků i viditelnost vrstev v pojmenovaných skupinách pro další úpravy v Illustratoru.",
        "Některé datové sady mají licenční nebo časová omezení. Před komerčním použitím si přečtěte upozornění v editoru a pamatujte, že současné fyzickogeografické vrstvy se s historickou osou nemění.",
      ],
      how: "Geografické tvary pocházejí z místně uložených dat Natural Earth, licencované sady CShapes 2.0 a Cliopatria. Mapu vykresluje deterministický kód, nikoli AI. Zvolený rok určí příslušný katalog hranic a prohlížeč aplikuje výřez, paletu a nastavení vrstev. Pole pro prompt je připraveno pro budoucí omezený editor a mapu zatím nemění.",
    },
    bio: {
      what: [
        "Generátor diagramů vytváří zjednodušená popsaná biologická schémata jako upravitelné SVG.",
        "Popište objekt a struktury, které se mají zobrazit. Můžete přidat až tři referenční obrázky PNG, JPEG nebo WebP a importovat vzorník Adobe Swatch Exchange.",
        "Výsledkem je SVG a protokol kontroly, biologické popisky a vztahy však musí vždy ověřit redaktor nebo odborník. Diagramy jsou schematické a nejsou v měřítku.",
      ],
      how: "Pokyn, volitelné referenční obrázky a barvy z místně načtené palety procházejí chráněnou serverovou cestou. Pevně zvolený model vrátí omezenou specifikaci diagramu, nikoli hotový kód SVG. Server specifikaci ověří a deterministicky vykreslí tvary, popisky a odkazové čáry.",
    },
    graph: {
      what: [
        "Generátor grafů převádí dodaná číselná data na upravitelný sloupcový nebo spojnicový graf ve formátu SVG.",
        "Do pokynu uveďte název, hodnoty, jednotky a pojmenovaný zdroj. Můžete také importovat vzorník Adobe Swatch Exchange.",
        "Generátor zachová zadaná čísla a vrátí SVG i protokol kontroly. Před publikováním graf vždy porovnejte s původním zdrojem.",
      ],
      how: "Text prochází chráněnou serverovou cestou do pevně zvoleného modelu, který smí pouze strukturovat výslovně dodané hodnoty a zdroje. Nesmí data vyhledávat, odhadovat ani doplňovat. Vrácená specifikace se ověří a deterministický kód vypočítá osy a vykreslí sloupcový nebo spojnicový graf.",
    },
    cover: {
      what: [
        "Generátor obálek vytváří nové obrazové podklady obálek učebnic podle dvou nebo tří existujících obálek, které určují vzhled řady.",
        "Zvolte styl a kvalitu generování, popište nový námět a vytvořte dva nebo čtyři koncepty. Koncept, pro který hlasujete, se v další sadě použije jako dodatečná směrová reference; nechtěné koncepty můžete smazat.",
        "Volba Ignorovat text v referenčních obrázcích odešle modelu výřezy zaměřené na obrazovou část, aby se méně kopírovaly názvy knih, označení ročníků a loga nakladatele. To může pomoci vytvořit čistší obrazovou část obálky.",
        "Volitelná rešerše Shutterstock přijímá na každém řádku jeden vyhledávací dotaz nebo přímý odkaz Shutterstock. Náhledy jsou opatřené vodoznakem a bez licence; každý použitý zdroj je nutné před publikováním licencovat.",
        "Po výběru konceptu automatické vytváření podkladů rozpozná hlavní objekty, nově vytvoří hlavní obálku ve 2K a každý rozpoznaný objekt vygeneruje jako samostatný izolovaný 2K podklad. Jde o nové výstupy AI, nikoli o přesně vytažené vrstvy z původních pixelů.",
        "ZIP obsahuje koncepty, hlavní obálku ve 2K, samostatné podklady, metadata projektu a report v Markdownu s modelem, seedem, cenou a odkazy Shutterstock pro každou úlohu.",
      ],
      how: "Referenční obrázky a zadání procházejí chráněnou serverovou cestou. Rychlé koncepty používají FLUX.2 Klein 4B v rozlišení 512 px, kvalitnější koncepty FLUX.2 Pro v 1K. Automatické rozpoznání objektů používá Mistral Small 2603; hlavní obálku a izolované podklady ve 2K vytváří FLUX.2 Pro. Neúspěšný koncept se jednou zkusí nahradit a úspěšné výsledky souběžných úloh zůstanou zachované. Cena a identifikátory generování z OpenRouteru se ukládají do reportu v ZIP.",
    },
    general: {
      what: ["Taktik Robot je soustředěná sada nástrojů pro přípravu obsahu, sazby a obrazových materiálů učebnic."],
      how: "Vyberte nástroj vlevo. Každý modul zde vysvětluje, co dělá, které kroky probíhají místně a jaké služby AI používá.",
    },
  },
} as const;

export default function Home() {
  const [theme, setTheme] = useState<Theme>("light");
  const [language, setLanguage] = useState<Language>("en");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [open, setOpen] = useState({ text: true, image: true, design: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [manualChapter, setManualChapter] = useState(0);
  const [zoomedManualImage, setZoomedManualImage] = useState<{ src: string; caption: string } | null>(null);
  const manualDocsRef = useRef<HTMLDivElement>(null);
  const manualArticleRef = useRef<HTMLElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const comingSoonTimer = useRef<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<"image" | "pdf" | "text" | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [correctionPrompt, setCorrectionPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [extractionError, setExtractionError] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [indexFile, setIndexFile] = useState<File | null>(null);
  const [indexUrl, setIndexUrl] = useState<string | null>(null);
  const [indexPreviewPage, setIndexPreviewPage] = useState(1);
  const [indexWords, setIndexWords] = useState("");
  const [indexResult, setIndexResult] = useState("");
  const [indexMatches, setIndexMatches] = useState<Array<{ word: string; pdfPages: number[]; otherPdfPages: number[] }>>([]);
  const [pdfAnchor, setPdfAnchor] = useState(1);
  const [printedAnchor, setPrintedAnchor] = useState(1);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState(0);
  const [indexError, setIndexError] = useState("");
  const [indexCopied, setIndexCopied] = useState(false);
  const [grepFindPrompt, setGrepFindPrompt] = useState("");
  const [grepReplacePrompt, setGrepReplacePrompt] = useState("");
  const [grepResult, setGrepResult] = useState<{ findWhat: string; replaceWith: string } | null>(null);
  const [isGeneratingGrep, setIsGeneratingGrep] = useState(false);
  const [grepError, setGrepError] = useState("");
  const [grepCopied, setGrepCopied] = useState<"find" | "replace" | null>(null);
  const [promptFile, setPromptFile] = useState<File | null>(null);
  const [promptUrl, setPromptUrl] = useState<string | null>(null);
  const [promptResult, setPromptResult] = useState("");
  const [isExtractingPrompts, setIsExtractingPrompts] = useState(false);
  const [promptProgress, setPromptProgress] = useState(0);
  const [promptError, setPromptError] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [solutionsBlankFile, setSolutionsBlankFile] = useState<File | null>(null);
  const [solutionsAnswerFile, setSolutionsAnswerFile] = useState<File | null>(null);
  const [solutionsResult, setSolutionsResult] = useState("");
  const [solutionsProgress, setSolutionsProgress] = useState(0);
  const [solutionsError, setSolutionsError] = useState("");
  const [solutionsLog, setSolutionsLog] = useState<string[]>([]);
  const [isExtractingSolutions, setIsExtractingSolutions] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [figureRequest, setFigureRequest] = useState("");
  const [figureMode, setFigureMode] = useState<"chart" | "diagram" | "map">("chart");
  const [figureReferences, setFigureReferences] = useState<Array<{ name: string; data: string }>>([]);
  const [figurePalette, setFigurePalette] = useState<AseSwatch[]>([]);
  const [figurePaletteName, setFigurePaletteName] = useState("");
  const [figureOutput, setFigureOutput] = useState<FigureOutput | null>(null);
  const [figureError, setFigureError] = useState("");
  const [isGeneratingFigure, setIsGeneratingFigure] = useState(false);
  const [figureSecondsLeft, setFigureSecondsLeft] = useState(30);
  const [coverReferences, setCoverReferences] = useState<CoverReference[]>([]);
  const [coverBrief, setCoverBrief] = useState("");
  const [coverSketches, setCoverSketches] = useState<CoverGeneration[]>([]);
  const [coverLayers, setCoverLayers] = useState<CoverGeneration[]>([]);
  const [coverSelectedId, setCoverSelectedId] = useState<string | null>(null);
  const [coverDetectedAssets, setCoverDetectedAssets] = useState<Array<{ name: string; description: string }>>([]);
  const [coverAnalysis, setCoverAnalysis] = useState<CoverAnalysis | null>(null);
  const [coverProductionStage, setCoverProductionStage] = useState<"analyzing" | "master" | "assets" | "complete" | null>(null);
  const [coverUseShutterstock, setCoverUseShutterstock] = useState(false);
  const [coverStockInputs, setCoverStockInputs] = useState([""]);
  const [coverMedium, setCoverMedium] = useState<"match" | "photo" | "illustration" | "3d">("match");
  const [coverSketchQuality, setCoverSketchQuality] = useState<"fast" | "fidelity">("fidelity");
  const [coverArtOnlyReferences, setCoverArtOnlyReferences] = useState(true);
  const [coverGenerationCount, setCoverGenerationCount] = useState<2 | 4>(4);
  const [coverError, setCoverError] = useState("");
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [isGeneratingLayers, setIsGeneratingLayers] = useState(false);
  const [zoomedCover, setZoomedCover] = useState<CoverGeneration | null>(null);
  const [timelineYear, setTimelineYear] = useState(1914);
  const [timelineYearInput, setTimelineYearInput] = useState("1914");
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const timelineRequestRef = useRef(0);
  const [mapLayers, setMapLayers] = useState({ boundaries: true, labels: true, water: true, rivers: true, climate: false, terrain: false, mountains: false, cities: false, disputed: false });
  const [mapFillMode, setMapFillMode] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [mapEditPrompt, setMapEditPrompt] = useState("");
  const mapDragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean; regionId: string | null } | null>(null);
  const figureReferenceInputRef = useRef<HTMLInputElement>(null);
  const figurePaletteInputRef = useRef<HTMLInputElement>(null);
  const coverReferenceInputRef = useRef<HTMLInputElement>(null);
  const solutionsBlankInputRef = useRef<HTMLInputElement>(null);
  const solutionsAnswerInputRef = useRef<HTMLInputElement>(null);
  const promptFileInputRef = useRef<HTMLInputElement>(null);
  const indexFileInputRef = useRef<HTMLInputElement>(null);
  const t = copy[language];
  const solutionsT = solutionsUi[language];
  const barcodeT = barcodeUi[language];
  const figureT = figureUi[language];
  const coverT = localizedCoverUi[language];

  useEffect(() => {
    if (selected !== "map") return;
    setMapZoom(1); setMapPan({ x: 0, y: 0 });
    void loadTimelineYear(timelineYear);
  }, [selected]);

  useEffect(() => {
    if (selected !== "map") return;
    const handleMapZoomKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setMapZoom((value) => Math.min(40, value * 1.25));
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setMapZoom((value) => Math.max(.5, value / 1.25));
      }
    };
    window.addEventListener("keydown", handleMapZoomKey);
    return () => window.removeEventListener("keydown", handleMapZoomKey);
  }, [selected]);

  useEffect(() => {
    const savedTheme = (window.localStorage.getItem("robot-theme") || window.localStorage.getItem("ta-theme")) as Theme | null;
    const savedLanguage = (window.localStorage.getItem("robot-language") || window.localStorage.getItem("ta-language")) as Language | null;
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
    if (savedLanguage === "cs" || savedLanguage === "en") setLanguage(savedLanguage);
  }, []);

  useEffect(() => {
    if (!zoomedCover) return;
    const handleCoverLightboxKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomedCover(null);
      if (event.key === "ArrowLeft") { event.preventDefault(); moveZoomedCover(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); moveZoomedCover(1); }
    };
    window.addEventListener("keydown", handleCoverLightboxKey);
    return () => window.removeEventListener("keydown", handleCoverLightboxKey);
  }, [zoomedCover, coverSketches, coverLayers]);

  useEffect(() => () => {
    if (comingSoonTimer.current !== null) window.clearTimeout(comingSoonTimer.current);
  }, []);

  function selectApp(app: string) {
    if (completedApps.has(app)) {
      setComingSoon(null);
      if (app !== selected && (app === "graph" || app === "bio" || app === "map")) {
        setFigureOutput(null);
        setFigureError("");
        setFigureRequest("");
      }
      setSelected(app);
      if (app === "graph") setFigureMode("chart");
      if (app === "bio") setFigureMode("diagram");
      if (app === "map") setFigureMode("map");
      return;
    }

    setComingSoon(app);
    if (comingSoonTimer.current !== null) window.clearTimeout(comingSoonTimer.current);
    comingSoonTimer.current = window.setTimeout(() => setComingSoon(null), 4000);
  }

  useEffect(() => {
    setNow(new Date());
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (manualArticleRef.current) manualArticleRef.current.scrollTop = 0;
    if (manualDocsRef.current) manualDocsRef.current.scrollTop = 0;
  }, [manualChapter, language]);

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  useEffect(() => () => {
    if (indexUrl) URL.revokeObjectURL(indexUrl);
  }, [indexUrl]);

  useEffect(() => () => {
    if (promptUrl) URL.revokeObjectURL(promptUrl);
  }, [promptUrl]);

  useEffect(() => {
    if (indexMatches.length) setIndexResult(formatIndexOutput(indexMatches, pdfAnchor, printedAnchor));
  }, [indexMatches, pdfAnchor, printedAnchor]);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (selected !== "extraction") return;
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/") || item.type === "application/pdf");
      if (file) {
        event.preventDefault();
        void processFile(file);
        return;
      }
      const pastedText = event.clipboardData?.getData("text/plain").trim();
      if (pastedText && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        loadPastedText(pastedText);
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  });

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem("robot-theme", next);
  }

  function toggleLanguage() {
    const next = language === "en" ? "cs" : "en";
    setLanguage(next);
    window.localStorage.setItem("robot-language", next);
  }

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.readAsDataURL(file);
    });
  }

  function coverFileToDataUrls(file: File) {
    const supportedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!supportedTypes.includes(file.type)) return Promise.reject(new Error(`${file.name}: use a PNG, JPEG, or WebP image.`));
    if (file.size > 30_000_000) return Promise.reject(new Error(`${file.name}: the source image is larger than 30 MB.`));
    return new Promise<{ data: string; artData: string }>((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        const render = (sourceY: number, sourceHeight: number, maxSide: number) => new Promise<string>((renderResolve, renderReject) => {
          const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, sourceHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(sourceHeight * scale));
          const context = canvas.getContext("2d");
          if (!context) { renderReject(new Error(`${file.name}: the browser could not prepare this image.`)); return; }
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, sourceY, image.naturalWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) { renderReject(new Error(`${file.name}: the browser could not compress this image.`)); return; }
            const reader = new FileReader();
            reader.onload = () => renderResolve(String(reader.result));
            reader.onerror = () => renderReject(new Error(`${file.name}: the compressed image could not be read.`));
            reader.readAsDataURL(blob);
          }, "image/jpeg", .88);
        });
        try {
          const cropY = Math.round(image.naturalHeight * .3);
          const cropHeight = Math.max(1, Math.round(image.naturalHeight * .56));
          const [data, artData] = await Promise.all([render(0, image.naturalHeight, 1600), render(cropY, cropHeight, 1400)]);
          resolve({ data, artData });
        } catch (error) { reject(error); }
      };
      image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error(`${file.name}: the image could not be decoded.`)); };
      image.src = objectUrl;
    });
  }

  function resetSourceUrl() {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
  }

  function loadPastedText(text: string) {
    resetSourceUrl();
    setSourceFile(null);
    setSourceKind("text");
    setOcrText(text);
    setExtractionError("");
    setIsProcessing(false);
  }

  async function processFile(file: File) {
    const allowed = file.type === "application/pdf" || file.type === "image/png" || file.type === "image/jpeg";
    if (!allowed) {
      setExtractionError(t.pdfImageOnly);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setExtractionError(t.fileTooLarge20);
      return;
    }
    resetSourceUrl();
    setSourceFile(file);
    setSourceUrl(URL.createObjectURL(file));
    setSourceKind(file.type === "application/pdf" ? "pdf" : "image");
    setOcrText("");
    setExtractionError("");
    setIsProcessing(true);
    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, type: file.type, data: await fileToDataUrl(file) }),
      });
      const result = await response.json() as { text?: string; error?: string };
      if (!response.ok || !result.text) throw new Error(result.error || "Text extraction failed.");
      setOcrText(result.text);
    } catch (error) {
      setExtractionError(error instanceof Error ? error.message : "Text extraction failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  async function correctText() {
    if (!ocrText.trim() || !correctionPrompt.trim() || isCorrecting) return;
    setIsCorrecting(true);
    setExtractionError("");
    try {
      const response = await fetch("/api/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ocrText, instruction: correctionPrompt, language }),
      });
      const result = await response.json() as { text?: string; error?: string };
      if (!response.ok || !result.text) throw new Error(result.error || "Text correction failed.");
      setOcrText(result.text);
      setCorrectionPrompt("");
    } catch (error) {
      setExtractionError(error instanceof Error ? error.message : "Text correction failed.");
    } finally {
      setIsCorrecting(false);
    }
  }

  async function copyOcrText() {
    await navigator.clipboard.writeText(ocrText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function downloadText(text: string, filename: string, type: string) {
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function selectSolutionPdf(kind: "blank" | "answers", file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setSolutionsError(solutionsT.pdfError);
      return;
    }
    if (kind === "blank") setSolutionsBlankFile(file);
    else setSolutionsAnswerFile(file);
    setSolutionsResult("");
    setSolutionsProgress(0);
    setSolutionsError("");
  }

  function handleSolutionFileInput(kind: "blank" | "answers", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) selectSolutionPdf(kind, file);
    event.target.value = "";
  }

  function handleSolutionDrop(kind: "blank" | "answers", event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) selectSolutionPdf(kind, file);
  }

  async function createSolutionJson() {
    if (!solutionsBlankFile || !solutionsAnswerFile || isExtractingSolutions) return;
    setIsExtractingSolutions(true);
    setSolutionsResult("");
    setSolutionsError("");
    setSolutionsLog([]);
    setSolutionsProgress(1);
    const addLog = (message: string) => {
      const timestamp = new Date().toLocaleTimeString("en-GB", { hour12: false });
      const line = `[${timestamp}] ${message}`;
      setSolutionsLog((current) => [...current, line]);
      console.info(`[Solutions Importer] ${message}`);
    };
    try {
      addLog(solutionsT.starting);
      addLog(`${solutionsT.cleanLog}: ${solutionsBlankFile.name} · ${formatFileSize(solutionsBlankFile.size)}`);
      addLog(`${solutionsT.answersLog}: ${solutionsAnswerFile.name} · ${formatFileSize(solutionsAnswerFile.size)}`);
      addLog(solutionsT.worker);
      const json = await new Promise<string>(async (resolve, reject) => {
        const worker = new Worker("/solutions/pyodide-worker.js");
        worker.onmessage = (event: MessageEvent<{ type: string; message?: string; progress?: number; json?: string; stack?: string }>) => {
          const message = event.data;
          if (message.type === "log" && message.message) {
            if (typeof message.progress === "number") setSolutionsProgress(message.progress);
            addLog(message.message);
          } else if (message.type === "result" && message.json) {
            worker.terminate();
            resolve(message.json);
          } else if (message.type === "error") {
            worker.terminate();
            reject(new Error(message.message || solutionsT.failed));
          }
        };
        worker.onerror = (event) => {
          worker.terminate();
          reject(new Error(event.message || solutionsT.failed));
        };
        const [blank, solutions] = await Promise.all([solutionsBlankFile.arrayBuffer(), solutionsAnswerFile.arrayBuffer()]);
        worker.postMessage({ blank, solutions, blankName: solutionsBlankFile.name, solutionsName: solutionsAnswerFile.name, language }, [blank, solutions]);
      });
      setSolutionsResult(json);
      const sourceName = solutionsAnswerFile.name.replace(/\.pdf$/i, "") || "chapter-solutions";
      addLog(`${solutionsT.jsonReady}: ${formatFileSize(new Blob([json]).size)}. ${solutionsT.downloading}`);
      downloadText(json, `${sourceName}.json`, "application/json");
      addLog(`${sourceName}.json: ${solutionsT.downloaded}`);
      setSolutionsProgress(100);
    } catch (error) {
      const message = error instanceof Error ? error.message : solutionsT.failed;
      addLog(`${solutionsT.error}: ${message}`);
      console.error("[Solutions Importer] Comparison failed", error);
      setSolutionsError(message);
    } finally {
      setIsExtractingSolutions(false);
    }
  }

  function selectIndexFile(file: File) {
    if (file.type !== "application/pdf") {
      setIndexError(t.pdfOnly);
      return;
    }
    if (indexUrl) URL.revokeObjectURL(indexUrl);
    setIndexFile(file);
    setIndexUrl(URL.createObjectURL(file));
    setIndexPreviewPage(1);
    setIndexResult("");
    setIndexMatches([]);
    setIndexProgress(0);
    setIndexError("");
  }

  function handleIndexFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) selectIndexFile(file);
    event.target.value = "";
  }

  function handleIndexDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) selectIndexFile(file);
  }

  async function createIndex() {
    const words = [...new Set(indexWords.split(/\r?\n/).map((word) => word.trim()).filter(Boolean))];
    if (!indexFile || !words.length || isIndexing) return;
    setIsIndexing(true);
    setIndexResult("");
    setIndexMatches([]);
    setIndexError("");
    setIndexProgress(1);
    try {
      const indexer = await import("./lib/pdf-indexer");
      const pages = await indexer.extractPdfPages(indexFile, (done, total) => setIndexProgress(Math.max(2, Math.round((done / total) * 65))));
      const anchor = indexer.detectPrintedPageAnchor(pages);
      const detectedPdfAnchor = anchor.pdfPage;
      const detectedPrintedAnchor = anchor.printedPage;
      setPdfAnchor(detectedPdfAnchor);
      setPrintedAnchor(detectedPrintedAnchor);
      setIndexProgress(72);

      const entries: Array<{ word: string; forms: string[] }> = [];
      const batchSize = 12;
      const batches = Array.from({ length: Math.ceil(words.length / batchSize) }, (_, index) => words.slice(index * batchSize, (index + 1) * batchSize));

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const response = await fetch("/api/index/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ words: batches[batchIndex] }),
        });
        const result = await response.json() as { entries?: Array<{ word: string; forms: string[] }>; error?: string };
        if (!response.ok || !result.entries) throw new Error(result.error || "Could not prepare multilingual word forms.");
        entries.push(...result.entries);
        setIndexProgress(72 + Math.round(((batchIndex + 1) / batches.length) * 10));
      }

      const candidates = indexer.findIndexCandidates(pages, entries);
      setIndexProgress(84);
      const selections: Array<{ word: string; pages: number[] }> = [];
      const selectionBatchSize = 4;
      const selectionBatches = Array.from(
        { length: Math.ceil(candidates.length / selectionBatchSize) },
        (_, index) => candidates.slice(index * selectionBatchSize, (index + 1) * selectionBatchSize),
      );

      for (let batchIndex = 0; batchIndex < selectionBatches.length; batchIndex += 1) {
        const response = await fetch("/api/index/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidates: selectionBatches[batchIndex] }),
        });
        const result = await response.json() as { selections?: Array<{ word: string; pages: number[] }>; error?: string };
        if (!response.ok || !result.selections) throw new Error(result.error || "Could not select index-worthy pages.");
        selections.push(...result.selections);
        setIndexProgress(84 + Math.round(((batchIndex + 1) / selectionBatches.length) * 14));
      }

      const byWord = new Map(selections.map((selection) => [selection.word, selection.pages]));
      const candidatePagesByWord = new Map(candidates.map((candidate) => [candidate.word, candidate.pages.map((page) => page.pdfPage)]));
      const matches = words.map((word) => {
        const pdfPages = byWord.get(word) ?? [];
        const selectedPages = new Set(pdfPages);
        const otherPdfPages = (candidatePagesByWord.get(word) ?? []).filter((page) => !selectedPages.has(page));
        return { word, pdfPages, otherPdfPages };
      });
      setIndexMatches(matches);
      setIndexResult(formatIndexOutput(matches, detectedPdfAnchor, detectedPrintedAnchor));
      setIndexProgress(100);
    } catch (error) {
      setIndexError(error instanceof Error ? error.message : "Index creation failed.");
    } finally {
      setIsIndexing(false);
    }
  }

  async function copyIndex() {
    await navigator.clipboard.writeText(indexResult);
    setIndexCopied(true);
    window.setTimeout(() => setIndexCopied(false), 1600);
  }

  async function generateGrep() {
    if (!grepFindPrompt.trim() || !grepReplacePrompt.trim() || isGeneratingGrep) return;
    setIsGeneratingGrep(true);
    setGrepError("");
    try {
      const response = await fetch("/api/grep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ find: grepFindPrompt, replace: grepReplacePrompt }),
      });
      const result = await response.json() as { findWhat?: string; replaceWith?: string; error?: string };
      if (!response.ok || typeof result.findWhat !== "string" || typeof result.replaceWith !== "string") throw new Error(result.error || "Could not generate GREP code.");
      setGrepResult({ findWhat: result.findWhat, replaceWith: result.replaceWith });
    } catch (error) {
      setGrepError(error instanceof Error ? error.message : "Could not generate GREP code.");
    } finally {
      setIsGeneratingGrep(false);
    }
  }

  async function copyGrep(value: string, field: "find" | "replace") {
    await navigator.clipboard.writeText(value);
    setGrepCopied(field);
    window.setTimeout(() => setGrepCopied(null), 1600);
  }

  async function extractPrompts(file: File) {
    if (file.type !== "application/pdf") {
      setPromptError(t.pdfOnly);
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setPromptError(t.fileTooLarge30);
      return;
    }
    if (promptUrl) URL.revokeObjectURL(promptUrl);
    setPromptFile(file);
    setPromptUrl(URL.createObjectURL(file));
    setPromptResult("");
    setPromptError("");
    setPromptProgress(1);
    setIsExtractingPrompts(true);
    try {
      const renderer = await import("./lib/pdf-images");
      const pages = await renderer.renderPdfPages(file, (done, total) => setPromptProgress(Math.round((done / total) * 38)));
      const illustrations: IllustrationPrompt[] = [];
      const batchSize = 1;
      const batches = Array.from({ length: Math.ceil(pages.length / batchSize) }, (_, index) => pages.slice(index * batchSize, (index + 1) * batchSize));
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const response = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pages: batches[batchIndex] }),
        });
        const result = await response.json() as { illustrations?: IllustrationPrompt[]; error?: string };
        if (!response.ok || !Array.isArray(result.illustrations)) throw new Error(result.error || "Prompt extraction failed.");
        illustrations.push(...result.illustrations);
        setPromptProgress(38 + Math.round(((batchIndex + 1) / batches.length) * 62));
      }
      setPromptResult(formatPromptOutput(illustrations));
      setPromptProgress(100);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Prompt extraction failed.";
      setPromptError(message === "PDF_PAGE_LIMIT" ? "The PDF has more than 20 pages." : message);
    } finally {
      setIsExtractingPrompts(false);
    }
  }

  function handlePromptFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void extractPrompts(file);
    event.target.value = "";
  }

  function handlePromptDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void extractPrompts(file);
  }

  async function copyPrompts() {
    await navigator.clipboard.writeText(promptResult);
    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1600);
  }

  let barcodeResult: ReturnType<typeof normalizeIsbn> | null = null;
  let barcodeError = "";
  if (barcodeInput.trim()) {
    try { barcodeResult = normalizeIsbn(barcodeInput); }
    catch (error) { barcodeError = error instanceof Error ? error.message : "Invalid ISBN."; }
  }

  function downloadBarcode() {
    if (!barcodeResult) return;
    const url = URL.createObjectURL(createEan13Pdf(barcodeResult.digits));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `EAN13_${barcodeResult.digits}.pdf`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function generateFigure() {
    setIsGeneratingFigure(true);
    setFigureSecondsLeft(30);
    const generationStarted = Date.now();
    const countdown = window.setInterval(() => setFigureSecondsLeft(Math.max(0, 30 - Math.floor((Date.now() - generationStarted) / 1000))), 1000);
    setFigureError("");
    setFigureOutput(null);
    try {
      const response = await fetch("/api/figures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: figureRequest, mode: figureMode, references: figureReferences.map(({ data }) => data), palette: figurePalette }) });
      const result = await response.json() as FigureOutput & { error?: string };
      if (!response.ok) throw new Error(result.error || "Figure generation failed.");
      setFigureOutput(result);
      const generatedYear = Number(result.spec.date?.slice(0, 4));
      if (Number.isInteger(generatedYear) && generatedYear >= 1886 && generatedYear <= 2026) setTimelineYear(generatedYear);
    } catch (error) {
      setFigureError(error instanceof Error ? error.message : "Figure generation failed.");
    } finally {
      window.clearInterval(countdown);
      setIsGeneratingFigure(false);
    }
  }

  async function loadTimelineYear(year: number) {
    const requestId = ++timelineRequestRef.current;
    setIsLoadingTimeline(true);
    setFigureError("");
    try {
      const response = await fetch(`/api/maps/timeline?year=${year}`, { cache: "no-store" });
      const result = await response.json() as FigureOutput & { error?: string };
      if (!response.ok) throw new Error(result.error || "Historical timeline failed.");
      if (requestId !== timelineRequestRef.current) return;
      setFigureOutput(result);
    } catch (error) {
      setFigureError(error instanceof Error ? error.message : "Historical timeline failed.");
    } finally { if (requestId === timelineRequestRef.current) setIsLoadingTimeline(false); }
  }

  function commitTimelineYear() {
    let year = Math.max(-3400, Math.min(2026, Number.parseInt(timelineYearInput, 10) || timelineYear));
    if (year === 0) year = timelineYear < 0 ? 1 : -1;
    setTimelineYear(year);
    setTimelineYearInput(String(year));
    void loadTimelineYear(year);
  }

  function changeTimelineYearInput(value: string) {
    setTimelineYearInput(value);
    const year = Number(value);
    if (!Number.isInteger(year) || year < -3400 || year > 2026 || year === 0) return;
    setTimelineYear(year);
    void loadTimelineYear(year);
  }

  function stepTimelineYear(delta: number) {
    let year = Math.max(-3400, Math.min(2026, timelineYear + delta));
    if (year === 0) year = delta > 0 ? 1 : -1;
    setTimelineYear(year);
    setTimelineYearInput(String(year));
    void loadTimelineYear(year);
  }

  function toggleMapCountry(regionId: string) {
    if (!figureOutput) return;
    const document = new DOMParser().parseFromString(figureOutput.svg, "image/svg+xml");
    const paths = [...document.querySelectorAll(`path[data-region-id="${CSS.escape(regionId)}"]`)];
    const selected = paths.some((path) => path.getAttribute("data-selected") === "true");
    for (const path of paths) {
      if (selected) { path.removeAttribute("data-selected"); path.removeAttribute("style"); }
      else { path.setAttribute("data-selected", "true"); path.setAttribute("style", "fill:#ff661a"); }
    }
    setFigureOutput((current) => current ? { ...current, svg: new XMLSerializer().serializeToString(document.documentElement) } : current);
  }

  function applyMapPalette(shuffle = false) {
    if (!figureOutput || !figurePalette.length) return;
    const shade = (hex: string, factor: number) => `#${[1, 3, 5].map((index) => Math.round(Number.parseInt(hex.slice(index, index + 2), 16) * factor).toString(16).padStart(2, "0")).join("")}`;
    let colors = figurePalette.flatMap(({ hex }) => [shade(hex, 1), shade(hex, .75), shade(hex, .5)]);
    if (shuffle) colors = colors.slice().sort(() => Math.random() - .5);
    const parsed = new DOMParser().parseFromString(figureOutput.svg, "image/svg+xml");
    const paths = [...parsed.querySelectorAll(".regions path")];
    const colorByRegion = new Map<string, string>();
    paths.forEach((path, index) => {
      const key = path.getAttribute("data-region-id") || path.getAttribute("data-iso-numeric") || path.getAttribute("data-map-unit") || String(index);
      if (!colorByRegion.has(key)) colorByRegion.set(key, colors[colorByRegion.size % colors.length]);
      path.setAttribute("fill", colorByRegion.get(key)!);
    });
    setFigureOutput((current) => current ? { ...current, svg: new XMLSerializer().serializeToString(parsed.documentElement) } : current);
  }

  function mapPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const path = mapFillMode ? (event.target as Element).closest?.("path[data-region-id]") : null;
    event.currentTarget.setPointerCapture(event.pointerId);
    mapDragRef.current = { x: event.clientX, y: event.clientY, panX: mapPan.x, panY: mapPan.y, moved: false, regionId: path?.getAttribute("data-region-id") ?? null };
  }

  function mapPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = mapDragRef.current; if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    setMapPan({ x: drag.panX + dx, y: drag.panY + dy });
  }

  function mapPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = mapDragRef.current; mapDragRef.current = null;
    if (drag && !drag.moved && drag.regionId) toggleMapCountry(drag.regionId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function mapWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 };
    const factor = Math.exp(-event.deltaY * 0.0015);
    const nextZoom = Math.max(.5, Math.min(40, mapZoom * factor));
    const ratio = nextZoom / mapZoom;
    setMapPan({ x: point.x - ratio * (point.x - mapPan.x), y: point.y - ratio * (point.y - mapPan.y) });
    setMapZoom(nextZoom);
  }

  function formatFigureCountdown(seconds: number) {
    const sign = seconds < 0 ? "−" : "";
    const absolute = Math.abs(seconds);
    return `${sign}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, "0")}`;
  }

  async function addFigureReferences(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 3 - figureReferences.length);
    event.target.value = "";
    const valid = files.filter((file) => ["image/png", "image/jpeg", "image/webp"].includes(file.type) && file.size <= 5_000_000);
    const added = await Promise.all(valid.map(async (file) => ({ name: file.name, data: await fileToDataUrl(file) })));
    setFigureReferences((current) => [...current, ...added].slice(0, 3));
  }

  async function addFigurePalette(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.name.toLowerCase().endsWith(".ase") || file.size > 2_000_000) { setFigureError(figureT.paletteFileError); return; }
    try { setFigurePalette(parseAse(await file.arrayBuffer())); setFigurePaletteName(file.name); setFigureError(""); if (figureMode !== "map") setFigureOutput(null); }
    catch (error) { setFigureError(error instanceof Error ? error.message : figureT.paletteReadError); }
  }

  async function addCoverReferences(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await addCoverReferenceFiles(files);
  }

  async function addCoverReferenceFiles(files: File[]) {
    try {
      const selectedFiles = files.slice(0, 3 - coverReferences.length);
      const additions = await Promise.all(selectedFiles.map(async (file) => ({ name: file.name, ...await coverFileToDataUrls(file) })));
      setCoverReferences((current) => [...current, ...additions].slice(0, 3));
      setCoverError("");
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : coverT.referenceError);
    }
  }

  async function generateCoverSketches(generationCount: 2 | 4) {
    if (coverReferences.length < 2 || !coverBrief.trim() || isGeneratingCover) return;
    if (coverSketches.filter((item) => item.status !== "rejected").length + generationCount > 16) { setCoverError(coverT.limit); return; }
    setCoverGenerationCount(generationCount); setIsGeneratingCover(true); setCoverError("");
    try {
      const direction = coverSelectedId ? coverSketches.find((item) => item.id === coverSelectedId)?.data : undefined;
      const response = await fetch("/api/covers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "sketch", generationCount, brief: coverBrief, references: coverReferences.map((item) => coverArtOnlyReferences ? item.artData : item.data), direction, useShutterstock: coverUseShutterstock, stockInputs: coverStockInputs, medium: coverMedium, sketchQuality: coverSketchQuality }) });
      const result = await response.json() as { images?: Array<{ data: string; seed: number; model: string; generationId?: string; usage: CoverUsage; stock?: CoverStock }>; warnings?: string[]; error?: string };
      if (!response.ok || !result.images?.length) throw new Error(result.error || coverT.sketchError);
      setCoverSketches((current) => [...current, ...result.images!.map((item) => ({ ...item, id: crypto.randomUUID(), status: "active" as const, createdAt: new Date().toISOString() }))]);
      if (result.warnings?.length) setCoverError(result.warnings.join(" · "));
    } catch (error) { setCoverError(error instanceof Error ? error.message : coverT.generationError); }
    finally { setIsGeneratingCover(false); }
  }

  function selectCoverSketch(id: string) { setCoverSelectedId(id); setCoverSketches((current) => current.map((item) => item.id === id ? { ...item, status: "selected" } : item.status === "selected" ? { ...item, status: "active" } : item)); }
  function rejectCoverSketch(id: string) { if (coverSelectedId === id) setCoverSelectedId(null); setCoverSketches((current) => current.map((item) => item.id === id ? { ...item, status: "rejected" } : item)); }
  function moveZoomedCover(offset: number) {
    if (!zoomedCover) return;
    const items = [...coverSketches.filter((item) => item.status !== "rejected"), ...coverLayers];
    if (items.length < 2) return;
    const index = items.findIndex((item) => item.id === zoomedCover.id);
    setZoomedCover(items[(Math.max(0, index) + offset + items.length) % items.length]);
  }

  async function generateCoverLayers() {
    const selected = coverSketches.find((item) => item.id === coverSelectedId);
    if (!selected || isGeneratingLayers) return;
    setIsGeneratingLayers(true); setCoverError(""); setCoverLayers([]); setCoverDetectedAssets([]); setCoverAnalysis(null); setCoverProductionStage("analyzing");
    try {
      const references = coverReferences.map((item) => coverArtOnlyReferences ? item.artData : item.data);
      const common = { brief: coverBrief, references, direction: selected.data, useShutterstock: coverUseShutterstock, stockInputs: coverStockInputs, medium: coverMedium };
      const analysisResponse = await fetch("/api/covers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...common, mode: "analyze" }) });
      const analysis = await analysisResponse.json() as CoverAnalysis & { error?: string };
      if (!analysisResponse.ok || !analysis.assets?.length) throw new Error(analysis.error || coverT.detectionError);
      setCoverAnalysis(analysis); setCoverDetectedAssets(analysis.assets); setCoverProductionStage("master");

      const masterResponse = await fetch("/api/covers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...common, mode: "master" }) });
      const master = await masterResponse.json() as { images?: Array<{ data: string; seed: number; name?: string; model: string; generationId?: string; usage: CoverUsage }>; error?: string };
      if (!masterResponse.ok || !master.images?.length) throw new Error(master.error || coverT.masterError);
      setCoverLayers(master.images.map((item) => ({ ...item, id: crypto.randomUUID(), status: "layer", createdAt: new Date().toISOString() })));
      setCoverProductionStage("assets");

      const assetResponse = await fetch("/api/covers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...common, mode: "layers", layers: analysis.assets.map((asset) => `${asset.name}: ${asset.description}`) }) });
      const assets = await assetResponse.json() as { images?: Array<{ data: string; seed: number; name?: string; model: string; generationId?: string; usage: CoverUsage; stock?: CoverStock }>; warnings?: string[]; error?: string };
      if (!assetResponse.ok || !assets.images?.length) throw new Error(assets.error || coverT.assetError);
      setCoverLayers((current) => [...current, ...assets.images!.map((item) => ({ ...item, id: crypto.randomUUID(), status: "layer" as const, createdAt: new Date().toISOString() }))]);
      if (assets.warnings?.length) setCoverError(assets.warnings.join(" · "));
      setCoverProductionStage("complete");
    } catch (error) { setCoverProductionStage(null); setCoverError(error instanceof Error ? error.message : coverT.productionError); }
    finally { setIsGeneratingLayers(false); }
  }

  async function downloadCoverZip() {
    const entries: Array<{ name: string; data: Uint8Array }> = []; const toBytes = async (dataUrl: string) => new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
    for (const [index, item] of coverSketches.entries()) entries.push({ name: `concepts/${item.status === "selected" ? "selected" : item.status === "rejected" ? "rejected" : "alternatives"}/concept-${String(index + 1).padStart(2, "0")}.jpg`, data: await toBytes(item.data) });
    for (const [index, item] of coverLayers.entries()) entries.push({ name: item.name === "2K cover master" ? "production/master/cover-master-2k.jpg" : `production/stems/${safeFilename(item.name || `asset-${index + 1}`)}.jpg`, data: await toBytes(item.data) });
    const tasks = [...coverSketches, ...coverLayers];
    const knownTotal = tasks.reduce((sum, item) => sum + (item.usage.cost || 0), coverAnalysis?.usage.cost || 0);
    const unknownCosts = tasks.filter((item) => item.usage.cost === null).length + (coverAnalysis?.usage.cost === null ? 1 : 0);
    const stockSources = [...new Map(tasks.filter((item) => item.stock).map((item) => [item.stock!.id, item.stock!])).values()];
    const report = [
      `# ${coverT.reportTitle}`,
      "",
      `- Exported: ${new Date().toISOString()}`,
      `- Brief: ${coverBrief}`,
      `- Artwork-only reference crops: ${coverArtOnlyReferences ? "yes" : "no"}`,
      `- Shutterstock research inputs: ${coverUseShutterstock ? coverStockInputs.map((input) => input.trim()).filter(Boolean).join("; ") || "main brief" : "disabled"}`,
      `- Generation tasks: ${tasks.length + (coverAnalysis ? 1 : 0)}`,
      `- Total credits: ${knownTotal.toFixed(6)}${unknownCosts ? ` (${unknownCosts} task${unknownCosts === 1 ? "" : "s"} did not report a cost)` : ""}`,
      "",
      "## Separate generation tasks",
      "",
      "| # | Type | Output | Model | Seed | Credits | OpenRouter generation | Shutterstock |",
      "|---:|---|---|---|---:|---:|---|---|",
      ...(coverAnalysis ? [`| 1 | object analysis | ${coverAnalysis.assets.map((asset) => asset.name).join(", ")} | ${coverAnalysis.model} | — | ${coverAnalysis.usage.cost === null ? "not reported" : coverAnalysis.usage.cost.toFixed(6)} | ${coverAnalysis.generationId || "not reported"} | — |`] : []),
      ...tasks.map((item, index) => `| ${index + 1 + (coverAnalysis ? 1 : 0)} | ${item.status === "layer" ? item.name === "2K cover master" ? "2K master" : "regenerated stem" : "concept"} | ${item.name || `concept-${String(coverSketches.indexOf(item) + 1).padStart(2, "0")}`} | ${item.model} | ${item.seed} | ${item.usage.cost === null ? "not reported" : item.usage.cost.toFixed(6)} | ${item.generationId || "not reported"} | ${item.stock ? `[${item.stock.id}](${item.stock.sourceUrl})` : "—"} |`),
      "",
      "## Shutterstock sources",
      "",
      ...(stockSources.length ? stockSources.map((source) => `- [${source.id}: ${source.description}](${source.sourceUrl})`) : ["No Shutterstock previews were used."]),
      "",
      "> WARNING: Shutterstock previews are watermarked, unlicensed research references. They are not production assets. Open and license every linked source before publication, and verify that the final artwork does not reproduce a preview or its watermark.",
      "",
    ].join("\n");
    entries.push({ name: "generation-report.md", data: new TextEncoder().encode(report) });
    entries.push({ name: "project.json", data: new TextEncoder().encode(JSON.stringify({ project: "Taktik Robot", brief: coverBrief, references: coverReferences.map(({ name }) => name), artworkOnlyReferenceCrops: coverArtOnlyReferences, selectedSketch: coverSelectedId, useShutterstock: coverUseShutterstock, shutterstockResearchInputs: coverStockInputs.map((input) => input.trim()).filter(Boolean), objectAnalysis: coverAnalysis, sketches: coverSketches.map(({ id, seed, status, createdAt, model, generationId, usage, stock }) => ({ id, seed, status, createdAt, model, generationId, usage, stock })), layers: coverLayers.map(({ name, seed, createdAt, model, generationId, usage, stock }) => ({ name, seed, createdAt, model, generationId, usage, stock })), totalCredits: knownTotal, unknownCostTasks: unknownCosts, exportedAt: new Date().toISOString() }, null, 2)) });
    const url = URL.createObjectURL(new Blob([createZip(entries)], { type: "application/zip" })); const link = document.createElement("a"); link.href = url; link.download = "robot-cover-project.zip"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportCoverArtboard() {
    const active = coverSketches.filter((item) => item.status !== "rejected");
    const stage = document.querySelector<HTMLElement>(".cover-stage");
    if (!stage) return;
    const viewport = stage.getBoundingClientRect();
    const visibleIds = new Set([...stage.querySelectorAll<HTMLElement>(".cover-card[data-cover-id]")].filter((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.bottom > viewport.top && bounds.top < viewport.bottom && bounds.right > viewport.left && bounds.left < viewport.right;
    }).map((element) => element.dataset.coverId));
    const visible = active.map((item, index) => ({ item, number: index + 1 })).filter(({ item }) => visibleIds.has(item.id)).slice(0, 12);
    if (!visible.length) { setCoverError(coverT.artboardError); return; }
    try {
      const pdf = await createCoverArtboardPdf(visible.map(({ item, number }) => ({ number, data: item.data })));
      const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "robot-cover-artboard.pdf";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : coverT.artboardError);
    }
  }

  function downloadFigure(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCroppedMap() {
    if (!figureOutput) return;
    const displayedSvg = document.querySelector<SVGSVGElement>(".map-module .map-transform svg");
    const crop = document.querySelector<HTMLElement>(".map-module .map-export-crop");
    if (!displayedSvg || !crop) return downloadFigure(figureOutput.svg, "map.svg", "image/svg+xml");
    const svgBounds = displayedSvg.getBoundingClientRect(), cropBounds = crop.getBoundingClientRect();
    const scale = Math.min(svgBounds.width / 1000, svgBounds.height / 700);
    const contentLeft = svgBounds.left + (svgBounds.width - 1000 * scale) / 2;
    const contentTop = svgBounds.top + (svgBounds.height - 700 * scale) / 2;
    const viewBox = {
      x: (cropBounds.left - contentLeft) / scale,
      y: (cropBounds.top - contentTop) / scale,
      width: cropBounds.width / scale,
      height: cropBounds.height / scale,
    };
    const parsed = new DOMParser().parseFromString(figureOutput.svg, "image/svg+xml");
    const root = parsed.documentElement;
    const setExportLayerVisible = (id: string, visible: boolean) => {
      const element = root.querySelector<SVGElement>(`#${id}`);
      if (!element) return;
      if (visible) element.style.removeProperty("display");
      else element.style.display = "none";
    };
    setExportLayerVisible("climate-zones", mapLayers.climate);
    setExportLayerVisible("terrain", mapLayers.terrain);
    setExportLayerVisible("mountains", mapLayers.mountains);
    setExportLayerVisible("cities", mapLayers.cities);
    setExportLayerVisible("disputed-boundaries", mapLayers.disputed);
    setExportLayerVisible("rivers", mapLayers.rivers);
    setExportLayerVisible("lakes", mapLayers.water);
    setExportLayerVisible("country-names", mapLayers.labels);
    setExportLayerVisible("country-abbreviations", false);
    for (const element of root.querySelectorAll<SVGElement>("#geographic-labels .water")) element.style.display = mapLayers.water ? "" : "none";
    for (const element of root.querySelectorAll<SVGElement>("#map-features .feature-label")) element.style.display = mapLayers.labels ? "" : "none";
    if (!mapLayers.boundaries) for (const element of root.querySelectorAll<SVGElement>("#countries-borders path")) element.style.stroke = "none";
    root.querySelector("#map-information")?.remove();
    const countryFontSize = (6 + mapZoom * .7) / mapZoom;
    const countryHaloSize = (1.5 + mapZoom * .12) / mapZoom;
    const waterFontSize = (7 + mapZoom * .8) / mapZoom;
    const waterHaloSize = (1.7 + mapZoom * .12) / mapZoom;
    for (const element of root.querySelectorAll<SVGElement>(".map-label,.natural-cities text,.natural-mountains text")) { element.style.fontSize = `${countryFontSize}px`; element.style.strokeWidth = `${countryHaloSize}px`; }
    for (const element of root.querySelectorAll<SVGElement>(".free-label.water")) { element.style.fontSize = `${waterFontSize}px`; element.style.strokeWidth = `${waterHaloSize}px`; }
    const cityRankLimit = mapZoom >= 8 ? 10 : mapZoom >= 3 ? 6 : 3;
    const mountainRankLimit = mapZoom >= 8 ? 10 : mapZoom >= 3 ? 5 : 2;
    for (const group of root.querySelectorAll<SVGGElement>(".natural-cities > g,.natural-mountains > g")) {
      const rank = Number(group.getAttribute("class")?.match(/rank-(\d+)/)?.[1] ?? 10);
      const label = group.querySelector<SVGTextElement>("text");
      const limit = group.parentElement?.classList.contains("natural-mountains") ? mountainRankLimit : cityRankLimit;
      if (label && rank > limit) label.style.display = "none";
    }
    const contentLayer = parsed.createElementNS("http://www.w3.org/2000/svg", "g");
    contentLayer.setAttribute("id", "map-content");
    contentLayer.setAttribute("data-name", "Map content");
    contentLayer.setAttribute("transform", `translate(${-viewBox.x} ${-viewBox.y})`);
    const movableChildren = [...root.children].filter((element) => !["defs", "style", "desc"].includes(element.tagName.toLowerCase()));
    for (const element of movableChildren) contentLayer.appendChild(element);
    root.appendChild(contentLayer);
    root.setAttribute("viewBox", `0 0 ${viewBox.width} ${viewBox.height}`);
    root.setAttribute("width", "1000"); root.setAttribute("height", "700");
    const backgroundLayer = parsed.createElementNS("http://www.w3.org/2000/svg", "g");
    backgroundLayer.setAttribute("id", "export-background");
    backgroundLayer.setAttribute("data-name", "Export background");
    const background = parsed.createElementNS("http://www.w3.org/2000/svg", "rect");
    background.setAttribute("x", "0"); background.setAttribute("y", "0");
    background.setAttribute("width", String(viewBox.width)); background.setAttribute("height", String(viewBox.height));
    background.setAttribute("fill", "#eaf6fa"); background.setAttribute("data-export-background", "true");
    backgroundLayer.appendChild(background);
    root.insertBefore(backgroundLayer, contentLayer);
    const filename = `${figureOutput.spec.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "map"}.svg`;
    downloadFigure(new XMLSerializer().serializeToString(root), filename, "image/svg+xml");
  }

  function verificationMarkdown(report: string) {
    const data = JSON.parse(report) as { generatedAt?: string; generator?: string; model?: string; referenceCount?: number; palette?: AseSwatch[]; spec?: { title?: string; date?: string; place?: string; sources?: Array<{ id: string; title: string; url: string }>; notes?: string[] }; checks?: FigureCheck[] };
    const lines = [`# ${data.spec?.title || "Verification report"}`, "", `- Generated: ${data.generatedAt || ""}`, `- Generator: ${data.generator || ""}`, `- Model: ${data.model || ""}`];
    if (data.spec?.place) lines.push(`- Place: ${data.spec.place}`);
    if (data.spec?.date) lines.push(`- Date or period: ${data.spec.date}`);
    if (typeof data.referenceCount === "number") lines.push(`- Reference images: ${data.referenceCount}`);
    lines.push("", "## Checks", "", ...(data.checks || []).map(({ level, message }) => `- ${level === "pass" ? "PASS" : "WARNING"}: ${message}`));
    if (data.spec?.sources?.length) lines.push("", "## Sources", "", ...data.spec.sources.map(({ id, title, url }) => `- ${id}: [${title}](${url})`));
    if (data.palette?.length) lines.push("", "## Adobe palette", "", ...data.palette.map(({ name, hex, model, values, group }) => `- ${name}: ${hex} — ${model}${values?.length ? ` (${values.join(", ")})` : ""}${group ? ` — ${group}` : ""}`));
    if (data.spec?.notes?.length) lines.push("", "## Notes", "", ...data.spec.notes.map((note) => `- ${note}`));
    return `${lines.join("\n")}\n`;
  }

  const selectedLabel = selected
    ? t.apps[selected as keyof typeof t.apps]
    : null;
  const selectedGroup = selected ? groups.find((group) => group.items.some((item) => item === selected)) : undefined;
  const selectedNumber = selected === "manual" ? "01" : selected && selectedGroup
    ? String(selectedGroup.items.findIndex((item) => item === selected) + 1).padStart(2, "0")
    : null;
  const selectedInitial = selectedLabel?.trim().charAt(0).toLocaleUpperCase(language === "cs" ? "cs-CZ" : "en-US") ?? null;
  const selectedSection = selected === "manual" ? "REFERENCE" : selectedGroup ? t[selectedGroup.key].toUpperCase() : null;
  const helpKey = selected === "extraction" || selected === "index" || selected === "grep" || selected === "prompt" || selected === "solutions" || selected === "barcode" || selected === "map" || selected === "bio" || selected === "graph" || selected === "cover" ? selected : "general";
  const help = contextualHelp[language][helpKey];
  const clockHours = now ? String(now.getHours()).padStart(2, "0") : "--";
  const clockMinutes = now ? String(now.getMinutes()).padStart(2, "0") : "--";
  const localDate = now ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` : "---- -- --";
  const namedayKey = now ? `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` : "";
  const nameday = namedayKey === "08-04" ? "Dominika" : namedayKey ? czechNamedays[namedayKey] : "—";
  const exactCzechChapters = manualCzechContent.chapters.filter((chapter) => chapter.blocks.length && chapter.title !== "Historie verzí");
  const visibleEnglishChapters = manualEnglishContent.chapters;
  const visibleManualChapters = language === "cs" ? exactCzechChapters : visibleEnglishChapters;
  const editorChapterIndex = language === "cs" ? Math.max(0, exactCzechChapters.findIndex((chapter) => chapter.title === "Redaktoři")) : Math.max(0, visibleEnglishChapters.findIndex((chapter) => chapter.title === "Editors"));

  return (
    <main className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`} data-theme={theme}>
      <header className="topbar">
        <div className="brand">
          <button className="brand-mark" onClick={() => setSidebarOpen((value) => !value)} aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"} aria-expanded={sidebarOpen}>
            {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
          </button>
          <button className="brand-name" onClick={() => setSelected(null)} aria-label={t.home}><strong>TAKTIK</strong> ROBOT</button>
        </div>

        <div className="topbar-controls">
          <span className="system-status"><i /><PageLoadStatus items={robotStatusPhrases[language]} /></span>
          <button className="utility language" onClick={toggleLanguage} aria-label={t.changeLanguage}>
            <span className={language === "en" ? "active-option" : ""}>EN</span>
            <span>/</span>
            <span className={language === "cs" ? "active-option" : ""}>CZ</span>
          </button>
          <button className="utility icon-button" onClick={toggleTheme} aria-label={t.toggleTheme}>
            <span aria-hidden="true">{theme === "light" ? "◐" : "◑"}</span>
          </button>
          <button
            className={`utility icon-button ${infoOpen ? "pressed" : ""}`}
            onClick={() => setInfoOpen(true)}
            aria-label={t.openInformation}
          >
            <span aria-hidden="true">i</span>
          </button>
        </div>
      </header>

      <aside className="sidebar" aria-label={t.tools}>
        {groups.map((group) => (
          <section className="nav-group" key={group.key}>
            <button
              className="group-toggle"
              onClick={() => setOpen((state) => ({ ...state, [group.key]: !state[group.key] }))}
              aria-expanded={open[group.key]}
            >
              <span>{t[group.key]}</span>
              <span className="disclosure" aria-hidden="true">{open[group.key] ? "−" : "+"}</span>
            </button>
            {open[group.key] && (
              <div className="nav-items">
                {group.items.map((item, index) => (
                  <button
                    className={`nav-item ${selected === item ? "selected" : ""} ${completedApps.has(item) ? "" : "unavailable"}`}
                    key={item}
                    onClick={() => selectApp(item)}
                    aria-disabled={!completedApps.has(item)}
                  >
                    <span className="item-number">{String(index + 1).padStart(2, "0")}</span>
                    <span>{t.apps[item]}</span>
                    {comingSoon === item && <span className="coming-soon-tooltip" role="status">{t.comingSoon}</span>}
                  </button>
                ))}
              </div>
            )}
          </section>
        ))}
        <nav className="sidebar-reference" aria-label={language === "cs" ? "Referenční materiály" : "Reference materials"}>
          <button className={`nav-item reference-item ${selected === "manual" ? "selected" : ""}`} onClick={() => setSelected("manual")}>
            <span className="book-icon" aria-hidden="true" />
            <span>{t.apps.manual}</span>
          </button>
          <a className="nav-item reference-item" href={brandGuidelinesUrl} target="_blank" rel="noreferrer">
            <span className="book-icon" aria-hidden="true" />
            <span>{t.apps.brand}</span>
            <span className="external-mark" aria-hidden="true">↗</span>
          </a>
        </nav>
      </aside>

      <section className="workspace">
        <div className="workspace-grid" aria-hidden="true" />
        {selectedNumber && <span className="axis axis-x">{selectedNumber}</span>}
        {selectedInitial && <span className="axis axis-y">{selectedInitial}</span>}
        {selected === "manual" ? (
          <div className="manual-docs" ref={manualDocsRef}>
            <nav className="manual-toc" aria-label={language === "cs" ? "Obsah manuálu" : "Manual contents"}>
              <span>{language === "cs" ? "OBSAH" : "CONTENTS"}</span>
              <div className="manual-toc-group">
                <strong>{language === "cs" ? "GRAFICI" : "DESIGNERS"}</strong>
                {visibleManualChapters.slice(0, editorChapterIndex).map((chapter, index) => <button className={manualChapter === index ? "active" : ""} key={chapter.title} onClick={() => setManualChapter(index)}><b>{String(index + 1).padStart(2, "0")}</b>{chapter.title}</button>)}
              </div>
              <div className="manual-toc-group">
                <strong>{language === "cs" ? "REDAKTOŘI" : "EDITORS"}</strong>
                {visibleManualChapters.slice(editorChapterIndex).map((chapter, offset) => {
                  const index = editorChapterIndex + offset;
                  return <button className={manualChapter === index ? "active" : ""} key={chapter.title} onClick={() => setManualChapter(index)}><b>{String(index + 1).padStart(2, "0")}</b>{chapter.title}</button>;
                })}
              </div>
            </nav>
            <article className="manual-article" ref={manualArticleRef}>
              <header className="manual-hero">
                <span className="module-code">{language === "cs" ? "REFERENCE / GRAFIKA" : "REFERENCE / DESIGN"}</span>
                <small>{String(manualChapter + 1).padStart(2, "0")} / {String(visibleManualChapters.length).padStart(2, "0")}</small>
              </header>
              {(() => {
                const chapters = visibleManualChapters;
                const chapter = chapters[Math.min(manualChapter, chapters.length - 1)] as ManualChapterView;
                return <section className="manual-chapter" key={`${language}-${chapter.title}`}>
                  <span>{String(manualChapter + 1).padStart(2, "0")}</span><h1>{chapter.title}</h1>
                  {(() => {
                    const sourceSections: Array<{ heading: string; blocks: ManualSourceBlock[] }> = [];
                    chapter.blocks!.forEach((block) => {
                      if (block.type === "h2" || block.type === "h3") sourceSections.push({ heading: block.text || "", blocks: [] });
                      else if (sourceSections.length) sourceSections[sourceSections.length - 1].blocks.push(block);
                    });
                    return sourceSections.map((sourceSection) => {
                      const checklistStart = sourceSection.blocks.findIndex((item) => item.text === "Kontrolovat zejména:" || item.text === "Check in particular:");
                      const treeStart = sourceSection.blocks.findIndex((item) => item.text?.startsWith("ZAKLADNI SKOLY") || item.text?.startsWith("PRIMARY SCHOOLS"));
                      const treeEnd = sourceSection.blocks.findIndex((item) => item.text?.startsWith("📂 HM1 PU 1.dil vnitrek indd (15-1-2025)") || item.text?.startsWith("📂 HM1 PU 1st part interior indd (15-1-2025)"));
                      return <div className="manual-topic manual-source-topic" key={sourceSection.heading}>
                        <h2>{sourceSection.heading}</h2>
                        <div className="manual-topic-content">{sourceSection.blocks.map((block, blockIndex) => {
                          if (checklistStart >= 0 && blockIndex > checklistStart && blockIndex <= checklistStart + 8) return <p className="manual-source-check" key={blockIndex}>{block.text}</p>;
                          if (treeStart >= 0 && blockIndex > treeStart && blockIndex <= treeEnd) return null;
                          if (blockIndex === treeStart) {
                            const levels = [0, 1, 2, 3, 4, 5, 6, 6, 6, 6, 7, 5, 6, 7, 7, 7, 7, 6, 7, 7, 7];
                            return <div className="dropbox-tree" key={blockIndex} aria-label={language === "cs" ? "Struktura složek Dropbox" : "Dropbox folder structure"}>{sourceSection.blocks.slice(treeStart, treeEnd + 1).map((treeBlock, treeIndex) => {
                              const rawText = treeBlock.text || "";
                              const isNote = rawText.startsWith("–");
                              const isFile = rawText.startsWith("📄") || (!rawText.startsWith("📂") && /\.(pdf|indd|idml)$/i.test(rawText));
                              return <div className={`dropbox-tree-row level-${levels[treeIndex]} ${isNote ? "note" : ""} ${[0, 5, 11].includes(treeIndex) ? "key-folder" : ""}`} key={treeIndex}>{!isNote && <span className={isFile ? "file-node" : "folder-node"} aria-hidden="true" />}<span>{rawText.replace(/^[📂📄]\s*/, "")}</span></div>;
                            })}</div>;
                          }
                          if (block.type === "bullet") return <p className="manual-source-bullet" key={blockIndex}>{block.text}</p>;
                          if (block.type === "paragraph") return <p className="manual-source-paragraph" key={blockIndex}>{block.text}</p>;
                          if (block.type === "caption") return null;
                          if (block.type === "table") return <div className="manual-source-table-wrap" key={blockIndex}><table><tbody>{block.rows!.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
                          const following = sourceSection.blocks[blockIndex + 1];
                          const captions = following?.type === "caption" ? (following.text || "").split("\t") : block.text ? [block.text] : [];
                          return <div className={`manual-image-grid ${block.images!.length === 1 ? "single" : ""}`} key={blockIndex}>{block.images!.map((src, imageIndex) => {
                            const caption = captions[imageIndex] || captions[0] || `${t.apps.manual} · ${imageIndex + 1}`;
                            return <figure key={src}><button onClick={() => setZoomedManualImage({ src, caption })} aria-label={`${caption} — ${language === "cs" ? "zvětšit" : "zoom"}`}><img src={src} alt={caption} /></button><figcaption>{caption}</figcaption></figure>;
                          })}</div>;
                        })}</div>
                      </div>;
                    });
                  })()}
                </section>;
              })()}
              <nav className="manual-chapter-nav" aria-label={language === "cs" ? "Navigace kapitol" : "Chapter navigation"}>
                <button onClick={() => setManualChapter((chapter) => Math.max(0, chapter - 1))} disabled={manualChapter === 0}>← <span>{language === "cs" ? "Předchozí" : "Previous"}</span></button>
                <button onClick={() => setManualChapter((chapter) => Math.min(visibleManualChapters.length - 1, chapter + 1))} disabled={manualChapter >= visibleManualChapters.length - 1}><span>{language === "cs" ? "Další" : "Next"}</span> →</button>
              </nav>
            </article>
          </div>
        ) : selected === "cover" ? (
          <div className="cover-module">
            <section className={`cover-stage ${!coverSketches.length && !isGeneratingCover ? "initial" : ""}`}>
              {!coverSketches.length && !isGeneratingCover ? <header className="cover-stage-head"><div><span className="module-code">{coverT.code}</span><h1>{coverT.heading}</h1><p>0 / 16 {coverT.active}</p></div><div className="cover-export-actions"><button className="cover-export cover-artboard-export" disabled>{coverT.exportArtboard}</button><button className="cover-export" disabled>{coverT.download}</button></div></header> : <header className="cover-stage-head cover-stage-head-compact"><p>{coverSketches.filter((item) => item.status !== "rejected").length} / 16 {coverT.active}{coverSelectedId ? ` · ${coverT.selected}` : ""}</p><div className="cover-export-actions"><button className="cover-export cover-artboard-export" onClick={() => void exportCoverArtboard()} disabled={!coverSketches.some((item) => item.status !== "rejected")}>{coverT.exportArtboard}</button><button className="cover-export" onClick={() => void downloadCoverZip()} disabled={!coverSketches.length && !coverLayers.length}>{coverT.download}</button></div></header>}
              <div className={`cover-grid ${coverSketches.length || isGeneratingCover ? "has-results" : ""}`} aria-live="polite">
                {coverSketches.filter((item) => item.status !== "rejected").map((item, index) => <article className={`cover-card ${item.status === "selected" ? "selected" : ""}`} data-cover-id={item.id} key={item.id}>
                  <button className="cover-image" onClick={() => setZoomedCover(item)} aria-label={`${coverT.zoom} ${index + 1}`}><img src={item.data} alt={`${coverT.sketch} ${index + 1}`} /></button>
                  <footer><span>{coverT.sketch} {String(index + 1).padStart(2, "0")}</span><small>seed {item.seed} · {item.usage.cost === null ? "—" : `${item.usage.cost.toFixed(4)} cr`}</small><button className="cover-upvote" onClick={() => selectCoverSketch(item.id)} aria-pressed={item.status === "selected"}>{item.status === "selected" ? coverT.choose : coverT.upvote}</button><button className="cover-reject" onClick={() => rejectCoverSketch(item.id)} aria-label={coverT.reject}>×</button></footer>
                </article>)}
                {!coverSketches.filter((item) => item.status !== "rejected").length && !isGeneratingCover && <div className="cover-empty"><div className="crosshair" aria-hidden="true"><span /><span /></div><p>{coverT.empty}</p></div>}
                {isGeneratingCover && Array.from({ length: coverGenerationCount }, (_, index) => <div className="cover-card cover-loading" key={`loading-${index}`}><span>{coverT.generating}<br />{String(index + 1).padStart(2, "0")}</span></div>)}
              </div>
              {(coverLayers.length > 0 || isGeneratingLayers) && <section className="cover-layers"><header><span>{coverT.assets}</span><small>{coverT.assetsNote}</small></header><div>{coverLayers.map((item, index) => <article key={item.id}><button onClick={() => setZoomedCover(item)}><img src={item.data} alt={item.name || `${coverT.asset} ${index + 1}`} /></button><span>{item.name || `${coverT.asset} ${index + 1}`} · {item.usage.cost === null ? "—" : `${item.usage.cost.toFixed(4)} cr`}</span></article>)}{isGeneratingLayers && <div className="cover-layer-loading">{coverT.generating}<br />…</div>}</div></section>}
            </section>
            <aside className="cover-toolbar">
              <input ref={coverReferenceInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void addCoverReferences(event)} hidden />
              <section className="cover-control cover-reference-control"><label>{coverT.references} <b>{coverReferences.length}/3 · {coverT.minimum}</b></label><div className="cover-references">{Array.from({ length: 3 }, (_, index) => { const reference = coverReferences[index]; return reference ? <figure key={`${reference.name}-${index}`}><img src={reference.data} alt={reference.name} /><button onClick={() => setCoverReferences((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`${coverT.remove} ${reference.name}`}>×</button><figcaption>{String(index + 1).padStart(2, "0")}</figcaption></figure> : <button className="cover-add-reference" key={`empty-${index}`} onClick={() => coverReferenceInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addCoverReferenceFiles(Array.from(event.dataTransfer.files)); }} aria-label={`${coverT.addCover.replace("\n", " ")} ${index + 1}`}><b>+</b><span>{coverT.addCover.split("\n").map((line, lineIndex) => <span key={line}>{line}{lineIndex === 0 && <br />}</span>)}</span><small>{String(index + 1).padStart(2, "0")}</small></button>; })}</div><label className="cover-checkbox cover-ignore-text"><input type="checkbox" checked={coverArtOnlyReferences} onChange={(event) => setCoverArtOnlyReferences(event.target.checked)} /><span><b>{coverT.artOnly}</b><small>{coverT.artOnlyHelp}</small></span></label></section>
              <section className="cover-control"><label htmlFor="cover-brief">{coverT.brief}</label><textarea id="cover-brief" value={coverBrief} onChange={(event) => setCoverBrief(event.target.value)} placeholder={coverT.placeholder} rows={8} /></section>
              <section className="cover-control cover-render-controls"><label htmlFor="cover-medium">{coverT.medium}</label><select id="cover-medium" value={coverMedium} onChange={(event) => setCoverMedium(event.target.value as typeof coverMedium)}><option value="match">{coverT.mediumMatch}</option><option value="photo">{coverT.mediumPhoto}</option><option value="illustration">{coverT.mediumIllustration}</option><option value="3d">{coverT.medium3d}</option></select><label htmlFor="cover-quality">{coverT.sketchQuality}</label><select id="cover-quality" value={coverSketchQuality} onChange={(event) => setCoverSketchQuality(event.target.value as typeof coverSketchQuality)}><option value="fidelity">{coverT.qualityFidelity}</option><option value="fast">{coverT.qualityFast}</option></select>{coverSketchQuality === "fidelity" && <small>{coverT.fidelityNote}</small>}</section>
              <section className="cover-control cover-stock-control"><label className="cover-checkbox"><input type="checkbox" checked={coverUseShutterstock} onChange={(event) => setCoverUseShutterstock(event.target.checked)} /><span><b>{coverT.stock}</b><small>{coverT.stockHelp}</small></span></label>{coverUseShutterstock && <><div className="cover-stock-inputs">{coverStockInputs.map((input, index) => <div key={index}><input value={input} onChange={(event) => setCoverStockInputs((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`${index + 1}. ${coverT.stockInput}`} /><button onClick={() => setCoverStockInputs((current) => current.length === 1 ? [""] : current.filter((_, itemIndex) => itemIndex !== index))} aria-label={coverT.remove}>×</button></div>)}{coverStockInputs.length < 4 && <button className="cover-add-stock-input" onClick={() => setCoverStockInputs((current) => [...current, ""])}>{coverT.addStockInput}</button>}</div><p className="cover-stock-warning" role="note"><strong>!</strong>{coverT.stockWarning}</p></>}</section>
              {coverError && <p className="extraction-error" role="alert">{coverError}</p>}
              <div className="cover-generate-group"><button className="cover-generate" onClick={() => void generateCoverSketches(2)} disabled={coverReferences.length < 2 || !coverBrief.trim() || isGeneratingCover || coverSketches.filter((item) => item.status !== "rejected").length + 2 > 16}><span>{isGeneratingCover && coverGenerationCount === 2 ? `${coverT.generatingCount} 2…` : coverSelectedId ? coverT.generateSelectedTwo : coverT.generateTwo}</span><b>→</b></button><button className="cover-generate" onClick={() => void generateCoverSketches(4)} disabled={coverReferences.length < 2 || !coverBrief.trim() || isGeneratingCover || coverSketches.filter((item) => item.status !== "rejected").length + 4 > 16}><span>{isGeneratingCover && coverGenerationCount === 4 ? `${coverT.generatingCount} 4…` : coverSelectedId ? coverT.generateSelectedFour : coverT.generateFour}</span><b>→</b></button></div>
              <p className="cover-note">{coverT.note}</p>
              {coverSketches.length > 0 && <section className="cover-assets-control"><label>{coverT.manifest}</label><p>{coverT.manifestNote}</p><div className={`cover-production-selection ${coverSelectedId ? "ready" : ""}`}>{coverSelectedId ? `✓ ${coverT.sketch} ${String(coverSketches.filter((item) => item.status !== "rejected").findIndex((item) => item.id === coverSelectedId) + 1).padStart(2, "0")} · black-forest-labs/flux.2-pro · 2K` : language === "cs" ? "Nejprve nahoře vyberte koncept." : "Select a concept above first."}</div>{coverDetectedAssets.length > 0 && <div className="cover-detected-assets"><b>{language === "cs" ? "ROZPOZNANÉ PODKLADY" : "DETECTED STEMS"}</b><ol>{coverDetectedAssets.map((asset) => <li key={asset.name}><span>{asset.name}</span><small>{asset.description}</small></li>)}</ol></div>}<button className="cover-production" onClick={() => void generateCoverLayers()} disabled={!coverSelectedId || isGeneratingLayers}><span>{isGeneratingLayers ? coverT.generatingAssets : coverT.generateAssets}</span><b>→</b></button></section>}
              {coverProductionStage && <div className={`cover-production-progress ${coverProductionStage === "complete" ? "complete" : ""}`} role="status" aria-live="polite"><i /><span>{coverProductionStage === "analyzing" ? language === "cs" ? "1/3 · Rozpoznávání jednotlivých objektů · mistralai/mistral-small-2603" : "1/3 · Detecting individual objects · mistralai/mistral-small-2603" : coverProductionStage === "master" ? language === "cs" ? "2/3 · Vytváření hlavní obálky ve 2K · black-forest-labs/flux.2-pro" : "2/3 · Recreating the 2K cover master · black-forest-labs/flux.2-pro" : coverProductionStage === "assets" ? language === "cs" ? "3/3 · Izolování, regenerování a zvětšování podkladů · black-forest-labs/flux.2-pro" : "3/3 · Isolating, regenerating and upscaling stems · black-forest-labs/flux.2-pro" : language === "cs" ? "Hotovo · 2K obálka a samostatné podklady jsou připravené" : "Complete · 2K master and separate stems are ready"}</span></div>}
            </aside>
          </div>
        ) : selected === "barcode" ? (
          <div className="barcode-module">
            <header className="barcode-header">
              <div><div className="module-code">DESIGN / EAN-13</div><h1>{barcodeT.heading}</h1><p>{barcodeT.subtitle}</p></div>
              <span className="solutions-local-badge"><i />{barcodeT.local}</span>
            </header>
            <div className="barcode-workbench">
              <section className="barcode-controls">
                <label htmlFor="barcode-isbn">{barcodeT.label}</label>
                <input id="barcode-isbn" inputMode="text" autoComplete="off" spellCheck={false} value={barcodeInput} onChange={(event) => setBarcodeInput(event.target.value)} placeholder={barcodeT.placeholder} />
                {barcodeError && <p className="extraction-error" role="alert">{barcodeError}</p>}
                <button className="solutions-create" onClick={downloadBarcode} disabled={!barcodeResult}><span>{barcodeT.generate}</span><b>↓</b></button>
                <p className="solutions-privacy">{barcodeT.privacy}</p>
              </section>
              <section className={`barcode-preview-card ${barcodeResult ? "is-ready" : ""}`}>
                <div className="barcode-preview-head"><span>{barcodeResult ? barcodeT.ready : "PREVIEW"}</span>{barcodeResult && <b>✓ {barcodeResult.source === "ISBN-10" ? barcodeT.converted : barcodeT.valid}</b>}</div>
                <div className="barcode-paper">
                  {barcodeResult ? <svg viewBox="0 0 113 78.6" role="img" aria-label={`EAN-13 ${barcodeResult.digits}`}>
                    <g fill="#000">{[...eanModules(barcodeResult.digits)].map((bit, index) => bit === "1" ? <rect key={index} x={11 + index} y="2" width="1" height={index < 3 || (index >= 45 && index < 50) || index >= 92 ? 68 : 64} /> : null)}</g>
                    <g className="barcode-preview-digits"><text x="2" y="77">{barcodeResult.digits[0]}</text><text x="34" y="77" textAnchor="middle">{barcodeResult.digits.slice(1, 7)}</text><text x="81" y="77" textAnchor="middle">{barcodeResult.digits.slice(7)}</text></g>
                  </svg> : <p>{barcodeT.empty}</p>}
                </div>
                <dl className="barcode-specs"><div><dt>{barcodeT.format}</dt><dd>{barcodeResult?.digits || "—"}</dd></div><div><dt>{barcodeT.size}</dt><dd>100%</dd></div><div><dt>{barcodeT.colour}</dt><dd>K100</dd></div><div><dt>{barcodeT.type}</dt><dd>{language === "cs" ? "VEKTOR" : "VECTOR"}</dd></div></dl>
              </section>
            </div>
          </div>
        ) : selected === "solutions" ? (
          <div className="solutions-module">
            <header className="solutions-header">
              <div>
                <div className="module-code">{language === "cs" ? "DESIGN / ŘEŠENÍ" : "DESIGN / SOLUTIONS"}</div>
                <h1>{solutionsT.heading}</h1>
                <p>{solutionsT.subtitle}</p>
              </div>
              <span className="solutions-local-badge"><i />{solutionsT.local}</span>
            </header>

            <section className="solutions-generator">
              <input ref={solutionsBlankInputRef} type="file" accept="application/pdf,.pdf" onChange={(event) => handleSolutionFileInput("blank", event)} hidden />
              <input ref={solutionsAnswerInputRef} type="file" accept="application/pdf,.pdf" onChange={(event) => handleSolutionFileInput("answers", event)} hidden />
              <div className="solutions-file-grid">
                <button className={solutionsBlankFile ? "has-file" : ""} onClick={() => solutionsBlankInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleSolutionDrop("blank", event)}>
                  <span>01 / {solutionsT.clean}</span><strong>{solutionsBlankFile?.name || solutionsT.choose}</strong><b>{solutionsBlankFile ? "✓" : "+"}</b>
                </button>
                <button className={solutionsAnswerFile ? "has-file" : ""} onClick={() => solutionsAnswerInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleSolutionDrop("answers", event)}>
                  <span>02 / {solutionsT.answers}</span><strong>{solutionsAnswerFile?.name || solutionsT.choose}</strong><b>{solutionsAnswerFile ? "✓" : "+"}</b>
                </button>
              </div>
              {solutionsError && <p className="extraction-error" role="alert">{solutionsError}</p>}
              <button className="solutions-create" onClick={() => void createSolutionJson()} disabled={!solutionsBlankFile || !solutionsAnswerFile || isExtractingSolutions}>
                <span>{isExtractingSolutions ? `${solutionsT.comparing} ${solutionsProgress}%` : solutionsResult ? solutionsT.again : solutionsT.compare}</span><b>{isExtractingSolutions ? "…" : "↓"}</b>
              </button>
              {(isExtractingSolutions || solutionsLog.length > 0) && <div className="solutions-progress" aria-live="polite">
                <div className="solutions-progress-head"><span>{solutionsT.log}</span><b>{solutionsProgress}%</b></div>
                <div className="solutions-progress-track"><i style={{ width: `${solutionsProgress}%` }} /></div>
                <div className="solutions-console">{solutionsLog.map((line, index) => <code key={`${index}-${line}`}>{line}</code>)}</div>
              </div>}
              {solutionsResult && <p className="solutions-success">✓ {solutionsT.success}</p>}
              <p className="solutions-privacy">{solutionsT.privacy}</p>
            </section>

            <div className="solutions-content">
              <aside className="solutions-summary">
                <span>{solutionsT.download}</span>
                <div className="solutions-downloads">
                  <a href="/solutions/import_solution_text.jsx" download><b>JSX</b><span><strong>{solutionsT.importer}</strong><small>import_solution_text.jsx</small></span><i>↓</i></a>
                </div>
                <span>{solutionsT.need}</span>
                <ul>{solutionsT.needs.map((item) => <li key={item}>{item}</li>)}</ul>
                <div className="solutions-note"><b>{solutionsT.warningTitle}</b><br />{solutionsT.warning}</div>
              </aside>

              <div className="solutions-steps">
                <section className="solution-step">
                  <span className="step-number">01</span>
                  <div>
                    <h2>{solutionsT.steps[0][0]}</h2><p>{solutionsT.steps[0][1]}</p>
                  </div>
                </section>

                <section className="solution-step">
                  <span className="step-number">02</span>
                  <div>
                    <h2>{solutionsT.steps[1][0]}</h2><p>{solutionsT.steps[1][1]}</p>
                  </div>
                </section>

                <section className="solution-step">
                  <span className="step-number">03</span>
                  <div>
                    <h2>{solutionsT.steps[2][0]}</h2><p>{solutionsT.steps[2][1]}</p>
                  </div>
                </section>

                <section className="solution-step">
                  <span className="step-number">04</span>
                  <div>
                    <h2>{solutionsT.steps[3][0]}</h2><p>{solutionsT.steps[3][1]}</p>
                    <ul className="check-list">{solutionsT.checks.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </section>

                <section className="solutions-troubleshooting">
                  <h2>{solutionsT.trouble}</h2>
                  <dl>{solutionsT.troubles.map(([title, body]) => <div key={title}><dt>{title}</dt><dd>{body}</dd></div>)}</dl>
                </section>
              </div>
            </div>
          </div>
        ) : selected === "extraction" ? (
          <div className={`extraction-module ${sourceKind ? "has-source" : ""}`}>
            <div className="extraction-head">
              {!sourceKind && <div className="module-code">{selectedSection} / EXTRACTION</div>}
              <h1>{t.apps.extraction}</h1>
              <input ref={fileInputRef} type="file" accept="application/pdf,image/png,image/jpeg" onChange={handleFileInput} hidden />
              <button
                className="start-button upload-button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <span>{sourceKind ? t.another : t.upload}</span><b>＋</b>
              </button>
              {extractionError && <p className="extraction-error" role="alert">{extractionError}</p>}
            </div>

            {sourceKind && (
              <div className="extraction-body">
                <div className="extraction-panes">
                  <section className="source-pane">
                    <div className="pane-label"><span>{t.source}</span><span>{sourceFile?.name || "PASTED TEXT"}</span></div>
                    <div className="source-viewer">
                      {sourceKind === "image" && sourceUrl && <img src={sourceUrl} alt={sourceFile?.name || t.source} />}
                      {sourceKind === "pdf" && sourceUrl && <iframe src={sourceUrl} title={sourceFile?.name || t.source} />}
                      {sourceKind === "text" && <div className="pasted-source">{ocrText}</div>}
                    </div>
                  </section>
                  <section className="text-pane">
                    <div className="pane-label"><span>{t.extractedText}</span><span>OCR / TXT</span></div>
                    <div className="output-actions">
                      <button className="copy-button" onClick={copyOcrText} disabled={!ocrText} aria-label={t.copyText}>{copied ? "✓" : "▣"}<span>{copied ? t.copied : t.copyText}</span></button>
                      <button className="download-button" onClick={() => downloadText(ocrText, "extracted-text.md", "text/markdown")} disabled={!ocrText}>MD</button>
                      <button className="download-button" onClick={() => downloadText(ocrText, "extracted-text.txt", "text/plain")} disabled={!ocrText}>TXT</button>
                    </div>
                    {isProcessing || isCorrecting ? <LoadingText items={t.processing} /> : <textarea value={ocrText} onChange={(event) => setOcrText(event.target.value)} spellCheck />}
                  </section>
                </div>
                <div className="correction-box">
                  <textarea rows={2} value={correctionPrompt} onChange={(event) => setCorrectionPrompt(event.target.value)} placeholder={t.correctionPlaceholder} disabled={isCorrecting} />
                  <button onClick={correctText} disabled={!ocrText.trim() || !correctionPrompt.trim() || isCorrecting} aria-label={t.correct}>{isCorrecting ? "…" : "→"}</button>
                </div>
              </div>
            )}
          </div>
        ) : selected === "index" ? (
          <div className={`index-module ${indexFile ? "has-file" : ""}`}>
            <input ref={indexFileInputRef} type="file" accept="application/pdf" onChange={handleIndexFileInput} hidden />
            {!indexFile ? (
              <div className="index-head">
                <div className="module-code">{selectedSection} / INDEX</div>
                <h1>{t.apps.index}</h1>
                <button className="start-button upload-button" onClick={() => indexFileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={handleIndexDrop}>
                  <span>{t.indexUpload}</span><b>＋</b>
                </button>
                <textarea className="word-list-input" value={indexWords} onChange={(event) => setIndexWords(event.target.value)} placeholder={t.wordList} rows={7} />
                <span className="local-note">● {t.localExtraction}</span>
                {indexError && <p className="extraction-error" role="alert">{indexError}</p>}
              </div>
            ) : (
              <div className="index-split">
                <section className="source-pane index-pdf-column">
                  <div className="pane-label"><span>{t.source}</span><span>{indexFile.name}</span></div>
                  <div className="source-viewer">{indexUrl && <iframe key={indexPreviewPage} src={`${indexUrl}#page=${indexPreviewPage}`} title={indexFile.name} />}</div>
                </section>
                <div className="index-side-column">
                  <div className="index-active-head">
                    <h1>{t.apps.index}</h1>
                    <button className="start-button upload-button" onClick={() => indexFileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={handleIndexDrop}>
                      <span>{t.another}</span><b>＋</b>
                    </button>
                    {indexError && <p className="extraction-error" role="alert">{indexError}</p>}
                  </div>
                <div className="index-controls">
                  <div className="index-words-block">
                    <label>{t.wordList}</label>
                    <textarea value={indexWords} onChange={(event) => setIndexWords(event.target.value)} rows={5} />
                  </div>
                  <button className="index-run" onClick={createIndex} disabled={!indexWords.trim() || isIndexing}>
                    <span>{t.createIndex}</span><b>{isIndexing ? `${indexProgress}%` : "→"}</b>
                  </button>
                  <span className="local-note">● {t.localExtraction}</span>
                </div>
                <section className="text-pane index-output-pane">
                  <div className="pane-label index-output-label"><span>{t.indexOutput}</span><span>{t.indexLegend}</span></div>
                  <div className="output-actions">
                    <button className="copy-button" onClick={copyIndex} disabled={!indexResult} aria-label={t.copyText}>{indexCopied ? "✓" : "▣"}<span>{indexCopied ? t.copied : t.copyText}</span></button>
                    <button className="download-button" onClick={() => downloadText(indexResult, "index.md", "text/markdown")} disabled={!indexResult}>MD</button>
                    <button className="download-button" onClick={() => downloadText(indexResult, "index.txt", "text/plain")} disabled={!indexResult}>TXT</button>
                  </div>
                  {isIndexing ? <LoadingText items={t.indexProcessing} /> : indexMatches.length ? (
                    <div className="index-result-view" aria-label={t.indexOutput}>
                      {indexMatches.map(({ word, pdfPages, otherPdfPages }) => (
                        <div className="index-result-line" key={word}>
                          <span className="index-result-term">{word}</span>
                          <span className="index-result-pages">
                            {pdfPages.map((pdfPage, index) => {
                              const printedPage = printedAnchor + pdfPage - pdfAnchor;
                              return <span key={pdfPage}>{index > 0 && ", "}<button type="button" onClick={() => setIndexPreviewPage(pdfPage)} title={`${t.printedPage} ${printedPage} · ${t.pdfPage} ${pdfPage}`}>{printedPage}</button></span>;
                            })}
                          </span>
                          <span className="index-result-pages index-result-other">(
                            {otherPdfPages.map((pdfPage, index) => {
                              const printedPage = printedAnchor + pdfPage - pdfAnchor;
                              return <span key={pdfPage}>{index > 0 && ", "}<button type="button" onClick={() => setIndexPreviewPage(pdfPage)} title={`${t.printedPage} ${printedPage} · ${t.pdfPage} ${pdfPage}`}>{printedPage}</button></span>;
                            })}
                          )</span>
                        </div>
                      ))}
                    </div>
                  ) : <textarea value={indexResult} readOnly spellCheck={false} />}
                </section>
                <div className="page-map">
                  <span>{t.pageMapping}</span>
                  <label>{t.pdfPage}<input type="number" min="1" value={pdfAnchor} onChange={(event) => setPdfAnchor(Math.max(1, Number(event.target.value)))} /></label>
                  <span>→</span>
                  <label>{t.printedPage}<input type="number" min="1" value={printedAnchor} onChange={(event) => setPrintedAnchor(Math.max(1, Number(event.target.value)))} /></label>
                </div>
                </div>
              </div>
            )}
          </div>
        ) : selected === "prompt" ? (
          <div className={`prompt-module ${promptFile ? "has-file" : ""}`}>
            <input ref={promptFileInputRef} type="file" accept="application/pdf" onChange={handlePromptFileInput} hidden />
            {!promptFile ? (
              <div className="index-head">
                <div className="module-code">{selectedSection} / PROMPT</div>
                <h1>{t.apps.prompt}</h1>
                <p>{language === "cs" ? "Z obrázků v rukopisu vytvoří jednoduché prompty bez textu a stylu." : "Turn manuscript illustrations into simple prompts without text or styling."}</p>
                <button className="start-button upload-button" onClick={() => promptFileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={handlePromptDrop}>
                  <span>{t.promptUpload}</span><b>＋</b>
                </button>
                {promptError && <p className="extraction-error" role="alert">{promptError}</p>}
              </div>
            ) : (
              <div className="prompt-split">
                <section className="source-pane prompt-pdf-column">
                  <div className="pane-label"><span>{t.source}</span><span>{promptFile.name}</span></div>
                  <div className="source-viewer">{promptUrl && <iframe src={promptUrl} title={promptFile.name} />}</div>
                </section>
                <div className="prompt-side-column">
                  <div className="prompt-active-head">
                    <div>
                      <h1>{t.apps.prompt}</h1>
                      <span>{isExtractingPrompts ? `${promptProgress}%` : "PDF → TXT"}</span>
                    </div>
                    <button className="start-button upload-button" onClick={() => promptFileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={handlePromptDrop} disabled={isExtractingPrompts}>
                      <span>{t.another}</span><b>＋</b>
                    </button>
                    {promptError && <p className="extraction-error" role="alert">{promptError}</p>}
                  </div>
                  <section className="text-pane prompt-output-pane">
                    <div className="pane-label"><span>{t.extractedPrompts}</span><span>{language === "cs" ? "JEDNODUCHÉ / SLOŽITÉ" : "SIMPLE / COMPLEX"}</span></div>
                    <div className="output-actions">
                      <button className="copy-button" onClick={copyPrompts} disabled={!promptResult} aria-label={t.copyText}>{promptCopied ? "✓" : "▣"}<span>{promptCopied ? t.copied : t.copyText}</span></button>
                      <button className="download-button" onClick={() => downloadText(promptResult, "illustration-prompts.md", "text/markdown")} disabled={!promptResult}>MD</button>
                      <button className="download-button" onClick={() => downloadText(promptResult, "illustration-prompts.txt", "text/plain")} disabled={!promptResult}>TXT</button>
                    </div>
                    {isExtractingPrompts ? <LoadingText items={t.promptProcessing} /> : (
                      <textarea value={promptResult} onChange={(event) => setPromptResult(event.target.value)} placeholder={promptError ? "" : t.noIllustrations} spellCheck />
                    )}
                  </section>
                </div>
              </div>
            )}
          </div>
        ) : selected === "graph" || selected === "bio" || selected === "map" ? (
          <div className={`figure-module ${figureMode === "map" ? "map-module" : ""}`}>
            <div className={`figure-workbench ${figureMode === "map" ? "map-workbench" : ""}`}>
              <section className="figure-controls">
                {figureMode === "map" ? <div className="map-editor-controls">
                  <div className="map-year-field"><span>{figureT.timeline} · {figureT.negativeBce}</span><div><button type="button" onClick={() => stepTimelineYear(-1)} disabled={timelineYear <= -3400} aria-label={figureT.previousYear}><i /></button><input aria-label={figureT.mapYear} type="number" min="-3400" max="2026" value={timelineYearInput} onChange={(event) => changeTimelineYearInput(event.target.value)} onBlur={commitTimelineYear} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><button type="button" onClick={() => stepTimelineYear(1)} disabled={timelineYear >= 2026} aria-label={figureT.nextYear}><i /></button></div></div>
                  <div className="map-year-slider"><input aria-label={figureT.historicalTimeline} type="range" min="-3400" max="2026" value={timelineYear} onChange={(event) => { let year = Number(event.currentTarget.value); if (year === 0) year = 1; setTimelineYear(year); setTimelineYearInput(String(year)); }} onPointerUp={(event) => { let year = Number(event.currentTarget.value); if (year === 0) year = 1; void loadTimelineYear(year); }} /><div><span>3400 {figureT.bce}</span><span>1 {figureT.ce}</span><span>2026</span></div></div>
                  {isLoadingTimeline && <p className="map-timeline-status">Loading {timelineYear < 0 ? `${Math.abs(timelineYear)} BCE` : timelineYear}…</p>}
                  {figureError && <p className="extraction-error" role="alert">{figureError}</p>}
                  <fieldset><legend>{figureT.layers}</legend>{Object.entries(mapLayers).map(([layer, enabled]) => <label className={`map-layer-${layer}`} key={layer}><input type="checkbox" checked={enabled} onChange={() => { const next = !enabled; setMapLayers((current) => ({ ...current, [layer]: next })); if (["climate", "terrain", "mountains", "cities", "disputed"].includes(layer) && next && !figureOutput?.svg.includes(`id="${layer === "disputed" ? "disputed-boundaries" : layer === "climate" ? "climate-zones" : layer}"`)) void loadTimelineYear(timelineYear); }} />{figureT.mapLayers[layer as keyof typeof figureT.mapLayers]}</label>)}</fieldset>
                  {mapLayers.climate && <div className="map-climate-key"><p className="map-layer-note">{figureT.climateNote}</p><div>{["#e45745", "#e6ad3c", "#69ad63", "#4f83cc", "#8d67b1"].map((color, index) => <span key={color}><i style={{ background: color }} />{figureT.climateLabels[index]}</span>)}</div></div>}
                  {(mapLayers.terrain || mapLayers.mountains || mapLayers.cities || mapLayers.disputed) && <p className="map-layer-note">{figureT.presentLayersNote}</p>}
                  <button type="button" className={`map-fill-toggle ${mapFillMode ? "active" : ""}`} aria-pressed={mapFillMode} onClick={() => setMapFillMode((active) => !active)}><i /><span>{figureT.fillCountries}{mapFillMode ? `: ${figureT.on}` : ""}</span></button>
                  <div className="map-view-buttons"><button type="button" onClick={() => setMapZoom((value) => Math.min(40, value * 1.5))}>{figureT.zoomIn}</button><button type="button" onClick={() => setMapZoom((value) => Math.max(.5, value / 1.5))}>{figureT.zoomOut}</button><button type="button" onClick={() => { setMapZoom(1); setMapPan({ x: 0, y: 0 }); }}>{figureT.resetView}</button></div>
                  <p>{figureT.mapInstructions}</p>
                  <div className="map-palette"><span>{figureT.adobePalette}</span><input ref={figurePaletteInputRef} type="file" accept=".ase,application/octet-stream" onChange={(event) => void addFigurePalette(event)} hidden />{figurePalette.length ? <><div className="map-palette-swatches">{figurePalette.map((swatch, index) => <i key={`${swatch.name}-${index}`} style={{ background: swatch.hex }} title={swatch.name} />)}</div><div><button type="button" onClick={() => figurePaletteInputRef.current?.click()}>{figureT.replacePalette}</button><button type="button" onClick={() => applyMapPalette(false)}>{figureT.applyPalette}</button><button type="button" onClick={() => applyMapPalette(true)}>{figureT.shufflePalette}</button></div></> : <button type="button" onClick={() => figurePaletteInputRef.current?.click()}>{figureT.importPalette}</button>}</div>
                  <label className="map-prompt-field"><span>{figureT.editMap}</span><textarea value={mapEditPrompt} onChange={(event) => setMapEditPrompt(event.target.value)} placeholder={figureT.mapPrompt} rows={4} /></label>
                  {figureOutput && <div className="map-export-actions"><button type="button" onClick={downloadCroppedMap}>{figureT.downloadSvg}<b>↓</b></button></div>}
                  {figureOutput?.checks.some(({ level }) => level === "warning") && <div className="map-panel-warnings"><span>{figureT.warnings}</span>{figureOutput.checks.filter(({ level }) => level === "warning").map((check, index) => <p key={`${check.message}-${index}`}><b>!</b>{check.message}</p>)}</div>}
                </div> : <>
                <div className="figure-label-row"><label htmlFor="figure-request">{figureT.label}</label><button type="button" onClick={() => setFigureRequest(figureMode === "diagram" ? (language === "cs" ? "Popsané biologické schéma měňavky pro žáky 2. stupně. Zobraz buněčnou membránu, cytoplazmu, jádro, potravní vakuolu, stažitelnou vakuolu a panožky." : "A labelled biological diagram of an amoeba for lower-secondary students. Show the cell membrane, cytoplasm, nucleus, food vacuole, contractile vacuole, and pseudopodia.") : (language === "cs" ? "Vytvoř sloupcový graf s názvem Podíl obnovitelné energie. Česko: 2021 17,7; 2022 18,2; 2023 18,6. Jednotka: %. Zdroj S1: Eurostat, https://ec.europa.eu/eurostat" : "Create a bar chart titled Renewable energy share. Czechia: 2021 17.7; 2022 18.2; 2023 18.6. Unit: %. Source S1: Eurostat, https://ec.europa.eu/eurostat"))}>{figureT.example}</button></div>
                <textarea className={figureMode === "chart" ? "chart-request" : ""} id="figure-request" value={figureRequest} onChange={(event) => setFigureRequest(event.target.value)} placeholder={figureMode === "diagram" ? (language === "cs" ? "Například: Popsané biologické schéma měňavky pro žáky 2. stupně." : "For example: A labelled biological diagram of an amoeba for lower-secondary students.") : figureT.placeholder} rows={figureMode === "chart" ? 12 : 7} disabled={isGeneratingFigure} />
                <div className="figure-palette"><span>{figureT.palette}</span><input ref={figurePaletteInputRef} type="file" accept=".ase,application/octet-stream" onChange={(event) => void addFigurePalette(event)} hidden />{figurePalette.length ? <><div className="figure-palette-head"><b>{figurePaletteName}</b><button type="button" onClick={() => { setFigurePalette([]); setFigurePaletteName(""); setFigureOutput(null); }}>{figureT.clearPalette}</button></div><div className="figure-swatches">{figurePalette.map((swatch, index) => <i key={`${swatch.name}-${index}`} title={`${swatch.name} · ${swatch.model} · ${swatch.hex}`} style={{ background: swatch.hex }} />)}</div></> : <button type="button" className="figure-add-palette" onClick={() => figurePaletteInputRef.current?.click()}><b>＋</b>{figureT.addPalette}</button>}</div>
                {figureMode !== "chart" && <div className="figure-references"><span>{figureT.references}</span><input ref={figureReferenceInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void addFigureReferences(event)} hidden /><div>{figureReferences.map((reference, index) => <figure key={`${reference.name}-${index}`}><img src={reference.data} alt={reference.name} /><figcaption>{reference.name}</figcaption><button onClick={() => setFigureReferences((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`${figureT.remove} ${reference.name}`}>×</button></figure>)}{figureReferences.length < 3 && <button className="figure-add-reference" onClick={() => figureReferenceInputRef.current?.click()}><b>＋</b>{figureT.addReference}</button>}</div></div>}
                {figureError && <p className="extraction-error" role="alert">{figureError}</p>}
                <button className="figure-generate" onClick={() => void generateFigure()} disabled={!figureRequest.trim() || isGeneratingFigure}><span>{isGeneratingFigure ? `${figureT.generating} · ${formatFigureCountdown(figureSecondsLeft)}` : figureT.generate}</span><b>{isGeneratingFigure ? "…" : "→"}</b></button>
                <p className="figure-warning">{figureT.warning}</p>
                {figureOutput && <div className="figure-checks"><span>{figureT.checks}</span>{figureOutput.checks.map((check, index) => <p className={check.level} key={`${check.message}-${index}`}><b>{check.level === "pass" ? "✓" : "!"}</b>{check.message}</p>)}</div>}
                </>}
              </section>
              <div className="figure-preview-column">
                <header className="figure-header">
                  <div><div className="figure-meta"><span className="module-code">{selectedSection} / {figureMode.toUpperCase()} / SVG V1</span><span className="figure-badge"><i />{figureT.badge}</span></div><h1>{selectedLabel}</h1><p>{figureT.subtitle}</p></div>
                </header>
                <section className="figure-result">
                  <div className="pane-label"><span>{figureT.preview}</span><span>1000 × 680 / SVG 1.1</span></div>
                  <div className={`figure-paper ${figureMode === "map" ? `map-editor-canvas hide-information ${mapLayers.boundaries ? "" : "hide-boundaries"} ${mapLayers.labels ? "" : "hide-labels"} ${mapLayers.water ? "" : "hide-water"} ${mapLayers.climate ? "" : "hide-climate"} ${mapLayers.terrain ? "" : "hide-terrain"} ${mapLayers.mountains ? "" : "hide-mountains"} ${mapLayers.cities ? "" : "hide-cities"} ${mapLayers.disputed ? "" : "hide-disputed"}` : ""}`} onPointerDown={figureMode === "map" ? mapPointerDown : undefined} onPointerMove={figureMode === "map" ? mapPointerMove : undefined} onPointerUp={figureMode === "map" ? mapPointerUp : undefined} onWheel={figureMode === "map" ? mapWheel : undefined} onDragStart={figureMode === "map" ? (event) => event.preventDefault() : undefined}>{isGeneratingFigure ? <LoadingText items={figureMode === "diagram" ? t.diagramProcessing : figureMode === "chart" ? t.graphProcessing : t.figureProcessing} /> : figureOutput ? <><div className={`map-transform ${mapZoom >= 8 ? "map-zoom-detail" : mapZoom >= 3 ? "map-zoom-regional" : "map-zoom-world"}`} style={figureMode === "map" ? { width: `${mapZoom * 100}%`, height: `${mapZoom * 100}%`, left: `calc(50% + ${mapPan.x}px)`, top: `calc(50% + ${mapPan.y}px)`, "--map-country-label-size": `${(6 + mapZoom * .7) / mapZoom}px`, "--map-country-halo-size": `${(1.5 + mapZoom * .12) / mapZoom}px`, "--map-water-label-size": `${(7 + mapZoom * .8) / mapZoom}px`, "--map-water-halo-size": `${(1.7 + mapZoom * .12) / mapZoom}px`, "--map-city-radius": `${Math.max(.45, 1.7 / mapZoom)}px`, "--map-city-offset": `${Math.max(1.2, 4 / mapZoom)}px` } as React.CSSProperties : undefined} dangerouslySetInnerHTML={{ __html: figureOutput.svg }} />{figureMode === "map" && <i className="map-export-crop" aria-hidden="true" />}</> : <p>{figureT.empty}</p>}</div>
                  {figureOutput && <>
                    {figureMode !== "map" && <div className="figure-actions"><button onClick={() => downloadFigure(figureOutput.svg, `${figureOutput.spec.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "figure"}.svg`, "image/svg+xml")}>{figureT.downloadSvg}<b>↓</b></button><button onClick={() => downloadFigure(verificationMarkdown(figureOutput.report), "figure-verification.md", "text/markdown")}>{figureT.downloadReport}<b>↓</b></button></div>}
                  </>}
                </section>
              </div>
            </div>
          </div>
        ) : selected === "grep" ? (
          <div className="grep-module">
            <div className="module-code">{selectedSection} / GREP</div>
            <h1>{t.apps.grep}</h1>
            <div className="grep-fields">
              <label className={`grep-field ${grepResult ? "has-result" : ""}`}>
                <span>{t.grepFind}</span>
                <input value={grepResult?.findWhat ?? grepFindPrompt} onChange={(event) => setGrepFindPrompt(event.target.value)} readOnly={Boolean(grepResult)} />
                {grepResult && <button onClick={() => copyGrep(grepResult.findWhat, "find")} aria-label={t.copyText}>{grepCopied === "find" ? "✓" : "▣"}</button>}
              </label>
              <label className={`grep-field ${grepResult ? "has-result" : ""}`}>
                <span>{t.grepReplace}</span>
                <input value={grepResult?.replaceWith ?? grepReplacePrompt} onChange={(event) => setGrepReplacePrompt(event.target.value)} readOnly={Boolean(grepResult)} />
                {grepResult && <button onClick={() => copyGrep(grepResult.replaceWith, "replace")} aria-label={t.copyText}>{grepCopied === "replace" ? "✓" : "▣"}</button>}
              </label>
            </div>
            {grepError && <p className="extraction-error" role="alert">{grepError}</p>}
            <button
              className="grep-generate"
              onClick={() => grepResult ? setGrepResult(null) : void generateGrep()}
              disabled={!grepResult && (!grepFindPrompt.trim() || !grepReplacePrompt.trim() || isGeneratingGrep)}
            >
              <span>{grepResult ? t.tryAgain : t.generateGrep}</span><b>{isGeneratingGrep ? "…" : "→"}</b>
            </button>
          </div>
        ) : (
        <div className={`welcome ${selectedLabel ? "has-selection" : ""}`}>
          {selectedLabel ? (
            <>
              <div className="module-code">{selectedSection} / {selected?.toUpperCase()}</div>
              <h1>{selectedLabel}</h1>
              <button className="start-button">{t.ready}<span>→</span></button>
            </>
          ) : (
            <>
              <div className="crosshair" aria-hidden="true"><span /><span /></div>
              <h1>{t.prompt}</h1>
            </>
          )}
        </div>
        )}
        <div className="workspace-status">
          <span className="live-clock">{clockHours}<i className={now && now.getSeconds() % 2 === 0 ? "visible" : ""}>:</i>{clockMinutes}</span>
          <span>{localDate}</span>
          <span className="nameday" title={nameday}>{nameday.toLocaleUpperCase("cs-CZ")}</span>
        </div>
      </section>

      {infoOpen && <button className="drawer-scrim" onClick={() => setInfoOpen(false)} aria-label={t.close} />}
      {zoomedManualImage && <div className="manual-lightbox" role="dialog" aria-modal="true" aria-label={zoomedManualImage.caption} onClick={() => setZoomedManualImage(null)}><button className="manual-lightbox-close" onClick={() => setZoomedManualImage(null)} aria-label={t.close}>×</button><figure onClick={(event) => event.stopPropagation()}><img src={zoomedManualImage.src} alt={zoomedManualImage.caption} /><figcaption>{zoomedManualImage.caption}</figcaption></figure></div>}
      {zoomedCover && <div className="manual-lightbox cover-lightbox" role="dialog" aria-modal="true" aria-label={zoomedCover.name || coverT.heading} onClick={() => setZoomedCover(null)}><button className="manual-lightbox-close" onClick={() => setZoomedCover(null)} aria-label={coverT.close}>×</button><button className="cover-lightbox-arrow previous" onClick={(event) => { event.stopPropagation(); moveZoomedCover(-1); }} aria-label={language === "cs" ? "Předchozí obrázek" : "Previous image"}>←</button><figure onClick={(event) => event.stopPropagation()}><img src={zoomedCover.data} alt={zoomedCover.name || coverT.heading} /><figcaption>{zoomedCover.name || `${coverT.sketch} · seed ${zoomedCover.seed}`}</figcaption></figure><button className="cover-lightbox-arrow next" onClick={(event) => { event.stopPropagation(); moveZoomedCover(1); }} aria-label={language === "cs" ? "Další obrázek" : "Next image"}>→</button></div>}
      <aside className={`info-drawer ${infoOpen ? "open" : ""}`} aria-hidden={!infoOpen}>
        <div className="drawer-header">
          <span>INFO / {selected?.toUpperCase() || "ROBOT"}</span>
          <button onClick={() => setInfoOpen(false)} aria-label={t.close}>×</button>
        </div>
        <div className="drawer-content">
          <span className="drawer-kicker">TAKTIK ROBOT</span>
          <h2>{selectedLabel || t.about}</h2>
          <h3>{language === "cs" ? "Co to je?" : "What is this?"}</h3>
          {help.what.map((paragraph, index) => {
            if (selected === "solutions" && index === 2) {
              const separator = paragraph.indexOf(":");
              return <p className="drawer-editor" key={paragraph}><strong>{paragraph.slice(0, separator + 1)}</strong>{paragraph.slice(separator + 1)}</p>;
            }
            return <p className={selected === "solutions" && index === 1 ? "drawer-warning" : undefined} key={paragraph}>{paragraph}</p>;
          })}
          <h3>{language === "cs" ? "Jak to funguje?" : "How does it work?"}</h3>
          <p>{help.how}</p>
        </div>
        <div className="orange-block" aria-hidden="true" />
      </aside>
    </main>
  );
}

function LoadingText({ items, compact = false }: { items: readonly string[]; compact?: boolean }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const phraseTimer = window.setInterval(() => setIndex((value) => (value + 1) % items.length), 3000);
    return () => window.clearInterval(phraseTimer);
  }, [items.length]);
  return <div className={`loading-copy ${compact ? "compact" : ""}`} role="status"><span>{items[index]}</span></div>;
}

function PageLoadStatus({ items }: { items: readonly string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const selection = window.setTimeout(() => setIndex(Math.floor(Math.random() * items.length)), 0);
    return () => window.clearTimeout(selection);
  }, [items.length]);
  return <span>{items[index]}</span>;
}

function formatIndexOutput(matches: Array<{ word: string; pdfPages: number[]; otherPdfPages: number[] }>, pdfAnchor: number, printedAnchor: number) {
  const toPrintedPages = (pages: number[]) => [...new Set(pages.map((page) => printedAnchor + page - pdfAnchor).filter((page) => page > 0))].sort((a, b) => a - b);
  return matches.map(({ word, pdfPages, otherPdfPages }) => {
    const printedPages = [...new Set(pdfPages.map((page) => printedAnchor + page - pdfAnchor).filter((page) => page > 0))].sort((a, b) => a - b);
    const otherPrintedPages = toPrintedPages(otherPdfPages);
    return `${word}\t${printedPages.join(", ")}\t(${otherPrintedPages.join(", ")})`;
  }).join("\n");
}

function formatPromptOutput(items: IllustrationPrompt[]) {
  const seen = new Set<string>();
  const sorted = [...items]
    .sort((left, right) => left.page - right.page)
    .filter((item) => {
      const key = item.prompt.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ").replace(/[.,;:!?]+$/g, "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const simple = sorted.filter((item) => item.complexity === "simple");
  const complex = sorted.filter((item) => item.complexity === "complex");
  const lines = (group: IllustrationPrompt[]) => group.map((item) => item.prompt).join("\n");
  if (simple.length && complex.length) return `# SIMPLE\n\n${lines(simple)}\n\n# COMPLEX\n\n${lines(complex)}`;
  return lines(simple.length ? simple : complex);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "asset";
}

function createZip(entries: Array<{ name: string; data: Uint8Array }>) {
  const encoder = new TextEncoder(); const chunks: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  const write32 = (view: DataView, position: number, value: number) => view.setUint32(position, value >>> 0, true);
  const write16 = (view: DataView, position: number, value: number) => view.setUint16(position, value, true);
  for (const entry of entries) {
    const name = encoder.encode(entry.name); const checksum = crc32(entry.data); const header = new Uint8Array(30 + name.length); const view = new DataView(header.buffer);
    write32(view, 0, 0x04034b50); write16(view, 4, 20); write16(view, 8, 0); write32(view, 14, checksum); write32(view, 18, entry.data.length); write32(view, 22, entry.data.length); write16(view, 26, name.length); header.set(name, 30);
    chunks.push(header, entry.data);
    const record = new Uint8Array(46 + name.length); const recordView = new DataView(record.buffer); write32(recordView, 0, 0x02014b50); write16(recordView, 4, 20); write16(recordView, 6, 20); write16(recordView, 10, 0); write32(recordView, 16, checksum); write32(recordView, 20, entry.data.length); write32(recordView, 24, entry.data.length); write16(recordView, 28, name.length); write32(recordView, 42, offset); record.set(name, 46); central.push(record); offset += header.length + entry.data.length;
  }
  const centralSize = central.reduce((total, item) => total + item.length, 0); const end = new Uint8Array(22); const endView = new DataView(end.buffer); write32(endView, 0, 0x06054b50); write16(endView, 8, entries.length); write16(endView, 10, entries.length); write32(endView, 12, centralSize); write32(endView, 16, offset); return new Blob([...chunks, ...central, end].map((chunk) => chunk.slice().buffer));
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const value of bytes) { crc ^= value; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ -1) >>> 0;
}
