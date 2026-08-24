import { NextRequest, NextResponse } from "next/server";
import { authCookieName, verifySession } from "./app/lib/auth";

const publicPaths = new Set(["/login", "/api/auth/login", "/favicon.svg"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (publicPaths.has(pathname) || pathname.startsWith("/_next/") || pathname.startsWith("/data/")) return NextResponse.next();
  if (await verifySession(request.cookies.get(authCookieName)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("returnTo", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/:path*"] };
