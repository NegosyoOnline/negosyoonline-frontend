import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fetchPolicy, POLICY_SLUGS, type Policy } from "../src/lib/pack-api.ts";
import { policyDocument } from "../src/views/sante/pack-policies.ts";
import { packContext } from "../src/views/sante/pack-page.ts";
import { FILLED } from "./site.ts";

const env = { apiBase: "http://api.test", secret: randomBytes(24).toString("hex") }; // throwaway, made for this run only
const LINKS = POLICY_SLUGS.map((s) => ({ label: s, path: `/${s}/` }));
const SHIPPING = { processing_time: "1 to 2 business days", metro_manila_estimate: "2 to 3 days", luzon_estimate: "3 to 5 days", visayas_estimate: "4 to 6 days", mindanao_estimate: "5 to 7 days", other_areas_estimate: "" };
const PRIVACY = { order_retention_period: "5 years", account_retention_period: "2 years", support_retention_period: "2 years", marketing_retention_period: "While needed", security_retention_period: "90 days", analytics_retention_period: "14 months" };

function policy(slug: string, over: Partial<Policy> = {}): Policy {
  return {
    slug, title: "Page <Title>", version: "1", effective_date: "",
    business: { name: "Nena Santos Trading", address: "1 Rizal St, Quezon City", email: "hello@demo-store.example.test", phone: "09171234567", website_url: "https://demo.negosyotest.com", privacy_email: "privacy@demo-store.example.test", complaints_contact: "Nena Santos", registration_details: "DTI Business Name No. 1234567" },
    shipping: SHIPPING, privacy: PRIVACY, ...over,
  };
}
const ctx = () => packContext({ ...FILLED, policy_links: LINKS }, { price_centavos: 0, currency: "PHP", available: false, agreement: null, payment_accounts: [] });
const page = (slug: string, over: Partial<Policy> = {}) => policyDocument(ctx(), policy(slug, over))!.value;

test("each of the five slugs renders its page with the store's own values, escaped, and no inline script", () => {
  for (const slug of POLICY_SLUGS) {
    const out = page(slug);
    assert.match(out, /<article class="pp-policy">/);
    assert.match(out, /<h1>Page &lt;Title&gt;<\/h1>/);
    assert.match(out, /Seller: Nena Santos Trading/);
    assert.match(out, /Nena Santos Trading/);
    assert.doesNotMatch(out, /\{\{|\{%|\$\{|undefined/);
    assert.doesNotMatch(out, /<script(?![^>]*\bsrc=)/);
    assert.doesNotMatch(out, /id="pp-policy-dlg"/); // policy.html leaves the popup out
  }
});

test("version, effective date only once set, and the list of all live policies", () => {
  assert.match(page("terms-and-conditions"), /<p class="pp-policy-meta">Version 1<\/p>/);
  assert.match(page("terms-and-conditions", { effective_date: "November 5, 2026" }), /Version 1 &middot; Effective November 5, 2026/);
  const out = page("payment-policy");
  assert.match(out, /<h2>All store policies<\/h2>/);
  assert.equal((out.match(/<li><a href="\/[a-z-]+-?[a-z-]*\/">/g) ?? []).length >= 5, true);
});

test("terms print the registration line only when there is one; privacy prints the retention values; shipping the estimates", () => {
  assert.match(page("terms-and-conditions"), /Registration Details: DTI Business Name No\. 1234567/);
  assert.doesNotMatch(page("terms-and-conditions", { business: { ...policy("x").business, registration_details: "" } }), /Registration Details/);
  assert.match(page("privacy-policy"), /14 months/);
  assert.match(page("privacy-policy"), /privacy@demo-store\.example\.test/);
  assert.match(page("privacy-policy"), /<p>If you post a product review, your display name, rating and review are shown on the store\.<\/p>/);
  const ship = page("shipping-policy");
  assert.match(ship, /1 to 2 business days/);
  assert.match(ship, /5 to 7 days/);
});

test("a policy read: sent with the credential and the host; 404 and bad answers are null; an unknown slug asks nothing", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const ok = (url: string, init: RequestInit) => { calls.push({ url, init }); return Promise.resolve(Response.json({ ...policy("terms-and-conditions"), effective_date: null })); };
  const got = await fetchPolicy("terms-and-conditions", "demo.negosyotest.com", { env, fetchImpl: ok });
  assert.equal(got?.title, "Page <Title>");
  assert.equal(got?.effective_date, "");
  assert.equal(calls[0].url, "http://api.test/storefront/v1/policies/terms-and-conditions/?host=demo.negosyotest.com");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, `Bearer ${env.secret}`);
  const notFound = () => Promise.resolve(Response.json({ error: { code: "not_found" } }, { status: 404 }));
  assert.equal(await fetchPolicy("terms-and-conditions", "h.test", { env, fetchImpl: notFound }), null);
  const junk = () => Promise.resolve(Response.json({ nope: 1 }));
  assert.equal(await fetchPolicy("terms-and-conditions", "h.test", { env, fetchImpl: junk }), null);
  const before = calls.length;
  assert.equal(await fetchPolicy("../etc", "h.test", { env, fetchImpl: ok }), null);
  assert.equal(calls.length, before);
});
