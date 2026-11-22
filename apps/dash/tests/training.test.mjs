/* The Subscriber Training editor (ClickUp z8uq9mezdj, training.js: /training/, /training/course/?id=, /training/live/). Driven like notices.test.mjs: the real
   scripts run in a vm with the stand-in document from dom.mjs and a recorded fetch that plays the owner API of apps/training. Fake data only. */
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
const T = `/sites/${A}/training/`;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };
const BLOB = "https://abc123.public.blob.vercel-storage.com/training/a.png";
const err = (status, code, message, fields) => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });

const lesson = (id, over = {}) => ({ id, module_id: "mod_1", title: "Lesson " + id, duration: "", description: "", video_url: null, image_url: null, order: 1, active: true, ...over });
const EMBED = "https://iframe.mediadelivery.net/embed/816560/0a1b2c3d-4e5f-6789-abcd-0123456789ab";
const vid = (over = {}) => ({ kind: "stream", status: "ready", embed_url: EMBED, needs_video: false, ...over });
const NO_VIDEO = { kind: "none", status: "", embed_url: "", needs_video: false };
const module_ = (id, lessons = [], over = {}) => ({ id, course_id: "crs_1", title: "Module " + id, order: 1, active: true, lessons, ...over });
const course = (id, over = {}) => ({ id, title: "Course " + id, slug: id, description: "", image_url: null, order: 1, active: true, archived_at: null,
  module_count: 0, lesson_count: 0, active_lesson_count: 0, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", ...over });
const live = (id, over = {}) => ({ id, title: "Live " + id, starts_at: new Date(Date.now() + 86400000).toISOString(), duration_minutes: 60, description: "", join_url: null,
  thumbnail_url: null, active: true, ...over });

function boot({ view = "training", courses = [], tree = null, lives = [], off = null, search = "" } = {}) {
  const doc = makeDocument(), calls = [], toasts = [], went = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; return n; };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["tr-root", "tc-root", "tl-root", "tr-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const nav = [0, 1, 2].map(() => { const a = doc.createElement("a"); a.setAttribute("data-training-nav", ""); a.hidden = true; page.appendChild(a); return a; });
  doc.querySelectorAll = (sel) => (sel === "[data-training-nav]" ? nav : []);
  const s = { courses: courses.map((c) => ({ ...c })), tree, lives: lives.map((l) => ({ ...l })), off, next: 100, answer: null, imageAnswer: null,
    upload: null, videoReads: [], watch: null, tus: null };
  const ok = (body, status = 200) => ({ status, body });
  const fetch = (url, opts) => {
    if (!url.startsWith("http://api.test/v1")) { /* the Bunny TUS host: the test plays it through s.tus(method, url, headers, body) -> {status, headers} */
      calls.push({ method: opts.method, path: url, tus: true, headers: opts.headers, size: opts.body ? opts.body.size : 0, body: null });
      const r = s.tus ? s.tus(opts.method, url, opts.headers, opts.body) : { status: 500, headers: {} };
      return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: (k) => (r.headers || {})[k] ?? null } });
    }
    const p = url.replace("http://api.test/v1", "");
    const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
    const body = opts.body && !isForm ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body, form: isForm ? opts.body : null });
    let a = err(404, "not_found", "Not found.");
    const rest = p.startsWith(T) ? p.slice(T.length) : null, seg = rest ? rest.split("/").filter(Boolean) : [];
    if (opts.method === "GET" && p === "/sites/") a = ok({ items: [{ id: A, template: "sante" }], next_cursor: null });
    else if (s.off && rest !== null) a = s.off;
    else if (rest !== null && opts.method === "GET" && rest === "courses/") a = ok({ courses: s.courses });
    else if (rest !== null && opts.method === "GET" && seg[0] === "courses" && seg.length === 2) a = s.tree && s.tree.id === seg[1] ? ok(s.tree) : err(404, "not_found", "Not found.");
    else if (rest === "courses/" && opts.method === "POST") a = s.answer || (() => { const c = course("crs_" + ++s.next, { title: body.title, active: false }); s.courses.push(c); return ok(c, 201); })();
    else if (rest === "courses/reorder/") { s.courses = body.ids.map((i) => s.courses.find((c) => c.id === i)); a = ok({ courses: s.courses }); }
    else if (seg[0] === "courses" && seg.length === 2 && opts.method === "PATCH") {
      const c = (s.tree && s.tree.id === seg[1] ? s.tree : s.courses.find((x) => x.id === seg[1]));
      if (s.answer) a = s.answer;
      else if (c) { const { archived, ...rest2 } = body; Object.assign(c, rest2); if (archived === true) { c.archived_at = "2026-11-02T00:00:00Z"; c.active = false; } if (archived === false) c.archived_at = null; const row = { ...c }; delete row.modules; a = ok(row); }
    } else if (seg[0] === "courses" && seg.length === 2 && opts.method === "DELETE") { s.courses = s.courses.filter((c) => c.id !== seg[1]); a = ok({ status: "deleted" }); }
    else if (seg[0] === "courses" && seg[2] === "image") a = s.imageAnswer || ok(course(seg[1], { image_url: opts.method === "POST" ? BLOB : null }));
    else if (seg[0] === "courses" && seg[2] === "modules" && seg[3] === "reorder") { s.tree.modules = body.ids.map((i) => s.tree.modules.find((m) => m.id === i)); a = ok({ modules: s.tree.modules }); }
    else if (seg[0] === "courses" && seg[2] === "modules" && opts.method === "POST") { const m = module_("mod_" + ++s.next, [], { title: body.title }); s.tree.modules.push(m); a = ok(m, 201); }
    else if (seg[0] === "modules" && seg.length === 2 && opts.method === "PATCH") { const m = s.tree.modules.find((x) => x.id === seg[1]); a = s.answer || (Object.assign(m, body), ok(m)); }
    else if (seg[0] === "modules" && seg.length === 2 && opts.method === "DELETE") { s.tree.modules = s.tree.modules.filter((m) => m.id !== seg[1]); a = ok({ status: "deleted" }); }
    else if (seg[0] === "modules" && seg[2] === "lessons" && seg[3] === "reorder") { const m = s.tree.modules.find((x) => x.id === seg[1]); m.lessons = body.ids.map((i) => m.lessons.find((l) => l.id === i)); a = ok({ lessons: m.lessons }); }
    else if (seg[0] === "modules" && seg[2] === "lessons" && opts.method === "POST") { const m = s.tree.modules.find((x) => x.id === seg[1]); const l = lesson("les_" + ++s.next, { ...body, module_id: m.id }); if (s.answer) a = s.answer; else { m.lessons.push(l); a = ok(l, 201); } }
    else if (seg[0] === "lessons" && seg.length === 2 && opts.method === "PATCH") { let l; s.tree.modules.forEach((m) => m.lessons.forEach((x) => { if (x.id === seg[1]) l = x; })); a = s.answer || (Object.assign(l, body), ok(l)); }
    else if (seg[0] === "lessons" && seg.length === 2 && opts.method === "DELETE") { s.tree.modules.forEach((m) => { m.lessons = m.lessons.filter((x) => x.id !== seg[1]); }); a = ok({ status: "deleted" }); }
    else if (seg[0] === "lessons" && seg[2] === "video" && seg[3] === "upload" && opts.method === "POST") a = s.upload || err(503, "video_unavailable", "Video uploads are not available yet.");
    else if (seg[0] === "lessons" && seg[2] === "video" && opts.method === "GET") a = s.videoReads.length > 1 ? ok({ video: s.videoReads.shift() }) : s.videoReads.length ? ok({ video: s.videoReads[0] }) : err(404, "not_found", "Not found.");
    else if (seg[0] === "courses" && seg[2] === "watch" && opts.method === "GET") a = s.watch || err(404, "not_found", "Not found.");
    else if (seg[0] === "lessons" && seg[2] === "image") { let l; s.tree.modules.forEach((m) => m.lessons.forEach((x) => { if (x.id === seg[1]) l = x; })); a = s.imageAnswer || (l.image_url = opts.method === "POST" ? BLOB : null, ok(l)); }
    else if (rest === "live/" && opts.method === "GET") a = ok({ live: s.lives });
    else if (rest === "live/" && opts.method === "POST") a = s.answer || (() => { const l = live("liv_" + ++s.next, { ...body, join_url: body.join_url }); s.lives.push(l); return ok(l, 201); })();
    else if (seg[0] === "live" && seg.length === 2 && opts.method === "PATCH") { const l = s.lives.find((x) => x.id === seg[1]); a = s.answer || (Object.assign(l, body), ok(l)); }
    else if (seg[0] === "live" && seg.length === 2 && opts.method === "DELETE") { s.lives = s.lives.filter((x) => x.id !== seg[1]); a = ok({ status: "deleted" }); }
    else if (seg[0] === "live" && seg[2] === "thumbnail") { const l = s.lives.find((x) => x.id === seg[1]); a = s.imageAnswer || (l.thumbnail_url = opts.method === "POST" ? BLOB : null, ok(l)); }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const winOn = {};
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener: (t, f) => { (winOn[t] = winOn[t] || []).push(f); }, removeEventListener() {}, innerHeight: 800 };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const location = { search, pathname: "/training/", replace() {}, assign(u) { went.push(u); } };
  const history = { pushState(a, b, u) { const q = u.indexOf("?"); location.pathname = q < 0 ? u : u.slice(0, q); location.search = q < 0 ? "" : u.slice(q); } };
  const quick = (f, ms) => setTimeout(f, ms >= 500 ? 0 : ms); /* the 3 second video poll and the upload retry waits do not slow the tests */
  const context = vm.createContext({ window, document: doc, location, history, console, URLSearchParams, Promise, setTimeout: quick, clearTimeout, Intl, Uint8Array, Date, URL,
    FormData, File, Blob, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("tus.js"), context, { filename: "tus.js" });
  vm.runInContext(read("training.js"), context, { filename: "training.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  window.NODash.go = (u) => went.push(u);
  const rootId = { training: "tr-root", "training-course": "tc-root", "training-live": "tl-root" }[view];
  const $ = (id) => doc.getElementById(id);
  const all = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label) => buttons(n).find((b) => b.textContent === label);
  const root = () => $(rootId);
  return { doc, calls, toasts, went, s, $, all, buttons, press, nav, window, root, location, winOn,
    list: () => calls.map((c) => c.method + " " + c.path),
    async open() { window.NOTraining.show(view); await settle(); },
    async click(node) { node.fire("click"); await settle(); },
    set(id, v) { $(id).value = v; },
    check(id, v) { $(id).checked = v; } };
}
const rowOf = (d, attr, id) => d.root().all((n) => n.getAttribute(attr) === id)[0];
const chips = (n) => n.all((x) => x.classList.contains("chip")).map((c) => c.textContent);
const titles = (d, tag) => d.root().all((n) => n.tagName === tag).map((n) => n.textContent);
const links = (n) => n.all((x) => x.tagName === "A").map((a) => [a.textContent, a.getAttribute("href")]);

const FULL = () => course("crs_1", { title: "Start here", description: "Welcome", module_count: 2, lesson_count: 3, active_lesson_count: 3, modules: [
  module_("mod_1", [lesson("les_1", { title: "Intro", duration: "6:30", video_url: "https://www.youtube.com/embed/abcdefghijk", order: 1 }), lesson("les_2", { title: "Second", order: 2 })]),
  module_("mod_2", [lesson("les_3", { title: "Third", module_id: "mod_2" })], { order: 2 })] });

/* ---------- pure helpers ---------- */

test("the video helpers read the API's video block, and only frame or send to https (or this computer's own preview names)", async () => {
  const d = boot(); await d.open();
  const u = d.window.NOTraining.util;
  assert.equal(u.hasVideo({ video: vid() }), true);
  assert.equal(u.hasVideo({ video: { kind: "legacy", status: "", embed_url: "", needs_video: false }, video_url: "https://www.youtube.com/embed/abcdefghijk" }), true);
  assert.equal(u.hasVideo({ video: NO_VIDEO }), false);
  assert.equal(u.hasVideo({ video_url: "https://www.youtube.com/embed/abcdefghijk" }), true, "an older answer with no video block");
  assert.equal(u.hasVideo({ video_url: null }), false);
  assert.equal(u.needsVideo({ video: { ...NO_VIDEO, needs_video: true } }), true);
  assert.equal(u.needsVideo({ needs_video: true }), true);
  assert.equal(u.embedOk(EMBED), true);
  assert.equal(u.embedOk("http://iframe.mediadelivery.net/embed/1/x"), false);
  assert.equal(u.embedOk("http://127.0.0.1:8031/embed/1/x"), true);
  assert.equal(u.embedOk("http://www.negosyotest.com:8031/embed/1/x"), true);
  assert.equal(u.embedOk("http://evil.test/embed/1/x"), false);
  assert.equal(u.embedOk("javascript:alert(1)"), false);
  assert.equal(u.embedOk("https://user@evil.test/x"), false);
  const up = { endpoint: "https://video.bunnycdn.com/tusupload", library_id: 816560, video_id: "g", signature: "s", expires: 1 };
  assert.equal(u.uploadOk(up), true);
  for (const bad of [{ ...up, endpoint: "http://evil.test/tus" }, { ...up, signature: "" }, { ...up, video_id: "" }, { ...up, library_id: null }, { ...up, expires: undefined }, null]) assert.equal(u.uploadOk(bad), false);
  assert.equal(u.toEmbed, undefined, "the link helper is gone with the link field");
});

test("Philippine time converts both ways and a time that does not exist is refused", () => {
  const d = boot();
  const { toIso, toLocal } = d.window.NOTraining.util;
  assert.equal(toIso("2026-11-20T09:30"), "2026-11-20T01:30:00.000Z");
  assert.equal(toLocal("2026-11-20T01:30:00.000Z"), "2026-11-20T09:30");
  assert.equal(toIso(""), null);
  assert.equal(toIso("2026-13-20T09:30"), undefined);
  assert.equal(toIso("tomorrow"), undefined);
});

test("moved swaps a course with its visible neighbour and keeps the hidden ones where they are", () => {
  const d = boot();
  const { moved } = d.window.NOTraining.util;
  assert.deepEqual(moved(["a", "x", "b", "c"], ["a", "b", "c"], "b", -1), ["b", "x", "a", "c"]);
  assert.deepEqual(moved(["a", "b"], ["a", "b"], "b", 1), null);
  assert.deepEqual(moved(["a", "b"], ["a", "b"], "a", -1), null);
});

/* ---------- wiring ---------- */

test("index.html: the Training views, roots, script and stylesheet are in the page, and every Training link starts hidden", () => {
  for (const id of ["view-training", "view-training-course", "view-training-live", "tr-root", "tc-root", "tl-root"]) assert.ok(HTML.includes(`id="${id}"`), id);
  assert.ok(HTML.includes("/assets/js/training.js") && HTML.includes("/assets/css/training.css"));
  const trainingLinks = [...HTML.matchAll(/<a\b[^>]*href="\/training\/"[^>]*>/g)].map((m) => m[0]);
  assert.equal(trainingLinks.length, 2, "one in the sidebar, one in the More sheet");
  for (const l of trainingLinks) assert.ok(/data-training-nav/.test(l) && /\bhidden\b/.test(l), l);
  assert.ok(HTML.indexOf('href="/training/"') < HTML.indexOf('href="/settings/business/" id="settings-link"'), "Training sits before Settings in the sidebar");
  assert.ok(HTML.indexOf("data-training-nav hidden>Training</h3>") < HTML.indexOf('<h3 class="sheet-label">Settings</h3>'), "the Training group comes before the Settings group in the More sheet");
});

test("dashboard.js: the three routes, the enter/leave hooks, the probe, the query-friendly link handler and D.go", () => {
  const dash = read("dashboard.js");
  assert.match(dash, /"\/training\/": \{ view: "training"/);
  assert.match(dash, /"\/training\/course\/": \{ view: "training-course", nav: "training"/);
  assert.match(dash, /"\/training\/live\/": \{ view: "training-live", nav: "training"/);
  assert.match(dash, /"training", "training-course", "training-live"/);
  assert.match(dash, /NOTraining/);
  assert.match(dash, /window\.NOTraining\.probe\(\)/);
  assert.match(dash, /D\.go = go/);
  assert.match(dash, /href\.indexOf\("\/training\/"\) === 0 \? href\.split\("\?"\)\[0\]/);
});

/* ---------- probe and gates ---------- */

test("probe shows the Training links only when the courses read answers 200", async () => {
  const d = boot();
  d.window.NOTraining.probe(); await settle();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + T + "courses/"]);
  assert.deepEqual(d.nav.map((n) => n.hidden), [false, false, false]);
  const off = boot({ off: err(404, "not_found", "Not found.") });
  off.window.NOTraining.probe(); await settle();
  assert.deepEqual(off.nav.map((n) => n.hidden), [true, true, true]);
});

test("a 404 on any Training page says Training is not available yet and keeps the links hidden", async () => {
  for (const view of ["training", "training-live"]) {
    const d = boot({ view, off: err(404, "not_found", "Not found.") });
    await d.open();
    assert.ok(d.root().textContent.includes("Training is not available yet"), view);
    assert.deepEqual(d.nav.map((n) => n.hidden), [true, true, true]);
  }
});

test("a 403 shows the API's sentence, and a failed load offers Try again", async () => {
  const d = boot({ off: err(403, "billing_only", "Billing is the only part open to you right now.") });
  await d.open();
  assert.ok(d.root().textContent.includes("Billing is the only part open to you right now."));
  assert.ok(d.press(d.root(), "Try again"));
});

/* ---------- /training/ ---------- */

test("the list shows Courses, Archive and Live trainings as linked tabs, each course with its status, counts and actions; archived courses are on the Archive tab only", async () => {
  const d = boot({ courses: [course("crs_1", { module_count: 2, lesson_count: 5, active_lesson_count: 4 }), course("crs_2", { active: false }), course("crs_3", { archived_at: "2026-11-02T00:00:00Z", active: false })] });
  await d.open();
  assert.deepEqual(links(d.root()).slice(0, 3), [["Courses", "/training/"], ["Archive", "/training/?tab=archive"], ["Live trainings", "/training/live/"]]);
  assert.equal(d.root().all((n) => n.tagName === "A" && n.getAttribute("aria-current") === "page")[0].textContent, "Courses");
  assert.deepEqual(titles(d, "H3"), ["Course crs_1", "Course crs_2"]);
  assert.deepEqual(chips(rowOf(d, "data-course", "crs_1")), ["On"]);
  assert.deepEqual(chips(rowOf(d, "data-course", "crs_2")), ["Off"]);
  assert.ok(rowOf(d, "data-course", "crs_1").textContent.includes("2 modules · 5 lessons (4 on)"));
  assert.deepEqual(d.buttons(rowOf(d, "data-course", "crs_1")).map((b) => b.textContent), ["Up", "Down", "Turn off", "Archive", "Delete"]);
  assert.ok(rowOf(d, "data-course", "crs_1").all((n) => n.tagName === "BUTTON" && n.textContent === "Up")[0].disabled, "the first course cannot go up");
  assert.deepEqual(links(rowOf(d, "data-course", "crs_1")), [["Edit", "/training/course/?id=crs_1"]]);
  assert.deepEqual(d.nav.map((n) => n.hidden), [false, false, false]);
  /* the Archive tab changes only the list, with no new request */
  d.root().all((n) => n.tagName === "A" && n.textContent === "Archive")[0].fire("click");
  assert.deepEqual(titles(d, "H3"), ["Course crs_3"]);
  assert.deepEqual(d.buttons(rowOf(d, "data-course", "crs_3")).map((b) => b.textContent), ["Restore", "Delete"]);
  assert.equal(d.location.search, "?tab=archive");
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + T + "courses/"]);
});

