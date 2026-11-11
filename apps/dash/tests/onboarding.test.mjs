import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { load, answer } from "./load.mjs";
import { makeDocument } from "./dom.mjs";

/* The stubbed fetch answers 401 to the /me/ read dashboard.js makes when it loads, so the page never starts
   and only the exported helpers are exercised. */
const { window } = load(["app.js", "dashboard.js"], { config: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" },
  fetch: answer(401, { error: { code: "unauthenticated", message: "Sign in to continue." } }) });
const U = window.NOOnboarding.util, ID = "site_0123456789abcdefghjk";
const ok = (data) => ({ ok: true, status: 200, data });
/* Objects made by the scripts come from their own realm, so they are compared as JSON. */
const plain = (v) => JSON.parse(JSON.stringify(v));

test("setup states route with a string site id", () => {
  assert.equal(U.setupView(ok({ state: "not_started" })), "not_started");
  assert.equal(U.setupView(ok({ state: "in_progress", first_site: { id: ID } })), "step3");
  assert.equal(U.setupView(ok({ state: "in_progress", minimum_completed_at: "2026-11-10T08:00:00+08:00", first_site: { id: ID } })), "complete");
  assert.equal(U.setupView(ok({ state: "minimum_complete" })), "complete");
  assert.equal(U.setupView(ok({ state: "blocked", blocked_reason: "first_site_removed" })), "b3");
  /* An unverified owner is stopped by the account gate before this page starts, so this reason reaching the
     Overview is an answer the page does not know (Phase 7 B1). */
  assert.equal(U.setupView(ok({ state: "blocked", blocked_reason: "owner_email_unverified" })), "error");
});

test("step 2 opens from the setup answer alone", () => {
  assert.equal(U.step2Slot({ can_create_site: true }), "step2");
  assert.equal(U.step2Slot({ can_create_site: false }), "reread");
  assert.equal(U.suffixOf({ site_host_suffix: "negosyotest.com" }), ".negosyotest.com");
});

test("the create body is Sante and exactly three keys", () => {
  assert.deepEqual(plain(U.createBody(" Ana's Store ", " Anas-Store ")), { template: "sante", subdomain: "anas-store", display_name: "Ana's Store" });
});

test("create outcomes follow the new codes", () => {
  assert.equal(U.createOutcome({ status: 201, data: { id: ID, subdomain: "anas-store" } }).kind, "created");
  assert.equal(U.createOutcome({ status: 409, data: { code: "subdomain_taken", fields: { subdomain: "Taken." } } }).text, "Taken.");
  assert.equal(U.createOutcome({ status: 400, data: { code: "subdomain_reserved", fields: { subdomain: "Reserved." } } }).field, "subdomain");
  assert.equal(U.createOutcome({ status: 409, data: { code: "site_limit_reached" } }).kind, "already");
  assert.equal(U.createOutcome({ status: 409, data: { code: "first_site_removed" } }).kind, "reread");
  assert.equal(U.createOutcome({ status: 409, data: { code: "subscription_inactive", message: "x" } }).kind, "alert");
  assert.equal(U.createOutcome({ status: 403, data: { code: "email_not_verified", message: "Confirm your email to continue." } }).text, "Confirm your email to continue.");
});

test("a refused save shows field errors, and a missing site re-reads the setup", () => {
  assert.equal(U.saveOutcome({ status: 200, data: {} }).kind, "saved");
  assert.equal(U.saveOutcome({ status: 400, data: { code: "invalid_request", fields: { contact_mobile: "Enter a valid Philippine mobile number." } } }).kind, "fields");
  assert.equal(U.saveOutcome({ status: 404, data: { code: "not_found" } }).kind, "reread");
  assert.equal(U.saveOutcome({ status: 403, data: { code: "billing_only", message: "No." } }).kind, "alert");
});

test("step 3 is prefilled from top-level site keys", () => {
  assert.deepEqual(plain(U.prefill({ business_name: "Ana Trading", contact_email: "a@b.co", contact_mobile: "+639171234567" }, { display_name: "Ana's Store", subdomain: "anas-store" })),
    { business_name: "Ana Trading", contact_email: "a@b.co", contact_mobile: "+639171234567" });
});

test("a live site counts as the second step done", () => {
  assert.equal(U.countOf({ first_site: { id: ID, deleted: false } }), 2);
  assert.equal(U.countOf({ first_site: null }), 1);
});

/* ---- The Overview and the onboarding popup as drawn (Phase 7, ClickUp z8uq9machp) --------------------------------
   The page is started in a small stand-in document (dom.mjs) with a recorded fetch. /me/ is not read: the account
   gate of app.js is replaced by a signed-in, verified account, so what is under test is what dashboard.js draws
   from each GET /account/setup/ answer. */
