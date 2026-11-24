/* The Contacts page (ClickUp z8uq9mj9rw, /contacts/, contacts.js). Driven like sms-gateway-settings.test.mjs: the real scripts run in a vm
   with the small stand-in document from dom.mjs and a recorded fetch that plays the owner contacts API (agreed shape, HQ z8uq9mj9q4).
   Fake data only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const JS = path.join(ROOT, "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "assets", "css", "contacts.css"), "utf8");
const SITE = "site_aaaaaaaaaaaaaaaaaaaa";
const BASE = `/sites/${SITE}/contacts/`;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 12; i++) await tick(); };
const J = (v) => JSON.parse(JSON.stringify(v));
const err = (status, code, message, fields) => ({ status, body: { error: { code, message, fields: fields || {} } } });
const row = (id, first, last, masked, groups = [], opted = false) => ({ id, first_name: first, last_name: last, mobile_masked: masked, groups, opted_out: opted });
const GROUPS = [{ id: "g1", name: "Regulars", count: 2 }, { id: "g2", name: "VIP", count: 0 }];
const ROWS = [
  row("c1", "Ana", "Reyes", "0917 *** 1234", [{ id: "g1", name: "Regulars" }]),
  row("c2", "", "", "0918 *** 5678", [], true),
  row("c3", "<img src=x onerror=alert(1)>", "Cruz", "0920 *** 9999", [{ id: "g2", name: "<b>VIP</b>" }]),
];

function boot({ off = null, contacts = true, rows = ROWS, groups = GROUPS, status = { contacts: true, count: 3, max: 20000 }, sites = true } = {}) {
  const doc = makeDocument(), calls = [], live = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; return n; };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["ct-root", "ct-live", "ct-dialog-slot"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const nav = [0, 1].map(() => { const a = doc.createElement("a"); a.setAttribute("data-contacts-nav", ""); a.hidden = true; page.appendChild(a); return a; });
  doc.querySelectorAll = (sel) => (sel === "[data-contacts-nav]" ? nav : []);
  const s = { off, rows, groups, status: contacts ? status : { contacts: false, count: 0, max: 20000 }, next: null, detail: null, check: null, save: null, post: null, patch: null, del: null, gpost: null };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", "");
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    let a = err(404, "not_found", "Not found.");
    const [pathOnly, qs] = p.split("?");
    const m = opts.method;
    if (m === "GET" && pathOnly === "/sites/") a = sites ? { status: 200, body: { items: [{ id: SITE, template: "sante" }], next_cursor: null } } : { status: 200, body: { items: [] } };
    else if (s.off && pathOnly.startsWith(BASE)) a = s.off;
    else if (m === "GET" && pathOnly === BASE + "status/") a = { status: 200, body: s.status };
    else if (m === "GET" && pathOnly === BASE + "groups/") a = { status: 200, body: s.groups };
    else if (m === "POST" && pathOnly === BASE + "groups/") a = s.gpost || { status: 201, body: { id: "g3", name: body.name, count: 0 } };
    else if (m === "PATCH" && pathOnly.startsWith(BASE + "groups/")) a = { status: 200, body: { id: "g1", name: body.name, count: 2 } };
    else if (m === "DELETE" && pathOnly.startsWith(BASE + "groups/")) a = { status: 204, body: undefined };
    else if (m === "GET" && pathOnly === BASE && s.listErr) a = s.listErr;
    else if (m === "GET" && pathOnly === BASE) a = { status: 200, body: { results: s.rows, count: s.rows.length, next: s.next } };
    else if (m === "POST" && pathOnly === BASE) a = s.post || { status: 201, body: { id: "c9" } };
    else if (m === "POST" && pathOnly === BASE + "upload/check/") a = s.check || { status: 200, body: { new: 2, already: 1, refused: [{ line: 4, reason: "Not a Philippine mobile <b>x</b>" }] } };
    else if (m === "POST" && pathOnly === BASE + "upload/save/") a = s.save || { status: 200, body: { added: 2 } };
    else if (m === "GET" && pathOnly.startsWith(BASE)) a = { status: 200, body: s.detail || { ...ROWS[0], mobile: "09171234567" } };
    else if (m === "PATCH" && pathOnly.startsWith(BASE)) a = s.patch || { status: 200, body: { id: "c1" } };
    else if (m === "DELETE" && pathOnly.startsWith(BASE)) a = s.del || { status: 204, body: undefined };
    void qs;
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => (a.body === undefined ? Promise.reject(new Error("none")) : Promise.resolve(a.body)) });
  };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const location = { search: "", pathname: "/contacts/", replace() {}, assign() {} };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const context = vm.createContext({ window, document: doc, location, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, Uint8Array, Date,
    FormData, localStorage: storage, sessionStorage: storage, navigator: {}, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("contacts.js"), context, { filename: "contacts.js" });
  const $ = (id) => doc.getElementById(id);
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label) => buttons(n).find((b) => b.textContent === label);
  void live;
  return { doc, calls, s, $, nav, window, buttons, press,
    list: () => calls.map((c) => c.method + " " + c.path),
    root: () => $("ct-root"), slot: () => $("ct-dialog-slot"),
    async open() { window.NOContacts.show(); await settle(); },
    async click(node) { node.fire("click"); await settle(); },
    input(node, value) { node.value = value; node.fire("input"); } };
}

test("pure helpers: names, query rule, list path, body shapes", () => {
  const u = boot().window.NOContacts.util;
  assert.equal(u.nameOf({ first_name: " Ana ", last_name: "Reyes" }), "Ana Reyes");
  assert.equal(u.nameOf({ first_name: "", last_name: "" }), "No name");
  assert.equal(u.nameOf(null), "No name");
  assert.deepEqual({ ...u.queryMode("") }, { mode: "all", q: "" });
  assert.equal(u.queryMode("a").mode, "short");
  assert.equal(u.queryMode(" ab ").mode, "search");
  assert.equal(u.queryMode(" ab ").q, "ab");
  assert.equal(u.listPath("s", {}), "/sites/s/contacts/");
  assert.equal(u.listPath("s", { group: "g1", q: "an a", cursor: "c=2" }), "/sites/s/contacts/?group=g1&q=an%20a&cursor=c%3D2");
  assert.deepEqual(J(u.contactBody({ first: " A ", last: "", mobile: " 0917 ", groups: ["g1"] })), { first_name: "A", last_name: "", mobile: "0917", groups: ["g1"] });
  assert.equal(u.contactError({ mobile: "  " }), "Enter a mobile number.");
  assert.equal(u.contactError({ mobile: "0917" }), "");
  assert.equal(u.contactError({ requireFirst: true, first: " ", mobile: "0917" }), "Enter a first name");
  assert.equal(u.contactError({ requireFirst: true, first: "A", mobile: "" }), "Enter a mobile number.");
  assert.equal(u.contactError({ requireFirst: false, first: "", mobile: "0917" }), "", "a no-name contact may stay without a name");
  assert.equal(u.groupNameError(""), "Enter a group name.");
  assert.equal(u.groupNameError("x".repeat(61)), "Use 60 characters or fewer.");
  assert.equal(u.fileError({ size: 1048577 }), "The file is over 1 MB.");
  assert.equal(u.fileError({ size: 10 }), "");
  assert.deepEqual(J(u.uploadBody("t", "g1", 2)), { text: "t", group: "g1", expected_new: 2 });
  assert.deepEqual(J(u.uploadBody("t", "", undefined)), { text: "t" });
  assert.deepEqual(J(u.checkSummary({ new: 2, already: 1, refused: [{ line: 1, reason: "x" }, null] })), { news: 2, already: 1, refused: [{ line: 1, reason: "x" }] });
  assert.equal(u.fieldMessage({ data: { fields: { mobile: "Bad." } } }, "mobile"), "Bad.");
  assert.equal(u.countText(1), "1 contact");
  assert.equal(u.countText(0), "0 contacts");
});

test("gating: the links show only for 200 with contacts true; 404, contacts false, errors and no site leave them hidden", async () => {
  let d = boot();
  d.window.NOContacts.probe(); await settle();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE + "status/"]);
  assert.ok(d.nav.every((n) => n.hidden === false));
  d = boot({ off: err(404, "not_found", "Not found.") });
  d.window.NOContacts.probe(); await settle();
  assert.ok(d.nav.every((n) => n.hidden === true), "404 means hidden");
  d = boot({ contacts: false });
  d.window.NOContacts.probe(); await settle();
  assert.ok(d.nav.every((n) => n.hidden === true), "contacts false means hidden");
  d = boot({ off: err(500, "server_error", "Oops.") });
  d.window.NOContacts.probe(); await settle();
  assert.ok(d.nav.every((n) => n.hidden === true));
  d = boot({ sites: false });
  d.window.NOContacts.probe(); await settle();
  assert.deepEqual(d.list(), ["GET /sites/"]);
  assert.ok(d.nav.every((n) => n.hidden === true));
});

test("the page on a 404 says nothing about the feature beyond not available, and hides the links", async () => {
  const d = boot({ off: err(404, "not_found", "Not found.") });
  await d.open();
  assert.ok(d.root().textContent.includes("Contacts are not available"));
  assert.ok(d.nav.every((n) => n.hidden === true));
});

test("the list: count, rows, masked mobile, No name, group chips, opted-out marker; all text escaped", async () => {
  const d = boot();
  await d.open();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE + "status/", "GET " + BASE + "groups/", "GET " + BASE]);
  const text = d.root().textContent;
  assert.ok(text.includes("3 of 20,000 contacts saved"));
  assert.ok(text.includes("3 contacts"));
  assert.ok(text.includes("Ana Reyes") && text.includes("0917 *** 1234") && text.includes("Regulars"));
  assert.ok(text.includes("No name") && text.includes("Opted out"));
  assert.ok(!text.includes("09171234567"), "no full mobile in the list");
  /* hostile text is text, never a node */
  assert.ok(text.includes("<img src=x onerror=alert(1)>") && text.includes("<b>VIP</b>"));
  assert.equal(d.root().all((n) => n.tagName === "IMG" || n.tagName === "B").length, 0);
  assert.equal(d.nav[0].hidden, false);
});

