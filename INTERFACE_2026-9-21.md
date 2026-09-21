# Robot interface system

Robot uses one visual language and five interface archetypes. New tools should start from the closest archetype rather than introduce a new page structure.

## Shared shell

The top bar, sidebar, information drawer, background grid, colour theme, and footer status belong to the shared workspace. Tool interfaces keep Robot's square geometry, thin black borders, restrained shadows, Verdana typography, orange primary actions, and turquoise confirmation states. Text Workbenches may hide the footer status when it would compete with editing controls.

Every available tool shows one **AI Indicator**:

- **AI ENABLED** with an orange dot when the workflow sends content to an AI model.
- **PROCESSED LOCALLY** with a turquoise dot when the visible workflow runs in the browser or deterministic application code without an AI request.

The AI Indicator describes the whole visible workflow. Supporting local steps do not make an AI-backed tool local. Map Generator is local while its visible timeline editor remains deterministic.

Place the AI Indicator at the left edge of the metadata row; do not show a category or module code there. The row follows the width of the primary panel directly below it. AI Indicator labels use regular weight.

## Interface archetypes

### Text Workbench

> - Text Extractor
> - Index Creator
> - Prompt extractor

Use for text workflows based on source documents, extraction, review, correction, and export. Open directly in the main workspace without a separate entry screen. The desktop frame has two equal columns separated by a consistent 14 px gap: a full-height bordered source viewport on the left and the app workflow on the right. The app viewport uses 20 px top, 22 px horizontal, and 32 px bottom padding.

When the left source viewport is empty, centre the shared **crosshair instruction** within it. For Text Workbench apps, its text is **“Drop file here, paste, or click to select”**. The complete instruction is clickable and accepts dropped files; pasted source files are accepted while the relevant Text Workbench is active.

The right column begins with one shared title row, inset 7 px from the top of the columns. It contains the AI Indicator showing **AI ENABLED**, with the app name below it and a 165 px **Another +** button on the right. The button stretches to the combined height of the AI Indicator and title. AI Indicator position, title size, spacing, button geometry, and responsive behavior must be identical across all Text Workbench apps; only the app name changes.

Place the primary output directly below the title row and keep app-specific controls in the right column. Text Extractor places the extracted-text field above its correction prompt. Index Creator places its term controls above the index output and page mapping. Prompt Extractor places the extracted-prompts field below the title and does not show a `PDF → TXT` description. Keep copy and download actions with the output. At narrow widths, stack the source viewport above the right-column workflow and expand the **Another +** button to the available width.

**Text Extractor**, **Index Creator**, and **Prompt Extractor** use the Text Workbench. Solutions Importer remains a unique multi-file workflow.

### Visual workbench

Use for generated or edited visual material. The standard workbench is centred in the available workspace and is 1160 px wide, with a minimum 24 px gutter at narrower sizes. A full-width **title header** sits above a two-column body: the **preview** takes two thirds and the **control panel** takes one third. Both columns align at the top. The preview has a plain one-pixel border and no shadow; the control panel carries the shadow. Organize controls in workflow order.

**Barcode Generator**, **Graph Generator**, and **Diagram Generator** use this standard workbench. The reserved **Image Generator** should use it as well.

**Cover Generator** uses the same width and two-to-one body ratio. Its longer inspector begins at the top of the title row, while the preview column keeps a borderless title with a single rule below it. Cover export actions sit at the bottom of the inspector.

**Map Generator** is a canvas editor rather than a titled workbench. The map fills the workspace without a title module. Its 330 px inspector uses the same top and right alignment as the Cover Generator inspector, scrolls internally, and moves to the bottom on narrow screens.

### Compact utility

> - GREP Builder

Use for short tasks with one small input. Keep the form and immediate result in one modest-width workspace. Inputs remain visible after generation when the user needs to compare or revise them.

**GREP Builder** uses an adapted compact frame for its persistent input/result pair. Its metadata, centred title, and primary controls follow the same content width. Do not place a description between the title and primary input; longer explanations belong in the information drawer.

### Adapted and unique workspace

Use when an app has a strong task-specific structure that cannot follow a standard archetype without making the workflow harder to understand. Keep shared vocabulary, widths, title treatment, AI Indicators, viewport rules, toolbar behavior, and responsive gutters even when the page composition differs.

Cover Generator and Cover Splitter share the same cover-workbench variant: a two-thirds preview stage and one-third inspector, with the inspector aligned to the title bar. Cover Splitter omits the active-sketch counter. Map Generator is another adapted visual workbench, and Solutions Importer is a unique multi-file workflow. These classifications describe the overall structure; their parts should still reuse the standard title box, viewport, toolbar, inspector, and action styles wherever those elements occur.

