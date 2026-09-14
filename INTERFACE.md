# Robot interface system

Robot uses one visual language and four interface families. New tools should start from the closest family rather than introduce a new page structure.

## Shared shell

The top bar, sidebar, information drawer, background grid, colour theme, and footer status belong to the shared workspace. Tool interfaces keep Robot's square geometry, thin black borders, restrained shadows, Verdana typography, orange primary actions, and turquoise confirmation states. Document workspaces may hide the footer status when it would compete with editing controls.

Every available tool shows one processing badge:

- **AI ENABLED** with an orange dot when the workflow sends content to an AI model.
- **PROCESSED LOCALLY** with a turquoise dot when the visible workflow runs in the browser or deterministic application code without an AI request.

The badge describes the whole visible workflow. Supporting local steps do not make an AI-backed tool local. Map Generator is local while its visible timeline editor remains deterministic.

Place the tool type at the left edge of the metadata row and the processing badge at its right edge. The row follows the width of the primary panel directly below it. Badge labels use regular weight.

## Interface families

### Compact utility

Use for short tasks with one small input and an immediate result. Keep the form and result in one modest-width workspace. Inputs remain visible after generation so the user can compare or revise them.

Current tools: GREP Builder and Barcode Generator.

Text Extractor, Index Creator, GREP Builder, Cover Splitter, and Prompt Extractor share a 720 px centred entry state. Their metadata, centred title, and upload or prompt controls follow the same content width even though their active workspaces belong to different families. This archetype does not place a description between the title and primary input; longer explanations belong in the information drawer.

### Document workspace

Use for workflows based on source documents, extraction, comparison, review, and export. Start with the shared upload state. After files are selected, place the app title and replacement-file action across the full width, then show source and output as two separate bordered panes with a consistent gap. Source begins below the title rather than occupying the title row. Keep app controls with the output pane and place export actions with the result. Hide the workspace clock, date, and name-day footer in these active editing views.

Text Extractor, Index Creator, and Prompt Extractor use the same active split-view frame. Cover Splitter and Solutions Importer use the same entry-state dimensions but retain task-specific multi-file workspaces.

### Visual workbench

Use for generated or edited visual material. The standard workbench is centred in the available workspace and is 1160 px wide, with a minimum 24 px gutter at narrower sizes. A full-width title header sits above a two-column body: the preview takes two thirds and the control panel takes one third. Both columns align at the top. The preview has a plain one-pixel border and no shadow; the control panel carries the shadow. Organize controls in workflow order.

Barcode Generator, Graph Generator, and Diagram Generator use this standard workbench. The reserved Image Generator should use it as well.

Cover Generator uses the same width and two-to-one body ratio. Its longer inspector begins at the top of the title row, while the preview column keeps a borderless title with a single rule below it. Cover export actions sit at the bottom of the inspector.

Map Generator is a canvas editor rather than a titled workbench. The map fills the workspace without a title module. Its 330 px inspector uses the same top and right alignment as the Cover Generator inspector, scrolls internally, and moves to the bottom on narrow screens.

### Library and reference

Use for browsing reusable assets or reading structured documentation. Libraries use the same 1160 px widescreen frame as visual workbenches. Provide navigation or filters before the content and keep each download attached to its item. Place installation guidance above the main toolbar. Static guidance panels stay flat; interactive selectors and their action buttons may carry shadows.

Script Buffet and Solutions Importer share the library width and guide placement. Design Manual retains its own reading layout.

## Interface vocabulary

- **Archetype:** A repeatable page structure chosen from compact entry, document workspace, visual workbench, canvas editor, or library and reference. Apps in one archetype share dimensions and element order.
- **Entry state:** The centred first screen shown before a file or request is supplied. The compact entry state is 720 px wide, has split metadata, a centred title, no description, and one primary input.
- **Title box:** The full-width heading region above a workbench. It contains metadata, the app name, and optional concise status. A title box uses a rule below it rather than an enclosing background or shadow.
- **Viewport:** A flat bordered area that displays source material, generated graphics, previews, or results. Viewports never use drop shadows.
- **Toolbar:** A grouped set of editable controls and actions beside or above a viewport. Toolbars may use a background, border, and drop shadow because they invite interaction.
- **Inspector:** A vertical toolbar beside a canvas or gallery. It is one third of the standard visual workbench, scrolls internally when long, and moves below the viewport at narrow widths.
- **Split view:** A document workspace with a full-width title row followed by separate source and result viewports with a consistent gap.
- **Empty viewport state:** The shared 38 px orange crosshair plus 13 px explanatory text, centred inside an unused viewport.
- **Counter chip:** A transparent, black-outlined status value placed on the title line. Supporting explanation appears as a tooltip on hover or keyboard focus.
- **Action shadow:** A shadow reserved for buttons, toolbars, inspectors, or editable input groups. Static cards, guidance blocks, and viewports remain flat.
- **Processing badge:** The right-aligned metadata label that classifies the workflow as AI enabled or processed locally.

## Common interaction rules

- Keep the app title, short description, processing badge, and main actions in predictable locations.
- Orange indicates the next primary action. Turquoise indicates successful, ready, or locally processed states.
- Keep source, preview, and result viewports flat. Reserve drop shadows for controls that invite interaction, such as buttons, toolbars, inspectors, and editable input groups.
- Use the same empty, processing, ready, and error hierarchy in every tool.
- Show measured progress when it exists. Keep detailed logs collapsed unless they are required for review.
- Use consistent upload variants for one file, multiple files, and image references.
- On narrow screens, stack document panes, allow inspectors to scroll without hiding the canvas, and prevent header actions from clipping.
- Put implementation details and long instructions in the information drawer or an expandable guide. Keep essential warnings next to the action they affect.

## Current processing classification

| Tool | Badge |
| --- | --- |
| Text Extractor | AI ENABLED |
| Index Creator | AI ENABLED |
| Diagram Generator | AI ENABLED |
| Graph Generator | AI ENABLED |
| Cover Generator | AI ENABLED |
| GREP Builder | AI ENABLED |
| Prompt Extractor | AI ENABLED |
| Map Generator | PROCESSED LOCALLY |
| Cover Splitter | PROCESSED LOCALLY |
| Solutions Importer | PROCESSED LOCALLY |
| Script Buffet | PROCESSED LOCALLY |
| Barcode Generator | PROCESSED LOCALLY |

Design Manual retains its own reading layout inside the shared shell.
