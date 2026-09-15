# Basics

## Typography and typesetting

- Typesetting is the process of converting a manuscript (Word and exported PDF) prepared by an editor into a professional print file.

- We use Adobe InDesign for typesetting. We prefer working in the latest available version of InDesign.

- The Word manuscript should be clearly structured and contain all publication elements: headings, texts, exercises, and editor’s notes.

- The designer should focus primarily on producing the manuscript to a high visual standard.

## Performance and work planning

- During a standard working day (8 hours), a designer can complete approximately 3 to 10 pages. However, this is only a **rough estimate**; the number of pages per day depends on:
  - the complexity of the layout
  - the number and complexity of graphic elements (images, diagrams, etc.)
  - the designer’s workload

- **Only the designer can provide a realistic estimate.**

- When working on several projects at the same time, time is divided between the individual projects.

- Corrections and proofreading must also be included in the time estimate. This estimate will vary significantly according to the number and complexity of comments.

## Google Drive vs Dropbox

- We use Google Drive for **working documents** and **sharing**.

- Dropbox is used only for **storing final versions**: source packages, print PDFs, preview PDFs, and where applicable PDFs for the legal notice.

- All files must include a clearly stated date in their name (see the “Uploading to Dropbox” chapter), and older versions must be moved to the `archive` folder.

- For InDesign packages, it is not necessary to upload the `Links` folder again with every update, as it unnecessarily takes up Dropbox space. If **nothing has definitely changed** in it, upload only the `.indd` and `.idml` files, archive their older versions, and leave the `Links` and `Fonts` folders unchanged. If you are unsure, upload the complete package instead.

## Font compatibility between Windows and macOS

- When opening InDesign documents between Windows and macOS, problems with font recognition may occur.

- Some fonts have different names in Windows and macOS.

- The solution is to replace the fonts with versions available on the current system.

- After replacing fonts, we must always check the document’s appearance against the exported PDF.

## Important links

