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
  assert.equal(u.contactError({ first: "A", mobile: "  " }), "Enter a mobile number.");
  assert.equal(u.contactError({ first: "A", mobile: "0917" }), "");
  assert.equal(u.contactError({ first: " ", mobile: "0917" }), "Enter a first name");
  assert.equal(u.contactError({ first: "A", mobile: "" }), "Enter a mobile number.");
  assert.equal(u.contactError({ first: "", mobile: "0917" }), "Enter a first name", "a first name is always required");
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

const byClass = (d, c) => d.root().all((n) => n.classList.contains(c));
const openBtn = (d, name) => d.root().all((n) => n.tagName === "BUTTON" && n.getAttribute("aria-label") === "Open " + name)[0];
const sideBtn = (d, name) => d.root().all((n) => n.classList.contains("ct-side-btn") && n.textContent.startsWith(name))[0];

test("three columns: groups, list, detail; the list with masked mobile, No name, escaped text; the saved count under the groups", async () => {
  const d = boot();
  await d.open();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE + "status/", "GET " + BASE + "groups/", "GET " + BASE]);
  const app = byClass(d, "ct-app")[0];
  assert.deepEqual(app.children.map((c) => c.classList.contains("ct-col-groups") ? "groups" : c.classList.contains("ct-col-list") ? "list" : "detail"), ["groups", "list", "detail"]);
  const text = d.root().textContent;
  assert.ok(text.includes("3 of 20,000 contacts saved"));
  assert.ok(byClass(d, "ct-col-groups")[0].all((n) => n.classList.contains("ct-saved")).length === 1, "saved count in the groups column");
  assert.ok(text.includes("Ana Reyes") && text.includes("0917 *** 1234") && text.includes("No name"));
  assert.ok(text.includes("<img src=x onerror=alert(1)>"));
  assert.equal(d.root().all((n) => n.tagName === "IMG" || n.tagName === "B").length, 0);
  assert.ok(!text.includes("09171234567"), "no full mobile in the list");
  assert.equal(d.nav[0].hidden, false);
  assert.ok(text.includes("Select a contact to see the details."));
});

test("left column: All Contacts first, then groups with counts; picking one filters the list; All Contacts leaves group out", async () => {
  const d = boot();
  await d.open();
  const names = byClass(d, "ct-side-btn").map((b) => b.children.map((x) => x.textContent).join("|"));
  assert.deepEqual(names, ["All Contacts|3", "Regulars|2", "VIP|0"]);
  assert.equal(sideBtn(d, "All Contacts").getAttribute("aria-current"), "true");
  await d.click(sideBtn(d, "Regulars"));
  assert.equal(d.calls[d.calls.length - 1].path, BASE + "?group=g1");
  assert.equal(sideBtn(d, "Regulars").getAttribute("aria-current"), "true");
  await d.click(sideBtn(d, "All Contacts"));
  assert.equal(d.calls[d.calls.length - 1].path, BASE);
  assert.ok(d.press(d.root(), "New group"), "a way to add a group");
});

test("A-Z list: letter headers in order, number-only contacts under # at the end", async () => {
  const d = boot({ rows: [row("c2", "", "", "0918 *** 5678"), row("c4", "ben", "Lim", "0921 *** 1"), row("c1", "Ana", "Reyes", "0917 *** 1234"), row("c5", "Álvaro", "Cruz", "0922 *** 2"), row("c6", "Zed", "", "0923 *** 3")] });
  await d.open();
  assert.deepEqual(byClass(d, "ct-letter").map((n) => n.textContent), ["A", "B", "Z", "#"]);
  const u = d.window.NOContacts.util;
  assert.equal(u.letterOf({ first_name: "", last_name: "" }), "#");
  assert.equal(u.letterOf({ first_name: "", last_name: "Mata" }), "M");
  assert.equal(u.letterOf({ first_name: "9lives" }), "#");
  assert.equal(u.letterOf({ first_name: "Álvaro" }), "A");
});

test("search: one character sends nothing; two or more sends q; Load more follows the cursor", async () => {
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
  d.s.next = null;
  await d.click(d.press(d.root(), "Load more"));
  assert.equal(d.calls[d.calls.length - 1].path, BASE + "?cursor=CUR2");
});

