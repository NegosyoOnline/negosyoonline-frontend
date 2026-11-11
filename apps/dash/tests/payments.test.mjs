/* The Payments page with its Xendit section hidden (ClickUp z8uq9me4hq; Coach Ed 2026-11-11: "Hide Xendit", bank
   transfer is the payment method for launch). The page draws the methods card with the transfer row only and the bank
   and e-wallet accounts card: no Xendit card, text or request, whether or not the API read carries a Xendit block.
   The Xendit code stays in payments.js behind one constant that is off. Driven like sante.test.mjs: a small stand-in
   document (dom.mjs) and a recorded fetch. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const SRC = read("payments.js");
const HTML = fs.readFileSync(path.join(JS, "..", "..", "index.html"), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const BASE = `/sites/${A}/payment-methods/`;
const SWITCH_OFF = "var XENDIT_SECTION_ENABLED = false;";
const BDO = { id: 7, kind: "bank", account_type: "savings", provider_name: "BDO", account_name: "Nena Santos", account_number: "001234567890", account_number_last4: "7890", has_qr: false };
const GCASH = { id: 8, kind: "ewallet", account_type: "ewallet", provider_name: "GCash", account_name: "Nena Santos", account_number: "09175550142", account_number_last4: "0142", has_qr: true };
const XENDIT_BLOCKS = {
  unset: { configured: false, key_failed: false, key_mode: "", webhook_url: "https://api.test/v1/webhooks/xendit/abc/" },
  live: { configured: true, key_failed: false, key_mode: "live", webhook_url: "https://api.test/v1/webhooks/xendit/abc/" },
  failed: { configured: true, key_failed: true, key_mode: "live", webhook_url: "https://api.test/v1/webhooks/xendit/abc/" },
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

/* dom.mjs plus the four things this page asks of a browser: a "tag, tag" and a [name='x'] querySelector, a select's
   options and replaceChild. Added here, on this test's own document, so the shared stand-in is not changed. */
function pmDocument() {
  const doc = makeDocument(), make = doc.createElement;
  doc.createElement = (tag) => {
    const n = make(tag), plain = n.querySelector.bind(n);
    n.querySelector = (sel) => {
      const name = /^\[name='([a-z_]+)'\]$/.exec(sel);
      if (name) return n.all((x) => x.attrs.name === name[1])[0] || null;
      return /^[a-z]+(\s*,\s*[a-z]+)*$/.test(sel) ? n.querySelectorAll(sel)[0] || null : plain(sel);
    };
    n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; };
    Object.defineProperty(n, "options", { get: () => n.children.filter((c) => c.tagName === "OPTION") });
    return n;
  };
  return doc;
}

/* The read the API answers. `xendit` names one of XENDIT_BLOCKS, or null for a read that carries no Xendit block at
   all (the slice 7 API leaves it out). */
function reading(state) {
  const direct = state.accounts.length > 0 && state.directOn;
  const body = { enabled: { direct: state.directOn }, available: { direct }, accounts: state.accounts.map((a) => ({ ...a })) };
  if (state.xendit) {
    const x = XENDIT_BLOCKS[state.xendit];
    body.enabled.xendit = true; body.available.xendit = x.configured && !x.key_failed; body.xendit = { ...x };
  }
  return body;
}

