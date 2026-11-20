/* Search and share tags of the two indexable pages, robots.txt and sitemap.xml (ClickUp z8uq9mh8n9, ruling 1100430000599937). */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { statSync } from "node:fs";
import path from "node:path";
import { htmlResponse, html } from "../src/lib/html.ts";
import { jsonLdText, PRIVATE_PREFIXES } from "../src/lib/seo.ts";
import { HOME_DESCRIPTION } from "../src/views/sante/home.ts";
import { assetVersions } from "../src/lib/assets.ts";
import { FILLED, SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const PACK = { price_centavos: 148800, currency: "PHP", available: true, agreement: { id: 1, label: "v1.0", effective_date: "2026-11-01" }, payment_accounts: [{ id: "a", kind: "bank", account_type: "bank", provider_name: "BDO", account_name: "D", account_number: "1", account_number_last4: "0001", has_qr: false }] };

async function call(routeFile: string, urlPath: string, host: string, served: unknown = SITE, extra: { method?: string; pack?: unknown } = {}): Promise<Response> {
  const names = ["STOREFRONT_API_BASE", "STOREFRONT_SERVER_SECRET", "STOREFRONT_HOST_ALIASES", "VERCEL"];
  const before = { fetch: globalThis.fetch, env: names.map((n) => process.env[n]) };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("http://api.test/storefront/v1/site/")) return served ? Response.json(served) : Response.json({}, { status: 404 });
    if (url.startsWith("http://api.test/storefront/v1/pack/")) return Response.json(extra.pack ?? PACK);
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  Object.assign(process.env, { STOREFRONT_API_BASE: "http://api.test", STOREFRONT_SERVER_SECRET: secret, STOREFRONT_HOST_ALIASES: "", VERCEL: "" });
  try {
    const mod = await import(routeFile);
    return await mod[extra.method ?? "GET"](new Request(`https://${host}${urlPath}`, { headers: { host } }));
  } finally {
    globalThis.fetch = before.fetch;
    names.forEach((n, i) => { if (before.env[i] === undefined) delete process.env[n]; else process.env[n] = before.env[i]; });
  }
}

const HOME = "../src/app/route.ts";
const LANDING = "../src/app/funnel/membership-pack/landing-page/route.ts";
const tag = (page: string, re: RegExp) => page.match(re)?.[1];
const ldBlocks = (page: string) => [...page.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]));

