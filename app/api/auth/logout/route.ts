import { NextResponse } from "next/server";
import { authCookieName } from "../../../lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authCookieName, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
