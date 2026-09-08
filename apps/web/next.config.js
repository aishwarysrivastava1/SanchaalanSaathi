/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'motion/react'],
  },

  // Silence next/image warnings for external user avatars (Google profile photos)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  async redirects() {
    return [
      { source: "/ngo-dashboard",       destination: "/ngo/dashboard", permanent: true },
      { source: "/volunteer-dashboard", destination: "/vol/dashboard",  permanent: true },
      { source: "/select-role",         destination: "/",               permanent: true },
      { source: "/login",               destination: "/login-ngo",      permanent: true },
      { source: "/login/:path*",        destination: "/login-ngo",      permanent: true },
      { source: "/register",            destination: "/",               permanent: true },
    ];
  },

  // Proxy the FastAPI backend through Vercel so the browser never makes a
  // cross-origin request. Next.js matches its own /api/* routes first, so
  // /api/health is served locally and never reaches these rewrites.
  async rewrites() {
    const backend = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
    if (!backend) return [];
    return [
      { source: '/api/auth/:path*',       destination: `${backend}/api/auth/:path*` },
      { source: '/api/ngo/:path*',        destination: `${backend}/api/ngo/:path*` },
      { source: '/api/volunteer/:path*',  destination: `${backend}/api/volunteer/:path*` },
      { source: '/api/chatbot/:path*',    destination: `${backend}/api/chatbot/:path*` },
      { source: '/api/graph/:path*',      destination: `${backend}/api/graph/:path*` },
      { source: '/api/analytics/:path*',  destination: `${backend}/api/analytics/:path*` },
      { source: '/api/volunteers/:path*', destination: `${backend}/api/volunteers/:path*` },
      { source: '/api/ingest/:path*',     destination: `${backend}/api/ingest/:path*` },
      { source: '/api/voice/:path*',      destination: `${backend}/api/voice/:path*` },
      { source: '/api/sim/:path*',        destination: `${backend}/api/sim/:path*` },
      { source: '/api/seed/:path*',       destination: `${backend}/api/seed/:path*` },
      { source: '/api/realtime/status',   destination: `${backend}/api/realtime/status` },
      // /api/realtime/ws (WebSocket) must stay as a direct wss:// connection —
      // Vercel rewrites do not proxy WebSocket upgrades.
    ];
  },

  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '';

    const securityHeaders = [
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' },
      { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
    ];

    if (isProd) {
      const connectSrc = [
        "'self'",
        'https://maps.googleapis.com',
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com',
        'https://www.googleapis.com',
      ];

      if (backendUrl) {
        try {
          const origin = new URL(backendUrl).origin;
          connectSrc.push(origin);
          // WebSocket connections need wss:// separately — https:// does not cover it
          connectSrc.push(origin.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:"));
        } catch {
          // keep CSP valid even if env is malformed
        }
      }

      securityHeaders.push(
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://www.gstatic.com https://apis.google.com https://accounts.google.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://lh3.googleusercontent.com",
            "font-src 'self' https://fonts.gstatic.com",
            `connect-src ${connectSrc.join(' ')} https://accounts.google.com`,
            "frame-src 'self' https://accounts.google.com https://synapseai-38e29.firebaseapp.com",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "worker-src 'self' blob:",
            'upgrade-insecure-requests',
          ].join('; ')
        }
      );
    }

    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
