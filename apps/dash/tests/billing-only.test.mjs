/* Billing-only dashboard (G4, ClickUp z8uq9mfvgn): when the site's billing position says billing_only, the sidebar and phone tabs
   show only Billing, every other address lands on /settings/billing/, and a served site is left exactly as it was.
   Run against the real dashboard.js (router and nav) and billing.js (the probe) with stand-in pages and a recorded fetch. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { load, answer } from "./load.mjs";

const read = (f) => fs.readFileSync(new URL("../public/assets/js/" + f, import.meta.url), "utf8");
const HTML = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const DASH = read("dashboard.js");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

/* ---- the probe in billing.js ---- */
function probeWith(routes) {
  const { window, calls } = load(["app.js", "billing.js"], { config: { apiBase: "http://api.test/v1" },
    fetch: (url, opts) => {
      const p = url.replace("http://api.test/v1", "");
      return (routes[p] || answer(404, { error: { code: "not_found", message: "Not found." } }))(url, opts);
    } });
  let fired = 0;
  window.NOBilling.probe(() => { fired++; });
  return { fired: async () => { await settle(); return fired; }, calls };
}
const SITES = answer(200, { items: [{ id: A }], next_cursor: null });

test("the probe fires only for a 200 billing position with billing_only exactly true, and reads the same billing route", async () => {
  const on = probeWith({ "/sites/": SITES, [`/sites/${A}/billing/`]: answer(200, { state: "suspended", billing_only: true }) });
  assert.equal(await on.fired(), 1);
  assert.deepEqual(on.calls.map((c) => c.url.replace("http://api.test/v1", "")), ["/sites/", `/sites/${A}/billing/`], "no new API: the sites list and the billing read");
  for (const [name, routes] of [
    ["served", { "/sites/": SITES, [`/sites/${A}/billing/`]: answer(200, { state: "active", billing_only: false }) }],
    ["a string true", { "/sites/": SITES, [`/sites/${A}/billing/`]: answer(200, { billing_only: "true" }) }],
    ["billing unavailable (404)", { "/sites/": SITES }],
    ["billing failed (500)", { "/sites/": SITES, [`/sites/${A}/billing/`]: answer(500, { error: { code: "x", message: "Broken." } }) }],
    ["no sites", { "/sites/": answer(200, { items: [], next_cursor: null }) }],
    ["sites failed", { "/sites/": answer(500, {}) }],
  ]) assert.equal(await probeWith(routes).fired(), 0, name);
});

/* ---- the shell in dashboard.js ---- */
function boot(pathname, { billingOnly }) {
  const nodes = {}, replaced = [], shown = [], reg = {};
  const node = (id) => (nodes[id] = nodes[id] || { id, hidden: false, textContent: "", style: {}, className: "", focus() {}, setAttribute() {}, removeAttribute() {}, appendChild() {}, addEventListener() {} });
  const el = (sel, extra = {}) => { const n = { hidden: false, textContent: "", className: "", style: {}, focus() {}, setAttribute() {}, removeAttribute() {}, addEventListener() {}, ...extra }; (reg[sel] = reg[sel] || []).push(n); return n; };
  const OPS = ["side-overview", "side-orders", "side-products", "side-inbox", "side-training", "side-media", "side-settings"].map((id) => el("#side .side-nav > a:not([data-billing-only-nav])", { id }));
  const SEP = el("#side .side-nav > .side-sep-nav");
  const SIDE_BILLING = el("[data-billing-only-nav]", { id: "side-billing", hidden: true });
  const TAB_OPS = ["tab-overview", "tab-orders", "tab-products", "tab-more"].map((id) => el("#tabs > *:not([data-billing-only-nav])", { id }));
  const TAB_BILLING = el("[data-billing-only-nav]", { id: "tab-billing", hidden: true });
  const QS = el(".qs"), MENU = [el(".acct-menu [data-menu-link]"), el(".acct-menu [data-menu-link]")];
  const DIV = { hidden: false, className: "menu-div" };
  el(".acct-menu .menu-actions", { previousElementSibling: DIV });
  /* The selector list applyBillingOnly() passes is one string; the stand-in answers each part it knows. */
  const document = { readyState: "complete", title: "", getElementById: node, createElement: () => node("x"), addEventListener() {},
    querySelectorAll(sel) {
      if (sel.indexOf("#side .side-nav > a:not") === 0) return [...OPS, SEP, ...TAB_OPS, QS, ...MENU];
      return reg[sel] || [];
    } };
  const location = { pathname, search: "" };
  const history = { replaceState(a, b, url) { replaced.push(url); const q = url.indexOf("?"); location.pathname = q < 0 ? url : url.slice(0, q); location.search = q < 0 ? "" : url.slice(q); }, pushState(a, b, url) { location.pathname = url; } };
  const winOn = {};
  const window = { addEventListener(t, f) { (winOn[t] = winOn[t] || []).push(f); },
    NOBilling: { show() { shown.push("billing"); }, hide() {}, probe(cb) { if (billingOnly) cb(); } },
    NODash: { el: () => node("x"), requireAccount: () => ({ then(fn) { window.start = fn; } }), cfg: {}, setWorkspace() {}, call: () => new Promise(() => {}) } };
  const orders = { show() { shown.push("orders"); }, hide() {} };
  window.NOPackOrders = orders;
  vm.runInContext(DASH, vm.createContext({ window, document, location, history, console, Intl, Promise, setTimeout, clearTimeout }), { filename: "dashboard.js" });
  window.start({ first_name: "Nena" });
  const hiddenOf = (list) => list.map((n) => n.hidden);
  return { nodes, replaced, shown, location, document, winOn, OPS, SEP, SIDE_BILLING, TAB_OPS, TAB_BILLING, QS, MENU, DIV, hiddenOf,
    visibleView: () => Object.keys(nodes).filter((k) => k.indexOf("view-") === 0 && nodes[k].hidden === false) };
}

