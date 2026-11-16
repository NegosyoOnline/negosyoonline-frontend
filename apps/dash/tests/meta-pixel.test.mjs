/* The Meta Pixel settings page (ClickUp z8uq9md3n5, G1, /settings/meta-pixel/, meta-pixel.js). Driven like inbox.test.mjs: the real scripts run
   in a vm with the small stand-in document from dom.mjs and a recorded fetch that plays the API of apps/meta_ads (api_owner.py).
   Fake data only: no real Pixel ID, no token, no test event code, no call to Meta. */
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
const BASE = `/sites/${A}/meta/`;
const FAKE_TOKEN = "fake-token-" + "0".repeat(40); // made up for this test; not a real token
const PIXEL = "123456789012345"; // made up; not a real Pixel
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();

const NONE = { pixel_id: "", token_set: false, test_event_code: "", last_test: null, events: [] };
const FULL = {
  pixel_id: PIXEL, token_set: true, test_event_code: "TEST12345", last_test: { at: iso(5), outcome: "ok" },
  events: [
    { event_name: "PageView", event_id: "pv_0123456789abcdef", created_at: iso(3), outcome: "sent", is_test: false },
    { event_name: "PageView", event_id: "tc_0123456789abcdef", created_at: iso(5), outcome: "failed", is_test: true },
  ],
};