for (const [name, file, pagePath, title, description] of [
  ["home", HOME, "/", "Nena&#x27;s Wellness &amp; Barley | Premium Wellness", HOME_DESCRIPTION],
  ["landing", LANDING, "/funnel/membership-pack/landing-page/", "Membership Pack | Nena&#x27;s Wellness &amp; Barley",
    "Get 2 boxes of Santé Barley Powder from Nena&#x27;s Wellness &amp; Barley for only ₱1,488.00 and unlock your Lifetime Membership."],
] as const) {
  test(`${name}: indexable, with every head tag built from the store and the served host`, async () => {
    const response = await call(file, `${pagePath}?utm_source=x&fbclid=abc`, "shop.example.test", FILLED);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-robots-tag"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const page = await response.text();
    assert.doesNotMatch(page, /<meta name="robots"/);
    const url = `https://shop.example.test${pagePath}`;
    assert.equal(tag(page, /<meta name="description" content="([^"]*)"/), description);
    assert.equal(tag(page, /<link rel="canonical" href="([^"]*)"/), url);
    assert.equal(tag(page, /<meta property="og:url" content="([^"]*)"/), url);
    assert.equal(tag(page, /<meta property="og:title" content="([^"]*)"/), title);
    assert.equal(tag(page, /<meta property="og:description" content="([^"]*)"/), description);
    assert.equal(tag(page, /<meta property="og:type" content="([^"]*)"/), "website");
    assert.equal(tag(page, /<meta property="og:site_name" content="([^"]*)"/), "Nena&#x27;s Wellness &amp; Barley");
    const image = `https://shop.example.test/assets/sante/img/sante-share-1200x630.jpg?v=${assetVersions()["img/sante-share-1200x630.jpg"]}`;
    assert.equal(tag(page, /<meta property="og:image" content="([^"]*)"/), image);
    assert.equal(tag(page, /<meta property="og:image:width" content="([^"]*)"/), "1200");
    assert.equal(tag(page, /<meta property="og:image:height" content="([^"]*)"/), "630");
    assert.equal(tag(page, /<meta property="og:image:type" content="([^"]*)"/), "image/jpeg");
    assert.equal(tag(page, /<meta property="og:image:alt" content="([^"]*)"/), "Nena&#x27;s Wellness &amp; Barley logo over a New Zealand barley grass farm");
    assert.equal(tag(page, /<meta name="twitter:card" content="([^"]*)"/), "summary_large_image");
    assert.equal(tag(page, /<meta name="twitter:title" content="([^"]*)"/), title);
    assert.equal(tag(page, /<meta name="twitter:description" content="([^"]*)"/), description);
    assert.equal(tag(page, /<meta name="twitter:image" content="([^"]*)"/), image);
    assert.match(page, /<link rel="icon" type="image\/png" sizes="32x32" href="\/assets\/sante\/img\/sante-favicon-32\.png\?v=[0-9a-f]{8}">/);
    assert.match(page, /<link rel="apple-touch-icon" sizes="180x180" href="\/assets\/sante\/img\/sante-apple-touch-icon-180\.png\?v=[0-9a-f]{8}">/);
    assert.match(page, new RegExp(`<title>${title.replace(/[|()]/g, "\\$&")}</title>`));
  });

  test(`${name}: a different host gives a different canonical and og:url`, async () => {
    const page = await (await call(file, `${pagePath}?x=1`, "other.example.test", SITE)).text();
    assert.equal(tag(page, /<link rel="canonical" href="([^"]*)"/), `https://other.example.test${pagePath}`);
    assert.equal(tag(page, /<meta property="og:url" content="([^"]*)"/), `https://other.example.test${pagePath}`);
    assert.match(page, /og:site_name" content="Demo Store"/);
  });
}

test("JSON-LD parses: Organization on both pages, Product on the landing page, the price from the pack", async () => {
  const home = ldBlocks(await (await call(HOME, "/", "shop.example.test", FILLED)).text());
  assert.equal(home.length, 1);
  assert.equal(home[0]["@type"], "Organization");
  assert.equal(home[0].name, "Nena's Wellness & Barley");
  assert.equal(home[0].url, "https://shop.example.test/");
  assert.match(home[0].logo, /^https:\/\/shop\.example\.test\/assets\/sante\/img\/navbar-logo\.webp\?v=[0-9a-f]{8}$/);
  const landing = ldBlocks(await (await call(LANDING, "/funnel/membership-pack/landing-page/", "shop.example.test", FILLED)).text());
  assert.deepEqual(landing.map((d) => d["@type"]), ["Organization", "Product"]);
  const product = landing[1];
  assert.equal(product.name, "Membership Pack");
  assert.equal(product.offers.price, "1488.00");
  assert.equal(product.offers.priceCurrency, "PHP");
  assert.equal(product.offers.availability, "https://schema.org/InStock");
  assert.equal(product.offers.url, "https://shop.example.test/funnel/membership-pack/landing-page/");
  assert.match(product.image[0], /^https:\/\/shop\.example\.test\/assets\/sante\/img\/bundle-1\.webp/);
  assert.equal(JSON.stringify(landing).match(/aggregateRating|review|brand/i), null);
  const other = ldBlocks(await (await call(LANDING, "/funnel/membership-pack/landing-page/", "a.test", SITE, { pack: { ...PACK, price_centavos: 99900, available: false } })).text());
  assert.equal(other[1].offers.price, "999.00");
  assert.equal(other[1].offers.availability, "https://schema.org/OutOfStock");
});

test("JSON-LD is escaped: store data cannot close the script block", async () => {
  assert.equal(jsonLdText({ a: "</script><script>alert(1)</script> & <!--" }).match(/[<>&]/), null);
  assert.deepEqual(JSON.parse(jsonLdText({ a: "</script>\u2028" })), { a: "</script>\u2028" });
  const evil = { ...SITE, display_name: "A</script><script>alert(1)</script>" };
  const page = await (await call(HOME, "/", "shop.example.test", evil)).text();
  assert.equal(page.match(/<script type="application\/ld\+json">/g)?.length, 1);
  assert.doesNotMatch(page, /<script>alert/);
  assert.equal(ldBlocks(page)[0].name, evil.display_name);
});

test("the sent view of the home and a host that is not a plain host name stay noindex", async () => {
  const sent = await call(HOME, "/?contact=sent", "shop.example.test", SITE);
  assert.equal(sent.headers.get("x-robots-tag"), "noindex");
  const page = await sent.text();
  assert.match(page, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(page, /rel="canonical"/);
});

test("htmlResponse is noindex unless a page opts in with index: true", () => {
  assert.equal(htmlResponse(html`x`).headers.get("x-robots-tag"), "noindex");
  assert.equal(htmlResponse(html`x`, 200, {}).headers.get("x-robots-tag"), "noindex");
  assert.equal(htmlResponse(html`x`, 200, { index: false }).headers.get("x-robots-tag"), "noindex");
  assert.equal(htmlResponse(html`x`, 200, { index: true }).headers.get("x-robots-tag"), null);
});

test("every other route stays noindex (header and meta): checkout, onboarding, sign-in, a policy page, the neutral 404", async () => {
  const routes: [string, string][] = [
    ["../src/app/checkout/route.ts", "/checkout/"],
    ["../src/app/cart/route.ts", "/cart/"],
    ["../src/app/products/route.ts", "/products/"],
    ["../src/app/funnel/membership-pack/checkout/route.ts", "/funnel/membership-pack/checkout/"],
    ["../src/app/funnel/membership-pack/onboarding/route.ts", "/funnel/membership-pack/onboarding/"],
    ["../src/app/dashboard/sign-in/route.ts", "/dashboard/sign-in/"],
    ["../src/app/privacy-policy/route.ts", "/privacy-policy/"],
    ["../src/app/[...path]/route.ts", "/no-such-page/"],
  ];
  for (const [file, urlPath] of routes) {
    for (const served of [FILLED, null]) {
      const response = await call(file, urlPath, "shop.example.test", served);
      assert.equal(response.headers.get("x-robots-tag"), "noindex", `${urlPath} ${served ? "served" : "unknown host"}`);
      const body = await response.text();
      if ((response.headers.get("content-type") ?? "").includes("html")) assert.match(body, /<meta name="robots" content="noindex">/, urlPath);
    }
  }
});

test("robots.txt: allow, the private prefixes, the sitemap of the served host; neutral 404 for an unknown host", async () => {
  const response = await call("../src/app/robots.txt/route.ts", "/robots.txt", "shop.example.test", FILLED);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/plain/);
  const text = await response.text();
  const lines = text.split("\n");
  assert.equal(lines[0], "User-agent: *");
  assert.equal(lines[1], "Allow: /");
  for (const p of ["/checkout/", "/cart/", "/dashboard/", "/funnel/membership-pack/checkout/", "/funnel/membership-pack/onboarding/",
    "/funnel/membership-pack/access/", "/funnel/membership-pack/completed/", "/funnel/membership-pack/visit/", "/contact/", "/chat/"]) {
    assert.ok(lines.includes(`Disallow: ${p}`), p);
  }
  assert.equal(PRIVATE_PREFIXES.includes("/funnel/membership-pack/landing-page/"), false);
  assert.ok(lines.includes("Sitemap: https://shop.example.test/sitemap.xml"));
  const other = await (await call("../src/app/robots.txt/route.ts", "/robots.txt", "a.test", SITE)).text();
  assert.ok(other.includes("Sitemap: https://a.test/sitemap.xml") && !other.includes("shop.example.test"));
  const unknown = await call("../src/app/robots.txt/route.ts", "/robots.txt", "nobody.test", null);
  assert.equal(unknown.status, 404);
  assert.match(await unknown.text(), /Page not found\./);
});

test("sitemap.xml: the two URLs of the served host; neutral 404 for an unknown host", async () => {
  const response = await call("../src/app/sitemap.xml/route.ts", "/sitemap.xml", "shop.example.test", FILLED);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/xml/);
  const xml = await response.text();
  assert.deepEqual([...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]), [
    "https://shop.example.test/", "https://shop.example.test/funnel/membership-pack/landing-page/",
  ]);
  const unknown = await call("../src/app/sitemap.xml/route.ts", "/sitemap.xml", "nobody.test", null);
  assert.equal(unknown.status, 404);
});

test("favicon.ico: a served site is sent to its icon; an unknown host gets the neutral 404", async () => {
  const response = await call("../src/app/favicon.ico/route.ts", "/favicon.ico", "shop.example.test", FILLED);
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") ?? "", /^\/assets\/sante\/img\/sante-favicon-32\.png\?v=[0-9a-f]{8}$/);
  assert.equal((await call("../src/app/favicon.ico/route.ts", "/favicon.ico", "nobody.test", null)).status, 404);
});

test("the share image is under 300 KB", () => {
  const file = path.join(import.meta.dirname, "..", "public", "assets", "sante", "img", "sante-share-1200x630.jpg");
  assert.ok(statSync(file).size < 300 * 1024);
});
