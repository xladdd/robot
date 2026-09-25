# Robot interface system

Robot uses one visual language and four main interface archetypes – Text Workbench, Visual Workbench – Single, Visual Workbench – Multiple, and Compact Utility – with four exceptions that do not adhere to the four archetypes. New tools start from the closest archetype rather than introduce a new page structure.

## Core terms

- **Archetype:** A repeatable app structure with fixed proportions, element order, and responsive behaviour. Robot uses Compact Utility, Text Workbench, Visual Workbench – Single, Visual Workbench – Multiple, Adapted and Unique Workspace, and Library and Reference.
- **Title block:** Exactly one AI Indicator and one H1 treated as a vertical heading unit. Actions may share its row but are not part of it; descriptions never appear in a title block.
- **AI Indicator:** The label that classifies the visible workflow as **AI ENABLED** or **PROCESSED LOCALLY**.
- **Crosshair instruction:** A centred orange crosshair and short instruction used in an empty interactive viewport.
- **Loading text:** Centred, animated, rotating copy used for an indeterminate operation inside a result or preview viewport.
- **Nameday footer:** The bottom-right workspace status containing the clock, date, and nameday.
- **Control panel:** The fixed-width group of controls beside a preview or canvas. It may scroll independently and carries the strongest standard shadow.
- **Preview:** The flat, bordered visual output area in a Visual Workbench. A preview displays work; it does not look like a control.
- **Viewport:** Any flat, bordered area that displays source material, results, or previews.
- **Monospace:** IBM Plex Mono with Noto Emoji fallback, exposed only through `var(--font-mono)`.

## Recurring elements and CSS contract

These class names and properties are stable. App-owned modifiers may alter placement or dimensions only where an archetype explicitly permits it.

### Title block

- `.tool-header` is the standard title-block container; Cover-style headers use the same internal `.tool-header-copy` structure.
- The AI Indicator is followed by the H1 using `--title-block-gap: 7px`.
- Every non-compact title-block H1 uses `--title-block-size: 2rem`, line-height `1`, weight `400`, and letter-spacing `-0.055em`.
- `.document-app-head` arranges the Text Workbench title block and its **Another** action; all three Text Workbench apps use identical geometry.
- Title blocks contain no subtitle or description. Put explanatory copy in the information drawer or task controls.
- Compact Utility overrides the H1 size and spacing and centres its AI Indicator above the title as defined in its archetype section.

### AI Indicator

- `.processing-badge` is the implementation class for the AI Indicator.
- Text is `8px`, weight `400`, line-height `1`, with `0.12em` letter-spacing and a `7px` circular dot.
- `.processing-badge-ai` uses an orange dot; `.processing-badge-local` uses a turquoise dot.
- The indicator describes the whole visible workflow. Supporting local steps do not make an AI-backed workflow local.

### Crosshair instruction

- `.crosshair-instruction` centres a `38px` orange crosshair above muted `13px/1.65` instruction text.
- Text has a maximum width of `470px`; the complete instruction is interactive when it represents an upload or selection action.
- The crosshair instruction and its interaction target are borderless. They do not add an outline or border to themselves, their enclosing viewport, or the app workspace on hover or keyboard focus.

### Loading text

- `LoadingText` renders `.loading-copy` with `role="status"`, showing one phrase at a time and rotating it every `3s`.
- The standard treatment is centred, uses `32px` padding and `clamp(12px, 1.6vw, 20px)` type, and applies the shared `4.6s` gradient text wash.
- Inside `.figure-paper`, loading text fills the preview and uses its white surface; this is a placement adjustment, not a second variant.
- Robot has one Loading Text variant. Phrase lists are app-owned, bilingual, and may be task-specific or lightly whimsical, but must not claim measured progress.
- Use Loading Text only when duration and progress are indeterminate. Loading cards, action loading labels, measured progress indicators, and process logs are separate patterns.

### Nameday footer

- `.workspace-status` is fixed to the workspace’s bottom-right edge.
- `.workspace-status .nameday` is `132–240px` wide and truncates overflow.
- Overlaying control panels keep at least `48px` clear above it, measured from the outer edge of the panel shadow. Use `--nameday-clearance: 48px` for that offset.

### Control panel

- `.editor-sidebar` is `330px` wide with `18px` padding, a `1px` ink border, panel background, and `5px 5px 0 var(--ink)` shadow.
- `.control-heading` is the standard section heading: `8px`, weight `400`, uppercase, line-height `1`, and `0.12em` letter-spacing.
- A long panel scrolls internally and moves below its preview at narrow widths.

### Preview

- `.figure-result` is the bordered preview frame; `.figure-paper` is its content surface.
- Previews and other viewports use a `1px` ink border and no shadow. Interactive controls around them may carry shadows.

### Type and shadows

- `var(--font-mono)` is `"IBM Plex Mono", "Noto Emoji", monospace`. Use it for code, paths, console output, dimensions, counters, and technical values—not body copy.
- Control panels use `5px 5px 0 var(--ink)`.
- Standard actions use `4px 4px 0 var(--ink)`.
- Small accent actions use `3px 3px 0` in orange or turquoise.
- Static panels, previews, and viewports remain flat.

