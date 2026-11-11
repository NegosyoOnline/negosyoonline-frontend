/* Santé setup (ClickUp z8uq9m92ez, comment 1100430000485211): the /settings/sante/ page, one Sponsor ID row and its
   Edit dialog. Driven like Business Settings: a small stand-in document (dom.mjs) and a recorded fetch. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const SRC = read("sante.js");
const HTML = fs.readFileSync(path.join(JS, "..", "..", "index.html"), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa", B = "site_bbbbbbbbbbbbbbbbbbbb", FOREIGN = "site_zzzzzzzzzzzzzzzzzzzz";
const site = (id, name, sub, template = "sante") => ({ id, template, template_label: template === "sante" ? "Santé" : "Basic", display_name: name,
  subdomain: sub, host: sub + ".negosyotest.com", business_name: name + " Trading" });
const SITE_A = site(A, "Nena's Barley Shop", "nenabarley"), SITE_B = site(B, "Nena's Wellness Marikina", "nenamarikina");
const NOT_FOUND = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
const REFUSED = "Use 1 to 32 letters, digits or hyphens.";
const SAVE_FAILED = "We couldn’t save. Check your connection and try again.";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };

/* `routes` answers a request first: (method, path, body, state) => {status, body}, a promise of one, or null for
   the default, which serves `sites` and a Santé settings answer for each Santé site. */
function boot({ search = "", sites = [SITE_A], sponsor = "", routes } = {}) {
  const doc = makeDocument(), calls = [], stored = [], toasts = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  const add = (tag, attrs) => { const n = doc.createElement(tag); for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]); return page.appendChild(n); };
  add("h1", { id: "h-settings-sante" }); add("p", { id: "st-site-line" }); add("div", { id: "st-root" }); add("div", { id: "st-live" });
  add("div", { id: "bs-root" }); add("div", { id: "bs-live" });
  const tab = add("a", { id: "tab", "data-sante": "", hidden: "" }), tile = add("a", { id: "tile", "data-sante": "", hidden: "" });
  tab.hidden = true; tile.hidden = true;
  doc.querySelectorAll = (sel) => (sel === "[data-sante]" ? doc.body.all((n) => n.hasAttribute("data-sante")) : []);
  const state = { sites: sites.map((s) => ({ ...s })), sponsor: {} };
  for (const s of state.sites) state.sponsor[s.id] = sponsor;
  const fallback = (method, p, body) => {
    if (method === "GET" && p === "/sites/") return { status: 200, body: { items: state.sites, next_cursor: null } };
    const m = /^\/sites\/(site_[0-9a-z]{20})\/sante\/settings\/$/.exec(p), s = m ? state.sites.find((x) => x.id === m[1]) : null;
    if (!s || s.template !== "sante") return NOT_FOUND;
    if (method === "PATCH") state.sponsor[s.id] = body.sponsor_id;
    return { status: 200, body: { sponsor_id: state.sponsor[s.id], registration_ready: !!state.sponsor[s.id], catalog_owner: false } };
  };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    const answer = (routes && routes(opts.method, p, body, state)) || fallback(opts.method, p, body);
    return Promise.resolve(answer).then((a) => ({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) }));
  };
  const storage = (name) => ({ getItem: () => null, removeItem() {}, setItem(k) { stored.push(name + ":" + k); } });
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {} };
  const location = { search, pathname: "/settings/sante/", replace() {}, assign() {} };
  const context = vm.createContext({ window, document: doc, location, history: { replaceState() {} }, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl,
    localStorage: storage("local"), sessionStorage: storage("session"), requestAnimationFrame() {}, fetch });
  for (const f of ["app.js", "business.js", "sante.js"]) vm.runInContext(read(f), context, { filename: f });
  window.NODash.toast = (title) => toasts.push(title);
  const $ = (id) => doc.getElementById(id);
  const form = () => $("bs-dlg-body").all((n) => n.tagName === "FORM")[0];
  return { doc, window, calls, stored, toasts, state, $, form, page, tab, tile, root: $("st-root"), N: window.NOSante, D: window.NODash,
    patches: () => calls.filter((c) => c.method === "PATCH"),
    list: () => calls.map((c) => c.method + " " + c.path),
    async show() { window.NOSante.show(); await settle(); },
    open() { $("st-edit").fire("click"); return form(); },
    async save(value) { if (value !== undefined) $("bs-f-sponsor_id").value = value; form().fire("submit"); await settle(); },
    rows() { return $("st-root").all((n) => n.classList.contains("acct-set-row")); },
    byClass(c) { return $("st-root").all((n) => n.classList.contains(c)); } };
}
const quick = (d) => d.D.quickLinks().map((l) => l[0]);

