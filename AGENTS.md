# Repository rules for coding agents

## Read first

1. Read `README.md` for product behavior.
2. Read `architecture.md` for ownership, flows, and known problems.
3. Check `git status --short` before editing. The worktree may contain user changes; never discard them.

README is not enough for an agent. It explains the product to a person, but it does not define protected file formats, ownership rules, or the checks required before a code change is complete. This file supplies those operational rules.

## Ownership

- Put app-specific code, data, downloads, scripts, tests, and info copy under `app/_tools/<sidebar-category>/<app>/`.
- Keep `app/api/**/route.ts` thin. Put the handler implementation in the owning app folder.
- Declare Next.js route settings such as `dynamic`, `runtime`, and `revalidate` directly in `route.ts` as literal values. Next.js cannot statically read them through a re-export.
- Put code in `app/_tools/image/shared/` only when at least two image apps use it.
- Do not add app-specific prose to `app/content/ui.ts` when it belongs in an info drawer.
- `info.en.md` and `info.cs.md` are live application content, not duplicate documentation.
- `app/_tools/design-manual/manual.en.md` and `manual.cs.md` are the live Design Manual sources. Keep their image paths relative to `design-manual/images/`.
- `app/_tools/design-manual/changelog.md` is appended to both generated manual PDFs. Run `npm run manual:pdf` after changing the manual or changelog.
- Keep stable OpenRouter instructions in the owning app's `prompts/*.md` files. Server code should add only changing request data.
- Keep stable public URLs when moving a download. The current `public/` links point to app-owned files.

## Protected behavior

- Preserve existing user-visible output unless the task explicitly changes it.
- Solutions Importer emits only `indesign-solutions-v2`. Both downloadable JSX files accept that same format.
- Keep the Simple importer limited to direct coordinate-based text frames. Table detection, answer-box alignment, and continuation logic belong only in Advanced.
- When Advanced fails, user-facing guidance must point to Simple as the more failsafe fallback.
- PDFs processed by the Index Creator and Solutions Importer must remain local as documented.
- Do not expose OpenRouter or session secrets to client components.
- Map timeline output must remain deterministic for the same data, year, settings, and code.
- Preserve the current download names and public URLs unless migration is part of the task.

## Code style

- Use TypeScript for application code and explicit types at file boundaries.
- Prefer small functions and plain objects. Add a shared abstraction only when current code has real repeated behavior.
- Keep CSS handwritten. Do not add Tailwind or utility-class generation.
- Add new CSS under a clear section comment in `app/globals.css`; split a section into an app stylesheet only when import order and screenshots are verified.
- Use the existing bilingual UI pattern. New visible text needs English and Czech unless the task says otherwise.
- Use the existing `appRegistry` as the single sidebar order and availability source.

## InDesign files

- `.jsx` files run in Adobe ExtendScript, not modern browser JavaScript. Do not add unsupported syntax.
- Test format checks in Node, but treat them as incomplete. Changes to placement, tables, layers, styles, swatches, coordinates, or undo behavior need a real InDesign fixture run.
- Work on copies of InDesign documents during manual tests.

## Required checks

Run after code changes:

```bash
npm run lint
npm test
```

For figure-only work, `npm run test:figures` is useful during development, but run the full checks before finishing.

For UI or CSS changes, also start `npm run dev` and check the affected screen at desktop and narrow widths. Check the info drawer in English and Czech. Check browser console and network errors.

## Do not

- Do not edit `next-env.d.ts` or `package-lock.json` by hand.
- Do not commit `.env.local`, generated `.next/` output, or private source documents.
- Do not duplicate the Cliopatria timeline or other large datasets.
- Do not remove licences or source notes when moving datasets.
- Do not delete an apparently unused file until references, build behavior, and deployment use have been checked.