### Buttons

Standard buttons have square corners, a `1px` ink border, and visible pressed or hover movement.

- `.action-button` is the neutral base with panel background and a `4px` ink shadow.
- `.action-button-primary` uses orange for the next primary action.
- `.action-button-success` uses turquoise for ready, download, or successful actions.
- `.action-button-compact` uses the `3px` accent shadow.
- Disabled buttons use muted styling, reduced emphasis, and no hover movement.
- Existing `.start-button` and `.download-button` follow these neutral and success semantics respectively.

## Shared shell

The top bar, sidebar, information drawer, background grid, colour theme, and Nameday footer belong to the shared workspace. Tool interfaces keep Robot’s square geometry, thin ink borders, Verdana body typography, orange primary actions, and turquoise confirmation states. Text Workbenches may hide the Nameday footer when it would compete with editing controls.

### Information drawer

- The top-bar `i` control toggles the information drawer: it opens a closed drawer and closes an open drawer. Its pressed state reflects whether the drawer is open; the drawer close button and scrim also close it.
- A drawer presents the current app name only. Do not add a `TAKTIK ROBOT` kicker, subtitle, category code, or other brand line above the name.
- The app name uses `28px`, weight `400`, line-height `1.08`, and `-0.04em` letter-spacing. It is regular, not bold.
- Drawer Markdown uses orange `11px` section headings with a top rule and muted `11px/1.7` body copy. App drawer Markdown contains only **What is this?** and **How does it work?** (localized in Czech).
- Inline code names models, programs, paths, and technical values. It uses `10px/1.5 var(--font-mono)`, ink text, panel background, `1px` line border, and `1px 4px` padding as a compact code snippet. Do not use code styling for ordinary body copy.

Place the AI Indicator directly above the H1 with `var(--title-block-gap)`; do not add category codes or descriptions. Keep explanations in the information drawer or beside the control they clarify.

## Interface archetypes

### Text Workbench

> Text Extractor · Index Creator · Prompt Extractor

Use for text workflows based on source documents, extraction, review, correction, and export. Open directly in the main workspace. The desktop frame has two equal columns separated by a `14px` gap: a full-height source viewport on the left and the app workflow on the right. The app viewport uses `20px` top, `22px` horizontal, and `32px` bottom padding.

When the source viewport is empty, centre the crosshair instruction within it. Its text is **“Drop file here, paste, or click to select”**. The complete instruction accepts clicks and dropped files; pasted source files are accepted while the relevant Text Workbench is active.

The right column begins with the shared title row, inset `7px` from the top. The title block sits on the left and a `165px` **Another** button sits on the right, matching the combined height of the AI Indicator and H1. Title size, spacing, button geometry, and responsive behaviour are identical across all Text Workbench apps; only the app name changes.

Place primary output below the title row and keep app-specific controls in the right column. Text Extractor places extracted text above its correction prompt. Index Creator places term controls above index output and page mapping. Prompt Extractor places extracted prompts below the title and shows no `PDF → TXT` description. Keep copy and download actions with output. At narrow widths, stack the source viewport above the workflow and expand **Another** to the available width.

### Visual Workbench – Single

> Diagram Generator · Graph Generator · Barcode Generator

Use for a single generated or edited visual result. The workbench is centred, `1160px` wide, and keeps a minimum `24px` gutter. It has a two-thirds preview stage on the left and a one-third, `330px` control panel on the right. The title block begins the preview stage with no bottom rule and identical top inset, AI Indicator position, and H1 geometry in every app. The flat bordered preview follows below it with the standard `.pane-label`: a localized **SVG PREVIEW** label and `1000 × 700 / SVG 1.1` technical row. The control panel aligns with the stage, scrolls independently, and puts exports at its bottom.

The panel carries the standard shadow and keeps `48px` clearance from the Nameday footer, measured from the shadow edge. At narrow widths it moves above the stage and becomes full width.

### Visual Workbench – Multiple

> Cover Generator · Cover Splitter · Image Generator

Use for generating, importing, or reviewing multiple related visual results in one gallery. The workbench is centred, `1160px` wide, and keeps a minimum `24px` gutter. It uses a two-thirds gallery stage and a one-third, `330px` control panel aligned to the title row. The panel scrolls independently, carries the standard shadow, and its outer shadow edge keeps `48px` clear above the Nameday footer. At narrow widths the stage and panel stack and become full width.

