import type { Language } from "../../registry";

export const layerSplitterUi: Record<
  Language,
  {
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
    keepOnscreen: string;
  }
> = {
  en: {
    heading: "Layer Splitter",
    subtitle:
      "Extract and reconstruct a supplied image as editable Photoshop layers.",
    sourceImage: "SOURCE IMAGE",
    empty: "Add one image to begin splitting it into editable layers.",
    upload: "ADD\nIMAGE",
    uploadHelp: "PNG, JPEG, or WebP · visible cutouts plus AI reconstruction",
    change: "Choose another image",
    remove: "Remove image",
    quality: "QUALITY",
    qualityFast: "Fast",
    qualityFidelity: "Fidelity",
    qualityFastHelp:
      "Visible source cutouts and reconstructed background holes",
    qualityFidelityHelp:
      "Background and hidden-part reconstruction; subjects may be regenerated",
    split: "Split into layers",
    splitting: "Splitting layers…",
    download: "Download layered PSD",
    result: "Layered PSD ready",
    layerCount: "layers",
    reconstructed: "extracted layers",
    warning:
      "Ordinary cutouts preserve source pixels. Fidelity may regenerate complete subjects and change their visible appearance; inspect the result and warnings.",
    error:
      "The image could not be split. Please try a clear image with distinct objects.",
    note: "Fast keeps visible cutouts. Fidelity additionally attempts hidden-part completion or complete-subject regeneration. INFO lists the configured models and limitations.",
    dropFile: "Drop file here, or click to select",
    fileSelected: "IMAGE SELECTED",
    keepOnscreen:
      "Keep this browser tab open. You can switch tools while generation continues.",
  },
  cs: {
    heading: "Rozdělovač vrstev",
    subtitle:
      "Extrahuje a rekonstruuje dodaný obrázek do upravitelných vrstev Photoshopu.",
    sourceImage: "ZDROJOVÝ OBRÁZEK",
    empty: "Přidejte jeden obrázek a začněte ho dělit na upravitelné vrstvy.",
    upload: "PŘIDAT\nOBRÁZEK",
    uploadHelp:
      "PNG, JPEG nebo WebP · viditelné výřezy a rekonstrukce pomocí AI",
    change: "Vybrat jiný obrázek",
    remove: "Odebrat obrázek",
    quality: "KVALITA",
    qualityFast: "Rychlá",
    qualityFidelity: "Věrná",
    qualityFastHelp:
      "Viditelné výřezy ze zdroje a rekonstrukce chybějícího pozadí",
    qualityFidelityHelp:
      "Rekonstrukce pozadí a skrytých částí; subjekty se mohou znovu vygenerovat",
    split: "Rozdělit na vrstvy",
    splitting: "Dělení vrstev…",
    download: "Stáhnout vrstvený PSD",
    result: "Vrstvený PSD je připraven",
    layerCount: "vrstev",
    reconstructed: "extrahovaných vrstev",
    warning:
      "Běžné výřezy zachovávají původní pixely. Věrný režim může znovu vygenerovat celé subjekty a změnit jejich viditelný vzhled; zkontrolujte výsledek a upozornění.",
    error:
      "Obrázek se nepodařilo rozdělit. Zkuste jasný obrázek s odlišnými objekty.",
    note: "Rychlá volba ponechá viditelné výřezy. Věrná se navíc pokusí doplnit skryté části nebo znovu vygenerovat celé subjekty. INFO uvádí nakonfigurované modely a omezení.",
    dropFile: "Přetáhněte soubor sem nebo klikněte pro výběr",
    fileSelected: "VYBRANÝ OBRÁZEK",
    keepOnscreen:
      "Ponechte tuto kartu prohlížeče otevřenou. Během generování můžete přepínat nástroje.",
  },
};