test("nothing saved: one card, one row, 'Not added' with the amber tag and the help line, in the approved words", async () => {
  const d = boot();
  await d.show();
  assert.deepEqual(d.list(), ["GET /sites/", `GET /sites/${A}/sante/settings/`]);
  const cards = d.byClass("acct-card");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].all((n) => n.tagName === "H2")[0].textContent, "Sponsor ID");
  assert.equal(cards[0].all((n) => n.classList.contains("dash-copy"))[0].textContent,
    "New members who register through this site are registered under your own Santé sponsor ID.");
  assert.equal(d.rows().length, 1);
  const row = d.rows()[0];
  assert.equal(row.all((n) => n.classList.contains("acct-set-label"))[0].textContent, "Sponsor ID");
  assert.equal(row.all((n) => n.classList.contains("bs-none"))[0].textContent, "Not added");
  const chip = row.all((n) => n.classList.contains("chip"));
  assert.equal(chip.length, 1);
  assert.ok(chip[0].classList.contains("chip-warn"));
  assert.equal(chip[0].textContent, "Needed for member registration");
  assert.equal(row.all((n) => n.classList.contains("bs-row-help"))[0].textContent,
    "Member registration on this site cannot start until you add it. Nothing else on your site waits for it.");
  assert.equal(d.$("st-edit").textContent, "Edit");
  assert.equal(d.$("st-edit").getAttribute("aria-label"), "Edit sponsor ID");
  assert.equal(row.all((n) => n.classList.contains("bs-tag")).length, 0, "no Public or Private tag on the row");
  const line = d.$("st-site-line");
  assert.equal(line.hidden, false);
  assert.equal(line.textContent, "Site:Nena's Barley Shopnenabarley.negosyotest.comSanté");
});

test("a saved sponsor ID is shown exactly as saved, with no tag and no help line", async () => {
  const d = boot({ sponsor: "Sample-0012345" });
  await d.show();
  const row = d.rows()[0];
  assert.equal(row.all((n) => n.classList.contains("acct-set-value"))[0].textContent, "Sample-0012345");
  assert.equal(row.all((n) => n.classList.contains("chip")).length, 0);
  assert.equal(row.all((n) => n.classList.contains("bs-row-help")).length, 0);
  assert.equal(row.all((n) => n.classList.contains("bs-none")).length, 0);
  assert.ok(!d.root.textContent.includes("Ready"));
});

test("a ?site= that is not one of my sites is ignored; one of mine is used", async () => {
  const foreign = boot({ search: "?site=" + FOREIGN });
  await foreign.show();
  foreign.open();
  await foreign.save("AB-1");
  assert.deepEqual(foreign.list(), ["GET /sites/", `GET /sites/${A}/sante/settings/`, `PATCH /sites/${A}/sante/settings/`]);
  assert.ok(!JSON.stringify(foreign.calls).includes(FOREIGN));
  const mine = boot({ search: "?site=" + B, sites: [SITE_A, SITE_B] });
  await mine.show();
  assert.deepEqual(mine.list(), ["GET /sites/", `GET /sites/${B}/sante/settings/`]);
  assert.ok(mine.$("st-site-line").textContent.includes(SITE_B.display_name));
});