test("the course texts reach the page as text, never as markup", async () => {
  const d = boot({ courses: [course("crs_1", { title: "<img src=x onerror=alert(1)>", image_url: "javascript:alert(1)" })] });
  await d.open();
  assert.equal(titles(d, "H3")[0], "<img src=x onerror=alert(1)>");
  assert.equal(d.root().all((n) => n.tagName === "IMG").length, 0, "a picture from anywhere but https is not drawn");
});

test("Up and Down send every course id in the new order", async () => {
  const d = boot({ courses: [course("crs_1"), course("crs_2"), course("crs_3")] });
  await d.open();
  await d.click(d.buttons(rowOf(d, "data-course", "crs_2")).find((b) => b.textContent === "Up"));
  const post = d.calls.find((c) => c.path === T + "courses/reorder/");
  assert.deepEqual(post.body, { ids: ["crs_2", "crs_1", "crs_3"] });
  assert.deepEqual(titles(d, "H3"), ["Course crs_2", "Course crs_1", "Course crs_3"]);
});

test("Turn off, Archive and Restore PATCH the course", async () => {
  const d = boot({ courses: [course("crs_1")] });
  await d.open();
  await d.click(d.press(rowOf(d, "data-course", "crs_1"), "Turn off"));
  assert.deepEqual(d.calls.find((c) => c.method === "PATCH").body, { active: false });
  assert.deepEqual(chips(rowOf(d, "data-course", "crs_1")), ["Off"]);
  await d.click(d.press(rowOf(d, "data-course", "crs_1"), "Archive"));
  assert.deepEqual(d.calls.filter((c) => c.method === "PATCH")[1].body, { archived: true });
  assert.equal(rowOf(d, "data-course", "crs_1"), undefined, "it left the Courses tab");
  d.root().all((n) => n.tagName === "A" && n.textContent === "Archive")[0].fire("click");
  await d.click(d.press(rowOf(d, "data-course", "crs_1"), "Restore"));
  assert.deepEqual(d.calls.filter((c) => c.method === "PATCH")[2].body, { archived: false });
});

