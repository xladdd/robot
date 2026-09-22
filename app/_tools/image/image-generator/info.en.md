### What is this?

Enter up to 15 prompts, or import them from a DOCX, Markdown, or text file, and optionally add up to three reference images. You will get separate square images that can be retried, downloaded, or generatively upscaled to the next size.

### How does it work?

Imported prompt files are read in the browser and split at blank lines. Each prompt and its optional references are sent through OpenRouter to either `black-forest-labs/flux.2-klein-4b 🇩🇪` for a fast 512 px image or `black-forest-labs/flux.2-pro 🇩🇪` for a 1K image. Upscaling sends the selected image to `black-forest-labs/flux.2-pro 🇩🇪`, which recreates it at 1K or 2K; the original imported document file is not uploaded.