test("detail: choosing a contact shows it from the list row with no extra read; Edit reads the full number, edits in place and PATCHes only the change", async () => {
  const d = boot();
  await d.open();
  await d.click(openBtn(d, "Ana Reyes"));
  assert.ok(!d.list().some((c) => c.startsWith("GET " + BASE + "c1")), "no detail read on select");
  const det = d.$("ct-detail");
  assert.ok(det.textContent.includes("Ana Reyes") && det.textContent.includes("0917 *** 1234") && det.textContent.includes("Regulars"));
  assert.equal(byClass(d, "ct-app")[0].getAttribute("data-pane"), "detail");
  await d.click(d.press(det, "Edit"));
  assert.ok(d.list().includes("GET " + BASE + "c1/"));
  assert.equal(d.$("ct-mobile").value, "09171234567");
  assert.equal(d.slot().children.length, 0, "edits in place, not in a dialog");
  const boxes = det.all((n) => n.tagName === "INPUT" && n.getAttribute("type") === "checkbox");
  assert.deepEqual(boxes.map((b) => b.checked), [true, false]);
  d.$("ct-last").value = "Santos";
  await d.click(d.press(det, "Save contact"));
  const patch = d.calls.find((c) => c.method === "PATCH");
  assert.equal(patch.path, BASE + "c1/");
  assert.deepEqual(patch.body, { last_name: "Santos" });
  assert.ok(!d.press(d.$("ct-detail"), "Save contact"), "back to the read view");
});

test("detail: delete asks first", async () => {
  const d = boot();
  await d.open();
  await d.click(openBtn(d, "Ana Reyes"));
  await d.click(d.buttons(d.$("ct-detail")).find((b) => b.getAttribute("aria-label") === "Delete Ana Reyes"));
  assert.ok(d.slot().textContent.includes("This cannot be undone."));
  assert.ok(!d.calls.some((c) => c.method === "DELETE"));
  await d.click(d.press(d.slot(), "Cancel"));
  assert.ok(!d.calls.some((c) => c.method === "DELETE"));
  await d.click(d.buttons(d.$("ct-detail")).find((b) => b.getAttribute("aria-label") === "Delete Ana Reyes"));
  await d.click(d.press(d.slot(), "Delete contact"));
  assert.deepEqual(d.calls.filter((c) => c.method === "DELETE").map((c) => c.path), [BASE + "c1/"]);
});

test("add a contact: mobile is required; the body carries names, mobile and group ids; the list reloads", async () => {
  const d = boot();
  await d.open();
  const plus = d.root().all((n) => n.classList.contains("ct-plus"))[0];
  assert.equal(plus.textContent, "+");
  await d.click(plus);
  const dlg = d.slot();
  assert.ok(dlg.textContent.includes("Add contact") && dlg.textContent.includes("Regulars") && dlg.textContent.includes("VIP"));
  assert.ok(d.$("ct-first").getAttribute("aria-required") === "true" && dlg.textContent.includes("First name *"));
  assert.ok(!dlg.textContent.includes("Last name *"));
  await d.click(d.press(dlg, "Add contact"));
  assert.ok(dlg.textContent.includes("Enter a first name") && dlg.textContent.includes("Enter a mobile number."));
  d.$("ct-first").value = "Lito";
  assert.ok(!d.list().some((c) => c.startsWith("POST " + BASE)));
  d.$("ct-first").value = " Lito "; d.$("ct-mobile").value = " 0917 111 2222 ";
  assert.ok(!dlg.all((n) => n.tagName === "INPUT" && n.getAttribute("type") === "checkbox").length, "Add has a Group dropdown, not checkboxes");
  assert.equal(d.$("ct-agroup").tagName, "SELECT");
  assert.equal(d.$("ct-agroup").children[0].textContent, "No group");
  const agin = dlg.all((n) => n.classList.contains("ct-combo-input"))[0];
  assert.equal(agin.value, "", "No group is only a placeholder");
  assert.equal(agin.getAttribute("placeholder"), "No group");
  d.$("ct-agroup").value = "g2";
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
  await d.click(d.root().all((n) => n.classList.contains("ct-plus"))[0]);
  d.$("ct-first").value = "Lito";
  d.$("ct-mobile").value = "123";
  await d.click(d.press(d.slot(), "Add contact"));
  assert.ok(d.slot().textContent.includes("Not a Philippine mobile number."));
  d.s.post = err(409, "already_exists", "Exists.", {});
  await d.click(d.press(d.slot(), "Add contact"));
  assert.ok(d.slot().textContent.includes("That number is already a contact."));
});

