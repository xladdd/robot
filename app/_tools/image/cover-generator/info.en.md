### What is this?

Choose a textbook audience and subject, add optional keywords and reference covers, and request two or four concepts. You will get distinct, text-free cover artworks for later typography and layout in InDesign.

### How does it work?

Your choices and optional references are first sent through OpenRouter to `mistralai/mistral-medium-3-5 🇪🇺`, which turns them into structurally different artwork plans and broad reference guidance. If Medium cannot serve the request, OpenRouter may use the Mistral-family backup `mistralai/ministral-14b-2512 🇪🇺`; if neither planner responds, Robot uses local emergency directions and reports that fallback. Each plan is then sent to the selected image model: `black-forest-labs/flux.2-pro 🇩🇪` for a 1K result, `black-forest-labs/flux.2-klein-4b 🇩🇪` for a faster 512 px result, or `google/gemini-3.1-flash-lite-image 🇺🇸` for a 1K result. The generated images and a report are then displayed and can be downloaded together.
