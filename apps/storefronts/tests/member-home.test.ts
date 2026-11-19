/* The customer-first member Home, My Membership, Help and the My Purchases list (ClickUp z8uq9mgmjg). */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { homePage, helpPage, membershipPage, purchasesPage, type Dash } from "../src/lib/dashboard-flow.ts";
import { lastUpdated, pickOrder, stateOf, termsHref } from "../src/views/sante/member-home.ts";
import type { OrderCard } from "../src/lib/pack-api.ts";
import { FILLED, SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret, hostAliases: {} } as unknown as import("../src/lib/env.ts").StorefrontEnv;
const TOKEN = "M".repeat(43);

type Reply = { status: number; body: unknown };
function fake(replies: Record<string, Reply[]>) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\/(\?.*)?$/, "");
    calls.push({ path: route, body: init.body === undefined ? {} : JSON.parse(String(init.body)) });
    const next = (replies[route] ?? []).shift();
    if (!next) throw new Error(`unexpected call: ${route}`);
    return Promise.resolve(Response.json(next.body, { status: next.status }));
  };
  return { calls, fetchImpl };
}
function dashOf(f: ReturnType<typeof fake>, over: Partial<Dash> = {}): Dash {
  const request = new Request("http://www.santetest.com/dashboard/");
  return {
    site: SITE, now: new Date("2026-11-19T00:00:00Z"), appUrl: "",
    call: { request, host: "demo.negosyotest.com", visitor_ip: "", member_token: TOKEN, binding: "", env },
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} },
    ...over,
  };
}
const ok = (body: unknown): Reply => ({ status: 200, body });
const err = (status: number): Reply => ({ status, body: { error: { code: "x", message: "x" } } });
const ME = ok({ member: { id: "m1", full_name: "Juan Dela Cruz", email: "j@example.test", mobile: "+639171234567", email_verified: true, mobile_verified: true } });
const NOTICES = ok({ notices: [] });
const PACK_AGREEMENT = ok({ price_centavos: 148800, currency: "PHP", available: true, agreement: { id: 7, label: "v1", effective_date: "2026-11-01" }, payment_accounts: [] });
const BLOB = "https://abc123.public.blob.vercel-storage.com/products/a.png";

const STEPS = (done: number, dates: string[] = []) => ["Placed", "Verified", "Shipped", "Delivered"].map((label, i) => ({
  num: i + 1, label, state: i < done ? "done" : i === done ? "current" : "todo", date: i < done ? dates[i] ?? null : null,
}));
function card(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    order_number: "SP-1001", created_at: "2026-11-17T02:00:00Z", total_text: "1,488.00", total_centavos: 148800, payment_status: "verified", payment_label: "Bank transfer",
    chip_label: "Preparing your order", chip_class: "", problem: false, problem_line: "", awaiting_payment: false, under_review: false,
    steps: STEPS(2, ["2026-11-17", "2026-11-18"]), courier: "", tracking: "", note: "", shipping_label: "FREE", headline: "Santé Barley 10's with Stevia x 2 boxes",
    item_count: 1, item_lines: [{ qty: 1, name: "Membership Package" }], address: "1 Main St, Brgy One, Manila, Metro Manila 1000", receiver_name: "Juan Dela Cruz", receiver_mobile: "+639171234567",
    membership: { label: "Registration pending", line: "Add your details.", tone: "wait", registered: false, sante_member_id: "", act: false }, ...over,
  };
}
const PRODUCT = (n: number, over: Record<string, unknown> = {}) => ({
  id: `p${n}`, code: `barley-${n}`, name: `Barley ${n}`, category: "barley", short_description: "A short description.", long_description: "", image_url: BLOB, srp_centavos: 150000 + n,
  unit_members_price_centavos: 90000, revision: 1, features: "", specifications: "", advantages: "", benefits: "", image_urls: [], servings_per_pack: 10, ...over,
});
const FREE = ok({ pack: null, registration: null });

