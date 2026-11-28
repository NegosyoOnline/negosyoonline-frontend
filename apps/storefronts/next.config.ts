import type { NextConfig } from "next";
import { localMediaOrigin } from "./src/lib/local-media.ts";

/* Storefront pages are finished HTML from route handlers (src/app), with the approved CSS,
   JS and images served from /public. No page carries an inline script, so script-src stays
   'self'. Later slices widen this policy by name when a page needs it. */

/* The Meta Pixel (ClickUp z8uq9md3n5) widens three directives by host name, on the home, landing, checkout and onboarding verify pages
   only. A site with no Pixel renders no Meta tag, so the wider allowance loads nothing there. Never *, 'unsafe-inline'
   or 'unsafe-eval'. */
const META_SCRIPT = "https://connect.facebook.net";
const META_IMG = "https://www.facebook.com";
const META_CONNECT = ["https://www.facebook.com", "https://connect.facebook.net"];

/* Local development only: STOREFRONT_LOCAL_MEDIA_ORIGIN (a loopback http origin, validated strictly) adds that one origin to img-src so a
   local preview can show photos from the local media stand-in. Unset, or any other value, adds nothing. */
const LOCAL_MEDIA = localMediaOrigin();

const policy = (frameSrc: string[] = [], meta = false, media = false) => [
  "default-src 'self'",
  `script-src 'self'${meta ? ` ${META_SCRIPT}` : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  `img-src 'self' data:${meta ? ` ${META_IMG}` : ""} https://*.public.blob.vercel-storage.com${LOCAL_MEDIA ? ` ${LOCAL_MEDIA}` : ""}`, // product photos: the public media store (backend PUBLIC_MEDIA_BASE_URL)
  ...(media ? [`media-src https://*.public.blob.vercel-storage.com${LOCAL_MEDIA ? ` ${LOCAL_MEDIA}` : ""}`] : []), // the Media Library's video preview, from the public media store only
  `connect-src 'self'${meta ? ` ${META_CONNECT.join(" ")}` : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(frameSrc.length ? [`frame-src ${frameSrc.join(" ")}`] : []),
].join("; ");

const csp = policy();

/* The landing page's hero video is TWCinc's Bunny Stream embed, an iframe. Only that path may frame that one origin;
   every other path keeps the policy above. */
const LANDING = "funnel/membership-pack/landing-page";
const landingCsp = policy(["https://player.mediadelivery.net"], true); // the landing page also carries the Pixel

/* The member lesson player (/dashboard/training/lesson/<id>/) frames the allowlisted embed hosts of YouTube, Vimeo and Bunny
   Stream, the same list the backend accepts for a lesson's video_url (apps/training/services.py). Only that path may frame them. */
const LESSON = "dashboard/training/lesson/";
const lessonCsp = policy([
  "https://www.youtube.com", "https://youtube.com", "https://www.youtube-nocookie.com", "https://youtube-nocookie.com",
  "https://player.vimeo.com", "https://iframe.mediadelivery.net",
]);

/* The member Media Library (/dashboard/media/) plays a video preview from the public media store, so only that path adds media-src.
   A video kept in the store's own Bunny library (V-1, ClickUp z8uq9mkfkd) plays in Bunny's embed player, so that path also frames that one host. */
const MEDIA = "dashboard/media";
const mediaCsp = policy(["https://iframe.mediadelivery.net"], false, true);

/* The other Pixel pages: the home page, the checkout page (not its /check, /qr/ or post-placement paths) and the onboarding verify
   page (the Purchase fires there; no other onboarding path, no access link, no completed page). */
const CHECKOUT = "funnel/membership-pack/checkout";
const VERIFY = "funnel/membership-pack/onboarding/verify";
const metaCsp = policy([], true);

/* The same security headers on every page; only the policy differs. No includeSubDomains or preload until the domain
   inventory is settled. */
const securityHeaders = (policyValue: string) => [
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: policyValue },
];

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
        /* Every path but the Pixel pages (the empty path, the landing, checkout and onboarding verify pages), the lesson player and the Media Library. */
        source: `/:path((?!(?:(?:${LANDING}|${CHECKOUT}|${VERIFY})/?)?$)(?!${LESSON})(?!${MEDIA}/?$).*)`,
        headers: securityHeaders(csp),
      },
      {
        source: "/",
        headers: securityHeaders(metaCsp),
      },
      {
        source: `/${CHECKOUT}{/}?`,
        headers: securityHeaders(metaCsp),
      },
      {
        source: `/${VERIFY}{/}?`,
        headers: securityHeaders(metaCsp),
      },
      {
        source: `/${LANDING}{/}?`,
        headers: securityHeaders(landingCsp),
      },
      {
        source: `/${LESSON}:path*`,
        headers: securityHeaders(lessonCsp),
      },
      {
        source: `/${MEDIA}{/}?`,
        headers: securityHeaders(mediaCsp),
      },
      {
        source: "/assets/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
