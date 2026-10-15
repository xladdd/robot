# Session handoff — Map Maker

Last updated: 2026-10-14 (Europe/Prague)

## Current product direction

The original AI-first figure generator has been split into separate sidebar apps: Map Maker, Diagram Generator, and Graph Generator. The old Bio Generator label was replaced by Diagram Generator. Map Maker is primarily a deterministic, interactive world map, not an LLM drawing SVG geography. It supports crop-based panning and zooming, projections and layers, filling, label hiding, drawing, ASE palettes, and cropped SVG export. The prompt field is active: OpenRouter interprets a natural-language instruction into constrained fills and simple labels, while application code and bundled data continue to own all geometry and rendering. No model-generated polygons are accepted. Historical API/data support exists, but the visible year controls are intentionally locked to the current year until UI time travel is enabled.

AI disclosure belongs beside or inside the prompt field, where the remote interpretation occurs. Do not show a top-level local-only badge: most rendering is local/deterministic, but that badge misrepresents the active OpenRouter prompt path. `MainInterface.tsx` still renders the old top `ProcessingBadge mode="local"`; remove or relocate it when implementation files are in scope.

## Important files

- `app/_tools/image/map-generator/Tool.tsx` — map editor controller state, prompt handling, pan/zoom, timeline, palette handling, drawing, country filling, label hiding, and WYSIWYG cropped export.
- `app/_tools/image/map-generator/MainInterface.tsx` — map editor markup and controls.
- `app/globals.css` — map workspace, crop mask, label scaling, layer visibility, and controls.
- `app/_tools/image/map-generator/code/map.ts` — deterministic map SVG renderer and named SVG hierarchy.
- `app/api/maps/timeline/route.ts` — year-based map endpoint, valid from 3400 BCE through 2026 CE.
- `app/_tools/image/map-generator/code/map-catalog.ts` — current, licensed CShapes, and Cliopatria adapters plus label positioning.
- `app/_tools/image/map-generator/code/historical-boundaries.ts` — historical-boundary helpers.
- `app/_tools/image/map-generator/code/ase.ts` — Adobe Swatch Exchange parser.
- `app/_tools/image/map-generator/tests/map.test.mts` — renderer and historical-map regression tests.
- `map-test-results/prompts.md` and the adjacent result folders — earlier model-evaluation prompts/results.
- `scripts/import-*.mjs` — reproducible data-import pipelines.

## Timeline datasets

- 2019–2026: Natural Earth Admin 0 countries. The geometry intentionally remains the same across these years.
- 1886–2018: CShapes 2.0 under a separately obtained licence agreement.
- Before 1886, including BCE: locally bundled Cliopatria/Seshat data.
- There is no year zero. Valid input is `-3400..-1` and `1..2026`.
- The API supports changing years and preserves the viewport, but the current UI intentionally fixes the map to the present year.

Licensing:

- Natural Earth: public domain; commercial use is allowed.
- Cliopatria: CC BY 4.0; commercial use is allowed with attribution.
- CShapes 2.0: covered by a separately obtained licence agreement; do not show the former non-commercial-use warning.
- Köppen–Geiger climate data (Beck et al. 2018): CC BY 4.0.

The large local datasets are intentional:

- `app/_tools/image/map-generator/code/data/cliopatria-timeline.json` (~66 MB), the single local Cliopatria dataset used directly by the timeline API.
  - Re-imported 2026-10-13 from upstream `cliopatria_polities_only_v021.geojson` (sha256 `fc6f0d1e…`) at tolerance 0 — no geometric simplification, only 4-decimal coordinate quantization (was 0.18°, ~27 MB). Ancient polity geometry now carries full upstream vertex density (~2.7× more polygon points per year render; e.g. Roman Republic at 200 BCE went from 146 to 386 points). Per-year SVG size is unchanged (~4.7–5 MB).
  - The stored data stays unsnapped. Coastline conflation runs at request time in `code/coast-snap.ts` (used by `applyCliopatriaBoundaryCatalog`): boundary vertices within 0.25° of the coast are snapped onto the world-atlas land-50m outline — the exact outline the renderer clips fills against — and coastal runs are replaced with the coastline path (walk factor 6, max 40°, walk points simplified at 0.01°). Genuinely internal borders are untouched. Roman Republic at 200 BCE: 62% of boundary length lies on the coastline (was ~5%); adapter adds ~15 ms warm per request and ~0.16 MB to the SVG.