const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
const DASH_SRC = fs.readFileSync(path.join(JS, "dashboard.js"), "utf8");
const VIEWS = JSON.parse("[" + /var VIEWS = \[([^\]]+)\]/.exec(DASH_SRC)[1] + "]");
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
const STAMP = "2026-11-10T08:00:00+08:00";
const NOT_STARTED = { status: 200, body: { state: "not_started", can_create_site: true, site_host_suffix: "negosyotest.com", first_site: null, missing: [] } };
const COMPLETE = { status: 200, body: { state: "minimum_complete", minimum_completed_at: STAMP, missing: [], first_site: { id: ID, display_name: "Ana's Store", subdomain: "anas-store" } } };

/* `setup` is a list of answers to GET /account/setup/, used in order (the last one repeats). An answer is
   {status, body}, or "down" for a request that never reaches the server. `sites` is the same for GET /sites/;
   without it that read answers 404 like every other address. */
async function bootPage(setup, sites) {
  const doc = makeDocument(), calls = [], listeners = {};
  const add = (parent, tag, attrs = {}) => { const n = doc.createElement(tag); for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]); return parent.appendChild(n); };
  const main = add(doc.body, "main", { id: "main" });
  for (const v of VIEWS) {
    const view = add(main, "section", { id: "view-" + v });
    const head = add(view, "header", { "class": "view-head" });
    add(head, "p", { "class": "dash-eyebrow" });
    add(head, "h1", { id: "h-" + v, tabindex: "-1" });
    add(head, "p", { "class": "view-sub" });
    if (v === "overview") add(view, "div", { id: "ov-body" });
  }
  let n = 0, m = 0;
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", "");
    calls.push({ method: opts.method, path: p });
    const a = p === "/account/setup/" ? setup[Math.min(n++, setup.length - 1)]
      : p === "/sites/" && opts.method === "GET" && sites ? sites[Math.min(m++, sites.length - 1)]
      : { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    if (a === "down") return Promise.reject(new Error("offline"));
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status,
      json: () => (a.body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(a.body)) });
  };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); } };
  const location = { search: "", pathname: "/", replace() {}, assign() {} };
  const history = { replaceState() {}, pushState() {} };
  const context = vm.createContext({ window, document: doc, location, history, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, fetch });
  vm.runInContext(fs.readFileSync(path.join(JS, "app.js"), "utf8"), context, { filename: "app.js" });
  window.NODash.requireAccount = () => Promise.resolve({ id: "acc_1", email: "ana@example.com", email_verified: true, name: "Ana Cruz", first_name: "Ana", last_name: "Cruz" });
  vm.runInContext(DASH_SRC, context, { filename: "dashboard.js" });
  await settle();
  const $ = (id) => doc.getElementById(id);
  const byClass = (root, c) => root.all((x) => x.classList.contains(c));
  return { doc, calls, $, byClass, body: $("ov-body"),
    setupReads: () => calls.filter((c) => c.path === "/account/setup/").length,
    sitesReads: () => calls.filter((c) => c.path === "/sites/" && c.method === "GET").length,
    normalOverview: () => byClass($("ov-body"), "ov-stack").length > 0,
    popup: () => $("ob-dlg-root"),
    buttons: (root) => root.all((x) => x.tagName === "BUTTON"),
    async go(pathname) { location.pathname = pathname; (listeners.popstate || []).forEach((fn) => fn({})); await settle(); },
    async click(node) { node.fire("click"); await settle(); } };
}

const FAILED_READS = [
  ["the request never reaches the server", "down"],
  ["a server error", { status: 500, body: { error: { code: "server_error", message: "Something went wrong." } } }],
  ["a 404", { status: 404, body: { error: { code: "not_found", message: "Not found." } } }],
  ["a 403", { status: 403, body: { error: { code: "forbidden", message: "No." } } }],
  ["an answer with no body", { status: 200 }],
  ["an answer that is not an object", { status: 200, body: "ok" }],
  ["a state the page does not know", { status: 200, body: { state: "paused" } }],
  ["no state at all", { status: 200, body: {} }],
  ["in progress with no site id and no completion stamp", { status: 200, body: { state: "in_progress", first_site: null, missing: ["site_name"] } }],
  ["in progress with a site id that is not a string", { status: 200, body: { state: "in_progress", first_site: { id: 7 } } }],
  ["blocked for a reason the page does not know", { status: 200, body: { state: "blocked", blocked_reason: "something_new" } }],
];