test("delete asks twice, then removes the course", async () => {
  const d = boot({ courses: [course("crs_1"), course("crs_2")] });
  await d.open();
  await d.click(d.press(rowOf(d, "data-course", "crs_1"), "Delete"));
  assert.equal(d.calls.filter((c) => c.method === "DELETE").length, 0);
  await d.click(d.press(rowOf(d, "data-course", "crs_1"), "Confirm delete"));
  assert.deepEqual(d.calls.filter((c) => c.method === "DELETE").map((c) => c.path), [T + "courses/crs_1/"]);
  assert.equal(rowOf(d, "data-course", "crs_1"), undefined);
  assert.ok(rowOf(d, "data-course", "crs_2"));
});

test("New course asks for a title only, creates the course off, and opens its editor", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "New course"));
  await d.click(d.press(d.root(), "Create course"));
  assert.equal(d.$("tr-new-title-err").textContent, "Enter a title.");
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 0);
  d.set("tr-new-title", "  How to use the app  ");
  await d.click(d.press(d.root(), "Create course"));
  const post = d.calls.find((c) => c.method === "POST");
  assert.deepEqual(post.body, { title: "How to use the app" });
  assert.deepEqual(d.went, ["/training/course/?id=crs_101"]);
});

test("the server's field message shows under the title and the typed text stays", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "New course"));
  d.set("tr-new-title", "Ok");
  d.s.answer = err(400, "invalid_request", "Some values are missing or invalid.", { title: ["Use 1 to 120 characters."] });
  await d.click(d.press(d.root(), "Create course"));
  assert.equal(d.$("tr-new-title-err").textContent, "Use 1 to 120 characters.");
  assert.equal(d.$("tr-new-title").value, "Ok");
});

