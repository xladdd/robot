import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const endpoint = process.argv[2] || "http://localhost:3001/api/covers";
const outputDir = process.argv[3] || "cover-workflow-results/full-workflow-2026-08-24";
const brief = "A biology cover: the evolution of humans in the foreground, with coal, nuclear and solar energy in the background. Rivers and a DNA spiral in front.";
const referencePaths = [
  "/private/tmp/robot-cover-eval/refs-art/BI5-art.jpg",
  "/private/tmp/robot-cover-eval/refs-art/BI6-art.jpg",
  "/private/tmp/robot-cover-eval/refs-art/BI7-art.jpg",
];

const credential = (process.env.APP_USERS || "").split(",").find((entry) => entry.includes(":"));
if (!credential) throw new Error("APP_USERS is not configured.");
const separator = credential.indexOf(":");
const origin = new URL(endpoint).origin;
const login = await fetch(`${origin}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: credential.slice(0, separator).trim(), password: credential.slice(separator + 1) }),
});
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
if (!login.ok || !cookie) throw new Error("Local workflow login failed.");

const references = await Promise.all(referencePaths.map(async (path) => `data:image/jpeg;base64,${(await readFile(path)).toString("base64")}`));
const common = { brief, references, medium: "photo", useShutterstock: false, stockInputs: [] };
const apiRecords = [];

async function post(stage, payload) {
  process.stdout.write(`${stage}\n`);
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${stage}: ${result.error || `HTTP ${response.status}`}`);
  apiRecords.push({ stage, result });
  return result;
}

await mkdir(outputDir, { recursive: true });
const first = await post("1/5 initial concept", { ...common, mode: "sketch", sketchQuality: "fast", generationCount: 1 });
const firstDirection = first.images?.[0];
if (!firstDirection) throw new Error("Initial concept returned no image.");

const refined = await post("2/5 variation from selected direction", { ...common, mode: "sketch", sketchQuality: "fast", generationCount: 1, direction: firstDirection.data });
const selected = refined.images?.[0];
if (!selected) throw new Error("Selected-direction variation returned no image.");

const analysis = await post("3/5 automatic stem detection", { ...common, mode: "analyze", direction: selected.data, maxAssets: 2 });
const master = await post("4/5 2K cover master", { ...common, mode: "master", direction: selected.data });
const stems = await post("5/5 regenerate isolated 2K stems", { ...common, mode: "layers", direction: selected.data, layers: analysis.assets.map((asset) => `${asset.name}: ${asset.description}`) });

