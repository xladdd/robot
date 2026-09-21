import type { Language } from "../../registry";

export const layerSplitterUi: Record<
  Language,
  {
    code: string;
    heading: string;
    subtitle: string;
    sourceImage: string;
    empty: string;
    upload: string;
    uploadHelp: string;
    change: string;
    remove: string;
    quality: string;
    qualityFast: string;
    qualityFidelity: string;
    qualityFastHelp: string;
    qualityFidelityHelp: string;
    split: string;
    splitting: string;
    download: string;
    result: string;
    layerCount: string;
    reconstructed: string;
    warning: string;
    error: string;
    note: string;
    dropFile: string;
    fileSelected: string;
    console: string;
    consoleRunning: string;
    consoleReady: string;
    consoleFailed: string;
    consoleAccepted: string;
    consoleWorking: string;
    consoleComplete: string;
    consoleValidated: string;
    consoleStopped: string;
  }
> = {
  en: {
    code: "IMAGE / LAYER SPLITTER",
    heading: "Layer Splitter",
    subtitle:
      "Reconstruct a supplied image as complete, editable Photoshop layers.",
    sourceImage: "SOURCE IMAGE",
    empty: "Add one image to begin reconstructing editable layers.",
    upload: "ADD\nIMAGE",
    uploadHelp: "PNG, JPEG, or WebP · hidden areas are reconstructed by AI",
    change: "Choose another image",
    remove: "Remove image",
    quality: "QUALITY",
    qualityFast: "Fast",
    qualityFidelity: "Fidelity",
    qualityFastHelp: "Lower-cost FLUX.2 Klein generation",
    qualityFidelityHelp: "Higher-quality FLUX.2 Pro generation",
    split: "Split into layers",
    splitting: "Reconstructing layers…",
    download: "Download reconstructed PSD",
    result: "Reconstructed PSD ready",
    layerCount: "layers",
    reconstructed: "complete layers",
    warning:
      "Hidden areas and removed text are plausibly reconstructed by AI; they are not recovered source pixels.",
    error:
      "The image could not be reconstructed. Please try a clear image with distinct objects.",
    note: "Fast uses FLUX.2 Klein; Fidelity uses FLUX.2 Pro. The background is complete and text is removed where possible.",
    dropFile: "Drop file here, or click to select",
    fileSelected: "IMAGE SELECTED",
    console: "PROCESS CONSOLE",
    consoleRunning: "RUNNING",
    consoleReady: "READY",
    consoleFailed: "STOPPED",
    consoleAccepted: "Source accepted: {name}",
    consoleWorking:
      "The reconstruction request is running. This may take several minutes.",
    consoleComplete: "PSD assembled with {count} layers.",
    consoleValidated:
      "Validated {valid} of {requested} reconstructed object layers.",
    consoleStopped: "Reconstruction stopped before a PSD could be assembled.",
  },
  cs: {
    code: "OBRAZ / ROZDĚLOVAČ VRSTEV",
    heading: "Rozdělovač vrstev",
    subtitle: "Vytvoří z dodaného obrázku úplné upravitelné vrstvy Photoshopu.",
    sourceImage: "ZDROJOVÝ OBRÁZEK",
    empty: "Přidejte jeden obrázek a vytvořte z něj upravitelné vrstvy.",
    upload: "PŘIDAT\nOBRÁZEK",
    uploadHelp: "PNG, JPEG nebo WebP · skryté části vytvoří AI",
    change: "Vybrat jiný obrázek",
    remove: "Odebrat obrázek",
    quality: "KVALITA",
    qualityFast: "Rychlá",
    qualityFidelity: "Věrná",
    qualityFastHelp: "Levnější generování FLUX.2 Klein",
    qualityFidelityHelp: "Kvalitnější generování FLUX.2 Pro",
    split: "Rozdělit na vrstvy",
    splitting: "Vytváření vrstev…",
    download: "Stáhnout rekonstruovaný PSD",
    result: "Rekonstruovaný PSD je připraven",
    layerCount: "vrstev",
    reconstructed: "úplné vrstvy",
    warning:
      "Skryté části a odstraněný text vytvoří AI; nejde o obnovené pixely ze zdroje.",
    error:
      "Obrázek se nepodařilo rekonstruovat. Zkuste jasný obrázek s odlišnými objekty.",
    note: "Rychlá volba používá FLUX.2 Klein, věrná FLUX.2 Pro. Pozadí je úplné a text je podle možností odstraněn.",
    dropFile: "Přetáhněte soubor sem nebo klikněte pro výběr",
    fileSelected: "VYBRANÝ OBRÁZEK",
    console: "KONZOLE ZPRACOVÁNÍ",
    consoleRunning: "PROBÍHÁ",
    consoleReady: "HOTOVO",
    consoleFailed: "ZASTAVENO",
    consoleAccepted: "Zdroj přijat: {name}",
    consoleWorking:
      "Požadavek na rekonstrukci se zpracovává. Může to trvat několik minut.",
    consoleComplete: "PSD bylo sestaveno s {count} vrstvami.",
    consoleValidated:
      "Ověřeno {valid} z {requested} rekonstruovaných vrstev objektů.",
    consoleStopped: "Rekonstrukce se zastavila před sestavením PSD.",
  },
};
