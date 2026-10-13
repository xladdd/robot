# Taktik Robot

Taktik Robot is a private, bilingual workspace for preparing textbook text, artwork and Adobe InDesign inputs. Tools have distinct workflows and output formats; some process files locally, while AI tools use authenticated server endpoints and OpenRouter. Not every implemented tool is released in the sidebar.

## Tools

| Tool                                                                   | Current workflow                                                                                                                                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Text Extractor](app/_tools/text/text-extractor/info.en.md)            | Model-backed OCR of images or short PDFs, followed by editable text and optional instructed correction.                                                                                              |
| [Index Creator](app/_tools/text/index-creator/info.en.md)              | Reads textbook PDFs and runs sparse-page OCR locally; AI supplies grammatical term forms. Exports a tab-separated index with printed page numbers.                                                   |
| [Prompt Extractor](app/_tools/text/prompt-extractor/info.en.md)        | Renders manuscript PDF pages locally and sends page images for AI illustration-prompt analysis.                                                                                                      |
| [Map Maker](app/_tools/image/map-generator/info.en.md)                 | Deterministic editable SVG maps from owned historical and present-day datasets, with layer and palette controls.                                                                                     |
| [Diagram Generator](app/_tools/image/diagram-generator/info.en.md)     | Model-backed biological diagrams with checked editable SVG output and verification reports.                                                                                                          |
| [Graph Generator](app/_tools/image/graph-generator/info.en.md)         | Editable charts from a prompt and supplied data; CSV/Excel import is local.                                                                                                                          |
| [Image Generator](app/_tools/image/image-generator/info.en.md)         | Queues up to 15 square images, with optional references, retries and generative upscaling. Prompt-document import is local; generation is server-backed.                                             |
| [Cover Generator](app/_tools/image/cover-generator/info.en.md)         | Plans and generates one, two or four distinct text-free cover-art directions for later typography and layout.                                                                                        |
| [Concept Illustrator](app/_tools/image/concept-illustrator/info.en.md) | Proposes three editorial metaphors, then generates and revises a selected illustration. Explicit project and house-style memory uses browser-local IndexedDB.                                        |
| [Layer Splitter](app/_tools/image/layer-splitter/info.en.md)           | Reconstructs an image into complete background/foreground objects using OpenRouter; keying and layered PSD assembly run on the server, not locally in the browser.                                   |
| [GREP Builder](app/_tools/design/grep-builder/info.en.md)              | Converts plain Find/Change instructions into InDesign GREP strings, using deterministic handling where supported and AI otherwise.                                                                   |
| [Cover Splitter](app/_tools/design/cover-splitter/info.en.md)          | Locally splits PDF outside covers into vector front/back panels, with optional inside panels and requested PNG/JPG exports.                                                                          |
| [Solutions Importer](app/_tools/design/solutions-importer/info.en.md)  | Locally compares clean/annotated PDFs and IDML, then exports reviewed `indesign-solutions-v2` JSON. One canonical `/solutions/import_solutions.jsx` offers Advanced and Simple placement strategies. |
| [Script Buffet](app/_tools/design/script-buffet/info.en.md)            | Filterable Adobe script downloads and installation guidance, with browser-local counters.                                                                                                            |
| [Barcode Generator](app/_tools/design/barcode-generator/info.en.md)    | Locally validates ISBN-10/13 and produces a print-ready vector EAN-13 PDF.                                                                                                                           |
| [Typesetter](app/_tools/design/typesetter/info.en.md)                  | Inventories DOCX/IDML locally, uses AI for controlled semantic roles, and exports reviewed `indesign-typesetter-v1` JSON and an importer. Layout and image placement still need designer review.     |
| [Style Trainer](app/_tools/design/style-trainer/info.en.md)            | Refines a reusable style prompt through reference analysis, seeded image rounds and voting; a reviewed style request can be submitted to Asana.                                                      |

Each tool's English and Czech `info.*.md` is live drawer content. Model sections are appended inline from canonical tool-owned model definitions and server-resolved settings; there is no separate model table to maintain here.

The [Design Manual](app/_tools/design-manual/manual.en.md) uses local English/Czech Markdown and images. The Brand Manual link opens the existing external document.

## Run locally

Requirements: **Node.js 22.13 or newer**.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Configure the documented login/session settings and any required private inference values using `.env.example`; never expose secrets through `NEXT_PUBLIC_` variables.

```bash
npm run tools:generate # regenerate committed registry/adapters/assets
npm run tools:check    # check generated drift without writing
npm run lint
npm test
npm run test:ui        # isolated browser fixtures
```

