Trace the complete visible mask of exactly one object in the supplied full image.

Object name: {{name}}
Object description: {{description}}
Target region on the full-image 0-1000 grid: {{region}}

Return JSON with a confidence from 0 to 1 and one component for every disconnected visible part. Each component has one outer boundary and zero or more holes:
{"confidence":0.95,"components":[{"outer":[{"x":0,"y":0}],"holes":[[{"x":0,"y":0}]]}]}

Rules:

- Coordinates are on the supplied full image.
- Both coordinates are numbers on a 0-1000 grid: x measures from the full image's left edge and y from its top edge.
- Every outer boundary and hole is an ordered loop with at least three distinct points. Do not repeat the first point at the end.
- Use separate components for disconnected visible areas. Do not connect them through background or through an occluding object.
- Represent every genuine opening as a hole, including gaps between limbs, handles, chair structures, and enclosed background.
- Use enough vertices to follow the visible silhouette accurately, including narrow parts and concavities, but no more than 1200 points in total.
- Trace only the named object inside the target region. Exclude other objects, cast shadows, reflections, glow, and background.
- Stay on the actual visible edge. Do not shrink the object and do not add a rectangular margin.
- If the named object cannot be identified reliably, return a low confidence rather than inventing a shape.
- Return only the JSON object, without markdown or explanation.
