import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fetchPack, type Pack } from "../src/lib/django.ts";
import { landingDocument } from "../src/views/sante/pack-landing.ts";
import { MSG_AGREEMENT_UNAVAILABLE, MSG_NOT_AVAILABLE, packContext, pesos } from "../src/views/sante/pack-page.ts";
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
  assert.match(doc, /Prepaid only\. Cash on delivery is not available for this pack\./);
  assert.match(doc, /You review and agree to the Santé Membership Terms at checkout\./);
  assert.match(doc, /Frequently Asked Questions/);
  assert.match(doc, /data-pp-sticky/);
  assert.doesNotMatch(doc, /role="status"/);
  assert.doesNotMatch(doc, /\{%|\{\{|undefined|\[object/);
});

test("the landing page, order button off: only the message, no link, no phone bar", () => {
  const doc = page({ ...PACK, available: false, payment_accounts: [] });
  assert.match(doc, /<div role="status" data-pp-hero-cta[^>]*>\s*<p class="text-base leading-7 font-bold text-ink-900">Membership Pack checkout is not available yet\.<\/p>/);
  assert.doesNotMatch(doc, /membership-pack\/checkout\//);
  assert.doesNotMatch(doc, /data-pp-sticky/);
  assert.doesNotMatch(doc, /Get the Membership Pack/);
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
