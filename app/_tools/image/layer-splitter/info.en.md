### What is this?

Upload one image and choose Fast or Fidelity reconstruction. You will get a layered PSD with a full background and separate transparent foreground-object layers, including generated approximations of parts hidden in the source.

### How does it work?

The source image is sent through OpenRouter to `mistralai/mistral-small-2603 🇪🇺`, which identifies the useful layers. Robot then asks either `black-forest-labs/flux.2-klein-4b 🇩🇪` or `black-forest-labs/flux.2-pro 🇩🇪` to reconstruct the background and each object separately. `sharp` removes the generated chroma-key backgrounds, Robot validates and composites the layers, and `ag-psd` assembles the downloadable PSD.
