### What is this?

Map Maker creates editable SVG maps for print and editorial work. It opens at the present year with year controls intentionally locked; historical dates are not yet available in the interface, although the historical API and bundled timeline data exist.

### How does it work?

Inside the orange crop, drag to pan and use the wheel or buttons to zoom. Choose a political, physical, historical, climate, or blank layer preset, then refine individual layers. Essential, Standard, and Detailed label densities control collision layout. Position labels lets you drag individual labels; Hide labels removes selected labels. Draw adds symbols, text, and routes.

Choose a 90 mm column, 135 mm half-page, or 180 mm full-page preset to export physical type sizes, line weights, and legend dimensions. Add a title, subtitle, source, projection note, and copyright before export. Publication preflight flags print size, source/date omissions, RGB colours, unavailable Verdana, labels crossing the crop, dense layer combinations, and mixed-period overlays. Download SVG exports the visible crop with edits, named layers, publication metadata, and physical dimensions.

Optional prompt edits use the configured model through OpenRouter. When you apply a prompt, the server sends your instruction, the current map year, and the names of territories available for that year. AI interprets that limited context into constrained territory fills and simple labels. Review each proposed operation and select which ones to apply; applied and dismissed requests remain in session history. Common English, Czech, and historical territory aliases are normalized before exact resolution. AI does not render the map, and model-generated polygons are not accepted. Application code deterministically renders the geometry, projection, layers, crop, and SVG from bundled map data. Identical data, year, settings, and code produce identical output.

The base map, lakes, rivers, and present-day countries use bundled Natural Earth 1:10m data. Historical support uses Cliopatria before 1886, CShapes from 1886 through its 1 January 2018 snapshot, and present-day geometry for 2019–2026. For years before 1000, the cities layer can use settlements from the Pleiades gazetteer that existed in the selected year.

Optional terrain, mountain, summit, river, lake, disputed-boundary, and climate overlays may describe present-day or reference-period conditions rather than the selected political year.

The Physical preset combines restrained terrain tinting with Natural Earth I shaded relief clipped to land and small ranked Natural Earth summit triangles and elevation labels. A four-segment graphic scale appears in the lower-left corner for every map preset. The relief is a raster layer, while political geography, labels, peaks, water, and ornaments remain editable vectors; standalone SVG exports embed the relief image.

Climate uses five editable contour paths derived from the Beck et al. 1980–2016 high-resolution classification; its colour key appears in the map legend when enabled.

Source coverage, names, dates, and boundaries can be incomplete or disputed. Review the exported map editorially and in your print workflow before publication.
