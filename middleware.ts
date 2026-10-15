// Sign-in gate. Without a session cookie, pages redirect to /login and APIs answer 401. The cookie is only checked
// for presence here (the edge can't reach the database): every page, server action and API route validates the
// session and the role on the server (lib/auth/session.ts). In demo mode (DEMO_MODE=1) the gate stays open and the
// "Viewing as" person acts instead.
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "atliq_session";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // Pass the path on so the server can send someone with a temporary password to /account first.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  const pass = () => NextResponse.next({ request: { headers } });
  // Public: the sign-in page, the health check, and the background runner (it checks its own deployment secret).
  if (pathname === "/login" || pathname === "/api/health" || /^\/api\/reviews\/[^/]+\/drive$/.test(pathname)) return pass();
  if (process.env.DEMO_MODE === "1" || req.cookies.get(SESSION_COOKIE)?.value) return pass();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ failed: true, reason: "signed_out", message: "Your session has ended. Sign in again." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
