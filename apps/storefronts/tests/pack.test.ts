import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fetchPack, type Pack } from "../src/lib/django.ts";
import { landingDocument } from "../src/views/sante/pack-landing.ts";
import { MSG_AGREEMENT_UNAVAILABLE, MSG_NOT_AVAILABLE, VIDEO_EMBED_URL, packContext, pesos } from "../src/views/sante/pack-page.ts";
import { FILLED, SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const PUBLIC = path.join(import.meta.dirname, "..", "public");

const ACCOUNT = { id: "acct_1", kind: "bank", account_type: "bank", provider_name: "BDO", account_name: "Demo", account_number: "1", account_number_last4: "0001", has_qr: false };
const PACK: Pack = {
  price_centavos: 148800, currency: "PHP", available: true,
  agreement: { id: 1, label: "v1.0", effective_date: "2026-11-01" }, payment_accounts: [ACCOUNT],
};

function fake(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const logs: string[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(Response.json(body, { status }));
  };
  return { calls, logs, fetchImpl, log: (reason: string) => logs.push(reason) };
}

test("the pack read: one call with the credential and the host, never cached", async () => {
  const f = fake(200, PACK);
  assert.deepEqual(await fetchPack("demo.negosyotest.com:3002", env, f.fetchImpl, f.log), PACK);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "http://api.test/storefront/v1/pack/?host=demo.negosyotest.com%3A3002");
  const init = f.calls[0].init;
  assert.deepEqual(init.headers, { Authorization: `Bearer ${secret}`, Accept: "application/json" });
  assert.equal(init.cache, "no-store");
});

test("the pack read fails closed: 404 quietly, anything odd with a reason, no secret and no host never call", async () => {
  const quiet = fake(404, { error: { code: "not_found" } });
  assert.equal(await fetchPack("a.test", env, quiet.fetchImpl, quiet.log), null);
  assert.deepEqual(quiet.logs, []);
  for (const [status, body] of [[500, {}], [200, { price_centavos: "1" }], [200, { ...PACK, price_centavos: -1 }], [200, { ...PACK, payment_accounts: [1] }]] as const) {
    const f = fake(status, body);
    assert.equal(await fetchPack("a.test", env, f.fetchImpl, f.log), null, `${status} ${JSON.stringify(body)}`);
    assert.equal(f.logs.length, 1);
  }
  const none = fake(200, PACK);
  assert.equal(await fetchPack("a.test", { apiBase: "http://api.test", secret: "short" }, none.fetchImpl, none.log), null);
  assert.equal(await fetchPack("", env, none.fetchImpl, none.log), null);
  assert.equal(none.calls.length, 0);
});

test("the price as the pages show it", () => {
  assert.equal(pesos(148800), "₱1,488.00");
  assert.equal(pesos(5), "₱0.05");
  assert.equal(pesos(100000000), "₱1,000,000.00");
});

test("the order button follows the pack, and the message says why it is off", () => {
  assert.equal(packContext(SITE, PACK).cta, true);
  assert.equal(packContext(SITE, PACK).message, "");
  const noAccount = packContext(SITE, { ...PACK, available: false, payment_accounts: [] });
  assert.deepEqual([noAccount.cta, noAccount.message], [false, MSG_NOT_AVAILABLE]);
  const noAgreement = packContext(SITE, { ...PACK, available: false, agreement: null });
  assert.deepEqual([noAgreement.cta, noAgreement.message], [false, MSG_AGREEMENT_UNAVAILABLE]);
  assert.equal(MSG_NOT_AVAILABLE, "Membership Pack checkout is not available yet.");
  assert.equal(MSG_AGREEMENT_UNAVAILABLE, "Membership checkout is not available right now. Please check back soon.");
});

const page = (pack: Pack, site = SITE) => landingDocument(packContext(site, pack)).value;

