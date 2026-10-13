import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const assetOwnershipFile = ".robot-tool-assets.json";
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function inside(parent, child) {
  const path = relative(parent, child);
  return (
    path !== "" &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}
function safePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !isAbsolute(value) &&
    !value.includes("\\") &&
    !/[\x00-\x1f?#]/.test(value) &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  );
}
async function statIfPresent(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function validateAssets(assets, context) {
  if (!Array.isArray(assets))
    throw new Error(`${context}: expected an asset array.`);
  const urls = [];
  for (const asset of assets) {
    if (
      !asset ||
      !safePath(asset.source) ||
      !asset.source.startsWith("app/_tools/") ||
      typeof asset.publicPath !== "string" ||
      !asset.publicPath.startsWith("/") ||
      !safePath(asset.publicPath.slice(1)) ||
      asset.publicPath.split("/").some((part) => part.startsWith(".robot-"))
    )
      throw new Error(
        `${context}: unsafe public asset ${JSON.stringify(asset)}.`,
      );
    if (
      urls.some(
        (url) =>
          url === asset.publicPath ||
          url.startsWith(`${asset.publicPath}/`) ||
          asset.publicPath.startsWith(`${url}/`),
      )
    )
      throw new Error(
        `${context}: overlapping public asset URL ${asset.publicPath}.`,
      );
    urls.push(asset.publicPath);
  }
}
async function guardParents(publicRoot, destination) {
  let parent = dirname(destination);
  while (parent === publicRoot || inside(publicRoot, parent)) {
    const entry = await statIfPresent(parent);
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink()))
      throw new Error(
        `Public asset parent must be a real directory, not a symlink: ${parent}`,
      );
    parent = dirname(parent);
  }
}
async function sourceIsOwned(toolsRoot, source, required) {
  // Resolve the closest existing ancestor as well, so even retired/dangling
  // source paths cannot claim ownership through an escaping directory link.
  let ancestor = source;
  while (!(await statIfPresent(ancestor))) {
    if (required) throw new Error(`Missing public asset source: ${source}`);
    ancestor = dirname(ancestor);
  }
  const canonicalTools = await realpath(toolsRoot);
  const canonical = await realpath(ancestor);
  if (
    !inside(toolsRoot, source) ||
    (canonical !== canonicalTools && !inside(canonicalTools, canonical))
  )
    throw new Error(`Public asset source escapes tool ownership: ${source}`);
  return required ? await realpath(source) : source;
}
async function matchingLink(destination, source) {
  return resolve(dirname(destination), await readlink(destination)) === source;
}

function entryStamp(entry) {
  return entry
    ? {
        dev: entry.dev,
        ino: entry.ino,
        mode: entry.mode,
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        ctimeMs: entry.ctimeMs,
      }
    : null;
}
async function guardUnchanged(path, expected) {
  if (
    JSON.stringify(entryStamp(await statIfPresent(path))) !==
    JSON.stringify(expected)
  ) {
    throw new Error(
      `Public asset changed after planning; refusing to overwrite ${path}.`,
    );
  }
}

