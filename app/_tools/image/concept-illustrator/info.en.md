### What is this?

Concept Illustrator turns an article into three concise editorial illustration directions. Select and edit one direction, generate a single image, then keep refining it through a visible revision history. An editor can critique, approve or reject the active revision, attach a note, and save the active revision as final.

### Local memory and privacy

Projects, article text, compiled prompts, decisions, notes, image revisions, and the persistent House style profile are saved in this browser using IndexedDB. Image data and compressed style references are stored as data URLs, which can use significant browser quota. If storage is unavailable or full, the app shows a memory error. Clearing site data/browser storage clears all Concept Illustrator memory. Nothing is synchronized to another browser or device.

### AI processing and costs

Planning, prompt compilation, image generation, image editing, and critique use the Concept Illustrations API and are processed through OpenRouter. The article, written style guidance, aspect ratio, and relevant recent approval/rejection notes are sent when needed for planning or compilation. House-style reference illustrations are sent with generation requests; the first two are sent with image-edit requests. The active generated image is also sent for edits and critiques.

Each image generation, edit, and explicit critique can incur model usage and cost. Critique never starts automatically, and applying critique corrections only fills the edit instruction—you must confirm the new revision separately. Reference files are accepted as PNG, JPEG, or WebP up to 30 MB, compressed locally to JPEG with a maximum side of 1600 px, and then stored locally in the House style profile.