test("the Edit dialog: approved words, one field, and one PATCH that is trimmed and keeps its case", async () => {
  const d = boot({ sponsor: "OLD-1" });
  await d.show();
  const form = d.open();
  assert.equal(d.$("bs-dlg-h").textContent, "Edit sponsor ID");
  assert.equal(form.children[0].textContent, "For Nena's Barley Shop. New members who register through this site are registered under this sponsor ID.");
  const inputs = form.all((n) => n.tagName === "INPUT");
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].value, "OLD-1");
  assert.equal(form.all((n) => n.tagName === "LABEL")[0].textContent, "Sponsor ID");
  assert.equal(d.$("bs-f-sponsor_id-help").textContent, "Letters, digits and hyphens only, up to 32 characters. Leave it blank to remove it.");
  assert.equal(d.doc.activeElement, inputs[0], "focus starts in the field");
  assert.deepEqual(form.all((n) => n.tagName === "BUTTON").map((b) => b.textContent), ["Save", "Cancel"]);
  await d.save("  Sample-0012345  ");
  assert.equal(d.patches().length, 1);
  assert.equal(d.patches()[0].path, `/sites/${A}/sante/settings/`);
  assert.deepEqual(d.patches()[0].body, { sponsor_id: "Sample-0012345" });
  assert.equal(d.$("bs-dlg-root"), null, "the dialog closes");
  assert.equal(d.rows()[0].all((n) => n.classList.contains("acct-set-value"))[0].textContent, "Sample-0012345");
  assert.deepEqual(d.toasts, ["Saved"]);
  assert.equal(d.$("st-live").textContent, "Saved.");
  assert.equal(d.doc.activeElement, d.$("st-edit"), "focus returns to Edit");
});

test("blank is allowed and removes the ID; the page adds no rule of its own", async () => {
  const d = boot({ sponsor: "OLD-1" });
  await d.show();
  d.open();
  await d.save("   ");
  assert.deepEqual(d.patches()[0].body, { sponsor_id: "" });
  assert.equal(d.rows()[0].all((n) => n.classList.contains("bs-none"))[0].textContent, "Not added");
  assert.equal(d.rows()[0].all((n) => n.classList.contains("chip-warn")).length, 1);
  d.open();
  await d.save("SP 0012/345 and far more than thirty-two characters long");
  assert.equal(d.patches().length, 2, "a value the server would refuse is still sent: the server decides");
  assert.deepEqual(d.patches()[1].body, { sponsor_id: "SP 0012/345 and far more than thirty-two characters long" });
});

test("a refused value: the server's own message under the field, the dialog stays, nothing changes on the row", async () => {
  const d = boot({ sponsor: "OLD-1", routes: (method) => (method === "PATCH" ? { status: 400, body: { error: { code: "invalid_request",
    message: "Some values are missing or invalid.", fields: { sponsor_id: [REFUSED] } } } } : null) });
  await d.show();
  d.open();
  await d.save("SP 0012/345");
  assert.ok(d.$("bs-dlg-root"));
  assert.equal(d.$("bs-f-sponsor_id-err").textContent, REFUSED);
  assert.equal(d.$("bs-f-sponsor_id-err").hidden, false);
  assert.equal(d.$("bs-f-sponsor_id").getAttribute("aria-invalid"), "true");
  assert.ok(d.$("bs-f-sponsor_id").classList.contains("ob-invalid"));
  assert.equal(d.$("bs-f-sponsor_id").value, "SP 0012/345", "the typed value stays");
  assert.equal(d.doc.activeElement, d.$("bs-f-sponsor_id"));
  assert.equal(d.$("st-dlg-err").hidden, true);
  assert.equal(d.$("st-dlg-save").disabled, false);
  assert.equal(d.$("st-dlg-save").textContent, "Save");
  assert.ok(d.root.textContent.includes("OLD-1"));
  assert.deepEqual(d.toasts, []);
});

