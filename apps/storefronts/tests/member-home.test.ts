/* The member Home (v3 redesign), My Membership, Help and the My Purchases list (ClickUp z8uq9mgmjg). */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { homePage, helpPage, membershipPage, purchasesPage, type Dash } from "../src/lib/dashboard-flow.ts";
import {
  BENEFIT_LINES, BENEFIT_SHORT_LINE, DISCOVER_CARDS, GUIDANCE_SENTENCE, GROUP_ROWS, HELP_CONTACT_HREF, quantityOf, TRACKER_SHORT, GUIDE_PRODUCT_HREF, GUIDE_START_HREF, MEMBERSHIP_HEADLINE, NO_FEES_LINE, TRACKER_LABELS, pickOrder, stateOf, termsHref, trackerOf, viewOf, welcomeText, discoverHref,
} from "../src/views/sante/member-home.ts";
import { appButtons } from "../src/views/sante/app-links.ts";
import { CATEGORIES } from "../src/views/sante/shop-products.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
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
  assert.match(body, /href="\/products\/"[^>]*><span class="mh-d">View all products<\/span>/);
  assert.match(body, /Make the most of your membership/);
  assert.match(body, /Order through the Sant(é|&eacute;) Mobile App and enjoy member prices\./);
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

test("before the payment is verified the first tracker step names the real state, never \"Payment confirmed\"", async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ payment_status: "awaiting_xendit" }, "Payment due"],
    [{ payment_status: "pending_review" }, "Payment under review"],
    [{ payment_status: "xendit_expired", problem: true }, "Payment needs attention|Payment expired"],
    [{ payment_status: "xendit_mismatch", problem: true }, "Payment needs attention"],
    [{ payment_status: "rejected", problem: true }, "Payment needs attention"],
    [{ problem: true }, "Payment needs attention"],
  ];
  for (const [o, label] of cases) {
    const body = orderPart(await home({ cards: cardsOf(card({ steps: STEPS(1, ["2026-11-17"]), membership: null, ...o })) }));
    assert.match(body, new RegExp(`mh-ts-l">(${label})`), JSON.stringify(o));
    assert.doesNotMatch(body, /Payment confirmed/, JSON.stringify(o));
  }
  assert.equal(viewOf(asCard(card({ payment_status: "xendit_expired", problem: true }))).first, "Payment expired");
  assert.match(orderPart(await home({ cards: cardsOf(card()) })), /mh-ts-l">Payment confirmed/); // verified: confirmed
});

test("the order reference and the package summary sit on separate lines, with no separator between them", async () => {
  const o = orderPart(await home({ cards: cardsOf(card({ item_lines: [{ qty: 1, name: "Santé Membership Package · 2 Boxes With Stevia, 20 Sachets" }] })) }));
  assert.match(o, /<\/span><span class="mh-order-sum">Sant(é|&eacute;) Membership Package/);
  assert.doesNotMatch(o, /mh-order-sum::|\| /);
});