/** Read-only planning shared by the generator and the Vercel materializer. */
export async function planPublicAssets({
  root = defaultRoot,
  assets,
  previous = [],
  mode = "links",
}) {
  root = resolve(root);
  if (!["links", "copies"].includes(mode))
    throw new Error(`Unknown public asset mode: ${mode}`);
  const publicRoot = resolve(root, "public");
  const toolsRoot = resolve(root, "app/_tools");
  const ownershipPath = resolve(publicRoot, assetOwnershipFile);
  validateAssets(assets, "Current assets");
  validateAssets(previous, "Previous assets");
  await guardParents(publicRoot, ownershipPath);
  const ownershipEntry = await statIfPresent(ownershipPath);
  if (
    ownershipEntry &&
    (!ownershipEntry.isFile() || ownershipEntry.isSymbolicLink())
  )
    throw new Error("Public asset ownership marker must be a regular file.");
  const oldText = ownershipEntry ? await readFile(ownershipPath, "utf8") : "";
  const ownership = oldText ? JSON.parse(oldText) : { version: 1, assets: [] };
  if (ownership.version !== 1 || !Array.isArray(ownership.assets))
    throw new Error("Invalid public asset ownership marker.");
  validateAssets(ownership.assets, "Owned assets");
  if (ownership.assets.some((asset) => !["link", "copy"].includes(asset.kind)))
    throw new Error("Invalid public asset ownership kind.");
  const owned = new Map(
    ownership.assets.map((asset) => [asset.publicPath, asset]),
  );
  const current = new Set(assets.map((asset) => asset.publicPath));
  const changes = [];
  const removals = [];
  const removalStamps = new Map();
  const next = [];
  for (const asset of assets) {
    const source = resolve(root, asset.source);
    const canonicalSource = await sourceIsOwned(toolsRoot, source, true);
    const destination = resolve(publicRoot, asset.publicPath.slice(1));
    await guardParents(publicRoot, destination);
    if (
      !inside(publicRoot, destination) ||
      destination === canonicalSource ||
      inside(canonicalSource, destination) ||
      inside(destination, canonicalSource)
    )
      throw new Error(
        `Public asset would overwrite its source: ${asset.publicPath}`,
      );
    const entry = await statIfPresent(destination);
    const prior = owned.get(asset.publicPath);
    let matches = false;
    if (entry?.isSymbolicLink()) {
      matches = await matchingLink(destination, source);
      if (
        !matches &&
        !(
          prior?.kind === "link" &&
          (await matchingLink(destination, resolve(root, prior.source)))
        )
      )
        throw new Error(
          `Public asset collision: wrong or unmanaged link at ${asset.publicPath}.`,
        );
      if (!matches)
        await sourceIsOwned(toolsRoot, resolve(root, prior.source), false);
    } else if (entry && prior?.kind !== "copy") {
      throw new Error(
        `Public asset collision: unmanaged real entry at ${asset.publicPath}.`,
      );
    }
    // Copies are refreshed on every materialization. Local generation restores
    // only marker-owned copies to live links, never an unmanaged real path.
    if (mode === "copies" || !entry || !entry.isSymbolicLink() || !matches)
      changes.push({
        ...asset,
        sourcePath: source,
        canonicalSource,
        destination,
        expected: entryStamp(entry),
        kind: mode === "copies" ? "copy" : "link",
      });
    next.push({
      source: asset.source,
      publicPath: asset.publicPath,
      kind: mode === "copies" ? "copy" : "link",
    });
  }
  // Old generated metadata may establish ownership of a matching tracked link;
  // real files/directories require an explicit copy marker, never metadata alone.
  const retired = new Map(previous.map((asset) => [asset.publicPath, asset]));
  for (const asset of ownership.assets) retired.set(asset.publicPath, asset);
  for (const asset of retired.values()) {
    if (current.has(asset.publicPath)) continue;
    const source = resolve(root, asset.source);
    await sourceIsOwned(toolsRoot, source, false);
    const destination = resolve(publicRoot, asset.publicPath.slice(1));
    await guardParents(publicRoot, destination);
    const entry = await statIfPresent(destination);
    if (!entry) continue;
    if (
      (entry.isSymbolicLink() && (await matchingLink(destination, source))) ||
      (!entry.isSymbolicLink() && owned.get(asset.publicPath)?.kind === "copy")
    ) {
      removals.push(destination);
      removalStamps.set(destination, entryStamp(entry));
    }
  }
  next.sort((a, b) => a.publicPath.localeCompare(b.publicPath));
  const ownershipText = `${JSON.stringify({ version: 1, assets: next }, null, 2)}\n`;
  return {
    root,
    publicRoot,
    ownershipPath,
    ownershipText,
    ownershipExpected: entryStamp(ownershipEntry),
    removalStamps,
    ownershipChanged: oldText !== ownershipText,
    changes,
    removals,
  };
}

