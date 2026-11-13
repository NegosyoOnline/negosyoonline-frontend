/* Orders > Package Order (ClickUp z8uq9me9qw, PK10): the Subscriber reviews Membership Package payment proofs.
   Driven like payments.test.mjs: the real app.js helpers, a small stand-in document (dom.mjs) and a recorded fetch that
   answers the owner API's pack orders routes (docs/runbooks/membership-package-routes.md, "Subscriber order review"). */
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
const BASE = `/sites/${A}/pack/orders/`;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 12; i++) await tick(); };

const sub = (o) => ({ id: "prf_1", seq: 1, account_kind: "ewallet", account_provider_name: "GCash", account_name: "Santé Barley PH", account_number_last4: "4821", reference_number: "6204 118 337",
  amount_sent_centavos: 148800, sender_bank: "GCash", sender_name: "Maria Santos", sender_account_number: "0917 555 0142", transferred_at: "2026-11-12T01:10:00+00:00",
  submitted_at: "2026-11-12T01:14:00+00:00", content_type: "image/png", decisions: [], ...o });
const row = (o) => ({ id: "ord_42", order_number: "SMP00042", buyer_name: "Maria Santos", mobile_masked: "+63917***0142", method: "direct", payment_status: "pending_review",
  created_at: "2026-11-12T01:14:00+00:00", state_version: 3, ...o });
const ROWS = [row({}), row({ id: "ord_38", order_number: "SMP00038", buyer_name: "Carlo Mendoza", payment_status: "rejected", state_version: 5 }),
  row({ id: "ord_37", order_number: "SMP00037", buyer_name: "Liza Ramos", payment_status: "verified", state_version: 4 })];
const DETAIL = {
  ord_42: { ...ROWS[0], price_centavos: 148800, currency: "PHP", delivery_address: {}, rejection_lock_active: false, submissions: [sub({})], events: [] },
  ord_38: { ...ROWS[1], price_centavos: 148800, currency: "PHP", delivery_address: {}, rejection_lock_active: true, events: [],
    submissions: [sub({ id: "prf_2", amount_sent_centavos: 128800, content_type: "application/pdf", decisions: [{ decision: "rejected", reason_code: "amount_mismatch", reason_label: "Amount does not match ₱1,488.", other_text: "", actor_label: "store@example.test", decided_at: "2026-11-12T02:00:00+00:00" }] })] },
};

function poDocument() {
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

function boot({ rows = ROWS, listStatus = 200, detail = DETAIL, proofStatus = 200, decideStatus = 200, decideBody } = {}) {
  const doc = poDocument(), calls = [], toasts = [], opened = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  const tabs = doc.createElement("nav"); tabs.setAttribute("id", "orders-tabs"); page.appendChild(tabs);
  for (const t of ["overview", "product", "pack"]) { const a = doc.createElement("a"); a.setAttribute("data-tab", t); a.textContent = t; tabs.appendChild(a); }
  for (const id of ["po-sub", "po-body", "po-dlg-slot"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const state = { rows: rows.map((r) => ({ ...r })) };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method || "GET", path: p, body, credentials: opts.credentials });
    const res = (status, b) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(b), blob: () => Promise.resolve({ blob: true }) });
    const m = /^\/sites\/site_[0-9a-z]{20}\/pack\/orders\/(?:([a-z0-9_]+)\/(?:(approve|reject|shipment\/correct|shipment|delivery)\/|proofs\/([a-z0-9_]+)\/)?)?(?:\?filter=(\w+))?$/.exec(p);
    if (p === "/sites/") return res(200, { items: [{ id: A, template: "sante" }], next_cursor: null });
    if (!m) return res(404, { error: { code: "not_found", message: "Not found." } });
    if (!m[1]) return res(listStatus, listStatus === 200 ? { orders: state.rows } : { error: { code: "x", message: "Broken." } });
    if (m[3]) return proofStatus === 200 ? res(200, {}) : res(proofStatus, {});
    if (m[2]) {
      if (decideStatus !== 200) return res(decideStatus, decideBody || { error: { code: "stale", message: "Stale." } });
      const o = state.rows.find((r) => r.id === m[1]);
      if (m[2] === "shipment") o.shipment_status = "shipped"; else if (m[2] === "delivery") o.shipment_status = "delivered";
      else if (m[2] !== "shipment/correct") o.payment_status = m[2] === "approve" ? "verified" : "rejected";
      o.state_version++;
      return res(200, { ...o, price_centavos: 148800 });
    }
    return detail[m[1]] ? res(200, detail[m[1]]) : res(404, { error: { code: "not_found", message: "Not found." } });
  };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800,
    open: (u, t, f) => { opened.push([u, t, f]); } };
  const URLs = { createObjectURL: () => "blob:test/" + (opened.length + calls.length), revokeObjectURL() {} };
  const context = vm.createContext({ window, document: doc, location: { search: "", pathname: "/orders/", replace() {}, assign() {} }, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, FormData,
    localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch, URL: URLs });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("pack-orders.js"), context, { filename: "pack-orders.js" });
  window.NODash.toast = (title, text, kind) => toasts.push([title, text || "", kind || "ok"]);
  const $ = (id) => doc.getElementById(id), body = $("po-body");
  const cls = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label, i = 0) => buttons(n).filter((b) => b.textContent === label || b.getAttribute("aria-label") === label)[i];
  return { doc, calls, toasts, opened, state, $, body, cls, buttons, press, page, tabs,
    list: () => calls.map((c) => c.method + " " + c.path),
    async show() { window.NOPackOrders.show(); await settle(); },
    api: window.NOPackOrders };
}