test("no connection or a server fault: the save-failed line above the buttons, and what was typed stays", async () => {
  for (const answer of [() => Promise.reject(new Error("offline")), () => ({ status: 500, body: {} })]) {
    const d = boot({ routes: (method) => (method === "PATCH" ? answer() : null) });
    await d.show();
    d.open();
    await d.save("AB-1");
    assert.equal(d.$("st-dlg-err").textContent, SAVE_FAILED);
    assert.equal(d.$("st-dlg-err").hidden, false);
    assert.equal(d.$("bs-f-sponsor_id").value, "AB-1");
    assert.equal(d.$("bs-f-sponsor_id-err").hidden, true);
    assert.equal(d.doc.activeElement, d.$("st-dlg-save"));
    const form = d.form(), kids = form.children;
    assert.equal(kids[kids.indexOf(d.$("st-dlg-err")) + 1].classList.contains("acct-dlg-foot"), true, "it sits just above the buttons");
  }
});

test("403 (site limited to Billing) and 429 (too many saves) show the server's message in the save-failed position", async () => {
  for (const [status, code, message] of [[403, "billing_only", "This site is limited to Billing until its subscription continues."],
    [429, "throttled", "Too many attempts. Please wait and try again."]]) {
    const d = boot({ routes: (method) => (method === "PATCH" ? { status, body: { error: { code, message } } } : null) });
    await d.show();
    d.open();
    await d.save("AB-1");
    assert.equal(d.$("st-dlg-err").textContent, message, String(status));
    assert.equal(d.$("st-dlg-err").hidden, false);
    assert.ok(d.$("bs-dlg-root"), "the dialog stays open");
    assert.equal(d.$("bs-f-sponsor_id").value, "AB-1");
  }
  const bare = boot({ routes: (method) => (method === "PATCH" ? { status: 403, body: {} } : null) });
  await bare.show();
  bare.open();
  await bare.save("AB-1");
  assert.equal(bare.$("st-dlg-err").textContent, SAVE_FAILED, "a 403 with no message falls back to the save-failed line");
});

test("Saving…: Save cannot be pressed twice, Cancel still works, and a late answer for a closed dialog is not drawn", async () => {
  let release;
  const held = new Promise((r) => { release = r; });
  const d = boot({ routes: (method) => (method === "PATCH" ? held.then(() => ({ status: 200, body: { sponsor_id: "AB-1", registration_ready: true, catalog_owner: false } })) : null) });
  await d.show();
  const form = d.open();
  d.$("bs-f-sponsor_id").value = "AB-1";
  form.fire("submit");
  assert.equal(d.$("st-dlg-save").disabled, true);
  assert.equal(d.$("st-dlg-save").textContent, "Saving…");
  assert.equal(d.$("st-dlg-cancel").disabled, false);
  form.fire("submit");
  assert.equal(d.patches().length, 1, "a second press sends nothing");
  d.$("st-dlg-cancel").fire("click");
  assert.equal(d.$("bs-dlg-root"), null);
  assert.equal(d.doc.activeElement, d.$("st-edit"));
  release(); await settle();
  assert.equal(d.$("bs-dlg-root"), null);
  assert.equal(d.rows()[0].all((n) => n.classList.contains("acct-set-value"))[0].textContent, "AB-1", "the row shows what the server saved");
});

