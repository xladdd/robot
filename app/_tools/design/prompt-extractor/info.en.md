### What is this?

Prompt Extractor finds meaningful illustrations in a manuscript PDF of up to 20 pages.

The extractor separates independent visual assets, while keeping intentional groups together with useful counts and arrangement details. Assets extracted from a framed illustration with a developed background are grouped under COMPLEX.

Empty areas, borders, logos, decorative marks and visible writing are ignored. Copy the finished list or download it as MD or TXT.

Always compare the prompts with the manuscript. Visual AI can miss an illustration or misunderstand an action.

### How does it work?

PDF.js checks the page count and renders every page locally as an image. The PDF text layer is never extracted or uploaded. Page images travel in small batches through the protected server route to the fixed Mistral Medium 3.5 vision model on OpenRouter, which returns structured illustration descriptions. The browser groups and formats those descriptions.
