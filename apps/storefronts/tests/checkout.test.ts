import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkoutGet, checkoutPost, fullName, localMobile, type Flow } from "../src/lib/checkout-flow.ts";
import type { Pack } from "../src/lib/django.ts";
import { checkoutDocument, checkoutModel, longDate } from "../src/views/sante/pack-checkout.ts";
import { packContext } from "../src/views/sante/pack-page.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const PUBLIC = path.join(import.meta.dirname, "..", "public");

const BANK = { id: "acct_1", kind: "bank", account_type: "savings", provider_name: "BDO", account_name: "Demo Store", account_number: "0012 3456", account_number_last4: "3456", has_qr: true };
const WALLET = { id: "acct_2", kind: "ewallet", account_type: "ewallet", provider_name: "GCash", account_name: "Demo", account_number: "0917", account_number_last4: "0917", has_qr: false };
const PACK: Pack = {
  price_centavos: 148800, currency: "PHP", available: true,
  agreement: { id: 7, label: "v1.0", effective_date: "2026-11-03" }, payment_accounts: [BANK],
};

type Reply = { status: number; body: unknown };
type Call = { path: string; body: Record<string, unknown> | FormData };

/** A fake Django: one reply per route, in the order the page asks. */
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

function flowOf(f: ReturnType<typeof fake>, over: Partial<Flow> = {}, url = "http://www.santetest.com/funnel/membership-pack/checkout/"): Flow {
  return {
    site: SITE, pack: PACK, host: "demo.negosyotest.com", visitor_ip: "", token: "", request: new Request(url),
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} }, now: new Date("2026-11-12T00:00:00Z"), ...over,
  };
}

const TOKEN = "T".repeat(43);
const ok = (body: unknown): Reply => ({ status: 200, body });
const err = (status: number, code: string, message: string, fields?: Record<string, string[]>): Reply => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });

const POSTED = {
  action: "contact", submit_key: "k".repeat(16), first_name: "Juan", last_name: "Dela Cruz", mobile: "917 123 4567", email: "juan@example.com",
  pay_method: "direct", agreement_accept: "1", agreement_version_id: "7", enrollment_authorized: "1", agree: "1",
  account_id: "acct_1", sender_bank: "BDO", reference_number: "123", sender_first_name: "Juan", sender_last_name: "dela Cruz",
  sender_account_number: "999", amount_sent: "1,488.00", transferred_at: "2026-11-11T10:00",
};
const PROOF = () => new File([new Uint8Array(10)], "receipt.png", { type: "image/png" });

async function body(r: Response): Promise<string> {
  return r.text();
}

test("the checkout page: TWCinc's field names, ticks, button and words", () => {
  const c = packContext(SITE, PACK, new Date("2026-11-12T00:00:00Z"));
  const page = checkoutDocument(c, checkoutModel({ accounts: [BANK, WALLET], agreement: PACK.agreement })).value;
  for (const name of ["first_name", "last_name", "mobile", "email", "pay_method", "agreement_accept", "agreement_version_id", "enrollment_authorized", "agree",
    "account_id", "sender_bank", "reference_number", "sender_first_name", "sender_last_name", "sender_account_number", "amount_sent", "transferred_at", "proof", "submit_key", "action"]) {
    assert.ok(page.includes(`name="${name}"`), name);
  }
  for (const text of ["Customer Information", "Select Payment Method", "Bank or e-wallet transfer", "Send ₱1,488.00 to one of the store's accounts, then upload your proof.",
    "Place Order &mdash; ₱1,488.00", "Account You Paid To *", "Upload the Payment Receipt *", "Time of Transfer *", "Read the privacy notice", "Order Summary",
    "Santé International Membership Terms &amp; Conditions", "Version v1.0 &middot; Effective November 3, 2026", "Agree &amp; Continue", "Send exactly ₱1,488.00 to this account"]) {
    assert.ok(page.includes(text), text);
  }
  assert.ok(page.includes("up to 4 MB."), "the receipt hint says the cap the API enforces");
  assert.ok(!page.includes("10 MB") && !/xendit/i.test(page), "no TWCinc 10 MB line, no Xendit");
});

