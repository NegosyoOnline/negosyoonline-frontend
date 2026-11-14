import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { addressOf, purchasesPage, proofGet, registrationPost, resubmitPost, reviewPost, type Dash } from "../src/lib/dashboard-flow.ts";
import { pesos } from "../src/views/sante/pack-member.ts";
import { PROOF_MAX_BYTES } from "../src/lib/pack-api.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret, hostAliases: {} } as unknown as import("../src/lib/env.ts").StorefrontEnv;

type Reply = { status: number; body: unknown; bytes?: Uint8Array; type?: string };
function fake(replies: Record<string, Reply[]>) {
  const calls: { path: string; body: Record<string, unknown>; form?: FormData }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\/(\?.*)?$/, "");
    const form = init.body instanceof FormData ? init.body : undefined;
    calls.push({ path: route, body: form || init.body === undefined ? {} : JSON.parse(String(init.body)), form });
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
  const r = await purchasesPage(dashOf(f));
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
  const body = await (await purchasesPage(dashOf(f))).text();
  assert.match(body, /The store will let you know when it ships/);
  assert.doesNotMatch(body, /Ships after the store verifies/);
});

const VERIFIED = () => pack({ payment_status: "verified", payment_label: "Verified", tone: "ok", benefits_off: false });
const STEPS = (done: number, dates: string[] = []) => ["Order Placed", "Payment Verified", "Shipped", "Delivered"].map((label, i) => ({ state: i < done ? "done" : i === done ? "current" : "pending", num: i + 1, label, date: dates[i] ?? "" }));
const shipped = (over: Record<string, unknown>) => ok({ cards: [{ ...CARD, ...over }] });

test("the Shipment line follows the same member/orders card My Orders shows: not shipped, shipped, delivered", async () => {
  const cases: [Record<string, unknown>, RegExp, RegExp?][] = [
    [{ steps: STEPS(2) }, /The store will let you know when it ships/],
    [{ steps: STEPS(3, ["2026-11-12T02:00:00Z", "", "2026-11-13T02:00:00Z"]), courier: "J&T", tracking: "JT-TEST-0002B" }, /Shipped via <b>J&amp;T<\/b> &middot; Tracking# JT-TEST-0002B/, /will let you know/],
    [{ steps: STEPS(4, ["", "", "", "2026-11-14T02:00:00Z"]), courier: "J&T", tracking: "JT-TEST-0002B" }, /<div>Shipment<\/div><span>Delivered on Nov 14, 2026<\/span>/, /will let you know|Shipped via/],
  ];
  for (const [over, want, not] of cases) {
    const f = fake({ "member/me": [ME], "member/pack": [ok({ pack: VERIFIED(), registration: null })], "member/orders": [shipped(over)] });
    const body = await (await purchasesPage(dashOf(f))).text();
    assert.match(body, want);
    if (not) assert.doesNotMatch(body, not);
  }
});

test("the Shipment line keeps its text when the orders read fails or has no card for the order", async () => {
  const f = fake({ "member/me": [ME, ME], "member/pack": [ok({ pack: VERIFIED(), registration: null }), ok({ pack: VERIFIED(), registration: null })], "member/orders": [err(500, "x", "x"), ok({ cards: [] })] });
  for (let i = 0; i < 2; i++) assert.match(await (await purchasesPage(dashOf(f))).text(), /The store will let you know when it ships/);
});

test("the registration card lists the details form, with the mobile check when it is pending", async () => {
  const f = fake({
    "member/me": [ME, ME],
    "member/pack": [ok({ pack: pack(), registration: REG }), ok({ pack: pack(), registration: REG })],
    "member/registration": [ok({ registration: REG, mobile: MOBILE }), ok({ registration: REG, mobile: { ...MOBILE, pending: true, mobile: "+639171234567" } })],
  });
  const form = await (await purchasesPage(dashOf(f))).text();
  assert.match(form, /Santé membership registration/);
  assert.match(form, /action="\/dashboard\/registration\/details\/#registration"/);
  assert.match(form, /<section class="pk-card" id="registration"/); // a refused post re-renders at the card, not the page top
  assert.match(form, /name="date_of_birth"/);
  const mobile = await (await purchasesPage(dashOf(f))).text();
  assert.match(mobile, /Confirm your mobile number/);
  assert.match(mobile, /action="\/dashboard\/registration\/mobile\/send\/#registration"/);
  assert.doesNotMatch(mobile, /name="desired_username"/);
});

test("a rejected order opens the dialog with the reason, the accounts and the resubmit form", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [ok({ pack: pack({ payment_status: "rejected", payment_label: "Needs attention", tone: "att", lock: LOCK }), registration: null })] });
  const body = await (await purchasesPage(dashOf(f))).text();
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
  const body = await (await purchasesPage(dashOf(f))).text();
  assert.match(body, /Other: Blurry/);
  assert.match(body, /We received your new proof\. The store is reviewing it\./);
  assert.doesNotMatch(body, /pk-resubmit/);
  assert.doesNotMatch(body, /Send new proof/);
});

