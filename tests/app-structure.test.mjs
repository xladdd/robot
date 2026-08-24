import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("uses the standard local Next.js runtime", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

  assert.equal(packageJson.scripts.dev, "next dev");
  assert.equal(packageJson.scripts.build, "next build --webpack");
  assert.equal(packageJson.devDependencies.vinext, undefined);
  assert.equal(packageJson.devDependencies.wrangler, undefined);
  assert.equal(packageJson.devDependencies.vite, undefined);
});

test("keeps one repository copy of the Cliopatria timeline", async () => {
  const publicDataset = new URL("public/data/cliopatria-timeline.json", root);
  const duplicateDataset = new URL("app/data/cliopatria-timeline.json", root);
  const route = await readFile(new URL("app/api/maps/timeline/route.ts", root), "utf8");

  await access(publicDataset);
  await assert.rejects(access(duplicateDataset));
  assert.match(route, /loadCliopatriaTimeline/);
});

test("loads the retained Cliopatria data from its single repository location", async () => {
  const { loadCliopatriaTimeline } = await import("../app/lib/cliopatria.ts");
  const timeline = await loadCliopatriaTimeline();

  assert.ok(Object.keys(timeline).length > 0);
});

test("keeps static content outside the main page component", async () => {
  const [page, ui, englishManual, czechManual] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/content/ui.ts", root), "utf8"),
    readFile(new URL("app/content/design-manual/content-en.json", root), "utf8"),
    readFile(new URL("app/content/design-manual/content-cs.json", root), "utf8"),
  ]);

  assert.match(page, /from ["']\.\/content\/ui["']/);
  assert.match(page, /from ["']\.\/content\/design-manual\/content-en\.json["']/);
  assert.doesNotMatch(page, /const copy =/);
  assert.match(ui, /export const copy =/);
  assert.ok(JSON.parse(englishManual).chapters.length > 0);
  assert.ok(JSON.parse(czechManual).chapters.length > 0);
});
