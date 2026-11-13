/* Help Center (ClickUp z8uq9mekvc): the six articles on /help/ are in the page, each reachable from the index, and the
   "not available yet" placeholder is gone. The articles are static HTML, so the markup is what is read. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const HTML = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const DASH = fs.readFileSync(new URL("../public/assets/js/dashboard.js", import.meta.url), "utf8");
const CSS = fs.readFileSync(new URL("../public/assets/css/help.css", import.meta.url), "utf8");
const JS = fs.readFileSync(new URL("../public/assets/js/help.js", import.meta.url), "utf8");
const VIEW = HTML.slice(HTML.indexOf('<section class="view" id="view-help"'), HTML.indexOf('<section class="view" id="view-referral"'));
const ARTICLES = ["help-store", "help-sante", "help-payments", "help-orders", "help-billing", "help-support"];
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("the Help Center view has every article and an index link to each", () => {
  assert.ok(VIEW.length > 500, "the view is found");
  for (const id of ARTICLES) {
    assert.equal((VIEW.match(new RegExp('<article [^>]*id="' + id + '"', "g")) || []).length, 1, id + " is in the view once");
    assert.ok(VIEW.includes('<a href="#' + id + '">'), id + " is linked from the index");
    assert.ok(VIEW.includes('id="h-' + id + '"'), id + " has its heading");
  }
  assert.equal((VIEW.match(/<article /g) || []).length, ARTICLES.length, "no other article is on the page");
});

test("the billing article is in the index between the orders and support articles, and states no amount or account", () => {
  const i = (id) => VIEW.indexOf('<a href="#' + id + '">');
  assert.ok(i("help-orders") < i("help-billing") && i("help-billing") < i("help-support"), "indexed after orders, before support");
  assert.ok(/^help-[a-z]+$/.test("help-billing"), "the anchor matches help.js");
  const t = text(VIEW.slice(VIEW.indexOf('id="h-help-billing"'), VIEW.indexOf('<article class="dash-card help-article" id="help-support"')));
  assert.ok(t.includes("Monthly") && t.includes("Annual") && t.includes("7 calendar days"));
  assert.ok(t.includes("When your free trial ends"), "the trial-end section exists");
  assert.ok(VIEW.indexOf("<h3>When your free trial ends</h3>") < VIEW.indexOf("<h3>If a payment is late</h3>"), "trial-end comes before late payment");
  assert.ok(t.includes("paused") && !/suspended/i.test(t), "the article says paused, never suspended");
  assert.ok(!/PHP|₱|\d{1,3},\d{3}/.test(t), "no amount or account number");
  for (const bad of ["per order", "per sale", "card", "gateway", "auto-debit", "usage"]) assert.ok(!t.includes(bad), bad + " is not mentioned");
});

test("the placeholder is gone and no title is focusable", () => {
  assert.ok(!/not available yet/i.test(VIEW));
  assert.ok(!/ph-card|chip-neutral|Help Center is not available/.test(VIEW));
  assert.ok(!/<h2[^>]*tabindex/.test(VIEW), "card titles are never focusable");
  assert.ok(!/gold/i.test(CSS) && !/--focus\b/.test(CSS), "focus is not the gold token");
  assert.ok(/:focus-visible \{ outline: 2px solid var\(--link\)/.test(CSS));
});

test("the page is reachable: /help/ is in ROUTES and the profile menu, and the old route is not hidden", () => {
  assert.ok(DASH.slice(DASH.indexOf("var ROUTES = {")).includes('"/help/": { view: "help"'));
  assert.ok(/<a class="menu-row menu-link" role="menuitem" href="\/help\/"/.test(HTML));
});

test("the support article states the published periods and contacts, and nothing after launch", () => {
  const t = text(VIEW.slice(VIEW.indexOf('id="help-support"')));
  for (const s of ["support@negosyoonline.com", "+63 917 309 8619", "within 1 business day", "within 7 business days", "30 calendar days", "90 calendar days"]) assert.ok(t.includes(s), s);
  const all = text(VIEW);
  for (const bad of ["J&T", "Track Order", "Xendit", "own domain", "self-service", "ticket"]) assert.ok(!all.includes(bad), bad + " is not mentioned");
});

test("site links take their host from the config and fall back to plain text", () => {
  const run = (siteUrl) => {
    const a = { attrs: { "data-site-path": "/terms#complaints", href: "#" }, getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
    const window = { NODash: { cfg: { siteUrl } }, addEventListener() {} };
    const document = { querySelectorAll: () => [a], getElementById: () => ({ hidden: true }) };
    new Function("window", "document", "location", JS)(window, document, { hash: "" });
    return a.attrs;
  };
  assert.equal(run("https://www-staging.negosyonline.com/").href, "https://www-staging.negosyonline.com/terms#complaints");
  assert.equal(run("").href, undefined);
});

test("a fresh load scrolls to the article once the router shows the help view", () => {
  assert.ok(/r\.view === "help" && window\.NOHelp\) window\.NOHelp\.toAnchor\(\)/.test(DASH), "the router calls toAnchor after showing the view");
  const run = (hash, hidden) => {
    let scrolled = [];
    const view = { hidden };
    const node = (id) => ({ scrollIntoView() { scrolled.push(id); } });
    const window = { NODash: { cfg: {} }, addEventListener() {} };
    const document = { querySelectorAll: () => [], getElementById: (id) => (id === "view-help" ? view : node(id)) };
    new Function("window", "document", "location", JS)(window, document, { hash });
    window.NOHelp.toAnchor();
    view.hidden = false;
    window.NOHelp.toAnchor();
    return scrolled;
  };
  assert.deepEqual(run("#help-orders", true), ["help-orders"], "scrolls only once the view is visible");
  assert.deepEqual(run("#bogus<x>", false), [], "an id outside help-[a-z]+ is ignored");
});

test("Help Center subheadings take the dash text token, so they are light on the dark card (no fall-through to the marketing navy)", () => {
  const rule = CSS.match(/#view-help \.help-article h3 \{([^}]*)\}/);
  assert.ok(rule, "the article h3 rule is in help.css");
  assert.ok(/color: var\(--text\)/.test(rule[1]), "h3 colour is var(--text)");
  const DASHCSS = fs.readFileSync(new URL("../public/assets/css/dash.css", import.meta.url), "utf8");
  assert.ok(/body\.dash-app \{[^}]*--text: #F2F4FA/.test(DASHCSS), "the dark default of --text is light");
  assert.ok(/html\[data-theme="light"\] body\.dash-app \{[^}]*--text: #0B163F/.test(DASHCSS), "light keeps the navy text");
});