/* ---------- /training/course/?id= ---------- */

test("the course editor shows the details, then each module with its lessons in order", async () => {
  const d = boot({ view: "training-course", tree: FULL(), search: "?id=crs_1" });
  await d.open();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + T + "courses/crs_1/", "GET " + T + "courses/crs_1/watch/"]);
  assert.equal(d.$("tr-title").value, "Start here");
  assert.equal(d.$("tr-description").value, "Welcome");
  assert.equal(d.$("tr-active").checked, true);
  const mods = d.root().all((n) => n.getAttribute("data-module"));
  assert.deepEqual(mods.map((m) => m.getAttribute("data-module")), ["mod_1", "mod_2"]);
  assert.deepEqual(mods[0].all((n) => n.tagName === "H4").map((n) => n.textContent), ["Intro", "Second"]);
  assert.ok(mods[0].textContent.includes("6:30 · Video"));
  assert.ok(mods[0].textContent.includes("No video"));
});

test("a missing or malformed id says the course can't be found, and makes no course call", async () => {
  const none = boot({ view: "training-course", search: "" });
  await none.open();
  assert.ok(none.root().textContent.includes("We can’t find that course"));
  assert.deepEqual(none.list(), ["GET /sites/"]);
  const bad = boot({ view: "training-course", search: "?id=../x" });
  await bad.open();
  assert.ok(bad.root().textContent.includes("We can’t find that course"));
  const gone = boot({ view: "training-course", search: "?id=crs_9", tree: FULL() });
  await gone.open();
  assert.ok(gone.root().textContent.includes("We can’t find that course"));
});

test("saving the course sends title, description and active, trimmed; a picture goes up after it", async () => {
  const d = boot({ view: "training-course", tree: FULL(), search: "?id=crs_1" });
  await d.open();
  d.set("tr-title", "  New title ");
  d.set("tr-description", " About ");
  d.check("tr-active", false);
  d.$("tr-cover-file").files = [new File(["x"], "a.png", { type: "image/png" })];
  await d.click(d.press(d.root(), "Save course"));
  const patch = d.calls.find((c) => c.method === "PATCH");
  assert.equal(patch.path, T + "courses/crs_1/");
  assert.deepEqual(patch.body, { title: "New title", description: "About", active: false });
  const up = d.calls.find((c) => c.path === T + "courses/crs_1/image/");
  assert.equal(up.method, "POST");
  assert.ok(up.form.get("file"));
  assert.ok(d.toasts.some((t) => t.startsWith("Saved")));
  assert.equal(d.root().all((n) => n.getAttribute("data-module")).length, 2, "the modules stay on the page");
});

test("a picture of the wrong type or over 2 MB is refused here with no call, and the title is checked", async () => {
  const d = boot({ view: "training-course", tree: FULL(), search: "?id=crs_1" });
  await d.open();
  d.$("tr-cover-file").files = [new File(["x"], "a.gif", { type: "image/gif" })];
  await d.click(d.press(d.root(), "Save course"));
  assert.equal(d.$("tr-cover-file-err").textContent, "Use a JPEG, PNG or WebP picture.");
  d.$("tr-cover-file").files = [{ type: "image/png", size: 3 * 1024 * 1024 }];
  await d.click(d.press(d.root(), "Save course"));
  assert.ok(d.$("tr-cover-file-err").textContent.includes("2 MB"));
  d.$("tr-cover-file").files = [];
  d.set("tr-title", "");
  await d.click(d.press(d.root(), "Save course"));
  assert.equal(d.$("tr-title-err").textContent, "Enter a title.");
  assert.equal(d.calls.filter((c) => c.method === "PATCH").length, 0);
});

test("when the image store is not set up the course is kept and the picture sentence shows", async () => {
  const d = boot({ view: "training-course", tree: FULL(), search: "?id=crs_1" });
  await d.open();
  d.s.imageAnswer = err(503, "image_store_not_configured", "Pictures cannot be stored yet.");
  d.$("tr-cover-file").files = [new File(["x"], "a.png", { type: "image/png" })];
  await d.click(d.press(d.root(), "Save course"));
  assert.equal(d.$("tr-cover-file-err").textContent, "Picture upload is not set up yet. It was saved without the picture.");
  assert.ok(d.toasts.some((t) => t.startsWith("Saved, but the picture was not added")));
});

test("adding a module sends its title and the page shows it", async () => {
  const d = boot({ view: "training-course", tree: FULL(), search: "?id=crs_1" });
  await d.open();
  await d.click(d.press(d.root(), "Add module"));
  assert.equal(d.$("tr-newmod-err").textContent, "Enter a title.");
  d.set("tr-newmod", " Week 1 ");
  await d.click(d.press(d.root(), "Add module"));
  const post = d.calls.find((c) => c.method === "POST");
  assert.equal(post.path, T + "courses/crs_1/modules/");
  assert.deepEqual(post.body, { title: "Week 1" });
  assert.equal(d.root().all((n) => n.getAttribute("data-module")).length, 3);
});

test("saving a module sends its title and active; Up and Down send every module id; delete asks twice", async () => {
  const d = boot({ view: "training-course", tree: FULL(), search: "?id=crs_1" });
  await d.open();
  const mod = (id) => d.root().all((n) => n.getAttribute("data-module") === id)[0];
  mod("mod_1").all((n) => n.tagName === "INPUT" && n.getAttribute("name") === "title")[0].value = "Renamed";
  await d.click(d.press(mod("mod_1"), "Save module"));
  assert.deepEqual(d.calls.find((c) => c.path === T + "modules/mod_1/").body, { title: "Renamed", active: true });
  await d.click(d.buttons(mod("mod_2")).find((b) => b.textContent === "Up"));
  assert.deepEqual(d.calls.find((c) => c.path === T + "courses/crs_1/modules/reorder/").body, { ids: ["mod_2", "mod_1"] });
  assert.deepEqual(d.root().all((n) => n.getAttribute("data-module")).map((m) => m.getAttribute("data-module")), ["mod_2", "mod_1"]);
  await d.click(d.press(mod("mod_1"), "Delete module"));
  assert.equal(d.calls.filter((c) => c.method === "DELETE").length, 0);
  assert.ok(mod("mod_1").textContent.includes("deletes the module and its 2 lessons"));
  await d.click(d.press(mod("mod_1"), "Confirm delete"));
  assert.deepEqual(d.calls.filter((c) => c.method === "DELETE").map((c) => c.path), [T + "modules/mod_1/"]);
  assert.equal(mod("mod_1"), undefined);
});

test("adding a lesson sends the whole form, with no video link in it, and the form has no link field", async () => {
  const d = boot({ view: "training-course", tree: FULL(), search: "?id=crs_1" });
  await d.open();
  const mod = d.root().all((n) => n.getAttribute("data-module") === "mod_2")[0];
  await d.click(d.press(mod, "Add lesson"));
  assert.equal(d.$("tr-lv"), null, "the link field is gone");
  assert.ok(!d.root().textContent.includes("YouTube") && !d.root().textContent.includes("Vimeo") && !d.root().textContent.includes("Video link"));
  d.set("tr-lt", "  Fourth ");
  d.set("tr-ld", "12:00");
  d.set("tr-ldesc", " Notes ");
  await d.click(d.press(d.root(), "Save lesson"));
  const post = d.calls.find((c) => c.method === "POST");
  assert.equal(post.path, T + "modules/mod_2/lessons/");
  assert.deepEqual(post.body, { title: "Fourth", duration: "12:00", description: "Notes", active: true });
  assert.ok(d.root().all((n) => n.tagName === "H4").map((n) => n.textContent).includes("Fourth"));
  assert.equal(d.$("tr-lt"), null, "the lesson form closed");
});

