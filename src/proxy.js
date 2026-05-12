import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-options";

/**
 * @param {string} pathname
 */
function isPublicPath(pathname) {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/forgot-password" || pathname.startsWith("/forgot-password/"))
    return true;
  if (pathname === "/reset-password" || pathname.startsWith("/reset-password/")) return true;
  if (pathname === "/activate" || pathname.startsWith("/activate/")) return true;
  return false;
}

/** Next.js 16+ request interception (replaces deprecated `middleware`). */
export function proxy(request) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pl-pathname", pathname);

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const next = pathname + (request.nextUrl.search || "");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|ico|png|jpg|jpeg|gif|webp|txt)).*)",
  ],
};