const imageEntries = [];
function imageBytes(dataUrl) {
  const encoded = dataUrl?.split(",")[1];
  if (!encoded) throw new Error("Generation returned a non-inline image.");
  return Buffer.from(encoded, "base64");
}
imageEntries.push({ name: "concepts/round-01/selected-direction.jpg", data: imageBytes(firstDirection.data) });
imageEntries.push({ name: "concepts/round-02/selected-final.jpg", data: imageBytes(selected.data) });
imageEntries.push({ name: "production/master/cover-master-2k.jpg", data: imageBytes(master.images[0].data) });
for (const [index, item] of stems.images.entries()) {
  const safe = (analysis.assets[index]?.name || item.name || `stem-${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  imageEntries.push({ name: `production/stems/${safe || `stem-${index + 1}`}.jpg`, data: imageBytes(item.data) });
}

const tasks = [
  { type: "initial concept", output: "round-01/selected-direction", ...firstDirection },
  { type: "selected-direction variation", output: "round-02/selected-final", ...selected },
  { type: "object analysis", output: analysis.assets.map((asset) => asset.name).join(", "), ...analysis },
  { type: "2K master", output: "cover-master-2k", ...master.images[0] },
  ...stems.images.map((item, index) => ({ type: "regenerated stem", output: analysis.assets[index]?.name || item.name || `stem-${index + 1}`, ...item })),
];
const total = tasks.reduce((sum, task) => sum + (task.usage?.cost || 0), 0);
const report = [
  "# Cover generation report",
  "",
  `- Exported: ${new Date().toISOString()}`,
  `- Brief: ${brief}`,
  `- Reference covers: ${referencePaths.map((path) => path.split("/").at(-1)).join(", ")}`,
  "- Ignore text in reference images: yes",
  "- Shutterstock research: disabled",
  `- Generation tasks: ${tasks.length}`,
  `- Total credits: ${total.toFixed(6)}`,
  "",
  "## Detected stems",
  "",
  ...analysis.assets.map((asset, index) => `${index + 1}. **${asset.name}** — ${asset.description}`),
  "",
  "## Separate generation tasks",
  "",
  "| # | Type | Output | Model | Seed | Credits | OpenRouter generation | Shutterstock |",
  "|---:|---|---|---|---:|---:|---|---|",
  ...tasks.map((task, index) => `| ${index + 1} | ${task.type} | ${task.output} | ${task.model || "not reported"} | ${task.seed ?? "—"} | ${task.usage?.cost == null ? "not reported" : task.usage.cost.toFixed(6)} | ${task.generationId || "not reported"} | — |`),
  "",
  "## Shutterstock sources",
  "",
  "No Shutterstock previews were used.",
  "",
  "> WARNING: When Shutterstock research is enabled, previews are watermarked and unlicensed research references. License every linked source before publication.",
  "",
].join("\n");
const project = {
  project: "Taktik Robot",
  brief,
  references: referencePaths,
  ignoreTextInReferences: true,
  selectedInitialGeneration: firstDirection.generationId || null,
  selectedFinalGeneration: selected.generationId || null,
  objectAnalysis: analysis,
  master: { name: master.images[0].name, generationId: master.images[0].generationId, seed: master.images[0].seed, model: master.images[0].model, usage: master.images[0].usage },
  stems: stems.images.map((item, index) => ({ name: analysis.assets[index]?.name || item.name, generationId: item.generationId, seed: item.seed, model: item.model, usage: item.usage })),
  totalCredits: total,
  exportedAt: new Date().toISOString(),
};

const entries = [
  ...imageEntries,
  { name: "generation-report.md", data: Buffer.from(report) },
  { name: "project.json", data: Buffer.from(`${JSON.stringify(project, null, 2)}\n`) },
];
for (const entry of entries) await writeFile(join(outputDir, entry.name), entry.data).catch(async (error) => {
  if (error?.code !== "ENOENT") throw error;
  await mkdir(join(outputDir, entry.name.split("/").slice(0, -1).join("/")), { recursive: true });
  await writeFile(join(outputDir, entry.name), entry.data);
});
await writeFile(join(outputDir, "robot-cover-project.zip"), createZip(entries));
process.stdout.write(`${JSON.stringify({ outputDir, zip: join(outputDir, "robot-cover-project.zip"), totalCredits: total, tasks: tasks.length, stems: analysis.assets.map((asset) => asset.name) })}\n`);

function createZip(entriesToZip) {
  const chunks = []; const central = []; let offset = 0;
  for (const entry of entriesToZip) {
    const name = Buffer.from(entry.name); const data = Buffer.from(entry.data); const checksum = crc32(data);
    const header = Buffer.alloc(30 + name.length); header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt32LE(checksum, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26); name.copy(header, 30);
    chunks.push(header, data);
    const record = Buffer.alloc(46 + name.length); record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt32LE(checksum, 16); record.writeUInt32LE(data.length, 20); record.writeUInt32LE(data.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42); name.copy(record, 46); central.push(record); offset += header.length + data.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entriesToZip.length, 8); end.writeUInt16LE(entriesToZip.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...chunks, ...central, end]);
}

function crc32(bytes) {
  let crc = -1;
  for (const value of bytes) { crc ^= value; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ -1) >>> 0;
}