test("a failed setup read never shows the normal Overview", async () => {
  for (const [name, first] of FAILED_READS) {
    const p = await bootPage([first, COMPLETE]);
    assert.equal(p.normalOverview(), false, name + ": the normal Overview is not drawn");
    assert.equal(p.popup(), null, name + ": no popup either");
    const box = p.byClass(p.body, "err-box")[0];
    assert.ok(box, name + ": the load-error state is on the Overview");
    assert.equal(box.getAttribute("role"), "alert");
    assert.equal(box.all((x) => x.tagName === "H2")[0].textContent, "We couldn't load your setup");
    const again = p.buttons(box);
    assert.deepEqual(again.map((b) => [b.textContent, b.getAttribute("class")]), [["Try again", "no-btn no-btn-ghost"]], name);
    assert.equal(p.setupReads(), 1);

    await p.click(again[0]);
    assert.equal(p.setupReads(), 2, name + ": Try again reads the setup again");
    assert.equal(p.normalOverview(), true, name + ": a good answer then draws the normal Overview");
    assert.equal(p.byClass(p.body, "err-box").length, 0);
  }
});

test("Try again that fails again stays on the load-error state, and a new Account then gets the popup", async () => {
  const p = await bootPage(["down", { status: 500, body: {} }, NOT_STARTED]);
  await p.click(p.buttons(p.byClass(p.body, "err-box")[0])[0]);
  assert.equal(p.normalOverview(), false);
  assert.equal(p.byClass(p.body, "err-box").length, 1);
  assert.equal(p.doc.activeElement, p.$("h-overview"), "focus moves to the Overview heading, which stays in place");
  await p.click(p.buttons(p.byClass(p.body, "err-box")[0])[0]);
  assert.equal(p.setupReads(), 3);
  assert.ok(p.popup(), "the onboarding popup opens once the setup is read");
});

test("leaving and returning to the Overview after a failed setup read reads the setup again", async () => {
  const p = await bootPage(["down", NOT_STARTED]);
  await p.go("/account/");
  await p.go("/");
  assert.equal(p.setupReads(), 2);
  assert.ok(p.popup());
});

test("the setup helper never routes a failed or unknown answer to the normal Overview", () => {
  assert.equal(U.setupView(null), "error");
  assert.equal(U.setupView({ ok: false, status: 0, data: {} }), "error");
  assert.equal(U.setupView({ ok: false, status: 404, data: {} }), "error", "the old launch-gate 404 branch is gone");
  assert.equal(U.setupView({ ok: false, status: 500, data: {} }), "error");
  assert.equal(U.setupView(ok({ state: "in_progress", first_site: null })), "error");
  assert.equal(U.setupView(ok({ state: "in_progress", first_site: { id: "" } })), "error");
  assert.equal(U.setupView(ok({ state: "something_new" })), "error");
  assert.equal(U.setupView(ok(null)), "error");
  assert.ok(!/status === 404\) return "today"/.test(DASH_SRC));
});

test("the popup has no close control and ignores Escape", async () => {
  const p = await bootPage([NOT_STARTED]);
  const check = (step) => {
    const root = p.popup();
    assert.ok(root, step + ": the popup is open");
    const dlg = p.$("ob-dlg");
    assert.equal(dlg.getAttribute("role"), "dialog");
    assert.equal(dlg.getAttribute("aria-modal"), "true");
    for (const c of root.all((x) => ["BUTTON", "A"].includes(x.tagName))) {
      const label = (c.textContent + " " + (c.getAttribute("aria-label") || "") + " " + (c.getAttribute("class") || "")).toLowerCase();
      assert.ok(!/close|dismiss|cancel|skip|later|not now|×|✕/.test(label), step + ": no close control (" + label + ")");
    }
    for (const key of ["Escape", "Esc"]) {
      const e = p.doc.fire("keydown", { key });
      assert.equal(e.prevented, false);
      assert.ok(p.popup(), step + ": " + key + " leaves the popup open");
    }
    root.fire("click"); /* the backdrop */
    assert.ok(p.popup(), step + ": a click on the backdrop leaves the popup open");
    assert.equal(p.doc.body.classList.contains("ob-lock"), true);
    assert.equal(p.$("main").getAttribute("inert"), "", step + ": the page behind stays inert");
  };
  check("Welcome");
  assert.deepEqual(p.buttons(p.popup()).map((b) => b.textContent), ["Sign out", "Get started"]);
  await p.click(p.buttons(p.popup())[1]);
  check("Step 2");
  assert.deepEqual(p.buttons(p.popup()).map((b) => b.textContent), ["Sign out", "Create my site"]);
  assert.equal(p.setupReads(), 1);
});

