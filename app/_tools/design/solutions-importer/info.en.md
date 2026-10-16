### What is this?

Compare a clean PDF, matching annotated manuscript PDF, and matching IDML locally, then review the proposed text answers. Download `indesign-solutions-v2` JSON and the single InDesign importer, `/solutions/import_solutions.jsx`. Choose Advanced or Simple in the script's dialog. Both strategies place text only: they do not recreate arbitrary handwritten marks, artwork, or colour changes.

### How does it work?

`PDF.js` and browser-based `Python`/IDML processing compare positions and extract supporting page, table, and style metadata. Documents stay local; browser runtimes and dependencies may be downloaded. No AI model is used. Advanced handles table detection, answer-box alignment, and continuation placement; Simple uses only direct-coordinate text frames and is the more failsafe fallback. If Advanced fails, undo and try Simple on a copy.

Advanced replaces all items on the `SOLUTIONS` layer, including manually added items. Simple removes only its previously labelled Simple output. Both strategies can also update styles. Back up the document, inspect the JSON, and review every imported page.