test("the page: Orders has the three tabs, the review slot and no inline script; the old placeholder is gone", () => {
  const view = /<section class="view" id="view-orders"[\s\S]*?<\/section>\s*<section class="view" id="view-orders-new"/.exec(HTML)[0];
  assert.ok(view.includes('id="orders-tabs"'));
  assert.deepEqual([...view.matchAll(/<a href="#" data-tab="(\w+)"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]), [["overview", "Overview"], ["product", "Product Orders"], ["pack", "Package Order"]]);
  assert.ok(view.includes('id="h-orders"') && view.includes('id="po-body"') && view.includes('id="po-dlg-slot"'));
  assert.ok(!/not available yet/i.test(view), "the placeholder card is replaced");
  assert.ok(HTML.includes('/assets/css/pack-orders.css?v=') && HTML.includes('/assets/js/pack-orders.js?v='));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(HTML), "no inline script");
  assert.ok(/NOPackOrders[\s\S]{0,400}PO\.show\(\)/.test(read("dashboard.js")), "dashboard.js enters and leaves the view");
});

test("the list: pipeline counts, the review queue, the table and the line under the title, from one read of the orders", async () => {
  const d = boot();
  await d.show();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE + "?filter=all"]);
  assert.equal(d.calls[1].credentials, "include");
  assert.deepEqual(d.cls(d.body, "ol-tile").map((b) => b.textContent), ["1Under reviewAction needed", "1Needs attentionProof rejected · waiting on buyer", "1VerifiedPayment approved"]);
  assert.equal(d.$("po-sub").textContent, "Track every order from approval to delivery · 3 under current filters");
  assert.equal(d.cls(d.body, "mc-queue-title")[0].textContent, "Payment review queue");
  const ticket = d.cls(d.body, "mc-ticket")[0];
  assert.equal(d.cls(ticket, "mc-order")[0].textContent, "SMP00042");
  assert.equal(d.cls(ticket, "mc-cust")[0].textContent, "Maria Santos");
  assert.equal(d.cls(ticket, "mc-items")[0].textContent, "[1x] Membership Pack");
  assert.equal(d.cls(ticket, "md-pp")[0].textContent, "Santé Membership Package");
  assert.equal(d.cls(ticket, "mc-meta")[0].textContent, "Bank or e-wallet transfer" + "Placed Nov 12, 9:14 AM", "no total while the row carries no price");
  assert.deepEqual(d.buttons(ticket).map((b) => b.textContent), ["Approve", "Reject…", "Details ▾"]);
  const rows = d.cls(d.body, "mc-rowwrap");
  assert.equal(rows.length, 3);
  assert.deepEqual(d.cls(rows[0], "chip").map((c) => c.textContent), ["Under review"]);
  const labels = (r) => d.buttons(r).map((b) => b.textContent || b.getAttribute("aria-label"));
  assert.deepEqual(labels(rows[0]), ["Show details"], "under review: Approve and Reject live in the queue above, the row has Details only");
  assert.deepEqual(labels(rows[1]), ["Approve", "Show details"], "rejected: Approve and Details, no Reject");
  assert.deepEqual(labels(rows[2]), ["Show details"]);
  assert.deepEqual(d.cls(d.body, "ol-th")[0].all((n) => n.tagName === "SPAN").map((n) => n.textContent), ["Order #", "Customer", "Payment", "Total", "Status", "Action"], "no Address column");
});

test("a row that carries price_centavos shows the total with the wording of the mockup", async () => {
  const d = boot({ rows: ROWS.map((r) => ({ ...r, price_centavos: 148800 })) });
  await d.show();
  assert.equal(d.cls(d.cls(d.body, "mc-ticket")[0], "mc-meta")[0].textContent, "Bank or e-wallet transfer · ₱1,488.00" + "Placed Nov 12, 9:14 AM");
  assert.equal(d.cls(d.cls(d.body, "mc-rowwrap")[0], "num")[0].textContent, "₱1,488.00");
});

test("a status tile filters the table, the clear line brings every order back, and the queue stays", async () => {
  const d = boot();
  await d.show();
  d.cls(d.body, "ol-tile")[1].fire("click");
  assert.equal(d.cls(d.body, "mc-rowwrap").length, 1);
  assert.equal(d.cls(d.cls(d.body, "mc-rowwrap")[0], "mc-order")[0].textContent, "SMP00038");
  assert.equal(d.cls(d.body, "mc-ticket").length, 1, "the review queue is not filtered away");
  assert.equal(d.cls(d.body, "ol-tile")[1].getAttribute("aria-pressed"), "true");
  assert.equal(d.$("po-sub").textContent, "Track every order from approval to delivery · 1 under current filters");
  const clear = d.cls(d.body, "ol-clear")[0];
  assert.equal(clear.textContent, "× Clear status filter — showing all 3 orders");
  clear.querySelector("button").fire("click");
  assert.equal(d.cls(d.body, "mc-rowwrap").length, 3);
});