test("search: one character sends nothing; two or more sends q; the group filter sends group; Next and Previous follow the cursor", async () => {
  const d = boot();
  d.s.next = "CUR2";
  await d.open();
  const q = d.$("ct-q");
  const before = d.calls.length;
  d.input(q, "a"); await new Promise((r) => setTimeout(r, 420)); await settle();
  assert.equal(d.calls.length, before, "no request for one character");
  assert.ok(d.root().textContent.includes("Type at least 2 characters"));
  d.input(q, "an"); await new Promise((r) => setTimeout(r, 420)); await settle();
  assert.equal(d.calls[d.calls.length - 1].path, BASE + "?q=an");
  d.input(q, ""); await new Promise((r) => setTimeout(r, 420)); await settle();
  assert.equal(d.calls[d.calls.length - 1].path, BASE);
  /* the house dropdown: open, choose */
  const sel = d.$("ct-group");
  assert.deepEqual(sel.children.map((o) => o.textContent), ["All groups", "Regulars", "VIP"]);
  const input = d.root().all((n) => n.classList.contains("ct-combo-input"))[0];
  await d.click(input.parentNode);
  const opt = d.root().all((n) => n.classList.contains("ct-combo-opt")).find((n) => n.textContent === "Regulars");
  await d.click(opt);
  assert.equal(d.calls[d.calls.length - 1].path, BASE + "?group=g1");
  /* paging */
  const next = d.press(d.root(), "Next");
  assert.equal(next.disabled, false);
  await d.click(next);
  assert.equal(d.calls[d.calls.length - 1].path, BASE + "?group=g1&cursor=CUR2");
  d.s.next = null;
  await d.click(d.press(d.root(), "Previous"));
  assert.equal(d.calls[d.calls.length - 1].path, BASE + "?group=g1");
});

