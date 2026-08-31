# Taktik Robot

Taktik Robot is a private workspace for preparing textbook text, images, and InDesign files. Choose a tool from the sidebar; each tool keeps its own purpose and output format.

## Text

### Text Extractor

Reads text from a pasted image, PNG/JPEG, or short PDF. The result can be corrected with a written instruction, edited, copied, or downloaded. [English info drawer](app/_tools/text/text-extractor/info.en.md)

### Index Creator

Reads a live-text textbook PDF locally, finds requested terms and their language forms, and prepares a tab-separated index with printed page numbers. [English info drawer](app/_tools/text/index-creator/info.en.md)

## Image

### Map Generator

Builds an editable SVG map for a selected year using local historical and present-day datasets. You can change layers, view, country fills, and an Adobe colour palette. [English info drawer](app/_tools/image/map-generator/info.en.md)

### Diagram Generator

Turns a written biological description and optional reference images into a checked, editable SVG diagram and a verification report. [English info drawer](app/_tools/image/diagram-generator/info.en.md)

### Graph Generator

Turns supplied numbers and sources into an editable bar or line chart. It also produces a report so the numbers can be checked. [English info drawer](app/_tools/image/graph-generator/info.en.md)

### Image Generator

Reserved for a future image tool. It is visible in the sidebar but is not available yet. [English info drawer](app/_tools/image/image-generator/info.en.md)

### Cover Generator

Creates new textbook cover directions from reference covers and a brief. A selected direction can be recreated as a 2K master with separate generated assets. [English info drawer](app/_tools/image/cover-generator/info.en.md)

## Design

### GREP Builder

Turns plain Find and Change instructions into strings for Adobe InDesign's GREP tab. [English info drawer](app/_tools/design/grep-builder/info.en.md)

### Solutions Importer

Combines a clean PDF, an annotated manuscript PDF, and matching IDML into one reviewed `indesign-solutions-v2` JSON file. The Simple InDesign script places text directly at its PDF coordinates. The Advanced script also maps answers into table cells and aligns answer frames. If Advanced fails, Simple is the more failsafe fallback. [English info drawer](app/_tools/design/solutions-importer/info.en.md)

### Script Buffet

Collects useful InDesign, Illustrator, and Photoshop scripts as filterable download cards. It also explains where scripts belong on macOS and Windows. The current download number is stored in the local browser, not in a global database. [English info drawer](app/_tools/design/script-buffet/info.en.md)

### Barcode Generator

Checks ISBN-10 or ISBN-13 and creates a print-ready vector EAN-13 PDF locally. [English info drawer](app/_tools/design/barcode-generator/info.en.md)

### Prompt Extractor

Looks through a manuscript PDF and prepares simple and complex illustration prompts for meaningful visual content. [English info drawer](app/_tools/design/prompt-extractor/info.en.md)

### Typesetter

Reserved for a future typesetting tool. It is visible in the sidebar but is not available yet. [English info drawer](app/_tools/design/typesetter/info.en.md)

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

## Configuration

Read `.env.example` for the current settings. At minimum, local use needs the login values, session secret, and OpenRouter key. Model names are settings so they can be changed without editing request code.

Stable instructions sent to OpenRouter live as readable Markdown in each app's `prompts/` folder. TypeScript adds only current user data and other values that change per request.

## Where to read next

- [architecture.md](architecture.md) explains folders, files, functions, dependencies, execution flows, remaining mixed responsibilities, and extension risks.
- [AGENTS.md](AGENTS.md) gives coding agents the exact working rules and checks for this repository.
- Every app's English and Czech `info.*.md` file is live UI content. Editing it changes the info drawer after the next page load.

## Repository layout

All source code for an app lives below `app/_tools/<category>/<app>/`. This keeps its interface, private server code, Markdown instructions, downloads, data, tests, and maintenance scripts together. `app/api/` contains only the small Next.js URL entry files that preserve browser-facing API addresses.

The exact, file-by-file developer inventory is maintained in [architecture.md](architecture.md). It also identifies generated and local-only folders such as `.next/`, `node_modules/`, and `tmp/`, which are not source code to edit.