### Library and reference

Use for browsing reusable assets or reading structured documentation. Libraries use the same 1160 px widescreen frame as visual workbenches. Provide navigation or filters before the content and keep each download attached to its item. Place installation guidance above the main toolbar. Static guidance panels stay flat; interactive selectors and their action buttons may carry shadows.

Script Buffet is the current library interface. It shares the 1160 px widescreen frame with the workbenches and shares guide placement with Solutions Importer, but the two apps remain different archetypes. Design Manual retains its own reading layout.

## Current interface map

| Archetype                    | Entry state             | Main state                                                         |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------ |
| Compact utility              | No separate entry state | GREP Builder uses an adapted compact main state                    |
| Text Workbench               | No separate entry state | Text Extractor, Index Creator, Prompt Extractor                    |
| Visual workbench             | No separate entry state | Diagram Generator, Graph Generator, Barcode Generator              |
| Adapted and unique workspace | No separate entry state | Cover Generator, Cover Splitter, Map Generator, Solutions Importer |
| Library and reference        | No separate entry state | Script Buffet; Design Manual keeps its reading layout              |

## Interface vocabulary

- **Archetype:** A repeatable page structure chosen from compact utility, Text Workbench, visual workbench, adapted workspace, or library and reference. Apps in one archetype share dimensions and element order.
- **Entry state:** The centred first screen shown before a file or request is supplied. The compact entry state is 720 px wide, has split metadata, a centred title, no description, and one primary input.
- **Title box:** The heading region paired with a workbench or right-hand workflow column. It contains metadata, the app name, and optional concise status. A title box uses alignment and spacing rather than an enclosing shadow.
- **Viewport:** A flat bordered area that displays source material, generated graphics, previews, or results. Viewports never use drop shadows.
- **Toolbar:** A grouped set of editable controls and actions beside or above a viewport. Toolbars may use a background, border, and drop shadow because they invite interaction.
- **Inspector:** A vertical toolbar beside a canvas or gallery. It is one third of the standard visual workbench, scrolls internally when long, and moves below the viewport at narrow widths.
- **Text Workbench:** A two-column text workflow with a full-height source viewport on the left and a shared title, output, and app-specific controls on the right.
- **Crosshair instruction:** The shared 38 px orange crosshair plus 13 px instruction text, centred inside an unused viewport. Its wording and interaction describe the action available in that viewport.
- **Counter chip:** A transparent, black-outlined status value placed on the title line. Supporting explanation appears as a tooltip on hover or keyboard focus.
- **Action shadow:** A shadow reserved for buttons, toolbars, inspectors, or editable input groups. Static cards, guidance blocks, and viewports remain flat.
- **AI Indicator:** The metadata label that classifies the visible workflow as **AI ENABLED** or **PROCESSED LOCALLY**.

## Common interaction rules

- Keep the app title, short description, AI Indicator, and main actions in predictable locations.
- Orange indicates the next primary action. Turquoise indicates successful, ready, or locally processed states.
- Keep source, preview, and result viewports flat. Reserve drop shadows for controls that invite interaction, such as buttons, toolbars, inspectors, and editable input groups.
- Use the crosshair instruction for empty interactive viewports, and keep the same processing, ready, and error hierarchy in every tool.
- Show measured progress when it exists. Keep detailed logs collapsed unless they are required for review.
- Use consistent upload variants for one file, multiple files, and image references.
- On narrow screens, stack Text Workbench columns, allow inspectors to scroll without hiding the canvas, and prevent header actions from clipping.
- Put implementation details and long instructions in the information drawer or an expandable guide. Keep essential warnings next to the action they affect.

## Current AI Indicator classification

| Tool               | AI Indicator      |
| ------------------ | ----------------- |
| Text Extractor     | AI ENABLED        |
| Index Creator      | AI ENABLED        |
| Diagram Generator  | AI ENABLED        |
| Graph Generator    | AI ENABLED        |
| Cover Generator    | AI ENABLED        |
| GREP Builder       | AI ENABLED        |
| Prompt Extractor   | AI ENABLED        |
| Map Generator      | PROCESSED LOCALLY |
| Cover Splitter     | PROCESSED LOCALLY |
| Solutions Importer | PROCESSED LOCALLY |
| Script Buffet      | PROCESSED LOCALLY |
| Barcode Generator  | PROCESSED LOCALLY |

Design Manual retains its own reading layout inside the shared shell.
