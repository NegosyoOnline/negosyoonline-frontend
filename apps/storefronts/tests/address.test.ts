import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { addressGet, addressPost } from "../src/lib/address-flow.ts";
import type { Dash } from "../src/lib/dashboard-flow.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret, hostAliases: {} } as unknown as import("../src/lib/env.ts").StorefrontEnv;

const HOME = { line: "7 Rizal St", barangay: "Poblacion", city: "Makati", province: "Metro Manila", zip: "1210", landmark: "Blue gate" };
const NEW = { line: "9 Mabini St <b>", barangay: "Bel-Air", city: "Makati", province: "Metro Manila", zip: "1209", landmark: "Red roof" };
const PRODUCT = { id: "prd_AAAAAAAAAAAA", code: "SPH1", name: "Coffee", category: "drinks", short_description: "", long_description: "", image_url: "", srp_centavos: 45000, unit_members_price_centavos: 27000, revision: 1 };
const QUOTE = { ok: true, member_price: true, ship_mode: "home", lines: [], subtotal_centavos: 0, total_centavos: 0, fingerprint: "fp", errors: [], shipping: { charged_centavos: 0, policy: "zero", estimated: true, available: true, error: "", note: "" } };

type Opts = { quote?: Record<string, unknown>; quoteStatus?: number; save?: { status: number; body: unknown }; packLock?: boolean; catalog?: unknown[]; me?: number };

function fake(o: Opts = {}) {
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\?.*$/, "").replace(/\/$/, "");
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ path: route, body });
    const json = (b: unknown, status = 200) => Promise.resolve(Response.json(b, { status }));
    if (route === "member/me") return o.me ? json({ error: { code: "member_session_invalid", message: "x" } }, o.me) : json({ member: { id: "m1", full_name: "Ana Reyes", email: "a@example.test", mobile: "+639171234567", email_verified: true, mobile_verified: true } });
    if (route === "member/pack") return json({ pack: o.packLock ? { order_number: "SP-1", payment_status: "rejected", payment_label: "Rejected", method_label: "Bank transfer", price_centavos: 100, tone: "bad", benefits_off: true, lock: { reason_label: "x", other_text: "", resubmitted: false, accounts: [] }, proofs: [] } : null, registration: null });
    if (route === "catalog/products") return json({ products: o.catalog ?? [PRODUCT] });
    if (route === "shop/quote") return json({ ...QUOTE, ...o.quote }, o.quoteStatus ?? 200);
    if (route === "member/address") return json(o.save?.body ?? { home_address: NEW, home_address_source: "profile" }, o.save?.status ?? 200);
    throw new Error(`unexpected call: ${route}`);
  };
  return { calls, fetchImpl };
}

function dashOf(f: ReturnType<typeof fake>, query = ""): Dash {
  return {
    site: SITE, now: new Date("2026-11-12T00:00:00Z"),
    call: { request: new Request(`http://www.santetest.com/dashboard/address/${query}`), host: "demo.negosyotest.com", visitor_ip: "", member_token: "M".repeat(43), binding: "", env },
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} },
  };
}

test("the page shows the saved address in the member shell with Account current, and asks the quote for it as the home ship mode", async () => {
  const f = fake({ quote: { home_address: HOME, home_address_source: "pack_order", home_address_locked: false } });
  const r = await addressGet(dashOf(f));
  assert.equal(r.status, 200);
  const b = await r.text();
  assert.match(b, /<title>Home address \| /);
  assert.match(b, /<h1>Home address<\/h1>/);
  assert.match(b, /Orders you already placed keep the address they were placed with\./);
  assert.match(b, /<form method="post" action="\/dashboard\/address\/">/);
  assert.match(b, /name="line" maxlength="200" value="7 Rizal St" required/);
  assert.match(b, /name="landmark" maxlength="200" value="Blue gate" required/);
  assert.match(b, /name="barangay" value="Poblacion"/);
  assert.match(b, /name="zip" value="1210" inputmode="numeric"/);
  assert.match(b, /<button class="btn" type="submit">Save address<\/button>/);
  assert.match(b, /href="\/dashboard\/account\/">Back to account/);
  assert.doesNotMatch(b, /Saved\./);
  const quote = f.calls.find((c) => c.path === "shop/quote")?.body;
  assert.deepEqual(quote?.lines, [{ id: PRODUCT.id, qty: 1 }]);
  assert.equal(quote?.ship_mode, "home");
});

