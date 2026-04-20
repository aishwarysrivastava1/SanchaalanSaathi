import { NextRequest, NextResponse } from "next/server";

function coopForPath(path: string): string {
  // Popup-based auth routes should not be isolated by strict COOP.
  const popupSafe = ["/ngo/login", "/vol/login", "/ngo/auth", "/vol/auth"];
  if (popupSafe.some((p) => path.startsWith(p))) return "unsafe-none";
  return "same-origin";
}

function withSecurityHeaders(res: NextResponse, path: string): NextResponse {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self), payment=()");
  res.headers.set("Cross-Origin-Opener-Policy", coopForPath(path));
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

export function middleware(req: NextRequest) {
  const path  = req.nextUrl.pathname;
  const token = req.cookies.get("ngo_token")?.value;

  if (!path.startsWith("/ngo") && !path.startsWith("/vol")) {
    return withSecurityHeaders(NextResponse.next(), path);
  }

  if (!token) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/", req.url)), path);
  }

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (Date.now() >= payload.exp * 1000) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/", req.url)), path);
    }
    if (path.startsWith("/ngo") && payload.role !== "ngo_admin") {
      return withSecurityHeaders(NextResponse.redirect(new URL("/vol/dashboard", req.url)), path);
    }
    if (path.startsWith("/vol") && payload.role !== "volunteer") {
      return withSecurityHeaders(NextResponse.redirect(new URL("/ngo/dashboard", req.url)), path);
    }
    if (path.startsWith("/ngo") && !path.startsWith("/ngo/setup") && !payload.ngo_id) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/ngo/setup", req.url)), path);
    }
  } catch {
    return withSecurityHeaders(NextResponse.redirect(new URL("/", req.url)), path);
  }

  return withSecurityHeaders(NextResponse.next(), path);
}

export const config = {
  matcher: ["/ngo/:path*", "/vol/:path*"],
};
