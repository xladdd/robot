### What is this?

Upload one image and choose Fast or Fidelity reconstruction. You will get a layered PSD with a full background and separate transparent foreground-object layers, including generated approximations of parts hidden in the source.

### How does it work?

The source image is sent through OpenRouter to `mistralai/mistral-large-4-0` on Mistral's EU endpoint, which inventories visible objects and their layer order. `inclusionai/ming-image-0.1-design-layer` then decomposes the image into RGBA cutouts. Robot uses only Ming's alpha masks—not its generated RGB—and extracts original RGB and alpha from the supplied source. Missing or unmatched cutouts are traced by `qwen/qwen3.7-flash`, with `google/gemini-3.6-flash` as a validated fallback. Robot assigns every overlapping source pixel to the topmost object and never substitutes a rectangular mask when segmentation fails.

For the background, Robot identifies object silhouettes together with their cast/contact shadows and creates a larger background-only cleanup mask. Contextual crops with those regions erased are sent to `bytedance-seed/seedream-5-0-flash` (Fast) or `bytedance-seed/seedream-5-0-pro` (Fidelity); an inward seam blend joins generated texture to untouched source pixels outside the cleanup region. In Fidelity mode, Robot combines model-reported overlaps with mask geometry, then asks `openai/gpt-image-2.5-sunburst` for three transparent completion candidates using both the source cutout and original scene context. It scores visible-pixel agreement and silhouette continuity, colour-corrects the best hidden fragment, clips it beneath the occluding layers, and safely keeps the original cutout if no candidate is valid. `ag-psd` writes the opaque Background at the bottom of the downloadable PSD stack.
