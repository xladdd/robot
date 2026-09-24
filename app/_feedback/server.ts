import { cookies } from "next/headers.js";
import { NextResponse } from "next/server.js";
import { authCookieName, readSession } from "../lib/auth.ts";
import type {
  FeedbackAppStatus,
  FeedbackDiagnostics,
  FeedbackLanguage,
  FeedbackRequest,
  FeedbackResponse,
  FeedbackTheme,
} from "./types.ts";

const ASANA_TOKEN_URL = "https://app.asana.com/-/oauth_token";
const ASANA_API_URL = "https://app.asana.com/api/1.0";
const MAX_BODY_BYTES = 20_000;
const MAX_DESCRIPTION_LENGTH = 4_000;
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export class FeedbackValidationError extends Error {}
export class FeedbackConfigurationError extends Error {}
export class AsanaRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type FeedbackConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  projectGid: string;
  sectionGid: string;
  assigneeGid: string;
};

type CachedAccessToken = {
  value: string;
  expiresAt: number;
};

type AsanaTaskResponse = {
  data?: {
    gid?: unknown;
    permalink_url?: unknown;
  };
};

let cachedAccessToken: CachedAccessToken | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(
  value: unknown,
  field: string,
  maximum: number,
  options: { allowEmpty?: boolean } = {},
) {
  if (typeof value !== "string")
    throw new FeedbackValidationError(`${field} must be a string.`);
  const result = value.trim();
  if (!options.allowEmpty && result.length === 0)
    throw new FeedbackValidationError(`${field} is required.`);
  if (result.length > maximum)
    throw new FeedbackValidationError(`${field} is too long.`);
  return result;
}

function boundedNullableString(value: unknown, field: string, maximum: number) {
  if (value === null) return null;
  return boundedString(value, field, maximum, { allowEmpty: true });
}

function booleanValue(value: unknown, field: string) {
  if (typeof value !== "boolean")
    throw new FeedbackValidationError(`${field} must be a boolean.`);
  return value;
}

function enumValue<T extends string>(
  value: unknown,
  field: string,
  values: readonly T[],
) {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new FeedbackValidationError(`${field} has an invalid value.`);
  return value as T;
}

function boundedNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  integer = false,
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  )
    throw new FeedbackValidationError(`${field} has an invalid value.`);
  return value;
}

function nullableBoundedNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  integer = false,
) {
  if (value === null) return null;
  return boundedNumber(value, field, minimum, maximum, integer);
}