type Opts = { cards?: Reply; notices?: Reply; catalog?: Reply; pack?: Reply; agreement?: Reply };
const replies = (o: Opts = {}) => ({
  "member/me": [ME], "member/pack": [o.pack ?? FREE], "member/orders": [o.cards ?? ok({ cards: [] })], "member/notices": [o.notices ?? NOTICES],
  "catalog/products": [o.catalog ?? ok({ products: [] })], pack: [o.agreement ?? PACK_AGREEMENT],
});
const cardsOf = (...c: Record<string, unknown>[]) => ok({ cards: c });
async function home(o: Opts = {}, d: Partial<Dash> = {}): Promise<string> {
  const r = await homePage(dashOf(fake(replies(o)), d));
  assert.equal(r.status, 200);
  return r.text();
}
const lineOf = (body: string, key: string) => {
  const at = body.indexOf(`data-mh-line="${key}"`);
  return at < 0 ? "" : body.slice(at, body.indexOf("</li>", at));
};

/* ---- no purchase CTA, no Packed, no funnel ---------------------------------------------------------------------- */

test("no state of the Home offers a cart, Buy Now, Add to Cart, Buy Again, checkout, a Packed step or the membership funnel", async () => {
  const states: Opts[] = [
    { cards: cardsOf(card()), catalog: ok({ products: [PRODUCT(1), PRODUCT(2)] }) },
    { cards: cardsOf(card({ steps: STEPS(4, ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]) })), catalog: ok({ products: [PRODUCT(1)] }) },
    { cards: cardsOf(card({ payment_status: "rejected", problem: true })) },
    { cards: err(500) },
    {},
  ];
  for (const s of states) {
    const body = await home(s, { appUrl: "https://app.example.test/get" });
    assert.doesNotMatch(body, /Buy Now|Add to Cart|Buy Again|Checkout|Packed|\/cart\/|name="action" value="add"/i);
    assert.doesNotMatch(body.replaceAll("/funnel/membership-pack/membership-terms.pdf", ""), /\/membership-pack\//);
    assert.doesNotMatch(body, /Signed in as|<h1>Dashboard<\/h1>/);
  }
});

/* ---- which order the card shows ------------------------------------------------------------------------------- */

test("state selection: a purchase needing action, else an active undelivered one, else the latest", () => {
  const parse = (o: Record<string, unknown>) => o as unknown as OrderCard;
  const delivered = parse(card({ order_number: "D", created_at: "2026-11-10T00:00:00Z", steps: STEPS(4, ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]) }));
  const delivered2 = parse(card({ order_number: "D2", created_at: "2026-11-12T00:00:00Z", steps: STEPS(4, ["2026-11-12", "2026-11-12", "2026-11-12", "2026-11-14"]) }));
  const active = parse(card({ order_number: "A", created_at: "2026-11-11T00:00:00Z" }));
  const action = parse(card({ order_number: "X", created_at: "2026-11-01T00:00:00Z", payment_status: "rejected", problem: true }));
  assert.equal(pickOrder([delivered, active, action])!.card.order_number, "X");
  assert.equal(pickOrder([delivered, active])!.card.order_number, "A");
  assert.equal(pickOrder([delivered, delivered2])!.card.order_number, "D2"); // the latest completed
  assert.equal(pickOrder([]), null);
  assert.equal(stateOf(delivered), "delivered");
  assert.equal(stateOf(active), "active");
  assert.equal(stateOf(parse(card({ payment_status: "pending_review" }))), "review");
  assert.equal(stateOf(parse(card({ payment_status: "awaiting_xendit" }))), "action");
  assert.equal(stateOf(parse(card({ membership: { label: "x", line: "x", registered: false, sante_member_id: "", act: true } }))), "action"); // registration details to send
  assert.equal(stateOf(parse(card({ payment_status: "bank_pending" }))), "unknown");
});

test("with several purchases the Home shows the one needing action and links to all of them", async () => {
  const body = await home({ cards: cardsOf(card({ order_number: "NEW-OK", created_at: "2026-11-18T00:00:00Z" }), card({ order_number: "OLD-BAD", created_at: "2026-11-10T00:00:00Z", payment_status: "rejected", problem: true })) });
  assert.match(body, /data-mh-state="action"/);
  assert.match(body, /OLD-BAD/);
  assert.doesNotMatch(body, /NEW-OK/);
  assert.match(body, /All my purchases \(2\)/);
  assert.match(body, /href="\/dashboard\/purchases\/#order-OLD-BAD"/);
});

