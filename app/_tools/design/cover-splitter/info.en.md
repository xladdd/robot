### What is this?

Add one or more cover-spread PDFs, choose A5, A4, B5, or an equal half for each file, and optionally include the inside cover. You will get separate vector PDFs for the back and front panels, collected in one ZIP archive. The PDF, PNG, and JPG buttons each download a format-specific ZIP containing every split panel.

### How does it work?

`PDF.js` previews each first page in the browser. When splitting starts, `Pyodide` runs Python and `pypdf` in a browser worker to crop the source pages without rasterising their vectors. The output files are named `_BACK.pdf` and `_FRONT.pdf`, with matching inside-cover files when requested, and are packaged as a ZIP; no PDF is uploaded. PNG and JPG files are rendered locally only when their download button is selected, then added to the ZIP alongside the original vector PDFs.