test("add a contact: mobile is required; the body carries names, mobile and group ids; the list reloads", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Add contact"));
  const dlg = d.slot();
  assert.ok(dlg.textContent.includes("Add contact") && dlg.textContent.includes("Regulars") && dlg.textContent.includes("VIP"));
  assert.ok(d.$("ct-first").getAttribute("aria-required") === "true" && dlg.textContent.includes("First name *"));
  assert.ok(!dlg.textContent.includes("Last name *"));
  await d.click(d.press(dlg, "Add contact"));
  assert.ok(dlg.textContent.includes("Enter a first name") && dlg.textContent.includes("Enter a mobile number."));
  d.$("ct-first").value = "Lito";
  assert.ok(!d.list().some((c) => c.startsWith("POST " + BASE)));
  d.$("ct-first").value = " Lito "; d.$("ct-mobile").value = " 0917 111 2222 ";
  dlg.all((n) => n.tagName === "INPUT" && n.getAttribute("type") === "checkbox")[1].checked = true;
  await d.click(d.press(dlg, "Add contact"));
  const post = d.calls.find((c) => c.method === "POST" && c.path === BASE);
  assert.deepEqual(post.body, { first_name: "Lito", last_name: "", mobile: "0917 111 2222", groups: ["g2"] });
  assert.equal(d.slot().children.length, 0, "dialog closed");
  assert.equal(d.list().filter((c) => c === "GET " + BASE).length, 2, "list read again");
});

