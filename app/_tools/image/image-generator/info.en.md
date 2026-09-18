### What is this?

Image Generator creates square textbook images from one or more written prompts. You can optionally supply up to three reference images to guide the visual style or subject.

### How does the queue work?

Write one prompt, or separate several prompts with an empty line. Robot queues up to 15 prompts and starts them in order. Choose whether to generate one, two, or three images at a time; one is the default. The button shows how many images will be generated, and you can stop active and remaining work at any time.

For example:

```text
a goose

a boy

a dog
```

creates three separate images.

### Can I retry or upscale an image?

A failed card has a **Retry** action that resubmits only that image, without rerunning successful queue entries. Each completed image has an **Upscale 2×** action. It uses FLUX.2 Pro image editing to recreate the source at the next size step: 512 px becomes 1K, and 1K becomes 2K.

Upscaling is generative enhancement rather than mathematically pixel-identical scaling. It is instructed to preserve the original composition and details, but fine texture may change. The maximum output is a 2K square image.

### Can I import prompts?

Yes. Drag a Word (`.docx`), Markdown (`.md`), or text (`.txt`) file anywhere into the app, or use the import button. Empty lines in the document separate prompts. Legacy `.doc` files must first be saved as `.docx`.

### What leaves the browser?

The current prompt and optional reference images are sent to OpenRouter for generation. Imported document text is read locally in the browser; the original document file is not uploaded. The Image Generator uses its own server-only OpenRouter API key.
