/* The owner documents on the Billing page (billing.js, ClickUp z8uq9mhbgh): Statements, BIR invoices and Billing details, under
   Payment history. Driven like billing.test.mjs: the small stand-in document (dom.mjs) and a recorded fetch. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const SRC = read("billing.js");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const B = `/sites/${A}/billing/`;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

const BILLING = { state: "active", storefront_served: true, billing_only: false,
  plan: { name: "NegosyoOnline Monthly", price_centavos: 249900, currency: "PHP", interval: "month", trial_days: 14 },
  trial_start_at: "2026-11-01T00:00:00+08:00", trial_end_at: "2026-11-15T00:00:00+08:00",
  current_cycle: { sequence: 1, start_at: "2026-11-20T00:00:00+08:00", end_at: "2027-05-20T00:00:00+08:00", settlement: "paid" },
  next_due_at: "2027-05-20T00:00:00+08:00", attention_ends_at: null, cancel_requested_at: null, service_end_at: null, download_until: null, deletion_due_at: null,
  pay_by: null, clocks_started: false, billing_exempt: false, outstanding_centavos: 0, can_cancel: true, can_reactivate: false };
const PAY = { payable: false, not_payable_reason: "paid_ahead", payable_from: null, offers: [], usage: { centavos: 0, lines: 0, payable_alone: false },
  transfer_accounts: [], under_review: null, latest: null, proof_rules: { max_bytes: 5242880, content_types: ["image/jpeg"] } };
const stm = (n, over = {}) => ({ number: `NOBS-2026-${String(n).padStart(6, "0")}`, kind: "statement", document_type: "billing_statement", issued_at: "2026-11-21T10:00:00+08:00",
  period_start: "2026-11-20T00:00:00+08:00", period_end: "2027-05-20T00:00:00+08:00", total_centavos: 499900, currency: "PHP", is_test: true, delivery_state: "none", ...over });
const inv = (n, over = {}) => ({ id: `mbi_${n}`, state: "available", message: "View copy", plan: "launch_promo", period_start_at: "2026-11-20T00:00:00+08:00",
  period_end_at: "2027-05-20T00:00:00+08:00", paid_at: "2026-11-20T15:00:00+08:00", total_centavos: 499900, is_test: true, ...over });
const PROFILE = { company_name: "Live4More Test Co.", billing_email: "billing@live4more.test", address: "1 Fake Street, Test City", tin: "000-000-000-000", updated_at: "2026-11-21T10:00:00+08:00" };
const err = (status, code, message, fields) => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });
const ok = (body) => ({ status: 200, body });

function boot(init = {}) {
  const doc = makeDocument(), calls = [], toasts = [], urls = { made: [], freed: [] }, clicks = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["bl-root", "bl-live", "bl-dialog-slot", "h-settings-billing"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const realCreate = doc.createElement;
  doc.createElement = (tag) => { const n = realCreate(tag); if (tag === "a") n.click = () => clicks.push({ download: n.getAttribute("download"), href: n.getAttribute("href") }); return n; };
  const st = { stm: ok({ items: [stm(2), stm(1, { is_test: false })], next_cursor: null }), inv: ok({ items: [inv(1), inv(2, { state: "pending", message: "Your invoice copy is not ready yet." })], next_cursor: null }),
    prof: ok(PROFILE), routes: {}, ...init };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", "");
    calls.push({ method: opts.method, path: p, credentials: opts.credentials, body: opts.body ? JSON.parse(opts.body) : null });
    const key = opts.method + " " + p;
    let a = err(404, "not_found", "Not found.");
    if (st.routes[key]) a = typeof st.routes[key] === "function" ? st.routes[key](opts) : st.routes[key];
    else if (key === "GET /sites/") a = ok({ items: [{ id: A, template: "sante", business_name: "Live4More" }], next_cursor: null });
    else if (key === "GET " + B) a = ok(BILLING);
    else if (key === "GET " + B + "payment/") a = ok(PAY);
    else if (key === "GET " + B + "payments/?limit=20") a = ok({ items: [], next_cursor: null });
    else if (/^GET .*\/billing\/statements\/\?limit=10$/.test(key)) a = st.stm;
    else if (/^GET .*\/billing\/invoices\/\?limit=10$/.test(key)) a = st.inv;
    else if (key === "GET " + B + "profile/") a = st.prof;
    else if (key === "PUT " + B + "profile/") a = ok({ ...PROFILE, ...JSON.parse(opts.body) });
    else if (/\/pdf\/$/.test(p)) return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(["%PDF"], { type: "application/pdf" })) });
    else if (/\/copy\/$/.test(p)) return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(["x"], { type: "image/jpeg" })) });
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const location = { search: "", pathname: "/settings/billing/", replace() {}, assign() {} };
  const history = { pushState() {}, replaceState() {} };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const URLish = { createObjectURL(b) { urls.made.push(b); return "blob:held/" + urls.made.length; }, revokeObjectURL(u) { urls.freed.push(u); } };
  const context = vm.createContext({ window, document: doc, location, history, console, URLSearchParams, URL: URLish, Promise, setTimeout, clearTimeout, Intl, FormData, File, Blob, Date,
    setInterval: () => 1, clearInterval() {}, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch, navigator: {} });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(SRC, context, { filename: "billing.js" });
  window.NODash.toast = (title, text, kind) => toasts.push(title + ": " + (text || "") + (kind ? " [" + kind + "]" : ""));
  window.NODash.refreshAccount = () => {};
  const $ = (id) => doc.getElementById(id), root = $("bl-root");
  const has = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n = root) => n.all((x) => x.tagName === "BUTTON");
  const labels = (n = root) => buttons(n).map((b) => b.textContent);
  const card = (title) => has(root, "bl-card").find((c) => has(c, "bl-h2")[0] && has(c, "bl-h2")[0].textContent === title);
  const click = (n, label) => { const b = buttons(n).find((x) => x.textContent === label); assert.ok(b, "a button named " + label + " in: " + labels(n)); b.fire("click"); return b; };
  return { doc, calls, toasts, urls, clicks, st, $, root, has, buttons, labels, card, click, window,
    list: () => calls.map((c) => c.method + " " + c.path), text: (n = root) => n.textContent,
    dialog: () => has($("bl-dialog-slot"), "bl-dialog")[0] || null,
    async show() { window.NOBilling.show(); await settle(); } };
}

test("all three cards render under Payment history with data: statements, BIR invoices, billing details", async () => {
  const d = boot(); await d.show();
  const titles = d.has(d.root, "bl-h2").map((h) => h.textContent);
  assert.deepEqual(titles.slice(titles.indexOf("Payment history")), ["Payment history", "Statements", "BIR invoices", "Billing details"]);
  const s = d.card("Statements");
  assert.equal(d.has(s, "bl-drow").length, 2);
  assert.match(d.text(s), /NOBS-2026-000002/); assert.match(d.text(s), /Issued Nov 21, 2026/); assert.match(d.text(s), /Period Nov 20, 2026 to May 20, 2027/); assert.match(d.text(s), /PHP 4,999\.00/);
  assert.deepEqual(d.has(s, "chip").map((c) => c.textContent), ["Test"], "the Test tag only on the is_test row");
  assert.deepEqual(d.labels(s), ["View", "Download PDF", "View", "Download PDF"]);
  const i = d.card("BIR invoices");
  assert.match(d.text(i), /Paid Nov 20, 2026/); assert.deepEqual(d.has(i, "chip").map((c) => c.textContent), ["Test", "Test"]);
  const p = d.card("Billing details");
  assert.match(d.text(p), /Live4More Test Co\./); assert.match(d.text(p), /billing@live4more\.test/); assert.match(d.text(p), /1 Fake Street/); assert.match(d.text(p), /000-000-000-000/);
  assert.deepEqual(d.labels(p), ["Edit"]);
  assert.match(d.text(p), /These details appear on future documents only\./);
  for (const c of d.calls) assert.equal(c.credentials, "include");
});

test("empty lists: Statements says it, nothing is an error", async () => {
  const d = boot({ stm: ok({ items: [], next_cursor: null }), inv: ok({ items: [], next_cursor: null }), prof: ok({ company_name: "", billing_email: "", address: "", tin: "", updated_at: null }) });
  await d.show();
  assert.match(d.text(d.card("Statements")), /No statements yet\./);
  assert.ok(d.card("BIR invoices"));
  assert.match(d.text(d.card("Billing details")), /Not added yet/);
  assert.equal(d.root.all((n) => n.getAttribute("role") === "alert").length, 0);
});

test("a route that answers 404 hides its card quietly, the others stay; no error box", async () => {
  const d = boot({ stm: err(404, "not_found", "Not found."), inv: err(404, "not_found", "Not found."), prof: err(404, "not_found", "Not found.") });
  await d.show();
  for (const t of ["Statements", "BIR invoices", "Billing details"]) assert.equal(d.card(t), undefined, t);
  assert.ok(d.card("Payment history"), "the page itself is untouched");
  assert.equal(d.root.all((n) => n.getAttribute("role") === "alert").length, 0);
  assert.doesNotMatch(d.text(), /could not load|Try again/);
  const e = boot({ stm: err(404, "not_found", "Not found.") }); await e.show();
  assert.equal(e.card("Statements"), undefined); assert.ok(e.card("BIR invoices")); assert.ok(e.card("Billing details"));
});

test("a failed read (not 404) shows a retry inside the card, and Try again reloads it", async () => {
  const d = boot({ stm: err(500, "server_error", "x") }); await d.show();
  assert.match(d.text(d.card("Statements")), /We could not load this/);
  d.st.stm = ok({ items: [stm(1)], next_cursor: null });
  d.click(d.card("Statements"), "Try again"); await settle();
  assert.match(d.text(d.card("Statements")), /NOBS-2026-000001/);
});

test("Load more: ten rows then the API cursor; the button goes when there is no next page", async () => {
  const first = Array.from({ length: 10 }, (_, k) => stm(20 - k));
  const d = boot({ stm: ok({ items: first, next_cursor: "stm_cursor10" }) });
  d.st.routes["GET " + B + "statements/?limit=10&cursor=stm_cursor10"] = ok({ items: [stm(10), stm(9)], next_cursor: null });
  await d.show();
  assert.ok(d.list().includes("GET " + B + "statements/?limit=10"));
  assert.equal(d.has(d.card("Statements"), "bl-drow").length, 10);
  d.click(d.card("Statements"), "Load more"); await settle();
  assert.ok(d.list().includes("GET " + B + "statements/?limit=10&cursor=stm_cursor10"));
  assert.equal(d.has(d.card("Statements"), "bl-drow").length, 12);
  assert.ok(!d.labels(d.card("Statements")).includes("Load more"));
  assert.match(d.text(d.card("Statements")), /NOBS-2026-000009/);
});

test("invoices: available shows View copy; pending shows the backend's own message and no button", async () => {
  const d = boot(); await d.show();
  const rows = d.has(d.card("BIR invoices"), "bl-drow");
  assert.deepEqual(d.labels(rows[0]), ["View copy"]);
  assert.deepEqual(d.labels(rows[1]), []);
  assert.equal(d.has(rows[1], "bl-dpad").length, 1);
  assert.equal(d.has(rows[0], "bl-dpad").length, 0);
  assert.match(d.text(rows[1]), /Your invoice copy is not ready yet\./);
  assert.match(d.text(rows[0]), /PHP 4,999\.00/);
  d.click(rows[0], "View copy"); await settle();
  assert.ok(d.list().includes("GET " + B + "invoices/mbi_1/copy/"));
  const dlg = d.dialog(); assert.ok(dlg);
  assert.equal(d.urls.made.length, 1);
  const img = dlg.all((n) => n.tagName === "IMG")[0];
  assert.equal(img.getAttribute("src"), "blob:held/1");
  assert.ok(!d.doc.body.all((n) => /\/copy\/|\/pdf\//.test(n.getAttribute("href") || n.getAttribute("src") || "")).length, "no private address in the page");
});

test("Download PDF fetches the private file with the cookie and downloads it from a blob URL", async () => {
  const d = boot(); await d.show();
  d.click(d.has(d.card("Statements"), "bl-drow")[0], "Download PDF"); await settle();
  const c = d.calls.find((x) => /\/pdf\/$/.test(x.path));
  assert.equal(c.path, B + "statements/NOBS-2026-000002/pdf/"); assert.equal(c.credentials, "include");
  assert.deepEqual(d.clicks, [{ download: "NOBS-2026-000002.pdf", href: "blob:held/1" }]);
});

test("View opens the statement detail from the API: lines, total, issuer and bill-to", async () => {
  const d = boot();
  d.st.routes["GET " + B + "statements/NOBS-2026-000002/"] = ok({ ...stm(2), label: "System-generated document", original_number: null, payment_reference: "BTP-1",
    issuer: { legal_name: "Fake Issuer Inc.", registered_address: "9 Fake Road", tin: "111-111-111-000" }, bill_to: { name: "Live4More Test Co.", email: "billing@live4more.test", address: "1 Fake Street", tin: "000" },
    lines: [{ position: 1, kind: "plan", description: "Launch Promo (6 months)", quantity: 1, unit_centavos: 499900, amount_centavos: 499900 }] });
  await d.show();
  d.click(d.has(d.card("Statements"), "bl-drow")[0], "View"); await settle();
  const t = d.text(d.dialog());
  assert.match(t, /Statement NOBS-2026-000002/); assert.match(t, /Launch Promo \(6 months\)/); assert.match(t, /Fake Issuer Inc\./); assert.match(t, /Live4More Test Co\./); assert.match(t, /PHP 4,999\.00/);
  d.click(d.dialog(), "×"); assert.equal(d.dialog(), null);
});

test("Edit billing details: four fields, Cancel sends nothing, Save sends exactly the four and updates the card", async () => {
  const d = boot(); await d.show();
  d.click(d.card("Billing details"), "Edit");
  const dlg = d.dialog(); assert.ok(dlg);
  assert.deepEqual(["bl-pf-company_name", "bl-pf-billing_email", "bl-pf-address", "bl-pf-tin"].map((id) => d.$(id).value), [PROFILE.company_name, PROFILE.billing_email, PROFILE.address, PROFILE.tin]);
  d.click(dlg, "Cancel"); assert.equal(d.dialog(), null);
  assert.ok(!d.list().some((x) => x.startsWith("PUT ")));
  d.click(d.card("Billing details"), "Edit");
  d.$("bl-pf-company_name").value = "  New Name Co.  "; d.$("bl-pf-tin").value = "123-456-789-000";
  d.click(d.dialog(), "Save"); await settle();
  const put = d.calls.find((x) => x.method === "PUT");
  assert.equal(put.path, B + "profile/");
  assert.deepEqual(put.body, { company_name: "New Name Co.", billing_email: PROFILE.billing_email, address: PROFILE.address, tin: "123-456-789-000" });
  assert.equal(d.dialog(), null);
  assert.match(d.text(d.card("Billing details")), /New Name Co\./);
  assert.ok(d.toasts.some((t) => /Billing details saved/.test(t)));
});

test("Edit billing details: an API field error shows beside its field and keeps the dialog open", async () => {
  const d = boot();
  d.st.routes["PUT " + B + "profile/"] = err(400, "invalid_request", "Some values are missing or invalid.", { billing_email: ["Enter a valid email address."], company_name: ["A company or business name is needed."] });
  await d.show();
  d.click(d.card("Billing details"), "Edit");
  d.$("bl-pf-billing_email").value = "nope"; d.$("bl-pf-company_name").value = "";
  d.click(d.dialog(), "Save"); await settle();
  assert.ok(d.dialog(), "still open");
  const e = d.$("bl-pf-billing_email-err"); assert.equal(e.hidden, false); assert.equal(e.textContent, "Enter a valid email address.");
  assert.equal(d.$("bl-pf-billing_email").getAttribute("aria-invalid"), "true");
  assert.equal(d.$("bl-pf-company_name-err").textContent, "A company or business name is needed.");
  assert.equal(d.doc.activeElement, d.$("bl-pf-company_name"));
  assert.match(d.text(d.card("Billing details")), /Live4More Test Co\./, "the card still shows the saved details");
});

test("the source builds with textContent only: no innerHTML, no storage", () => {
  assert.doesNotMatch(SRC, /innerHTML|localStorage|sessionStorage/);
});