test("?saved=1 shows 'Saved.'; no saved address, no catalog or a failing quote leave a blank form", async () => {
  const ok = await (await addressGet(dashOf(fake({ quote: { home_address: HOME } }), "?saved=1"))).text();
  assert.match(ok, /<div class="note info" role="status">Saved\.<\/div>/);
  for (const o of [{}, { catalog: [] }, { quoteStatus: 500 }]) {
    const b = await (await addressGet(dashOf(fake(o)))).text();
    assert.match(b, /name="line" maxlength="200" value="" required/);
    assert.doesNotMatch(b, /Your home address cannot be changed/);
  }
});

test("a locked address draws no form, only the sentence; an older backend without the flag draws the form", async () => {
  const locked = await (await addressGet(dashOf(fake({ quote: { home_address: HOME, home_address_locked: true } }), "?saved=1"))).text();
  assert.match(locked, /Your home address cannot be changed right now\./);
  assert.doesNotMatch(locked, /action="\/dashboard\/address\/"|name="line"|Saved\./);
  const older = await (await addressGet(dashOf(fake({ quote: { home_address: HOME } })))).text();
  assert.match(older, /name="line"/);
});

test("saving posts the six trimmed keys with the session and no ids, then goes back to the page with ?saved=1", async () => {
  const f = fake();
  const r = await addressPost(dashOf(f), { ...NEW, line: "  9 Mabini St <b> ", member_id: "m9", site_id: "s9", receiver_name: "X" });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/dashboard/address/?saved=1");
  const call = f.calls.find((c) => c.path === "member/address");
  assert.deepEqual(call?.body, { host: "demo.negosyotest.com", visitor_ip: "", member_token: "M".repeat(43), ...NEW });
});

test("a refusal shows each message under its field with what was typed, escaped", async () => {
  const fields = { line: ["Enter the street address."], province: ["Enter the province."] };
  const f = fake({ save: { status: 422, body: { error: { code: "invalid_address", message: "Some values are missing or invalid.", fields } } } });
  const r = await addressPost(dashOf(f), { ...NEW, line: "", province: "" , landmark: "<i>x</i>" });
  assert.equal(r.status, 400);
  const b = await r.text();
  assert.match(b, /<div class="note bad" role="alert">Check the highlighted fields\.<\/div>/);
  assert.match(b, /class="inp bad" name="line"[^>]*aria-describedby="addr-line-msg"/);
  assert.match(b, /<p class="err" id="addr-line-msg">Enter the street address\.<\/p>/);
  assert.match(b, /<p class="err" id="addr-province-msg">Enter the province\.<\/p>/);
  assert.match(b, /value="&lt;i&gt;x&lt;\/i&gt;"/);
});

test("a hold (423), the throttle (429), a dead session, a failure and an older backend (404) are each answered", async () => {
  const send = (save: { status: number; body: unknown }) => addressPost(dashOf(fake({ save })), NEW);
  const err = (status: number, code: string, message: string) => ({ status, body: { error: { code, message } } });
  const locked = await send(err(423, "address_locked", "Your home address cannot be changed right now."));
  assert.equal(locked.status, 423);
  const lb = await locked.text();
  assert.match(lb, /Your home address cannot be changed right now\./);
  assert.doesNotMatch(lb, /action="\/dashboard\/address\/"/);
  const throttled = await send(err(429, "rate_limited", "Too many tries. Please wait a while."));
  assert.equal(throttled.status, 429);
  assert.match(await throttled.text(), /Too many tries\. Please wait a while\./);
  const dead = await send(err(401, "member_session_invalid", "Not signed in."));
  assert.equal(dead.headers.get("location"), "/");
  assert.match(dead.headers.get("set-cookie") ?? "", /no_member=; .*Max-Age=0/);
  for (const down of [{ status: 500, body: {} }, { status: 404, body: { detail: "Not Found" } }]) {
    const r = await send(down);
    assert.equal(r.status, 503);
    const b = await r.text();
    assert.match(b, /We could not save your address\. Please try again shortly\./);
    assert.match(b, /name="line" maxlength="200" value="9 Mabini St &lt;b&gt;"/);
  }
});

test("no session goes to the store home; a dead one clears the cookie; a locked order goes to Home", async () => {
  const none = dashOf(fake());
  none.call.member_token = "";
  assert.equal((await addressGet(none)).headers.get("location"), "/");
  assert.equal((await addressPost(none, NEW)).headers.get("location"), "/");
  const dead = await addressGet(dashOf(fake({ me: 401 })));
  assert.equal(dead.headers.get("location"), "/");
  assert.match(dead.headers.get("set-cookie") ?? "", /no_member=; .*Max-Age=0/);
  const lockedOrder = await addressGet(dashOf(fake({ packLock: true })));
  assert.equal(lockedOrder.headers.get("location"), "/dashboard/");
});
