/* Business Settings (Phase 5, ClickUp z8uq9machb): the ten page checks of design section 9. The page is driven
   through a small stand-in document (dom.mjs) and a recorded fetch, so every request it makes can be read. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
const SRC = fs.readFileSync(path.join(JS, "business.js"), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa", B = "site_bbbbbbbbbbbbbbbbbbbb", FOREIGN = "site_zzzzzzzzzzzzzzzzzzzz";
const site = (id, name, sub) => ({ id, template: "sante", template_label: "Santé", display_name: name, subdomain: sub,
  host: sub + ".negosyotest.com", business_name: name + " Trading", contact_email: "hello@" + sub + ".test",
  contact_mobile: "+639175550142", accent_color: "", instagram_url: "https://www.instagram.com/" + sub, tiktok_url: "",
  created_at: "2026-11-01T00:00:00Z" });
const SITE_A = site(A, "Nena's Barley Shop", "nenabarley"), SITE_B = site(B, "Nena's Wellness Marikina", "nenamarikina");
const profile = (name) => ({ business_name: name, registered_name: name + " Inc.", tin: "123-456-789", dti_business_number: "5237841",
  bir_rsn: "", business_address: "128 Mabini Street, Marikina", complaints_contact_name: "", privacy_contact_email: "privacy@nena.test",
  shipping_processing_time: "1-2 business days", shipping_metro_manila_estimate: "1-2 business days",
  shipping_luzon_estimate: "2-5 business days", shipping_visayas_estimate: "5-7 business days",
  shipping_mindanao_estimate: "5-7 business days", shipping_other_areas_estimate: "", shipping_estimates_confirmed: false,
  updated_at: "2026-11-01T00:00:00Z" });
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };
const DIALOGS = [
  ["bs-edit-name", "business-profile/", ["business_name"]],
  ["bs-edit-site", "", ["display_name"]],
  ["bs-edit-contact", "", ["contact_email", "contact_mobile"]],
  ["bs-edit-address", "business-profile/", ["business_address"]],
  ["bs-edit-social", "", ["instagram_url", "tiktok_url"]],
  ["bs-edit-legal", "business-profile/", ["registered_name", "dti_business_number", "bir_rsn", "tin", "privacy_contact_email", "complaints_contact_name"]],
  ["bs-edit-delivery", "business-profile/", ["shipping_processing_time", "shipping_metro_manila_estimate", "shipping_luzon_estimate",
    "shipping_visayas_estimate", "shipping_mindanao_estimate", "shipping_other_areas_estimate", "shipping_estimates_confirmed"]],
];

/* A dashboard with the Business Settings view in it. `routes` answers each request: (method, path, body) => {status, body}
   or a promise of one; the default serves `sites` and a profile for each. */
