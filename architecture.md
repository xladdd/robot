# Architecture

This document explains how Taktik Robot is arranged and how work moves through it. It describes the code as it works now. It also records the remaining places where responsibilities are still mixed.

## The short version

Taktik Robot is one Next.js website containing several publishing tools. Next.js gives the project a browser interface and private server endpoints in the same project. That matters because the browser must not receive the OpenRouter key. It also avoids running and deploying a separate server.

The main ownership rule is:

```text
app/_tools/
  text/
    one-folder-per-sidebar-app/
  image/
    one-folder-per-sidebar-app/
  design/
    one-folder-per-sidebar-app/
  design-manual/
    manual.en.md
    manual.cs.md
    images/
```

An app folder may contain:

- `MainInterface.tsx`: the app's browser interface.
- `code/`: browser helpers, server implementation, parsers, and data used only by that app.
- `public/`: files that users or browser workers download.
- `scripts/`: data preparation or evaluation commands.
- `tests/`: tests owned by that app.
- `prompts/`: readable Markdown containing stable instructions sent to OpenRouter.
- `info.en.md` and `info.cs.md`: the live info-drawer copy.
- `copy.ts`: typed English/Czech in-app UI copy, when the tool has a browser interface.

`app/` is the Next.js entry layer. It owns pages and URL endpoints, but app-specific endpoint files only forward to code under `app/_tools/`.

### Why `app/_tools` instead of a root `apps` folder?

The project briefly used both `app/` and `apps/`. They looked too similar and made it unclear where a developer should start. All tool ownership now lives inside `app/_tools/`.

Pros:

- One application tree is easier to find and browse.
- Imports from `Workspace.tsx` are shorter.
- The interface, server implementation, downloads, data, tests, and drawer copy remain grouped by tool.
- The leading underscore tells Next.js that `_tools` is private code and must not become a URL.

Cons:

- A developer must know the Next.js underscore rule.
- Tool code is more tied to Next.js than it would be in a neutral root folder such as `modules/`.
- Existing `/api/...` addresses still need files under `app/api/`. The one-line route files preserve those addresses while the real handlers remain owned by each tool.
- Putting the full handler back into each `route.ts` would remove the adapter, but it would split an app's code between `app/api` and its tool folder. For this codebase, the small adapter is the clearer tradeoff.

## Folder map

### Root

- `README.md`: user-facing description, setup, and links to every English info drawer.
- `architecture.md`: this developer guide.
- `AGENTS.md`: working rules for coding agents. README is written for people; AGENTS contains precise change and verification rules.
- `package.json`: supported Node version, commands, and direct dependencies.
- `package-lock.json`: exact installed dependency versions. Do not edit it by hand.
- `next.config.ts`: Next.js settings. It currently keeps the defaults.
- `scripts/materialize-public-links.mjs`: Vercel-only build preparation. It replaces the tracked `public/` symlinks with disposable copies in Vercel's build workspace, preventing Vercel from attempting to copy an app-owned `public` directory onto itself while retaining app ownership and stable browser URLs in Git.
- `next-env.d.ts`: generated Next.js TypeScript declarations. Do not edit it by hand.
- `tsconfig.json`: TypeScript checks and the `@/` path shortcut.
- `eslint.config.mjs`: lint rules.
- `proxy.ts`: checks the session before a page or API request continues.
- `.env.example`: names and explanations of required private settings.
- `.env.local`: local secrets; it is not committed.
- `.gitignore`: files Git must ignore.
- `.DS_Store`: macOS Finder metadata. It has no application role and should stay out of commits.
- `.git/`: local Git history and repository settings. It is not application code.
- `node_modules/`: installed package code created by `npm install`. Never edit it.
- `.next/`: generated Next.js build and development output. Never edit or commit it.
- `tmp/`: local temporary inspection and render output. It is not application source.

### `app/`: Next.js entry points and shared shell

- `app/page.tsx`: server page. It reads all info Markdown and passes it to the browser workspace.
- `app/Workspace.tsx`: shared browser shell, navigation, long-lived app state, and action functions. It renders each image app through its explicit app-owned interface; moving controllers is the remaining split.
- `app/_components/LoadingText.tsx`: shared rotating progress-text component used by several interfaces.
- `app/layout.tsx`: page metadata, icons, manifest, and global CSS import.
- `app/globals.css`: handwritten CSS, divided by labelled sections. Tailwind is not used.
- `app/login/page.tsx`: login form.
- `app/content/ui.ts`: bilingual shared shell copy: navigation, categories, availability messaging, and status text. It does not contain individual app copy or info-drawer prose.
- `app/content/czechNamedays.ts`: local date-to-name lookup used by the footer clock.
- `app/lib/auth.ts`: session signing, expiry, and credential checks.
- `app/api/**/route.ts`: thin Next.js URL adapters. Authentication routes remain here; app routes re-export handlers from the owning app folder. Next.js route settings remain declared literally in these files because Turbopack cannot read re-exported settings.

The individual route files are deliberately small:

- `app/api/auth/login/route.ts`: checks configured credentials and creates the signed session cookie.
- `app/api/auth/logout/route.ts`: removes that cookie.
- `app/api/ocr/route.ts`, `correct/route.ts`, and `index/forms/route.ts`: Text Extractor and Index Creator endpoint addresses.
- `app/api/figures/route.ts`: compatibility dispatcher for existing graph, diagram, and map generation callers. It selects the owning handler from the request mode.
- `app/api/graphs/route.ts`, `diagrams/route.ts`, and `maps/generate/route.ts`: app-native Graph, Diagram, and model-backed Map generation adapters.
- `app/api/maps/timeline/route.ts`: deterministic Map timeline endpoint. It declares `dynamic = "force-dynamic"` itself because Next.js must see that literal declaration in the route file.
- `app/api/covers/route.ts`, `images/route.ts`, `grep/route.ts`, and `prompts/route.ts`: Cover Generator, Image Generator, GREP Builder, and Prompt Extractor endpoint addresses.

### `app/_tools/`: tool ownership

