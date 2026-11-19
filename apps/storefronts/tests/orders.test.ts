import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Dash } from "../src/lib/dashboard-flow.ts";
import { ORDER_ID, filtersOf, orderAddGet, orderAddPost, orderDeletePost, orderEditGet, orderEditPost, ordersExport, ordersPage } from "../src/lib/orders-flow.ts";
import { dateText, pesoText } from "../src/views/sante/member-orders.ts";
import { GET as listRoute, POST as listPost } from "../src/app/dashboard/orders/route.ts";
import { POST as deleteRoute } from "../src/app/dashboard/orders/[id]/delete/route.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret, hostAliases: {} } as unknown as import("../src/lib/env.ts").StorefrontEnv;
const TOKEN = "M".repeat(43);

type Reply = { status: number; body?: unknown; text?: string; headers?: Record<string, string> };
function fake(replies: Record<string, Reply[]>) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\/(\?.*)?$/, "");
    calls.push({ path: route, body: init.body === undefined ? {} : JSON.parse(String(init.body)) });
    const next = (replies[route] ?? []).shift();
    if (!next) throw new Error(`unexpected call: ${route}`);
    if (next.text !== undefined) return Promise.resolve(new Response(next.text, { status: next.status, headers: next.headers }));
    return Promise.resolve(Response.json(next.body, { status: next.status }));
  };
  return { calls, fetchImpl };
}
function dashOf(f: ReturnType<typeof fake>, path = "/dashboard/orders/", over: Partial<Dash> = {}, token = TOKEN): Dash {
  const request = new Request(`http://www.santetest.com${path}`);
  return {
    site: SITE, now: new Date("2026-11-15T02:00:00Z"), appUrl: "https://apps.example.test/sante",
    call: { request, host: "demo.negosyotest.com", visitor_ip: "", member_token: token, binding: "", env },
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} },
    ...over,
  };
}
const ok = (body: unknown): Reply => ({ status: 200, body });
const err = (status: number, code = "x", message = "x", fields?: Record<string, string[]>): Reply => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });
const ME = ok({ member: { id: "m1", full_name: "Juan Dela Cruz", email: "j@example.test", mobile: "+639171234567", email_verified: true, mobile_verified: true } });
const FREE = ok({ pack: null, registration: null });
const LOCKED = ok({ pack: { order_number: "SP-1", payment_status: "rejected", payment_label: "Needs attention", method_label: "Bank transfer", price_centavos: 100, tone: "att", benefits_off: true, proofs: [],
  lock: { reason_label: "Amount does not match", other_text: "", resubmitted: false, accounts: [] } }, registration: null });

const ORDER = (over: Record<string, unknown> = {}) => ({ id: "mol_1", order_number: "PH-000123", ordered_on: "2026-11-12", customer_first_name: "TEST Ana", city: "Quezon City", payment: "cod", total: "1450.00", status: "for_approval", created_at: "x", updated_at: "x", ...over });
const TILES = { for_approval: 2, for_booking: 1, for_pickup: 0, shipping: 1, delivered: 3, closed: 0 };
const HEADER = { orders_this_month: 5, sales_this_month: "12345.5", delivered_this_month: 3, needs_action: 3 };
const LIST = (over: Record<string, unknown> = {}) => ({ orders: [ORDER(), ORDER({ id: "mol_2", order_number: "PH-000122", customer_first_name: "TEST <Ben>", payment: "prepaid", status: "delivered", total: "99" })], page: 1, pages: 1, count: 2, tiles: TILES, header: HEADER, ...over });
const setup = (replies: Record<string, Reply[]>) => fake({ "member/me": [ME], "member/pack": [FREE], ...replies });
const mainOf = (body: string) => body.slice(body.indexOf('<main class="main">'), body.indexOf("</main>")).replace(/<style>[^]*?<\/style>/, "");
const FORM = { order_number: "ph-000130", ordered_on: "2026-11-14", customer_first_name: "TEST Cora", city: "Cebu", payment: "prepaid", total: "1,450.5", status: "for_booking" };

/* ---- the list ---------------------------------------------------------------------------------------------------- */

