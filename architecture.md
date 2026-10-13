# Architecture

Taktik Robot is one authenticated Next.js application with browser-local publishing tools and private server endpoints. This guide describes the folder-registry integration in the worktree; it is not a deployment report. The API-safe baseline was committed as `1ee73a6`. The registry restructure does not itself provision secrets or deploy anything.

## Ownership and layout

```text
app/
  page.tsx                      server content loading
  Workspace.tsx                 completed shared shell (a few hundred formatted lines)
  _components/                  Header, Sidebar, Clock, InfoDrawer, ToolHost, feedback
  _feedback/                    validated diagnostics and server-only Asana client
  _tools/
    types.ts                    ToolProps and ToolManifest contracts
    registry.ts                 ordered release entries and compatibility helpers
    models.ts                   model definition types and Markdown formatting
    models-server.ts            environment resolution, server-only
    info.ts                     live bilingual drawer loader, server-only
    generated/                  committed generator outputs; never hand-edit
    <text|image|design>/<tool>/
      manifest.ts               pure-data metadata
      Tool.tsx                  owner of state, actions, effects and diagnostics
      MainInterface.tsx         tool presentation, where useful
      copy.ts                   bilingual tool UI copy
      model-definitions.ts      canonical model stages, for model-backed tools
      code/                     browser helpers and private server implementation
      prompts/                  stable model instructions in Markdown
      public/                   owned downloads and workers
      tests/                    canonical tool regressions
      scripts/                  maintenance and evaluation
      info.en.md, info.cs.md     live drawer prose
    design-manual/              separate reference tool, Markdown, images, PDF exporter
    openrouter/                 shared private inference and key-management support
  api/**/route.ts                native generated adapters; auth/feedback/compat exceptions
  content/                      shared shell copy and Czech namedays
  lib/auth.ts                   signed sessions and credential checks
  globals.css                   handwritten global styles
scripts/                        generation, public-link materialization, test discovery
public/                         shared browser assets and tool-owned asset symlinks
tests/                          cross-tool contracts
```

The underscore makes `_tools` private to Next.js routing. This ownership scheme scales to a 201-folder layout without adding a central file-by-file inventory: a tool's implementation, prompts, tests, downloads and documentation travel together. Do not introduce category-wide abstractions merely because two tools share a category; extract only small, identical, tested behavior that does not pull unrelated data or models into a tool.

The shell split is complete: `Workspace.tsx` is now a few hundred formatted lines rather than the former 2,816-line controller. The shell composes `WorkspaceHeader`, `WorkspaceSidebar`, `WorkspaceClock`, `InfoDrawer`, `ToolHost`, and the separate Design Manual `Tool` reference. All 17 registered tools own their state and controllers in their own folders, not in `Workspace.tsx`. `app/content/ui.ts` contains shell copy, not tool prose. Handwritten global CSS stays in place; stylesheet splitting is outside this migration.

## Registry: source versus generated output

`appRegistryEntries` in `app/_tools/registry.ts` contains only `id`, `category`, `folder`, `available`, and `hidden`. Its order controls navigation. Each of the 17 tool folders supplies a pure-data `manifest.ts`, typed with `ToolManifest`, for bilingual labels, status, feature flags, routes, assets and the dedicated OpenRouter environment-variable name.

- `hidden: true` removes navigation, not implementation or API access. Empty hidden categories disappear.
- `available: false` independently gives visible tools the disabled/coming-soon behavior.
- Release visibility, availability and the user's five alpha status assignments are protected release policy. Do not normalize or infer statuses from implementation readiness; preserve the user's assignments.

`scripts/generate-tools.mts` validates folder ownership and declarations, then produces:

| Committed output                           | Responsibility                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `app/_tools/generated/registry.data.ts`    | public metadata and OpenRouter app descriptors (names, never secret values) |
| `app/_tools/generated/registry.client.tsx` | explicit lazy imports of every registered `Tool.tsx`                        |
| `app/_tools/generated/registry.models.ts`  | server-only model map with explicit static imports                          |
| `app/_tools/generated/assets.json`         | stable public asset mappings                                                |
| 15 native `app/api/**/route.ts` adapters   | handler exports and literal Next.js settings from manifests                 |
| declared `public/` symlinks                | stable URLs pointing to owned source assets                                 |

