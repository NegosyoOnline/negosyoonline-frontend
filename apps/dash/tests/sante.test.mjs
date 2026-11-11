/* The "Santé Username" row, the site's Santé sponsor ID (ClickUp z8uq9m92ez, comments 1100430000485211, 1100430000485794,
   1100430000486115 and, for the wording, 1100430000486478): for
   a Santé site, the last row of the Business identity card on Business Settings, in the place of the Site type row,
   with its Edit dialog. Driven like Business Settings: a small stand-in document (dom.mjs) and a recorded fetch. */
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
const CSS = fs.readFileSync(path.join(JS, "..", "css", "dash.css"), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa", B = "site_bbbbbbbbbbbbbbbbbbbb", FOREIGN = "site_zzzzzzzzzzzzzzzzzzzz";
const site = (id, name, sub, template = "sante") => ({ id, template, template_label: template === "sante" ? "Santé" : "Basic", display_name: name,
  subdomain: sub, host: sub + ".negosyotest.com", business_name: name + " Trading", contact_email: "hello@" + sub + ".test", contact_mobile: "+639175550142",
  facebook_url: "", instagram_url: "", tiktok_url: "" });
const SITE_A = site(A, "Nena's Barley Shop", "nenabarley"), SITE_B = site(B, "Nena's Wellness Marikina", "nenamarikina");
const NOT_FOUND = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
const REFUSED = "Use 1 to 32 letters, digits or hyphens.";
const SAVE_FAILED = "We couldn’t save. Check your connection and try again.";
const SANTE_PATH = /^\/sites\/(site_[0-9a-z]{20})\/sante\/settings\/$/;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

/* A dashboard with the Business Settings view in it. `routes` answers a request first: (method, path, body, state) =>
   {status, body}, a promise of one, or null for the default, which serves `sites`, a business profile for each and
   a Santé settings answer for each Santé site. */
function boot({ search = "", sites = [SITE_A], sponsor = "", routes } = {}) {
  const doc = makeDocument(), calls = [], stored = [], toasts = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const [tag, id] of [["h1", "h-settings-general"], ["p", "bs-site-line"], ["div", "bs-pick"], ["div", "bs-root"], ["div", "bs-live"]]) {
    const n = doc.createElement(tag); n.setAttribute("id", id); page.appendChild(n);
  }
  const state = { sites: sites.map((s) => ({ ...s })), sponsor: {}, profiles: {} };
  for (const s of state.sites) { state.sponsor[s.id] = sponsor; state.profiles[s.id] = { business_name: s.business_name, business_address: "", shipping_estimates_confirmed: false }; }
  const fallback = (method, p, body) => {
    if (method === "GET" && p === "/sites/") return { status: 200, body: { items: state.sites, next_cursor: null } };
    const b = /^\/sites\/(site_[0-9a-z]{20})\/business-profile\/$/.exec(p);
    if (b) {
      if (!state.profiles[b[1]] || !state.sites.find((x) => x.id === b[1])) return NOT_FOUND;
      if (method === "PATCH") Object.assign(state.profiles[b[1]], body);
      return { status: 200, body: state.profiles[b[1]] };
    }
    const m = SANTE_PATH.exec(p), s = m ? state.sites.find((x) => x.id === m[1]) : null;
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
  const location = { search, pathname: "/settings/business/", replace() {}, assign() {} };
  const history = { replaceState(a, b, url) { location.search = url.slice(url.indexOf("?")); } };
  const context = vm.createContext({ window, document: doc, location, history, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl,
    localStorage: storage("local"), sessionStorage: storage("session"), requestAnimationFrame() {}, fetch });
  for (const f of ["app.js", "business.js", "sante.js"]) vm.runInContext(read(f), context, { filename: f });
  window.NODash.toast = (title) => toasts.push(title);
  const $ = (id) => doc.getElementById(id);
  const form = () => $("bs-dlg-body").all((n) => n.tagName === "FORM")[0];
  const row = () => $("st-row");
  const idCard = () => { const h = $("bs-h-id"); return h ? h.parentNode : null; };
  const has = (n, c) => n.all((x) => x.classList.contains(c));
  return { doc, window, calls, stored, toasts, state, $, form, page, row, idCard, has, root: $("bs-root"), G: window.NOBusiness, D: window.NODash,
    patches: () => calls.filter((c) => c.method === "PATCH"),
    list: () => calls.map((c) => c.method + " " + c.path),
    sante: () => calls.filter((c) => SANTE_PATH.test(c.path)).map((c) => c.method + " " + c.path),
    async show() { window.NOBusiness.show(); await settle(); },
    open() { $("st-edit").fire("click"); return form(); },
    async save(value) { if (value !== undefined) $("bs-f-sponsor_id").value = value; form().fire("submit"); await settle(); },
    cards() { return $("bs-root").all((n) => n.classList.contains("acct-card")); },
    /* The labels of the Business identity card's rows, in order, without their Public or Private tag. */
    labels() { return idCard() ? has(idCard(), "acct-set-row").map((r) => has(r, "acct-set-label")[0].children[0] ? has(r, "acct-set-label")[0].children[0].textContent : has(r, "acct-set-label")[0].textContent) : []; },
    value() { return has(row(), "acct-set-value")[0].textContent; } };
}

test("a Santé site: Santé Username is the last row of Business identity, in the place of Site type; no card of its own; 'Not added' with the one-sentence help line and no amber tag", async () => {
  const d = boot();
  await d.show();
  assert.deepEqual(d.list(), ["GET /sites/", `GET /sites/${A}/business-profile/`, `GET /sites/${A}/sante/settings/`]);
  assert.deepEqual(d.cards().map((c) => c.getAttribute("aria-labelledby")), ["bs-h-ready", "bs-h-id", "bs-h-contact", "bs-h-web", "bs-h-legal", "bs-h-del"], "the Business Settings cards and no other");
  assert.equal(d.$("st-card"), null);
  assert.equal(d.root.all((n) => n.tagName === "H2" && /sponsor id|santé username/i.test(n.textContent)).length, 0, "no heading of its own");
  assert.deepEqual(d.labels(), ["Business name", "Site name", "Business address", "Santé Username"]);
  assert.equal(d.$("bs-row-type"), null, "the Site type row is not on the page");
  assert.ok(!d.root.textContent.includes("Site type") && !d.root.textContent.includes("Set at setup"));
  const row = d.row(), rows = d.has(d.idCard(), "acct-set-row");
  assert.equal(row, rows[rows.length - 1]);
  assert.equal(row.parentNode, d.idCard());
  assert.deepEqual(row.children.map((n) => n.attrs["class"]), ["acct-set-label", "acct-set-value", "acct-set-action", "bs-row-help"], "the card's row pattern");
  assert.equal(d.has(row, "acct-set-label")[0].textContent, "Santé Username");
  assert.equal(d.has(row, "bs-none")[0].textContent, "Not added");
  assert.equal(d.value(), "Not added");
  assert.equal(d.has(row, "chip").length, 0, "no amber tag");
  assert.equal(d.has(row, "bs-row-help")[0].textContent, "Member registration on this site cannot start until you add it.");
  assert.ok(!/sponsor|Needed for member registration|Nothing else/i.test(d.root.textContent), "the screen does not say sponsor ID anywhere");
  assert.equal(d.$("st-edit").textContent, "Edit");
  assert.equal(d.$("st-edit").getAttribute("aria-label"), "Edit Santé username");
  assert.equal(d.$("st-edit").parentNode.attrs["class"], "acct-set-action");
  assert.equal(d.has(row, "bs-tag").length, 0, "no Public or Private tag on the row");
  assert.ok(!d.$("bs-h-ready").parentNode.textContent.includes("Username"), "Site readiness has no Santé Username line");
});

test("not a Santé site, or before the site type is known: the Site type row stays, no Santé Username row, no Santé request", async () => {
  const d = boot({ sites: [site(A, "Nena's Other Shop", "nenaother", "basic")] });
  await d.show();
  assert.deepEqual(d.list(), ["GET /sites/", `GET /sites/${A}/business-profile/`]);
  assert.equal(d.row(), null);
  assert.equal(d.$("st-edit"), null);
  assert.deepEqual(d.cards().map((c) => c.getAttribute("aria-labelledby")), ["bs-h-ready", "bs-h-id", "bs-h-contact", "bs-h-web", "bs-h-legal", "bs-h-del"]);
  assert.deepEqual(d.labels(), ["Business name", "Site name", "Business address", "Site type"]);
  const type = d.$("bs-row-type");
  assert.equal(d.has(type, "bs-tag")[0].textContent, "Private");
  assert.equal(d.has(type, "acct-set-value")[0].textContent, "BasicSet at setup");
  assert.equal(d.has(type, "bs-row-help")[0].textContent, "Chosen when the site was created. It cannot be changed here.");
  assert.ok(!/sponsor|username/i.test(d.root.textContent));

  /* While the sites read is still under way the page is the Business Settings skeleton only. */
  const early = boot();
  early.G.show();
  assert.equal(early.row(), null);
  assert.ok(!/sponsor|username/i.test(early.root.textContent));
  assert.deepEqual(early.sante(), []);
  await settle();
  assert.ok(early.row());

  /* No site yet and a failed sites read: Business Settings' own states, nothing of this row. */
  const none = boot({ sites: [] });
  await none.show();
  assert.deepEqual(none.list(), ["GET /sites/"]);
  assert.ok(none.root.textContent.includes("Create your site first"));
  assert.equal(none.row(), null);
  const down = boot({ routes: (m, p) => (p === "/sites/" ? { status: 500, body: {} } : null) });
  await down.show();
  assert.equal(down.row(), null);
  assert.deepEqual(down.sante(), []);
});

test("a saved Santé username is shown exactly as saved, with Edit, no tag and no help line", async () => {
  const d = boot({ sponsor: "Sample-0012345" });
  await d.show();
  const row = d.row();
  assert.equal(d.value(), "Sample-0012345");
  assert.deepEqual(row.children.map((n) => n.attrs["class"]), ["acct-set-label", "acct-set-value", "acct-set-action"]);
  assert.equal(d.has(row, "chip").length, 0);
  assert.equal(d.has(row, "bs-none").length, 0);
  assert.equal(d.$("st-edit").getAttribute("aria-label"), "Edit Santé username");
  assert.deepEqual(d.labels(), ["Business name", "Site name", "Business address", "Santé Username"]);
});

test("a ?site= that is not one of my sites is ignored; one of mine is used; choosing another site reads that site's row", async () => {
  const foreign = boot({ search: "?site=" + FOREIGN });
  await foreign.show();
  foreign.open();
  await foreign.save("AB-1");
  assert.deepEqual(foreign.sante(), [`GET /sites/${A}/sante/settings/`, `PATCH /sites/${A}/sante/settings/`]);
  assert.ok(!JSON.stringify(foreign.calls).includes(FOREIGN));
  const mine = boot({ search: "?site=" + B, sites: [SITE_A, SITE_B] });
  await mine.show();
  assert.deepEqual(mine.sante(), [`GET /sites/${B}/sante/settings/`]);

  /* Two sites, the second not a Santé site: the row goes when it is chosen and comes back with the first. */
  const two = boot({ sites: [SITE_A, site(B, "Nena's Other Shop", "nenaother", "basic")], sponsor: "AB-1" });
  await two.show();
  assert.equal(two.value(), "AB-1");
  const stale = two.open();
  let sel = two.$("bs-site");
  sel.value = B; sel.fire("change");
  assert.equal(two.row(), null, "gone at once, before the new site is read");
  assert.equal(two.$("bs-dlg-root"), null, "and its dialog is closed");
  await settle();
  assert.equal(two.row(), null);
  assert.deepEqual(two.labels(), ["Business name", "Site name", "Business address", "Site type"], "the other site has its Site type row");
  const mark = two.calls.length;
  stale.fire("submit");
  await settle();
  assert.equal(two.calls.length, mark, "a dialog opened for the first site sends nothing");
  sel = two.$("bs-site");
  sel.value = A; sel.fire("change");
  await settle();
  assert.equal(two.value(), "AB-1");
  assert.deepEqual(two.sante(), [`GET /sites/${A}/sante/settings/`, `GET /sites/${A}/sante/settings/`], "never a request for the other site");
});

test("the Edit dialog: approved words, one field, and one PATCH that is trimmed and keeps its case", async () => {
  const d = boot({ sponsor: "OLD-1" });
  await d.show();
  const form = d.open();
  assert.equal(d.$("bs-dlg-h").textContent, "Edit Santé username");
  assert.equal(form.children[0].textContent, "For Nena's Barley Shop. New members who register through this site are registered under this Santé username.");
  const inputs = form.all((n) => n.tagName === "INPUT");
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].value, "OLD-1");
  assert.equal(form.all((n) => n.tagName === "LABEL")[0].textContent, "Santé Username");
  assert.equal(d.$("bs-f-sponsor_id-help").textContent, "Letters, digits and hyphens only, up to 32 characters. Leave it blank to remove it.");
  assert.equal(d.doc.activeElement, inputs[0], "focus starts in the field");
  assert.deepEqual(form.all((n) => n.tagName === "BUTTON").map((b) => b.textContent), ["Save", "Cancel"]);
  const before = d.calls.length;
  await d.save("  Sample-0012345  ");
  assert.deepEqual(d.list().slice(before), [`PATCH /sites/${A}/sante/settings/`], "one request, and the page is not read again");
  assert.deepEqual(d.patches()[0].body, { sponsor_id: "Sample-0012345" });
  assert.equal(d.$("bs-dlg-root"), null, "the dialog closes");
  assert.equal(d.value(), "Sample-0012345");
  assert.deepEqual(d.toasts, ["Saved"]);
  assert.equal(d.$("bs-live").textContent, "Saved.");
  assert.equal(d.doc.activeElement, d.$("st-edit"), "focus returns to Edit");
  assert.equal(d.root.all((n) => n.id === "st-row").length, 1, "the row replaced itself");
  assert.deepEqual(d.labels(), ["Business name", "Site name", "Business address", "Santé Username"], "and is still the last row of Business identity");
});