function boot({ conn = NONE, off = false, search = "" } = {}) {
  const doc = makeDocument(), calls = [], toasts = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; return n; };
  doc.createTextNode = (t) => { const w = make("span"); w.textContent = t; return w.firstChild; };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["mp-root", "mp-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const nav = [0, 1].map(() => { const a = doc.createElement("a"); a.setAttribute("data-meta-nav", ""); a.hidden = true; page.appendChild(a); return a; });
  doc.querySelectorAll = (sel) => (sel === "[data-meta-nav]" ? nav : []);
  const s = { conn: { ...conn, events: [...(conn.events || [])] }, off, putAnswer: null, testOutcome: "ok", testAnswer: null };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    let a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    if (opts.method === "GET" && p === "/sites/") a = { status: 200, body: { items: [{ id: A, template: "sante" }], next_cursor: null } };
    else if (s.off) a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    else if (p === BASE && opts.method === "GET") a = { status: 200, body: s.conn };
    else if (p === BASE && opts.method === "PUT") {
      if (s.putAnswer) a = s.putAnswer;
      else {
        if (body.pixel_id !== undefined) s.conn.pixel_id = body.pixel_id;
        if (body.test_event_code !== undefined) s.conn.test_event_code = body.test_event_code;
        if (body.access_token) s.conn.token_set = true;
        a = { status: 200, body: { ...s.conn } };
      }
    } else if (p === BASE + "token/" && opts.method === "DELETE") { s.conn = { ...s.conn, token_set: false }; a = { status: 200, body: { ...s.conn } }; }
    else if (p === BASE + "test/" && opts.method === "POST") {
      s.conn.last_test = { at: iso(0), outcome: s.testOutcome };
      a = s.testAnswer || { status: 200, body: { outcome: s.testOutcome } };
    }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const location = { search, pathname: "/settings/meta-pixel/", replace() {}, assign() {} };
  const context = vm.createContext({ window, document: doc, location, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, Uint8Array, Date,
    localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("meta-pixel.js"), context, { filename: "meta-pixel.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  const all = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label) => buttons(n).find((b) => b.textContent === label);
  return { doc, calls, toasts, s, $, all, buttons, press, nav, window,
    list: () => calls.map((c) => c.method + " " + c.path),
    async open() { window.NOMetaPixel.show(); await settle(); },
    async click(node) { node.fire("click"); await settle(); } };
}

test("not connected: the empty form, a disabled Test button, an empty events list, and the tab shows", async () => {
  const d = boot();
  await d.open();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE]);
  const root = d.$("mp-root");
  assert.equal(root.getAttribute("aria-busy"), null);
  assert.deepEqual(root.all((n) => n.tagName === "H2").map((n) => n.textContent), ["Meta Pixel and Conversions API", "Last events"]);
  assert.equal(d.all(root, "chip")[0].textContent, "Not connected");
  assert.deepEqual(d.all(root, "pm-label").map((l) => l.textContent), ["Pixel ID", "Test event code", "Access token"]);
  assert.equal(d.$("mp-access_token").getAttribute("type"), "password");
  assert.deepEqual(d.buttons(root).map((b) => b.textContent), ["?", "Save", "Test connection"]);
  assert.equal(d.press(root, "Test connection").disabled, true);
  const TIP = "From the Test events tab in Events Manager. The connection test sends one event with this code, so it never touches your live numbers.";
  const q = d.press(root, "?");
  assert.equal(q.getAttribute("data-tip"), TIP);
  assert.equal(q.getAttribute("type"), "button");
  assert.ok(!root.textContent.includes("The test needs a saved Pixel ID"));
  assert.ok(!root.textContent.includes(TIP));
  assert.ok(root.textContent.includes("No events yet."));
  assert.deepEqual(d.nav.map((n) => n.hidden), [false, false]);
});

test("saving sends the three values once, empties the token box, and shows Saved with Replace and Remove, never the token", async () => {
  const d = boot();
  await d.open();
  d.$("mp-pixel_id").value = ` ${PIXEL} `;
  d.$("mp-access_token").value = FAKE_TOKEN;
  d.$("mp-test_event_code").value = "TEST12345";
  await d.click(d.press(d.$("mp-root"), "Save"));
  const put = d.calls.filter((c) => c.method === "PUT");
  assert.equal(put.length, 1);
  assert.deepEqual(put[0].body, { pixel_id: PIXEL, test_event_code: "TEST12345", access_token: FAKE_TOKEN });
  const root = d.$("mp-root");
  assert.equal(d.all(root, "chip")[0].textContent, "Connected");
  assert.ok(root.textContent.includes("Saved"));
  assert.ok(!root.textContent.includes(FAKE_TOKEN), "the token is not on the page");
  assert.equal(d.$("mp-access_token"), null, "no token box while a token is saved");
  assert.deepEqual(d.buttons(root).map((b) => b.textContent), ["?", "Replace", "Remove", "Save", "Test connection"]);
  assert.equal(d.press(root, "Test connection").disabled, false, "all three are saved, so the test is open");
  assert.deepEqual(d.toasts, ["Saved: Your Meta Pixel settings were saved."]);
});

test("saving without a new token sends no access_token key", async () => {
  const d = boot({ conn: FULL });
  await d.open();
  d.$("mp-test_event_code").value = "TEST999";
  await d.click(d.press(d.$("mp-root"), "Save"));
  assert.deepEqual(d.calls.filter((c) => c.method === "PUT").map((c) => c.body), [{ pixel_id: PIXEL, test_event_code: "TEST999" }]);
});

test("a Pixel ID, event code or token that cannot be right is refused on the page, before any request", async () => {
  const d = boot();
  await d.open();
  d.$("mp-pixel_id").value = "12ab";
  await d.click(d.press(d.$("mp-root"), "Save"));
  assert.equal(d.$("mp-pixel_id-err").textContent, "A Pixel ID is 8 to 20 digits.");
  assert.equal(d.$("mp-pixel_id").getAttribute("aria-invalid"), "true");
  assert.equal(d.doc.activeElement, d.$("mp-pixel_id"));
  d.$("mp-pixel_id").value = PIXEL;
  d.$("mp-test_event_code").value = "bad code!";
  d.$("mp-access_token").value = "short token";
  await d.click(d.press(d.$("mp-root"), "Save"));
  assert.equal(d.$("mp-pixel_id").getAttribute("aria-invalid"), null);
  assert.equal(d.$("mp-test_event_code-err").textContent, "A test event code is letters and digits only.");
  assert.equal(d.$("mp-access_token-err").textContent, "That token does not look right. Copy it again from Events Manager.");
  assert.equal(d.calls.filter((c) => c.method === "PUT").length, 0);
});

test("a field the API refuses is shown next to its box through textContent, the toast stays quiet, and the token box is emptied", async () => {
  const d = boot();
  d.s.putAnswer = { status: 422, body: { error: { code: "invalid", message: "Bad", fields: { pixel_id: ["<b>A Pixel ID is 8 to 20 digits.</b>"] } } } };
  await d.open();
  d.$("mp-pixel_id").value = PIXEL;
  d.$("mp-access_token").value = FAKE_TOKEN;
  await d.click(d.press(d.$("mp-root"), "Save"));
  const err = d.$("mp-pixel_id-err");
  assert.equal(err.textContent, "<b>A Pixel ID is 8 to 20 digits.</b>", "shown as text, never parsed as markup");
  assert.equal(err.children.length, 0);
  assert.equal(d.toasts.length, 0);
  assert.equal(d.$("mp-access_token").value, "", "the token box is emptied even when the save is refused");
});

test("connected: the passed test, the last events with the Test chip, and the six test outcomes each say their own line", async () => {
  const d = boot({ conn: FULL });
  await d.open();
  const root = d.$("mp-root");
  assert.equal(d.all(root, "chip")[0].textContent, "Connected");
  const block = d.all(root, "mk-test")[0];
  assert.equal(block.getAttribute("role"), "status");
  assert.ok(block.textContent.startsWith("Test passed" + "Meta accepted the test event."), block.textContent);
  const rows = d.all(root, "mp-event");
  assert.equal(rows.length, 2);
  assert.ok(rows[0].textContent.startsWith("PageViewSent") && rows[0].textContent.includes("pv_0123456789abcdef"), rows[0].textContent);
  assert.ok(rows[1].textContent.startsWith("PageViewNot acceptedTest") && rows[1].textContent.includes("tc_0123456789abcdef"), rows[1].textContent);
  const lines = {
    bad_token: "Meta did not accept the access token.",
    bad_pixel: "Meta could not find this Pixel ID.",
    rate_limited: "Meta is busy right now. Wait a moment and test again.",
    meta_down: "Meta did not answer. Try again in a moment.",
    token_unreadable: "The saved token could not be read. Remove it and save it again.",
  };
  for (const [code, line] of Object.entries(lines)) {
    d.s.testOutcome = code;
    await d.click(d.press(d.$("mp-root"), "Test connection"));
    const bad = d.all(d.$("mp-root"), "mk-test")[0];
    assert.equal(bad.getAttribute("role"), "alert");
    assert.ok(bad.textContent.startsWith("Test failed" + line), bad.textContent);
    assert.equal(d.$("mp-live").textContent, "Test failed.");
  }
  assert.deepEqual(d.list().slice(-2), ["POST " + BASE + "test/", "GET " + BASE]);
  d.s.testOutcome = "something_new";
  await d.click(d.press(d.$("mp-root"), "Test connection"));
  assert.ok(d.all(d.$("mp-root"), "mk-test")[0].textContent.startsWith("Test failedThe test did not pass."));
});

test("Replace opens a new token box, Cancel puts the saved row back; Remove asks twice, then deletes the token", async () => {
  const d = boot({ conn: FULL });
  await d.open();
  await d.click(d.press(d.$("mp-root"), "Replace"));
  assert.deepEqual(d.all(d.$("mp-root"), "pm-label").map((l) => l.textContent), ["Pixel ID", "Test event code", "New access token"]);
  await d.click(d.press(d.$("mp-root"), "Cancel"));
  assert.equal(d.$("mp-access_token"), null);
  const remove = d.press(d.$("mp-root"), "Remove");
  await d.click(remove);
  assert.equal(remove.textContent, "Confirm remove");
  assert.equal(d.calls.filter((c) => c.method === "DELETE").length, 0, "the first press only asks");
  await d.click(remove);
  assert.deepEqual(d.calls.filter((c) => c.method === "DELETE").map((c) => c.path), [BASE + "token/"]);
  assert.ok(d.$("mp-access_token"), "the token box is back");
  assert.equal(d.press(d.$("mp-root"), "Test connection").disabled, true);
  assert.deepEqual(d.toasts, ["Removed: Your access token was removed."]);
});

test("while the API answers 404 (the switch is off) the page says it is not available, and the tab stays hidden", async () => {
  const d = boot({ off: true });
  await d.open();
  assert.ok(d.$("mp-root").textContent.includes("The Meta Pixel is not available yet"));
  assert.deepEqual(d.nav.map((n) => n.hidden), [true, true]);
  d.window.NOMetaPixel.probe();
  await settle();
  assert.deepEqual(d.nav.map((n) => n.hidden), [true, true]);
});

test("probe shows the tab when the API is open and nothing is shown on the page", async () => {
  const d = boot({ conn: FULL });
  d.window.NOMetaPixel.probe();
  await settle();
  assert.deepEqual(d.nav.map((n) => n.hidden), [false, false]);
  assert.equal(d.$("mp-root").children.length, 0);
});

test("the pure helpers", () => {
  const u = boot().window.NOMetaPixel.util;
  assert.equal(u.pixelError(""), "");
  assert.equal(u.pixelError("12345678"), "");
  assert.equal(u.pixelError("1234567"), "A Pixel ID is 8 to 20 digits.");
  assert.equal(u.codeError("TEST12345"), "");
  assert.notEqual(u.codeError("a b"), "");
  assert.equal(u.tokenError(""), "Paste the access token from Events Manager.");
  assert.equal(u.tokenError(FAKE_TOKEN), "");
  assert.deepEqual(Array.from(u.chipOf({ pixel_id: PIXEL, token_set: true })), ["ok", "Connected"]);
  assert.deepEqual(Array.from(u.chipOf({ pixel_id: PIXEL, token_set: false })), ["neutral", "Pixel only"]);
  assert.deepEqual(Array.from(u.chipOf({ pixel_id: "", token_set: true })), ["neutral", "Not connected"]);
  assert.equal(u.canTest({ pixel_id: PIXEL, token_set: true, test_event_code: "T1" }), true);
  assert.equal(u.canTest({ pixel_id: PIXEL, token_set: true, test_event_code: "" }), false);
  assert.equal(u.eventText("skipped_bot"), "Skipped, looks like a bot");
  assert.equal(u.eventText("zzz"), "Unknown");
  const now = new Date("2026-11-14T10:00:00+08:00");
  assert.equal(u.whenText("2026-11-14T09:30:00+08:00", now), "today, 9:30 AM");
  assert.equal(u.whenText("", now), "");
});

test("the markup and the router: one tab, one view, one script, one stylesheet, hooks and no inline script", () => {
  assert.ok(/<section class="view" id="view-settings-meta-pixel" aria-labelledby="h-settings-meta-pixel" hidden>/.test(HTML));
  for (const id of ["h-settings-meta-pixel", "mp-root", "mp-live"]) assert.equal((HTML.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, id + " is in the page once");
  const tabs = [...HTML.matchAll(/<a\b[^>]*data-meta-nav[^>]*>/g)].map((m) => m[0]);
  assert.equal(tabs.length, 1);
  assert.ok(tabs[0].includes('href="/settings/meta-pixel/"') && /\shidden[\s>]/.test(tabs[0]));
  assert.ok(HTML.indexOf("/assets/js/meta-pixel.js") > HTML.indexOf("/assets/js/dashboard.js"));
  assert.equal((HTML.match(/\/assets\/js\/meta-pixel\.js/g) || []).length, 1);
  assert.equal((HTML.match(/\/assets\/css\/meta-pixel\.css/g) || []).length, 1);
  assert.ok(!/<script>[^<]/.test(HTML), "no inline script");
  const DASH = read("dashboard.js");
  assert.ok(DASH.includes('"/settings/meta-pixel/": { view: "settings-meta-pixel"'));
  assert.ok(/VIEWS = \[[^\]]*"settings-meta-pixel"/.test(DASH.replace(/\s+/g, " ")));
  assert.ok(DASH.includes("MP.show()") && DASH.includes("MP.hide()") && DASH.includes("NOMetaPixel.probe()"));
});

test("the page script writes API text only through textContent and keeps no browser storage or token echo", () => {
  const src = read("meta-pixel.js");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|localStorage|sessionStorage/.test(src));
  assert.ok(!/\.value\s*=\s*[^;]*access_token/.test(src));
});
