import { NextResponse } from "next/server";
import { authCookieName, createSession, nextPragueMidnight, validCredentials } from "../../../lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!validCredentials(username, password)) return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });

  const expires = nextPragueMidnight();
  const response = NextResponse.json({ ok: true, expires: expires.toISOString() });
  response.cookies.set(authCookieName, await createSession(username, expires), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", expires });
  return response;
}
