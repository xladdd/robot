Complete exactly one foreground object in the supplied transparent crop.

Object name: {{name}}
Object description: {{description}}
Visible position in the original image: {{visibleBounds}}
Reconstruction area in the original image: {{reconstructionBounds}}
Objects that cover part of it in the reference: {{occludedBy}}

The first supplied reference is a transparent cutout containing the object's original visible pixels. The second reference shows the same crop in its original scene context, including the named occluders. Use the first image as the immutable appearance reference and the second only to understand exactly where and how the object is covered. Preserve the visible object's exact pose and geometry; add only the minimum continuous hidden fragment needed behind each named occluder. Do not redesign, duplicate, move, extend, or replace any visible part.

Plausibly continue every contour entering an occluded region and reconnect it naturally on the other side. For people, preserve anatomically correct limb direction, joint placement, hand size, wrist alignment, palm orientation, and exactly five coherent fingers per hand; never add detached, duplicated, fused, or extra body parts. Do not preserve an occluder's edge, shadow, colour, text, or shape in the completed object. Keep material, colour, perspective, pose, lighting, and scale consistent.

Return the complete object as RGBA on a transparent background, including its unchanged visible reference portion and only plausible hidden continuations. Include only this object. Do not include an occluding object, cast shadow, scenery, floor, surface, checkerboard, caption, or explanatory graphic. Preserve lettering or logos that physically belong to the object; do not invent new text.
