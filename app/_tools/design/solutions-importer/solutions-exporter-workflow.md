# Solutions Exporter and InDesign Import Workflow

Last updated: 2026-09-03 (Europe/Prague)

This is an operational handoff for an agent that will generate a Solutions Importer manifest, import it into Adobe InDesign, inspect the result visually, and make controlled corrections.

## Objective

Given a clean textbook chapter, a solutions PDF, and matching IDML:

1. Detect text added in the solutions PDF.
2. Convert the additions into a reviewed JSON manifest.
3. Import enabled text operations onto an InDesign layer named `SOLUTIONS`.
4. Reuse native answer boxes and tables where the layout is unambiguous.
5. Visually compare every imported page with the solutions PDF.
6. Correct the remaining layout, table, symbol, and artwork exceptions manually.

The automation is intended to produce a strong first pass. It is not a substitute for the final designer review.

## Current Files

Application repository:

`/Users/vladfrolov/Library/Mobile Documents/com~apple~CloudDocs/Documents/robot`

Web module:

- `app/_tools/design/solutions-importer/MainInterface.tsx`
- `app/_tools/design/solutions-importer/code/pdf.ts`
- `public/solutions/extract_solution_operations.py`
- `public/solutions/pyodide-worker.js`

Canonical InDesign importer distributed by the app:

- `/solutions/import_solutions.jsx`

Deprecated compatibility URLs remain available for existing links and installations, but are not advertised in the UI:

- `/solutions/import_solutions_simple.jsx`
- `/solutions/import_solutions_advanced.jsx`

Recommended InDesign installation path:

`/Users/vladfrolov/Library/Preferences/Adobe InDesign/Version 21.0/en_US/Scripts/Scripts Panel/import_solutions.jsx`

Install the canonical script for new work. The distributed and installed JSX files should remain identical. Compare them before testing after any script change.

## Required Inputs

The three inputs must describe exactly the same chapter pages in the same order:

- Clean PDF exported from the chapter before solutions were added.
- Solutions PDF containing the editor's or designer's answers.
- Clean IDML exported from the same InDesign chapter as the clean PDF.

Before analysis, confirm:

- The two PDFs and IDML have the same page count.
- Page order is identical.
- Page sizes correspond.
- The IDML is clean and does not already contain the new solution objects.
- Linked Illustrator or Photoshop artwork is available if manual artwork edits will be needed.

Always work on a duplicate of the chapter. Never use the production master as the first import target.

## Start the Local App

From the Robot repository:

```sh
npm run dev
```

Open `http://localhost:3000`, sign in, and select **Solutions Importer** in the sidebar.

If port 3000 is occupied, use the URL printed by the development server. If a recently fixed browser error persists, hard-reload the page so the current JavaScript bundle and worker are used.

## Generate the Solutions JSON

1. Select the clean PDF.
2. Select the solutions manuscript PDF.
3. Select the matching clean IDML.
4. Choose the intended solution typography:
   - Arial, Noto Sans, or Times New Roman.
   - 12 pt or 14 pt.
5. Enable **One or both PDFs include printer's marks** when either PDF contains bleed, crop marks, registration marks, or a page area larger than the InDesign page.
6. Select **Analyse chapter**.

Printer-mark normalization uses each PDF's embedded TrimBox as the InDesign page. It prevents bleed and marks from shifting answer coordinates.

The current extraction path uses PDF.js to extract positioned text without expanding dense vector artwork. Python then compares the positioned text, reads PDF boxes and annotations, and parses IDML metadata. Large PDFs remain local and are not uploaded.

## Review the Manifest in Robot

After analysis:

1. Check the page count and table count.
2. Open the **Needs review** filter first.
3. Inspect source-text edits, notes, and low-confidence operations.
4. Leave false detections unticked.
5. Re-enable an initially unticked operation only when it is a genuine solution.
6. Review every page summary, not only the pages flagged as uncertain.
7. Download the reviewed JSON.

The filename ends in `_Solutions.json`.

The JSON is an operation manifest, not a finished layout. It records page-relative bounds, detected text, review status, PDF/IDML metadata, and the chosen typography.

## Install or Verify the InDesign Importer

In InDesign, open **Window > Utilities > Scripts**. Reveal the User scripts folder and confirm that `import_solutions.jsx` is present.

The authoritative installed path is listed in **Current Files** above. The Solutions page offers this canonical JSX as its only importer download. The old mode-specific files remain reachable only through their deprecated compatibility URLs.

Before a production test, compare the installed file with the repository copy:

```sh
cmp public/solutions/import_solutions.jsx \
  "/Users/vladfrolov/Library/Preferences/Adobe InDesign/Version 21.0/en_US/Scripts/Scripts Panel/import_solutions.jsx"
```

No output and exit status 0 means the files match.

## Import into InDesign

