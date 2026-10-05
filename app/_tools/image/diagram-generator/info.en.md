### What is this?

Describe a biological subject and the structures to show, with up to three optional reference images and an Adobe Swatch Exchange palette. The generator first creates up to two text-free image candidates, lets you choose the composition, and then reconstructs the chosen image as a checked, editable semantic SVG.

### How does it work?

The workflow stays behind OpenRouter: a planner creates a conservative biological brief, a configured OpenRouter image model creates candidate compositions, and a configured multimodal OpenRouter model redraws the chosen candidate into complete layered vector shapes. Labels and leader lines are added afterwards as separate editable SVG objects. A strict server-side sanitizer rejects scripts, raster images, masks, clipping, external URLs, and model-supplied CSS. Optional visual and biology screening can recommend one bounded repair pass.

The completeness check is specifically intended to catch the common “hole under the nucleus” problem: the underlying cytoplasm or tissue must be a complete shape rather than a knockout or background-coloured patch. Automated checks are not expert biological verification. Review the artwork, labels, source rights, and uncertain anatomy before publication.
