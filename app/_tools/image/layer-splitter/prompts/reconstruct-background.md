Fill only the transparent hole in the supplied source crop with the background that plausibly continues behind the removed foreground object.

Background context: {{backgroundDescription}}

Preserve every visible source pixel around the transparent hole conceptually unchanged. Continue nearby lines, surfaces, texture, lighting, perspective, and depth through the missing area. Do not reconstruct the removed foreground object. Do not remove or rewrite visible content outside the hole, and do not add text or new objects.

Return one complete opaque crop with the transparent hole filled and no seam, checkerboard, blank patch, or object silhouette.
