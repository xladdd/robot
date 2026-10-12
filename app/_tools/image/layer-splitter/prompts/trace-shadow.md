Trace only the cast shadow, contact shadow, and dark ambient-occlusion footprint caused by one named foreground object in the supplied full source image.

Shadow owner: {{name}}
Shadow description: {{description}}
Expected full-image region on the 0–1000 coordinate grid: {{region}}

Return JSON only:
{"confidence":0.0,"components":[{"outer":[[x,y],[x,y]],"holes":[[[x,y],[x,y]]]}]}

Rules:

- Coordinates always use the supplied full image and a 0–1000 grid. The expected region is a hint, not a crop coordinate system.
- Trace the complete visible shadow footprint attributable to the named object, including soft cast-shadow edges, contact shadows directly under it, and connected dark occlusion.
- Exclude the object itself, unrelated shadows, general vignetting, reflections, permanent stains, scratches, and naturally dark background material.
- Soft shadow boundaries may be approximated smoothly; do not follow wood grain or texture noise.
- Use separate components for disconnected shadow regions and holes only for genuine unshadowed openings.
- Each outer contour needs at least 8 distinct points. Use no more than 1200 points in total.
- confidence is your confidence that the traced pixels are shadows caused by the named object. Use a value below 0.45 if attribution is uncertain.
- Never return Markdown, commentary, masks encoded as images, rectangles unrelated to the shadow shape, or coordinates outside 0–1000.