- [Cover templates](https://drive.google.com/open?id=1sr4IgbKhAedO2TTbxRsmNPwxIty3rOS_&usp=drive_fs)

# Typesetting

## Layout recommendations

- The publication design should be well aligned, consistent, and clear.

- The graphic elements used (colours, fonts, numbering, headings, text alignment, etc.) must be consistent throughout the publication.

- When working on a new book within an existing series, it is advisable to follow the preceding volumes.

- It is advisable to take colours from publications that have already been printed, to avoid shades that are too faded or oversaturated.

- The colour swatch set should be limited and reusable.

## Type area

- It should be set so that the content is not too close to the page edges, according to the rules of the golden ratio and with regard to the binding type.

- For perfect binding (V2), allow for loss in the spine (approximately 6–7 mm depending on the number of pages and paper thickness).

- Text should be at least 5 mm from all edges.

## Bleed

- We normally use a 5 mm bleed; in exceptional cases, a minimum of 3 mm.

## Page make-up

- At the beginning, create a publication dummy and lay out the pages and chapters.

- Define paragraph and character styles, master pages with headers and footers, automatic pagination, and it is also useful to prepare a colour swatch set.

- Name everything clearly so that another designer can also navigate the document easily.

- We recommend dividing larger publications into an InDesign Book.

- This makes it easy to divide the publication into individual parts and generate separate PDFs for editorial needs (proofreading, corrections, etc.), package them individually, and so on.

- When making up pages, always take the purpose of the publication into account (e.g. a textbook or workbook). In workbooks in particular, leave enough space for writing.

- I recommend printing it and ideally letting a child try it. Alternatively, try it yourself.
  It is often very unrealistic to fit into the available space.

## Barcodes

- Generate them online, ideally in SVG, EPS, or AI format.
  For example here: [https://freebarcodegenerator.com/](https://freebarcodegenerator.com/).

- The resulting code must be **converted to outlines** and **in CMYK mode**, black only (`C 0/M 0/Y 0/K 100`, not rich black).

- For publications, we use an ISBN barcode in the EAN-13 standard.

- i.e.: `ISBN 978-606-95968-7-6` > `EAN-13 9786069596876`.
  The same number, but without hyphens.

## QR codes

- QR codes can be generated online or directly in InDesign.

- Preferably use InDesign’s built-in function (`Object > Generate QR Code…`).

- The QR code must be converted to outlines and be in CMYK mode. Coloured variants can be used in larger formats.

- The minimum recommended size is 12 mm.

- This will make any further editing during typesetting and during later revisions considerably easier.

## Images, illustrations, vectors

- We primarily use materials from Shutterstock, Wikimedia, or our own illustrators.

- Depending on the editors’ preferences, images may also be AI-generated (e.g. ChatGPT).

- Always verify copyright for other sources.

## Solutions

### Answer layer

- Interactive workbooks must contain a separate top layer with answers.

- The answer layer must be easy to turn on and off.

- Answers are usually not included in print, except in some teacher’s guides.

- Answers should ideally be typeset in dark blue. Ask the editor for the preferred answer format.

- Every exercise should have an answer filled in. If one is missing, inform the editor.

<!-- image-group -->

![Manual image](images/solutions-off.png)

> Answer layer off

![Manual image](images/solutions-on.png)

> Answer layer on

<!-- /image-group -->

### Solutions for publications

- All PDFs containing solutions must also have a **front cover**, so that they do not begin, for example, with the contents and it is immediately clear which publication the solutions belong to, its ISBN, and which edition it is. Covers are created using a new separate layer in the existing source files.

- The editor only asks the designer to prepare the solutions. The designer creates the solutions with a cover and sends them to the editor for further distribution.

1. In the cover source files, create a new layer, name it `reseni`, and move it to the top if it was not created there automatically.
2. Copy the pre-prepared content of the `reseni` layer that matches the cover format into this layer from the [RESENI_obalky-vzor.indd](https://drive.google.com/file/d/1A-n1tiPqh15n61elT3KLSqyTWNPbqvXD/view?usp=share_link) file. Alternatively, create the layer according to the instructions in the [RESENI_obalky-vzor.pdf](https://drive.google.com/file/d/1rXYhKG3y9-X1QKxCWvRBs8NyPXhXFutG/view?usp=share_link) PDF.
3. Update the ISBN, edition, and year according to the imprint.
4. Export the first cover page without bleed and without any marks.
5. Most covers are created with the front and back outer sides as one page. It is therefore necessary to crop it in Acrobat using the Set Page Boxes function. Enter half of the current page width for the left margin and confirm with `OK`.

- Example: the publication is B5 format > the exported PDF is 352 × 250 mm > set the left margin to 176 mm > OK > after cropping, only the front cover should be visible.

6. In the folder containing the exported interior with solutions, select both the cover and the interior. Right-click and choose `Combine files in Acrobat…`. Adobe Acrobat, not only Acrobat Reader, must be installed.
7. In the preview, move the cover to the first position if it is not already there, and click the `Combine` button in the top right corner.
8. Save the new file. When saving solutions, it is advisable to choose the optimised PDF option: the file is significantly smaller and the whole PDF loads faster.
9. When updating a cover for a new edition with a new ISBN, also update these details in the solutions layer.

- This change also affects file naming on Dropbox. The PDF filename for solutions must include the edition number, so that everyone can work with it easily and does not need to open the file to identify the edition. For example: `HM1_PU-2dil_reseni-1vyd_(5-2-2026).pdf`. Keep all editions in the Dropbox solutions folder. Move them to the `archive` folder only when updating solutions without changing the edition; the main folder should contain exactly one solution for each edition.

# Exporting and saving data

## Packaging InDesign documents

<!-- image-group -->

![Manual image](images/cs-package.png)

> “Package” window

![Manual image](images/cs-package-settings.png)

> Settings (the print PDF is not generated here)

<!-- /image-group -->

- Package the complete document, including **fonts**, **links** (including links from hidden layers), and the **IDML file**.

- **Do not use diacritics** in file names, as they cause problems when updating links.

- For a Shutterstock image, retain its file name as is, for example `shutterstock_109250000.jpg`.

- Including IDML in the package makes it possible to open the file in an older version of InDesign or on another platform.

- Unfortunately, fonts usually need to be reactivated because we use fonts from Adobe Creative Cloud. InDesign usually finds them automatically and you only need to download them.

- Check the colour space, resolution, and completeness of the links.

- When duotones are used, for example, they must be converted to CMYK in Photoshop; otherwise they will not print correctly.

- Include the finished print PDF.

## Colour

- Manual conversion of all images to CMYK is not necessary, but it is **recommended**, because colour conversion may cause colour variations in the print PDF.

- When exporting the print PDF, check for any hidden layers (e.g. answers).

- Image resolution should be **ideally 300 DPI**.

- Images in the layout should not be enlarged beyond 120%.

- **A final visual inspection of the exported PDF is important.**

## Preflight

- It is advisable to use a custom Preflight profile in InDesign. It can be configured through `Window > Output > Preflight`. It can reveal issues that are otherwise difficult to catch, such as registration black in an imported image.

- Check in particular:

  - Missing and modified links

  - Spot colours

  - Registration black

  - Image resolution: 300+ DPI

  - Missing fonts

  - Overset text

  - Minimum font size

  - Bleed settings

## Print PDF export settings

<!-- image-group -->

![Manual image](images/cs-export-marks.png)

> PDF/X-1a preset, compatibility: Acrobat 8/9, printer’s marks settings

![Manual image](images/cs-export-fogra.png)

> FOGRA39 output profile

<!-- /image-group -->

- Use the **PDF/X-1a** preset.

- Recommended compatibility: **Acrobat 8/9**. This prevents object edges from appearing in the PDF preview.

- Output profile: **FOGRA39**; resolution: high.

- We normally export individual pages, not spreads.

- Set **bleed** and **crop marks** during export. The **crop-mark offset** must be the same as the bleed size, for example, `bleed 5 mm = mark offset 5 mm`. The marks will then not overlap the bleed area, and the printer will have clean graphics all the way to the trim mark.

- Most printers do not need **registration marks** or **bleed marks**. We recommend retaining crop marks only.

- For a more professional result, you can use **PDF export through PostScript and Distiller**:

1. Download the [Taktik_Tisk.prst](https://drive.google.com/file/d/1xUla2i2KjWNDN8vM9GdFz1q9UCqPv07l/view?usp=share_link) preset.
2. Load the preset in InDesign: `File > Print Presets > Define...`; then click `Load...` and select the downloaded preset.
3. Export the PostScript file: `File > Print`; select the downloaded preset from the `Print Preset` menu. Click `Save` to save the `.ps` file.
4. Open Acrobat Distiller. At the top of the window, select the **PDF/X-1a:2001** setting and drag the `.ps` file into the window. The PDF is automatically exported to the same folder as the `.ps` file.

## Checking in Acrobat

- Before uploading to Dropbox, visually inspect the PDF in Adobe Acrobat.

- Check bleed, crop marks, colour separations, and image sharpness.

- If the team leader/editor allows it, it is also ideal to check the rasterised pages from the printer (CTP).

## Accessible PDFs

A designer may be required to create an accessible PDF. An accessible PDF enables a document to be read correctly by screen readers and other assistive technologies.

### Setting up document structure in InDesign

- Use paragraph and heading styles to establish the correct content hierarchy.

- Add alternative text (Alt Text) to every important image.

- Group related objects correctly.

### Articles panel

- Open `Window > Articles`.

- Drag text frames, images, and other elements into the panel in the correct order.

### Tagging content

- Turn on `View > Structure > Show Structure`.

- Use the correct tags, such as H1, P, etc.

### Exporting to PDF

- Export as `Adobe PDF (Interactive)` or `Adobe PDF (Print)`.

- In the Tags tab, enable `Create Tagged PDF`.

- Under Accessibility, enable `Use Structure for Tab Order`.

### Checking in Adobe Acrobat

- Run `Tools > Accessibility > Full Check`.

- Check the reading order, alternative text, and heading hierarchy.

## Uploading to Dropbox

- Upload data even after small changes, and **always update** both source and print data.

- Missing data or discrepancies between the upload dates of print data and source files waste the time of others, who then have to investigate what was changed, when it was changed, and whether the data is current!

- Follow a **consistent naming system for folders and files:**

<!-- dropbox-tree -->

- **ZAKLADNI SKOLY** – school level – Folder names without diacritics, with spaces.
  - MATEMATIKA 1. stupen – subject/stage
    - Hrava MATEMATIKA – series
      - Hrava MATEMATIKA 1. rocnik – year
        - HM1 PRACOVNI UCEBNICE 1. dil – publication type/part
          - **HM1 PRACOVNI UCEBNICE 1. dil – print**
            - HM1_PU-1dil_obalka_TISK_(20-6-2026).pdf – File names without spaces, with underscores.
            - HM1_PU-1dil_vnitrek_TISK_(20-6-2026).pdf
            - archive
              - HM1_PU-1dil_vnitrek_TISK_(15-1-2025).pdf
          - **HM1 PRACOVNI UCEBNICE 1. dil – sources**
            - HM1 PU 1.dil obalka indd (20-6-2026)
              - Document fonts
              - Links
              - HM1_PU-1dil_obalka.indd
              - HM1_PU-1dil_obalka.idml
            - HM1 PU 1.dil vnitrek indd (20-6-2026)
              - (…)
              - archive
              - HM1 PU 1.dil vnitrek indd (15-1-2025)

<!-- /dropbox-tree -->

- Maintain separate folders for **print** and **source** data for every publication.

- **Never delete** older data—move it into archive folders.

- The date must always be part of the exported PDF filename.

## Dropbox links in Specifications

1. Hover over the filename and click the `🔗` or `Share` button.
2. In the displayed window, click the `Manage` link.
3. In the `Link for viewing` section, click `Create link`. If the link already exists, proceed directly to the next step.
4. In the `Password protection` section, click `Not applied > Set a password`.
5. Set the password to `printer`. Leave the other settings as follows:
   - Who can view: `Anyone with the link`
   - Link expiry: `Never`
   - Password protection: on (password: `printer`)
   - Downloads allowed: on
6. Confirm the settings with the `Save settings` button.
7. When the `✅ Settings updated` notification appears, click `🔗 Copy link`.
8. Paste the link into the relevant field in the publication Specification and submit it for review.

- In Admin: `Print > Specifications > [green Edit button before the “ID” of the relevant project]`
- Then, in the **Print data** section, select the cover or interior, paste the link into the “URL” field, and click `Submit data for review`.

<!-- image-group -->

![Manual image](images/dropbox-flow-1.png)

> Share > Manage

<!-- /image-group -->

<!-- image-group -->

![Manual image](images/dropbox-flow-2.png)

> Link for viewing > Create Link

![Manual image](images/dropbox-flow-3.png)

> Set a password

<!-- /image-group -->

<!-- image-group -->

![Manual image](images/dropbox-flow-4.png)

> Save settings

![Manual image](images/dropbox-flow-5.png)

> Copy link

<!-- /image-group -->

# Editors

## The roles of the editor and designer

- The designer or typesetter determines the publication layout: colours, fonts, font sizes, etc.

- The editor’s task is to prepare the publication content for typesetting.

- Typesetting is the conversion of a Word manuscript into a professional PDF for printing.

## Subject-expert review

- All materials must be approved by a subject-matter guarantor before they are handed over to the designer.

- Major content changes after typesetting significantly complicate the work.

## Document structure

- The document must have a clear structure: headings, subheadings, texts, exercises, and other elements.

- It is advisable to set up the Word document as close as possible to the final PDF layout.

- Every page must be numbered, and it must be clear where it belongs in the publication.

## Images

- Insert image crops or clearly mark their placement.

- YES: “Insert this image into a star-shaped frame: https://www.shutterstock.com/cs/image-vector/cow-238683511”

- NO: “I would like you to insert a picture of a cow. Could you please place the picture in a star-shaped frame? Thank you.”

- Always include links to images.

- If you are working with an illustrator, links are not necessary; the illustrator will supply the illustrations directly.

## Communication with the designer

- Comments must be concise, clear, and easy to understand.

- It must be clear which part of the page each comment relates to.

- The designer is not responsible for the factual correctness of the text.

## Corrections

- A new PDF is created after every round of corrections.

- Always enter comments in the latest version of the PDF.

- Systematic naming of PDF files is recommended.

## Answer layer

- We recommend keeping answers in InDesign as a separate layer that can be switched on and off.

- Future changes then do not need to be made twice.

- If the answers will be supplied later, the designer must know this in advance.

## Publication approval

- Before printing, the publication must be checked by the editor, the team leader, and, where applicable, the owner.

- Only then does the designer export the print PDF and upload the data to Dropbox.

## Uploading to Dropbox

- After the publication is approved, the designer uploads the data to Dropbox and inserts the links into Admin.

- At this stage, there should no longer be any major content changes.