test("last updated is the latest dated step, or the placed date", () => {
  assert.equal(lastUpdated(card() as unknown as OrderCard), "Nov 18, 2026");
  assert.equal(lastUpdated(card({ steps: STEPS(1, ["2026-11-17"]) }) as unknown as OrderCard), "Nov 17, 2026");
  assert.equal(lastUpdated(card({ steps: [] }) as unknown as OrderCard), "Nov 17, 2026");
});

/* ---- payment states, each its own line --------------------------------------------------------------------------- */

test("each payment state says what it is and the next supported action, apart from shipment and registration", async () => {
  const cases: [string, RegExp, RegExp | null][] = [
    ["verified", /Payment confirmed/, null],
    ["pending_review", /Payment under review[^]*Sending proof is not payment confirmation/, null],
    ["awaiting_xendit", /Waiting for your payment/, /href="\/dashboard\/purchases\/">Complete my payment/],
    ["xendit_expired", /Payment link expired/, /href="\/dashboard\/purchases\/">See what to do next/],
    ["xendit_mismatch", /Payment needs attention/, /href="\/dashboard\/help\/#order">Get help with my order/],
    ["rejected", /Payment needs attention/, /href="\/dashboard\/purchases\/">Send new proof of payment/],
  ];
  for (const [status, title, cta] of cases) {
    const body = await home({ cards: cardsOf(card({ payment_status: status, problem: ["rejected", "xendit_expired", "xendit_mismatch"].includes(status) })) });
    const pay = lineOf(body, "payment");
    assert.match(pay, title, status);
    if (cta) assert.match(pay, cta, status);
    assert.ok(lineOf(body, "shipment") && lineOf(body, "registration"), status); // three separate lines
    if (status !== "verified") {
      assert.match(lineOf(body, "shipment"), /Not started/, status);
      assert.match(lineOf(body, "registration"), /Not started/, status);
    }
  }
});

test("payment confirmed never implies registration or delivery is complete", async () => {
  const body = await home({ cards: cardsOf(card()) });
  assert.match(lineOf(body, "payment"), /Payment confirmed/);
  assert.match(lineOf(body, "shipment"), /Being prepared/);
  assert.doesNotMatch(lineOf(body, "shipment"), /Delivered|Shipped/);
  assert.match(lineOf(body, "registration"), /Registration pending/);
  assert.match(body, /Amount paid/);
  assert.match(body, /Last updated Nov 18, 2026/);
  assert.match(body, /Thank you for purchasing your membership package/);
});

test("an unpaid order shows its total, not an amount paid", async () => {
  const body = await home({ cards: cardsOf(card({ payment_status: "pending_review", under_review: true, membership: null })) });
  assert.match(body, /Order total/);
  assert.doesNotMatch(body, /Amount paid|Thank you for purchasing/);
});

