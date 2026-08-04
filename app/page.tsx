"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { czechNamedays } from "./czechNamedays";

type Language = "en" | "cs";
type Theme = "light" | "dark";

const copy = {
  en: {
    prompt: "Let’s go!",
    text: "Text",
    design: "Design",
    apps: {
      extraction: "Text Extraction",
      index: "Index Creator",
      typesetter: "Typesetter",
      prompt: "Prompt Extraction",
      image: "Image Generation",
      cover: "Cover Generator",
      figure: "Figure Generator",
      grep: "GREP Builder",
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
    comingSoon: "It’s nice to have something to look forward to.",
    processing: ["communicating", "calculating", "formatting", "slicing bread", "spreading butter", "packing lunch", "looking up the way to the library", "waiting for the tram", "looking for a place to sit", "2+2=???", "abort search", "looking for a bench to sit in the park", "consuming sandwich", "looking into empty space", "looking up at the trees"],
    indexProcessing: ["opening the book", "finding page one", "counting pages", "sharpening a pencil", "sorting the alphabet", "conjugating verbs", "declining nouns", "checking the margins", "ignoring the table of contents", "looking for tiny page numbers", "matching word endings", "arguing with grammar", "building index cards", "removing duplicates", "alphabetizing everything"],
    about: "About Taktik Automat",
    aboutBody:
      "A focused workspace for preparing textbook content, layouts and visual materials.",
    close: "Close information",
  },
  cs: {
    prompt: "Jdeme na to!",
    text: "Text",
    design: "Design",
    apps: {
      extraction: "Extrakce textu",
      index: "Tvůrce rejstříku",
      typesetter: "Sazba",
      prompt: "Extrakce promptů",
      image: "Generování obrázků",
      cover: "Generátor obálek",
      figure: "Generátor ilustrací",
      grep: "Tvůrce GREP výrazů",
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
    comingSoon: "Je to fajn mít se na co těšit.",
    processing: ["komunikace", "kalkulace", "informace", "krájení chleba", "mazání chleba máslem", "balení svačiny", "vyhledávání cesty do knihovny", "čekání na tramvaj", "hledání místa k sezení", "2+2=???", "rušení hledání", "hledání lavičky v parku", "konzumace svačiny", "koukání do blba", "koukání na stromy"],
    indexProcessing: ["otevírání knihy", "hledání první strany", "počítání stran", "ořezávání tužky", "řazení abecedy", "časování sloves", "skloňování podstatných jmen", "kontrola okrajů", "ignorování obsahu", "hledání malých čísel stran", "porovnávání koncovek", "hádání s gramatikou", "zakládání kartotéky", "odstraňování duplicit", "řazení všeho podle abecedy"],
    about: "O aplikaci Taktik Automat",
    aboutBody:
      "Soustředěné pracovní prostředí pro přípravu učebnic, sazby a obrazových materiálů.",
    close: "Zavřít informace",
  },
} as const;

const groups = [
  { key: "text" as const, items: ["extraction", "index"] as const },
  {
    key: "design" as const,
    items: ["grep", "typesetter", "prompt", "image", "cover", "figure"] as const,
  },
];

const completedApps = new Set(["extraction", "index", "grep"]);

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
    general: {
      what: ["Taktik Automat is a focused set of tools for preparing textbook content, layouts and visual materials."],
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
    general: {
      what: ["Taktik Automat je soustředěná sada nástrojů pro přípravu obsahu, sazby a obrazových materiálů učebnic."],
      how: "Vyberte nástroj vlevo. Každý modul zde vysvětluje, co dělá, které kroky probíhají místně a jaké služby AI používá.",
    },
  },
} as const;

export default function Home() {
  const [theme, setTheme] = useState<Theme>("light");
  const [language, setLanguage] = useState<Language>("en");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [open, setOpen] = useState({ text: true, design: true });
  const [selected, setSelected] = useState<string | null>(null);
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
  const indexFileInputRef = useRef<HTMLInputElement>(null);
  const t = copy[language];

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("ta-theme") as Theme | null;
    const savedLanguage = window.localStorage.getItem("ta-language") as Language | null;
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
    if (savedLanguage === "cs" || savedLanguage === "en") setLanguage(savedLanguage);
  }, []);

  useEffect(() => () => {
    if (comingSoonTimer.current !== null) window.clearTimeout(comingSoonTimer.current);
  }, []);

  function selectApp(app: string) {
    if (completedApps.has(app)) {
      setComingSoon(null);
      setSelected(app);
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

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  useEffect(() => () => {
    if (indexUrl) URL.revokeObjectURL(indexUrl);
  }, [indexUrl]);

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
    window.localStorage.setItem("ta-theme", next);
  }

  function toggleLanguage() {
    const next = language === "en" ? "cs" : "en";
    setLanguage(next);
    window.localStorage.setItem("ta-language", next);
  }

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.readAsDataURL(file);
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
      setExtractionError("Please use a PDF, PNG or JPG file.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setExtractionError("The file is larger than the 20 MB limit.");
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

  function selectIndexFile(file: File) {
    if (file.type !== "application/pdf") {
      setIndexError("Please use a PDF file.");
      return;
    }
    if (indexUrl) URL.revokeObjectURL(indexUrl);
    setIndexFile(file);
    setIndexUrl(URL.createObjectURL(file));
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

  const selectedLabel = selected
    ? t.apps[selected as keyof typeof t.apps]
    : null;
  const helpKey = selected === "extraction" || selected === "index" || selected === "grep" ? selected : "general";
  const help = contextualHelp[language][helpKey];
  const clockHours = now ? String(now.getHours()).padStart(2, "0") : "--";
  const clockMinutes = now ? String(now.getMinutes()).padStart(2, "0") : "--";
  const localDate = now ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` : "---- -- --";
  const namedayKey = now ? `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` : "";
  const nameday = namedayKey === "08-04" ? "Dominika" : namedayKey ? czechNamedays[namedayKey] : "—";

  return (
    <main className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`} data-theme={theme}>
      <header className="topbar">
        <div className="brand">
          <button className="brand-mark" onClick={() => setSidebarOpen((value) => !value)} aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"} aria-expanded={sidebarOpen}>
            {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
          </button>
          <button className="brand-name" onClick={() => setSelected(null)} aria-label="Taktik Automat home"><strong>TAKTIK</strong> AUTOMAT</button>
        </div>

        <div className="topbar-controls">
          <span className="system-status"><i /> ONLINE</span>
          <button className="utility language" onClick={toggleLanguage} aria-label="Change language">
            <span className={language === "en" ? "active-option" : ""}>EN</span>
            <span>/</span>
            <span className={language === "cs" ? "active-option" : ""}>CZ</span>
          </button>
          <button className="utility icon-button" onClick={toggleTheme} aria-label="Toggle color theme">
            <span aria-hidden="true">{theme === "light" ? "◐" : "◑"}</span>
          </button>
          <button
            className={`utility icon-button ${infoOpen ? "pressed" : ""}`}
            onClick={() => setInfoOpen(true)}
            aria-label="Open information"
          >
            <span aria-hidden="true">i</span>
          </button>
        </div>
      </header>

      <aside className="sidebar" aria-label="Tools">
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
      </aside>

      <section className="workspace">
        <div className="workspace-grid" aria-hidden="true" />
        <span className="axis axis-x">{selected === "index" ? "02" : "01"}</span>
        <span className="axis axis-y">{selected === "index" ? "T" : selected === "grep" ? "G" : "A"}</span>
        {selected === "extraction" ? (
          <div className={`extraction-module ${sourceKind ? "has-source" : ""}`}>
            <div className="extraction-head">
              {!sourceKind && <div className="module-code">MODULE / EXTRACTION</div>}
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
                    {isProcessing ? <LoadingText items={t.processing} /> : <textarea value={ocrText} onChange={(event) => setOcrText(event.target.value)} spellCheck />}
                  </section>
                </div>
                <div className="correction-box">
                  <textarea rows={2} value={correctionPrompt} onChange={(event) => setCorrectionPrompt(event.target.value)} placeholder={t.correctionPlaceholder} />
                  <button onClick={correctText} disabled={!ocrText.trim() || !correctionPrompt.trim() || isCorrecting} aria-label={t.correct}>{isCorrecting ? "…" : "→"}</button>
                  {isCorrecting && <LoadingText items={t.processing} compact />}
                </div>
              </div>
            )}
          </div>
        ) : selected === "index" ? (
          <div className={`index-module ${indexFile ? "has-file" : ""}`}>
            <input ref={indexFileInputRef} type="file" accept="application/pdf" onChange={handleIndexFileInput} hidden />
            {!indexFile ? (
              <div className="index-head">
                <div className="module-code">MODULE / INDEX</div>
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
                  <div className="source-viewer">{indexUrl && <iframe src={indexUrl} title={indexFile.name} />}</div>
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
                  {isIndexing ? <LoadingText items={t.indexProcessing} /> : <textarea value={indexResult} onChange={(event) => setIndexResult(event.target.value)} spellCheck={false} />}
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
        ) : selected === "grep" ? (
          <div className="grep-module">
            <div className="module-code">MODULE / GREP</div>
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
              <div className="module-code">MODULE / {selected?.toUpperCase()}</div>
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
      <aside className={`info-drawer ${infoOpen ? "open" : ""}`} aria-hidden={!infoOpen}>
        <div className="drawer-header">
          <span>INFO / {selected?.toUpperCase() || "AUTOMAT"}</span>
          <button onClick={() => setInfoOpen(false)} aria-label={t.close}>×</button>
        </div>
        <div className="drawer-content">
          <span className="drawer-kicker">TAKTIK AUTOMAT</span>
          <h2>{selectedLabel || t.about}</h2>
          <h3>{language === "cs" ? "Co to je?" : "What is this?"}</h3>
          {help.what.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
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
  return <div className={`loading-copy ${compact ? "compact" : ""}`} role="status"><span>{items[index]}...</span></div>;
}

function formatIndexOutput(matches: Array<{ word: string; pdfPages: number[]; otherPdfPages: number[] }>, pdfAnchor: number, printedAnchor: number) {
  const toPrintedPages = (pages: number[]) => [...new Set(pages.map((page) => printedAnchor + page - pdfAnchor).filter((page) => page > 0))].sort((a, b) => a - b);
  return matches.map(({ word, pdfPages, otherPdfPages }) => {
    const printedPages = [...new Set(pdfPages.map((page) => printedAnchor + page - pdfAnchor).filter((page) => page > 0))].sort((a, b) => a - b);
    const otherPrintedPages = toPrintedPages(otherPdfPages);
    return `${word}\t${printedPages.join(", ")}\t(${otherPrintedPages.join(", ")})`;
  }).join("\n");
}