test("blank is allowed and removes the ID; the page adds no rule of its own", async () => {
  const d = boot({ sponsor: "OLD-1" });
  await d.show();
  d.open();
  await d.save("   ");
  assert.deepEqual(d.patches()[0].body, { sponsor_id: "" });
  assert.equal(d.has(d.row(), "bs-none")[0].textContent, "Not added");
  assert.equal(d.has(d.row(), "chip").length, 0);
  assert.equal(d.has(d.row(), "bs-row-help").length, 1, "the help line is back");
  assert.deepEqual(d.toasts, ["Saved"]);
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
  assert.equal(d.value(), "OLD-1");
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
  assert.equal(d.value(), "AB-1", "the row shows what the server saved");
});

test("a 404: on the read there is no Santé Username row and the Site type row is back; on a save Business Settings reads again and says what it finds", async () => {
  /* The Santé settings surface switched off (or not answering for this site): one request, no second try. */
  const off = boot({ routes: (method, p) => (SANTE_PATH.test(p) ? NOT_FOUND : null) });
  await off.show();
  assert.deepEqual(off.list(), ["GET /sites/", `GET /sites/${A}/business-profile/`, `GET /sites/${A}/sante/settings/`]);
  assert.equal(off.row(), null);
  assert.equal(off.$("st-edit"), null);
  assert.deepEqual(off.cards().map((c) => c.getAttribute("aria-labelledby")), ["bs-h-ready", "bs-h-id", "bs-h-contact", "bs-h-web", "bs-h-legal", "bs-h-del"]);
  assert.deepEqual(off.labels(), ["Business name", "Site name", "Business address", "Site type"]);
  assert.equal(off.has(off.$("bs-row-type"), "acct-set-value")[0].textContent, "SantéSet at setup");
  assert.equal(off.has(off.$("bs-row-type"), "bs-row-help")[0].textContent, "Chosen when the site was created. It cannot be changed here.");
  assert.ok(!/sponsor|username/i.test(off.root.textContent));
  assert.equal(off.$("bs-notice"), null);
  assert.ok(!off.root.textContent.includes("not available."), "a 404 here says nothing about the site");

  /* The site removed while the dialog was open: the dialog closes and Business Settings' own read handles it. */
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
  assert.deepEqual(d.list().slice(mark), [`PATCH /sites/${A}/sante/settings/`, "GET /sites/", `GET /sites/${B}/business-profile/`, `GET /sites/${B}/sante/settings/`]);
  assert.ok(d.page.textContent.includes(SITE_B.display_name) && !d.page.textContent.includes(SITE_A.display_name));
  assert.ok(d.row(), "the remaining Santé site has its own row");
  assert.deepEqual(d.toasts, []);
});

