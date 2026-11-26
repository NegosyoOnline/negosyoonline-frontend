/* The Subscriber Media Library editor (ClickUp z8uq9mezdk, media.js: /media/). Driven like training.test.mjs: the real scripts run in a vm with the
   stand-in document from dom.mjs and a recorded fetch that plays the owner API of apps/media_library (/sites/{id}/media/). Fake data only. */
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
const CONFIG = fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const M = `/sites/${A}/media/`;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 12; i++) await tick(); };
const BLOB = "https://abc123.public.blob.vercel-storage.com/media-library/";
const err = (status, code, message, fields) => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });
const ok = (body, status = 200) => ({ status, body });

const asset = (id, over = {}) => ({ id, title: "Media " + id, asset_type: "image", category: "promo", category_label: "Product Promo", product_category: null, product_category_label: null,
  crop_ratio: "1:1", caption: "", file_url: BLOB + id + "/a.jpg", thumb_url: null, poster_url: null, width: 0, height: 0, file_size: 100, duration_seconds: 0,
  active: true, order: 1, published: false, ...over });
const video = (id, over = {}) => asset(id, { asset_type: "video", file_url: null, poster_url: BLOB + id + "/p.jpg", ...over });

function boot({ assets = [], off = null, search = "", siteId = A } = {}) {
  const doc = makeDocument(), calls = [], toasts = [], puts = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["ml-root", "ml-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const nav = [0, 1, 2].map(() => { const a = doc.createElement("a"); a.setAttribute("data-media-nav", ""); a.hidden = true; page.appendChild(a); return a; });
  doc.querySelectorAll = (sel) => (sel === "[data-media-nav]" ? nav : []);
  const s = { assets: assets.map((a) => ({ ...a })), off, next: 100, answer: null, tokenAnswer: null, attachAnswer: null };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", "");
    const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
    const body = opts.body && !isForm ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body, form: isForm ? opts.body : null });
    let a = err(404, "not_found", "Not found.");
    const rest = p.startsWith(M) ? p.slice(M.length) : null, seg = rest ? rest.split("/").filter(Boolean) : [];
    const find = (id) => s.assets.find((x) => x.id === id);
    if (opts.method === "GET" && p === "/sites/") a = ok({ items: [{ id: siteId, template: "sante" }], next_cursor: null });
    else if (s.off && rest !== null) a = s.off;
    else if (rest === "" && opts.method === "GET") a = ok({ assets: s.assets });
    else if (rest === "" && opts.method === "POST") a = s.answer || (() => {
      const id = "ast_" + ++s.next;
      const row = body.asset_type === "video" ? video(id, { title: body.title, poster_url: null }) : asset(id, { title: body.title, file_url: null });
      s.assets.push(row); return ok(row, 201);
    })();
    else if (rest === "reorder/") { s.assets = body.ids.map((i) => find(i)); a = ok({ assets: s.assets }); }
    else if (seg.length === 2 && seg[1] === "publish") { const x = find(seg[0]); a = s.answer || (x.published = true, ok(x)); }
    else if (seg.length === 2 && seg[1] === "unpublish") { const x = find(seg[0]); x.published = false; a = ok(x); }
    else if (seg.length === 1 && opts.method === "PATCH") { const x = find(seg[0]); a = s.answer || (Object.assign(x, body), ok(x)); }
    else if (seg.length === 1 && opts.method === "DELETE") { s.assets = s.assets.filter((x) => x.id !== seg[0]); a = ok({ status: "deleted" }); }
    else if (seg[1] === "image" && opts.method === "POST") { if (s.imageAnswer) { a = s.imageAnswer; return Promise.resolve({ ok: false, status: a.status, json: () => Promise.resolve(a.body) }); } const x = find(seg[0]); const k = opts.body.get("kind"); x[k === "file" ? "file_url" : k + "_url"] = BLOB + seg[0] + "/new.jpg"; a = ok(x); }
    else if (seg[1] === "image" && opts.method === "DELETE") { const x = find(seg[0]); x.thumb_url = null; a = ok(x); }
    else if (seg[1] === "video" && seg[2] === "token") a = s.tokenAnswer || ok({ upload_url: "https://vercel.com/api/blob/?pathname=media-library%2F" + seg[0] + "%2Fx.mp4", method: "PUT",
      headers: { authorization: "Bearer t", "x-api-version": "7" }, max_bytes: 50 * 1024 * 1024, public_url: BLOB + seg[0] + "/x.mp4" });
    else if (seg[1] === "video" && seg[2] === "attach") { const x = find(seg[0]); a = s.attachAnswer || (x.file_url = body.url, ok(x)); }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  class XHR {
    constructor() { this.upload = {}; this.h = {}; }
    open(m, u) { this.m = m; this.u = u; }
    setRequestHeader(k, v) { this.h[k] = v; }
    send(b) { puts.push({ m: this.m, u: this.u, h: this.h, body: b }); this.status = s.putStatus || 200; this.onload(); }
  }
  const winOn = {};
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener: (t, f) => { (winOn[t] = winOn[t] || []).push(f); }, removeEventListener() {}, innerHeight: 800 };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const location = { search, pathname: "/media/", replace() {}, assign() {} };
  const context = vm.createContext({ window, document: doc, location, history: {}, console, URLSearchParams, Promise, setTimeout: (f, ms) => setTimeout(f, ms >= 1000 ? 0 : ms), clearTimeout, Intl, Uint8Array, Date,
    FormData, File, XMLHttpRequest: XHR, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("media.js"), context, { filename: "media.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label) => buttons(n).find((b) => b.textContent === label);
  const root = () => $("ml-root");
  return { doc, calls, toasts, puts, s, $, buttons, press, nav, window, root,
    list: () => calls.map((c) => c.method + " " + c.path),
    async open() { window.NOMedia.show(); await settle(); },
    async click(node) { node.fire("click"); await settle(); },
    set(id, v) { $(id).value = v; } };
}
const rowOf = (d, id) => d.root().all((n) => n.getAttribute("data-asset") === id)[0];
const chips = (n) => n.all((x) => x.classList.contains("chip")).map((c) => c.textContent);
const titles = (d) => d.root().all((n) => n.tagName === "H3").map((n) => n.textContent);
const file = (name, type, size = 100) => { const f = new File(["x"], name, { type }); Object.defineProperty(f, "size", { value: size }); return f; };

/* ---------- wiring ---------- */

test("index.html: the Media Library view, root, script and stylesheet are in the page and every Media Library link starts hidden", () => {
  for (const id of ["view-media", "h-media", "ml-root", "ml-live"]) assert.ok(HTML.includes(`id="${id}"`), id);
  assert.ok(HTML.includes("/assets/js/media.js") && HTML.includes("/assets/css/media.css"));
  const links = [...HTML.matchAll(/<a\b[^>]*href="\/media\/"[^>]*>/g)].map((m) => m[0]);
  assert.equal(links.length, 2, "one in the sidebar, one in the More sheet");
  for (const l of links) assert.ok(/data-media-nav/.test(l) && /\bhidden\b/.test(l), l);
  assert.ok(HTML.indexOf('href="/training/"') < HTML.indexOf('href="/media/"'), "Media Library comes after Training in the sidebar");
  assert.ok(HTML.indexOf('href="/media/"') < HTML.indexOf('href="/settings/business/" id="settings-link"'), "Media Library sits before Settings");
  assert.ok(HTML.lastIndexOf('href="/media/"') < HTML.indexOf('<h3 class="sheet-label">Settings</h3>'), "the Media Library group comes before Settings in the More sheet");
});

test("dashboard.js: the route, the view name, the enter/leave hooks and the probe", () => {
  const dash = read("dashboard.js");
  assert.match(dash, /"\/media\/": \{ view: "media"/);
  assert.match(dash, /"training-live", "media"/);
  assert.match(dash, /window\.NOMedia/);
  assert.match(dash, /ML\.show\(\)/);
  assert.match(dash, /window\.NOMedia\.probe\(\)/);
});

test("the dash CSP lets the browser send the video to Vercel Blob, and (CP-1 R2) the lesson video to Bunny Stream, and nothing else new", () => {
  const csp = CONFIG.slice(CONFIG.indexOf("const csp = ["), CONFIG.indexOf('].join("; ")'));
  assert.match(csp, /connect-src 'self' \$\{apiOrigin\} https:\/\/vercel\.com \$\{tusOrigin\}`/);
  assert.match(CONFIG, /const tusOrigin = "https:\/\/video\.bunnycdn\.com";/);
  assert.match(CONFIG, /const embedOrigin = "https:\/\/iframe\.mediadelivery\.net";/);
  assert.match(csp, /`frame-src \$\{embedOrigin\}`/);
  assert.match(csp, /"script-src 'self'"/);
});

test("media.css: focus is the light blue, never gold, and no card title takes focus", () => {
  const css = read("../css/media.css");
  assert.match(css, /\.ml-root \.ml-input:focus[^{]*\{[^}]*var\(--link, #6C8CFF\)/);
  assert.doesNotMatch(css, /#f2d99b|#c59a3b|#e8c16a|var\(--gold\)|var\(--cat\)/i);
  const js = read("media.js");
  assert.doesNotMatch(js, /h[123]\b[^;]*tabindex/i);
});

/* ---------- the probe and the gates ---------- */

test("probe shows the Media Library links only when the list read answers 200", async () => {
  const d = boot();
  d.window.NOMedia.probe(); await settle();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + M]);
  assert.deepEqual(d.nav.map((n) => n.hidden), [false, false, false]);
  const off = boot({ off: err(404, "not_found", "Not found.") });
  off.window.NOMedia.probe(); await settle();
  assert.deepEqual(off.nav.map((n) => n.hidden), [true, true, true]);
  const forbidden = boot({ off: err(403, "billing_only", "x") });
  forbidden.window.NOMedia.probe(); await settle();
  assert.deepEqual(forbidden.nav.map((n) => n.hidden), [true, true, true]);
});

test("a 404 says the Media Library is not available yet and keeps the links hidden; a 403 shows the API's sentence; a failed load offers Try again", async () => {
  const gone = boot({ off: err(404, "not_found", "Not found.") });
  await gone.open();
  assert.ok(gone.root().textContent.includes("The Media Library is not available yet"));
  assert.deepEqual(gone.nav.map((n) => n.hidden), [true, true, true]);
  const no = boot({ off: err(403, "billing_only", "Billing is the only part open to you right now.") });
  await no.open();
  assert.ok(no.root().textContent.includes("Billing is the only part open to you right now."));
  assert.ok(no.press(no.root(), "Try again"));
  const down = boot({ off: err(500, "server_error", "x") });
  await down.open();
  assert.ok(down.press(down.root(), "Try again"));
});

/* ---------- the list ---------- */

test("an asset the API hides (active: false) shows a neutral Hidden chip and a hint, never Published or Draft", async () => {
  const d = boot({ assets: [asset("h1", { published: true, active: false }), asset("h2", { published: false, active: false }), asset("h3", { published: true })] });
  await d.open();
  assert.deepEqual(chips(rowOf(d, "h1")), ["Hidden", "Image"]);
  assert.deepEqual(chips(rowOf(d, "h2")), ["Hidden", "Image"]);
  assert.ok(rowOf(d, "h1").textContent.includes("Hidden from members"));
  assert.ok(!rowOf(d, "h3").textContent.includes("Hidden"));
  assert.deepEqual(chips(rowOf(d, "h3")), ["Published", "Image"]);
});

test("the list shows each asset with its state; a video with no file is flagged and cannot be published; texts and pictures are safe", async () => {
  const d = boot({ assets: [asset("a1", { published: true, category_label: "Product Promo", product_category: "barley", product_category_label: "Barley" }),
    video("a2", { title: "<b>ad</b>" }), asset("a3", { title: "x", file_url: "javascript:alert(1)" })] });
  await d.open();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + M]);
  assert.deepEqual(chips(rowOf(d, "a1")), ["Published", "Image"]);
  assert.deepEqual(chips(rowOf(d, "a2")), ["Draft", "Video", "No video yet"]);
  assert.equal(d.press(rowOf(d, "a2"), "Publish").disabled, true);
  assert.equal(d.press(rowOf(d, "a1"), "Unpublish").disabled, false);
  assert.ok(rowOf(d, "a1").textContent.includes("Product Promo · Barley"));
  assert.deepEqual(titles(d), ["Media a1", "<b>ad</b>", "x"]);
  assert.equal(rowOf(d, "a3").all((n) => n.tagName === "IMG").length, 0, "a picture from anywhere but https is not drawn");
  assert.equal(rowOf(d, "a2").all((n) => n.tagName === "IMG")[0].getAttribute("src"), BLOB + "a2/p.jpg", "a video shows its poster");
  assert.deepEqual(d.nav.map((n) => n.hidden), [false, false, false]);
});

test("an empty library says so", async () => {
  const d = boot();
  await d.open();
  assert.ok(d.root().textContent.includes("No media yet."));
  assert.ok(d.press(d.root(), "Add media"));
});

test("Up and Down send every id in the new order; the first cannot go up", async () => {
  const d = boot({ assets: [asset("a1"), asset("a2"), asset("a3")] });
  await d.open();
  assert.equal(d.press(rowOf(d, "a1"), "Up").disabled, true);
  await d.click(d.press(rowOf(d, "a2"), "Up"));
  assert.deepEqual(d.calls.find((c) => c.path === M + "reorder/").body, { ids: ["a2", "a1", "a3"] });
  assert.deepEqual(d.root().all((n) => n.getAttribute("data-asset")).map((n) => n.getAttribute("data-asset")), ["a2", "a1", "a3"]);
});

test("Publish and Unpublish call their routes and show the new state; a refused publish says why", async () => {
  const d = boot({ assets: [asset("a1")] });
  await d.open();
  await d.click(d.press(rowOf(d, "a1"), "Publish"));
  assert.deepEqual(d.calls.find((c) => c.path === M + "a1/publish/").method, "POST");
  assert.deepEqual(chips(rowOf(d, "a1")), ["Published", "Image"]);
  await d.click(d.press(rowOf(d, "a1"), "Unpublish"));
  assert.ok(d.calls.some((c) => c.path === M + "a1/unpublish/"));
  assert.deepEqual(chips(rowOf(d, "a1")), ["Draft", "Image"]);
  d.s.answer = err(400, "invalid_request", "Some values are missing or invalid.");
  await d.click(d.press(rowOf(d, "a1"), "Publish"));
  assert.ok(d.toasts.some((t) => t.includes("cannot be published yet")));
});

test("Delete asks twice, then removes the asset", async () => {
  const d = boot({ assets: [asset("a1"), asset("a2")] });
  await d.open();
  await d.click(d.press(rowOf(d, "a1"), "Delete"));
  assert.equal(d.calls.filter((c) => c.method === "DELETE").length, 0);
  assert.ok(rowOf(d, "a1").textContent.includes("Press Confirm delete"));
  await d.click(d.press(rowOf(d, "a1"), "Confirm delete"));
  assert.deepEqual(d.calls.filter((c) => c.method === "DELETE").map((c) => c.path), [M + "a1/"]);
  assert.equal(rowOf(d, "a1"), undefined);
  assert.ok(rowOf(d, "a2"));
});

/* ---------- add ---------- */

test("an image is created as a JSON draft, then its file goes up as one multipart request", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Add media"));
  d.set("ml-n-title", "  New promo ");
  d.set("ml-n-cat", "ad"); d.set("ml-n-prod", "drinks"); d.set("ml-n-ratio", "4:5"); d.set("ml-n-cap", " Buy now ");
  d.$("ml-n-file").files = [file("a.jpg", "image/jpeg")];
  await d.click(d.press(d.root(), "Add media"));
  const post = d.calls.find((c) => c.method === "POST" && c.path === M);
  assert.deepEqual(post.body, { title: "New promo", asset_type: "image", category: "ad", crop_ratio: "4:5", caption: "Buy now", product_category: "drinks" });
  const up = d.calls.find((c) => c.method === "POST" && c.path === M + "ast_101/image/");
  assert.equal(up.form.get("kind"), "file");
  assert.ok(up.form.get("file"));
  assert.deepEqual(chips(rowOf(d, "ast_101")), ["Draft", "Image"]);
  assert.ok(d.toasts.some((t) => t.startsWith("Added")));
});

test("the add form stops a missing title, a wrong type and an image over 10 MB before any call", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Add media"));
  await d.click(d.press(d.root(), "Add media"));
  assert.equal(d.$("ml-n-title-err").textContent, "Enter a title.");
  assert.equal(d.$("ml-n-file-err").textContent, "Choose the image first.");
  d.set("ml-n-title", "T");
  d.$("ml-n-file").files = [file("a.gif", "image/gif")];
  await d.click(d.press(d.root(), "Add media"));
  assert.equal(d.$("ml-n-file-err").textContent, "Use a JPEG, PNG or WebP picture.");
  d.$("ml-n-file").files = [file("a.jpg", "image/jpeg", 11 * 1024 * 1024)];
  await d.click(d.press(d.root(), "Add media"));
  assert.equal(d.$("ml-n-file-err").textContent, "The picture is larger than 10 MB.");
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 0);
});

test("the server's field message shows under the field and the typed text stays", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Add media"));
  d.set("ml-n-title", "Ok");
  d.$("ml-n-file").files = [file("a.jpg", "image/jpeg")];
  d.s.answer = err(400, "invalid_request", "Some values are missing or invalid.", { title: ["Use 1 to 160 characters."] });
  await d.click(d.press(d.root(), "Add media"));
  assert.equal(d.$("ml-n-title-err").textContent, "Use 1 to 160 characters.");
  assert.equal(d.$("ml-n-title").value, "Ok");
});

test("a video: a draft with its poster, a token, the PUT to the given address with the given headers and no cookie, then attach", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Add media"));
  d.set("ml-n-type", "video"); d.$("ml-n-type").fire("change");
  d.set("ml-n-title", "Demo");
  d.$("ml-n-poster").files = [file("p.jpg", "image/jpeg")];
  const movie = file("v.mp4", "video/mp4", 1000);
  d.$("ml-n-video").files = [movie];
  await d.click(d.press(d.root(), "Add media"));
  const create = d.calls.find((c) => c.method === "POST" && c.path === M);
  assert.equal(create.body.asset_type, "video");
  const poster = d.calls.find((c) => c.path === M + "ast_101/image/");
  assert.equal(poster.form.get("kind"), "poster");
  assert.ok(poster.form.get("file"));
  assert.equal(d.calls.some((c) => c.form && c.form.has("video")), false, "the video does not go through this server");
  assert.ok(d.calls.some((c) => c.path === M + "ast_101/video/token/" && c.method === "POST"));
  assert.equal(d.puts.length, 1);
  assert.equal(d.puts[0].m, "PUT");
  assert.equal(d.puts[0].u, "https://vercel.com/api/blob/?pathname=media-library%2Fast_101%2Fx.mp4");
  assert.deepEqual(d.puts[0].h, { authorization: "Bearer t", "x-api-version": "7" });
  assert.equal(d.puts[0].body, movie);
  assert.deepEqual(d.calls.find((c) => c.path === M + "ast_101/video/attach/").body, { url: BLOB + "ast_101/x.mp4" });
  assert.deepEqual(chips(rowOf(d, "ast_101")), ["Draft", "Video"], "the video is attached, so it can be published");
});

test("a video that does not upload leaves the draft, opens its editor and says the video is missing", async () => {
  const d = boot();
  d.s.putStatus = 500;
  await d.open();
  await d.click(d.press(d.root(), "Add media"));
  d.set("ml-n-type", "video"); d.$("ml-n-type").fire("change");
  d.set("ml-n-title", "Demo");
  d.$("ml-n-poster").files = [file("p.jpg", "image/jpeg")];
  d.$("ml-n-video").files = [file("v.mp4", "video/mp4", 1000)];
  await d.click(d.press(d.root(), "Add media"));
  assert.equal(d.calls.some((c) => c.path.endsWith("/video/attach/")), false);
  assert.deepEqual(chips(rowOf(d, "ast_101")), ["Draft", "Video", "No video yet"]);
  assert.equal(d.$("ml-e-video-err").textContent, "The video did not upload. Check the connection and try again.");
  assert.ok(d.toasts.some((t) => t.startsWith("Saved, but the video is not uploaded")));
});

test("a video that is not MP4 is stopped before any call; the size is the API's to judge (the media store's max_bytes, or Bunny at attach)", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Add media"));
  d.set("ml-n-type", "video"); d.$("ml-n-type").fire("change");
  d.set("ml-n-title", "Demo");
  d.$("ml-n-poster").files = [file("p.jpg", "image/jpeg")];
  d.$("ml-n-video").files = [file("v.mov", "video/quicktime")];
  await d.click(d.press(d.root(), "Add media"));
  assert.equal(d.$("ml-n-video-err").textContent, "Use an MP4 video.");
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 0);
  d.$("ml-n-video").files = [file("v.mp4", "video/mp4", 51 * 1024 * 1024)];
  await d.click(d.press(d.root(), "Add media"));
  assert.equal(d.puts.length, 0, "the media store's own limit still stops it, after the token");
  assert.equal(d.$("ml-e-video-err").textContent, "The video is larger than 50 MB.");
});

test("a token the API refuses (503) says the store is not set up and sends nothing to the store", async () => {
  const d = boot({ assets: [video("v1")] });
  d.s.tokenAnswer = err(503, "image_store_not_configured", "x");
  await d.open();
  await d.click(d.press(rowOf(d, "v1"), "Edit"));
  d.$("ml-e-video").files = [file("v.mp4", "video/mp4", 1000)];
  await d.click(d.press(d.root(), "Upload video"));
  assert.equal(d.puts.length, 0);
  assert.equal(d.$("ml-e-video-err").textContent, "Files cannot be stored yet: the media store is not set up.");
});

test("if the draft is created but its picture is refused, the draft stays and its editor opens with the error", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Add media"));
  d.set("ml-n-title", "T");
  d.$("ml-n-file").files = [file("a.jpg", "image/jpeg")];
  d.s.imageAnswer = err(400, "invalid_request", "x", { file: ["That picture is not valid."] });
  await d.click(d.press(d.root(), "Add media"));
  assert.ok(rowOf(d, "ast_101"));
  assert.equal(d.$("ml-e-title").value, "T");
  assert.equal(d.$("ml-e-file-err").textContent, "That picture is not valid.");
});

/* ---------- edit ---------- */

test("Edit opens the fields filled from the asset; Save sends the trimmed values and whole numbers", async () => {
  const d = boot({ assets: [asset("a1", { caption: "Old", category: "ad", product_category: "beauty", crop_ratio: "9:16", width: 800 })] });
  await d.open();
  await d.click(d.press(rowOf(d, "a1"), "Edit"));
  assert.equal(d.$("ml-e-title").value, "Media a1");
  assert.equal(d.$("ml-e-cat").value, "ad");
  assert.equal(d.$("ml-e-prod").value, "beauty");
  assert.equal(d.$("ml-e-ratio").value, "9:16");
  assert.equal(d.$("ml-e-w").value, "800");
  d.set("ml-e-title", "  Renamed "); d.set("ml-e-prod", ""); d.set("ml-e-ht", "1000"); d.set("ml-e-dur", "");
  await d.click(d.press(d.root(), "Save changes"));
  const patch = d.calls.find((c) => c.method === "PATCH");
  assert.equal(patch.path, M + "a1/");
  assert.deepEqual(patch.body, { title: "Renamed", category: "ad", product_category: null, crop_ratio: "9:16", caption: "Old", width: 800, height: 1000 });
  assert.equal(d.$("ml-e-title"), null, "the editor closed");
  assert.deepEqual(titles(d), ["Renamed"]);
});

test("Save refuses a title that is empty and a size that is not a whole number, with no call", async () => {
  const d = boot({ assets: [asset("a1")] });
  await d.open();
  await d.click(d.press(rowOf(d, "a1"), "Edit"));
  d.set("ml-e-title", " "); d.set("ml-e-w", "12.5");
  await d.click(d.press(d.root(), "Save changes"));
  assert.equal(d.$("ml-e-title-err").textContent, "Enter a title.");
  assert.equal(d.$("ml-e-w-err").textContent, "Use a whole number.");
  assert.equal(d.calls.filter((c) => c.method === "PATCH").length, 0);
});

test("an image, a poster and a thumbnail are replaced one at a time with their kind; the thumbnail can be cleared", async () => {
  const d = boot({ assets: [video("v1", { file_url: BLOB + "v1/x.mp4", thumb_url: BLOB + "v1/t.jpg" })] });
  await d.open();
  await d.click(d.press(rowOf(d, "v1"), "Edit"));
  d.$("ml-e-poster").files = [file("p.jpg", "image/jpeg")];
  await d.click(d.buttons(d.$("ml-e-poster").parentNode.parentNode).find((b) => b.textContent === "Upload"));
  const up = d.calls.find((c) => c.path === M + "v1/image/" && c.method === "POST");
  assert.equal(up.form.get("kind"), "poster");
  assert.ok(up.form.get("file"));
  await d.click(d.press(d.root(), "Clear thumbnail"));
  assert.ok(d.calls.some((c) => c.method === "DELETE" && c.path === M + "v1/image/"));
  assert.equal(d.press(d.root(), "Clear thumbnail").disabled, true, "nothing left to clear");
  d.$("ml-e-poster").files = [file("p.gif", "image/gif")];
  await d.click(d.buttons(d.$("ml-e-poster").parentNode.parentNode).find((b) => b.textContent === "Upload"));
  assert.equal(d.$("ml-e-poster-err").textContent, "Use a JPEG, PNG or WebP picture.");
});

test("a video asset with no file can have its video uploaded from Edit", async () => {
  const d = boot({ assets: [video("v1")] });
  await d.open();
  await d.click(d.press(rowOf(d, "v1"), "Edit"));
  assert.ok(d.root().textContent.includes("No video yet. It cannot be published until one is uploaded."));
  d.$("ml-e-video").files = [file("v.mp4", "video/mp4", 1000)];
  await d.click(d.press(d.root(), "Upload video"));
  assert.equal(d.puts.length, 1);
  assert.ok(d.calls.some((c) => c.path === M + "v1/video/attach/"));
  assert.ok(d.toasts.some((t) => t.startsWith("Saved: The video was uploaded")));
  assert.ok(d.root().textContent.includes("A video is attached."));
});

/* ---------- pure helpers ---------- */

test("buildAsset, moved and safeUrl", () => {
  const { buildAsset, moved, safeUrl, imageCheck, videoCheck } = boot().window.NOMedia.util;
  assert.deepEqual(JSON.parse(JSON.stringify(buildAsset({ title: " T ", category: "page", product_category: "", crop_ratio: "16:9", caption: " c " }, false).body)),
    { title: "T", category: "page", product_category: null, crop_ratio: "16:9", caption: "c" });
  assert.deepEqual(Object.keys(buildAsset({ title: "", category: "x", product_category: "x", crop_ratio: "x", caption: "" }, false).errors).sort(), ["category", "crop_ratio", "product_category", "title"]);
  assert.equal(buildAsset({ title: "T", category: "promo", crop_ratio: "1:1", caption: "", duration_seconds: "99999999" }, true).errors.duration_seconds, "Use a whole number.");
  assert.deepEqual(moved(["a", "b"], "b", -1), ["b", "a"]);
  assert.equal(moved(["a", "b"], "a", -1), null);
  assert.equal(safeUrl("https://vercel.com/api/blob/?x=1"), "https://vercel.com/api/blob/?x=1");
  assert.equal(safeUrl("http://127.0.0.1:8141/files/x"), "http://127.0.0.1:8141/files/x");
  assert.equal(safeUrl("http://evil.example/x"), "");
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.ok(imageCheck(null, "x").error && videoCheck(null).error);
});

test("a sites answer with an empty site id makes no media request, in the editor or the probe", async () => {
  const d = boot({ siteId: "" });
  await d.open();
  d.window.NOMedia.probe(); await settle();
  assert.deepEqual(d.list(), ["GET /sites/", "GET /sites/"]);
  assert.ok(!d.list().some((c) => c.includes("/media/")));
  assert.deepEqual(d.nav.map((n) => n.hidden), [true, true, true]);
});


/* ---------- V-1 (ClickUp z8uq9mkfkd): a video in the store's own Bunny library ---------- */

const LIB = 816560, GUID = "0f3c2b1a-1111-4222-8333-444455556666", EMBED = `https://iframe.mediadelivery.net/embed/${LIB}/${GUID}`;
const UP = { endpoint: "https://video.bunnycdn.com/tusupload", library_id: String(LIB), video_id: GUID, signature: "sig123", expires: 1795800000 };
const bunnyToken = () => ok({ host: "bunny", upload: { ...UP } });
const bunnyAsset = (id, over = {}) => video(id, { embed_url: EMBED, file_url: null, ...over });
/* a stand-in for tus.js: records what it was given; `done` settles the upload, `progress` reports a percentage */
function fakeTus(d, how = "ok") {
  const seen = { calls: [], progress: null, finish: null, aborted: 0 };
  d.window.NOTus = { upload(f, o) {
    seen.calls.push({ file: f, ...o }); seen.progress = o.onProgress;
    const promise = how === "hold" ? new Promise((res, rej) => { seen.finish = (bad) => (bad ? rej({ code: "send" }) : res({ url: "x" })); }) : how === "fail" ? Promise.reject({ code: "send", status: 0 }) : Promise.resolve({ url: "x" });
    return { promise, abort() { seen.aborted++; } };
  } };
  return seen;
}
async function addBunnyVideo(d) {
  await d.open();
  await d.click(d.press(d.root(), "Add media"));
  d.set("ml-n-type", "video"); d.$("ml-n-type").fire("change");
  d.set("ml-n-title", "Demo");
  d.$("ml-n-poster").files = [file("p.jpg", "image/jpeg")];
  d.$("ml-n-video").files = [file("v.mp4", "video/mp4", 600 * 1024 * 1024)];
  d.click(d.press(d.root(), "Add media"));
}
const frames = (d) => d.root().all((n) => n.tagName === "IFRAME");

test("Bunny: the token's upload block goes to tus.js with the four signed headers, not to a store address, and the file never passes this server", async () => {
  const d = boot(); d.s.tokenAnswer = bunnyToken();
  const tus = fakeTus(d);
  d.s.attachAnswer = ok(bunnyAsset("ast_101"));
  await addBunnyVideo(d); await settle();
  assert.equal(tus.calls.length, 1);
  assert.equal(tus.calls[0].endpoint, UP.endpoint);
  assert.deepEqual({ ...tus.calls[0].headers }, { AuthorizationSignature: "sig123", AuthorizationExpire: 1795800000, VideoId: GUID, LibraryId: String(LIB) });
  assert.equal(tus.calls[0].metadata.filetype, "video/mp4");
  assert.equal(d.puts.length, 0, "no PUT to a store address");
  assert.equal(d.calls.some((c) => c.form && c.form.has("video")), false);
});

test("Bunny: attach is asked again on 409 video_processing, then the asset has no file_url and its player", async () => {
  const d = boot(); d.s.tokenAnswer = bunnyToken();
  fakeTus(d);
  let n = 0;
  Object.defineProperty(d.s, "attachAnswer", { get() { n++; return n <= 2 ? err(409, "video_processing", "The video is still being processed. Try again in a moment.") : ok(bunnyAsset("ast_101")); }, set() {} });
  await addBunnyVideo(d); await settle(); await settle(); await settle();
  const attaches = d.calls.filter((c) => c.path === M + "ast_101/video/attach/");
  assert.equal(attaches.length, 3);
  for (const a of attaches) assert.deepEqual(a.body, { video_id: GUID });
  assert.deepEqual(chips(rowOf(d, "ast_101")), ["Draft", "Video"], "attached: no No-video-yet chip, Publish is open");
  assert.equal(d.press(rowOf(d, "ast_101"), "Publish").disabled, false);
  assert.ok(d.toasts.some((t) => t.startsWith("Added")));
});

test("Bunny: the note shows Uploading N% and then Processing…", async () => {
  const d = boot(); d.s.tokenAnswer = bunnyToken();
  const tus = fakeTus(d, "hold");
  d.s.attachAnswer = err(409, "video_processing", "x");
  await addBunnyVideo(d); await settle();
  const note = () => d.root().all((n) => n.classList.contains("ml-progress")).map((n) => n.textContent).filter(Boolean)[0];
  assert.equal(note(), "Uploading 0%");
  tus.progress(42); assert.equal(note(), "Uploading 42%");
  tus.finish(); await settle();
  assert.equal(note(), "Processing…");
  const p = d.root().all((n) => n.classList.contains("ml-progress"))[0];
  assert.equal(p.getAttribute("role"), "status");
});

test("Bunny: too large (400 video_too_large) says so plainly, in the video field, and keeps the draft with No video yet", async () => {
  const d = boot(); d.s.tokenAnswer = bunnyToken();
  fakeTus(d);
  d.s.attachAnswer = err(400, "video_too_large", "This video is too large to upload.");
  await addBunnyVideo(d); await settle();
  assert.equal(d.$("ml-e-video-err").textContent, "This video is too large to upload.");
  assert.ok(d.toasts.some((t) => t.startsWith("Saved, but the video is not uploaded") && t.includes("This video is too large to upload.")));
  assert.deepEqual(chips(rowOf(d, "ast_101")), ["Draft", "Video", "No video yet"]);
});

test("Bunny: a failed video (400 with its field), a missing one (502) and a tus failure each show a plain message", async () => {
  for (const [att, tusHow, want] of [
    [err(400, "invalid_request", "x", { video_id: "The video could not be processed. Upload it again." }), "ok", "The video could not be processed. Upload it again."],
    [err(502, "video_not_confirmed", "The uploaded video could not be found. Try again."), "ok", "The uploaded video could not be found. Try again."],
    [null, "fail", "The video did not upload. Check the connection and try again."]]) {
    const d = boot(); d.s.tokenAnswer = bunnyToken(); fakeTus(d, tusHow); d.s.attachAnswer = att;
    await addBunnyVideo(d); await settle();
    assert.equal(d.$("ml-e-video-err").textContent, want);
    assert.equal(d.calls.some((c) => c.path.endsWith("/video/attach/")), tusHow === "ok");
  }
});

test("Bunny: a token block that cannot be used (no https endpoint, a missing value) sends nothing", async () => {
  for (const up of [{ ...UP, endpoint: "http://evil.test/tus" }, { ...UP, signature: "" }, null]) {
    const d = boot(); d.s.tokenAnswer = ok({ host: "bunny", upload: up });
    const tus = fakeTus(d);
    await addBunnyVideo(d); await settle();
    assert.equal(tus.calls.length, 0);
    assert.equal(d.$("ml-e-video-err").textContent, "That did not work. Please try again.");
  }
});

test("Bunny: leaving the page stops the upload and asks nothing more", async () => {
  const d = boot(); d.s.tokenAnswer = bunnyToken();
  const tus = fakeTus(d, "hold");
  await addBunnyVideo(d); await settle();
  d.window.NOMedia.hide();
  assert.equal(tus.aborted, 1);
  tus.finish(true); await settle();
  assert.equal(d.calls.some((c) => c.path.endsWith("/video/attach/")), false);
});

test("playback: an asset with embed_url plays in Bunny's iframe, titled, in its editor; one without it shows no player", async () => {
  const d = boot({ assets: [bunnyAsset("b1", { title: "How to post" }), video("v1", { file_url: BLOB + "v1/x.mp4" })] });
  await d.open();
  assert.deepEqual(chips(rowOf(d, "b1")), ["Draft", "Video"]);
  await d.click(d.press(rowOf(d, "b1"), "Edit"));
  const f = frames(d);
  assert.equal(f.length, 1);
  assert.equal(f[0].getAttribute("src"), EMBED);
  assert.equal(f[0].getAttribute("title"), "How to post");
  assert.ok(d.root().textContent.includes("A video is attached."));
  assert.ok(d.root().textContent.includes("Replace the video (MP4)"));
  await d.click(d.press(d.root(), "Close"));
  await d.click(d.press(rowOf(d, "v1"), "Edit"));
  assert.equal(frames(d).length, 0);
});

test("playback: only a Bunny embed address is framed; any other host, scheme or shape is not, and the asset counts as having no video", async () => {
  for (const bad of ["https://evil.test/embed/1/" + GUID, "http://iframe.mediadelivery.net/embed/1/" + GUID, EMBED + "?x=1", "javascript:alert(1)", 7]) {
    const d = boot({ assets: [bunnyAsset("b1", { embed_url: bad })] });
    await d.open();
    assert.deepEqual(chips(rowOf(d, "b1")), ["Draft", "Video", "No video yet"], String(bad));
    await d.click(d.press(rowOf(d, "b1"), "Edit"));
    assert.equal(frames(d).length, 0, String(bad));
  }
});

test("the Blob token (no host key) still goes by PUT, exactly as before, with no tus call", async () => {
  const d = boot({ assets: [video("v1")] });
  const tus = fakeTus(d);
  await d.open();
  await d.click(d.press(rowOf(d, "v1"), "Edit"));
  d.$("ml-e-video").files = [file("v.mp4", "video/mp4", 1000)];
  await d.click(d.press(d.root(), "Upload video"));
  assert.equal(tus.calls.length, 0);
  assert.equal(d.puts.length, 1);
});
