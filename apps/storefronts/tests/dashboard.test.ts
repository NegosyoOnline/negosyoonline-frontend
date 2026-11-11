import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { homePage, proofGet, registrationPost, resubmitPost, splitDate, type Dash } from "../src/lib/dashboard-flow.ts";
import { pesos } from "../src/views/sante/pack-member.ts";
import { PROOF_MAX_BYTES } from "../src/lib/pack-api.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret, hostAliases: {} } as unknown as import("../src/lib/env.ts").StorefrontEnv;

type Reply = { status: number; body: unknown; bytes?: Uint8Array; type?: string };
function fake(replies: Record<string, Reply[]>) {
  const calls: { path: string; body: Record<string, unknown>; form?: FormData }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\/$/, "");
    const form = init.body instanceof FormData ? init.body : undefined;
    calls.push({ path: route, body: form ? {} : JSON.parse(String(init.body)), form });
    const next = (replies[route] ?? []).shift();
    if (!next) throw new Error(`unexpected call: ${route}`);
    if (next.bytes) return Promise.resolve(new Response(next.bytes as unknown as BodyInit, { status: next.status, headers: { "content-type": next.type ?? "" } }));
    return Promise.resolve(Response.json(next.body, { status: next.status }));
  };
  return { calls, fetchImpl };
}
function dashOf(f: ReturnType<typeof fake>, token = "M".repeat(43)): Dash {
  const request = new Request("http://www.santetest.com/dashboard/");
  return {
    site: SITE, now: new Date("2026-11-12T00:00:00Z"),
    call: { request, host: "demo.negosyotest.com", visitor_ip: "", member_token: token, binding: "", env },
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} },
  };
}
const ok = (body: unknown): Reply => ({ status: 200, body });
const err = (status: number, code: string, message: string, fields?: Record<string, string[]>): Reply => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });
const ME = ok({ member: { id: "m1", full_name: "Juan Dela Cruz", email: "j@example.test", mobile: "+639171234567", email_verified: true, mobile_verified: true } });
const REG = { status: "details_needed", label: "Details needed", line: "Add your details.", tone: "wait", details_form: true, details_erased: false, state_version: "1" };
const MOBILE = { pending: false, mobile: "", locked: false, code_sent_to: "", resend_in: 0, attempts_left: 5 };
function pack(over: Record<string, unknown> = {}) {
  return {
    order_number: "SP-1001", payment_status: "pending_review", payment_label: "Under review", method_label: "Bank transfer",
    price_centavos: 148800, tone: "rev", benefits_off: true, lock: null, proofs: [], ...over,
  };
}
const LOCK = { reason_label: "Amount does not match", other_text: "", resubmitted: false, accounts: [{ id: "a1", provider_name: "BDO", account_name: "Santé Store" }] };
const cookies = (r: Response) => r.headers.getSetCookie().join("\n");

test("the Home shows the under-review payment card, with the order's own price", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [ok({ pack: pack(), registration: null })] });
  const r = await homePage(dashOf(f));
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.match(body, /Membership Pack/);
  assert.match(body, /pk-chip rev">Under review</);
  assert.match(body, /SP-1001/);
  assert.match(body, /Bank transfer · ₱1,488\.00/);
  assert.match(body, /Ships after the store verifies your payment/);
  assert.doesNotMatch(body, /pk-lock/);
  assert.doesNotMatch(body, /<script>/); // no inline script
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("a verified order shows the shipment line and no dialog", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [ok({ pack: pack({ payment_status: "verified", payment_label: "Verified", tone: "ok", benefits_off: false }), registration: null })] });
  const body = await (await homePage(dashOf(f))).text();
  assert.match(body, /The store will let you know when it ships/);
  assert.doesNotMatch(body, /Ships after the store verifies/);
});

test("the registration card lists the details form, with the mobile check when it is pending", async () => {
  const f = fake({
    "member/me": [ME, ME],
    "member/pack": [ok({ pack: pack(), registration: REG }), ok({ pack: pack(), registration: REG })],
    "member/registration": [ok({ registration: REG, mobile: MOBILE }), ok({ registration: REG, mobile: { ...MOBILE, pending: true, mobile: "+639171234567" } })],
  });
  const form = await (await homePage(dashOf(f))).text();
  assert.match(form, /Santé membership registration/);
  assert.match(form, /action="\/dashboard\/registration\/details\/"/);
  assert.match(form, /name="date_of_birth"/);
  const mobile = await (await homePage(dashOf(f))).text();
  assert.match(mobile, /Confirm your mobile number/);
  assert.match(mobile, /action="\/dashboard\/registration\/mobile\/send\/"/);
  assert.doesNotMatch(mobile, /name="desired_username"/);
});