function boot({ search = "", sites = [SITE_A], routes } = {}) {
  const doc = makeDocument(), calls = [], stored = [], toasts = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const [tag, id] of [["h1", "h-settings-general"], ["p", "bs-site-line"], ["div", "bs-pick"], ["div", "bs-root"], ["div", "bs-live"]]) {
    const n = doc.createElement(tag); n.setAttribute("id", id); page.appendChild(n);
  }
  const state = { sites: sites.map((s) => ({ ...s })), profiles: {} };
  for (const s of state.sites) state.profiles[s.id] = profile(s.business_name);
  const fallback = (method, p, body) => {
    const m = /^\/sites\/(site_[0-9a-z]{20})\/(business-profile\/)?$/.exec(p), at = m ? state.sites.findIndex((s) => s.id === m[1]) : -1;
    if (method === "GET" && p === "/sites/") return { status: 200, body: { items: state.sites, next_cursor: null } };
    if (!m || at < 0) return { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    if (m[2]) { if (method === "PATCH") Object.assign(state.profiles[m[1]], body); return { status: 200, body: state.profiles[m[1]] }; }
    if (method === "PATCH") Object.assign(state.sites[at], body);
    return { status: 200, body: state.sites[at] };
  };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    const answer = (routes && routes(opts.method, p, body, state)) || fallback(opts.method, p, body);
    return Promise.resolve(answer).then((a) => ({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) }));
  };
  const storage = (name) => ({ getItem: () => null, removeItem() {}, setItem(k) { stored.push(name + ":" + k); } });
  const digits = (raw) => String(raw || "").replace(/\D/g, "").replace(/^63(?=9)/, "").replace(/^0/, "").slice(0, 10);
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {},
    NOContact: { phoneValue: (raw) => (digits(raw) ? "+63" + digits(raw) : ""), phoneShown: digits,
      group(kind, input, id) { const g = doc.createElement("div"); g.setAttribute("class", "ct-group"); g.setAttribute("id", id + "-group"); g.appendChild(input); return { group: g, hint: null }; } } };
  const location = { search, pathname: "/settings/business/", replace() {}, assign() {} };
  const history = { replaceState(a, b, url) { location.search = url.slice(url.indexOf("?")); } };
  const context = vm.createContext({ window, document: doc, location, history, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl,
    localStorage: storage("local"), sessionStorage: storage("session"), requestAnimationFrame() {}, fetch });
  for (const f of ["app.js", "business.js"]) vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), context, { filename: f });
  window.NODash.toast = (title) => toasts.push(title);
  const $ = (id) => doc.getElementById(id);
  const patches = () => calls.filter((c) => c.method === "PATCH");
  const form = () => $("bs-dlg-body").all((n) => n.tagName === "FORM")[0];
  return { doc, window, calls, stored, toasts, state, location, $, patches, form, page, root: $("bs-root"), B: window.NOBusiness,
    async show() { window.NOBusiness.show(); await settle(); },
    open(id) { $(id).fire("click"); return form(); },
    async save() { form().fire("submit"); await settle(); },
    rows() { return $("bs-root").all((n) => n.classList.contains("acct-set-row")); } };
}
const tagOf = (row) => row.all((n) => n.classList.contains("bs-tag")).map((n) => n.textContent);
const labelOf = (row) => row.all((n) => n.classList.contains("acct-set-label"))[0].children[0].textContent;

test("1. a ?site= that is not one of my sites is ignored: every request goes to my first site", async () => {
  const d = boot({ search: "?site=" + FOREIGN });
  await d.show();
  d.open("bs-edit-name");
  await d.save();
  assert.deepEqual(d.calls.map((c) => c.method + " " + c.path), ["GET /sites/", `GET /sites/${A}/business-profile/`, `PATCH /sites/${A}/business-profile/`]);
  assert.ok(!JSON.stringify(d.calls).includes(FOREIGN), "the foreign id appears in no request");
});

test("2. choosing the second site reads the second only; a late answer for the first is not drawn; the first's dialog closes", async () => {
  let release;
  const held = new Promise((r) => { release = r; });
  let hold = false;
  const d = boot({ sites: [SITE_A, SITE_B], routes: (method, p, body, state) =>
    (hold && method === "GET" && p === `/sites/${A}/business-profile/` ? held.then(() => ({ status: 200, body: state.profiles[A] })) : null) });
  await d.show();
  assert.ok(d.$("bs-site"), "with two sites the labelled select is shown");
  assert.equal(d.$("bs-pick").hidden, false);
  d.open("bs-edit-name");
  assert.ok(d.$("bs-dlg-root"));
  const before = d.calls.length, sel = d.$("bs-site");
  sel.value = B; sel.fire("change");
  assert.equal(d.$("bs-dlg-root"), null, "the dialog for the first site is closed at once");
  await settle();
  assert.deepEqual(d.calls.slice(before).map((c) => c.method + " " + c.path), ["GET /sites/", `GET /sites/${B}/business-profile/`]);
  assert.equal(d.location.search, "?site=" + B);
  assert.ok(d.$("bs-site-line").textContent.includes(SITE_B.display_name));

  hold = true;                        /* now a read for the first site that answers late */
  d.location.search = "?site=" + A; d.B.show(); await settle();
  d.location.search = "?site=" + B; d.B.show(); await settle();
  release(); await settle();
  assert.ok(d.$("bs-site-line").textContent.includes(SITE_B.display_name));
  assert.ok(!d.page.textContent.includes(SITE_A.business_name), "nothing of the first site is drawn by its late answer");
});