/** Stage before replacing; restore the old destination if the rename fails. */
export async function applyPublicAssets(plan) {
  const staged = [];
  try {
    for (const change of plan.changes) {
      await guardParents(plan.publicRoot, change.destination);
      await guardUnchanged(change.destination, change.expected);
      await sourceIsOwned(
        resolve(plan.root, "app/_tools"),
        change.sourcePath,
        true,
      );
      await mkdir(dirname(change.destination), { recursive: true });
      const temporary = await mkdtemp(
        resolve(dirname(change.destination), ".robot-public-"),
      );
      const path = resolve(temporary, "asset");
      staged.push({ change, temporary, path });
      if (change.kind === "link") {
        await symlink(
          relative(dirname(change.destination), change.sourcePath),
          path,
        );
      } else {
        await cp(change.canonicalSource, path, {
          recursive: true,
          dereference: true,
          filter: async (source) => {
            const canonical = await realpath(source);
            if (
              canonical !== change.canonicalSource &&
              !inside(change.canonicalSource, canonical)
            )
              throw new Error(
                `Asset contains a link outside its source: ${source}`,
              );
            return true;
          },
        });
      }
    }
    // Recheck after staging: a user edit during a large copy must never become
    // a newly adopted destination, and a changed parent must not redirect writes.
    await guardParents(plan.publicRoot, plan.ownershipPath);
    await guardUnchanged(plan.ownershipPath, plan.ownershipExpected);
    for (const { change } of staged) {
      await guardParents(plan.publicRoot, change.destination);
      await guardUnchanged(change.destination, change.expected);
      await sourceIsOwned(
        resolve(plan.root, "app/_tools"),
        change.sourcePath,
        true,
      );
    }
    for (const destination of plan.removals) {
      await guardParents(plan.publicRoot, destination);
      await guardUnchanged(destination, plan.removalStamps.get(destination));
    }
    for (const { change, temporary, path } of staged) {
      await guardParents(plan.publicRoot, change.destination);
      await guardUnchanged(change.destination, change.expected);
      const backup = resolve(temporary, "previous");
      const present = await statIfPresent(change.destination);
      if (present) await rename(change.destination, backup);
      try {
        await rename(path, change.destination);
      } catch (error) {
        if (present) await rename(backup, change.destination);
        throw error;
      }
    }
    for (const destination of plan.removals) {
      await guardParents(plan.publicRoot, destination);
      await guardUnchanged(destination, plan.removalStamps.get(destination));
      await rm(destination, { recursive: true, force: true });
    }
    if (plan.ownershipChanged) {
      await guardParents(plan.publicRoot, plan.ownershipPath);
      await guardUnchanged(plan.ownershipPath, plan.ownershipExpected);
      await mkdir(plan.publicRoot, { recursive: true });
      const temporary = await mkdtemp(
        resolve(plan.publicRoot, ".robot-ownership-"),
      );
      try {
        const stagedMarker = resolve(temporary, "marker.json");
        await writeFile(stagedMarker, plan.ownershipText);
        await rename(stagedMarker, plan.ownershipPath);
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  } finally {
    for (const { temporary } of staged)
      await rm(temporary, { recursive: true, force: true });
  }
}

export async function materializePublicAssets({ root = defaultRoot } = {}) {
  root = resolve(root);
  const assets = JSON.parse(
    await readFile(resolve(root, "app/_tools/generated/assets.json"), "utf8"),
  );
  const plan = await planPublicAssets({ root, assets, mode: "copies" });
  await applyPublicAssets(plan);
  for (const change of plan.changes)
    console.log(
      `Materialized public${change.publicPath} for the Vercel build.`,
    );
  return {
    refreshed: plan.changes.map((asset) => asset.publicPath),
    removed: plan.removals.map((path) => relative(root, path)),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
  process.env.VERCEL === "1"
) {
  await materializePublicAssets();
}
