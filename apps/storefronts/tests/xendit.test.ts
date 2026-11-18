/* The Xendit option of the Membership Pack checkout, its pay and return pages, and the member Home states (ClickUp z8uq9mgkp1).
   Contract: backend docs/session-state xendit-contract v3. A fake Django answers each route in order. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { checkoutPost, type Flow } from "../src/lib/checkout-flow.ts";
import { packMethods, type Pack } from "../src/lib/django.ts";
import { xenditPayUrl, type MemberPack } from "../src/lib/pack-api.ts";
import type { ObFlow } from "../src/lib/onboarding-flow.ts";
import { payGet, returnGet, returnPost, returnStatus } from "../src/lib/pack-pay-flow.ts";
import { checkoutDocument, checkoutModel } from "../src/views/sante/pack-checkout.ts";
import { homePanels, type HomePanels } from "../src/views/sante/pack-member.ts";
import { packContext } from "../src/views/sante/pack-page.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const NOW = new Date("2026-11-18T00:00:00Z");
const TOKEN = "T".repeat(43);
const INVOICE = "https://checkout.xendit.co/web/abc123";
const BANK = { id: "acct_1", kind: "bank", account_type: "savings", provider_name: "BDO", account_name: "Demo Store", account_number: "0012 3456", account_number_last4: "3456", has_qr: false };
const PACK = (methods: { direct: boolean; xendit: boolean }): Pack => ({
  price_centavos: 148800, currency: "PHP", available: true, agreement: { id: 7, label: "v1.0", effective_date: "2026-11-03" },
  payment_accounts: methods.direct ? [BANK] : [], methods,
});

type Reply = { status: number; body: unknown };
type Call = { path: string; body: Record<string, unknown> | FormData };
function fake(replies: Record<string, Reply[]>) {
  const calls: Call[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\/$/, "");
    const body = init.body instanceof FormData ? init.body : JSON.parse(String(init.body));
    calls.push({ path: route, body });
    const next = (replies[route] ?? []).shift();
    if (!next) throw new Error(`unexpected call: ${route}`);
    return Promise.resolve(Response.json(next.body, { status: next.status }));
  };
  return { calls, fetchImpl };
}
const ok = (body: unknown): Reply => ({ status: 200, body });
const err = (status: number, code: string, message: string): Reply => ({ status, body: { error: { code, message } } });
const status = (payment_status: string, pay_url: string | null = null): Reply => ok({ payment_status, order_number: "PK-1", pay_url });

function flowOf(f: ReturnType<typeof fake>, methods: { direct: boolean; xendit: boolean }, over: Partial<Flow> = {}): Flow {
  return {
    site: SITE, pack: PACK(methods), host: "demo.negosyotest.com", visitor_ip: "", token: "", request: new Request("http://www.santetest.com/funnel/membership-pack/checkout/"),
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} }, now: NOW, ...over,
  };
}
const obOf = (f: ReturnType<typeof fake>, over: Partial<ObFlow> = {}): ObFlow => ({ ...flowOf(f, { direct: false, xendit: true }, { token: TOKEN }), ...over }) as ObFlow;

const PAGE = (methods: { direct: boolean; xendit: boolean }, posted: Record<string, string> = {}) =>
  checkoutDocument(packContext(SITE, PACK(methods), NOW), checkoutModel({ accounts: methods.direct ? [BANK] : [], methods, posted })).value;

test("the offered methods: the API's methods, or transfer only when it sends none", () => {
  assert.deepEqual(packMethods({}), { direct: true, xendit: false });
  assert.deepEqual(packMethods({ methods: { direct: false, xendit: true } }), { direct: false, xendit: true });
});

test("both methods: two cards, transfer first chosen with its sheet open; Xendit card carries its words", () => {
  const page = PAGE({ direct: true, xendit: true });
  assert.ok(page.includes('name="pay_method" value="xendit"') && page.includes('name="pay_method" value="direct" checked'));
  assert.ok(page.includes("Pay online (Xendit)") && page.includes("You&#x27;ll be redirected to our secure payment provider powered by Xendit."));
  assert.ok(page.includes('id="direct-panel" class="pp-co-direct pp-co-slide is-open"') && page.includes('name="proof"'));
  assert.ok(page.includes('data-xendit="Continue to Payment'));
  const picked = PAGE({ direct: true, xendit: true }, { pay_method: "xendit" });
  assert.ok(picked.includes('value="xendit" checked') && !picked.includes('id="direct-panel" class="pp-co-direct pp-co-slide is-open"'));
  assert.ok(picked.includes("Continue to Payment &mdash; ₱1,488.00"));
});

test("only Xendit: no transfer card, account, proof or receipt fields; the card is chosen", () => {
  const page = PAGE({ direct: false, xendit: true });
  assert.ok(page.includes('value="xendit" checked') && page.includes("Pay online (Xendit)"));
  for (const gone of ['name="pay_method" value="direct"', 'name="proof"', 'name="account_id"', 'name="sender_bank"', "direct-panel", "Bank or e-wallet transfer"]) assert.ok(!page.includes(gone), gone);
});

test("only transfer: no word of Xendit on the page", () => {
  const page = PAGE({ direct: true, xendit: false });
  assert.ok(!/xendit/i.test(page));
});

const POSTED = {
  action: "contact", submit_key: "k".repeat(16), first_name: "Juan", last_name: "Dela Cruz", mobile: "917 123 4567", email: "juan@example.com",
  pay_method: "xendit", enrollment_authorized: "1", agree: "1",
  account_id: "acct_1", sender_bank: "BDO", reference_number: "123", amount_sent: "1,488.00",
};
const contactAnswers = () => ({
  "checkout/contact": [ok({ token: TOKEN, expires_at: "x" })],
  "checkout/state": [ok({ needs_code: false, mobile: "09171234567", verified: false, expires_at: "x" })],
});

test("place with Xendit: pay_method xendit, no transfer fields or proof sent; to the same-origin pay page", async () => {
  const f = fake({ ...contactAnswers(), "checkout/place": [ok({ order_number: "PK-1", replay: false, pay_url: INVOICE })] });
  const r = await checkoutPost(flowOf(f, { direct: true, xendit: true }), POSTED, new File([new Uint8Array(10)], "r.png", { type: "image/png" }));
  assert.equal(r?.status, 303);
  assert.equal(r?.headers.get("location"), "/funnel/membership-pack/checkout/pay/");
  assert.match(r?.headers.get("set-cookie") ?? "", new RegExp(`^no_checkout=${TOKEN};`));
  const form = f.calls[2].body as FormData;
  assert.equal(form.get("pay_method"), "xendit");
  for (const name of ["account_id", "sender_bank", "amount_sent", "proof"]) assert.equal(form.get(name), null, name);
});

test("place with Xendit and no invoice yet (pay_url null): to the return page, which offers Try again", async () => {
  const f = fake({ ...contactAnswers(), "checkout/place": [ok({ order_number: "PK-1", replay: false, pay_url: null })] });
  const r = await checkoutPost(flowOf(f, { direct: false, xendit: true }), { ...POSTED, pay_method: "" }, null);
  assert.equal(r?.headers.get("location"), "/funnel/membership-pack/checkout/return/");
  assert.equal((f.calls[2].body as FormData).get("pay_method"), "xendit", "the only method the site has");
});

test("place with transfer still goes to onboarding and carries pay_method direct", async () => {
  const f = fake({ ...contactAnswers(), "checkout/place": [ok({ order_number: "PK-1", replay: false, pay_url: null })] });
  const r = await checkoutPost(flowOf(f, { direct: true, xendit: true }), { ...POSTED, pay_method: "direct" }, new File([new Uint8Array(10)], "r.png", { type: "image/png" }));
  assert.equal(r?.headers.get("location"), "/funnel/membership-pack/onboarding/");
  const form = f.calls[2].body as FormData;
  assert.equal(form.get("pay_method"), "direct");
  assert.equal(form.get("account_id"), "acct_1");
});

test("a Xendit address is only ever Xendit's https address", () => {
  assert.equal(xenditPayUrl(INVOICE), INVOICE);
  for (const bad of ["http://checkout.xendit.co/x", "https://evil.example/x", "https://xendit.co.evil.example/x", "https://u:p@checkout.xendit.co/x", "javascript:alert(1)", "", null, 5]) assert.equal(xenditPayUrl(bad), "", String(bad));
});

test("pay page: opens the invoice from this host; no cookie starts over; paid and bank orders go to onboarding", async () => {
  const r = await payGet(obOf(fake({ "checkout/payment-status": [status("waiting", INVOICE)] })));
  const page = await r!.text();
  assert.ok(page.includes(`data-pay-url="${INVOICE}"`) && page.includes('href="' + INVOICE + '"') && page.includes("Continue to payment"));
  assert.ok(!page.includes("<script>") && page.includes("pack-pay.js"));
  const none = fake({});
  assert.equal((await payGet(obOf(none, { token: "" })))?.headers.get("location"), "/funnel/membership-pack/checkout/");
  assert.equal(none.calls.length, 0);
  for (const s of ["paid", "under_review", "needs_attention"]) {
    assert.equal((await payGet(obOf(fake({ "checkout/payment-status": [status(s)] }))))?.headers.get("location"), "/funnel/membership-pack/onboarding/", s);
  }
  assert.equal((await payGet(obOf(fake({ "checkout/payment-status": [status("waiting", null)] }))))?.headers.get("location"), "/funnel/membership-pack/checkout/return/");
  assert.equal((await payGet(obOf(fake({ "checkout/payment-status": [err(409, "checkout_expired", "x")] }))))?.headers.get("location"), "/funnel/membership-pack/checkout/");
});

test("return page: waiting polls; expired and mismatch show their words; mismatch takes the amount from the pack", async () => {
  const wait = await (await returnGet(obOf(fake({ "checkout/payment-status": [status("waiting", INVOICE)] }))))!.text();
  assert.ok(wait.includes('data-poll="1"') && wait.includes("Confirming your payment") && wait.includes("This page updates by itself. Please keep it open."));
  assert.ok(wait.includes("We will email you when Xendit confirms it. You can close this page.") && !wait.includes("text and email"));
  const expired = await (await returnGet(obOf(fake({ "checkout/payment-status": [status("expired")] }))))!.text();
  assert.ok(expired.includes('data-poll="0"') && expired.includes('<div data-state="expired">') && expired.includes("Your payment was not completed"));
  assert.ok(expired.includes('href="/funnel/membership-pack/checkout/">Try again'));
  const mismatch = await (await returnGet(obOf(fake({ "checkout/payment-status": [status("mismatch")] }))))!.text();
  assert.ok(mismatch.includes('<div data-state="mismatch">') && mismatch.includes("The payment we received does not match ₱1,488.00. The store is checking it and will contact you."));
  const none = await (await returnGet(obOf(fake({ "checkout/payment-status": [status("none")] }))))!.text();
  assert.ok(none.includes('<div data-state="expired">'));
  const noInvoice = await (await returnGet(obOf(fake({ "checkout/payment-status": [status("no_invoice")] }))))!.text();
  assert.ok(noInvoice.includes('<div data-state="no_invoice">') && noInvoice.includes("Payment is not available right now.") && noInvoice.includes('name="action" value="retry"'));
  assert.equal((await returnGet(obOf(fake({ "checkout/payment-status": [status("paid")] }))))?.headers.get("location"), "/funnel/membership-pack/onboarding/");
});

test("return page: Try again asks for a new invoice once (retry true); a 429 stays on the page", async () => {
  const f = fake({ "checkout/payment-status": [status("waiting", INVOICE)] });
  const r = await returnPost(obOf(f), { action: "retry" });
  assert.equal(r?.headers.get("location"), "/funnel/membership-pack/checkout/pay/");
  assert.equal((f.calls[0].body as Record<string, unknown>).retry, true);
  const limited = await returnPost(obOf(fake({ "checkout/payment-status": [err(429, "rate_limited", "x")] })), { action: "retry" });
  assert.equal(limited?.status, 429);
  assert.ok((await limited!.text()).includes("Please try again shortly."));
  assert.equal(await returnPost(obOf(fake({})), { action: "other" }), null);
});

test("the poll answers JSON, never cached; no answer from the API is a 503 the page waits through", async () => {
  const r = await returnStatus(obOf(fake({ "checkout/payment-status": [status("waiting", INVOICE)] })));
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(await r.json(), { state: "waiting", pay_url: INVOICE });
  assert.deepEqual(await (await returnStatus(obOf(fake({ "checkout/payment-status": [status("expired")] })))).json(), { state: "expired", pay_url: "" });
  assert.deepEqual(await (await returnStatus(obOf(fake({}), { token: "" }))).json(), { state: "none" });
  const down = await returnStatus(obOf(fake({ "checkout/payment-status": [{ status: 500, body: {} }] })));
  assert.equal(down.status, 503);
});

const PANEL = (over: Partial<MemberPack>): string => {
  const pack: MemberPack = {
    order_number: "SP-1", payment_status: "awaiting_xendit", payment_label: "Waiting for payment", method_label: "Pay online (Xendit)",
    price_centavos: 148800, tone: "wait", benefits_off: true, pay_url: "", lock: null, proofs: [], ...over,
  };
  const h: HomePanels = { pack, registration: null, mobile: { pending: false, mobile: "", locked: false, code_sent_to: "", resend_in: 0, attempts_left: 5 } };
  return homePanels(h).value;
};

test("Home: awaiting Xendit with an invoice, without one, mismatch and expired", () => {
  const wait = PANEL({ pay_url: INVOICE });
  assert.ok(wait.includes("Waiting for payment") && wait.includes("Pay online (Xendit) · ₱1,488.00") && wait.includes("Finish your payment to turn on your membership benefits."));
  assert.ok(wait.includes(`href="${INVOICE}"`) && wait.includes("Continue to payment") && !wait.includes("Ships after the store verifies"));
  const failed = PANEL({});
  assert.ok(failed.includes("Payment is not available right now.") && failed.includes("Your order is saved. Try again to open the payment page.") && failed.includes('href="/funnel/membership-pack/checkout/return/">Try again'));
  const mismatch = PANEL({ payment_status: "xendit_mismatch", payment_label: "Under review", tone: "rev" });
  assert.ok(mismatch.includes("The payment we received does not match ₱1,488.00. The store is checking it and will contact you.") && !mismatch.includes("Continue to payment"));
  const expired = PANEL({ payment_status: "xendit_expired", payment_label: "Payment not completed", tone: "no" });
  assert.ok(expired.includes("This order was not paid. Start a new order to turn on your membership benefits.") && expired.includes('href="/funnel/membership-pack/checkout/">Try again'));
});
