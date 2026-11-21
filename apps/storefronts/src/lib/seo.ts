/* Search and share tags for the two public pages that may be indexed: the Santé home and the Membership Pack landing page
   (ClickUp z8uq9mh8n9, Coach Ed's ruling 1100430000599937). Every value is built per site from the storefront's own data and the
   host the visitor asked for. One exception, by Coach Ed's ruling 1100430000604741 (ClickUp z8uq9mhbcq): the Live4More hosts in
   SHARE_IMAGE_BY_HOST carry that store's own share image and alt text; every other host keeps the generic image. Every other page stays noindex
   (src/lib/html.ts: an explicit `index: true` is the only way out). */
import { asset } from "./assets.ts";
import { cleanHost } from "./host.ts";
import { html, safe, type Markup } from "./html.ts";

export const HOME_PATH = "/";
export const LANDING_PATH = "/funnel/membership-pack/landing-page/";

/** Paths a crawler is asked to stay out of (robots.txt). Each is also noindex on its own page. */
export const PRIVATE_PREFIXES = [
  "/checkout/", "/cart/", "/dashboard/", "/portal/", "/contact/", "/chat/", "/business-seal/",
  "/funnel/membership-pack/checkout/", "/funnel/membership-pack/onboarding/", "/funnel/membership-pack/access/",
  "/funnel/membership-pack/completed/", "/funnel/membership-pack/visit/", "/funnel/membership-pack/membership-terms.pdf",
];

/** JSON for a <script type="application/ld+json"> block: no value can close the tag or start a comment. */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** The host the visitor asked for, as it appears in the page's own addresses; "" when the header is not a plain host. */
export function servedHost(request: Request): string {
  return cleanHost(request.headers.get("host"));
}

export type SeoArgs = {
  host: string;
  path: string;
  /** The page's own `<title>` text. */
  title: string;
  description: string;
  storeName: string;
  /** Plain objects, written as JSON-LD blocks. */
  jsonLd: unknown[];
};

/** The one store-specific share image: served host (lower-case, no port) -> file and alt text (ClickUp z8uq9mhbcq). */
const L4M = {
  file: "img/live4more-share-1200x630.jpg",
  alt: "Santé Lifetime Membership for only ₱1,488: two boxes of Santé Barley Powder in a New Zealand meadow, managed by Coach Ed Geronilla",
};
export const SHARE_IMAGE_BY_HOST: Record<string, { file: string; alt: string }> = {
  "live4moreonline.store": L4M,
  "www.live4moreonline.store": L4M,
  "live4more.storefronts-staging.negosyonline.com": L4M,
  "live4more.storefronts.negosyonline.com": L4M,
};

/** Everything the head of an indexable page adds: description, canonical, Open Graph, Twitter, icons and JSON-LD. */
export function seoHead(a: SeoArgs): Markup {
  const origin = `https://${a.host}`;
  const canonical = `${origin}${a.path}`; // no query string: utm and fbclid never reach it
  const key = a.host.toLowerCase().replace(/:\d+$/, "");
  const own = Object.hasOwn(SHARE_IMAGE_BY_HOST, key) ? SHARE_IMAGE_BY_HOST[key] : undefined;
  const image = `${origin}${asset(own ? own.file : "img/sante-share-1200x630.jpg")}`;
  const imageAlt = own ? own.alt : `${a.storeName} logo over a New Zealand barley grass farm`;
  return html`
<meta name="description" content="${a.description}">
<link rel="canonical" href="${canonical}">
<link rel="icon" type="image/png" sizes="32x32" href="${asset("img/sante-favicon-32.png")}">
<link rel="apple-touch-icon" sizes="180x180" href="${asset("img/sante-apple-touch-icon-180.png")}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${a.storeName}">
<meta property="og:title" content="${a.title}">
<meta property="og:description" content="${a.description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="${imageAlt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${a.title}">
<meta name="twitter:description" content="${a.description}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="${imageAlt}">
${a.jsonLd.map((d) => safe(`<script type="application/ld+json">${jsonLdText(d)}</script>\n`))}`;
}

export function organizationLd(host: string, storeName: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: storeName,
    url: `https://${host}/`,
    logo: `https://${host}${asset("img/navbar-logo.webp")}`,
  };
}

/** The Membership Pack as a Product. The price and currency are the pack's own (the API's answer), never a literal. */
export function productLd(host: string, pack: { price_centavos: number; currency: string; available: boolean }): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Membership Pack",
    image: [`https://${host}${asset("img/bundle-1.webp")}`],
    offers: {
      "@type": "Offer",
      price: (pack.price_centavos / 100).toFixed(2),
      priceCurrency: pack.currency || "PHP",
      availability: pack.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `https://${host}${LANDING_PATH}`,
    },
  };
}

export function robotsText(host: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    ...PRIVATE_PREFIXES.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: https://${host}/sitemap.xml`,
    "",
  ].join("\n");
}

export function sitemapXml(host: string): string {
  const urls = [HOME_PATH, LANDING_PATH].map((p) => `  <url><loc>https://${host}${p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
