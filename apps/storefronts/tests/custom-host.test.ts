import test from "node:test";
import assert from "node:assert/strict";
import { apexOfWww, homeRedirectTarget, onCustomHost, wwwRedirectTarget } from "../src/lib/custom-host.ts";
import { cleanHost, lookupHost, parseAliases } from "../src/lib/host.ts";
import { fetchSite, isSite } from "../src/lib/django.ts";
import { SITE } from "./site.ts";

const CUSTOM = { ...SITE, custom_host: "shop.example.test" };
const none = new Map<string, string>();
const lookup = (known: Record<string, { custom_host: string }>) => async (host: string) => known[host] ?? null;
const ask = (host: string | null, known: Record<string, { custom_host: string }>, extra: { secure?: boolean; aliases?: Map<string, string>; path?: string } = {}) =>
  wwwRedirectTarget({
    host, url: `https://${host}${extra.path ?? "/"}`, secure: extra.secure ?? true, aliases: extra.aliases ?? none, lookup: lookup(known),
  });

test("a custom host is cleaned like any other: lowercase, no junk, a trailing-dot or IDNA form is not a plain host", () => {
  assert.equal(cleanHost("Shop.Example.TEST"), "shop.example.test");
  assert.equal(cleanHost("shop.example.test."), "");
  assert.equal(cleanHost("shöp.example.test"), "");
  assert.equal(lookupHost("SHOP.example.test", none), "shop.example.test");
});

test("only www.<name with a dot> has an apex", () => {
  assert.equal(apexOfWww("WWW.Shop.Example.test"), "shop.example.test");
  assert.equal(apexOfWww("www.shop.example.test:3002"), "shop.example.test:3002");
  for (const no of ["shop.example.test", "www.com", "www.www.example.test", "wwwx.example.test", "", null, "www.bad host.test"]) {
    assert.equal(apexOfWww(no), "", String(no));
  }
});

test("www redirects to the apex with the same path and query, only when Django says the apex is a custom host", async () => {
  const known = { "shop.example.test": { custom_host: "shop.example.test" } };
  const target = await wwwRedirectTarget({
    host: "WWW.shop.example.test", url: "https://www.shop.example.test/funnel/membership-pack/checkout/?utm=a&x=1#f",
    secure: true, aliases: none, lookup: lookup(known),
  });
  assert.equal(target, "https://shop.example.test/funnel/membership-pack/checkout/?utm=a&x=1");
  assert.equal(await ask("www.shop.example.test", known, { secure: false, path: "/" }), "http://shop.example.test/");
});

test("no redirect for a platform host, an unknown host, a failed lookup or a non-www host", async () => {
  const platform = { "demo.platform.test": { custom_host: "" }, "shop.example.test": { custom_host: "" } };
  assert.equal(await ask("www.demo.platform.test", platform), null); // apex is a platform site (no custom_host)
  assert.equal(await ask("www.shop.example.test", platform), null);
  assert.equal(await ask("www.unknown.example.test", {}), null);
  assert.equal(await ask("shop.example.test", { "shop.example.test": { custom_host: "shop.example.test" } }), null);
  assert.equal(await ask("demo.platform.test", platform), null);
  assert.equal(await ask("www.bad host.test", {}), null);
});

test("an apex whose answer names another custom host is not redirected (no cross-merchant routing)", async () => {
  assert.equal(await ask("www.a.example.test", { "a.example.test": { custom_host: "b.example.test" } }), null);
});

test("the redirect target never starts with www., so it cannot loop", async () => {
  const known = { "shop.example.test": { custom_host: "shop.example.test" } };
  const target = (await ask("www.shop.example.test", known))!;
  assert.ok(!new URL(target).host.startsWith("www."));
  assert.equal(await ask(new URL(target).host, known), null);
});

test("a local alias on the www host itself is left alone; an alias on the apex is applied", async () => {
  const known = { "shop.example.test": { custom_host: "shop.example.test" } };
  assert.equal(await ask("www.shop.example.test", known, { aliases: parseAliases("www.shop.example.test=other.test") }), null);
  const local = parseAliases("shop.local.test:3002=shop.example.test");
  assert.equal(
    await wwwRedirectTarget({ host: "www.shop.local.test:3002", url: "http://www.shop.local.test:3002/a/", secure: false, aliases: local, lookup: lookup(known) }),
    "http://shop.local.test:3002/a/",
  );
});

test("onCustomHost: only the site's own custom hostname, never a platform host", () => {
  assert.equal(onCustomHost(CUSTOM, "shop.example.test"), true);
  assert.equal(onCustomHost(CUSTOM, "shop.example.test:3002"), true);
  assert.equal(onCustomHost(CUSTOM, "demo.platform.test"), false);
  assert.equal(onCustomHost(SITE, "shop.example.test"), false);
  assert.equal(onCustomHost({} as typeof SITE, "shop.example.test"), false); // a site object with no key at all
});

test("/ on a custom host goes to the landing with the query kept; on a platform host it stays the shop home", () => {
  assert.equal(homeRedirectTarget(CUSTOM, "shop.example.test", "?fbclid=abc&utm_source=x"), "/funnel/membership-pack/landing-page/?fbclid=abc&utm_source=x");
  assert.equal(homeRedirectTarget(CUSTOM, "shop.example.test", ""), "/funnel/membership-pack/landing-page/");
  assert.equal(homeRedirectTarget(CUSTOM, "demo.platform.test", ""), null);
  assert.equal(homeRedirectTarget(SITE, "demo.platform.test", ""), null);
});

test("custom_host is optional in Django's answer and a wrong type is a wrong shape", async () => {
  const older: Record<string, unknown> = { ...SITE };
  delete older.custom_host;
  assert.equal(isSite(older), true);
  assert.equal(isSite({ ...SITE, custom_host: 5 }), false);
  const env = { apiBase: "https://api.test", secret: "s".repeat(40) };
  const answer = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200 });
  assert.equal((await fetchSite("shop.example.test", env, answer(older)))!.custom_host, "");
  assert.equal((await fetchSite("shop.example.test", env, answer({ ...SITE, custom_host: "Shop.Example.TEST" })))!.custom_host, "shop.example.test");
});
