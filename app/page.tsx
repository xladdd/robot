"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { czechNamedays } from "./czechNamedays";
import manualCzechContent from "../public/design-manual/content-cs.json";
import manualEnglishContent from "../public/design-manual/content-en.json";

type Language = "en" | "cs";
type Theme = "light" | "dark";
type IllustrationPrompt = { page: number; complexity: "simple" | "complex"; prompt: string };
type ManualSourceBlock = { type: string; text?: string; images?: string[]; style?: string; rows?: string[][] };
type ManualChapterView = { title: string; blocks?: ManualSourceBlock[]; sections?: ReadonlyArray<readonly [string, string]> };

const copy = {
  en: {
    prompt: "Let’s go!",
    text: "Text",
    design: "Design",
    apps: {
      extraction: "Text Extractor",
      index: "Index Creator",
      typesetter: "Typesetter",
      prompt: "Prompt Extractor",
      image: "Image Generator",
      cover: "Cover Generator",
      figure: "Figure Generator",
      grep: "GREP Builder",
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
      extraction: "Extraktor textu",
      index: "Tvůrce rejstříku",
      typesetter: "Sazeč",
      prompt: "Extraktor promptů",
      image: "Generátor obrázků",
      cover: "Generátor obálek",
      figure: "Generátor ilustrací",
      grep: "Tvůrce GREP výrazů",
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

const completedApps = new Set(["extraction", "index", "grep", "prompt"]);
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
    prompt: {
      what: [
        "Extraktor promptů vyhledá smysluplné ilustrace v rukopisu v PDF o rozsahu nejvýše 20 stran.",
        "Extraktor oddělí samostatné obrazové prvky, zatímco záměrné skupiny ponechá pohromadě a doplní užitečný počet či uspořádání. Prvky získané z ohraničené ilustrace s rozvinutým pozadím zařadí pod nadpis COMPLEX.",
        "Prázdná místa, rámečky, loga, dekorace a viditelný text ignoruje. Hotový seznam můžete zkopírovat nebo stáhnout jako MD či TXT.",
        "Prompty vždy porovnejte s rukopisem. Vizuální AI může ilustraci přehlédnout nebo nesprávně pochopit děj.",
      ],
      how: "PDF.js místně zkontroluje počet stran a každou stranu vykreslí jako obrázek. Textová vrstva PDF se neextrahuje ani neodesílá. Obrázky stran putují v malých dávkách přes chráněnou serverovou cestu do pevně zvoleného vizuálního modelu Mistral Medium 3.5 na OpenRouteru. Prohlížeč vrácené strukturované popisy seskupí a naformátuje.",
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
  const promptFileInputRef = useRef<HTMLInputElement>(null);
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
      setPromptError("Please use a PDF file.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setPromptError("The file is larger than the 30 MB limit.");
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

  const selectedLabel = selected
    ? t.apps[selected as keyof typeof t.apps]
    : null;
  const selectedGroup = selected ? groups.find((group) => group.items.some((item) => item === selected)) : undefined;
  const selectedNumber = selected === "manual" ? "01" : selected && selectedGroup
    ? String(selectedGroup.items.findIndex((item) => item === selected) + 1).padStart(2, "0")
    : null;
  const selectedInitial = selectedLabel?.trim().charAt(0).toLocaleUpperCase(language === "cs" ? "cs-CZ" : "en-US") ?? null;
  const selectedSection = selected === "manual" ? "REFERENCE" : selectedGroup ? t[selectedGroup.key].toUpperCase() : null;
  const helpKey = selected === "extraction" || selected === "index" || selected === "grep" || selected === "prompt" ? selected : "general";
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
                <span className="module-code">REFERENCE / DESIGN</span>
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
                    <div className="pane-label"><span>{t.extractedPrompts}</span><span>SIMPLE / COMPLEX</span></div>
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
  return <div className={`loading-copy ${compact ? "compact" : ""}`} role="status"><span>{items[index]}</span></div>;
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
