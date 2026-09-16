### What is this?

Graph Generator turns supplied numeric data into an editable bar, line, combined, scatter, or donut chart in SVG format.

Describe the chart in the Prompt field. Type or paste values into the Data field, or drop an Excel (`.xlsx`) or CSV file there to convert its first sheet into an editable Markdown table. You may add named sources and import an Adobe Swatch Exchange palette.

The generator preserves the numbers you provide. Always compare the chart with the original source before publication.

### How does it work?

Your prompt and data are sent through a protected server route to a fixed model, which may only structure the explicit values and sources you supplied. It cannot research, estimate or add data. The returned specification is validated for safe rendering, then deterministic code calculates the axes and renders the requested chart. Bar and line charts use rounded automatic ticks; combined charts can use independent y-axes; scatter trend lines and donut geometry are calculated locally.
