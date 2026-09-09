import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openRouterApps } from "../config.ts";

const managementKey = process.env.OPENROUTER_MANAGEMENT_API_KEY;
const apiUrl = "https://openrouter.ai/api/v1/keys";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const localEnvPath = join(root, ".env.local");
const keyNamePrefix = "Taktik Robot / ";

if (!managementKey) {
  throw new Error(
    "OPENROUTER_MANAGEMENT_API_KEY is missing. Put it in .env.openrouter-management.local before running this command.",
  );
}

const configuredLimit = process.env.OPENROUTER_APP_KEY_LIMIT_USD;
const limit =
  configuredLimit === undefined || configuredLimit === ""
    ? undefined
    : Number(configuredLimit);
if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
  throw new Error(
    "OPENROUTER_APP_KEY_LIMIT_USD must be a positive number when provided.",
  );
}

const configuredReset = process.env.OPENROUTER_APP_KEY_LIMIT_RESET || "monthly";
if (!["daily", "weekly", "monthly"].includes(configuredReset)) {
  throw new Error(
    "OPENROUTER_APP_KEY_LIMIT_RESET must be daily, weekly, or monthly.",
  );
}

async function openRouter(path = "", init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${managementKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const result = (await response.json()) as {
    data?: unknown;
    key?: unknown;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(
      result.error?.message ||
        `OpenRouter key management failed with HTTP ${response.status}.`,
    );
  return result;
}

async function readLocalEnv() {
  try {
    return await readFile(localEnvPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function envValue(contents: string, name: string) {
  const match = contents.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^(['"])(.*)\1$/, "$2");
}

async function writeEnvValue(contents: string, name: string, value: string) {
  const line = `${name}=${value}`;
  const expression = new RegExp(`^${name}=.*$`, "m");
  const next = expression.test(contents)
    ? contents.replace(expression, line)
    : `${contents.trimEnd()}${contents.trim() ? "\n" : ""}${line}\n`;
  await writeFile(localEnvPath, next, { mode: 0o600 });
  await chmod(localEnvPath, 0o600);
  return next;
}

type ListedKey = { hash?: string; name?: string; disabled?: boolean };
async function listRemoteKeys() {
  const keys: ListedKey[] = [];
  for (let offset = 0; ; offset += 100) {
    const listed = await openRouter(`?offset=${offset}`);
    const page = Array.isArray(listed.data) ? (listed.data as ListedKey[]) : [];
    keys.push(...page);
    if (page.length < 100) return keys;
  }
}

const remoteKeys = await listRemoteKeys();
let localEnv = await readLocalEnv();
let created = 0;
let retained = 0;

for (const config of Object.values(openRouterApps)) {
  if (envValue(localEnv, config.envName)) {
    retained += 1;
    console.log(`Kept ${config.envName} from .env.local.`);
    continue;
  }

  const name = `${keyNamePrefix}${config.name}`;
  const existing = remoteKeys.find((key) => key.name === name && !key.disabled);
  if (existing) {
    throw new Error(
      `${name} already exists in OpenRouter, but ${config.envName} is absent from .env.local. OpenRouter cannot reveal an existing plaintext key. Add that key to .env.local if you retained it, or disable/delete it in OpenRouter before rerunning provisioning.`,
    );
  }

  const createdKey = await openRouter("", {
    method: "POST",
    body: JSON.stringify({
      name,
      ...(limit === undefined ? {} : { limit, limit_reset: configuredReset }),
    }),
  });
  if (typeof createdKey.key !== "string" || !createdKey.key) {
    throw new Error(
      `OpenRouter created ${name} without returning its plaintext key.`,
    );
  }
  localEnv = await writeEnvValue(localEnv, config.envName, createdKey.key);
  created += 1;
  console.log(`Created ${name} and saved ${config.envName} to .env.local.`);
}

console.log(
  `Provisioning complete: ${created} created, ${retained} already configured.`,
);
console.log(
  "Only copy the eight OPENROUTER_*_API_KEY values from .env.local into your production deployment secrets. Do not deploy OPENROUTER_MANAGEMENT_API_KEY.",
);
