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
    const m = /^\/sites\/site_[0-9a-z]{20}\/pack\/orders\/(?:([a-z0-9_]+)\/(?:(approve|reject)\/|proofs\/([a-z0-9_]+)\/)?)?(?:\?filter=(\w+))?$/.exec(p);
    if (p === "/sites/") return res(200, { items: [{ id: A, template: "sante" }], next_cursor: null });
    if (!m) return res(404, { error: { code: "not_found", message: "Not found." } });
    if (!m[1]) return res(listStatus, listStatus === 200 ? { orders: state.rows } : { error: { code: "x", message: "Broken." } });
    if (m[3]) return proofStatus === 200 ? res(200, {}) : res(proofStatus, {});
    if (m[2]) {
      if (decideStatus !== 200) return res(decideStatus, decideBody || { error: { code: "stale", message: "Stale." } });
      const o = state.rows.find((r) => r.id === m[1]); o.payment_status = m[2] === "approve" ? "verified" : "rejected"; o.state_version++;
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
  const press = (n, label, i = 0) => buttons(n).filter((b) => b.textContent === label)[i];
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
  assert.deepEqual(d.cls(d.body, "mc-stage").map((b) => b.textContent), ["1Under review", "1Needs attention", "1Verified"]);
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
  assert.ok(d.cls(rows[0], "mc-pointer")[0].textContent.endsWith("In payment review queue"));
  assert.deepEqual(d.buttons(rows[1]).map((b) => b.textContent), ["Approve", "Details ▾"], "rejected: Approve and Details, no Reject");
  assert.deepEqual(d.buttons(rows[2]).map((b) => b.textContent), ["Details ▾"]);
  assert.ok(d.cls(d.body, "mc-th")[0].textContent.startsWith("Order #CustomerPayment"));
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
  d.cls(d.body, "mc-stage")[1].fire("click");
  assert.equal(d.cls(d.body, "mc-rowwrap").length, 1);
  assert.equal(d.cls(d.cls(d.body, "mc-rowwrap")[0], "mc-order")[0].textContent, "SMP00038");
  assert.equal(d.cls(d.body, "mc-ticket").length, 1, "the review queue is not filtered away");
  assert.equal(d.cls(d.body, "mc-stage")[1].getAttribute("aria-pressed"), "true");
  assert.equal(d.$("po-sub").textContent, "Track every order from approval to delivery · 1 under current filters");
  const clear = d.cls(d.body, "mc-clear")[0];
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
  assert.equal(d.cls(d.body, "mc-pipe").length, 1);
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
  d.press(d.cls(d.body, "mc-rowwrap")[1], "Details ▾").fire("click");
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
  assert.deepEqual(d.cls(d.body, "mc-stage").map((b) => b.textContent), ["0Under review", "1Needs attention", "2Verified"]);
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
