/* The member Notices editor (ClickUp z8uq9mezdh, /settings/notices/, notices.js). Driven like meta-pixel.test.mjs: the real scripts run in a
   vm with the small stand-in document from dom.mjs and a recorded fetch that plays the owner API of apps/members (member-notices). Fake data only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const HTML = fs.readFileSync(path.join(JS, "..", "..", "index.html"), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const BASE = `/sites/${A}/member-notices/`;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };
const iso = (hoursFromNow) => new Date(Date.now() + hoursFromNow * 3600000).toISOString();
const BLOB = "https://abc123.public.blob.vercel-storage.com/member-notices/a.png";

const notice = (id, over = {}) => ({ id, kind: "announcement", title: "Title " + id, body: "", image_url: null, starts_at: null, ends_at: null, active: true, created_at: iso(-5), updated_at: iso(-5), ...over });
const err = (status, code, message, fields) => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });

function boot({ notices = [], off = null, search = "" } = {}) {
  const doc = makeDocument(), calls = [], toasts = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; return n; };
  doc.createTextNode = (t) => { const w = make("span"); w.textContent = t; return w.firstChild; };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["nt-root", "nt-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const nav = [0].map(() => { const a = doc.createElement("a"); a.setAttribute("data-notices-nav", ""); a.hidden = true; page.appendChild(a); return a; });
  doc.querySelectorAll = (sel) => (sel === "[data-notices-nav]" ? nav : []);
  const s = { notices: notices.map((n) => ({ ...n })), off, next: 100, answer: null, imageAnswer: null };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", "");
    const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
    const body = opts.body && !isForm ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body, form: isForm ? opts.body : null });
    let a = err(404, "not_found", "Not found.");
    const m = new RegExp("^" + BASE.replace(/\//g, "\\/") + "(?:(\\w+)\\/)?(image\\/)?$").exec(p);
    if (opts.method === "GET" && p === "/sites/") a = { status: 200, body: { items: [{ id: A, template: "sante" }], next_cursor: null } };
    else if (s.off) a = s.off;
    else if (m && !m[1] && opts.method === "GET") a = { status: 200, body: { notices: s.notices } };
    else if (m && !m[1] && opts.method === "POST") {
      a = s.answer || (() => { const n = notice("mn_" + ++s.next, { ...body }); s.notices.unshift(n); return { status: 201, body: n }; })();
    } else if (m && m[1] && !m[2] && opts.method === "PATCH") {
      const n = s.notices.find((x) => x.id === m[1]);
      a = s.answer || (n ? (Object.assign(n, body), { status: 200, body: n }) : err(404, "not_found", "Not found."));
    } else if (m && m[1] && !m[2] && opts.method === "DELETE") { s.notices = s.notices.filter((x) => x.id !== m[1]); a = { status: 200, body: { status: "deleted" } }; }
    else if (m && m[2] && opts.method === "POST") { const n = s.notices.find((x) => x.id === m[1]); a = s.imageAnswer || (n ? (n.image_url = BLOB, { status: 200, body: n }) : err(404, "not_found", "Not found.")); }
    else if (m && m[2] && opts.method === "DELETE") { const n = s.notices.find((x) => x.id === m[1]); a = n ? (n.image_url = null, { status: 200, body: n }) : err(404, "not_found", "Not found."); }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const location = { search, pathname: "/settings/notices/", replace() {}, assign() {} };
  const context = vm.createContext({ window, document: doc, location, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, Uint8Array, Date,
    FormData, File, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("notices.js"), context, { filename: "notices.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  const all = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label) => buttons(n).find((b) => b.textContent === label);
  return { doc, calls, toasts, s, $, all, buttons, press, nav, window,
    list: () => calls.map((c) => c.method + " " + c.path),
    async open() { window.NONotices.show(); await settle(); },
    async click(node) { node.fire("click"); await settle(); },
    async fill(v) {
      if (v.kind !== undefined) $("nt-kind").value = v.kind;
      if (v.title !== undefined) $("nt-title").value = v.title;
      if (v.body !== undefined) $("nt-body").value = v.body;
      if (v.starts !== undefined) $("nt-starts_at").value = v.starts;
      if (v.ends !== undefined) $("nt-ends_at").value = v.ends;
      if (v.active !== undefined) $("nt-active").checked = v.active;
      if (v.file !== undefined) $("nt-file").files = v.file ? [v.file] : [];
    } };
}
const rowOf = (d, id) => d.$("nt-root").all((n) => n.getAttribute("data-notice") === id)[0];
const chips = (n) => n.all((x) => x.classList.contains("chip")).map((c) => c.textContent);

test("no notices: the empty list, an Add notice button, and the tab shows", async () => {
  const d = boot();
  await d.open();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE]);
  const root = d.$("nt-root");
  assert.equal(root.getAttribute("aria-busy"), null);
  assert.deepEqual(root.all((n) => n.tagName === "H2").map((n) => n.textContent), ["Announcements & promos"]);
  assert.ok(root.textContent.includes("No notices yet."));
  assert.deepEqual(d.buttons(root).map((b) => b.textContent), ["Add notice"]);
  assert.deepEqual(d.nav.map((n) => n.hidden), [false]);
});

test("each notice shows its kind, its status (Live, Scheduled, Ended, Off), its window and a picture only from https", async () => {
  const d = boot({ notices: [
    notice("mn_1", { title: "<b>Live</b>", body: "Open Sunday", image_url: BLOB }),
    notice("mn_2", { kind: "promo", starts_at: iso(24) }),
    notice("mn_3", { ends_at: iso(-1) }),
    notice("mn_4", { active: false, image_url: "javascript:alert(1)" }),
  ] });
  await d.open();
  assert.deepEqual(chips(rowOf(d, "mn_1")), ["Announcement", "Live"]);
  assert.deepEqual(chips(rowOf(d, "mn_2")), ["Promo", "Scheduled"]);
  assert.deepEqual(chips(rowOf(d, "mn_3")), ["Announcement", "Ended"]);
  assert.deepEqual(chips(rowOf(d, "mn_4")), ["Announcement", "Off"]);
  assert.equal(rowOf(d, "mn_1").all((n) => n.tagName === "H3")[0].textContent, "<b>Live</b>"); /* text, never markup */
  assert.equal(rowOf(d, "mn_1").all((n) => n.tagName === "IMG").length, 1);
  assert.equal(rowOf(d, "mn_4").all((n) => n.tagName === "IMG").length, 0);
  assert.ok(rowOf(d, "mn_1").textContent.includes("Always on"));
});