test("a lesson title is required, and the API's field message shows under the title", async () => {
  const d = boot({ view: "training-course", tree: FULL(), search: "?id=crs_1" });
  await d.open();
  const mod = d.root().all((n) => n.getAttribute("data-module") === "mod_2")[0];
  await d.click(d.press(mod, "Add lesson"));
  await d.click(d.press(d.root(), "Save lesson"));
  assert.equal(d.$("tr-lt-err").textContent, "Enter a title.");
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 0);
  d.set("tr-lt", "Five");
  d.s.answer = err(400, "invalid_request", "Some values are missing or invalid.", { title: ["Too long."] });
  await d.click(d.press(d.root(), "Save lesson"));
  assert.equal(d.$("tr-lt-err").textContent, "Too long.");
});

test("editing a lesson PATCHes it; Up and Down send the module's lesson ids; delete asks twice; a lesson picture can be added", async () => {
  const d = boot({ view: "training-course", tree: FULL(), search: "?id=crs_1" });
  await d.open();
  const row = (id) => d.root().all((n) => n.getAttribute("data-lesson") === id)[0];
  await d.click(d.press(row("les_2"), "Edit"));
  assert.equal(d.$("tr-lt").value, "Second");
  d.set("tr-lt", "Second, again");
  d.check("tr-lon", false);
  d.$("tr-lp-file").files = [new File(["x"], "a.jpg", { type: "image/jpeg" })];
  await d.click(d.press(d.root(), "Save lesson"));
  assert.deepEqual(d.calls.find((c) => c.path === T + "lessons/les_2/").body, { title: "Second, again", duration: "", description: "", active: false });
  assert.equal(d.calls.find((c) => c.path === T + "lessons/les_2/image/").method, "POST");
  await d.click(d.buttons(row("les_2")).find((b) => b.textContent === "Up"));
  assert.deepEqual(d.calls.find((c) => c.path === T + "modules/mod_1/lessons/reorder/").body, { ids: ["les_2", "les_1"] });
  await d.click(d.press(row("les_1"), "Delete"));
  assert.equal(d.calls.filter((c) => c.method === "DELETE").length, 0);
  await d.click(d.press(row("les_1"), "Confirm delete"));
  assert.deepEqual(d.calls.filter((c) => c.method === "DELETE").map((c) => c.path), [T + "lessons/les_1/"]);
  assert.equal(row("les_1"), undefined);
});

/* ---------- the lesson video (CP-1 R2): upload to the store's own Bunny Stream library, processing, preview ---------- */

const UP = { endpoint: "https://video.test/tusupload", library_id: 816560, video_id: "0a1b2c3d-4e5f-6789-abcd-0123456789ab", signature: "sig123", expires: 1790000000 };
const MIB = 1024 * 1024;
const movie = (mib = 5, type = "video/mp4", name = "intro.mp4") => new File([new Uint8Array(mib * MIB)], name, { type });
const videoTree = () => course("crs_1", { title: "Start here", modules: [module_("mod_1", [
  lesson("les_none", { title: "None", video: NO_VIDEO, needs_video: false }),
  lesson("les_need", { title: "Needs", video: { ...NO_VIDEO, needs_video: true }, order: 2 }),
  lesson("les_legacy", { title: "Legacy", video_url: "https://www.youtube.com/embed/abcdefghijk", video: { kind: "legacy", status: "", embed_url: "https://www.youtube.com/embed/abcdefghijk", needs_video: false }, order: 3 }),
  lesson("les_stream", { title: "Stream", video: vid(), order: 4 })])] });
const edit = async (d, id) => { await d.click(d.press(rowOf(d, "data-lesson", id), "Edit")); };
const fileBox = (d) => d.root().all((n) => n.tagName === "INPUT" && n.getAttribute("name") === "video")[0];
const heads = (d) => d.root().all((n) => n.getAttribute("id") === "tr-lv-h").map((n) => n.textContent);
/* A well-behaved TUS server: 201 with a Location, 204 with the new offset; `log` collects what it saw. */
const tusServer = (d, log = [], hook = () => null) => {
  let at = 0;
  d.s.tus = (method, url, headers, body) => {
    const mock = hook(method, url, headers, body, at);
    log.push({ method, url, headers, size: body ? body.size : 0, note: d.root().textContent });
    if (mock) return mock;
    if (method === "POST") return { status: 201, headers: { Location: "https://video.test/tusupload/up1" } };
    if (method === "HEAD") return { status: 200, headers: { "Upload-Offset": String(at) } };
    at += body.size; return { status: 204, headers: { "Upload-Offset": String(at) } };
  };
  return log;
};

test("the lesson form has no link field: no video says Add your video, a legacy link stays shown with Replace with your own video, a ready video shows its preview", async () => {
  const d = boot({ view: "training-course", tree: videoTree(), search: "?id=crs_1" }); await d.open();
  const row = (id) => rowOf(d, "data-lesson", id);
  assert.ok(row("les_none").textContent.includes("No video"));
  assert.ok(row("les_need").textContent.includes("Video required") && !row("les_need").textContent.includes("Add your video"));
  assert.ok(row("les_legacy").textContent.includes("Video") && !row("les_legacy").textContent.includes("No video"));
  assert.ok(row("les_stream").textContent.includes("Video") && !row("les_stream").textContent.includes("No video"));
  await edit(d, "les_none");
  assert.deepEqual(heads(d), ["Add your video"]);
  assert.ok(d.press(d.root(), "Upload video"));
  assert.equal(d.root().all((n) => n.tagName === "IFRAME").length, 0);
  assert.equal(fileBox(d).getAttribute("accept"), "video/*");
  await d.click(d.press(d.root(), "Cancel"));
  await edit(d, "les_legacy");
  assert.deepEqual(heads(d), ["Replace with your own video"]);
  assert.ok(d.root().textContent.includes("https://www.youtube.com/embed/abcdefghijk"), "the current video stays shown");
  assert.equal(d.root().all((n) => n.tagName === "IFRAME").length, 0, "no YouTube frame: the page only frames the Stream host");
  await d.click(d.press(d.root(), "Cancel"));
  await edit(d, "les_stream");
  assert.deepEqual(heads(d), ["Replace with your own video"]);
  const frames = d.root().all((n) => n.tagName === "IFRAME");
  assert.equal(frames.length, 1);
  assert.equal(frames[0].getAttribute("src"), EMBED, "the embed the API returned, never built from a library id");
});

test("Upload video: the API makes the video, the file goes to the signed TUS address in chunks with Uploading… N%, then Processing… until ready, then the preview", async () => {
  const d = boot({ view: "training-course", tree: videoTree(), search: "?id=crs_1" }); await d.open();
  d.s.upload = { status: 201, body: { upload: UP, video: vid({ status: "uploading", embed_url: "" }) } };
  d.s.videoReads = [vid({ status: "processing" }), vid({ status: "ready" })];
  const log = tusServer(d);
  await edit(d, "les_none");
  const box = fileBox(d);
  box.files = [movie()];
  box.fire("change");
  await settle(); for (let i = 0; i < 30; i++) await tick();
  const post = d.calls.find((c) => c.path === T + "lessons/les_none/video/upload/");
  assert.equal(post.method, "POST");
  const tus = log;
  assert.deepEqual(tus.map((x) => x.method), ["POST", "PATCH", "PATCH", "PATCH"]);
  assert.equal(tus[0].headers.AuthorizationSignature, "sig123");
  assert.equal(tus[0].headers.AuthorizationExpire, "1790000000");
  assert.equal(tus[0].headers.VideoId, UP.video_id);
  assert.equal(tus[0].headers.LibraryId, "816560");
  assert.equal(tus[0].headers["Upload-Length"], String(5 * MIB));
  assert.equal(tus[0].headers["Tus-Resumable"], "1.0.0");
  assert.equal(tus[0].headers["Upload-Metadata"], "filetype dmlkZW8vbXA0,title aW50cm8ubXA0");
  assert.deepEqual(tus.slice(1).map((x) => [x.headers["Upload-Offset"], x.size]), [["0", 2 * MIB], [String(2 * MIB), 2 * MIB], [String(4 * MIB), MIB]]);
  assert.ok(tus[1].note.includes("Uploading… 0%"), tus[1].note);
  assert.ok(tus[2].note.includes("Uploading… 40%"));
  assert.ok(tus[3].note.includes("Uploading… 80%"));
  assert.ok(tus.every((x) => x.headers.Cookie === undefined && x.headers.Authorization === undefined), "no cookie or login goes to the upload host");
  assert.equal(d.calls.filter((c) => c.method === "GET" && c.path === T + "lessons/les_none/video/").length, 2, "polled until ready");
  const frames = d.root().all((n) => n.tagName === "IFRAME");
  assert.equal(frames[0].getAttribute("src"), EMBED);
  assert.deepEqual(heads(d), ["Replace with your own video"]);
  assert.ok(!d.root().textContent.includes("Processing…") && !d.root().textContent.includes("Uploading"));
  assert.ok(d.calls.every((c) => c.method !== "PATCH" || c.tus || !c.body || c.body.video_url === undefined), "no video link is ever sent");
});

