import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  mkdir,
  mkdtemp,
  copyFile,
  symlink,
  writeFile,
  cp,
  rm,
  readFile,
  readdir,
} from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Node 22 supports stripping the production auth/fixture TypeScript without a loader dependency.
if (!process.execArgv.includes("--experimental-strip-types")) {
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", fileURLToPath(import.meta.url)],
    { stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} else {
  await main();
}

async function removeSandbox(sandbox, output) {
  const path = resolve(sandbox);
  if (
    dirname(path) !== resolve(output) ||
    !/^server-[A-Za-z0-9]+$/.test(basename(path))
  ) {
    throw new Error(
      `Refusing to remove sandbox outside the harness output directory: ${path}`,
    );
  }
  // rm removes symlinks themselves, never their public/node_modules targets.
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}

async function main() {
  const output = resolve(root, "tmp/workspace-ui");
  let sandbox,
    child,
    stopping,
    finishing,
    log = "";
  const kill = (signal) => {
    if (child?.pid) {
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  };
  const cleanup = () =>
    (stopping ??= (async () => {
      kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      kill("SIGKILL");
      // Wait until the whole process group is gone before removing its working directory.
      const until = Date.now() + 3000;
      while (child?.pid) {
        try {
          process.kill(-child.pid, 0);
        } catch (error) {
          if (error.code === "ESRCH") return;
          throw error;
        }
        if (Date.now() >= until)
          throw new Error(
            "Next process group did not exit after SIGKILL; sandbox retained for safety.",
          );
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    })());
  const finish = () =>
    (finishing ??= (async () => {
      await cleanup();
      try {
        if (sandbox) await writeFile(resolve(output, "server.log"), log);
      } finally {
        if (sandbox) await removeSandbox(sandbox, output);
      }
    })());
  const exitAfterCleanup = () => {
    void finish()
      .catch((error) => console.error(error))
      .finally(() => process.exit(1));
  };
  const deadline = setTimeout(() => {
    console.error("UI runner exceeded 420s deadline.");
    exitAfterCleanup();
  }, 420_000);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, exitAfterCleanup);
  process.once("exit", () => kill("SIGKILL"));
  try {
    await mkdir(output, { recursive: true });
    sandbox = await mkdtemp(resolve(output, "server-"));
    // No real .env is read: Next's project directory contains only these explicit inputs.
    await cp(resolve(root, "app"), resolve(sandbox, "app"), {
      recursive: true,
    });
    const fixtureRoute = resolve(sandbox, "app/lifecycle-fixture");
    await mkdir(fixtureRoute, { recursive: true });
    await copyFile(
      resolve(root, "tests/browser-fixtures/lifecycle-page.tsx.fixture"),
      resolve(fixtureRoute, "page.tsx"),
    );
    for (const name of ["public", "node_modules"])
      await symlink(resolve(root, name), resolve(sandbox, name), "dir");
    for (const name of [
      "package.json",
      "tsconfig.json",
      "next.config.ts",
      "proxy.ts",
    ])
      await copyFile(resolve(root, name), resolve(sandbox, name));
    const env = Object.fromEntries(
      ["PATH", "HOME", "TMPDIR", "SystemRoot"]
        .filter((key) => process.env[key])
        .map((key) => [key, process.env[key]]),
    );
    Object.assign(env, {
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      AUTH_SECRET: "workspace-browser-test-only-not-a-real-secret",
      APP_USERS: "browser-fixture:synthetic-password",
      OPENROUTER_API_KEY: "",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      ASANA_ACCESS_TOKEN: "",
    });
    // Explicitly empty every declared private provider environment name, including dedicated keys.
    async function privateNames(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) await privateNames(path);
        else if (/\.(?:ts|tsx|mjs|mts)$/.test(entry.name)) {
          const source = await readFile(path, "utf8");
          for (const name of source.match(
            /\b(?:OPENROUTER|OPENAI|ANTHROPIC|ASANA)_[A-Z_0-9]+\b/g,
          ) ?? [])
            env[name] = "";
        }
      }
    }
    await privateNames(resolve(root, "app"));
    process.env.AUTH_SECRET = env.AUTH_SECRET;
    const port = await new Promise((accept, reject) => {
      const socket = createServer();
      socket.on("error", reject);
      socket.listen(0, "127.0.0.1", () => {
        const port = socket.address().port;
        socket.close((error) => (error ? reject(error) : accept(port)));
      });
    });
    const baseURL = `http://127.0.0.1:${port}`;
    const { runWorkspaceBrowserTests, checkBrowser } =
      await import("../tests/workspace.browser.mjs");
    const executablePath = await checkBrowser();
    child = spawn(
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
    let spawnError;
    child.on("error", (error) => {
      spawnError = error;
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (chunk) => {
        log += chunk.toString();
      });
    const until = Date.now() + 120_000;
    let ready = false;
    while (Date.now() < until) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null)
        throw new Error(`Next exited ${child.exitCode}: ${log.slice(-6000)}`);
      try {
        const response = await fetch(baseURL, {
          signal: AbortSignal.timeout(4000),
          redirect: "manual",
        });
        if (response.status === 200 || response.status === 307) {
          ready = true;
          break;
        }
      } catch {
        /* bounded startup polling */
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready)
      throw new Error(`Next startup exceeded 120s: ${log.slice(-6000)}`);
    await runWorkspaceBrowserTests({ baseURL, executablePath, output });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    await finish();
  }
}
