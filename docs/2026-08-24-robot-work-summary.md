# Robot development summary — 24 August 2026

## Project and interface

- Renamed the product from Automat to **Taktik Robot** across application metadata, authentication screens, documentation, and user-facing copy.
- Added complete English and Czech UI copy for the Cover Generator and audited matching translation keys.
- Added a bilingual connection status with five playful references to Karel Čapek's *R.U.R.*; the phrase is selected once per full page load.
- Brought the Cover Generator into the visual system used by the other Robot modules, including the light/dark grid background, typography, spacing, green section labels, orange accents, and a simplified working header after generation begins.
- Refined the initial state with the shared Robot crosshair and a larger, unboxed instruction.

## Cover Generator workflow

- Added three reference-cover slots and validation requiring at least two and at most three PNG, JPEG, or WebP files.
- Fixed multi-file reference selection and centered the remove controls on reference thumbnails.
- Added **Ignore text in reference images**, with explanatory copy covering titles, grade labels, publisher logos, and other source text.
- Added separate **Generate 2** and **Generate 4** actions and connected both batch sizes through the generation API.
- Added style choices for matching references, photorealistic composites, illustration, and 3D rendering.
- Added two clearly labelled generation-quality modes:
  - Low quality, faster: `flux.2-klein-4b`, 512 px.
  - High quality, slower: `flux.2-pro`, 1K.
- Improved reference-aware prompts so the generator can follow photographic series references more closely while remaining versatile across styles.
- Added upvoting so a chosen concept becomes an extra reference for the next batch, while keeping the four-reference model limit intact.
- Added deletion, selection, numbering, and a lightbox with previous/next arrow navigation.
- Kept generated previews within the available viewport height instead of allowing them to expand beyond the workspace.

## Shutterstock research

- Added an optional Shutterstock Research checkbox.
- Added individual rows accepting either a search phrase or a direct Shutterstock URL.
- Added independent preview lookup and use of watermarked previews as generation references.
- Added source URLs to the downloadable Markdown report whenever Shutterstock material is used.
- Placed the licensing warning directly inside the Shutterstock section and made it appear only while research is enabled.

## Upscaling and automatic stems

- Replaced the production-asset manifest with a more approachable **Upscale & Separate Assets** workflow that appears only after a concept has been generated.
- The workflow automatically:
  1. detects important objects with `mistralai/mistral-small-2603`;
  2. recreates the selected cover as a 2K master with `flux.2-pro`;
  3. isolates, regenerates, and upscales the detected objects as separate 2K assets with `flux.2-pro`.
- Added an explicit stage-by-stage progress indicator at the bottom of the toolbar.

## Downloads and reporting

- Expanded the ZIP export to include generated concepts, the selected 2K master, separated assets, project metadata, and a Markdown generation report.
- The report records each generation task, model, seed, credits, Shutterstock sources, and known total credit usage.
- Added **Export Artboard PDF ↓** beside **Download ZIP ↓**. Both controls retain grey surfaces with matching orange shadows.
- Built a widescreen, print-friendly PDF artboard with the Robot light-mode grid, fixed-size cover cells in a 4 × 3 layout, centered partial rows, orange number boxes, soft shadows, and bottom-left Taktik Robot crosshair branding.
- Produced and visually checked example artboards containing 3, 7, 10, and 12 covers. The samples were saved to the requested Google Drive cover folder rather than committed to the repository.

## Verification

- Exercised the cover workflow with supplied biology-cover references, including standard generation, generation from an upvoted concept, selection, 2K recreation, and automatic stems.
- Researched and tuned FLUX.2 Klein/Pro prompting for stronger adherence to photorealistic references.
- Rendered every sample PDF to images and visually checked its composition and branding.
- Repeatedly ran the production build, TypeScript compilation, translation-key audit, and Git whitespace checks after the final UI changes.

## Repository snapshot

This commit also captures the current integrated Robot workspace, including the figure and map generation modules and their supporting datasets and evaluation material. Temporary local render output under `tmp/` is intentionally ignored.

## Local project cleanup

- Converted local development from the Vinext/Cloudflare worker runner to a conventional Next.js setup using `next dev`, while keeping all protected server-side API routes and application behavior.
- Removed unused Sites, Vinext, Cloudflare, Wrangler, Vite, Drizzle, D1 example, worker, and starter-preview infrastructure and pruned the corresponding packages.
- Cleared the old 1.2 GB Next build cache and temporary PDF QA renders. A fresh cache is regenerated automatically while the local server runs.
- Reduced the working folder from roughly 2 GB to under 1 GB with the active development cache present.
- Kept one repository copy of Cliopatria at `public/data/cliopatria-timeline.json`, removed the duplicate from `app/data`, and added a direct cached disk loader used by the timeline API.
- Moved static bilingual UI dictionaries out of `app/page.tsx` into `app/content/ui.ts` and moved design-manual JSON into `app/content/design-manual` without changing the rendered manual.
- Collected development notes under `docs/`, consolidated map evaluation material, replaced obsolete starter tests, and added regression coverage for the local runtime, content structure, and single Cliopatria source.
- Audited all icon and image assets. Retained the referenced favicon variants, Apple touch icon, Android manifest icons, and all 14 design-manual images; removed the unused Next.js starter icons `file.svg`, `globe.svg`, and `window.svg`.
- Verified the cleaned project with a production build, 22 automated tests, the Czech/English translation audit, lint with zero errors, and a successful local HTTP response.