test("a session the API no longer knows clears the cookie and goes to the store home", async () => {
  const f = fake({ "member/me": [err(401, "member_session_invalid", "Sign in again.")] });
  const r = await purchasesPage(dashOf(f));
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/");
  assert.match(cookies(r), /no_member=; .*Max-Age=0/);
  const none = await purchasesPage(dashOf(fake({}), ""));
  assert.equal(none.headers.get("location"), "/");
});

test("resubmit sends the fields and the proof to Django, then goes to My Purchases", async () => {
  const f = fake({ "member/me": [ME], "member/pack/resubmit": [ok({ pack: pack(), registration: null })] });
  const form = new FormData();
  for (const [k, v] of Object.entries({ submit_key: "K1", account_id: "a1", sender_bank: "BDO", reference_number: "R1", sender_name: "Juan", sender_account_number: "123", amount_sent: "1488.00", transferred_at: "2026-11-12T10:00" })) form.append(k, v);
  form.append("proof", new File(["x"], "p.png", { type: "image/png" }));
  const r = await resubmitPost(dashOf(f), form);
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/dashboard/purchases/");
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

test("resubmit on an order that is not rejected goes to My Purchases", async () => {
  const f = fake({ "member/me": [ME], "member/pack/resubmit": [err(409, "not_rejected", "Nothing to send.")] });
  const r = await resubmitPost(dashOf(f), new FormData());
  assert.equal(r.headers.get("location"), "/dashboard/purchases/");
});

test("the details post sends the one date as is, the usernames and the address block only when typed", async () => {
  assert.deepEqual(addressOf({}), {});
  assert.deepEqual(addressOf({ line: " 1 Rizal St ", city: "Quezon City", province: "Metro Manila", zip: "1100" }), {
    delivery_address: { line: "1 Rizal St", barangay: "", city: "Quezon City", province: "Metro Manila", zip: "1100" },
  });
  const f = fake({ "member/me": [ME], "member/registration/details": [ok({ registration: REG, mobile: MOBILE })] });
  const r = await registrationPost(dashOf(f), "details", { date_of_birth: "1990-03-07", desired_username: "juan12345", alternate_username: "juan54321" });
  assert.equal(r.headers.get("location"), "/dashboard/purchases/");
  assert.deepEqual(f.calls.find((c) => c.path === "member/registration/details")!.body, {
    host: "demo.negosyotest.com", visitor_ip: "", token: "M".repeat(43), date_of_birth: "1990-03-07",
    desired_username: "juan12345", alternate_username: "juan54321",
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
  assert.match(body, /action="\/dashboard\/registration\/mobile\/verify\/#registration"/);
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

const CARD = {
  order_number: "SP-1001", created_at: "2026-11-12T02:00:00Z", total: 1488, total_text: "1,488.00", total_centavos: 148800, payment_label: "Bank transfer", headline: "Membership Pack",
  chip_class: "is-review", chip_label: "Under review", problem: false, problem_line: "", note: "", awaiting_payment: false, under_review: true, steps: [],
  courier: "", tracking: "", shipping_label: "Free", item_count: 1, item_lines: [{ qty: 1, name: "Membership Pack" }],
  address: "1 Rizal St, Manila", receiver_name: "Juan Dela Cruz", receiver_mobile: "+639171234567",
  membership: { label: "Details received", line: "We have your details.", registered: false, sante_member_id: "", act: false },
};

/* ---- the Santé Membership Terms on the account details card (terms_required) ---- */

const PACK_READ = { price_centavos: 148800, currency: "PHP", available: true, agreement: { id: 7, label: "v1.0", effective_date: "2026-11-03" }, payment_accounts: [] };
const REG_TERMS = { ...REG, terms_required: true };

test("terms_required puts the Membership Terms tick, the popup of the active version and its script on the details card", async () => {
  const f = fake({
    "member/me": [ME], "member/pack": [ok({ pack: pack(), registration: REG_TERMS }), ],
    "member/registration": [ok({ registration: REG_TERMS, mobile: MOBILE })], pack: [ok(PACK_READ)],
  });
  const body = await (await purchasesPage(dashOf(f))).text();
  assert.match(body, /<input type="hidden" name="agreement_version_id" value="7">/);
  assert.match(body, /<input type="checkbox" id="dt-terms" name="terms" value="1">/);
  assert.match(body, /I have read and agree to the <a class="lnk"[^>]*data-terms-popup>Sant&eacute; Membership Terms&nbsp;&#8599;<\/a>\./);
  assert.match(body, /data-file="\/funnel\/membership-pack\/membership-terms\.pdf\?v=7"/);
  assert.match(body, /pack-terms-popup\.js/);
});

test("terms_required false or absent shows no tick, no popup, no script", async () => {
  for (const registration of [REG, { ...REG, terms_required: false }]) {
    const f = fake({ "member/me": [ME], "member/pack": [ok({ pack: pack(), registration })], "member/registration": [ok({ registration, mobile: MOBILE })] });
    const body = await (await purchasesPage(dashOf(f))).text();
    assert.match(body, /name="desired_username"/);
    assert.doesNotMatch(body, /dt-terms|agreement_version_id|pp-terms-dlg|pack-terms-popup/);
    assert.ok(!f.calls.some((c) => c.path === "pack")); // the agreement is not even read
  }
});

test("the details post carries terms and agreement_version_id only when the form had them", async () => {
  const typed = { date_of_birth: "1990-03-07", desired_username: "juan12345", alternate_username: "juan54321" };
  const done = ok({ registration: REG, mobile: MOBILE });
  const f = fake({ "member/me": [ME, ME, ME], "member/registration/details": [done, done, done] });
  await registrationPost(dashOf(f), "details", { ...typed, terms: "1", agreement_version_id: "7" });
  await registrationPost(dashOf(f), "details", { ...typed, agreement_version_id: "7" });
  await registrationPost(dashOf(f), "details", typed);
  const sent = f.calls.filter((c) => c.path === "member/registration/details").map((c) => c.body);
  assert.deepEqual([sent[0].terms, sent[0].agreement_version_id], [true, "7"]);
  assert.deepEqual([sent[1].terms, sent[1].agreement_version_id], [false, "7"]);
  assert.ok(!("terms" in sent[2]) && !("agreement_version_id" in sent[2]));
});

test("a submit without the tick shows the terms error; a changed version clears the tick and shows the backend's message", async () => {
  const text = { date_of_birth: "1990-03-07", desired_username: "juan12345", alternate_username: "juan54321", agreement_version_id: "7" };
  const required = "Please review and agree to the Membership Terms to continue.";
  const missing = fake({
    "member/me": [ME, ME], "member/registration/details": [err(422, "invalid_details", "Check the highlighted fields.", { terms: [required] })],
    "member/pack": [ok({ pack: pack(), registration: REG_TERMS })], "member/registration": [ok({ registration: REG_TERMS, mobile: MOBILE })], pack: [ok(PACK_READ)],
  });
  const m = await (await registrationPost(dashOf(missing), "details", text)).text();
  assert.match(m, /<p class="err pp-ob-terms-err">Please review and agree to the Membership Terms to continue\.<\/p>/);
  const stale = fake({
    "member/me": [ME, ME],
    "member/registration/details": [err(409, "agreement_changed", "The Membership Terms were updated. Please review and agree again.", {})],
    "member/pack": [ok({ pack: pack(), registration: REG_TERMS })], "member/registration": [ok({ registration: REG_TERMS, mobile: MOBILE })],
    pack: [ok({ ...PACK_READ, agreement: { id: 8, label: "v2.0", effective_date: "2026-11-13" } })],
  });
  const s = await (await registrationPost(dashOf(stale), "details", { ...text, terms: "1", agreement_version_id: "7" })).text();
  assert.match(s, /The Membership Terms were updated\. Please review and agree again\./);
  assert.doesNotMatch(s, /name="terms" value="1" checked/);
  assert.match(s, /name="agreement_version_id" value="8"/);
  const none = fake({
    "member/me": [ME, ME], "member/registration/details": [err(422, "agreement_required", required, { terms: [required] })],
    "member/pack": [ok({ pack: pack(), registration: REG_TERMS })], "member/registration": [ok({ registration: REG_TERMS, mobile: MOBILE })], pack: [ok(PACK_READ)],
  });
  assert.match(await (await registrationPost(dashOf(none), "details", { ...text, terms: "1" })).text(), /pp-ob-terms-err">Please review and agree/);
});

/* ---- round 5b: My Orders reviews ------------------------------------------------------------------------------------- */


test("the member's review post sends the session as data and the order id, then goes back to My Orders with an outcome", async () => {
  const f = fake({ "member/me": [ME], "shop/orders/sho_7/lines/2/review": [ok({ id: "rev_1", rating: 4, body: "Nice", display_name: "Juan D.", created_at: "2026-11-14T02:00:00Z", edited: false, can_edit: true })] });
  const r = await reviewPost(dashOf(f), { order_id: "sho_7", position: "2", mode: "create", rating: "4", body: "Nice", display_name: "" });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/dashboard/orders/?review=saved&order=sho_7&line=2#review-sho_7-2");
  const sent = f.calls.find((c) => c.path.endsWith("/review"))!.body;
  assert.deepEqual(sent, { host: "demo.negosyotest.com", visitor_ip: "", view_token: "", member_token: "M".repeat(43), rating: 4, body: "Nice" });
});

test("the member's review post: signed out goes to the store home, a bad order id or line is the neutral 404, a refusal is a fixed outcome", async () => {
  assert.equal((await reviewPost(dashOf(fake({}), ""), { order_id: "sho_7", position: "1", rating: "5" })).headers.get("location"), "/");
  assert.equal((await reviewPost(dashOf(fake({ "member/me": [ME] })), { order_id: "../x", position: "1", rating: "5" })).status, 404);
  assert.equal((await reviewPost(dashOf(fake({ "member/me": [ME] })), { order_id: "sho_7", position: "0", rating: "5" })).status, 404);
  const f = fake({ "member/me": [ME], "shop/orders/sho_7/lines/1/review": [err(409, "already_reviewed", "You already reviewed this product.")] });
  const r = await reviewPost(dashOf(f), { order_id: "sho_7", position: "1", rating: "5" });
  assert.match(r.headers.get("location") ?? "", /review=exists/);
});
