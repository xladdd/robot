import { mkdir, writeFile } from "node:fs/promises";

const endpoint = process.argv[2] || "http://localhost:3001/api/covers";
const model = process.argv[3] || "black-forest-labs/flux.2-klein-4b";
const outputDir =
  process.argv[4] || "/private/tmp/robot-cover-eval/workflow-planner";
const audience = process.argv[5] || "upper-secondary";
const subject = process.argv[6] || "czech-language";
const keywords = process.argv[7] || "communication, bright colours";

await mkdir(outputDir, { recursive: true });

const credential = (process.env.APP_USERS || "")
  .split(",")
  .find((entry) => entry.includes(":"));
if (!credential)
  throw new Error("APP_USERS is not configured for the local workflow test.");
const separator = credential.indexOf(":");
const origin = new URL(endpoint).origin;
const login = await fetch(`${origin}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: credential.slice(0, separator).trim(),
    password: credential.slice(separator + 1),
  }),
});
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
if (!login.ok || !cookie) throw new Error("Local workflow login failed.");

const payload = {
  mode: "sketch",
  audience,
  subject,
  keywords,
  references: [],
  model,
  generationCount: 4,
};
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify(payload),
});
const result = await response.json();
if (!response.ok || !result.images?.length)
  throw new Error(
    result.error || `Workflow failed with HTTP ${response.status}.`,
  );

await writeFile(
  `${outputDir}/planner-response.json`,
  `${JSON.stringify({ payload, ...result }, null, 2)}\n`,
);
for (const [index, item] of result.images.entries()) {
  const encoded = item.data.split(",")[1];
  if (!encoded) throw new Error(`Output ${index} was not an inline image.`);
  const extension = item.data.startsWith("data:image/png") ? "png" : "jpg";
  await writeFile(
    `${outputDir}/cover-${String(index + 1).padStart(2, "0")}.${extension}`,
    Buffer.from(encoded, "base64"),
  );
}
const costs = result.images
  .map((item) => item.usage?.cost)
  .filter((cost) => typeof cost === "number");
if (typeof result.planner?.usage?.cost === "number")
  costs.push(result.planner.usage.cost);
process.stdout.write(
  `${JSON.stringify({ model, plannerModel: result.planner?.model, images: result.images.length, costs, total: costs.reduce((sum, cost) => sum + cost, 0), outputDir })}\n`,
);