test("states: empty (also a site with no package: 404), error with Try again, and the two placeholder tabs", async () => {
  const empty = boot({ rows: [] });
  await empty.show();
  assert.deepEqual(empty.body.all((n) => n.tagName === "H2").map((n) => n.textContent), ["No orders yet"]);
  assert.ok(empty.body.textContent.includes("Orders show here when someone buys the Membership Pack from your store."));

  const broken = boot({ listStatus: 500 });
  await broken.show();
  assert.ok(broken.body.textContent.includes("We could not load your orders"));
  assert.equal(broken.cls(broken.body, "po-err")[0].getAttribute("role"), "alert");
  broken.press(broken.body, "Try again").fire("click");
  await settle();
  assert.equal(broken.calls.filter((c) => c.path === "/sites/").length, 2, "Try again reads again");

  const d = boot();
  await d.show();
  d.tabs.all((n) => n.tagName === "A")[1].fire("click");
  assert.deepEqual(d.body.all((n) => n.tagName === "H2").map((n) => n.textContent), ["Product Orders"]);
  assert.ok(d.body.textContent.includes("This tab is a placeholder. Its content has not been designed yet."));
  assert.equal(d.$("po-sub").hidden, true);
  assert.deepEqual(d.tabs.all((n) => n.getAttribute("aria-current") === "page").map((n) => n.textContent), ["product"]);
  d.tabs.all((n) => n.tagName === "A")[2].fire("click");
  assert.equal(d.cls(d.body, "ol-tiles").length, 1);
});