test("returning to the Overview reopens the popup while setup is incomplete", async () => {
  const p = await bootPage([NOT_STARTED]);
  assert.ok(p.popup());
  await p.go("/account/");
  assert.equal(p.popup(), null, "the popup never outlives the Overview route");
  assert.equal(p.$("main").hasAttribute("inert"), false);
  await p.go("/");
  assert.ok(p.popup(), "back on the Overview the popup is open again");
  assert.equal(p.setupReads(), 2, "from a fresh setup read, not from anything kept in the browser");
  await p.go("/settings/business/");
  await p.go("/");
  assert.ok(p.popup());
  assert.equal(p.setupReads(), 3);
});

test("a finished Account with one missing item sees the Setup needs attention strip, linked to Business Settings", async () => {
  const p = await bootPage([{ status: 200, body: { state: "in_progress", minimum_completed_at: STAMP, missing: ["public_contact"],
    first_site: { id: ID, display_name: "Ana's Store", subdomain: "anas-store" } } }]);
  assert.equal(p.popup(), null, "the popup is never reopened for a finished Account");
  assert.equal(p.normalOverview(), true);
  const strips = p.byClass(p.body, "ov-setup");
  assert.equal(strips.length, 1);
  assert.equal(strips[0].all((x) => x.tagName === "H2")[0].textContent, "Setup needs attention");
  assert.equal(strips[0].all((x) => x.tagName === "P")[0].textContent, "Missing: store email and mobile");
  const links = strips[0].all((x) => x.tagName === "A");
  assert.deepEqual(links.map((a) => [a.getAttribute("href"), a.textContent]), [["/settings/business/", "Business Settings ›"]]);
  assert.equal(p.byClass(p.body, "ov-stack")[0].children[0], strips[0], "the strip is the first thing on the Overview");

  const done = await bootPage([COMPLETE]);
  assert.equal(done.byClass(done.body, "ov-setup").length, 0, "no strip when nothing is missing");
});

test("Step 3 and the phone More sheet say Business Settings, not General", () => {
  assert.ok(DASH_SRC.includes('"You can change your email and mobile number later in Settings › Business Settings."'));
  assert.ok(!/Settings › General/.test(DASH_SRC));
  const html = fs.readFileSync(path.join(JS, "..", "..", "index.html"), "utf8");
  const sheet = /<dialog[^>]*id="more-sheet"[\s\S]*?<\/dialog>/.exec(html)[0];
  const tile = /<a class="sheet-tile" href="\/settings\/business\/"[^>]*>([\s\S]*?)<\/a>/.exec(sheet)[1].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").trim();
  assert.equal(tile, "Business Settings");
  assert.ok(!/>General</.test(sheet));
});

test("a failed setup re-read inside the popup keeps the popup open on its own load-error card", async () => {
  const p = await bootPage([NOT_STARTED, "down", { status: 200, body: { state: "paused" } }, NOT_STARTED]);
  await p.click(p.buttons(p.popup())[1]); /* Get started */
  const form = p.popup().all((x) => x.tagName === "FORM")[0];
  form.all((x) => x.tagName === "INPUT")[0].value = "Ana's Store";
  form.fire("submit"); /* the stub answers 404 to the create, which makes the page read the setup again */
  await settle();
  const card = () => p.byClass(p.popup(), "err-box")[0];
  assert.ok(p.popup(), "the popup stays open");
  assert.equal(card().all((x) => x.tagName === "H2")[0].textContent, "We couldn't load your setup");
  await p.click(p.buttons(card())[0]);
  assert.ok(card(), "an unknown state on the retry is the same card, not the normal Overview");
  assert.equal(p.$("main").getAttribute("inert"), "");
  await p.click(p.buttons(card())[0]);
  assert.equal(card(), undefined);
  assert.deepEqual(p.buttons(p.popup()).map((b) => b.textContent), ["Sign out", "Create my site"]);
});

/* D1 (Coach Ed 2026-11-11, ClickUp z8uq9machp): the setup says the first site was removed, and the follow-up
   GET /sites/ that decides between the "Your site was removed" card and the normal Overview fails. */
