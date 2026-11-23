/* PROMO-CONSENT (ClickUp z8uq9m92fv): the Pack checkout's opt-in box and the member's text-promotions toggle.
   Fake backend answers only; no real SMS. A missing flag is off everywhere. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { checkoutGet, checkoutPost, type Flow } from "../src/lib/checkout-flow.ts";
import { accountPage, preferencesPost } from "../src/lib/account-flow.ts";
import type { Dash } from "../src/lib/dashboard-flow.ts";
import { promoOf, type Pack } from "../src/lib/django.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret, hostAliases: {} } as unknown as import("../src/lib/env.ts").StorefrontEnv;
const TEXT = "Send me promotions from Demo Store by text. Reply STOP anytime.";
const ON = { promo_sms_consent_enabled: true, promo_sms_version: "2026-11-23", promo_sms_text: TEXT };
const BANK = { id: "acct_1", kind: "bank", account_type: "savings", provider_name: "BDO", account_name: "Demo Store", account_number: "0012 3456", account_number_last4: "3456", has_qr: false };
const PACK: Pack = { price_centavos: 148800, currency: "PHP", available: true, agreement: null, payment_accounts: [BANK] };

type Reply = { status: number; body: unknown };
function fake(replies: Record<string, Reply[]>) {
  const calls: { path: string; body: Record<string, unknown> | FormData }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\/$/, "");
    calls.push({ path: route, body: init.body instanceof FormData ? init.body : JSON.parse(String(init.body)) });
    const next = (replies[route] ?? []).shift();
    if (!next) throw new Error(`unexpected call: ${route}`);
    return Promise.resolve(Response.json(next.body, { status: next.status }));
  };
  return { calls, fetchImpl };
}
const ok = (body: unknown): Reply => ({ status: 200, body });
const TOKEN = "T".repeat(43);

function flowOf(f: ReturnType<typeof fake>, pack: Pack = PACK): Flow {
  return {
    site: SITE, pack, host: "demo.negosyotest.com", visitor_ip: "", token: "", request: new Request("http://www.santetest.com/funnel/membership-pack/checkout/"),
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} }, now: new Date("2026-11-12T00:00:00Z"),
  };
}
const POSTED = {
  action: "contact", submit_key: "k".repeat(16), first_name: "Juan", last_name: "Dela Cruz", mobile: "917 123 4567", email: "juan@example.com",
  pay_method: "direct", enrollment_authorized: "1", agree: "1", account_id: "acct_1", sender_bank: "BDO", reference_number: "123",
  sender_first_name: "Juan", sender_last_name: "dela Cruz", sender_account_number: "999", amount_sent: "1,488.00", transferred_at: "2026-11-11T10:00",
};
const PROOF = () => new File([new Uint8Array(10)], "receipt.png", { type: "image/png" });
const NEW_BUYER = (extraContact: object = {}) => fake({
  "checkout/contact": [ok({ token: TOKEN, expires_at: "x", ...extraContact })],
  "checkout/state": [ok({ needs_code: false, mobile: "09171234567", verified: false, expires_at: "x" })],
  "checkout/place": [ok({ order_number: "PK-1", replay: false })],
});

test("promoOf: only an explicit true with wording is on; missing, false or empty is off", () => {
  assert.deepEqual(promoOf(ON), { version: "2026-11-23", text: TEXT });
  assert.equal(promoOf({}), null);
  assert.equal(promoOf({ promo_sms_consent_enabled: false, promo_sms_version: null, promo_sms_text: null }), null);
  assert.equal(promoOf({ promo_sms_consent_enabled: true, promo_sms_text: "" }), null);
  assert.equal(promoOf(null), null);
});

test("switch off (fields missing): no checkbox on the contact page, and a post sends no promo_sms_ok even if one is posted", async () => {
  const f = NEW_BUYER();
  const page = await (await checkoutGet(flowOf(f))).text();
  assert.ok(!page.includes("promo_sms_ok") && !page.includes("by text"));
  const r = await checkoutPost(flowOf(f), { ...POSTED, promo_sms_ok: "1" }, PROOF());
  assert.equal(r?.status, 303);
  assert.equal((f.calls[2].body as FormData).has("promo_sms_ok"), false);
});

test("switch on via GET pack/: the contact page shows one unticked box with the exact wording; ticking sends promo_sms_ok=1", async () => {
  const pack = { ...PACK, ...ON };
  const page = await (await checkoutGet(flowOf(NEW_BUYER(), pack))).text();
  assert.equal(page.match(/name="promo_sms_ok"/g)?.length, 1);
  assert.match(page, /<input type="checkbox" id="promo_sms_ok" name="promo_sms_ok" value="1">/, "unticked");
  assert.ok(page.includes(`<span>${TEXT}</span>`), "the backend's wording, exactly");
  const ticked = NEW_BUYER();
  await checkoutPost(flowOf(ticked, pack), { ...POSTED, promo_sms_ok: "1" }, PROOF());
  assert.equal((ticked.calls[2].body as FormData).get("promo_sms_ok"), "1");
});

test("switch on, box unticked: nothing is sent and the order goes through", async () => {
  const f = NEW_BUYER();
  const r = await checkoutPost(flowOf(f, { ...PACK, ...ON }), POSTED, PROOF());
  assert.equal(r?.status, 303);
  assert.equal((f.calls[2].body as FormData).has("promo_sms_ok"), false);
});

test("the wording is escaped, never hard-coded: other text renders as given", async () => {
  const pack = { ...PACK, ...ON, promo_sms_text: "Texts <b>from</b> Tindahan" };
  const page = await (await checkoutGet(flowOf(NEW_BUYER(), pack))).text();
  assert.ok(page.includes("<span>Texts &lt;b&gt;from&lt;/b&gt; Tindahan</span>"));
  assert.ok(!page.includes(TEXT));
});

test("fallback: the flag only in the contact answer still shows the box on the next page and sends the tick", async () => {
  const f = fake({
    "checkout/contact": [ok({ token: TOKEN, expires_at: "x", ...ON })],
    "checkout/state": [ok({ needs_code: true, mobile: "09171234567", verified: false, expires_at: "x" })],
    "checkout/code/send": [ok({ status: "sent" })],
  });
  const r = await checkoutPost(flowOf(f), POSTED, PROOF());
  assert.equal(r?.status, 200); // the code step: a returning buyer
  const g = fake({
    "checkout/contact": [ok({ token: TOKEN, expires_at: "x", ...ON })],
    "checkout/state": [ok({ needs_code: false, mobile: "09171234567", verified: false, expires_at: "x" })],
    "checkout/place": [{ status: 400, body: { error: { code: "invalid_proof", message: "bad", fields: { proof: ["Attach the file."] } } } }],
  });
  const refused = await checkoutPost(flowOf(g), { ...POSTED, promo_sms_ok: "1" }, PROOF());
  const page = await refused!.text();
  assert.ok(page.includes(TEXT));
  assert.match(page, /name="promo_sms_ok" value="1" checked>/, "the tick the buyer made is kept");
  assert.equal((g.calls[2].body as FormData).get("promo_sms_ok"), "1");
});

test("the payment step shows the box too (GET with a verified token) and the place sends the tick", async () => {
  const pack = { ...PACK, ...ON };
  const f = fake({ "checkout/state": [ok({ needs_code: true, mobile: "09171234567", verified: true, expires_at: "x" })], "checkout/place": [ok({ order_number: "PK-2", replay: false })] });
  const flow = { ...flowOf(f, pack), token: TOKEN };
  const page = await (await checkoutGet(flow)).text();
  assert.ok(page.includes(TEXT) && page.includes('id="place-form"'));
  assert.match(page, /\.pp-co-agree\{display:flex;[^}]*\}/, "the payment step prints the box rules");
  assert.match(page, /\.pp-co-agree input\{flex:none;width:18px;height:18px;margin-top:3px\}/);
  await checkoutPost(flow, { action: "place", submit_key: "k".repeat(16), pay_method: "direct", promo_sms_ok: "1", account_id: "acct_1" }, null);
  assert.equal((f.calls[1].body as FormData).get("promo_sms_ok"), "1");
});

/* ---- the member toggle ---------------------------------------------------------------------------------------------- */
const dashOf = (f: ReturnType<typeof fake>): Dash => ({
  site: SITE, now: new Date("2026-11-12T00:00:00Z"),
  call: { request: new Request("http://www.santetest.com/dashboard/account/"), host: "demo.negosyotest.com", visitor_ip: "", member_token: "M".repeat(43), binding: "", env },
  calls: { env, fetchImpl: f.fetchImpl, log: () => {} },
});
const ME = ok({ member: { id: "m1", full_name: "Juan Dela Cruz", email: "j@example.test", mobile: "+639171234567", email_verified: false, mobile_verified: true } });
const NOT_LOCKED = ok({ pack: null, registration: null });
const ACCOUNT = ok({ member_name: "Juan", mobile_masked: "+63 917 *** 4567", mobile_state: "verified", email_masked: "j***@example.test", email_state: "unverified", default_channel: "sms", hold_banner: "" });
const err404 = (): Reply => ({ status: 404, body: { error: { code: "not_found", message: "Not found." } } });

