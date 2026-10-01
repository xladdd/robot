import { cp, lstat, mkdir, realpath, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const publicLinks = [
  "cover-splitter",
  "solutions",
  "solutions-beta",
  "typesetter",
  "data/cliopatria-timeline.json",
  "script-buffet",
  "design-manual/downloads",
  "design-manual/media",
];

if (process.env.VERCEL !== "1") {
  process.exit(0);
}

for (const publicPath of publicLinks) {
  const destination = resolve("public", publicPath);
  const entry = await lstat(destination);

  if (!entry.isSymbolicLink()) {
    continue;
  }

  const source = await realpath(destination);
  const sourceEntry = await lstat(source);

  await rm(destination);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: sourceEntry.isDirectory(),
    dereference: true,
  });

  console.log(`Materialized public/${publicPath} for the Vercel build.`);
}
