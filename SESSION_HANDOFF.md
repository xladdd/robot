# Session handoff — map generator

Last updated: 2026-08-14 (Europe/Prague)

## Current product direction

The original AI-first figure generator has been split into separate sidebar apps: Map Generator, Diagram Generator, and Graph Generator. The old Bio Generator label was replaced by Diagram Generator. The Map Generator is now primarily a deterministic, interactive world map rather than an LLM drawing SVG geography. It supports panning, zooming, a historical year timeline, selectable layers, optional country filling, ASE palettes, and cropped SVG export. AI should eventually interpret prompts into structured map edits (for example, verified country IDs and colors), but must not generate geographic polygons. Diagram and Graph Generator are standalone apps, so their obsolete one-button mode selectors were removed from the top of both toolbars.

## Important files

- `app/page.tsx` — map editor UI, state, pan/zoom, timeline, palette handling, country filling, and WYSIWYG cropped export.
- `app/globals.css` — map workspace, crop mask, label scaling, layer visibility, and controls.
- `app/lib/figure.ts` — deterministic map SVG renderer and named SVG hierarchy.
- `app/api/maps/timeline/route.ts` — year-based map endpoint, valid from 3400 BCE through 2026 CE.
- `app/lib/map-catalog.ts` — current, licensed CShapes, and Cliopatria adapters plus label positioning.
- `app/lib/historical-boundaries.ts` — historical-boundary helpers.
- `app/lib/ase.ts` — Adobe Swatch Exchange parser.
- `tests/figure.test.mts` — renderer and historical-map regression tests.
- `test_prompts_maps.md` and `map-test-results/` — earlier model-evaluation prompts/results.
- `scripts/import-*.mjs` — reproducible data-import pipelines.

## Timeline datasets

- 2019–2026: Natural Earth Admin 0 countries. The geometry intentionally remains the same across these years.
- 1886–2018: CShapes 2.0 under a separately obtained licence agreement.
- Before 1886, including BCE: locally bundled Cliopatria/Seshat data.
- There is no year zero. Valid input is `-3400..-1` and `1..2026`.
- Changing years preserves the viewport.

Licensing:

- Natural Earth: public domain; commercial use is allowed.
- Cliopatria: CC BY 4.0; commercial use is allowed with attribution.
- CShapes 2.0: covered by a separately obtained licence agreement; do not show the former non-commercial-use warning.
- Köppen–Geiger climate data (Beck et al. 2018): CC BY 4.0.

The large local datasets are intentional:

- `app/data/cliopatria-timeline.json` and `public/data/cliopatria-timeline.json` (~27 MB each).
- `app/data/cshapes-timeline.json`.
- `app/data/natural-earth-water.json`.
- `app/data/koppen-climate.json`.
- `app/data/natural-earth-geography.json`.

## Current map UI behavior

- The entire app viewport is the map; controls float on the right.
- The orange 10:7 crop viewport never overlaps the panel.
- Outside the crop is water blue beneath a dark translucent mask.
- Trackpad/wheel and buttons zoom; drag pans; keyboard `+`/`-` zooms.
- Maximum zoom is 40×, sufficient to inspect Vatican City.
- Large numeric year input, graphic arrows, and draggable timeline.
- Fill countries is an explicit mode and defaults off.
- Prompt field sits above Download SVG but is not yet wired to AI edits.
- ASE import supports Apply and Shuffle; 75% and 50% shades supplement short palettes.
- Warnings appear at the bottom of the panel; there is no map verification-report download.
- Download SVG is orange.

Available layer switches:

- Borders
- Country names
- Seas and oceans
- Rivers
- Climate zones
- Terrain regions
- Mountain ranges
- Cities and capitals
- Disputed boundaries

Climate is a broad five-group Köppen–Geiger layer for 1980–2016 normals:

- Tropical — red `#e45745`
- Arid — orange-yellow `#e6ad3c`
- Temperate — green `#69ad63`
- Cold — blue `#4f83cc`
- Polar — purple `#8d67b1`

The source grid is 0.5°. A subtle SVG Gaussian blur softens its block edges without changing classifications.

## Geography overlays

Natural Earth public-domain vectors are locally processed into `app/data/natural-earth-geography.json`:

- National capitals (200 records)
- Mountain-range polygons (222)
- Broad terrain polygons: deserts, plateaus, plains, and basins (169)
- Disputed boundary lines (75)

The overlays default off because they represent present-day geography even when a historical political year is selected. The panel shows that caveat when enabled.

Recent fixes:

- Terrain was invisible because it sat beneath opaque country fills; it now renders in thematic overlays above political geography.
- Mountain ranges now include names.
- City and mountain labels use the same zoom-aware sizing and halo as country names.
- Only major city/mountain labels appear at world zoom; more appear at regional/detail zoom.
- City dots shrink appropriately as the user zooms.
- New Zealand previously appeared over Portugal because `geoCentroid` failed on an antimeridian multipolygon. Historical labels now use the centroid of the largest land polygon.
- A temporary attempt to replace CShapes with Cliopatria for 1886–2018 produced unacceptably coarse/jagged maps. CShapes was restored after a separate licence agreement was obtained. Do not reintroduce the former commercial-use warning.
- Do not cosmetically smooth historical political rings: this visibly distorts borders. Historical political fills are instead clipped to the cleaner Natural Earth land outline so coastlines and islands remain clean while internal historical borders retain their source geometry.

## SVG export contract

Export aims to be WYSIWYG:

- Disabled editor layers remain present but are marked `display:none` in the SVG.
- Water labels/lakes, borders, country names, rivers, and all new overlays follow editor switches.
- Current zoom-dependent text sizes and city/mountain label-density choices are baked into the export.
- Country full names and abbreviations are separate groups. Abbreviations default hidden.
- The old information/source box is not exported.
- Crop export is non-destructive: content is clipped by the SVG viewBox rather than geometrically cut.
- The crop is normalized to a zero-origin viewBox and map content is translated inside a named `Map content` group. This was added because Illustrator shifted all text left when importing a non-zero-origin viewBox. This fix has passed build/tests but should be visually verified in Illustrator next session.

Named SVG hierarchy (no `layer-` prefixes):

- Seas and oceans
- Base geography
  - Land
  - Lakes
- Political geography
  - Countries and borders
  - Disputed boundaries
- Thematic overlays
  - Terrain regions
  - Climate zones
  - Mountain ranges
  - Rivers
- Map features
- Labels
  - Cities and capitals
  - Country abbreviations
  - Country names
  - Geographic labels
- Coastline
- Map ornaments

Groups use both human-readable `data-name` values and stable IDs so Illustrator has useful names.

## Typography

- Country names: regular weight, zoom-aware.
- City and mountain labels: same base/zoom-aware size as countries.
- Water labels: slightly larger, italic, blue.
- Free feature labels: slightly larger than country labels but reduced from earlier oversized values.
- Country abbreviations use `shortMapLabel()` (for example, Czechia → CZ) and are separate from full names.
- Editor CSS progressively reveals city/mountain labels by Natural Earth scalerank at world, regional, and detail zoom levels.

## Diagram and graph generators

- Diagram Generator creates constrained biological SVG diagrams; Graph Generator creates source-bound bar or line charts.
- Both apps have dedicated English and Czech info-drawer content. Map Generator also has its own updated drawer describing datasets, editing, export, and the currently inactive prompt field.
- Both apps now use relevant localized loading phrases instead of the map-loading phrases.
- The displayed generation estimate and countdown baseline are 30 seconds, not three minutes. The countdown stops at `0:00` rather than going negative.
- Automated Checks appear at the bottom of the right-hand toolbar for Diagram and Graph Generator, not beneath the SVG preview.
- Diagram validation normalizes slightly out-of-range finite model coordinates onto the safe canvas and reports that normalization. Extreme, non-numeric, or structurally invalid geometry is still rejected. This prevents the built-in amoeba example from failing on coordinates such as `y: 4`.
- Diagram output shows only a centered title. Visible subtitles and the schematic/not-to-scale footer were removed.
- Generic ellipse rendering was replaced with deterministic, subtly irregular organic SVG paths for nuclei, vacuoles, and similar biological structures.
- `Cell membrane`, `cytoplasm`, and `pseudopodia` are semantic whole-organism annotations. They must not render as extra organelle blobs: cytoplasm determines the organism fill, membrane labels the outer outline, and pseudopodia labels the relevant outline extension.
- Diagram leader lines use elbowed routes. Generated titles beginning with phrases such as `Schematic Diagram of an ...` are simplified for display (for example, `Amoeba`).

## Validation

Last successful commands:

```sh
node --test tests/figure.test.mts
npm run build
```

Result: 18/18 tests passed and the production build completed successfully after the latest map, diagram, graph, and toolbar changes.

To start live preview:

```sh
npm run dev
```

Vinext usually serves at `http://localhost:3000/`; earlier runs sometimes used port 3001.

## Recommended next checks

1. Reload the map or change the year so the client receives SVGs containing all newly added groups.
2. Visually inspect terrain, mountain labels, and capital labels at world, regional, and detail zoom.
3. Export with several layer combinations and verify hidden/visible state in Illustrator.
4. Specifically verify that the zero-origin crop fix eliminated Illustrator’s left-shifted text.
5. Tune label collision/placement if city and mountain names still overlap in dense regions. Current logic uses scalerank, not a full collision engine.
6. Consider implementing a proper label-collision pass before adding more dense layers.
7. Wire the prompt field to a constrained resolver that returns structured entity IDs and styling instructions; never accept model-generated polygons.

## Worktree warning

The worktree is intentionally dirty and contains many uncommitted files from this long feature session. Do not reset or discard unrelated changes. Inspect `git status --short` before editing. No API keys or secrets are recorded in this handoff.