test("the row's own states: its place is held while it reads, and a failed read keeps Business Settings usable with Try again in the row", async () => {
  let release;
  const held = new Promise((r) => { release = r; });
  const slow = boot({ routes: (method, p) => (SANTE_PATH.test(p) ? held.then(() => ({ status: 200, body: { sponsor_id: "AB-1", registration_ready: true, catalog_owner: false } })) : null) });
  slow.window.NOBusiness.show();
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(slow.cards().length, 6, "Business Settings is drawn without waiting for the row");
  assert.deepEqual(slow.labels(), ["Business name", "Site name", "Business address", "Santé Username"], "the row is there from the first draw: Site type never shows first");
  assert.equal(slow.value(), "Loading…");
  assert.equal(slow.$("st-edit"), null);
  assert.equal(slow.$("bs-row-type"), null);
  const waiting = slow.row();
  release(); await settle();
  assert.equal(slow.value(), "AB-1");
  assert.equal(waiting.parentNode, null, "the waiting row was replaced");
  assert.equal(slow.root.all((n) => n.id === "st-row").length, 1);

  for (const routes of [(m, p) => (SANTE_PATH.test(p) ? { status: 500, body: {} } : null),
    (m, p) => (SANTE_PATH.test(p) ? Promise.reject(new Error("offline")) : null),
    (m, p) => (SANTE_PATH.test(p) ? { status: 403, body: { error: { code: "billing_only", message: "No." } } } : null)]) {
    let fail = true;
    const failed = boot({ sponsor: "AB-1", routes: (m, p) => (fail ? routes(m, p) : null) });
    await failed.show();
    assert.equal(failed.cards().length, 6, "no separate card");
    assert.deepEqual(failed.labels(), ["Business name", "Site name", "Business address", "Santé Username"]);
    const row = failed.row();
    assert.deepEqual(row.children.map((n) => n.attrs["class"]), ["acct-set-label", "acct-set-value", "acct-set-action"]);
    assert.equal(failed.value(), "We could not load the Santé username.");
    assert.equal(failed.has(row, "acct-set-value")[0].children[0].getAttribute("role"), "alert");
    assert.equal(failed.has(row, "err-box").length, 0);
    const again = failed.$("st-retry");
    assert.equal(again.textContent, "Try again");
    assert.equal(again.parentNode.parentNode, row, "Try again is inside the row");
    assert.equal(failed.$("st-edit"), null);
    assert.ok(failed.$("bs-edit-name") && failed.$("bs-edit-address"), "the rest of the card is there");
    fail = false;
    const before = failed.calls.length;
    again.fire("click");
    await settle();
    assert.deepEqual(failed.list().slice(before), [`GET /sites/${A}/sante/settings/`], "Try again reads the row only");
    assert.equal(failed.value(), "AB-1");
    assert.equal(failed.root.all((n) => n.id === "st-row").length, 1);
    assert.equal(failed.$("st-retry"), null);
  }
});