test("a 404 on a Santé site is handled like a site that has gone: say so and read again, once", async () => {
  let removed = false;
  const d = boot({ sites: [SITE_A, SITE_B], routes: (method, p, body, state) => {
    if (method !== "PATCH") return null;
    removed = true; state.sites = state.sites.filter((s) => s.id !== A);
    return NOT_FOUND;
  } });
  await d.show();
  d.open();
  const mark = d.calls.length;
  await d.save("AB-1");
  assert.ok(removed);
  assert.equal(d.$("bs-dlg-root"), null);
  assert.deepEqual(d.list().slice(mark), [`PATCH /sites/${A}/sante/settings/`, "GET /sites/", `GET /sites/${B}/sante/settings/`]);
  assert.equal(d.$("st-notice").textContent, "This site is not available.");
  assert.equal(d.$("st-live").textContent, "This site is not available.");
  assert.ok(d.page.textContent.includes(SITE_B.display_name) && !d.page.textContent.includes(SITE_A.display_name));

  /* The switch off, or a site gone on both reads: two reads, then the plain box with Try again. */
  const off = boot({ routes: (method, p) => (/sante\/settings/.test(p) ? NOT_FOUND : null) });
  await off.show();
  assert.deepEqual(off.list(), ["GET /sites/", `GET /sites/${A}/sante/settings/`, "GET /sites/", `GET /sites/${A}/sante/settings/`]);
  assert.equal(off.root.all((n) => n.tagName === "H2")[0].textContent, "This site is not available.");
  assert.equal(off.$("st-site-line").hidden, true);
  assert.ok(!off.root.textContent.includes("only for Santé sites"), "a 404 never decides 'not a Santé site'");
  off.root.all((n) => n.tagName === "BUTTON")[0].fire("click");
  await settle();
  assert.equal(off.calls.length, 8, "Try again reads again");
});

test("not a Santé site, address opened directly: the plain card, decided from template, with no settings request", async () => {
  const d = boot({ sites: [site(A, "Nena's Other Shop", "nenaother", "basic")] });
  await d.show();
  assert.deepEqual(d.list(), ["GET /sites/"]);
  const card = d.byClass("ph-card");
  assert.equal(card.length, 1);
  assert.deepEqual(card[0].children.map((n) => n.textContent), ["Not for this site", "Santé setup is only for Santé sites",
    "This site is not a Santé site, so there is nothing to set up here.", "Back to Overview"]);
  assert.ok(card[0].children[0].classList.contains("chip-neutral"));
  assert.equal(card[0].children[3].getAttribute("href"), "/");
  assert.equal(d.$("st-site-line").hidden, true);
  assert.equal(d.$("st-edit"), null);
  assert.equal(d.tab.hidden, true);
  assert.equal(d.tile.hidden, true);
  assert.ok(!quick(d).includes("Santé setup"));
});

test("page states: loading, a failed load, no site yet", async () => {
  const d = boot();
  d.N.show();
  const skel = d.byClass("skel");
  assert.equal(skel.length, 1);
  assert.equal(skel[0].getAttribute("aria-busy"), "true");
  assert.equal(d.byClass("skel-block").length, 1, "one card, so one block");
  assert.equal(d.$("st-site-line").hidden, true);
  await settle();
  assert.equal(d.byClass("skel").length, 0);

  for (const routes of [() => ({ status: 500, body: {} }), (m, p) => (/sante/.test(p) ? { status: 500, body: {} } : null),
    (m, p) => (/sante/.test(p) ? { status: 403, body: { error: { code: "billing_only", message: "No." } } } : null)]) {
    const failed = boot({ routes });
    await failed.show();
    const box = failed.byClass("err-box")[0];
    assert.equal(box.getAttribute("role"), "alert");
    assert.deepEqual(box.children.map((n) => n.textContent), ["We could not load this site’s Santé setup", "Check your connection and try again. Nothing was changed.", "Try again"]);
    assert.equal(failed.$("st-site-line").hidden, true);
    const before = failed.calls.length;
    box.children[2].fire("click");
    await settle();
    assert.ok(failed.calls.length > before, "Try again reads again");
  }

  const none = boot({ sites: [] });
  await none.show();
  assert.deepEqual(none.list(), ["GET /sites/"]);
  assert.deepEqual(none.byClass("ph-card")[0].children.map((n) => n.textContent), ["No site yet", "Create your site first",
    "Santé setup opens once your first site is created. Finish the setup on Overview.", "Back to Overview"]);
  assert.equal(none.$("st-site-line").hidden, true);
});

