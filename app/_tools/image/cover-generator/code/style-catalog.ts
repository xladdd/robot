import type { CoverTreatment } from "./types";

export const coverStylePrompts: Record<CoverTreatment, string> = {
  "atmospheric environmental photomontage":
    "Premium professionally retouched atmospheric environmental photomontage assembled from photographic elements, with coherent perspective, realistic materials, and publication-grade compositing.",
  "tactile editorial object montage":
    "Premium tactile editorial object montage using photographed objects and material cutouts, sophisticated physical texture, controlled shadows, and publication-grade compositing.",
  "scientific macro or material study":
    "Premium scientific material study using photographed laboratory materials, optical phenomena, physical models, or restrained dimensional illustration with credible detail and refined editorial finish.",
  "detailed stylized illustration montage":
    "Premium montage of detailed sophisticated stylized illustrations with tactile depth, nuanced modelling, intentional mark-making, and an editorial rather than flat-vector finish.",
  "coloured wood engraving":
    "Detailed coloured wood engraving with carved linework, layered hand-printed colour, tactile paper grain, dimensional hatching, and sophisticated editorial composition.",
  "modern risograph":
    "Modern full-bleed risograph image-making with layered spot colours, visible ink grain, subtle registration character, tactile texture, bold editorial shapes, and carefully controlled detail.",
  "ink-lined watercolour":
    "Ink-lined watercolour with precise expressive contours, translucent hand-painted washes, natural pigment variation, tactile paper texture, and refined editorial detail.",
  "20th century-style propaganda watercolour":
    "20th century-style propaganda watercolour with monumental composition, confident geometric staging, hand-painted tonal modelling, period print texture, dramatic editorial colour, unmarked surfaces, and non-partisan abstract geometry.",
};

export const coverStylePreviewImages: Record<CoverTreatment, string> = {
  "atmospheric environmental photomontage":
    "/cover-generator/style-previews/01-atmospheric-environmental-photomontage.jpg",
  "tactile editorial object montage":
    "/cover-generator/style-previews/02-tactile-editorial-object-montage.jpg",
  "scientific macro or material study":
    "/cover-generator/style-previews/03-scientific-macro-material-study.jpg",
  "detailed stylized illustration montage":
    "/cover-generator/style-previews/04-detailed-stylized-illustration-montage.jpg",
  "coloured wood engraving":
    "/cover-generator/style-previews/05-coloured-wood-engraving.jpg",
  "modern risograph":
    "/cover-generator/style-previews/06-modern-risograph.jpg",
  "ink-lined watercolour":
    "/cover-generator/style-previews/07-ink-lined-watercolour.jpg",
  "20th century-style propaganda watercolour":
    "/cover-generator/style-previews/08-propaganda-watercolour.jpg",
};
