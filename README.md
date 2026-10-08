# Taktik Robot

Taktik Robot is a private workspace for preparing textbook text, images, and InDesign files. Choose a tool from the sidebar; each tool keeps its own purpose and output format.

## Text

### Text Extractor

Reads text from a pasted image, PNG/JPEG, or short PDF. The result can be corrected with a written instruction, edited, copied, or downloaded. [English info drawer](app/_tools/text/text-extractor/info.en.md)

### Index Creator

Reads a live-text textbook PDF locally, finds requested terms and their language forms, and prepares a tab-separated index with printed page numbers. [English info drawer](app/_tools/text/index-creator/info.en.md)

### Prompt Extractor

Looks through a manuscript PDF and prepares simple and complex illustration prompts for meaningful visual content. [English info drawer](app/_tools/text/prompt-extractor/info.en.md)

## Image

### Map Maker

Builds an editable SVG map for a selected year using local historical and present-day datasets. You can change layers, view, country fills, and an Adobe colour palette. [English info drawer](app/_tools/image/map-generator/info.en.md)

### Diagram Generator

Turns a written biological description and optional reference images into a checked, editable SVG diagram and a verification report. [English info drawer](app/_tools/image/diagram-generator/info.en.md)

### Graph Generator

Turns a separate chart prompt and supplied data into an editable bar, line, combined, scatter, or donut chart. Data can be typed, pasted, or imported locally from Excel and CSV files. [English info drawer](app/_tools/image/graph-generator/info.en.md)

### Image Generator

Creates up to 15 square images from prompts queued in order, with a choice of one to three simultaneous requests. Prompts can be typed or imported locally from Word, Markdown, and text files, with up to three optional reference images, retries, and 2× generative upscaling. [English info drawer](app/_tools/image/image-generator/info.en.md)

### Cover Generator

Creates one, two, or four text-free textbook cover-art directions from an audience, subject, user-selectable visual treatment, optional keywords, and optional reference images. A Mistral-family vision planner expands the short input into deliberately different concepts for later typography and layout in InDesign. [English info drawer](app/_tools/image/cover-generator/info.en.md)

### Concept Illustrator

Turns an article into exactly three editorial visual metaphors, lets the editor choose and adjust one direction, then generates and art-directs one illustration through a revision history. Projects, house-style references, prompts, feedback, and final images are remembered locally in the browser. [English info drawer](app/_tools/image/concept-illustrator/info.en.md)

### Layer Splitter

Reconstructs one supplied image as editable Photoshop layers. OpenRouter analyses the scene and generates a complete text-free background plus complete foreground objects with plausible hidden portions; the PSD is assembled and keyed locally. [English info drawer](app/_tools/image/layer-splitter/info.en.md)

## Design

### GREP Builder

Turns plain Find and Change instructions into strings for Adobe InDesign's GREP tab. [English info drawer](app/_tools/design/grep-builder/info.en.md)

### Cover Splitter

Splits the first outside-cover page of one or more local PDFs into separate vector `_BACK.pdf` and `_FRONT.pdf` files. A5, A4, and B5 presets omit any middle spine; Split in half divides the spread at its midpoint. The second inside-cover page is ignored by default, or an optional checkbox adds matching `_FRONT-inside.pdf` and `_BACK-inside.pdf` files. Format-specific ZIP downloads provide the vector PDFs or requested PNG/JPG panels. PNG and JPG are rendered locally only when requested, and the main ZIP retains PDFs plus every requested raster format. [English info drawer](app/_tools/design/cover-splitter/info.en.md)

### Solutions Importer

Combines a clean PDF, an annotated manuscript PDF, and matching IDML into one reviewed `indesign-solutions-v2` JSON file. One canonical InDesign script, downloaded from `/solutions/import_solutions.jsx`, validates that JSON and then offers a ScriptUI choice between Advanced layout-aware placement and Simple direct PDF-coordinate placement. Advanced is recommended for tables and answer boxes; if it fails, Simple is the more failsafe fallback. [English info drawer](app/_tools/design/solutions-importer/info.en.md)

### Script Buffet

Collects useful InDesign, Illustrator, and Photoshop scripts as filterable download cards. It also explains where scripts belong on macOS and Windows. The current download number is stored in the local browser, not in a global database. [English info drawer](app/_tools/design/script-buffet/info.en.md)

### Barcode Generator

Checks ISBN-10 or ISBN-13 and creates a print-ready vector EAN-13 PDF locally. [English info drawer](app/_tools/design/barcode-generator/info.en.md)

### Typesetter

Reads a Word manuscript and an InDesign IDML template, inventories the template locally, suggests controlled semantic roles with AI, lets the designer map those roles to real paragraph styles, and exports reviewed `indesign-typesetter-v1` JSON plus an InDesign importer. V1 fills one labelled threaded story and creates unanchored image-request frames for manual placement. [English info drawer](app/_tools/design/typesetter/info.en.md)

## Reference

The Design Manual is built into the workspace from local English and Czech Markdown without changing its existing chapter layout. Its images live beside it in `app/_tools/design-manual/images`. `npm run manual:pdf` creates both downloadable PDF editions and appends [the changelog](app/_tools/design-manual/changelog.md). [English Design Manual source](app/_tools/design-manual/manual.en.md)