The stage begins with the shared title block at the same `7px` top inset, left stage edge, and title-rule baseline used by Visual Workbench – Single, so its AI Indicator and H1 remain fixed when switching between workbench types. Its title rule aligns with the top edge of a Single workbench preview. On desktop, every Multiple gallery uses four equal card columns regardless of how many results its workflow can produce; a one- or two-result batch occupies the first card positions rather than expanding to split the stage into one or two oversized panels. Cards use one flat, full-width preview shell: Cover Splitter renders its PDF preview directly in that shell rather than in an inset frame, while completed image previews retain their owning app’s aspect ratio. A loading state is applied to the card itself—not nested inside a second card—so Cover Generator and Image Generator share the same dashed, `230px`-minimum loading surface. Their compact result-action footers are `37px` tall; metadata belongs in the lightbox or downloaded report rather than the card. Below `600px`, galleries may reduce to two columns, then one at the narrowest width. It shows the centred, borderless crosshair instruction while its gallery is empty. Cover Splitter’s instruction is interactive and reads **“Drag PDFs here or click to select files”**; clicking or dropping files there performs the same upload as the panel action. Hovering or focusing it does not add an outline to the instruction, gallery, or app workspace. Cover Generator alone shows the active-sketch counter. Cover Splitter and Image Generator omit it. Keep export or download actions at the bottom of the control panel.

### Compact Utility

> GREP Builder · Layer Splitter

Use for a complete, short task with one small input—not as a launcher for a larger interface. Keep the form and immediate result in one modest-width workspace, with inputs visible for comparison or revision.

Compact utilities use a centred `720px` content width. Their AI Indicator and H1 are horizontally centred above primary controls and the immediate result at that shared width. The H1 uses `clamp(30px, 5vw, 64px)`, a `14px` indicator gap, line-height `1`, weight `400`, and letter-spacing `-0.055em`. Compact Utility has no title description.

GREP Builder uses a persistent input/result pair. Layer Splitter uses one borderless upload area equal to the combined height of GREP’s two `58px` fields, followed by its quality selector and primary action. The empty upload area contains the shared crosshair instruction **“Drop file here, or click to select”**. The crosshair area and app workspace remain borderless and gain no outline on hover or keyboard focus. Once selected, the same area becomes a bordered source confirmation with a thumbnail, filename, and replacement controls. Its process console opens below the primary action only after reconstruction starts and reports request, completion, validation, warning, or failure information without presenting estimated server stages as measured progress. The ready-state PSD download uses the turquoise success treatment.

### Unique Workspaces

> Map Generator · Solutions Importer

Use when a task-specific structure cannot follow a standard archetype without making the workflow harder. Keep the shared title block, AI Indicator, viewport, control-panel, button, and responsive rules wherever those elements occur.

Map Generator adapts the Visual Workbench – Single into a canvas editor. Its `330px` control panel scrolls internally and moves below the canvas on narrow screens. Solutions Importer remains a unique multi-file workflow.

### Reference / Library

> Design Manual · Script Buffet

Use for browsing reusable assets or reading structured documentation. Libraries use the `1160px` widescreen frame. Put navigation or filters before content, keep each download attached to its item, and place installation guidance above the main toolbar. Static guidance remains flat; interactive selectors and actions may carry shadows.

Script Buffet is the current library interface. Design Manual retains its reading layout inside the shared shell.

## Current interface map

| Archetype                    | Apps                                                  |
| ---------------------------- | ----------------------------------------------------- |
| Compact Utility              | GREP Builder, Layer Splitter                          |
| Text Workbench               | Text Extractor, Index Creator, Prompt Extractor       |
| Visual Workbench – Single    | Diagram Generator, Graph Generator, Barcode Generator |
| Visual Workbench – Multiple  | Cover Generator, Cover Splitter, Image Generator      |
| Adapted and Unique Workspace | Map Generator, Solutions Importer                     |
| Library and Reference        | Script Buffet, Design Manual                          |

## Common interaction rules

- Keep the title block and primary actions in predictable locations.
- Orange indicates the next primary action. Turquoise indicates successful, ready, downloadable, or locally processed states.
- Use the crosshair instruction for empty interactive viewports.
- Keep source, preview, and result viewports flat; reserve shadows for controls and actions.
- Use the same empty, processing, ready, and error hierarchy in every tool.
- Use Loading Text for indeterminate work inside a result or preview viewport. When progress is measurable, show the value instead of rotating phrases.
- Show measured progress when available. Keep detailed logs collapsed unless review requires them.
- Do not render a process console during setup. A console appears only after processing starts and may remain visible for the resulting ready or error state.
- Use consistent upload variants for one file, multiple files, and image references.
- At narrow widths, stack Text Workbench columns and move Visual Workbench – Single control panels above their preview stages without clipping actions.
- Put implementation details and long instructions in the information drawer or an expandable guide. Keep essential warnings next to the affected action.

## Current AI Indicator classification

| Tool               | AI Indicator      |
| ------------------ | ----------------- |
| Text Extractor     | AI ENABLED        |
| Index Creator      | AI ENABLED        |
| Diagram Generator  | AI ENABLED        |
| Graph Generator    | AI ENABLED        |
| Cover Generator    | AI ENABLED        |
| Image Generator    | AI ENABLED        |
| Layer Splitter     | AI ENABLED        |
| GREP Builder       | AI ENABLED        |
| Prompt Extractor   | AI ENABLED        |
| Map Generator      | PROCESSED LOCALLY |
| Cover Splitter     | PROCESSED LOCALLY |
| Solutions Importer | PROCESSED LOCALLY |
| Script Buffet      | PROCESSED LOCALLY |
| Barcode Generator  | PROCESSED LOCALLY |
