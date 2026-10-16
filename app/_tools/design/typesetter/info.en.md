### What is this?

Typesetter turns an inconsistently styled Word manuscript into reviewed semantic JSON for a prepared InDesign template. It inventories styles from IDML, asks AI to classify manuscript blocks, and provides an InDesign script that fills one main threaded story.

### How does it work?

Prepare and thread the main text frames in InDesign. Label the first frame `typesetter:story:main` in the Script Label panel, create the required paragraph styles, and export the template as IDML. Load the manuscript as DOCX and the template as IDML; both packages are opened locally in your browser. Extraction preserves plain text and source order, not Word formatting. Browser `Python` runtimes may be downloaded for local extraction.

Extracted manuscript blocks are sent through OpenRouter to the configured model during pre-scan and classification; the DOCX and IDML files remain in the browser, and the IDML file is not sent. Accept the semantic roles you need from the proposed controlled set and map each one to a paragraph style found in the IDML. Run the complete analysis and review uncertain or unsupported blocks, then download the reviewed `indesign-typesetter-v1` JSON and `import_typesetter.jsx`.

The importer replaces the labelled main story and skips unsupported blocks. It supports paragraph-level styles, simple lists, captions, and image requests, but does not design pages, compose complex tables, or repair overset text. Image requests become ordinary, unanchored frames on the `IMAGE REQUESTS` layer for manual placement or replacement. Run the script on a copy of the matching InDesign file and inspect every page for omissions and layout problems.
