import { chromium, expect } from "@playwright/test";
import { access, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createHiddenMockState,
  mockHiddenApi,
  runHiddenLifecycleChecks,
} from "./browser-fixtures/hidden-workspace.mjs";

export async function checkBrowser() {
  for (const path of [
    chromium.executablePath(),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ]) {
    try {
      await access(path);
      console.log(`Browser: ${path}`);
      return path;
    } catch {
      /* try installed system browser */
    }
  }
  throw new Error(
    "No installed Chromium or system Chrome. Install the existing Playwright browser with npx playwright install chromium, then rerun test:ui.",
  );
}

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
export async function runWorkspaceBrowserTests({
  baseURL,
  executablePath,
  output = resolve("tmp/workspace-ui"),
}) {
  await mkdir(output, { recursive: true });
  const { createSession, authCookieName } = await import("../app/lib/auth.ts");
  const { createEan13Pdf } =
    await import("../app/_tools/design/barcode-generator/code/ean13.ts");
  const { toolDefinitions } =
    await import("../app/_tools/generated/registry.data.ts");
  const { modelDefinitions } =
    await import("../app/_tools/image/image-generator/model-definitions.ts");
  const pdf = {
    name: "synthetic-barcode.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await createEan13Pdf("9788025312346").arrayBuffer()),
  };
  const report = {
    passed: 0,
    failed: 0,
    stages: [],
    console: [],
    network: [],
    pageErrors: [],
    drawerLayouts: [],
    modelLayouts: [],
    headerHitRegions: [],
    screenshotErrors: [],
    mocks: [],
    noise: [],
    unexpected: [],
  };
  const browser = await chromium.launch({
    executablePath: executablePath ?? (await checkBrowser()),
    headless: true,
  });
  const deadline = setTimeout(() => {
    report.unexpected.push("Browser tests exceeded 240s");
    void browser.close();
  }, 240_000);
  try {
    for (const [size, viewport] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["narrow", { width: 390, height: 844 }],
    ]) {
      const context = await browser.newContext({
        viewport,
        serviceWorkers: "block",
      });
      await context.addCookies([
        {
          name: authCookieName,
          value: await createSession(
            "browser-fixture",
            new Date(Date.now() + 3600_000),
          ),
          url: baseURL,
        },
      ]);
      const page = await context.newPage();
      const hiddenState = createHiddenMockState(png);
      page.setDefaultTimeout(15_000);
      let feedback,
        lastImageRequest,
        correctionRelease,
        correctionStarted,
        failCorrection = false;
      const json = (route, body, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      await context.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (!["http:", "https:"].includes(url.protocol))
          return route.continue();
        if (url.origin !== baseURL) {
          const entry = {
            size,
            url: url.href,
            reason: "External request blocked",
          };
          if (
            /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//.test(url.href)
          ) {
            report.noise.push({
              ...entry,
              reason:
                "Allowed external Google font asset (no application data)",
            });
            return route.continue();
          }
          report.unexpected.push(entry);
          return route.fulfill({
            status: 200,
            body: "",
            contentType: "text/plain",
          });
        }
        if (!url.pathname.startsWith("/api/")) return route.continue();
        report.mocks.push({
          size,
          method: request.method(),
          path: url.pathname,
        });
        if (url.pathname === "/api/correct") {
          correctionStarted?.();
          if (correctionRelease)
            await new Promise((resolve) => {
              correctionRelease.resolve = resolve;
            });
          return json(
            route,
            failCorrection
              ? { error: "Synthetic correction error" }
              : { text: "Corrected synthetic text" },
          );
        }
        if (url.pathname === "/api/feedback") {
          feedback = request.postDataJSON();
          return json(route, { ok: true, taskUrl: null });
        }
        if (url.pathname === "/api/images" && request.method() === "POST")
          lastImageRequest = request.postDataJSON();
        if (url.pathname === "/api/images")
          return json(
            route,
            request.method() === "GET"
              ? {
                  models: [
                    {
                      id: "black-forest-labs/flux.2-pro",
                      name: "Fixture FLUX",
                      supported_parameters: ["seed"],
                    },
                  ],
                  credit: 0,
                }
              : {
                  image: {
                    data: png,
                    seed: 4242,
                    model: "fixture/flux",
                    resolution: 512,
                    usage: {},
                  },
                },
          );
        if (url.pathname === "/api/ocr")
          return json(route, { text: "Synthetic OCR text" });
        if (await mockHiddenApi(route, hiddenState, json)) return;
        // Catch-all safety: a new endpoint cannot reach a private server/provider unnoticed.
        report.unexpected.push({
          size,
          method: request.method(),
          path: url.pathname,
          reason: "Unspecified private API fixture",
        });
        return json(route, {
          error: "Browser fixture blocked unspecified private API",
        });
      });
      page.on("console", (message) => {
        const entry = {
          size,
          type: message.type(),
          text: message.text(),
          location: message.location(),
        };
        report.console.push(entry);
        if (
          /fonts\.(googleapis|gstatic)\.com|Content Security Policy.*(?:font|Google)/i.test(
            entry.text + " " + entry.location.url,
          )
        )
          report.noise.push(entry);
        else if (message.type() === "error") report.unexpected.push(entry);
      });
      page.on("pageerror", (error) => {
        report.pageErrors.push({ size, error: error.message });
        report.unexpected.push(error.message);
      });
      page.on("requestfailed", (request) => {
        const entry = {
          size,
          url: request.url(),
          error: request.failure()?.errorText,
        };
        report.network.push(entry);
        if (/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//.test(entry.url))
          report.noise.push(entry);
        else if (!/net::ERR_ABORTED/.test(entry.error ?? ""))
          report.unexpected.push(entry);
      });
      page.on("response", (response) => {
        if (response.status() >= 400) {
          const entry = {
            size,
            url: response.url(),
            status: response.status(),
          };
          report.network.push(entry);
          if (/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//.test(entry.url))
            report.noise.push(entry);
          else report.unexpected.push(entry);
        }
      });
      async function captureHeaderHitRegions(phase) {
        const geometry = await page.evaluate(() => {
          const language = document.querySelector(".utility.language");
          const feedback = document.querySelector(".bug-report");
          const icon = feedback?.querySelector(".material-icons");
          if (!language || !feedback || !icon) return { missingHeader: true };
          const describe = (node) => {
            const rect = node.getBoundingClientRect(),
              style = getComputedStyle(node);
            return {
              tag: node.tagName,
              className: node.className,
              text: node.textContent.slice(0, 100),
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              overflowX: style.overflowX,
              pointerEvents: style.pointerEvents,
            };
          };
          const rect = language.getBoundingClientRect();
          const center = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
          const hits = document.elementsFromPoint(center.x, center.y);
          return {
            viewportWidth: innerWidth,
            language: describe(language),
            feedback: describe(feedback),
            icon: describe(icon),
            center,
            centerHitsLanguage: Boolean(hits[0] && language.contains(hits[0])),
            hitStack: hits.slice(0, 8).map(describe),
            fontsStatus: document.fonts.status,
            iconFontReady: document.fonts.check(
              '100 27.54px "Material Symbols Outlined"',
              "bug_report",
            ),
            iconFontFaces: Array.from(document.fonts)
              .filter((face) => face.family.includes("Material"))
              .map((face) => ({
                family: face.family,
                weight: face.weight,
                status: face.status,
              })),
          };
        });
        report.headerHitRegions.push({ size, phase, ...geometry });
        return geometry;
      }
      async function captureHeaderPixels(phase) {
        // CDP captures the real current pixels without screenshot() waiting for pending web fonts.
        // This neither changes font loading nor hides fallback text/overflow from the evidence.
        const session = await context.newCDPSession(page);
        try {
          const image = await session.send("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: false,
          });
          await writeFile(
            resolve(output, `${size}-header-${phase}.png`),
            Buffer.from(image.data, "base64"),
          );
        } finally {
          await session.detach();
        }
      }
      async function stage(name, action) {
        try {
          await action();
          report.passed++;
          report.stages.push({ size, name, status: "passed" });
          console.log(`PASS ${size}: ${name}`);
        } catch (error) {
          report.failed++;
          report.stages.push({
            size,
            name,
            status: "failed",
            error: error.stack,
          });
          console.error(`FAIL ${size}: ${name}: ${error.message}`);
          await page
            .screenshot({
              path: resolve(output, `${size}-failure-${report.failed}.png`),
              fullPage: true,
            })
            .catch((captureError) =>
              report.screenshotErrors.push({
                size,
                phase: name,
                error: captureError.message,
              }),
            );
        }
      }
      const slot = (id) => page.locator(`[data-tool-id="${id}"]`);
      async function select(id) {
        const nav = page.locator(`[data-app-id="${id}"]`);
        if (!(await nav.isVisible())) await page.locator(".brand-mark").click();
        await nav.click();
        await expect(slot(id)).toHaveAttribute("data-tool-active", "true");
        await expect(slot(id).locator(".tool-loading")).toHaveCount(0);
        await expect(slot(id)).not.toHaveAttribute("hidden", "");
        await expect(
          slot(id)
            .locator(id === "map" ? "input[type=number]" : "h1")
            .first(),
        ).toBeVisible();
      }
      async function retained(id, selector, value) {
        await select("barcode");
        await select(id);
        await expect(slot(id).locator(selector)).toHaveValue(value);
      }
      await page.goto(baseURL, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      const initialHeaderHitRegion =
        await captureHeaderHitRegions("initial-render");
      await captureHeaderPixels("initial-render");
      await stage("release flags and lazy first mount", async () => {
        await expect(page.locator("[data-tool-id]")).toHaveCount(0);
        for (const tool of toolDefinitions)
          await expect(page.locator(`[data-app-id="${tool.id}"]`)).toHaveCount(
            tool.hidden ? 0 : 1,
          );
        await expect(
          page.locator('[data-app-id="scriptBuffet"]'),
        ).toHaveAttribute("aria-disabled", "false");
        await expect(page.locator("[data-tool-id]")).toHaveCount(0);
        await select("extraction");
        await expect(page.locator("[data-tool-id]")).toHaveCount(1);
      });
      await stage(
        "Map Maker fixture covers crop, drawing, language, compact layout, zoom, and export",
        async () => {
          const map = slot("map");
          const languageButton = page.locator(".utility.language");
          try {
            await select("map");
            if (
              size === "narrow" &&
              (await page
                .locator(".brand-mark")
                .getAttribute("aria-expanded")) === "true"
            ) {
              await page.locator(".brand-mark").click();
              await expect(page.locator(".brand-mark")).toHaveAttribute(
                "aria-expanded",
                "false",
              );
            }

            const svg = map.locator('svg[data-fixture-map-year="2026"]');
            await expect(svg).toHaveCount(1);
            const mapAiIndicator = map.locator(
              ".figure-controls > .processing-badge",
            );
            await expect(mapAiIndicator).toBeVisible();
            await expect(mapAiIndicator).toHaveText("AI ENABLED");
            await expect(
              map.locator(".map-prompt-field .map-ai-indicator"),
            ).toHaveCount(0);
            const politicalPreset = map
              .locator(".map-purpose-grid .map-choice-button")
              .filter({ hasText: "Political" });
            const physicalPreset = map
              .locator(".map-purpose-grid .map-choice-button")
              .filter({ hasText: "Physical" });
            const detailedDensity = map
              .locator(".map-density-grid .map-choice-button")
              .filter({ hasText: "Detailed" });
            await expect(
              map.locator(".map-projection > label > span"),
            ).toHaveCount(0);
            await expect(
              map.locator(
                ".map-projection-options :is(.map-layer-graticule, .map-layer-graticuleFront)",
              ),
            ).toHaveCount(2);
            await expect(map.locator(".map-layer-columns")).toHaveCount(1);
            await expect(map.locator(".map-layer-column")).toHaveCount(2);
            await expect(
              map.locator(".map-layers > .map-layer-priority-note"),
            ).toHaveCount(1);
            await expect(
              map.getByText(
                "Optional terrain, mountain, river, lake, disputed-boundary, and climate overlays",
                { exact: false },
              ),
            ).toHaveCount(0);
            const reorganizedStyles = await map.evaluate((root) => {
              const projectionOptions = root.querySelector(
                ".map-projection-options",
              );
              const secondColumn = root.querySelector(
                ".map-layer-column + .map-layer-column",
              );
              const density = root.querySelector(".map-layer-density");
              const prompt = root.querySelector(".map-prompt-field");
              return {
                projectionColumns: projectionOptions
                  ? getComputedStyle(projectionOptions)
                      .gridTemplateColumns.split(" ")
                      .filter(Boolean).length
                  : 0,
                columnBorder: secondColumn
                  ? getComputedStyle(secondColumn).borderLeftWidth
                  : "missing",
                densityBorder: density
                  ? getComputedStyle(density).borderTopWidth
                  : "missing",
                promptBorder: prompt
                  ? getComputedStyle(prompt).borderBottomWidth
                  : "missing",
              };
            });
            expect(reorganizedStyles).toEqual({
              projectionColumns: 2,
              columnBorder: "0px",
              densityBorder: "0px",
              promptBorder: "1px",
            });
            await expect(
              map.locator(".map-export-crop > .map-preview-controls button"),
            ).toHaveText(["+", "−", "↺"]);
            await expect
              .poll(() =>
                map.evaluate((root) => {
                  const layers = root.querySelector(".map-layers");
                  const prompt = root.querySelector(".map-prompt-field");
                  return Boolean(
                    layers &&
                    prompt &&
                    layers.compareDocumentPosition(prompt) &
                      Node.DOCUMENT_POSITION_FOLLOWING,
                  );
                }),
              )
              .toBe(true);
            await expect(politicalPreset).toHaveAttribute(
              "aria-pressed",
              "true",
            );
            await expect(
              map
                .locator(".map-density-grid .map-choice-button")
                .filter({ hasText: "Standard" }),
            ).toHaveAttribute("aria-pressed", "true");
            await expect(
              map.locator(".map-print-controls"),
            ).not.toHaveAttribute("open", "");
            await expect(
              map.locator('[data-testid="map-print-preset"]'),
            ).toHaveValue("original");
            await expect(
              map.locator('[data-testid="map-publication-preflight"]'),
            ).toContainText("Review needed");

            const beforePurpose = hiddenState.timelines.length;
            await physicalPreset.click();
            await expect
              .poll(() => hiddenState.timelines.length)
              .toBe(beforePurpose + 1);
            for (const layer of [
              "water",
              "lakes",
              "rivers",
              "terrain",
              "mountains",
              "waterLabels",
            ])
              await expect(
                map.locator(`.map-layer-${layer} input`),
              ).toBeChecked();
            await expect(
              map.locator(".map-layer-boundaries input"),
            ).not.toBeChecked();
            await map.locator(".map-layer-rivers input").uncheck();
            await expect(map.locator(".map-editor-canvas")).toHaveClass(
              /hide-rivers/,
            );
            await expect(map.locator(".map-purpose-custom")).toBeVisible();
            await politicalPreset.click();
            await expect(map.locator(".map-editor-canvas")).not.toHaveClass(
              /hide-rivers/,
            );
            await expect(politicalPreset).toHaveAttribute(
              "aria-pressed",
              "true",
            );
            await detailedDensity.click();
            await expect(detailedDensity).toHaveAttribute(
              "aria-pressed",
              "true",
            );

            const geometry = await map.evaluate((root) => {
              const describe = (selector) => {
                const node = root.querySelector(selector);
                if (!node) return null;
                const rect = node.getBoundingClientRect();
                return {
                  left: rect.left,
                  right: rect.right,
                  top: rect.top,
                  bottom: rect.bottom,
                  width: rect.width,
                  height: rect.height,
                };
              };
              return {
                crop: describe(".map-export-crop"),
                transform: describe(".map-transform"),
                preview: describe(".figure-preview-column"),
                controls: describe(".figure-controls"),
              };
            });
            expect(geometry.crop).not.toBeNull();
            expect(geometry.transform).not.toBeNull();
            expect(geometry.crop.width).toBeGreaterThan(
              size === "narrow" ? 280 : 300,
            );
            expect(geometry.crop.height).toBeGreaterThan(190);
            for (const edge of ["left", "top", "width", "height"])
              expect(
                Math.abs(geometry.crop[edge] - geometry.transform[edge]),
                `${size}: crop and transformed map ${edge} should match`,
              ).toBeLessThanOrEqual(1.5);
            if (size === "narrow") {
              expect(
                geometry.controls.top,
                "390px controls should flow below the preview",
              ).toBeGreaterThanOrEqual(geometry.preview.bottom - 1);
              expect(
                geometry.crop.bottom,
                "390px crop should not overlap the controls",
              ).toBeLessThanOrEqual(geometry.controls.top + 1);
            }

            await map.locator(".map-label-position-toggle").click();
            const positionToggleBox = await map
              .locator(".map-label-position-toggle")
              .boundingBox();
            const positionToolsBox = await map
              .locator(".map-label-position-toggle + .map-label-tools")
              .boundingBox();
            expect(positionToggleBox).not.toBeNull();
            expect(positionToolsBox).not.toBeNull();
            expect(
              positionToolsBox.y -
                (positionToggleBox.y + positionToggleBox.height),
            ).toBeGreaterThanOrEqual(5);
            await map.locator(".map-label-position-toggle").click();

            await map.locator(".map-draw-toggle").click();
            const drawLabelBox = await map
              .locator(".map-draw-label input")
              .boundingBox();
            const drawActionsBox = await map
              .locator(".map-draw-actions")
              .boundingBox();
            expect(drawLabelBox).not.toBeNull();
            expect(drawActionsBox).not.toBeNull();
            expect(drawActionsBox.y).toBeGreaterThanOrEqual(
              drawLabelBox.y + drawLabelBox.height + 5,
            );
            const canvas = map.locator(".map-editor-canvas");
            await canvas.evaluate((node) =>
              node.scrollIntoView({ block: "start", inline: "nearest" }),
            );
            const cropBox = await map.locator(".map-export-crop").boundingBox();
            expect(cropBox).not.toBeNull();
            await page.mouse.click(
              cropBox.x + cropBox.width / 2,
              cropBox.y + cropBox.height / 2,
            );
            const drawGroup = map.locator("#editor-draw");
            await expect(drawGroup).toHaveCount(1);
            const drawItems = JSON.parse(
              (await drawGroup.getAttribute("data-draw-items")) ?? "[]",
            );
            expect(drawItems).toHaveLength(1);
            expect(drawItems[0].kind).toBe("battle");
            expect(drawItems[0].x).toBeGreaterThan(497);
            expect(drawItems[0].x).toBeLessThan(503);
            expect(drawItems[0].y).toBeGreaterThan(347);
            expect(drawItems[0].y).toBeLessThan(353);

            const beforeCzech = hiddenState.timelines.length;
            await languageButton.click();
            await expect(languageButton.locator(".active-option")).toHaveText(
              "CZ",
            );
            await expect
              .poll(() => hiddenState.timelines.length)
              .toBeGreaterThan(beforeCzech);
            await expect
              .poll(() => hiddenState.timelines.at(-1)?.lang)
              .toBe("cs");
            expect(hiddenState.timelines.at(-1)).toEqual({
              year: 2026,
              lang: "cs",
              projection: "schematic",
            });
            await expect(svg).toHaveAttribute("data-fixture-map-lang", "cs");
            await expect(mapAiIndicator).toHaveText("AI AKTIVNÍ");
            await expect(
              map
                .locator(".map-purpose-grid .map-choice-button")
                .filter({ hasText: "Politická" }),
            ).toHaveAttribute("aria-pressed", "true");
            await expect(
              map
                .locator(".map-density-grid .map-choice-button")
                .filter({ hasText: "Podrobná" }),
            ).toHaveAttribute("aria-pressed", "true");

            await languageButton.click();
            await expect(languageButton.locator(".active-option")).toHaveText(
              "EN",
            );
            await expect
              .poll(() => hiddenState.timelines.at(-1)?.lang)
              .toBe("en");
            await expect(svg).toHaveAttribute("data-fixture-map-lang", "en");
            await expect(mapAiIndicator).toHaveText("AI ENABLED");

            const parseTransform = async () => {
              const style = (await svg.getAttribute("style")) ?? "";
              const match = style.match(
                /translate\(([-\d.]+)px,\s*([-\d.]+)px\) scale\(([-\d.]+)\)/,
              );
              return match
                ? {
                    x: Number(match[1]),
                    y: Number(match[2]),
                    scale: Number(match[3]),
                  }
                : null;
            };
            await map
              .locator(".map-projection select")
              .nth(1)
              .selectOption("europe");
            await expect
              .poll(async () => (await parseTransform())?.scale ?? 1)
              .toBeGreaterThan(1);
            const presetTransform = await parseTransform();
            expect(presetTransform).not.toBeNull();
            const assertFixtureRegionCentered = async () => {
              const [crop, marker] = await Promise.all([
                map.locator(".map-export-crop").boundingBox(),
                map
                  .locator('[data-fixture-region-center="europe"]')
                  .boundingBox(),
              ]);
              expect(crop).not.toBeNull();
              expect(marker).not.toBeNull();
              expect(
                Math.abs(
                  marker.x + marker.width / 2 - (crop.x + crop.width / 2),
                ),
              ).toBeLessThanOrEqual(3);
              expect(
                Math.abs(
                  marker.y + marker.height / 2 - (crop.y + crop.height / 2),
                ),
              ).toBeLessThanOrEqual(3);
            };
            await assertFixtureRegionCentered();
            await map.locator(".map-view-buttons button").first().click();
            await expect
              .poll(async () => (await parseTransform())?.scale ?? 1)
              .toBeGreaterThan(presetTransform.scale);
            const zoomedTransform = await parseTransform();
            expect(zoomedTransform).not.toBeNull();
            expect(
              Math.abs(
                presetTransform.x / presetTransform.scale -
                  zoomedTransform.x / zoomedTransform.scale,
              ),
            ).toBeLessThan(0.02);
            expect(
              Math.abs(
                presetTransform.y / presetTransform.scale -
                  zoomedTransform.y / zoomedTransform.scale,
              ),
            ).toBeLessThan(0.02);
            await assertFixtureRegionCentered();

            await map.locator(".map-layer-lakes input").uncheck();
            await expect(map.locator(".map-legend-symbol-lake")).toHaveCount(0);
            const downloadPromise = page.waitForEvent("download");
            await map.locator(".map-export-actions button").click();
            const download = await downloadPromise;
            expect(download.suggestedFilename()).toBe("synthetic-map-2026.svg");
            const stream = await download.createReadStream();
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            const exportedMap = Buffer.concat(chunks).toString("utf8");
            const exportedLayers = await page.evaluate((source) => {
              const document = new DOMParser().parseFromString(
                source,
                "image/svg+xml",
              );
              return {
                lakeDisplay:
                  document.querySelector("#lakes")?.style.display ?? null,
                legendText:
                  document.querySelector("#map-legend")?.textContent ?? "",
                width: document.documentElement.getAttribute("width"),
                height: document.documentElement.getAttribute("height"),
                printPreset:
                  document.documentElement.getAttribute("data-print-preset"),
              };
            }, exportedMap);
            expect(exportedLayers.lakeDisplay).toBe("none");
            expect(exportedLayers.legendText).not.toMatch(/lake/i);
            expect(exportedLayers.width).toBe("1000");
            expect(exportedLayers.height).toBe("700");
            expect(exportedLayers.printPreset).toBeNull();

            await map.locator(".map-print-controls summary").click();
            await map
              .locator('[data-testid="map-print-preset"]')
              .selectOption("90mm");
            await expect(
              map.locator('[data-testid="map-publication-preflight"]'),
            ).toContainText("Use Essential label density");
            const physicalDownloadPromise = page.waitForEvent("download");
            await map.locator(".map-export-actions button").click();
            const physicalDownload = await physicalDownloadPromise;
            expect(physicalDownload.suggestedFilename()).toBe(
              "synthetic-map-2026.svg",
            );
            const physicalStream = await physicalDownload.createReadStream();
            const physicalChunks = [];
            for await (const chunk of physicalStream)
              physicalChunks.push(chunk);
            const physicalExport =
              Buffer.concat(physicalChunks).toString("utf8");
            const physicalDimensions = await page.evaluate((source) => {
              const document = new DOMParser().parseFromString(
                source,
                "image/svg+xml",
              );
              return {
                width: document.documentElement.getAttribute("width"),
                height: document.documentElement.getAttribute("height"),
                printPreset:
                  document.documentElement.getAttribute("data-print-preset"),
                viewBox: document.documentElement
                  .getAttribute("viewBox")
                  ?.split(/\s+/)
                  .map(Number),
              };
            }, physicalExport);
            expect(physicalDimensions.width).toBe("90mm");
            expect(physicalDimensions.height).toBe("63mm");
            expect(physicalDimensions.printPreset).toBe("90mm");
            expect(physicalDimensions.viewBox).toHaveLength(4);
            expect(physicalDimensions.viewBox.every(Number.isFinite)).toBe(
              true,
            );
            expect(physicalDimensions.viewBox[2]).toBeGreaterThan(0);
            expect(physicalDimensions.viewBox[3]).toBeGreaterThan(0);
          } finally {
            if (
              (await languageButton.locator(".active-option").innerText()) ===
              "CZ"
            )
              await languageButton.click();
          }
        },
      );
      await stage(
        "Text correction finishes while inactive; hidden/inert retention",
        async () => {
          await select("extraction");
          await slot("extraction")
            .locator("textarea")
            .nth(0)
            .fill("Private synthetic source sentinel");
          await slot("extraction")
            .locator("textarea")
            .nth(1)
            .fill("Synthetic correction instruction");
          correctionRelease = {};
          const started = new Promise((resolve) => {
            correctionStarted = resolve;
          });
          await slot("extraction").locator(".correction-box button").click();
          await started;
          await select("grep");
          await expect(slot("extraction")).toHaveAttribute("hidden", "");
          await expect(slot("extraction")).toHaveAttribute("inert", "");
          correctionRelease.resolve();
          correctionRelease = null;
          await expect(
            slot("extraction").locator("textarea").nth(0),
          ).toHaveValue("Corrected synthetic text");
          await select("extraction");
          await expect(
            slot("extraction").locator("textarea").nth(1),
          ).toHaveValue("");
        },
      );
      await stage("GREP nested inputs and barcode input retained", async () => {
        await select("grep");
        const inputs = slot("grep").locator("input");
        await inputs.nth(0).fill("Find synthetic numbered headings");
        await inputs.nth(1).fill("Replace synthetic marker");
        await select("barcode");
        await slot("barcode").locator("input").fill("978-80-253-1234-6");
        await select("grep");
        await expect(inputs.nth(0)).toHaveValue(
          "Find synthetic numbered headings",
        );
        await expect(inputs.nth(1)).toHaveValue("Replace synthetic marker");
        await select("barcode");
        await expect(slot("barcode").locator("input")).toHaveValue(
          "978-80-253-1234-6",
        );
      });
      await stage("Cover subject and keywords retained", async () => {
        await select("cover");
        const subject = slot("cover").locator("#cover-subject");
        const options = await subject
          .locator("option")
          .evaluateAll((nodes) => nodes.map((node) => node.value));
        await subject.selectOption(options[1]);
        await slot("cover")
          .locator("#cover-keywords")
          .fill("Synthetic astronomy cover");
        await retained("cover", "#cover-keywords", "Synthetic astronomy cover");
        await expect(subject).toHaveValue(options[1]);
      });
      await stage(
        "Cover Splitter local PDF and settings retained without processing",
        async () => {
          await select("coverSplitter");
          await slot("coverSplitter")
            .locator("input[type=file]")
            .setInputFiles(pdf);
          await slot("coverSplitter")
            .locator(".cover-splitter-size")
            .selectOption("half");
          await retained("coverSplitter", ".cover-splitter-size", "half");
          await expect(slot("coverSplitter")).toContainText(pdf.name);
          await expect(
            slot("coverSplitter").locator("[role=progressbar]"),
          ).toHaveCount(0);
        },
      );
      await stage(
        "Solutions local files and typography retained without workers",
        async () => {
          await select("solutions");
          const files = slot("solutions").locator("input[type=file]");
          await files.nth(0).setInputFiles(pdf);
          await files
            .nth(1)
            .setInputFiles({ ...pdf, name: "synthetic-answers.pdf" });
          await files.nth(2).setInputFiles({
            name: "synthetic.idml",
            mimeType: "application/octet-stream",
            buffer: Buffer.from(
              "synthetic fixture; processing intentionally not started",
            ),
          });
          await slot("solutions")
            .locator("select")
            .nth(0)
            .selectOption("Times New Roman");
          await slot("solutions").locator("select").nth(1).selectOption("14");
          await select("barcode");
          await select("solutions");
          await expect(slot("solutions")).toContainText("synthetic.idml");
          await expect(slot("solutions").locator("select").nth(0)).toHaveValue(
            "Times New Roman",
          );
          await expect(slot("solutions").locator("select").nth(1)).toHaveValue(
            "14",
          );
        },
      );
      await stage("Index words and page-number settings retained", async () => {
        await select("index");
        await slot("index")
          .locator("textarea")
          .nth(0)
          .fill("synthetic planet\nsynthetic star");
        await slot("index").locator("input[type=number]").last().fill("7");
        await retained(
          "index",
          "textarea:not([readonly])",
          "synthetic planet\nsynthetic star",
        );
        await expect(
          slot("index").locator("input[type=number]").last(),
        ).toHaveValue("7");
      });
      await stage(
        "Image own prompt, style and mock gallery retained; advanced release flag",
        async () => {
          await select("image");
          await slot("image")
            .locator("#image-generator-prompt")
            .fill("Synthetic blue sphere on white");
          await slot("image")
            .locator("#image-generator-medium")
            .selectOption("storybook-object");
          await expect(
            slot("image").locator("#image-generator-seed"),
          ).toHaveCount(0);
          await slot("image").locator(".cover-generate").click();
          await expect(
            slot("image").locator('img[src^="data:image"]'),
          ).toHaveCount(1);
          expect(lastImageRequest.medium).toBe("storybook-object");
          const { imageStylePresets } =
            await import("../app/_tools/image/image-generator/code/style-presets.ts");
          expect(lastImageRequest.seed).toBe(
            imageStylePresets.find((preset) => preset.id === "storybook-object")
              .seed,
          );
          await retained(
            "image",
            "#image-generator-prompt",
            "Synthetic blue sphere on white",
          );
          await expect(
            slot("image").locator("#image-generator-medium"),
          ).toHaveValue("storybook-object");
          await expect(
            slot("image").locator('img[src^="data:image"]'),
          ).toHaveCount(1);
        },
      );
      await stage(
        "Inactive global paste/drop cannot mutate Text Extractor",
        async () => {
          await select("image");
          const before = await slot("extraction")
            .locator("textarea")
            .nth(0)
            .inputValue();
          await page.evaluate(() => {
            const data = new DataTransfer();
            data.setData(
              "text/plain",
              "Inactive paste must not replace source",
            );
            window.dispatchEvent(
              new ClipboardEvent("paste", {
                clipboardData: data,
                bubbles: true,
                cancelable: true,
              }),
            );
            data.items.add(
              new File(["fixture"], "synthetic.txt", { type: "text/plain" }),
            );
            window.dispatchEvent(
              new DragEvent("drop", {
                dataTransfer: data,
                bubbles: true,
                cancelable: true,
              }),
            );
          });
          await expect(
            slot("extraction").locator("textarea").nth(0),
          ).toHaveValue(before);
          const ocrBefore = report.mocks.filter(
            (entry) => entry.path === "/api/ocr",
          ).length;
          await page.evaluate((image) => {
            const bytes = Uint8Array.from(atob(image.split(",")[1]), (char) =>
              char.charCodeAt(0),
            );
            const data = new DataTransfer();
            data.items.add(
              new File([bytes], "synthetic-drop.png", { type: "image/png" }),
            );
            // Dispatch to both DOM targets: even a synthetic event on a hidden subtree must be gated.
            document
              .querySelector('[data-tool-id="extraction"] .extraction-module')
              .dispatchEvent(
                new DragEvent("drop", {
                  dataTransfer: data,
                  bubbles: true,
                  cancelable: true,
                }),
              );
            document
              .querySelector('[data-tool-id="image"] .image-generator-module')
              .dispatchEvent(
                new DragEvent("drop", {
                  dataTransfer: data,
                  bubbles: true,
                  cancelable: true,
                }),
              );
          }, png);
          await expect(
            slot("image").locator(".cover-references img"),
          ).toHaveCount(1);
          await expect(
            slot("extraction").locator("textarea").nth(0),
          ).toHaveValue(before);
          expect(
            report.mocks.filter((entry) => entry.path === "/api/ocr").length,
          ).toBe(ocrBefore);
          await select("extraction");
          await page.evaluate(() => {
            const data = new DataTransfer();
            data.setData("text/plain", "Selected synthetic paste");
            window.dispatchEvent(
              new ClipboardEvent("paste", {
                clipboardData: data,
                bubbles: true,
                cancelable: true,
              }),
            );
          });
          await expect(
            slot("extraction").locator("textarea").nth(0),
          ).toHaveValue("Selected synthetic paste");
          await expect(
            slot("image").locator("#image-generator-prompt"),
          ).toHaveValue("Synthetic blue sphere on white");
          await expect(
            slot("image").locator(".cover-references img"),
          ).toHaveCount(1);
        },
      );
      await stage(
        "Other released tools lazy mount and retain their subtree",
        async () => {
          for (const id of ["prompt", "layerSplitter"]) {
            await select(id);
            await slot(id).evaluate((node) => {
              node.dataset.browserMountSentinel = "retained";
            });
            await select("barcode");
            await select(id);
            await expect(slot(id)).toHaveAttribute(
              "data-browser-mount-sentinel",
              "retained",
            );
          }
        },
      );
      await stage("Language button pointer accessibility", async () => {
        await captureHeaderHitRegions("before-language-click");
        try {
          await page.locator(".utility.language").click({ timeout: 3000 });
        } catch (error) {
          await captureHeaderHitRegions("failed-language-click");
          await captureHeaderPixels("failed-language-click").catch(
            (captureError) =>
              report.screenshotErrors.push({
                size,
                phase: "failed-language-click",
                error: captureError.message,
              }),
          );
          throw error;
        }
        await captureHeaderHitRegions("after-language-click");
        await expect(
          page.locator(".utility.language .active-option"),
        ).toHaveText("CZ");
        await page.locator(".utility.language").focus();
        await page.keyboard.press("Space");
        expect(
          initialHeaderHitRegion.centerHitsLanguage,
          `${size}: language hit region must work at initial render even while the icon font is loading`,
        ).toBe(true);
      });
      async function settledDrawer(drawer, language, capture) {
        // Poll actual geometry over consecutive animation frames, not a guessed transition duration.
        await expect
          .poll(
            async () =>
              drawer.evaluate(async (node) => {
                const frames = [];
                for (let index = 0; index < 3; index++) {
                  await new Promise((resolve) =>
                    requestAnimationFrame(resolve),
                  );
                  const rect = node.getBoundingClientRect();
                  frames.push({
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom,
                    width: rect.width,
                    height: rect.height,
                  });
                }
                const rect = frames.at(-1);
                return (
                  rect.width > 0 &&
                  rect.width <= innerWidth + 0.5 &&
                  rect.left >= -0.5 &&
                  Math.abs(rect.right - innerWidth) <= 0.5 &&
                  rect.top >= -0.5 &&
                  rect.bottom <= innerHeight + 0.5 &&
                  frames.every((frame) =>
                    Object.keys(rect).every(
                      (key) => Math.abs(frame[key] - rect[key]) <= 0.1,
                    ),
                  )
                );
              }),
            {
              timeout: 5000,
              message: `${size}/${language}/${capture}: drawer must finish its transition and fit entirely onscreen`,
            },
          )
          .toBe(true);
        const geometry = await drawer.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
          };
        });
        report.drawerLayouts.push({ size, language, capture, ...geometry });
      }
      for (const language of ["en", "cs"]) {
        await stage(
          `Image-specific ${language.toUpperCase()} help, settled drawer and model layout`,
          async () => {
            const drawer = page.locator(".info-drawer");
            try {
              await select("image");
              const wanted = language === "cs" ? "CZ" : "EN";
              if (
                (await page
                  .locator(".utility.language .active-option")
                  .innerText()) !== wanted
              ) {
                await page.locator(".utility.language").focus();
                await page.keyboard.press("Space");
              }
              await page.locator(".topbar-controls button").last().click();
              await expect(drawer).toHaveAttribute("aria-hidden", "false");
              await expect(drawer.locator("h2").first()).toHaveText(
                language === "cs" ? "Generátor obrázků" : "Image Generator",
              );
              await expect(drawer).toContainText("INFO / IMAGE");
              for (const model of modelDefinitions) {
                await expect(drawer).toContainText(model.defaultModel);
                await expect(drawer).toContainText(model.label[language]);
              }
              const content = drawer.locator(".drawer-content");
              await content.evaluate((node) => {
                node.scrollTop = 0;
                node.scrollLeft = 0;
              });
              await settledDrawer(drawer, language, "overview");
              await page.screenshot({
                path: resolve(output, `${size}-image-info-${language}.png`),
                fullPage: true,
              });

              const heading = content.getByRole("heading", {
                name:
                  language === "cs"
                    ? "Modely a zpracování"
                    : "Models and processing",
                exact: true,
              });
              await expect(heading).toHaveCount(1);
              const list = heading.locator("xpath=following-sibling::ul[1]");
              for (const model of modelDefinitions) {
                await expect(list).toContainText(model.label[language]);
                await expect(
                  list
                    .locator("code")
                    .filter({ hasText: model.defaultModel })
                    .first(),
                ).toBeAttached();
              }
              // Scroll the real drawer, preserving the model heading and as much of its section as fits.
              await heading.evaluate((node) => {
                const container = node.closest(".drawer-content");
                container.scrollTop +=
                  node.getBoundingClientRect().top -
                  container.getBoundingClientRect().top -
                  16;
              });
              await expect(heading).toBeInViewport();
              await settledDrawer(drawer, language, "models");
              const layout = await content.evaluate(
                (node, modelIds) => {
                  const rect = node.getBoundingClientRect();
                  const codes = Array.from(
                    node.querySelectorAll("code"),
                  ).filter((code) => modelIds.includes(code.textContent));
                  const overflowingIds = codes.flatMap((code) =>
                    Array.from(code.getClientRects())
                      .filter(
                        (fragment) =>
                          fragment.left < rect.left - 0.5 ||
                          fragment.right > rect.right + 0.5,
                      )
                      .map((fragment) => ({
                        model: code.textContent,
                        left: fragment.left,
                        right: fragment.right,
                      })),
                  );
                  return {
                    clientWidth: node.clientWidth,
                    scrollWidth: node.scrollWidth,
                    scrollLeft: node.scrollLeft,
                    scrollTop: node.scrollTop,
                    left: rect.left,
                    right: rect.right,
                    modelCodeCount: codes.length,
                    overflowingIds,
                  };
                },
                modelDefinitions.map((model) => model.defaultModel),
              );
              report.modelLayouts.push({ size, language, ...layout });
              await page.screenshot({
                path: resolve(output, `${size}-image-models-${language}.png`),
                fullPage: true,
              });
              expect(
                layout.scrollWidth,
                `${size}/${language}: drawer content must not require horizontal scrolling`,
              ).toBeLessThanOrEqual(layout.clientWidth + 1);
              expect(
                layout.overflowingIds,
                `${size}/${language}: every model ID fragment must fit inside the drawer`,
              ).toEqual([]);
            } finally {
              if ((await drawer.getAttribute("aria-hidden")) === "false")
                await drawer.locator(".drawer-header button").click();
              if (
                (await page
                  .locator(".utility.language .active-option")
                  .innerText()) !== "EN"
              ) {
                await page.locator(".utility.language").focus();
                await page.keyboard.press("Space");
              }
            }
          },
        );
      }
      await stage(
        "Feedback selected diagnostics exclude inactive errors and private input",
        async () => {
          await select("extraction");
          failCorrection = true;
          await slot("extraction")
            .locator("textarea")
            .nth(1)
            .fill("Private instruction sentinel");
          await slot("extraction").locator(".correction-box button").click();
          await expect(
            slot("extraction").locator("[role=alert]"),
          ).toContainText("Synthetic correction error");
          await select("barcode");
          await page.locator(".bug-report").click();
          await page
            .locator("#bug-feedback-description-input")
            .fill("Synthetic browser report only");
          await page.locator("dialog button[type=submit]").click();
          await expect
            .poll(() => feedback?.diagnostics.selectedTool)
            .toBe("barcode");
          expect(feedback.diagnostics.appStatus).not.toBe("error");
          const serialized = JSON.stringify(feedback.diagnostics);
          expect(serialized).not.toMatch(
            /sentinel|Selected synthetic paste|978-80|ta_session|AUTH_SECRET/,
          );
          await page.keyboard.press("Escape");
        },
      );
      await stage("Refresh resets mounted session subtrees", async () => {
        await page.screenshot({
          path: resolve(output, `${size}-workspace.png`),
          fullPage: true,
        });
        await page.reload({ waitUntil: "networkidle" });
        await expect(page.locator("[data-tool-id]")).toHaveCount(0);
        await select("extraction");
        await expect(slot("extraction").locator("textarea").nth(0)).toHaveValue(
          "",
        );
      });
      await runHiddenLifecycleChecks({
        page,
        baseURL,
        stage,
        state: hiddenState,
        output,
        size,
      });
      correctionRelease?.resolve?.();
      await context.close();
    }
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await writeFile(
      resolve(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      `UI stages: ${report.passed} passed, ${report.failed} failed; ${report.unexpected.length} unexpected browser/network errors; ${report.noise.length} explicitly recorded font/CSP noise entries.`,
    );
  }
  if (report.failed || report.unexpected.length)
    throw new Error(
      `Browser validation failed; see ${resolve(output, "report.json")}`,
    );
  return report;
}