function boot({ accounts = [BDO], directOn = true, xendit = "live", src = SRC } = {}) {
  const doc = pmDocument(), calls = [], toasts = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["pm-root", "pm-dialog-slot", "pm-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const state = { accounts: accounts.map((a) => ({ ...a })), directOn, xendit };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), multipart = opts.body instanceof FormData;
    const body = multipart ? Object.fromEntries(opts.body.entries()) : opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body, multipart });
    let a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    const acct = /^\/sites\/site_[0-9a-z]{20}\/payment-methods\/accounts\/(?:(\d+)\/)?$/.exec(p);
    if (opts.method === "GET" && p === "/sites/") a = { status: 200, body: { items: [{ id: A, template: "sante" }], next_cursor: null } };
    else if (p === BASE && opts.method === "GET") a = { status: 200, body: reading(state) };
    else if (p === BASE && opts.method === "PATCH") { state.directOn = body.direct_enabled; a = { status: 200, body: reading(state) }; }
    else if (acct && opts.method === "POST") {
      const row = { ...body, id: acct[1] ? Number(acct[1]) : 9, account_number_last4: body.account_number.slice(-4), has_qr: false };
      state.accounts = acct[1] ? state.accounts.map((x) => (x.id === row.id ? row : x)) : [...state.accounts, row];
      a = { status: 200, body: row };
    } else if (acct && acct[1] && opts.method === "DELETE") { state.accounts = state.accounts.filter((x) => x.id !== Number(acct[1])); a = { status: 200, body: {} }; }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const location = { search: "", pathname: "/settings/payments/", replace() {}, assign() {} };
  const context = vm.createContext({ window, document: doc, location, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, FormData,
    localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(src, context, { filename: "payments.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id), root = $("pm-root");
  const has = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label) => buttons(n).find((b) => b.textContent === label);
  return { doc, calls, toasts, state, $, root, has, buttons, press, page,
    list: () => calls.map((c) => c.method + " " + c.path),
    async show() { window.NOPayments.show(); await settle(); },
    cards: () => has(root, "pm-card").map((c) => c.getAttribute("aria-labelledby")),
    accountsCard: () => $("pm-h-accounts").parentNode.parentNode,
    form: () => $("pm-dialog-slot").all((n) => n.tagName === "FORM")[0],
    fill(form, values) { for (const [k, v] of Object.entries(values)) form.querySelector(`[name='${k}']`).value = v; } };
}

/* Nothing on the page, in its popups, in a spoken update or in a toast names Xendit or paying online, and no request
   goes to the Xendit route. */
function assertNoXendit(d) {
  assert.ok(!/xendit|pay online|webhook|secret|api key/i.test(d.page.textContent), "no Xendit wording on the page: " + d.page.textContent);
  assert.equal(d.page.all((n) => /xendit|pm-key|pm-token|pm-hook/.test(n.id + " " + (n.attrs["class"] || ""))).length, 0, "no Xendit element");
  assert.equal(d.page.all((n) => Object.values(n.attrs).some((v) => /xendit/i.test(v))).length, 0, "no attribute names Xendit");
  assert.ok(!d.toasts.some((t) => /xendit/i.test(t)));
  assert.deepEqual(d.calls.filter((c) => /xendit/i.test(c.path) || /xendit/i.test(JSON.stringify(c.body))), []);
}

for (const xendit of ["live", "unset", "failed", null]) {
  test(`a read ${xendit ? "with a Xendit block (" + xendit + ")" : "with no Xendit block"}: the methods card with the transfer row only and the accounts card; no Xendit card, text or request`, async () => {
    const d = boot({ xendit, accounts: [BDO, GCASH] });
    await d.show();
    assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE]);
    assert.equal(d.root.getAttribute("aria-busy"), null);
    assert.deepEqual(d.cards(), ["pm-h-methods", "pm-h-accounts"]);
    assert.deepEqual(d.root.all((n) => n.tagName === "H2").map((n) => n.textContent), ["Payment methods at checkout", "Bank and e-wallet accounts"]);
    const rows = d.has(d.root, "pm-method");
    assert.equal(rows.length, 1, "one method row");
    assert.equal(d.has(rows[0], "pm-method-name")[0].textContent, "Bank or e-wallet transfer");
    assert.deepEqual(d.has(d.root, "pm-switch").map((s) => s.id), ["pm-sw-direct"]);
    assert.equal(d.$("pm-sw-xendit"), null);
    assert.equal(d.$("pm-h-xendit"), null);
    assert.equal(d.has(d.root, "pm-warn").length, 0);
    assertNoXendit(d);
  });
}

