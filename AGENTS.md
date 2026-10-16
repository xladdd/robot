# Repository rules for coding agents

## Read first

1. Read `README.md` for product behavior and `architecture.md` for ownership, flows and validation.
2. Check `git --no-optional-locks status --short` before editing. Preserve all user/parallel-agent changes; never discard them.
3. Read `package.json`, `scripts/run-tests.mjs`, `scripts/test-ui.mjs`, the relevant root contract tests and the affected tool's test setup before changing behavior.

The API-safe baseline `1ee73a6` and v0.5 folder-registry restructure `bc8fe9e` are committed. Do not infer that the restructure is deployed. Do not commit, provision secrets, call management APIs or deploy unless explicitly authorized by the task.

## Ownership and generation

- Put tool-specific state, actions, effects, diagnostics, code, data, downloads, scripts, tests and copy under `app/_tools/<category>/<tool>/`. `Tool.tsx` and owned controller files contain state; `Workspace.tsx` remains a small shell composing Header, Sidebar, Clock, InfoDrawer, ToolHost and the separate Design Manual reference.
- `app/_tools/types.ts` owns `ToolProps` and `ToolManifest`. Respect `language`, `active`, nullable `section`, `label`, optional `onDiagnostics` and optional manuals.
- `appRegistryEntries` in `registry.ts` owns only ordered `id/category/folder/available/hidden` entries. Each tool's `manifest.ts` is pure data for bilingual labels, status, routes, assets, feature flags and its dedicated OpenRouter environment name.
- Preserve existing release `hidden` and `available` flags and the user's five alpha status assignments. Hidden is navigation visibility, not access control; availability is independent.
- **Never manually edit generated files.** Run `npm run tools:generate`, then `npm run tools:check`. Commit generated outputs with their source when a commit is requested: `generated/registry.data.ts`, `registry.client.tsx`, `registry.models.ts`, `assets.json`, native API adapters and declared public asset symlinks.
- Adding a tool requires an owned folder, typed manifest, `Tool.tsx`, both info languages, tests and one registry entry. Do not hand-register lazy imports, model-map keys, OpenRouter keys, assets or route adapters. Follow the typed LocalExample in `architecture.md`.
- Native route adapters are thin generated exports. Declare static `dynamic`, `runtime`, `revalidate` and `maxDuration` settings in manifests so generation emits literal values; Next.js cannot read these through re-exports. Keep auth/feedback ownership and `/api/figures` compatibility unchanged.
- Model-backed tools use canonical owned `model-definitions.ts` for actual defaults, environment precedence and failure fallbacks. Handlers and live info share them. Model environment resolution and generated explicit model imports are server-only; never use runtime path/import magic or maintain a competing old model table.
- Keep stable OpenRouter instructions in owned `prompts/*.md`; server code adds changing request data. Preserve deployment tracing of these files.
- Do not create category-wide abstractions by default. Extract a small shared utility only for identical, tested behavior in at least two tools without pulling unrelated data/model logic into either.
- Keep tool prose out of `app/content/ui.ts`. `info.en.md` and `info.cs.md` are live content; resolved model details are appended as prose within “How does it work?” by the server loader. Keep exactly two localized sections (“What is this?” and “How does it work?”), with only the general drawer adding its version.
- Manual chapter sources are `design-manual/manual.en.md` and `manual.cs.md`; retain relative `images/` paths. Run `npm run manual:pdf` after manual/changelog changes; the changelog is appended to both editions. PDF export currently needs macOS Verdana paths (configure them for other platforms).
- Stable public URLs derive from manifest assets pointing to owned files. Preserve symlinks and Vercel build materialization; do not duplicate downloads or datasets.

## Lifecycle and diagnostics

- `ToolHost` lazy-loads on first visit and retains complete mounted subtrees under stable keys. Do not replace this with unmount-on-switch or move tool state back into the shell.
- Inactive subtrees are hidden/inert. Gate global keyboard/paste/listener effects, overlays and portals with `active`; inactive tools must not capture input. Running jobs may finish while away.
- Switching tools retains session state; refreshing resets it except explicitly designed durable tool memory (for example Concept Illustrator IndexedDB). Do not add broad persistence implicitly.
- Report only allowlisted `ToolDiagnostics` through optional `onDiagnostics`. Feedback must use the selected tool's safe summary, never arbitrary React state or inactive tools' summaries.
- Never serialize uploaded contents, extracted text, prompts, generated output, cookies or credentials into diagnostics. The feedback server validates the signed session independently and derives the username server-side.