test("Details: loads the order, then the proof as a blob; no API address reaches the page", async () => {
  const d = boot();
  await d.show();
  d.press(d.cls(d.body, "mc-ticket")[0], "Details ▾").fire("click");
  await settle();
  assert.deepEqual(d.list().slice(2), ["GET " + BASE + "ord_42/", "GET " + BASE + "ord_42/proofs/prf_1/"]);
  assert.equal(d.calls[3].credentials, "include");
  const detail = d.cls(d.body, "mc-detail")[0];
  assert.deepEqual(d.cls(detail, "po-card").map((c) => c.all((x) => x.tagName === "H3")[0].textContent), ["Payment proof", "History", "Buyer", "Paid to", "Payment details from the buyer"]);
  const img = detail.all((n) => n.tagName === "IMG")[0];
  assert.ok(/^blob:/.test(img.getAttribute("src")), "the proof is drawn from a blob");
  assert.ok(!/api\.test|\/proofs\//.test(JSON.stringify(d.page.all(() => true).map((n) => n.attrs))), "no proof URL in any attribute");
  const text = detail.textContent;
  for (const s of ["Maria Santos", "+63917***0142", "GCash · E-wallet", "Santé Barley PH", "ending 4821", "₱1,488.00", "6204 118 337", "Nov".length ? "12 Nov 2026, 9:10 AM" : ""]) assert.ok(text.includes(s), s);
  assert.ok(text.includes("Proof sent") && text.includes("Maria Santos sent ₱1,488.00. Reference 6204 118 337."));
  assert.deepEqual(d.cls(d.cls(detail, "po-card")[0], "po-actions")[0].all((n) => n.tagName === "BUTTON").map((b) => b.textContent), ["Open", "Download"]);
  /* the total is now known for the row */
  assert.ok(d.cls(d.cls(d.body, "mc-ticket")[0], "mc-meta")[0].textContent.includes("₱1,488.00"));
  d.press(detail, "Open").fire("click");
  assert.equal(d.opened.length, 1);
  assert.equal(d.opened[0][2], "noopener");
});

test("Details of a rejected order with a PDF proof: the file card, and the rejection with its reason in History", async () => {
  const d = boot();
  await d.show();
  d.press(d.cls(d.body, "mc-rowwrap")[1], "Show details").fire("click");
  await settle();
  const detail = d.cls(d.body, "mc-detail")[0];
  assert.equal(detail.all((n) => n.tagName === "IMG").length, 0);
  assert.ok(detail.textContent.includes("proof-SMP00038.pdf"));
  const hist = d.cls(detail, "po-hist")[0].all((n) => n.tagName === "LI");
  assert.deepEqual(hist.map((li) => li.all((n) => n.tagName === "STRONG")[0].textContent), ["Proof sent", "Rejected"]);
  assert.ok(hist[1].textContent.includes("Amount does not match ₱1,488."));
  assert.ok(hist[1].textContent.includes("store@example.test"));
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

test("Approve is one click: POST with the order's state_version, a toast, and the list read again", async () => {
  const d = boot();
  await d.show();
  d.press(d.cls(d.body, "mc-ticket")[0], "Approve").fire("click");
  await settle();
  assert.deepEqual(d.calls[2], { method: "POST", path: BASE + "ord_42/approve/", body: { state_version: 3 }, credentials: "include" });
  assert.deepEqual(d.toasts, [["Payment approved", "", "ok"]]);
  assert.equal(d.calls[3].path, BASE + "?filter=all");
  assert.deepEqual(d.cls(d.body, "ol-tile").map((b) => b.textContent), ["0Under reviewAction needed", "1Needs attentionProof rejected · waiting on buyer", "2VerifiedPayment approved"]);
});

test("Approve on an order that changed (409): the stale message as an error toast and the list read again", async () => {
  const d = boot({ decideStatus: 409 });
  await d.show();
  d.press(d.cls(d.body, "mc-ticket")[0], "Approve").fire("click");
  await settle();
  assert.deepEqual(d.toasts, [["This order changed. Reload it and try again.", "", "error"]]);
  assert.equal(d.calls.filter((c) => c.path === BASE + "?filter=all").length, 2);
});

test("Reject…: reasons verbatim, Other needs the explanation, then the confirm step, then the POST", async () => {
  const d = boot();
  await d.show();
  const opener = d.press(d.cls(d.body, "mc-ticket")[0], "Reject…");
  opener.fire("click");
  const dlg = d.$("po-dlg-slot").all((n) => n.classList.contains("po-dialog"))[0];
  assert.equal(dlg.getAttribute("role"), "dialog");
  assert.equal(dlg.getAttribute("aria-modal"), "true");
  assert.equal(dlg.all((n) => n.tagName === "H2")[0].textContent, "Reject order SMP00042Santé Membership Package");
  assert.equal(dlg.all((n) => n.tagName === "LEGEND")[0].textContent, "Reason for rejection");
  const radios = () => d.$("po-dlg-slot").all((n) => n.tagName === "INPUT");
  assert.deepEqual(d.$("po-dlg-slot").all((n) => n.tagName === "LABEL").map((l) => l.textContent), [
    "Amount does not match the order total.", "Payment not found in the receiving account.", "Proof is unreadable or incomplete.",
    "Reference number is missing or does not match.", "Payment was sent to the wrong account.", "Other, with a mandatory written explanation."]);
  /* Continue with nothing chosen */
  d.press(d.$("po-dlg-slot"), "Continue").fire("click");
  assert.equal(d.$("po-dlg-slot").all((n) => n.classList.contains("po-error"))[0].textContent, "Choose a reason.");
  /* Other without text */
  radios()[5].fire("change");
  d.press(d.$("po-dlg-slot"), "Continue").fire("click");
  assert.equal(d.$("po-dlg-slot").all((n) => n.classList.contains("po-error"))[0].textContent, "Explain the reason.");
  const ta = d.$("po-other"); ta.value = "The reference is from another day."; ta.fire("input");
  d.press(d.$("po-dlg-slot"), "Continue").fire("click");
  assert.ok(d.$("po-dlg-slot").textContent.includes("The reference is from another day."));
  assert.ok(d.$("po-dlg-slot").textContent.includes("The buyer is told their payment for order SMP00042 needs attention. They see your reason when they sign in and can send a new proof."));
  assert.equal(d.calls.length, 2, "nothing is sent before the confirm step");
  d.press(d.$("po-dlg-slot"), "Confirm Reject").fire("click");
  await settle();
  assert.deepEqual(d.calls[2], { method: "POST", path: BASE + "ord_42/reject/", body: { state_version: 3, reason_code: "other", other_text: "The reference is from another day." }, credentials: "include" });
  assert.deepEqual(d.toasts, [["Payment rejected", "", "ok"]]);
  assert.equal(d.$("po-dlg-slot").all(() => true).length, 0, "the dialog closes");
});

test("a reason other than Other sends no explanation; Escape closes the dialog and returns focus", async () => {
  const d = boot();
  await d.show();
  const opener = d.press(d.cls(d.body, "mc-ticket")[0], "Reject…");
  opener.fire("click");
  d.$("po-dlg-slot").all((n) => n.tagName === "INPUT")[2].fire("change");
  d.press(d.$("po-dlg-slot"), "Continue").fire("click");
  d.press(d.$("po-dlg-slot"), "Confirm Reject").fire("click");
  await settle();
  assert.deepEqual(d.calls[2].body, { state_version: 3, reason_code: "proof_unreadable" });

  const e = boot();
  await e.show();
  const op = e.press(e.cls(e.body, "mc-ticket")[0], "Reject…");
  op.fire("click");
  const key = e.doc.fire("keydown", { key: "Escape" });
  assert.equal(key.prevented, true);
  assert.equal(e.$("po-dlg-slot").all(() => true).length, 0);
  assert.equal(e.doc.activeElement, op);
});

test("Reject on an order that changed (409): the confirm step says so inside the dialog, which stays open", async () => {
  const d = boot({ decideStatus: 409 });
  await d.show();
  d.press(d.cls(d.body, "mc-ticket")[0], "Reject…").fire("click");
  d.$("po-dlg-slot").all((n) => n.tagName === "INPUT")[1].fire("change");
  d.press(d.$("po-dlg-slot"), "Continue").fire("click");
  d.press(d.$("po-dlg-slot"), "Confirm Reject").fire("click");
  await settle();
  assert.equal(d.$("po-dlg-slot").all((n) => n.classList.contains("po-error"))[0].textContent, "This order changed. Reload it and try again.");
  assert.deepEqual(d.toasts, []);
});

test("leaving Orders closes the dialog; the code builds with textContent only (no innerHTML)", async () => {
  const d = boot();
  await d.show();
  d.press(d.cls(d.body, "mc-ticket")[0], "Reject…").fire("click");
  d.api.hide();
  assert.equal(d.$("po-dlg-slot").all(() => true).length, 0);
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(read("pack-orders.js")));
  assert.ok(!/gold|#c59a3b|197,\s*154,\s*59/i.test(fs.readFileSync(path.join(PUBLIC, "assets", "css", "pack-orders.css"), "utf8")), "no gold focus border");
});

/* ---- Shipment (ClickUp z8uq9mek5x, PK-SHIP) ---- */
const SHIP_ROWS = [
  row({ id: "ord_50", order_number: "SMP00050", buyer_name: "Ana Cruz", payment_status: "verified", shipping_enabled: true, shipment_status: "not_shipped", state_version: 6 }),
  row({ id: "ord_51", order_number: "SMP00051", buyer_name: "Ben Lim", payment_status: "verified", shipping_enabled: true, shipment_status: "shipped", courier: "LBC", shipped_on: "2026-11-13", state_version: 7 }),
  row({ id: "ord_52", order_number: "SMP00052", buyer_name: "Cora Tan", payment_status: "verified", shipping_enabled: true, shipment_status: "delivered", courier: "J&T Express", shipped_on: "2026-11-10", delivered_on: "2026-11-12", state_version: 8 }),
];
const shipment = (o) => ({ status: "shipped", courier: "lbc", courier_label: "LBC", courier_other_name: "", tracking_number: "LBC123456", shipped_on: "2026-11-13", recorded_at: "2026-11-13T02:00:00+00:00",
  recorded_by: "store@example.test", delivered_on: null, delivery_confirmed_at: null, delivery_confirmed_by: "", ...o });
const SHIP_DETAIL = {
  ord_50: { ...SHIP_ROWS[0], price_centavos: 148800, currency: "PHP", delivery_address: {}, rejection_lock_active: false, submissions: [sub({})], events: [], shipment: null },
  ord_51: { ...SHIP_ROWS[1], price_centavos: 148800, currency: "PHP", delivery_address: {}, rejection_lock_active: false, submissions: [sub({})], shipment: shipment({}),
    events: [{ kind: "shipment_recorded", old: {}, new: { courier: "lbc", courier_other_name: "", tracking_number: "LBC123456", shipped_on: "2026-11-13" }, actor_label: "store@example.test", created_at: "2026-11-13T02:00:00+00:00" }] },
  ord_52: { ...SHIP_ROWS[2], price_centavos: 148800, currency: "PHP", delivery_address: {}, rejection_lock_active: false, submissions: [sub({})],
    shipment: shipment({ status: "delivered", courier: "jnt", courier_label: "J&T Express", shipped_on: "2026-11-10", delivered_on: "2026-11-12", delivery_confirmed_by: "store@example.test" }), events: [] },
};
const dlgOf = (d) => d.$("po-dlg-slot");
const typed = (n, v) => { n.value = v; n.fire("input"); };

test("shipping on: five tiles, the chips, the Add shipment button only on a ready order, the courier and date under a shipped chip", async () => {
  const d = boot({ rows: SHIP_ROWS, detail: SHIP_DETAIL });
  await d.show();
  assert.deepEqual(d.cls(d.body, "ol-tile").map((b) => b.textContent), ["0Under reviewAction needed", "0Needs attentionProof rejected · waiting on buyer", "1Ready to shipAdd the tracking number", "1ShippedIn transit", "1DeliveredFinal"]);
  const rows = d.cls(d.body, "mc-rowwrap");
  assert.ok(d.press(rows[0], "Add shipment") && !d.press(rows[1], "Add shipment") && !d.press(rows[2], "Add shipment"));
  assert.deepEqual(rows.map((r) => d.cls(r, "chip")[0].textContent), ["Ready to ship", "Shipped", "Delivered"]);
  assert.deepEqual(rows.slice(1).map((r) => d.cls(r, "mc-sub")[0].textContent), ["LBC · Nov 13", "Delivered · Nov 12"]);
  d.cls(d.body, "ol-tile")[2].fire("click");
  assert.equal(d.cls(d.body, "mc-rowwrap").length, 1);
});

test("shipping off: the three tiles of today and no shipment button, even on a verified order", async () => {
  const d = boot({ rows: SHIP_ROWS.map((r) => ({ ...r, shipping_enabled: false })), detail: SHIP_DETAIL });
  await d.show();
  assert.deepEqual(d.cls(d.body, "ol-tile").map((b) => b.textContent), ["0Under reviewAction needed", "0Needs attentionProof rejected · waiting on buyer", "3VerifiedPayment approved"]);
  assert.equal(d.buttons(d.body).filter((b) => b.textContent === "Add shipment").length, 0);
});

test("Add shipment: validation first, a confirm step that names the email, then one POST with the state_version", async () => {
  const d = boot({ rows: SHIP_ROWS, detail: SHIP_DETAIL });
  await d.show();
  d.press(d.cls(d.body, "mc-rowwrap")[0], "Add shipment").fire("click");
  assert.equal(dlgOf(d).all((n) => n.tagName === "H2")[0].textContent, "Add shipment for order SMP00050Santé Membership Package");
  assert.deepEqual(dlgOf(d).all((n) => n.tagName === "OPTION").map((o) => o.textContent), ["Choose the courier", "LBC", "J&T Express", "Flash Express", "Ninja Van", "2GO", "Grab", "Lalamove", "Other"]);
  d.press(dlgOf(d), "Continue").fire("click");
  assert.deepEqual(dlgOf(d).all((n) => n.classList.contains("po-error")).map((n) => n.textContent), ["Choose the courier.", "Enter the tracking number."]);
  const sel = d.$("po-courier"); sel.value = "other"; sel.fire("change");
  typed(d.$("po-tracking"), "  HAND-1 ");
  d.press(dlgOf(d), "Continue").fire("click");
  assert.deepEqual(dlgOf(d).all((n) => n.classList.contains("po-error")).map((n) => n.textContent), ["Enter the courier name."]);
  typed(d.$("po-courier-other"), "Rider Juan");
  d.press(dlgOf(d), "Continue").fire("click");
  assert.ok(dlgOf(d).textContent.includes("Rider Juan") && dlgOf(d).textContent.includes("HAND-1"));
  assert.ok(dlgOf(d).textContent.includes("The buyer is emailed that order SMP00050 has shipped"));
  assert.equal(d.calls.length, 2, "nothing is sent before the confirm step");
  d.press(dlgOf(d), "Confirm shipment").fire("click");
  await settle();
  const post = d.calls[2];
  assert.equal(post.method, "POST"); assert.equal(post.path, BASE + "ord_50/shipment/");
  assert.deepEqual({ ...post.body, shipped_on: "date" }, { state_version: 6, courier: "other", tracking_number: "HAND-1", shipped_on: "date", courier_other_name: "Rider Juan" });
  assert.deepEqual(d.toasts, [["Shipment added", "", "ok"]]);
  assert.equal(dlgOf(d).all(() => true).length, 0);
});

test("Add shipment on an order that changed (409): the confirm step says so and the dialog stays; a server 422 returns to the form", async () => {
  const d = boot({ rows: SHIP_ROWS, detail: SHIP_DETAIL, decideStatus: 409 });
  await d.show();
  d.press(d.cls(d.body, "mc-rowwrap")[0], "Add shipment").fire("click");
  const sel = d.$("po-courier"); sel.value = "lbc"; sel.fire("change"); typed(d.$("po-tracking"), "T1");
  d.press(dlgOf(d), "Continue").fire("click");
  d.press(dlgOf(d), "Confirm shipment").fire("click");
  await settle();
  assert.ok(dlgOf(d).textContent.includes("This order changed. Reload it and try again."));
  const e = boot({ rows: SHIP_ROWS, detail: SHIP_DETAIL, decideStatus: 422, decideBody: { error: { code: "invalid_shipment", message: "Check the highlighted fields.", fields: { tracking_number: ["Enter the tracking number."] } } } });
  await e.show();
  e.press(e.cls(e.body, "mc-rowwrap")[0], "Add shipment").fire("click");
  const s2 = e.$("po-courier"); s2.value = "lbc"; s2.fire("change"); typed(e.$("po-tracking"), "T1");
  e.press(dlgOf(e), "Continue").fire("click");
  e.press(dlgOf(e), "Confirm shipment").fire("click");
  await settle();
  assert.ok(dlgOf(e).textContent.includes("Enter the tracking number."), "back on the form with the server's message");
  assert.ok(e.press(dlgOf(e), "Continue"));
});

test("Details of a shipped order: the Shipment card with Edit and Mark delivered, the event in History; a delivered order is read-only", async () => {
  const d = boot({ rows: SHIP_ROWS, detail: SHIP_DETAIL });
  await d.show();
  d.press(d.cls(d.body, "mc-rowwrap")[1], "Show details").fire("click"); await settle();
  const card = d.cls(d.body, "po-card").find((c) => c.all((n) => n.tagName === "H3")[0].textContent === "Shipment");
  assert.ok(card.textContent.includes("LBC") && card.textContent.includes("LBC123456") && card.textContent.includes("13 Nov 2026"));
  assert.ok(d.press(card, "Edit shipment") && d.press(card, "Mark delivered"));
  assert.ok(d.body.textContent.includes("Shipment recorded"));
  const e = boot({ rows: SHIP_ROWS, detail: SHIP_DETAIL });
  await e.show();
  e.press(e.cls(e.body, "mc-rowwrap")[2], "Show details").fire("click"); await settle();
  const c2 = e.cls(e.body, "po-card").find((c) => c.all((n) => n.tagName === "H3")[0].textContent === "Shipment");
  assert.ok(c2.textContent.includes("12 Nov 2026") && !e.press(c2, "Edit shipment") && !e.press(c2, "Mark delivered"));
});

test("Edit shipment is prefilled and posts to the correct route; Mark delivered says it is final, then posts the date", async () => {
  const d = boot({ rows: SHIP_ROWS, detail: SHIP_DETAIL });
  await d.show();
  d.press(d.cls(d.body, "mc-rowwrap")[1], "Show details").fire("click"); await settle();
  d.press(d.body, "Edit shipment").fire("click");
  assert.equal(d.$("po-tracking").value, "LBC123456");
  typed(d.$("po-tracking"), "LBC999");
  d.press(dlgOf(d), "Continue").fire("click");
  assert.ok(dlgOf(d).textContent.includes("The buyer is not emailed about a correction."));
  const n = d.calls.length;
  d.press(dlgOf(d), "Save changes").fire("click"); await settle();
  assert.equal(d.calls[n].path, BASE + "ord_51/shipment/correct/");
  assert.equal(d.calls[n].body.tracking_number, "LBC999");
  assert.deepEqual(d.toasts, [["Shipment updated", "", "ok"]]);

  const e = boot({ rows: SHIP_ROWS, detail: SHIP_DETAIL });
  await e.show();
  e.press(e.cls(e.body, "mc-rowwrap")[1], "Show details").fire("click"); await settle();
  e.press(e.cls(e.body, "mc-detail")[0], "Mark delivered").fire("click");
  typed(e.$("po-delivered"), "2026-11-01");
  e.press(dlgOf(e), "Continue").fire("click");
  assert.ok(dlgOf(e).textContent.includes("Enter a delivery date on or after the shipped date"));
  typed(e.$("po-delivered"), "2026-11-13");
  e.press(dlgOf(e), "Continue").fire("click");
  assert.ok(dlgOf(e).textContent.includes("This is final."));
  const m = e.calls.length;
  e.press(dlgOf(e), "Confirm delivered").fire("click"); await settle();
  assert.deepEqual(e.calls[m], { method: "POST", path: BASE + "ord_51/delivery/", body: { state_version: 7, delivered_on: "2026-11-13" }, credentials: "include" });
  assert.deepEqual(e.toasts, [["Marked as delivered", "", "ok"]]);
});

test("a courier name from the API is shown as text, never as markup", async () => {
  const evil = "<img src=x onerror=alert(1)>";
  const rows = [{ ...SHIP_ROWS[1], courier: evil }];
  const d = boot({ rows, detail: { ord_51: { ...SHIP_DETAIL.ord_51, shipment: shipment({ courier: "other", courier_label: evil, courier_other_name: evil }) } } });
  await d.show();
  assert.ok(d.cls(d.body, "mc-sub")[0].textContent.includes(evil));
  assert.equal(d.body.all((n) => n.tagName === "IMG").length, 0);
});

/* ---- Order list v2 (ClickUp z8uq9mek5x, design packet PK-SHIP page 1): hero, tiles, search, icon buttons ---- */
const NOW = new Date().toISOString(), OLD = "2020-01-05T03:00:00+00:00";
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const V2 = (o) => row({ payment_status: "verified", shipping_enabled: true, shipment_status: "not_shipped", price_centavos: 148800, created_at: NOW, ...o });
const V2_ROWS = [
  row({ id: "ord_61", order_number: "SMP00061", buyer_name: "Rico Tan", price_centavos: 148800, created_at: NOW, shipping_enabled: true }), /* under review: not a sale */
  row({ id: "ord_62", order_number: "SMP00062", buyer_name: "Ana Villanueva", payment_status: "rejected", price_centavos: 148800, created_at: NOW, shipping_enabled: true }), /* rejected: not a sale */
  V2({ id: "ord_63", order_number: "SMP00063", buyer_name: "Maria Santos" }),
  V2({ id: "ord_64", order_number: "SMP00064", buyer_name: "Liza Ramos" }),
  V2({ id: "ord_65", order_number: "SMP00065", buyer_name: "Jun dela Cruz", shipment_status: "shipped", courier: "J&T Express", shipped_on: TODAY, tracking_number: "JT7788" }),
  V2({ id: "ord_66", order_number: "SMP00066", buyer_name: "Carla Mendoza", shipment_status: "delivered", courier: "LBC", shipped_on: TODAY, delivered_on: TODAY, created_at: OLD }), /* delivered this month, sold in an older month */
];
const stat = (d, label) => d.cls(d.body, "ol-stat").filter((s) => s.all((n) => n.tagName === "B")[0].textContent === label)[0];
const statText = (d, label) => stat(d, label).all((n) => n.tagName !== "B" && n.text === null).map((n) => n.textContent);

test("v2 hero: store line, the title, and four numbers from the rows already read (verified-only sales this month)", async () => {
  const d = boot({ rows: V2_ROWS });
  await d.show();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE + "?filter=all"], "one read, no extra call for the hero");
  const hero = d.cls(d.body, "ol-hero")[0];
  assert.equal(d.cls(hero, "ol-eyebrow")[0].textContent, "Subscriber · Santé");
  assert.equal(d.cls(hero, "ol-title")[0].textContent, "Orders");
  assert.equal(d.cls(hero, "ol-subtitle")[0].textContent, "Track every order from approval to delivery · 6 under current filters");
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+TODAY.slice(5, 7) - 1] + " " + TODAY.slice(0, 4);
  assert.deepEqual(statText(d, "Sales this month"), ["₱4,464.00", month + " · verified payments"], "three verified orders of this month; review, rejected and the old month do not count");
  assert.deepEqual(statText(d, "Orders"), ["5", "Placed this month"]);
  assert.deepEqual(statText(d, "Delivered"), ["1", "This month"]);
  assert.deepEqual(statText(d, "Needs action"), ["2", "Proofs to review"]);
  assert.ok(!hero.textContent.includes("48h"), "no 48-hour rule");
});

