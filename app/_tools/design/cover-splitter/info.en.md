### What is this?

Cover Splitter turns cover-spread PDFs into separate vector PDFs for the back and front covers. The results are collected in one ZIP archive.

Choose A5, A4, or B5 when the outside panels have a standard finished width. **Split in half** divides the full spread exactly at its midpoint. The initial choice is inferred from the first-page height when it is within approximately 3 mm of a standard trim height, and it can be changed separately for every file.

By default, only page 1 is processed and page 2 containing the inside cover is ignored. Enable **Also split the inside cover** to create four matching PDFs: page 1 left becomes `_BACK`, page 1 right becomes `_FRONT`, page 2 left becomes `_FRONT-inside`, and page 2 right becomes `_BACK-inside`.

### How does it work?

The first page is previewed locally with PDF.js. When you start splitting, Python and the PDF tools run locally in this browser through Pyodide, preserving the source PDF vectors. No PDF is uploaded. The first use downloads the Python runtime and PDF package, so it can take longer than later runs during the same session.

Each source PDF may be up to 30 MB. The ZIP always contains `_BACK.pdf` and `_FRONT.pdf` files based on the original filenames. When inside-cover splitting is enabled, it also contains `_FRONT-inside.pdf` and `_BACK-inside.pdf`.
