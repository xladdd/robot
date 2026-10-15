import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const output = resolve(
  process.argv[2] || "/Users/vladfrolov/dev/temp/map-maker-review-2026-10-15",
);
await mkdir(output, { recursive: true });
const sandboxRoot = resolve(root, "tmp/map-headless-review");
await mkdir(sandboxRoot, { recursive: true });
const sandbox = await mkdtemp(resolve(sandboxRoot, "server-"));
await cp(resolve(root, "app"), resolve(sandbox, "app"), { recursive: true });
for (const name of ["public", "node_modules"])
  await symlink(resolve(root, name), resolve(sandbox, name), "dir");
for (const name of [
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "proxy.ts",
])
  await copyFile(resolve(root, name), resolve(sandbox, name));

const port = await new Promise((accept, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close((error) =>
      error ? reject(error) : accept(Number(address.port)),
    );
  });
});
const baseURL = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
  AUTH_SECRET: "map-headless-review-only-not-a-real-secret",
  APP_USERS: "map-review:synthetic-password",
  OPENROUTER_MAP_GENERATOR_API_KEY: "",
};
process.env.AUTH_SECRET = env.AUTH_SECRET;

const child = spawn(
  process.execPath,
  [
    resolve(root, "node_modules/next/dist/bin/next"),
    "dev",
    "--turbopack",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { cwd: sandbox, env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
for (const stream of [child.stdout, child.stderr])
  stream.on("data", (chunk) => {
    serverLog += chunk.toString();
  });
const killServer = (signal) => {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
};

const scenarios = [
  {
    id: "physical-europe",
    title: "Physical Europe",
    purpose: "Physical",
    projection: "naturalEarth",
    region: "europe",
    density: "Essential",
    prompt: "Highlight Czechia, Slovakia and Austria and label the Alps.",
    operations: [
      {
        type: "fill",
        ids: ["203", "703", "040"],
        targets: ["Czechia", "Slovakia", "Austria"],
        color: "orange",
      },
      { type: "label", text: "Alps", x: 520, y: 390 },
    ],
  },
  {
    id: "climate-world",
    title: "World Climate Zones",
    purpose: "Climate",
    projection: "robinson",
    region: "world",
    density: "Detailed",
    prompt: "Label the Equator and highlight Brazil.",
    operations: [
      {
        type: "fill",
        ids: ["076"],
        targets: ["Brazil"],
        color: "green",
      },
      { type: "label", text: "Equator", x: 500, y: 350 },
    ],
  },
  {
    id: "political-americas",
    title: "Political Americas",
    purpose: "Political",
    projection: "eckert4",
    region: "americas",
    density: "Standard",
    enableLayers: ["cities", "graticule"],
    prompt:
      "Colour Canada, the United States and Mexico and label North America.",
    rejectLastOperation: true,
    operations: [
      {
        type: "fill",
        ids: ["124", "840", "484"],
        targets: ["Canada", "United States of America", "Mexico"],
        color: "blue",
      },
      { type: "label", text: "North America", x: 260, y: 245 },
    ],
  },
  {
    id: "blank-africa",
    title: "Blank Africa Exercise",
    purpose: "Blank",
    projection: "naturalEarth",
    region: "africa",
    density: "Essential",
    prompt: "Label the Sahara and highlight South Africa.",
    enableLayers: ["graticule", "rivers", "lakes"],
    operations: [
      {
        type: "fill",
        ids: ["710"],
        targets: ["South Africa"],
        color: "yellow",
      },
      { type: "label", text: "Sahara", x: 515, y: 310 },
    ],
  },
  {
    id: "physical-asia",
    title: "Physical Asia",
    purpose: "Physical",
    projection: "schematic",
    region: "asia",
    density: "Detailed",
    prompt: "Highlight Nepal and label Mount Everest.",
    operations: [
      {
        type: "fill",
        ids: ["524"],
        targets: ["Nepal"],
        color: "pink",
      },
      { type: "label", text: "Mount Everest", x: 690, y: 355 },
    ],
  },
];

const report = {
  started: new Date().toISOString(),
  scenarios: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
};
let browser;
try {
  const startupDeadline = Date.now() + 120_000;
  while (Date.now() < startupDeadline) {
    if (child.exitCode !== null)
      throw new Error(
        `Next exited ${child.exitCode}: ${serverLog.slice(-4000)}`,
      );
    try {
      const response = await fetch(baseURL, {
        redirect: "manual",
        signal: AbortSignal.timeout(3000),
      });
      if ([200, 307].includes(response.status)) break;
    } catch {
      // Bounded startup polling.
    }
    await new Promise((accept) => setTimeout(accept, 500));
  }

  const { createSession, authCookieName } =
    await import("../../../../lib/auth.ts");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1050 },
    serviceWorkers: "block",
    acceptDownloads: true,
  });
  await context.addCookies([
    {
      name: authCookieName,
      value: await createSession(
        "map-review",
        new Date(Date.now() + 60 * 60 * 1000),
      ),
      url: baseURL,
    },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on("console", (message) => {
    if (message.type() === "error") report.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  page.on("requestfailed", (request) =>
    report.failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText || "unknown",
    }),
  );
  await context.route("**/api/maps/generate", async (route) => {
    const prompt = route.request().postDataJSON()?.prompt ?? "";
    const scenario = scenarios.find((item) => item.prompt === prompt);
    await route.fulfill({
      status: scenario ? 200 : 400,
      contentType: "application/json",
      body: JSON.stringify(
        scenario
          ? {
              operations: scenario.operations,
              unresolved: [],
              notes:
                "Synthetic constrained interpretation for headless review.",
              model: "fixture/map-review",
            }
          : { error: "Unknown review prompt" },
      ),
    });
  });

  const selectMap = async () => {
    await page.goto(baseURL, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    const nav = page.locator('[data-app-id="map"]');
    if (!(await nav.isVisible())) await page.locator(".brand-mark").click();
    await nav.click();
    const map = page.locator('[data-tool-id="map"]');
    await map.locator(".map-transform svg").waitFor({ state: "attached" });
    await map.locator(".shaded-relief-image").waitFor({ state: "attached" });
    return map;
  };

  for (const scenario of scenarios) {
    const map = await selectMap();
    const initialPrintOpen = await map
      .locator(".map-print-controls")
      .getAttribute("open");
    await map
      .locator(".map-projection select")
      .first()
      .selectOption(scenario.projection);
    await map
      .locator(`.shaded-relief-image[href*="-${scenario.projection}.jpg"]`)
      .waitFor({ state: "attached" });
    await map
      .locator(".map-projection select")
      .nth(1)
      .selectOption(scenario.region);
    await map
      .locator(".map-purpose-grid .map-choice-button")
      .filter({ hasText: scenario.purpose })
      .click();
    await map
      .locator(".map-density-grid .map-choice-button")
      .filter({ hasText: scenario.density })
      .click();
    for (const layer of scenario.enableLayers ?? []) {
      const input = map.locator(`.map-layer-${layer} input`);
      if (!(await input.isChecked())) await input.check();
    }

    await map.locator(".map-prompt-field textarea").fill(scenario.prompt);
    await map.locator(".map-prompt-field > button").click();
    await map.locator(".map-ai-preview").waitFor({ state: "visible" });
    if (scenario.rejectLastOperation)
      await map.locator(".map-ai-preview input").last().uncheck();
    await map.locator(".map-ai-preview > div button").first().click();
    await map.locator(".map-ai-history").waitFor({ state: "attached" });

    const scale = map.locator(".map-preview-scale");
    const scaleVisible = await scale.isVisible();
    const reliefVisible = await map.locator(".shaded-relief-image").isVisible();
    const visibleCityLabelCount = await map
      .locator(".natural-cities text:visible")
      .count();
    const riversEnabled = await map
      .locator(".map-layer-rivers input")
      .isChecked();
    const visibleRiverPathCount = await map
      .locator(".natural-rivers path:visible")
      .count();
    if (!scaleVisible)
      throw new Error(`Graphic scale missing for ${scenario.id}`);
    if (
      scenario.enableLayers?.includes("cities") &&
      visibleCityLabelCount === 0
    )
      throw new Error(`City labels missing for ${scenario.id}`);
    if (riversEnabled && visibleRiverPathCount === 0)
      throw new Error(`River paths missing for ${scenario.id}`);
    const ridgeCount = await map
      .locator(".relief-ridge, .relief-shadow, .range-shape")
      .count();
    const visiblePeak = map
      .locator(".summit-marker:visible .summit-symbol")
      .first();
    const peakBox = (await visiblePeak.count())
      ? await visiblePeak.boundingBox()
      : null;

    const cropBox = await map.locator(".map-export-crop").boundingBox();
    if (!cropBox) throw new Error(`No crop box for ${scenario.id}`);
    const screenshotName = `${scenario.id}.png`;
    await page.screenshot({
      path: resolve(output, screenshotName),
      clip: cropBox,
    });
    let detailScreenshot = null;
    if (scenario.id === "physical-europe") {
      const zoomIn = map.locator(".map-preview-controls button").first();
      await zoomIn.click();
      await zoomIn.click();
      await zoomIn.click();
      await page.waitForTimeout(500);
      detailScreenshot = "physical-europe-detail.png";
      await page.screenshot({
        path: resolve(output, detailScreenshot),
        clip: cropBox,
      });
      await map.locator(".map-preview-controls button").last().click();
    }
    if (scenario.id === "political-americas") {
      await map
        .locator(".figure-controls")
        .evaluate((element) => element.scrollTo({ top: 0 }));
      await page.screenshot({
        path: resolve(output, "interface-layout.png"),
      });
      const positionToggle = map.locator(".map-label-position-toggle");
      await positionToggle.scrollIntoViewIfNeeded();
      await positionToggle.click();
      await map.locator(".map-draw-toggle").click();
      await page.screenshot({
        path: resolve(output, "interface-tools.png"),
      });
      await map.locator(".map-draw-toggle").click();
      await positionToggle.click();
    }

    await map.locator(".map-print-controls summary").click();
    await map
      .locator(".map-export-metadata-fields input")
      .first()
      .fill(scenario.title);
    const downloadEvent = page.waitForEvent("download");
    await map.locator(".map-export-actions button").click();
    const download = await downloadEvent;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const svg = Buffer.concat(chunks).toString("utf8");
    const svgName = `${scenario.id}.svg`;
    await writeFile(resolve(output, svgName), svg);

    const exportedScaleTag =
      svg.match(/<g id="graphic-scale"[^>]*>/)?.[0] ?? "";

    report.scenarios.push({
      ...scenario,
      initialPrintSettingsCollapsed: initialPrintOpen === null,
      scaleExpected: true,
      scaleVisible,
      visibleCityLabelCount,
      riversEnabled,
      visibleRiverPathCount,
      reliefExpected: scenario.purpose === "Physical",
      reliefVisible,
      ridgeCount,
      peakScreenSize: peakBox
        ? {
            width: Number(peakBox.width.toFixed(2)),
            height: Number(peakBox.height.toFixed(2)),
          }
        : null,
      exportedReliefEmbedded: /href="data:image\/jpeg;base64,/.test(svg),
      exportedScalePresent: Boolean(exportedScaleTag),
      exportedScaleVisible:
        Boolean(exportedScaleTag) && !/display:\s*none/.test(exportedScaleTag),
      exportedRidgesPresent: /relief-ridge|relief-shadow|range-shape/.test(svg),
      screenshot: screenshotName,
      detailScreenshot,
      svg: svgName,
    });
  }

  const markdown = [
    "# Map Maker headless review",
    "",
    `Run: ${report.started}`,
    "",
    "The browser used the real Map Maker timeline renderer and local Natural Earth assets. Only the remote AI interpretation endpoint was replaced with deterministic constrained operations; operation preview, individual approval, application, rendering, screenshots, and SVG export all ran through the application UI.",
    "",
    "| Map | Configuration | Checks | Screenshot | SVG |",
    "| --- | --- | --- | --- | --- |",
    ...report.scenarios.map((item) => {
      const checks = [
        item.initialPrintSettingsCollapsed
          ? "print rollup collapsed"
          : "print rollup open unexpectedly",
        item.reliefExpected
          ? item.reliefVisible
            ? "relief visible"
            : "relief missing"
          : "relief intentionally off",
        item.scaleVisible ? "scale visible" : "scale missing",
        item.visibleCityLabelCount > 0
          ? `${item.visibleCityLabelCount} city labels visible`
          : "city labels not enabled",
        item.riversEnabled
          ? `${item.visibleRiverPathCount} river paths visible`
          : "rivers intentionally off",
        item.ridgeCount === 0
          ? "no ridge lines"
          : `${item.ridgeCount} ridge elements`,
        item.exportedReliefEmbedded
          ? "relief embedded in SVG"
          : "relief URL retained",
        item.exportedScalePresent
          ? item.exportedScaleVisible
            ? "scale visible in SVG"
            : "scale retained but hidden in SVG"
          : "scale missing from export",
      ].join("; ");
      return `| ${item.title} | ${item.purpose}, ${item.projection}, ${item.region}, ${item.density} | ${checks} | [PNG](./${item.screenshot}) | [SVG](./${item.svg}) |`;
    }),
    "",
    "## Visual evidence",
    "",
    ...report.scenarios.flatMap((item) => [
      `### ${item.title}`,
      "",
      `![${item.title}](./${item.screenshot})`,
      ...(item.detailScreenshot
        ? [
            "",
            `High-zoom check: ![${item.title} detail](./${item.detailScreenshot})`,
          ]
        : []),
      "",
      `Peak marker sample: ${item.peakScreenSize ? `${item.peakScreenSize.width} × ${item.peakScreenSize.height} px` : "none visible for this configuration"}. AI request: “${item.prompt}”`,
      "",
    ]),
    "## Browser diagnostics",
    "",
    `- Console errors: ${report.consoleErrors.length}`,
    `- Page errors: ${report.pageErrors.length}`,
    `- Failed requests: ${report.failedRequests.length}`,
    "",
  ].join("\n");
  await writeFile(resolve(output, "report.md"), markdown);
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await context.close();
} finally {
  if (browser) await browser.close().catch(() => {});
  killServer("SIGTERM");
  await new Promise((accept) => setTimeout(accept, 1200));
  killServer("SIGKILL");
  await writeFile(resolve(output, "server.log"), serverLog);
  await rm(sandbox, { recursive: true, force: true });
}

console.log(`Map review written to ${output}`);