test("groups: add, rename and delete from the left column", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "New group"));
  d.$("ct-gname").value = "  New ones ";
  await d.click(d.press(d.slot(), "Add group"));
  assert.deepEqual(d.calls.find((c) => c.method === "POST" && c.path === BASE + "groups/").body, { name: "New ones" });
  await d.click(d.press(d.root(), "New group"));
  d.$("ct-gname").value = "  ";
  await d.click(d.press(d.slot(), "Add group"));
  assert.ok(d.slot().textContent.includes("Enter a group name."));
  await d.click(d.press(d.slot(), "Cancel"));
  await d.click(sideBtn(d, "Regulars"));
  await d.click(d.buttons(d.root()).find((b) => b.getAttribute("aria-label") === "Rename Regulars"));
  assert.equal(d.$("ct-rename").value, "Regulars");
  d.$("ct-rename").value = "Loyal";
  await d.click(d.press(d.slot(), "Save name"));
  const patch = d.calls.find((c) => c.method === "PATCH");
  assert.equal(patch.path, BASE + "groups/g1/"); assert.deepEqual(patch.body, { name: "Loyal" });
  await d.click(d.buttons(d.root()).find((b) => b.getAttribute("aria-label") === "Delete Regulars"));
  assert.ok(d.slot().textContent.includes("Its contacts stay in your contacts."));
  assert.ok(!d.calls.some((c) => c.method === "DELETE"));
  await d.click(d.press(d.slot(), "Delete group"));
  assert.deepEqual(d.calls.filter((c) => c.method === "DELETE").map((c) => c.path), [BASE + "groups/g1/"]);
});

