/* The Payments page with its Xendit section on for the Santé funnel (ClickUp z8uq9mgkp1; Coach Ed 2026-11-18). The
   Xendit row and card show only when the API read says `xendit.offered === true` (Santé sites with the platform switch on).
   A read with no block, or today's not-set-up block without `offered`, draws the methods card with the transfer row only and the accounts card: no Xendit card, text
   or request. Driven like sante.test.mjs: a small stand-in
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
const SWITCH_ON = "var XENDIT_SECTION_ENABLED = true;";
const BDO = { id: 7, kind: "bank", account_type: "savings", provider_name: "BDO", account_name: "Nena Santos", account_number: "001234567890", account_number_last4: "7890", has_qr: false };
const GCASH = { id: 8, kind: "ewallet", account_type: "ewallet", provider_name: "GCash", account_name: "Nena Santos", account_number: "09175550142", account_number_last4: "0142", has_qr: true };
const XENDIT_BLOCKS = {
  unset: { offered: true, configured: false, key_failed: false, key_mode: "", webhook_url: "https://api.test/v1/webhooks/xendit/abc/" },
  live: { offered: true, configured: true, key_failed: false, key_mode: "live", webhook_url: "https://api.test/v1/webhooks/xendit/abc/" },
  notOffered: { configured: false, key_failed: false, key_mode: "", webhook_url: "" },
  failed: { offered: true, configured: true, key_failed: true, key_mode: "live", webhook_url: "https://api.test/v1/webhooks/xendit/abc/" },
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
    n.dispatchEvent = (e) => n.fire(e.type);
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

function boot({ accounts = [BDO], directOn = true, xendit = null, src = SRC, postAnswer = null } = {}) {
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
    else if (acct && opts.method === "POST" && postAnswer) a = postAnswer;
    else if (acct && opts.method === "POST") {
      const row = { ...body, id: acct[1] ? Number(acct[1]) : 9, account_number_last4: body.account_number.slice(-4), has_qr: false };
      state.accounts = acct[1] ? state.accounts.map((x) => (x.id === row.id ? row : x)) : [...state.accounts, row];
      a = { status: 200, body: row };
    } else if (acct && acct[1] && opts.method === "DELETE") { state.accounts = state.accounts.filter((x) => x.id !== Number(acct[1])); a = { status: 200, body: {} }; }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const URLs = { createObjectURL: () => "blob:test/1", revokeObjectURL() {} };
  window.Cropper = class { destroy() {} }; window.URL = URLs;
  const location = { search: "", pathname: "/settings/payments/", replace() {}, assign() {} };
  const context = vm.createContext({ Event: class { constructor(type) { this.type = type; } }, window, document: doc, location, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, FormData, URL: URLs, Uint8Array,
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

for (const xendit of [null, "notOffered"]) {
  test(`a read with ${xendit ? "today's not-set-up block (no offered key)" : "no Xendit block"}: the methods card with the transfer row only and the accounts card; no Xendit card, text or request`, async () => {
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

test("the transfer row and the accounts card are as before, the card now full width: statuses, the switch and the account lines", async () => {
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
  assert.equal(card.attrs["class"], "pm-card", "full width while Xendit is hidden: no pm-half beside an empty half");
  assert.equal(d.has(card, "chip")[0].textContent, "2 accounts added");
  assert.equal(d.has(card, "pm-lead")[0].textContent, "Add the accounts where buyers send their payment. Buyers who choose transfer see these accounts in full at checkout, then upload their proof for you to verify.");
  assert.deepEqual(d.has(card, "pm-acct").map((li) => li.textContent),
    ["BDO · Bank (Savings)Nena Santos · ending 7890ChangeRemove", "GCash · E-walletNena Santos · ending 0142 · QR code addedChangeRemove"]);
  assert.deepEqual(d.buttons(card).map((b) => b.textContent), ["Change", "Remove", "Change", "Remove", "Add account"]);

  /* No account yet: the switch cannot be turned on and the page says buyers cannot check out, with a Xendit block
     that is set up and with none. */
  for (const xendit of [null]) {
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
  for (const xendit of [null]) {
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
  for (const xendit of [null]) {
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

test("one constant, on; a read with the Xendit block draws the row, card, key buttons and webhook block", async () => {
  assert.equal(SRC.split(SWITCH_ON).length, 2, "payments.js sets XENDIT_SECTION_ENABLED to true, once");
  assert.equal(SRC.match(/XENDIT_SECTION_ENABLED\s*=[^=]/g).length, 1, "and assigns it nowhere else");
  const d = boot({ accounts: [BDO], xendit: "failed" });
  await d.show();
  assert.deepEqual(d.cards(), ["pm-h-methods", "pm-h-accounts", "pm-h-xendit"]);
  assert.deepEqual(d.has(d.root, "pm-switch").map((s) => s.id), ["pm-sw-direct", "pm-sw-xendit"]);
  assert.deepEqual(d.has(d.$("pm-h-xendit").parentNode.parentNode, "chip").map((c) => c.textContent), ["Key stopped working"]);
  assert.ok(d.press(d.root, "Change key") && d.press(d.root, "Remove key"));
  assert.equal(d.has(d.root, "pm-hook").length, 1);
  assert.equal(d.accountsCard().attrs["class"], "pm-card pm-half", "half width beside the Xendit card");
  assert.equal(d.$("pm-h-xendit").parentNode.parentNode.attrs["class"], "pm-card pm-half");
  for (const x of ["live", "unset"]) {
    const e = boot({ accounts: [BDO], xendit: x });
    await e.show();
    assert.ok(e.$("pm-h-xendit"), "the card shows for " + x);
  }
});

test("with the constant off the Xendit section is never drawn, even if the read carries the block", async () => {
  const d = boot({ accounts: [BDO], xendit: "live", src: SRC.replace(SWITCH_ON, "var XENDIT_SECTION_ENABLED = false;") });
  await d.show();
  assert.deepEqual(d.cards(), ["pm-h-methods", "pm-h-accounts"]);
  assertNoXendit(d);
});

test("index.html loads payments.js under a new version", () => {
  const v = /<script src="\/assets\/js\/payments\.js\?v=([0-9a-z]+)"><\/script>/.exec(HTML);
  assert.ok(v, "payments.js is loaded with a version");
  assert.notEqual(v[1], "20261110na1", "the version changed with this file");
});

/* ---- Add account: QR upload checks, account number rule, focus after a failed save (ClickUp z8uq9men7m: M1, L6) ---- */
const bytes = (...b) => { const u = new Uint8Array(12); u.set(b); return u.buffer; };
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0), PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), TEXT = bytes(0x68, 0x65, 0x6c, 0x6c, 0x6f);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
const picture = (type, size, head) => ({ name: "qr", type, size, slice: () => ({ arrayBuffer: () => Promise.resolve(head) }) });
async function openAdd(opts) {
  const d = boot(opts);
  await d.show();
  d.press(d.accountsCard(), "Add account").fire("click");
  const form = d.form(), qr = form.querySelector("[name='qr']");
  return { d, form, qr, err: d.$("pm-qr-err"), crop: () => d.has(form, "pm-crop")[0], pick(file) { qr.files = file ? [file] : []; qr.value = file ? "C:\\fakepath\\qr" : ""; qr.fire("change"); return settle(); } };
}
const GOOD = { kind: "ewallet", provider_name: "Maya", account_name: "Nena Santos", account_number: "09175550199" };

test("QR upload: a file of another type, an oversize file and a renamed non-image are refused before the crop panel, with the focus kept on the file input", async () => {
  for (const [file, text] of [
    [picture("application/pdf", 1000, TEXT), "Upload a JPEG, PNG or WebP image."],
    [picture("text/plain", 1000, TEXT), "Upload a JPEG, PNG or WebP image."],
    [picture("image/png", 2 * 1024 * 1024 + 1, PNG), "The file is too large. The limit is 2 MB."],
    [picture("image/png", 1000, TEXT), "Upload a JPEG, PNG or WebP image."], /* named .png, bytes are text */
  ]) {
    const t = await openAdd();
    t.d.doc.activeElement = null;
    await t.pick(file);
    assert.equal(t.crop().hidden, true, "the crop panel stays closed");
    assert.equal(t.d.has(t.crop(), "pm-crop-img").length, 0);
    assert.equal(t.err.textContent, text);
    assert.equal(t.err.hidden, false);
    assert.equal(t.err.getAttribute("role"), "alert", "announced");
    assert.equal(t.qr.getAttribute("aria-invalid"), "true");
    assert.ok(t.qr.getAttribute("aria-describedby").split(" ").includes("pm-qr-err"));
    assert.equal(t.qr.value, "", "the refused file is dropped, so it cannot be sent");
    assert.equal(t.d.doc.activeElement, t.qr, "focus stays on the file input");
  }
});

test("QR upload: an image that fails to decode shows the error and closes the crop panel; a valid file clears an earlier error", async () => {
  const t = await openAdd();
  await t.pick(picture("image/png", 5000, PNG));
  assert.equal(t.crop().hidden, false, "a valid image opens the crop panel as before");
  const img = t.d.has(t.crop(), "pm-crop-img")[0];
  assert.equal(img.getAttribute("src"), "blob:test/1");
  img.fire("error"); /* the browser cannot decode it */
  assert.equal(t.crop().hidden, true);
  assert.equal(t.err.textContent, "That image could not be read. Choose a different JPEG, PNG or WebP image.");
  assert.equal(t.qr.getAttribute("aria-invalid"), "true");
  assert.equal(t.qr.value, "");
  assert.equal(t.d.doc.activeElement, t.qr);
  assert.ok(t.form.all((n) => n.hidden === true && n.parentNode === t.form).length <= 1, "the form's fields are shown again");
  await t.pick(picture("image/jpeg", 5000, JPEG));
  assert.equal(t.err.hidden, true);
  assert.equal(t.qr.getAttribute("aria-invalid"), null);
  assert.equal(t.qr.getAttribute("aria-describedby"), "pm-qr-hint", "back to the help text only");
  assert.equal(t.crop().hidden, false);
  await t.pick(picture("image/webp", 5000, WEBP));
  assert.equal(t.crop().hidden, false, "WebP is accepted");
});

test("QR field: aria-describedby names its help text, and its error while there is one", async () => {
  const t = await openAdd();
  assert.equal(t.qr.getAttribute("aria-describedby"), "pm-qr-hint");
  assert.equal(t.d.$("pm-qr-hint").textContent, "A JPEG, PNG or WebP image buyers can scan.");
  t.d.fill(t.form, { ...GOOD });
  const bad = await openAdd({ postAnswer: { status: 422, body: { error: { code: "invalid_request", message: "Some values are missing or invalid.", fields: { qr: ["The QR code could not be saved. Try again in a moment."] } } } } });
  bad.d.fill(bad.form, GOOD);
  bad.form.fire("submit"); await settle();
  assert.equal(bad.qr.getAttribute("aria-describedby"), "pm-qr-hint pm-qr-err");
  assert.equal(bad.qr.getAttribute("aria-invalid"), "true");
  assert.equal(bad.d.doc.activeElement, bad.qr);
});

test("account number: letters say \"Use digits only\", an empty one still says to enter it, digits with spaces and hyphens go through (the API's rule); nothing is sent while it is wrong", async () => {
  const t = await openAdd();
  const num = t.form.querySelector("[name='account_number']"), err = t.d.$("pm-acnum-err");
  for (const [value, text] of [["12AB34", "Use digits only. Spaces and hyphens are fine."], ["abc", "Use digits only. Spaces and hyphens are fine."], ["1234 5678.9", "Use digits only. Spaces and hyphens are fine."], ["", "Enter the account number."], ["  ", "Enter the account number."], ["- -", "Enter the account number."]]) {
    t.d.fill(t.form, { ...GOOD, account_number: value });
    t.form.fire("submit"); await settle();
    assert.equal(err.textContent, text, JSON.stringify(value));
    assert.equal(num.getAttribute("aria-invalid"), "true");
    assert.equal(num.getAttribute("aria-describedby"), "pm-acnum-err");
    assert.equal(t.d.doc.activeElement, num, "focus goes to the invalid field");
    assert.deepEqual(t.d.calls.filter((c) => c.method === "POST"), [], "nothing sent");
  }
  t.d.fill(t.form, { ...GOOD, account_number: "0917-555 0199" });
  t.form.fire("submit"); await settle();
  assert.equal(t.d.calls.filter((c) => c.method === "POST").length, 1);
  assert.equal(t.d.calls.find((c) => c.method === "POST").body.account_number, "0917-555 0199");
});

test("after a failed save focus goes to the first invalid field in the form's order, or back to Save; never the page body", async () => {
  /* The API names two fields, listed in the wrong order: the first one in the form wins. */
  const t = await openAdd({ postAnswer: { status: 422, body: { error: { code: "invalid_request", message: "Some values are missing or invalid.", fields: { account_name: ["Enter the account name."], provider_name: ["Enter the bank or e-wallet name."] } } } } });
  t.d.fill(t.form, GOOD);
  t.form.fire("submit"); await settle();
  assert.equal(t.d.doc.activeElement, t.form.querySelector("[name='provider_name']"));
  assert.equal(t.form.querySelector("[name='account_name']").getAttribute("aria-invalid"), "true");

  /* A failure that names no field (a 500): a toast, and focus on Save, which was disabled while busy. */
  const e = await openAdd({ postAnswer: { status: 500, body: { error: { code: "server", message: "Something went wrong." } } } });
  e.d.fill(e.form, GOOD);
  e.d.doc.activeElement = null;
  e.form.fire("submit"); await settle();
  const save = e.d.press(e.form, "Add account");
  assert.equal(e.d.doc.activeElement, save);
  assert.equal(save.getAttribute("aria-busy"), null);
  assert.equal(save.disabled, false);
  assert.deepEqual(e.d.toasts, ["That did not work: Something went wrong."]);
});

test("combo (r12): the text is never highlighted, the first key replaces the chosen label, and focus stays on the used combo", async () => {
  const { d, form } = await openAdd();
  const sels = form.all((n) => n.tagName === "SELECT");
  let idx = 0; /* the stand-in select does not link value and selectedIndex */
  Object.defineProperty(sels[0], "selectedIndex", { get: () => idx });
  Object.defineProperty(sels[0], "value", { get: () => sels[0].options[idx].attrs.value, set: (v) => { idx = Math.max(0, sels[0].options.findIndex((o) => o.attrs.value === v)); } });
  const wrap = sels[0].parentNode, input = wrap.all((n) => n.classList.contains("pm-combo-input"))[0];
  const other = sels[1].parentNode.all((n) => n.classList.contains("pm-combo-input"))[0];
  let selected = 0; input.select = () => { selected++; }; input.setSelectionRange = (a, b) => { input.sel = [a, b]; };
  const pick = (label) => wrap.all((n) => n.classList.contains("pm-combo-opt")).find((n) => n.textContent === label).fire("click");
  const box = wrap.all((n) => n.classList.contains("pm-combo-box"))[0];
  box.getBoundingClientRect = () => ({ left: 0, right: 200, top: 0, bottom: 40, width: 200 });
  box.fire("click");
  pick("E-wallet");
  await settle();
  assert.equal(input.value, "E-wallet");
  assert.equal(d.doc.activeElement, input, "focus stays on the combo that was used");
  assert.notEqual(d.doc.activeElement, other);
  input.fire("focus");
  assert.equal(selected, 0, "focus never selects the text");
  assert.deepEqual(input.sel, [8, 8], "the caret is at the end");
  input.fire("keydown", { key: "b" });
  assert.equal(input.value, "", "the first printable key starts a fresh query");
  input.value = "b"; input.fire("input");
  input.fire("keydown", { key: "a" });
  assert.equal(input.value, "b", "later keys are left alone");
  input.value = "E-wallet"; input.fire("keydown", { key: "ArrowDown" });
  assert.equal(input.value, "E-wallet", "arrow keys do not clear it");
});