test("the toggle reads the preference, shows its state, and sends the member token", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [NOT_LOCKED], "member/account": [ACCOUNT], "member/preferences/read": [ok({ promo_sms_ok: false, promo_sms_at: null })] });
  const b = await (await accountPage(dashOf(f))).text();
  assert.match(b, /Promotions by text from Demo Store/);
  assert.match(b, /<span class="badge off">Off<\/span>/);
  assert.match(b, /<input type="hidden" name="promo_sms_ok" value="1">/);
  assert.deepEqual(f.calls[3].body, { host: "demo.negosyotest.com", visitor_ip: "", member_token: "M".repeat(43) });
});

test("a 404 on the read (switch off) hides the toggle completely", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [NOT_LOCKED], "member/account": [ACCOUNT], "member/preferences/read": [err404()] });
  const b = await (await accountPage(dashOf(f))).text();
  assert.ok(!b.includes("promo-sms") && !b.includes("Text promotions") && !b.includes("by text"));
  assert.match(b, /<h1>Account and security<\/h1>/);
});

test("saving posts the choice with the member token and shows the saved state", async () => {
  const f = fake({
    "member/me": [ME, ME], "member/pack": [NOT_LOCKED, NOT_LOCKED], "member/account": [ACCOUNT],
    "member/preferences": [ok({ promo_sms_ok: true, promo_sms_at: "2026-11-23T01:00:00+00:00" })],
    "member/preferences/read": [ok({ promo_sms_ok: true, promo_sms_at: "2026-11-23T01:00:00+00:00" })],
  });
  const r = await preferencesPost(dashOf(f), { promo_sms_ok: "1" });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/dashboard/account/?promo=on");
  const g = fake({ "member/me": [ME], "member/pack": [NOT_LOCKED], "member/account": [ACCOUNT], "member/preferences/read": [ok({ promo_sms_ok: true, promo_sms_at: "2026-11-23T01:00:00+00:00" })] });
  const d = dashOf(g);
  d.call.request = new Request("http://www.santetest.com/dashboard/account/?promo=on");
  const b = await (await accountPage(d)).text();
  assert.match(b, /Text promotions are on\./);
  assert.ok(!(await (await accountPage(dashOf(fake({ "member/me": [ME], "member/pack": [NOT_LOCKED], "member/account": [ACCOUNT], "member/preferences/read": [ok({ promo_sms_ok: true, promo_sms_at: null })] })))).text()).includes("Text promotions are on."), "no marker, no notice");
  assert.match(b, /<span class="badge ok">On<\/span>/);
  assert.match(b, /name="promo_sms_ok" value="0"/);
  assert.deepEqual(f.calls.find((c) => c.path === "member/preferences")?.body, { host: "demo.negosyotest.com", visitor_ip: "", member_token: "M".repeat(43), promo_sms_ok: true });
});

test("saving on a 404 is the neutral page; any other value is nothing", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [NOT_LOCKED], "member/preferences": [err404()] });
  assert.equal((await preferencesPost(dashOf(f), { promo_sms_ok: "1" })).status, 404);
  const off = fake({ "member/me": [ME], "member/pack": [NOT_LOCKED], "member/preferences": [ok({ promo_sms_ok: false, promo_sms_at: null })] });
  assert.equal((await preferencesPost(dashOf(off), { promo_sms_ok: "0" })).headers.get("location"), "/dashboard/account/?promo=off");
  const bad = fake({ "member/me": [ME], "member/pack": [NOT_LOCKED], "member/preferences": [{ status: 500, body: {} }] });
  assert.equal((await preferencesPost(dashOf(bad), { promo_sms_ok: "1" })).headers.get("location"), "/dashboard/account/?promo=error");
  assert.equal((await preferencesPost(dashOf(fake({ "member/me": [ME], "member/pack": [NOT_LOCKED] })), { promo_sms_ok: "yes" })).status, 404);
});
