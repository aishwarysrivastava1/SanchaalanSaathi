const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['firebase-admin'],
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const securityHeaders = [
      { key: 'X-DNS-Prefetch-Control',  value: 'on' },
      { key: 'X-Frame-Options',          value: 'DENY' },
      { key: 'X-Content-Type-Options',   value: 'nosniff' },
      { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
    ];

    if (isProd) {
      securityHeaders.push(
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        {
          key: 'Content-Security-Policy',
          value: `
            default-src 'self';
            script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://*.firebaseapp.com https://*.googleapis.com;
            style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
            img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.firebaseapp.com https://firebasestorage.googleapis.com;
            font-src 'self' https://fonts.gstatic.com;
            connect-src 'self' ${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'} https://*.googleapis.com https://*.firebaseapp.com wss://*.firebaseapp.com;
            frame-src 'self' https://*.firebaseapp.com;
            object-src 'none';
            base-uri 'self';
            form-action 'self';
          `.replace(/\s{2,}/g, ' ').trim()
        }
      );
    }

    return [{ source: '/(.*)', headers: securityHeaders }];
  }
};

module.exports = withPWA(nextConfig);