test("adding a notice sends the kind, trimmed text, Philippine times as ISO with a zone, and active; the list gets it", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.$("nt-root"), "Add notice"));
  await d.fill({ kind: "promo", title: "  Big sale  ", body: " 20% off ", starts: "2026-11-20T09:30", ends: "2026-11-22T00:00", active: true });
  await d.click(d.press(d.$("nt-root"), "Save"));
  const post = d.calls.filter((c) => c.method === "POST");
  assert.equal(post.length, 1);
  assert.deepEqual(post[0].body, { kind: "promo", title: "Big sale", body: "20% off", starts_at: "2026-11-20T01:30:00.000Z", ends_at: "2026-11-21T16:00:00.000Z", active: true });
  assert.equal(post[0].path, BASE);
  assert.ok(d.toasts.some((t) => t.startsWith("Saved")));
  assert.equal(d.$("nt-root").all((n) => n.tagName === "H3").map((n) => n.textContent).join(), "Big sale");
  assert.equal(d.$("nt-title"), null); /* the editor closed */
});

test("empty dates are sent as null, and a notice can be saved off", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.$("nt-root"), "Add notice"));
  await d.fill({ title: "Quiet", active: false });
  await d.click(d.press(d.$("nt-root"), "Save"));
  assert.deepEqual(d.calls.find((c) => c.method === "POST").body, { kind: "announcement", title: "Quiet", body: "", starts_at: null, ends_at: null, active: false });
});

test("a title that is empty or too long, an end before the start and a bad time are refused here, with no call", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.$("nt-root"), "Add notice"));
  const save = () => d.click(d.press(d.$("nt-root"), "Save"));
  await save();
  assert.equal(d.$("nt-title").getAttribute("aria-invalid"), "true");
  assert.equal(d.$("nt-title-err").textContent, "Enter a title.");
  await d.fill({ title: "x".repeat(121) });
  await save();
  assert.ok(d.$("nt-title-err").textContent.includes("120"));
  await d.fill({ title: "Ok", starts: "2026-11-20T10:00", ends: "2026-11-20T09:00" });
  await save();
  assert.equal(d.$("nt-ends_at-err").textContent, "The end must be after the start.");
  await d.fill({ ends: "not a time" });
  await save();
  assert.equal(d.$("nt-ends_at-err").textContent, "Enter a date and time.");
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 0);
});

