### What is this?

Split one image into a layered PSD using Fast or Fidelity reconstruction. The result is an approximation, not a recovery of original source layers. Review warnings: failed segmentation or reconstruction may omit objects.

### How does it work?

The source image reaches OpenRouter for scene planning, RGBA decomposition, and missing-mask tracing. Ordinary cutouts use source RGB with estimated masks; eligible people and animals can instead be regenerated as full subjects, changing even visible RGB. Regenerated-subject mask tracing uses the reverse fallback order from ordinary missing-object masks.

Background cleanup reconstructs removed objects and shadows. The bottom Background layer can retain holes for support surfaces; the composited result is checked for opacity. Fidelity can estimate hidden object parts and regenerate eligible subjects, with validated fallback to source cutouts when reconstruction fails. Fast does not complete hidden parts. Neither mode guarantees a complete inventory, exact anatomy, or source-identical reconstruction. The server packages the result with ag-psd.