const REMOVED = { status: 200, body: { state: "blocked", blocked_reason: "first_site_removed", first_site: { id: ID, deleted: true }, missing: [] } };
const NO_SITES = { status: 200, body: { items: [] } };
const ONE_SITE = { status: 200, body: { items: [{ id: "site_zyxwvutsrqponmlkjihg", display_name: "Second Store", subdomain: "second-store" }] } };
const FAILED_SITES_READS = [
  ["the request never reaches the server", "down"],
  ["a server error", { status: 500, body: { error: { code: "server_error", message: "Something went wrong." } } }],
  ["a 404", { status: 404, body: { error: { code: "not_found", message: "Not found." } } }],
  ["a 403", { status: 403, body: { error: { code: "forbidden", message: "No." } } }],
];

test("a removed first site whose sites read fails never shows the normal Overview", async () => {
  for (const [name, failed] of FAILED_SITES_READS) {
    const p = await bootPage([REMOVED], [failed]);
    assert.equal(p.sitesReads(), 1, name);
    assert.equal(p.normalOverview(), false, name + ": the normal Overview is not drawn");
    assert.equal(p.popup(), null, name + ": no popup either");
    const box = p.byClass(p.body, "err-box")[0];
    assert.ok(box, name + ": the load-error state is on the Overview");
    assert.equal(box.getAttribute("role"), "alert");
    assert.equal(box.all((x) => x.tagName === "H2")[0].textContent, "We couldn't load your setup");
    assert.deepEqual(p.buttons(box).map((b) => [b.textContent, b.getAttribute("class")]), [["Try again", "no-btn no-btn-ghost"]], name);

    await p.click(p.buttons(box)[0]); /* still failing */
    assert.deepEqual([p.setupReads(), p.sitesReads()], [2, 2], name + ": Try again runs the whole load again");
    assert.equal(p.normalOverview(), false, name);
    assert.equal(p.byClass(p.body, "err-box").length, 1, name + ": the same state while the read keeps failing");
    assert.equal(p.doc.activeElement, p.$("h-overview"));
  }
});

test("Try again after a failed sites read recovers once the read works", async () => {
  const live = await bootPage([REMOVED], ["down", ONE_SITE]);
  await live.click(live.buttons(live.byClass(live.body, "err-box")[0])[0]);
  assert.deepEqual([live.setupReads(), live.sitesReads()], [2, 2]);
  assert.equal(live.byClass(live.body, "err-box").length, 0);
  assert.equal(live.popup(), null);
  assert.equal(live.normalOverview(), true, "an Account that still owns a live site gets the normal Overview, as before");

  const none = await bootPage([REMOVED], [{ status: 500, body: {} }, NO_SITES]);
  await none.click(none.buttons(none.byClass(none.body, "err-box")[0])[0]);
  assert.equal(none.byClass(none.body, "err-box").length, 0);
  assert.equal(none.$("ob-h-blocked").textContent, "Your site was removed", "an Account with no live site gets the removed card in the popup, as before");
  assert.equal(none.$("main").getAttribute("inert"), "", "the page behind the popup is inert");
});

test("the sites read that answers keeps its two outcomes", async () => {
  const none = await bootPage([REMOVED], [NO_SITES]);
  assert.equal(none.$("ob-h-blocked").textContent, "Your site was removed");
  assert.equal(none.byClass(none.body, "err-box").length, 0);
  const live = await bootPage([REMOVED], [ONE_SITE]);
  assert.equal(live.popup(), null);
  assert.equal(live.normalOverview(), true);
});

test("a failed sites read after a re-read inside the popup keeps the popup open on its own load-error card", async () => {
  const p = await bootPage([NOT_STARTED, REMOVED], ["down", NO_SITES]);
  await p.click(p.buttons(p.popup())[1]); /* Get started */
  const behind = p.normalOverview(); /* what is behind the popup before the read fails */
  const form = p.popup().all((x) => x.tagName === "FORM")[0];
  form.all((x) => x.tagName === "INPUT")[0].value = "Ana's Store";
  form.fire("submit"); /* the stub answers 404 to the create, which makes the page read the setup again */
  await settle();
  const card = () => p.byClass(p.popup(), "err-box")[0];
  assert.ok(p.popup(), "the popup stays open");
  assert.equal(card().all((x) => x.tagName === "H2")[0].textContent, "We couldn't load your setup");
  assert.equal(p.$("main").getAttribute("inert"), "", "the page behind stays inert");
  assert.equal(p.normalOverview(), behind, "nothing new is drawn behind the popup");
  assert.equal(p.byClass(p.body, "err-box").length, 0);
  await p.click(p.buttons(card())[0]);
  assert.deepEqual([p.setupReads(), p.sitesReads()], [3, 2], "Try again reads the setup and the sites again");
  assert.equal(card(), undefined);
  assert.equal(p.$("ob-h-blocked").textContent, "Your site was removed");
});