test("a rejected order opens the dialog with the reason, the accounts and the resubmit form", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [ok({ pack: pack({ payment_status: "rejected", payment_label: "Needs attention", tone: "att", lock: LOCK }), registration: null })] });
  const body = await (await homePage(dashOf(f))).text();
  assert.match(body, /<dialog class="pk-dlg" id="pk-lock" open/);
  assert.match(body, /Your payment needs attention/);
  assert.match(body, /Reason from the store<\/b>Amount does not match/);
  assert.match(body, /action="\/dashboard\/pack\/resubmit\/"/);
  assert.match(body, /<option value="a1">BDO · Santé Store<\/option>/);
  assert.match(body, /up to 4 MB/);
  assert.match(body, /pack-lock\.js/);
  assert.match(body, /name="submit_key" value="[A-Za-z0-9_-]{16}"/);
});

test("the reason of an Other rejection reads 'Other: ...', and a sent proof shows the waiting note without the form", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [ok({ pack: pack({ payment_status: "rejected", tone: "att", lock: { ...LOCK, other_text: "Blurry", resubmitted: true } }), registration: null })] });
  const body = await (await homePage(dashOf(f))).text();
  assert.match(body, /Other: Blurry/);
  assert.match(body, /We received your new proof\. The store is reviewing it\./);
  assert.doesNotMatch(body, /pk-resubmit/);
  assert.doesNotMatch(body, /Send new proof/);
});

test("a session the API no longer knows clears the cookie and goes to the store home", async () => {
  const f = fake({ "member/me": [err(401, "member_session_invalid", "Sign in again.")] });
  const r = await homePage(dashOf(f));
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/");
  assert.match(cookies(r), /no_member=; .*Max-Age=0/);
  const none = await homePage(dashOf(fake({}), ""));
  assert.equal(none.headers.get("location"), "/");
});

test("resubmit sends the fields and the proof to Django, then goes Home", async () => {
  const f = fake({ "member/me": [ME], "member/pack/resubmit": [ok({ pack: pack(), registration: null })] });
  const form = new FormData();
  for (const [k, v] of Object.entries({ submit_key: "K1", account_id: "a1", sender_bank: "BDO", reference_number: "R1", sender_name: "Juan", sender_account_number: "123", amount_sent: "1488.00", transferred_at: "2026-11-12T10:00" })) form.append(k, v);
  form.append("proof", new File(["x"], "p.png", { type: "image/png" }));
  const r = await resubmitPost(dashOf(f), form);
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/dashboard/");
  const sent = f.calls.find((c) => c.path === "member/pack/resubmit")!.form!;
  assert.equal(sent.get("token"), "M".repeat(43));
  assert.equal(sent.get("host"), "demo.negosyotest.com");
  assert.equal(sent.get("submit_key"), "K1");
  assert.equal(sent.get("sender_name"), "Juan");
  assert.ok(sent.get("proof") instanceof File);
});

test("a refused resubmit shows the field messages in the dialog and keeps what was typed", async () => {
  const f = fake({
    "member/me": [ME, ME],
    "member/pack/resubmit": [err(422, "invalid_proof", "Check the highlighted fields.", { amount_sent: ["Enter the amount you sent."] })],
    "member/pack": [ok({ pack: pack({ payment_status: "rejected", tone: "att", lock: LOCK }), registration: null })],
  });
  const form = new FormData();
  form.append("sender_bank", "BDO");
  const r = await resubmitPost(dashOf(f), form);
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.match(body, /Enter the amount you sent\./);
  assert.match(body, /value="BDO"/);
});

test("a proof over the cap is refused here, before Django is called", async () => {
  const f = fake({ "member/me": [ME, ME], "member/pack": [ok({ pack: pack({ payment_status: "rejected", tone: "att", lock: LOCK }), registration: null })] });
  const form = new FormData();
  form.append("proof", new File([new Uint8Array(PROOF_MAX_BYTES + 1)], "big.pdf", { type: "application/pdf" }));
  const r = await resubmitPost(dashOf(f), form);
  assert.match(await r.text(), /The file is too large\. The limit is 4 MB\./);
  assert.equal(f.calls.some((c) => c.path === "member/pack/resubmit"), false);
});

test("resubmit on an order that is not rejected goes Home", async () => {
  const f = fake({ "member/me": [ME], "member/pack/resubmit": [err(409, "not_rejected", "Nothing to send.")] });
  const r = await resubmitPost(dashOf(f), new FormData());
  assert.equal(r.headers.get("location"), "/dashboard/");
});

test("the details post splits the date into the three numbers the backend reads, and sends terms", async () => {
  assert.deepEqual(splitDate({ date_of_birth: "1990-03-07" }), { dob_year: "1990", dob_month: "3", dob_day: "7" });
  assert.deepEqual(splitDate({ date_of_birth: "07/03/1990" }), { dob_year: "", dob_month: "", dob_day: "" });
  const f = fake({ "member/me": [ME], "member/registration/details": [ok({ registration: REG, mobile: MOBILE })] });
  const r = await registrationPost(dashOf(f), "details", { date_of_birth: "1990-03-07", desired_username: "juan12345", alternate_username: "juan54321", terms: "1" });
  assert.equal(r.headers.get("location"), "/dashboard/");
  assert.deepEqual(f.calls.find((c) => c.path === "member/registration/details")!.body, {
    host: "demo.negosyotest.com", visitor_ip: "", token: "M".repeat(43), dob_year: "1990", dob_month: "3", dob_day: "7",
    desired_username: "juan12345", alternate_username: "juan54321", terms: true,
  });
});

