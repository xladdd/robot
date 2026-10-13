### What is this?

Compare a clean PDF, matching annotated manuscript PDF, and matching IDML locally, then review the proposed text answers. Download indesign-solutions-v2 JSON and either the Advanced or Simple InDesign importer. Both importers place text only: they do not recreate arbitrary handwritten marks, artwork, or colour changes.

### How does it work?

PDF.js and browser Python/IDML processing compare positions and extract supporting page, table, and style metadata. Documents stay local; browser runtimes and dependencies may be downloaded. No AI model is used. Advanced adds layout-aware table/answer placement; Simple uses direct-coordinate text frames. If Advanced fails, undo and try Simple on a copy.

Advanced replaces all items on the SOLUTIONS layer, including manually added items. Simple removes only its previously labelled Simple output. Importers can also update styles. Back up the document, inspect the JSON, and review every imported page.
