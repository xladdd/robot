### What is this?

Queue up to 15 prompts, typed or imported locally from DOCX, Markdown, or TXT, with up to three optional image references. Generate square images, retry individual results, or generatively upscale one size step to 1K or 2K. Style presets can add a style prompt and pin a seed.

### How does it work?

Only prompt text and supplied reference images are sent through Robot to OpenRouter; the imported document stays local. Generation uses the configured image model unless advanced mode selects another model. Upscaling sends the selected image for generative recreation, not pixel-identical enlargement. A fixed seed can improve repeatability but does not guarantee identical output across providers, models, or versions.

Transparent background is a best-effort local removal of light background connected to the image border, not general AI segmentation. Review edges and light subjects. ZIP downloads include transparent versions only for successful cutouts, alongside originals.

The advanced release flag reveals the model picker, the credits table, and the style-preset source path. Pick a model and optionally compare it with a second model; every prompt line is then generated once per selected model.

Parameter chips add structured fields — scene, subjects, lighting, mood, background, composition, colour palette, camera, and seed — which are assembled into a structured `FLUX` JSON prompt per line, with empty fields omitted. Without any structured field, each line is generated as written with the style text appended.

Displayed prices are estimates; remaining credit and monthly-cap displays are not a guarantee of final price or request availability.
