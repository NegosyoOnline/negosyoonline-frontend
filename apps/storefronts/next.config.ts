import type { NextConfig } from "next";

/* Storefront pages are finished HTML from route handlers (src/app), with the approved CSS,
   JS and images served from /public. No page carries an inline script, so script-src stays
   'self'. Later slices widen this policy by name when a page needs it. */

const policy = (frameSrc: string[] = []) => [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(frameSrc.length ? [`frame-src ${frameSrc.join(" ")}`] : []),
].join("; ");

const csp = policy();

/* The one widening so far: the landing page's hero video is TWCinc's Bunny Stream embed, an iframe. Only that
   path may frame that one origin; every other path keeps the policy above. */
const LANDING = "funnel/membership-pack/landing-page";
const landingCsp = policy(["https://player.mediadelivery.net"]);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  /* The approved pages link with a trailing slash (/products/). Both spellings reach the
     same handler, with no redirect in between. */
  skipTrailingSlashRedirect: true,
  /* No page uses the image optimizer, so its address answers the neutral 404 as well. */
  async rewrites() {
    return { beforeFiles: [{ source: "/_next/image", destination: "/_next/no-such-page" }], afterFiles: [], fallback: [] };
  },
  async headers() {
    return [
      {
        source: `/:path((?!${LANDING}/?$).*)`,
        headers: [
          /* No includeSubDomains or preload until the domain inventory is settled. */
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
      {
        source: `/${LANDING}{/}?`,
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Content-Security-Policy", value: landingCsp },
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