- `app/_tools/image/map-generator/code/data/cshapes-timeline.json`.
- `app/_tools/image/map-generator/code/data/natural-earth-water.json`.
- `app/_tools/image/map-generator/code/data/koppen-climate.json`.
- `app/_tools/image/map-generator/code/data/natural-earth-geography.json`.

## Current map UI behavior

- The entire app viewport is the map; controls float on the right.
- The orange 10:7 crop viewport never overlaps the panel.
- Outside the crop is water blue beneath a dark translucent mask.
- Trackpad/wheel and buttons zoom; drag pans; keyboard `+`/`-` zooms.
- Maximum zoom is 40×, sufficient to inspect Vatican City.
- The numeric year input, arrows, and timeline remain visible but are intentionally locked to the current year; historical API/data support is not yet exposed as UI time travel.
- Fill countries, Hide labels, and Draw are explicit modes and default off.
- The active prompt field calls the configured OpenRouter model for interpretation. OpenRouter receives the user's instruction, the current map year, the available territory names, and the fixed system instruction; no SVG or polygon geometry is sent. Returned fills are resolved against the available territory list, simple labels are validated, and application code applies and renders the edits. Model-generated polygons are never accepted.
- The intended AI badge location is in or beside this prompt field. There should be no top-level local-only badge.
- ASE import supports Apply and Shuffle; 75% and 50% shades supplement short palettes.
- Warnings appear at the bottom of the panel; there is no map verification-report download.
- Download SVG is orange.

Available layer switches:

- Borders
- Country names
- Seas and oceans
- Lakes
- Rivers
- Climate zones
- Terrain regions
- Mountain ranges
- Cities and capitals
- Disputed boundaries
- Meridians and parallels, behind or in front of land
- Lake and river names

Climate is a broad five-group Köppen–Geiger layer for 1980–2016 normals:

- Tropical — red `#e45745`
- Arid — orange-yellow `#e6ad3c`
- Temperate — green `#69ad63`
- Cold — blue `#4f83cc`
- Polar — purple `#8d67b1`

The climate layer is derived from the official Beck et al. V1 0.083333° (~10 km) raster. The importer groups the 30 subtypes into five broad classes, majority-aggregates them to 0.166667° (~18 km), extracts smoothed categorical contours, removes sub-print isolated zones, and simplifies sub-pixel vertices. The SVG contains five editable compound paths with no Gaussian blur. Climate swatches appear in the on-map and exported legends when the layer is enabled; the toolbar retains only the temporal caveat.

## Geography overlays

Natural Earth public-domain vectors are locally processed into `app/_tools/image/map-generator/code/data/natural-earth-geography.json`:

- National capitals (200 records)
- Mountain-range polygons (222)
- Broad terrain polygons: deserts, plateaus, plains, and basins (169)
- Disputed boundary lines (75)

The overlays default off because they represent present-day geography even when a historical political year is selected. The panel shows that caveat when enabled.

Recent fixes:

- Ancient political boundaries visually aligned with the base map: Cliopatria rings no longer stop short of coastlines or leave parallel double lines. Serve-time coastline conflation (`code/coast-snap.ts`) snaps near-coast boundary vertices onto the land-50m outline and replaces coastal runs with the coastline path; inland borders keep source geometry. Import-time conflation was rejected because identical coast walks duplicated across Cliopatria's year-slice rows (190 MB at walk tolerance 0.01°); request-time snapping keeps the bundled file at ~66 MB.

