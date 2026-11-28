/* The Billing page (billing.js, ClickUp z8uq9mek5q): plan, trial and cycle state, paying by bank transfer with the
   sender's details and a proof, the proof's outcome, cancel and reactivate, all against /sites/{id}/billing/.
   Driven like payments.test.mjs: the small stand-in document (dom.mjs) and a recorded fetch. */
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

const OFFER = {
  promo: { plan: "launch_promo", name: "NegosyoOnline Launch Promo (6 Months)", amount_centavos: 499900, usage_centavos: 0, currency: "PHP", months: 6, version: 1, term_months: 6,
    period_start_at: "2026-11-27T00:00:00+08:00", period_end_at: "2027-05-27T15:00:00+08:00", starts_at_confirmation: false,
    then: { plan: "monthly", amount_centavos: 249900, interval: "month", first_due_at: "2027-05-27T15:00:00+08:00" },
    consent: { required: true, version: "promo-consent-1", then: { plan: "monthly", amount_centavos: 249900, interval: "month", first_due_at: "2027-05-27T15:00:00+08:00" }, first_due_at: "2027-05-27T15:00:00+08:00" } },
  monthly: { plan: "monthly", name: "NegosyoOnline Monthly", amount_centavos: 249900, usage_centavos: 0, currency: "PHP", months: 1, version: 1, term_months: 1,
    period_start_at: "2026-11-27T00:00:00+08:00", period_end_at: "2026-12-27T15:00:00+08:00", starts_at_confirmation: false, then: null, consent: null },
  annual: { plan: "annual", name: "NegosyoOnline Annual", amount_centavos: 2499000, usage_centavos: 0, currency: "PHP", months: 12, version: 1, term_months: 12,
    period_start_at: "2026-11-27T00:00:00+08:00", period_end_at: "2027-11-27T15:00:00+08:00", starts_at_confirmation: false,
    then: { plan: "annual", amount_centavos: 2499000, interval: "year", first_due_at: "2027-11-27T15:00:00+08:00" }, consent: null },
};
const ACCOUNT = { kind: "bank", provider_name: "Test Bank", account_name: "NegosyoOnline Test", account_number: "0000-0000-00" };
const billing = (over = {}) => ({ state: "trial_active", storefront_served: true, billing_only: false,
  plan: { name: "NegosyoOnline Monthly", price_centavos: 249900, currency: "PHP", interval: "month", trial_days: 14 },
  trial_start_at: "2026-11-13T00:00:00+08:00", trial_end_at: "2026-11-27T00:00:00+08:00",
  current_cycle: { sequence: 0, start_at: "2026-11-13T00:00:00+08:00", end_at: "2026-11-27T00:00:00+08:00", settlement: "not_billable" },
  next_due_at: "2026-11-27T00:00:00+08:00", attention_ends_at: null, cancel_requested_at: null, service_end_at: null, download_until: null, deletion_due_at: null,
  pay_by: null, clocks_started: false, billing_exempt: false, outstanding_centavos: 0, can_cancel: true, can_reactivate: false, ...over });
const payment = (over = {}) => ({ id: "btp_1", status: "submitted", plan: "monthly", amount_centavos: 249900, usage_centavos: 0, currency: "PHP",
  transferred_on: "2026-11-20", transferred_at: "2026-11-20T14:30:00+08:00", transfer_reference: "REF-7781", sender_bank: "BDO", sender_first_name: "Ana", sender_last_name: "Reyes",
  sender_account_number: "1234 5678 12", amount_sent_centavos: 249900, submitted_at: "2026-11-20T15:00:00+08:00", decided_at: null, reject_reason: null, reject_note: "",
  proof: { content_type: "image/jpeg", size_bytes: 3 }, cycle: null, ...over });
const payInfo = (over = {}) => ({ payable: true, not_payable_reason: null, payable_from: null, offers: [OFFER.promo, OFFER.monthly], usage: { centavos: 0, lines: 0, payable_alone: false },
  transfer_accounts: [ACCOUNT], under_review: null, latest: null, proof_rules: { max_bytes: 5242880, content_types: ["image/jpeg", "image/png", "application/pdf"] }, ...over });
const err = (status, code, message, fields) => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });

/* The browser parts the page asks of the document: a form-field stand-in, history that moves location, object URLs, timers. */
function boot(init = {}) {
  const doc = makeDocument(), calls = [], toasts = [], urls = { made: [], freed: [] };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["bl-root", "bl-live", "bl-dialog-slot", "h-billing-x", "h-settings-billing"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const st = { sites: [{ id: A, template: "sante", business_name: "Ana's" }], billing: billing(), pay: payInfo(), payments: [], plan: { plans: [{ plan: "annual", saving_centavos: 499800 }] },
    routes: {}, usage404: true, ...init };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), multipart = opts.body instanceof FormData;
    const entries = multipart ? [...opts.body.entries()] : [];
    calls.push({ method: opts.method, path: p, multipart, entries, fields: Object.fromEntries(entries), credentials: opts.credentials });
    let a = err(404, "not_found", "Not found.");
    const key = opts.method + " " + p;
    if (st.routes[key]) a = typeof st.routes[key] === "function" ? st.routes[key](opts) : st.routes[key];
    else if (key === "GET /sites/") a = { status: 200, body: { items: st.sites, next_cursor: null } };
    else if (key === "GET " + B) a = st.billing ? { status: 200, body: st.billing } : err(404, "not_found", "Not found.");
    else if (key === "GET " + B + "payment/") a = st.pay ? { status: 200, body: st.pay } : err(404, "not_found", "Not found.");
    else if (key === "GET " + B + "payments/?limit=20") a = { status: 200, body: { items: st.payments, next_cursor: null } };
    else if (key === "GET /plan/") a = { status: 200, body: st.plan };
    else if (key === "POST " + B + "payments/") {
      const row = payment({ id: "btp_new", plan: opts.body.get("plan") });
      st.payments = [row, ...st.payments.map((x) => (x.status === "submitted" ? { ...x, status: "replaced" } : x))]; st.pay = { ...st.pay, under_review: row, latest: row };
      a = { status: 201, body: row };
    } else if (key === "POST " + B + "cancel/") { st.billing = { ...st.billing, state: "cancelled", can_cancel: false, can_reactivate: true, service_end_at: "2026-12-20T00:00:00+08:00" }; a = { status: 200, body: st.billing }; }
    else if (key === "POST " + B + "reactivate/") { st.billing = billing({ state: "active", current_cycle: { sequence: 1, start_at: "2026-11-20T00:00:00+08:00", end_at: "2026-12-20T00:00:00+08:00", settlement: "paid" } }); a = { status: 200, body: st.billing }; }
    else if (/\/proof\/$/.test(p)) return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(["x"], { type: "image/jpeg" })) });
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const location = { search: init.search || "", pathname: "/settings/billing/", replace() {}, assign() {} };
  const set = (u) => { const i = u.indexOf("?"); location.pathname = i < 0 ? u : u.slice(0, i); location.search = i < 0 ? "" : u.slice(i); };
  const history = { pushState(s, t, u) { set(u); }, replaceState(s, t, u) { set(u); } };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const timers = [];
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const URLish = { createObjectURL(b) { urls.made.push(b); return "blob:held/" + urls.made.length; }, revokeObjectURL(u) { urls.freed.push(u); } };
  const context = vm.createContext({ window, document: doc, location, history, console, URLSearchParams, URL: URLish, Promise, setTimeout, clearTimeout, Intl, FormData, File, Blob, Date,
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearInterval() {}, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch,
    navigator: {} });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(SRC, context, { filename: "billing.js" });
  window.NODash.toast = (title, text, kind) => toasts.push(title + ": " + (text || "") + (kind ? " [" + kind + "]" : ""));
  window.NODash.refreshAccount = () => {};
  const $ = (id) => doc.getElementById(id), root = $("bl-root");
  const has = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n = root) => n.all((x) => x.tagName === "BUTTON");
  const labels = (n = root) => buttons(n).map((b) => b.textContent);
  const press = (n, label) => buttons(n).find((b) => b.textContent === label || b.textContent.startsWith(label));
  const click = (n, label) => { const b = press(n, label); assert.ok(b, "a button named " + label + " in: " + labels(n)); b.fire("click"); };
  const text = (n = root) => n.textContent;
  return { doc, calls, toasts, st, urls, location, timers, $, root, has, buttons, labels, press, click, text, window,
    list: () => calls.map((c) => c.method + " " + c.path),
    async show() { window.NOBilling.show(); await settle(); },
    async go(search) { set("/settings/billing/" + search); window.NOBilling.show(); await settle(); },
    hero: () => has(root, "bl-hero")[0],
    chips: (n = root) => has(n, "chip").map((c) => c.textContent),
    fill(id, v) { const n = $(id); n.value = v; n.fire("input"); n.fire("change"); return n; },
    file(f) { const n = $("bl-f-file"); n.files = f ? [f] : []; n.fire("change"); },
    sendBtn: () => $("bl-send") };
}

