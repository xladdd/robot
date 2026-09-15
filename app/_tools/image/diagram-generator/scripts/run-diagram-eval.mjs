import { execFile } from "node:child_process";
import {
  mkdir,
  open,
  readFile,
  readdir,
  writeFile,
  appendFile,
  rename,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultCasesPath = path.join(scriptDirectory, "evaluation-cases.json");
const runStartedAt = new Date();

function usageText() {
  return [
    "Usage: node app/_tools/image/diagram-generator/scripts/run-diagram-eval.mjs <output-directory> [options]",
    "",
    "Required budget options (or DIAGRAM_EVAL_MAX_CALLS / DIAGRAM_EVAL_MAX_COST_USD):",
    "  --max-calls N             Maximum number of diagram generations",
    "  --max-cost-usd USD        Maximum reserved/reportable generation spend",
    "",
    "Optional options:",
    "  --base-url URL            Local Robot origin (DIAGRAM_EVAL_URL or APP_URL)",
    "  --cases FILE              Case JSON file (DIAGRAM_EVAL_CASES)",
    "  --case ID                 Evaluate only one case; may be repeated",
    "  --model MODEL             Evaluation model passed to the local endpoint",
    "  --reference FILE          Optional visual reference image for selected cases",
    "  --cost-reserve-usd USD    Per-call budget reservation (derived by default)",
    "  --usage-log FILE          Read [openrouter-usage] records after each call",
    "  --timeout-ms MS           One-request timeout; no retries are performed",
    "  --help                    Show this help",
  ].join("\n");
}

function fail(message) {
  throw new Error(`${message}\n\n${usageText()}`);
}

function parseArguments(argv) {
  if (!argv.length || argv.includes("--help")) {
    if (argv.includes("--help")) {
      console.log(usageText());
      process.exit(0);
    }
    fail("An output directory is required.");
  }
  const outputDirectoryArgument = argv.shift();
  const options = { caseIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--case") {
      const value = argv[++index];
      if (!value) fail("--case needs a case ID.");
      options.caseIds.push(value);
    } else if (argument === "--max-calls") {
      options.maxCalls = argv[++index];
    } else if (argument === "--max-cost" || argument === "--max-cost-usd") {
      options.maxCostUsd = argv[++index];
    } else if (argument === "--cost-reserve-usd") {
      options.costReserveUsd = argv[++index];
    } else if (argument === "--base-url") {
      options.baseUrl = argv[++index];
    } else if (argument === "--cases") {
      options.casesPath = argv[++index];
    } else if (argument === "--model") {
      options.model = argv[++index];
    } else if (argument === "--reference") {
      options.referencePath = argv[++index];
    } else if (argument === "--usage-log") {
      options.usageLogPath = argv[++index];
    } else if (argument === "--timeout-ms") {
      options.timeoutMs = argv[++index];
    } else {
      fail(`Unknown option: ${argument}`);
    }
    const optionName = optionNameFor(argument);
    if (
      optionName &&
      (options[optionName] === undefined || options[optionName] === "")
    )
      fail(`${argument} needs a value.`);
  }
  return { outputDirectoryArgument, options };
}

function optionNameFor(argument) {
  return {
    "--max-calls": "maxCalls",
    "--max-cost": "maxCostUsd",
    "--max-cost-usd": "maxCostUsd",
    "--cost-reserve-usd": "costReserveUsd",
    "--base-url": "baseUrl",
    "--cases": "casesPath",
    "--model": "model",
    "--reference": "referencePath",
    "--usage-log": "usageLogPath",
    "--timeout-ms": "timeoutMs",
  }[argument];
}

function configuredValue(optionValue, environmentName) {
  return optionValue ?? process.env[environmentName];
}

function finiteNumber(value, name, { integer = false, minimum = 0 } = {}) {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < minimum ||
    (integer && !Number.isInteger(number))
  )
    fail(
      `${name} must be ${integer ? "an integer" : "a number"} greater than or equal to ${minimum}.`,
    );
  return number;
}