test("the server's field messages show under their boxes and nothing is lost", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.$("nt-root"), "Add notice"));
  await d.fill({ title: "Ok" });
  d.s.answer = err(400, "invalid_request", "Check the highlighted fields.", { title: ["Too long for the server."] });
  await d.click(d.press(d.$("nt-root"), "Save"));
  assert.equal(d.$("nt-title-err").textContent, "Too long for the server.");
  assert.equal(d.$("nt-title").value, "Ok");
  assert.ok(d.$("nt-title"));
});

test("editing sends the whole form as a PATCH; clearing a date sends null; the list shows the change", async () => {
  const d = boot({ notices: [notice("mn_1", { title: "Old", starts_at: "2026-11-20T01:30:00.000Z", ends_at: "2026-11-21T16:00:00.000Z" })] });
  await d.open();
  await d.click(d.press(rowOf(d, "mn_1"), "Edit"));
  assert.equal(d.$("nt-title").value, "Old");
  assert.equal(d.$("nt-starts_at").value, "2026-11-20T09:30"); /* shown in Philippine time */
  assert.equal(d.$("nt-ends_at").value, "2026-11-22T00:00");
  await d.fill({ title: "New", ends: "" });
  await d.click(d.press(d.$("nt-root"), "Save"));
  const patch = d.calls.find((c) => c.method === "PATCH");
  assert.equal(patch.path, BASE + "mn_1/");
  assert.deepEqual(patch.body, { kind: "announcement", title: "New", body: "", starts_at: "2026-11-20T01:30:00.000Z", ends_at: null, active: true });
  assert.equal(rowOf(d, "mn_1").all((n) => n.tagName === "H3")[0].textContent, "New");
});

test("Cancel closes the editor and sends nothing", async () => {
  const d = boot({ notices: [notice("mn_1")] });
  await d.open();
  await d.click(d.press(rowOf(d, "mn_1"), "Edit"));
  await d.click(d.press(d.$("nt-root"), "Cancel"));
  assert.equal(d.$("nt-title"), null);
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE]);
});

test("delete asks twice, then removes the notice", async () => {
  const d = boot({ notices: [notice("mn_1"), notice("mn_2")] });
  await d.open();
  await d.click(d.press(rowOf(d, "mn_1"), "Delete"));
  assert.equal(d.calls.filter((c) => c.method === "DELETE").length, 0);
  await d.click(d.press(rowOf(d, "mn_1"), "Confirm delete"));
  assert.deepEqual(d.calls.filter((c) => c.method === "DELETE").map((c) => c.path), [BASE + "mn_1/"]);
  assert.equal(rowOf(d, "mn_1"), undefined);
  assert.ok(rowOf(d, "mn_2"));
  assert.ok(d.toasts.some((t) => t.startsWith("Deleted")));
});

test("a picture is sent as multipart `file` after the notice is saved, and shows on the row", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.$("nt-root"), "Add notice"));
  await d.fill({ title: "With picture", file: new File(["x"], "a.png", { type: "image/png" }) });
  await d.click(d.press(d.$("nt-root"), "Save"));
  assert.deepEqual(d.list().slice(2), ["POST " + BASE, "POST " + BASE + "mn_101/image/"]);
  const up = d.calls[3];
  assert.ok(up.form instanceof FormData && up.form.get("file").name === "a.png");
  assert.equal(rowOf(d, "mn_101").all((n) => n.tagName === "IMG")[0].getAttribute("src"), BLOB);
});

test("a picture of the wrong type or over 2 MB is refused here; nothing is saved", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.$("nt-root"), "Add notice"));
  await d.fill({ title: "T", file: new File(["x"], "a.gif", { type: "image/gif" }) });
  await d.click(d.press(d.$("nt-root"), "Save"));
  assert.equal(d.$("nt-file-err").textContent, "Use a JPEG, PNG or WebP picture.");
  await d.fill({ file: new File([new Uint8Array(2 * 1024 * 1024 + 1)], "b.png", { type: "image/png" }) });
  await d.click(d.press(d.$("nt-root"), "Save"));
  assert.ok(d.$("nt-file-err").textContent.includes("2 MB"));
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 0);
});