test("add: the API's field errors and a duplicate number land on the field", async () => {
  const d = boot();
  d.s.post = err(400, "invalid_request", "Check it.", { mobile: ["Not a Philippine mobile number."] });
  await d.open();
  await d.click(d.press(d.root(), "Add contact"));
  d.$("ct-first").value = "Lito";
  d.$("ct-mobile").value = "123";
  await d.click(d.press(d.slot(), "Add contact"));
  assert.ok(d.slot().textContent.includes("Not a Philippine mobile number."));
  d.s.post = err(409, "already_exists", "Exists.", {});
  await d.click(d.press(d.slot(), "Add contact"));
  assert.ok(d.slot().textContent.includes("That number is already a contact."));
});

test("edit: the full mobile is read only when one contact is opened; save PATCHes; delete asks first", async () => {
  const d = boot();
  await d.open();
  assert.ok(!d.list().some((c) => c.startsWith("GET " + BASE + "c1")));
  await d.click(d.buttons(d.root()).find((b) => b.getAttribute("aria-label") === "Edit Ana Reyes"));
  assert.ok(d.list().includes("GET " + BASE + "c1/"));
  assert.equal(d.$("ct-mobile").value, "09171234567");
  assert.equal(d.$("ct-first").value, "Ana");
  const boxes = d.slot().all((n) => n.tagName === "INPUT" && n.getAttribute("type") === "checkbox");
  assert.deepEqual(boxes.map((b) => b.checked), [true, false], "her group is ticked");
  d.$("ct-last").value = "Santos";
  await d.click(d.press(d.slot(), "Save contact"));
  const patch = d.calls.find((c) => c.method === "PATCH");
  assert.equal(patch.path, BASE + "c1/");
  assert.deepEqual(patch.body, { last_name: "Santos" }, "only the changed field");
  /* delete needs a confirm */
  await d.click(d.buttons(d.root()).find((b) => b.getAttribute("aria-label") === "Edit Ana Reyes"));
  await d.click(d.press(d.slot(), "Delete contact"));
  assert.ok(d.slot().textContent.includes("This cannot be undone."));
  assert.ok(!d.calls.some((c) => c.method === "DELETE"), "nothing deleted yet");
  await d.click(d.press(d.slot(), "Cancel"));
  assert.ok(!d.calls.some((c) => c.method === "DELETE"));
  await d.click(d.buttons(d.root()).find((b) => b.getAttribute("aria-label") === "Edit Ana Reyes"));
  await d.click(d.press(d.slot(), "Delete contact"));
  await d.click(d.press(d.slot(), "Delete contact"));
  assert.deepEqual(d.calls.filter((c) => c.method === "DELETE").map((c) => c.path), [BASE + "c1/"]);
  assert.equal(d.slot().children.length, 0);
});

test("groups: each with its count; create, rename and delete (with a confirm)", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Groups"));
  let text = d.root().textContent;
  assert.ok(text.includes("Regulars") && text.includes("2 contacts") && text.includes("VIP") && text.includes("0 contacts"));
  assert.ok(text.includes("Deleting a group keeps its contacts."));
  /* create */
  d.$("ct-gname").value = "  New ones ";
  d.root().all((n) => n.tagName === "FORM")[0].fire("submit");
  await settle();
  assert.deepEqual(d.calls.find((c) => c.method === "POST" && c.path === BASE + "groups/").body, { name: "New ones" });
  /* empty name is refused without a request */
  const posts = d.calls.filter((c) => c.method === "POST").length;
  d.$("ct-gname").value = "  ";
  d.root().all((n) => n.tagName === "FORM")[0].fire("submit");
  await settle();
  assert.equal(d.calls.filter((c) => c.method === "POST").length, posts);
  assert.ok(d.root().textContent.includes("Enter a group name."));
  /* rename */
  await d.click(d.buttons(d.root()).find((b) => b.getAttribute("aria-label") === "Rename Regulars"));
  assert.equal(d.$("ct-rename").value, "Regulars");
  d.$("ct-rename").value = "Loyal";
  await d.click(d.press(d.slot(), "Save name"));
  const patch = d.calls.find((c) => c.method === "PATCH");
  assert.equal(patch.path, BASE + "groups/g1/"); assert.deepEqual(patch.body, { name: "Loyal" });
  /* delete */
  await d.click(d.buttons(d.root()).find((b) => b.getAttribute("aria-label") === "Delete VIP"));
  assert.ok(d.slot().textContent.includes("Its contacts stay in your contacts."));
  assert.ok(!d.calls.some((c) => c.method === "DELETE"));
  await d.click(d.press(d.slot(), "Delete group"));
  assert.deepEqual(d.calls.filter((c) => c.method === "DELETE").map((c) => c.path), [BASE + "groups/g2/"]);
});

