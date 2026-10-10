### What is this?

Enter up to 15 prompts, or import them from a DOCX, Markdown, or text file, and optionally add up to three reference images. You will get separate square images that can be retried, downloaded, or generatively upscaled to the next size.

### How does it work?

Imported prompt files are read in the browser and split at blank lines. Each prompt and its optional references are sent through OpenRouter to either `black-forest-labs/flux.2-klein-4b 🇩🇪` for a fast 512 px image or `black-forest-labs/flux.2-pro 🇩🇪` for a 1K image. Upscaling sends the selected image to `black-forest-labs/flux.2-pro 🇩🇪`, which recreates it at 1K or 2K; the original imported document file is not uploaded.

### Advanced mode

Switch the mode switcher at the top of the control panel to **Advanced** to build a structured FLUX JSON prompt: repeatable subjects with description, position, and action, plus scene, style, free-form prompt, lighting, mood, background, composition, color palette, and camera settings. A **Visual treatment** dropdown under the style field offers ready-made style prompts (the Cover Generator treatments plus two storybook presets that also set the seed to 8701); picking one fills the style field, and using it is optional. The model dropdown lists the FLUX image models currently available on OpenRouter, with the price per image next to the credit remaining on the app's OpenRouter key, shown with its monthly cap (the account balance itself is only visible with a management key). The lighting-to-camera fields are folded into the **Advanced details** rollup and only shown when expanded. An optional **seed** (0–2,000,000,000) sits above the Generate button; leaving it empty uses a random seed, and a fixed seed reproduces the same image from the same inputs. Empty fields are omitted from the JSON, and the assembled prompt is sent to the selected model; the image appears in the same gallery as Default mode results.

The whole Advanced mode can be turned off with the `advancedMode` flag on the Image Generator entry in `app/_tools/registry.ts`; when it is `false`, the mode switcher and the advanced panel are not rendered at all.
