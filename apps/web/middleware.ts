import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes open to everyone (unauthenticated OK)
const PUBLIC_PATHS = ["/", "/login", "/select-role"];

// NGO-only entry point
export const NGO_PATHS = ["/ngo-dashboard"];

// Volunteer-only entry points
export const VOLUNTEER_PATHS = ["/volunteer-dashboard", "/feed", "/leaderboard", "/profile", "/task"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass through Next.js internals, API routes, and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/logo") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Public paths — always allow
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Role enforcement is handled client-side via RoleGuard components.
  // Firebase auth state is not available at the Next.js edge without session cookies.
  // This middleware defines the route structure; RoleGuard enforces access control.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