test("the transfer row and the accounts card are as before: statuses, the switch and the account lines", async () => {
  const d = boot({ accounts: [BDO, GCASH] });
  await d.show();
  const row = d.has(d.root, "pm-method")[0], sw = d.$("pm-sw-direct");
  assert.equal(d.has(row, "chip")[0].textContent, "Active");
  assert.equal(d.has(row, "chip")[0].attrs["class"], "chip chip-ok");
  assert.equal(d.has(row, "pm-meta")[0].textContent, "Buyers send the amount to one of your accounts and upload their proof. You verify each payment.");
  assert.equal(sw.checked, true);
  assert.equal(sw.disabled, false);
  assert.equal(sw.getAttribute("role"), "switch");
  const card = d.accountsCard();
  assert.ok(card.classList.contains("pm-half"), "the accounts card keeps its class");
  assert.equal(d.has(card, "chip")[0].textContent, "2 accounts added");
  assert.equal(d.has(card, "pm-lead")[0].textContent, "Add the accounts where buyers send their payment. Buyers who choose transfer see these accounts in full at checkout, then upload their proof for you to verify.");
  assert.deepEqual(d.has(card, "pm-acct").map((li) => li.textContent),
    ["BDO · Bank (Savings)Nena Santos · ending 7890ChangeRemove", "GCash · E-walletNena Santos · ending 0142 · QR code addedChangeRemove"]);
  assert.deepEqual(d.buttons(card).map((b) => b.textContent), ["Change", "Remove", "Change", "Remove", "Add account"]);

  /* No account yet: the switch cannot be turned on and the page says buyers cannot check out, with a Xendit block
     that is set up and with none. */
  for (const xendit of ["live", null]) {
    const none = boot({ accounts: [], xendit });
    await none.show();
    const r = none.has(none.root, "pm-method")[0];
    assert.equal(none.has(r, "chip")[0].textContent, "No account added yet");
    assert.equal(none.$("pm-sw-direct").disabled, true);
    assert.equal(none.$("pm-sw-direct").checked, false);
    assert.equal(none.has(none.accountsCard(), "chip")[0].attrs["class"], "chip chip-danger");
    assert.deepEqual(none.has(none.root, "pm-warn").map((p) => p.textContent), ["No payment method is showing, so buyers cannot check out."]);
    assert.equal(none.has(none.accountsCard(), "pm-list").length, 0);
    assertNoXendit(none);
  }

  /* Set up but switched off. */
  const off = boot({ directOn: false });
  await off.show();
  assert.equal(off.has(off.has(off.root, "pm-method")[0], "chip")[0].textContent, "Off");
  assert.equal(off.$("pm-sw-direct").checked, false);
  assert.equal(off.$("pm-sw-direct").disabled, false);
});

test("the transfer switch sends the same PATCH as before and nothing about Xendit", async () => {
  for (const xendit of ["live", null]) {
    const d = boot({ xendit });
    await d.show();
    const sw = d.$("pm-sw-direct");
    sw.checked = false; sw.fire("change");
    await settle();
    assert.deepEqual(d.calls.slice(2), [{ method: "PATCH", path: BASE, body: { direct_enabled: false }, multipart: false }]);
    assert.equal(d.has(d.has(d.root, "pm-method")[0], "chip")[0].textContent, "Off");
    assert.equal(d.$("pm-live").textContent, "Bank or e-wallet transfer is off.");
    assert.deepEqual(d.cards(), ["pm-h-methods", "pm-h-accounts"]);
    assert.deepEqual(d.has(d.root, "pm-warn").map((p) => p.textContent), ["No payment method is showing, so buyers cannot check out."]);
    assertNoXendit(d);
  }
});

