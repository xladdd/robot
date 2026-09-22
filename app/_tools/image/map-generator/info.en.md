### What is this?

Choose a year, move and zoom the world map, switch geographic layers, and optionally apply an Adobe Swatch Exchange palette. You will get an editable SVG that preserves the visible crop, colours, labels, and named layers.

### How does it work?

Robot selects the matching political boundaries from its bundled `CShapes 2.0`, `Cliopatria`, `Natural Earth`, and `world-atlas` data. `d3-geo` and deterministic rendering code build the map for the chosen year, and the editor applies your viewport, palette, label, and layer settings before export. No AI model is used, and the prompt field does not currently change the map.
