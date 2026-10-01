# Typesetter V1 plan

## Purpose

Typesetter converts an inconsistently styled Word manuscript into reviewed, structured JSON and then uses that JSON to populate an existing InDesign template. It does not redesign the publication or rewrite the manuscript.

The designer remains responsible for the template, semantic mapping, uncertain-content review, final image choice, and final layout adjustments.

## V1 workflow

1. **Upload inputs**
   - An unstructured `.docx` manuscript.
   - An InDesign template exported as `.idml`.
2. **Inventory the template locally**
   - Read paragraph, character, and object styles, including style groups.
   - Read labelled frames, page size, and basic document structure.
   - Do not send the IDML package to the model unless a future feature explicitly requires it.
3. **Pre-scan the manuscript with AI**
   - Suggest semantic roles that appear in the manuscript.
   - Show representative excerpts for each suggestion.
   - Flag likely image requests and unusual structures.
   - Suggestions must come from the app's controlled role catalogue; the model cannot invent role IDs.
4. **Map roles to the template**
   - The designer accepts or removes suggested roles.
   - Each accepted semantic role is mapped to an existing InDesign style through an inventory-backed dropdown.
   - Required mappings and template labels must validate before full processing starts.
5. **Run full semantic analysis**
   - Classify every source block while preserving its original text, order, and source ID.
   - Group blocks into supported components where appropriate.
   - Produce confidence values, warnings, and image prompts.
6. **Review uncertain results**
   - Filter and resolve low-confidence, unsupported, or unmapped items.
   - Show source text beside the proposed role and destination style.
7. **Export reviewed JSON**
   - Export a versioned, validated interchange file.
   - Do not produce an AI-edited Word document in V1.
8. **Import into InDesign**
   - An ExtendScript importer validates the open document before changing it.
   - It fills the main threaded story, applies mapped styles, creates image-request frames, and reports unresolved content and overset text.
   - The complete import runs as one undoable operation.

## Template preparation

The app should provide a short setup guide for designers:

- Create and thread the main text frames.
- Label the main story's entry frame `typesetter:story:main`.
- Create all paragraph, character, and object styles that Typesetter may use.
- Add explicitly labelled image slots only where the design requires fixed positions.
- Assign the template a stable ID and version.
- Export the template as IDML for inventory and mapping.

The IDML inventory is the source of truth for selectable styles. Designers should never type raw InDesign style names into the mapping UI.

## Semantic-role manifest

The app owns a small, versioned catalogue of stable semantic role IDs. A project manifest maps those roles to styles found in the uploaded IDML. The designer fills it through the UI rather than editing JSON by hand.

Example:

```json
{
  "format": "indesign-typesetter-manifest-v1",
  "template": {
    "id": "history-textbook-grade-7",
    "version": "2027.1"
  },
  "stories": {
    "main": "typesetter:story:main"
  },
  "roles": {
    "heading.chapter": {
      "paragraphStyle": "Headings/Chapter title",
      "required": true
    },
    "heading.section": {
      "paragraphStyle": "Headings/Section heading"
    },
    "body": {
      "paragraphStyle": "Body/Body text",
      "required": true
    },
    "list.item": {
      "paragraphStyle": "Body/Bullet list"
    },
    "caption": {
      "paragraphStyle": "Images/Caption"
    },
    "image.request": {
      "paragraphStyle": "Production/Image prompt",
      "objectStyle": "Production/Image request frame"
    }
  },
  "imageRequests": {
    "layer": "IMAGE REQUESTS",
    "defaultPlacement": "pasteboard-by-related-spread"
  }
}
```

Consistency comes from:

- stable, controlled role IDs;
- styles selected only from the uploaded IDML inventory;
- manifest and output format versions;
- validation before analysis, export, and import;
- preserved source block IDs and order;
- confidence thresholds and mandatory review of uncertain items;
- a small role set tailored to the publication rather than unlimited AI-generated categories.

## JSON output

The exact schema should be defined during implementation, but each content block should include at least:

