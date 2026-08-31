### What is this?

Solutions Importer reads a clean PDF, an editor's annotated manuscript PDF, and matching IDML to prepare text, table, mark, and colour operations for InDesign.

The review screen separates confident operations from ambiguous annotations. Untick false detections before downloading the JSON.

When either PDF contains bleed or printer's marks, enable the printer-mark option. The embedded TrimBox then defines the InDesign page coordinates.

The same reviewed JSON works with two InDesign scripts. **Simple** places each detected text operation at its PDF coordinates. **Advanced** also recognises answer boxes and table cells, duplicates matching table structures, and aligns continuation text.

Use Advanced when the chapter has tables or structured answer boxes. If Advanced fails or produces a poor result, undo it and try Simple; Simple has fewer assumptions and is more failsafe.

Linked Illustrator, Photoshop, and raster artwork is intentionally left for manual editing.

### How does it work?

Python, pdfplumber, and an IDML parser run locally in Pyodide. Clean and annotated PDF text are compared by position, PDF annotation geometry is classified conservatively, and IDML supplies page, table, style, swatch, and link metadata. No document is uploaded and no AI service is used.
