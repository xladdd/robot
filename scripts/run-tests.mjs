import { readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonicalTest = /\.test\.(?:mjs|mts|ts)$/;

async function discover(directory, toolTree = false, inTests = false) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (["fixtures", "fixture", "node_modules"].includes(entry.name)) continue;
      files.push(...await discover(path, toolTree, inTests || entry.name === "tests"));
    } else if (entry.isFile() && (!toolTree || inTests) && canonicalTest.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const files = (await Promise.all([
  discover(resolve(root, "tests")),
  discover(resolve(root, "app/_tools"), true),
])).flat().sort();
if (!files.length) throw new Error("No canonical tests discovered.");
const child = spawn(process.execPath, ["--experimental-strip-types", "--test", ...files], {
  cwd: root,
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