Next.js needs statically visible literal route settings: `dynamic`, `runtime`, `revalidate` and `maxDuration` come from manifests and are emitted directly in adapters, not re-exported. The compatibility `/api/figures` dispatcher remains unchanged, as do the existing API contracts. Authentication and feedback are shared infrastructure, not tool installation entries.

Use `npm run tools:generate` after source changes; `npm run tools:check` checks drift without writing. Generated outputs are committed and reviewed alongside their sources. Never hand-edit generated registration, adapters, model maps or asset manifests. Generation runs through `predev`, `prebuild`, `pretest`, and the `preopenrouter:*` maintenance hooks. `prebuild` also materializes public links for Vercel.

## Installing a tool

Start with a local-only tool; no route or key registration is necessary. For example, create `app/_tools/design/local-example/`:

```tsx
// Tool.tsx
"use client";
import type { ToolProps } from "../../types";

export default function LocalExample({ language, label }: ToolProps) {
  return (
    <section aria-label={label}>
      <h1>{label}</h1>
      <p>{language === "cs" ? "Místní příklad." : "Local example."}</p>
    </section>
  );
}
```

```ts
// manifest.ts — handwritten source, not a generated file
import type { ToolManifest } from "../../types";

export default {
  label: { en: "Local Example", cs: "Místní příklad" },
  routes: [],
  assets: [],
} satisfies ToolManifest;
```

Add this fully typed entry to the existing `appRegistryEntries` array (do not replace the array):

```ts
const localExampleEntry = {
  id: "localExample",
  category: "design",
  folder: "design/local-example",
  available: true,
  hidden: true,
} as const satisfies {
  id: string;
  category: "text" | "image" | "design";
  folder: string;
  available: boolean;
  hidden: boolean;
};
// Insert the object above into appRegistryEntries at the intended sidebar position.
```

Provide `info.en.md`, `info.cs.md` and tests under `tests/`; add bilingual `copy.ts` when needed. `ToolProps` includes `language`, `active`, `section: string | null`, `label`, optional `onDiagnostics`, and optional parsed manuals. Keep component state in `Tool.tsx` or tool-owned controller files.

For a server-backed extension, declare routes with an owned handler path and HTTP methods; put static route settings in the manifest. For downloads, declare `{ source, publicPath }` assets. For AI, add `openRouter: { envName: "..." }` and canonical `model-definitions.ts`; handlers must consume those definitions. Run generation and drift checks, inspect outputs, then run the relevant tests and full checks. **Do not** manually add adapters, client imports, asset links or OpenRouter key-map entries. A new secret still requires explicit DEV and DEPLOY provisioning, explicit Vercel environment upload and a fresh deployment; generation cannot do that.

## Lifecycle and execution flows

1. `proxy.ts` and `app/lib/auth.ts` enforce signed sessions for protected pages and APIs.
2. `app/page.tsx` loads live bilingual info and parsed manual content server-side.
3. `ToolHost` lazy-loads a tool on its first visit, then retains its entire mounted subtree under a stable key. Switching tools hides and makes inactive subtrees inert; it does not reset their controllers.
4. `active` must gate global listeners, keyboard/paste handlers, overlays and other foreground-only effects. Hidden tools must not capture input or display portals. Running jobs can finish while the user is away.
5. Local processing stays in the browser; private requests use stable `/api/...` addresses and owned server handlers. Results return for review, copying and download.
6. Refresh resets ordinary tool state. Explicit tool memory is an exception, such as Concept Illustrator's browser-local IndexedDB projects and house-style profile; retained mounting is not durable persistence.

Representative privacy and output boundaries:

- Text Extractor sends supplied images/PDF input to private model-backed OCR and correction endpoints.
- Index Creator reads PDF text and sparse-page OCR locally; the model receives requested terms for grammatical forms, not PDF pages.
- Prompt Extractor renders manuscript pages locally, then sends page images for model analysis.
- Map Maker uses owned local historical/present-day datasets and deterministic timeline rendering. The legacy model-generation URL returns `410 Gone`. Graph and Diagram use model-backed specification generation and owned validation/rendering.
- Image, Cover and Concept tools use private model requests; Concept's explicit project memory is local, not a server database.
- Layer Splitter performs scene analysis/reconstruction with OpenRouter and server-side keying/PSD assembly. Do not describe PSD assembly as browser-local.
- Cover Splitter, Barcode and Solutions perform their documented file processing locally. Solutions produces reviewed JSON for a local InDesign importer.
- Typesetter inventories DOCX/IDML locally and sends its controlled semantic classification input to AI; it exports reviewed JSON, not an automatically finished InDesign layout.
- Style Trainer uses model-backed prompt/test rounds; submitting a reviewed style request is an explicit Asana action. Script Buffet is a download catalog with local counters.

Detailed current behavior belongs in each tool's live info drawer and tests, not a second exhaustive inventory here.

## Models and live info

The canonical source is each model-backed tool's `model-definitions.ts`: the integrated registry covers 35 model stages, including actual server defaults, environment precedence and failure fallbacks. Request code and drawer documentation share these definitions. Do not maintain a separate historical model table or hardcode a competing list in Markdown.

`models-server.ts` resolves configured model values only on the server. The generated `registry.models.ts` uses explicit imports, never runtime path construction/import magic. `info.ts` loads `info.en.md`/`info.cs.md` and appends the resolved model sections inline in both languages. No inference key or arbitrary environment value is exposed. Stable instructions remain in tool-owned `prompts/*.md`; TypeScript adds changing request data. Ensure prompt files remain included in deployed server tracing (`next.config.ts`).

## Privacy, authentication and external services

Feedback accepts only an allowlisted diagnostic summary for the **selected tool** plus shell/browser metadata and the user's description. Do not serialize arbitrary component state, inactive tool summaries, uploaded contents, extracted text, prompts, outputs, cookies or credentials. The server validates the signed `ta_session` cookie independently and derives the username there.

`app/_feedback/asana.ts` owns server-only OAuth refresh, short-lived token caching and task creation/retry. Its `ASANA_*` configuration must never use `NEXT_PUBLIC_`. The scoped account cannot list empty sections; `npm run feedback:section` discovers configured membership after a temporary task has been placed in the exact section. Style requests share this client but submit only reviewed style fields, not reference or generated images.

OpenRouter runtime configuration is derived from generated manifest metadata through `app/_tools/openrouter/config.ts`. Preserve all 12 existing dedicated runtime names:

```text
OPENROUTER_TEXT_EXTRACTOR_API_KEY       OPENROUTER_INDEX_CREATOR_API_KEY
OPENROUTER_GRAPH_GENERATOR_API_KEY      OPENROUTER_DIAGRAM_GENERATOR_API_KEY
OPENROUTER_COVER_GENERATOR_API_KEY      OPENROUTER_CONCEPT_ILLUSTRATOR_API_KEY
OPENROUTER_LAYER_SPLITTER_API_KEY       OPENROUTER_IMAGE_GENERATOR_API_KEY
OPENROUTER_STYLE_TRAINER_API_KEY        OPENROUTER_GREP_BUILDER_API_KEY
OPENROUTER_PROMPT_EXTRACTOR_API_KEY     OPENROUTER_TYPESETTER_API_KEY
```

Remote names remain `DEV/<product-folder-slug>` and `DEPLOY/<product-folder-slug>`, not internal IDs or translated labels. `.env.local` holds DEV inference values and is loaded by Next.js. `.env.openrouter-deploy.local` holds DEPLOY values under the same names, is ignored with permission `0600`, and is not auto-loaded. `.env.openrouter-management.local` holds only local management credentials/defaults; never deploy it.

```bash
npm run openrouter:rename-dev -- --dry-run
npm run openrouter:rename-dev -- --apply
npm run openrouter:provision -- --target dev --dry-run
npm run openrouter:provision -- --target dev
npm run openrouter:provision -- --target deploy --dry-run
npm run openrouter:provision -- --target deploy
npm run openrouter:verify
```

These are external maintenance operations, not part of normal generation/testing. Rename defaults to dry-run and preserves secret values, limits and usage. Provisioning requires an explicit target, retains configured keys, and saves new plaintext immediately without printing it. DEV limits use configured management defaults; DEPLOY inherits the matching DEV key's limit/reset/BYOK settings. Complete DEV first. A remote key with no locally recoverable secret is an orphan and must be resolved explicitly, not silently replaced.

