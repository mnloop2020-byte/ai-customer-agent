import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login", "/w"];
const sessionCookie = "ai_customer_agent_session";
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const csrfExcludedApiPrefixes = [
  "/api/auth/login",
  "/api/auth/setup",
  "/api/public/",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const isApi = pathname.startsWith("/api/");
  const hasSession = Boolean(request.cookies.get(sessionCookie)?.value);

  if (isApi && unsafeMethods.has(request.method) && !isCsrfExempt(pathname) && !isSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  if (!hasSession && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  return response;
}

function isCsrfExempt(pathname: string) {
  return csrfExcludedApiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
