Fill the entire transparent cleanup region in the first supplied crop with the clean background that plausibly continues behind the removed foreground objects and their removed cast/contact shadows.

Background context: {{backgroundDescription}}

The first reference is the exact edit target with transparent cleanup regions. The second reference is the original version of the same crop and must be used only to understand surface boundaries, perspective, lighting, texture, and what must be removed. Reconstruct the environment shown around each transparent region; do not copy any foreground object, person, body part, shadow, reflection, text, or edge halo from the second reference.

Preserve every visible source pixel around the transparent region conceptually unchanged. Continue nearby lines and distinct surfaces through the missing area. Keep walls, tabletops, floors, and other planes separated at the same boundaries and perspective as the references. Reconstruct clean unshadowed surfaces instead of blending adjacent surface colours together. Do not remove or rewrite visible content outside the hole, and do not add text or new objects.

Return one complete opaque crop with every transparent hole filled and no seam, checkerboard, blank patch, foreground silhouette, or invented object.