function resolveConfiguration(options) {
  const maxCallsValue = configuredValue(
    options.maxCalls,
    "DIAGRAM_EVAL_MAX_CALLS",
  );
  const maxCostValue = configuredValue(
    options.maxCostUsd,
    "DIAGRAM_EVAL_MAX_COST_USD",
  );
  if (maxCallsValue === undefined)
    fail("An explicit max-call cap is required.");
  if (maxCostValue === undefined) fail("An explicit max-cost cap is required.");
  const maxCalls = finiteNumber(maxCallsValue, "max-call cap", {
    integer: true,
  });
  const maxCostUsd = finiteNumber(maxCostValue, "max-cost cap");
  const explicitReserve = configuredValue(
    options.costReserveUsd,
    "DIAGRAM_EVAL_COST_RESERVE_USD",
  );
  const costReserveUsd =
    explicitReserve === undefined
      ? maxCalls
        ? maxCostUsd / maxCalls
        : 0
      : finiteNumber(explicitReserve, "cost reservation");
  if (maxCostUsd > 0 && maxCalls > 0 && costReserveUsd <= 0)
    fail(
      "The per-call cost reservation must be greater than zero when the caps allow calls.",
    );
  const timeoutMsValue = configuredValue(
    options.timeoutMs,
    "DIAGRAM_EVAL_TIMEOUT_MS",
  );
  const timeoutMs =
    timeoutMsValue === undefined
      ? 180_000
      : finiteNumber(timeoutMsValue, "request timeout", {
          integer: true,
          minimum: 1,
        });
  const baseUrl = (
    configuredValue(options.baseUrl, "DIAGRAM_EVAL_URL") ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  const casesPath = path.resolve(
    configuredValue(options.casesPath, "DIAGRAM_EVAL_CASES") ||
      defaultCasesPath,
  );
  const usageLogPath = configuredValue(
    options.usageLogPath,
    "DIAGRAM_EVAL_USAGE_LOG",
  );
  return {
    maxCalls,
    maxCostUsd,
    costReserveUsd,
    timeoutMs,
    baseUrl,
    casesPath,
    model: configuredValue(options.model, "DIAGRAM_EVAL_MODEL") || "",
    referencePath: configuredValue(
      options.referencePath,
      "DIAGRAM_EVAL_REFERENCE",
    )
      ? path.resolve(
          configuredValue(options.referencePath, "DIAGRAM_EVAL_REFERENCE"),
        )
      : null,
    usageLogPath: usageLogPath ? path.resolve(usageLogPath) : null,
    caseIds: options.caseIds,
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function requirementName(requirement) {
  return typeof requirement === "string"
    ? requirement
    : requirement?.name || requirement?.anyOf?.[0] || "unnamed requirement";
}

function requirementTerms(requirement) {
  if (typeof requirement === "string") return [requirement];
  return Array.isArray(requirement?.anyOf)
    ? requirement.anyOf
    : [requirement?.name];
}

function requirementMatches(requirement, candidates) {
  const normalizedCandidates = candidates.map(normalizeText).filter(Boolean);
  return requirementTerms(requirement)
    .map(normalizeText)
    .filter(Boolean)
    .some((term) =>
      normalizedCandidates.some((candidate) => candidate.includes(term)),
    );
}

function coverage(requirements, candidates) {
  const items = (Array.isArray(requirements) ? requirements : []).map(
    (requirement) => ({
      name: requirementName(requirement),
      matched: requirementMatches(requirement, candidates),
    }),
  );
  const matched = items.filter((item) => item.matched).length;
  return {
    required: items.length,
    matched,
    ratio: items.length ? matched / items.length : 1,
    items,
  };
}

function outputLabels(result) {
  const spec = result?.spec;
  if (!isObject(spec)) return [];

  const labels = [];
  if (spec.version === 2 && Array.isArray(spec.labels))
    labels.push(
      ...spec.labels
        .map((label) => label?.text)
        .filter((label) => typeof label === "string"),
    );
  if (Array.isArray(spec.structures))
    labels.push(
      ...spec.structures
        .map((structure) => structure?.label)
        .filter((label) => typeof label === "string"),
    );
  if (spec.version === 2 && Array.isArray(spec.connections))
    labels.push(
      ...spec.connections
        .map((connection) => connection?.label)
        .filter((label) => typeof label === "string" && label.trim()),
    );
  return labels;
}

function outputConnections(result) {
  const connections =
    result?.spec?.version === 2 && Array.isArray(result.spec.connections)
      ? result.spec.connections
      : [];
  return connections
    .filter(isObject)
    .map((connection) =>
      [connection.label, connection.from, connection.to]
        .filter((value) => typeof value === "string")
        .join(" "),
    );
}

function firstNumber(...values) {
  return (
    values.find(
      (value) => typeof value === "number" && Number.isFinite(value),
    ) ?? null
  );
}

function metadataFromResult(result, usageRecord) {
  const usage = isObject(result?.usage)
    ? result.usage
    : isObject(usageRecord?.usage)
      ? usageRecord.usage
      : null;
  const costUsd = firstNumber(
    result?.cost,
    result?.costUsd,
    usage?.cost,
    usageRecord?.cost,
  );
  const generationId =
    result?.generationId ||
    result?.generation_id ||
    result?.id ||
    usageRecord?.generationId ||
    null;
  const model = result?.model || usageRecord?.model || null;
  return {
    generationId: typeof generationId === "string" ? generationId : null,
    model: typeof model === "string" ? model : null,
    usage,
    costUsd,
    usageRecord: usageRecord || null,
  };
}

function reportData(result) {
  if (typeof result?.report === "string") {
    try {
      return JSON.parse(result.report);
    } catch {
      return null;
    }
  }
  return isObject(result?.report) ? result.report : null;
}

function verificationMarkdown(
  result,
  labelCoverage,
  connectionCoverage,
  metadata,
) {
  const report = reportData(result);
  const spec = report?.spec || result?.spec || {};
  const checks = Array.isArray(report?.checks)
    ? report.checks
    : Array.isArray(result?.checks)
      ? result.checks
      : [];
  const title = spec.title || "Diagram verification report";
  const lines = [
    `# ${title}`,
    "",
    `- Generated: ${report?.generatedAt || new Date().toISOString()}`,
    `- Generator: ${report?.generator || "Taktik Robot Biological Diagram Generator"}`,
    `- Model: ${metadata.model || "not reported"}`,
    `- Generation ID: ${metadata.generationId || "not reported"}`,
    `- HTTP status: ${metadata.httpStatus ?? "not reported"}`,
    "",
    "## Required-label coverage",
    "",
    `- Matched: ${labelCoverage.matched}/${labelCoverage.required} (${Math.round(labelCoverage.ratio * 100)}%)`,
    ...labelCoverage.items.map(
      (item) => `- ${item.matched ? "PASS" : "MISS"}: ${item.name}`,
    ),
    "",
    "## Required-connection coverage",
    "",
    `- Matched: ${connectionCoverage.matched}/${connectionCoverage.required} (${Math.round(connectionCoverage.ratio * 100)}%)`,
    ...connectionCoverage.items.map(
      (item) => `- ${item.matched ? "PASS" : "MISS"}: ${item.name}`,
    ),
    "",
    "## Automated checks",
    "",
    ...checks.map(
      (check) =>
        `- ${check?.level === "pass" ? "PASS" : "WARNING"}: ${check?.message || "Unspecified check"}`,
    ),
  ];
  if (result?.error)
    lines.push("", "## Error", "", `- ${String(result.error)}`);
  return `${lines.join("\n")}\n`;
}

function parseUsageRecords(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .slice(line.indexOf("[openrouter-usage]") + "[openrouter-usage]".length)
        .trim(),
    )
    .filter((line) => line && line.startsWith("{"))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(
      (record) =>
        record?.app === "bio" && record?.operation === "generate-diagram",
    );
}

async function latestUsageRecord(usageLogPath, startedAt, beforeText) {
  if (!usageLogPath) return null;
  let afterText;
  try {
    afterText = await readFile(usageLogPath, "utf8");
  } catch {
    return null;
  }
  const beforeLength = beforeText.length;
  const appended = afterText.slice(Math.min(beforeLength, afterText.length));
  const records = parseUsageRecords(appended);
  const afterStarted = records.filter(
    (record) => !record.occurredAt || record.occurredAt >= startedAt,
  );
  return afterStarted.at(-1) || null;
}

async function usageLogSnapshot(usageLogPath) {
  if (!usageLogPath) return "";
  try {
    return await readFile(usageLogPath, "utf8");
  } catch {
    return "";
  }
}

async function writeExclusive(filePath, data) {
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(data);
  } finally {
    await handle.close();
  }
}

async function writeSummary(filePath, summary) {
  const temporaryPath = `${filePath}.${summary.runId}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function safeSlug(value) {
  return (
    normalizeText(value)
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "") || "case"
  );
}

async function nextAttempt(outputDirectory, caseId) {
  const prefix = `${safeSlug(caseId)}__attempt-`;
  const entries = await readdir(outputDirectory);
  const attempts = entries
    .map((entry) => entry.match(new RegExp(`^${prefix}(\\d+)__`)))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return (attempts.length ? Math.max(...attempts) : 0) + 1;
}

async function gitRevision() {
  try {
    const result = await execFileAsync("git", ["rev-parse", "--short", "HEAD"]);
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

function recordLogLine(record) {
  const status =
    record.httpStatus === null
      ? "no HTTP response"
      : `HTTP ${record.httpStatus}`;
  const cost =
    record.costUsd === null
      ? "cost not reported"
      : `$${record.costUsd.toFixed(6)}`;
  return [
    `## ${record.completedAt} — ${record.case.id} — attempt ${record.attempt}`,
    "",
    `- Status: ${status}`,
    `- Duration: ${record.durationMs} ms`,
    `- Revision: ${record.revision || "not reported"}`,
    `- Model: ${record.model || "not reported"}`,
    `- Generation ID: ${record.generationId || "not reported"}`,
    `- Usage/cost: ${cost}`,
    `- Required labels: ${record.labelCoverage.matched}/${record.labelCoverage.required}`,
    `- Required connections: ${record.connectionCoverage.matched}/${record.connectionCoverage.required}`,
    `- Artifacts: ${Object.values(record.artifacts).filter(Boolean).join(", ") || "none"}`,
    record.error ? `- Error: ${record.error}` : "- Error: none",
    "",
  ].join("\n");
}

