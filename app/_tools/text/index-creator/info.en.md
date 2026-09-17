### What is this?

Index Creator finds requested words—and their grammatical forms—throughout a large textbook PDF.

Upload a live-text PDF, paste one index word or phrase per line, and create the index. The browser recommends likely index pages and keeps uncertain matches available for review. Accept or remove pages before copying or downloading the tab-separated index.

Copy the finished index with the orange button, or download it directly as an MD or TXT file.

Check the automatically detected page-number mapping before using the result. You can correct the PDF-page and printed-page anchor underneath the output.

Always review the finished index. Languages are wonderfully untidy, and the local ranking can miss or over-include an unusual form. The final output contains only pages you have accepted; consecutive pages are written as ranges.

### How does it work?

PDF.js reads the live text locally, one page at a time, and looks for printed page numbers near the page edges. If a page has very little usable text, Index Creator also renders that page locally and runs Czech OCR in your browser; OCR matches are shown as possible pages and are never sent to OpenRouter. Only your short word list goes through OpenRouter to fixed Mistral Medium 3.5, which proposes Czech, English, Slovak or Romanian grammatical forms. The browser validates those complete forms, searches them on every page, ranks the evidence locally, and lets you review the result before assembling the tab-separated index.