Generation runs before development, builds, tests and OpenRouter maintenance commands. `npm test` builds production and runs automatic canonical-test discovery through `scripts/run-tests.mjs`. `npm run test:ui` runs `scripts/test-ui.mjs` with desktop and narrow browser fixtures in an isolated Next.js process, without real credentials or external AI calls. See [architecture.md](architecture.md) for test ownership and validation rules.

### Design Manual PDF downloads

```bash
npm run manual:pdf       # both languages
npm run manual:pdf -- en # English only
npm run manual:pdf -- cs # Czech only
```

The exporter reads `app/_tools/design-manual/manual.en.md`, `manual.cs.md`, `images/` and the shared `changelog.md`, then writes PDFs to that tool's `public/` folder. PDFKit and Markdown parsing provide a separate print layout, not a browser screenshot. It currently uses macOS Verdana paths; configure font paths in `app/_tools/design-manual/scripts/export-pdf.mjs` for Windows/Linux. Regenerate after editing the manual or changelog.

## Release and folder registry

`app/_tools/registry.ts` owns ordered `appRegistryEntries`: ID, category, folder, availability and visibility only. Each tool's pure-data `manifest.ts` owns bilingual labels, status, feature flags, routes, public assets and its OpenRouter environment-variable name. Preserve release flags and the user's five alpha status assignments.

`hidden` removes a sidebar entry, not the deployed implementation or API access. `available: false` independently gives a visible entry disabled/coming-soon behavior. Empty hidden categories are omitted. The Design Manual is a separate reference tool.

Tools live in `app/_tools/<category>/<tool>/`, including their `Tool.tsx` controller, interface, code, prompts, tests, downloads and drawer copy. Generated registry data, lazy imports, server-only model imports, native adapters and asset mappings are committed outputs, not handwritten installation steps. See the typed local-tool example in [architecture.md](architecture.md).

Tools load on first visit and keep their mounted subtrees while switching. Inactive tools are hidden/inert and must gate global input and overlays; jobs may finish while away. Refresh clears ordinary session state, except explicit tool memory such as Concept Illustrator IndexedDB.

## Private services and deployment

Each of the 12 AI-backed tools retains its existing dedicated server-only OpenRouter variable. Generated manifest metadata drives configuration; remote key names remain `DEV/<product-folder-slug>` and `DEPLOY/<product-folder-slug>`. DEV and DEPLOY use the same runtime variable names with different secret values.

| Ignored local file                 | Purpose                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `.env.local`                       | DEV inference values, loaded by Next.js.                                    |
| `.env.openrouter-deploy.local`     | DEPLOY inference values, permission `0600`; not auto-loaded by Next.js.     |
| `.env.openrouter-management.local` | Local-only management credential and provisioning defaults; never deployed. |

OpenRouter provisioning/rename/verification commands, limit inheritance, orphan-key handling and all 12 preserved variable names are documented in [architecture.md](architecture.md). New secrets still need explicit DEV/DEPLOY provisioning, secure Vercel environment upload and a fresh redeploy. Generation never provisions or deploys automatically.

The existing Vercel project is `taktik-robot`, using DEPLOY values for **Production and Preview**. The duplicate `robot` project was deleted in the previous operation. The API-safe baseline `1ee73a6` is already committed; this documentation does **not** claim that the registry restructure has been deployed.

`OPENROUTER_API_KEY` remains a legacy fallback when a dedicated variable is missing. Remove it only after every dedicated key is configured in the relevant environment; otherwise affected requests return HTTP 503. Usage logs contain pseudonymous attribution and operational/token/cost metadata, not prompts, files or output.

Feedback and Style Trainer use server-only Asana configuration from `.env.example`. Feedback sends an allowlisted summary of the selected tool, never arbitrary tool state or uploaded contents. `npm run feedback:section` discovers the configured section membership after a temporary task is placed there; it writes only the section GID locally. Never deploy management credentials or expose Asana/session/inference secrets to the browser.

## Further reading

- [architecture.md](architecture.md): ownership, generation, installation example, lifecycle, privacy boundaries, protected formats, stable assets, licences and validation.
- [AGENTS.md](AGENTS.md): mandatory working rules and checks for coding agents.
- Tool-owned `info.en.md` and `info.cs.md`: current user instructions and live model information.

Keep CSS handwritten; global stylesheet splitting is not part of this restructure. Adobe importer changes require real InDesign validation on document copies; Node tests alone cannot prove layout correctness.