test("v2 tiles: five, each with its hint, filter by state; the hero follows the filter", async () => {
  const d = boot({ rows: V2_ROWS });
  await d.show();
  assert.deepEqual(d.cls(d.body, "ol-tile").map((b) => b.textContent), ["1Under reviewAction needed", "1Needs attentionProof rejected · waiting on buyer", "2Ready to shipAdd the tracking number", "1ShippedIn transit", "1DeliveredFinal"]);
  for (const [i, n] of [[0, 1], [1, 1], [2, 2], [3, 1], [4, 1]]) {
    d.cls(d.body, "ol-tile")[i].fire("click");
    assert.equal(d.cls(d.body, "ol-tile")[i].getAttribute("aria-pressed"), "true");
    assert.equal(d.cls(d.body, "mc-rowwrap").length, n, "tile " + i);
    assert.equal(d.cls(d.body, "ol-subtitle")[0].textContent, "Track every order from approval to delivery · " + n + " under current filters");
    d.cls(d.body, "ol-tile")[i].fire("click");
  }
  assert.equal(d.cls(d.body, "mc-rowwrap").length, 6);
});

test("v2 search: order #, tracking #, customer name; the tiles keep counting all orders; Clear search brings everything back", async () => {
  const d = boot({ rows: V2_ROWS });
  await d.show();
  const input = () => d.$("po-q"), go = () => d.press(d.body, "Search");
  assert.equal(input().getAttribute("placeholder"), "Search order #, tracking #, or customer name");
  const search = (v) => { input().value = v; input().fire("input"); go().fire("click"); };
  const nums = () => d.cls(d.body, "mc-rowwrap").map((r) => d.cls(r, "ol-no")[0].textContent);
  search("smp00063");
  assert.deepEqual(nums(), ["SMP00063"]);
  assert.deepEqual(d.cls(d.body, "ol-tile").map((b) => b.textContent[0]), ["1", "1", "2", "1", "1"], "tiles count all orders");
  assert.equal(input().value, "smp00063", "the box keeps what was typed");
  search("jt7788");
  assert.deepEqual(nums(), ["SMP00065"], "by tracking number");
  search("mendoza");
  assert.deepEqual(nums(), ["SMP00066"], "by customer name");
  search("rico");
  assert.deepEqual(nums(), ["SMP00061"], "an under-review order is in the table too");
  assert.equal(d.cls(d.body, "mc-ticket").length, 1);
  search("zzz");
  assert.ok(d.body.textContent.includes("No orders match this search"));
  input().value = "ana"; input().fire("keydown", { key: "Enter" });
  assert.deepEqual(nums(), ["SMP00062"], "Enter searches too");
  d.cls(d.body, "ol-clear")[0].querySelector("button").fire("click");
  assert.equal(nums().length, 6);
  assert.equal(input().value, "");
  // the field's own x button empties the box and fires "input": that clears the applied search too
  search("zzz");
  input().value = ""; input().fire("input");
  assert.equal(nums().length, 6, "x clears the applied search");
  assert.equal(d.cls(d.body, "ol-clear").length, 0);
  d.cls(d.body, "ol-tile")[2].fire("click");
  assert.ok(nums().length > 0, "a status tile after the x still lists orders");
  d.cls(d.body, "ol-tile")[2].fire("click");
  search("zzz");
  search("");
  assert.equal(nums().length, 6, "an empty submitted search means no search");
});