test("a wrong code is shown on the Home and is not put back", async () => {
  const f = fake({
    "member/me": [ME, ME],
    "member/registration/mobile/verify": [err(422, "invalid_code", "That code is not right.", { code: ["That code is not right."] })],
    "member/pack": [ok({ pack: pack(), registration: REG })],
    "member/registration": [ok({ registration: REG, mobile: { ...MOBILE, pending: true, code_sent_to: "+639171234567" } })],
  });
  const r = await registrationPost(dashOf(f), "mobile_verify", { code: "000000" });
  const body = await r.text();
  assert.match(body, /Confirm your mobile number/);
  assert.match(body, /That code is not right\./);
  assert.doesNotMatch(body, /value="000000"/);
});

test("own proof goes through this host, no-store, as an image or PDF only", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const f = fake({ "member/pack/proof": [{ status: 200, body: null, bytes, type: "image/png" }, { status: 200, body: null, bytes, type: "text/html" }, { status: 404, body: {} }] });
  const r = await proofGet(dashOf(f), "p1");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(f.calls[0].body, { host: "demo.negosyotest.com", visitor_ip: "", token: "M".repeat(43), proof_id: "p1" });
  assert.equal((await proofGet(dashOf(f), "p1")).status, 404); // not an image or PDF
  assert.equal((await proofGet(dashOf(f), "p2")).status, 404); // another member's proof
  assert.equal((await proofGet(dashOf(f), "../x")).status, 404);
});

test("pesos writes centavos as TWCinc writes money", () => {
  assert.equal(pesos(148800), "₱1,488.00");
  assert.equal(pesos(5), "₱0.05");
});

const HOME = {
  summary: { total_spent: 1488, total_orders: 1, delivered: 0, needs_attention: 0 },
  order_monitor: { delta: 1, awaiting_approval: 1, for_booking: 0, for_shipping: 0, delivered: 0, has_orders: true, series: [{ label: "Sun", count: 0, h: 0 }, { label: "Mon", count: 1, h: 100 }] },
};
const CARD = {
  order: { order_number: "SP-1001", created_at: "2026-11-12T02:00:00Z", total: 1488 }, payment_label: "Bank transfer", headline: "Membership Pack",
  chip_class: "is-review", chip_label: "Under review", problem: false, problem_line: "", note: "", awaiting_payment: false, under_review: true, steps: [],
  courier: "", tracking: "", shipping_label: "Free", item_count: 1, item_lines: [{ qty: 1, name: "Membership Pack" }],
  address: "1 Rizal St, Manila", receiver_name: "Juan Dela Cruz", receiver_mobile: "+639171234567",
  membership: { label: "Details received", line: "We have your details.", registered: false, sante_member_id: "", act: false },
};

test("the Home shows the four tiles, Order Monitoring and View all orders from the member/home figures", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [ok({ pack: pack(), registration: null })], "member/home": [ok(HOME)] });
  const body = await (await homePage(dashOf(f))).text();
  assert.match(body, /Total Spent<\/span><span class="acct-kpi-value">&#8369;1,488\.00/);
  assert.match(body, /Needs Attention/);
  assert.match(body, /Order Monitoring/);
  assert.match(body, /&#9650; \+1 vs last month/);
  assert.match(body, /sf-om-h-100/);
  assert.match(body, /<a href="\/dashboard\/orders\/">View all orders<\/a>/);
});

test("while rejected the Home shows no Order Monitoring and no View all orders", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [ok({ pack: pack({ payment_status: "rejected", tone: "att", lock: LOCK }), registration: null })], "member/home": [ok(HOME)] });
  const body = await (await homePage(dashOf(f))).text();
  assert.doesNotMatch(body, /Order Monitoring|View all orders/);
});

test("My Orders lists the cards; with none it says so; a rejected order sends it Home", async () => {
  const { ordersPage } = await import("../src/lib/dashboard-flow.ts");
  const f = fake({
    "member/me": [ME, ME, ME],
    "member/pack": [ok({ pack: pack(), registration: null }), ok({ pack: pack(), registration: null }), ok({ pack: pack({ payment_status: "rejected", tone: "att", lock: LOCK }), registration: null })],
    "member/orders": [ok({ cards: [CARD] }), ok({ cards: [] })],
  });
  const body = await (await ordersPage(dashOf(f))).text();
  assert.match(body, /<h1>My Orders<\/h1>/);
  assert.match(body, /<div class="oc-ref">SP-1001<\/div><div class="oc-date">Placed Nov 12, 2026<\/div>/);
  assert.match(body, /We received your payment\. The store is <strong>checking<\/strong> it/);
  assert.match(body, /Membership Status/);
  assert.match(body, /pack-dashboard\.js/);
  assert.match((await (await ordersPage(dashOf(f))).text()), /No orders on your dashboard yet\./);
  const locked = await ordersPage(dashOf(f));
  assert.equal(locked.headers.get("location"), "/dashboard/");
});
