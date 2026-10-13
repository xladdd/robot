import { chmod, lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendEnvValue,
  assertSeparateKeys,
  buildPlan,
  configuredLimits,
  keyHash,
  managedApps,
  parseOptions,
  readEnv,
  type RemoteKey,
} from "./key-management.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const devPath = join(root, ".env.local");
const deployPath = join(root, ".env.openrouter-deploy.local");
const lockPath = join(root, ".env.openrouter-keys.lock");
const apiUrl = "https://openrouter.ai/api/v1/keys";

async function readEnvironment(path: string) {
  try {
    const entry = await lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error("Environment files must be regular files, not symlinks.");
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw new Error("Cannot safely read a key environment file.");
  }
}

async function reserveWrite(path: string) {
  const temporary = `${path}.write-${process.pid}`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.sync();
    } catch {
      await file.close();
      await unlink(temporary);
      throw new Error("sync failed");
    }
    return { file, temporary };
  } catch {
    throw new Error(
      "Cannot reserve a protected secret file; no new key was requested.",
    );
  }
}

async function persist(
  path: string,
  contents: string,
  pending?: Awaited<ReturnType<typeof reserveWrite>>,
) {
  const { file, temporary } = pending ?? (await reserveWrite(path));
  try {
    await file.writeFile(contents, "utf8");
    await file.sync();
    await file.close();
    await rename(temporary, path);
    const directory = await open(root, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch {
    await file.close().catch(() => {});
    // Keep the protected temporary file for recovery if the rename failed.
    throw new Error(
      "Secret persistence failed. Stop provisioning and recover the protected .write file; a key may already exist remotely.",
    );
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const managementKey = process.env.OPENROUTER_MANAGEMENT_API_KEY;
  if (!managementKey)
    throw new Error(
      "OPENROUTER_MANAGEMENT_API_KEY is missing; configure .env.openrouter-management.local.",
    );

  async function request(path = "", init: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetch(`${apiUrl}${path}`, {
        ...init,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${managementKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error(
        "OpenRouter key-management request failed. Do not retry a creation blindly; inspect remote keys first.",
      );
    }
    if (!response.ok)
      throw new Error(
        `OpenRouter key management returned HTTP ${response.status}; no response body or credentials were logged.`,
      );
    try {
      return (await response.json()) as { data?: unknown; key?: unknown };
    } catch {
      throw new Error(
        "OpenRouter returned invalid JSON; a creation may already have succeeded. Inspect remote keys before retrying.",
      );
    }
  }

  let lock: Awaited<ReturnType<typeof open>> | undefined;
  if (!options.dryRun) {
    try {
      lock = await open(lockPath, "wx", 0o600);
      await lock.writeFile(`${process.pid}\n`);
    } catch {
      throw new Error(
        "Another key-management run or stale .env.openrouter-keys.lock exists. Investigate it before retrying.",
      );
    }
  }
  try {
    const devContents = await readEnvironment(devPath);
    const deployContents = await readEnvironment(deployPath);
    const dev = readEnv(devContents);
    const deploy = readEnv(deployContents, true);
    assertSeparateKeys(dev, deploy);
    const keys: RemoteKey[] = [];
    for (let offset = 0; ; offset += 100) {
      const result = await request(
        `?include_disabled=true&include_expired=true&offset=${offset}`,
      );
      if (
        !Array.isArray(result.data) ||
        result.data.some(
          (key) =>
            !key ||
            typeof key.hash !== "string" ||
            typeof key.name !== "string" ||
            typeof key.disabled !== "boolean",
        )
      )
        throw new Error("OpenRouter returned an invalid key list.");
      const page = result.data as RemoteKey[];
      keys.push(...page);
      if (page.length < 100) break;
    }

    const defaults = configuredLimits(process.env);
    if (options.action === "verify") {
      for (const [target, env] of [
        ["dev", dev],
        ["deploy", deploy],
      ] as const) {
        if (managedApps.some((app) => !env[app.envName]))
          throw new Error(`The ${target.toUpperCase()} set is incomplete.`);
        buildPlan(
          { action: "provision", target, dryRun: true },
          dev,
          deploy,
          keys,
          defaults,
        );
      }
      console.log(
        `Verified ${managedApps.length} DEV and ${managedApps.length} DEPLOY keys: complete, distinct, active, and correctly named.`,
      );
      return;
    }

    // Validate the entire plan before the first mutation, including name collisions.
    const plan = buildPlan(options, dev, deploy, keys, defaults);
    for (const item of plan) {
      console.log(
        `${options.dryRun ? "[dry-run] " : ""}${item.operation.toUpperCase()} ${item.name}${item.operation === "create" ? ` (limit: ${item.limits?.limit ?? "unlimited"}; reset: ${item.limits?.limit_reset ?? "none"})` : ""}`,
      );
    }
    if (options.action === "rename-dev") {
      const missing = managedApps.filter((app) => !dev[app.envName]);
      if (missing.length)
        console.log(
          `Not configured locally, not renamed: ${missing.map((app) => app.slug).join(", ")}. Provision DEV separately.`,
        );
    }
    if (options.dryRun) {
      console.log("Dry run complete. No keys or environment files changed.");
      return;
    }

    const targetPath = options.target === "dev" ? devPath : deployPath;
    let contents = options.target === "dev" ? devContents : deployContents;
    if (plan.some((item) => item.operation === "create")) {
      // Prove the destination is writable and protected before creating a write-only secret.
      if (contents) await chmod(targetPath, 0o600);
      await persist(
        targetPath,
        contents ||
          "# OpenRouter per-app inference keys. Never commit or print this file.\n",
      );
      contents = await readEnvironment(targetPath);
    }
    let changed = 0;
    for (const item of plan) {
      if (item.operation === "rename") {
        const result = await request(`/${item.remote!.hash}`, {
          method: "PATCH",
          body: JSON.stringify({ name: item.name }),
        });
        const updated = result.data as RemoteKey | undefined;
        if (
          !updated ||
          updated.hash !== item.remote!.hash ||
          updated.name !== item.name ||
          updated.limit !== item.remote!.limit ||
          updated.limit_reset !== item.remote!.limit_reset ||
          updated.disabled !== item.remote!.disabled ||
          updated.include_byok_in_limit !==
            item.remote!.include_byok_in_limit ||
          updated.expires_at !== item.remote!.expires_at
        )
          throw new Error(
            `Rename verification failed for ${item.name}; stop and inspect its metadata.`,
          );
        console.log(`Renamed ${item.name}; fingerprint and limits unchanged.`);
        changed += 1;
      } else if (item.operation === "create") {
        const pending = await reserveWrite(targetPath);
        let result: { data?: unknown; key?: unknown };
        try {
          result = await request("", {
            method: "POST",
            body: JSON.stringify({ name: item.name, ...item.limits }),
          });
        } catch (error) {
          await pending.file.close().catch(() => {});
          await unlink(pending.temporary).catch(() => {});
          throw error;
        }
        if (
          typeof result.key !== "string" ||
          !/^sk-or-v1-[a-f0-9]+$/i.test(result.key)
        ) {
          await pending.file.close().catch(() => {});
          await unlink(pending.temporary).catch(() => {});
          throw new Error(
            `OpenRouter created ${item.name} without a valid plaintext key; stop and inspect its metadata.`,
          );
        }
        // Persist before validation/logging: OpenRouter never returns this plaintext again.
        try {
          contents = appendEnvValue(contents, item.app.envName, result.key);
          await persist(targetPath, contents, pending);
        } catch {
          await pending.file.close().catch(() => {});
          const created = result.data as RemoteKey | undefined;
          if (
            created?.hash === keyHash(result.key) &&
            created.name === item.name
          ) {
            try {
              await request(`/${created.hash}`, {
                method: "PATCH",
                body: JSON.stringify({ disabled: true }),
              });
              throw new Error(
                `Saving ${item.name} failed; the newly created key was disabled. Investigate the protected .write file and remote record before retrying.`,
              );
            } catch (error) {
              if (error instanceof Error && error.message.startsWith("Saving "))
                throw error;
            }
          }
          throw new Error(
            `Saving ${item.name} failed and disabling it could not be confirmed. Stop and inspect its remote record and protected .write file.`,
          );
        }
        const updated = result.data as RemoteKey | undefined;
        if (
          !updated ||
          updated.hash !== keyHash(result.key) ||
          updated.name !== item.name ||
          updated.disabled !== false ||
          (updated.expires_at !== null && updated.expires_at !== undefined) ||
          updated.limit !== item.limits!.limit ||
          updated.limit_reset !== item.limits!.limit_reset ||
          updated.include_byok_in_limit !== item.limits!.include_byok_in_limit
        )
          throw new Error(
            `Created ${item.name} and saved its secret, but metadata verification failed; inspect before continuing.`,
          );
        console.log(
          `Created ${item.name}; saved ${item.app.envName} in ${options.target === "dev" ? ".env.local" : ".env.openrouter-deploy.local"}.`,
        );
        changed += 1;
      }
    }
    console.log(
      `Complete: ${changed} changed, ${plan.filter((item) => item.operation === "retain").length} retained.`,
    );
    if (options.target === "deploy")
      console.log(
        "Use only .env.openrouter-deploy.local inference values for Vercel Production, then redeploy. Never deploy the management key or copy .env.local.",
      );
  } finally {
    if (lock) {
      await lock.close().catch(() => {});
      await unlink(lockPath).catch(() => {
        console.warn(
          "Could not remove .env.openrouter-keys.lock; investigate before the next run.",
        );
      });
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Key management failed; credentials were not logged.",
  );
  process.exitCode = 1;
});