## Protected behavior and privacy

- Preserve user-visible output, API contracts, schemas, download names and public URLs unless the task explicitly migrates them.
- Solutions emits only `indesign-solutions-v2`. There is **one canonical JSX**, `/solutions/import_solutions.jsx`, with two ScriptUI strategies, not two downloadable importers.
- Keep Simple limited to direct coordinate-based text frames. Table detection, answer-box alignment and continuation logic belong only in Advanced. When Advanced fails, point users to Simple as the more failsafe fallback.
- Preserve Solutions workers and compatibility URLs, including `/solutions-beta/*`.
- Preserve Typesetter's `indesign-typesetter-v1`, labelled threaded story, real template paragraph styles, source preservation and unanchored image-request frames for manual placement.
- Index Creator and Solutions PDF processing remain local as documented. Do not claim all PDF tools are local: Text Extractor sends model input and Prompt Extractor sends rendered page images. Layer Splitter keying/PSD assembly is server-side, not browser-local.
- Map output remains deterministic for identical data/year/settings/code. Preserve local-only behavior and legacy generation rejection.
- Never expose OpenRouter, Asana, session or management secrets to clients or `NEXT_PUBLIC_` variables. Preserve content-free pseudonymous OpenRouter usage logging.
- OpenRouter configuration derives from generated manifest metadata. Preserve all 12 existing dedicated environment names and `DEV/<folder-slug>` / `DEPLOY/<folder-slug>` remote names. Dedicated values win over the legacy shared fallback; remove that fallback only after all dedicated variables are present.
- Provisioning is an explicit external operation, not generation. New secrets require DEV and DEPLOY provisioning, secure Vercel environment upload and a fresh redeploy. Never print secrets or silently replace orphan remote keys.
- The existing Vercel project is `taktik-robot`, using DEPLOY for Production and Preview; the duplicate `robot` was previously deleted. Do not claim the restructure is deployed or change this configuration incidentally.
- Never deploy `.env.openrouter-management.local` or its credential. DEV values belong in ignored `.env.local`; DEPLOY values in ignored `.env.openrouter-deploy.local` (not auto-loaded); secret files use permission `0600`.

## Code style and Adobe validation

- Use TypeScript with explicit boundary types, small functions and plain objects. Prefer existing dependencies and patterns.
- Keep CSS handwritten; no Tailwind or utility generation. Add clear sections in `app/globals.css`. Stylesheet splitting is outside this migration and requires verified import order and screenshots when separately requested.
- New visible copy needs English and Czech using existing bilingual patterns.
- `.jsx` runs in Adobe ExtendScript, not modern browser JavaScript; do not introduce unsupported syntax.
- Node format/contract tests are incomplete for InDesign. Changes to placement, tables, layers, styles, swatches, coordinates or undo require real InDesign fixture validation on **copies** of documents.

## Required checks

Node.js 22.13 or newer is required. After code changes:

```bash
npm run tools:check
npm run lint
npm test
```

Generation runs through `predev`, `prebuild`, `pretest` and `preopenrouter:*`; builds also materialize public links for Vercel. Generated output must be current and reviewed, not hand-patched to pass checks.

`npm test` builds production and runs automatic canonical discovery via `scripts/run-tests.mjs`: `*.test.mjs`, `*.test.mts`, `*.test.ts` in root tests and tool-owned tests, excluding fixtures/dependencies. Add tests in their canonical ownership location, not another manual enumeration.

`npm run test:figures` is useful during figure development but does not replace full checks. For UI changes, run `npm run test:ui`, which invokes `scripts/test-ui.mjs` with desktop/narrow fixtures in an isolated Next.js process using synthetic authentication, without real credentials or external AI calls. For UI/CSS, also verify desktop/narrow widths, English/Czech drawers, browser console/network errors, lazy first visit, retained state, inactive listeners/overlays, jobs finishing away and refresh behavior. Report exactly what ran and passed; never claim unperformed validation.

## Do not

- Do not hand-edit `next-env.d.ts`, `package-lock.json`, generated registry/adapter/asset files, `.next/` or dependency code.
- Do not commit secrets, ignored environment files, `.next/`, private source documents or temporary inspection output.
- Do not duplicate Cliopatria or other large datasets. Preserve licences and source notes in `app/_tools/image/map-generator/code/data/` and other owning folders.
- Do not delete apparently unused files until references, tests, build and deployment use have been checked.
- Do not fix unrelated failures or overwrite parallel work. For documentation-only tasks, do not run generation/builds that write other files; use read-only checks and disclose validation limits.
