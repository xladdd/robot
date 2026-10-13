import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { openRouterApps } from "../config.ts";

export const managedApps = Object.values(openRouterApps);
export type KeyTarget = "dev" | "deploy";
export type KeyOptions = {
  action: "provision" | "rename-dev" | "verify";
  target: KeyTarget;
  dryRun: boolean;
};
export type RemoteKey = {
  hash: string;
  name: string;
  disabled: boolean;
  limit: number | null;
  limit_reset: "daily" | "weekly" | "monthly" | null;
  include_byok_in_limit: boolean;
  expires_at?: string | null;
};
export type KeyLimits = Pick<
  RemoteKey,
  "limit" | "limit_reset" | "include_byok_in_limit"
>;
export type KeyPlan = {
  app: (typeof managedApps)[number];
  name: string;
  operation: "retain" | "rename" | "create";
  remote?: RemoteKey;
  limits?: KeyLimits;
};

export function parseOptions(args: string[]): KeyOptions {
  let action: KeyOptions["action"] = "provision";
  let target: KeyTarget | undefined;
  let dryRun = false;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--rename-dev" || argument === "--verify") {
      if (action !== "provision")
        throw new Error("Choose only one key-management action.");
      action = argument === "--verify" ? "verify" : "rename-dev";
    } else if (argument === "--target") {
      if (target) throw new Error("Specify --target only once.");
      const value = args[++index];
      if (value !== "dev" && value !== "deploy")
        throw new Error("--target must be dev or deploy.");
      target = value;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--apply") {
      apply = true;
    } else {
      throw new Error(
        "Unknown option. Use --target dev|deploy, --rename-dev, --verify, --dry-run, or --apply.",
      );
    }
  }
  if (dryRun && apply)
    throw new Error("--dry-run and --apply cannot be combined.");
  if (action === "provision" && !target)
    throw new Error("Provisioning requires --target dev or --target deploy.");
  if (action !== "provision" && target)
    throw new Error("--target is only used for provisioning.");
  if (action === "verify" && apply)
    throw new Error("Verification is read-only.");
  return {
    action,
    target: target ?? "dev",
    dryRun: action === "verify" || (action === "rename-dev" ? !apply : dryRun),
  };
}

export function keyName(target: KeyTarget, slug: string) {
  return `${target === "dev" ? "DEV" : "DEPLOY"}/${slug}`;
}