test("CSV upload: check shows new, already and refused lines; save sends expected_new; a changed file asks for a new check", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Upload CSV"));
  await d.click(d.press(d.root(), "Check"));
  assert.ok(d.root().textContent.includes("Choose a file or paste some lines first."));
  assert.ok(!d.calls.some((c) => c.path.includes("upload")));
  d.$("ct-paste").value = "Maria,Santos,09171234567\n09180000000";
  await d.click(d.press(d.root(), "Check"));
  const chk = d.calls.find((c) => c.path === BASE + "upload/check/");
  assert.deepEqual(chk.body, { text: "Maria,Santos,09171234567\n09180000000" });
  const t = d.root().textContent;
  assert.ok(t.includes("New contacts") && t.includes("Already in contacts") && t.includes("Refused lines"));
  assert.ok(t.includes("Line 4") && t.includes("Not a Philippine mobile <b>x</b>"));
  assert.equal(d.root().all((n) => n.tagName === "B").length, 0);
  assert.ok(!d.calls.some((c) => c.path === BASE + "upload/save/"), "nothing saved at the check");
  /* a changed file */
  d.s.save = err(409, "changed", "Changed.");
  await d.click(d.press(d.root(), "Add 2 contacts"));
  assert.deepEqual(d.calls.find((c) => c.path === BASE + "upload/save/").body, { text: "Maria,Santos,09171234567\n09180000000", expected_new: 2 });
  assert.ok(d.root().textContent.includes("Check it again."));
  assert.equal(d.press(d.root(), "Add 2 contacts"), undefined);
  /* check again, then save */
  d.s.save = null;
  await d.click(d.press(d.root(), "Check"));
  await d.click(d.press(d.root(), "Add 2 contacts"));
  assert.ok(d.root().textContent.includes("2 contacts were saved."));
});

test("CSV upload with a group sends it, and nothing new disables the save", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Upload CSV"));
  d.$("ct-ugroup").value = "g1";
  d.$("ct-paste").value = "09171234567";
  d.s.check = { status: 200, body: { new: 0, already: 1, refused: [] } };
  await d.click(d.press(d.root(), "Check"));
  assert.deepEqual(d.calls.find((c) => c.path === BASE + "upload/check/").body, { text: "09171234567", group: "g1" });
  const save = d.press(d.root(), "Nothing new to add");
  assert.equal(save.disabled, true);
});

test("a list failure shows a message and a retry; leaving the page clears it", async () => {
  const d = boot();
  d.s.listErr = err(500, "server_error", "Boom.");
  await d.open();
  assert.ok(d.root().textContent.includes("Boom."));
  assert.ok(d.press(d.root(), "Try again"));
  d.s.listErr = null;
  await d.click(d.press(d.root(), "Try again"));
  assert.ok(d.root().textContent.includes("Ana Reyes"));
  d.window.NOContacts.hide();
  assert.equal(d.root().children.length, 0);
});

test("wiring: dashboard.js knows the view; the links sit right after Inbox, start hidden; the root, slot, live region, css and script exist", () => {
  const dash = read("dashboard.js");
  assert.ok(dash.includes('"/contacts/"') && dash.includes("NOContacts") && /"settings-notification", "contacts"\]/.test(dash));
  const at = (needle) => HTML.indexOf(needle);
  assert.ok(at('data-route="contacts" data-contacts-nav hidden>') > at('data-route="inbox" data-inbox-nav hidden>'));
  const links = [...HTML.matchAll(/<a\b[^>]*data-contacts-nav[^>]*>/g)].map((m) => m[0]);
  assert.equal(links.length, 2, "the sidebar link and the More tile");
  for (const l of links) assert.ok(/\bhidden\b/.test(l) && /href="\/contacts\/"/.test(l), l);
  for (const id of ["view-contacts", "ct-root", "ct-dialog-slot", "ct-live"]) assert.ok(HTML.includes('id="' + id + '"'), id);
  assert.ok(at("contacts.js") > at("assets/js/dashboard.js"));
  assert.ok(HTML.includes("assets/css/contacts.css"));
});

