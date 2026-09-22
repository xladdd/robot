### What is this?

Upload a manuscript PDF of up to 20 pages to identify its meaningful visual assets. You will get illustration prompts in source-page order, ready to copy or download as an MD or TXT file.

### How does it work?

`PDF.js` checks the page count and renders each page in the browser as an overview and enlarged detail images. Those page images are sent one page at a time through OpenRouter to `qwen/qwen3.5-122b-a10b 🇨🇳`, which inventories and verifies the visual assets. The browser groups the returned prompts by source page and displays the result; the PDF text layer and original PDF file are not uploaded.