export function validateFeedbackRequest(value: unknown): FeedbackRequest {
  if (!isRecord(value))
    throw new FeedbackValidationError("Request body must be an object.");

  const description = boundedString(
    value.description,
    "description",
    MAX_DESCRIPTION_LENGTH,
  );
  if (!isRecord(value.diagnostics))
    throw new FeedbackValidationError("diagnostics must be an object.");

  const source = value.diagnostics;
  const language = enumValue<FeedbackLanguage>(source.language, "language", [
    "en",
    "cs",
  ]);
  const theme = enumValue<FeedbackTheme>(source.theme, "theme", [
    "light",
    "dark",
  ]);
  const appStatus = enumValue<FeedbackAppStatus>(
    source.appStatus,
    "appStatus",
    ["idle", "running", "completed", "error"],
  );
  const pathname = boundedString(source.pathname, "pathname", 200);
  if (!pathname.startsWith("/") || pathname.includes("?"))
    throw new FeedbackValidationError("pathname has an invalid value.");
  const capturedAt = boundedString(source.capturedAt, "capturedAt", 40);
  if (Number.isNaN(Date.parse(capturedAt)))
    throw new FeedbackValidationError("capturedAt has an invalid value.");

  if (!isRecord(source.viewport))
    throw new FeedbackValidationError("viewport must be an object.");
  if (!isRecord(source.inputSummary))
    throw new FeedbackValidationError("inputSummary must be an object.");

  return {
    description,
    diagnostics: {
      selectedTool:
        source.selectedTool === null
          ? null
          : boundedString(source.selectedTool, "selectedTool", 80, {
              allowEmpty: true,
            }),
      selectedToolName: boundedString(
        source.selectedToolName,
        "selectedToolName",
        120,
        { allowEmpty: true },
      ),
      language,
      theme,
      sidebarOpen: booleanValue(source.sidebarOpen, "sidebarOpen"),
      infoOpen: booleanValue(source.infoOpen, "infoOpen"),
      pathname,
      viewport: {
        width: boundedNumber(
          source.viewport.width,
          "viewport.width",
          0,
          10_000,
          true,
        ),
        height: boundedNumber(
          source.viewport.height,
          "viewport.height",
          0,
          10_000,
          true,
        ),
      },
      userAgent: boundedString(source.userAgent, "userAgent", 300, {
        allowEmpty: true,
      }),
      online: booleanValue(source.online, "online"),
      appStatus,
      progress: nullableBoundedNumber(source.progress, "progress", 0, 100),
      inputSummary: {
        hasInput: booleanValue(
          source.inputSummary.hasInput,
          "inputSummary.hasInput",
        ),
        fileType: boundedNullableString(
          source.inputSummary.fileType,
          "inputSummary.fileType",
          100,
        ),
        fileSize: nullableBoundedNumber(
          source.inputSummary.fileSize,
          "inputSummary.fileSize",
          0,
          5_000_000_000,
          true,
        ),
        referenceCount: boundedNumber(
          source.inputSummary.referenceCount,
          "inputSummary.referenceCount",
          0,
          1_000,
          true,
        ),
        hasResult: booleanValue(
          source.inputSummary.hasResult,
          "inputSummary.hasResult",
        ),
      },
      capturedAt,
    },
  };
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value)
    throw new FeedbackConfigurationError(`${name} is not configured.`);
  return value;
}

function getConfig(): FeedbackConfig {
  return {
    clientId: requiredEnvironment("ASANA_CLIENT_ID"),
    clientSecret: requiredEnvironment("ASANA_CLIENT_SECRET"),
    refreshToken: requiredEnvironment("ASANA_REFRESH_TOKEN"),
    projectGid: requiredEnvironment("ASANA_PROJECT_GID"),
    sectionGid: requiredEnvironment("ASANA_SECTION_GID"),
    assigneeGid: requiredEnvironment("ASANA_ASSIGNEE_GID"),
  };
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function getAccessToken(config: FeedbackConfig) {
  if (
    cachedAccessToken &&
    cachedAccessToken.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS
  )
    return cachedAccessToken.value;

  const response = await fetch(ASANA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    }),
  });
  const data = await readJson(response);
  if (!response.ok || !isRecord(data) || typeof data.access_token !== "string")
    throw new AsanaRequestError(
      "Asana access-token refresh failed.",
      response.status,
    );

  const expiresIn =
    typeof data.expires_in === "number" && data.expires_in > 0
      ? data.expires_in
      : 3_600;
  cachedAccessToken = {
    value: data.access_token,
    expiresAt: Date.now() + expiresIn * 1_000,
  };
  return data.access_token;
}

export function resetAsanaAccessTokenCache() {
  cachedAccessToken = null;
}

function titleFor(description: string, toolName: string) {
  const firstLine = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const summary = (firstLine || "Feedback report").replace(/[\r\n]+/g, " ");
  const prefix = `[Robot] ${toolName || "Taktik Robot"} — `;
  return `${prefix}${summary.slice(0, Math.max(1, 100 - prefix.length))}`;
}

