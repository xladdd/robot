### What is this?

Prompt Extractor finds meaningful illustrations in a manuscript PDF of up to 20 pages.

The extractor separates independent visual assets, while keeping intentional groups together with useful counts and arrangement details. Prompts are returned in source-page order, with a blank line between page groups.

Empty areas, borders, logos, decorative marks, comments, and visible writing are ignored. Important visible colors, counts, poses, and arrangements are retained. Copy the finished list or download it as MD or TXT.

Always compare the prompts with the manuscript. Visual AI can miss an illustration or misunderstand an action.

### How does it work?

PDF.js checks the page count and renders every page locally as an overview plus enlarged detail views. The PDF text layer is never extracted or uploaded. Page images travel one page at a time through the protected server route to the configured vision model on OpenRouter, which inventories and verifies the visual assets. The browser groups the verified results by source page and formats them with blank-line page breaks.
