### What is this?

Upload a live-text textbook PDF and enter one index term or phrase per line. You will get a reviewable index of matching printed pages, ready to copy or download as a tab-separated MD or TXT file.

### How does it work?

`PDF.js` reads the PDF text and detects printed page numbers in the browser. Pages with too little text are rendered locally and checked with Czech `Tesseract.js` OCR. Only the term list is sent through OpenRouter to the configured model, which proposes grammatical forms. The browser validates and searches those forms, ranks the matching pages, applies your review choices, and formats consecutive pages as ranges.

Matches and possible pages are heuristic and require review. Printed-page mapping uses detected anchors, with a 1:1 PDF-page fallback where reliable mapping is unavailable. OCR runtime/language data can be downloaded, but PDF pages stay local.