1. Duplicate the clean chapter file and give the working copy a versioned name.
2. Open only the working copy in InDesign.
3. Confirm the document page count matches the JSON.
4. Run `import_solutions.jsx`.
5. Choose the reviewed `_Solutions.json` file. The script validates that it uses the shared `indesign-solutions-v2` format.
6. In the ScriptUI choice, select **Advanced** for layout-aware placement or **Simple** for direct PDF-coordinate placement. Advanced is recommended when the chapter contains answer boxes or tables. If Advanced has failed, undo it and rerun the canonical script in Simple mode.
7. When using Advanced, read the completion alert and record:
   - Characters placed in cells.
   - Word continuations.
   - Ordinary text frames.
   - Grid-like operations left loose.
   - Non-text annotations needing review.
8. Save a new version immediately after a successful import.

The importer creates or updates:

- Layer: `SOLUTIONS`.
- Paragraph style: `Solutions`.
- Paragraph style: `Cell Solutions`.
- Process swatch: `SOLUTIONS`, currently C100 M73 Y0 K0.
- In Advanced mode, generated item labels beginning with `Solutions Advanced:`.

Advanced mode explicitly applies character style `[None]` to imported solution text.

Advanced mode temporarily unlocks document layers and restores their prior lock states. Both modes leave the `SOLUTIONS` layer visible and unlocked.

## What the Two Modes Do

The canonical `import_solutions.jsx` script offers both modes after it selects and validates the reviewed JSON.

Simple:

- Reads the same reviewed `indesign-solutions-v2` JSON.
- Creates one transparent text frame for each enabled text operation.
- Scales the PDF bounds to the matching InDesign page and places the frame there.
- Does not inspect answer boxes, copy tables, fill table cells, or align continuation text.
- Is the more failsafe fallback because it makes fewer assumptions about document structure.

Advanced:

For ordinary answer text:

- Creates a transparent text frame on `SOLUTIONS`.
- Applies the selected font, size, and `Solutions` paragraph style.
- Fits the frame to its content when no answer container is detected.
- Snaps the frame to a nearby empty answer box when the detected answer centre falls inside it.
- Centres text vertically inside a detected answer box.

For compact tables and mathematical grids:

- Reads native InDesign tables on the source page.
- Duplicates the matching table frame onto `SOLUTIONS`.
- Removes text outside the requested table from the duplicate.
- Clears the duplicated cells.
- Places detected digits or supported symbols into corresponding cells.
- Applies `Cell Solutions`, `[None]`, zero cell insets, and vertical centring.
- Keeps one imported character per destination cell when the operation is parsed as a grid sequence.

Supported grid characters currently include digits and common arithmetic, comparison, punctuation, percentage, multiplication, and division symbols, including:

`0-9 , . ; : % + - – − < > = / ± · × ÷ ≠ ≤ ≥`

A single Latin letter can also be treated as a grid token. Touching letters are treated as prose, while spatially separated letters can remain individual grid tokens.

For mixed grid and prose answers:

- Places the initial grid sequence into table cells when a confident table match exists.
- Creates a separate left-aligned continuation frame after the final used cell.
- Aligns the continuation to the copied table row.

If a grid-looking operation cannot be matched confidently, it remains an ordinary loose text frame and is counted in the completion alert.

## Destructive Rerun Behavior

After a successful import in Advanced mode, the script removes **every pre-existing page item on the `SOLUTIONS` layer** and replaces it with the newly generated result. In Simple mode, it removes only frames created by an earlier Simple run. If Advanced produced a bad partial result, use Undo before rerunning the canonical script in Simple mode so the two results do not overlap.

This means:

- Do not make valuable manual corrections on `SOLUTIONS` and then casually rerun the importer.
- When the importer code or JSON changes, rerun from a clean/versioned working copy.
- Apply final manual exceptions only after the last automated rerun.
- Keep a saved version before every rerun.

If an import fails, newly created objects are removed and the previous `SOLUTIONS` objects are retained. One Undo removes a completed import.

## Current Limitations

The canonical importer automatically executes text operations in either mode. It does not create the non-text operations emitted by the manifest.

Manually review and reproduce when necessary:

- Crosses and ticks.
- Circles and ellipses.
- Colour marks and coloured fills.
- PDF notes.
- Linked Illustrator, Photoshop, and raster artwork changes.
- Complex writing grids that are not matched confidently.

The current JSX does not add a magenta review rectangle around every unresolved complex grid. Use the completion alert, the JSON review list, and visual comparison to find these cases.

## Visual QA Procedure

Export or inspect the imported InDesign chapter one page at a time beside the solutions PDF. Do not approve a chapter from the completion alert alone.

For every page, verify:

- Every answer visible in the solutions PDF exists in InDesign.
- No clean source text has been mistaken for a solution.
- No answer has crossed to the other page of a spread.
- Text frames are inside the correct answer boxes.
- Ordinary answers are centred horizontally and vertically where the task expects centring.
- Prose continuations are left-aligned and begin after the final grid cell.
- No frame is overset.
- No two solution frames overlap unintentionally.
- No answer is duplicated.
- The `SOLUTIONS` layer can be hidden to recover the clean page.