test("3. a dialog opened for site A cannot save once the selection moved to B", async () => {
  const d = boot({ sites: [SITE_A, SITE_B] });
  await d.show();
  const stale = d.open("bs-edit-contact"), sel = d.$("bs-site");
  sel.value = B; sel.fire("change");
  await settle();
  assert.equal(d.$("bs-dlg-save"), null, "Save is no longer on the page");
  const mark = d.calls.length;
  stale.fire("submit");
  await settle();
  assert.equal(d.calls.length, mark, "the stale form sends nothing");
  d.open("bs-edit-contact");
  await d.save();
  assert.ok(!JSON.stringify(d.calls.slice(mark)).includes(A), "no request carries A's id afterwards");
  assert.equal(d.patches().pop().path, `/sites/${B}/`);
});

test("4. each dialog sends exactly one request, to its one endpoint, with its keys", async () => {
  for (const [button, endpoint, keys] of DIALOGS) {
    const d = boot();
    await d.show();
    d.open(button);
    await d.save();
    assert.equal(d.patches().length, 1, button);
    assert.equal(d.patches()[0].path, `/sites/${A}/${endpoint}`, button);
    assert.deepEqual(Object.keys(d.patches()[0].body).sort(), [...keys].sort(), button);
    assert.equal(d.$("bs-dlg-root"), null, button + ": the dialog closes after a save");
    assert.deepEqual(d.toasts, ["Saved"]);
    assert.equal(d.$("bs-live").textContent, "Saved.");
    assert.equal(d.doc.activeElement, d.$(button), "focus returns to the Edit button");
  }
});

test("4b. a saved value is the one the server returned, and a required field emptied is caught before sending", async () => {
  const d = boot();
  await d.show();
  d.open("bs-edit-site");
  d.$("bs-f-display_name").value = "  Nena's New Shop  ";
  await d.save();
  assert.deepEqual(d.patches()[0].body, { display_name: "Nena's New Shop" });
  assert.ok(d.$("bs-site-line").textContent.includes("Nena's New Shop"));
  for (const [button, key, message] of [["bs-edit-name", "business_name", "Enter your business name."], ["bs-edit-site", "display_name", "Enter a site name."],
    ["bs-edit-contact", "contact_email", "Enter your store email."], ["bs-edit-contact", "contact_mobile", "Enter your store mobile."]]) {
    const sent = d.patches().length;
    d.open(button);
    d.$("bs-f-" + key).value = "   ";
    await d.save();
    assert.equal(d.patches().length, sent, key + ": nothing is sent");
    assert.equal(d.$("bs-f-" + key + "-err").textContent, message);
    assert.ok(d.$("bs-dlg-root"), "the dialog stays open");
    d.doc.fire("keydown", { key: "Escape" });
    assert.equal(d.$("bs-dlg-root"), null, "Escape closes without saving");
  }
});

test("5. a 404 on save closes the dialog, says the site is not available and reads the list again", async () => {
  let removed = false;
  const d = boot({ sites: [SITE_A, SITE_B], routes: (method, p, body, state) => {
    if (method !== "PATCH") return null;
    removed = true; state.sites = state.sites.filter((s) => s.id !== A);
    return { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
  } });
  await d.show();
  d.open("bs-edit-address");
  const mark = d.calls.length;
  await d.save();
  assert.ok(removed);
  assert.equal(d.$("bs-dlg-root"), null);
  assert.deepEqual(d.calls.slice(mark).map((c) => c.method + " " + c.path), [`PATCH /sites/${A}/business-profile/`, "GET /sites/", `GET /sites/${B}/business-profile/`]);
  assert.equal(d.$("bs-notice").textContent, "This site is not available.");
  assert.equal(d.$("bs-live").textContent, "This site is not available.");
  const text = d.page.textContent;
  assert.ok(text.includes(SITE_B.display_name));
  assert.ok(!text.includes(SITE_A.display_name) && !text.includes(SITE_A.business_name) && !text.includes(SITE_A.host), "nothing from the old site stays on screen");
});

test("6. the page stores nothing in the browser", async () => {
  const d = boot();
  await d.show();
  for (const [button] of DIALOGS) { d.open(button); await d.save(); }
  assert.deepEqual(d.stored, []);
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(SRC));
});

