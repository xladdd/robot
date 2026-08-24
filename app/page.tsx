"use client";

import { ChangeEvent, DragEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { czechNamedays } from "./czechNamedays";
import manualCzechContent from "./content/design-manual/content-cs.json";
import manualEnglishContent from "./content/design-manual/content-en.json";
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

import { barcodeUi, brandGuidelinesUrl, completedApps, contextualHelp, copy, figureUi, groups, localizedCoverUi, robotStatusPhrases, solutionsUi } from "./content/ui";

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
