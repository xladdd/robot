import { expect } from "@playwright/test";
import { resolve } from "node:path";

const ids = [
  "graph",
  "bio",
  "map",
  "styleTrainer",
  "typesetter",
  "conceptIllustrator",
];
const graphSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" data-fixture-graph="true"><title>Synthetic graph</title><rect x="100" y="100" width="200" height="400" fill="#3399cc"/></svg>';

export function createHiddenMockState(png) {
  return {
    png,
    graphGate: null,
    graphs: [],
    timelines: [],
    styleModes: [],
    typesetterModes: [],
    conceptActions: [],
  };
}

export async function mockHiddenApi(route, state, json) {
  const request = route.request(),
    url = new URL(request.url());
  if (url.pathname === "/api/graphs" && request.method() === "POST") {
    state.graphs.push(request.postDataJSON());
    if (state.graphGate) await state.graphGate.promise;
    await json(route, { svg: graphSvg, spec: { title: "Synthetic Graph" } });
    return true;
  }
  if (url.pathname === "/api/maps/timeline" && request.method() === "GET") {
    const year = url.searchParams.get("year");
    if (!/^-?\d+$/.test(year ?? "")) return false;
    const lang = url.searchParams.get("lang") === "cs" ? "cs" : "en";
    const projection = url.searchParams.get("projection") ?? "schematic";
    state.timelines.push({ year: Number(year), lang, projection });
    await json(route, {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" data-fixture-map-year="${year}" data-fixture-map-lang="${lang}" data-fixture-map-projection="${projection}"><title>Synthetic map ${year}</title><g id="land" class="base-land"><path d="M0 0H1000V700H0Z" fill="#f4f0df"/></g><circle data-fixture-region-center="europe" cx="519.444" cy="212.166" r="4" fill="#d44"/><g id="countries-borders" class="regions"><path data-region-id="fixture-region" d="M100 100H600V500H100Z" fill="#99bb88"/></g><rect data-fixture-map-overlay="true" x="220" y="220" width="80" height="80" fill="rgba(0,0,0,.01)"/><g id="lakes" class="natural-lakes"><path d="M450 300h100v60H450Z" fill="#eaf6fa"/></g><g id="labels"/><g id="water-labels"/><g id="rivers" class="natural-rivers"/></svg>`,
      report: "Synthetic deterministic timeline fixture",
      checks: [],
      model: "local/fixture",
      spec: {
        title: `Synthetic Map ${year}`,
        date: year,
        sources: [],
        categories: [],
      },
    });
    return true;
  }
  if (url.pathname === "/api/style-trainer" && request.method() === "POST") {
    const body = request.postDataJSON();
    if (!["analyze", "generate"].includes(body.mode)) return false;
    state.styleModes.push(body.mode);
    await json(
      route,
      body.mode === "analyze"
        ? {
            plan: {
              id: "synthetic-style",
              name: "Synthetic Style",
              prompt: "Synthetic gouache style",
              analysis: "Synthetic fixture analysis",
            },
          }
        : {
            image: {
              data: state.png,
              seed: 4242,
              model: "fixture/style",
              resolution: 512,
              usage: { cost: null },
            },
          },
    );
    return true;
  }
  if (url.pathname === "/api/typesetter" && request.method() === "POST") {
    const body = request.postDataJSON();
    if (body.mode !== "prescan") return false;
    state.typesetterModes.push(body.mode);
    await json(route, {
      suggestions: [
        {
          role: "body",
          confidence: 1,
          reason: "Synthetic body",
          examples: ["Synthetic story paragraph"],
        },
      ],
      notes: [],
    });
    return true;
  }
  if (
    url.pathname === "/api/concept-illustrations" &&
    request.method() === "POST"
  ) {
    const body = request.postDataJSON();
    if (body.action !== "plan-concepts") return false;
    state.conceptActions.push(body.action);
    await json(route, {
      concepts: [1, 2, 3].map((number) => ({
        id: `synthetic-concept-${number}`,
        title: `Synthetic concept ${number}`,
        visual: `Synthetic visual ${number}`,
        meaning: `Synthetic meaning ${number}`,
      })),
    });
    return true;
  }
  return false;
}