test("Processing… shows between the last byte and ready, and a closed form shows the state in the lesson row", async () => {
  const d = boot({ view: "training-course", tree: videoTree(), search: "?id=crs_1" }); await d.open();
  d.s.upload = { status: 201, body: { upload: UP, video: vid({ status: "uploading", embed_url: "" }) } };
  d.s.videoReads = [vid({ status: "processing" })]; /* stays processing */
  tusServer(d);
  await edit(d, "les_none");
  fileBox(d).files = [movie(1)]; fileBox(d).fire("change");
  for (let i = 0; i < 30; i++) await tick();
  assert.ok(d.root().textContent.includes("Processing…"));
  await d.click(d.press(d.root(), "Cancel"));
  assert.ok(rowOf(d, "data-lesson", "les_none").textContent.includes("Processing…"), "the row follows the video");
  assert.ok(!rowOf(d, "data-lesson", "les_none").textContent.includes("No video"));
  d.s.videoReads = [vid({ status: "ready" })];
  for (let i = 0; i < 30; i++) await tick();
  assert.ok(rowOf(d, "data-lesson", "les_none").textContent.includes("Video"));
  assert.ok(!rowOf(d, "data-lesson", "les_none").textContent.includes("Processing…"));
});

test("a failed upload says Could not upload. Try again.; the API's own message (store not set up) shows as it is; a file that is not a video is refused", async () => {
  const d = boot({ view: "training-course", tree: videoTree(), search: "?id=crs_1" }); await d.open();
  await edit(d, "les_none");
  fileBox(d).files = [movie(1)]; fileBox(d).fire("change"); await settle();
  assert.ok(d.root().textContent.includes("Video uploads are not available yet."), "the API's 503 sentence");
  assert.ok(d.press(d.root(), "Upload video") && !d.press(d.root(), "Upload video").disabled);
  d.s.upload = { status: 201, body: { upload: UP, video: vid({ status: "uploading", embed_url: "" }) } };
  const log = tusServer(d, [], (m) => (m === "PATCH" ? { status: 403, headers: {} } : null));
  fileBox(d).files = [movie(1)]; fileBox(d).fire("change");
  for (let i = 0; i < 20; i++) await tick();
  assert.ok(d.root().textContent.includes("Could not upload. Try again."));
  assert.equal(log.filter((x) => x.method === "PATCH").length, 1, "a refusal is not retried");
  const before = d.calls.length;
  fileBox(d).files = [movie(1, "application/pdf", "x.pdf")]; fileBox(d).fire("change"); await settle();
  assert.ok(d.root().textContent.includes("Could not upload. Try again."));
  assert.equal(d.calls.length, before, "nothing was sent for a file that is not a video");
  const sent = d.calls.filter((c) => c.tus).length;
  d.s.upload = { status: 201, body: { upload: { ...UP, endpoint: "http://evil.test/tus" }, video: vid({ status: "uploading" }) } };
  fileBox(d).files = [movie(1)]; fileBox(d).fire("change"); await settle();
  assert.ok(d.root().textContent.includes("Could not upload. Try again."));
  assert.equal(d.calls.filter((c) => c.tus).length, sent, "an upload address that is not https is never used");
});

test("Bunny reporting the video failed shows Could not upload. Try again.", async () => {
  const d = boot({ view: "training-course", tree: videoTree(), search: "?id=crs_1" }); await d.open();
  d.s.upload = { status: 201, body: { upload: UP, video: vid({ status: "uploading", embed_url: "" }) } };
  d.s.videoReads = [vid({ status: "failed", embed_url: "" })];
  tusServer(d);
  await edit(d, "les_none");
  fileBox(d).files = [movie(1)]; fileBox(d).fire("change");
  for (let i = 0; i < 30; i++) await tick();
  assert.ok(d.root().textContent.includes("Could not upload. Try again."));
  assert.equal(d.root().all((n) => n.tagName === "IFRAME").length, 0);
});

test("a video chosen on a new lesson goes up right after the lesson is saved, and the form stays open to show it", async () => {
  const d = boot({ view: "training-course", tree: videoTree(), search: "?id=crs_1" }); await d.open();
  d.s.upload = { status: 201, body: { upload: UP, video: vid({ status: "uploading", embed_url: "" }) } };
  d.s.videoReads = [vid({ status: "ready" })];
  const log = tusServer(d);
  await d.click(d.press(rowOf(d, "data-module", "mod_1"), "Add lesson"));
  assert.deepEqual(heads(d), ["Add your video"]);
  d.set("tr-lt", "Fresh");
  fileBox(d).files = [movie(1)]; fileBox(d).fire("change"); await settle();
  assert.ok(d.root().textContent.includes("intro.mp4"));
  assert.equal(d.calls.filter((c) => c.tus).length, 0, "nothing goes up before the lesson exists");
  await d.click(d.press(d.root(), "Save lesson"));
  for (let i = 0; i < 30; i++) await tick();
  const order = d.calls.filter((c) => c.method === "POST").map((c) => c.path);
  assert.equal(order[0], T + "modules/mod_1/lessons/");
  assert.ok(/lessons\/les_\d+\/video\/upload\/$/.test(order[1]));
  assert.equal(log.filter((x) => x.method === "PATCH").length, 1);
  assert.ok(d.$("tr-lt"), "the form is still open");
  assert.equal(d.root().all((n) => n.tagName === "IFRAME")[0].getAttribute("src"), EMBED);
});

test("a video the API says is still processing is followed when the course opens", async () => {
  const tree = videoTree(); tree.modules[0].lessons[0].video = vid({ status: "processing" });
  const d = boot({ view: "training-course", tree, search: "?id=crs_1" });
  d.s.videoReads = [vid({ status: "ready" })];
  await d.open();
  for (let i = 0; i < 20; i++) await tick();
  assert.ok(d.calls.some((c) => c.method === "GET" && c.path === T + "lessons/les_none/video/"));
  assert.ok(!rowOf(d, "data-lesson", "les_none").textContent.includes("Processing…"));
});

/* ---------- the TUS client (tus.js) ---------- */

function tusRun(file, server, opts = {}) {
  const calls = [];
  const fetch = (url, init) => {
    calls.push({ method: init.method, url, headers: init.headers, size: init.body ? init.body.size : 0, credentials: init.credentials });
    const r = server(init.method, url, init.headers, calls.length);
    if (r === "network") return Promise.reject(new Error("offline"));
    return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: (k) => (r.headers || {})[k] ?? null } });
  };
  const win = {};
  vm.runInContext(read("tus.js"), vm.createContext({ window: win, setTimeout, clearTimeout, URL, Promise, Object, String, Number, Math, isFinite, Error }), { filename: "tus.js" });
  const progress = [];
  const u = win.NOTus.upload(file, { endpoint: "https://video.test/tusupload", headers: { VideoId: "v1", LibraryId: 7 }, metadata: { filetype: "video/mp4", title: "Çafé.mp4" }, chunk: 4, fetch, wait: () => Promise.resolve(), onProgress: (p) => progress.push(p), ...opts });
  return { u, calls, progress };
}
const bytes = (n) => new File([new Uint8Array(n)], "a.mp4", { type: "video/mp4" });

