const SESSION_COOKIE = "ta_session";
const PRAGUE_TIME_ZONE = "Europe/Prague";

function encodeBase64Url(value: string | ArrayBuffer) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function signature(payload: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encodeBase64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function timeZoneOffset(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: PRAGUE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - date.getTime();
}

export function nextPragueMidnight(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: PRAGUE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const utcMidnightGuess = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1);
  const firstGuess = new Date(utcMidnightGuess - timeZoneOffset(new Date(utcMidnightGuess)));
  return new Date(utcMidnightGuess - timeZoneOffset(firstGuess));
}

export function validCredentials(username: string, password: string) {
  return (process.env.APP_USERS ?? "").split(",").some((entry) => {
    const separator = entry.indexOf(":");
    return separator > 0 && secureEqual(entry.slice(0, separator).trim(), username) && secureEqual(entry.slice(separator + 1), password);
  });
}

export async function createSession(username: string, expires: Date) {
  const payload = encodeBase64Url(JSON.stringify({ username, expires: expires.getTime() }));
  return `${payload}.${await signature(payload)}`;
}

export async function verifySession(token?: string) {
  if (!token) return false;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature || !secureEqual(await signature(payload), suppliedSignature)) return false;
  try {
    const session = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as { username?: unknown; expires?: unknown };
    return typeof session.username === "string" && typeof session.expires === "number" && session.expires > Date.now();
  } catch {
    return false;
  }
}

export const authCookieName = SESSION_COOKIE;
