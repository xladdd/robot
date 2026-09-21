Create a segmentation mask for exactly one object or coherent foreground region in the supplied image.

The output must be one image with the same composition and aspect ratio as the source:
- pure white (#ffffff) where the described region is visible;
- pure black (#000000) everywhere else;
- no gray, color, texture, shadows, labels, checkerboard, transparency, or regenerated artwork;
- preserve fine visible contours, holes, thin parts, and text edges where possible;
- do not include cast shadows or unrelated background unless they are part of the described object;
- the image itself is the mask, not a preview of the source.

Region name: {{name}}
Region description: {{description}}
