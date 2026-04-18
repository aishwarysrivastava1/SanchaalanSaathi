import { NextRequest, NextResponse } from "next/server";

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self), payment=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-site");
  return res;
}

export function middleware(req: NextRequest) {
  const path  = req.nextUrl.pathname;
  const token = req.cookies.get("ngo_token")?.value;

  if (!path.startsWith("/ngo") && !path.startsWith("/vol")) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (!token) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/", req.url)));
  }

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (Date.now() >= payload.exp * 1000) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/", req.url)));
    }
    if (path.startsWith("/ngo") && payload.role !== "ngo_admin") {
      return withSecurityHeaders(NextResponse.redirect(new URL("/vol/dashboard", req.url)));
    }
    if (path.startsWith("/vol") && payload.role !== "volunteer") {
      return withSecurityHeaders(NextResponse.redirect(new URL("/ngo/dashboard", req.url)));
    }
    if (path.startsWith("/ngo") && !path.startsWith("/ngo/setup") && !payload.ngo_id) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/ngo/setup", req.url)));
    }
  } catch {
    return withSecurityHeaders(NextResponse.redirect(new URL("/", req.url)));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/ngo/:path*", "/vol/:path*"],
};