test("an unknown payment status gets a neutral state, never a success", async () => {
  const body = await home({ cards: cardsOf(card({ payment_status: "bank_pending", chip_label: "Bank pending" })) });
  assert.match(body, /data-mh-state="unknown"/);
  assert.match(lineOf(body, "payment"), /We(?:'|&#x27;)re checking your order/);
  assert.match(lineOf(body, "payment"), /href="\/dashboard\/help\/#order"/);
  assert.doesNotMatch(body, /Payment confirmed|Thank you for purchasing/);
  assert.match(lineOf(body, "shipment"), /Updates will appear here/);
});

test("the member pack read with a status the Home does not know does not break the Home", async () => {
  const body = await home({ pack: ok({ pack: { order_number: "SP-1", payment_status: "bank_pending", payment_label: "x", method_label: "x", price_centavos: 1, tone: "x", benefits_off: false, lock: null, proofs: [] }, registration: null }), cards: cardsOf(card({ payment_status: "bank_pending" })) });
  assert.match(body, /We(?:'|&#x27;)re checking your order/);
});

/* ---- registration ------------------------------------------------------------------------------------------------ */

test("registration pending and registered: the official member ID shows only once issued", async () => {
  const pending = await home({ cards: cardsOf(card()), pack: ok({ pack: null, registration: { status: "details_needed", label: "Details needed", line: "Add your details.", tone: "wait", details_form: true, details_erased: false, state_version: "1", sante_member_id: "" } }) });
  assert.match(pending, /Details needed/);
  assert.doesNotMatch(pending, /Official Sant(é|&eacute;) Member ID <strong>/);
  assert.match(pending, /appears here once your registration is complete/);
  const done = await home({ cards: cardsOf(card({ membership: { label: "Registered", line: "You're registered.", tone: "ok", registered: true, sante_member_id: "SF-00123", act: false } })), pack: ok({ pack: null, registration: { status: "registered", label: "Registered", line: "You're registered.", tone: "ok", details_form: false, details_erased: false, state_version: "2", sante_member_id: "SF-00123" } }) });
  assert.match(done, /Official Sant(é|&eacute;) Member ID <strong>SF-00123<\/strong>/);
  const wrong = await home({ cards: cardsOf(card({ membership: { label: "Registered", line: "x", tone: "ok", registered: false, sante_member_id: "SF-9", act: false } })) });
  assert.doesNotMatch(wrong, /SF-9/);
});

test("a registration that needs the member's details links to My Purchases, where the form is", async () => {
  const body = await home({ cards: cardsOf(card({ membership: { label: "Details needed", line: "Add your details.", tone: "wait", registered: false, sante_member_id: "", act: true } })) });
  assert.match(body, /data-mh-state="action"/);
  assert.match(lineOf(body, "registration"), /href="\/dashboard\/purchases\/">Complete my registration/);
});

/* ---- shipment ---------------------------------------------------------------------------------------------------- */

test("a shipped order shows the courier, a copyable tracking number and the shipped date, and no ETA", async () => {
  const body = await home({ cards: cardsOf(card({ steps: STEPS(3, ["2026-11-17", "2026-11-18", "2026-11-19"]), courier: "J&T Express", tracking: "JT123456789", chip_label: "Shipped" })) });
  const ship = lineOf(body, "shipment");
  assert.match(ship, /Shipped/);
  assert.match(ship, /J&amp;T Express/);
  assert.match(ship, /data-mh-copy="JT123456789"/);
  assert.match(ship, /Shipped on<\/dt><dd>Nov 19, 2026/);
  assert.doesNotMatch(ship, /ETA|estimated|arrives/i);
  assert.match(body, /js\/pack-member-home\.js/);
});

test("a shipped order without a tracking number says it will appear once provided", async () => {
  const body = await home({ cards: cardsOf(card({ steps: STEPS(3, ["2026-11-17", "2026-11-18", "2026-11-19"]), courier: "LBC" })) });
  assert.match(lineOf(body, "shipment"), /Tracking will appear once the store provides it/);
  assert.doesNotMatch(body, /data-mh-copy/);
});

test("a delivered order is a compact card, with membership use and product guidance above the products", async () => {
  const body = await home({ cards: cardsOf(card({ steps: STEPS(4, ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]), chip_label: "Delivered" })), catalog: ok({ products: [PRODUCT(1)] }) });
  assert.match(body, /data-mh-state="delivered"/);
  assert.match(body, /was delivered on Nov 20, 2026/);
  assert.match(body, /View My Order/);
  assert.doesNotMatch(body, /mh-lines/);
  assert.ok(body.indexOf('id="mh-start"') < body.indexOf('id="mh-explore"'));
  const before = await home({ cards: cardsOf(card()), catalog: ok({ products: [PRODUCT(1)] }) });
  assert.ok(before.indexOf('id="mh-order"') < before.indexOf('id="mh-member"') && before.indexOf('id="mh-explore"') < before.indexOf('id="mh-start"'));
});

/* ---- no order, failure ------------------------------------------------------------------------------------------- */

test("no purchase: an honest state with support, no prompt to buy, benefits and products still first", async () => {
  const body = await home({ catalog: ok({ products: [PRODUCT(1)] }) });
  assert.match(body, /data-mh-state="none"/);
  assert.match(body, /no membership package purchase on this account/);
  assert.match(body, /href="\/dashboard\/help\/#order"/);
  assert.doesNotMatch(body, /Get 2 Boxes|Unlock|Buy/);
  assert.match(body, /Your Membership Benefits/);
});

test("a failed order read says so with Retry, My Purchases and Help; it is not shown as no purchase", async () => {
  for (const reply of [err(500), err(503)]) {
    const body = await home({ cards: reply });
    assert.match(body, /data-mh-state="error"/);
    assert.match(body, /We couldn&#x27;t load your order update/);
    assert.match(body, /data-mh-retry/);
    assert.match(body, /href="\/dashboard\/purchases\/">My Purchases/);
    assert.match(body, /href="\/dashboard\/help\/">Help/);
    assert.doesNotMatch(body, /no membership package purchase|Payment confirmed/);
    assert.match(body, /id="mh-help"/); // support stays reachable
  }
});

test("a dead session on the order read signs the member out; a rejected order still goes to My Purchases", async () => {
  const dead = await homePage(dashOf(fake(replies({ cards: err(401) }))));
  assert.equal(dead.headers.get("location"), "/");
  const lock = ok({ pack: { order_number: "SP-1", payment_status: "rejected", payment_label: "x", method_label: "x", price_centavos: 1, tone: "att", benefits_off: true, proofs: [], lock: { reason_label: "x", other_text: "", resubmitted: false, accounts: [] } }, registration: null });
  assert.equal((await homePage(dashOf(fake(replies({ pack: lock }))))).headers.get("location"), "/dashboard/purchases/");
});

/* ---- products, app link, help ------------------------------------------------------------------------------------ */

test("Explore Santé products: up to four with real data, member prices left to the app, Explore All Products", async () => {
  const body = await home({ catalog: ok({ products: [1, 2, 3, 4, 5].map((n) => PRODUCT(n)) }), cards: cardsOf(card()) });
  assert.equal(body.split("data-mh-product=").length - 1, 4);
  assert.match(body, /Barley 1/);
  assert.doesNotMatch(body, /Barley 5/);
  assert.match(body, /10 servings per pack/);
  assert.match(body, /Check member prices in the Sant(é|&eacute;) Mobile App/);
  assert.doesNotMatch(body, /Members price|Members save|\d+% off/i);
  assert.match(body, /href="\/products\/">Explore All Products/);
  assert.match(body, />View Product</);
});

test("missing images, prices and short descriptions leave the tile truthful; no invented value", async () => {
  const body = await home({ catalog: ok({ products: [PRODUCT(1, { image_url: "", srp_centavos: 0, short_description: "", servings_per_pack: null })] }) });
  assert.match(body, /product-img-placeholder/);
  assert.doesNotMatch(body, /mh-prod-price|mh-prod-desc|mh-prod-pack|₱0/);
});

test("an empty or unreadable catalog is a compact app-guidance state, not placeholder products", async () => {
  for (const catalog of [ok({ products: [] }), err(500)]) {
    const body = await home({ catalog });
    assert.match(body, /data-mh-empty="products"/);
    assert.match(body, /Members order in the Sant(é|&eacute;) Mobile App/);
    assert.equal(body.split("data-mh-product=").length - 1, 0);
  }
});

test("the app button shows only when the link is configured; otherwise an honest ask-us line", async () => {
  const set = await home({}, { appUrl: "https://apps.example.test/get" });
  assert.match(set, /href="https:\/\/apps\.example\.test\/get"[^>]*>Open Sant(é|&eacute;) Mobile App/);
  const none = await home({});
  assert.doesNotMatch(none, /Open Sant(é|&eacute;) Mobile App/);
  assert.match(none, /Ask us for the Sant(é|&eacute;) Mobile App link/);
});

test("the Membership Terms link is the central agreement PDF of the current version, and absent when unknown", async () => {
  assert.equal(termsHref(7), "/funnel/membership-pack/membership-terms.pdf?v=7");
  assert.equal(termsHref(null), "");
  const body = await home({});
  assert.match(body, /href="\/funnel\/membership-pack\/membership-terms\.pdf\?v=7"[^>]*>View Membership Terms/);
  const unknown = await home({ agreement: err(500) });
  assert.doesNotMatch(unknown, /View Membership Terms/);
  assert.doesNotMatch(unknown, /membership-terms\.pdf/);
});

test("the approved membership statements are quoted unchanged, with no invented percentage", async () => {
  const page = await home({ cards: cardsOf(card()) });
  const body = page.slice(page.indexOf('id="pp-dash-home"'));
  assert.match(body, /Lifetime Membership/);
  assert.match(body, /No renewal fees\. No monthly quotas\. No maintenance purchases\./);
  assert.doesNotMatch(body, /\d+\s*%/);
});

test("Need help? shows the order, membership and product entries with the store's own contacts, and the Earn invitation is last", async () => {
  const body = await home({}, { site: FILLED });
  assert.match(body, /href="\/dashboard\/help\/#order"/);
  assert.match(body, /href="\/dashboard\/help\/#membership"/);
  assert.match(body, /href="\/dashboard\/help\/#product"/);
  assert.match(body, /href="mailto:hello@demo-store\.example\.test"/);
  assert.match(body, /Interested in sharing Sant(é|&eacute;)\?/);
  assert.match(body, /Explore Ways to Earn/);
  assert.ok(body.indexOf('id="mh-help"') < body.indexOf('id="mh-earn"'));
});

test("one failed optional read (notices, catalog, agreement) never breaks the Home", async () => {
  const body = await home({ notices: err(500), catalog: err(500), agreement: err(500), cards: cardsOf(card()) });
  assert.match(body, /id="mh-order"/);
  assert.doesNotMatch(body, /md-notices/);
});

/* ---- the other pages ----------------------------------------------------------------------------------------------- */

test("My Membership: status, the four questions, terms and the app steps", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [FREE], "member/orders": [cardsOf(card({ membership: { label: "Registered", line: "You're registered.", tone: "ok", registered: true, sante_member_id: "SF-00123", act: false } }))], pack: [PACK_AGREEMENT] });
  const r = await membershipPage(dashOf(f, { appUrl: "https://apps.example.test/get" }));
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.match(body, /<title>My Membership \|/);
  assert.match(body, /SF-00123/);
  for (const q of ["How do I access member prices\\?", "Where do I place future orders\\?", "How long does membership last\\?", "Are there renewal fees, quotas or maintenance purchases\\?"]) assert.match(body, new RegExp(q));
  assert.match(body, /id="how-to-use"/);
  assert.match(body, /membership-terms\.pdf\?v=7/);
  assert.match(body, /href="https:\/\/apps\.example\.test\/get"/);
  assert.match(body, /aria-current="page">My Membership/);
  const dead = await membershipPage(dashOf(fake({ "member/me": [ME], "member/pack": [FREE], "member/orders": [err(401)], pack: [PACK_AGREEMENT] })));
  assert.equal(dead.headers.get("location"), "/");
});

test("Help is reachable with no order, catalog or notice read: it reads only the session and the lock", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [FREE] });
  const r = await helpPage(dashOf(f, { site: FILLED }));
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.deepEqual(f.calls.map((c) => c.path), ["member/me", "member/pack"]);
  for (const id of ["order", "membership", "product"]) assert.match(body, new RegExp(`id="${id}"`));
  assert.match(body, /mailto:hello@demo-store\.example\.test/);
  assert.match(body, /href="\/#contact"/);
});

