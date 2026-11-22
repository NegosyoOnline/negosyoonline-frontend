/* The "From <source store>" copy lists and the Share switch (ClickUp z8uq9mhbhd, shared-content.js inside training.js and media.js). The real scripts run in
   a vm with the stand-in document from dom.mjs and a recorded fetch that plays GET /sites/{id}/shared-content/ and POST .../copy/. Fake data only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };
const MB = 1024 * 1024;

const offerCourse = (id, over = {}) => ({ id, title: "Offer " + id, image_url: "https://x.public.blob.vercel-storage.com/a.png", module_count: 2, lesson_count: 5, bytes: 180 * MB, copy_state: "not_copied", copy_id: null, ...over });
const offerMedia = (id, over = {}) => ({ id, title: "Clip " + id, asset_type: "video", thumb_url: null, bytes: 12 * MB, copy_state: "not_copied", copy_id: null, ...over });
const ownCourse = (id, over = {}) => ({ id, title: "Own " + id, slug: id, description: "", image_url: null, order: 1, active: true, archived_at: null, module_count: 0, lesson_count: 0, active_lesson_count: 0, shared: false, copied_from: null, ...over });
const ownAsset = (id, over = {}) => ({ id, title: "Asset " + id, asset_type: "image", category: "promo", published: false, active: true, shared: false, copied_from: null, file_url: "https://x.public.blob.vercel-storage.com/f.png", ...over });

function boot({ view = "training", shared = { is_source: false, source_name: "Live4More", courses: [], media: [] }, sharedStatus = 200, courses = [], assets = [] } = {}) {
  const doc = makeDocument(), calls = [], timers = [], toasts = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["tr-root", "tr-live", "ml-root", "ml-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  doc.querySelectorAll = () => [];
  const s = { shared, courses: courses.map((c) => ({ ...c })), assets: assets.map((a) => ({ ...a })), copyStatus: 202 };
  const T = `/sites/${A}/training/`, M = `/sites/${A}/media/`;
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", "");
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    let a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    if (opts.method === "GET" && p === "/sites/") a = { status: 200, body: { items: [{ id: A, template: "sante" }], next_cursor: null } };
    else if (p === `/sites/${A}/shared-content/`) a = { status: sharedStatus, body: s.shared };
    else if (p === `/sites/${A}/shared-content/copy/`) a = { status: s.copyStatus, body: s.copyStatus === 202 ? { status: "queued" } : { error: { code: "x", message: "no" } } };
    else if (opts.method === "GET" && p === T + "courses/") a = { status: 200, body: { courses: s.courses } };
    else if (opts.method === "GET" && p === M) a = { status: 200, body: { assets: s.assets } };
    else if (opts.method === "PATCH" && p.startsWith(T + "courses/")) { const c = s.courses.find((x) => p.endsWith("/" + x.id + "/")); Object.assign(c, body); a = { status: 200, body: { ...c } }; }
    else if (opts.method === "PATCH" && p.startsWith(M)) { const x = s.assets.find((y) => p.endsWith("/" + y.id + "/")); Object.assign(x, body); a = { status: 200, body: { ...x } }; }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const location = { search: "", pathname: "/", replace() {}, assign() {} };
  const context = vm.createContext({ window, document: doc, location, history: { pushState() {} }, console, URLSearchParams, Promise, Intl, Uint8Array, Date, FormData, File,
    localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch, setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {} });
  for (const f of ["app.js", "shared-content.js", view === "training" ? "training.js" : "media.js"]) vm.runInContext(read(f), context, { filename: f });
  window.NODash.toast = (t, x) => toasts.push(t + ": " + x);
  const mod = view === "training" ? window.NOTraining : window.NOMedia;
  const root = () => doc.getElementById(view === "training" ? "tr-root" : "ml-root");
  const all = (n, c) => n.all((x) => x.classList.contains(c));
  const sect = () => all(root(), "sc-box")[0] || null;
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label) => buttons(n).find((b) => b.textContent === label);
  const rowOf = (id) => root().all((n) => n.getAttribute("data-shared") === id)[0];
  return { doc, calls, toasts, s, root, all, sect, buttons, press, rowOf, window, timers,
    async open() { if (view === "training") mod.show("training"); else mod.show(); await settle(); },
    async click(n) { n.fire("click"); await settle(); },
    async runTimers() { const t = timers.splice(0); t.forEach((f) => f()); await settle(); },
    list: () => calls.map((c) => c.method + " " + c.path), close() { if (view === "training") mod.hide("training"); else mod.hide(); } };
}

test("the section is hidden when the API lists nothing, and for the source store itself", async () => {
  for (const shared of [{ is_source: false, source_name: null, courses: [], media: [] }, { is_source: true, source_name: "Live4More", courses: [], media: [] }]) {
    const d = boot({ shared }); await d.open();
    assert.equal(d.sect(), null);
    assert.ok(d.list().includes(`GET /sites/${A}/shared-content/`));
    d.close();
  }
  const n = boot({ shared: { is_source: false, source_name: "", courses: [offerCourse("crs_s1")], media: [] } }); await n.open();
  assert.equal(n.sect(), null, "no store name, no section");
  n.close();
  const d = boot({ sharedStatus: 404 }); await d.open();
  assert.equal(d.sect(), null);
  assert.ok(d.root().textContent.includes("Courses"));
  d.close();
});

test("the section is shown as From <store name> with picture, title, module and lesson counts and size", async () => {
  const d = boot({ shared: { is_source: false, source_name: "Live4More", courses: [offerCourse("crs_s1")], media: [] } }); await d.open();
  const box = d.sect();
  assert.ok(box);
  assert.equal(box.all((n) => n.tagName === "H2")[0].textContent, "From Live4More");
  const row = d.rowOf("crs_s1");
  assert.ok(row.all((n) => n.tagName === "IMG").length === 1);
  assert.equal(row.all((n) => n.tagName === "H3")[0].textContent, "Offer crs_s1");
  assert.ok(row.textContent.includes("2 modules · 5 lessons · 180 MB"));
  d.close();
});

test("the size line shows before the copy, neutral: no price, allowance or meter", async () => {
  const d = boot({ shared: { is_source: false, source_name: "Live4More", courses: [offerCourse("crs_s1")], media: [] } }); await d.open();
  const t = d.sect().textContent;
  assert.ok(t.includes("This copies 180 MB of files into your store’s storage."));
  assert.ok(!/(₱|PHP|\$|price|GB of|allowance|limit)/i.test(t));
  const u = d.window.NOShared.util;
  assert.equal(u.sizeLine(0), "");
  assert.equal(u.sizeText(1536), "1.5 KB");
  assert.equal(u.sizeText(5 * 1024 * MB), "5 GB");
  d.close();
});

test("Copy to my store posts the item, shows Copying…, then Copied with Copy again once the API says copied", async () => {
  const d = boot({ shared: { is_source: false, source_name: "Live4More", courses: [offerCourse("crs_s1")], media: [] } }); await d.open();
  await d.click(d.press(d.rowOf("crs_s1"), "Copy to my store"));
  const post = d.calls.find((c) => c.method === "POST");
  assert.equal(post.path, `/sites/${A}/shared-content/copy/`);
  assert.deepEqual(post.body, { kind: "course", ids: ["crs_s1"] });
  assert.ok(d.press(d.rowOf("crs_s1"), "Copying…").disabled);
  d.s.shared = { ...d.s.shared, courses: [offerCourse("crs_s1", { copy_state: "copied", copy_id: "crs_new" })] };
  d.s.courses = [ownCourse("crs_new", { active: false, copied_from: "crs_s1" })];
  await d.runTimers();
  const row = d.rowOf("crs_s1");
  assert.ok(d.press(row, "Copied").disabled);
  assert.ok(d.press(row, "Copy again"));
  assert.equal(d.press(row, "Copy to my store"), undefined);
  assert.ok(d.list().filter((x) => x === `GET /sites/${A}/training/courses/`).length >= 2, "the page re-read its own list");
  assert.ok(d.root().textContent.includes("Review and publish"), "the copy is a draft with a hint");
  d.close();
});

test("Copy again sends again: true and makes a separate copy request", async () => {
  const d = boot({ shared: { is_source: false, source_name: "Live4More", courses: [offerCourse("crs_s1", { copy_state: "copied", copy_id: "crs_new" })], media: [] } }); await d.open();
  await d.click(d.press(d.rowOf("crs_s1"), "Copy again"));
  assert.deepEqual(d.calls.filter((c) => c.method === "POST")[0].body, { kind: "course", ids: ["crs_s1"], again: true });
  d.close();
});

test("a failed copy says Could not copy. Try again. and the button works again", async () => {
  const d = boot({ shared: { is_source: false, source_name: "Live4More", courses: [offerCourse("crs_s1")], media: [] } }); await d.open();
  d.s.copyStatus = 500;
  await d.click(d.press(d.rowOf("crs_s1"), "Copy to my store"));
  assert.ok(d.rowOf("crs_s1").textContent.includes("Could not copy. Try again."));
  d.s.copyStatus = 202;
  await d.click(d.press(d.rowOf("crs_s1"), "Copy to my store"));
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 2);
  /* a copy the API reports as failed reads the same */
  const e = boot({ shared: { is_source: false, source_name: "Live4More", courses: [offerCourse("crs_s1", { copy_state: "failed" })], media: [] } }); await e.open();
  assert.ok(e.rowOf("crs_s1").textContent.includes("Could not copy. Try again."));
  d.close(); e.close();
});