test("v2 table: the six columns, Bank transfer, total, date line; icon buttons with a label and tooltip, Add shipment only on Ready to ship, Mark delivered only on Shipped", async () => {
  const d = boot({ rows: V2_ROWS, detail: { ord_65: { ...V2_ROWS[4], currency: "PHP", delivery_address: {}, rejection_lock_active: false, submissions: [sub({})], events: [], shipment: shipment({ courier: "jnt", courier_label: "J&T Express", tracking_number: "JT7788", shipped_on: TODAY }) } } });
  await d.show();
  const rows = d.cls(d.body, "mc-rowwrap"), by = (no) => rows.filter((r) => d.cls(r, "ol-no")[0].textContent === no)[0];
  assert.equal(d.cls(by("SMP00063"), "ol-pay")[0].textContent, "Bank transfer");
  assert.equal(d.cls(by("SMP00063"), "num")[0].textContent, "₱1,488.00");
  assert.ok(/^[A-Z][a-z]{2} \d{1,2}, \d{4} · \d{1,2}:\d{2} [AP]M$/.test(d.cls(by("SMP00063"), "ol-dt")[0].textContent));
  assert.equal(d.cls(by("SMP00063"), "md-pp")[0].textContent, "Santé Membership Package");
  const ibs = (r) => d.cls(r, "ol-ib").map((b) => [b.getAttribute("aria-label"), b.getAttribute("data-tip")]);
  assert.deepEqual(ibs(by("SMP00063")), [["Add shipment", "Add shipment"], ["Show details", "Show details"]]);
  assert.deepEqual(ibs(by("SMP00065")), [["Mark delivered", "Mark delivered"], ["Show details", "Show details"]]);
  assert.deepEqual(ibs(by("SMP00066")), [["Show details", "Show details"]]);
  assert.deepEqual(ibs(by("SMP00061")), [["Show details", "Show details"]]);
  assert.equal(d.cls(by("SMP00065"), "mc-sub")[0].textContent, "J&T Express · " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+TODAY.slice(5, 7) - 1] + " " + +TODAY.slice(8));
  assert.ok(!d.body.textContent.includes("Address") && !d.body.textContent.includes("Export") && !d.body.textContent.includes("Date placed"));
  assert.ok(d.cls(by("SMP00065"), "ol-ib")[0].getAttribute("class").includes("check") && d.cls(by("SMP00063"), "ol-ib")[0].getAttribute("class").includes("truck"));
  d.cls(by("SMP00063"), "ol-ib")[0].fire("click");
  assert.ok(dlgOf(d).textContent.includes("Add shipment for order SMP00063"), "the truck opens the manual courier and tracking dialog");
  d.api.hide();
  d.cls(by("SMP00065"), "ol-ib")[0].fire("click"); await settle();
  assert.ok(dlgOf(d).textContent.includes("Mark order SMP00065 delivered"), "the check opens the mark delivered dialog");
});

