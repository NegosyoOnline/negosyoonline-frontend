import type { NextConfig } from "next";
import { buildCsp, readEnv } from "./src/lib/hq-env.mjs";

/* The staff app is static HTML in /public, as the dashboard is. This file gives it the routing, the
   security headers and the CSP. It has no rewrite to another host: the browser calls the hq host
   itself, so nothing a staff member types or reads passes through Vercel (design 21.1). */

const { staffApiOrigin } = readEnv(process.env);

/* One document for the three sign-in addresses; it changes view in the browser. */
const authPaths = ["sign-in", "code", "verify"];

/* The Inbox: the SMS list and New SMS share one document, which changes view in the browser; the five other
   platforms share another. No address holds a number, a name, a text or an id. */
const inboxPlatforms = ["messenger", "instagram", "tiktok", "email", "webchat"];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  trailingSlash: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        { source: "/finance/", destination: "/finance.html" },
        { source: "/finance/usage/", destination: "/finance-usage.html" },
        { source: "/finance/issuer/", destination: "/finance-issuer.html" },
        { source: "/finance/invoices/", destination: "/finance-invoices.html" },
        { source: "/finance/invoices/reconcile/", destination: "/finance-reconcile.html" },
        { source: "/inbox/sms/", destination: "/inbox.html" },
        { source: "/inbox/sms/new/", destination: "/inbox.html" },
        { source: "/inbox/sms/bulk/", destination: "/bulk.html" },
        ...inboxPlatforms.map((name) => ({ source: `/inbox/${name}/`, destination: "/inbox-platform.html" })),
        /* The Contacts pages: one document for four addresses, none with a value in it. */
        ...["/contacts/", "/contacts/new/", "/contacts/groups/", "/contacts/upload/"].map((source) => ({ source, destination: "/contacts.html" })),
        ...authPaths.map((page) => ({ source: `/${page}/`, destination: "/auth.html" })),
      ],
      afterFiles: [],
      /* Real files and /assets/js/config.js are served first; every other address is "Page not found". */
      fallback: [{ source: "/:path*", destination: "/not-found.html" }],
    };
  },
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: false },
      { source: "/finance.html", destination: "/finance/", permanent: false },
      { source: "/finance-usage.html", destination: "/finance/usage/", permanent: false },
      { source: "/finance-issuer.html", destination: "/finance/issuer/", permanent: false },
      { source: "/finance-invoices.html", destination: "/finance/invoices/", permanent: false },
      { source: "/finance-reconcile.html", destination: "/finance/invoices/reconcile/", permanent: false },
      { source: "/inbox/", destination: "/inbox/sms/", permanent: false },
      { source: "/inbox.html", destination: "/inbox/sms/", permanent: false },
      { source: "/bulk.html", destination: "/inbox/sms/bulk/", permanent: false },
      { source: "/inbox-platform.html", destination: "/inbox/sms/", permanent: false },
      { source: "/contacts.html", destination: "/contacts/", permanent: false },
      { source: "/auth.html", destination: "/sign-in/", permanent: false },
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
          { key: "X-Robots-Tag", value: "noindex" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cache-Control", value: "no-store" },
          { key: "Content-Security-Policy", value: buildCsp(staffApiOrigin) },
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