test("no inline script, and no private-media address: scripts are files, QR codes are this host's", () => {
  const c = packContext(SITE, PACK, new Date("2026-11-12T00:00:00Z"));
  const page = checkoutDocument(c, checkoutModel({ accounts: [BANK], agreement: PACK.agreement })).value;
  for (const tag of page.matchAll(/<script\b[^>]*>/g)) assert.match(tag[0], /\bsrc="/, tag[0]);
  assert.ok(page.includes('src="/funnel/membership-pack/checkout/qr/acct_1/"'));
  assert.ok(!/https?:\/\/(?!fonts\.g)/.test(page.replace(/https?:\/\/www\.w3\.org[^"]*/g, "")), "no outside address on the page");
  const script = readFileSync(path.join(PUBLIC, "assets/sante/js/pack-checkout.js"), "utf8");
  assert.ok(!/\{\{|\{%/.test(script), "no template tag left in the script");
  for (const file of ["js/pack-select.js", "js/pack-agreement-popup.js", "js/pack-checkout.js"]) assert.ok(existsSync(path.join(PUBLIC, "assets/sante", file)), file);
  for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs", "wasm/qcms_bg.wasm", "standard_fonts/FoxitSymbol.pfb", "cmaps/H.bcmap", "iccs/CGATS001Compat-v2-micro.icc"]) {
    assert.ok(existsSync(path.join(PUBLIC, "agreement-viewer", file)), file);
  }
});

test("errors render under their field with TWCinc's markup; the receipt is asked for again", () => {
  const c = packContext(SITE, PACK, new Date("2026-11-12T00:00:00Z"));
  const m = checkoutModel({
    accounts: [BANK, WALLET], agreement: PACK.agreement, error_code: "invalid_proof", error_message: "Check the highlighted fields.",
    field_errors: { mobile: "That number is in use.", sender_bank: "Enter the sender bank.", proof: "Attach the file.", account_id: "Choose the account you paid to." },
    posted: { first_name: "Juan", sender_bank: "BD<O>", transferred_at: "2026-11-11T10:00" },
  });
  const page = checkoutDocument(c, m).value;
  assert.ok(page.includes('<p class="pp-co-error">That number is in use.</p>'));
  assert.ok(page.includes('id="sender_bank-msg">Enter the sender bank.</p>'));
  assert.ok(page.includes('id="proof-msg">Attach the file.</p>') && page.includes('class="file bad"'));
  assert.ok(page.includes('id="account_id-msg">Choose the account you paid to.</p>'));
  assert.ok(page.includes("BD&lt;O&gt;"), "a typed value is escaped");
  assert.ok(!page.includes("BD<O>"));
  assert.ok(!page.includes("pp-co-banner is-error"), "with field messages there is no banner, as TWCinc");
  assert.ok(page.includes('data-posted="2026-11-11T10:00"'));
});

test("longDate is django's F j, Y; mobile and name read as TWCinc reads them", () => {
  assert.equal(longDate("2026-11-03"), "November 3, 2026");
  assert.equal(localMobile("917 123 4567"), "09171234567");
  assert.equal(localMobile("0917 123 4567"), "0917 123 4567");
  assert.equal(fullName(" Juan ", "Dela Cruz"), "Juan Dela Cruz");
  assert.equal(fullName("Juan", ""), "Juan");
});

test("GET with no cookie is the contact step and asks Django nothing", async () => {
  const f = fake({});
  const r = await checkoutGet(flowOf(f));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.ok((await body(r)).includes('id="contact-form"'));
  assert.equal(f.calls.length, 0);
});

test("GET with a pack that is not available is the landing page with its message", async () => {
  const f = fake({});
  const r = await checkoutGet(flowOf(f, { pack: { ...PACK, available: false } }));
  assert.ok(!(await body(r)).includes('id="contact-form"'));
});

test("GET with a token reads its state: a returning buyer sees the code step, a verified one the payment step, a gone one starts again", async () => {
  const code = fake({ "checkout/state": [ok({ needs_code: true, mobile: "09171234567", verified: false, expires_at: "x" })] });
  const a = await body(await checkoutGet(flowOf(code, { token: TOKEN })));
  assert.ok(a.includes("We text the 6-digit code to 09171234567.") && a.includes('name="code"'));
  const paid = fake({ "checkout/state": [ok({ needs_code: true, mobile: "0917", verified: true, expires_at: "x" })] });
  const b = await body(await checkoutGet(flowOf(paid, { token: TOKEN })));
  assert.ok(b.includes('id="place-form"') && b.includes('name="action" value="place"') && b.includes("Place order"));
  const gone = fake({ "checkout/state": [err(409, "checkout_expired", "This checkout has expired. Please start again.")] });
  const r = await checkoutGet(flowOf(gone, { token: TOKEN }));
  assert.ok((await body(r)).includes('id="contact-form"'));
  assert.match(r.headers.get("set-cookie") ?? "", /^no_checkout=; .*Max-Age=0/);
});

test("a new buyer's contact post: contact, state, then one multipart place with the file; cookie set; to onboarding", async () => {
  const f = fake({
    "checkout/contact": [ok({ token: TOKEN, expires_at: "x" })],
    "checkout/state": [ok({ needs_code: false, mobile: "09171234567", verified: false, expires_at: "x" })],
    "checkout/place": [ok({ order_number: "PK-1", replay: false })],
  });
  const r = await checkoutPost(flowOf(f, { visitor_ip: "203.0.113.9" }), POSTED, PROOF());
  assert.equal(r?.status, 303);
  assert.equal(r?.headers.get("location"), "/funnel/membership-pack/onboarding/");
  assert.match(r?.headers.get("set-cookie") ?? "", new RegExp(`^no_checkout=${TOKEN}; Path=/; Max-Age=7200; HttpOnly; SameSite=Lax$`));
  const [contact, , place] = f.calls;
  assert.deepEqual(contact.body, {
    host: "demo.negosyotest.com", visitor_ip: "203.0.113.9", token: "", full_name: "Juan Dela Cruz", mobile: "09171234567", email: "juan@example.com",
    agreement_version_id: "7", agreement_accept: "1", enrollment_authorized: "1",
  });
  const form = place.body as FormData;
  for (const [k, v] of Object.entries({ host: "demo.negosyotest.com", token: TOKEN, submit_key: POSTED.submit_key, account_id: "acct_1", sender_bank: "BDO", reference_number: "123",
    sender_first_name: "Juan", sender_last_name: "dela Cruz", sender_account_number: "999", amount_sent: "1,488.00", transferred_at: "2026-11-11T10:00" })) {
    assert.equal(form.get(k), v, k);
  }
  assert.ok(form.get("proof") instanceof File);
});

test("a returning buyer's contact post stops at the code step, sends the code, and keeps the cookie", async () => {
  const f = fake({
    "checkout/contact": [ok({ token: "", expires_at: "x" })],
    "checkout/state": [ok({ needs_code: true, mobile: "09171234567", verified: false, expires_at: "x" })],
    "checkout/code/send": [ok({ status: "sent" })],
  });
  const r = await checkoutPost(flowOf(f, { token: TOKEN }), POSTED, PROOF());
  assert.equal(r?.status, 200);
  assert.ok((await body(r!)).includes("We text the 6-digit code to 09171234567."));
  assert.match(r?.headers.get("set-cookie") ?? "", new RegExp(`^no_checkout=${TOKEN};`));
  assert.deepEqual(f.calls.map((c) => c.path), ["checkout/contact", "checkout/state", "checkout/code/send"]);
});

test("a refused contact stays on the contact step with its field messages and the typed values; a limit keeps its 429", async () => {
  const f = fake({ "checkout/contact": [err(422, "invalid_contact", "Check the highlighted fields.", { email: ["This email is already registered."] })] });
  const r = await checkoutPost(flowOf(f), POSTED, PROOF());
  const page = await body(r!);
  assert.equal(r?.status, 200);
  assert.ok(page.includes("This email is already registered.") && page.includes('value="Juan"') && page.includes('value="9171234567"'));
  assert.ok(page.includes('value="1"') && page.includes("data-held"), "the buyer's agreement tick survives a refused post");
  assert.equal(r?.headers.get("set-cookie"), null);
  const limited = fake({ "checkout/contact": [err(429, "rate_limited", "Too many attempts. Please try again later.")] });
  assert.equal((await checkoutPost(flowOf(limited), POSTED, PROOF()))?.status, 429);
});

test("the Website Terms tick is asked for before Django is", async () => {
  const f = fake({});
  const r = await checkoutPost(flowOf(f), { ...POSTED, agree: "" }, PROOF());
  assert.ok((await body(r!)).includes('<p class="pp-co-error" id="agree-msg">Please agree to the Website Terms &amp; Conditions to continue.</p>'));
  assert.equal(f.calls.length, 0);
});

test("a refused place shows its field messages on the transfer sheet, and asks for the receipt again; the cookie survives", async () => {
  const f = fake({
    "checkout/contact": [ok({ token: TOKEN, expires_at: "x" })],
    "checkout/state": [ok({ needs_code: false, mobile: "0917", verified: false, expires_at: "x" })],
    "checkout/place": [err(422, "invalid_proof", "Check the highlighted fields.", { proof: ["Upload a JPEG, PNG, WebP or PDF file."], amount_sent: ["Enter the amount you sent."] })],
  });
  const r = await checkoutPost(flowOf(f), POSTED, PROOF());
  const page = await body(r!);
  assert.equal(r?.status, 200);
  assert.ok(page.includes("Upload a JPEG, PNG, WebP or PDF file.") && page.includes("Enter the amount you sent.") && page.includes("Please choose your receipt again.") === false);
  assert.ok(page.includes('id="contact-form"'));
  assert.match(r?.headers.get("set-cookie") ?? "", new RegExp(`^no_checkout=${TOKEN};`));
});

test("a proof over 4 MB never leaves this server: the page names the limit under the file", async () => {
  const f = fake({
    "checkout/contact": [ok({ token: TOKEN, expires_at: "x" })],
    "checkout/state": [ok({ needs_code: false, mobile: "0917", verified: false, expires_at: "x" })],
  });
  const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
  const r = await checkoutPost(flowOf(f), POSTED, big);
  assert.ok((await body(r!)).includes("The file is too large. The limit is 4 MB."));
  assert.ok(!f.calls.some((c) => c.path === "checkout/place"));
  const exact = fake({
    "checkout/contact": [ok({ token: TOKEN, expires_at: "x" })],
    "checkout/state": [ok({ needs_code: false, mobile: "0917", verified: false, expires_at: "x" })],
    "checkout/place": [ok({ order_number: "PK-2", replay: false })],
  });
  const at = new File([new Uint8Array(4 * 1024 * 1024)], "ok.png", { type: "image/png" });
  assert.equal((await checkoutPost(flowOf(exact), POSTED, at))?.status, 303);
});

test("verify: a good code goes to the payment step, a bad one stays with its message; place from there", async () => {
  const good = fake({
    "checkout/code/verify": [ok({ status: "verified" })],
    "checkout/state": [ok({ needs_code: true, mobile: "0917", verified: true, expires_at: "x" })],
  });
  const a = await checkoutPost(flowOf(good, { token: TOKEN }), { action: "verify", code: " 123456 " }, null);
  assert.ok((await body(a!)).includes('id="place-form"'));
  assert.equal((good.calls[0].body as Record<string, unknown>).code, "123456");
  const bad = fake({
    "checkout/code/verify": [err(400, "invalid_code", "That code is not right.", { code: ["That code is not right."] })],
    "checkout/state": [ok({ needs_code: true, mobile: "0917", verified: false, expires_at: "x" })],
  });
  const b = await body((await checkoutPost(flowOf(bad, { token: TOKEN }), { action: "verify", code: "000000" }, null))!);
  assert.ok(b.includes('id="code-msg">That code is not right.</p>'));
  const placed = fake({ "checkout/place": [ok({ order_number: "PK-3", replay: true })] });
  const c = await checkoutPost(flowOf(placed, { token: TOKEN }), { action: "place", submit_key: "k".repeat(16), account_id: "acct_1" }, PROOF());
  assert.equal(c?.status, 303);
});

test("a post with no checkout cookie, other than the contact post, starts again with TWCinc's words", async () => {
  const f = fake({});
  const r = await checkoutPost(flowOf(f), { action: "place" }, null);
  assert.ok((await body(r!)).includes("This checkout has expired. Please start again."));
  assert.equal(f.calls.length, 0);
});

test("an unknown action is nothing (the route answers the neutral 404); an unavailable pack answers the landing", async () => {
  const f = fake({});
  assert.equal(await checkoutPost(flowOf(f, { token: TOKEN }), { action: "frobnicate" }, null), null);
  const off = await checkoutPost(flowOf(f, { pack: { ...PACK, available: false } }), POSTED, PROOF());
  assert.ok(!(await body(off!)).includes('id="contact-form"'));
});

test("the receipt's mobile_not_verified sends a returning buyer to the code step", async () => {
  const f = fake({
    "checkout/place": [err(409, "mobile_not_verified", "Verify your mobile number first.")],
    "checkout/state": [ok({ needs_code: true, mobile: "09171234567", verified: false, expires_at: "x" })],
  });
  const r = await checkoutPost(flowOf(f, { token: TOKEN }), { action: "place", submit_key: "k".repeat(16) }, PROOF());
  const page = await body(r!);
  assert.ok(page.includes("Confirm Your Mobile Number") && page.includes("Verify your mobile number first."));
});