The Brand Manual link opens the existing external document.

## Why Next.js

Next.js lets this repository contain both the browser interface and small private server endpoints. The private endpoints call OpenRouter without exposing its key to the browser. It also gives the project one development command, one build, and one deployment instead of a separate frontend and server.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Useful checks:

```bash
npm run lint
npm test
```

`npm test` builds the production app before running the local tests.

To rebuild the Design Manual PDF downloads after editing its Markdown:

```bash
npm run manual:pdf
```

### Design Manual PDF export

The exporter reads `app/_tools/design-manual/manual.en.md`, `manual.cs.md`, the local `images/` folder, and [the shared changelog](app/_tools/design-manual/changelog.md). It writes both public downloads to `app/_tools/design-manual/public/`.

```bash
npm run manual:pdf       # English and Czech
npm run manual:pdf -- en # English only
npm run manual:pdf -- cs # Czech only
```

The PDF uses the same Markdown content as the website, but it has its own print layout rather than copying the browser page pixel for pixel. It currently uses macOS Verdana system fonts, so export on Windows or Linux needs font-path configuration in `app/_tools/design-manual/scripts/export-pdf.mjs`.

## Configuration

### Sidebar release visibility

`app/_tools/registry.ts` is the single release list for tools. Set a tool's `hidden` value to `true` to remove it from the sidebar without deleting its implementation. Hidden tools remain in the repository and deployment; this flag is navigation visibility, not an API access restriction.

The existing `available` flag is independent: an app with `hidden: false` and `available: false` remains visible but disabled with the coming-soon behavior. If every tool in a category is hidden, that empty category is also omitted from the sidebar.

Read `.env.example` for the current settings. At minimum, local use needs the login values and session secret. Model names are settings so they can be changed without editing request code.

The Bugs and Feedback dialog uses the server-only Asana variables listed in `.env.example`: `ASANA_CLIENT_ID`, `ASANA_CLIENT_SECRET`, `ASANA_REFRESH_TOKEN`, `ASANA_PROJECT_GID`, `ASANA_SECTION_GID`, and `ASANA_ASSIGNEE_GID`. Never prefix these with `NEXT_PUBLIC_` or expose their values to the browser. The scoped Asana app cannot list empty sections, so after placing a temporary task in the exact `Bugs and Feedback` section, run `npm run feedback:section` once; the command discovers the section membership and saves only its GID to the ignored `.env.local`.

Each model-backed app uses its own server-only OpenRouter key. Robot sends OpenRouter a stable pseudonymous identifier derived from the authenticated username and writes one `[openrouter-usage]` JSON record to the server log for every OpenRouter response. The record contains the app, operation, pseudonymous user, generation ID, model, status, token counts, and cost; it never contains prompts, files, or model output.

Create the app keys automatically:

1. Create one management key at [OpenRouter → Settings → Management Keys](https://openrouter.ai/settings/management-keys).
2. Create a local-only `.env.openrouter-management.local` file containing `OPENROUTER_MANAGEMENT_API_KEY=...`.
3. Run the provisioning command from the repository root:

```bash
npm run openrouter:provision
```

The provisioning command creates any missing `Taktik Robot / <app>` keys and writes their eleven inference-key variables to `.env.local`. Optional `OPENROUTER_APP_KEY_LIMIT_USD` and `OPENROUTER_APP_KEY_LIMIT_RESET` (`daily`, `weekly`, or `monthly`) values may be placed beside the management key before provisioning. Existing configured keys are retained. OpenRouter reveals an inference key only when it is created, so the script saves each new key immediately.

Only add the generated per-app inference variables to production deployment secrets. Do not deploy `OPENROUTER_MANAGEMENT_API_KEY`; it is deliberately kept in the nonstandard local file so the Next.js runtime does not load it.

`OPENROUTER_API_KEY` is now only a migration fallback. A request uses it when that request's dedicated per-app variable is missing. It is safe to delete the shared key from `.env.local` and production only after all eleven per-app variables are present in that environment. Until then, deleting it will make any app with a missing dedicated key return HTTP 503. The server logs a warning whenever the fallback is used.

Stable instructions sent to OpenRouter live as readable Markdown in each app's `prompts/` folder. TypeScript adds only current user data and other values that change per request.

## Where to read next

- [architecture.md](architecture.md) explains folders, files, functions, dependencies, execution flows, remaining mixed responsibilities, and extension risks.
- [AGENTS.md](AGENTS.md) gives coding agents the exact working rules and checks for this repository.
- Every app's English and Czech `info.*.md` file is live UI content. Editing it changes the info drawer after the next page load.

## Repository layout

All source code for an app lives below `app/_tools/<category>/<app>/`. This keeps its interface, private server code, Markdown instructions, downloads, data, tests, and maintenance scripts together. `app/api/` contains only the small Next.js URL entry files that preserve browser-facing API addresses.

The exact, file-by-file developer inventory is maintained in [architecture.md](architecture.md). It also identifies generated and local-only folders such as `.next/`, `node_modules/`, and `tmp/`, which are not source code to edit.
