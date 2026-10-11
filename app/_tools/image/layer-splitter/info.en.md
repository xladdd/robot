### What is this?

Upload one image and choose Fast or Fidelity reconstruction. You will get a layered PSD with a full background and separate transparent foreground-object layers, including generated approximations of parts hidden in the source.

### How does it work?

The source image is sent through OpenRouter to `mistralai/mistral-large-4-0` on Mistral's EU endpoint, which inventories visible objects and their layer order. `inclusionai/ming-image-0.1-design-layer` then decomposes the image into RGBA cutouts. Robot uses only Ming's alpha masks—not its generated RGB—and extracts original RGB and alpha from the supplied source. Missing or unmatched cutouts are traced by `qwen/qwen3.7-flash`, with `google/gemini-3.6-flash` as a validated fallback. Robot assigns every overlapping source pixel to the topmost object and never substitutes a rectangular mask when segmentation fails.

For the background, Robot finds each connected area hidden by the extracted objects and sends a contextual crop with a transparent hole to `bytedance-seed/seedream-5-0-flash` (Fast) or `bytedance-seed/seedream-5-0-pro` (Fidelity). Generated pixels are copied only through the exact binary removal mask, so source pixels outside the holes remain unchanged. In Fidelity mode, `openai/gpt-image-2.5-sunburst` can generate transparent continuations of genuinely occluded objects while the visible source pixels remain on top. Robot validates and composites the layers, and `ag-psd` assembles the downloadable PSD.