test("the list keeps the app line and button on top, then the hero figures, the status tiles and the table", async () => {
  const f = setup({ "member/order-log": [ok(LIST())] });
  const r = await ordersPage(dashOf(f));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const body = await r.text();
  assert.match(body, /<h1>Orders<\/h1>/);
  assert.ok(body.indexOf("Your orders are placed and tracked in the Sant") < body.indexOf('class="mo-hero"'));
  assert.match(body, /<a class="btn md-app-btn" href="https:\/\/apps\.example\.test\/sante"[^>]*>Open the Sant(é|&eacute;) Mobile App<\/a>/);
  assert.match(body, /This is your own log\. Add each order you placed in the app to track it here\./);
  assert.match(body, /Sales this month[^]*₱12,345\.50[^]*November 2026/);
  assert.match(body, /Orders<\/div><div class="mo-kpi-val">5</);
  assert.match(body, /Delivered<\/div><div class="mo-kpi-val">3</);
  assert.match(body, /mo-kpi has-work"><div class="mo-kpi-lab">Needs action<\/div><div class="mo-kpi-val">3</);
  const tiles = [...body.matchAll(/data-status="(\w+)"[^]*?mo-stage-count">(\d+)<[^]*?mo-stage-label">([^<]+)</g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
  assert.deepEqual(tiles, ["for_approval 2 For approval", "for_booking 1 For booking", "for_pickup 0 For pickup", "shipping 1 Shipping", "delivered 3 Delivered", "closed 0 Closed/other"]);
  assert.match(body, /<th scope="col">PH #<\/th><th scope="col">Date<\/th><th scope="col">Customer<\/th><th scope="col">City<\/th><th scope="col">Payment<\/th><th scope="col" class="r">Total<\/th><th scope="col">Status<\/th>/);
  assert.match(body, /<a class="lnk mo-num" href="\/dashboard\/orders\/mol_1\/edit\/">PH-000123<\/a>/);
  assert.match(body, /Nov 12, 2026/);
  assert.match(body, /data-label="Total" class="r">₱1,450\.00</);
  assert.match(body, /data-label="Payment">Prepaid</);
  assert.match(body, /TEST &lt;Ben&gt;/); // escaped
  assert.doesNotMatch(mainOf(body), /Accept|Cancel|Courier|<script/);
  assert.deepEqual(f.calls.find((c) => c.path === "member/order-log")!.body, { host: "demo.negosyotest.com", token: TOKEN });
});

test("without an app link the button is left out; the app line stays", async () => {
  const body = await (await ordersPage(dashOf(setup({ "member/order-log": [ok(LIST())] }), "/dashboard/orders/", { appUrl: "" }))).text();
  assert.match(body, /placed and tracked in the Sant/);
  assert.doesNotMatch(body, /Open the Sant/);
});

test("the empty state says the log is empty and offers Add order; a filter with no match says so and offers to clear", async () => {
  const empty = LIST({ orders: [], count: 0, tiles: { for_approval: 0, for_booking: 0, for_pickup: 0, shipping: 0, delivered: 0, closed: 0 }, header: { orders_this_month: 0, sales_this_month: "0.00", delivered_this_month: 0, needs_action: 0 } });
  const body = await (await ordersPage(dashOf(setup({ "member/order-log": [ok(empty)] })))).text();
  assert.match(body, /No orders in your log yet\./);
  assert.match(body, /data-mo="empty"[^]*href="\/dashboard\/orders\/add\/">Add order</);
  assert.doesNotMatch(body, /<table/);
  assert.match(body, /₱0\.00/);
  const some = await (await ordersPage(dashOf(setup({ "member/order-log": [ok(LIST({ orders: [], count: 0 }))] }), "/dashboard/orders/?q=zzz"))).text();
  assert.match(some, /No orders match these filters\./);
  assert.match(some, /<a class="lnk" href="\/dashboard\/orders\/">Clear all filters<\/a>/);
});

test("filters are sent to the backend and carried into the tile links, the paging links and the export link", async () => {
  const f = setup({ "member/order-log": [ok(LIST({ page: 2, pages: 3, count: 60 }))] });
  const body = await (await ordersPage(dashOf(f, "/dashboard/orders/?q=ana&status=shipping&from=2026-11-01&to=2026-11-15&page=2&junk=1"))).text();
  assert.deepEqual(f.calls.find((c) => c.path === "member/order-log")!.body, { host: "demo.negosyotest.com", token: TOKEN, q: "ana", status: "shipping", date_from: "2026-11-01", date_to: "2026-11-15", page: 2 });
  // a tile keeps q and the dates, sets its own status, drops the page; the active tile clears the status
  assert.match(body, /data-status="delivered" href="\/dashboard\/orders\/\?q=ana&amp;status=delivered&amp;from=2026-11-01&amp;to=2026-11-15"/);
  assert.match(body, /class="mo-stage active" data-accent="teal" data-status="shipping" href="\/dashboard\/orders\/\?q=ana&amp;from=2026-11-01&amp;to=2026-11-15"/);
  assert.match(body, /rel="prev" href="\/dashboard\/orders\/\?q=ana&amp;status=shipping&amp;from=2026-11-01&amp;to=2026-11-15"/);
  assert.match(body, /rel="next" href="\/dashboard\/orders\/\?q=ana&amp;status=shipping&amp;from=2026-11-01&amp;to=2026-11-15&amp;page=3"/);
  assert.match(body, /href="\/dashboard\/orders\/export\.csv\?q=ana&amp;status=shipping&amp;from=2026-11-01&amp;to=2026-11-15" data-mo="export">Export CSV</);
  assert.match(body, /<input type="hidden" name="status" value="shipping">/);
  // From and To are the house calendar picker, values kept, and the list page loads its assets
  assert.match(body, /<input id="mo-from" class="inp" type="date" name="from" value="2026-11-01" data-pk-date data-placeholder="From date">/);
  assert.match(body, /<input id="mo-to" class="inp" type="date" name="to" value="2026-11-15" data-pk-date data-placeholder="To date">/);
  assert.match(body, /js\/pack-select\.js/);
  assert.match(body, /css\/pack-select\.css/);
  assert.match(body, /name="q"[^>]*value="ana"/);
  assert.match(body, /Page 2 of 3/);
  assert.doesNotMatch(body, /junk/);
});

test("malformed filters are left out before the backend is called", () => {
  const { filters, page } = filtersOf(new URLSearchParams("q=%20%20&status=hacked&from=yesterday&to=2026-13-45x&page=-4"));
  assert.deepEqual(filters, {});
  assert.equal(page, 1);
  assert.equal(filtersOf(new URLSearchParams("q=" + "a".repeat(100))).filters.q?.length, 60);
});

test("at 390px each row is a stacked card: the table turns to blocks and every cell carries its label; the page has no sideways scroll rule", async () => {
  const body = await (await ordersPage(dashOf(setup({ "member/order-log": [ok(LIST())] })))).text();
  const css = body.slice(body.indexOf(".mo-hero{"), body.indexOf("</style>", body.indexOf(".mo-hero{")));
  assert.match(css, /@media \(max-width:640px\)\{[^]*\.mo-table,\.mo-table tbody,\.mo-table tr,\.mo-table td\{display:block;width:100%\}/);
  assert.match(css, /\.mo-table td::before\{content:attr\(data-label\)/);
  assert.match(css, /\.mo-table thead\{position:absolute/);
  assert.doesNotMatch(css, /overflow-x:\s*(scroll|auto)/);
  const labels = [...body.slice(body.indexOf("<tbody>")).split("</tr>")[0].matchAll(/<td data-label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["PH #", "Date", "Customer", "City", "Payment", "Total", "Status"]);
});

test("the style rules: dark mode is covered, the focus border is the shared light-blue .inp rule, no gold focus, no focusable card titles", async () => {
  const body = await (await ordersPage(dashOf(setup({ "member/order-log": [ok(LIST())] })))).text();
  assert.match(body, /html\[data-theme="dark"\] \.mo-status/);
  assert.match(body, /class="inp"[^>]*name="q"|class="inp" type="search" name="q"/);
  assert.doesNotMatch(body, /:focus[^}]*(gold|#C9A227|#E4C96A)/);
  assert.doesNotMatch(body, /<h[1-3][^>]*tabindex/);
});

test("a saved notice shows after an add, edit or delete; an unknown one shows nothing", async () => {
  for (const [k, text] of [["added", "Order added to your log."], ["updated", "Order updated."], ["deleted", "Order deleted from your log."]]) {
    const body = await (await ordersPage(dashOf(setup({ "member/order-log": [ok(LIST())] }), `/dashboard/orders/?saved=${k}`))).text();
    assert.match(body, new RegExp(`role="status">${text.replace(/\./g, "\\.")}<`));
  }
  const none = await (await ordersPage(dashOf(setup({ "member/order-log": [ok(LIST())] }), "/dashboard/orders/?saved=%3Cb%3E"))).text();
  assert.doesNotMatch(none, /role="status"/);
});

test("signed out the list, forms, delete and export go to the store home with no call to Django; a dead session clears the cookie", async () => {
  const f = fake({});
  for (const run of [ordersPage, orderAddGet, ordersExport, (d: Dash) => orderEditGet(d, "mol_1"), (d: Dash) => orderAddPost(d, FORM), (d: Dash) => orderDeletePost(d, "mol_1")]) {
    const r = await run(dashOf(f, "/dashboard/orders/", {}, ""));
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("location"), "/");
  }
  assert.equal(f.calls.length, 0);
  const dead = await ordersPage(dashOf(fake({ "member/me": [err(401, "member_session_invalid")] })));
  assert.equal(dead.status, 303);
  assert.equal(dead.headers.get("location"), "/");
});

test("a rejected order sends every Orders page to My Purchases", async () => {
  for (const run of [ordersPage, orderAddGet, ordersExport]) {
    const r = await run(dashOf(fake({ "member/me": [ME], "member/pack": [LOCKED] })));
    assert.equal(r.headers.get("location"), "/dashboard/purchases/");
  }
});

test("a switched-off log or an unserved host is the neutral page; a failed read says to try again", async () => {
  assert.equal((await ordersPage(dashOf(setup({ "member/order-log": [err(404, "not_found")] })))).status, 404);
  const r = await ordersPage(dashOf(setup({ "member/order-log": [err(500)] })));
  assert.equal(r.status, 503);
  assert.match(await r.text(), /try again shortly/);
});

test("the list page answers the GET only", async () => {
  assert.equal((await (listPost as () => Promise<Response> | Response)()).status, 404);
  assert.equal(typeof listRoute, "function");
});

/* ---- add and edit ------------------------------------------------------------------------------------------------ */

test("the add form has the seven fields, today as the date's latest, and chooses nothing for Payment and Status", async () => {
  const body = await (await orderAddGet(dashOf(setup({})))).text();
  for (const name of ["order_number", "ordered_on", "customer_first_name", "city", "payment", "total", "status"]) assert.match(body, new RegExp(`name="${name}"`));
  assert.match(body, /type="date" min="2007-01-01" max="2026-11-15" data-pk-date data-placeholder="Order date"/);
  assert.match(body, /css\/pack-select\.css/);
  assert.match(body, /<select id="mo-payment"[^>]*data-pk-select data-pk-select-nofilter data-placeholder="Payment"/);
  assert.match(body, /<select id="mo-status"[^>]*data-pk-select data-pk-select-nofilter data-placeholder="Status"/);
  assert.match(body, /<option value="">Payment<\/option>/);
  assert.match(body, /<option value="">Status<\/option>/);
  assert.doesNotMatch(body, /<option value="[a-z_]+" selected>/);
  assert.doesNotMatch(body, /<select[^>]*\brequired\b/);
  assert.match(body, /js\/pack-select\.js/);
  assert.match(body, /<form method="post" action="\/dashboard\/orders\/add\/">/);
  assert.doesNotMatch(body, /data-mo="delete"/);
  assert.doesNotMatch(mainOf(body), /tracking|phone|address|note/i);
});

test("an add with Payment and Status unchosen shows plain field errors and makes no backend call", async () => {
  const f = setup({});
  const r = await orderAddPost(dashOf(f), { ...FORM, payment: "", status: "" });
  assert.equal(r.status, 400);
  const body = await r.text();
  assert.match(body, /<p class="err" id="mo-payment-msg">Choose a payment\.<\/p>/);
  assert.match(body, /<p class="err" id="mo-status-msg">Choose a status\.<\/p>/);
  assert.match(body, /id="mo-payment" class="inp bad"[^>]*aria-invalid="true" aria-describedby="mo-payment-msg"/);
  assert.doesNotMatch(body, /<option value="[a-z_]+" selected>/);
  assert.equal(f.calls.some((c) => c.path === "member/order-log/create"), false);
});

test("an edit with Status unchosen is refused the same way, without a backend call", async () => {
  const f = setup({});
  const r = await orderEditPost(dashOf(f), "mol_1", { ...FORM, status: "" });
  assert.equal(r.status, 400);
  const body = await r.text();
  assert.match(body, /id="mo-status-msg">Choose a status\.</);
  assert.doesNotMatch(body, /mo-payment-msg/);
  assert.match(body, /<option value="prepaid" selected>/);
  assert.equal(f.calls.some((c) => c.path.includes("order-log/update")), false);
});

test("a good add sends exactly the contract's keys and redirects to the list with a notice", async () => {
  const f = setup({ "member/order-log/create": [{ status: 201, body: { order: ORDER() } }] });
  const r = await orderAddPost(dashOf(f), FORM);
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/dashboard/orders/?saved=added");
  assert.deepEqual(f.calls.find((c) => c.path === "member/order-log/create")!.body, {
    host: "demo.negosyotest.com", token: TOKEN, order_number: "ph-000130", ordered_on: "2026-11-14", customer_first_name: "TEST Cora", city: "Cebu", payment: "prepaid", total: "1,450.5", status: "for_booking",
  });
});

test("the error round trip: a field error re-renders the form with the typed values and the message beside its field", async () => {
  const f = setup({ "member/order-log/create": [err(400, "invalid_order", "Check the order.", { ordered_on: ["Choose a date that is not in the future."], total: ["Enter an amount like 1450.00."] })] });
  const r = await orderAddPost(dashOf(f), { ...FORM, ordered_on: "2027-01-01", total: "abc" });
  assert.equal(r.status, 400);
  const body = await r.text();
  assert.match(body, /<div class="note bad" role="alert">Check the highlighted fields\.<\/div>/);
  assert.match(body, /id="mo-ordered_on" class="inp bad" name="ordered_on" value="2027-01-01"[^>]*aria-invalid="true" aria-describedby="mo-ordered_on-msg"/);
  assert.match(body, /<p class="err" id="mo-ordered_on-msg">Choose a date that is not in the future\.<\/p>/);
  assert.match(body, /id="mo-total" class="inp bad" name="total" value="abc"/);
  assert.match(body, /<p class="err" id="mo-total-msg">Enter an amount like 1450\.00\.<\/p>/);
  // untouched fields keep what was typed
  assert.match(body, /name="customer_first_name" value="TEST Cora"/);
  assert.match(body, /<option value="prepaid" selected>/);
  assert.match(body, /<option value="for_booking" selected>/);
  assert.doesNotMatch(body, /mo-city-msg/);
});

test("a taken PH number shows beside the PH # field (409 order_number_taken)", async () => {
  const f = setup({ "member/order-log/create": [err(409, "order_number_taken", "taken", { order_number: ["You already have this PH number in your log."] })] });
  const r = await orderAddPost(dashOf(f), FORM);
  assert.equal(r.status, 400);
  assert.match(await r.text(), /id="mo-order_number-msg">You already have this PH number in your log\.</);
});

test("a full log (409 order_log_full) says so above the form, keeping the typed values", async () => {
  const f = setup({ "member/order-log/create": [err(409, "order_log_full", "Your log can hold 2,000 orders.")] });
  const r = await orderAddPost(dashOf(f), FORM);
  assert.equal(r.status, 409);
  const body = await r.text();
  assert.match(body, /role="alert">Your log can hold 2,000 orders\./);
  assert.match(body, /name="city" value="Cebu"/);
});

test("a failed save keeps the form with a try-again note; a dead session on save goes to the store home", async () => {
  const bad = await orderAddPost(dashOf(setup({ "member/order-log/create": [err(500)] })), FORM);
  assert.equal(bad.status, 503);
  assert.match(await bad.text(), /could not be saved[^]*name="order_number" value="ph-000130"/);
  const gone = await orderAddPost(dashOf(setup({ "member/order-log/create": [err(401, "member_session_invalid")] })), FORM);
  assert.equal(gone.status, 303);
  assert.equal(gone.headers.get("location"), "/");
});

test("the edit form is filled from the order and carries the delete confirm", async () => {
  const f = setup({ "member/order-log/mol_1": [ok({ order: ORDER() })] });
  const body = await (await orderEditGet(dashOf(f), "mol_1")).text();
  assert.match(body, /<h1>Edit order<\/h1>/);
  assert.match(body, /name="order_number" value="PH-000123"/);
  assert.match(body, /name="ordered_on" value="2026-11-12"[^>]*data-pk-date/);
  assert.match(body, /name="total" value="1450\.00"/);
  assert.match(body, /<form method="post" action="\/dashboard\/orders\/mol_1\/edit\/">/);
  assert.match(body, /<details class="mo-del" data-mo="delete"><summary>Delete this order<\/summary>\n<p>Delete this order from your log\?<\/p>\n<form method="post" action="\/dashboard\/orders\/mol_1\/delete\/">/);
  assert.deepEqual(f.calls.find((c) => c.path === "member/order-log/mol_1")!.body, { host: "demo.negosyotest.com", token: TOKEN });
});

test("a good edit posts the full replace to the order's update route and redirects with a notice", async () => {
  const f = setup({ "member/order-log/mol_1/update": [ok({ order: ORDER() })] });
  const r = await orderEditPost(dashOf(f), "mol_1", FORM);
  assert.equal(r.headers.get("location"), "/dashboard/orders/?saved=updated");
  assert.equal(Object.keys(f.calls.find((c) => c.path === "member/order-log/mol_1/update")!.body).length, 9);
});

test("an edit with an error re-renders the edit form (with its delete confirm) and the typed values", async () => {
  const f = setup({ "member/order-log/mol_1/update": [err(400, "invalid_order", "x", { city: ["Enter a city."] })] });
  const r = await orderEditPost(dashOf(f), "mol_1", { ...FORM, city: "" });
  assert.equal(r.status, 400);
  const body = await r.text();
  assert.match(body, /id="mo-city-msg">Enter a city\./);
  assert.match(body, /action="\/dashboard\/orders\/mol_1\/delete\/"/);
  assert.match(body, /name="customer_first_name" value="TEST Cora"/);
});

test("a 404 from the backend for an id (missing, or another member's) is the neutral not-found on edit, update and delete", async () => {
  const get = await orderEditGet(dashOf(setup({ "member/order-log/mol_9": [err(404, "not_found")] })), "mol_9");
  assert.equal(get.status, 404);
  const text = await get.text();
  assert.match(text, /Page not found\./);
  assert.doesNotMatch(text, /mol_9|Orders|Demo Store/);
  assert.equal((await orderEditPost(dashOf(setup({ "member/order-log/mol_9/update": [err(404, "not_found")] })), "mol_9", FORM)).status, 404);
  assert.equal((await orderDeletePost(dashOf(setup({ "member/order-log/mol_9/delete": [err(404, "not_found")] })), "mol_9")).status, 404);
});

test("an id that is not an order id is the neutral page with no call at all", async () => {
  const f = fake({});
  for (const id of ["../x", "1", "mol_", "mol_a b", "ord_1", "mol_" + "a".repeat(80)]) {
    assert.ok(!ORDER_ID.test(id));
    assert.equal((await orderEditGet(dashOf(f), id)).status, 404);
    assert.equal((await orderDeletePost(dashOf(f), id)).status, 404);
  }
  assert.equal(f.calls.length, 0);
});

/* ---- delete ------------------------------------------------------------------------------------------------------ */

test("delete calls the order's delete route and redirects to the list with a notice", async () => {
  const f = setup({ "member/order-log/mol_1/delete": [ok({ deleted: true })] });
  const r = await orderDeletePost(dashOf(f), "mol_1");
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/dashboard/orders/?saved=deleted");
  assert.deepEqual(f.calls.find((c) => c.path === "member/order-log/mol_1/delete")!.body, { host: "demo.negosyotest.com", token: TOKEN });
  assert.equal((await orderDeletePost(dashOf(setup({ "member/order-log/mol_1/delete": [err(500)] })), "mol_1")).status, 503);
});

test("the delete route refuses a post from another site before anything is read", async () => {
  const r = await deleteRoute(new Request("http://www.santetest.com/dashboard/orders/mol_1/delete/", { method: "POST", headers: { "sec-fetch-site": "cross-site", host: "www.santetest.com" } }), { params: Promise.resolve({ id: "mol_1" }) });
  assert.ok([403, 404].includes(r.status));
});

/* ---- export ------------------------------------------------------------------------------------------------------ */

const CSV = "\uFEFFPH #,Date,Customer,City,Payment,Total,Status\r\nPH-000123,2026-11-12,TEST Ana,Quezon City,COD,1450.00,For approval\r\n";

test("the export passes the backend's CSV through with its headers, sending the page's filters", async () => {
  const f = setup({ "member/order-log/export": [{ status: 200, text: CSV, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="orders-2026-11-15.csv"' } }] });
  const r = await ordersExport(dashOf(f, "/dashboard/orders/export.csv?q=ana&status=delivered&from=2026-11-01&page=4"));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(r.headers.get("content-disposition"), 'attachment; filename="orders-2026-11-15.csv"');
  assert.match(r.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(new TextDecoder("utf-8", { ignoreBOM: true }).decode(await r.arrayBuffer()), CSV); // BOM and escaping untouched
  assert.deepEqual(f.calls.find((c) => c.path === "member/order-log/export")!.body, { host: "demo.negosyotest.com", token: TOKEN, q: "ana", status: "delivered", date_from: "2026-11-01" });
});

test("the export builds its own file name when the backend's header is not the expected shape, and never passes odd headers on", async () => {
  const f = setup({ "member/order-log/export": [{ status: 200, text: CSV, headers: { "content-disposition": 'attachment; filename="../../x.html"', "set-cookie": "a=b" } }] });
  const r = await ordersExport(dashOf(f));
  assert.equal(r.headers.get("content-disposition"), 'attachment; filename="orders-2026-11-15.csv"');
  assert.equal(r.headers.get("set-cookie"), null);
});

test("an export for a dead session goes home; a failed one says to try again; a switched-off log is neutral", async () => {
  assert.equal((await ordersExport(dashOf(setup({ "member/order-log/export": [err(401)] })))).headers.get("location"), "/");
  assert.equal((await ordersExport(dashOf(setup({ "member/order-log/export": [err(500)] })))).status, 503);
  assert.equal((await ordersExport(dashOf(setup({ "member/order-log/export": [err(404)] })))).status, 404);
});

/* ---- small helpers ----------------------------------------------------------------------------------------------- */

test("money and dates are written from the digits", () => {
  assert.equal(pesoText("1450.5"), "₱1,450.50");
  assert.equal(pesoText("0.00"), "₱0.00");
  assert.equal(pesoText("1000000000.00"), "₱1,000,000,000.00");
  assert.equal(pesoText("12345"), "₱12,345.00");
  assert.equal(dateText("2026-01-05"), "Jan 5, 2026");
  assert.equal(dateText("bad"), "bad");
});

test("every Orders log call goes under member/order-log/, never to the pack's member/orders/", async () => {
  const f = setup({ "member/me": Array.from({ length: 6 }, () => ME), "member/pack": Array.from({ length: 6 }, () => FREE), "member/order-log": [ok(LIST())], "member/order-log/create": [{ status: 201, body: { order: ORDER() } }], "member/order-log/mol_1": [ok({ order: ORDER() })],
    "member/order-log/mol_1/update": [ok({ order: ORDER() })], "member/order-log/mol_1/delete": [ok({ deleted: true })], "member/order-log/export": [{ status: 200, text: CSV }] });
  const d = () => dashOf(f);
  await ordersPage(d()); await orderAddPost(d(), FORM); await orderEditGet(d(), "mol_1"); await orderEditPost(d(), "mol_1", FORM); await orderDeletePost(d(), "mol_1"); await ordersExport(d());
  const paths = f.calls.map((c) => c.path).filter((p) => !["member/me", "member/pack"].includes(p));
  assert.equal(paths.length, 6);
  for (const p of paths) assert.match(p, /^member\/order-log(\/|$)/);
  assert.ok(!f.calls.some((c) => c.path === "member/orders"));
});