async function main() {
  const { outputDirectoryArgument, options } = parseArguments(
    process.argv.slice(2),
  );
  const configuration = resolveConfiguration(options);
  const outputDirectory = path.resolve(outputDirectoryArgument);
  await mkdir(outputDirectory, { recursive: true });
  const runId = `${runStartedAt
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14)}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const revision = process.env.DIAGRAM_EVAL_REVISION || (await gitRevision());
  const casesDocument = JSON.parse(
    await readFile(configuration.casesPath, "utf8"),
  );
  if (!Array.isArray(casesDocument.cases) || !casesDocument.cases.length)
    throw new Error(`No cases found in ${configuration.casesPath}.`);
  const selectedCases = casesDocument.cases.filter(
    (item) =>
      !configuration.caseIds.length || configuration.caseIds.includes(item.id),
  );
  if (
    configuration.caseIds.some(
      (id) => !casesDocument.cases.some((item) => item.id === id),
    )
  )
    throw new Error("One or more --case IDs were not found in the cases file.");

  const summaryPath = path.join(outputDirectory, "spending-summary.json");
  const logPath = path.join(outputDirectory, "evaluation-log.md");
  const referenceData = configuration.referencePath
    ? `data:image/png;base64,${(await readFile(configuration.referencePath)).toString("base64")}`
    : null;
  const summary = {
    schemaVersion: 1,
    runId,
    startedAt: runStartedAt.toISOString(),
    updatedAt: new Date().toISOString(),
    revision,
    endpoint: `${configuration.baseUrl}/api/diagrams`,
    casesFile: configuration.casesPath,
    caps: {
      maxCalls: configuration.maxCalls,
      maxCostUsd: configuration.maxCostUsd,
      costReserveUsd: configuration.costReserveUsd,
      enforcement:
        "A reservation is made before each generation; reported usage replaces that reservation when available.",
    },
    totals: {
      callsStarted: 0,
      casesCompleted: 0,
      reservedCostUsd: 0,
      reportedCostUsd: 0,
      unknownCostCalls: 0,
    },
    stoppedReason: null,
    cases: [],
  };
  await writeSummary(summaryPath, summary);
  await appendFile(
    logPath,
    `# Diagram Generator evaluation — ${runId}\n\n- Started: ${summary.startedAt}\n- Revision: ${revision || "not reported"}\n- Endpoint: ${summary.endpoint}\n- Caps: ${configuration.maxCalls} calls / $${configuration.maxCostUsd.toFixed(6)} reserved USD\n\n`,
  );

  if (!selectedCases.length) {
    summary.stoppedReason = "No cases selected.";
  }
  if (configuration.maxCalls === 0 || configuration.maxCostUsd === 0) {
    summary.stoppedReason = "Budget cap permits no generation calls.";
  }

  let committedCostUsd = 0;
  if (!summary.stoppedReason) {
    const credentialsEntry = (process.env.APP_USERS || "")
      .split(",")
      .find((entry) => entry.includes(":"));
    if (!credentialsEntry) throw new Error("APP_USERS is not configured.");
    const separator = credentialsEntry.indexOf(":");
    const login = await fetch(`${configuration.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: credentialsEntry.slice(0, separator).trim(),
        password: credentialsEntry.slice(separator + 1),
      }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0] || "";
    if (!login.ok || !cookie)
      throw new Error(`Local workflow login failed (${login.status}).`);

    for (const item of selectedCases) {
      if (summary.totals.callsStarted >= configuration.maxCalls) {
        summary.stoppedReason = "Maximum call cap reached.";
        break;
      }
      if (
        committedCostUsd + configuration.costReserveUsd >
        configuration.maxCostUsd + Number.EPSILON
      ) {
        summary.stoppedReason =
          "Maximum cost cap reached before the next call.";
        break;
      }

      const attempt = await nextAttempt(outputDirectory, item.id);
      const baseName = `${safeSlug(item.id)}__attempt-${String(attempt).padStart(2, "0")}__${runId}`;
      const requestBody = {
        request: item.prompt,
        mode: "diagram",
        language: item.language || "en",
        references: referenceData ? [referenceData] : [],
        palette: [],
      };
      if (configuration.model)
        requestBody.evaluationModel = configuration.model;
      const requestText = `${JSON.stringify(requestBody)}\n`;
      const requestFile = `${baseName}.request.json`;
      await writeExclusive(
        path.join(outputDirectory, requestFile),
        requestText,
      );
      const startedAt = new Date();
      const usageBefore = await usageLogSnapshot(configuration.usageLogPath);
      let responseStatus = null;
      let responseBytes = Buffer.alloc(0);
      let result = {};
      let requestError = null;
      summary.totals.callsStarted += 1;
      committedCostUsd += configuration.costReserveUsd;
      try {
        const response = await fetch(`${configuration.baseUrl}/api/diagrams`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: requestText,
          signal: AbortSignal.timeout(configuration.timeoutMs),
        });
        responseStatus = response.status;
        responseBytes = Buffer.from(await response.arrayBuffer());
        const rawText = responseBytes.toString("utf8");
        try {
          result = JSON.parse(rawText);
        } catch {
          result = {
            error: "The local endpoint returned a non-JSON response.",
          };
        }
      } catch (error) {
        requestError = error instanceof Error ? error.message : String(error);
        result = { error: requestError };
      }

      const completedAt = new Date();
      const usageRecord = await latestUsageRecord(
        configuration.usageLogPath,
        startedAt.toISOString(),
        usageBefore,
      );
      const metadata = metadataFromResult(result, usageRecord);
      metadata.model = metadata.model || configuration.model || null;
      metadata.httpStatus = responseStatus;
      const labels = outputLabels(result);
      const connections = outputConnections(result);
      const labelCoverage = coverage(item.requiredLabels, labels);
      const connectionCoverage = coverage(
        item.requiredConnections,
        connections,
      );
      const responseFile = `${baseName}.response.json`;
      await writeExclusive(
        path.join(outputDirectory, responseFile),
        responseBytes,
      );

      const artifacts = {
        request: requestFile,
        rawResponse: responseFile,
        svg: null,
        verificationReport: `${baseName}.verification.md`,
        pngPreview: null,
        record: `${baseName}.record.json`,
      };
      if (typeof result.svg === "string" && result.svg.length) {
        artifacts.svg = `${baseName}.svg`;
        await writeExclusive(
          path.join(outputDirectory, artifacts.svg),
          result.svg,
        );
        try {
          const sharpModule = await import("sharp");
          const sharp = sharpModule.default || sharpModule;
          artifacts.pngPreview = `${baseName}.preview.png`;
          await sharp(Buffer.from(result.svg))
            .png()
            .toFile(path.join(outputDirectory, artifacts.pngPreview));
        } catch {
          artifacts.pngPreview = null;
        }
      }
      await writeExclusive(
        path.join(outputDirectory, artifacts.verificationReport),
        verificationMarkdown(
          result,
          labelCoverage,
          connectionCoverage,
          metadata,
        ),
      );

      const record = {
        schemaVersion: 1,
        runId,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        revision,
        case: {
          id: item.id,
          name: item.name || item.id,
          language: item.language || null,
          kind: item.kind || null,
        },
        attempt,
        httpStatus: responseStatus,
        model: metadata.model,
        requestedModel: configuration.model || null,
        generationId: metadata.generationId,
        usage: metadata.usage,
        costUsd: metadata.costUsd,
        labelCoverage,
        connectionCoverage,
        returnedLabelTexts: labels,
        returnedConnections: connections,
        artifacts,
        error:
          requestError ||
          (typeof result.error === "string" ? result.error : null),
      };
      await writeExclusive(
        path.join(outputDirectory, artifacts.record),
        `${JSON.stringify(record, null, 2)}\n`,
      );
      await appendFile(logPath, `${recordLogLine(record)}\n`);

      summary.totals.casesCompleted += 1;
      if (metadata.costUsd === null) {
        summary.totals.unknownCostCalls += 1;
      } else {
        summary.totals.reportedCostUsd += metadata.costUsd;
        committedCostUsd = Math.max(
          0,
          committedCostUsd - configuration.costReserveUsd + metadata.costUsd,
        );
      }
      summary.totals.reservedCostUsd = committedCostUsd;
      summary.cases.push({
        case: item.id,
        attempt,
        status: responseStatus,
        model: metadata.model,
        generationId: metadata.generationId,
        usage: metadata.usage,
        costUsd: metadata.costUsd,
        labelCoverage,
        connectionCoverage,
        artifacts,
      });
      summary.updatedAt = completedAt.toISOString();
      await writeSummary(summaryPath, summary);
    }
  }

  if (
    !summary.stoppedReason &&
    summary.totals.casesCompleted < selectedCases.length
  )
    summary.stoppedReason =
      "Evaluation stopped before all selected cases completed.";
  summary.updatedAt = new Date().toISOString();
  await writeSummary(summaryPath, summary);
  await appendFile(
    logPath,
    `## Run summary — ${summary.updatedAt}\n\n- Calls started: ${summary.totals.callsStarted}/${configuration.maxCalls}\n- Reported cost: $${summary.totals.reportedCostUsd.toFixed(6)}\n- Reserved cost ledger: $${summary.totals.reservedCostUsd.toFixed(6)}\n- Unknown-cost calls: ${summary.totals.unknownCostCalls}\n- Stopped reason: ${summary.stoppedReason || "all selected cases completed"}\n\n`,
  );
  console.log(
    JSON.stringify({
      outputDirectory,
      runId,
      cases: summary.totals.casesCompleted,
      calls: summary.totals.callsStarted,
      reportedCostUsd: summary.totals.reportedCostUsd,
      stoppedReason: summary.stoppedReason,
      summary: summaryPath,
      log: logPath,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