test("My Purchases lists every package order with its details, anchored by order number; the App Order Log stays a separate page", async () => {
  const cards = [card({ order_number: "SP-2" , created_at: "2026-11-18T00:00:00Z" }), card({ order_number: "SP-1", created_at: "2026-11-10T00:00:00Z", steps: STEPS(4, ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]) })];
  const f = fake({ "member/me": [ME], "member/pack": [FREE], "member/orders": [ok({ cards })] });
  const body = await (await purchasesPage(dashOf(f))).text();
  assert.match(body, /All my purchases/);
  assert.match(body, /id="order-SP-2"/);
  assert.match(body, /id="order-SP-1"/);
  assert.match(body, /id="pp-dash-orders"/);
  assert.match(body, /js\/pack-dashboard\.js/);
  assert.match(body, /Deliver to/);
  assert.match(body, /1 Main St/);
  assert.ok(body.indexOf("SP-2") < body.indexOf("SP-1")); // newest first
  assert.match(body, /href="\/dashboard\/orders\/"[^>]*>[^]*?<span>Sant(é|&eacute;) App Order Log<\/span>/);
  assert.doesNotMatch(body, /<span>My Orders<\/span>/);
});

test("My Purchases says plainly when the full list could not be read", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [FREE], "member/orders": [err(500)] });
  const body = await (await purchasesPage(dashOf(f))).text();
  assert.match(body, /We couldn&#x27;t load your full purchase list/);
  assert.match(body, /You have no Membership Pack purchase|data-md-page="no-purchase"/);
});