test("leaving the page closes the dialog, and an answer that arrives afterwards is not drawn", async () => {
  let release;
  const held = new Promise((r) => { release = r; });
  let hold = false;
  const d = boot({ sponsor: "OLD-1", routes: (method, p) => (hold && /sante/.test(p) ? held.then(() => ({ status: 200, body: { sponsor_id: "LATE", registration_ready: true, catalog_owner: false } })) : null) });
  await d.show();
  const stale = d.open();
  d.N.hide();
  assert.equal(d.$("bs-dlg-root"), null);
  const mark = d.calls.length;
  stale.fire("submit");
  await settle();
  assert.equal(d.calls.length, mark, "a form from before sends nothing");
  hold = true;
  d.N.show();
  d.N.hide();
  release(); await settle();
  assert.ok(!d.page.textContent.includes("LATE"));
  assert.equal(d.rows().length, 0);
});

test("the tab, the tile and the quick link appear only once the site is known to be a Santé site", async () => {
  const d = boot();
  assert.equal(d.tab.hidden, true);
  assert.ok(!quick(d).includes("Santé setup"));
  d.N.nav(); d.N.nav();
  await settle();
  assert.deepEqual(d.list(), ["GET /sites/"], "one read, however often it is asked");
  assert.equal(d.tab.hidden, false);
  assert.equal(d.tile.hidden, false);
  const links = d.D.quickLinks(), at = quick(d).indexOf("Santé setup");
  assert.deepEqual(Array.from(links[at]).slice(0, 3), ["Santé setup", "Settings", "/settings/sante/"]);
  assert.equal(quick(d)[at - 1], "Business Settings", "it follows Business Settings");
  d.N.nav();
  await settle();
  assert.equal(d.calls.length, 1, "already known: no further read");

  const other = boot({ sites: [site(A, "Other", "other", "basic")] });
  other.N.nav(); await settle();
  assert.equal(other.tab.hidden, true);
  const none = boot({ sites: [] });
  none.N.nav(); await settle();
  assert.equal(none.tab.hidden, true);
  const down = boot({ routes: () => ({ status: 500, body: {} }) });
  down.N.nav(); await settle();
  assert.equal(down.tab.hidden, true, "a failed read shows nothing");

  const page = boot();
  page.N.show(); page.N.nav();
  await settle();
  assert.deepEqual(page.list(), ["GET /sites/", `GET /sites/${A}/sante/settings/`], "the page's own read serves the menu too");
  assert.equal(page.tab.hidden, false);
});

test("the page stores nothing in the browser and calls only its two /sites/ routes", async () => {
  const d = boot();
  await d.show();
  d.open();
  await d.save("AB-1");
  assert.deepEqual(d.stored, []);
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(SRC));
  assert.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon|innerHTML/.test(SRC));
  for (const c of d.calls) assert.match(c.path, /^\/sites\/(site_[0-9a-z]{20}\/sante\/settings\/)?$/, c.method + " " + c.path);
  assert.deepEqual(Object.keys(d.patches()[0].body), ["sponsor_id"]);
});

test("the address, the browser title, the hooks and the script are wired in", () => {
  const dash = read("dashboard.js");
  assert.ok(dash.includes('"/settings/sante/": { view: "settings-sante", title: "Santé setup | NegosyoOnline" }'));
  assert.match(dash, /var VIEWS = \[[^\]]*"settings-general", "settings-sante", "settings-plans"/);
  assert.ok(/<section class="view" id="view-settings-sante" aria-labelledby="h-settings-sante" hidden>\s*<header class="view-head"><p class="dash-eyebrow">Settings<\/p><h1 id="h-settings-sante" tabindex="-1">Santé setup<\/h1>/.test(HTML));
  for (const id of ["st-site-line", "st-root", "st-live"]) assert.equal((HTML.match(new RegExp('id="' + id + '"', "g")) || []).length, 1, id);
  const scripts = [...HTML.matchAll(/<script src="\/assets\/js\/([a-z-]+)\.js/g)].map((m) => m[1]);
  assert.ok(scripts.indexOf("sante") > scripts.indexOf("business"), "sante.js loads after business.js, whose dialog it uses");
});
