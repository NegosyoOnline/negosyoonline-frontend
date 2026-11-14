/* media.js: the Media library page of HQ (ClickUp z8uq9mezdk). The list in order with Draft/Published, publish and reorder,
   an image as one form, and a video as draft with poster, token, a direct PUT with the backend's headers, then attach. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE } from "./page.mjs";

const PUB = new URL("../public/", import.meta.url).pathname;
const idsOf = (file) => [...fs.readFileSync(PUB + file, "utf8").matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const key = (call) => call.method + " " + call.url.slice(BASE.length + 1);
const A = (id, title, over = {}) => ({ id, title, asset_type: "image", category: "promo", category_label: "Product Promo", product_category: null, product_category_label: null,
  file_url: "https://store.example.test/media-library/" + id + "/a.jpg", thumb_url: null, poster_url: null, published: false, ...over });
const ASSETS = [A("m1", "Barley promo", { published: true }), A("m2", "Video <b>ad</b>", { asset_type: "video", file_url: null, poster_url: "https://store.example.test/p.jpg" })];
const L = "POST media/list/";

async function page(table, globals = {}) {
  const p = open(["hq.js", "shell.js", "finance-common.js", "training-common.js", "media.js"], { ids: idsOf("media.html"), pathname: "/media/", globals, answers: (call) => {
    const k = key(call);
    assert.ok(Object.prototype.hasOwnProperty.call(table, k), "unexpected call: " + k);
    const reply = table[k];
    return typeof reply === "function" ? reply(call) : reply;
  } });
  await settle();
  return { ...p, sent: (k) => p.calls.filter((c) => key(c) === k), text: (id) => p.node[id].textContent };
}
const byLabel = (root, label) => root.all((n) => n.tagName === "BUTTON" && n.getAttribute("aria-label") === label)[0];
const chipsOf = (li) => li.all((n) => n.classList.contains("chip")).map((n) => n.textContent);
const base = { "GET me/": [200, ME], [L]: [200, { assets: ASSETS }] };

test("the list shows each asset with its state; a video with no file is flagged and cannot be published; titles are text", async () => {
  const p = await page(base);
  const rows = p.node["items"].children;
  assert.equal(rows.length, 2);
  assert.deepEqual(chipsOf(rows[0]), ["Published"]);
  assert.deepEqual(chipsOf(rows[1]), ["Draft", "No video yet"]);
  assert.equal(byLabel(rows[1], "Publish Video <b>ad</b>").disabled, true);
  assert.equal(rows[1].all((n) => n.tagName === "STRONG")[0].textContent, "Video <b>ad</b>");
});

test("Publish and Unpublish send the id, then the list is read again", async () => {
  const p = await page({ ...base, "POST media/unpublish/": [200, A("m1", "x")] });
  byLabel(p.node["items"].children[0], "Unpublish Barley promo").fire("click");
  await settle();
  assert.deepEqual(p.sent("POST media/unpublish/")[0].body, { id: "m1" });
  assert.equal(p.sent(L).length, 2);
});

test("Down sends every id in the new order", async () => {
  const p = await page({ ...base, "POST media/reorder/": [200, { assets: ASSETS }] });
  byLabel(p.node["items"].children[0], "Move Barley promo down").fire("click");
  await settle();
  assert.deepEqual(p.sent("POST media/reorder/")[0].body, { ids: ["m2", "m1"] });
});

test("Delete asks first", async () => {
  const p = await page({ ...base, "POST media/delete/": [200, { status: "deleted" }] });
  byLabel(p.node["items"].children[0], "Delete Barley promo").fire("click");
  assert.equal(p.sent("POST media/delete/").length, 0);
  p.node["confirm-go"].fire("click");
  await settle();
  assert.deepEqual(p.sent("POST media/delete/")[0].body, { id: "m1" });
});

test("an image goes up as one form", async () => {
  const p = await page({ ...base, "POST media/upload/": [200, A("m3", "New")] });
  p.node["n-title"].value = "New";
  p.node["n-file"].files = [{ name: "a.jpg", size: 500, type: "image/jpeg" }];
  p.node["n-form"].fire("submit", { preventDefault() {} });
  await settle();
  const form = p.sent("POST media/upload/")[0].body;
  assert.equal(form.get("asset_type"), "image");
  assert.equal(form.get("title"), "New");
});

test("an image over 10 MB or of the wrong type is stopped before it is sent", async () => {
  const p = await page(base);
  p.node["n-title"].value = "New";
  p.node["n-file"].files = [{ name: "a.gif", size: 500, type: "image/gif" }];
  p.node["n-form"].fire("submit", { preventDefault() {} });
  await settle();
  assert.equal(p.sent("POST media/upload/").length, 0);
  assert.equal(p.node["n-file-err"].hidden, false);
});

test("a video: draft with poster, token, the PUT to the given address with the given headers, then attach", async () => {
  const puts = [];
  class XHR {
    constructor() { this.upload = {}; this.h = {}; }
    open(m, u) { this.m = m; this.u = u; }
    setRequestHeader(k, v) { this.h[k] = v; }
    send(body) { puts.push({ m: this.m, u: this.u, h: this.h, body }); this.status = 200; this.onload(); }
  }
  const info = { upload_url: "https://vercel.com/api/blob/?pathname=media-library%2Fm2%2Fx.mp4", method: "PUT", headers: { authorization: "Bearer t", "x-api-version": "7", "x-content-type": "video/mp4" },
    max_bytes: 50 * 1024 * 1024, public_url: "https://store.example.test/media-library/m2/x.mp4" };
  const p = await page({ ...base, "POST media/upload/": [200, A("m2", "V", { asset_type: "video", file_url: null })], "POST media/video/token/": [200, info], "POST media/video/attach/": [200, A("m2", "V")] }, { XMLHttpRequest: XHR });
  p.node["n-type"].value = "video";
  p.node["n-type"].fire("change");
  p.node["n-title"].value = "V";
  p.node["n-poster"].files = [{ name: "p.jpg", size: 500, type: "image/jpeg" }];
  const movie = { name: "v.mp4", size: 1000, type: "video/mp4" };
  p.node["n-video"].files = [movie];
  p.node["n-form"].fire("submit", { preventDefault() {} });
  await settle();
  const form = p.sent("POST media/upload/")[0].body;
  assert.equal(form.get("asset_type"), "video");
  assert.equal(form.has("file"), false);
  assert.deepEqual(p.sent("POST media/video/token/")[0].body, { id: "m2" });
  assert.equal(puts.length, 1);
  assert.equal(puts[0].u, info.upload_url);
  assert.deepEqual(puts[0].h, info.headers);
  assert.equal(puts[0].body, movie);
  assert.deepEqual(p.sent("POST media/video/attach/")[0].body, { id: "m2", url: info.public_url });
});

test("the page loads its scripts in order and the route exists", () => {
  const html = fs.readFileSync(PUB + "media.html", "utf8");
  assert.deepEqual([...html.matchAll(/<script src="\/assets\/js\/([a-z-]+)\.js/g)].map((m) => m[1]), ["theme", "config", "hq", "menu", "shell", "finance-common", "training-common", "media"]);
  assert.ok(fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8").includes('{ source: "/media/", destination: "/media.html" }'));
});