test("tus.js: creates the upload with length and metadata, sends chunks at the confirmed offsets, reports progress, keeps the signed headers and sends no cookie", async () => {
  let at = 0;
  const { u, calls, progress } = tusRun(bytes(10), (m) => {
    if (m === "POST") return { status: 201, headers: { Location: "/tusupload/abc" } };
    at += 4 > 10 - at ? 10 - at : 4; return { status: 204, headers: { "Upload-Offset": String(at) } };
  });
  const r = await u.promise;
  assert.equal(r.url, "https://video.test/tusupload/abc");
  assert.deepEqual(calls.map((c) => c.method), ["POST", "PATCH", "PATCH", "PATCH"]);
  assert.equal(calls[0].headers["Upload-Length"], "10");
  assert.equal(calls[0].headers["Upload-Metadata"], "filetype dmlkZW8vbXA0,title w4dhZsOpLm1wNA==");
  assert.deepEqual(calls.slice(1).map((c) => [c.headers["Upload-Offset"], c.size, c.headers["Content-Type"]]), [["0", 4, "application/offset+octet-stream"], ["4", 4, "application/offset+octet-stream"], ["8", 2, "application/offset+octet-stream"]]);
  assert.ok(calls.every((c) => c.headers.VideoId === "v1" && c.headers.LibraryId === "7" && c.headers["Tus-Resumable"] === "1.0.0" && c.credentials === "omit"));
  assert.deepEqual(progress, [40, 80, 100]);
});

test("tus.js: a chunk that fails is retried after asking the server where it got to (HEAD), and resumes from that offset", async () => {
  let at = 0, patches = 0;
  const { u, calls } = tusRun(bytes(10), (m) => {
    if (m === "POST") return { status: 201, headers: { Location: "https://video.test/tusupload/abc" } };
    if (m === "HEAD") return { status: 200, headers: { "Upload-Offset": String(at) } };
    patches++;
    if (patches === 2) return "network"; /* the second chunk never arrives */
    if (patches === 3) { at = 8; return { status: 500 }; } /* the third landed on the server (up to 8) but the answer was lost */
    at += Math.min(4, 10 - at); return { status: 204, headers: { "Upload-Offset": String(at) } };
  });
  await u.promise;
  assert.deepEqual(calls.map((c) => c.method + (c.headers["Upload-Offset"] ? ":" + c.headers["Upload-Offset"] : "")), ["POST", "PATCH:0", "PATCH:4", "HEAD", "PATCH:4", "HEAD", "PATCH:8"]);
});

test("tus.js: a refusal (401, 403, 413) ends it at once; too many failures in a row end it as send; a failed create ends it as create; abort stops it", async () => {
  for (const status of [401, 403, 404, 413]) {
    const { u, calls } = tusRun(bytes(10), (m) => (m === "POST" ? { status: 201, headers: { Location: "/x" } } : { status }));
    await assert.rejects(u.promise, (e) => e.code === "refused" && e.status === status);
    assert.equal(calls.filter((c) => c.method === "PATCH").length, 1);
  }
  const bad = tusRun(bytes(10), (m) => (m === "POST" ? { status: 201, headers: { Location: "/x" } } : m === "HEAD" ? { status: 200, headers: { "Upload-Offset": "0" } } : { status: 503 }), { retries: 2 });
  await assert.rejects(bad.u.promise, (e) => e.code === "send");
  assert.equal(bad.calls.filter((c) => c.method === "PATCH").length, 3);
  const nope = tusRun(bytes(10), () => ({ status: 401 }));
  await assert.rejects(nope.u.promise, (e) => e.code === "create" && e.status === 401);
  const noLoc = tusRun(bytes(10), () => ({ status: 201, headers: {} }));
  await assert.rejects(noLoc.u.promise, (e) => e.code === "create");
  let first = true;
  const stop = tusRun(bytes(10), (m) => (m === "POST" ? { status: 201, headers: { Location: "/x" } } : (first ? ((first = false), stop.u.abort(), { status: 204, headers: { "Upload-Offset": "4" } }) : { status: 204, headers: { "Upload-Offset": "10" } })));
  await assert.rejects(stop.u.promise, (e) => e.code === "aborted");
  assert.equal(stop.calls.filter((c) => c.method === "PATCH").length, 1);
});

/* ---------- Watch progress ---------- */

test("the course editor shows Watch progress: each lesson with its members, the furthest percent watched and Completed where marked; no card when the API has none", async () => {
  const d = boot({ view: "training-course", tree: videoTree(), search: "?id=crs_1" });
  d.s.watch = { status: 200, body: { lessons: [
    { id: "les_none", title: "None", members: [{ member_id: "m1", name: "Ana <b>Cruz</b>", percent: 45, completed: false }, { member_id: "m2", name: "Ben Reyes", percent: 100, completed: true }, { member_id: "m3", name: "Cy Dee", percent: 0, completed: true }] },
    { id: "les_need", title: "Needs", members: [] }, { bad: true }, { id: "les_x", title: "X", members: [{ name: "" }, { name: "Eve", percent: 250 }] }] } };
  await d.open();
  const card = d.root().all((n) => n.getAttribute("id") === "tc-watch")[0];
  assert.ok(card.textContent.startsWith("Watch progress"));
  assert.deepEqual(card.all((n) => n.tagName === "H4").map((n) => n.textContent), ["None", "Needs", "X"]);
  const rows = card.all((n) => n.classList.contains("tr-row")).map((n) => n.textContent);
  assert.deepEqual(rows, ["Ana <b>Cruz</b>Watched 45%", "Ben ReyesWatched 100%Completed", "Cy DeeCompleted", "EveWatched 100%"]);
  assert.equal(card.all((n) => n.classList.contains("chip-ok")).length, 2);
  assert.equal(card.all((n) => n.tagName === "B").length, 0, "a name is text, never markup");
  const none = boot({ view: "training-course", tree: videoTree(), search: "?id=crs_1" }); await none.open();
  assert.equal(none.root().all((n) => n.getAttribute("id") === "tc-watch")[0].childNodes.length, 0);
});

test("the watch view is read-only: it calls GET only, for this course", async () => {
  const d = boot({ view: "training-course", tree: videoTree(), search: "?id=crs_1" });
  d.s.watch = { status: 200, body: { lessons: [] } };
  await d.open();
  assert.deepEqual(d.calls.filter((c) => c.path.includes("/watch/")).map((c) => c.method + " " + c.path), ["GET " + T + "courses/crs_1/watch/"]);
});

test("index.html loads tus.js before training.js, and the training script no longer asks for a video link", () => {
  assert.ok(HTML.indexOf("/assets/js/tus.js") > 0 && HTML.indexOf("/assets/js/tus.js") < HTML.indexOf("/assets/js/training.js"));
  const js = read("training.js");
  assert.doesNotMatch(js, /Video link|Paste a YouTube|name: "video_url"|"video_url"/);
  for (const w of ["Upload video", "Uploading… ", "Processing…", "Could not upload. Try again.", "Replace with your own video", "Add your video", "Watch progress", "Watched ", "Completed"]) assert.ok(js.includes(w), w);
});

/* ---------- /training/live/ ---------- */