test("order art: a product matches only by an exact name or a name followed by a boundary, the longest first", async () => {
  const art = async (item: string, ...names: string[]) => orderPart(await home({ cards: cardsOf(card({ headline: item, item_lines: [{ qty: 1, name: item }] })), catalog: ok({ products: names.map((n, i) => PRODUCT(i + 1, { name: n })) }) }));
  assert.match(await art("Barley 10's", "Barley 1"), /mh-pkg-art/); // "Barley 1" is not "Barley 10's"
  assert.match(await art("Barley 1", "Barley 1"), /mh-order-art-photo/); // exact
  assert.match(await art("barley  1 ", "Barley 1"), /mh-order-art-photo/); // normalised
  assert.match(await art("Barley 1 · 2 boxes", "Barley 1"), /mh-order-art-photo/); // name, then a boundary
  assert.match(await art("Santé Membership Package", "Moringa"), /mh-pkg-art/); // no match
  assert.match(await art("Barley Max 2 boxes", "Barley", "Barley Max"), /mh-order-art-photo/);
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

test("the order art is the purchased product's catalog image when matched, else the brown parcel image", async () => {
  const matched = await home({ cards: cardsOf(card({ item_lines: [{ qty: 1, name: "Barley 1" }] })), catalog: ok({ products: [PRODUCT(1)] }) });
  assert.match(orderPart(matched), /mh-order-art-photo/);
  const none = orderPart(await home({ cards: cardsOf(card()), catalog: ok({ products: [PRODUCT(1, { name: "Moringa" })] }) }));
  assert.match(none, /mh-pkg-art/);
  assert.doesNotMatch(none, /mh-order-art-photo|blob\.vercel-storage/); // the parcel, not a product photo
});

test("with no purchase: an honest empty state with support, no prompt to buy; the membership card and products stay", async () => {
  const body = await home({ catalog: ok({ products: [PRODUCT(1)] }) });
  assert.match(body, /data-mh-state="none"/);
  assert.match(body, /no membership package purchase on this account/);
  assert.match(body, /href="\/dashboard\/help\/#order"/);
  assert.doesNotMatch(main(body), /Get 2 Boxes|Unlock|Buy/);
  assert.match(body, /id="mh-member"/);
  assert.equal(body.split("data-mh-category=").length - 1, 4);
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

const CATS = [
  { key: "barley", title: "Barley essentials", text: "Plant-based wellness for your daily routine.", href: "/products/?category=barley", img: "dash-category-barley-essentials" },
  { key: "wellness", title: "Daily wellness", text: "Explore products for your everyday wellness routine.", href: "/products/?category=essentials", img: "dash-category-daily-wellness" },
  { key: "coffee", title: "Coffee &amp; beverages", text: "Discover drinks for your daily routine.", href: "/products/?category=drinks", img: "dash-category-coffee-beverages" },
  { key: "range", title: "Explore the range", text: "Browse the Santé product collection.", href: "/products/", img: "dash-category-explore-range" },
];
const explorePart = (page: string) => { const at = page.indexOf('id="mh-explore"'); return page.slice(at, page.indexOf('class="mh-guides')); };

test("Discover more from Santé: four category cards with their exact line, link and image, in order", async () => {
  const part = explorePart(await home({ catalog: ok({ products: [1, 2, 3, 4, 5].map((n) => PRODUCT(n)) }), cards: cardsOf(card()) }));
  assert.equal(part.split("data-mh-category=").length - 1, 4);
  let last = -1;
  for (const c of CATS) {
    const at = part.indexOf(`data-mh-category="${c.key}"`);
    assert.ok(at > last, c.key);
    last = at;
    const cardHtml = part.slice(at, part.indexOf("</article>", at));
    assert.match(cardHtml, new RegExp(`<h3><a href="${c.href.replace(/[?]/g, "\\?")}">${c.title}</a></h3>`));
    assert.ok(cardHtml.includes(`<p class="mh-cat-desc">${c.text}</p>`), c.text);
    assert.match(cardHtml, new RegExp(`class="mh-link mh-cat-go" href="${c.href.replace(/[?]/g, "\\?")}">Explore<span class="sr-only"> ${c.title}</span> &rarr;`));
    assert.match(cardHtml, new RegExp(`<img src="/assets/sante/img/${c.img}\\.webp\\?v=[0-9a-f]{8}" alt=""`)); // decorative
  }
});

test("the category links use real catalog categories, and the shop accepts each one", () => {
  for (const c of DISCOVER_CARDS) {
    if (!c.value) { assert.equal(discoverHref(c), "/products/"); continue; }
    assert.ok(CATEGORIES.some((k) => k.value === c.value), c.value); // the same values the shop's ?category= filter accepts
    assert.equal(discoverHref(c), `/products/?category=${c.value}`);
  }
  assert.deepEqual(DISCOVER_CARDS.map((c) => c.value), ["barley", "essentials", "drinks", ""]);
});

test("discovery shows no product names, prices, bottle placeholders or product descriptions, whatever the catalog holds", async () => {
  for (const catalog of [ok({ products: [1, 2, 3, 4, 5].map((n) => PRODUCT(n)) }), ok({ products: [] }), err(500)]) {
    const part = explorePart(await home({ catalog, cards: cardsOf(card()) }));
    assert.equal(part.split("data-mh-category=").length - 1, 4); // the same four cards, catalog or not
    assert.doesNotMatch(part, /Barley \d|A short description|₱|\d+% off|product-img-placeholder|data-mh-product|mh-prod|data-mh-empty|class="mh-prods"/i);
    assert.doesNotMatch(part, /Members order in the Sant|App Store|Google Play|Open the Sant/); // the app guidance moved out of the heading
  }
  assert.match(await home({ catalog: err(500) }), /href="\/products\/"[^>]*><span class="mh-d">View all products<\/span><span class="mh-m">View all<\/span> &rarr;/);
});

test("the desktop guidance tile is one sentence with the App Store / Google Play buttons, once; the no-link fallback stays truthful", async () => {
  const body = await home({ cards: cardsOf(card()) }, { appUrl: { ios: IOS, android: ANDROID, fallback: FALLBACK } });
  const at = body.indexOf('data-mh-guide="app"');
  const tileHtml = body.slice(at, body.indexOf('data-mh-guide="products"'));
  assert.equal(GUIDANCE_SENTENCE, "Order through the Santé Mobile App and enjoy member prices.");
  assert.match(tileHtml, /<p>Order through the Sant(é|&eacute;) Mobile App and enjoy member prices\.<\/p>/);
  assert.doesNotMatch(tileHtml, /Learn how to order|Members order in the Sant|where member prices are shown/); // the repeated instructions are gone
  assert.match(tileHtml, />App Store</);
  assert.match(tileHtml, />Google Play</);
  assert.equal(body.split(">App Store<").length - 1, 1);
  assert.equal(body.split("enjoy member prices").length - 1, 1);
  assert.equal(explorePart(body).includes("App Store"), false);
  const none = await home({ cards: cardsOf(card()) });
  const noneTile = none.slice(none.indexOf('data-mh-guide="app"'), none.indexOf('data-mh-guide="products"'));
  assert.match(noneTile, /enjoy member prices\./);
  assert.match(noneTile, /Ask us for the Sant(é|&eacute;) Mobile App link\./);
  assert.equal(none.includes(">App Store<"), false);
});

test("the order card's package picture is Coach Ed's brown parcel (transparent WebP, contained), not the outlined drawing", async () => {
  const o = orderPart(await home({ cards: cardsOf(card()), catalog: ok({ products: [PRODUCT(1, { name: "Moringa" })] }) }));
  assert.match(o, /<img class="mh-pkg-art" src="\/assets\/sante\/img\/dash-parcel-brown-box\.webp\?v=[0-9a-f]{8}" alt=""/);
  assert.doesNotMatch(o, /<svg class="mh-pkg-art"|#EAF4EE/);
  const css = readFileSync(path.join(import.meta.dirname, "..", "public", "assets", "sante", "css", "pack-member-home.css"), "utf8");
  assert.match(css, /\.mh-pkg-art \{[^}]*object-fit: contain/);
  const webp = readFileSync(path.join(import.meta.dirname, "..", "public", "assets", "sante", "img", "dash-parcel-brown-box.webp"));
  assert.equal(webp.subarray(0, 4).toString(), "RIFF");
  assert.ok(webp.includes("ALPH") || webp.includes("VP8L") || webp.includes("VP8X"), "keeps its alpha channel"); // an alpha chunk or a lossless WebP
});

test("the Home and its bar share one 1240px container, scoped to the Home", async () => {
  const body = await home({});
  assert.match(body, /<div class="e4 e4-bn e4-home"/);
  const css = readFileSync(path.join(import.meta.dirname, "..", "public", "assets", "sante", "css", "pack-member-bar.css"), "utf8");
  assert.match(css, /\.e4-home \.pdn-inner, \.e4-home \.shell \{[^}]*max-width: 1240px[^}]*margin-inline: auto[^}]*padding-inline: 24px/);
  assert.match(css, /max-width: 640px\) \{ \.e4-home \.pdn-inner, \.e4-home \.shell \{ padding-inline: 16px/);
});

/* ---- links: no dead hrefs -------------------------------------------------------------------------------------------- */

test("the guidance tiles, support strip and every Home link point at a real page", async () => {
  assert.equal(GUIDE_START_HREF, "/dashboard/membership/#how-to-use");
  assert.equal(GUIDE_PRODUCT_HREF, "/dashboard/media/");
  const body = await home({ cards: cardsOf(card({ steps: SHIPPED, courier: "LBC", tracking: "T1" })), catalog: ok({ products: [PRODUCT(1)] }) }, { appUrl: "https://apps.example.test/get" });
  assert.match(body, /href="\/dashboard\/membership\/#how-to-use">Start here/);
  assert.match(body, /href="\/dashboard\/media\/">View guides/);
  assert.match(body, /href="\/dashboard\/help\/#contact">Contact your store/);
  const known = [/^\/dashboard\/(membership|purchases|help|media|training|affiliate|orders|account)?\/?(#[\w-]*)?$/, /^\/products\/([\w-]+\/|\?category=[\w-]+)?$/, /^https:\/\//, /^\/assets\//, /^\/$/, /^\/#/, /^\/(cart|business-seal|privacy|terms)/];
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

/* ---- corrections 2 (2026-11-19): bottom navigation, the phone's Home, the light footer ------------------------------------------------ */

const bottomNavOf = (page: string) => page.slice(page.indexOf('<nav class="mbn"'), page.indexOf("</nav>", page.indexOf('<nav class="mbn"')));
const sheetOf = (page: string) => page.slice(page.indexOf('<div class="mbn-sheet"'), page.indexOf("</form>", page.indexOf('<div class="mbn-sheet"')));
const pageOf = async (fn: (d: Dash) => Promise<Response>, extra: Record<string, Reply[]> = {}): Promise<string> => {
  const r = await fn(dashOf(fake({ ...replies(), ...extra })));
  assert.equal(r.status, 200);
  return r.text();
};

test("the bottom navigation: Home, Orders, Products, Help and a More button; Orders is My Purchases, never the Santé App Order Log", async () => {
  const nav = bottomNavOf(await home({ cards: cardsOf(card()) }));
  const links = [...nav.matchAll(/<a class="mbn-item[^"]*" href="([^"]+)"[^>]*>[^]*?<span class="mbn-label">([^<]+)<\/span>/g)].map((m) => `${m[2]} ${m[1]}`);
  assert.deepEqual(links, ["Home /dashboard/", "Orders /dashboard/purchases/", "Products /products/", "Help /dashboard/help/"]);
  assert.match(nav, /<button type="button" class="mbn-item mbn-more[^"]*" aria-haspopup="dialog" aria-expanded="false" aria-controls="mbn-sheet" data-mbn-more>[^]*<span class="mbn-label">More<\/span>/);
  assert.doesNotMatch(nav, /\/dashboard\/orders\//); // Orders is not the member-encoded Santé App Order Log
  assert.equal(nav.split("<svg").length - 1, 5); // an outline icon above each of the five labels
  assert.match(nav, /aria-label="Main"/);
});

test("aria-current=\"page\" marks the active bottom destination on every member page that shows it", async () => {
  const active = (nav: string) => [...nav.matchAll(/<a class="mbn-item is-active" href="([^"]+)" aria-current="page"/g)].map((m) => m[1]);
  assert.deepEqual(active(bottomNavOf(await home({}))), ["/dashboard/"]);
  assert.deepEqual(active(bottomNavOf(await pageOf(helpPage))), ["/dashboard/help/"]);
  const purchases = await pageOf(purchasesPage, { "member/pack": [FREE], "member/orders": [cardsOf(card())] });
  assert.deepEqual(active(bottomNavOf(purchases)), ["/dashboard/purchases/"]);
  assert.equal(bottomNavOf(purchases).split('aria-current="page"').length - 1, 1); // exactly one
  // A page behind More: the More button is the active one, and its own link in the sheet carries aria-current.
  const membership = await pageOf(membershipPage, { "member/pack": [FREE], "member/orders": [cardsOf(card())], pack: [PACK_AGREEMENT] });
  assert.deepEqual(active(bottomNavOf(membership)), []);
  assert.match(bottomNavOf(membership), /class="mbn-item mbn-more is-active"/);
  assert.match(sheetOf(membership), /<a href="\/dashboard\/membership\/" aria-current="page">Membership<\/a>/);
});

test("the More sheet holds Membership, Earn with Santé (Training, Media Library, Affiliate Hub), the Santé App Order Log, Account Settings and Log out", async () => {
  const page = await home({});
  const sheet = sheetOf(page);
  assert.match(sheet, /role="dialog" aria-modal="true" aria-labelledby="mbn-sheet-h" data-mbn-sheet hidden/);
  const links = [...sheet.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => `${m[2]} ${m[1]}`);
  assert.deepEqual(links, ["Membership /dashboard/membership/", "Training /dashboard/training/", "Media Library /dashboard/media/", "Affiliate Hub /dashboard/affiliate/",
    "Santé App Order Log /dashboard/orders/", "Account Settings /dashboard/account/"].map((x) => x.replace("Santé", "Santé")));
  assert.match(sheet, /Earn with Sant(é|&eacute;)/);
  assert.match(page, /<form method="post" action="\/dashboard\/sign-out\/" class="mbn-out"><button type="submit" class="mbn-logout">Log out<\/button><\/form>/);
  assert.match(sheet, /aria-label="Close menu"/);
  assert.doesNotMatch(page.slice(page.indexOf('<nav class="pdn"'), page.indexOf("</nav>")), /pdnToggle/); // no hamburger in the top bar
  assert.match(page, /viewport-fit=cover/);
});

test("the bottom navigation and the compact footer exist only on signed-in member pages", async () => {
  const { signInDocument, signInModel, chrome } = await import("../src/views/sante/member.ts");
  const out = signInDocument(chrome(SITE), signInModel()).value;
  assert.doesNotMatch(out, /class="mbn"|data-mbn-sheet|data-mfoot|e4-bn|viewport-fit/);
  assert.match(out, /<footer class="footer">/);
});

test("the bar's CSS shows the bottom navigation up to 1024px and the links above it, with the safe area and the room under the content", () => {
  const css = readFileSync(path.join(import.meta.dirname, "..", "public", "assets", "sante", "css", "pack-member-bar.css"), "utf8");
  assert.match(css, /\.mbn, \.mbn-sheet \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 1024px\) \{[^]*\.e4-bn \.pdn \{ height: 56px; \}/);
  assert.match(css, /\.e4-bn \.pdn-links \{ display: none !important; \}/);
  assert.match(css, /\.e4-bn \{ padding-bottom: calc\(72px \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
  assert.match(css, /\.mbn \{[^}]*position: fixed;[^}]*padding-bottom: env\(safe-area-inset-bottom, 0px\)/);
  assert.match(css, /\.mbn-item \{[^}]*min-height: 64px/);
  assert.doesNotMatch(css, /@media \(max-width: 1023px\)|@media \(min-width: 1026px\)/); // one breakpoint, no gap and no overlap
});

test("the footer: the real store name, the current year, Privacy Policy, Terms, Contact and the approved disclaimer, word for word", async () => {
  const { chrome, memberDocument } = await import("../src/views/sante/member.ts");
  const { html } = await import("../src/lib/html.ts");
  const doc = (site: typeof SITE, now: Date) => memberDocument(chrome(site, now), { title: "T", member: "Ana", current: "help", content: html`<p>x</p>`, scripts: [] }).value;
  const both = [{ label: "Privacy Policy", path: "/privacy-policy/" }, { label: "Terms and Conditions", path: "/terms-and-conditions/" }];
  const page = doc({ ...SITE, display_name: "Nena's Wellness & Barley", policy_links: both }, new Date("2027-03-02T00:00:00Z"));
  const foot = page.slice(page.indexOf("<footer"), page.indexOf("</footer>"));
  assert.match(foot, /&#169; 2027 Nena(?:'|&#x27;)s Wellness &amp; Barley\. All rights reserved\./);
  assert.match(foot, /<a href="\/privacy-policy\/">Privacy Policy<\/a>/);
  assert.match(foot, /<a href="\/terms-and-conditions\/">Terms<\/a>/);
  assert.match(foot, /<li class="mfoot-contact"><a href="\/dashboard\/help\/#contact">Contact<\/a><\/li>/);
  assert.match(foot, /<p class="mfoot-disclaimer">Products are for general wellness support only\. Not intended to diagnose, treat, cure, or prevent any disease\. Results may vary\.<\/p>/);
  assert.doesNotMatch(foot, /Demo Store|Ana(?:'|&#x27;)s Store/);
  assert.match(doc(SITE, new Date("2026-11-19T00:00:00Z")), /&#169; 2026 Demo Store\./); // the configured name, whatever it is
  // a policy is linked only when the site lists it; nothing is guessed
  const footOf = (links: { label: string; path: string }[]) => { const p = doc({ ...SITE, policy_links: links }, new Date("2026-11-19T00:00:00Z")); return p.slice(p.indexOf("<footer"), p.indexOf("</footer>")); };
  const neither = footOf([]);
  assert.doesNotMatch(neither, /privacy-policy|terms-and-conditions|Privacy Policy|>Terms</);
  assert.match(neither, /<ul class="mfoot-links"[^>]*>\s*<li class="mfoot-contact"><a href="\/dashboard\/help\/#contact">Contact<\/a><\/li>/); // just Contact, no stray separator item
  const onlyPrivacy = footOf([both[0]]);
  assert.match(onlyPrivacy, /href="\/privacy-policy\/">Privacy Policy/);
  assert.doesNotMatch(onlyPrivacy, /terms-and-conditions|>Terms</);
  const onlyTerms = footOf([both[1]]);
  assert.match(onlyTerms, /href="\/terms-and-conditions\/">Terms/);
  assert.doesNotMatch(onlyTerms, /privacy-policy|Privacy Policy/);
  const listed = footOf(both);
  assert.match(listed, /href="\/privacy-policy\/">Privacy Policy[^]*href="\/terms-and-conditions\/">Terms/);
  const css = readFileSync(path.join(import.meta.dirname, "..", "public", "assets", "sante", "css", "pack-member-bar.css"), "utf8");
  assert.match(css, /\.mfoot \{[^}]*border-top: 1px solid var\(--line\)/);
  assert.match(css, /\.e4-home \.mfoot-inner \{ max-width: 1240px; padding-inline: 24px; \}/); // the Home's shared container
  assert.match(css, /@media \(max-width: 1024px\) \{[^}]*\.mfoot-inner \{ padding: 16px 16px; \}[^}]*\.mfoot-contact \{ display: none; \}/);
});

test("the mobile order card: parcel beside the headline, order reference and a concise quantity, no tracking number and no Copy; both stay on the desktop strip", async () => {
  const body = await home({ cards: cardsOf(card({ steps: SHIPPED, courier: "J&T Express", tracking: "JT123456789", item_lines: [{ qty: 1, name: "Santé Membership Package · 2 Boxes With Stevia, 20 Sachets" }] })) });
  const o = orderPart(body);
  assert.match(o, /<span class="mh-d">Your Membership Package<\/span><span class="mh-m">Your package<\/span>/);
  assert.match(o, /<p class="mh-order-meta mh-order-metam mh-m"><strong>SP-1001<\/strong> &middot; <span class="mh-order-qty">2 boxes, 20 sachets<\/span><\/p>/);
  assert.match(o, /<span class="mh-strip-text mh-d">Tracking number[^]*JT123456789/); // desktop only
  assert.match(o, /data-mh-copy="JT123456789"/); // the Copy script keeps working for the desktop strip
  assert.equal(o.split("JT123456789").length - 1, 2); // the number and the copy value, both inside the desktop-only text
  assert.match(o, /<strong class="mh-strip-lead">J&amp;T Express<\/strong>/);
  assert.match(o, /class="mh-btn mh-btn-primary mh-view" href="\/dashboard\/purchases\/#order-SP-1001">View order/);
  const css = readFileSync(path.join(import.meta.dirname, "..", "public", "assets", "sante", "css", "pack-member-home.css"), "utf8");
  assert.match(css, /@media \(max-width: 640px\) \{\n  \.mh \.mh-d \{ display: none !important; \}/);
  assert.match(css, /\.mh-order-art \{ width: 64px; height: 64px;/);
  assert.match(css, /\.mh-order-art \{[^}]*width: 192px; height: 192px/); // the desktop parcel, +13% of 170px
  assert.match(css, /\.mh-pkg-art \{[^}]*width: 192px[^}]*object-fit: contain/);
});

test("the concise quantity is read from the purchased items, with a plain fallback", () => {
  const q = (names: string[], headline = "") => quantityOf(asCard(card({ headline, item_lines: names.map((name) => ({ qty: 1, name })) })));
  assert.equal(q(["Santé Membership Package · 2 Boxes With Stevia, 20 Sachets"]), "2 boxes, 20 sachets");
  assert.equal(q(["Membership Package"], "Santé Barley 10's with Stevia x 1 box"), "1 box");
  assert.equal(q(["Membership Package"], ""), "Membership Package");
});

test("the phone's tracker reads Paid | Ready | Shipped | Delivered on the same real steps; before payment the first label is the real state", async () => {
  assert.deepEqual([...TRACKER_SHORT], ["Paid", "Ready", "Shipped", "Delivered"]);
  const shorts = (o: string) => [...o.matchAll(/<span class="mh-ts-s">([^<]+)<\/span>/g)].map((m) => m[1]);
  const states = (o: string) => [...o.matchAll(/class="mh-ts mh-ts-(\w+)"/g)].map((m) => m[1]);
  const prepared = orderPart(await home({ cards: cardsOf(card()) }));
  assert.deepEqual(shorts(prepared), ["Paid", "Ready", "Shipped", "Delivered"]);
  assert.deepEqual(states(prepared), ["done", "current", "todo", "todo"]);
  const shipped = orderPart(await home({ cards: cardsOf(card({ steps: SHIPPED })) }));
  assert.deepEqual(states(shipped), ["done", "done", "current", "todo"]);
  const delivered = orderPart(await home({ cards: cardsOf(card({ steps: DELIVERED })) }));
  assert.deepEqual(states(delivered), ["done", "done", "done", "done"]);
  const review = orderPart(await home({ cards: cardsOf(card({ payment_status: "pending_review", membership: null })) }));
  assert.deepEqual(shorts(review), ["Review", "Ready", "Shipped", "Delivered"]); // never "Paid" before the payment is verified
  assert.doesNotMatch(review, /<span class="mh-ts-s">Paid/);
  const due = orderPart(await home({ cards: cardsOf(card({ payment_status: "awaiting_xendit", membership: null })) }));
  assert.deepEqual(shorts(due), ["Due", "Ready", "Shipped", "Delivered"]);
  const rejected = orderPart(await home({ cards: cardsOf(card({ payment_status: "rejected", problem: true, membership: null })) }));
  assert.deepEqual(shorts(rejected), ["Attention", "Ready", "Shipped", "Delivered"]);
  assert.doesNotMatch(prepared + shipped + delivered, /Packed/);
});

test("the mobile Home keeps every state truthful: error, none, pending review and action each render, with no tracking number", async () => {
  for (const [opts, state] of [[{ cards: err(500) }, "error"], [{}, "none"], [{ cards: cardsOf(card({ payment_status: "pending_review" })) }, "review"], [{ cards: cardsOf(card({ payment_status: "rejected", problem: true })) }, "action"]] as const) {
    const body = await home(opts as Opts);
    assert.match(body, new RegExp(`data-mh-state="${state}"`));
    assert.match(orderPart(body), /<span class="mh-m">Your package<\/span>/);
  }
});

test("the compact membership card: short label, the same headline, the real state, one benefit line and a View membership link", async () => {
  const pending = memberPart(await home({ cards: cardsOf(card()) }));
  assert.match(pending, /<span class="mh-d">Your Sant(é|&eacute;) Membership<\/span><span class="mh-m">Your membership<\/span>/);
  assert.match(pending, /<h2 id="mh-member-h">Member benefits, for life<\/h2>/);
  assert.match(pending, /Registration pending/); // pending is not shown as complete
  assert.doesNotMatch(pending, /Member ID/);
  assert.equal(BENEFIT_SHORT_LINE, "No renewals · No quotas · No maintenance");
  assert.match(pending, /<p class="mh-benefit-line mh-m">No renewals &middot; No quotas &middot; No maintenance<\/p>|<p class="mh-benefit-line mh-m">No renewals · No quotas · No maintenance<\/p>/);
  assert.match(pending, /<ul class="mh-benefits mh-d">/); // the three large rows are desktop only
  assert.match(pending, /<a class="mh-btn mh-btn-light" href="\/dashboard\/membership\/">View membership<\/a>/);
  const done = memberPart(await home({ cards: cardsOf(card({ membership: { label: "Registered", line: "", tone: "ok", registered: true, sante_member_id: "SF-1234", act: false } })) }));
  assert.match(done, /Member ID <strong>SF-1234<\/strong>/);
});

test("the phone's grouped list: three whole-row links to the real destinations, then the quiet earning invitation", async () => {
  assert.deepEqual(GROUP_ROWS.map((r) => `${r.label} ${r.href}`), ["Use the Santé Mobile App /dashboard/membership/#how-to-use", "Product guides /dashboard/media/", "Contact your store /dashboard/help/#contact"]);
  assert.equal(GROUP_ROWS[0].href, GUIDE_START_HREF);
  assert.equal(GROUP_ROWS[1].href, GUIDE_PRODUCT_HREF);
  assert.equal(GROUP_ROWS[2].href, HELP_CONTACT_HREF);
  const body = await home({});
  const list = body.slice(body.indexOf('id="mh-glist"'), body.indexOf('data-mh-guide="app"'));
  const rows = [...list.matchAll(/<a class="mh-gl-row" href="([^"]+)" data-mh-row="(\w+)">[^]*?<span class="mh-gl-t">([^<]+)<\/span>/g)].map((m) => `${m[3]} ${m[1]}`);
  assert.deepEqual(rows, GROUP_ROWS.map((r) => `${r.label} ${r.href}`).map((x) => x.replace("Santé", "Santé")));
  assert.equal(list.split("mh-gl-chev").length - 1, 3);
  assert.match(list, /Interested in sharing Sant(é|&eacute;)\? <a class="mh-link" href="\/dashboard\/training\/" data-mh-share>Learn more &rarr;<\/a>/);
  assert.equal(EARN_ENTRY_PATH, "/dashboard/training/");
  // the destination of "Use the Santé Mobile App" holds the steps and the App Store / Google Play buttons
  const ms = await pageOf(membershipPage, { "member/pack": [FREE], "member/orders": [cardsOf(card())], pack: [PACK_AGREEMENT] });
  assert.ok(ms.includes('id="how-to-use"'));
});

test("the mobile category tiles: titles stay, descriptions and Explore rows are desktop-only, the whole tile is one link", async () => {
  const part = explorePart(await home({}));
  assert.match(part, /<span class="mh-d">Discover more from Sant(é|&eacute;)<\/span><span class="mh-m">Discover Sant(é|&eacute;)<\/span>/);
  assert.equal(part.split("data-mh-category=").length - 1, 4);
  const css = readFileSync(path.join(import.meta.dirname, "..", "public", "assets", "sante", "css", "pack-member-home.css"), "utf8");
  assert.match(css, /\.mh-cats \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 10px; \}/);
  assert.match(css, /\.mh-cat-desc, \.mh-cat-go \{ display: none; \}/);
  assert.match(css, /\.mh-cat h3 a::before \{ content: ""; position: absolute; inset: 0;/); // the tile is the link
  assert.match(css, /\.mh-cat-img \{ aspect-ratio: auto; height: 78px; \}/);
});

test("the footer shows the BIR seal, compact, only when the business has one; the registered-business line stays", async () => {
  const { chrome, memberDocument } = await import("../src/views/sante/member.ts");
  const { html } = await import("../src/lib/html.ts");
  const doc = (has_seal: boolean) => memberDocument(chrome({ ...FILLED, business: { ...FILLED.business, has_seal } }), { title: "T", member: "Ana", current: "help", content: html`<p>x</p>`, scripts: [] }).value;
  const withSeal = doc(true);
  const foot = withSeal.slice(withSeal.indexOf("<footer"), withSeal.indexOf("</footer>"));
  assert.match(foot, /<img class="mfoot-seal" src="\/business-seal\/" alt="BIR registered business seal"/);
  assert.match(foot, /Registered business: Nena Santos Trading &middot; DTI registration no\. 1234567|Registered business: Nena Santos Trading · DTI registration no\. 1234567/);
  const none = doc(false);
  assert.doesNotMatch(none.slice(none.indexOf("<footer"), none.indexOf("</footer>")), /mfoot-seal|business-seal/);
  const css = readFileSync(path.join(import.meta.dirname, "..", "public", "assets", "sante", "css", "pack-member-bar.css"), "utf8");
  assert.match(css, /\.mfoot-seal \{[^}]*width: 120px/);
  assert.match(css, /max-width: 1024px\) \{ \.mfoot-seal \{ width: 96px; \}/);
});
