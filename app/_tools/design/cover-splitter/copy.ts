export const coverSplitterCopy = {
  en: {
    heading: "Cover Splitter",
    moduleCode: "COVER SPLITTING",
    intro:
      "Split cover spreads into separate back- and front-cover PDFs without uploading the source files.",
    upload: "Drag PDFs here or click to select files",
    addMore: "Add more PDFs",
    controls: "Cover splitting controls",
    files: "FILES",
    firstPageOnly:
      "By default, only page 1 is split and page 2 (the inside cover) is ignored.",
    splitInside: "Also split the inside cover (page 2)",
    insideMapping:
      "Page 2 uses the same panel size: left becomes FRONT-inside and right becomes BACK-inside.",
    localProcessing:
      "Python runs locally in this browser. The first use downloads the Python runtime and PDF tools.",
    preparingPreviews: "Preparing first-page previews…",
    invalidFile: (name: string) => `${name} is not a valid PDF.`,
    fileTooLarge: (name: string) => `${name} exceeds the 30 MB limit.`,
    duplicateFile: (name: string) =>
      `${name} was already added and was skipped.`,
    previewFailed: (name: string) =>
      `The first page of ${name} could not be previewed.`,
    previewAlt: (name: string) => `First-page preview of ${name}`,
    remove: "Remove",
    removeFile: (name: string) => `Remove ${name}`,
    sizeLabel: "Finished cover size",
    splitInHalf: "Split in half",
    split: "Split covers",
    splitting: "Splitting covers…",
    loadingRuntime: "Downloading the local Python runtime…",
    loadingPdfTools: "Loading local PDF tools…",
    preparingFiles: "Preparing PDFs in local memory…",
    loadingSplitter: "Loading the local cover splitter…",
    splittingFile: (name: string) =>
      name ? `Splitting ${name}…` : "Splitting covers…",
    packaging: "Packaging the split covers…",
    ready: "The ZIP archive is ready.",
    splitFailed:
      "The covers could not be split. Please check the PDFs and try again.",
    sizeDoesNotFit:
      "The selected finished size is wider than at least one source cover. Choose another size or Split in half.",
    emptyPdf: "At least one PDF has no first page to split.",
    missingInsidePage:
      "Inside-cover splitting is enabled, but at least one PDF does not have a second page.",
    insideSizeMismatch:
      "At least one inside-cover page does not match the outside-cover dimensions.",
    workerFailed:
      "The local cover splitter could not be started. Please try again.",
    download: "Download ZIP",
    downloadLabel: "Download the ZIP archive with split covers",
    downloadFilesLabel: (format: string) =>
      `Download a ZIP archive with the split cover ${format} files`,
    packagingFormat: (format: string) =>
      `Packaging the ${format} download archive…`,
    formatArchiveReady: (format: string) =>
      `The ${format} download archive is ready.`,
    exportStarting: (format: string, count: number) =>
      `Preparing ${count} ${format} file${count === 1 ? "" : "s"} locally…`,
    renderingFile: (
      format: string,
      current: number,
      total: number,
      name: string,
    ) => `Rendering ${format} ${current}/${total}: ${name}`,
    updatingArchive: "Updating the ZIP archive with the requested exports…",
    exportReady: (format: string) =>
      `${format} files are ready and the ZIP archive has been updated.`,
    exportFailed: (format: string) =>
      `${format} files could not be created. Please try again.`,
    exportFailureDetail: (message: string) => `Export error: ${message}`,
    exporting: "Working…",
    progressLabel: "Cover splitting progress",
    console: "LOCAL CONSOLE",
    consoleIdle: "Ready. Add settings, then split the covers.",
    consoleStarting: "Starting local cover splitting…",
    percentComplete: (progress: number) => `${progress}% complete`,
  },
  cs: {
    heading: "Dělení obálek",
    moduleCode: "ROZDĚLENÍ OBÁLKY",
    intro:
      "Rozdělí rozložené obálky na samostatná PDF zadní a přední obálky bez odesílání zdrojových souborů.",
    upload: "Přetáhněte sem PDF nebo klikněte pro výběr",
    addMore: "Přidat další PDF",
    controls: "Ovládání dělení obálek",
    files: "SOUBORY",
    firstPageOnly:
      "Ve výchozím nastavení se rozdělí pouze 1. strana a 2. strana (vnitřní obálka) se ignoruje.",
    splitInside: "Rozdělit také vnitřní obálku (2. stranu)",
    insideMapping:
      "Druhá strana používá stejný formát panelu: levá část bude FRONT-inside a pravá BACK-inside.",
    localProcessing:
      "Python běží místně v tomto prohlížeči. Při prvním použití se stáhne běhové prostředí Pythonu a nástroje pro PDF.",
    preparingPreviews: "Připravuji náhledy prvních stran…",
    invalidFile: (name: string) => `${name} není platné PDF.`,
    fileTooLarge: (name: string) => `${name} překračuje limit 30 MB.`,
    duplicateFile: (name: string) =>
      `${name} již byl přidán, proto se přeskočil.`,
    previewFailed: (name: string) =>
      `Náhled první strany souboru ${name} se nepodařilo vytvořit.`,
    previewAlt: (name: string) => `Náhled první strany souboru ${name}`,
    remove: "Odebrat",
    removeFile: (name: string) => `Odebrat ${name}`,
    sizeLabel: "Výsledný formát obálky",
    splitInHalf: "Rozdělit na poloviny",
    split: "Rozdělit obálky",
    splitting: "Rozděluji obálky…",
    loadingRuntime: "Stahuji místní běhové prostředí Pythonu…",
    loadingPdfTools: "Načítám místní nástroje pro PDF…",
    preparingFiles: "Připravuji PDF v místní paměti…",
    loadingSplitter: "Načítám místní nástroj pro dělení obálek…",
    splittingFile: (name: string) =>
      name ? `Rozděluji ${name}…` : "Rozděluji obálky…",
    packaging: "Balím rozdělené obálky…",
    ready: "Archiv ZIP je připraven.",
    splitFailed:
      "Obálky se nepodařilo rozdělit. Zkontrolujte PDF a zkuste to znovu.",
    sizeDoesNotFit:
      "Vybraný výsledný formát je širší než alespoň jedna zdrojová obálka. Vyberte jiný formát nebo rozdělení na poloviny.",
    emptyPdf: "Alespoň jedno PDF nemá první stranu, kterou lze rozdělit.",
    missingInsidePage:
      "Dělení vnitřní obálky je zapnuté, ale alespoň jedno PDF nemá druhou stranu.",
    insideSizeMismatch:
      "Rozměry alespoň jedné vnitřní obálky neodpovídají rozměrům vnější obálky.",
    workerFailed:
      "Místní nástroj pro dělení obálek se nepodařilo spustit. Zkuste to znovu.",
    download: "Stáhnout ZIP",
    downloadLabel: "Stáhnout archiv ZIP s rozdělenými obálkami",
    downloadFilesLabel: (format: string) =>
      `Stáhnout archiv ZIP s rozdělenými soubory obálky ${format}`,
    packagingFormat: (format: string) => `Balím archiv pro stažení ${format}…`,
    formatArchiveReady: (format: string) =>
      `Archiv ${format} pro stažení je připravený.`,
    exportStarting: (format: string, count: number) =>
      `Místně připravuji ${count} soubor${count === 1 ? "" : "ů"} ${format}…`,
    renderingFile: (
      format: string,
      current: number,
      total: number,
      name: string,
    ) => `Vytvářím ${format} ${current}/${total}: ${name}`,
    updatingArchive: "Aktualizuji archiv ZIP o požadované výstupy…",
    exportReady: (format: string) =>
      `Soubory ${format} jsou připravené a archiv ZIP je aktualizovaný.`,
    exportFailed: (format: string) =>
      `Soubory ${format} se nepodařilo vytvořit. Zkuste to prosím znovu.`,
    exportFailureDetail: (message: string) => `Chyba exportu: ${message}`,
    exporting: "Pracuji…",
    progressLabel: "Průběh dělení obálek",
    console: "MÍSTNÍ KONZOLE",
    consoleIdle: "Připraveno. Zvolte nastavení a rozdělte obálky.",
    consoleStarting: "Spouštím místní dělení obálek…",
    percentComplete: (progress: number) => `${progress} % dokončeno`,
  },
} as const;