test("a Business Settings save redraws the page and keeps the row without reading it again", async () => {
  const d = boot({ sponsor: "AB-1" });
  await d.show();
  d.$("bs-edit-name").fire("click");
  d.$("bs-f-business_name").value = "Nena's New Name";
  d.form().fire("submit");
  await settle();
  assert.deepEqual(d.sante(), [`GET /sites/${A}/sante/settings/`]);
  assert.equal(d.cards().length, 6);
  assert.deepEqual(d.labels(), ["Business name", "Site name", "Business address", "Santé Username"]);
  assert.equal(d.value(), "AB-1");
  assert.ok(d.root.textContent.includes("Nena's New Name"));
  d.open();
  await d.save("AB-2");
  assert.equal(d.value(), "AB-2", "and the row still saves");
});

test("leaving the page closes the dialog, and an answer that arrives afterwards is not drawn", async () => {
  let release;
  const held = new Promise((r) => { release = r; });
  let hold = false;
  const d = boot({ sponsor: "OLD-1", routes: (method, p) => (hold && SANTE_PATH.test(p) ? held.then(() => ({ status: 200, body: { sponsor_id: "LATE", registration_ready: true, catalog_owner: false } })) : null) });
  await d.show();
  const stale = d.open();
  d.G.hide();
  assert.equal(d.$("bs-dlg-root"), null);
  const mark = d.calls.length;
  stale.fire("submit");
  await settle();
  assert.equal(d.calls.length, mark, "a form from before sends nothing");
  hold = true;
  d.G.show();
  await settle();
  d.G.hide();
  release(); await settle();
  assert.ok(!d.page.textContent.includes("LATE"));

  /* A save still on its way when the page is left: its answer is not drawn and nothing is announced. */
  let free;
  const wait = new Promise((r) => { free = r; });
  const late = boot({ sponsor: "OLD-1", routes: (method) => (method === "PATCH" ? wait.then(() => null) : null) });
  await late.show();
  late.open();
  late.$("bs-f-sponsor_id").value = "NEW-1";
  late.form().fire("submit");
  late.G.hide();
  free(); await settle();
  assert.deepEqual(late.toasts, []);
  assert.ok(!late.page.textContent.includes("NEW-1"));
});

