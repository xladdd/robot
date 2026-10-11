Complete exactly one foreground object in the supplied transparent crop.

Object name: {{name}}
Object description: {{description}}
Visible position in the original image: {{visibleBounds}}
Reconstruction area in the original image: {{reconstructionBounds}}
Objects that cover part of it in the reference: {{occludedBy}}

The supplied crop contains original visible pixels of the object and transparency elsewhere. Preserve the object's visible appearance and plausibly draw only the hidden or occluded continuation. Keep its shape, material, colour, perspective, pose, lighting, and scale consistent.

Return an RGBA image on a transparent background. Include only this object. Do not include another object, cast shadow, scenery, floor, surface, checkerboard, caption, or explanatory graphic. Preserve lettering or logos that physically belong to the object; do not invent new text.