test("safety and look: no innerHTML or markup writes; light-blue focus; phone rules; scoped to the view", () => {
  const src = read("contacts.js");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src));
  assert.ok(!/localStorage|sessionStorage/.test(src), "nothing is stored");
  assert.ok(CSS.includes("var(--link"));
  assert.ok(!/#d4af37|var\(--focus\)/i.test(CSS));
  assert.ok(/@media \(max-width: 720px\)/.test(CSS));
  assert.ok(/\.ct-toolbar \{ grid-template-columns: minmax\(0, 1fr\)/.test(CSS), "one column on a phone");
  assert.ok(!/overflow-x:\s*(scroll|auto)/.test(CSS));
  const rules = CSS.split("\n").filter((l) => /\{/.test(l) && !/^\s*(\/\*|@)/.test(l));
  for (const l of rules) assert.ok(/^\s*#view-contacts/.test(l), "scoped: " + l.slice(0, 60));
});

test("edit: a contact with no name can be saved with none; a named one must keep its first name", async () => {
  const d = boot();
  d.s.detail = { ...ROWS[1], mobile: "09180000000" };
  await d.open();
  await d.click(d.buttons(d.root()).find((b) => b.getAttribute("aria-label") === "Edit No name"));
  assert.ok(!d.slot().textContent.includes("First name *"));
  await d.click(d.press(d.slot(), "Save contact"));
  assert.ok(!d.calls.some((c) => c.method === "PATCH"), "unchanged: nothing is sent");
  /* adding a name sends it, and only it */
  await d.click(d.buttons(d.root()).find((b) => b.getAttribute("aria-label") === "Edit No name"));
  d.$("ct-first").value = " Pedro ";
  await d.click(d.press(d.slot(), "Save contact"));
  assert.deepEqual(d.calls.find((c) => c.method === "PATCH").body, { first_name: "Pedro" });
  /* another field changed on a no-name contact: first_name is not in the body */
  const f = boot();
  f.s.detail = { ...ROWS[1], mobile: "09180000000" };
  await f.open();
  await f.click(f.buttons(f.root()).find((b) => b.getAttribute("aria-label") === "Edit No name"));
  f.$("ct-last").value = "Lim";
  await f.click(f.press(f.slot(), "Save contact"));
  assert.deepEqual(f.calls.find((c) => c.method === "PATCH").body, { last_name: "Lim" });
  const e = boot();
  await e.open();
  await e.click(e.buttons(e.root()).find((b) => b.getAttribute("aria-label") === "Edit Ana Reyes"));
  assert.ok(e.slot().textContent.includes("First name *"));
  e.$("ct-first").value = " ";
  await e.click(e.press(e.slot(), "Save contact"));
  assert.ok(e.slot().textContent.includes("Enter a first name"));
  assert.ok(!e.calls.some((c) => c.method === "PATCH"));
});

test("CSV file picker: the native input is hidden behind a dash secondary button label, with the light-blue focus", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Upload CSV"));
  const file = d.$("ct-file");
  assert.ok(file.classList.contains("ct-sr"), "native control visually hidden");
  const lab = d.root().all((n) => n.tagName === "LABEL" && n.classList.contains("ct-filebtn"))[0];
  assert.equal(lab.textContent, "Choose file");
  assert.ok(lab.classList.contains("no-btn") && lab.classList.contains("no-btn-ghost"));
  assert.equal(lab.getAttribute("for"), "ct-file");
  assert.ok(d.root().textContent.includes("No file chosen"));
  const pick = d.root().all((n) => n.classList.contains("ct-filepick"))[0];
  assert.equal(pick.children[0], file, "the input is inside the picker, first");
  assert.equal(pick.children[1], lab, "and directly before its label");
  assert.ok(/\.ct-file:focus-visible \+ \.ct-filebtn \{[^}]*var\(--link/.test(CSS));
});