The existing Vercel project is `taktik-robot`, using DEPLOY inference values for both Production and Preview. The duplicate `robot` project was deleted in the previous operation. This is existing operational context, **not** evidence that the folder restructure has been deployed. New/changed secrets require an explicit secure upload and fresh redeploy in the intended environments; remote renaming alone changes no runtime routing.

The dedicated variable wins over legacy `OPENROUTER_API_KEY`; missing dedicated values use that fallback and log a warning. Remove the shared fallback only after all dedicated variables are present, otherwise missing-key requests return HTTP 503. Runtime attribution uses a stable pseudonymous authenticated-user identifier. `[openrouter-usage]` logs contain operation, model, generation ID, status, tokens and cost, never prompts, files or model output.

## Protected contracts, assets and sources

- Solutions emits only `indesign-solutions-v2`. `/solutions/import_solutions.jsx` is **one canonical JSX with two strategies** chosen in ScriptUI: Advanced layout-aware placement and Simple direct PDF-coordinate placement. Keep table detection, answer-box alignment and continuation logic in Advanced only; Simple is the more failsafe fallback. Preserve workers, schema, filenames and `/solutions-beta/*` compatibility assets.
- Typesetter preserves `indesign-typesetter-v1`, one labelled threaded story, real template paragraph styles, source content and unanchored image-request frames for manual placement.
- Preserve stable download names/URLs, deterministic Map output, existing local-only PDF boundaries, validation and user review steps.
- ExtendScript is not modern browser JavaScript. Node contract tests cannot validate InDesign placement, tables, layers, styles, swatches, coordinates or undo. Changes to those require manual fixture validation in real InDesign, always on copies.

Public URLs derive from declared manifest assets; tracked symlinks point to owned files. `scripts/materialize-public-links.mjs` makes disposable copies in Vercel's build workspace to avoid self-copy issues. Preserve `/cover-splitter/*`, `/solutions/*`, `/typesetter/*`, `/script-buffet/*`, `/design-manual/media/*`, `/design-manual/downloads/*` and `/data/cliopatria-timeline.json`. Shared icons and PDF.js assets remain directly in `public/`.

Map datasets and their licence/source notes live in `app/_tools/image/map-generator/code/data/`; data preparation/evaluation scripts live beside the tool. Do not duplicate Cliopatria or remove attribution/licences when moving data. Other tool downloads, source notes and maintenance scripts remain in their owning folders.

The Design Manual sources are `app/_tools/design-manual/manual.en.md`, `manual.cs.md`, `changelog.md` and relative `images/` assets. `npm run manual:pdf` (optionally `-- en` or `-- cs`) uses `scripts/export-pdf.mjs` in that folder, PDFKit and remark parsing to write owned bilingual PDF downloads. Its print layout is separate from the React renderer. Export currently depends on macOS Verdana font paths; configure paths before exporting on Windows/Linux. Regenerate PDFs after manual/changelog changes.

## Checks and validation

Node.js **22.13 or newer** is required for the project's native type-stripping and environment-file commands. Read `package.json`, `scripts/run-tests.mjs`, root tests and the affected tool's tests before changing behavior.

```bash
npm run tools:check
npm run lint
npm test
npm run test:ui
```

`npm test` builds production and then runs `scripts/run-tests.mjs`, which automatically discovers canonical `*.test.mjs`, `*.test.mts` and `*.test.ts` files in root `tests/` and tool-owned `tests/` directories, excluding fixtures and dependencies. Do not add another hand-maintained test enumeration.

`npm run test:ui` runs `scripts/test-ui.mjs`: desktop and narrow browser fixtures use an isolated Next.js process with synthetic authentication, no real environment credentials and no external AI calls. The suite checks released tools and a sandbox-only hidden-tool harness; it is separate browser validation, not a deployment or live-model verification.

For UI/CSS, verify desktop/narrow layouts, English/Czech drawers, browser console/network errors, first-visit loading, retained subtree state, inactive input/overlay isolation, jobs finishing away and refresh semantics. Figure-specific tests are useful during development but do not replace full checks. `.next/`, `node_modules/`, `tmp/` and generated declarations are not handwritten source.
