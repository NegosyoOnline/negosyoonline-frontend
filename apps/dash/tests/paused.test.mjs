/* The Paused by NegosyoOnline banner (H3, ClickUp z8uq9mhpbf): shown on every view only when the owner's site payload says
   held: true exactly; hidden for anything else. Run against the real app.js and paused.js with a recorded fetch. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { answer } from "./load.mjs";

const HTML = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const DASH = fs.readFileSync(new URL("../public/assets/js/dashboard.js", import.meta.url), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa", B = "site_bbbbbbbbbbbbbbbbbbbb";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

/* The bare context's document answers every id with null, so the banner node is injected through a custom getElementById. */
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
async function probeWith(res, search = "") {
  const banner = { hidden: true }, calls = [];
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1" }, addEventListener() {} };
  const location = { search, pathname: "/", replace() {}, assign() {} };
  const document = { getElementById: (id) => (id === "paused-banner" ? banner : null), querySelectorAll: () => [], addEventListener() {},
    createElement: () => ({ setAttribute() {}, appendChild() {} }), cookie: "" };
  const ctx = vm.createContext({ window, document, location, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl,
    fetch: (url) => { calls.push(url.replace("http://api.test/v1", "")); return res; } });
  for (const f of ["app.js", "paused.js"]) vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), ctx, { filename: f });
  window.NOPaused.probe();
  await settle();
  return { shown: banner.hidden === false, calls, window };
}
const sites = (...items) => answer(200, { items, next_cursor: null })();

test("held exactly true on the owner's site shows the banner; the one read is the sites list the dashboard already makes", async () => {
  const r = await probeWith(sites({ id: A, held: true }));
  assert.equal(r.shown, true);
  assert.deepEqual(r.calls, ["/sites/"]);
});

test("held false, missing, a string, or a failed or empty read keeps the banner hidden", async () => {
  for (const [name, res] of [
    ["false", sites({ id: A, held: false })],
    ["missing (switch dark or an older API)", sites({ id: A })],
    ["a string true", sites({ id: A, held: "true" })],
    ["a number", sites({ id: A, held: 1 })],
    ["no sites", sites()],
    ["failed", answer(500, {})()],
    ["unauthorised", answer(401, {})()],
  ]) assert.equal((await probeWith(res)).shown, false, name);
});

test("it reads the site the dashboard shows: ?site= when it is the caller's own, else the first", async () => {
  const both = () => sites({ id: A, held: false }, { id: B, held: true });
  assert.equal((await probeWith(both())).shown, false, "first site");
  assert.equal((await probeWith(both(), "?site=" + B)).shown, true, "named site");
  assert.equal((await probeWith(both(), "?site=site_cccccccccccccccccccc")).shown, false, "a stranger's id falls back to the first");
});

test("the banner is in the page before every view, hidden at first, with the fixed words and a support link", () => {
  const m = HTML.match(/<section class="paused-banner" id="paused-banner"[^>]*>[\s\S]*?<\/section>/);
  assert.ok(m, "the banner is in index.html");
  assert.match(m[0], /\bhidden>/);
  const text = m[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.equal(text, "Paused by NegosyoOnline. Your site and checkout are offline. Contact us to resolve it.");
  assert.match(m[0], /href="mailto:support@negosyoonline\.com"/);
  assert.ok(HTML.indexOf('id="paused-banner"') < HTML.indexOf('id="view-overview"'), "above the views");
  assert.ok(HTML.indexOf('id="paused-banner"') > HTML.indexOf('<main id="main"'), "inside main, so it shows on every view");
  assert.match(HTML, /<script src="\/assets\/js\/paused\.js/);
});

test("the dashboard starts the probe", () => {
  assert.match(DASH, /NOPaused\.probe\(\)/);
});
