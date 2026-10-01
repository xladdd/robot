"use client";

import {
  ChangeEvent,
  DragEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import { czechNamedays } from "./content/czechNamedays";
import type { ManualContent } from "./_tools/design-manual/parse";
import {
  DesignManualLightbox,
  DesignManualMainInterface,
} from "./_tools/design-manual/MainInterface";
import {
  createEan13Pdf,
  normalizeIsbn,
} from "./_tools/design/barcode-generator/code/ean13";
import { barcodeUi } from "./_tools/design/barcode-generator/copy";
import { BarcodeMainInterface } from "./_tools/design/barcode-generator/MainInterface";
import { CoverSplitterMainInterface } from "./_tools/design/cover-splitter/MainInterface";
import { GrepMainInterface } from "./_tools/design/grep-builder/MainInterface";
import { promptExtractorCopy } from "./_tools/text/prompt-extractor/copy";
import {
  formatPromptOutput,
  type IllustrationPrompt,
} from "./_tools/text/prompt-extractor/code/output";
import { PromptExtractorMainInterface } from "./_tools/text/prompt-extractor/MainInterface";
import { ScriptBuffetMainInterface } from "./_tools/design/script-buffet/MainInterface";
import { indexCreatorCopy } from "./_tools/text/index-creator/copy";
import { IndexCreatorMainInterface } from "./_tools/text/index-creator/MainInterface";
import type { IndexCandidatePage } from "./_tools/text/index-creator/code/pdf-indexer";
import { textExtractorCopy } from "./_tools/text/text-extractor/copy";
import { TextExtractorMainInterface } from "./_tools/text/text-extractor/MainInterface";
import {
  parseAse,
  type AseSwatch,
} from "./_tools/image/map-generator/code/ase";
import { layoutMapSvgLabels } from "./_tools/image/map-generator/code/label-layout";
import {
  GraphMainInterface,
  type GraphOutput,
} from "./_tools/image/graph-generator/MainInterface";
import {
  DiagramMainInterface,
  type DiagramOutput,
} from "./_tools/image/diagram-generator/MainInterface";
import {
  MapMainInterface,
  type MapLayers,
  type MapOutput,
} from "./_tools/image/map-generator/MainInterface";
import { graphUi } from "./_tools/image/graph-generator/copy";
import { createCoverArtboardPdf } from "./_tools/image/cover-generator/code/cover-artboard";
import { localizedCoverUi } from "./_tools/image/cover-generator/copy";
import { LayerSplitterMainInterface } from "./_tools/image/layer-splitter/MainInterface";
import { layerSplitterUi } from "./_tools/image/layer-splitter/copy";
import type {
  LayerSplitterQuality,
  LayerSplitterResult,
} from "./_tools/image/layer-splitter/types";
import { ImageGeneratorMainInterface } from "./_tools/image/image-generator/MainInterface";
import {
  CoverGeneratorMainInterface,
  CoverLightbox,
  type CoverAudience,
  type CoverGeneration,
  type CoverModel,
  type CoverReference,
  type CoverSubject,
  type CoverUsage,
} from "./_tools/image/cover-generator/MainInterface";
import type { CoverPlannerMetadata } from "./_tools/image/cover-generator/code/types";
import { SolutionsImporterMainInterface } from "./_tools/design/solutions-importer/MainInterface";
import { TypesetterMainInterface } from "./_tools/design/typesetter/MainInterface";
import {
  completedApps,
  groups,
  sidebarStatuses,
  type InfoDrawers,
} from "./_tools/registry";

type Language = "en" | "cs";
type Theme = "light" | "dark";
type FigureOutput = GraphOutput | DiagramOutput | MapOutput;
type FigureCheck = { level: "pass" | "warning"; message: string };
type MapViewport = { zoom: number; pan: { x: number; y: number } };

import { BugFeedbackDialog } from "./_components/BugFeedbackDialog";
import type { FeedbackDiagnostics } from "./_feedback/types";
import { brandGuidelinesUrl, copy, robotStatusPhrases } from "./content/ui";

export default function Workspace({
  infoDrawers,
  manuals,
  username,
}: {
  infoDrawers: InfoDrawers;
  manuals: Record<Language, ManualContent>;
  username: string;
}) {
  const manualCzechContent = manuals.cs;
  const manualEnglishContent = manuals.en;
  const [theme, setTheme] = useState<Theme>("light");
  const [language, setLanguage] = useState<Language>("en");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [open, setOpen] = useState({ text: true, image: true, design: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [manualChapter, setManualChapter] = useState(0);
  const [zoomedManualImage, setZoomedManualImage] = useState<{
    src: string;
    caption: string;
  } | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackDiagnostics, setFeedbackDiagnostics] =
    useState<FeedbackDiagnostics | null>(null);
  const bugReportButtonRef = useRef<HTMLButtonElement>(null);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const comingSoonTimer = useRef<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<"image" | "pdf" | "text" | null>(
    null,
  );
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
  const [indexMatches, setIndexMatches] = useState<
    Array<{
      word: string;
      pdfPages: number[];
      otherPdfPages: number[];
      candidatePages: IndexCandidatePage[];
    }>
  >([]);
  const [pdfAnchor, setPdfAnchor] = useState(1);
  const [printedAnchor, setPrintedAnchor] = useState(1);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState(0);
  const [indexError, setIndexError] = useState("");
  const [indexCopied, setIndexCopied] = useState(false);
  const [grepFindPrompt, setGrepFindPrompt] = useState("");
  const [grepReplacePrompt, setGrepReplacePrompt] = useState("");
  const [grepResult, setGrepResult] = useState<{
    findWhat: string;
    replaceWith: string;
    warning?: string;
  } | null>(null);
  const [isGeneratingGrep, setIsGeneratingGrep] = useState(false);
  const [grepError, setGrepError] = useState("");
  const [grepCopied, setGrepCopied] = useState<"find" | "replace" | null>(null);
  const [promptFile, setPromptFile] = useState<File | null>(null);
  const [promptUrl, setPromptUrl] = useState<string | null>(null);
  const [promptResult, setPromptResult] = useState("");
  const [isExtractingPrompts, setIsExtractingPrompts] = useState(false);
  const [promptError, setPromptError] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [figureRequest, setFigureRequest] = useState("");
  const [graphData, setGraphData] = useState("");
  const [figureMode, setFigureMode] = useState<"chart" | "diagram" | "map">(
    "chart",
  );
  const [figureReferences, setFigureReferences] = useState<
    Array<{ name: string; data: string }>
  >([]);
  const [figurePalette, setFigurePalette] = useState<AseSwatch[]>([]);
  const [figurePaletteName, setFigurePaletteName] = useState("");
  const [graphShowValueLabels, setGraphShowValueLabels] = useState(true);
  const [figureOutput, setFigureOutput] = useState<FigureOutput | null>(null);
  const [figureError, setFigureError] = useState("");
  const [isGeneratingFigure, setIsGeneratingFigure] = useState(false);
  const [coverReferences, setCoverReferences] = useState<CoverReference[]>([]);
  const [coverAudience, setCoverAudience] = useState<CoverAudience | "">("");
  const [coverSubject, setCoverSubject] = useState<CoverSubject | "">("");
  const [coverCustomSubject, setCoverCustomSubject] = useState("");
  const [coverKeywords, setCoverKeywords] = useState("");
  const [coverSketches, setCoverSketches] = useState<CoverGeneration[]>([]);
  const [coverSelectedId, setCoverSelectedId] = useState<string | null>(null);
  const [coverPlanner, setCoverPlanner] = useState<CoverPlannerMetadata | null>(
    null,
  );
  const [coverModel, setCoverModel] = useState<CoverModel>(
    "black-forest-labs/flux.2-pro",
  );
  const [coverArtOnlyReferences, setCoverArtOnlyReferences] = useState(true);
  const [coverGenerationCount, setCoverGenerationCount] = useState<2 | 4>(4);
  const [coverError, setCoverError] = useState("");
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [zoomedCover, setZoomedCover] = useState<CoverGeneration | null>(null);
  const [layerSplitterImage, setLayerSplitterImage] = useState<string | null>(
    null,
  );
  const [layerSplitterImageName, setLayerSplitterImageName] = useState("");
  const [layerSplitterQuality, setLayerSplitterQuality] =
    useState<LayerSplitterQuality>("fidelity");
  const [layerSplitterResult, setLayerSplitterResult] =
    useState<LayerSplitterResult | null>(null);
  const [layerSplitterError, setLayerSplitterError] = useState("");
  const [isSplittingLayers, setIsSplittingLayers] = useState(false);
  const [timelineYear, setTimelineYear] = useState(1914);
  const [timelineYearInput, setTimelineYearInput] = useState("1914");
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const timelineRequestRef = useRef(0);
  const [mapLayers, setMapLayers] = useState<MapLayers>({
    boundaries: true,
    labels: true,
    water: true,
    rivers: true,
    climate: false,
    terrain: false,
    mountains: false,
    cities: false,
    disputed: false,
  });
  const [mapFillMode, setMapFillMode] = useState(false);
  const [mapViewport, setMapViewport] = useState<MapViewport>({
    zoom: 1,
    pan: { x: 0, y: 0 },
  });
  const mapViewportRef = useRef(mapViewport);
  const mapViewportFrameRef = useRef<number | null>(null);
  const mapPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const mapPinchRef = useRef<{
    distance: number;
    midpoint: { x: number; y: number };
    viewport: MapViewport;
  } | null>(null);
  const mapDragRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
    regionId: string | null;
  } | null>(null);
  const mapZoom = mapViewport.zoom;
  const mapPan = mapViewport.pan;
  const figureReferenceInputRef = useRef<HTMLInputElement>(null);
  const figurePaletteInputRef = useRef<HTMLInputElement>(null);
  const coverReferenceInputRef = useRef<HTMLInputElement>(null);
  const layerSplitterInputRef = useRef<HTMLInputElement>(null);
  const promptFileInputRef = useRef<HTMLInputElement>(null);
  const indexFileInputRef = useRef<HTMLInputElement>(null);
  const t = copy[language];
  const barcodeT = barcodeUi[language];
  const figureT = graphUi[language];
  const coverT = localizedCoverUi[language];
  const layerSplitterT = layerSplitterUi[language];
  const textExtractorT = textExtractorCopy[language];
  const indexCreatorT = indexCreatorCopy[language];
  const promptExtractorT = promptExtractorCopy[language];

  function openBugFeedback() {
    const file = sourceFile || indexFile || promptFile;
    const isRunning =
      isProcessing ||
      isCorrecting ||
      isIndexing ||
      isExtractingPrompts ||
      isGeneratingFigure ||
      isGeneratingCover ||
      isSplittingLayers ||
      isLoadingTimeline;
    const errorPresent = Boolean(
      extractionError ||
      indexError ||
      promptError ||
      grepError ||
      figureError ||
      coverError ||
      layerSplitterError,
    );
    const hasResult = Boolean(
      ocrText ||
      indexResult ||
      promptResult ||
      grepResult ||
      figureOutput ||
      coverSketches.length ||
      layerSplitterResult,
    );
    const hasInput = Boolean(
      file ||
      layerSplitterImage ||
      figureRequest.trim() ||
      graphData.trim() ||
      grepFindPrompt.trim() ||
      coverSubject ||
      barcodeInput.trim(),
    );
    const selectedToolName = selected
      ? t.apps[selected as keyof typeof t.apps] || selected
      : "Taktik Robot";
    setFeedbackDiagnostics({
      selectedTool: selected,
      selectedToolName,
      language,
      theme,
      sidebarOpen,
      infoOpen,
      pathname: window.location.pathname,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      userAgent: navigator.userAgent.slice(0, 300),
      online: navigator.onLine,
      appStatus: errorPresent
        ? "error"
        : isRunning
          ? "running"
          : hasResult
            ? "completed"
            : "idle",
      progress: selected === "index" ? indexProgress : null,
      inputSummary: {
        hasInput,
        fileType: file?.type || null,
        fileSize: file?.size ?? null,
        referenceCount: figureReferences.length + coverReferences.length,
        hasResult,
      },
      capturedAt: new Date().toISOString(),
    });
    setFeedbackOpen(true);
  }

  useEffect(() => {
    if (selected !== "map") return;
    commitMapViewport({ zoom: 1, pan: { x: 0, y: 0 } });
    void loadTimelineYear(timelineYear);
  }, [selected]);

  useEffect(
    () => () => {
      if (mapViewportFrameRef.current !== null)
        cancelAnimationFrame(mapViewportFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    if (selected !== "map") return;
    const handleMapZoomKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']"))
        return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setMapViewport((current) => {
          const next = { ...current, zoom: Math.min(40, current.zoom * 1.25) };
          mapViewportRef.current = next;
          return next;
        });
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setMapViewport((current) => {
          const next = { ...current, zoom: Math.max(0.5, current.zoom / 1.25) };
          mapViewportRef.current = next;
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleMapZoomKey);
    return () => window.removeEventListener("keydown", handleMapZoomKey);
  }, [selected]);

  useEffect(() => {
    const savedTheme = (window.localStorage.getItem("robot-theme") ||
      window.localStorage.getItem("ta-theme")) as Theme | null;
    const savedLanguage = (window.localStorage.getItem("robot-language") ||
      window.localStorage.getItem("ta-language")) as Language | null;
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
    if (savedLanguage === "cs" || savedLanguage === "en")
      setLanguage(savedLanguage);
  }, []);

  useEffect(() => {
    if (!zoomedCover) return;
    const handleCoverLightboxKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomedCover(null);
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveZoomedCover(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveZoomedCover(1);
      }
    };
    window.addEventListener("keydown", handleCoverLightboxKey);
    return () => window.removeEventListener("keydown", handleCoverLightboxKey);
  }, [zoomedCover, coverSketches]);

  useEffect(
    () => () => {
      if (comingSoonTimer.current !== null)
        window.clearTimeout(comingSoonTimer.current);
    },
    [],
  );

  function selectApp(app: string) {
    if (completedApps.has(app)) {
      setComingSoon(null);
      if (
        app !== selected &&
        (app === "graph" || app === "bio" || app === "map")
      ) {
        setFigureOutput(null);
        setFigureError("");
        setFigureRequest("");
        setGraphData("");
      }
      setSelected(app);
      if (app === "graph") setFigureMode("chart");
      if (app === "bio") setFigureMode("diagram");
      if (app === "map") setFigureMode("map");
      return;
    }

    setComingSoon(app);
    if (comingSoonTimer.current !== null)
      window.clearTimeout(comingSoonTimer.current);
    comingSoonTimer.current = window.setTimeout(
      () => setComingSoon(null),
      4000,
    );
  }

  useEffect(() => {
    setNow(new Date());
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(
    () => () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    },
    [sourceUrl],
  );

  useEffect(
    () => () => {
      if (indexUrl) URL.revokeObjectURL(indexUrl);
    },
    [indexUrl],
  );

  useEffect(
    () => () => {
      if (promptUrl) URL.revokeObjectURL(promptUrl);
    },
    [promptUrl],
  );

  useEffect(() => {
    if (indexMatches.length)
      setIndexResult(formatIndexOutput(indexMatches, pdfAnchor, printedAnchor));
  }, [indexMatches, pdfAnchor, printedAnchor]);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (
        selected !== "extraction" &&
        selected !== "index" &&
        selected !== "prompt"
      )
        return;
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        selected === "extraction"
          ? item.type.startsWith("image/") || item.type === "application/pdf"
          : item.type === "application/pdf",
      );
      if (file) {
        event.preventDefault();
        if (selected === "index") selectIndexFile(file);
        else if (selected === "prompt") void extractPrompts(file);
        else void processFile(file);
        return;
      }
      if (selected !== "extraction") return;
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
    if (!supportedTypes.includes(file.type))
      return Promise.reject(
        new Error(`${file.name}: use a PNG, JPEG, or WebP image.`),
      );
    if (file.size > 30_000_000)
      return Promise.reject(
        new Error(`${file.name}: the source image is larger than 30 MB.`),
      );
    return new Promise<{ data: string; artData: string }>((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        const render = (
          sourceY: number,
          sourceHeight: number,
          maxSide: number,
        ) =>
          new Promise<string>((renderResolve, renderReject) => {
            const scale = Math.min(
              1,
              maxSide / Math.max(image.naturalWidth, sourceHeight),
            );
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(sourceHeight * scale));
            const context = canvas.getContext("2d");
            if (!context) {
              renderReject(
                new Error(
                  `${file.name}: the browser could not prepare this image.`,
                ),
              );
              return;
            }
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(
              image,
              0,
              sourceY,
              image.naturalWidth,
              sourceHeight,
              0,
              0,
              canvas.width,
              canvas.height,
            );
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  renderReject(
                    new Error(
                      `${file.name}: the browser could not compress this image.`,
                    ),
                  );
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => renderResolve(String(reader.result));
                reader.onerror = () =>
                  renderReject(
                    new Error(
                      `${file.name}: the compressed image could not be read.`,
                    ),
                  );
                reader.readAsDataURL(blob);
              },
              "image/jpeg",
              0.88,
            );
          });
        try {
          const cropY = Math.round(image.naturalHeight * 0.3);
          const cropHeight = Math.max(
            1,
            Math.round(image.naturalHeight * 0.56),
          );
          const [data, artData] = await Promise.all([
            render(0, image.naturalHeight, 1600),
            render(cropY, cropHeight, 1400),
          ]);
          resolve({ data, artData });
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`${file.name}: the image could not be decoded.`));
      };
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
    const allowed =
      file.type === "application/pdf" ||
      file.type === "image/png" ||
      file.type === "image/jpeg";
    if (!allowed) {
      setExtractionError(textExtractorT.invalidFile);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setExtractionError(textExtractorT.fileTooLarge);
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
        body: JSON.stringify({
          name: file.name,
          type: file.type,
          data: await fileToDataUrl(file),
        }),
      });
      const result = (await response.json()) as {
        text?: string;
        error?: string;
        code?: "provider_rate_limited" | "provider_error";
      };
      if (!response.ok || !result.text) {
        const message =
          result.code === "provider_rate_limited"
            ? textExtractorT.providerRateLimited
            : result.error || "Text extraction failed.";
        throw new Error(message);
      }
      setOcrText(result.text);
    } catch (error) {
      setExtractionError(
        error instanceof Error ? error.message : "Text extraction failed.",
      );
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
        body: JSON.stringify({
          text: ocrText,
          instruction: correctionPrompt,
          language,
        }),
      });
      const result = (await response.json()) as {
        text?: string;
        error?: string;
      };
      if (!response.ok || !result.text)
        throw new Error(result.error || "Text correction failed.");
      setOcrText(result.text);
      setCorrectionPrompt("");
    } catch (error) {
      setExtractionError(
        error instanceof Error ? error.message : "Text correction failed.",
      );
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
    const url = URL.createObjectURL(
      new Blob([text], { type: `${type};charset=utf-8` }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function selectIndexFile(file: File) {
    if (file.type !== "application/pdf") {
      setIndexError(indexCreatorT.invalidFile);
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

  function toggleIndexPage(word: string, pdfPage: number) {
    setIndexMatches((current) =>
      current.map((match) => {
        if (match.word !== word) return match;
        const accepted = match.pdfPages.includes(pdfPage);
        const pdfPages = accepted
          ? match.pdfPages.filter((page) => page !== pdfPage)
          : [...match.pdfPages, pdfPage].sort((a, b) => a - b);
        const otherPdfPages = match.candidatePages
          .map((candidate) => candidate.pdfPage)
          .filter((page) => page !== pdfPage && !pdfPages.includes(page))
          .sort((a, b) => a - b);
        return { ...match, pdfPages, otherPdfPages };
      }),
    );
  }

  async function createIndex() {
    const words = [
      ...new Set(
        indexWords
          .split(/\r?\n/)
          .map((word) => word.trim())
          .filter(Boolean),
      ),
    ];
    if (!indexFile || !words.length || isIndexing) return;
    setIsIndexing(true);
    setIndexResult("");
    setIndexMatches([]);
    setIndexError("");
    setIndexProgress(1);
    try {
      const indexer =
        await import("./_tools/text/index-creator/code/pdf-indexer");
      let pages = await indexer.extractPdfPages(indexFile, (done, total) =>
        setIndexProgress(Math.max(2, Math.round((done / total) * 65))),
      );
      const { addLocalOcrText, findLikelyOcrPages } =
        await import("./_tools/text/index-creator/code/local-ocr");
      const ocrPageNumbers = findLikelyOcrPages(pages);
      if (ocrPageNumbers.length) {
        pages = await addLocalOcrText(
          indexFile,
          pages,
          ocrPageNumbers,
          (done, total) =>
            setIndexProgress(65 + Math.round((done / total) * 6)),
        );
      }
      const anchor = indexer.detectPrintedPageAnchor(pages);
      const detectedPdfAnchor = anchor.pdfPage;
      const detectedPrintedAnchor = anchor.printedPage;
      setPdfAnchor(detectedPdfAnchor);
      setPrintedAnchor(detectedPrintedAnchor);
      setIndexProgress(72);

      const entries: Array<{ word: string; forms: string[] }> = [];
      const batchSize = 12;
      const batches = Array.from(
        { length: Math.ceil(words.length / batchSize) },
        (_, index) => words.slice(index * batchSize, (index + 1) * batchSize),
      );

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const response = await fetch("/api/index/forms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ words: batches[batchIndex] }),
        });
        const result = (await response.json()) as {
          entries?: Array<{ word: string; forms: string[] }>;
          error?: string;
        };
        if (!response.ok || !result.entries)
          throw new Error(
            result.error || "Could not prepare multilingual word forms.",
          );
        entries.push(...result.entries);
        setIndexProgress(
          72 + Math.round(((batchIndex + 1) / batches.length) * 10),
        );
      }

      const candidates = indexer.findIndexCandidates(pages, entries);
      setIndexProgress(96);
      const matches = words.map((word) => {
        const candidate = candidates.find((item) => item.word === word);
        const candidatePages = candidate?.pages ?? [];
        const pdfPages = candidate?.recommendedPages ?? [];
        const selectedPages = new Set(pdfPages);
        const otherPdfPages = candidatePages
          .map((page) => page.pdfPage)
          .filter((page) => !selectedPages.has(page));
        return { word, pdfPages, otherPdfPages, candidatePages };
      });
      setIndexMatches(matches);
      setIndexResult(
        formatIndexOutput(matches, detectedPdfAnchor, detectedPrintedAnchor),
      );
      setIndexProgress(100);
    } catch (error) {
      setIndexError(
        error instanceof Error ? error.message : "Index creation failed.",
      );
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
    if (!grepFindPrompt.trim() || !grepReplacePrompt.trim() || isGeneratingGrep)
      return;
    setIsGeneratingGrep(true);
    setGrepError("");
    try {
      const response = await fetch("/api/grep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          find: grepFindPrompt,
          replace: grepReplacePrompt,
        }),
      });
      const result = (await response.json()) as {
        findWhat?: string;
        replaceWith?: string;
        warning?: string;
        error?: string;
      };
      if (
        !response.ok ||
        typeof result.findWhat !== "string" ||
        typeof result.replaceWith !== "string"
      )
        throw new Error(result.error || "Could not generate GREP code.");
      setGrepResult({
        findWhat: result.findWhat,
        replaceWith: result.replaceWith,
        warning: result.warning,
      });
    } catch (error) {
      setGrepError(
        error instanceof Error
          ? error.message
          : "Could not generate GREP code.",
      );
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
      setPromptError(promptExtractorT.invalidFile);
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setPromptError(promptExtractorT.fileTooLarge);
      return;
    }
    if (promptUrl) URL.revokeObjectURL(promptUrl);
    setPromptFile(file);
    setPromptUrl(URL.createObjectURL(file));
    setPromptResult("");
    setPromptError("");
    setIsExtractingPrompts(true);
    try {
      const renderer =
        await import("./_tools/text/prompt-extractor/code/pdf-images");
      const pages = await renderer.renderPdfPages(file);
      const illustrations: IllustrationPrompt[] = [];
      const batchSize = 1;
      const batches = Array.from(
        { length: Math.ceil(pages.length / batchSize) },
        (_, index) => pages.slice(index * batchSize, (index + 1) * batchSize),
      );
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const response = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pages: batches[batchIndex] }),
        });
        const result = (await response.json()) as {
          illustrations?: IllustrationPrompt[];
          error?: string;
        };
        if (!response.ok || !Array.isArray(result.illustrations))
          throw new Error(result.error || "Prompt extraction failed.");
        illustrations.push(...result.illustrations);
      }
      setPromptResult(formatPromptOutput(illustrations));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Prompt extraction failed.";
      setPromptError(
        message === "PDF_PAGE_LIMIT"
          ? "The PDF has more than 20 pages."
          : message,
      );
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
    try {
      barcodeResult = normalizeIsbn(barcodeInput);
    } catch (error) {
      barcodeError = error instanceof Error ? error.message : "Invalid ISBN.";
    }
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
    setFigureError("");
    setFigureOutput(null);
    try {
      const response = await fetch("/api/figures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request:
            figureMode === "chart"
              ? `${figureRequest.trim()}\n\nDATA:\n${graphData.trim()}`
              : figureRequest,
          mode: figureMode,
          ...(figureMode === "diagram" || figureMode === "chart"
            ? { language }
            : {}),
          ...(figureMode === "chart"
            ? { showValueLabels: graphShowValueLabels }
            : {}),
          references: figureReferences.map(({ data }) => data),
          palette: figurePalette,
        }),
      });
      const result = (await response.json()) as FigureOutput & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Figure generation failed.");
      setFigureOutput(result);
      const generatedYear =
        figureMode === "map"
          ? Number((result as MapOutput).spec.date?.slice(0, 4))
          : Number.NaN;
      if (
        Number.isInteger(generatedYear) &&
        generatedYear >= 1886 &&
        generatedYear <= 2026
      )
        setTimelineYear(generatedYear);
    } catch (error) {
      setFigureError(
        error instanceof Error ? error.message : "Figure generation failed.",
      );
    } finally {
      setIsGeneratingFigure(false);
    }
  }

  async function loadTimelineYear(year: number) {
    const requestId = ++timelineRequestRef.current;
    setIsLoadingTimeline(true);
    setFigureError("");
    try {
      const response = await fetch(`/api/maps/timeline?year=${year}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as FigureOutput & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Historical timeline failed.");
      if (requestId !== timelineRequestRef.current) return;
      setFigureOutput(result);
    } catch (error) {
      setFigureError(
        error instanceof Error ? error.message : "Historical timeline failed.",
      );
    } finally {
      if (requestId === timelineRequestRef.current) setIsLoadingTimeline(false);
    }
  }

  function commitTimelineYear() {
    let year = Math.max(
      -3400,
      Math.min(2026, Number.parseInt(timelineYearInput, 10) || timelineYear),
    );
    if (year === 0) year = timelineYear < 0 ? 1 : -1;
    setTimelineYear(year);
    setTimelineYearInput(String(year));
    void loadTimelineYear(year);
  }

  function changeTimelineYearInput(value: string) {
    setTimelineYearInput(value);
    const year = Number(value);
    if (!Number.isInteger(year) || year < -3400 || year > 2026 || year === 0)
      return;
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
    const document = new DOMParser().parseFromString(
      figureOutput.svg,
      "image/svg+xml",
    );
    const paths = [
      ...document.querySelectorAll(
        `path[data-region-id="${CSS.escape(regionId)}"]`,
      ),
    ];
    const selected = paths.some(
      (path) => path.getAttribute("data-selected") === "true",
    );
    for (const path of paths) {
      if (selected) {
        path.removeAttribute("data-selected");
        path.removeAttribute("style");
      } else {
        path.setAttribute("data-selected", "true");
        path.setAttribute("style", "fill:#ff661a");
      }
    }
    setFigureOutput((current) =>
      current
        ? {
            ...current,
            svg: new XMLSerializer().serializeToString(
              document.documentElement,
            ),
          }
        : current,
    );
  }

  function applyMapPalette(shuffle = false) {
    if (!figureOutput || !figurePalette.length) return;
    const shade = (hex: string, factor: number) =>
      `#${[1, 3, 5]
        .map((index) =>
          Math.round(Number.parseInt(hex.slice(index, index + 2), 16) * factor)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;
    let colors = figurePalette.flatMap(({ hex }) => [
      shade(hex, 1),
      shade(hex, 0.75),
      shade(hex, 0.5),
    ]);
    if (shuffle) colors = colors.slice().sort(() => Math.random() - 0.5);
    const parsed = new DOMParser().parseFromString(
      figureOutput.svg,
      "image/svg+xml",
    );
    const paths = [...parsed.querySelectorAll(".regions path")];
    const colorByRegion = new Map<string, string>();
    paths.forEach((path, index) => {
      const key =
        path.getAttribute("data-region-id") ||
        path.getAttribute("data-iso-numeric") ||
        path.getAttribute("data-map-unit") ||
        String(index);
      if (!colorByRegion.has(key))
        colorByRegion.set(key, colors[colorByRegion.size % colors.length]);
      path.setAttribute("fill", colorByRegion.get(key)!);
    });
    setFigureOutput((current) =>
      current
        ? {
            ...current,
            svg: new XMLSerializer().serializeToString(parsed.documentElement),
          }
        : current,
    );
  }

  function commitMapViewport(viewport: MapViewport) {
    mapViewportRef.current = viewport;
    setMapViewport(viewport);
  }

  function scheduleMapViewport(viewport: MapViewport) {
    mapViewportRef.current = viewport;
    if (mapViewportFrameRef.current !== null) return;
    mapViewportFrameRef.current = requestAnimationFrame(() => {
      mapViewportFrameRef.current = null;
      setMapViewport(mapViewportRef.current);
    });
  }

  function updateMapZoom(update: number | ((zoom: number) => number)) {
    const current = mapViewportRef.current;
    const zoom = typeof update === "function" ? update(current.zoom) : update;
    commitMapViewport({ ...current, zoom });
  }

  function updateMapPan(pan: { x: number; y: number }) {
    commitMapViewport({ ...mapViewportRef.current, pan });
  }

  function mapPoint(clientX: number, clientY: number, canvas: HTMLDivElement) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: clientX - bounds.left - bounds.width / 2,
      y: clientY - bounds.top - bounds.height / 2,
    };
  }

  function mapPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    mapPointersRef.current.set(
      event.pointerId,
      mapPoint(event.clientX, event.clientY, event.currentTarget),
    );

    if (mapPointersRef.current.size === 2) {
      const [first, second] = [...mapPointersRef.current.values()];
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      mapPinchRef.current = {
        distance: Math.hypot(dx, dy),
        midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
        viewport: mapViewportRef.current,
      };
      mapDragRef.current = null;
      return;
    }

    const path = mapFillMode
      ? (event.target as Element).closest?.("path[data-region-id]")
      : null;
    const viewport = mapViewportRef.current;
    mapDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: viewport.pan.x,
      panY: viewport.pan.y,
      moved: false,
      regionId: path?.getAttribute("data-region-id") ?? null,
    };
  }

  function mapPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!mapPointersRef.current.has(event.pointerId)) return;
    mapPointersRef.current.set(
      event.pointerId,
      mapPoint(event.clientX, event.clientY, event.currentTarget),
    );
    const pinch = mapPinchRef.current;
    if (pinch && mapPointersRef.current.size === 2) {
      const [first, second] = [...mapPointersRef.current.values()];
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.hypot(dx, dy);
      if (!distance || !pinch.distance) return;
      const midpoint = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
      const zoom = Math.max(
        0.5,
        Math.min(40, pinch.viewport.zoom * (distance / pinch.distance)),
      );
      const ratio = zoom / pinch.viewport.zoom;
      scheduleMapViewport({
        zoom,
        pan: {
          x: midpoint.x - ratio * (pinch.midpoint.x - pinch.viewport.pan.x),
          y: midpoint.y - ratio * (pinch.midpoint.y - pinch.viewport.pan.y),
        },
      });
      return;
    }

    const drag = mapDragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    scheduleMapViewport({
      ...mapViewportRef.current,
      pan: { x: drag.panX + dx, y: drag.panY + dy },
    });
  }

  function finishMapPointer(
    event: ReactPointerEvent<HTMLDivElement>,
    shouldSelectCountry: boolean,
  ) {
    const drag = mapDragRef.current;
    mapPointersRef.current.delete(event.pointerId);
    mapPinchRef.current = null;
    mapDragRef.current = null;
    if (shouldSelectCountry && drag && !drag.moved && drag.regionId)
      toggleMapCountry(drag.regionId);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function mapPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    finishMapPointer(event, true);
  }

  function mapPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    finishMapPointer(event, false);
  }

  function mapWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!(event.currentTarget instanceof HTMLDivElement)) return;
    const point = mapPoint(event.clientX, event.clientY, event.currentTarget);
    const viewport = mapViewportRef.current;
    const zoom = Math.max(
      0.5,
      Math.min(40, viewport.zoom * Math.exp(-event.deltaY * 0.0015)),
    );
    const ratio = zoom / viewport.zoom;
    scheduleMapViewport({
      zoom,
      pan: {
        x: point.x - ratio * (point.x - viewport.pan.x),
        y: point.y - ratio * (point.y - viewport.pan.y),
      },
    });
  }

  async function addFigureReferences(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(
      0,
      3 - figureReferences.length,
    );
    event.target.value = "";
    const valid = files.filter(
      (file) =>
        ["image/png", "image/jpeg", "image/webp"].includes(file.type) &&
        file.size <= 5_000_000,
    );
    const added = await Promise.all(
      valid.map(async (file) => ({
        name: file.name,
        data: await fileToDataUrl(file),
      })),
    );
    setFigureReferences((current) => [...current, ...added].slice(0, 3));
  }

  async function addFigurePalette(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (
      !file ||
      !file.name.toLowerCase().endsWith(".ase") ||
      file.size > 2_000_000
    ) {
      setFigureError(figureT.paletteFileError);
      return;
    }
    try {
      setFigurePalette(parseAse(await file.arrayBuffer()));
      setFigurePaletteName(file.name);
      setFigureError("");
      if (figureMode !== "map") setFigureOutput(null);
    } catch (error) {
      setFigureError(
        error instanceof Error ? error.message : figureT.paletteReadError,
      );
    }
  }

  async function addCoverReferences(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await addCoverReferenceFiles(files);
  }

  async function addCoverReferenceFiles(files: File[]) {
    try {
      const selectedFiles = files.slice(0, 3 - coverReferences.length);
      const additions = await Promise.all(
        selectedFiles.map(async (file) => ({
          name: file.name,
          ...(await coverFileToDataUrls(file)),
        })),
      );
      setCoverReferences((current) => [...current, ...additions].slice(0, 3));
      setCoverError("");
    } catch (error) {
      setCoverError(
        error instanceof Error ? error.message : coverT.referenceError,
      );
    }
  }

  async function selectLayerSplitterFile(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLayerSplitterError(layerSplitterT.error);
      return;
    }
    if (file.size > 18_000_000) {
      setLayerSplitterError(
        language === "cs"
          ? "Obrázek je příliš velký (maximum je 18 MB)."
          : "The image is too large (the maximum is 18 MB).",
      );
      return;
    }
    try {
      setLayerSplitterImage(await fileToDataUrl(file));
      setLayerSplitterImageName(file.name);
      setLayerSplitterResult(null);
      setLayerSplitterError("");
    } catch (error) {
      setLayerSplitterError(
        error instanceof Error ? error.message : layerSplitterT.error,
      );
    }
  }

  function removeLayerSplitterImage() {
    setLayerSplitterImage(null);
    setLayerSplitterImageName("");
    setLayerSplitterResult(null);
    setLayerSplitterError("");
  }

  async function splitLayerSplitterImage() {
    if (!layerSplitterImage || isSplittingLayers) return;
    setIsSplittingLayers(true);
    setLayerSplitterResult(null);
    setLayerSplitterError("");
    try {
      const response = await fetch("/api/layers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: layerSplitterImage,
          quality: layerSplitterQuality,
        }),
      });
      const result = (await response.json()) as LayerSplitterResult & {
        error?: string;
      };
      if (!response.ok || !result.psdBase64)
        throw new Error(result.error || layerSplitterT.error);
      setLayerSplitterResult(result);
    } catch (error) {
      setLayerSplitterError(
        error instanceof Error ? error.message : layerSplitterT.error,
      );
    } finally {
      setIsSplittingLayers(false);
    }
  }

  function downloadLayerSplitterPsd() {
    if (!layerSplitterResult) return;
    const bytes = Uint8Array.from(
      atob(layerSplitterResult.psdBase64),
      (character) => character.charCodeAt(0),
    );
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "image/vnd.adobe.photoshop" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = layerSplitterResult.filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function generateCoverSketches(generationCount: 2 | 4) {
    if (
      !coverAudience ||
      !coverSubject ||
      (coverSubject === "other" && !coverCustomSubject.trim()) ||
      isGeneratingCover
    )
      return;
    if (
      coverSketches.filter((item) => item.status !== "rejected").length +
        generationCount >
      16
    ) {
      setCoverError(coverT.limit);
      return;
    }
    setCoverGenerationCount(generationCount);
    setIsGeneratingCover(true);
    setCoverError("");
    try {
      const preference = coverSelectedId
        ? coverSketches.find((item) => item.id === coverSelectedId)?.data
        : undefined;
      const response = await fetch("/api/covers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "sketch",
          generationCount,
          audience: coverAudience,
          subject: coverSubject,
          customSubject: coverCustomSubject,
          keywords: coverKeywords,
          references: coverReferences.map((item) =>
            coverArtOnlyReferences ? item.artData : item.data,
          ),
          preference,
          model: coverModel,
        }),
      });
      const result = (await response.json()) as {
        images?: Array<{
          data: string;
          seed: number | null;
          model: string;
          direction?: string;
          concept: CoverGeneration["concept"];
          generationId?: string;
          usage: CoverUsage;
        }>;
        planner?: CoverPlannerMetadata;
        warnings?: string[];
        error?: string;
      };
      if (!response.ok || !result.images?.length)
        throw new Error(result.error || coverT.sketchError);
      setCoverPlanner(result.planner || null);
      setCoverSketches((current) => [
        ...current,
        ...result.images!.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
          status: "active" as const,
          createdAt: new Date().toISOString(),
        })),
      ]);
      if (result.warnings?.length) setCoverError(result.warnings.join(" · "));
    } catch (error) {
      setCoverError(
        error instanceof Error ? error.message : coverT.generationError,
      );
    } finally {
      setIsGeneratingCover(false);
    }
  }

  function selectCoverSketch(id: string) {
    setCoverSelectedId((current) => (current === id ? null : id));
    setCoverSketches((current) => {
      const isSelected = current.some(
        (item) => item.id === id && item.status === "selected",
      );
      return current.map((item) =>
        item.id === id
          ? { ...item, status: isSelected ? "active" : "selected" }
          : item.status === "selected"
            ? { ...item, status: "active" }
            : item,
      );
    });
  }
  function rejectCoverSketch(id: string) {
    if (coverSelectedId === id) setCoverSelectedId(null);
    setCoverSketches((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: "rejected" } : item,
      ),
    );
  }
  function moveZoomedCover(offset: number) {
    if (!zoomedCover) return;
    const items = coverSketches.filter((item) => item.status !== "rejected");
    if (items.length < 2) return;
    const index = items.findIndex((item) => item.id === zoomedCover.id);
    setZoomedCover(
      items[(Math.max(0, index) + offset + items.length) % items.length],
    );
  }

  async function downloadCoverZip() {
    const entries: Array<{ name: string; data: Uint8Array }> = [];
    const toBytes = async (dataUrl: string) =>
      new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
    const tasks = coverSketches.filter((item) => item.status !== "rejected");
    for (const [index, item] of tasks.entries())
      entries.push({
        name: `concepts/${item.status === "selected" ? "selected" : "alternatives"}/concept-${String(index + 1).padStart(2, "0")}.jpg`,
        data: await toBytes(item.data),
      });
    const plannerCost = coverPlanner?.usage.cost || 0;
    const knownTotal =
      plannerCost +
      tasks.reduce((sum, item) => sum + (item.usage.cost || 0), 0);
    const unknownCosts =
      tasks.filter((item) => item.usage.cost === null).length +
      (coverPlanner && coverPlanner.usage.cost === null ? 1 : 0);
    const report = [
      `# ${coverT.reportTitle}`,
      "",
      `- Exported: ${new Date().toISOString()}`,
      `- Audience: ${coverAudience}`,
      `- Subject: ${coverSubject === "other" ? coverCustomSubject : coverSubject}`,
      `- Keywords: ${coverKeywords || "none"}`,
      `- Planner model: ${coverPlanner?.model || "not reported"}`,
      `- Reference guidance: ${coverPlanner?.referenceGuidance ? JSON.stringify(coverPlanner.referenceGuidance) : "not reported"}`,
      `- Artwork-only reference crops: ${coverArtOnlyReferences ? "yes" : "no"}`,
      `- Generation tasks: ${tasks.length}`,
      `- Total credits: ${knownTotal.toFixed(6)}${unknownCosts ? ` (${unknownCosts} task${unknownCosts === 1 ? "" : "s"} did not report a cost)` : ""}`,
      "",
      "## Generation tasks",
      "",
      `| # | Type | Concept | Viewpoint | Rendering | Model | Seed | Credits | OpenRouter generation |`,
      `|---:|---|---|---|---|---|---:|---:|---|`,
      `| — | planner | ${coverPlanner?.model || "not reported"} | — | ${coverPlanner?.usedFallback ? "local fallback" : "Mistral structured plan"} | ${coverPlanner?.model || "not reported"} | — | ${coverPlanner?.usage.cost === null || coverPlanner?.usage.cost === undefined ? "not reported" : coverPlanner.usage.cost.toFixed(6)} | ${coverPlanner?.generationId || "not reported"} |`,
      ...tasks.map(
        (item, index) =>
          `| ${index + 1} | concept | ${item.concept.coreIdea} | ${item.concept.viewpoint} | ${item.concept.renderingApproach} | ${item.model} | ${item.seed ?? "not supported"} | ${item.usage.cost === null ? "not reported" : item.usage.cost.toFixed(6)} | ${item.generationId || "not reported"} |`,
      ),
      "",
      "> These images are text-free cover-art directions. Add typography and publisher elements later in InDesign.",
      "",
    ].join("\n");
    entries.push({
      name: "generation-report.md",
      data: new TextEncoder().encode(report),
    });
    entries.push({
      name: "project.json",
      data: new TextEncoder().encode(
        JSON.stringify(
          {
            project: "Taktik Robot",
            audience: coverAudience,
            subject: coverSubject,
            customSubject: coverCustomSubject,
            keywords: coverKeywords,
            references: coverReferences.map(({ name }) => name),
            artworkOnlyReferenceCrops: coverArtOnlyReferences,
            selectedSketch: coverSelectedId,
            model: coverModel,
            planner: coverPlanner,
            sketches: coverSketches.map(
              ({
                id,
                seed,
                status,
                createdAt,
                model,
                direction,
                concept,
                generationId,
                usage,
              }) => ({
                id,
                seed,
                status,
                createdAt,
                model,
                direction,
                concept,
                generationId,
                usage,
              }),
            ),
            totalCredits: knownTotal,
            unknownCostTasks: unknownCosts,
            exportedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      ),
    });
    const url = URL.createObjectURL(
      new Blob([createZip(entries)], { type: "application/zip" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "robot-cover-project.zip";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportCoverArtboard() {
    const active = coverSketches.filter((item) => item.status !== "rejected");
    const stage = document.querySelector<HTMLElement>(".cover-stage");
    if (!stage) return;
    const viewport = stage.getBoundingClientRect();
    const visibleIds = new Set(
      [...stage.querySelectorAll<HTMLElement>(".cover-card[data-cover-id]")]
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            bounds.bottom > viewport.top &&
            bounds.top < viewport.bottom &&
            bounds.right > viewport.left &&
            bounds.left < viewport.right
          );
        })
        .map((element) => element.dataset.coverId),
    );
    const visible = active
      .map((item, index) => ({ item, number: index + 1 }))
      .filter(({ item }) => visibleIds.has(item.id))
      .slice(0, 12);
    if (!visible.length) {
      setCoverError(coverT.artboardError);
      return;
    }
    try {
      const pdf = await createCoverArtboardPdf(
        visible.map(({ item, number }) => ({ number, data: item.data })),
      );
      const url = URL.createObjectURL(
        new Blob([pdf], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "robot-cover-artboard.pdf";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setCoverError(
        error instanceof Error ? error.message : coverT.artboardError,
      );
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
    const displayedSvg = document.querySelector<SVGSVGElement>(
      ".map-module .map-transform svg",
    );
    const crop = document.querySelector<HTMLElement>(
      ".map-module .map-export-crop",
    );
    if (!displayedSvg || !crop)
      return downloadFigure(figureOutput.svg, "map.svg", "image/svg+xml");
    const svgBounds = displayedSvg.getBoundingClientRect(),
      cropBounds = crop.getBoundingClientRect();
    const scale =
      Math.min(svgBounds.width / 1000, svgBounds.height / 700) * mapZoom;
    const contentLeft =
      svgBounds.left + svgBounds.width / 2 + mapPan.x - 500 * scale;
    const contentTop =
      svgBounds.top + svgBounds.height / 2 + mapPan.y - 350 * scale;
    const viewBox = {
      x: (cropBounds.left - contentLeft) / scale,
      y: (cropBounds.top - contentTop) / scale,
      width: cropBounds.width / scale,
      height: cropBounds.height / scale,
    };
    const parsed = new DOMParser().parseFromString(
      figureOutput.svg,
      "image/svg+xml",
    );
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
    setExportLayerVisible("country-names", true);
    setExportLayerVisible("country-abbreviations", true);
    if (!mapLayers.boundaries)
      for (const element of root.querySelectorAll<SVGElement>(
        "#countries-borders path",
      ))
        element.style.stroke = "none";
    root.querySelector("#map-information")?.remove();
    const countryFontSize = (6 + mapZoom * 0.7) / mapZoom;
    const countryHaloSize = (1.5 + mapZoom * 0.12) / mapZoom;
    const waterFontSize = (7 + mapZoom * 0.8) / mapZoom;
    const waterHaloSize = (1.7 + mapZoom * 0.12) / mapZoom;
    for (const element of root.querySelectorAll<SVGElement>(
      ".map-label,.natural-cities text,.natural-mountains text",
    )) {
      element.style.fontSize = `${countryFontSize}px`;
      element.style.strokeWidth = `${countryHaloSize}px`;
    }
    for (const element of root.querySelectorAll<SVGElement>(
      ".free-label.water",
    )) {
      element.style.fontSize = `${waterFontSize}px`;
      element.style.strokeWidth = `${waterHaloSize}px`;
    }
    layoutMapSvgLabels(root as unknown as SVGSVGElement, {
      zoom: mapZoom,
      layers: {
        labels: mapLayers.labels,
        water: mapLayers.water,
        cities: mapLayers.cities,
        mountains: mapLayers.mountains,
      },
    });
    const contentLayer = parsed.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    contentLayer.setAttribute("id", "map-content");
    contentLayer.setAttribute("data-name", "Map content");
    contentLayer.setAttribute(
      "transform",
      `translate(${-viewBox.x} ${-viewBox.y})`,
    );
    const movableChildren = [...root.children].filter(
      (element) =>
        !["defs", "style", "desc"].includes(element.tagName.toLowerCase()),
    );
    for (const element of movableChildren) contentLayer.appendChild(element);
    root.appendChild(contentLayer);
    root.setAttribute("viewBox", `0 0 ${viewBox.width} ${viewBox.height}`);
    root.setAttribute("width", "1000");
    root.setAttribute("height", "700");
    const backgroundLayer = parsed.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    backgroundLayer.setAttribute("id", "export-background");
    backgroundLayer.setAttribute("data-name", "Export background");
    const background = parsed.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    background.setAttribute("x", "0");
    background.setAttribute("y", "0");
    background.setAttribute("width", String(viewBox.width));
    background.setAttribute("height", String(viewBox.height));
    background.setAttribute("fill", "#eaf6fa");
    background.setAttribute("data-export-background", "true");
    backgroundLayer.appendChild(background);
    root.insertBefore(backgroundLayer, contentLayer);
    const filename = `${
      figureOutput.spec.title
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "map"
    }.svg`;
    downloadFigure(
      new XMLSerializer().serializeToString(root),
      filename,
      "image/svg+xml",
    );
  }

  function verificationMarkdown(report: string) {
    const data = JSON.parse(report) as {
      generatedAt?: string;
      generator?: string;
      model?: string;
      referenceCount?: number;
      palette?: AseSwatch[];
      spec?: {
        title?: string;
        date?: string;
        place?: string;
        sources?: Array<{ id: string; title: string; url: string }>;
        notes?: string[];
      };
      checks?: FigureCheck[];
    };
    const lines = [
      `# ${data.spec?.title || "Verification report"}`,
      "",
      `- Generated: ${data.generatedAt || ""}`,
      `- Generator: ${data.generator || ""}`,
      `- Model: ${data.model || ""}`,
    ];
    if (data.spec?.place) lines.push(`- Place: ${data.spec.place}`);
    if (data.spec?.date) lines.push(`- Date or period: ${data.spec.date}`);
    if (typeof data.referenceCount === "number")
      lines.push(`- Reference images: ${data.referenceCount}`);
    lines.push(
      "",
      "## Checks",
      "",
      ...(data.checks || []).map(
        ({ level, message }) =>
          `- ${level === "pass" ? "PASS" : "WARNING"}: ${message}`,
      ),
    );
    if (data.spec?.sources?.length)
      lines.push(
        "",
        "## Sources",
        "",
        ...data.spec.sources.map(
          ({ id, title, url }) => `- ${id}: [${title}](${url})`,
        ),
      );
    if (data.palette?.length)
      lines.push(
        "",
        "## Adobe palette",
        "",
        ...data.palette.map(
          ({ name, hex, model, values, group }) =>
            `- ${name}: ${hex} — ${model}${values?.length ? ` (${values.join(", ")})` : ""}${group ? ` — ${group}` : ""}`,
        ),
      );
    if (data.spec?.notes?.length)
      lines.push(
        "",
        "## Notes",
        "",
        ...data.spec.notes.map((note) => `- ${note}`),
      );
    return `${lines.join("\n")}\n`;
  }

  const selectedLabel = selected
    ? t.apps[selected as keyof typeof t.apps]
    : null;
  const selectedGroup = selected
    ? groups.find((group) => group.items.some((item) => item === selected))
    : undefined;
  const selectedNumber =
    selected === "manual"
      ? "01"
      : selected && selectedGroup
        ? String(
            selectedGroup.items.findIndex((item) => item === selected) + 1,
          ).padStart(2, "0")
        : null;
  const selectedInitial =
    selectedLabel
      ?.trim()
      .charAt(0)
      .toLocaleUpperCase(language === "cs" ? "cs-CZ" : "en-US") ?? null;
  const selectedSection =
    selected === "manual"
      ? "REFERENCE"
      : selectedGroup
        ? t[selectedGroup.key].toUpperCase()
        : null;
  const helpKey =
    selected === "extraction" ||
    selected === "index" ||
    selected === "grep" ||
    selected === "coverSplitter" ||
    selected === "prompt" ||
    selected === "solutions" ||
    selected === "typesetter" ||
    selected === "scriptBuffet" ||
    selected === "barcode" ||
    selected === "map" ||
    selected === "bio" ||
    selected === "graph" ||
    selected === "cover" ||
    selected === "layerSplitter"
      ? selected
      : "general";
  const help = infoDrawers[language][helpKey];
  const clockHours = now ? String(now.getHours()).padStart(2, "0") : "--";
  const clockMinutes = now ? String(now.getMinutes()).padStart(2, "0") : "--";
  const localDate = now
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    : "---- -- --";
  const namedayKey = now
    ? `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    : "";
  const nameday =
    namedayKey === "08-04"
      ? "Dominika"
      : namedayKey
        ? czechNamedays[namedayKey]
        : "—";

  return (
    <main
      className={`app-shell ${sidebarOpen ? "" : "sidebar-collapsed"}`}
      data-theme={theme}
    >
      <header className="topbar">
        <div className="brand">
          <button
            className="brand-mark"
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            aria-expanded={sidebarOpen}
          >
            <span className="brand-logo" aria-hidden="true" />
          </button>
          <button
            className="brand-name"
            onClick={() => setSelected(null)}
            aria-label={t.home}
          >
            <strong>TAKTIK</strong> ROBOT
          </button>
        </div>

        <div className="topbar-controls">
          <span className="system-status">
            <i />
            <PageLoadStatus items={robotStatusPhrases[language]} />
          </span>
          <button
            ref={bugReportButtonRef}
            className={`utility icon-button bug-report ${feedbackOpen ? "pressed" : ""}`}
            onClick={openBugFeedback}
            aria-label={t.bugFeedback.heading}
            aria-expanded={feedbackOpen}
          >
            <span aria-hidden="true" className="material-icons">
              bug_report
            </span>
          </button>
          <button
            className="utility language"
            onClick={toggleLanguage}
            aria-label={t.changeLanguage}
          >
            <span className={language === "en" ? "active-option" : ""}>EN</span>
            <span>/</span>
            <span className={language === "cs" ? "active-option" : ""}>CZ</span>
          </button>
          <button
            className="utility icon-button"
            onClick={toggleTheme}
            aria-label={t.toggleTheme}
          >
            <span aria-hidden="true">{theme === "light" ? "◐" : "◑"}</span>
          </button>
          <button
            className={`utility icon-button ${infoOpen ? "pressed" : ""}`}
            onClick={() => setInfoOpen((value) => !value)}
            aria-label={t.openInformation}
            aria-expanded={infoOpen}
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
              onClick={() =>
                setOpen((state) => ({
                  ...state,
                  [group.key]: !state[group.key],
                }))
              }
              aria-expanded={open[group.key]}
            >
              <span>{t[group.key]}</span>
              <span className="disclosure" aria-hidden="true">
                {open[group.key] ? "−" : "+"}
              </span>
            </button>
            {open[group.key] && (
              <div className="nav-items">
                {group.items.map((item, index) => {
                  const sidebarStatus = sidebarStatuses[item];

                  return (
                    <button
                      className={`nav-item ${selected === item ? "selected" : ""} ${completedApps.has(item) ? "" : "unavailable"} ${sidebarStatus ? "has-sidebar-status" : ""}`}
                      key={item}
                      onClick={() => selectApp(item)}
                      aria-disabled={!completedApps.has(item)}
                    >
                      <span className="item-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{t.apps[item]}</span>
                      {sidebarStatus && (
                        <span
                          className={`sidebar-status sidebar-status-${sidebarStatus}`}
                          aria-hidden="true"
                        >
                          {sidebarStatus === "tested"
                            ? "✓"
                            : sidebarStatus === "to-test"
                              ? "T"
                              : "α"}
                        </span>
                      )}
                      {comingSoon === item && (
                        <span className="coming-soon-tooltip" role="status">
                          {t.comingSoon}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ))}
        <nav
          className="sidebar-reference"
          aria-label={
            language === "cs" ? "Referenční materiály" : "Reference materials"
          }
        >
          <button
            className={`nav-item reference-item ${selected === "manual" ? "selected" : ""}`}
            onClick={() => setSelected("manual")}
          >
            <span className="book-icon" aria-hidden="true" />
            <span>{t.apps.manual}</span>
          </button>
          <a
            className="nav-item reference-item"
            href={brandGuidelinesUrl}
            target="_blank"
            rel="noreferrer"
          >
            <span className="book-icon" aria-hidden="true" />
            <span>{t.apps.brand}</span>
            <span className="external-mark" aria-hidden="true">
              ↗
            </span>
          </a>
        </nav>
      </aside>

      <section
        className={`workspace ${selected === "image" ? "image-generator-active" : ""}`.trim()}
      >
        <div className="workspace-grid" aria-hidden="true" />
        {selectedNumber && (
          <span className="axis axis-x">{selectedNumber}</span>
        )}
        {selectedInitial && (
          <span className="axis axis-y">{selectedInitial}</span>
        )}
        <ImageGeneratorMainInterface
          language={language}
          active={selected === "image"}
        />
        {selected === "image" ? null : selected === "manual" ? (
          <DesignManualMainInterface
            language={language}
            content={
              language === "cs" ? manualCzechContent : manualEnglishContent
            }
            chapterIndex={manualChapter}
            onChapter={setManualChapter}
            onZoom={setZoomedManualImage}
          />
        ) : selected === "cover" ? (
          <CoverGeneratorMainInterface
            language={language}
            inputRef={coverReferenceInputRef}
            references={coverReferences}
            audience={coverAudience}
            subject={coverSubject}
            customSubject={coverCustomSubject}
            keywords={coverKeywords}
            sketches={coverSketches}
            selectedId={coverSelectedId}
            model={coverModel}
            artOnlyReferences={coverArtOnlyReferences}
            generationCount={coverGenerationCount}
            error={coverError}
            isGenerating={isGeneratingCover}
            onReferenceInput={(event) => void addCoverReferences(event)}
            onAddReferenceFiles={(files) => void addCoverReferenceFiles(files)}
            onRemoveReference={(index) =>
              setCoverReferences((current) =>
                current.filter((_, itemIndex) => itemIndex !== index),
              )
            }
            onAudience={setCoverAudience}
            onSubject={(value) => {
              setCoverSubject(value);
              if (value !== "other") setCoverCustomSubject("");
            }}
            onCustomSubject={setCoverCustomSubject}
            onKeywords={setCoverKeywords}
            onSelectSketch={selectCoverSketch}
            onRejectSketch={rejectCoverSketch}
            onZoom={setZoomedCover}
            onExportArtboard={() => void exportCoverArtboard()}
            onDownload={() => void downloadCoverZip()}
            onModel={setCoverModel}
            onArtOnlyReferences={setCoverArtOnlyReferences}
            onGenerateSketches={(count) => void generateCoverSketches(count)}
          />
        ) : selected === "layerSplitter" ? (
          <LayerSplitterMainInterface
            language={language}
            inputRef={layerSplitterInputRef}
            imageData={layerSplitterImage}
            imageName={layerSplitterImageName}
            quality={layerSplitterQuality}
            result={layerSplitterResult}
            error={layerSplitterError}
            isSplitting={isSplittingLayers}
            onFile={(file) => void selectLayerSplitterFile(file)}
            onRemove={removeLayerSplitterImage}
            onQuality={setLayerSplitterQuality}
            onSplit={() => void splitLayerSplitterImage()}
            onDownload={downloadLayerSplitterPsd}
          />
        ) : selected === "barcode" ? (
          <BarcodeMainInterface
            language={language}
            copy={barcodeT}
            input={barcodeInput}
            error={barcodeError}
            result={barcodeResult}
            onInput={setBarcodeInput}
            onDownload={downloadBarcode}
          />
        ) : selected === "coverSplitter" ? (
          <CoverSplitterMainInterface
            language={language}
            section={selectedSection}
          />
        ) : selected === "solutions" ? (
          <SolutionsImporterMainInterface language={language} />
        ) : selected === "typesetter" ? (
          <TypesetterMainInterface language={language} />
        ) : selected === "scriptBuffet" ? (
          <ScriptBuffetMainInterface language={language} />
        ) : selected === "extraction" ? (
          <TextExtractorMainInterface
            language={language}
            inputRef={fileInputRef}
            sourceKind={sourceKind}
            sourceFile={sourceFile}
            sourceUrl={sourceUrl}
            text={ocrText}
            correction={correctionPrompt}
            error={extractionError}
            copied={copied}
            isProcessing={isProcessing}
            isCorrecting={isCorrecting}
            onFileInput={handleFileInput}
            onDrop={handleDrop}
            onCopy={() => void copyOcrText()}
            onDownload={downloadText}
            onText={setOcrText}
            onCorrection={setCorrectionPrompt}
            onCorrect={() => void correctText()}
          />
        ) : selected === "index" ? (
          <IndexCreatorMainInterface
            language={language}
            inputRef={indexFileInputRef}
            file={indexFile}
            url={indexUrl}
            previewPage={indexPreviewPage}
            words={indexWords}
            result={indexResult}
            matches={indexMatches}
            pdfAnchor={pdfAnchor}
            printedAnchor={printedAnchor}
            error={indexError}
            copied={indexCopied}
            isIndexing={isIndexing}
            progress={indexProgress}
            onFileInput={handleIndexFileInput}
            onDrop={handleIndexDrop}
            onWords={setIndexWords}
            onCreate={() => void createIndex()}
            onCopy={() => void copyIndex()}
            onDownload={downloadText}
            onPreviewPage={setIndexPreviewPage}
            onTogglePage={toggleIndexPage}
            onPdfAnchor={setPdfAnchor}
            onPrintedAnchor={setPrintedAnchor}
          />
        ) : selected === "prompt" ? (
          <PromptExtractorMainInterface
            language={language}
            inputRef={promptFileInputRef}
            file={promptFile}
            url={promptUrl}
            result={promptResult}
            error={promptError}
            copied={promptCopied}
            isExtracting={isExtractingPrompts}
            onFileInput={handlePromptFileInput}
            onDrop={handlePromptDrop}
            onCopy={() => void copyPrompts()}
            onDownload={downloadText}
            onResult={setPromptResult}
          />
        ) : selected === "graph" ? (
          <GraphMainInterface
            language={language}
            section={selectedSection}
            label={selectedLabel}
            prompt={figureRequest}
            data={graphData}
            palette={figurePalette}
            paletteName={figurePaletteName}
            showValueLabels={graphShowValueLabels}
            output={figureOutput as GraphOutput | null}
            error={figureError}
            isGenerating={isGeneratingFigure}
            paletteInputRef={figurePaletteInputRef}
            onPaletteInput={(event) => void addFigurePalette(event)}
            onClearPalette={() => {
              setFigurePalette([]);
              setFigurePaletteName("");
              setFigureOutput(null);
            }}
            onShowValueLabels={setGraphShowValueLabels}
            onPrompt={setFigureRequest}
            onData={setGraphData}
            onGenerate={() => void generateFigure()}
            onDownload={downloadFigure}
          />
        ) : selected === "bio" ? (
          <DiagramMainInterface
            language={language}
            section={selectedSection}
            label={selectedLabel}
            request={figureRequest}
            references={figureReferences}
            palette={figurePalette}
            paletteName={figurePaletteName}
            output={figureOutput as DiagramOutput | null}
            error={figureError}
            isGenerating={isGeneratingFigure}
            referenceInputRef={figureReferenceInputRef}
            paletteInputRef={figurePaletteInputRef}
            onPaletteInput={(event) => void addFigurePalette(event)}
            onClearPalette={() => {
              setFigurePalette([]);
              setFigurePaletteName("");
              setFigureOutput(null);
            }}
            onReferenceInput={(event) => void addFigureReferences(event)}
            onRemoveReference={(index) =>
              setFigureReferences((current) =>
                current.filter((_, itemIndex) => itemIndex !== index),
              )
            }
            onRequest={setFigureRequest}
            onGenerate={() => void generateFigure()}
            onDownload={downloadFigure}
            onVerificationMarkdown={verificationMarkdown}
          />
        ) : selected === "map" ? (
          <MapMainInterface
            language={language}
            palette={figurePalette}
            output={figureOutput as MapOutput | null}
            error={figureError}
            isGenerating={isGeneratingFigure}
            timelineYear={timelineYear}
            timelineYearInput={timelineYearInput}
            isLoadingTimeline={isLoadingTimeline}
            mapLayers={mapLayers}
            mapFillMode={mapFillMode}
            mapZoom={mapZoom}
            mapPan={mapPan}
            paletteInputRef={figurePaletteInputRef}
            onTimelineStep={stepTimelineYear}
            onTimelineInput={changeTimelineYearInput}
            onTimelineCommit={commitTimelineYear}
            onTimelineSlider={(value) => {
              const year = value === 0 ? 1 : value;
              setTimelineYear(year);
              setTimelineYearInput(String(year));
            }}
            onTimelineSliderCommit={(value) =>
              void loadTimelineYear(value === 0 ? 1 : value)
            }
            onToggleLayer={(layer, enabled) => {
              setMapLayers((current) => ({ ...current, [layer]: enabled }));
              if (
                [
                  "climate",
                  "terrain",
                  "mountains",
                  "cities",
                  "disputed",
                ].includes(layer) &&
                enabled &&
                !figureOutput?.svg.includes(
                  `id="${layer === "disputed" ? "disputed-boundaries" : layer === "climate" ? "climate-zones" : layer}"`,
                )
              )
                void loadTimelineYear(timelineYear);
            }}
            onMapFillMode={setMapFillMode}
            onMapZoom={updateMapZoom}
            onMapPan={updateMapPan}
            onPaletteInput={(event) => void addFigurePalette(event)}
            onApplyPalette={applyMapPalette}
            onDownloadCroppedMap={downloadCroppedMap}
            onPointerDown={mapPointerDown}
            onPointerMove={mapPointerMove}
            onPointerUp={mapPointerUp}
            onPointerCancel={mapPointerCancel}
            onWheel={mapWheel}
          />
        ) : selected === "grep" ? (
          <GrepMainInterface
            language={language}
            section={selectedSection}
            findPrompt={grepFindPrompt}
            replacePrompt={grepReplacePrompt}
            result={grepResult}
            error={grepError}
            copied={grepCopied}
            isGenerating={isGeneratingGrep}
            onFindPrompt={setGrepFindPrompt}
            onReplacePrompt={setGrepReplacePrompt}
            onCopy={(value, field) => void copyGrep(value, field)}
            onGenerate={() => void generateGrep()}
            onReset={() => setGrepResult(null)}
          />
        ) : selected === "image" ? null : (
          <div className={`welcome ${selectedLabel ? "has-selection" : ""}`}>
            {selectedLabel ? (
              <>
                <h1>{selectedLabel}</h1>
                <button className="start-button action-button">
                  {t.ready}
                  <span>→</span>
                </button>
              </>
            ) : (
              <>
                <div className="crosshair" aria-hidden="true">
                  <span />
                  <span />
                </div>
                <h1>{t.prompt}</h1>
              </>
            )}
          </div>
        )}
        {!(["extraction", "index", "prompt"] as Array<string | null>).includes(
          selected,
        ) && (
          <div className="workspace-status">
            <span className="live-clock">
              {clockHours}
              <i className={now && now.getSeconds() % 2 === 0 ? "visible" : ""}>
                :
              </i>
              {clockMinutes}
            </span>
            <span>{localDate}</span>
            <span className="nameday" title={nameday}>
              {nameday.toLocaleUpperCase("cs-CZ")}
            </span>
          </div>
        )}
      </section>

      {infoOpen && (
        <button
          className="drawer-scrim"
          onClick={() => setInfoOpen(false)}
          aria-label={t.close}
        />
      )}
      {zoomedManualImage && (
        <DesignManualLightbox
          image={zoomedManualImage}
          closeLabel={t.close}
          onClose={() => setZoomedManualImage(null)}
        />
      )}
      {zoomedCover && (
        <CoverLightbox
          language={language}
          cover={zoomedCover}
          onMove={moveZoomedCover}
          onClose={() => setZoomedCover(null)}
        />
      )}
      <BugFeedbackDialog
        open={feedbackOpen}
        language={language}
        username={username}
        diagnostics={feedbackDiagnostics}
        triggerRef={bugReportButtonRef}
        onCloseAction={() => setFeedbackOpen(false)}
      />
      <aside
        className={`info-drawer${infoOpen ? " open" : ""}`}
        aria-hidden={!infoOpen}
      >
        <div className="drawer-header">
          <span>INFO / {selected?.toUpperCase() || "ROBOT"}</span>
          <button onClick={() => setInfoOpen(false)} aria-label={t.close}>
            ×
          </button>
        </div>
        <div className="drawer-content">
          <h2>{selectedLabel || t.about}</h2>
          <ReactMarkdown>{help}</ReactMarkdown>
        </div>
        <div className="orange-block" aria-hidden="true" />
      </aside>
    </main>
  );
}

function PageLoadStatus({ items }: { items: readonly string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const selection = window.setTimeout(
      () => setIndex(Math.floor(Math.random() * items.length)),
      0,
    );
    return () => window.clearTimeout(selection);
  }, [items.length]);
  return <span>{items[index]}</span>;
}

function formatPageRanges(pages: number[]) {
  const sorted = [...new Set(pages)].sort((left, right) => left - right);
  const ranges: string[] = [];
  let start: number | null = null;
  let end: number | null = null;

  for (const page of sorted) {
    if (page <= 0) continue;
    if (start === null) {
      start = page;
      end = page;
      continue;
    }
    if (page === (end as number) + 1) {
      end = page;
      continue;
    }
    ranges.push(start === end ? String(start) : `${start}–${end}`);
    start = page;
    end = page;
  }

  if (start !== null && end !== null)
    ranges.push(start === end ? String(start) : `${start}–${end}`);
  return ranges.join(", ");
}

function formatIndexOutput(
  matches: Array<{ word: string; pdfPages: number[] }>,
  pdfAnchor: number,
  printedAnchor: number,
) {
  return matches
    .map(({ word, pdfPages }) => {
      const printedPages = pdfPages
        .map((page) => printedAnchor + page - pdfAnchor)
        .filter((page) => page > 0);
      return `${word}\t${formatPageRanges(printedPages)}`;
    })
    .join("\n");
}

function createZip(entries: Array<{ name: string; data: Uint8Array }>) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const write32 = (view: DataView, position: number, value: number) =>
    view.setUint32(position, value >>> 0, true);
  const write16 = (view: DataView, position: number, value: number) =>
    view.setUint16(position, value, true);
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    write32(view, 0, 0x04034b50);
    write16(view, 4, 20);
    write16(view, 8, 0);
    write32(view, 14, checksum);
    write32(view, 18, entry.data.length);
    write32(view, 22, entry.data.length);
    write16(view, 26, name.length);
    header.set(name, 30);
    chunks.push(header, entry.data);
    const record = new Uint8Array(46 + name.length);
    const recordView = new DataView(record.buffer);
    write32(recordView, 0, 0x02014b50);
    write16(recordView, 4, 20);
    write16(recordView, 6, 20);
    write16(recordView, 10, 0);
    write32(recordView, 16, checksum);
    write32(recordView, 20, entry.data.length);
    write32(recordView, 24, entry.data.length);
    write16(recordView, 28, name.length);
    write32(recordView, 42, offset);
    record.set(name, 46);
    central.push(record);
    offset += header.length + entry.data.length;
  }
  const centralSize = central.reduce((total, item) => total + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 8, entries.length);
  write16(endView, 10, entries.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, offset);
  return new Blob(
    [...chunks, ...central, end].map((chunk) => chunk.slice().buffer),
  );
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
