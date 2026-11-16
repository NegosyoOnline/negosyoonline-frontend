/* Where the two Settings entries live (Phase 7 B2, ClickUp z8uq9machp). The parent task's fixed rule: Account
   Settings is in the profile menu, never in the site sidebar; Settings (Business Settings) is in the site sidebar,
   never in the profile menu. The menus are static markup in index.html, so the markup is what is read. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const HTML = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const APP = fs.readFileSync(new URL("../public/assets/js/app.js", import.meta.url), "utf8");
const one = (re, what) => { const m = HTML.match(re); assert.equal(m && m.length, 1, what + " is in the page once"); return m[0]; };
/* Each link as [href, visible text], icons dropped. */
const links = (block) => [...block.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map((m) => [m[1], m[2].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").trim()]);

const PROFILE = one(/<div class="acct-menu" id="acct-menu"[\s\S]*?<\/div>\s*<button type="button" class="acct-row"/g, "the profile menu");
const SIDEBAR = one(/<nav class="side-nav"[\s\S]*?<\/nav>/g, "the sidebar navigation");
const TABS = one(/<nav class="tabs[^"]*" id="tabs"[\s\S]*?<\/nav>/g, "the bottom tabs");
const MORE = one(/<dialog[^>]*id="more-sheet"[\s\S]*?<\/dialog>/g, "the More sheet");
const SWITCHER = one(/<div class="ws-menu" id="ws-menu"[\s\S]*?<\/div>\s*<\/div>/g, "the site switcher menu");
const isAccount = ([href, text]) => href.indexOf("/account") === 0 || /account settings/i.test(text);
const isSettings = ([href, text]) => href.indexOf("/settings/") === 0 || /^(business )?settings$/i.test(text);

test("Account Settings is in the profile menu and not in the sidebar, bottom tabs or More sheet", () => {
  assert.deepEqual(links(PROFILE).filter(isAccount), [["/account/", "Account Settings"]]);
  for (const [name, block] of [["sidebar", SIDEBAR], ["bottom tabs", TABS], ["More sheet", MORE], ["site switcher", SWITCHER]]) {
    assert.deepEqual(links(block).filter(isAccount), [], "no Account Settings entry in the " + name);
    assert.ok(!/account settings/i.test(block), "the words are not in the " + name);
  }
  /* The whole page has one link to /account/: the profile menu's. */
  assert.equal((HTML.match(/href="\/account\/?"/g) || []).length, 1);
  /* On a phone the top bar's avatar opens a copy of that same menu, made by app.js; nothing else is added to it. */
  assert.ok(/getElementById\("acct-menu"\)[\s\S]{0,200}cloneNode\(true\)/.test(APP));
});

test("Settings is in the sidebar and not in the profile menu", () => {
  assert.deepEqual(links(SIDEBAR).filter(isSettings), [["/settings/business/", "Settings"]]);
  assert.deepEqual(links(PROFILE).filter(isSettings), [], "no Settings or Business Settings entry in the profile menu");
  assert.ok(!/\/settings\//.test(PROFILE), "no settings address in the profile menu");
  assert.ok(!/business settings/i.test(PROFILE));
  assert.deepEqual(links(PROFILE).map((l) => l[1]), ["Account Settings", "Help Center"]); /* Help Center is back for launch (z8uq9mekvc) */
  /* The phone's More sheet is the sidebar's stand-in: its Settings group opens Business Settings by that name. */
  assert.deepEqual(links(MORE).filter(([href]) => href === "/settings/business/"), [["/settings/business/", "Business Settings"]]);
});

/* Santé setup (ClickUp z8uq9m92ez): Coach Ed's ruling of 2026-11-11 moved it into Business Settings, so it has no
   Settings tab, no More tile and no quick link. Settings is back to its eight tabs. */
test("Settings has three tabs (Business Settings, Billing, Payments) and the Inbox tab that stays hidden until the API opens the inbox, and no Santé setup entry anywhere in the menus or the quick links", () => {
  const SET_TABS = one(/<nav class="set-tabs" id="set-tabs"[\s\S]*?<\/nav>/g, "the Settings tab row");
  assert.deepEqual(links(SET_TABS), [["/settings/business/", "Business Settings"], ["/settings/billing/", "Billing"], ["/settings/payments/", "Payments"], ["/settings/inbox/", "Inbox"], ["/settings/meta-pixel/", "Meta Pixel"], ["/settings/notices/", "Notices"]]);
  /* G2 Unified Inbox (z8uq9md3n6): the Inbox links start hidden and inbox.js shows them only when the API says the inbox is open.
     G1 Meta Pixel (z8uq9md3n5): the same for the Meta Pixel tab and meta-pixel.js. */
  const hiddenTabs = [...SET_TABS.replace(/^<nav[^>]*>/, "").matchAll(/<a\b[^>]*\bhidden\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(hiddenTabs.length, 3, "three tabs are hidden: Inbox, Meta Pixel and Notices");
  assert.ok(hiddenTabs[0].includes('href="/settings/inbox/"') && hiddenTabs[0].includes("data-inbox-nav"));
  assert.ok(hiddenTabs[1].includes('href="/settings/meta-pixel/"') && hiddenTabs[1].includes("data-meta-nav"));
  /* Member notices (z8uq9mezdh): the same for the Notices tab and notices.js. */
  assert.ok(hiddenTabs[2].includes('href="/settings/notices/"') && hiddenTabs[2].includes("data-notices-nav"));
  const settingsGroup = MORE.split('<h3 class="sheet-label">Settings</h3>')[1];
  assert.deepEqual(links(settingsGroup).map((l) => l[1]), ["Business Settings", "Billing", "Payments", "Inbox"]);
  /* The Help Center articles (z8uq9mekvc) are text on /help/ and name Santé; they are not a menu entry, so they are left out here. */
  assert.ok(!/sante|santé/i.test(HTML.replace(/<script src="\/assets\/js\/sante\.js[^>]*><\/script>/, "").replace(/<section class="view" id="view-help"[\s\S]*?<section class="view" id="view-referral"/, "")), "only the script that draws the Sponsor ID row names Santé");
  assert.ok(!HTML.includes("data-sante"));
  const quick = APP.slice(APP.indexOf("var QUICK_LINKS"), APP.indexOf("function quickSearch"));
  assert.ok(quick.includes('["Business Settings", "Settings", "/settings/business/"], ["Billing", "Settings", "/settings/billing/"]'), "Billing follows Business Settings");
  assert.ok(!/sante|santé/i.test(APP));
});

/* The old address /settings/sante/ still works: the router (dashboard.js) lands it on Business Settings. Run here
   against the real route() with a stand-in page. */
test("the old address /settings/sante/ lands on /settings/business/ and keeps its query string", async () => {
  const vm = await import("node:vm");
  const DASH = fs.readFileSync(new URL("../public/assets/js/dashboard.js", import.meta.url), "utf8");
  const run = (pathname, search) => {
    const nodes = {}, shown = [];
    const node = (id) => (nodes[id] = nodes[id] || { id, hidden: false, textContent: "", focus() {}, setAttribute() {}, removeAttribute() {}, appendChild() {}, addEventListener() {} });
    const location = { pathname, search };
    const history = { replaced: [], replaceState(a, b, url) { this.replaced.push(url); const q = url.indexOf("?"); location.pathname = q < 0 ? url : url.slice(0, q); location.search = q < 0 ? "" : url.slice(q); }, pushState() {} };
    const document = { title: "", getElementById: node, querySelectorAll: () => [], addEventListener() {}, createElement: () => node("x") };
    const window = { addEventListener() {}, NOBusiness: { show() { shown.push("business"); }, hide() {} },
      NODash: { el: () => node("x"), requireAccount: () => ({ then(fn) { window.start = fn; } }), cfg: {}, call: () => new Promise(() => {}) } };
    const ctx = vm.createContext({ window, document, location, history, console, Intl, Promise, setTimeout, clearTimeout });
    vm.runInContext(DASH, ctx, { filename: "dashboard.js" });
    window.start({ first_name: "Nena" });
    return { location, history, document, nodes, shown };
  };
  const old = run("/settings/sante/", "?site=site_aaaaaaaaaaaaaaaaaaaa");
  assert.deepEqual(old.history.replaced, ["/settings/business/?site=site_aaaaaaaaaaaaaaaaaaaa"]);
  assert.equal(old.location.pathname, "/settings/business/");
  assert.equal(old.document.title, "Business Settings | NegosyoOnline");
  assert.equal(old.nodes["view-settings-general"].hidden, false);
  assert.equal(old.nodes["view-overview"].hidden, true);
  assert.equal(old.nodes["set-tabs"].hidden, false);
  assert.deepEqual(old.shown, ["business"], "Business Settings is opened, once");
  const bare = run("/settings/sante", "");
  assert.deepEqual(bare.history.replaced, ["/settings/business/"]);
  const direct = run("/settings/business/", "");
  assert.deepEqual(direct.history.replaced, [], "the new address is left alone");
  assert.equal(direct.nodes["view-settings-general"].hidden, false);
});

/* The first route waits for the page's script tags (ClickUp z8uq9me2uu). The page modules (business.js, billing.js
   and the rest) are blocking script tags after dashboard.js, and route() opens a module only if its global is
   already there. So when /me/ answers while the document is still loading, the first route and the first load are
   held until DOMContentLoaded; a document that has finished loading routes at once. Run against the real file. */
test("the first route waits for DOMContentLoaded while the document is loading, and runs at once when it is loaded", async () => {
  const vm = await import("node:vm");
  const DASH = fs.readFileSync(new URL("../public/assets/js/dashboard.js", import.meta.url), "utf8");
  const run = (readyState) => {
    const nodes = {}, shown = [], calls = [], docOn = {}, winOn = {};
    const node = (id) => (nodes[id] = nodes[id] || { id, hidden: false, textContent: "", focus() {}, setAttribute() {}, removeAttribute() {}, appendChild() {}, addEventListener() {} });
    const location = { pathname: "/settings/business/", search: "" };
    const history = { replaceState() {}, pushState() {} };
    const on = (map) => (type, fn) => { (map[type] = map[type] || []).push(fn); };
    const document = { readyState, title: "", getElementById: node, querySelectorAll: () => [], addEventListener: on(docOn), createElement: () => node("x") };
    const window = { addEventListener: on(winOn),
      NODash: { el: () => node("x"), requireAccount: () => ({ then(fn) { window.start = fn; } }), cfg: {}, setWorkspace() {},
        call: (method, path) => { calls.push(method + " " + path); return new Promise(() => {}); } } };
    const ctx = vm.createContext({ window, document, location, history, console, Intl, Promise, setTimeout, clearTimeout });
    vm.runInContext(DASH, ctx, { filename: "dashboard.js" });
    window.start({ first_name: "Nena" }); /* GET /me/ has answered */
    return { window, document, nodes, shown, calls, docOn, winOn };
  };
  const spy = (page) => ({ show() { page.shown.push("business"); }, hide() {} });

  /* (a) Still loading: nothing is routed or read yet, and no navigation listener is live. */
  const early = run("loading");
  assert.equal(early.nodes["h-overview"].textContent.indexOf("Nena") >= 0, true, "the greeting does not wait");
  assert.equal(early.document.title, "", "no route has run");
  assert.equal(early.nodes["view-settings-general"], undefined, "no view has been touched");
  assert.deepEqual(early.calls, [], "the first load has not started");
  assert.equal((early.docOn.click || []).length, 0, "link clicks are left to the browser until the first route");
  assert.equal((early.winOn.popstate || []).length, 0);
  assert.equal((early.docOn.DOMContentLoaded || []).length, 1, "one listener waits for the document");
  /* business.js arrives after /me/ answered and only registers itself. */
  early.window.NOBusiness = spy(early);
  assert.deepEqual(early.shown, []);
  early.docOn.DOMContentLoaded[0]();
  assert.deepEqual(early.shown, ["business"], "the page module is opened exactly once");
  assert.equal(early.document.title, "Business Settings | NegosyoOnline");
  assert.equal(early.nodes["view-settings-general"].hidden, false);
  assert.equal(early.nodes["view-overview"].hidden, true);
  assert.deepEqual(early.calls, ["GET /account/setup/"], "the first load runs once, with the route");
  assert.equal(early.docOn.click.length, 1);
  assert.equal(early.winOn.popstate.length, 1);
  /* A later move inside the page does not open it a second time. */
  early.winOn.popstate[0]();
  assert.deepEqual(early.shown, ["business"]);

  /* (b) Already loaded ("interactive" or "complete"): the route runs at once, as before. */
  for (const state of ["interactive", "complete"]) {
    const late = run(state);
    assert.equal(late.document.title, "Business Settings | NegosyoOnline", state + ": routed at once");
    assert.equal(late.nodes["view-settings-general"].hidden, false);
    assert.deepEqual(late.calls, ["GET /account/setup/"]);
    assert.equal(late.docOn.DOMContentLoaded, undefined, state + ": nothing waits");
    assert.equal(late.docOn.click.length, 1);
    assert.equal(late.winOn.popstate.length, 1);
  }
});

/* Launch hide set (ClickUp z8uq9mek5z; Manager 2026-11-13 under Coach Ed's ruling, log 1100430000509244; seed Ruling 8: Santé
   Site Type only). The pages below are out of ROUTES and out of every menu, tab row, sheet and quick-link list. */
const HIDDEN = ["/orders/new/", "/storefront/", "/media-library/", "/earnings/", "/people/", "/usage/", "/subscription/", "/referral/",
  "/settings/plans/", "/settings/shipping/", "/settings/domain/", "/settings/automation/", "/settings/notification/"];
const KEPT = ["/", "/orders/", "/products/", "/account/", "/help/", "/settings/business/", "/settings/billing/", "/settings/payments/", "/training/", "/training/course/", "/training/live/", "/media/", "/journey/"];
const DASHJS = fs.readFileSync(new URL("../public/assets/js/dashboard.js", import.meta.url), "utf8");
const ROUTES_SRC = DASHJS.slice(DASHJS.indexOf("var ROUTES = {"), DASHJS.indexOf("};", DASHJS.indexOf("var ROUTES = {")));

test("the hidden pages are not in ROUTES and the kept pages are", () => {
  for (const h of HIDDEN) assert.ok(!ROUTES_SRC.includes('"' + h + '"'), h + " is not in ROUTES");
  for (const k of KEPT) assert.ok(ROUTES_SRC.includes('"' + k + '"'), k + " is in ROUTES");
});

test("no link in the page and no quick link reaches a hidden page", () => {
  const hrefs = [...HTML.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
  for (const h of HIDDEN) assert.ok(!hrefs.includes(h), h + " has no link in index.html");
  const quick = APP.slice(APP.indexOf("var QUICK_LINKS"), APP.indexOf("function quickSearch"));
  for (const h of HIDDEN) assert.ok(!quick.includes('"' + h + '"'), h + " is not a quick link");
  assert.deepEqual(links(SIDEBAR).map((l) => l[1]), ["Overview", "Orders", "Products", "Inbox", "Training", "Media Library", "Journey", "Settings"]);
  /* Training (z8uq9mezdj): the sidebar link and the More sheet tile both start hidden until the training probe answers 200 (training.js). */
  const hiddenTraining = [...HTML.matchAll(/<a\b[^>]*href="\/training\/"[^>]*>/g)].map((m) => m[0]);
  assert.equal(hiddenTraining.length, 2);
  for (const t of hiddenTraining) assert.ok(/data-training-nav/.test(t) && /\bhidden\b/.test(t), "hidden Training link: " + t);
  assert.deepEqual(links(MORE).filter(([href]) => href === "/training/"), [["/training/", "Training"]], "the More sheet has a Training tile");
  assert.ok(MORE.indexOf('href="/training/"') < MORE.indexOf('<h3 class="sheet-label">Settings</h3>'), "the Training group comes before Settings in the More sheet");
  /* Media Library (z8uq9mezdk): after Training, hidden until the media probe answers 200 (media.js). */
  const hiddenMedia = [...HTML.matchAll(/<a\b[^>]*href="\/media\/"[^>]*>/g)].map((m) => m[0]);
  assert.equal(hiddenMedia.length, 2);
  for (const t of hiddenMedia) assert.ok(/data-media-nav/.test(t) && /\bhidden\b/.test(t), "hidden Media Library link: " + t);
  assert.deepEqual(links(MORE).filter(([href]) => href === "/media/"), [["/media/", "Media Library"]], "the More sheet has a Media Library tile");
  assert.ok(MORE.indexOf('href="/media/"') < MORE.indexOf('<h3 class="sheet-label">Settings</h3>'), "the Media Library group comes before Settings in the More sheet");
  /* Journey (z8uq9meyqk): after Media Library, hidden until the journey probe answers 200 (journey.js). */
  const hiddenJourney = [...HTML.matchAll(/<a\b[^>]*href="\/journey\/"[^>]*>/g)].map((m) => m[0]);
  assert.equal(hiddenJourney.length, 2);
  for (const t of hiddenJourney) assert.ok(/data-journey-nav/.test(t) && /\bhidden\b/.test(t), "hidden Journey link: " + t);
  assert.deepEqual(links(MORE).filter(([href]) => href === "/journey/"), [["/journey/", "Journey"]], "the More sheet has a Journey tile");
  assert.deepEqual(links(TABS).map((l) => l[1]), ["Overview", "Orders", "Products", "Inbox"], "the bottom tabs are Overview, Orders, Products and the Inbox link (hidden until the API opens the inbox), with no Add order button");
  assert.ok(!/data-route="(orders-new|earnings|people|usage|referral|storefront|media-library)"/.test(HTML));
});

test("a hidden address opens Overview and resets the address bar to /", async () => {
  const vm = await import("node:vm");
  for (const path of HIDDEN) {
    const nodes = {}, replaced = [];
    const node = (id) => (nodes[id] = nodes[id] || { id, hidden: false, textContent: "", focus() {}, setAttribute() {}, removeAttribute() {}, appendChild() {}, addEventListener() {} });
    const location = { pathname: path, search: "" };
    const history = { replaceState(a, b, url) { replaced.push(url); }, pushState() {} };
    const document = { readyState: "complete", title: "", getElementById: node, querySelectorAll: () => [], addEventListener() {}, createElement: () => node("x") };
    const window = { addEventListener() {}, NODash: { el: () => node("x"), requireAccount: () => ({ then(fn) { window.start = fn; } }), cfg: {}, setWorkspace() {}, call: () => new Promise(() => {}) } };
    vm.runInContext(DASHJS, vm.createContext({ window, document, location, history, console, Intl, Promise, setTimeout, clearTimeout }), { filename: "dashboard.js" });
    window.start({ first_name: "Nena" });
    assert.deepEqual(replaced, ["/"], path + " is reset to /");
    assert.equal(document.title, "Dashboard | NegosyoOnline", path + " shows Overview");
    assert.equal(nodes["view-overview"].hidden, false);
  }
});