const JPEG = (size = 3, type = "image/jpeg") => { const f = new File(["x"], "receipt.jpg", { type }); Object.defineProperty(f, "size", { value: size }); return f; };
const VALID = { "bl-f-bank": "BDO", "bl-f-ref": "REF-1", "bl-f-first": "Ana", "bl-f-last": "Reyes", "bl-f-acct": "1234 5678 12", "bl-f-amount": "4,999" };
async function fillForm(d, over = {}, { time = true, file = true } = {}) {
  for (const [id, v] of Object.entries({ ...VALID, ...over })) d.fill(id, v);
  if (time) { d.fill("bl-f-date", "2026-11-01"); d.fill("bl-f-hr", "2"); d.fill("bl-f-mn", "05"); d.fill("bl-f-ap", "PM"); }
  if (file) d.file(JPEG());
}

/* ---- 1. routes and vocabulary ---- */
test("every request is to a /sites/{id}/billing/ route, /sites/ or /plan/; none to /billing/sites/; no gateway, video or business-day wording in the source", async () => {
  const d = boot({ pay: payInfo({ offers: [OFFER.promo, OFFER.monthly, OFFER.annual] }) });
  await d.go("?site=" + A + "&pay=choose");
  d.click(d.root, "Choose"); /* Monthly or Annual, whichever comes first after the promo */
  await settle();
  for (const c of d.calls) {
    assert.doesNotMatch(c.path, /\/billing\/sites\//);
    assert.match(c.path, new RegExp("^(/sites/$|/plan/$|/sites/" + A + "/billing/)"), c.path);
    assert.equal(c.credentials, "include");
  }
  assert.ok(d.list().includes("GET " + B) && d.list().includes("GET " + B + "payment/") && d.list().includes("GET " + B + "payments/?limit=20"));
  assert.doesNotMatch(SRC.replace("Images and videos in your Media Library.", "").replace(/\/\* V-1 video start \*\/[\s\S]*?\/\* V-1 video end \*\//g, ""), /xendit|paymongo|gateway|business day|business-day|video|\/billing\/sites\/|innerHTML|localStorage|sessionStorage/i);
});

/* ---- 2. the states of the home page ---- */
const STATES = [
  ["trial", { billing: billing() }, { chip: null, head: "Your free trial ends in", buttons: ["Pay by bank transfer"], cancel: true }],
  ["active and paid, payable", { billing: billing({ state: "active", current_cycle: { sequence: 1, start_at: "2026-11-20T00:00:00+08:00", end_at: "2026-12-20T00:00:00+08:00", settlement: "paid" }, next_due_at: "2026-12-20T00:00:00+08:00" }) },
    { chip: "Active", head: "Your subscription is active", buttons: ["Pay for the next period"], cancel: true }],
  ["payment needs attention", { billing: billing({ state: "payment_requires_attention", attention_ends_at: "2026-12-01T00:00:00+08:00" }) },
    { chip: "Payment needs attention", head: "Pay by Dec 1, 2026 to keep your site online.", buttons: ["Pay by bank transfer"], cancel: true }],
  ["suspended", { billing: billing({ state: "suspended", billing_only: true, can_cancel: false, deletion_due_at: "2027-01-01T00:00:00+08:00", pay_by: "2026-12-30T00:00:00+08:00" }) },
    { chip: "Suspended", head: "Your site is limited to Billing.", buttons: ["Pay by bank transfer"] }],
  ["cancelled, still running", { billing: billing({ state: "cancelled", can_cancel: false, can_reactivate: true, service_end_at: "2026-12-20T00:00:00+08:00" }), pay: payInfo({ payable: false, not_payable_reason: "cancel_scheduled" }) },
    { chip: "Cancelled", head: "Cancelled.", buttons: ["Keep my subscription"] }],
  ["cancelled and ended", { billing: billing({ state: "cancelled", billing_only: true, can_cancel: false, deletion_due_at: "2027-01-01T00:00:00+08:00" }) },
    { chip: "Cancelled", head: "Your site is limited to Billing.", buttons: ["Pay by bank transfer"] }],
  ["trial ended, no payment method", { billing: billing({ state: "cancelled_no_payment_method", billing_only: true, can_cancel: false, deletion_due_at: "2027-01-01T00:00:00+08:00" }) },
    { chip: "Trial ended", head: "Your site is limited to Billing.", buttons: ["Pay by bank transfer"] }],
  ["billing exempt", { billing: billing({ billing_exempt: true }), pay: payInfo({ payable: false, not_payable_reason: "billing_exempt" }) },
    { chip: "No billing", head: "Billing does not apply to this site.", buttons: [] }],
  ["the last date to pay has passed", { billing: billing({ state: "suspended", billing_only: true, can_cancel: false }), pay: payInfo({ payable: false, not_payable_reason: "past_deletion_date" }) },
    { chip: "Last date passed", head: "The last date to pay has passed.", buttons: [] }],
];
for (const [name, init, want] of STATES) {
  test(`state: ${name}: the chip, the headline and the actions shown`, async () => {
    const d = boot(init);
    await d.show();
    const hero = d.hero();
    assert.equal(d.root.getAttribute("aria-busy"), null);
    assert.deepEqual(d.chips(hero), want.chip ? [want.chip] : []);
    assert.equal(d.has(hero, "bl-head")[0].textContent, want.head);
    assert.deepEqual(d.labels(hero), want.buttons);
    const rows = d.has(d.root, "bl-cancelrow");
    assert.equal(rows.length, want.cancel ? 1 : 0);
    if (want.cancel) {
      assert.deepEqual(d.labels(rows[0]), ["Cancel subscription"]);
      assert.equal(d.root.children[d.root.children.length - 1], rows[0], "the cancel row is the last thing on the page");
    }
    assert.doesNotMatch(d.text(), /xendit|statement|invoice|video|business day/i);
  });
}

/* ---- the data-request paragraph (z8uq9mep8q): the Billing-only notice of a suspended or ended site, and no other ---- */
const DATA_TEXT = "To ask for a copy of your store data, or for any other request about your data, email support@negosyoonline.com from your account email. What happens to your data after the service ends is set out in our Terms of Service and Privacy Policy.";
const ENDED = { deletion_due_at: "2027-01-01T00:00:00+08:00", billing_only: true, can_cancel: false };
const dataParas = (d) => d.has(d.hero(), "bl-data");
for (const [name, init] of [
  ["suspended", { billing: billing({ state: "suspended", ...ENDED, pay_by: "2026-12-30T00:00:00+08:00" }) }],
  ["cancelled and ended", { billing: billing({ state: "cancelled", ...ENDED }) }],
  ["trial ended, no payment method", { billing: billing({ state: "cancelled_no_payment_method", ...ENDED }) }],
  ["suspended, nothing payable", { billing: billing({ state: "suspended", ...ENDED }), pay: payInfo({ payable: false, not_payable_reason: "payments_closed" }) }],
]) {
  test(`data request text: shown, exact, with its links, for ${name}`, async () => {
    const d = boot(init);
    await d.show();
    const hero = d.hero(), paras = dataParas(d);
    assert.equal(paras.length, 1);
    assert.equal(paras[0].textContent, DATA_TEXT);
    assert.equal(hero.children[hero.children.length - 1], paras[0], "the last thing in the notice");
    const links = paras[0].all((x) => x.tagName === "A").map((a) => [a.textContent, a.getAttribute("href")]);
    assert.deepEqual(links, [["support@negosyoonline.com", "mailto:support@negosyoonline.com"], ["Terms of Service", "http://www.test/terms"], ["Privacy Policy", "http://www.test/privacy"]]);
  });
}
for (const [name, init] of [
  ["trial", { billing: billing() }],
  ["active", { billing: billing({ state: "active", current_cycle: { sequence: 1, start_at: "2026-11-20T00:00:00+08:00", end_at: "2026-12-20T00:00:00+08:00", settlement: "paid" } }) }],
  ["payment needs attention", { billing: billing({ state: "payment_requires_attention", attention_ends_at: "2026-12-01T00:00:00+08:00" }) }],
  ["cancelled, still running", { billing: billing({ state: "cancelled", can_cancel: false, can_reactivate: true, service_end_at: "2026-12-20T00:00:00+08:00" }), pay: payInfo({ payable: false, not_payable_reason: "cancel_scheduled" }) }],
  ["billing exempt", { billing: billing({ billing_exempt: true }), pay: payInfo({ payable: false, not_payable_reason: "billing_exempt" }) }],
  ["the last date to pay has passed", { billing: billing({ state: "suspended", billing_only: true, can_cancel: false }), pay: payInfo({ payable: false, not_payable_reason: "past_deletion_date" }) }],
]) {
  test(`data request text: hidden for ${name}`, async () => {
    const d = boot(init);
    await d.show();
    assert.equal(dataParas(d).length, 0);
    assert.doesNotMatch(d.text(), /copy of your store data/);
  });
}

test("billing exempt: no Plan, Payment or history card and no way to pay or cancel", async () => {
  const d = boot({ billing: billing({ billing_exempt: true }), pay: payInfo({ payable: false, not_payable_reason: "billing_exempt" }) });
  await d.show();
  assert.equal(d.has(d.root, "bl-card").length, 0);
  assert.deepEqual(d.labels(), []);
});

test("no pay entry when paid ahead, cancel scheduled, past the deletion date, or when there is no receiving account; too early shows the date to pay from", async () => {
  const active = billing({ state: "active", current_cycle: { sequence: 1, start_at: "2026-11-20T00:00:00+08:00", end_at: "2026-12-20T00:00:00+08:00", settlement: "paid" } });
  for (const reason of ["paid_ahead", "cancel_scheduled", "past_deletion_date", "billing_exempt"]) {
    const d = boot({ billing: active, pay: payInfo({ payable: false, not_payable_reason: reason }) });
    await d.show();
    assert.ok(!d.labels().some((l) => /^Pay /.test(l)), reason + ": " + d.labels());
  }
  const early = boot({ billing: active, pay: payInfo({ payable: false, not_payable_reason: "too_early", payable_from: "2026-12-10T00:00:00+08:00" }) });
  await early.show();
  assert.ok(!early.labels().some((l) => /^Pay /.test(l)));
  assert.match(early.text(), /You can pay for the next term from Dec 10, 2026\./);
  const none = boot({ pay: payInfo({ transfer_accounts: [] }) });
  await none.show();
  assert.ok(!none.labels().some((l) => /^Pay /.test(l)), "empty transfer_accounts: no Pay entry, " + none.labels());
  assert.match(none.text(), /Payments are not open yet\./);
  const off = boot({ pay: null });
  await off.show();
  assert.ok(!off.labels().some((l) => /^Pay /.test(l)));
});

test("the payment card: none yet, under review, rejected (reason in words), approved", async () => {
  let d = boot();
  await d.show();
  assert.deepEqual(d.chips(d.root).filter((c) => /payment/i.test(c)), ["No payment yet"]);
  const review = payment();
  d = boot({ payments: [review], pay: payInfo({ under_review: review, latest: review }) });
  await d.show();
  assert.ok(d.chips().includes("Proof under review"));
  assert.ok(d.labels().includes("View proof") && d.labels().includes("Replace proof"));
  assert.doesNotMatch(d.text(), /business day|within \d|hours? to review/i, "no review-time promise");
  assert.match(d.text(), /Time of transfer/);
  const rej = payment({ status: "rejected", reject_reason: "unreadable" });
  d = boot({ payments: [rej], pay: payInfo({ latest: rej }) });
  await d.show();
  assert.ok(d.chips().includes("Proof rejected"));
  assert.match(d.text(), /We could not read your proof\. Send a clearer photo or file\./);
  assert.match(d.text(), /Your money has not been counted\./);
  assert.ok(d.labels().includes("Send a new proof"));
  const other = payment({ status: "rejected", reject_reason: "other", reject_note: "Wrong reference." });
  d = boot({ payments: [other], pay: payInfo({ latest: other }) });
  await d.show();
  assert.match(d.text(), /Another reason/);
  assert.match(d.text(), /Wrong reference\./);
  const ok = payment({ status: "confirmed", decided_at: "2026-11-21T10:00:00+08:00", cycle: { sequence: 1, start_at: "2026-11-27T00:00:00+08:00", end_at: "2026-12-27T00:00:00+08:00" } });
  d = boot({ billing: billing({ state: "active", current_cycle: ok.cycle && { ...ok.cycle, settlement: "paid" } }), payments: [ok], pay: payInfo({ latest: ok }) });
  await d.show();
  assert.ok(d.chips().includes("Approved"));
  assert.match(d.text(), /Nov 27, 2026 to Dec 27, 2026/);
});

test("a paid Launch Promo term: the Plan card names the promo from the newest confirmed payment", async () => {
  const ok = payment({ status: "confirmed", plan: "launch_promo", amount_centavos: 499900, decided_at: "2026-11-21T10:00:00+08:00", cycle: { sequence: 1, start_at: "2026-11-27T00:00:00+08:00", end_at: "2027-05-27T00:00:00+08:00" } });
  const d = boot({ billing: billing({ state: "active", current_cycle: { ...ok.cycle, settlement: "paid" } }), payments: [ok], pay: payInfo({ latest: ok, payable: false, not_payable_reason: "paid_ahead" }) });
  await d.show();
  assert.match(d.text(), /NegosyoOnline Launch Promo \(6 Months\)/);
  assert.match(d.text(), /PHP 4,999\.00/);
});

/* ---- 3. plan choice and the payment details ---- */
test("page A: Monthly, Launch Promo (highlighted) and, only when offered, Annual, as in the approved mockup; the Annual saving from GET /plan/ when offered, the Annual saving from GET /plan/", async () => {
  let d = boot();
  await d.go("?site=" + A + "&pay=choose");
  assert.deepEqual(d.has(d.root, "bl-plan-name").map((n) => n.textContent), ["NegosyoOnline Monthly", "Launch Promo (6 Months)"]);
  assert.ok(!d.list().includes("GET /plan/"), "no /plan/ call without an Annual offer");
  assert.doesNotMatch(d.text(), /Annual/);
  d = boot({ pay: payInfo({ offers: [OFFER.annual, OFFER.monthly, OFFER.promo] }) });
  await d.go("?site=" + A + "&pay=choose");
  assert.deepEqual(d.has(d.root, "bl-plan-name").map((n) => n.textContent), ["NegosyoOnline Monthly", "Launch Promo (6 Months)", "NegosyoOnline Annual"]);
  assert.ok(d.list().includes("GET /plan/"));
  assert.match(d.text(), /Save PHP 4,998\.00/);
  assert.match(d.text(), /Storefront and orders in one place/);
  assert.doesNotMatch(d.text(), /Storefront, inventory/);
  assert.match(d.text(), /Then PHP 2,499\.00 a month from May 27, 2027\./);
});

test("page A to page B: a plan card opens the payment details for that plan; with no such offer it falls back to the choice", async () => {
  const d = boot();
  await d.go("?site=" + A + "&pay=choose");
  d.click(d.root, "Pay for this plan");
  assert.equal(d.location.search, "?site=" + A + "&pay=send&plan=launch_promo");
  assert.ok(d.$("bl-f-bank") && d.$("bl-send"));
  const e = boot();
  await e.go("?site=" + A + "&pay=send&plan=annual");
  assert.equal(e.location.search, "?site=" + A + "&pay=choose");
  assert.equal(e.$("bl-send"), null);
});

test("page B shows the receiving account from transfer_accounts (never typed in the page) and the exact amount", async () => {
  const d = boot();
  await d.go("?site=" + A + "&pay=send&plan=monthly");
  assert.match(d.text(), /Send exactly PHP 2,499\.00 to this account/);
  for (const v of ["Test Bank", "NegosyoOnline Test", "0000-0000-00"]) assert.ok(d.text().includes(v), v);
  assert.doesNotMatch(SRC, /0000-0000-00|Security Bank|0000082415083/);
  const other = boot({ pay: payInfo({ transfer_accounts: [{ ...ACCOUNT, provider_name: "Other Bank", account_number: "999" }] }) });
  await other.go("?site=" + A + "&pay=send&plan=monthly");
  assert.ok(other.text().includes("Other Bank") && !other.text().includes("Test Bank"));
});

test("page B: every field is required, and Send stays blocked until all are valid", async () => {
  const d = boot();
  await d.go("?site=" + A + "&pay=send&plan=monthly");
  assert.equal(d.sendBtn().disabled, true, "empty form");
  const labelsOn = d.has(d.root, "bl-label").map((l) => l.textContent);
  for (const l of ["Sender Bank *", "Reference Number *", "Sender First Name *", "Sender Last Name *", "Sender Account Number *", "Amount *", "Time of Transfer *", "Upload the Payment Receipt *"]) assert.ok(labelsOn.includes(l), l);
  /* leave out one thing at a time */
  const omissions = [["bl-f-bank", ""], ["bl-f-ref", " "], ["bl-f-first", ""], ["bl-f-last", ""], ["bl-f-acct", ""], ["bl-f-amount", ""]];
  for (const [id, v] of omissions) {
    await fillForm(d, { [id]: v });
    assert.equal(d.sendBtn().disabled, true, id + " empty keeps Send blocked");
  }
  await fillForm(d);
  d.fill("bl-f-ap", "");
  assert.equal(d.sendBtn().disabled, true, "no AM/PM");
  d.fill("bl-f-date", "");
  assert.equal(d.sendBtn().disabled, true, "no date of transfer");
  await fillForm(d, {}, { file: false });
  d.file(null);
  assert.equal(d.sendBtn().disabled, true, "no receipt");
  await fillForm(d);
  assert.equal(d.sendBtn().disabled, false, "everything valid");
});

test("page B: each rule of the backend is checked before any call (account number, amount, future time, receipt type and size)", async () => {
  const d = boot();
  await d.go("?site=" + A + "&pay=send&plan=monthly");
  const refused = async (over, opts, why) => { await fillForm(d, over, opts); assert.equal(d.sendBtn().disabled, true, why); };
  await refused({ "bl-f-acct": "12ab" }, {}, "letters in the account number");
  await refused({ "bl-f-acct": "123" }, {}, "account number too short");
  await refused({ "bl-f-amount": "0" }, {}, "zero amount");
  await refused({ "bl-f-amount": "10.123" }, {}, "three decimals");
  await refused({ "bl-f-amount": "-5" }, {}, "negative amount");
  await fillForm(d);
  d.fill("bl-f-date", "2099-01-01"); d.fill("bl-f-hr", "1"); d.fill("bl-f-mn", "00"); d.fill("bl-f-ap", "AM");
  assert.equal(d.sendBtn().disabled, true, "a future time");
  await fillForm(d);
  d.file(JPEG(3, "text/plain"));
  assert.equal(d.sendBtn().disabled, true, "a .txt receipt");
  d.file(JPEG(6 * 1048576));
  assert.equal(d.sendBtn().disabled, true, "a receipt over 5 MB");
  d.file(JPEG(3, "application/pdf"));
  assert.equal(d.sendBtn().disabled, false, "a PDF is fine");
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 0, "no call was made while refusing");
});

test("the multipart carries exactly the listed fields: Monthly sends no consent field", async () => {
  const d = boot();
  await d.go("?site=" + A + "&pay=send&plan=monthly");
  await fillForm(d, { "bl-f-amount": "2,499" });
  d.click(d.root, "Send proof");
  await settle();
  const post = d.calls.find((c) => c.method === "POST");
  assert.ok(post.multipart);
  assert.equal(post.path, B + "payments/");
  assert.deepEqual(post.entries.map((e) => e[0]).sort(), ["amount_sent", "plan", "proof", "sender_account_number", "sender_bank", "sender_first_name", "sender_last_name", "transfer_reference", "transferred_at", "transferred_on"]);
  assert.equal(post.fields.plan, "monthly");
  assert.equal(post.fields.amount_sent, "2499.00");
  assert.equal(post.fields.transferred_at, "2026-11-01T14:05");
  assert.equal(post.fields.transferred_on, "2026-11-01");
  assert.equal(post.fields.sender_bank, "BDO");
  assert.equal(post.fields.transfer_reference, "REF-1");
  assert.equal(post.fields.sender_account_number, "1234 5678 12");
  assert.ok(post.fields.proof instanceof File);
});

test("the Launch Promo cannot be sent until its consent is ticked, and then sends renewal_consent and the offer's consent_version", async () => {
  const d = boot();
  await d.go("?site=" + A + "&pay=send&plan=launch_promo");
  await fillForm(d);
  assert.equal(d.sendBtn().disabled, true, "consent not ticked");
  assert.match(d.text(), /Launch Promo: PHP 4,999\.00 paid once for 6 months/);
  assert.match(d.text(), /PHP 2,499\.00 a month, with the first monthly payment due May 27, 2027/);
  const box = d.$("bl-consent");
  box.checked = true; box.fire("change");
  assert.equal(d.sendBtn().disabled, false);
  d.click(d.root, "Send proof");
  await settle();
  const post = d.calls.find((c) => c.method === "POST");
  assert.equal(post.fields.renewal_consent, "true");
  assert.equal(post.fields.consent_version, "promo-consent-1");
  assert.equal(post.entries.length, 12);
  assert.equal(post.fields.amount_sent, "4999.00");
  /* Monthly shows no consent block */
  const m = boot();
  await m.go("?site=" + A + "&pay=send&plan=monthly");
  assert.equal(m.$("bl-consent"), null);
});

test("a 201 and a 200 (the same file again) both end on Billing with the proof under review; a network failure never shows success", async () => {
  for (const status of [201, 200]) {
    const d = boot();
    await d.go("?site=" + A + "&pay=send&plan=monthly");
    await fillForm(d, { "bl-f-amount": "2,499" });
    const row = payment({ id: "btp_same", plan: "monthly" });
    d.st.routes["POST " + B + "payments/"] = () => { d.st.payments = [row]; d.st.pay = { ...d.st.pay, under_review: row, latest: row }; return { status, body: row }; };
    d.click(d.root, "Send proof");
    await settle();
    assert.equal(d.location.search, "?site=" + A);
    assert.ok(d.chips().includes("Proof under review"), status + " " + d.chips());
    assert.ok(d.toasts.some((t) => /^Proof sent/.test(t)));
  }
  const net = boot();
  await net.go("?site=" + A + "&pay=send&plan=monthly");
  await fillForm(net, { "bl-f-amount": "2,499" });
  net.st.routes["POST " + B + "payments/"] = { status: 0, body: {} };
  net.click(net.root, "Send proof");
  await settle();
  assert.ok(!net.toasts.some((t) => /^Proof sent/.test(t)));
  assert.ok(net.$("bl-send"), "still on the form");
  assert.match(net.has(net.root, "bl-note").map((n) => n.textContent).join(" "), /could not reach the server/);
});

test("a 400 puts each field's error under that field; 429 and the 409 codes show their own words, never raw text", async () => {
  const d = boot();
  await d.go("?site=" + A + "&pay=send&plan=monthly");
  await fillForm(d, { "bl-f-amount": "2,499" });
  d.st.routes["POST " + B + "payments/"] = err(400, "invalid_request", "Invalid.", { sender_account_number: ["Use 6 to 34 digits."], transferred_at: ["Too late."], proof: ["Not a proof."] });
  d.click(d.root, "Send proof");
  await settle();
  assert.equal(d.$("bl-f-acct-err").textContent, "Use 6 to 34 digits.");
  assert.equal(d.$("bl-f-acct-err").hidden, false);
  assert.equal(d.$("bl-f-time-err").textContent, "Too late.");
  assert.equal(d.$("bl-f-file-err").textContent, "Not a proof.");
  const cases = [[429, "rate_limited", /too many proofs/], [409, "paid_ahead", /already paid for the next term/], [409, "too_early", /pay for the next term later/],
    [409, "past_deletion_date", /last date to pay has passed/], [409, "cancel_scheduled", /Keep your subscription first/], [409, "billing_exempt", /does not apply/]];
  for (const [status, code, re] of cases) {
    const e = boot();
    await e.go("?site=" + A + "&pay=send&plan=monthly");
    await fillForm(e, { "bl-f-amount": "2,499" });
    e.st.routes["POST " + B + "payments/"] = err(status, code, "RAW BACKEND TEXT");
    e.click(e.root, "Send proof");
    await settle();
    const banner = e.has(e.root, "bl-note").map((n) => n.textContent).join(" ") + " " + e.toasts.join(" ");
    assert.match(banner, re, code);
    assert.doesNotMatch(e.text(), /RAW BACKEND TEXT/);
  }
});

test("Replace proof opens the payment details with a line that the new proof replaces the one under review", async () => {
  const review = payment();
  const d = boot({ payments: [review], pay: payInfo({ under_review: review, latest: review }) });
  await d.show();
  d.click(d.root, "Replace proof");
  d.click(d.root, "Choose");
  assert.match(d.text(), /Sending a new proof replaces the one under review\./);
});

/* ---- 4. cancel and reactivate, the pop-ups ---- */
test("Cancel: a pop-up closed by X and Escape only (no Cancel button, full-width primary, backdrop click does nothing, none while in flight); confirm POSTs no body", async () => {
  const d = boot();
  await d.show();
  const opener = d.press(d.root, "Cancel subscription");
  opener.fire("click");
  const slot = d.$("bl-dialog-slot"), dlg = () => slot.all((n) => n.attrs.role === "dialog")[0];
  assert.ok(dlg());
  const names = d.buttons(slot).map((b) => b.textContent);
  assert.deepEqual(names, ["×", "Cancel subscription"], "the X and one primary button; there is no Cancel button");
  const primary = d.press(slot, "Cancel subscription");
  assert.ok(primary.classList.contains("bl-full"), "the primary button is full width");
  assert.equal(d.doc.activeElement.getAttribute("aria-label"), "Close", "focus starts on the X");
  slot.all((n) => n.classList.contains("bl-overlay"))[0].fire("click");
  assert.ok(dlg(), "a click outside does nothing");
  d.doc.fire("keydown", { key: "Escape" });
  assert.equal(dlg(), undefined, "Escape closes it");
  assert.equal(d.doc.activeElement, opener, "focus returns to the opener");
  opener.fire("click");
  d.buttons(slot).find((b) => b.getAttribute("aria-label") === "Close").fire("click");
  assert.equal(dlg(), undefined, "the X closes it");
  /* confirm: no body, nothing closes while the call is in flight */
  opener.fire("click");
  d.st.routes["POST " + B + "cancel/"] = () => { d.st.billing = billing({ state: "cancelled", can_cancel: false, can_reactivate: true, service_end_at: "2026-12-20T00:00:00+08:00" }); return { status: 200, body: d.st.billing }; };
  d.press(slot, "Cancel subscription").fire("click");
  d.doc.fire("keydown", { key: "Escape" });
  assert.ok(dlg(), "Escape does nothing while the call is in flight");
  await settle();
  const post = d.calls.find((c) => c.method === "POST" && c.path === B + "cancel/");
  assert.ok(post && !post.multipart);
  assert.equal(dlg(), undefined);
  assert.ok(d.chips().includes("Cancelled"));
  assert.ok(d.labels().includes("Keep my subscription"));
});

test("Tab and Shift+Tab wrap inside the pop-up", async () => {
  const d = boot();
  await d.show();
  d.click(d.root, "Cancel subscription");
  const slot = d.$("bl-dialog-slot"), x = d.buttons(slot)[0], go = d.buttons(slot)[1];
  d.doc.activeElement = go;
  assert.equal(d.doc.fire("keydown", { key: "Tab" }).prevented, true);
  assert.equal(d.doc.activeElement, x);
  assert.equal(d.doc.fire("keydown", { key: "Tab", shiftKey: true }).prevented, true);
  assert.equal(d.doc.activeElement, go);
});

test("Keep my subscription POSTs no body and the page re-renders; a 409 shows its own words", async () => {
  const d = boot({ billing: billing({ state: "cancelled", can_cancel: false, can_reactivate: true, service_end_at: "2026-12-20T00:00:00+08:00" }), pay: payInfo({ payable: false, not_payable_reason: "cancel_scheduled" }) });
  await d.show();
  d.click(d.root, "Keep my subscription");
  await settle();
  const post = d.calls.find((c) => c.path === B + "reactivate/");
  assert.ok(post && post.method === "POST" && !post.multipart);
  assert.ok(d.chips().includes("Active"));
  const e = boot({ billing: billing({ state: "cancelled", can_cancel: false, can_reactivate: true }), pay: payInfo({ payable: false, not_payable_reason: "cancel_scheduled" }),
    routes: { ["POST " + B + "reactivate/"]: err(409, "payment_required", "RAW") } });
  await e.show();
  e.click(e.root, "Keep my subscription");
  await settle();
  assert.ok(e.toasts.some((t) => /Your service has already ended\. Pay to bring your site back\./.test(t)));
  assert.ok(!e.toasts.some((t) => /RAW/.test(t)));
});

/* ---- 5. the proof ---- */
test("View proof reads only .../payments/{id}/proof/, shows a blob URL, and revokes it on close", async () => {
  const review = payment({ id: "btp_9" });
  const d = boot({ payments: [review], pay: payInfo({ under_review: review, latest: review }) });
  await d.show();
  d.click(d.root, "View proof");
  await settle();
  const proofCalls = d.list().filter((l) => /proof\/$/.test(l));
  assert.deepEqual(proofCalls, ["GET " + B + "payments/btp_9/proof/"]);
  assert.equal(d.calls.find((c) => /proof\/$/.test(c.path)).credentials, "include");
  const srcs = d.$("bl-dialog-slot").all((n) => n.tagName === "IMG" || n.tagName === "A").map((n) => n.getAttribute("src") || n.getAttribute("href"));
  assert.ok(srcs.length >= 2 && srcs.every((s) => /^blob:/.test(s)), "only blob URLs: " + srcs);
  d.doc.fire("keydown", { key: "Escape" });
  assert.ok(d.urls.freed.length >= 1 && d.urls.freed.every((u) => /^blob:/.test(u)), "the blob URL is revoked on close");
});

/* ---- 6. text only ---- */
test("API strings reach the page by textContent: an <img onerror> in reject_note shows as text", async () => {
  const bad = "<img src=x onerror=alert(1)>";
  const rej = payment({ status: "rejected", reject_reason: "other", reject_note: bad, transfer_reference: bad });
  const d = boot({ payments: [rej], pay: payInfo({ latest: rej }) });
  await d.show();
  assert.ok(d.text().includes(bad));
  assert.equal(d.root.all((n) => n.tagName === "IMG").length, 0);
  assert.doesNotMatch(SRC, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test("not signed in, billing off and a failed read: a plain panel, no thrown error", async () => {
  const off = boot({ billing: null });
  await off.show();
  assert.match(off.text(), /Billing is not available for this site yet/);
  const none = boot({ sites: [] });
  await none.show();
  assert.match(none.text(), /Billing is not available for this account yet/);
  const bad = boot({ routes: { ["GET " + B]: err(500, "server_error", "x") } });
  await bad.show();
  assert.match(bad.text(), /We couldn’t load your billing/);
  assert.ok(bad.labels().includes("Try again"));
});

test("the page keeps nothing in the browser: no storage and no payment detail outlives the form", () => {
  assert.doesNotMatch(SRC, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});

test("a 400 that names a field with no place on the form is shown in the banner by label; an unknown key is never quoted", async () => {
  const d = boot();
  await d.go("?site=" + A + "&pay=send&plan=monthly"); /* Monthly has no consent block */
  await fillForm(d, { "bl-f-amount": "2,499" });
  d.st.routes["POST " + B + "payments/"] = err(400, "invalid_request", "RAW", { sender_bank: ["Too long."], renewal_consent: ["Required."], plan: ["Bad plan."], secret_key: ["LEAK"] });
  d.click(d.root, "Send proof");
  await settle();
  assert.equal(d.$("bl-f-bank-err").textContent, "Too long.", "the mapped field keeps its own error");
  const banner = d.has(d.root, "bl-note").map((n) => n.textContent).join(" ");
  assert.match(banner, /Check these fields: Launch Promo terms, Plan\./);
  assert.doesNotMatch(d.text(), /LEAK|secret_key|RAW/);
  const e = boot();
  await e.go("?site=" + A + "&pay=send&plan=monthly");
  await fillForm(e, { "bl-f-amount": "2,499" });
  e.st.routes["POST " + B + "payments/"] = err(400, "invalid_request", "RAW", { secret_key: ["LEAK"] });
  e.click(e.root, "Send proof");
  await settle();
  assert.match(e.has(e.root, "bl-note").map((n) => n.textContent).join(" "), /Please check the details and try again\./);
  assert.doesNotMatch(e.text(), /LEAK|secret_key/);
});

test("a 409 on submit reloads and re-renders the page from the new answer", async () => {
  const active = billing({ state: "active", current_cycle: { sequence: 1, start_at: "2026-11-20T00:00:00+08:00", end_at: "2026-12-20T00:00:00+08:00", settlement: "paid" } });
  const d = boot();
  await d.go("?site=" + A + "&pay=send&plan=monthly");
  await fillForm(d, { "bl-f-amount": "2,499" });
  d.st.routes["POST " + B + "payments/"] = () => { d.st.billing = active; d.st.pay = payInfo({ payable: false, not_payable_reason: "paid_ahead" }); return err(409, "paid_ahead", "RAW"); };
  d.click(d.root, "Send proof");
  await settle();
  assert.equal(d.$("bl-send"), null, "the stale form is gone");
  assert.match(d.text(), /You have already paid for the next term\./);
  assert.ok(d.toasts.some((t) => /already paid for the next term/.test(t) && /\[error\]/.test(t)));
  assert.doesNotMatch(d.text(), /RAW/);
});

/* A11Y-B1 (ClickUp z8uq9men80, audit M2 and L8). */
test("page B: a visible 'Still needed' line beside the disabled Send lists what is missing, shrinks as fields are filled, and is hidden when all is valid", async () => {
  const d = boot();
  await d.go("?site=" + A + "&pay=send&plan=monthly");
  const need = d.$("bl-send-need");
  assert.equal(d.sendBtn().getAttribute("aria-describedby"), "bl-send-need");
  assert.equal(d.sendBtn().disabled, true);
  assert.equal(need.hidden, false);
  assert.equal(need.textContent, "Still needed: Sender Bank, Reference Number, Sender First Name, Sender Last Name, Sender Account Number, Amount, Time of Transfer, Payment Receipt");
  d.fill("bl-f-bank", "BDO"); d.fill("bl-f-ref", "R1");
  assert.equal(need.textContent, "Still needed: Sender First Name, Sender Last Name, Sender Account Number, Amount, Time of Transfer, Payment Receipt");
  d.fill("bl-f-first", "Ana"); d.fill("bl-f-last", "Reyes"); d.fill("bl-f-acct", "12"); /* filled but not valid */
  assert.match(need.textContent, /^Still needed: Sender Account Number, Amount, Time of Transfer, Payment Receipt$/);
  await fillForm(d);
  assert.equal(need.hidden, true);
  assert.equal(need.textContent, "");
  assert.equal(d.sendBtn().disabled, false);
  d.file(null);
  assert.equal(need.textContent, "Still needed: Payment Receipt");
  /* the Launch Promo adds its consent */
  const p = boot();
  await p.go("?site=" + A + "&pay=send&plan=launch_promo");
  await fillForm(p);
  assert.equal(p.$("bl-send-need").textContent, "Still needed: Launch Promo terms");
});

test("page B: a required field shows its error once touched and left empty, with aria-invalid and aria-describedby, and clears when fixed; untouched fields stay quiet", async () => {
  const d = boot();
  await d.go("?site=" + A + "&pay=send&plan=monthly");
  const bank = d.$("bl-f-bank"), e = d.$("bl-f-bank-err");
  assert.equal(e.hidden, true, "untouched: no error");
  assert.equal(bank.getAttribute("aria-invalid"), null);
  bank.fire("blur");
  assert.equal(e.hidden, false);
  assert.equal(e.textContent, "Sender bank is required.");
  assert.equal(bank.getAttribute("aria-invalid"), "true");
  assert.equal(bank.getAttribute("aria-describedby"), "bl-f-bank-err");
  assert.equal(d.$("bl-f-ref-err").hidden, true, "another untouched field stays quiet");
  d.fill("bl-f-bank", "BDO");
  assert.equal(e.hidden, true);
  assert.equal(bank.getAttribute("aria-invalid"), null);
  /* the receipt and the time group too */
  d.$("bl-f-file").fire("change");
  assert.equal(d.$("bl-f-file-err").textContent, "Add your payment receipt.");
  assert.equal(d.$("bl-f-file").getAttribute("aria-invalid"), "true");
  d.$("bl-f-hr").fire("change");
  assert.equal(d.$("bl-f-time-err").hidden, false);
  assert.equal(d.$("bl-f-date").getAttribute("aria-invalid"), "true");
  assert.equal(d.$("bl-f-ap").getAttribute("aria-describedby"), "bl-f-time-err");
  d.file(JPEG());
  assert.equal(d.$("bl-f-file-err").hidden, true);
  assert.equal(d.$("bl-f-file").getAttribute("aria-invalid"), null);
});

test("page B: after a server-refused submit, focus is on the first invalid field in form order, or on the alert when no field is named; never body", async () => {
  const d = boot();
  await d.go("?site=" + A + "&pay=send&plan=monthly");
  await fillForm(d, { "bl-f-amount": "2,499" });
  d.st.routes["POST " + B + "payments/"] = err(400, "invalid_request", "Invalid.", { proof: ["Not a proof."], sender_account_number: ["Use 6 to 34 digits."], transferred_at: ["Too late."] });
  const seen = [];
  d.$("bl-f-acct").scrollIntoView = function (o) { seen.push(o && o.block); };
  d.click(d.root, "Send proof");
  await settle();
  assert.equal(d.doc.activeElement, d.$("bl-f-acct"), "the account number comes first in the form");
  assert.deepEqual(seen, ["center"], "the field is centred so the sticky top bar cannot cover it");
  assert.equal(d.$("bl-f-acct").getAttribute("aria-invalid"), "true");
  /* only the time named: focus goes to its first control */
  const t = boot();
  await t.go("?site=" + A + "&pay=send&plan=monthly");
  await fillForm(t, { "bl-f-amount": "2,499" });
  t.st.routes["POST " + B + "payments/"] = err(400, "invalid_request", "Invalid.", { transferred_at: ["Too late."] });
  t.click(t.root, "Send proof");
  await settle();
  assert.equal(t.doc.activeElement, t.$("bl-f-date"));
  /* no field named: the role=alert message */
  for (const res of [err(429, "rate_limited", "RAW"), err(400, "invalid_request", "RAW", { plan: ["Bad plan."] }), err(400, "invalid_request", "RAW", { secret_key: ["x"] })]) {
    const e = boot();
    await e.go("?site=" + A + "&pay=send&plan=monthly");
    await fillForm(e, { "bl-f-amount": "2,499" });
    e.st.routes["POST " + B + "payments/"] = res;
    e.click(e.root, "Send proof");
    await settle();
    const alert = e.has(e.root, "bl-note")[0];
    assert.equal(alert.getAttribute("role"), "alert");
    assert.equal(alert.hidden, false);
    assert.equal(e.doc.activeElement, alert, "the alert holds focus");
    assert.notEqual(e.doc.activeElement, e.doc.body);
  }
  /* a 409 re-renders the page and leaves focus on the page heading, not body */
  const c = boot();
  await c.go("?site=" + A + "&pay=send&plan=monthly");
  await fillForm(c, { "bl-f-amount": "2,499" });
  c.st.routes["POST " + B + "payments/"] = () => { c.st.pay = payInfo({ payable: false, not_payable_reason: "paid_ahead" }); return err(409, "paid_ahead", "RAW"); };
  c.click(c.root, "Send proof");
  await settle();
  assert.equal(c.doc.activeElement, c.$("h-settings-billing"));
});

/* ---- Subscription Credit (Billing B6, FE-1): wording is a draft for Coach Ed ---- */
const CREDIT = { enabled: true, balance_centavos: 100000, reserved_centavos: 0, usage_only: { credit_centavos: 0, transfer_centavos: 0, covered_by_credit: false } };
const withCredit = (o, credit, over = {}) => ({ ...o, credit_centavos: credit, transfer_centavos: o.amount_centavos - credit, covered_by_credit: credit >= o.amount_centavos, ...over });
const activeBilling = () => billing({ state: "active", current_cycle: { sequence: 1, start_at: "2026-11-20T00:00:00+08:00", end_at: "2026-12-20T00:00:00+08:00", settlement: "paid" } });

test("Subscription Credit: the Payment card shows the balance only when it is above zero", async () => {
  const on = boot({ billing: activeBilling(), pay: payInfo({ credit: CREDIT, offers: [withCredit(OFFER.monthly, 100000)] }) });
  await on.show();
  assert.match(on.text(), /Subscription Credit: PHP 1,000\.00/);
  const zero = boot({ billing: activeBilling(), pay: payInfo({ credit: { ...CREDIT, balance_centavos: 0 }, offers: [OFFER.monthly] }) });
  await zero.show();
  assert.doesNotMatch(zero.text(), /Subscription Credit/);
  const off = boot({ billing: activeBilling(), pay: payInfo({ credit: { ...CREDIT, enabled: false }, offers: [OFFER.monthly] }) });
  await off.show();
  assert.doesNotMatch(off.text(), /Subscription Credit/);
});

test("a part-covered bill shows the credit applied and the amount to transfer, on the plan card and the pay form, and Send names the transfer amount", async () => {
  const d = boot({ billing: activeBilling(), pay: payInfo({ credit: CREDIT, offers: [withCredit(OFFER.monthly, 100000)] }) });
  await d.go("?site=" + A + "&pay=choose");
  assert.match(d.text(), /Credit applied −PHP 1,000\.00, amount to transfer PHP 1,499\.00/);
  await d.go("?site=" + A + "&pay=send&plan=monthly");
  assert.match(d.text(), /Credit applied −PHP 1,000\.00, amount to transfer PHP 1,499\.00\./);
  assert.equal(d.$("bl-f-amount").getAttribute("placeholder"), "1,499.00");
  assert.match(d.sendBtn().textContent, /Send proof — PHP 1,499\.00/);
  assert.match(d.text(), /Send exactly PHP 1,499\.00 to this account/);
  assert.match(d.text(), /Subscription Credit−PHP 1,000\.00/);
  assert.match(d.text(), /Amount to transferPHP 1,499\.00/);
  assert.doesNotMatch(d.text(), /Send exactly PHP 2,499\.00/);
  assert.equal(d.$("bl-credit-pay"), null, "not covered: the proof form stays");
});

test("a bill the credit covers in full has no proof form: Pay with credit posts the plan and ends on Billing", async () => {
  const offer = withCredit(OFFER.monthly, 249900);
  const d = boot({ billing: activeBilling(), pay: payInfo({ credit: { ...CREDIT, balance_centavos: 300000 }, offers: [offer] }) });
  d.st.routes["POST " + B + "pay-with-credit/"] = (opts) => { d.st.sent = JSON.parse(opts.body); d.st.payments = [payment({ id: "btp_c", status: "confirmed", credit_centavos: 249900, transfer_centavos: 0, decided_at: "2026-11-21T10:00:00+08:00" })]; return { status: 201, body: d.st.payments[0] }; };
  await d.go("?site=" + A + "&pay=send&plan=monthly");
  assert.equal(d.$("bl-f-file"), null, "no proof upload");
  assert.equal(d.$("bl-send"), null);
  assert.match(d.text(), /nothing to transfer and no proof to send/);
  d.$("bl-credit-pay").fire("click");
  await settle();
  assert.deepEqual(d.st.sent, { plan: "monthly" });
  assert.ok(d.toasts.some((t) => /^Paid with credit/.test(t)));
  assert.match(d.location.search, /^\?site=site_a+$/);
});

test("Pay with credit for the Launch Promo is blocked until the consent is ticked, then sends renewal_consent and consent_version", async () => {
  const offer = withCredit(OFFER.promo, 499900);
  const d = boot({ billing: activeBilling(), pay: payInfo({ credit: { ...CREDIT, balance_centavos: 600000 }, offers: [offer] }) });
  d.st.routes["POST " + B + "pay-with-credit/"] = (opts) => { d.st.sent = JSON.parse(opts.body); return { status: 201, body: payment({ id: "btp_p", status: "confirmed", plan: "launch_promo", credit_centavos: 499900, transfer_centavos: 0 }) }; };
  await d.go("?site=" + A + "&pay=send&plan=launch_promo");
  assert.equal(d.$("bl-credit-pay").disabled, true);
  d.$("bl-consent").checked = true; d.$("bl-consent").fire("change");
  assert.equal(d.$("bl-credit-pay").disabled, false);
  d.$("bl-credit-pay").fire("click");
  await settle();
  assert.deepEqual(d.st.sent, { plan: "launch_promo", renewal_consent: true, consent_version: "promo-consent-1" });
});

test("Pay with credit: a 409 credit_insufficient and a 404 are worded plainly and the page reads again", async () => {
  const offer = withCredit(OFFER.monthly, 249900);
  const d = boot({ billing: activeBilling(), pay: payInfo({ credit: { ...CREDIT, balance_centavos: 300000 }, offers: [offer] }) });
  d.st.routes["POST " + B + "pay-with-credit/"] = err(409, "credit_insufficient", "Not enough.");
  await d.go("?site=" + A + "&pay=send&plan=monthly");
  d.$("bl-credit-pay").fire("click");
  await settle();
  assert.ok(d.toasts.some((t) => /no longer covers this bill/.test(t) && /\[error\]$/.test(t)));
  assert.ok(d.list().filter((x) => x === "GET " + B + "payment/").length >= 2, "the page read the options again");
  const n = boot({ billing: activeBilling(), pay: payInfo({ credit: { ...CREDIT, balance_centavos: 300000 }, offers: [offer] }) });
  n.st.routes["POST " + B + "pay-with-credit/"] = err(404, "not_found", "Not found.");
  await n.go("?site=" + A + "&pay=send&plan=monthly");
  n.$("bl-credit-pay").fire("click");
  await settle();
  assert.match(n.text(), /Paying with credit is not available right now\./);
  assert.equal(n.$("bl-credit-pay").disabled, false);
});

test("the payments list shows credit and transfer amounts; a credit-paid bill has no proof link", async () => {
  const part = payment({ id: "btp_a", status: "confirmed", credit_centavos: 100000, transfer_centavos: 149900, decided_at: "2026-11-21T10:00:00+08:00", submitted_at: "2026-11-20T15:00:00+08:00" });
  const full = payment({ id: "btp_b", status: "confirmed", credit_centavos: 249900, transfer_centavos: 0, decided_at: "2026-11-22T10:00:00+08:00", submitted_at: "2026-11-22T09:00:00+08:00" });
  const d = boot({ billing: activeBilling(), payments: [full, part], pay: payInfo({ credit: CREDIT, offers: [OFFER.monthly], latest: full }) });
  await d.show();
  const rows = d.has(d.root, "bl-hrow");
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Paid with credit/);
  assert.equal(rows[0].all((x) => x.tagName === "BUTTON").length, 0, "no proof link on a credit-paid bill");
  assert.match(rows[1].textContent, /credit −PHP 1,000\.00, transfer PHP 1,499\.00/);
  assert.equal(rows[1].all((x) => x.tagName === "BUTTON").length, 1);
  assert.ok(!d.labels(d.root).includes("View proof") || d.labels(d.root).filter((l) => l === "View proof").length === 1, "the latest card offers no proof for a credit-paid bill");
});
