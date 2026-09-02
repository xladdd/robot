import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const toolsDirectory = new URL("app/_tools/", root);

async function findCopyFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryUrl = new URL(
      `${entry.name}${entry.isDirectory() ? "/" : ""}`,
      directory,
    );
    if (entry.isDirectory()) {
      files.push(...(await findCopyFiles(entryUrl)));
    } else if (entry.name === "copy.ts") {
      files.push(entryUrl);
    }
  }

  return files;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBilingualDictionary(value) {
  return (
    isRecord(value) &&
    Object.hasOwn(value, "en") &&
    Object.hasOwn(value, "cs") &&
    isRecord(value.en) &&
    isRecord(value.cs)
  );
}

function collectPaths(value, prefix = "") {
  const paths = new Set();
  if (!isRecord(value)) return paths;

  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.add(path);
    if (isRecord(nested)) {
      for (const nestedPath of collectPaths(nested, path))
        paths.add(nestedPath);
    }
  }

  return paths;
}

function relativePath(file) {
  return decodeURIComponent(file.href.slice(root.href.length));
}

test("keeps every app-owned bilingual copy dictionary structurally matched", async () => {
  const copyFiles = await findCopyFiles(toolsDirectory);
  assert.ok(
    copyFiles.length > 0,
    "expected at least one app-owned copy.ts file",
  );

  for (const copyFile of copyFiles) {
    const copyModule = await import(copyFile.href);
    const dictionaries = Object.entries(copyModule).filter(([, value]) =>
      isBilingualDictionary(value),
    );
    const file = relativePath(copyFile);

    assert.ok(
      dictionaries.length > 0,
      `${file} must export at least one { en, cs } dictionary`,
    );

    for (const [name, dictionary] of dictionaries) {
      const englishPaths = [...collectPaths(dictionary.en)].sort();
      const czechPaths = [...collectPaths(dictionary.cs)].sort();
      assert.deepEqual(
        czechPaths,
        englishPaths,
        `${file}: ${name} has mismatched English and Czech paths`,
      );
    }
  }
});
