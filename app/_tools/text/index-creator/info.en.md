### What is this?

Upload a live-text textbook PDF and enter one index term or phrase per line. You will get a reviewable index of matching printed pages, ready to copy or download as a tab-separated MD or TXT file.

### How does it work?

`PDF.js` reads the PDF text and detects printed page numbers in the browser. Pages with too little text are rendered locally and checked with Czech `Tesseract.js` OCR. Only the term list is sent through OpenRouter to `mistralai/mistral-medium-3-5 🇪🇺`, which proposes grammatical forms. The browser validates and searches those forms, ranks the matching pages, applies your review choices, and formats consecutive pages as ranges.