test("7. the site line and every dialog name the site from the API, never a fixed name", async () => {
  const d = boot({ sites: [{ ...SITE_A, display_name: "Tindahan ni Aling Nena" }] });
  await d.show();
  assert.ok(d.$("bs-site-line").textContent.includes("Tindahan ni Aling Nena"));
  assert.ok(d.$("bs-site-line").textContent.includes("nenabarley.negosyotest.com"));
  assert.ok(d.$("bs-site-line").textContent.includes("Santé"));
  for (const [button] of DIALOGS) {
    const lead = d.open(button).children[0].textContent;
    assert.ok(lead.startsWith("For Tindahan ni Aling Nena. "), button + ": " + lead);
    d.doc.fire("keydown", { key: "Escape" });
  }
  assert.ok(!d.doc.body.textContent.includes("My Business"));
  assert.ok(!SRC.includes("My Business"));
});

test("8. every row carries a Public or Private tag; TIN, Site type and the Shipping Policy switch are the Private ones", async () => {
  const d = boot();
  await d.show();
  const rows = d.rows();
  assert.equal(rows.length, 23);
  for (const r of rows) {
    assert.equal(tagOf(r).length, 1, labelOf(r));
    assert.ok(["Public", "Private"].includes(tagOf(r)[0]), labelOf(r));
  }
  assert.deepEqual(rows.filter((r) => tagOf(r)[0] === "Private").map(labelOf).sort(), ["Shipping Policy", "Site type", "TIN"]);
});

test("9. a field error is read from a list as well as from a string, and is shown under its field", async () => {
  const U = boot().B.util;
  assert.equal(U.fieldMessage(["Enter a valid Philippine mobile number.", "second"]), "Enter a valid Philippine mobile number.");
  assert.equal(U.fieldMessage("Enter a valid email address."), "Enter a valid email address.");
  assert.equal(U.fieldMessage([]), "");
  assert.equal(U.fieldMessage(undefined), "");
  const d = boot({ routes: (method) => (method === "PATCH" ? { status: 400, body: { error: { code: "invalid_request", message: "Some values are missing or invalid.",
    fields: { contact_mobile: ["Enter a valid Philippine mobile number."] } } } } : null) });
  await d.show();
  d.open("bs-edit-contact");
  d.$("bs-f-contact_mobile").value = "917 555 01";
  await d.save();
  assert.ok(d.$("bs-dlg-root"), "the dialog stays open");
  assert.equal(d.$("bs-f-contact_mobile-err").textContent, "Enter a valid Philippine mobile number.");
  assert.equal(d.$("bs-f-contact_mobile-err").hidden, false);
  assert.equal(d.$("bs-f-contact_email-err").hidden, true);
  assert.equal(d.$("bs-f-contact_mobile").getAttribute("aria-invalid"), "true");
  assert.equal(d.doc.activeElement, d.$("bs-f-contact_mobile"), "focus is on the refused field");
  assert.equal(d.$("bs-f-contact_mobile").value, "917 555 01", "the typed value stays");
  assert.equal(d.$("bs-dlg-save").disabled, false);
  assert.ok(d.root.textContent.includes("+63 917 555 0142"), "the row is unchanged");
});

test("9b. no connection: the dialog says so and keeps what was typed", async () => {
  const d = boot({ routes: (method) => (method === "PATCH" ? Promise.reject(new Error("offline")) : null) });
  await d.show();
  d.open("bs-edit-name");
  d.$("bs-f-business_name").value = "Typed Name";
  await d.save();
  assert.equal(d.$("bs-dlg-err").textContent, "We couldn’t save. Check your connection and try again.");
  assert.equal(d.$("bs-dlg-err").hidden, false);
  assert.equal(d.$("bs-f-business_name").value, "Typed Name");
});

test("10. the page has no colour input and never sends an accent colour", async () => {
  const d = boot();
  await d.show();
  const inputs = [];
  for (const [button] of DIALOGS) { inputs.push(...d.open(button).all((n) => n.tagName === "INPUT")); await d.save(); }
  assert.equal(inputs.length, 20);
  assert.ok(inputs.every((i) => i.getAttribute("type") !== "color" && !/colou?r|logo/i.test(i.getAttribute("name"))));
  assert.ok(!JSON.stringify(d.calls).includes("accent_color"));
  assert.ok(!/accent_color|type="color"|"color"/.test(SRC));
});

