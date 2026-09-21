# What is this?

Layer Splitter turns one supplied image into an approximate, generatively reconstructed Photoshop document. OpenRouter first analyses the scene, then generates a complete background and one complete transparent layer for each useful foreground object.

The lowest PSD layer is a full-canvas background with foreground objects and visible text removed. Object layers include plausible hidden portions, so hiding a pen can reveal a completed book underneath it instead of a cut-out hole.

## Quality and cost

Fast uses `black-forest-labs/flux.2-klein-4b` at a lower resolution and is the economical option. Fidelity uses `black-forest-labs/flux.2-pro` at a higher resolution. The cost scales with the number of detected objects because each object and the background require a separate image generation.

## Important limitation

Hidden content is invented from the visible evidence; it is not recovered from the source. The generated composite will therefore not be pixel-identical to the supplied image. Text, labels, logos, and watermarks are excluded from the layer plan and generation prompts, but image models can occasionally leave small lettering or marks behind.

FLUX returns images rather than layered PSD files or guaranteed transparent PNGs. The app creates transparency locally from the generated chroma-key object plates and assembles the final PSD locally. If an object cannot be isolated reliably, the export is rejected rather than silently producing a broken layer.
