// Shared server-side Asana client. The Bugs and Feedback endpoint and
// app-specific request flows (Style Trainer) both create tasks through this
// module. Never import it from client code and never expose its configuration
// to the browser.

const ASANA_TOKEN_URL = "https://app.asana.com/-/oauth_token";
const ASANA_API_URL = "https://app.asana.com/api/1.0";
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export class AsanaConfigurationError extends Error {}

export class AsanaRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type AsanaConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  projectGid: string;
  sectionGid: string;
  assigneeGid: string;
};

export type AsanaTaskPayload = {
  data: {
    name: string;
    notes: string;
    assignee: string;
    projects: string[];
    memberships: Array<{ project: string; section: string }>;
  };
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

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value)
    throw new AsanaConfigurationError(`${name} is not configured.`);
  return value;
}

export function getAsanaConfig(): AsanaConfig {
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

async function getAccessToken(config: AsanaConfig) {
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

export function buildAsanaTaskPayload(
  config: AsanaConfig,
  task: { name: string; notes: string },
): AsanaTaskPayload {
  return {
    data: {
      name: task.name,
      notes: task.notes,
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

async function postTaskPayload(
  config: AsanaConfig,
  payload: AsanaTaskPayload,
  accessToken: string,
) {
  return fetch(`${ASANA_API_URL}/tasks?opt_fields=gid,permalink_url`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function postAsanaTask(
  config: AsanaConfig,
  payload: AsanaTaskPayload,
): Promise<{ gid: string; taskUrl: string | null }> {
  let accessToken = await getAccessToken(config);
  let response = await postTaskPayload(config, payload, accessToken);

  if (response.status === 401) {
    resetAsanaAccessTokenCache();
    accessToken = await getAccessToken(config);
    response = await postTaskPayload(config, payload, accessToken);
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
