/* Orders > Product Orders (ClickUp z8uq9mekuw): the Subscriber confirms, cancels, ships and delivers Santé shop orders.
   Driven like pack.test.mjs: the real app.js helpers, a small stand-in document (dom.mjs) and a recorded fetch that answers
   the owner API's shop orders routes (backend apps/shop/api_owner.py). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const JS = path.join(PUBLIC, "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const HTML = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const BASE = `/sites/${A}/shop/orders/`;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 12; i++) await tick(); };
const TODAY = (() => { const o = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).forEach((p) => { o[p.type] = p.value; }); return `${o.year}-${o.month}-${o.day}`; })();

const row = (o) => ({ id: "so_1", order_number: "SO00001", receiver_name: "Maria Santos", mobile_masked: "+63917***0142", buyer_kind: "guest", ship_mode: "guest",
  payment_status: "pending_review", status: "placed", subtotal_centavos: 250000, shipping_charged_centavos: 0, total_centavos: 250000, currency: "PHP",
  created_at: "2026-11-12T01:14:00+00:00", state_version: 3, ...o });
const ROWS = [
  row({}),
  row({ id: "so_2", order_number: "SO00002", receiver_name: "Carlo Mendoza", buyer_kind: "member", ship_mode: "home", payment_status: "verified", status: "confirmed", total_centavos: 99000, state_version: 4 }),
  row({ id: "so_3", order_number: "SO00003", receiver_name: "Liza Ramos", payment_status: "verified", status: "shipped", total_centavos: 51000, state_version: 5 }),
  row({ id: "so_4", order_number: "SO00004", receiver_name: "Dino Reyes", payment_status: "verified", status: "delivered", state_version: 6 }),
  row({ id: "so_5", order_number: "SO00005", receiver_name: "Ana Cruz", ship_mode: "different", payment_status: "cancelled", status: "cancelled", state_version: 7 }),
];
const proof = (o) => ({ id: "prf_1", account_kind: "ewallet", account_provider_name: "GCash", account_name: "Santé Barley PH", account_number_last4: "4821", reference_number: "6204 118 337",
  amount_sent_centavos: 250000, content_type: "image/png", submitted_at: "2026-11-12T01:14:00+00:00", ...o });
const detailOf = (r, o) => ({ ...r, contact_email: "maria@example.test", receiver_mobile: "09171230142", shipping_policy: "zero", shipping_computed_centavos: 0, courier: "", tracking_no: "",
  shipped_on: null, delivered_on: null, verified_at: null, cancelled_at: null, cancel_note: "",
  delivery_address: { line: "12 Mabini St", barangay: "Bagumbayan", city: "Quezon City", province: "Metro Manila", zip: "1110", landmark: "Near the church" },
  lines: [{ code: "SB-1", name: "Barley Pouch", quantity: 2, srp_centavos: 100000, line_srp_total_centavos: 200000, line_members_total_centavos: 180000, line_charged_centavos: 200000 },
    { code: "SB-2", name: "Barley Box", quantity: 1, srp_centavos: 50000, line_srp_total_centavos: 50000, line_members_total_centavos: 45000, line_charged_centavos: 50000 }],
  proof: proof({}), events: [{ kind: "placed", note: "", actor_type: "buyer", actor_label: "", created_at: "2026-11-12T01:14:00+00:00" }], ...o });
const DETAIL = {
  so_1: detailOf(ROWS[0]),
  so_3: detailOf(ROWS[2], { courier: "LBC", tracking_no: "LBC123", shipped_on: "2026-11-12", verified_at: "2026-11-12T02:00:00+00:00",
    events: [{ kind: "placed", note: "", actor_type: "buyer", actor_label: "", created_at: "2026-11-12T01:14:00+00:00" },
      { kind: "verified", note: "", actor_type: "subscriber", actor_label: "store@example.test", created_at: "2026-11-12T02:00:00+00:00" },
      { kind: "shipped", note: "", actor_type: "subscriber", actor_label: "store@example.test", created_at: "2026-11-12T03:00:00+00:00" }] }),
  so_5: detailOf(ROWS[4], { cancel_note: "Payment never arrived.", proof: proof({ content_type: "application/pdf" }),
    events: [{ kind: "cancelled", note: "Payment never arrived.", actor_type: "subscriber", actor_label: "store@example.test", created_at: "2026-11-12T04:00:00+00:00" }] }),
};

function soDocument() {
  const doc = makeDocument(), make = doc.createElement;
  doc.createElement = (tag) => {
    const n = make(tag), plain = n.querySelector.bind(n);
    n.querySelector = (sel) => (/^[a-z]+(\s*,\s*[a-z]+)*$/.test(sel) ? n.querySelectorAll(sel)[0] || null : plain(sel));
    n.click = () => n.fire("click");
    return n;
  };
  doc.createTextNode = (t) => { const n = doc.createElement("#text"); n.text = String(t); return n; };
  doc.documentElement = doc.createElement("html");
  return doc;
}

function boot({ rows = ROWS, listStatus = 200, detail = DETAIL, proofStatus = 200, writeStatus = 200, writeBody } = {}) {
  const doc = soDocument(), calls = [], toasts = [], opened = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  const tabs = doc.createElement("nav"); tabs.setAttribute("id", "shop-tabs"); page.appendChild(tabs);
  for (const t of ["overview", "products", "package"]) { const a = doc.createElement("a"); a.setAttribute("data-tab", t); a.textContent = t; tabs.appendChild(a); }
  for (const id of ["so-sub", "so-body", "so-dlg-slot"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const state = { rows: rows.map((r) => ({ ...r })) };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method || "GET", path: p, body, credentials: opts.credentials });
    const res = (status, b) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(b), blob: () => Promise.resolve({ blob: true }) });
    const m = /^\/sites\/site_[0-9a-z]{20}\/shop\/orders\/(?:([a-z0-9_]+)\/(?:(confirm-receipt|cancel|ship|deliver)\/|proofs\/([a-z0-9_]+)\/)?)?(?:\?filter=(\w+))?$/.exec(p);
    if (p === "/sites/") return res(200, { items: [{ id: A, template: "sante" }], next_cursor: null });
    if (!m) return res(404, { error: { code: "not_found", message: "Not found." } });
    if (!m[1]) return res(listStatus, listStatus === 200 ? { orders: state.rows } : { error: { code: "x", message: "Broken." } });
    if (m[3]) return proofStatus === 200 ? res(200, {}) : res(proofStatus, {});
    if (m[2]) {
      if (writeStatus !== 200) return res(writeStatus, writeBody || { error: { code: "stale", message: "This order changed. Reload it and try again." } });
      const o = state.rows.find((r) => r.id === m[1]);
      Object.assign(o, { "confirm-receipt": { payment_status: "verified", status: "confirmed" }, cancel: { payment_status: "cancelled", status: "cancelled" }, ship: { status: "shipped" }, deliver: { status: "delivered" } }[m[2]]);
      o.state_version++;
      return res(200, { ...o });
    }
    return detail[m[1]] ? res(200, detail[m[1]]) : res(404, { error: { code: "not_found", message: "Not found." } });
  };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800,
    open: (u, t, f) => { opened.push([u, t, f]); } };
  const URLs = { createObjectURL: () => "blob:test/" + (opened.length + calls.length), revokeObjectURL() {} };
  const context = vm.createContext({ window, document: doc, location: { search: "", pathname: "/orders/products/", replace() {}, assign() {} }, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, FormData,
    localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch, URL: URLs });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("shop-orders.js"), context, { filename: "shop-orders.js" });
  window.NODash.toast = (title, text, kind) => toasts.push([title, text || "", kind || "ok"]);
  const $ = (id) => doc.getElementById(id), body = $("so-body");
  const cls = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label, i = 0) => buttons(n).filter((b) => b.textContent === label)[i];
  const slot = () => $("so-dlg-slot");
  return { doc, calls, toasts, opened, state, $, body, cls, buttons, press, page, tabs, slot,
    list: () => calls.map((c) => c.method + " " + c.path),
    async show() { window.NOShopOrders.show(); await settle(); },
    api: window.NOShopOrders };
}

test("the page: a view of its own with the tab bar copy, the slots and no inline script; Package Order's tab bar is untouched", () => {
  const view = /<section class="view" id="view-shop-orders"[\s\S]*?<\/section>/.exec(HTML)[0];
  assert.ok(view.includes('id="shop-tabs"') && view.includes('id="h-shop-orders"') && view.includes('id="so-body"') && view.includes('id="so-dlg-slot"') && view.includes('id="so-sub"'));
  assert.deepEqual([...view.matchAll(/<a href="([^"]+)" data-tab="(\w+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2], m[3]]),
    [["#", "overview", "Overview"], ["/orders/products/", "products", "Product Orders"], ["/orders/", "package", "Package Order"]]);
  assert.ok(view.includes('data-tab="products" aria-current="page"'));
  const pack = /<section class="view" id="view-orders"[\s\S]*?<\/section>/.exec(HTML)[0];
  assert.deepEqual([...pack.matchAll(/<a href="#" data-tab="(\w+)"/g)].map((m) => m[1]), ["overview", "product", "pack", "registrations"], "the Package Order view keeps its tabs and adds Registrations");
  assert.ok(HTML.includes('/assets/css/shop-orders.css?v=') && HTML.includes('/assets/js/shop-orders.js?v='));
  assert.ok(HTML.indexOf("pack-orders.css") < HTML.indexOf("shop-orders.css"), "the Package Order styles load first");
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(HTML), "no inline script");
});

test("the new view is a sibling of the other views, not nested inside one (a nested view stays hidden with its parent)", () => {
  const depth = {}; let d = 0;
  for (const m of HTML.matchAll(/<section\b[^>]*>|<\/section>/g)) {
    if (m[0] === "</section>") { d--; continue; }
    const id = /\bid="([^"]+)"/.exec(m[0]);
    if (id) depth[id[1]] = d;
    d++;
  }
  assert.ok(depth["view-shop-orders"] !== undefined && depth["view-orders"] !== undefined);
  assert.equal(depth["view-shop-orders"], depth["view-orders"]);
  assert.equal(depth["view-orders-new"], depth["view-orders"]);
  assert.equal(depth["view-products"], depth["view-orders"]);
});

test("dashboard.js: the route /orders/products/ opens the new view, keeps Orders current, and enters and leaves the screen", () => {
  const src = read("dashboard.js");
  assert.ok(/"\/orders\/products\/": \{ view: "shop-orders", nav: "orders"/.test(src));
  assert.ok(/VIEWS = \[[^\]]*"shop-orders"/.test(src) && /TAB_VIEWS = \[[^\]]*"shop-orders"/.test(src));
  assert.ok(/NOShopOrders[\s\S]{0,400}SO\.show\(\)/.test(src) && /SO\.hide\(\)/.test(src));
  assert.ok(/r\.nav \|\| r\.view/.test(src), "the Orders menu link stays current");
  assert.ok(/"orders-tabs"[\s\S]{0,700}go\("\/orders\/products\/"\)[\s\S]{0,40}true\)/.test(src), "Package Order's Product Orders tab is taken in the capture phase");
});

test("the Product Orders link in Package Order's tab bar reaches the route although pack-orders.js cancels tab clicks", async () => {
  const vm2 = await import("node:vm");
  const pushed = [], listeners = {}, nodes = {};
  const mk = (id) => (nodes[id] = nodes[id] || { id, hidden: false, textContent: "", focus() {}, setAttribute() {}, removeAttribute() {}, appendChild() {}, addEventListener(t, fn, cap) { (listeners[id + ":" + t] = listeners[id + ":" + t] || []).push([fn, cap]); } });
  const location = { pathname: "/orders/", search: "" };
  const history = { replaceState() {}, pushState(a, b, url) { pushed.push(url); location.pathname = url; } };
  const document = { readyState: "complete", title: "", getElementById: mk, querySelectorAll: () => [], addEventListener() {}, createElement: () => mk("x") };
  const window = { addEventListener() {}, NODash: { el: () => mk("x"), requireAccount: () => ({ then(fn) { window.start = fn; } }), cfg: {}, setWorkspace() {}, call: () => new Promise(() => {}) } };
  window.NOShopOrders = { shown: 0, hidden: 0, show() { this.shown++; }, hide() { this.hidden++; } };
  vm2.runInContext(read("dashboard.js"), vm2.createContext({ window, document, location, history, console, Intl, Promise, setTimeout, clearTimeout }), { filename: "dashboard.js" });
  window.start({ first_name: "Nena" });
  const hooks = listeners["orders-tabs:click"];
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0][1], true, "a capture listener, so it runs before the tab handlers of pack-orders.js");
  const link = (tab) => ({ getAttribute: (k) => (k === "data-tab" ? tab : null) });
  const click = (tab, extra) => { const e = { target: { closest: () => link(tab) }, button: 0, stopped: false, prevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; }, ...extra }; hooks[0][0](e); return e; };
  const other = click("overview"); assert.equal(other.stopped, false); assert.deepEqual(pushed, []);
  const mod = click("product", { ctrlKey: true }); assert.equal(mod.stopped, false, "a modified click is left to the browser");
  const e = click("product");
  assert.equal(e.stopped && e.prevented, true);
  assert.deepEqual(pushed, ["/orders/products/"]);
  assert.equal(window.NOShopOrders.shown, 1);
  assert.equal(document.title, "Product Orders | NegosyoOnline");
  assert.equal(nodes["view-shop-orders"].hidden, false);
  assert.equal(nodes["view-orders"].hidden, true);
});

test("the list: three stage tiles, the To review queue, the table, and the line under the title, from one read of the orders", async () => {
  const d = boot();
  await d.show();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE + "?filter=all"]);
  assert.equal(d.calls[1].credentials, "include");
  assert.deepEqual(d.cls(d.body, "mc-stage").map((b) => b.textContent), ["1Under review", "1To ship", "2Shipped"]);
  assert.equal(d.$("so-sub").textContent, "Track every product order from payment to delivery · 5 under current filters");
  assert.equal(d.cls(d.body, "mc-queue-title")[0].textContent, "To review");
  const ticket = d.cls(d.body, "mc-ticket")[0];
  assert.equal(d.cls(ticket, "mc-order")[0].textContent, "SO00001");
  assert.equal(d.cls(ticket, "mc-cust")[0].textContent, "Maria Santos");
  assert.equal(d.cls(ticket, "mc-items")[0].textContent, "Guest · Address entered at checkout");
  assert.equal(d.cls(ticket, "mc-meta")[0].textContent, "Bank or e-wallet transfer · ₱2,500.00Placed Nov 12, 9:14 AM");
  assert.deepEqual(d.buttons(ticket).map((b) => b.textContent), ["Confirm payment received", "Cancel order…", "Details ▾"]);
  assert.ok(d.cls(d.body, "mc-th")[0].textContent.startsWith("Order #CustomerPayment"));
  assert.deepEqual(d.cls(d.cls(d.body, "mc-th")[0], "r").concat(d.cls(d.cls(d.body, "mc-th")[0], "c")).map((n) => n.textContent), ["Total", "Status", "Action"]);
  const rows = d.cls(d.body, "mc-rowwrap");
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => d.cls(r, "chip").map((c) => c.textContent)), [["Under review"], ["To ship"], ["Shipped"], ["Delivered"], ["Cancelled"]]);
  assert.ok(d.cls(rows[0], "mc-pointer")[0].textContent.endsWith("In the review queue"));
  assert.deepEqual(d.buttons(rows[1]).map((b) => b.textContent), ["Mark shipped…", "Details ▾"]);
  assert.deepEqual(d.buttons(rows[2]).map((b) => b.textContent), ["Mark delivered…", "Details ▾"]);
  assert.deepEqual(d.buttons(rows[3]).map((b) => b.textContent), ["Details ▾"]);
  assert.deepEqual(d.buttons(rows[4]).map((b) => b.textContent), ["Details ▾"]);
  assert.equal(d.cls(rows[1], "num")[0].textContent, "₱990.00");
  assert.equal(d.cls(d.cls(d.body, "mc-ticket")[0].parentNode, "mc-ticket").length, 1, "only the order under review is in the queue");
  assert.ok(!d.body.textContent.includes("Search") && d.cls(d.body, "mc-pager").length === 0, "no search and no pagination");
});

test("a stage tile filters the table, the clear line brings every order back, and the queue stays", async () => {
  const d = boot();
  await d.show();
  d.cls(d.body, "mc-stage")[2].fire("click");
  assert.deepEqual(d.cls(d.body, "mc-rowwrap").map((r) => d.cls(r, "mc-order")[0].textContent), ["SO00003", "SO00004"], "Shipped holds shipped and delivered orders");
  assert.equal(d.cls(d.body, "mc-ticket").length, 1, "the To review queue is not filtered away");
  assert.equal(d.cls(d.body, "mc-stage")[2].getAttribute("aria-pressed"), "true");
  assert.equal(d.$("so-sub").textContent, "Track every product order from payment to delivery · 2 under current filters");
  const clear = d.cls(d.body, "mc-clear")[0];
  assert.equal(clear.textContent, "× Clear status filter — showing all 5 orders");
  clear.querySelector("button").fire("click");
  assert.equal(d.cls(d.body, "mc-rowwrap").length, 5);
  d.cls(d.body, "mc-stage")[1].fire("click");
  d.cls(d.body, "mc-stage")[1].fire("click");
  assert.equal(d.cls(d.body, "mc-rowwrap").length, 5, "pressing the active tile again clears the filter");
});

test("states: loading, empty (also a site without the shop: 404), error with Try again, and the Overview placeholder tab", async () => {
  const d0 = boot();
  d0.api.show();
  assert.ok(d0.cls(d0.body, "po-skel").length === 1 && d0.cls(d0.body, "po-skel")[0].getAttribute("role") === "status", "a loading state first");
  await settle();

  const empty = boot({ rows: [] });
  await empty.show();
  assert.deepEqual(empty.body.all((n) => n.tagName === "H2").map((n) => n.textContent), ["No product orders yet"]);
  assert.ok(empty.body.textContent.includes("Orders show here when someone buys a product from your store."));

  const off = boot({ listStatus: 404 });
  await off.show();
  assert.deepEqual(off.body.all((n) => n.tagName === "H2").map((n) => n.textContent), ["No product orders yet"]);

  const broken = boot({ listStatus: 500 });
  await broken.show();
  assert.ok(broken.body.textContent.includes("We could not load your orders"));
  assert.equal(broken.cls(broken.body, "po-err")[0].getAttribute("role"), "alert");
  broken.press(broken.body, "Try again").fire("click");
  await settle();
  assert.equal(broken.calls.filter((c) => c.path === "/sites/").length, 2, "Try again reads again");

  const d = boot();
  await d.show();
  d.tabs.all((n) => n.tagName === "A")[0].fire("click");
  assert.deepEqual(d.body.all((n) => n.tagName === "H2").map((n) => n.textContent), ["Overview"]);
  assert.equal(d.$("so-sub").hidden, true);
  assert.deepEqual(d.tabs.all((n) => n.getAttribute("aria-current") === "page").map((n) => n.textContent), ["overview"]);
  d.tabs.all((n) => n.tagName === "A")[1].fire("click");
  assert.equal(d.cls(d.body, "mc-pipe").length, 1);
  const pk = d.tabs.all((n) => n.tagName === "A")[2].fire("click");
  assert.equal(pk.prevented, false, "Package Order is a plain route link");
});

test("Details: loads the order, then the proof as a blob; lines, delivery, payment and history from the API", async () => {
  const d = boot();
  await d.show();
  d.press(d.cls(d.body, "mc-ticket")[0], "Details ▾").fire("click");
  await settle();
  assert.deepEqual(d.list().slice(2), ["GET " + BASE + "so_1/", "GET " + BASE + "so_1/proofs/prf_1/"]);
  assert.equal(d.calls[3].credentials, "include");
  const detail = d.cls(d.body, "mc-detail")[0];
  assert.deepEqual(d.cls(detail, "po-card").map((c) => c.all((x) => x.tagName === "H3")[0].textContent), ["Payment proof", "History", "Items", "Delivery", "Payment details"]);
  const img = detail.all((n) => n.tagName === "IMG")[0];
  assert.ok(/^blob:/.test(img.getAttribute("src")), "the proof is drawn from a blob");
  assert.ok(!/api\.test|\/proofs\//.test(JSON.stringify(d.page.all(() => true).map((n) => n.attrs))), "no proof URL in any attribute");
  const text = detail.textContent;
  for (const s of ["Barley Pouch", "2 × ₱1,000.00", "₱2,000.00", "Barley Box", "Subtotal₱2,500.00", "None charged", "Order total₱2,500.00",
    "Maria Santos", "09171230142", "maria@example.test", "Address entered at checkout", "12 Mabini St, Bagumbayan, Quezon City, Metro Manila, 1110", "Near the church",
    "GCash · E-wallet", "Santé Barley PH", "ending 4821", "Amount sent₱2,500.00", "6204 118 337", "Order placed", "The buyer"]) assert.ok(text.includes(s), s);
  assert.deepEqual(d.cls(d.cls(detail, "po-card")[0], "po-actions")[0].all((n) => n.tagName === "BUTTON").map((b) => b.textContent), ["Open", "Download"]);
  d.press(detail, "Open").fire("click");
  assert.equal(d.opened.length, 1);
  assert.equal(d.opened[0][2], "noopener");
  d.press(d.cls(d.body, "mc-ticket")[0], "Details ▴").fire("click");
  assert.equal(d.cls(d.body, "mc-detail").length, 0, "Details closes again");
});

test("Details of a shipped order shows the shipment; of a cancelled order with a PDF proof, the note and the file card", async () => {
  const d = boot();
  await d.show();
  d.press(d.cls(d.body, "mc-rowwrap")[2], "Details ▾").fire("click");
  await settle();
  let detail = d.cls(d.body, "mc-detail")[0];
  assert.deepEqual(d.cls(detail, "po-card").map((c) => c.all((x) => x.tagName === "H3")[0].textContent), ["Payment proof", "History", "Items", "Delivery", "Shipment", "Payment details"]);
  for (const s of ["CourierLBC", "Tracking numberLBC123", "Shipped on12 Nov 2026", "Payment confirmed", "Marked shipped", "store@example.test"]) assert.ok(detail.textContent.includes(s), s);
  assert.ok(!detail.textContent.includes("Delivered on"), "no delivery date yet");
  d.press(d.cls(d.body, "mc-rowwrap")[2], "Details ▴").fire("click");
  d.press(d.cls(d.body, "mc-rowwrap")[4], "Details ▾").fire("click");
  await settle();
  detail = d.cls(d.body, "mc-detail")[0];
  assert.equal(detail.all((n) => n.tagName === "IMG").length, 0);
  assert.ok(detail.textContent.includes("proof-SO00005.pdf"));
  assert.ok(detail.textContent.includes("CancellationCancel notePayment never arrived."));
  assert.ok(detail.textContent.includes("Order cancelled"));
});

test("a proof that does not load shows the error with Try again, and Try again reads it again", async () => {
  const d = boot({ proofStatus: 500 });
  await d.show();
  d.press(d.cls(d.body, "mc-ticket")[0], "Details ▾").fire("click");
  await settle();
  const err = d.cls(d.body, "po-err")[0];
  assert.ok(err.textContent.includes("The proof did not load"));
  err.all((n) => n.tagName === "BUTTON")[0].fire("click");
  await settle();
  assert.equal(d.calls.filter((c) => /proofs/.test(c.path)).length, 2);
});

test("a detail that does not load shows the error and Try again", async () => {
  const d = boot({ detail: {} });
  await d.show();
  d.press(d.cls(d.body, "mc-ticket")[0], "Details ▾").fire("click");
  await settle();
  assert.ok(d.body.textContent.includes("We could not load this order"));
});

test("Confirm payment received is one click: POST with the order's state_version, a toast, and the list read again", async () => {
  const d = boot();
  await d.show();
  d.press(d.cls(d.body, "mc-ticket")[0], "Confirm payment received").fire("click");
  await settle();
  assert.deepEqual(d.calls[2], { method: "POST", path: BASE + "so_1/confirm-receipt/", body: { state_version: 3 }, credentials: "include" });
  assert.deepEqual(d.toasts, [["Payment confirmed", "", "ok"]]);
  assert.equal(d.calls[3].path, BASE + "?filter=all");
  assert.deepEqual(d.cls(d.body, "mc-stage").map((b) => b.textContent), ["0Under review", "2To ship", "2Shipped"]);
  assert.equal(d.cls(d.body, "mc-ticket").length, 0, "the queue is empty now");
});

test("an order that changed (409 stale): the stale message as an error toast and the list read again", async () => {
  const d = boot({ writeStatus: 409 });
  await d.show();
  d.press(d.cls(d.body, "mc-ticket")[0], "Confirm payment received").fire("click");
  await settle();
  assert.deepEqual(d.toasts, [["This order changed. Reload it and try again.", "", "error"]]);
  assert.equal(d.calls.filter((c) => c.path === BASE + "?filter=all").length, 2);
});

test("Cancel order…: the note is required, then the POST with the note, a toast, and the dialog closes", async () => {
  const d = boot();
  await d.show();
  const opener = d.press(d.cls(d.body, "mc-ticket")[0], "Cancel order…");
  opener.fire("click");
  const dlg = d.slot().all((n) => n.classList.contains("po-dialog"))[0];
  assert.equal(dlg.getAttribute("role"), "dialog");
  assert.equal(dlg.getAttribute("aria-modal"), "true");
  assert.equal(dlg.all((n) => n.tagName === "H2")[0].textContent, "Cancel order SO00001");
  assert.deepEqual(d.slot().all((n) => n.tagName === "LABEL").map((l) => l.textContent), ["Note to the buyer (required)"]);
  d.press(d.slot(), "Confirm cancel").fire("click");
  await settle();
  assert.equal(d.calls.length, 2, "nothing is sent without a note");
  assert.equal(d.slot().all((n) => n.classList.contains("po-error") && !n.hidden)[0].textContent, "Write a note of 1 to 500 characters.");
  d.press(d.slot(), "Confirm cancel").fire("click");
  const ta = d.$("so-f-note"); ta.value = "   "; ta.fire("input");
  d.press(d.slot(), "Confirm cancel").fire("click");
  assert.equal(d.calls.length, 2, "a blank note is not a note");
  ta.value = "Payment never arrived."; ta.fire("input");
  d.press(d.slot(), "Confirm cancel").fire("click");
  await settle();
  assert.deepEqual(d.calls[2], { method: "POST", path: BASE + "so_1/cancel/", body: { state_version: 3, note: "Payment never arrived." }, credentials: "include" });
  assert.deepEqual(d.toasts, [["Order cancelled", "", "ok"]]);
  assert.equal(d.slot().all(() => true).length, 0, "the dialog closes");
  assert.deepEqual(d.cls(d.body, "mc-rowwrap").map((r) => d.cls(r, "chip")[0].textContent).slice(-1), ["Cancelled"]);
});

test("Escape closes the dialog and returns focus; the Back button closes it", async () => {
  const d = boot();
  await d.show();
  const op = d.press(d.cls(d.body, "mc-ticket")[0], "Cancel order…");
  op.fire("click");
  const key = d.doc.fire("keydown", { key: "Escape" });
  assert.equal(key.prevented, true);
  assert.equal(d.slot().all(() => true).length, 0);
  assert.equal(d.doc.activeElement, op);
  op.fire("click");
  d.press(d.slot(), "Back").fire("click");
  assert.equal(d.slot().all(() => true).length, 0);
  assert.equal(d.calls.length, 2);
});

test("Mark shipped…: courier is required; tracking and date go with it; the date starts at today (Manila)", async () => {
  const d = boot();
  await d.show();
  d.press(d.cls(d.body, "mc-rowwrap")[1], "Mark shipped…").fire("click");
  assert.equal(d.slot().all((n) => n.tagName === "H2")[0].textContent, "Mark order shipped SO00002");
  assert.deepEqual(d.slot().all((n) => n.tagName === "LABEL").map((l) => l.textContent), ["Courier (required)", "Tracking number (optional)", "Shipped on"]);
  assert.equal(d.$("so-f-shipped_on").value, TODAY);
  assert.equal(d.$("so-f-shipped_on").getAttribute("max"), TODAY, "no date in the future");
  d.press(d.slot(), "Mark shipped").fire("click");
  assert.equal(d.calls.length, 2, "nothing is sent without a courier");
  assert.equal(d.slot().all((n) => n.classList.contains("po-error") && !n.hidden)[0].textContent, "Enter the courier.");
  d.$("so-f-courier").value = "LBC"; d.$("so-f-courier").fire("input");
  d.$("so-f-tracking_no").value = " LBC-99 "; d.$("so-f-tracking_no").fire("input");
  d.press(d.slot(), "Mark shipped").fire("click");
  await settle();
  assert.deepEqual(d.calls[2], { method: "POST", path: BASE + "so_2/ship/", body: { state_version: 4, courier: "LBC", tracking_no: "LBC-99", shipped_on: TODAY }, credentials: "include" });
  assert.deepEqual(d.toasts, [["Order marked as shipped", "", "ok"]]);
  assert.deepEqual(d.cls(d.body, "mc-stage").map((b) => b.textContent), ["1Under review", "0To ship", "3Shipped"]);
});

test("Mark shipped…: each error is linked to its field (aria-describedby), focus lands on the first bad field, and the link clears when fixed", async () => {
  const d = boot();
  await d.show();
  d.press(d.cls(d.body, "mc-rowwrap")[1], "Mark shipped…").fire("click");
  d.press(d.slot(), "Mark shipped").fire("click");
  const c = d.$("so-f-courier");
  assert.equal(c.getAttribute("aria-invalid"), "true");
  assert.equal(c.getAttribute("aria-describedby"), "so-f-courier-err");
  assert.equal(d.$("so-f-courier-err").textContent, "Enter the courier.");
  assert.equal(d.$("so-f-tracking_no").getAttribute("aria-describedby"), null);
  assert.equal(d.doc.activeElement, c);
  c.value = "LBC"; c.fire("input");
  assert.equal(c.getAttribute("aria-describedby"), null);
  assert.equal(c.getAttribute("aria-invalid"), null);
});

test("Mark shipped…: a future date alone puts focus on the date, linked to its message", async () => {
  const d = boot();
  await d.show();
  d.press(d.cls(d.body, "mc-rowwrap")[1], "Mark shipped…").fire("click");
  const c = d.$("so-f-courier"); c.value = "LBC"; c.fire("input");
  const dt = d.$("so-f-shipped_on"); dt.value = "2999-01-01"; dt.fire("input");
  d.press(d.slot(), "Mark shipped").fire("click");
  assert.equal(dt.getAttribute("aria-invalid"), "true");
  assert.equal(dt.getAttribute("aria-describedby"), "so-f-shipped_on-err");
  assert.equal(d.$("so-f-shipped_on-err").textContent, "Enter a valid date that is not in the future.");
  assert.equal(c.getAttribute("aria-describedby"), null);
  assert.equal(d.doc.activeElement, dt);
  dt.value = TODAY; dt.fire("input");
  assert.equal(dt.getAttribute("aria-describedby"), null);
});

test("a server answer on a field (422) shows under that field and keeps the dialog open", async () => {
  const d = boot({ writeStatus: 422, writeBody: { error: { code: "courier_required", message: "Enter the courier.", fields: { courier: ["Enter the courier."] } } } });
  await d.show();
  d.press(d.cls(d.body, "mc-rowwrap")[1], "Mark shipped…").fire("click");
  d.$("so-f-courier").value = "LBC"; d.$("so-f-courier").fire("input");
  d.press(d.slot(), "Mark shipped").fire("click");
  await settle();
  assert.equal(d.slot().all((n) => n.classList.contains("po-error") && !n.hidden)[0].textContent, "Enter the courier.");
  assert.equal(d.$("so-f-courier").getAttribute("aria-invalid"), "true");
  assert.deepEqual(d.toasts, []);
});

test("a stale ship inside the dialog says so in the dialog, which stays open, and the list is read again", async () => {
  const d = boot({ writeStatus: 409 });
  await d.show();
  d.press(d.cls(d.body, "mc-rowwrap")[1], "Mark shipped…").fire("click");
  d.$("so-f-courier").value = "LBC";
  d.press(d.slot(), "Mark shipped").fire("click");
  await settle();
  assert.equal(d.slot().all((n) => n.classList.contains("po-error") && !n.hidden)[0].textContent, "This order changed. Reload it and try again.");
  assert.equal(d.calls.filter((c) => c.path === BASE + "?filter=all").length, 2);
  assert.deepEqual(d.toasts, []);
});

test("Mark delivered…: the date, then the POST; the order becomes Delivered", async () => {
  const d = boot();
  await d.show();
  d.press(d.cls(d.body, "mc-rowwrap")[2], "Mark delivered…").fire("click");
  assert.equal(d.slot().all((n) => n.tagName === "H2")[0].textContent, "Mark order delivered SO00003");
  d.press(d.slot(), "Mark delivered").fire("click");
  await settle();
  assert.deepEqual(d.calls[2], { method: "POST", path: BASE + "so_3/deliver/", body: { state_version: 5, delivered_on: TODAY }, credentials: "include" });
  assert.deepEqual(d.toasts, [["Order marked as delivered", "", "ok"]]);
  assert.deepEqual(d.cls(d.cls(d.body, "mc-rowwrap")[2], "chip").map((c) => c.textContent), ["Delivered"]);
  assert.deepEqual(d.buttons(d.cls(d.body, "mc-rowwrap")[2]).map((b) => b.textContent), ["Details ▾"]);
});

test("while an action runs a second click sends nothing; leaving the screen closes the dialog", async () => {
  const d = boot();
  await d.show();
  const b = d.press(d.cls(d.body, "mc-ticket")[0], "Confirm payment received");
  b.fire("click"); b.fire("click");
  await settle();
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 1);
  const e = boot();
  await e.show();
  e.press(e.cls(e.body, "mc-ticket")[0], "Cancel order…").fire("click");
  e.api.hide();
  assert.equal(e.slot().all(() => true).length, 0);
});

test("the code builds with textContent only (no innerHTML), and the styles hold no gold focus", () => {
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(read("shop-orders.js")));
  const css = fs.readFileSync(path.join(PUBLIC, "assets", "css", "shop-orders.css"), "utf8");
  assert.ok(!/gold|#c59a3b|#f2d99b|197,\s*154,\s*59/i.test(css), "no gold focus border");
  assert.ok(/\.so-input:focus[\s\S]{0,120}var\(--link\)/.test(css), "the input focus border is the dash's light blue");
});
