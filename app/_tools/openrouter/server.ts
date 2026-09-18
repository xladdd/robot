import "server-only";

import { authCookieName, openRouterUserId, readSession } from "../../lib/auth";
import { openRouterApps, type OpenRouterAppId } from "./config";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1";
const fallbackWarnings = new Set<OpenRouterAppId>();

type OpenRouterUsage = {
  cost?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type OpenRouterMetadata = {
  id?: string;
  model?: string;
  usage?: OpenRouterUsage;
};

export type OpenRouterContext = {
  app: OpenRouterAppId;
  apiKey: string;
  keyEnvName: string;
  title: string;
  user: string | null;
};

function requestCookie(request: Request, name: string) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return undefined;
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

export async function getOpenRouterContext(
  request: Request,
  app: OpenRouterAppId,
): Promise<OpenRouterContext | null> {
  const config = openRouterApps[app];
  const appApiKey = process.env[config.envName];
  const apiKey = appApiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  if (!appApiKey && !fallbackWarnings.has(app)) {
    fallbackWarnings.add(app);
    console.warn(
      `[openrouter] ${config.envName} is not configured; ${config.name} is using the legacy OPENROUTER_API_KEY fallback.`,
    );
  }

  const session = await readSession(requestCookie(request, authCookieName));
  return {
    app,
    apiKey,
    keyEnvName: appApiKey ? config.envName : "OPENROUTER_API_KEY",
    title: `Taktik Robot: ${config.name}`,
    user: session ? await openRouterUserId(session.username) : null,
  };
}

export function openRouterConfigurationError(app: OpenRouterAppId) {
  const { envName } = openRouterApps[app];
  return `${envName} is not configured and OPENROUTER_API_KEY is unavailable.`;
}

function refererFor(app: OpenRouterAppId) {
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  url.searchParams.set("tool", app);
  return url.toString();
}

export async function requestOpenRouter<T extends object>(
  context: OpenRouterContext,
  endpoint: "chat/completions" | "images",
  operation: string,
  body: Record<string, unknown>,
  options: { signal?: AbortSignal } = {},
) {
  const response = await fetch(`${OPENROUTER_API_URL}/${endpoint}`, {
    method: "POST",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${context.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": refererFor(context.app),
      "X-OpenRouter-Title": context.title,
    },
    body: JSON.stringify({
      ...body,
      ...(context.user ? { user: context.user } : {}),
    }),
  });
  const result = (await response.json()) as T & OpenRouterMetadata;
  const requestedModel = typeof body.model === "string" ? body.model : null;

  console.info(
    `[openrouter-usage] ${JSON.stringify({
      occurredAt: new Date().toISOString(),
      app: context.app,
      operation,
      user: context.user,
      keyEnvName: context.keyEnvName,
      generationId: result.id ?? null,
      model: result.model ?? requestedModel,
      status: response.status,
      cost: typeof result.usage?.cost === "number" ? result.usage.cost : null,
      promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null,
      totalTokens: result.usage?.total_tokens ?? null,
    })}`,
  );

  return { response, result };
}