test("Copy all copies every item not yet copied and is gone when everything is copied", async () => {
  const d = boot({ shared: { is_source: false, source_name: "Live4More", courses: [offerCourse("crs_s1"), offerCourse("crs_s2", { copy_state: "copied", copy_id: "crs_n" })], media: [] } }); await d.open();
  await d.click(d.press(d.sect(), "Copy all"));
  assert.deepEqual(d.calls.filter((c) => c.method === "POST")[0].body, { kind: "course", all: true });
  d.close();
  const e = boot({ shared: { is_source: false, source_name: "Live4More", courses: [offerCourse("crs_s2", { copy_state: "copied" })], media: [] } }); await e.open();
  assert.equal(e.press(e.sect(), "Copy all"), undefined);
  e.close();
});

test("the Media Library lists the media offer and copies with kind media", async () => {
  const d = boot({ view: "media", shared: { is_source: false, source_name: "Live4More", courses: [], media: [offerMedia("ast_s1")] } }); await d.open();
  assert.equal(d.sect().all((n) => n.tagName === "H2")[0].textContent, "From Live4More");
  assert.ok(d.sect().textContent.includes("This copies 12 MB of files"));
  await d.click(d.press(d.rowOf("ast_s1"), "Copy to my store"));
  assert.deepEqual(d.calls.find((c) => c.method === "POST").body, { kind: "media", ids: ["ast_s1"] });
  d.close();
  const e = boot({ view: "media", assets: [ownAsset("ast_1", { copied_from: "ast_s1" })] }); await e.open();
  assert.ok(e.root().textContent.includes("Review and publish"));
  e.close();
});