test("Upload CSV: the group dropdown is empty with a placeholder, nothing is sent for it; the sample CSV link and file match the parser", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Upload CSV"));
  const inp = d.root().all((n) => n.classList.contains("ct-combo-input"))[0];
  assert.equal(inp.value, "");
  assert.equal(inp.getAttribute("placeholder"), "No group");
  d.$("ct-paste").value = "09171234567";
  await d.click(d.press(d.root(), "Check"));
  assert.deepEqual(d.calls.find((c) => c.path === BASE + "upload/check/").body, { text: "09171234567" }, "group left out");
  const a = d.root().all((n) => n.tagName === "A" && n.textContent === "Download sample CSV")[0];
  assert.ok(a, "sample link");
  assert.equal(a.getAttribute("href"), "/assets/samples/contacts-sample.csv");
  const file = fs.readFileSync(path.join(ROOT, a.getAttribute("href")), "utf8").trim().split(/\r?\n/).map((l) => l.split(","));
  assert.deepEqual(file[0], ["first_name", "last_name", "mobile"], "header names the three columns the server reads");
  assert.ok(!/\d/.test(file[0][2]), "header is skipped by the server: no digits in the third cell");
  assert.equal(file.length, 4, "header plus 3 rows");
  for (const r of file.slice(1)) { assert.equal(r.length, 3); assert.ok(/^09\d{9}$/.test(r[2])); }
  assert.ok(file.slice(1).every((r) => r[0].length > 0), "every sample row has a first name");
  assert.ok(fs.statSync(path.join(ROOT, a.getAttribute("href"))).size < 1048576);
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
  assert.ok(/\.ct-app \{ display: block;/.test(CSS) && /data-pane="detail"\] \.ct-col-detail \{ display: flex/.test(CSS) && /\.ct-back \{ display: inline-flex/.test(CSS), "one column at a time on a phone, with back controls");
  assert.ok(!/overflow-x:\s*(scroll|auto)/.test(CSS));
  const rules = CSS.split("\n").filter((l) => /\{/.test(l) && !/^\s*(\/\*|@)/.test(l));
  for (const l of rules) assert.ok(/^\s*(body\.dash-app )?:is\(#view-contacts, #ct-dialog-slot\)|^@media[^{]*\{ :is\(#view-contacts, #ct-dialog-slot\)/.test(l), "scoped: " + l.slice(0, 60));
});

test("edit: First name is always required, even for a contact that had no name", async () => {
  const d = boot();
  d.s.detail = { ...ROWS[1], mobile: "09180000000" };
  await d.open();
  await d.click(openBtn(d, "No name"));
  await d.click(d.press(d.$("ct-detail"), "Edit"));
  assert.ok(d.$("ct-detail").textContent.includes("First name *"));
  await d.click(d.press(d.$("ct-detail"), "Save contact"));
  assert.ok(d.$("ct-detail").textContent.includes("Enter a first name"));
  assert.ok(!d.calls.some((c) => c.method === "PATCH"), "no request is sent");
  d.$("ct-first").value = " Pedro ";
  await d.click(d.press(d.$("ct-detail"), "Save contact"));
  assert.deepEqual(d.calls.find((c) => c.method === "PATCH").body, { first_name: "Pedro" });
  const e = boot();
  await e.open();
  await e.click(openBtn(e, "Ana Reyes"));
  await e.click(e.press(e.$("ct-detail"), "Edit"));
  assert.ok(e.$("ct-detail").textContent.includes("First name *"));
  e.$("ct-first").value = " ";
  await e.click(e.press(e.$("ct-detail"), "Save contact"));
  assert.ok(e.$("ct-detail").textContent.includes("Enter a first name"));
  assert.ok(!e.calls.some((c) => c.method === "PATCH"));
});

test("edit: a 400 invalid_request with fields.first_name shows on the First name field", async () => {
  const d = boot();
  await d.open();
  await d.click(openBtn(d, "Ana Reyes"));
  await d.click(d.press(d.$("ct-detail"), "Edit"));
  d.s.patch = err(400, "invalid_request", "Check it.", { first_name: ["Enter a first name of up to 80 characters."] });
  d.$("ct-first").value = "Anna";
  await d.click(d.press(d.$("ct-detail"), "Save contact"));
  assert.ok(d.calls.some((c) => c.method === "PATCH"));
  assert.ok(d.$("ct-detail").textContent.includes("Enter a first name of up to 80 characters."));
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

test("no page title block: no kicker, title or subtitle; the sr-only h1 stays; the tabs are the Settings menu in a host at the top; the saved count is a muted line in the list card", async () => {
  const d = boot();
  await d.open();
  const root = d.root();
  assert.ok(!root.all((n) => n.tagName === "H1" || n.classList.contains("dash-eyebrow") || n.classList.contains("ct-title") || n.classList.contains("ct-head")).length);
  assert.ok(HTML.includes('<h1 class="bl-sr" id="h-contacts"'));
  const host = root.children[0];
  assert.ok(host.classList.contains("ct-tabs-host"));
  const bar = host.children[0];
  assert.ok(bar.classList.contains("set-tabs") && bar.getAttribute("role") === "tablist");
  assert.deepEqual(bar.children.map((b) => b.textContent), ["Contacts", "Upload CSV"]);
  assert.deepEqual(bar.children.map((b) => b.classList.contains("is-on")), [true, false]);
  const saved = root.all((n) => n.classList.contains("ct-saved"))[0];
  assert.equal(saved.textContent, "3 of 20,000 contacts saved");
  await d.click(bar.children[1]);
  assert.deepEqual(d.root().children[0].children[0].children.map((b) => b.classList.contains("is-on")), [false, true]);
  assert.ok(/\.ct-tabs-host \{[^}]*margin-bottom: 16px/.test(CSS) && /min-width: 900px\) \{ :is\(#view-contacts, #ct-dialog-slot\) \.ct-tabs-host \{ padding-right: 164px; margin-bottom: 24px/.test(CSS));
});

test("INBOX-FIX-9 F8: the Upload CSV intro has no plain 'Download the sample file' sentence; the Download sample CSV link stays", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Upload CSV"));
  const t = d.root().textContent;
  assert.ok(!/Download the sample file/.test(t) && !/Not sure how to fill/.test(t));
  assert.ok(t.includes("Up to 1 MB."));
  assert.equal(d.root().all((n) => n.tagName === "A" && n.textContent === "Download sample CSV").length, 1);
});

test("INBOX-FIX-9 F6: on a phone the groups pane is one continuous card (no tinted block) and changing pane puts the page at the top, so the tab row does not move", async () => {
  assert.match(CSS, /\.ct-col-groups \{ background: transparent; flex: 1 1 auto; \}/);
  const d = boot();
  const tops = [];
  d.window.scrollTo = (x, y) => tops.push([x, y]);
  await d.open();
  const app = byClass(d, "ct-app")[0];
  await d.click(byClass(d, "ct-back")[0]);
  assert.equal(app.getAttribute("data-pane"), "groups");
  assert.deepEqual(tops, [[0, 0]], "the page goes to the top when the pane changes");
  await d.click(byClass(d, "ct-side-btn")[0]);
  assert.equal(app.getAttribute("data-pane"), "list");
  assert.equal(tops.length, 2);
});