test("the live list shows each training's status and Philippine time, with Edit and Delete", async () => {
  const d = boot({ view: "training-live", lives: [live("liv_1", { title: "Bootcamp", starts_at: "2099-11-20T01:30:00.000Z", duration_minutes: 90 }), live("liv_2", { starts_at: "2020-01-01T00:00:00.000Z" }), live("liv_3", { active: false })] });
  await d.open();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + T + "live/"]);
  assert.deepEqual(chips(rowOf(d, "data-live", "liv_1")), ["Upcoming"]);
  assert.deepEqual(chips(rowOf(d, "data-live", "liv_2")), ["Ended"]);
  assert.deepEqual(chips(rowOf(d, "data-live", "liv_3")), ["Off"]);
  assert.ok(rowOf(d, "data-live", "liv_1").textContent.includes("Nov 20, 2099, 9:30 AM (Philippine time) · 90 minutes"));
  assert.deepEqual(d.buttons(rowOf(d, "data-live", "liv_1")).map((b) => b.textContent), ["Edit", "Delete"]);
  assert.equal(d.root().all((n) => n.tagName === "A" && n.getAttribute("aria-current") === "page")[0].textContent, "Live trainings");
});

test("creating a live training sends Philippine time as ISO with a zone, the length, the join link and active", async () => {
  const d = boot({ view: "training-live" });
  await d.open();
  await d.click(d.press(d.root(), "New live training"));
  assert.equal(d.$("tl-mins").value, "60");
  d.set("tl-title", "  Saturday bootcamp ");
  d.set("tl-starts", "2026-11-21T14:00");
  d.set("tl-mins", "90");
  d.set("tl-join", "https://zoom.example.com/j/123");
  await d.click(d.press(d.root(), "Save"));
  const post = d.calls.find((c) => c.method === "POST");
  assert.equal(post.path, T + "live/");
  assert.deepEqual(post.body, { title: "Saturday bootcamp", starts_at: "2026-11-21T06:00:00.000Z", description: "", join_url: "https://zoom.example.com/j/123", active: true, duration_minutes: 90 });
  assert.equal(d.$("tl-title"), null, "the form closed");
  assert.ok(d.toasts.some((t) => t.startsWith("Saved")));
});

test("a live training needs a title and a time; the length and the join link are checked; no call is made", async () => {
  const d = boot({ view: "training-live" });
  await d.open();
  await d.click(d.press(d.root(), "New live training"));
  await d.click(d.press(d.root(), "Save"));
  assert.equal(d.$("tl-title-err").textContent, "Enter a title.");
  assert.equal(d.$("tl-starts-err").textContent, "Enter the date and time.");
  d.set("tl-title", "x"); d.set("tl-starts", "2026-11-21T14:00"); d.set("tl-mins", "0"); d.set("tl-join", "http://zoom.example.com");
  await d.click(d.press(d.root(), "Save"));
  assert.equal(d.$("tl-mins-err").textContent, "Use a whole number of minutes from 1 to 1440.");
  assert.equal(d.$("tl-join-err").textContent, "Use an https link.");
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 0);
});

test("editing a live training shows its time in Philippine time and PATCHes; the thumbnail goes up after; delete asks twice", async () => {
  const d = boot({ view: "training-live", lives: [live("liv_1", { title: "Old", starts_at: "2026-11-21T06:00:00.000Z", join_url: "https://zoom.example.com/j/1" })] });
  await d.open();
  await d.click(d.press(rowOf(d, "data-live", "liv_1"), "Edit"));
  assert.equal(d.$("tl-starts").value, "2026-11-21T14:00");
  assert.equal(d.$("tl-join").value, "https://zoom.example.com/j/1");
  d.set("tl-title", "New"); d.set("tl-join", "");
  d.$("tl-pic-file").files = [new File(["x"], "a.webp", { type: "image/webp" })];
  await d.click(d.press(d.root(), "Save"));
  assert.deepEqual(d.calls.find((c) => c.method === "PATCH").body, { title: "New", starts_at: "2026-11-21T06:00:00.000Z", description: "", join_url: null, active: true, duration_minutes: 60 });
  assert.equal(d.calls.find((c) => c.path === T + "live/liv_1/thumbnail/").method, "POST");
  await d.click(d.press(rowOf(d, "data-live", "liv_1"), "Delete"));
  assert.equal(d.calls.filter((c) => c.method === "DELETE").length, 0);
  await d.click(d.press(rowOf(d, "data-live", "liv_1"), "Confirm delete"));
  assert.deepEqual(d.calls.filter((c) => c.method === "DELETE").map((c) => c.path), [T + "live/liv_1/"]);
  assert.equal(rowOf(d, "data-live", "liv_1"), undefined);
});

test("leaving a page empties it and ignores an answer that arrives late", async () => {
  const d = boot({ courses: [course("crs_1")] });
  d.window.NOTraining.show("training");
  d.window.NOTraining.hide("training");
  await settle();
  assert.equal(d.root().firstChild, null);
});

/* ---------- video required (CP-1 R2 fix round 2) ---------- */

const NEED = "Every lesson needs a video before members can see this course.";
const REQ = "Video required. Upload a video before members can see this lesson.";
const offTree = () => { const t = videoTree(); t.active = false; return t; };

test("the lesson editor says Video required when the lesson has no ready video, and not when it has one", async () => {
  const d = boot({ view: "training-course", tree: videoTree(), search: "?id=crs_1" }); await d.open();
  await edit(d, "les_need");
  assert.ok(d.root().textContent.includes(REQ));
  assert.deepEqual(heads(d), ["Add your video"]);
  await d.click(d.press(d.root(), "Cancel"));
  await edit(d, "les_stream");
  assert.ok(!d.root().textContent.includes(REQ));
  assert.deepEqual(heads(d), ["Replace with your own video"]);
});

test("a legacy link that still needs a Bunny video keeps Replace with your own video and adds the line", async () => {
  const t = offTree(); t.modules[0].lessons[2].video.needs_video = true;
  const d = boot({ view: "training-course", tree: t, search: "?id=crs_1" }); await d.open();
  assert.ok(rowOf(d, "data-lesson", "les_legacy").textContent.includes("Video required"));
  await edit(d, "les_legacy");
  assert.deepEqual(heads(d), ["Replace with your own video"]);
  assert.ok(d.root().textContent.includes(REQ));
});

test("course details list the lessons missing a video under Show to members, and each opens its editor", async () => {
  const d = boot({ view: "training-course", tree: offTree(), search: "?id=crs_1" }); await d.open();
  assert.ok(d.root().textContent.includes(NEED));
  const link = d.press(d.root().all((n) => n.classList.contains("tr-vneed"))[0], "Needs");
  assert.ok(link);
  await d.click(link);
  assert.equal(d.$("tr-lt").value, "Needs");
});

test("with every lesson holding a video, the course details show no video note", async () => {
  const t = course("crs_1", { active: false, modules: [module_("mod_1", [lesson("les_ok", { video: vid() })])] });
  const d = boot({ view: "training-course", tree: t, search: "?id=crs_1" }); await d.open();
  assert.ok(!d.root().textContent.includes(NEED));
});

test("Show to members refused with video_required shows the message and the lessons, keeps the box unticked, and nothing is applied", async () => {
  const d = boot({ view: "training-course", tree: offTree(), search: "?id=crs_1" }); await d.open();
  d.check("tr-active", true);
  d.s.answer = { status: 400, body: { code: "video_required", detail: NEED, lessons: [{ id: "les_need", title: "Needs" }, { id: "les_x", title: "Other lesson" }] } };
  await d.click(d.press(d.root(), "Save course"));
  const text = d.root().textContent;
  assert.ok(text.includes(NEED) && text.includes("Needs") && text.includes("Other lesson"));
  assert.equal(d.$("tr-active").checked, false);
  assert.equal(d.toasts.length, 0);
  assert.equal(d.calls.filter((c) => c.method === "PATCH").length, 1);
  assert.equal(d.calls.filter((c) => c.path.includes("/image/")).length, 0);
});

test("a copied course that is Off and has lessons without a video shows the same rule", async () => {
  const t = offTree(); t.copied_from = "crs_src";
  const d = boot({ view: "training-course", tree: t, search: "?id=crs_1" }); await d.open();
  assert.ok(d.root().textContent.includes(NEED));
});
