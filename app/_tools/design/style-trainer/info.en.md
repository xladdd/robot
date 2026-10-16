### What is this?

Use up to six style references and a test-subject prompt to develop a reusable style prompt. Generate three test images per round, vote to pin one seed, refine the prompt, and repeat. Finish Style shows the reviewed prompt and seed; submitting a style request creates an Asana task with a prepared preset entry, not an automatic deployment.

### How does it work?

References go to the planner through OpenRouter; revisions may also include the preferred generated image. Test image generations deliberately exclude references, so they test the prompt and seed alone. Manual prompt edits remain editable. Fixed seeds do not guarantee identical future output.

Test-image sizing uses the references’ original pixel dimensions, not their smaller analysis previews. If every reference has the same width and height, the server requests that size when the provider advertises support; otherwise it requests the nearest supported aspect ratio. The returned image is then checked and, when necessary, resized server-side to the common original dimensions without cropping or stretching. Aspect-ratio differences add white margins. Resizing may enlarge pixels; it does not add native model detail. With mixed reference sizes, a deterministic vote selects the dominant supported aspect ratio and the provider determines the output pixels. The response reports native and final dimensions separately; the legacy “1K” label is not a pixel measurement. Exact-size normalization requires inline image bytes; URL-only provider results are refused rather than downloaded. Dimension limits are 16,384 pixels per side and 40 megapixels.

The Asana submission includes the style name, ID, prompt, seed, test prompt, round count, optional note, Robot username, and submission timestamp. Reference and generated images are not uploaded to Asana.
