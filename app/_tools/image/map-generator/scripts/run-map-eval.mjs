import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const index = Number(process.argv[2]);
const attempt = Number(process.argv[3] || 1);
const evaluationModel = process.argv[4] || "";
if (!Number.isInteger(index) || index < 1 || index > 5) throw new Error("Usage: node app/_tools/image/map-generator/scripts/run-map-eval.mjs <prompt 1-5> [attempt]");

const source = await fs.readFile("map-test-results/prompts.md", "utf8");
const entries = [...source.matchAll(/^# (.+)\n\nPrompt: "([\s\S]*?)"$/gm)].map(([, title, prompt]) => ({ title, prompt }));
const entry = entries[index - 1];
if (!entry) throw new Error(`Prompt ${index} was not found.`);

const users = process.env.APP_USERS || "";
const first = users.split(",")[0] || "";
const separator = first.indexOf(":");
if (separator < 1) throw new Error("APP_USERS is not configured.");
const credentials = { username: first.slice(0, separator).trim(), password: first.slice(separator + 1) };
const base = process.env.MAP_EVAL_URL || "http://localhost:3001";
const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(credentials) });
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0] || "";
if (!login.ok || !cookie) throw new Error(`Login failed (${login.status}).`);

const started = Date.now();
const response = await fetch(`${base}/api/figures`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ request: entry.prompt, mode: "map", references: [], palette: [], evaluationModel }) });
const result = await response.json();
const seconds = Math.round((Date.now() - started) / 1000);
const slug = entry.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const directory = path.join("map-test-results", `${index}-${slug}`);
await fs.mkdir(directory, { recursive: true });
const modelTag = evaluationModel ? `${evaluationModel.split("/").at(-1).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-` : "";
const baseName = `${modelTag}attempt-${String(attempt).padStart(2, "0")}`;
await fs.writeFile(path.join(directory, `${baseName}.json`), JSON.stringify({ prompt: entry.prompt, status: response.status, seconds, result }, null, 2));
if (typeof result.svg === "string") {
  await fs.writeFile(path.join(directory, `${baseName}.svg`), result.svg);
  await sharp(Buffer.from(result.svg)).png().toFile(path.join(directory, `${baseName}.png`));
}
console.log(JSON.stringify({ index, title: entry.title, attempt, status: response.status, seconds, error: result.error || null, model: result.model || null, geometry: result.spec?.geometry || null, regions: result.spec?.regions?.length || 0, labels: result.spec?.labels?.length || 0, svg: typeof result.svg === "string" ? path.join(directory, `${baseName}.svg`) : null, png: typeof result.svg === "string" ? path.join(directory, `${baseName}.png`) : null }));
