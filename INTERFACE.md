# Robot interface system

Robot uses one visual language and four interface families. New tools should start from the closest family rather than introduce a new page structure.

## Shared shell

The top bar, sidebar, information drawer, background grid, colour theme, and footer status belong to the shared workspace. Tool interfaces keep Robot's square geometry, thin black borders, restrained shadows, Verdana typography, orange primary actions, and turquoise confirmation states.

Every available tool shows one processing badge:

- **AI ENABLED** with an orange dot when the workflow sends content to an AI model.
- **PROCESSED LOCALLY** with a turquoise dot when the visible workflow runs in the browser or deterministic application code without an AI request.

The badge describes the whole visible workflow. Supporting local steps do not make an AI-backed tool local. Map Generator is local while its visible timeline editor remains deterministic.

Place the tool type at the left edge of the metadata row and the processing badge at its right edge. The row follows the width of the primary panel directly below it. Badge labels use regular weight.

## Interface families

### Compact utility

Use for short tasks with one small input and an immediate result. Keep the form and result in one modest-width workspace. Inputs remain visible after generation so the user can compare or revise them.

Current tools: GREP Builder and Barcode Generator.

### Document workspace

Use for workflows based on source documents, extraction, comparison, review, and export. Start with the shared upload state. After files are selected, show source material and output together when comparison is useful. Group file-level settings with the files they affect and place export actions with the result.

Current tools: Text Extractor, Index Creator, Prompt Extractor, Cover Splitter, and Solutions Importer.

### Visual workbench

Use for generated or edited visual material. Give the preview or gallery most of the width and keep controls in a consistent inspector. Organize controls in workflow order and keep export actions adjacent to the visual result.

Current tools: Graph Generator, Diagram Generator, Map Generator, and Cover Generator. The reserved Image Generator should use this family.

### Library and reference

Use for browsing reusable assets or reading structured documentation. Provide navigation or filters before the content and keep each download attached to its item.

Current tools: Script Buffet and Design Manual.

## Common interaction rules

- Keep the app title, short description, processing badge, and main actions in predictable locations.
- Orange indicates the next primary action. Turquoise indicates successful, ready, or locally processed states.
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