test("billing-only: only Billing in the sidebar and the phone tabs, no quick search, no Account Settings or Help Center link", () => {
  const p = boot("/settings/billing/", { billingOnly: true });
  assert.deepEqual(p.hiddenOf(p.OPS), p.OPS.map(() => true), "every operational sidebar item is hidden");
  assert.equal(p.SEP.hidden, true);
  assert.equal(p.SIDE_BILLING.hidden, false, "the sidebar Billing link shows");
  assert.deepEqual(p.hiddenOf(p.TAB_OPS), p.TAB_OPS.map(() => true), "the phone tabs and the More button are hidden");
  assert.equal(p.TAB_BILLING.hidden, false, "the phone Billing tab shows");
  assert.equal(p.QS.hidden, true, "the quick search is hidden");
  assert.deepEqual(p.hiddenOf(p.MENU), [true, true], "the profile menu keeps no page link");
  assert.equal(p.DIV.hidden, true, "no double divider is left");
  assert.equal(p.nodes["set-tabs"].hidden, true, "no Settings tab row");
  assert.equal(p.nodes.tabs.style.gridTemplateColumns, "1fr");
  assert.deepEqual(p.visibleView(), ["view-settings-billing"]);
});

test("billing-only: every operational address, and an unknown one, redirects to /settings/billing/ and ends on Billing", () => {
  for (const path of ["/", "/orders/", "/orders/products/", "/products/", "/inbox/", "/training/", "/training/course/", "/media/", "/settings/business/", "/settings/payments/", "/settings/inbox/", "/settings/meta-pixel/", "/settings/notices/", "/account/", "/help/", "/nowhere/"]) {
    const p = boot(path, { billingOnly: true });
    assert.equal(p.location.pathname, "/settings/billing/", path + " lands on Billing");
    assert.ok(p.replaced.includes("/settings/billing/"), path + " rewrites the address bar");
    assert.deepEqual(p.visibleView(), ["view-settings-billing"], path);
    assert.equal(p.document.title, "Billing | NegosyoOnline");
    assert.equal(p.shown[p.shown.length - 1], "billing", path + " ends on the Billing page (a deep link opens its page for the moment before the billing answer arrives, and the API refuses its data)");
    assert.equal(p.nodes["set-tabs"].hidden, true);
  }
});

test("billing-only: a later move to an operational address (Back, or a link) is sent to Billing too", () => {
  const p = boot("/settings/billing/", { billingOnly: true });
  p.location.pathname = "/orders/";
  p.winOn.popstate[0]();
  assert.equal(p.location.pathname, "/settings/billing/");
  assert.ok(!p.shown.includes("orders"));
  assert.deepEqual(p.visibleView(), ["view-settings-billing"]);
});

test("served site (billing_only false, unavailable or failed): the nav is untouched and the pages open as before", () => {
  const p = boot("/orders/", { billingOnly: false });
  assert.deepEqual(p.hiddenOf(p.OPS), p.OPS.map(() => false));
  assert.equal(p.SEP.hidden, false);
  assert.equal(p.SIDE_BILLING.hidden, true, "the Billing-only link stays hidden");
  assert.equal(p.TAB_BILLING.hidden, true);
  assert.deepEqual(p.hiddenOf(p.TAB_OPS), p.TAB_OPS.map(() => false));
  assert.equal(p.QS.hidden, false);
  assert.deepEqual(p.hiddenOf(p.MENU), [false, false]);
  assert.equal(p.nodes.tabs, undefined, "the tab grid is not touched");
  assert.equal(p.location.pathname, "/orders/");
  assert.deepEqual(p.replaced, []);
  assert.deepEqual(p.shown, ["orders"]);
  assert.deepEqual(p.visibleView(), ["view-orders"]);
  const settings = boot("/settings/payments/", { billingOnly: false });
  assert.equal(settings.nodes["set-tabs"].hidden, false, "the Settings tabs show for a served site");
  assert.equal(settings.document.title, "Payments | NegosyoOnline");
});

test("sign out and the theme toggle are not touched by the billing-only change", () => {
  const src = DASH.slice(DASH.indexOf("function applyBillingOnly"), DASH.indexOf("function checkBillingOnly"));
  assert.ok(!/signout|theme/i.test(src), "applyBillingOnly names neither");
  const menu = HTML.match(/<div class="acct-menu" id="acct-menu"[\s\S]*?<\/div>\s*<button type="button" class="acct-row"/)[0];
  assert.ok(/data-signout/.test(menu) && /data-theme-toggle/.test(menu), "both live in .menu-actions, which is left alone");
  assert.ok(!/\[data-signout\]|menu-actions[^"]*"\s*,/.test(src.replace(/\.acct-menu \.menu-actions/g, "")), "no selector reaches the buttons");
});

test("the page has one hidden Billing link in the sidebar and one in the phone tabs, both outside the operational set", () => {
  const found = [...HTML.matchAll(/<a\b[^>]*data-billing-only-nav[^>]*>/g)].map((m) => m[0]);
  assert.equal(found.length, 2);
  for (const t of found) assert.ok(/href="\/settings\/billing\/"/.test(t) && /\bhidden\b/.test(t), t);
});