export function keyHash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function envAssignments(contents: string) {
  const pattern = /^[\t ]*(?:export[\t ]+)?([^=\r\n#]+?)[\t ]*=[\t ]*/gm;
  const assignments: Array<{ name: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(contents))) {
    let valueEnd = pattern.lastIndex;
    const quote = contents[valueEnd];
    if (quote === '"' || quote === "'" || quote === "`") {
      valueEnd = contents.indexOf(quote, valueEnd + 1);
      if (valueEnd < 0)
        throw new Error(
          "Unterminated quoted environment value; resolve it before provisioning.",
        );
      valueEnd += 1;
    }
    const newline = contents.indexOf("\n", valueEnd);
    const end = newline < 0 ? contents.length : newline;
    assignments.push({ name: match[1].trim(), start: match.index, end });
    // Quoted values can span lines; assignment-looking text inside them is data.
    pattern.lastIndex = end + 1;
  }
  return assignments;
}

export function readEnv(
  contents: string,
  deploy = false,
): Record<string, string> {
  const assignments = envAssignments(contents);
  for (const app of managedApps) {
    if (assignments.filter((entry) => entry.name === app.envName).length > 1)
      throw new Error(
        `Duplicate assignment for ${app.envName}; resolve it before provisioning.`,
      );
  }
  const env = Object.fromEntries(
    Object.entries(parseEnv(contents)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  if (deploy) {
    const allowed = new Set<string>(managedApps.map((app) => app.envName));
    if (Object.keys(env).some((name) => !allowed.has(name)))
      throw new Error(
        "The DEPLOY export must contain only per-app inference variables.",
      );
  }
  return env;
}

export function assertSeparateKeys(
  dev: Record<string, string>,
  deploy: Record<string, string>,
) {
  const owners = new Map<string, string>();
  for (const [target, env] of [
    ["DEV", dev],
    ["DEPLOY", deploy],
  ] as const) {
    for (const app of managedApps) {
      const secret = env[app.envName];
      if (!secret) continue;
      const previous = owners.get(secret);
      if (previous)
        throw new Error(
          `${target}/${app.slug} shares a key with ${previous}; keys must be unique per app and environment.`,
        );
      owners.set(secret, `${target}/${app.slug}`);
    }
  }
  if (
    dev.OPENROUTER_API_KEY &&
    Object.values(deploy).includes(dev.OPENROUTER_API_KEY)
  )
    throw new Error("A DEPLOY key matches the DEV legacy fallback.");
}

export function matchKey(
  secret: string,
  keys: RemoteKey[],
  description: string,
): RemoteKey {
  const matches = keys.filter((key) => key.hash === keyHash(secret));
  if (matches.length !== 1)
    throw new Error(
      `${description} has no unique exact fingerprint match in OpenRouter; no name-only mapping is allowed.`,
    );
  const key = matches[0];
  if (
    key.expires_at !== undefined &&
    key.expires_at !== null &&
    !Number.isFinite(Date.parse(key.expires_at))
  )
    throw new Error(`${description} has invalid expiry metadata.`);
  if (
    key.disabled ||
    (key.expires_at && Date.parse(key.expires_at) <= Date.now())
  )
    throw new Error(
      `${description} is disabled or expired; no automatic rotation is allowed.`,
    );
  return key;
}

export function configuredLimits(env: NodeJS.ProcessEnv): KeyLimits {
  const value = env.OPENROUTER_APP_KEY_LIMIT_USD;
  const limit = value === undefined || value === "" ? null : Number(value);
  if (limit !== null && (!Number.isFinite(limit) || limit <= 0))
    throw new Error("OPENROUTER_APP_KEY_LIMIT_USD must be a positive number.");
  const reset = env.OPENROUTER_APP_KEY_LIMIT_RESET || "monthly";
  if (reset !== "daily" && reset !== "weekly" && reset !== "monthly")
    throw new Error(
      "OPENROUTER_APP_KEY_LIMIT_RESET must be daily, weekly, or monthly.",
    );
  return {
    limit,
    limit_reset: limit === null ? null : reset,
    include_byok_in_limit: false,
  };
}

function limitsFrom(key: RemoteKey): KeyLimits {
  if (key.limit !== null && (!Number.isFinite(key.limit) || key.limit < 0))
    throw new Error("OpenRouter returned invalid key limits.");
  if (
    ![null, "daily", "weekly", "monthly"].includes(key.limit_reset) ||
    typeof key.include_byok_in_limit !== "boolean"
  )
    throw new Error("OpenRouter returned unsupported key-limit settings.");
  return {
    limit: key.limit,
    limit_reset: key.limit_reset,
    include_byok_in_limit: key.include_byok_in_limit,
  };
}

export function buildPlan(
  options: KeyOptions,
  dev: Record<string, string>,
  deploy: Record<string, string>,
  keys: RemoteKey[],
  defaults: KeyLimits,
): KeyPlan[] {
  assertSeparateKeys(dev, deploy);
  const target = options.target;
  const env = target === "dev" ? dev : deploy;
  const plan: KeyPlan[] = [];
  for (const app of managedApps) {
    const name = keyName(target, app.slug);
    const secret = env[app.envName];
    const collision = keys.filter((key) => key.name === name);
    if (!secret) {
      if (options.action === "rename-dev") continue;
      if (
        collision.length ||
        (target === "dev" &&
          keys.some((key) => key.name === `Taktik Robot / ${app.name}`))
      )
        throw new Error(
          `${name} already exists remotely but its plaintext is missing locally. Recover the saved secret; do not silently replace it.`,
        );
      let limits = defaults;
      if (target === "deploy") {
        const devSecret = dev[app.envName];
        if (!devSecret)
          throw new Error(
            `Provision DEV/${app.slug} before provisioning DEPLOY.`,
          );
        const devKey = matchKey(devSecret, keys, `DEV/${app.slug}`);
        if (devKey.name !== keyName("dev", app.slug))
          throw new Error(`Rename DEV/${app.slug} before provisioning DEPLOY.`);
        limits = limitsFrom(devKey);
      }
      plan.push({ app, name, operation: "create", limits });
      continue;
    }
    const remote = matchKey(secret, keys, name);
    if (collision.some((key) => key.hash !== remote.hash))
      throw new Error(`${name} is already assigned to a different remote key.`);
    if (remote.name !== name) {
      if (
        options.action !== "rename-dev" ||
        remote.name !== `Taktik Robot / ${app.name}`
      )
        throw new Error(
          `${name} has an unexpected remote name. Run the DEV rename migration first or investigate the mapping.`,
        );
      plan.push({ app, name, operation: "rename", remote });
    } else {
      plan.push({ app, name, operation: "retain", remote });
    }
  }
  return plan;
}

export function appendEnvValue(contents: string, name: string, secret: string) {
  if (readEnv(contents)[name])
    throw new Error(
      `${name} is already configured; it will not be overwritten.`,
    );
  const assignment = envAssignments(contents).find(
    (entry) => entry.name === name,
  );
  const line = `${name}=${secret}`;
  // Replace only a real blank assignment, never a line inside a quoted value.
  return assignment
    ? `${contents.slice(0, assignment.start)}${line}${contents.slice(assignment.end)}`
    : `${contents}${contents && !contents.endsWith("\n") ? "\n" : ""}${line}\n`;
}
