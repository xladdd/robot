### What is this?

Add a clean PDF, the matching annotated manuscript PDF, and matching IDML, then review the detected text, table, mark, and colour operations. You will get an `indesign-solutions-v2` JSON file that the downloadable InDesign script can place with Advanced layout-aware mode or Simple direct-coordinate mode.

### How does it work?

`PDF.js`, `Pyodide`, Python, `pdfplumber`, and an IDML parser run in the browser to compare the PDFs by position and combine the differences with page, table, style, swatch, and link metadata. Your review choices are written into the JSON; no document is uploaded and no AI model is used. The InDesign script validates that JSON before applying the selected mode. Use Advanced for tables and aligned answer boxes; if it fails, undo the import and rerun the script in the more failsafe Simple mode.