- `app/_tools/registry.ts`: the one ordered list behind the sidebar. It records each app key, category, folder, and availability.
- `app/_tools/info.ts`: server-side Markdown loader for the info drawer.
- `app/_tools/load-prompt.ts`: reads an app's prompt Markdown and fills named values in prompt templates.
- `app/_tools/openrouter/config.ts`: maps each model-backed app to its dedicated server-only inference-key environment variable.
- `app/_tools/openrouter/server.ts`: selects the app key, derives a pseudonymous end-user identifier from the signed session, adds OpenRouter attribution, and emits structured usage records without logging request or response content. It temporarily accepts the legacy shared key as a migration fallback.
- `app/_tools/openrouter/scripts/provision-keys.mts`: idempotently creates missing app keys through OpenRouter's Management API and saves each plaintext key immediately to the ignored `.env.local` file.
- `app/_tools/info.en.md`, `app/_tools/info.cs.md`: home-screen drawer copy.

Text apps:

- `app/_tools/text/text-extractor/MainInterface.tsx`: Text Extractor upload, preview, result, correction, and download interface.
- `app/_tools/text/text-extractor/copy.ts`: bilingual Text Extractor UI copy.
- `app/_tools/text/text-extractor/code/ocr-server.ts`: sends images or PDFs to the fixed OCR model.
- `app/_tools/text/text-extractor/code/correct-server.ts`: sends extracted text plus a correction instruction to the fixed text model.
- `app/_tools/text/text-extractor/prompts/`: OCR and correction instructions sent to OpenRouter.
- `app/_tools/text/index-creator/MainInterface.tsx`: Index Creator PDF, term, result, and page-mapping interface.
- `app/_tools/text/index-creator/copy.ts`: bilingual Index Creator UI copy.
- `app/_tools/text/index-creator/code/pdf-indexer.ts`: reads PDF text locally, validates phrase-safe forms, ranks candidate pages, and formats match evidence.
- `app/_tools/text/index-creator/code/local-ocr.ts`: renders sparse PDF pages locally and runs the bundled Czech Tesseract OCR worker without uploading page data.
- `app/_tools/text/index-creator/code/forms-server.ts`: asks the language model for grammatical forms and rejects unsafe reductions.
- `app/_tools/text/index-creator/tests/`: deterministic matching, ranking, normalization, and form-safety regressions.
- `app/_tools/text/index-creator/scripts/evaluate-index.mts`: reusable local evaluator for a supplied benchmark and the normal forms endpoint.
- `app/_tools/text/index-creator/prompts/forms.md`: stable grammatical-form instructions.
- `public/index-creator-ocr/`: browser-local Tesseract worker, Czech language data, and core assets used by the OCR fallback.

Image apps:

- `app/_tools/image/graph-generator/MainInterface.tsx`, `copy.ts`, and `code/`: Graph UI, copy, local CSV/XLSX-to-Markdown import, ASE parser, chart validator/renderer, and model-backed generation handler.
- `app/_tools/image/diagram-generator/MainInterface.tsx`, `copy.ts`, and `code/`: Diagram UI, copy, ASE parser, biological-diagram validator/renderer, and model-backed generation handler.
- `app/_tools/image/map-generator/MainInterface.tsx`, `copy.ts`, and `code/`: Map UI, copy, ASE parser, deterministic map renderer, model-backed generation handler, timeline handler, and local map data.
- Each image app has its own `tests/` folder; graph, diagram, and map renderer regressions run independently.
- `app/_tools/image/map-generator/code/map-catalog.ts`: adds physical and historical map data to a map description.
- `app/_tools/image/map-generator/code/historical-boundaries.ts`: chooses boundary records by date.
- `app/_tools/image/map-generator/code/cliopatria.ts`: reads the large Cliopatria timeline once and caches it.
- `app/_tools/image/map-generator/code/timeline-server.ts`: returns the deterministic map for a selected year.
- `app/_tools/image/map-generator/code/data/`: the only repository copies of processed map datasets and their licence note.
- `app/_tools/image/map-generator/scripts/`: repeatable dataset import and map evaluation commands.
- `app/_tools/image/cover-generator/code/server.ts`: OpenRouter image generation, Shutterstock research, object analysis, master generation, and separate asset generation.
- `app/_tools/image/cover-generator/prompts/`: editable prompt templates and reusable medium/subject instructions for each cover workflow.
- `app/_tools/image/cover-generator/MainInterface.tsx`: cover references, concepts, production controls, results, and lightbox.
- `app/_tools/image/cover-generator/copy.ts`: bilingual Cover Generator UI copy.
- `app/_tools/image/cover-generator/code/cover-artboard.ts`: creates a PDF contact sheet from generated covers in the browser.
- `app/_tools/image/cover-generator/scripts/`: cover workflow checks and evaluation helpers.
- `app/_tools/image/image-generator/MainInterface.tsx`: square image queue, local prompt-document import, optional references, results, downloads, cancellation, and lightbox.
- `app/_tools/image/image-generator/code/prompts.ts`: blank-line queue parsing, the 15-image cap, and browser-local DOCX/Markdown/text reading.
- `app/_tools/image/image-generator/code/server.ts`: private square-image generation through the app-specific OpenRouter key and the same fast/fidelity FLUX models as Cover Generator.
- `app/_tools/image/image-generator/prompts/generate.md`: stable image-generation instruction.
- `app/_tools/image/image-generator/tests/prompts.test.mts`: queue splitting and limit regressions.

Design apps:

- `app/_tools/design/grep-builder/server.ts`: validates requests, applies high-confidence deterministic intents, and otherwise converts plain instructions through the GREP model while preserving valid empty replacements and safe limitation warnings.
- `app/_tools/design/grep-builder/intent.ts`: bounded bilingual resolver for recurring unambiguous text operations and formatting-only limitations; unmatched requests fall through to the model.
- `app/_tools/design/grep-builder/validation.ts`: narrowly corrects two recognized unsafe model outputs without altering ordinary GREP candidates.
- `app/_tools/design/grep-builder/copy.ts`: bilingual GREP Builder UI copy.
- `app/_tools/design/grep-builder/MainInterface.tsx: GREP fields, result controls, and copy buttons.
- `app/_tools/design/grep-builder/prompts/system.md`: the GREP conversion rules sent to OpenRouter.
- `app/_tools/design/grep-builder/tests/validation.test.mts`: deterministic validator regressions.
- `app/_tools/design/grep-builder/tests/intent.test.mts`: bilingual deterministic-intent and fail-closed regressions.
- `app/_tools/design/grep-builder/tests/prompt.test.mts`: regression coverage for the exact four-pass conditional date-padding guidance.
- `app/_tools/design/cover-splitter/MainInterface.tsx`: local multi-PDF upload, first-page preview grid, per-file trim-size controls, and a Graph-style sidebar containing file actions, optional inside-cover splitting, the local console, progress, and ZIP download.
- `app/_tools/design/cover-splitter/code/pdf-preview.ts`: renders only the outside-cover page locally with PDF.js.
- `app/_tools/design/cover-splitter/public/pyodide-worker.js` and `split_cover.py`: run vector-preserving first-page PDF splitting in browser Python and package separate back/front PDFs into a ZIP.
- `app/_tools/design/cover-splitter/tests/`: protects panel dimensions, per-file presets, first-page-only processing, output names, and vector output.
- `app/_tools/design/prompt-extractor/copy.ts`: bilingual Prompt Extractor UI copy.
- `app/_tools/design/prompt-extractor/code/pdf-images.ts`: renders PDF pages to browser images with PDF.js.
- `app/_tools/design/prompt-extractor/code/server.ts`: asks the vision model to describe illustration needs on those page images.
- `app/_tools/design/prompt-extractor/MainInterface.tsx`: manuscript preview, progress, and prompt-result interface.
- `app/_tools/design/prompt-extractor/prompts/system.md`: the page-image inspection rules sent to OpenRouter.
- `app/_tools/design/barcode-generator/code/ean13.ts`: validates ISBN, builds EAN-13 bars, outlines the digits, and writes a vector PDF.
- `app/_tools/design/barcode-generator/copy.ts`: bilingual Barcode Generator UI copy.
- `app/_tools/design/barcode-generator/MainInterface.tsx: barcode input, preview, specifications, and download control.
- `app/_tools/design/solutions-importer/MainInterface.tsx`: the complete three-file analysis and review interface.
- `app/_tools/design/solutions-importer/copy.ts`: bilingual Solutions Importer UI copy.
- `app/_tools/design/solutions-importer/code/pdf.ts`: extracts positioned PDF text before local Python comparison.
- `app/_tools/design/solutions-importer/public/extract_solution_operations.py`: creates the shared `indesign-solutions-v2` operation manifest.
- `app/_tools/design/solutions-importer/public/import_solutions.jsx`: canonical InDesign importer. After validating an `indesign-solutions-v2` JSON file, its ScriptUI choice runs either Advanced layout-aware placement or Simple direct PDF-coordinate placement.
- `app/_tools/design/solutions-importer/tests/`: protects the one-format, three-runtime-file, and single-importer contract.
- `app/_tools/design/script-buffet/MainInterface.tsx`: filterable Adobe script catalog, installation guide, and local download counters.
- `app/_tools/design/script-buffet/public/preview-placeholder.svg`: temporary preview artwork for cards until individual GIF previews exist.
- `app/_tools/design/script-buffet/public/Make Silhouette Fill.jsx`, `Opacity Set.jsx`, and `Split Text Frames into Characters.jsx`: the three downloadable InDesign utilities listed in Script Buffet.
- `app/_tools/design/typesetter/`: reserved for the unavailable sidebar app.

Design Manual:

- `app/_tools/design-manual/MainInterface.tsx`: chapter navigation, existing manual layout, images, captions, and lightbox.
- `app/_tools/design-manual/manual.en.md` and `manual.cs.md`: the only chapter sources loaded by the app.
- `app/_tools/design-manual/parse.ts`: turns headings, lists, image groups, and captions into the existing renderer's chapter shape.
- `app/_tools/design-manual/images/`: manual images. The stable browser address remains `/design-manual/media/...`.
- `app/_tools/design-manual/changelog.md`: appendix added to generated PDFs.
- `app/_tools/design-manual/public/`: generated English and Czech PDF downloads.
- `app/_tools/design-manual/scripts/export-pdf.mjs`: reads the same Markdown and images, styles them with PDFKit, and writes both PDF editions.

### `public/`: stable browser URLs

The icon and PDF.js worker files live directly in `public/`. Cover Splitter, Solutions, Script Buffet, Design Manual, and Cliopatria entries are links to app-owned source files. This keeps browser URLs stable without keeping duplicate files.

- `/cover-splitter/*`: the app-owned Pyodide worker and Python splitter used for local cover processing.
- `/solutions/*`: the shared worker, extractor, and canonical `/solutions/import_solutions.jsx` importer.
- `/solutions-beta/*`: temporary compatibility link to the same Solutions files; new code does not use it.
- `/script-buffet/*`: Script Buffet preview media.
- `/design-manual/media/*`: manual images.
- `/design-manual/downloads/*`: generated manual PDFs.
- `/data/cliopatria-timeline.json`: compatibility path; server code reads the app-owned file directly.

Direct files in `public/` are shared browser assets rather than app content:

- `favicon.ico`, `favicon.svg`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png`, and `site.webmanifest`: browser and device icons.
- `pdf.worker.legacy.mjs`: the PDF.js worker used by the current PDF browser helpers.

### Complete app file guide

The following completes the folder map by naming every source-file role. Repeated bilingual info files have one role: `info.en.md` and `info.cs.md` are the English and Czech live info-drawer source for that app. Repeated `copy.ts` files hold typed English/Czech UI copy owned by that app. Repeated `MainInterface.tsx` files are that app's browser UI.

#### Text Extractor: `app/_tools/text/text-extractor/`

- `MainInterface.tsx`: accepts input, displays the editable text, sends OCR/correction requests, and downloads text.
- `copy.ts`: bilingual in-app UI copy and validation messages.
- `code/ocr-server.ts`: private OCR endpoint implementation.
- `code/correct-server.ts`: private text-correction endpoint implementation.
- `prompts/transcription.md`: stable OCR instruction.
- `prompts/correction.md`: stable correction instruction.
- `info.en.md`, `info.cs.md`: live drawer content.

#### Index Creator: `app/_tools/text/index-creator/`

- `MainInterface.tsx`: PDF and term input, review controls, and index output interface.
- `copy.ts`: bilingual in-app UI copy and validation messages.
- `code/pdf-indexer.ts`: local PDF text reading, printed-page detection, candidate search, and output formatting helpers.
- `code/local-ocr.ts`: local sparse-page rendering and bundled Czech OCR fallback.
- `code/forms-server.ts`: server request for word forms.
- `code/form-validation.ts`: server-neutral validation for complete, identity-preserving model forms.
- `tests/index-creator.test.mts`: protects phrase identity, normalization, local scoring, and candidate evidence.
- `scripts/evaluate-index.mts`: evaluates supplied index benchmarks through the current local extraction and ranking pipeline.
- `prompts/forms.md`: stable grammatical-form instructions.
- `info.en.md`, `info.cs.md`: live drawer content.

#### Graph Generator: `app/_tools/image/graph-generator/`

- `MainInterface.tsx`: separate chart prompt and data fields, local spreadsheet import, palette, preview, and SVG download interface.
- `copy.ts`: bilingual Graph UI and progress copy.
- `code/ase.ts`: ASE palette reader.
- `code/data-import.ts`: converts CSV or the first XLSX sheet into an editable Markdown table in the browser.
- `code/graph.ts`: version 2 chart validation and deterministic SVG rendering for bar, line, combined, scatter, and donut charts.
- `code/scales.ts`: deterministic numeric domains, human-friendly ticks, and bilingual number formatting.
- `code/server.ts`: private graph-generation request implementation and version 2 structured-output schema.
- `prompts/system.md`: stable chart-structure instruction for all supported chart kinds.
- `tests/graph.test.mts`: chart renderer, scale, and validator regressions.
- `info.en.md`, `info.cs.md`: live drawer content.

#### Diagram Generator: `app/_tools/image/diagram-generator/`

- `MainInterface.tsx`: biological description, references, palette, preview, checks, and download interface.
- `copy.ts`: bilingual Diagram UI and progress copy.
- `code/ase.ts`: ASE palette reader.
- `code/diagram.ts`: version 1 compatibility plus version 2 biological-diagram validation, deterministic SVG rendering, controlled primitives, panels, labels, connections, and report generation.
- `code/server.ts`: private diagram-generation request implementation and version 2 structured-output schema with safe usage metadata.
- `prompts/system.md`: stable version 2 biological-diagram instruction.
- `scripts/evaluation-cases.json` and `scripts/run-diagram-eval.mjs`: capped, sequential English/Czech and supplied-prompt evaluation tooling; outputs remain in the caller-provided local results directory.
- `tests/diagram.test.mts`: diagram renderer and validator regressions.
- `info.en.md`, `info.cs.md`: live drawer content.

#### Map Generator: `app/_tools/image/map-generator/`

- `MainInterface.tsx`: deterministic map editor, timeline, layers, palette, and cropped-SVG export interface.
- `copy.ts`: bilingual Map UI and progress copy.
- `code/ase.ts`: ASE palette reader.
- `code/map.ts`: map validation, deterministic SVG rendering, and report generation.
- `code/generate-server.ts`: optional model-backed map-generation API implementation.
- `code/timeline-server.ts`: timeline API implementation.
- `code/map-catalog.ts`: present-day geography and physical layer selection.
- `code/historical-boundaries.ts`: historical boundary selection by date.
- `code/cliopatria.ts`: cached reading of the Cliopatria timeline.
- `code/data/cliopatria-timeline.json`: processed historic polity timeline.
- `code/data/cshapes-timeline.json`: processed CShapes historical-boundary data.
- `code/data/koppen-climate.json`, `natural-earth-geography.json`, `natural-earth-water.json`: processed physical map layers.
- `code/data/cliopatria-LICENSE.md`: licence/source note for the retained Cliopatria data.
- `prompts/system.md`, `research.md`, `research-context.md`: stable instructions for the optional model-created map flow.
- `scripts/import-*.mjs`: repeatable import commands for each local data source.
- `scripts/run-map-eval.mjs`: map evaluation command.
- `docs/map generation eval.md`, `docs/map-generator-handoff.md`, `docs/map-prompts.md`: app-specific evaluation, handoff, and prompt notes.
- `info.en.md`, `info.cs.md`: live drawer content.
- `tests/map.test.mts`: map renderer, catalog, and historical-map regressions.

#### Cover Generator: `app/_tools/image/cover-generator/`

- `MainInterface.tsx`: reference intake, direction selection, production controls, results, and lightbox.
- `copy.ts`: bilingual in-app UI copy.
- `code/server.ts`: Shutterstock lookup, model calls, response handling, and cover workflow operations.
- `code/cover-artboard.ts`: browser-created PDF contact sheet.
- `prompts/analyse-assets.md`, `asset.md`, `master.md`, `sketch.md`: the main stable workflow instructions.
- `prompts/medium-3d.md`, `medium-illustration.md`, `medium-match.md`, `medium-photo.md`: medium-specific instruction fragments.
- `prompts/subject-default.md`, `subject-evolution.md`: subject-specific instruction fragments.
- `scripts/create-cover-artboard-sample.py`, `evaluate-cover-model.mjs`, `run-cover-full-workflow.mjs`, `test-cover-workflow.mjs`: local maintenance and evaluation tools, not application runtime code.
- `info.en.md`, `info.cs.md`: live drawer content.

#### Image Generator: `app/_tools/image/image-generator/`

- `MainInterface.tsx`: prompt and reference intake, local document import, sequential queue controller, cancellation, results, downloads, and lightbox.
- `copy.ts`: bilingual in-app UI copy.
- `code/prompts.ts`: blank-line prompt splitting, queue capping, and local `.docx`, `.md`, and `.txt` reading.
- `code/server.ts`: validates one queued request and generates one square image through OpenRouter.
- `prompts/generate.md`: stable generation instruction.
- `tests/prompts.test.mts`: prompt splitting and 15-image cap regressions.
- `info.en.md`, `info.cs.md`: live drawer content.

#### GREP Builder: `app/_tools/design/grep-builder/`

- `MainInterface.tsx`: instruction input and copyable GREP result UI.
- `copy.ts`: bilingual in-app UI copy.
- `server.ts`: private GREP request, deterministic-intent dispatch, response normalization, safe limitation handling, and post-generation validation.
- `intent.ts`: bounded bilingual recognition for high-confidence recurring text operations; unsupported or ambiguous requests continue to the model.
- `validation.ts`: narrow deterministic corrections for a duplicated token protected by a terminal positive lookahead and incorrectly counted four-period ellipses.
- `prompts/system.md`: stable conversion rules.
- `tests/validation.test.mts`: validator regression coverage, including idempotence and warning safety.
- `tests/intent.test.mts`: bilingual deterministic-intent coverage and negative fail-closed cases.
- `tests/prompt.test.mts`: protects the documented four-pass conditional date-padding workflow.
- `info.en.md`, `info.cs.md`: live drawer content.

#### Cover Splitter: `app/_tools/design/cover-splitter/`

- `MainInterface.tsx`: multi-PDF upload and first-page preview grid with independent A5/A4/B5/half controls, plus a right sidebar for file actions, optional inside-cover splitting, local console, progress, and ZIP download.
- `copy.ts`: bilingual in-app UI copy and validation messages.
- `code/pdf-preview.ts`: local first-page rendering and page-dimension reading with PDF.js.
- `public/pyodide-worker.js`: browser worker that downloads Pyodide and `pypdf`, then processes all PDFs locally.
- `public/split_cover.py`: vector-preserving panel extraction and ZIP packaging. Fixed sizes retain the outer trim-width panels and omit the middle spine; half mode divides at the midpoint. Page 2 is ignored by default or optionally mapped left to `FRONT-inside` and right to `BACK-inside`.
- `tests/cover-splitter.test.mjs`: preset geometry, mixed per-file settings, first-page-only behavior, vector output, and archive-name regressions.
- `info.en.md`, `info.cs.md`: live drawer content.

#### Prompt Extractor: `app/_tools/design/prompt-extractor/`

- `MainInterface.tsx`: manuscript controls, preview, progress, and output UI.
- `copy.ts`: bilingual in-app UI copy and validation messages.
- `code/pdf-images.ts`: local PDF page-to-image rendering.
- `code/server.ts`: private vision-model request and response validation.
- `prompts/system.md`: stable page-inspection instruction.
- `info.en.md`, `info.cs.md`: live drawer content.

#### Barcode Generator: `app/_tools/design/barcode-generator/`

- `MainInterface.tsx`: ISBN input, barcode preview, and PDF download UI.
- `copy.ts`: bilingual in-app UI copy.
- `code/ean13.ts`: ISBN/EAN validation, SVG bar construction, and vector-PDF creation.
- `info.en.md`, `info.cs.md`: live drawer content.

#### Solutions Importer: `app/_tools/design/solutions-importer/`

- `MainInterface.tsx`: three-file input, local comparison worker, operation review, and JSON/script downloads.
- `copy.ts`: bilingual in-app UI copy.
- `code/pdf.ts`: positioned text extraction from PDFs for the worker.
- `public/pyodide-worker.js`: browser worker that runs the local Python extractor.
- `public/extract_solution_operations.py`: PDF/IDML comparison that writes the `indesign-solutions-v2` manifest.
- `public/import_solutions.jsx`: the only InDesign importer, with a post-validation ScriptUI choice between Advanced answer-box/table-aware placement and Simple direct coordinate placement.
- `solutions-exporter-workflow.md`: human maintenance guide for the v2 format and canonical importer.
- `tests/solutions-importer.test.mjs`: format and script-contract tests.
- `info.en.md`, `info.cs.md`: live drawer content.

#### Script Buffet: `app/_tools/design/script-buffet/`

- `MainInterface.tsx`: card grid, Adobe-application filter, installation guide, and per-browser download counter.
- `public/preview-placeholder.svg`: temporary script-preview asset.
- `info.en.md`, `info.cs.md`: live drawer content.

#### Reserved Typesetter: `app/_tools/design/typesetter/`

- `info.en.md`, `info.cs.md`: drawer content for the unavailable placeholder. There is no implementation yet.

#### Design Manual: `app/_tools/design-manual/`

- `MainInterface.tsx`: existing manual chapter renderer and image lightbox.
- `parse.ts`: Markdown-to-chapter parser used by the page.
- `manual.en.md`, `manual.cs.md`: English and Czech live manual sources.
- `changelog.md`: shared appendix appended to both PDF editions.
- `images/image1.png` through `images/image14.png`: the manual's actual illustrated content.
- `public/design-manual.en.pdf`, `public/design-manual.cs.pdf`: generated download files, regenerated with `npm run manual:pdf`.

#### Running the Design Manual PDF export

`npm run manual:pdf` runs `app/_tools/design-manual/scripts/export-pdf.mjs`. With no extra argument it builds both languages; `npm run manual:pdf -- en` and `npm run manual:pdf -- cs` build one edition.

For each edition, the script reads `manual.<language>.md` and `changelog.md`, parses Markdown using `remark-parse`, and draws an A4 PDF using PDFKit. It creates a custom cover, chapter pages, headings, bullets, paragraphs, image captions, page headers/footers, and a final changelog appendix. It takes every image filename from Markdown and loads the matching file from `design-manual/images/`.

The output is written to `design-manual/public/design-manual.en.pdf` and `design-manual.cs.pdf`; the `public/design-manual/downloads` link exposes those files in the browser. The website uses the same Markdown source but its own React renderer, so the PDF is visually similar rather than a pixel-for-pixel browser export. The script currently registers Verdana from macOS system paths, which must be made configurable before it can reliably run on Windows or Linux.

### `tests/` and `docs/`

- `tests/architecture.test.mjs`: protects the folder rules, Markdown drawer source, and lack of Tailwind.
- `tests/translations.test.mjs`: discovers every app-owned `copy.ts` module and verifies matching English/Czech dictionary paths.

- App-specific scripts, tests, and handoff notes live with their app.

## OpenRouter provisioning and usage attribution

Robot has one inference key per model-backed app. `app/_tools/openrouter/config.ts` is the canonical mapping between the nine app IDs and their `OPENROUTER_<APP>_API_KEY` environment variables. `app/_tools/openrouter/server.ts` selects the appropriate key, attaches a stable pseudonymous identifier derived from the authenticated Robot username, and emits a content-free `[openrouter-usage]` JSON record for each response.

Provision the nine app keys by creating one OpenRouter Management API key, placing it only in the ignored `.env.openrouter-management.local` file as `OPENROUTER_MANAGEMENT_API_KEY`, and running:

```bash
npm run openrouter:provision
```

The command calls OpenRouter's Management API, creates only missing `Taktik Robot / <app>` keys, and writes each newly returned plaintext inference key immediately to `.env.local`. The management key must not be deployed with the application. Production needs the nine generated inference variables copied into its secret environment.

`OPENROUTER_API_KEY` is retained only as a migration fallback. For each request, the dedicated app variable wins; the shared key is read only if that app variable is absent. The shared key can be removed from an environment once all nine variables from `openRouterApps` are configured there. Removing it earlier causes apps with missing dedicated keys to return HTTP 503.

## Main execution flow

1. A request enters `proxy.ts`.
2. Public files and the login API pass through. Other requests need a valid signed cookie from `app/lib/auth.ts`.
3. `app/page.tsx` reads drawer Markdown through `app/_tools/info.ts` and Design Manual Markdown through `design-manual/parse.ts`.
4. `app/Workspace.tsx` receives the parsed content, shows the shell, and uses `app/_tools/registry.ts` to build the sidebar.
5. A sidebar click changes `selected`. The workspace shows that app's interface without navigating away, so current form state is retained while switching tools.
6. Local tools run in the browser. AI tools call a private `/api/...` URL. Those route files forward to the owning app's server function.
7. Results are displayed, copied, or downloaded in the browser. InDesign tools additionally provide a local JSX importer.

## App flows and module contracts

### Text Extractor

**Input:** pasted text, PNG/JPEG, or short PDF; optional correction instruction.

**Flow:**

```text
Browser file or pasted text
↓
POST /api/ocr
↓
ocr-server.POST
↓
OpenRouter OCR or vision call
↓
Plain text in the editor
↓
Optional POST /api/correct
↓
Corrected replacement text
```

**Output:** copied text or `.md`/`.txt` download.

**Dependencies:** browser File APIs and OpenRouter. OCR uses `mistralai/mistral-small-2603`; PDF input also enables OpenRouter's `mistral-ocr` file-parser engine. Correction uses `mistralai/ministral-8b-2512`. The environment variables in `.env.example` can override the model names. The interface is app-owned; file validation, request control, and result formatting remain in `Workspace.tsx`.

### Index Creator

**Input:** live-text PDF, one term per line, PDF-page/printed-page anchor.

**Flow:**

```text
PDF.js reads page text locally
↓
detectPrintedPageAnchor proposes page numbering
↓
forms-server.POST expands grammatical forms
↓
findIndexCandidates finds and ranks possible pages locally
↓
Workspace lets the user accept or demote candidate pages
↓
Workspace formats accepted pages as tab-separated ranges
```

**Output:** editable index, copy, `.md`, or `.txt`.

**Dependencies:** PDF.js plus one OpenRouter call. Grammatical-form expansion uses `mistralai/mistral-medium-3-5`; candidate search, ranking, review, and output formatting remain local. Only the term list goes to OpenRouter.

### Map Generator

**Input:** year, visible layers, pan/zoom, country fills, and optional ASE palette.

**Flow:**

```text
Year or layer change
↓
GET /api/maps/timeline
↓
timeline-server.GET selects Cliopatria, CShapes, or current boundaries
↓
map-catalog adds local physical data
↓
renderMapSvg draws deterministic SVG
↓
Browser applies view, visibility, and palette
↓
Cropped SVG download
```

**Output:** editable SVG and warnings.

**Dependencies:** local processed datasets, Natural Earth/world-atlas data, D3 geographic helpers, TopoJSON, and the ASE parser. The visible timeline flow calls no LLM and no OpenRouter model. The prompt field is displayed but is not connected to an action.

### Diagram Generator

**Input:** written biological request, up to three reference images, and optional ASE palette.

**Flow:**

```text
Request, references, and palette
↓
POST /api/figures with diagram mode
↓
OpenRouter returns a limited diagram description
↓
validateDiagramSpec checks the description
↓
renderDiagramSvg draws coordinates and labels
↓
SVG and verification report
```

**Output:** editable SVG plus Markdown verification report.

**Dependencies:** OpenRouter model `mistralai/mistral-large-2512`, the shared diagram validator/renderer, browser image handling, and the ASE parser. The LLM describes the parts; code draws the SVG. Biological facts still need editorial review.

### Graph Generator

**Input:** separate chart instructions, typed or pasted data, optional CSV or XLSX data file, optional named sources, and optional ASE palette.

**Flow:**

```text
Separate user prompt and typed, pasted, CSV, or XLSX data
↓
The browser converts imported tabular files to Markdown
↓
POST /api/figures with chart mode
↓
OpenRouter structures only the supplied values
↓
validateGraphSpec checks data and shape for safe rendering
↓
renderGraphSvg calculates scales, axes, marks, and chart-specific geometry
↓
Editable SVG
```

**Output:** editable SVG.

**Dependencies:** OpenRouter model `mistralai/mistral-large-2512`, `read-excel-file` for local XLSX parsing, the graph validator/renderer, and the ASE parser. The model must not research, estimate, or invent graph numbers.

### Cover Generator

**Input:** two or three reference covers, brief, style/quality choices, optional Shutterstock searches.

**Flow:**

```text
References, brief, and options
↓
Optional Shutterstock research
↓
Parallel OpenRouter concept generation
↓
User selects one direction
↓
OpenRouter object analysis
↓
2K master generation
↓
Separate 2K asset generation
↓
ZIP report or artboard PDF
```

**Output:** concept images, master, separate assets, ZIP report, and artboard PDF.

**Dependencies:** OpenRouter image model `black-forest-labs/flux.2-klein-4b` for fast 512 px concepts, `black-forest-labs/flux.2-pro` for high-quality 1K concepts, 2K master, and separate assets, and LLM `mistralai/mistral-small-2603` for object analysis. It can also read optional Shutterstock pages. Browser ZIP/PDF helpers produce downloads. The interface is app-owned; workflow control, ZIP writing, and report creation remain in `Workspace.tsx`.

### GREP Builder

**Input:** plain Find and Change instructions.

**Flow:**

```text
Find and Change instructions
↓
POST /api/grep
↓
OpenRouter returns a GREP candidate or safe limitation warning
↓
Narrow deterministic post-generation validation
↓
Copy buttons
```

**Output:** InDesign GREP Find What and Change To strings.

**Dependencies:** OpenRouter model `mistralai/ministral-8b-2512`. No document is uploaded.

### Cover Splitter

**Input:** one or more cover PDFs, up to 30 MB per file. Source page 1 is always processed. Source page 2 is ignored by default and can optionally be split as the inside cover.

**Flow:**

```text
PDF.js renders each first-page preview locally
↓
User selects A5, A4, B5, or Split in half per PDF
↓
Optional checkbox enables page-2 inside-cover output
↓
Pyodide worker loads local Python and pypdf
↓
Python extracts the left back panel and right front panel
↓
Fixed presets omit any middle spine
↓
Outside _BACK.pdf and _FRONT.pdf files are packaged as a ZIP
↓
When enabled, page 2 left becomes _FRONT-inside.pdf and right becomes _BACK-inside.pdf
```

**Output:** a ZIP containing one vector back PDF and one vector front PDF for every source file, plus matching front-inside and back-inside PDFs when the checkbox is enabled.

**Dependencies:** PDF.js for previews and browser-local Pyodide/`pypdf` for PDF output. The source PDFs are not sent to the server; the browser downloads the Python runtime and PDF package on first use.

### Prompt Extractor

**Input:** manuscript PDF up to 20 pages.

**Flow:**

```text
PDF.js renders pages locally
↓
Browser sends one page image at a time
↓
POST /api/prompts
↓
OpenRouter returns structured illustration descriptions
↓
Server validates them
↓
Workspace groups SIMPLE and COMPLEX items
```

**Output:** editable prompt list, copy, `.md`, or `.txt`.

**Dependencies:** PDF.js and OpenRouter vision model `qwen/qwen3.5-122b-a10b`. The interface is app-owned; rendering, batching, formatting, and long-lived state remain in `Workspace.tsx`.

### Solutions Importer

**Input:** clean PDF, annotated manuscript PDF, matching clean IDML, print-mark setting, font, and size.

**Flow:**

```text
Clean PDF, annotated PDF, and IDML
↓
MainInterface extracts positioned text from both PDFs
↓
Worker loads Pyodide and pdfplumber
↓
Python reads annotations and IDML structure
↓
indesign-solutions-v2 operations
↓
User reviews and enables operations
↓
Reviewed JSON download plus canonical import_solutions.jsx
↓
Importer selects and validates the shared JSON
↓
ScriptUI offers Advanced or Simple
↓
Advanced maps text into answer boxes and table cells
or
Simple places text directly at PDF coordinates
```

**Output:** one v2 JSON file and one canonical downloadable JSX importer. Advanced is recommended for tables and answer boxes; Simple is the more failsafe fallback when Advanced fails.

**Dependencies:** PDF.js, Pyodide/pdfplumber, ZIP/XML parsing in Python, and Adobe InDesign. It calls no LLM and no OpenRouter model. The canonical script accepts only `indesign-solutions-v2`.

### Script Buffet

**Input:** optional Adobe application filter and installation-guide expansion.

**Flow:**

```text
Registry selects Script Buffet
↓
MainInterface loads its local script catalog
↓
User filters InDesign, Illustrator, or Photoshop cards
↓
Browser downloads the linked app-owned script
↓
localStorage increments that browser's local count
```

**Output:** JSX downloads and installation paths for macOS and Windows.

**Dependencies:** browser state, `localStorage`, and app-owned public files. It makes no API, LLM, or OpenRouter call. Counts are local, not global.

### Barcode Generator

**Input:** ISBN-10 or ISBN-13.

**Flow:**

```text
ISBN input
↓
normalizeIsbn validates or converts it
↓
eanCheckDigit verifies EAN-13
↓
eanModules produces the bars
↓
Browser draws the SVG preview
↓
createEan13Pdf writes outlined vector digits
```

**Output:** vector PDF EAN-13.

**Dependencies:** browser code only. It makes no API, LLM, or OpenRouter call.

### Design Manual

**Input:** language and chapter selection; Markdown chapter source maintained by a human developer.

**Flow:**

```text
manual.en.md or manual.cs.md
↓
parseDesignManual reads headings, lists, images, and captions
↓
app/page.tsx passes the existing chapter shape to Workspace
↓
The existing manual renderer creates the same chapter DOM
↓
Optional image lightbox
```

PDF export is a parallel local flow:

```text
manual.en.md or manual.cs.md plus changelog.md
↓
npm run manual:pdf
↓
export-pdf.mjs parses Markdown and reads local images
↓
PDFKit lays out the manual and changelog
↓
design-manual.en.pdf and design-manual.cs.pdf
```

**Output:** an on-screen reference manual with the existing layout and downloadable English/Czech PDFs.

**Dependencies:** local Markdown, `remark-parse`, PDFKit, and local PNG images. It makes no API, LLM, or OpenRouter call.

### Image Generator

**Input:** one or more prompts separated by empty lines, optionally imported locally from `.docx`, `.md`, or `.txt`, plus up to three optional PNG, JPEG, or WebP references.

**Flow:**

```text
Typed or locally imported prompt text
↓
Blank lines split and cap the queue at 15 prompts
↓
The browser sends one to three prompts at a time to /api/images
↓
The app-owned handler calls OpenRouter with the Image Generator key
↓
Each square result appears as its request completes
```

The Stop action aborts every active browser request and marks unstarted queue entries as stopped. The route passes request abort signals to OpenRouter so cancellation also stops in-flight upstream fetches when the runtime propagates disconnects. The app stays mounted while another sidebar tool is active, retaining its browser-session state and allowing its queue to continue.

Failed cards can retry their own request. Completed 512 px and 1K cards can be upscaled one size step through FLUX.2 Pro image editing: 512 px to 1K, or 1K to 2K. This is generative enhancement rather than pixel-identical scaling; the source image is supplied as a reference and a stable prompt requires the model to preserve its composition. 2K is the maximum square output.

**Output:** separate square JPEG images with individual and batch download controls.

**Dependencies:** browser File, Canvas, ZIP decompression, and DOM APIs for local input preparation; OpenRouter image generation using the same FLUX fast/fidelity choices as Cover Generator. The imported source document itself is not uploaded.

### Typesetter

**Input:** none yet.

**Flow:**

```text
Unavailable sidebar entry
↓
Reserved app folder
```

**Output:** none yet.

**Dependencies:** none yet; no OpenRouter model is configured.

## OpenRouter model map

Model names are defaults from `.env.example`. Each can be changed through its named environment setting without editing code.

| App               | Job                   | Setting                             | Default model                       |
| ----------------- | --------------------- | ----------------------------------- | ----------------------------------- |
| Text Extractor    | OCR and image reading | `OPENROUTER_OCR_MODEL`              | `mistralai/mistral-small-2603`      |
| Text Extractor    | correction            | `OPENROUTER_CORRECTION_MODEL`       | `mistralai/ministral-8b-2512`       |
| Index Creator     | grammatical forms     | `OPENROUTER_INDEX_MODEL`            | `mistralai/mistral-medium-3-5`      |
| Diagram Generator | diagram description   | `OPENROUTER_FIGURE_MODEL`           | `mistralai/mistral-large-2512`      |
| Graph Generator   | chart structure       | `OPENROUTER_FIGURE_MODEL`           | `mistralai/mistral-large-2512`      |
| Image Generator   | fast 512 px images    | `OPENROUTER_COVER_SKETCH_MODEL`     | `black-forest-labs/flux.2-klein-4b` |
| Image Generator   | high-quality images   | `OPENROUTER_COVER_FIDELITY_MODEL`   | `black-forest-labs/flux.2-pro`      |
| Image Generator   | 2× generative upscale | `OPENROUTER_IMAGE_UPSCALE_MODEL`*   | `black-forest-labs/flux.2-pro`      |
| Cover Generator   | fast 512 px concepts  | `OPENROUTER_COVER_SKETCH_MODEL`     | `black-forest-labs/flux.2-klein-4b` |
| Cover Generator   | high-quality concepts | `OPENROUTER_COVER_FIDELITY_MODEL`   | `black-forest-labs/flux.2-pro`      |
| Cover Generator   | 2K master and assets  | `OPENROUTER_COVER_PRODUCTION_MODEL` | `black-forest-labs/flux.2-pro`      |
| Cover Generator   | object analysis       | `OPENROUTER_COVER_ANALYSIS_MODEL`   | `mistralai/mistral-small-2603`      |
| GREP Builder      | GREP conversion       | `OPENROUTER_GREP_MODEL`             | `mistralai/ministral-8b-2512`       |
| Prompt Extractor  | page-image reading    | `OPENROUTER_PROMPT_EXTRACTOR_MODEL` | `qwen/qwen3.5-122b-a10b`            |

`*` `OPENROUTER_IMAGE_UPSCALE_MODEL` is optional; the Image Generator otherwise uses `OPENROUTER_COVER_PRODUCTION_MODEL`, then `black-forest-labs/flux.2-pro`.

Map Generator's visible year/timeline flow, Solutions Importer, Script Buffet, Barcode Generator, Design Manual, and Typesetter make no OpenRouter call in their current visible flows. Its optional app-owned generated-map endpoint uses the Figure model and a web-research pass when invoked.

## Important functions

`Workspace.tsx` functions:

- `selectApp`: opens an available app and selects its generation mode while preserving the existing image-workbench state.
- `toggleLanguage`, `toggleTheme`: update shell preferences.
- `handlePaste`, `selectSourceFile`, `extractSource`, `correctText`: Text Extractor input and API flow.
- `selectIndexFile`, `createIndex`, `formatIndexOutput`: Index Creator orchestration and display formatting.
- `generateGrep`, `copyGrep`: GREP request and clipboard handling.
- `extractPrompts`, `formatPromptOutput`: prompt batching and output formatting.
- `generateFigure`, `loadTimelineYear`: model-backed figures and local historical maps.
- `mapPointerDown`, `mapPointerMove`, `mapPointerUp`, `mapWheel`: map viewport interaction.
- `applyMapPalette`, `downloadCroppedMap`: final map appearance and SVG export.
- `generateCoverSketches`, `generateCoverLayers`: cover concept and production calls.
- `downloadCoverZip`, `exportCoverArtboard`: cover deliverables.
- `downloadBarcode`: barcode PDF download.
- `downloadText`, `downloadFigure`: shared browser download helpers.
- `verificationMarkdown`: converts a figure report from JSON to readable Markdown.
- `PageLoadStatus`: shared changing status text. `LoadingText` is in `app/_components/LoadingText.tsx`.

The exported functions in `graph-generator/code/graph.ts`, `diagram-generator/code/diagram.ts`, and `map-generator/code/map.ts` are deliberately pure where possible: each validator accepts unknown input and returns a safe description plus checks; each renderer accepts that description and returns SVG; each report function returns a serializable report.

## Where responsibilities are still mixed

- `app/Workspace.tsx` still mixes shell navigation with every app's long-lived browser state, local file work, API calls, and downloads. Interfaces are separated, but controller ownership is now its main extension risk.
- `app/_tools/image/cover-generator/code/server.ts` mixes Shutterstock page reading, prompt construction, OpenRouter calls, response parsing, and four workflow modes.
- `app/Workspace.tsx` preserves image-app state in one controller while rendering three interfaces. This avoids a behavior change during the split, but controller ownership remains to be moved.
- Some download and upload helpers are repeated rather than shared because they have slightly different limits and output rules.

## Duplication, dead code, and confusing names

- OpenRouter request headers, error handling, and model selection are repeated across server files. Prompt prose is now app-owned Markdown, but the HTTP request shell is still duplicated.
- PDF.js worker setup appears in the index, prompt, and Solutions PDF helpers.
- File validation, drag/drop, clipboard, and Blob download patterns repeat in the workspace.
- Solutions has one extractor but two importer strategies. Keep their shared v2 input contract tested while allowing their placement code to remain deliberately different.
- `findIndexMatches` and `formatIndex` in `pdf-indexer.ts` appear unused by the current UI.
- `mapEditPrompt` and its field are not connected to generation.

- `bio` means Diagram Generator and `graph` means chart generation. These keys are old internal names and should eventually become `diagram` and `chart` through a tested migration.
- “blank”, “clean”, “answers”, “solutions”, “manuscript”, and “annotated manuscript” name related but different files. New code should use the terms documented in each Solutions contract.

## Extension risks

- Adding an app currently requires a registry entry, app-owned bilingual `copy.ts`, two info files, an interface, CSS, and a component call in `Workspace.tsx`. Missing one is easy.
- Workspace state can accidentally leak assumptions between graph, diagram, and map because their controller state is still co-located.
- Long functions make it hard to test one workflow without rendering the full page.
- API response shapes are local TypeScript types rather than shared checked contracts.
- Large map JSON imports can increase build and memory cost for unrelated figure routes.
- InDesign JSX cannot be covered by normal Node tests; format checks and real InDesign fixture runs are both necessary.
- AI endpoints have little automated coverage because model calls are external and variable.

## Practical next structure

Continue the current structure without adding a framework inside the framework:

1. Move one complete controller at a time from `Workspace.tsx` to the owning app after adding a switching-app browser test.
2. Give an interface a small controller hook only when its state and actions are large enough to benefit from it.
3. Decide explicitly whether each app should preserve or reset its form when switching; moving state changes that behavior.
4. Move one image-app controller at a time only after a switching-app browser test protects its state behavior.
5. Add a small shared OpenRouter request helper after tests cover the current error behavior.
6. Remove confirmed dead files and functions in separate changes so behavior changes are easy to review.

Do not create a general “tool engine”, service container, or class hierarchy. The apps have different inputs and outputs; simple modules with explicit functions are easier to own.