- Terrain was invisible because it sat beneath opaque country fills; it now renders in thematic overlays above political geography.
- Mountain ranges now include names.
- City and mountain labels use the same zoom-aware sizing and halo as country names.
- Only major city/mountain labels appear at world zoom; more appear at regional/detail zoom.
- City dots shrink appropriately as the user zooms.
- New Zealand previously appeared over Portugal because `geoCentroid` failed on an antimeridian multipolygon. Historical labels now use the centroid of the largest land polygon.
- A temporary attempt to replace CShapes with Cliopatria for 1886–2018 produced unacceptably coarse/jagged maps. CShapes was restored after a separate licence agreement was obtained. Do not reintroduce the former commercial-use warning.
- Do not cosmetically smooth historical political rings: this visibly distorts borders. Historical political fills are instead clipped to the cleaner Natural Earth land outline so coastlines and islands remain clean while internal historical borders retain their source geometry.
- Lakes moved above political fills (now inside Thematic overlays, between Mountain ranges and Rivers): opaque country/polity fills used to cover lakes entirely, which read as "lakes are missing". Moving the layer keeps the exported lake paths in the `Lakes` group. Water toggling is split: the "seas and oceans" switch hides only the blue background (`hide-water` → `#seas-oceans`), and a separate "lakes" switch hides lake polygons (`hide-lakes` → `.natural-lakes`).
- Cities layer is year-aware for ancient years: `spec.politicalYear` (set by the timeline API, validated in `validateMapSpec`) selects Pleiades settlements active at that year for years before 1000 (`code/data/pleiades-places.json`, 13,249 settlements, CC BY 4.0, imported via `scripts/import-pleiades-places.mjs`). Major ancient cities carry rank 3 (world zoom); all others rank 6 (regional zoom onward; world zoom hides non-rank-3 Pleiades dots via the `city-kind-pleiades` class). Natural Earth capitals remain for years ≥ 1000.
- The Physical preset uses projection-specific Natural Earth I 1:10m high-resolution shaded-relief rasters clipped to the 1:10m land geometry. The 21600 × 10800 upstream TIFF is projected through a 12000 × 6000 working raster into four 6000 × 4200 JPEGs, replacing the visibly blocky 3000 × 2100 assets derived from the 1:50m source. Preview SVGs reference local JPEG assets; downloaded SVGs inline the selected JPEG as a data URL so exports remain standalone. The raster terrain is intentionally combined with editable vector geography rather than represented by synthetic ridge or hachure lines. Real summits come from Natural Earth’s public-domain 1:10m elevation-point dataset (`code/data/natural-earth-peaks.json`, reproducible via `scripts/import-natural-earth-peaks.mjs`) and render as small ranked triangle markers with elevation labels. Relief assets are reproducible via `scripts/import-natural-earth-relief.mjs`; source and licensing notes are in `code/data/natural-earth-relief-SOURCE.md`.
- Projections: `spec.projection` is now `schematic` (Mercator, unchanged default) | `robinson` | `eckert4` | `naturalEarth`, validated in `validateMapSpec` and accepted by the timeline API as a `projection` query parameter. All layers re-project server-side through `d3-geo`/`d3-geo-projection` (Robinson and Eckert IV come from the new `d3-geo-projection` dependency; types are declared locally in `code/d3-geo-projection.d.ts` because the package ships no typings). Nothing is post-distorted — every layer shares the same projection pipeline.
- Graticule: a 10° meridian/parallel grid rendered twice in every SVG (`graticule-behind` over the water background, `graticule-front` above thematic overlays). The editor toggles it with the `graticule` layer switch and picks position with `graticuleFront` (`graticule-position-front` canvas class); the export shows exactly one copy via `setExportLayerVisible`. No re-render is needed to move it — only CSS decides which copy is visible. The graticule geometry is densified to 2° steps before projecting: `projection.clipExtent` disables d3's adaptive resampling, so un-densified lines render as angular 10° chords in the curved projections. Country borders in `.regions path` use `stroke-width: .4`.
- Base map upgraded from world-atlas land/countries 1:50m to Natural Earth **1:10m** (land + Admin 0 countries, simplified at 0.01°, imported by `scripts/import-natural-earth-10m.mjs` from the official NE shapefiles via the `shapefile` package). Ring winding is normalized in the importer (planar shoelace plus a d3 `geoArea` spherical check); NE codes France and Norway with ISO_N3 `-99`, so the importer falls back to `ISO_N3_EH`. Coastline conflation (`coast-snap.ts`) now uses the same 10m land file, so fills and the base map share one coastline. SVGs grew: ~14.5 MB per ancient year render, ~9 MB modern (the land path is embedded three times: base land, clip path, coastline overlay).
- Lake and river names: named NE 10m lakes (745) and rivers (1,367) render as `kind:"water"` labels with `data-map-label-water-feature` attributes — lakes at polygon centroids, rivers at the midpoint of their longest projected segment. They are gated by the `waterLabels` layer switch ("lake and river names", default off) and by NE rank (world zoom shows rank ≤ 3, regional ≤ 5, detail all), and join the existing collision layout engine. Lake labels additionally require the lakes layer, river labels the rivers layer (`layerVisible` in `code/label-layout.ts`).
- Label hiding: the `HIDE LABELS` toggle (like Fill countries) lets the user click any `text[data-map-label-key]` to hide it; hiding sets `data-label-hidden="true"` plus inline display and is serialized into the map output like country fills. `layoutMapSvgLabels` skips user-hidden labels (they stay hidden through collision passes and export). Undo restores the most recently hidden key; Unhide all clears every hidden label. Both write back through the same DOM-serialize path as fill painting.
- Draw mode: the `DRAW` toggle places markers (battle, city, peak, port, text-only) by clicking the map and draws routes (click waypoints, Finish route or click the next symbol). Items serialize into an `#editor-draw` group inside the SVG (with a `data-draw-items` JSON stack), survive year changes, and are dropped when the projection changes. Undo/Clear manage the stack. Fill countries also works in countries mode now (paths matched by `data-iso-numeric`/`data-map-unit` as well as `data-region-id`).
- Viewport is now a fixed viewBox (`0 0 1000 700`) plus a composited CSS transform (`translate/scale`) on the SVG — dragging no longer re-rasterizes geometry. Label relayout debounces 250 ms after pan/zoom and shows a "Rendering…" chip. Water-feature labels (lake/river names) revealed by rank classes via `--map-water-feature-size`; revealed like cities by zoom-tier CSS.
- The year controls default to 2026 and are locked (`TIME_TRAVEL_ENABLED = false` in MainInterface): the input is read-only grey, and clicking year arrows or the slider pops the "Time travel is not yet allowed." tooltip (`.map-time-tooltip`, same style as the sidebar coming-soon tooltip, 4 s auto-hide). The tooltip is portaled to `document.body` (`position: fixed`, z-index 41) with coordinates captured at click time from the year field and the `.figure-controls` panel — it renders fully outside the toolbar, 10 px left of the panel, because the panel's `overflow-y: auto` and `.map-module`'s `overflow: hidden` would otherwise clip it. Flip the constant to re-enable.
- Region presets (select under Map projection) fit the viewport client-side by projecting the region bounds with the same d3 projection and setting zoom/pan.
- Czech place names: `spec.labelLanguage` (timeline `lang=cs`) translates country labels (CLDR Czech territories) and capital city labels (Wikidata Czech labels, 192 of 200 capitals) via `code/data/czech-names.json` (importer `scripts/import-czech-names.mjs`). Ancient Pleiades, lake, and river names remain in their source language.
- Toolbar panel order: year field (number + arrows) → year slider (the "HISTORICAL BOUNDARY TIMELINE · NEGATIVE = BCE" note was removed) → zoom in/out/reset (`.map-view-buttons`) → Map projection fieldset → prompt field → layers → fill/hide-labels/draw toggles. The prompt textarea spans the full fieldset width (`grid-template-columns: 1fr`) with a small content-sized Apply button below it. The label tools (Undo, Unhide all, hidden count) sit 6 px under the Hide labels switch (`margin-top: -12px` against the 18 px grid gap).
- Prompt interpretation: `POST /api/maps/generate` calls the configured OpenRouter interpretation model using `prompts/map-prompt.md`. The model receives the user's instruction, `spec.date`, and the names in that year's `spec.regions`; it does not receive the SVG or polygon geometry. It returns constrained fills (territory names resolved server-side against the year's region list) and simple labels (validated lon/lat projected by application code). The client applies fills as palette paints and labels as draw-mode text items. It never accepts model-generated polygons. The manifest declares the dedicated OpenRouter environment variable.
- Water data re-imported from the official NE shapefiles with winding normalization (`scripts/import-natural-earth-water.mjs`); the old data carried five spherically inverted lakes whose whole-map complement fills covered mountains and hid lakes. The Caspian Sea is not in NE 10m lakes — it renders as the single land-polygon hole (blue water) but has no lake label.
- `d3-geo-projection` resolves to UMD under Turbopack; `code/extra-projections.ts` normalizes both module shapes for Robinson/Eckert IV.

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
- Graticule behind land
- Base geography
  - Land
- Political geography
  - Countries and borders
  - Disputed boundaries
- Thematic overlays
  - Shaded relief
  - Terrain regions
  - Climate zones
  - Mountain ranges
    - Mountain range labels
    - Summit markers
  - Lakes
  - Rivers
- Graticule in front of land
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
- Both apps have dedicated English and Czech info-drawer content. Map Maker's bilingual drawer describes the locked current-year UI, active OpenRouter prompt interpretation, deterministic geometry/rendering, editing, export, and review requirements.
- Both apps now use relevant localized loading phrases instead of the map-loading phrases.
- The displayed generation estimate and countdown baseline are 30 seconds, not three minutes. The countdown stops at `0:00` rather than going negative.
- Automated Checks appear at the bottom of the right-hand toolbar for Diagram and Graph Generator, not beneath the SVG preview.
- Diagram validation normalizes slightly out-of-range finite model coordinates onto the safe canvas and reports that normalization. Extreme, non-numeric, or structurally invalid geometry is still rejected. This prevents the built-in amoeba example from failing on coordinates such as `y: 4`.
- Diagram output shows only a centered title. Visible subtitles and the schematic/not-to-scale footer were removed.
- Generic ellipse rendering was replaced with deterministic, subtly irregular organic SVG paths for nuclei, vacuoles, and similar biological structures.
- `Cell membrane`, `cytoplasm`, and `pseudopodia` are semantic whole-organism annotations. They must not render as extra organelle blobs: cytoplasm determines the organism fill, membrane labels the outer outline, and pseudopodia labels the relevant outline extension.
- Diagram leader lines use elbowed routes. Generated titles beginning with phrases such as `Schematic Diagram of an ...` are simplified for display (for example, `Amoeba`).

## Validation

Last successful commands (2026-10-14):

```sh
npm run tools:check
npm run lint
npx tsc --noEmit --pretty false
npm run test:figures
npm run test:ui
npm test
```

Results: generation is current; lint has 0 errors (10 existing `<img>` advisories outside Map Maker); TypeScript passed; 59/59 figure tests passed; 46/46 desktop/narrow browser stages passed with no unexpected browser/network errors; and the production build plus all 420 canonical tests passed. A separate real-provider headless run passed 24/24 assertions, including two successful constrained AI edits. Evidence and the manual checklist are in `/Users/vladfrolov/dev/Temp/map-maker-qa-2026-10-14/`.

To start live preview:

```sh
npm run dev
```

Next.js usually serves at `http://localhost:3000/`; it will select another port if that one is unavailable.

## Recommended next checks

1. Reload the map or change the year so the client receives SVGs containing all newly added groups.
2. Visually inspect terrain, mountain labels, and capital labels at world, regional, and detail zoom.
3. Export with several layer combinations and verify hidden/visible state in Illustrator.
4. Specifically verify that the zero-origin crop fix eliminated Illustrator’s left-shifted text.
5. Tune label collision/placement if city and mountain names still overlap in dense regions. The collision engine, density controls, and manual positioning are implemented, but actual-size editorial review is still required.
6. Exercise prompt aliases and unresolved territories in both languages; normalization and explicit English/Czech/historical aliases are implemented, while the current live-provider run predates operation-by-operation approval.
7. Verify the contextual `AI ENABLED` / `AI AKTIVNÍ` prompt badge in any future layout or localization changes; Map Maker intentionally has no detached top-level processing badge.

## Continuation ledger — editorial production improvements

Last checkpoint: 2026-10-15. Keep this section current after each bounded implementation slice.

Completed and narrowly validated:

- Climate layer upgraded from blurred 0.5° run rectangles to five unblurred editable contour paths. Import starts from the official Beck et al. V1 0.083333° raster, aggregates broad groups to 0.166667°, contour-smooths and removes sub-print fragments. Climate colours now appear in the live and exported map legends when enabled; the toolbar contains only the temporal caveat. `d3-contour` is an importer-only development dependency.
- Physical export presets: original SVG plus 90 mm column, 135 mm half-page, and 180 mm full-page. Physical presets bake 7 pt labels, print-safe line weights, physical legend dimensions, and explicit SVG `width`/`height` in millimetres.
- Political, Physical, Historical, Climate, and Blank layer presets.
- Essential, Standard, and Detailed label density backed by the collision layout engine.
- Publication preflight for physical size, source/date presence, minimum text and line assumptions, RGB colour usage, browser-verified Verdana availability, visible labels crossing the crop, label density, excessive thematic layers, and mixed-period overlays.
- Export metadata controls for title, subtitle, source, projection note, and copyright. Defaults come from the map/projection but remain independently editable. Export includes machine-readable metadata and named `Publication metadata`, `Map title`, and `Map credits` SVG groups, with physical type sizes for print presets.
- Manual label positioning: a dedicated drag mode writes offsets/selected variants into SVG label attributes; collision relayout and export honor them. Undo and reset are available. Positions survive same-projection year reloads and are intentionally cleared when projection changes.
- AI operation review/history: prompt results are staged instead of applied immediately; editors can approve individual fills/labels or dismiss the preview. Applied and dismissed requests remain in a capped in-session history. Fill previews show resolved territory names while IDs remain authoritative.
- Territory alias resolution normalizes case, diacritics, punctuation, ampersands, and leading English `the`, then uses explicit synonym groups for common English, Czech, and historical names. It deliberately avoids fuzzy matching between similarly named territories.
- Bilingual tool documentation describes the production controls and AI review flow.
- Physical relief and scale upgrade: synthetic range chevrons, ridges, and hachures were removed. The Physical preset now reveals projection-specific Natural Earth I shaded relief clipped to land plus small ranked Natural Earth summit triangles and elevation labels. A fixed bottom-left four-segment black/white graphic scale is visible for every map preset; the editor keeps it screen-stable while export relocates and scales its SVG group relative to the selected crop. Scale sampling rejects implausible near-zero inverse-projection distances at pseudocylindrical projection edges. Downloaded SVGs inline the relief JPEG and retain named, editable vector layers above it. Legacy broad terrain polygons remain deliberately subdued.
- Automated visual review created five maps through the real UI (`Physical Europe`, `World Climate Zones`, `Political Americas`, `Blank Africa Exercise`, and `Physical Asia`), exercised constrained AI preview/individual approval, downloaded standalone SVGs, and captured crop screenshots. It now fails if any scale or enabled river layer is missing, or if the city-enabled Political Americas map has no visible city labels. The final run showed 37 visible city labels, 1,471 river paths, a correctly labelled 0–3,075 km Eckert IV scale, and the strengthened graticule. The isolated review reported zero console errors, page errors, or failed requests; its output is under `/Users/vladfrolov/dev/temp/map-maker-review-2026-10-15/`. Only the remote OpenRouter interpretation response was mocked deterministically; preview, approval, application, rendering, and export used application code.
- Final validation for the shaded-relief/Safari visibility follow-up: `npx tsc --noEmit --pretty false`, focused ESLint, `npm run tools:check`, and `git diff --check` passed; all 67 figure tests and all 429 canonical tests passed; the production build passed; full lint reported 0 errors and the same 10 unrelated existing `<img>` advisories; and `npm run test:ui` passed all 46 desktop/narrow stages with no unexpected browser/network errors. River visibility now uses a direct canvas class instead of `:has(...)`, and the label layout explicitly reveals selected labels rather than relying on browser-dependent follow-up CSS. The regenerated five-map review was visually inspected and reported zero console errors, page errors, and failed requests.
- Control-panel reorganization: projection and region field labels were removed while retaining accessible names; the shortened graticule/front controls now share two columns below the projection dropdowns. Layers moved above AI-assisted edits and are split into Geography and Labels columns without a divider, with label density integrated below Labels without a separator. The label-priority note spans both columns and the mixed-period explanatory paragraph was removed. City/capital and lake/river-name switches remain in Labels so existing functionality stays accessible. Zoom in/out/reset are three square symbol-only buttons inside the orange crop at top right. AI-assisted edits end with a separator below their content. Desktop/narrow browser tests assert the new order, two-column controls, absent borders, and structure; the complete interface screenshot is `/Users/vladfrolov/dev/temp/map-maker-review-2026-10-15/interface-layout.png`.
- High-zoom relief correction: the official Natural Earth `NE1_HR_LC_SR` 1:10m TIFF replaced the 1:50m raster source, and projected assets doubled to 6000 × 4200 while remaining about 1.5 MB each. The headless review now uses the actual zoom buttons to capture `/Users/vladfrolov/dev/temp/map-maker-review-2026-10-15/physical-europe-detail.png`, preventing regressions to the large blurred blocks seen in the Safari Central Europe screenshot.
- Editing-tool polish: auxiliary Undo/Reset/Clear rows now retain visible spacing below their switches; count badges are 32 px high like neighboring buttons; Draw actions clear the label field. The lower-toolbar screenshot is `/Users/vladfrolov/dev/temp/map-maker-review-2026-10-15/interface-tools.png`. Fill Countries now searches `elementsFromPoint` when the direct event target is an overlay, so rivers, labels, city markers, relief, and similar SVG layers no longer make country fills intermittently miss. A browser regression clicks a non-country SVG overlay and verifies the country underneath is filled.
- Validation at the previous checkpoint: `npx tsc --noEmit --pretty false` passed; focused ESLint passed; all 36 Map Maker tests passed; `npm run tools:check` passed with no generated changes; full lint passed with 0 errors and the same 10 existing `<img>` advisories outside Map Maker; the production build and all 429 canonical tests passed; and `npm run test:ui` passed all 46 desktop/narrow stages with no unexpected browser/network errors (10 explicitly recorded font/CSP noise entries). A temporary Natural Earth projection PNG was visually inspected with the climate layer forced visible; contours had correct winding, geographic placement, and clean boundaries without blur.

Next bounded slice:

1. Perform the external Adobe/actual-size print gate below.

External/manual completion gate:

- Illustrator/InDesign/production-PDF/actual-size print round trip cannot be automated here. Use the exported physical presets, verify named layers and text alignment in Illustrator, place in InDesign, export with the production PDF preset, and print at 90/135/180 mm as appropriate. Record the result here.
- Small-size label hierarchy remains the principal editorial review risk. Do not enable every overlay by default; assess Essential density at 90 mm at actual size.

## Worktree warning

The worktree is intentionally dirty and contains many uncommitted files from this long feature session. Do not reset or discard unrelated changes. Inspect `git status --short` before editing. No API keys or secrets are recorded in this handoff.
