export const diagramProcessing = {
  en: ["checking the specimen labels", "peering through the microscope", "arranging the organelles", "untangling the leader lines", "counting the vacuoles", "centering the specimen", "sharpening the diagram pencils", "comparing the reference images", "checking what belongs where", "simplifying the anatomy", "making room for the labels", "giving the SVG a final polish"],
  cs: ["kontrola popisků preparátu", "nahlížení do mikroskopu", "rovnání organel", "rozmotávání odkazových čar", "počítání vakuol", "centrování preparátu", "ořezávání tužek na schéma", "porovnávání referenčních obrázků", "kontrola, co kam patří", "zjednodušování anatomie", "uvolňování místa pro popisky", "závěrečné leštění SVG"],
} as const;

export const diagramUi = {
  en: {
    heading: "Diagram Generator", subtitle: "Create checked, editable SVG biological diagrams. Specifications are validated and coordinates are rendered by code.", badge: "VERIFIED PIPELINE",
    label: "BIOLOGICAL DESCRIPTION", placeholder: "For example: A labelled biological diagram of an amoeba for lower-secondary students.", example: "Insert example",
    generate: "Generate SVG (about 30 seconds)", generating: "Generating SVG", preview: "SVG PREVIEW", checks: "AUTOMATED CHECKS", downloadSvg: "Download SVG", downloadReport: "Download verification report (.md)", empty: "Nothing scarier than an empty page.", warning: "Diagrams require editorial review.",
    references: "REFERENCE IMAGES (OPTIONAL, MAX. 3)", addReference: "Add reference image", remove: "Remove", palette: "COLOR PALETTE (OPTIONAL)", addPalette: "Add Adobe swatches (.ase)", clearPalette: "Remove palette",
  },
  cs: {
    heading: "Generátor schémat", subtitle: "Vytváří ověřená, upravitelná biologická schémata SVG. Specifikace ověří a souřadnice vykreslí kód.", badge: "OVĚŘOVANÝ POSTUP",
    label: "BIOLOGICKÝ POPIS", placeholder: "Například: Popsané biologické schéma měňavky pro žáky 2. stupně.", example: "Vložit příklad",
    generate: "Vytvořit SVG (asi 30 sekund)", generating: "Vytváření SVG", preview: "NÁHLED SVG", checks: "AUTOMATICKÉ KONTROLY", downloadSvg: "Stáhnout SVG", downloadReport: "Stáhnout protokol kontroly (.md)", empty: "Není nic děsivějšího než prázdná stránka.", warning: "Schémata vyžadují redakční kontrolu.",
    references: "REFERENČNÍ OBRÁZKY (VOLITELNÉ, MAX. 3)", addReference: "Přidat referenční obrázek", remove: "Odstranit", palette: "BAREVNÁ PALETA (VOLITELNÉ)", addPalette: "Přidat vzorník Adobe (.ase)", clearPalette: "Odstranit paletu",
  },
} as const;
