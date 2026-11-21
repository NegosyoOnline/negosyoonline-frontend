import type { NextConfig } from "next";
import { apiOrigin } from "./src/lib/site-env";

/* The dashboard is static HTML in /public. This file gives it the routing, security headers
   and CSP it had as a plain static deploy: every path ends in a slash, standalone
   pages (none now) have clean URLs, and every other path serves index.html, which routes in the browser. */

const standalone: string[] = [];

/* Public Vercel Blob media store. Images only; must match the backend's public media host. */
const mediaOrigin = "https://pemdcws76uzmwk7c.public.blob.vercel-storage.com";

/* Bunny Stream: the TUS upload host (connect-src) and the embed host (frame-src). Both are the same for every store's library, so no per-store entry is needed. */
const tusOrigin = "https://video.bunnycdn.com";
const embedOrigin = "https://iframe.mediadelivery.net";

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${mediaOrigin} https://platform-lookaside.fbsbx.com https://*.fbcdn.net`,
  `connect-src 'self' ${apiOrigin} https://vercel.com ${tusOrigin}`, // https://vercel.com: the Media Library's direct video upload to Vercel Blob (media.js); tusOrigin: the lesson video upload to Bunny Stream (tus.js)
  `frame-src ${embedOrigin}`, // the lesson video preview (Bunny Stream embed); the same host for every store's library
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  trailingSlash: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        ...standalone.map((page) => ({ source: `/${page}/`, destination: `/${page}.html` })),
      ],
      afterFiles: [],
      /* Real files and /assets/js/config.js are served first; everything else is the dashboard. */
      fallback: [{ source: "/:path*", destination: "/index.html" }],
    };
  },
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      ...standalone.map((page) => ({ source: `/${page}.html`, destination: `/${page}/`, permanent: true })),
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
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cache-Control", value: "no-store" },
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
