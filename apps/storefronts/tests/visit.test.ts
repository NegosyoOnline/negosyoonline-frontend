/* The Membership Pack page visitor (ClickUp z8uq9mfw14): the three API calls, the scripts and the landing tag. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { visitBegin, visitContact, visitEvent } from "../src/lib/pack-api.ts";
import { landingDocument } from "../src/views/sante/pack-landing.ts";
import { packContext } from "../src/views/sante/pack-page.ts";
import { SITE } from "./site.ts";

const JS = path.join(import.meta.dirname, "..", "public", "assets", "sante", "js");
const env = { apiBase: "http://api.test", secret: randomBytes(24).toString("hex") };
const base = { host: "demo.negosyotest.com", visitor_ip: "203.0.113.5" };

function calls(answer: unknown, status = 200) {
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    seen.push({ url, body: JSON.parse(String(init.body)) });
    return Promise.resolve(Response.json(answer, { status }));
  }) as unknown as typeof fetch;
  return { seen, c: { env, fetchImpl, log: () => {} } };
}

test("visitBegin, visitEvent and visitContact post to their Django routes and read the answers", async () => {
  const a = calls({ ref: "abc" });
  assert.deepEqual(await visitBegin({ ...base, ref: "" }, a.c), { state: "ok", ref: "abc" });
  assert.equal(a.seen[0].url, "http://api.test/storefront/v1/visit/");
  const b = calls({ ok: true });
  assert.equal((await visitEvent({ ...base, ref: "abc", event: "percent", percent: 90 }, b.c)).state, "ok");
  assert.equal(b.seen[0].url, "http://api.test/storefront/v1/visit/event/");
  assert.equal(b.seen[0].body.percent, 90);
  const d = calls({ ok: true });
  await visitContact({ ...base, ref: "abc", full_name: "Ana", mobile: "0917", email: "a@b.test" }, d.c);
  assert.equal(d.seen[0].url, "http://api.test/storefront/v1/visit/contact/");
  assert.equal((await visitBegin({ ...base, ref: "" }, calls({ nope: 1 }).c)).state, "failed");
  assert.equal((await visitEvent({ ...base, ref: "x", event: "start" }, calls({}, 404).c)).state, "unavailable");
  assert.equal((await visitEvent({ ...base, ref: "x", event: "start" }, calls({ error: { code: "rate_limited", message: "m" } }, 429).c)).state, "refused");
});

test("the landing page carries the one visitor script, and no Meta or third-party call is made from it", () => {
  const page = landingDocument(packContext(SITE, { price_centavos: 148800, currency: "PHP", available: true, agreement: null, payment_accounts: [] } as never, new Date())).value;
  assert.equal([...page.matchAll(/src="\/assets\/sante\/js\/pack-visit\.js\?v=[0-9a-f]{8}"/g)].length, 1);
  const visit = readFileSync(path.join(JS, "pack-visit.js"), "utf8");
  assert.ok(visit.includes("/funnel/membership-pack/visit/") && visit.includes("localStorage") && !/document\.cookie|fbq|facebook/.test(visit));
  assert.ok(visit.includes('iframe[src*="mediadelivery.net"]'), "the video is found by its address, not its place");
  for (const m of ["25", "50", "75", "90", "100"]) assert.ok(visit.includes(m));
});

test("the checkout script saves the contact on blur, sends the ref with the order and uses no cookie", () => {
  const js = readFileSync(path.join(JS, "pack-checkout.js"), "utf8");
  assert.ok(js.includes('op:"contact"') && js.includes('addEventListener("blur",save)') && js.includes('name="visitor_ref"'));
  assert.ok(!/document\.cookie/.test(js));
});
