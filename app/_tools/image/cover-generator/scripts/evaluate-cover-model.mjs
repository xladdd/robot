import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");

const outputDir = process.argv[2] || "/private/tmp/robot-cover-eval/results";
const model = process.argv[3] || "black-forest-labs/flux.2-pro";
const variant = process.argv[4] || "structured";
const resolution = process.argv[5] || "1K";
const fullReferencePaths = [
  "/private/tmp/robot-cover-eval/refs/BI5.jpg",
  "/private/tmp/robot-cover-eval/refs/BI6.jpg",
  "/private/tmp/robot-cover-eval/refs/BI7.jpg",
];
const artReferencePaths = [
  "/private/tmp/robot-cover-eval/refs-art/BI5-art.jpg",
  "/private/tmp/robot-cover-eval/refs-art/BI6-art.jpg",
  "/private/tmp/robot-cover-eval/refs-art/BI7-art.jpg",
];

const brief =
  "A biology cover: the evolution of humans in the foreground, with different energy sources—coal, nuclear, and solar—in the background. Rivers and a DNA spiral in front.";
const prompts = {
  baseline: `Create a cover concept for an educational textbook. The source covers are the primary visual specification. Match their visual medium, realism level, colour treatment, lighting logic, compositing finish, image density, age appropriateness, and series-level art direction with high fidelity. First infer the dominant visual medium of the reference covers and reproduce that same medium faithfully. Do not render readable typography. Reserve a calm title-safe area in the upper third. The requested new cover: ${brief}`,
  structured_crop: `Use reference images 1, 2, and 3 only as cropped art-direction samples from the same Romanian school biology cover series. Infer the repeated image-making grammar shared by all three—not the specific animals, anatomical models, words, logos, grade numerals, badges, or author panels.

Create only the full-bleed cover artwork for a new member of that series, portrait 3:4.

Art direction: a deliberately constructed premium educational photo-collage, assembled from sharply cut-out photographic and scientific-image elements. It is not a single natural camera scene and not a painterly illustration. Use crisp subject edges, realistic source-photo texture, convincing anatomy and materials, controlled studio-like highlights, saturated print colour, and coherent warm atmospheric colour grading across the composite.

Composition from top to bottom:
- upper 36 percent: calm burnt-orange gradient sky, visually quiet and suitable for later title typography;
- middle distance: a broad green landscape band with solar panels, wind turbines, a distant coal/nuclear power complex, and a readable left-to-right museum-diorama silhouette sequence showing human evolution; every hominin is non-explicit and wears simple historically neutral coverings;
- foreground: a dramatic photographic river/water band, rocky banks, and one large colourful DNA double helix bridging the lower foreground;
- clear depth separation between foreground, middle ground, and background, with high image density below the title-safe zone.

The fully clothed, classroom-safe human-evolution figures are the main focal point. Keep all anatomy credible and all energy technologies recognisable. Make the collage look like professionally retouched stock photography prepared for an educational publisher. Render no title, letters, numerals, logos, seals, watermarks, labels, frames, or author boxes. Requested subject: ${brief}`,
};

if (!prompts[variant]) throw new Error(`Unknown prompt variant: ${variant}`);
const referencePaths = variant.endsWith("_crop")
  ? artReferencePaths
  : fullReferencePaths;

const references = await Promise.all(
  referencePaths.map(async (path) => {
    const bytes = await readFile(path);
    const mime =
      extname(path).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
    return {
      type: "image_url",
      image_url: { url: `data:${mime};base64,${bytes.toString("base64")}` },
    };
  }),
);

await mkdir(outputDir, { recursive: true });
const startedAt = new Date().toISOString();
const isGemini = model === "google/gemini-3.1-flash-lite-image";
const response = await fetch("https://openrouter.ai/api/v1/images", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Taktik Robot cover evaluation",
  },
  body: JSON.stringify({
    model,
    prompt: prompts[variant],
    input_references: references,
    aspect_ratio: "3:4",
    resolution: isGemini ? "1K" : resolution,
    ...(isGemini ? { n: 1 } : { output_format: "jpeg", seed: 260826 }),
  }),
});

const result = await response.json();
if (!response.ok || !result.data?.[0]?.b64_json) {
  throw new Error(
    result.error?.message || `Generation failed with HTTP ${response.status}.`,
  );
}

const stem = `${variant}-${model.split("/").at(-1)}-${resolution}`;
const mediaType = result.data[0].media_type || "image/jpeg";
const extension = mediaType === "image/png" ? "png" : "jpg";
await writeFile(
  join(outputDir, `${stem}.${extension}`),
  Buffer.from(result.data[0].b64_json, "base64"),
);
const record = {
  startedAt,
  completedAt: new Date().toISOString(),
  model,
  variant,
  resolution,
  seed: isGemini ? null : 260826,
  references: referencePaths,
  prompt: prompts[variant],
  generationId: result.id || null,
  usage: result.usage || null,
};
await writeFile(
  join(outputDir, `${stem}.json`),
  `${JSON.stringify(record, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify({ image: join(outputDir, `${stem}.jpg`), usage: result.usage || null })}\n`,
);