test("the row stores nothing in the browser and calls only its one /sites/ route", async () => {
  const d = boot();
  await d.show();
  d.open();
  await d.save("AB-1");
  assert.deepEqual(d.stored, []);
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(SRC));
  assert.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon|innerHTML/.test(SRC));
  const made = [...SRC.matchAll(/\bD\.(?:call|send)\(\s*"([A-Z]+)"\s*,\s*([^,]+),/g)].map((m) => m[1] + " " + m[2].trim());
  assert.deepEqual(made, ['GET "/sites/" + site.id + PATH', 'PATCH "/sites/" + siteId + PATH'], "the sites list is Business Settings' read, not this file's");
  for (const c of d.calls) assert.match(c.path, /^\/sites\/(site_[0-9a-z]{20}\/(sante\/settings\/|business-profile\/))?$/, c.method + " " + c.path);
  assert.deepEqual(Object.keys(d.patches()[0].body), ["sponsor_id"]);
});

test("Santé setup is no longer a page: no view, tab, tile, quick link or styles of its own, and the old address goes to Business Settings", () => {
  const dash = read("dashboard.js"), app = read("app.js");
  assert.ok(!HTML.includes("view-settings-sante") && !HTML.includes("h-settings-sante"));
  for (const id of ["st-site-line", "st-root", "st-live"]) assert.ok(!HTML.includes('id="' + id + '"'), id);
  assert.ok(!/href="\/settings\/sante\/"/.test(HTML), "no link to the old address");
  assert.ok(!HTML.includes("data-sante") && !HTML.includes("Santé setup"));
  assert.ok(!/sante/i.test(app), "app.js has no Santé quick link and no Santé switch");
  assert.ok(!/sante/i.test(CSS), "no style rule names the old page");
  assert.ok(!/st-card|st-h-sponsor|st-row/.test(CSS) && !SRC.includes("st-card") && !SRC.includes("dash-card"), "nothing left of the separate card");
  assert.ok(!dash.includes("settings-sante") && !dash.includes("NOSante"), "no view and no page hooks");
  assert.match(dash, /var VIEWS = \[[^\]]*"settings-general", "settings-plans"/);
  /* The old address: not a page of its own, rewritten to Business Settings before the route is looked up. */
  assert.ok(dash.includes('var MOVED = { "/settings/sante/": "/settings/business/" };'));
  assert.ok(dash.includes("if (has(MOVED, p)) p = MOVED[p];"));
  assert.ok(!/"\/settings\/sante\/":\s*\{/.test(dash), "it is not in ROUTES");
  const scripts = [...HTML.matchAll(/<script src="\/assets\/js\/([a-z-]+)\.js/g)].map((m) => m[1]);
  assert.ok(scripts.indexOf("sante") > scripts.indexOf("business"), "sante.js loads after business.js, whose dialog it uses");
  assert.deepEqual(Object.keys(boot().window.NOSante), ["mount", "reset"]);
});