test("add, change and remove an account send the same requests as before, then read the page again", async () => {
  for (const xendit of ["live", null]) {
    const d = boot({ xendit });
    await d.show();

    d.press(d.accountsCard(), "Add account").fire("click");
    let form = d.form();
    assert.equal(d.$("pm-h-account").textContent, "Add an account");
    assert.deepEqual(d.has(form, "pm-label").map((l) => l.textContent), ["Type", "Account type", "Bank or e-wallet name", "Account name", "Account number", "QR code (optional)"]);
    assert.equal(form.querySelector("[name='qr']").getAttribute("type"), "file", "the QR field stays");
    assertNoXendit(d);
    d.fill(form, { kind: "ewallet", provider_name: "Maya", account_name: "Nena Santos", account_number: "09175550199" });
    form.fire("submit");
    await settle();
    assert.deepEqual(d.calls.slice(2), [
      { method: "POST", path: BASE + "accounts/", multipart: true, body: { kind: "ewallet", account_type: "", provider_name: "Maya", account_name: "Nena Santos", account_number: "09175550199" } },
      { method: "GET", path: BASE, body: null, multipart: false }]);
    assert.equal(d.form(), undefined, "the popup closed");
    assert.equal(d.$("pm-live").textContent, "Account added.");
    assert.equal(d.has(d.accountsCard(), "chip")[0].textContent, "2 accounts added");

    d.press(d.has(d.accountsCard(), "pm-acct")[0], "Change").fire("click");
    form = d.form();
    assert.equal(d.$("pm-h-account").textContent, "Change account");
    assert.equal(form.querySelector("[name='account_number']").value, "001234567890");
    d.fill(form, { account_name: "Nena S. Santos" });
    form.fire("submit");
    await settle();
    assert.deepEqual(d.calls.slice(4), [
      { method: "POST", path: BASE + "accounts/7/", multipart: true, body: { kind: "bank", account_type: "savings", provider_name: "BDO", account_name: "Nena S. Santos", account_number: "001234567890" } },
      { method: "GET", path: BASE, body: null, multipart: false }]);
    assert.equal(d.$("pm-live").textContent, "Account changed.");

    const remove = d.press(d.has(d.accountsCard(), "pm-acct")[0], "Remove");
    remove.fire("click");
    assert.equal(remove.textContent, "Confirm remove");
    assert.equal(d.calls.length, 6, "the first press only asks");
    remove.fire("click");
    await settle();
    assert.deepEqual(d.calls.slice(6), [
      { method: "DELETE", path: BASE + "accounts/7/", body: null, multipart: false },
      { method: "GET", path: BASE, body: null, multipart: false }]);
    assert.equal(d.$("pm-live").textContent, "Account removed.");
    assert.equal(d.has(d.accountsCard(), "chip")[0].textContent, "1 account added");
    assert.deepEqual(d.cards(), ["pm-h-methods", "pm-h-accounts"]);
    assertNoXendit(d);
  }
});

test("hidden, not deleted: one constant, off, and turning it on brings the Xendit row and card back", async () => {
  assert.equal(SRC.split(SWITCH_OFF).length, 2, "payments.js sets XENDIT_SECTION_ENABLED to false, once");
  assert.equal(SRC.match(/XENDIT_SECTION_ENABLED\s*=[^=]/g).length, 1, "and assigns it nowhere else");
  const d = boot({ accounts: [BDO], xendit: "failed", src: SRC.replace(SWITCH_OFF, "var XENDIT_SECTION_ENABLED = true;") });
  await d.show();
  assert.deepEqual(d.cards(), ["pm-h-methods", "pm-h-accounts", "pm-h-xendit"]);
  assert.deepEqual(d.has(d.root, "pm-switch").map((s) => s.id), ["pm-sw-direct", "pm-sw-xendit"]);
  assert.deepEqual(d.has(d.$("pm-h-xendit").parentNode.parentNode, "chip").map((c) => c.textContent), ["Key stopped working"]);
  assert.ok(d.press(d.root, "Change key") && d.press(d.root, "Remove key"));
  assert.equal(d.has(d.root, "pm-hook").length, 1);
});

test("index.html loads payments.js under a new version", () => {
  const v = /<script src="\/assets\/js\/payments\.js\?v=([0-9a-z]+)"><\/script>/.exec(HTML);
  assert.ok(v, "payments.js is loaded with a version");
  assert.notEqual(v[1], "20261110na1", "the version changed with this file");
});
