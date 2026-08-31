import { mkdir, readFile, writeFile } from "node:fs/promises";

const endpoint = process.argv[2] || "http://localhost:3001/api/covers";
const mode = process.argv[3] || "sketch";
const selectedIndex = Number(process.argv[4] || 0);
const quality = process.argv[5] || "fast";
const outputDir = "/private/tmp/robot-cover-eval/workflow";
const referencePaths = [
  "/private/tmp/robot-cover-eval/refs-art/BI5-art.jpg",
  "/private/tmp/robot-cover-eval/refs-art/BI6-art.jpg",
  "/private/tmp/robot-cover-eval/refs-art/BI7-art.jpg",
];
const brief = "A biology cover: the evolution of humans in the foreground, with different energy sources (coal, nuclear, solar) in the background. Rivers and a DNA spiral up front.";

const asDataUrl = async (path) => `data:image/jpeg;base64,${(await readFile(path)).toString("base64")}`;
const references = await Promise.all(referencePaths.map(asDataUrl));
await mkdir(outputDir, { recursive: true });

const credential = (process.env.APP_USERS || "").split(",").find((entry) => entry.includes(":"));
if (!credential) throw new Error("APP_USERS is not configured for the local workflow test.");
const separator = credential.indexOf(":");
const origin = new URL(endpoint).origin;
const login = await fetch(`${origin}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: credential.slice(0, separator).trim(), password: credential.slice(separator + 1) }),
});
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
if (!login.ok || !cookie) throw new Error("Local workflow login failed.");

let payload;
if (mode === "sketch") {
  payload = { mode, brief, references, medium: "photo", sketchQuality: quality, useShutterstock: false };
} else if (mode === "layers") {
  const sketches = JSON.parse(await readFile(`${outputDir}/sketch-response.json`, "utf8"));
  const direction = sketches.images?.[selectedIndex]?.data;
  if (!direction) throw new Error(`Sketch ${selectedIndex} does not exist.`);
  payload = { mode, brief, references, direction, medium: "photo", layers: ["Large colourful photographic DNA double helix foreground asset"], useShutterstock: false };
} else {
  throw new Error(`Unsupported mode: ${mode}`);
}

const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(payload) });
const result = await response.json();
if (!response.ok || !result.images?.length) throw new Error(result.error || `Workflow failed with HTTP ${response.status}.`);

await writeFile(`${outputDir}/${mode}-response.json`, `${JSON.stringify(result, null, 2)}\n`);
for (const [index, item] of result.images.entries()) {
  const encoded = item.data.split(",")[1];
  if (!encoded) throw new Error(`Output ${index} was not an inline image.`);
  await writeFile(`${outputDir}/${mode}-${String(index + 1).padStart(2, "0")}.jpg`, Buffer.from(encoded, "base64"));
}
const costs = result.images.map((item) => item.usage?.cost).filter((cost) => typeof cost === "number");
process.stdout.write(`${JSON.stringify({ mode, images: result.images.length, costs, total: costs.reduce((sum, cost) => sum + cost, 0), outputDir })}\n`);