test("when the picture store is not set up the notice is still saved and the editor says so under the picture box", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.$("nt-root"), "Add notice"));
  await d.fill({ title: "Saved anyway", file: new File(["x"], "a.png", { type: "image/png" }) });
  d.s.imageAnswer = err(503, "image_store_not_configured", "No store.");
  await d.click(d.press(d.$("nt-root"), "Save"));
  assert.ok(rowOf(d, "mn_101"), "the notice was saved");
  assert.ok(d.$("nt-file-err").textContent.includes("not set up yet"));
  assert.ok(d.toasts.some((t) => t.startsWith("Saved, but the picture was not added")));
  d.s.imageAnswer = err(502, "image_not_saved", "No.");
  await d.fill({ file: new File(["x"], "a.png", { type: "image/png" }) });
  await d.click(d.press(d.$("nt-root"), "Save"));
  assert.ok(d.$("nt-file-err").textContent.includes("not saved"));
});

test("Remove picture deletes it on save, without a new upload", async () => {
  const d = boot({ notices: [notice("mn_1", { image_url: BLOB })] });
  await d.open();
  await d.click(d.press(rowOf(d, "mn_1"), "Edit"));
  await d.click(d.press(d.$("nt-root"), "Remove picture"));
  await d.click(d.press(d.$("nt-root"), "Save"));
  assert.deepEqual(d.list().slice(2), ["PATCH " + BASE + "mn_1/", "DELETE " + BASE + "mn_1/image/"]);
  assert.equal(rowOf(d, "mn_1").all((n) => n.tagName === "IMG").length, 0);
});

test("a 404 means notices are not available: the page says so and the tab stays hidden; a billing-only account gets the API's words; a failure offers Try again", async () => {
  const off = boot({ off: err(404, "not_found", "Not found.") });
  await off.open();
  assert.ok(off.$("nt-root").textContent.includes("Notices are not available yet"));
  assert.deepEqual(off.nav.map((n) => n.hidden), [true]);
  const bill = boot({ off: err(403, "billing_only", "This account is billing only.") });
  await bill.open();
  assert.ok(bill.$("nt-root").textContent.includes("This account is billing only."));
  const down = boot({ off: err(500, "server_error", "x") });
  await down.open();
  assert.ok(down.press(down.$("nt-root"), "Try again"));
});

test("the pure helpers: Philippine time both ways, the window text, and the status by the clock", () => {
  const d = boot();
  const u = d.window.NONotices.util;
  assert.equal(u.toIso("2026-11-20T09:30"), "2026-11-20T01:30:00.000Z");
  assert.equal(u.toIso(""), null);
  assert.equal(u.toIso("2026-13-40T99:99"), undefined);
  assert.equal(u.toLocal("2026-11-20T01:30:00.000Z"), "2026-11-20T09:30");
  assert.equal(u.toLocal(null), "");
  const now = new Date("2026-11-20T00:00:00Z");
  assert.deepEqual(Array.from(u.statusOf({ active: true, starts_at: "2026-11-20T00:00:00Z", ends_at: null }, now)), ["ok", "Live"]); /* the start counts */
  assert.deepEqual(Array.from(u.statusOf({ active: true, starts_at: null, ends_at: "2026-11-20T00:00:00Z" }, now)), ["neutral", "Ended"]); /* the end does not */
  assert.equal(u.windowText({ starts_at: null, ends_at: null }), "Always on");
});

test("the page wires it in: a hidden Notices tab, its view, its script and style, and the route", () => {
  assert.match(HTML, /<a href="\/settings\/notices\/" data-route="settings-notices" data-notices-nav hidden>Notices<\/a>/);
  assert.match(HTML, /<section class="view" id="view-settings-notices"[^>]*hidden>[\s\S]*id="nt-root"[\s\S]*id="nt-live"/);
  assert.match(HTML, /<script src="\/assets\/js\/notices\.js\?v=[^"]+"><\/script>/);
  assert.match(HTML, /<link rel="stylesheet" href="\/assets\/css\/notices\.css\?v=[^"]+">/);
  const dash = read("dashboard.js");
  assert.match(dash, /"\/settings\/notices\/": \{ view: "settings-notices"/);
  assert.match(dash, /NONotices\.probe\(\)/);
  assert.match(dash, /NT\.show\(\)/);
});
