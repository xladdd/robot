### What is this?

Describe a chart and supply its numeric data by typing, pasting, or importing the first sheet of an Excel or CSV file. You will get an editable bar, line, combined, scatter, or donut chart as SVG, with optional sources and an Adobe Swatch Exchange palette.

### How does it work?

Excel and CSV files and palette colours are read in the browser. The chart instruction and data are sent through OpenRouter to the configured model, which structures only the values and sources you supplied. Robot validates the returned specification, calculates scales and geometry deterministically, and renders the SVG without asking the model to research or invent data.

Review the data and labels: deterministic rendering does not make model interpretation infallible. Evaluation API requests can use an allowlisted model override.
