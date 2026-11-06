import type { NextConfig } from 'next';

// URL de la API. Se lee al compilar (las rewrites quedan fijas en el build).
// En Render: API_HOST llega desde el servicio de la API (hostname sin esquema).
const API_URL = process.env.API_URL ?? (process.env.API_HOST ? `https://${process.env.API_HOST}` : 'http://localhost:4000');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  // El navegador habla sólo con la web (mismo origen); Next reenvía /api/* al backend.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Las E2E compilan en otra carpeta para no pisar el build/dev local.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