export function formatTaskNotes(
  description: string,
  diagnostics: FeedbackDiagnostics,
  username: string,
  receivedAt: string,
) {
  const file = diagnostics.inputSummary.fileType
    ? `${diagnostics.inputSummary.fileType}${diagnostics.inputSummary.fileSize === null ? "" : `, ${diagnostics.inputSummary.fileSize} bytes`}`
    : "none";
  return [
    "Description",
    "-----------",
    "",
    description,
    "",
    "Robot diagnostics",
    "-----------------",
    "",
    `Robot user: ${username}`,
    `Tool: ${diagnostics.selectedToolName || "Taktik Robot home"}${diagnostics.selectedTool ? ` (${diagnostics.selectedTool})` : ""}`,
    `Language: ${diagnostics.language}`,
    `Theme: ${diagnostics.theme}`,
    `Sidebar: ${diagnostics.sidebarOpen ? "open" : "collapsed"}`,
    `Info drawer: ${diagnostics.infoOpen ? "open" : "closed"}`,
    `Path: ${diagnostics.pathname}`,
    `Viewport: ${diagnostics.viewport.width} × ${diagnostics.viewport.height}`,
    `Browser: ${diagnostics.userAgent || "unknown"}`,
    `Online: ${diagnostics.online ? "yes" : "no"}`,
    `Application status: ${diagnostics.appStatus}`,
    `Progress: ${diagnostics.progress === null ? "not available" : `${diagnostics.progress}%`}`,
    `Input: ${diagnostics.inputSummary.hasInput ? file : "none"}`,
    `References: ${diagnostics.inputSummary.referenceCount}`,
    `Result available: ${diagnostics.inputSummary.hasResult ? "yes" : "no"}`,
    `Captured at: ${diagnostics.capturedAt}`,
    `Server received at: ${receivedAt}`,
  ].join("\n");
}

export function buildTaskPayload(
  description: string,
  diagnostics: FeedbackDiagnostics,
  username: string,
  config: FeedbackConfig,
  receivedAt: string,
) {
  return {
    data: {
      name: titleFor(description, diagnostics.selectedToolName),
      notes: formatTaskNotes(description, diagnostics, username, receivedAt),
      assignee: config.assigneeGid,
      projects: [config.projectGid],
      memberships: [
        {
          project: config.projectGid,
          section: config.sectionGid,
        },
      ],
    },
  };
}

async function createAsanaTask(
  description: string,
  diagnostics: FeedbackDiagnostics,
  username: string,
  config: FeedbackConfig,
) {
  const receivedAt = new Date().toISOString();
  const payload = buildTaskPayload(
    description,
    diagnostics,
    username,
    config,
    receivedAt,
  );
  let accessToken = await getAccessToken(config);
  let response = await fetch(
    `${ASANA_API_URL}/tasks?opt_fields=gid,permalink_url`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (response.status === 401) {
    resetAsanaAccessTokenCache();
    accessToken = await getAccessToken(config);
    response = await fetch(
      `${ASANA_API_URL}/tasks?opt_fields=gid,permalink_url`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
  }

  const data = (await readJson(response)) as AsanaTaskResponse | null;
  if (
    !response.ok ||
    !isRecord(data) ||
    !isRecord(data.data) ||
    typeof data.data.gid !== "string"
  )
    throw new AsanaRequestError("Asana task creation failed.", response.status);

  return {
    gid: data.data.gid,
    taskUrl:
      typeof data.data.permalink_url === "string"
        ? data.data.permalink_url
        : null,
  };
}

export async function POST(request: Request) {
  let session;
  try {
    const cookieStore = await cookies();
    session = await readSession(cookieStore.get(authCookieName)?.value);
  } catch {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  if (!session)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json"))
    return NextResponse.json({ error: "JSON is required." }, { status: 400 });

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES)
    return NextResponse.json(
      { error: "Feedback is too large." },
      { status: 400 },
    );

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  let feedback: FeedbackRequest;
  try {
    feedback = validateFeedbackRequest(body);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof FeedbackValidationError
            ? error.message
            : "Invalid feedback.",
      },
      { status: 400 },
    );
  }

  let config: FeedbackConfig;
  try {
    config = getConfig();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof FeedbackConfigurationError
            ? "Feedback service is not configured."
            : "Feedback service is unavailable.",
      },
      { status: 503 },
    );
  }

  try {
    const task = await createAsanaTask(
      feedback.description,
      feedback.diagnostics,
      session.username,
      config,
    );
    const response: FeedbackResponse = { ok: true, taskUrl: task.taskUrl };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AsanaRequestError)
      console.error("[feedback] Asana request failed", error.status);
    else console.error("[feedback] Unexpected submission failure");
    return NextResponse.json(
      { error: "Feedback could not be sent to Asana." },
      { status: 502 },
    );
  }
}
