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
  const s = { courses: courses.map((c) => ({ ...c })), tree, lives: lives.map((l) => ({ ...l })), off, next: 100, answer: null, imageAnswer: null };
  const ok = (body, status = 200) => ({ status, body });
  const fetch = (url, opts) => {
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
  const context = vm.createContext({ window, document: doc, location, history, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, Uint8Array, Date,
    FormData, File, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
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

test("toEmbed turns YouTube and Vimeo watch links into the embed links the API accepts and leaves anything else as typed", async () => {
  const d = boot();
  const { toEmbed } = d.window.NOTraining.util;
  assert.equal(toEmbed("https://www.youtube.com/watch?v=abcdefghijk"), "https://www.youtube.com/embed/abcdefghijk");
  assert.equal(toEmbed("https://youtube.com/watch?feature=share&v=abcdefghijk&t=10"), "https://www.youtube.com/embed/abcdefghijk");
  assert.equal(toEmbed("https://youtu.be/abcdefghijk?si=x"), "https://www.youtube.com/embed/abcdefghijk");
  assert.equal(toEmbed("https://www.youtube.com/shorts/abcdefghijk"), "https://www.youtube.com/embed/abcdefghijk");
  assert.equal(toEmbed("https://www.youtube.com/embed/abcdefghijk"), "https://www.youtube.com/embed/abcdefghijk");
  assert.equal(toEmbed("https://vimeo.com/123456789"), "https://player.vimeo.com/video/123456789");
  assert.equal(toEmbed("https://vimeo.com/123456789/abcdef1234"), "https://player.vimeo.com/video/123456789?h=abcdef1234");
  assert.equal(toEmbed("https://player.vimeo.com/video/123456789"), "https://player.vimeo.com/video/123456789");
  assert.equal(toEmbed("  "), "");
  assert.equal(toEmbed("https://evil.example/watch?v=abcdefghijk"), "https://evil.example/watch?v=abcdefghijk");
  assert.equal(toEmbed("javascript:alert(1)"), "javascript:alert(1)");
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
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + T + "courses/crs_1/"]);
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

test("adding a lesson turns a YouTube watch link into an embed link and sends the whole form", async () => {
  const d = boot({ view: "training-course", tree: FULL(), search: "?id=crs_1" });
  await d.open();
  const mod = d.root().all((n) => n.getAttribute("data-module") === "mod_2")[0];
  await d.click(d.press(mod, "Add lesson"));
  d.set("tr-lt", "  Fourth ");
  d.set("tr-lv", "https://www.youtube.com/watch?v=abcdefghijk");
  d.set("tr-ld", "12:00");
  d.set("tr-ldesc", " Notes ");
  await d.click(d.press(d.root(), "Save lesson"));
  const post = d.calls.find((c) => c.method === "POST");
  assert.equal(post.path, T + "modules/mod_2/lessons/");
  assert.deepEqual(post.body, { title: "Fourth", duration: "12:00", description: "Notes", video_url: "https://www.youtube.com/embed/abcdefghijk", active: true });
  assert.ok(d.root().all((n) => n.tagName === "H4").map((n) => n.textContent).includes("Fourth"));
  assert.equal(d.$("tr-lt"), null, "the lesson form closed");
});

test("an empty video link is sent as null, a lesson title is required, and the API's video message shows under the link", async () => {
  const d = boot({ view: "training-course", tree: FULL(), search: "?id=crs_1" });
  await d.open();
  const mod = d.root().all((n) => n.getAttribute("data-module") === "mod_2")[0];
  await d.click(d.press(mod, "Add lesson"));
  await d.click(d.press(d.root(), "Save lesson"));
  assert.equal(d.$("tr-lt-err").textContent, "Enter a title.");
  d.set("tr-lt", "Five");
  d.s.answer = err(400, "invalid_request", "Some values are missing or invalid.", { video_url: ["Use an https embed link from YouTube."] });
  d.set("tr-lv", "https://example.com/video.mp4");
  await d.click(d.press(d.root(), "Save lesson"));
  assert.equal(d.calls.find((c) => c.method === "POST").body.video_url, "https://example.com/video.mp4", "other hosts are sent as typed so the API refuses them");
  assert.equal(d.$("tr-lv-err").textContent, "Use an https embed link from YouTube.");
  d.s.answer = null;
  d.set("tr-lv", "");
  await d.click(d.press(d.root(), "Save lesson"));
  assert.equal(d.calls.filter((c) => c.method === "POST")[1].body.video_url, null);
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
  assert.deepEqual(d.calls.find((c) => c.path === T + "lessons/les_2/").body, { title: "Second, again", duration: "", description: "", video_url: null, active: false });
  assert.equal(d.calls.find((c) => c.path === T + "lessons/les_2/image/").method, "POST");
  await d.click(d.buttons(row("les_2")).find((b) => b.textContent === "Up"));
  assert.deepEqual(d.calls.find((c) => c.path === T + "modules/mod_1/lessons/reorder/").body, { ids: ["les_2", "les_1"] });
  await d.click(d.press(row("les_1"), "Delete"));
  assert.equal(d.calls.filter((c) => c.method === "DELETE").length, 0);
  await d.click(d.press(row("les_1"), "Confirm delete"));
  assert.deepEqual(d.calls.filter((c) => c.method === "DELETE").map((c) => c.path), [T + "lessons/les_1/"]);
  assert.equal(row("les_1"), undefined);
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