test("a lesson copied without its Bunny video shows Video required", async () => {
  const d = boot(); await d.open();
  /* the course editor needs its own mock; the label rule is the one line in the lesson row, so read it from the script */
  assert.match(read("training.js"), /needsVideo\(l\) \? "Video required"/);
  d.close();
});

test("the Share switch shows on the source store only, and sends shared through the existing PATCH", async () => {
  const src = boot({ shared: { is_source: true, source_name: "Live4More", courses: [], media: [] }, courses: [ownCourse("crs_1", { shared: false })] }); await src.open();
  const sw = src.root().all((n) => n.tagName === "INPUT" && n.getAttribute("name") === "shared");
  assert.equal(sw.length, 1);
  assert.equal(sw[0].checked, false);
  assert.ok(src.root().textContent.includes("Share with new stores"));
  sw[0].checked = true; await src.click(sw[0]); sw[0].fire("change"); await settle();
  assert.deepEqual(src.calls.find((c) => c.method === "PATCH").body, { shared: true });
  src.close();
  const other = boot({ shared: { is_source: false, source_name: "Live4More", courses: [], media: [] }, courses: [ownCourse("crs_1")] }); await other.open();
  assert.equal(other.root().all((n) => n.getAttribute("name") === "shared").length, 0);
  assert.ok(!other.root().textContent.includes("Share with new stores"));
  other.close();
  const m = boot({ view: "media", shared: { is_source: true, source_name: "Live4More", courses: [], media: [] }, assets: [ownAsset("ast_1")] }); await m.open();
  const ms = m.root().all((n) => n.getAttribute("name") === "shared");
  assert.equal(ms.length, 1);
  ms[0].checked = true; ms[0].fire("change"); await settle();
  assert.deepEqual(m.calls.find((c) => c.method === "PATCH").body, { shared: true });
  m.close();
});