test("v2 switch off: same hero, search and table; three tiles, Verified, no shipment buttons, Delivered 0", async () => {
  const d = boot({ rows: V2_ROWS.map((r) => ({ ...r, shipping_enabled: false, shipment_status: undefined })) });
  await d.show();
  assert.deepEqual(d.cls(d.body, "ol-tile").map((b) => b.textContent), ["1Under reviewAction needed", "1Needs attentionProof rejected · waiting on buyer", "4VerifiedPayment approved"]);
  assert.equal(d.cls(d.body, "ol-tiles")[0].classList.contains("off"), true);
  assert.deepEqual(statText(d, "Delivered")[0], "0");
  assert.equal(statText(d, "Sales this month")[0], "₱4,464.00");
  assert.equal(d.cls(d.body, "ol-ib").filter((b) => ["Add shipment", "Mark delivered"].includes(b.getAttribute("aria-label"))).length, 0);
  assert.ok(d.$("po-q") && d.press(d.body, "Search"));
  assert.deepEqual(d.cls(d.body, "mc-rowwrap").map((r) => d.cls(r, "chip")[0].textContent).filter((t) => t === "Verified").length, 4);
});

test("v2 look: light-blue focus, never gold; icon buttons 44 px; the hero is solid brand blue; no TWCinc, no export", () => {
  const css = fs.readFileSync(path.join(PUBLIC, "assets", "css", "pack-orders.css"), "utf8");
  assert.ok(/\.ol-search input:focus\{[^}]*var\(--link\)/.test(css) && /\.ol-ib:focus-visible\{[^}]*var\(--link\)/.test(css) && /\.ol-tile:focus-visible\{[^}]*var\(--link\)/.test(css));
  assert.ok(/\.ol-ib\{[^}]*width:44px;height:44px/.test(css));
  assert.ok(/\.ol-hero\{[^}]*background:var\(--primary\)/.test(css));
  assert.ok(!/<h[1-6][^>]*tabindex/.test(read("pack-orders.js")) && !/tabindex/.test(read("pack-orders.js")), "titles in the list are not focusable");
});