- stable source ID and source order;
- original text without rewriting;
- controlled semantic role ID;
- resolved style mapping;
- component or parent relationship when relevant;
- confidence and warnings;
- image-request metadata where relevant.

The exported file should also contain the format version, template ID and version, mapping snapshot, processing metadata, and unresolved-item count. Export must be blocked while required review items remain unresolved.

## Image requests

Images are **not anchored** in V1.

After text composition, the importer creates ordinary frames:

- on an `IMAGE REQUESTS` layer;
- in an explicitly labelled template slot when one exists, otherwise on the pasteboard beside the related spread;
- containing the image ID and prompt;
- using the configured object and paragraph styles;
- labelled `typesetter:image:<id>`.

The designer positions or replaces these frames manually. A later image-generation workflow can find them by label without changing the Typesetter interchange format.

## Interface archetype

Use Solutions Importer as the shared interface archetype, not merely as visual inspiration. Typesetter should use the same library header, upload/processing card, progress console, compact collapsible report, summary statistics, download control, and installation guide with a sticky sidebar. It is not a chat interface.

The additional Typesetter stages live inside the single upload/processing card and reveal progressively:

1. **Template & manuscript** — upload cards and privacy notes.
2. **Template inventory** — styles, labels, structure, and validation results.
3. **AI role suggestions** — suggested roles, excerpts, and detected special content.
4. **Role mapping** — mapping table and validation.
5. **Full analysis** — progress, processing log, and summary counts.
6. **Review** — filterable list of uncertain and unsupported blocks.
7. **Export** — validated JSON and the matching InDesign importer.

The role-mapping table should show:

- semantic role;
- representative manuscript examples;
- InDesign style dropdowns populated from the IDML;
- required/optional state;
- validation status.

Do not add a separate persistent stepper above the header or a parallel card system around the workflow. A compact row of live progress cards appears immediately below the template setup and import guide roll-down, outside its collapsible contents, so progress remains visible without competing with the Solutions Importer hierarchy. The progressively revealed sections and disabled actions remain the primary workflow state. Follow Robot's existing bilingual English/Czech UI pattern.

## V1 scope

Include:

- headings and body text;
- simple lists;
- a limited set of publication-specific semantic roles;
- captions and image requests;
- one main threaded story;
- unanchored image-prompt frames;
- review of uncertain items;
- strict preflight validation and an import report.

Do not include:

- automatic page design or master-page selection;
- complex tables or arbitrary components;
- image generation or final image positioning;
- automatic repair of reflow or overset text;
- AI rewriting of source text;
- round-tripping an edited Word document.

## Implementation shape

Keep the web app and InDesign responsibilities separate:

- **Browser/local processing:** extract DOCX blocks, inspect IDML, build the inventory, validate mappings, and validate exported JSON.
- **Server model call:** classify manuscript content against the controlled schema and return structured output. Send only manuscript content and the minimum necessary role definitions.
- **ExtendScript importer:** validate the open InDesign document and apply the reviewed JSON using ExtendScript-compatible JavaScript.

Use deterministic local code for format, inventory, mapping, and import validation. AI should propose and classify semantics, not decide whether a template is technically valid.

## Validation and safety

Before importing, verify:

- interchange format version;
- template ID and compatible version;
- required frame labels;
- all referenced styles and layers;
- complete required role mappings;
- no unresolved mandatory review items.

Import into the currently open matching template, report all changes and warnings, and keep the operation undoable. Manual InDesign testing must use copies of fixture documents.

## V1 success criteria

A successful pilot should demonstrate that:

- the same manuscript and approved mapping produce deterministic structural JSON;
- original text and ordering survive unchanged;
- a designer can correct uncertain classifications before export;
- the importer rejects the wrong or incomplete template without partial mutation;
- a supported manuscript populates one threaded story with the intended styles;
- image-request frames are labelled, unanchored, and easy to locate;
- overset and unsupported content are clearly reported.

Start with one real, repeatable publication and a small set of representative manuscripts. Expand roles and components only after the first workflow is reliable.
