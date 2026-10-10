export type ImageStylePreset = {
  id: string;
  prompt: string;
  seed?: number;
};

// Style presets mirror the Cover Generator visual treatment catalog; the
// storybook presets additionally pin the generation seed.
export const imageStylePresets: readonly ImageStylePreset[] = [
  {
    id: "atmospheric environmental photomontage",
    prompt:
      "Premium professionally retouched atmospheric environmental photomontage assembled from photographic elements, with coherent perspective, realistic materials, and publication-grade compositing.",
  },
  {
    id: "tactile editorial object montage",
    prompt:
      "Premium tactile editorial object montage using photographed objects and material cutouts, sophisticated physical texture, controlled shadows, and publication-grade compositing.",
  },
  {
    id: "scientific macro or material study",
    prompt:
      "Premium scientific material study using photographed laboratory materials, optical phenomena, physical models, or restrained dimensional illustration with credible detail and refined editorial finish.",
  },
  {
    id: "detailed stylized illustration montage",
    prompt:
      "Premium montage of detailed sophisticated stylized illustrations with tactile depth, nuanced modelling, intentional mark-making, and an editorial rather than flat-vector finish.",
  },
  {
    id: "coloured wood engraving",
    prompt:
      "Detailed coloured wood engraving with carved linework, layered hand-printed colour, tactile paper grain, dimensional hatching, and sophisticated editorial composition.",
  },
  {
    id: "modern risograph",
    prompt:
      "Modern full-bleed risograph image-making with layered spot colours, visible ink grain, subtle registration character, tactile texture, bold editorial shapes, and carefully controlled detail.",
  },
  {
    id: "ink-lined watercolour",
    prompt:
      "Ink-lined watercolour with precise expressive contours, translucent hand-painted washes, natural pigment variation, tactile paper texture, and refined editorial detail.",
  },
  {
    id: "20th century-style propaganda watercolour",
    prompt:
      "20th century-style propaganda watercolour with monumental composition, confident geometric staging, hand-painted tonal modelling, period print texture, dramatic editorial colour, unmarked surfaces, and non-partisan abstract geometry.",
  },
  {
    id: "storybook-object",
    prompt:
      "A polished hand-drawn 2D children's picture-book spot illustration, painted in vivid opaque watercolor and gouache with fine colored-pencil details. Preserve the named inanimate object, its characteristic parts, natural colors and recognizable shape. A bold, simple silhouette with slightly irregular colored outlines, broad painted color areas, delicate short brush marks following its surface, gentle tonal transitions and small hand-painted highlights. Show the entire subject large and centered, mostly front-facing when appropriate, on a clean white page with a tiny diffuse warm beige brush-painted shadow underneath.",
    seed: 8701,
  },
  {
    id: "storybook-character",
    prompt:
      "A bright children's picture-book spot illustration in a softly shaded, hand-painted 3D storybook cartoon style with a delicate watercolor-gouache grain and lightly painted outlines. Preserve the subject's species or human identity, age, markings, clothing where present, anatomy and specified pose. Cute rounded shapes, gently enlarged head, expressive dark eyes with small catchlights when awake, relaxed closed eyes when sleeping, and a natural mouth suited to the action. Soft painted fur, feathers, hair or skin as appropriate, vibrant subject-appropriate colors, airy even lighting and gently blended shadows. Show the complete character centered on a pure white page with a tiny pale warm contact shadow directly beneath it.",
    seed: 8701,
  },
];
