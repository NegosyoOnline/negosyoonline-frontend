/* The member Home (v3 redesign), My Membership, Help and the My Purchases list (ClickUp z8uq9mgmjg). */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { homePage, helpPage, membershipPage, purchasesPage, type Dash } from "../src/lib/dashboard-flow.ts";
import {
  BENEFIT_LINES, GUIDE_PRODUCT_HREF, GUIDE_START_HREF, MEMBERSHIP_HEADLINE, NO_FEES_LINE, TRACKER_LABELS, pickOrder, stateOf, termsHref, trackerOf, viewOf, welcomeText,
} from "../src/views/sante/member-home.ts";
import { appButtons } from "../src/views/sante/app-links.ts";
import { mobileApps } from "../src/lib/env.ts";
import { EARN_ENTRY_PATH } from "../src/views/sante/member.ts";
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
const DELIVERED = STEPS(4, ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
const SHIPPED = STEPS(3, ["2026-11-17", "2026-11-18", "2026-11-19"]);
function card(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    order_number: "SP-1001", created_at: "2026-11-17T02:00:00Z", total_text: "1,488.00", total_centavos: 148800, payment_status: "verified", payment_label: "Bank transfer",
    chip_label: "Preparing your order", chip_class: "", problem: false, problem_line: "", awaiting_payment: false, under_review: false,
    steps: STEPS(2, ["2026-11-17", "2026-11-18"]), courier: "", tracking: "", note: "", shipping_label: "FREE", headline: "Santé Barley 10's with Stevia x 2 boxes",
    item_count: 1, item_lines: [{ qty: 1, name: "Membership Package" }], address: "1 Main St, Brgy One, Manila, Metro Manila 1000", receiver_name: "Juan Dela Cruz", receiver_mobile: "+639171234567",
    membership: { label: "Registration pending", line: "Add your details.", tone: "wait", registered: false, sante_member_id: "", act: false }, ...over,
  };
}
const asCard = (o: Record<string, unknown>) => o as unknown as OrderCard;
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
/** The Home's own content, without the bar and footer. */
const main = (page: string) => page.slice(page.indexOf('id="pp-dash-home"'));
const orderPart = (page: string) => { const at = page.indexOf('id="mh-order"'); return page.slice(at, page.indexOf('id="mh-member"')); };
const memberPart = (page: string) => { const at = page.indexOf('id="mh-member"'); return page.slice(at, page.indexOf('id="mh-explore"')); };

/* ---- the redesign's structure, order and words ---------------------------------------------------------------------- */

