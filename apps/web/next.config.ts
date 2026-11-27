import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];
// NOTE: Content-Security-Policy is set per request in middleware.ts with a nonce
// ('strict-dynamic'); it is intentionally not a static header here.

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // postgres.js must run in the Node runtime, never bundled for the edge/client.
  serverExternalPackages: ["postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // /api/* is served same-origin by app/api/[...path]/route.ts (no rewrite needed).
};

export default nextConfig;
