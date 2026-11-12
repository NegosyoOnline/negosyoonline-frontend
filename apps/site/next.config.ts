import type { NextConfig } from "next";
import { apiOrigin } from "./src/lib/site-env";

/* The public site is static HTML in /public. This file gives it the clean URLs, security
   headers and CSP it had as a plain static deploy. */

const pages = ["contact", "terms", "privacy", "cancellation-refund", "referral-terms", "data-deletion"];

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https://*.public.blob.vercel-storage.com",
  `connect-src 'self' ${apiOrigin}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  trailingSlash: false,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        ...pages.map((page) => ({ source: `/${page}`, destination: `/${page}.html` })),
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/index", destination: "/", permanent: true },
      ...pages.map((page) => ({ source: `/${page}.html`, destination: `/${page}`, permanent: true })),
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
      {
        source: "/assets/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