test("the Home follows the approved layout: welcome, order card, membership card, products, two guidance tiles, support strip", async () => {
  const body = await home({ cards: cardsOf(card()), catalog: ok({ products: [PRODUCT(1)] }) });
  const at = (s: string) => body.indexOf(s);
  assert.ok(at("<h1>Welcome, Juan</h1>") > 0);
  assert.match(body, /Your membership, products and order updates in one place\./);
  assert.ok(at('id="mh-order"') < at('id="mh-member"') && at('id="mh-member"') < at('id="mh-explore"') && at('id="mh-explore"') < at('data-mh-guide="app"') && at('data-mh-guide="app"') < at('data-mh-guide="products"') && at('data-mh-guide="products"') < at('id="mh-help"'));
  assert.match(body, /Your Membership Package/);
  assert.match(body, /Your Sant(é|&eacute;) Membership/);
  assert.match(body, /Discover more from Sant(é|&eacute;)/);
  assert.match(body, /href="\/products\/"[^>]*>View all products &rarr;/);
  assert.match(body, /Make the most of your membership/);
  assert.match(body, /Learn how to order in the Sant(é|&eacute;) Mobile App\./);
  assert.match(body, /Your product guide/);
  assert.match(body, /Simple preparation and storage guides\./);
  assert.match(body, /Need a hand\? We(?:'|&#x27;)re here to help\./);
  assert.match(body, /Interested in sharing Sant(é|&eacute;)\?/);
  assert.doesNotMatch(body, /Signed in as|<h1>Dashboard<\/h1>|mh-lines|data-mh-line=/); // the three nested panels are gone
});

test("the welcome line uses the real first name, and falls back to Welcome with none", () => {
  assert.equal(welcomeText("Ana"), "Welcome, Ana");
  assert.equal(welcomeText("  "), "Welcome");
  assert.equal(welcomeText(""), "Welcome");
});

test("no state of the Home offers a cart, Buy Now, Add to Cart, Buy Again, checkout, a Packed step or the membership funnel", async () => {
  const states: Opts[] = [
    { cards: cardsOf(card()), catalog: ok({ products: [PRODUCT(1), PRODUCT(2)] }) },
    { cards: cardsOf(card({ steps: DELIVERED })), catalog: ok({ products: [PRODUCT(1)] }) },
    { cards: cardsOf(card({ payment_status: "rejected", problem: true })) },
    { cards: err(500) },
    {},
  ];
  for (const s of states) {
    const body = main(await home(s, { appUrl: "https://app.example.test/get" }));
    assert.doesNotMatch(body, /Buy Now|Add to Cart|Buy Again|Checkout|Packed|\/cart\/|name="action" value="add"/i);
    assert.doesNotMatch(body, /\/membership-pack\//);
  }
});

test("the membership card headline is one constant, \"Member benefits, for life\" (D-LIFE); the Membership page keeps its lifetime FAQ", async () => {
  assert.equal(MEMBERSHIP_HEADLINE, "Member benefits, for life");
  assert.match(await home({}), /<h2 id="mh-member-h">Member benefits, for life<\/h2>/);
  const ms = await (await membershipPage(dashOf(fake({ "member/me": [ME], "member/pack": [FREE], "member/orders": [cardsOf(card())], pack: [PACK_AGREEMENT] })))).text();
  assert.match(ms, /How long does membership last\?[^]*Lifetime Membership\./);
});

/* ---- navigation ---------------------------------------------------------------------------------------------------- */

test("the bar shows Home, Products, My Purchases, Membership, Help and a More menu of the Earn with Santé pages; the Earn link goes to its first page", async () => {
  const body = await home({});
  const nav = body.slice(body.indexOf('<ul class="pdn-links"'), body.indexOf("</nav>"));
  const labels = [...nav.matchAll(/<li><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/li>/g)].map((m) => `${m[2]} ${m[1]}`);
  assert.deepEqual(labels.slice(0, 5), ["Home /dashboard/", "Products /products/", "My Purchases /dashboard/purchases/", "Membership /dashboard/membership/", "Help /dashboard/help/"]);
  assert.match(nav, /data-pdn-earn-btn[^>]*>More/);
  assert.match(nav, /Earn with Sant(é|&eacute;)<\/li>/);
  for (const p of ["/dashboard/training/", "/dashboard/media/", "/dashboard/affiliate/"]) assert.match(nav, new RegExp(`href="${p}"`));
  assert.match(nav, /aria-label="Notifications"/);
  assert.match(body, /Logout/);
  assert.equal(EARN_ENTRY_PATH, "/dashboard/training/");
  assert.match(body, /href="\/dashboard\/training\/"[^>]*>Explore ways to earn/);
});

/* ---- which order, which state ------------------------------------------------------------------------------- */

test("state selection: a purchase needing action, else an active undelivered one, else the latest", () => {
  const delivered = asCard(card({ order_number: "D", created_at: "2026-11-10T00:00:00Z", steps: STEPS(4, ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]) }));
  const delivered2 = asCard(card({ order_number: "D2", created_at: "2026-11-12T00:00:00Z", steps: STEPS(4, ["2026-11-12", "2026-11-12", "2026-11-12", "2026-11-14"]) }));
  const active = asCard(card({ order_number: "A", created_at: "2026-11-11T00:00:00Z" }));
  const action = asCard(card({ order_number: "X", created_at: "2026-11-01T00:00:00Z", payment_status: "rejected", problem: true }));
  assert.equal(pickOrder([delivered, active, action])!.card.order_number, "X");
  assert.equal(pickOrder([delivered, active])!.card.order_number, "A");
  assert.equal(pickOrder([delivered, delivered2])!.card.order_number, "D2");
  assert.equal(pickOrder([]), null);
  assert.equal(stateOf(delivered), "delivered");
  assert.equal(stateOf(active), "active");
  assert.equal(stateOf(asCard(card({ payment_status: "pending_review" }))), "review");
  assert.equal(stateOf(asCard(card({ payment_status: "awaiting_xendit" }))), "action");
  assert.equal(stateOf(asCard(card({ membership: { label: "x", line: "x", registered: false, sante_member_id: "", act: true } }))), "action");
  assert.equal(stateOf(asCard(card({ payment_status: "bank_pending" }))), "unknown");
});

test("with several purchases the Home shows the one needing action and links to all of them", async () => {
  const body = await home({ cards: cardsOf(card({ order_number: "NEW-OK", created_at: "2026-11-18T00:00:00Z" }), card({ order_number: "OLD-BAD", created_at: "2026-11-10T00:00:00Z", payment_status: "rejected", problem: true })) });
  assert.match(body, /data-mh-state="action"/);
  assert.match(body, /OLD-BAD/);
  assert.doesNotMatch(body, /NEW-OK/);
  assert.match(body, /All purchases \(2\)/);
  assert.match(body, /href="\/dashboard\/purchases\/#order-OLD-BAD"/);
});

/* ---- the state mapping: headline, pill, tracker ---------------------------------------------------------------- */

test("the four tracker steps are Payment confirmed, Ready to ship, Shipped, Delivered; no Packed, no registration step", () => {
  assert.deepEqual([...TRACKER_LABELS], ["Payment confirmed", "Ready to ship", "Shipped", "Delivered"]);
  assert.deepEqual(trackerOf(asCard(card({ payment_status: "pending_review" }))), ["current", "todo", "todo", "todo"]);
  assert.deepEqual(trackerOf(asCard(card())), ["done", "current", "todo", "todo"]); // verified, being prepared
  assert.deepEqual(trackerOf(asCard(card({ steps: SHIPPED }))), ["done", "done", "current", "todo"]);
  assert.deepEqual(trackerOf(asCard(card({ steps: DELIVERED }))), ["done", "done", "done", "done"]);
  // registration never moves the tracker
  assert.deepEqual(trackerOf(asCard(card({ membership: { label: "Registered", line: "", tone: "ok", registered: true, sante_member_id: "SF-1", act: false } }))), ["done", "current", "todo", "todo"]);
  assert.deepEqual(trackerOf(asCard(card({ membership: { label: "Details needed", line: "", tone: "wait", registered: false, sante_member_id: "", act: true } }))), ["done", "current", "todo", "todo"]);
});

test("each order state maps to a headline, a pill and a tracker", () => {
  const view = (o: Record<string, unknown>) => viewOf(asCard(card(o)));
  const rows: [Record<string, unknown>, string, string, string][] = [
    [{ payment_status: "pending_review" }, "review", "Your payment is under review", "Under review"],
    [{ payment_status: "awaiting_xendit", problem: false }, "payment_due", "Complete your payment", "Payment due"],
    [{ payment_status: "xendit_expired", problem: true }, "payment_expired", "Your payment link expired", "Action needed"],
    [{ payment_status: "xendit_mismatch", problem: true }, "payment_mismatch", "Your payment needs attention", "Action needed"],
    [{ payment_status: "rejected", problem: true }, "rejected", "We couldn't verify your payment", "Action needed"],
    [{ problem: true }, "problem", "Your order needs attention", "Action needed"],
    [{}, "prepared", "Your package is being prepared", "Preparing"],
    [{ steps: SHIPPED }, "shipped", "Your package has shipped", "On its way"],
    [{ steps: DELIVERED }, "delivered", "Your package was delivered", "Delivered"],
  ];
  for (const [o, kind, headline, pill] of rows) {
    const v = view(o);
    assert.deepEqual([v.kind, v.headline, v.pill], [kind, headline, pill]);
    assert.equal(v.tracker?.length, 4);
  }
  const unknown = view({ payment_status: "bank_pending" });
  assert.deepEqual([unknown.kind, unknown.tracker], ["unknown", null]);
  assert.deepEqual(view({ payment_status: "rejected", problem: true }).tracker, ["alert", "todo", "todo", "todo"]);
});

test("a shipped order: headline, pill, courier, a copyable tracking number, View order; the tracker marks Shipped as current", async () => {
  const body = await home({ cards: cardsOf(card({ steps: SHIPPED, courier: "J&T Express", tracking: "JT123456789" })) });
  const o = orderPart(body);
  assert.match(o, /Your package has shipped/);
  assert.match(o, /On its way/);
  assert.match(o, /Order reference <strong>SP-1001<\/strong>/);
  assert.match(o, /J&amp;T Express/);
  assert.match(o, /data-mh-copy="JT123456789"/);
  assert.match(o, /mh-ts-done[^]*mh-ts-done[^]*mh-ts-current[^]*Shipped[^]*mh-ts-todo[^]*Delivered/);
  assert.match(o, /aria-current="step"/);
  assert.match(o, /href="\/dashboard\/purchases\/#order-SP-1001">View order/);
  assert.doesNotMatch(o, /\bETA\b|estimated|arrives|Packed/i);
  assert.match(body, /js\/pack-member-home\.js/);
});

test("a shipped order without a tracking number says it will appear once provided", async () => {
  const body = await home({ cards: cardsOf(card({ steps: SHIPPED, courier: "LBC" })) });
  assert.match(orderPart(body), /Tracking will appear once the store provides it/);
  assert.doesNotMatch(body, /data-mh-copy/);
});

test("a delivered order shows all four steps done and the delivered date", async () => {
  const o = orderPart(await home({ cards: cardsOf(card({ steps: DELIVERED, courier: "LBC" })) }));
  assert.match(o, /data-mh-kind="delivered"/);
  assert.match(o, /Your package was delivered/);
  assert.match(o, /Delivered on Nov 20, 2026/);
  assert.equal(o.split("mh-ts-done").length - 1, 4);
});

test("a package being prepared shows Payment confirmed done and Ready to ship as the current step", async () => {
  const o = orderPart(await home({ cards: cardsOf(card()) }));
  assert.match(o, /Your package is being prepared/);
  assert.match(o, /mh-ts-done[^]*Payment confirmed[^]*mh-ts-current[^]*Ready to ship/);
  assert.match(o, /View order/);
});

test("an order under review, and each payment problem, shows the right pill, tracker at step 0 and the right action", async () => {
  const cases: [string, RegExp, RegExp, RegExp][] = [
    ["pending_review", /Your payment is under review/, /Under review/, /href="\/dashboard\/purchases\/#order-SP-1001">View order/],
    ["awaiting_xendit", /Complete your payment/, /Payment due/, /href="\/dashboard\/purchases\/">Complete payment/],
    ["xendit_expired", /Your payment link expired/, /Action needed/, /href="\/dashboard\/purchases\/">See next steps/],
    ["xendit_mismatch", /Your payment needs attention/, /Action needed/, /href="\/dashboard\/help\/#order">Get help/],
    ["rejected", /We couldn(?:'|&#x27;)t verify your payment/, /Action needed/, /href="\/dashboard\/purchases\/">Send new proof/],
  ];
  for (const [status, headline, pill, action] of cases) {
    const o = orderPart(await home({ cards: cardsOf(card({ payment_status: status, problem: ["rejected", "xendit_expired", "xendit_mismatch"].includes(status) })) }));
    assert.match(o, headline, status);
    assert.match(o, pill, status);
    assert.match(o, action, status);
    assert.doesNotMatch(o, /mh-ts-done/, status); // step 0: nothing is done
    assert.doesNotMatch(o, /Your package has shipped|Thank you for purchasing/, status);
  }
});

test("an unknown payment status gets a neutral state with no tracker, never a success", async () => {
  const body = await home({ cards: cardsOf(card({ payment_status: "bank_pending", chip_label: "Bank pending" })) });
  const o = orderPart(body);
  assert.match(body, /data-mh-state="unknown"/);
  assert.match(o, /We(?:'|&#x27;)re checking your order/);
  assert.match(o, /href="\/dashboard\/help\/#order">Get help/);
  assert.doesNotMatch(o, /mh-track-steps|Payment confirmed|shipped/i);
});

test("the member pack read with a status the Home does not know does not break the Home", async () => {
  const body = await home({ pack: ok({ pack: { order_number: "SP-1", payment_status: "bank_pending", payment_label: "x", method_label: "x", price_centavos: 1, tone: "x", benefits_off: false, lock: null, proofs: [] }, registration: null }), cards: cardsOf(card({ payment_status: "bank_pending" })) });
  assert.match(body, /We(?:'|&#x27;)re checking your order/);
});

test("the order art is the purchased product's catalog image when matched, else a CSS/SVG package", async () => {
  const matched = await home({ cards: cardsOf(card({ item_lines: [{ qty: 1, name: "Barley 1" }] })), catalog: ok({ products: [PRODUCT(1)] }) });
  assert.match(orderPart(matched), /mh-order-art-photo/);
  const none = orderPart(await home({ cards: cardsOf(card()), catalog: ok({ products: [PRODUCT(1, { name: "Moringa" })] }) }));
  assert.match(none, /mh-pkg-art/);
  assert.doesNotMatch(none, /<img/);
});

test("with no purchase: an honest empty state with support, no prompt to buy; the membership card and products stay", async () => {
  const body = await home({ catalog: ok({ products: [PRODUCT(1)] }) });
  assert.match(body, /data-mh-state="none"/);
  assert.match(body, /no membership package purchase on this account/);
  assert.match(body, /href="\/dashboard\/help\/#order"/);
  assert.doesNotMatch(main(body), /Get 2 Boxes|Unlock|Buy/);
  assert.match(body, /id="mh-member"/);
  assert.match(body, /data-mh-product=/);
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
    assert.match(body, /id="mh-help"/);
  }
});

test("a dead session on the order read signs the member out; a rejected order still goes to My Purchases", async () => {
  const dead = await homePage(dashOf(fake(replies({ cards: err(401) }))));
  assert.equal(dead.headers.get("location"), "/");
  const lock = ok({ pack: { order_number: "SP-1", payment_status: "rejected", payment_label: "x", method_label: "x", price_centavos: 1, tone: "att", benefits_off: true, proofs: [], lock: { reason_label: "x", other_text: "", resubmitted: false, accounts: [] } }, registration: null });
  assert.equal((await homePage(dashOf(fake(replies({ pack: lock }))))).headers.get("location"), "/dashboard/purchases/");
});

/* ---- the membership card ------------------------------------------------------------------------------------------- */

test("the membership card: headline, the three benefits, a registration pill once, View membership", async () => {
  const m = memberPart(await home({ cards: cardsOf(card()) }));
  assert.match(m, /<h2 id="mh-member-h">Member benefits, for life<\/h2>/);
  for (const b of BENEFIT_LINES) assert.match(m, new RegExp(`</span>${b}</li>`));
  assert.equal(NO_FEES_LINE, "No renewal fees. No monthly quotas. No maintenance purchases.");
  assert.equal(m.split("mh-pill ").length - 1, 1);
  assert.match(m, /Registration pending/);
  assert.match(m, /mh-pill-wait/); // gold only while pending
  assert.match(m, /href="\/dashboard\/membership\/">View membership/);
  assert.doesNotMatch(m, /Membership Terms|membership-terms/); // the terms link lives on the Membership page
});

test("registration pending and registered: the official member ID shows only once issued", async () => {
  const pending = memberPart(await home({ cards: cardsOf(card()), pack: ok({ pack: null, registration: { status: "details_needed", label: "Details needed", line: "Add your details.", tone: "wait", details_form: true, details_erased: false, state_version: "1", sante_member_id: "" } }) }));
  assert.match(pending, /Details needed/);
  assert.doesNotMatch(pending, /Member ID/);
  assert.match(pending, /href="\/dashboard\/purchases\/">Complete my registration/);
  const reg = { status: "registered", label: "Registered", line: "You're registered.", tone: "ok", details_form: false, details_erased: false, state_version: "2", sante_member_id: "SF-00123" };
  const done = memberPart(await home({ cards: cardsOf(card({ membership: { label: "Registered", line: "x", tone: "ok", registered: true, sante_member_id: "SF-00123", act: false } })), pack: ok({ pack: null, registration: reg }) }));
  assert.match(done, /Member ID <strong>SF-00123<\/strong>/);
  assert.match(done, /mh-pill-ok/);
  assert.doesNotMatch(done, /mh-pill-wait/);
  const wrong = memberPart(await home({ cards: cardsOf(card({ membership: { label: "Registered", line: "x", tone: "ok", registered: false, sante_member_id: "SF-9", act: false } })) }));
  assert.doesNotMatch(wrong, /SF-9/); // an ID is shown only with a completed registration
});

test("no registration read: not started with an order, an honest line without one", async () => {
  const none = memberPart(await home({ cards: cardsOf(card({ membership: null })) }));
  assert.match(none, /Registration not started/);
  const noOrder = memberPart(await home({}));
  assert.match(noOrder, /membership details are not available right now/);
  assert.doesNotMatch(noOrder, /Registration (pending|not started)/);
});

/* ---- products ------------------------------------------------------------------------------------------------------ */

test("Discover more from Santé: four real products, no prices, the ordering guidance once, Explore links", async () => {
  const body = await home({ catalog: ok({ products: [1, 2, 3, 4, 5].map((n) => PRODUCT(n)) }), cards: cardsOf(card()) });
  assert.equal(body.split("data-mh-product=").length - 1, 4);
  assert.match(body, /Barley 1/);
  assert.doesNotMatch(body, /Barley 5/);
  assert.match(body, /A short description\./);
  assert.doesNotMatch(main(body), /₱|\d+% off|Members price|Check member prices/i); // no price comparison and no per-card paragraph
  assert.equal(body.split("Members order in the Sant").length - 1, 1); // the guidance, once
  assert.match(body, /href="\/products\/barley-1\/">Explore/);
  assert.match(body, /<img src="[^"]*a\.png"/);
});

test("missing images and short descriptions leave the tile truthful; no invented copy", async () => {
  const body = await home({ catalog: ok({ products: [PRODUCT(1, { image_url: "", short_description: "" })] }) });
  assert.match(body, /product-img-placeholder/);
  assert.doesNotMatch(body, /mh-prod-desc/);
});

test("an empty or unreadable catalog is a compact state, not placeholder products", async () => {
  for (const catalog of [ok({ products: [] }), err(500)]) {
    const body = await home({ catalog });
    assert.match(body, /data-mh-empty="products"/);
    assert.equal(body.split("data-mh-product=").length - 1, 0);
    assert.match(body, /href="\/products\/"[^>]*>View all products/);
  }
});

test("the Home product grid carries its tile count, so the columns can fill the row", async () => {
  assert.match(await home({ catalog: ok({ products: [1, 2, 3, 4, 5].map((n) => PRODUCT(n)) }) }), /class="mh-prods" data-count="4"/);
  assert.match(await home({ catalog: ok({ products: [1, 2].map((n) => PRODUCT(n)) }) }), /class="mh-prods" data-count="2"/);
});

/* ---- links: no dead hrefs -------------------------------------------------------------------------------------------- */

test("the guidance tiles, support strip and every Home link point at a real page", async () => {
  assert.equal(GUIDE_START_HREF, "/dashboard/membership/#how-to-use");
  assert.equal(GUIDE_PRODUCT_HREF, "/dashboard/media/");
  const body = await home({ cards: cardsOf(card({ steps: SHIPPED, courier: "LBC", tracking: "T1" })), catalog: ok({ products: [PRODUCT(1)] }) }, { appUrl: "https://apps.example.test/get" });
  assert.match(body, /href="\/dashboard\/membership\/#how-to-use">Start here/);
  assert.match(body, /href="\/dashboard\/media\/">View guides/);
  assert.match(body, /href="\/dashboard\/help\/#contact">Contact your store/);
  const known = [/^\/dashboard\/(membership|purchases|help|media|training|affiliate|orders|account)?\/?(#[\w-]*)?$/, /^\/products\/([\w-]+\/)?$/, /^https:\/\//, /^\/assets\//, /^\/$/, /^\/#/, /^\/(cart|business-seal|privacy|terms)/];
  const hrefs = [...main(body).matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 8);
  for (const h of hrefs) assert.ok(h && h !== "#" && known.some((r) => r.test(h)), `dead or unexpected href: ${h}`);
});

test("the Help page has a contact section the Home links to, and reads only the session and the lock", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [FREE] });
  const r = await helpPage(dashOf(f, { site: FILLED }));
  assert.equal(r.status, 200);
  const body = await r.text();
  assert.deepEqual(f.calls.map((c) => c.path), ["member/me", "member/pack"]);
  for (const id of ["contact", "order", "membership", "product"]) assert.match(body, new RegExp(`id="${id}"`));
  assert.match(body, /mailto:hello@demo-store\.example\.test/);
  assert.match(body, /href="\/#contact"/);
});

test("one failed optional read (notices, catalog) never breaks the Home", async () => {
  const body = await home({ notices: err(500), catalog: err(500), cards: cardsOf(card()) });
  assert.match(body, /id="mh-order"/);
  assert.doesNotMatch(body, /md-notices/);
});

test("the Membership Terms link is on the Membership page (central agreement PDF), not on the Home card", async () => {
  assert.equal(termsHref(7), "/funnel/membership-pack/membership-terms.pdf?v=7");
  assert.equal(termsHref(null), "");
  assert.doesNotMatch(await home({}), /membership-terms/);
});

/* ---- the app links: App Store, Google Play, the single fallback, none -------------------------------------------------- */

const IOS = "https://apps.apple.com/ph/app/example/id1";
const ANDROID = "https://play.google.com/store/apps/details?id=com.example";
const FALLBACK = "https://apps.example.test/get";

test("the app buttons: both stores, one store, only the fallback, none", () => {
  const both = String(appButtons({ ios: IOS, android: ANDROID, fallback: FALLBACK }, "b"));
  assert.match(both, />App Store</);
  assert.match(both, />Google Play</);
  assert.doesNotMatch(both, /Open the Sant/); // the fallback only when no store link is set
  const one = String(appButtons({ ios: "", android: ANDROID, fallback: FALLBACK }, "b"));
  assert.match(one, />Google Play</);
  assert.doesNotMatch(one, /App Store|apps\.example/);
  const fallback = String(appButtons(FALLBACK, "b"));
  assert.match(fallback, new RegExp(`href="${FALLBACK}"[^>]*>Open the Sant`));
  assert.equal(String(appButtons({ ios: "", android: "", fallback: "" }, "b")), "");
  assert.equal(String(appButtons("", "b")), "");
});

test("the app links are read from STOREFRONT_MOBILE_APP_URL_IOS, _ANDROID and the fallback; only https counts", () => {
  assert.deepEqual(mobileApps({ STOREFRONT_MOBILE_APP_URL_IOS: ` ${IOS} `, STOREFRONT_MOBILE_APP_URL_ANDROID: ANDROID, STOREFRONT_MOBILE_APP_URL: FALLBACK }), { ios: IOS, android: ANDROID, fallback: FALLBACK });
  assert.deepEqual(mobileApps({ STOREFRONT_MOBILE_APP_URL: FALLBACK }), { ios: "", android: "", fallback: FALLBACK });
  assert.deepEqual(mobileApps({}), { ios: "", android: "", fallback: "" });
  for (const bad of ["http://apps.example.test", "javascript:alert(1)", "not a url", 'https://x.test/"onmouseover="y']) {
    assert.deepEqual(mobileApps({ STOREFRONT_MOBILE_APP_URL_IOS: bad, STOREFRONT_MOBILE_APP_URL_ANDROID: bad, STOREFRONT_MOBILE_APP_URL: bad }), { ios: "", android: "", fallback: "" }, bad);
  }
});

test("Home, Membership and Help show the store buttons, the fallback, or the ask-us line", async () => {
  const stores = { ios: IOS, android: ANDROID, fallback: "" };
  const withStores = await home({}, { appUrl: stores });
  assert.match(withStores, new RegExp(`href="${IOS}"[^>]*>App Store`));
  assert.match(withStores, new RegExp(`href="${ANDROID.replace("?", "\\?")}"[^>]*>Google Play`));
  assert.doesNotMatch(withStores, /Ask us for the Sant/);
  const single = await home({}, { appUrl: FALLBACK });
  assert.match(single, new RegExp(`href="${FALLBACK}"[^>]*>Open the Sant`));
  const none = await home({});
  assert.doesNotMatch(none, /App Store|Google Play|Open the Sant(é|&eacute;) Mobile App/);
  assert.match(none, /Ask us for the Sant(é|&eacute;) Mobile App link/);
  const ms = await (await membershipPage(dashOf(fake({ "member/me": [ME], "member/pack": [FREE], "member/orders": [cardsOf(card())], pack: [PACK_AGREEMENT] }), { appUrl: stores }))).text();
  assert.match(ms, />App Store</);
  assert.match(ms, />Google Play</);
  const help = await (await helpPage(dashOf(fake({ "member/me": [ME], "member/pack": [FREE] }), { appUrl: stores }))).text();
  assert.match(help, />Google Play</);
});

/* ---- the other pages ----------------------------------------------------------------------------------------------- */

test("My Membership: status, the questions, terms and the app steps", async () => {
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
  assert.match(body, /aria-current="page">Membership/);
  const dead = await membershipPage(dashOf(fake({ "member/me": [ME], "member/pack": [FREE], "member/orders": [err(401)], pack: [PACK_AGREEMENT] })));
  assert.equal(dead.headers.get("location"), "/");
});

test("My Purchases lists every package order with its details, anchored by order number; the App Order Log stays a separate page", async () => {
  const cards = [card({ order_number: "SP-2", created_at: "2026-11-18T00:00:00Z" }), card({ order_number: "SP-1", created_at: "2026-11-10T00:00:00Z", steps: STEPS(4, ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]) })];
  const f = fake({ "member/me": [ME], "member/pack": [FREE], "member/orders": [ok({ cards })] });
  const body = await (await purchasesPage(dashOf(f))).text();
  assert.match(body, /All my purchases/);
  assert.match(body, /id="order-SP-2"/);
  assert.match(body, /id="order-SP-1"/);
  assert.match(body, /id="pp-dash-orders"/);
  assert.match(body, /js\/pack-dashboard\.js/);
  assert.match(body, /Deliver to/);
  assert.match(body, /1 Main St/);
  assert.ok(body.indexOf("SP-2") < body.indexOf("SP-1"));
  assert.match(body, /href="\/dashboard\/orders\/"[^>]*>[^]*?<span>Sant(é|&eacute;) App Order Log<\/span>/);
  assert.doesNotMatch(body, /<span>My Orders<\/span>/);
});

test("My Purchases says plainly when the full list could not be read", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [FREE], "member/orders": [err(500)] });
  const body = await (await purchasesPage(dashOf(f))).text();
  assert.match(body, /We couldn&#x27;t load your full purchase list/);
  assert.match(body, /You have no Membership Pack purchase|data-md-page="no-purchase"/);
});

test("a registered member sees the registered line on the Membership page, My Purchases and the order list, whatever line the server sends", async () => {
  const SERVER = "The store is registering your membership with Santé.";
  const membership = { label: "Registered", line: SERVER, tone: "ok", registered: true, sante_member_id: "SF-00123", act: false };
  const registration = { status: "registered", label: "Registered", line: SERVER, tone: "ok", details_form: false, details_erased: false, state_version: "2", sante_member_id: "SF-00123" };
  const DONE = "Your membership is registered with Sant";
  const f = fake({ "member/me": [ME], "member/pack": [ok({ pack: null, registration })], "member/orders": [cardsOf(card({ membership }))], pack: [PACK_AGREEMENT] });
  const ms = await (await membershipPage(dashOf(f))).text();
  assert.match(ms, new RegExp(DONE));
  assert.doesNotMatch(ms, /is registering your membership/);
  const pu = await (await purchasesPage(dashOf(fake({ "member/me": [ME], "member/pack": [FREE], "member/orders": [cardsOf(card({ membership }))] })))).text();
  assert.match(pu, /<p>Your membership is registered with Sant/);
  assert.doesNotMatch(pu, /is registering your membership/);
});
