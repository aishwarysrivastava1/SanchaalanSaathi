// next-pwa is optional — graceful fallback if it fails to load on Vercel
let withPWA = (config) => config;
try {
  withPWA = require('next-pwa')({
    dest: 'public',
    disable: process.env.NODE_ENV === 'development',
    register: true,
    skipWaiting: true,
  });
} catch {
  console.warn('[next-pwa] package not found — PWA features disabled');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // firebase-admin must not be bundled by the client-side webpack
  serverExternalPackages: ['firebase-admin'],

  // Silence next/image warnings for external user avatars (Google profile photos)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
    ],
  },

  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '';

    const securityHeaders = [
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ];

    if (isProd) {
      // Only enforce strict CSP in production where env vars are set
      const connectSrc = ['\'self\'', 'https://*.googleapis.com', 'https://*.firebaseapp.com', 'wss://*.firebaseapp.com', 'https://firebasestorage.googleapis.com'];
      if (backendUrl) connectSrc.push(backendUrl);

      securityHeaders.push(
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://*.firebaseapp.com https://*.googleapis.com https://apis.google.com https://accounts.google.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.firebaseapp.com https://firebasestorage.googleapis.com https://lh3.googleusercontent.com",
            "font-src 'self' https://fonts.gstatic.com",
            `connect-src ${connectSrc.join(' ')} https://accounts.google.com`,
            "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "worker-src 'self' blob:",
          ].join('; ')
        }
      );
    }

    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

module.exports = withPWA(nextConfig);