test("page states: no site yet, a failed load, and the readiness list", async () => {
  const none = boot({ sites: [] });
  await none.show();
  assert.ok(none.root.textContent.includes("Create your site first"));
  assert.equal(none.$("bs-site-line").hidden, true);
  const failed = boot({ routes: () => ({ status: 500, body: {} }) });
  await failed.show();
  assert.ok(failed.root.textContent.includes("We could not load this site’s settings"));
  assert.ok(failed.root.textContent.includes("Nothing was changed."));
  const U = boot().B.util, r = U.readiness(SITE_A, profile("Nena"));
  assert.deepEqual(JSON.parse(JSON.stringify(r.items.map((i) => [i.label, i.done, i.text]))), [["Business name", true, "Done"], ["Site name", true, "Done"],
    ["Store email and mobile", true, "Done"], ["Business address", true, "Done"], ["Legal page details", false, "2 blank"], ["Shipping Policy", false, "Not reviewed"]]);
  assert.equal(r.left, 2);
  assert.equal(U.mobileShown("+639175550142"), "+63 917 555 0142");
});

test("the old address still opens the page, and every Business Settings link uses the new one", () => {
  const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
  const dash = read("dashboard.js"), html = fs.readFileSync(path.join(JS, "..", "..", "index.html"), "utf8");
  assert.ok(dash.includes('"/settings/business/": { view: "settings-general", title: "Business Settings | NegosyoOnline" }'));
  assert.ok(dash.includes('"/settings/general/": { view: "settings-general", title: "Business Settings | NegosyoOnline" }'));
  assert.ok(read("account.js").includes('var BUSINESS_SETTINGS_PATH = "/settings/business/";'));
  assert.ok(read("app.js").includes('["Business Settings", "Settings", "/settings/business/"]'));
  assert.ok(html.includes('<a href="/settings/business/" data-route="settings-general">Business Settings</a>'));
  assert.ok(!html.includes("/settings/general/"));
});

/* Coach Ed's layout rulings of 2026-11-11, after the local review. */
test("layout: no scope card, the tag legend is one plain line, readiness has the gold edge, the address sits in Business identity", async () => {
  const d = boot();
  await d.show();
  assert.equal(d.root.all((n) => n.classList.contains("acct-scope")).length, 0);
  assert.ok(!d.root.textContent.includes("These settings apply to this site only"));
  assert.ok(!d.root.textContent.includes("Account Settings"));
  const legend = d.root.all((n) => n.classList.contains("bs-legend"));
  assert.equal(legend.length, 1);
  assert.equal(legend[0].tagName, "P");
  assert.ok(!legend[0].classList.contains("dash-card"));
  assert.equal(legend[0].textContent, "PublicCustomers can see this on your site.PrivateOnly you and NegosyoOnline see this.");
  assert.equal(d.root.children[0].children[0], legend[0]);
  const cardOf = (id) => d.root.all((n) => n.getAttribute("aria-labelledby") === id)[0];
  assert.ok(cardOf("bs-h-ready").classList.contains("bs-ready-card"));
  assert.ok(!cardOf("bs-h-id").classList.contains("bs-ready-card"));
  const labels = (id) => d.rows().filter((r) => { let n = r; while (n && n !== cardOf(id)) n = n.parentNode; return !!n; }).map(labelOf);
  assert.deepEqual(labels("bs-h-id"), ["Business name", "Site name", "Business address", "Site type"]);
  assert.deepEqual(labels("bs-h-contact"), ["Store email", "Store mobile", "Instagram", "TikTok"]);
  assert.ok(d.$("bs-edit-address"));
});

test("the BIR number is labelled Official Control Number (OCN) on the row and in the dialog", async () => {
  const d = boot();
  await d.show();
  assert.ok(d.rows().map(labelOf).includes("BIR Official Control Number (OCN)"));
  const dialog = d.open("bs-edit-legal").textContent;
  assert.ok(dialog.includes("BIR Official Control Number (OCN)"));
  assert.ok(!d.doc.body.textContent.includes("registration serial") && !SRC.includes("registration serial"));
  assert.ok(dialog.includes("Complaints contact or office"));
});