test("the landing page, order button on: the price, the checkout link, the TWCinc wording", () => {
  const doc = page(PACK);
  assert.match(doc, /<title>Membership Pack \| Demo Store<\/title>/);
  assert.match(doc, /Get 2 boxes of Santé Barley Powder from Demo Store for <strong class="font-bold">only ₱1,488\.00<\/strong>/);
  assert.equal((doc.match(/href="\/funnel\/membership-pack\/checkout\/"/g) ?? []).length, 7); // TWCinc's landing: the hero button and six _cta includes (the phone bar among them)
  assert.match(doc, /Free Shipping Nationwide/);
  assert.doesNotMatch(doc, /Prepaid only\. Cash on delivery/);
  assert.doesNotMatch(doc, /You review and agree to the Santé Membership Terms when you complete/);
  assert.match(doc, /Frequently Asked Questions/);
  assert.match(doc, /data-pp-sticky/);
  assert.doesNotMatch(doc, /role="status"/);
  assert.doesNotMatch(doc, /\{%|\{\{|undefined|\[object/);
});

test("the landing hero holds the video, the From Nature card is gone, the button is centred", () => {
  const doc = page(PACK);
  const iframes = doc.match(/<iframe\b[^>]*>/g) ?? [];
  assert.equal(iframes.length, 1);
  assert.equal(iframes[0], `<iframe class="absolute inset-0 h-full w-full" style="border:0" referrerpolicy="strict-origin-when-cross-origin" src="${VIDEO_EMBED_URL.replaceAll("&", "&amp;")}" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;fullscreen;" allowfullscreen="true" title="Santé Membership Pack video">`);
  const hero = doc.slice(doc.indexOf('<section class="pp-hero'), doc.indexOf("</section>", doc.indexOf('<section class="pp-hero')));
  assert.ok(hero.includes(iframes[0]));
  assert.ok(hero.indexOf("pp-hero-video") > hero.indexOf("data-pp-hero-cta") && hero.indexOf("pp-hero-video") < hero.indexOf("pp-hero-photo")); // phone: text and button, video, photo
  assert.doesNotMatch(doc, /From Nature to a Healthier You|Pure\. Natural\. Trusted\./);
  assert.match(hero, /<div class="pp-hero-cta [^"]*text-center">\s*<div class="flex flex-col items-center tab:inline-flex">\s*<a href="\/funnel\/membership-pack\/checkout\/" data-pp-hero-cta[^>]*>Get 2 Boxes &amp; Unlock My Discount<svg/);
  assert.match(hero, /Free Shipping Nationwide/);
  assert.ok(hero.indexOf("pp-hero-cta ") > hero.indexOf("<ul") && hero.indexOf("pp-hero-cta ") < hero.indexOf("pp-hero-video")); // the button row follows the icon row (outside the copy column) and precedes the video
  assert.ok(hero.indexOf("pp-hero-cta ") > hero.indexOf("</ul>"));
  const LABEL = "Get 2 Boxes &amp; Unlock My Discount";
  assert.equal((doc.match(/Get the Membership Pack/g) ?? []).length, 0); // every order button carries the new label
  assert.equal((doc.match(new RegExp(LABEL, "g")) ?? []).length, 7); // the hero button and the six _cta includes (the phone bar among them)
  assert.match(hero, /data-pp-hero-cta class="[^"]*\bbg-accent-400 text-primary-950 shadow-\[var\(--shadow-cta\)\] hover:bg-accent-300\b/); // the hero button keeps the gold look
  assert.doesNotMatch(doc, /pp-hero-cta-green/);
  // fix round 4: the certifications sit in the hero copy column, the five benefit icons are gone, three items sit under the button
  for (const f of ["biogro-certified-organic.png", "halal-idcp.png", "superbrands-philippines-choice.png"]) {
    assert.equal((doc.match(new RegExp(`img/certifications/${f}`, "g")) ?? []).length, 1, f);
    assert.ok(hero.includes(`img/certifications/${f}`), f);
  }
  for (const cap of ["BioGro NZ Certified Organic", "Halal &mdash; IDCP Philippines", "Superbrands Philippines&rsquo; Choice"]) assert.ok(hero.includes(cap), cap);
  for (const gone of ["One qualifying purchase", "Lifetime membership<", "No renewal fees", "No monthly quotas", "No maintenance purchases"]) assert.ok(!hero.includes(gone), gone);
  assert.doesNotMatch(doc, /Certifications carried by/);
  assert.ok(hero.indexOf("pp-hero-certs") < hero.indexOf("pp-hero-cta ")); // phone order: copy with the certifications, the button row, the video, the photo
  const trust = hero.slice(hero.indexOf("pp-hero-trust"), hero.indexOf("</ul>", hero.indexOf("pp-hero-trust")));
  for (const label of ["Free Shipping Nationwide", "One-Time Purchase", "Lifetime Membership"]) assert.ok(trust.includes(label), label);
});

test("the landing page, order button off: only the message, no link, no phone bar", () => {
  const doc = page({ ...PACK, available: false, payment_accounts: [] });
  assert.match(doc, /<div role="status" data-pp-hero-cta[^>]*>\s*<p class="text-base leading-7 font-bold text-ink-900">Membership Pack checkout is not available yet\.<\/p>/);
  assert.doesNotMatch(doc, /membership-pack\/checkout\//);
  assert.doesNotMatch(doc, /data-pp-sticky/);
  assert.doesNotMatch(doc, /Get the Membership Pack|Unlock My Discount/);
});

test("the landing page never carries an inline script and never a per-order billing word", () => {
  const doc = page(PACK, FILLED);
  for (const tag of doc.match(/<script\b[^>]*>/g) ?? []) assert.match(tag, /^<script src="\/assets\/sante\/js\/[^"]+\?v=[0-9a-f]{8}">$/);
  assert.doesNotMatch(doc, /\son[a-z]+=/i);
  assert.doesNotMatch(doc, /per[- ]order|commission fee|transaction fee/i);
});

test("the landing page links only files that exist, and its stylesheets' own files too", () => {
  const doc = page(PACK, FILLED);
  const linked = new Set([...doc.matchAll(/(?:src|href)="(\/assets\/[^"?]+)\?v=[0-9a-f]{8}"/g)].map((m) => m[1]));
  assert.ok(linked.size >= 15);
  for (const file of linked) assert.ok(existsSync(path.join(PUBLIC, file)), file);
});

test("the site's own details reach the footer, escaped", () => {
  const doc = landingDocument(packContext({ ...FILLED, display_name: "A & <B>" }, PACK)).value;
  assert.match(doc, /<title>Membership Pack \| A &amp; &lt;B&gt;<\/title>/);
  assert.doesNotMatch(doc, /<B>/);
  assert.match(doc, /Nena Santos Trading/);
});

test("the landing script is the one the page links, and holds the three behaviours", () => {
  const js = readFileSync(path.join(PUBLIC, "assets/sante/js/pack-landing.js"), "utf8");
  for (const hook of ["[data-gallery]", "[data-selfcheck]", "[data-pp-sticky]"]) assert.ok(js.includes(hook), hook);
  assert.ok(page(PACK).includes("/assets/sante/js/pack-landing.js?v="));
});
