### What is this?

Typesetter turns an inconsistently styled Word manuscript into reviewed semantic JSON for a prepared InDesign template. It inventories styles from IDML, asks AI to classify manuscript blocks, and provides an InDesign script that fills one main threaded story.

### How does it work?

1. Prepare and thread the main text frames in InDesign. Label the first frame `typesetter:story:main` in the Script Label panel, create the required paragraph styles, and export the template as IDML.
2. Upload the manuscript as DOCX and the template as IDML. Both packages are opened locally in your browser.
3. Let AI suggest a small controlled set of semantic roles. Accept the roles you need and map each one to a style found in the uploaded IDML.
4. Run the complete analysis and review all uncertain or unsupported blocks. The original manuscript text and source order are preserved.
5. Download the reviewed JSON and `import_typesetter.jsx`. Run the script on a copy of the matching InDesign file and inspect every page.

### Data and limitations

The DOCX and IDML files remain in the browser. Extracted manuscript blocks are sent to the configured OpenRouter model during pre-scan and classification; the IDML file is not sent. V1 supports one main story, paragraph-level styles, simple lists, captions, and image requests. It does not design pages, compose complex tables, or repair overset text.

Image requests are created as ordinary, unanchored frames on the `IMAGE REQUESTS` layer. Position or replace them manually. Always run the importer on a copy and check the complete result.