function tinyAse() {
  const name = "Fixture Blue";
  const body = Buffer.alloc(2 + (name.length + 1) * 2 + 4 + 12 + 2);
  let offset = 0;
  body.writeUInt16BE(name.length + 1, offset);
  offset += 2;
  for (const character of name) {
    body.writeUInt16BE(character.charCodeAt(0), offset);
    offset += 2;
  }
  offset += 2;
  body.write("RGB ", offset);
  offset += 4;
  for (const value of [0.2, 0.6, 0.8]) {
    body.writeFloatBE(value, offset);
    offset += 4;
  }
  body.writeUInt16BE(2, offset);
  const header = Buffer.alloc(18);
  header.write("ASEF");
  header.writeUInt16BE(1, 4);
  header.writeUInt32BE(1, 8);
  header.writeUInt16BE(1, 12);
  header.writeUInt32BE(body.length, 14);
  return {
    name: "synthetic-blue.ase",
    mimeType: "application/octet-stream",
    buffer: Buffer.concat([header, body]),
  };
}

export async function runHiddenLifecycleChecks({
  page,
  baseURL,
  stage,
  state,
  output,
  size,
}) {
  // Only the sandbox fixture gets this inspector replacement. No worker or Pyodide is started.
  await page.addInitScript(() => {
    if (location.pathname !== "/lifecycle-fixture") return;
    globalThis.fixtureWorkerCalls = [];
    globalThis.Worker = class FixtureTypesetterWorker {
      constructor(url) {
        if (String(url) !== "/typesetter/pyodide-worker.js")
          throw new Error(`Unspecified fixture worker: ${url}`);
        globalThis.fixtureWorkerCalls.push(String(url));
      }
      postMessage(message) {
        queueMicrotask(() => {
          if (this.terminated) return;
          this.onmessage?.({
            data: {
              type: "result",
              json: JSON.stringify({
                manuscript: {
                  filename: message.manuscriptName,
                  blocks: [
                    {
                      id: "synthetic-block",
                      order: 0,
                      text: "Synthetic story paragraph",
                      kind: "paragraph",
                      sourceStyle: null,
                      listLevel: null,
                      tableId: null,
                      imageDescription: null,
                    },
                  ],
                },
                template: {
                  filename: message.idmlName,
                  paragraphStyles: [
                    { id: "synthetic-body", name: "Body", path: "Body" },
                  ],
                  characterStyles: [],
                  objectStyles: [],
                  labels: ["typesetter:story:main"],
                  layers: ["Fixture"],
                  page: { width: 210, height: 297 },
                },
                warnings: [],
              }),
            },
          });
        });
      }
      terminate() {
        this.terminated = true;
      }
    };
  });
  await page.goto(`${baseURL}/lifecycle-fixture`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  const slot = (id) => page.locator(`[data-tool-id="${id}"]`);
  const select = async (id) => {
    await page.locator(`[data-fixture-select="${id}"]`).click();
    if (id === "none") return;
    await expect(slot(id)).toHaveAttribute("data-tool-active", "true");
    await expect(
      slot(id)
        .locator(id === "map" ? '[data-map-tab][aria-selected="true"]' : "h1")
        .first(),
    ).toBeVisible();
    await expect(slot(id).locator(".tool-loading")).toHaveCount(0);
  };
  const pngFile = {
    name: "synthetic-diagram-reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(state.png.split(",")[1], "base64"),
  };
  const palette = tinyAse();
  const prompt = "Synthetic graph bars; never use Diagram reference images";
  const data = "| Label | Value |\n| --- | --- |\n| Alpha | 12 |";

  await stage(
    "Hidden Graph/Diagram independent inputs; Graph job completes while away",
    async () => {
      await expect(page.locator("[data-tool-id]")).toHaveCount(0);
      await select("graph");
      await slot("graph").locator("#graph-prompt").fill(prompt);
      await slot("graph").locator("#graph-data").fill(data);
      await slot("graph").locator(".graph-value-labels input").uncheck();
      await slot("graph")
        .locator(".figure-palette input[type=file]")
        .setInputFiles(palette);
      await expect(slot("graph").locator(".figure-swatches i")).toHaveCount(1);
      await select("bio");
      await slot("bio")
        .locator("textarea")
        .first()
        .fill("Synthetic biological diagram request");
      await slot("bio")
        .locator(".figure-references input[type=file]")
        .setInputFiles(pngFile);
      await expect(slot("bio").locator(".figure-references img")).toHaveCount(
        1,
      );
      await select("graph");
      await expect(slot("graph").locator("#graph-prompt")).toHaveValue(prompt);
      await expect(slot("graph").locator("#graph-data")).toHaveValue(data);
      await expect(
        slot("graph").locator(".graph-value-labels input"),
      ).not.toBeChecked();
      await expect(slot("graph").locator(".figure-swatches i")).toHaveCount(1);
      const gate = {};
      gate.promise = new Promise((resolve) => {
        gate.resolve = resolve;
      });
      state.graphGate = gate;
      try {
        await slot("graph").locator(".graph-generate").click();
        await expect.poll(() => state.graphs.length).toBe(1);
        const body = state.graphs[0];
        expect(Object.keys(body).sort()).toEqual([
          "language",
          "palette",
          "request",
          "showValueLabels",
        ]);
        expect(body.request).toBe(`${prompt}\n\nDATA:\n${data}`);
        expect(body.showValueLabels).toBe(false);
        expect(body.palette).toHaveLength(1);
        expect(body).not.toHaveProperty("references");
        expect(JSON.stringify(body)).not.toContain("data:image");
        await select("bio");
        await expect(slot("graph")).toHaveAttribute("hidden", "");
        await expect(slot("graph")).toHaveAttribute("inert", "");
        gate.resolve();
        state.graphGate = null;
        await expect(
          slot("graph").locator("svg[data-fixture-graph]"),
        ).toHaveCount(1);
        await expect(slot("bio").locator("textarea").first()).toHaveValue(
          "Synthetic biological diagram request",
        );
        await expect(slot("bio").locator(".figure-references img")).toHaveCount(
          1,
        );
        await select("graph");
        await expect(
          slot("graph").locator(".cover-toolbar-exports button"),
        ).toHaveCount(1);
      } finally {
        gate.resolve();
        state.graphGate = null;
      }
    },
  );

  await stage(
    "Hidden Graph clear palette invalidates preview/download but retains prompt/data",
    async () => {
      await select("graph");
      await expect(
        slot("graph").locator("svg[data-fixture-graph]"),
      ).toHaveCount(1);
      await slot("graph").locator(".figure-palette-head button").click();
      await expect(slot("graph").locator(".figure-swatches i")).toHaveCount(0);
      await expect(
        slot("graph").locator("svg[data-fixture-graph]"),
      ).toHaveCount(0);
      await expect(
        slot("graph").locator(".cover-toolbar-exports button"),
      ).toHaveCount(0);
      await expect(slot("graph").locator("#graph-prompt")).toHaveValue(prompt);
      await expect(slot("graph").locator("#graph-data")).toHaveValue(data);
      await select("bio");
      await select("graph");
      await expect(slot("graph").locator("#graph-prompt")).toHaveValue(prompt);
      await expect(
        slot("graph").locator(".cover-toolbar-exports button"),
      ).toHaveCount(0);
    },
  );

  await stage(
    "Hidden Map timeline/layers/viewport retained; inactive keyboard cannot zoom",
    async () => {
      await select("map");
      await expect(
        slot("map").locator('svg[data-fixture-map-year="2026"]'),
      ).toHaveCount(1);
      await expect(
        slot("map").locator(".map-year-field input"),
      ).toHaveAttribute("aria-disabled", "true");
      const requests = state.timelines.length;
      await slot("map").locator(".map-year-field button").first().click({
        force: true,
      });
      await expect(page.locator("body > .map-time-tooltip")).toHaveCount(1);
      await expect(
        slot("map").locator('svg[data-fixture-map-year="2026"]'),
      ).toHaveCount(1);
      await slot("map").locator('[data-map-tab="edit"]').click();
      await slot("map").locator(".map-fill-toggle").click();
      await expect(slot("map").locator(".map-fill-toggle")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await slot("map").locator('[data-fixture-map-overlay="true"]').click();
      await expect(
        slot("map").locator('path[data-region-id="fixture-region"]'),
      ).toHaveAttribute("style", "fill:#ff661a");
      await slot("map").locator('[data-map-tab="content"]').click();
      await slot("map").locator(".map-layer-labels input").uncheck();
      await slot("map").locator(".map-view-buttons button").first().click();
      const svg = slot("map").locator(".map-transform svg");
      await expect(svg).toHaveAttribute("viewBox", "0 0 1000 700");
      await expect(svg).not.toHaveAttribute("style", /scale\(1(\.0)?\)/);
      const transform = await svg.getAttribute("style");
      const requestsWithZoom = state.timelines.length;
      await select("graph");
      await page.keyboard.press("+");
      await expect(svg).toHaveAttribute("style", transform);
      await select("map");
      await expect(slot("map").locator(".map-year-field input")).toHaveValue(
        "2026",
      );
      await expect(slot("map").locator(".map-fill-toggle")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(
        slot("map").locator(".map-layer-labels input"),
      ).not.toBeChecked();
      await expect(svg).toHaveAttribute("style", transform);
      expect(state.timelines.length).toBe(requestsWithZoom);
      await page.locator('[data-fixture-select="map"]').focus();
      await page.keyboard.press("+");
      await expect(svg).not.toHaveAttribute("style", transform);
      expect(state.timelines.length).toBe(requests);
    },
  );

  await stage(
    "Hidden Style Trainer plan/form/gallery retained; inactive portal disappears",
    async () => {
      await select("styleTrainer");
      await slot("styleTrainer")
        .locator("#style-trainer-test-prompt")
        .fill("Synthetic editorial object");
      await slot("styleTrainer")
        .locator("input[type=file]")
        .setInputFiles({ ...pngFile, name: "synthetic-style-reference.png" });
      await expect(
        slot("styleTrainer").locator(".cover-references img"),
      ).toHaveCount(1);
      await slot("styleTrainer").locator(".cover-generate").click();
      await expect(slot("styleTrainer").locator(".cover-image")).toHaveCount(3);
      await expect(
        slot("styleTrainer").locator("#style-trainer-style-prompt"),
      ).toBeEnabled();
      await slot("styleTrainer")
        .locator("#style-trainer-style-prompt")
        .fill("Synthetic edited reusable gouache style");
      await slot("styleTrainer")
        .locator(".style-trainer-chat textarea")
        .fill("Synthetic refinement instruction retained");
      await slot("styleTrainer").locator(".cover-image").first().click();
      await expect(page.locator(".manual-lightbox[role=dialog]")).toBeVisible();
      await select("graph");
      await expect(page.locator(".manual-lightbox[role=dialog]")).toHaveCount(
        0,
      );
      await page.keyboard.press("Escape");
      await select("styleTrainer");
      await expect(
        slot("styleTrainer").locator("#style-trainer-test-prompt"),
      ).toHaveValue("Synthetic editorial object");
      await expect(
        slot("styleTrainer").locator("#style-trainer-style-prompt"),
      ).toHaveValue("Synthetic edited reusable gouache style");
      await expect(
        slot("styleTrainer").locator(".style-trainer-chat textarea"),
      ).toHaveValue("Synthetic refinement instruction retained");
      await expect(slot("styleTrainer").locator(".cover-image")).toHaveCount(3);
      // Opening state may be retained; only active tools may render this body portal.
      if (await page.locator(".manual-lightbox[role=dialog]").count()) {
        // The fixture selection bar intentionally stays above portals so tools can be switched.
        await page.locator(".manual-lightbox-close").focus();
        await page.keyboard.press("Space");
        await expect(page.locator(".manual-lightbox[role=dialog]")).toHaveCount(
          0,
        );
      }
      expect(
        state.styleModes.filter((mode) => mode === "analyze"),
      ).toHaveLength(1);
      expect(
        state.styleModes.filter((mode) => mode === "generate"),
      ).toHaveLength(3);
    },
  );

  await stage(
    "Hidden Typesetter files and story/template mapping retained with fake local inspector",
    async () => {
      await select("typesetter");
      const files = slot("typesetter").locator("input[type=file]");
      await files.nth(0).setInputFiles({
        name: "synthetic-story.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: Buffer.from("Synthetic worker fixture input"),
      });
      await files.nth(1).setInputFiles({
        name: "synthetic-template.idml",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("Synthetic worker fixture input"),
      });
      await slot("typesetter")
        .locator(".solutions-generator .solutions-create")
        .click();
      await expect(
        slot("typesetter").locator(".typesetter-inventory .valid"),
      ).toHaveText("Main-story label found");
      await slot("typesetter")
        .locator(".typesetter-inventory .solutions-create")
        .click();
      await expect(
        slot("typesetter").locator(".typesetter-template-fields input"),
      ).toHaveCount(2);
      await slot("typesetter")
        .locator(".typesetter-template-fields input")
        .nth(0)
        .fill("synthetic-edited-story-template");
      await slot("typesetter")
        .locator(".typesetter-template-fields input")
        .nth(1)
        .fill("7");
      await slot("typesetter")
        .locator(".typesetter-mapping-row select")
        .first()
        .selectOption("Body");
      await select("graph");
      await select("typesetter");
      await expect(slot("typesetter")).toContainText("synthetic-story.docx");
      await expect(slot("typesetter")).toContainText("synthetic-template.idml");
      await expect(
        slot("typesetter").locator(".typesetter-template-fields input").nth(0),
      ).toHaveValue("synthetic-edited-story-template");
      await expect(
        slot("typesetter").locator(".typesetter-template-fields input").nth(1),
      ).toHaveValue("7");
      await expect(
        slot("typesetter").locator(".typesetter-mapping-row select").first(),
      ).toHaveValue("Body");
      expect(await page.evaluate(() => globalThis.fixtureWorkerCalls)).toEqual([
        "/typesetter/pyodide-worker.js",
      ]);
      expect(state.typesetterModes).toEqual(["prescan"]);
    },
  );

  await stage(
    "Hidden unavailable Concept fixture mounts; article/concepts/style persist in real IndexedDB",
    async () => {
      await select("conceptIllustrator");
      const article = slot("conceptIllustrator").locator(
        ".concept-illustrator-article-panel textarea",
      );
      // IndexedDB hydration must complete before editing or it may replace the initial project.
      await expect(
        slot("conceptIllustrator").locator(".concept-illustrator-memory-error"),
      ).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              new Promise((resolve, reject) => {
                const request = indexedDB.open("robot-concept-illustrator");
                request.onsuccess = () => {
                  const db = request.result;
                  if (!db.objectStoreNames.contains("settings")) {
                    db.close();
                    resolve(false);
                    return;
                  }
                  const transaction = db.transaction("settings", "readonly");
                  const setting = transaction
                    .objectStore("settings")
                    .get("house-style");
                  transaction.oncomplete = () => {
                    const ready = Boolean(setting.result);
                    db.close();
                    resolve(ready);
                  };
                  transaction.onerror = () => {
                    db.close();
                    reject(transaction.error);
                  };
                };
                request.onerror = () => reject(request.error);
              }),
          ),
        )
        .toBe(true);
      await article.fill(
        "Synthetic editorial article about planets and learning",
      );
      const style = slot("conceptIllustrator").locator(
        ".concept-illustrator-style-guidance textarea",
      );
      await style.fill("Synthetic house style guidance");
      await slot("conceptIllustrator")
        .locator(".concept-illustrator-plan")
        .click();
      await expect(
        slot("conceptIllustrator").locator(".concept-illustrator-concept-card"),
      ).toHaveCount(3);
      await select("graph");
      await select("conceptIllustrator");
      await expect(article).toHaveValue(
        "Synthetic editorial article about planets and learning",
      );
      await expect(style).toHaveValue("Synthetic house style guidance");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              new Promise((resolve, reject) => {
                const request = indexedDB.open("robot-concept-illustrator");
                request.onsuccess = () => {
                  const db = request.result,
                    transaction = db.transaction(
                      ["projects", "settings"],
                      "readonly",
                    );
                  const projects = transaction.objectStore("projects").getAll(),
                    settings = transaction
                      .objectStore("settings")
                      .get("house-style");
                  transaction.oncomplete = () => {
                    const saved =
                      projects.result.some(
                        (project) =>
                          project.article ===
                            "Synthetic editorial article about planets and learning" &&
                          project.concepts[0].title === "Synthetic concept 1",
                      ) &&
                      settings.result?.styleGuidance ===
                        "Synthetic house style guidance";
                    db.close();
                    resolve(saved);
                  };
                  transaction.onerror = () => {
                    db.close();
                    reject(transaction.error);
                  };
                };
                request.onerror = () => reject(request.error);
              }),
          ),
        )
        .toBe(true);
      expect(state.conceptActions).toEqual(["plan-concepts"]);
    },
  );

  await stage(
    "Hidden fixture has six retained subtrees; all inactive slots hidden/inert with no portals",
    async () => {
      await select("typesetter");
      await expect(page.locator("[data-tool-id]")).toHaveCount(ids.length);
      for (const id of ids.filter((id) => id !== "typesetter")) {
        await expect(slot(id)).toHaveAttribute("hidden", "");
        await expect(slot(id)).toHaveAttribute("inert", "");
      }
      await expect(page.locator(".manual-lightbox[role=dialog]")).toHaveCount(
        0,
      );
      await page.screenshot({
        path: resolve(output, `${size}-hidden-lifecycle.png`),
        fullPage: true,
      });
      await select("none");
      for (const id of ids)
        await expect(slot(id)).toHaveAttribute("hidden", "");
      expect(state.graphs).toHaveLength(1);
    },
  );
}