For every table or small-cell grid, verify:

- The copied table is in the identical location as the source table.
- Table dimensions, row heights, column widths, strokes, and cell geometry match the source.
- Exactly one intended character occupies each small cell.
- Decimal commas, decimal points, `=`, `<`, and `>` occupy their own intended cells when the exercise is character-by-character.
- Digits have not been joined with operators such as `+`, `=`, or `–` in one cell.
- Empty cells that should remain empty are empty.
- Words have not been forced into a numeric grid.
- Inline tables originally embedded in text frames were isolated correctly in the duplicated solution frame.

For shapes and marks, verify manually:

- Circles intended to match are truly circular, equal in diameter, and aligned.
- Annotation colour indicates the colour family; the final shade must match the swatches already used in that task.
- Silhouettes and artwork fills use the correct native swatch and stacking order.
- Illustrator `_SOL.ai` artwork, when required, is created and relinked manually.

## Correction Strategy

Classify each problem before editing:

1. **Bad source detection**: the JSON contains missing, extra, or wrongly grouped text. Fix the extractor or adjust the Robot review selection, regenerate JSON, and rerun from a clean working copy.
2. **Bad table matching**: the JSON is correct but the importer chose the wrong table, row, or starting cell. Fix the JSX table-placement logic, regenerate the import from a clean working copy, and retest the representative case plus earlier passing cases.
3. **Local layout exception**: the automation is broadly correct but one unusual exercise needs manual adjustment. Correct only that page in the final working file and record the exception.
4. **Unsupported non-text solution**: reproduce it manually on `SOLUTIONS`; do not force it through the text importer.

Preserve earlier passing behavior. When changing shared table or positioning logic, retest at least:

- A plain centred answer box.
- A compact numeric grid.
- A decimal sequence with commas or periods in separate cells.
- A grid using `=`, `<`, or `>`.
- A mixed grid-plus-word continuation.
- A table embedded inside a larger text frame.
- A page with printer marks enabled.
- A facing-page spread where previous imports could cross the spine.

## Recommended Agent Iteration Loop

1. Confirm the user is not actively editing the InDesign document the agent will control.
2. Duplicate the clean IDML/INDD into a dedicated test folder.
3. Generate or obtain the reviewed `_Solutions.json`.
4. Import into the working copy.
5. Save a versioned IDML and INDD.
6. Export a proof PDF or page JPEGs with `SOLUTIONS` visible.
7. Compare proof pages against the solutions PDF at useful zoom.
8. Record findings with page, question, expected result, actual result, and likely subsystem.
9. Fix the smallest relevant code path or make a documented local correction.
10. Repeat from a clean/versioned working copy when importer logic changes.
11. Keep the last successful proof and document version.
12. Report remaining manual exceptions explicitly.

Do not delete or overwrite the user's source chapter, source PDFs, manuscript, JSON, or completed reference files.

## Finding Report Template

Use this format while visually checking:

```text
Page / question:
Expected from solutions PDF:
Actual InDesign result:
Category: detection | table matching | positioning | typography | non-text | artwork
Severity: blocks page | manual correction | cosmetic
Likely cause:
Action taken:
Retest result:
```

## Deliverables for Each Chapter

Return:

- Reviewed `_Solutions.json`.
- Versioned InDesign working file.
- Versioned IDML export.
- Proof PDF with `SOLUTIONS` visible.
- Short findings report listing corrected and unresolved exceptions.
- Any manually created `_SOL.ai` files, when applicable.

## Prompt for Another Agent

The following can be adapted for a new chapter:

```text
Use the Solutions Importer workflow documented in:
/Users/vladfrolov/Library/Mobile Documents/com~apple~CloudDocs/Documents/robot/app/_tools/design/solutions-importer/solutions-exporter-workflow.md

Inputs:
- Clean PDF: <path>
- Solutions PDF: <path>
- Clean IDML: <path>
- Reviewed JSON, if already generated: <path>

Work only on a versioned copy. Run import_solutions.jsx, select and validate the reviewed indesign-solutions-v2 JSON, and choose Advanced for suitable structured documents. If Advanced fails, undo the import, rerun import_solutions.jsx, and choose Simple as the more failsafe fallback. Save versioned INDD and IDML outputs, export a proof PDF, compare every page visually against the solutions PDF, and report any remaining manual artwork or non-text exceptions. Do not overwrite the source files.
```

## Validation After Code Changes

From the Robot repository:

```sh
npm run build
npm test
```

Also verify that the repository and installed canonical importer copies are identical, then perform at least one real InDesign import in each mode and visually compare the proof. Automated application tests do not validate final InDesign layout.
