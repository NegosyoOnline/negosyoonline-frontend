/* The Inbox screens (ClickUp z8uq9md3n6 and z8uq9mfj12, Unified Inbox): /settings/inbox/ (inbox-settings.js, the channel cards)
   and /inbox/ (inbox.js, the list, the thread and the reply of the stored channels: website chat and email). Driven like
   payments.test.mjs: the real scripts run in a vm with the small stand-in document from dom.mjs and a recorded fetch that plays
   the API of apps/inquiries (api_owner.py). Fake data only: no provider, no real message. */
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
const BASE = `/sites/${A}/inquiries/`;
const WC = "wc_aaaaaaaaaaaaaaaaaaaaaaaa", WC2 = "wc_bbbbbbbbbbbbbbbbbbbbbbbb", EM = "em_cccccccccccccccccccccccc";
const REF = WC;
const REF2 = WC2;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
/* A fixed clock for this whole file (task z8uq9mfvx7): the page shows "today, H:MM" or a date form depending on the Manila time of day,
   so a real clock made tests fail in the evening. Date() and Date.now() answer 10:00 Manila (02:00 UTC) on 2026-11-16 unless
   INBOX_TEST_NOW (an ISO instant) moves it, which is how the evening case is checked. Every test file runs in its own process. */
const FIXED_NOW = Date.parse(process.env.INBOX_TEST_NOW || "2026-11-16T02:00:00Z");
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(FIXED_NOW); else super(...a); }
  static now() { return FIXED_NOW; }
};
const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();

function thread(over = {}) {
  return { ref: REF, display_name: "Maria Santos", channel: "webchat", source: "stored", status: "open", unread: false, contact_email: "maria@example.test", replies: [],
    reply: { open: true, reason: "" },
    messages: [
      { id: "m2", direction: "out", sender_kind: "owner", text: "Hello Maria!", attachments: [], at: iso(2), delivery_state: "" },
      { id: "m1", direction: "in", sender_kind: "customer", text: "Hi po, available pa ba?", attachments: [], at: iso(3), delivery_state: "" },
      { id: "m3", direction: "in", sender_kind: "customer", text: "", attachments: ["image"], at: iso(1), delivery_state: "" }
    ], ...over };
}
function list(over = {}) {
  return { items: [
    { ref: REF, display_name: "Maria Santos", snippet: "Hi po, available pa ba?", updated_at: iso(10), channel: "webchat", source: "stored", status: "open", unread: false },
    { ref: REF2, display_name: "Jun Dela Cruz", snippet: "Magkano po?", updated_at: iso(60 * 30), channel: "webchat", source: "stored", status: "open", unread: false }
  ], stored_next_cursor: null, ...over };
}

/* The stand-in API. `s` holds what each route answers; a route set to a number answers that status with a fixed error body. */
function boot({ listing = list(), reading = thread(), reply = { state: "sent", error_code: "", created_at: iso(0) }, off = false, search = "", channels = null, messenger = null, pages = null, locSearch = "", clock = null } = {}) {
  const doc = makeDocument(), calls = [], toasts = [], replaced = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; n.dispatchEvent = (e) => n.fire(e.type); return n; };
  doc.createTextNode = (t) => { const w = make("span"); w.textContent = t; return w.firstChild; };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["ib-root", "ib-live", "ib-upd", "ibs-root", "ibs-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const refresh = doc.createElement("div"); refresh.setAttribute("id", "ib-refresh"); refresh.hidden = true; page.appendChild(refresh);
  const refreshBtn = doc.createElement("button"); refreshBtn.setAttribute("id", "ib-refresh-btn"); refresh.appendChild(refreshBtn);
  const nav = [0, 1, 2].map(() => { const a = doc.createElement("a"); a.setAttribute("data-inbox-nav", ""); a.hidden = true; page.appendChild(a); return a; });
  doc.querySelectorAll = (sel) => (sel === "[data-inbox-nav]" ? nav : []);
  const s = { listing, reading, reply, off, listAnswer: null, threadAnswer: null, replyAnswer: null,
    channels: channels === null ? null : { ...channels }, channelsPut: null, statusAnswer: null,
    messenger: messenger === null ? null : { ...messenger }, pages, pagesAnswer: null, connectAnswer: null, deleteAnswer: null };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    let a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    const err = (status, code, message) => ({ status, body: { error: { code, message } } });
    if (opts.method === "GET" && p === "/sites/") a = { status: 200, body: { items: [{ id: A, template: "sante" }], next_cursor: null } };
    else if (s.off) a = err(404, "not_found", "Not found.");
    else if (p === BASE + "messenger/connection/" && opts.method === "GET") a = s.messenger ? { status: 200, body: s.messenger } : err(404, "not_found", "Not found.");
    else if (p === BASE + "messenger/pages/" && opts.method === "GET") a = s.pagesAnswer || (s.pages ? { status: 200, body: { items: s.pages } } : { status: 410, body: { error: { code: "pick_expired", message: "Gone." } } });
    else if (p === BASE + "messenger/connect/" && opts.method === "POST") a = s.connectAnswer || { status: 200, body: { status: "active", page_id: body.page_id, page_name: (s.pages.find((x) => x.id === body.page_id) || {}).name, connected_at: iso(0), pick_pending: false } };
    else if (p === BASE + "messenger/connection/" && opts.method === "DELETE") a = s.deleteAnswer || { status: 204, body: {} };
    else if (p === BASE + "channels/" && opts.method === "GET") a = s.channels ? { status: 200, body: s.channels } : err(404, "not_found", "Not found.");
    else if (p === BASE + "channels/" && opts.method === "PUT") {
      if (s.channelsPut) a = s.channelsPut;
      else { s.channels = { ...s.channels, ...body }; if ("paused_until" in body && body.paused_until === null) s.channels.paused_until = null; a = { status: 200, body: s.channels }; }
    }
    else if (/\/conversations\/[^/]+\/(close|reopen|read)\/$/.test(p) && opts.method === "POST") {
      const kind = /\/(close|reopen|read)\/$/.exec(p)[1], ref = /conversations\/([^/]+)\//.exec(p)[1];
      a = s.statusAnswer || { status: 200, body: { ref, status: kind === "close" ? "closed" : "open", unread: kind === "read" ? false : false } };
    }
    else if (/^\/sites\/[^/]+\/inquiries\/conversations\/(\?stored_cursor=[^/]+)?$/.test(p) && opts.method === "GET") a = s.listAnswer || { status: 200, body: s.listing };
    else if (/\/reply\/$/.test(p) && opts.method === "POST") a = s.replyAnswer || { status: 200, body: s.reply };
    else if (/\/conversations\/[^/]+\/$/.test(p) && opts.method === "GET") a = s.threadAnswer || { status: 200, body: s.reading };
    const out = () => {
      if (a.status === 0) return Promise.reject(new Error("offline"));
      return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
    };
    /* s.hold = { re, promise }: the first GET matching `re` answers only when `promise` is done (a slow API). */
    if (s.hold && !s.hold.used && opts.method === "GET" && s.hold.re.test(p)) { s.hold.used = true; return s.hold.promise.then(out); }
    return out();
  };
  const winListeners = {};
  /* The page now polls (z8uq9mg799). Without a fake `clock` a timer of 5 s or more never fires, so the older tests see no background read. */
  const inert = (fn, ms) => (ms >= 5000 ? 0 : setTimeout(fn, ms)), inertClear = (t) => { if (t) clearTimeout(t); };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener(t, f) { (winListeners[t] = winListeners[t] || []).push(f); }, removeEventListener() {}, innerHeight: 800, history: { replaceState(_a, _b, url) { replaced.push(url); } } };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const location = { search: locSearch || search, pathname: "/inbox/", replace() {}, assign() {}, href: "" };
  const context = vm.createContext({ window, document: doc, Event: class { constructor(type) { this.type = type; } }, location, console, URLSearchParams, Promise, Intl, Uint8Array, Date,
    setTimeout: clock ? clock.setTimeout : inert, clearTimeout: clock ? clock.clearTimeout : inertClear, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("inbox.js"), context, { filename: "inbox.js" });
  vm.runInContext(read("inbox-settings.js"), context, { filename: "inbox-settings.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  const where = location;
  const all = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label) => buttons(n).find((b) => b.textContent === label);
  const links = (n) => n.all((x) => x.tagName === "A");
  return { doc, calls, toasts, s, where, winListeners, replaced, $, all, buttons, press, links, nav, window, page, refresh,
    list: () => calls.map((c) => c.method + " " + c.path),
    text: (id) => $(id).textContent,
    async openSettings() { window.NOInboxSettings.show(); await settle(); },
    async openInbox() { window.NOInbox.show(); await settle(); },
    async click(node) { node.fire("click"); await settle(); } };
}

/* ---------- /settings/inbox/ ---------- */

test("settings shows the channel cards and the how-it-works card, and asks only for the sites and the channels", async () => {
  const d = boot({ channels: CH_OFF });
  await d.openSettings();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE + "channels/", "GET " + BASE + "messenger/connection/"]);
  const root = d.$("ibs-root");
  assert.equal(root.getAttribute("aria-busy"), null);
  assert.deepEqual(root.all((n) => n.tagName === "H2").map((n) => n.textContent), ["Inbox channels", "Email", "How the inbox works"]);
  assert.equal(d.all(root, "mk-list")[0].children.length, 3);
  assert.deepEqual(d.nav.map((n) => n.hidden), [false, false, false], "the API answered, so the Inbox links show");
});

test("settings while the API answers 404 (switch off): a plain note, no cards, the Inbox links stay hidden", async () => {
  const d = boot({ off: true });
  await d.openSettings();
  const root = d.$("ibs-root");
  assert.deepEqual(root.all((n) => n.tagName === "H2").map((n) => n.textContent), ["The inbox is not available yet"]);
  assert.equal(root.all((n) => n.tagName === "INPUT").length, 0);
  assert.deepEqual(d.nav.map((n) => n.hidden), [true, true, true]);
  const none = boot();
  await none.openSettings();
  assert.deepEqual(none.$("ibs-root").all((n) => n.tagName === "H2").map((n) => n.textContent), ["The inbox is not available yet"], "no channels route: the same note");
});

/* ---------- /inbox/ ---------- */

test("b1: the list shows each customer with a snippet and time, a channel badge, and no chip on an open conversation", async () => {
  const d = boot();
  await d.openInbox();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE + "conversations/", "GET " + BASE + "channels/"]);
  const rows = d.all(d.$("ib-list"), "ib-item");
  assert.equal(rows.length, 2);
  assert.deepEqual(d.all(rows[0], "ib-name").map((n) => n.textContent), ["Maria Santos"]);
  assert.deepEqual(d.all(rows[0], "ib-snip").map((n) => n.textContent), ["Hi po, available pa ba?"]);
  assert.equal(d.all(rows[0], "ib-av")[0].textContent, "MS");
  assert.equal(d.all(rows[0], "ib-time")[0].textContent.length > 0, true);
  assert.equal(d.all(d.$("ib-list"), "ib-mini").length, 0, "no chip on an open conversation");
  assert.equal(d.refresh.hidden, false);
  assert.ok(d.text("ib-upd").startsWith("Updated today, "), d.text("ib-upd"));
  assert.equal(d.$("ib-threadpane").classList.contains("is-hide-phone"), true, "on a phone the list shows first");
  assert.ok(d.$("ib-threadpane").textContent.includes("Choose a conversation"));
  assert.deepEqual(d.nav.map((n) => n.hidden), [false, false, false]);
});

test("b2: an empty list says so; Show more conversations appears only with a stored cursor and appends", async () => {
  const empty = boot({ listing: { items: [], stored_next_cursor: null } });
  await empty.openInbox();
  assert.ok(empty.$("ib-listbody").textContent.includes("No messages yet"));
  assert.ok(empty.$("ib-listbody").textContent.includes("Press Refresh to check again."));
  assert.ok(!empty.$("ib-listbody").textContent.includes("Facebook"));

  const d = boot({ listing: list({ stored_next_cursor: "30" }) });
  await d.openInbox();
  d.s.listing = { items: [{ ref: "wc_dddddddddddddddddddddddd", display_name: "Liza R.", snippet: "Thanks", updated_at: iso(90), channel: "webchat", source: "stored", status: "open", unread: false }], stored_next_cursor: null };
  await d.click(d.press(d.$("ib-listbody"), "Show more conversations"));
  assert.ok(d.list().includes("GET " + BASE + "conversations/?stored_cursor=30"));
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 3);
  assert.equal(d.press(d.$("ib-listbody"), "Show more conversations"), undefined);
});

test("b3: when the list cannot be read it says so, keeps the last update time and Try again reads again", async () => {
  const d = boot();
  await d.openInbox();
  d.s.listAnswer = { status: 502, body: { error: { code: "server_error", message: "Please try again later." } } };
  await d.click(d.$("ib-refresh-btn"));
  const body = d.$("ib-listbody");
  assert.ok(body.textContent.includes("We couldn't load your conversations"));
  assert.equal(d.all(body, "ib-err")[0].getAttribute("role"), "alert");
  assert.deepEqual(d.buttons(body).map((b) => b.textContent), ["Try again"]);
  assert.deepEqual(d.links(body), []);
  assert.ok(d.text("ib-upd").startsWith("Last updated today, "), d.text("ib-upd"));
  assert.equal(d.refresh.hidden, false);
  d.s.listAnswer = null;
  await d.click(d.press(body, "Try again"));
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 2);
  assert.ok(d.text("ib-upd").startsWith("Updated today, "), d.text("ib-upd"));
});

test("the switch being off gets its own panel, and a response with only the stored source is normal", async () => {
  const off = boot({ off: true });
  await off.openInbox();
  assert.ok(off.$("ib-wrap").textContent.includes("The inbox is not available yet"));
  assert.equal(off.refresh.hidden, true);
  assert.deepEqual(off.nav.map((n) => n.hidden), [true, true, true]);

  for (const sources of [{ stored: "ok" }, undefined]) {
    const listing = list(); if (sources) listing.sources = sources;
    const ok = boot({ listing });
    await ok.openInbox();
    assert.equal(ok.all(ok.$("ib-list"), "ib-item").length, 2);
    assert.equal(ok.all(ok.$("ib-listbody"), "ib-banner").length, 0);
    assert.equal(ok.all(ok.$("ib-listbody"), "ib-err").length, 0);
  }
});

test("c1: opening a conversation shows the messages oldest first with a day heading and an attachment placeholder", async () => {
  const d = boot();
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  assert.ok(d.list().includes("GET " + BASE + `conversations/${REF}/`));
  const pane = d.$("ib-threadpane");
  assert.equal(pane.classList.contains("is-hide-phone"), false);
  assert.equal(d.$("ib-listpane").classList.contains("is-hide-phone"), true);
  assert.equal(d.all(pane, "ib-tname")[0].children[0].textContent, "Maria Santos");
  assert.deepEqual(d.all(pane, "chip").map((c) => c.textContent), ["Open"]);
  assert.deepEqual(d.all(pane, "ib-bub").map((b) => b.textContent), ["Hi po, available pa ba?", "Hello Maria!", "[Photo]"]);
  assert.deepEqual(d.all(pane, "ib-msg").map((m) => m.classList.contains("ib-msg-out")), [false, true, false]);
  assert.equal(d.all(pane, "ib-day").map((x) => x.textContent).pop(), "Today");
  assert.equal(d.links(pane).length, 0, "no link in a thread");
  assert.equal(d.$("ib-list").children[0].children[0].getAttribute("aria-current"), "true");
});

test("c1: Send is off for an empty box, the counter follows the text, and a sent reply posts text and a valid idempotency key, clears the box and reads the thread again", async () => {
  const d = boot();
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  const box = d.$("ib-rb"), send = d.press(d.$("ib-threadpane"), "Send");
  assert.equal(send.disabled, true);
  box.value = "  Ang total po ay PHP 2,450.  "; box.fire("input");
  assert.equal(d.text("ib-rc"), "30 / 2000");
  assert.equal(send.disabled, false);
  await d.click(send);
  const post = d.calls.filter((c) => c.method === "POST" && c.path.endsWith("/reply/"));
  assert.equal(post.length, 1);
  assert.equal(post[0].path, BASE + `conversations/${REF}/reply/`);
  assert.equal(post[0].body.text, "Ang total po ay PHP 2,450.");
  assert.match(post[0].body.idempotency_key, /^[A-Za-z0-9_-]{8,64}$/);
  assert.deepEqual(Object.keys(post[0].body).sort(), ["idempotency_key", "text"]);
  assert.equal(d.$("ib-rb").value, "");
  assert.equal(d.list().filter((c) => c === "GET " + BASE + `conversations/${REF}/`).length, 2, "the thread is read again after a sent reply");
  assert.equal(d.$("ib-live").textContent, "Reply sent.");
});

test("c3: a reply that failed keeps the text, shows the fixed notice, and Try again uses a new key", async () => {
  const d = boot({ reply: { state: "failed", error_code: "email_failed", created_at: iso(0) } });
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  d.$("ib-rb").value = "Ang total po ay PHP 2,450."; d.$("ib-rb").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  const pane = d.$("ib-threadpane");
  const fail = d.all(pane, "ib-fail")[0];
  assert.equal(fail.getAttribute("role"), "alert");
  assert.equal(fail.textContent, "Your reply was not sent. The email could not be sent. Please try again shortly. Your text is still in the box.");
  assert.equal(d.$("ib-rb").value, "Ang total po ay PHP 2,450.");
  assert.ok(d.press(pane, "Try again"));
  d.s.reply = { state: "sent", error_code: "", created_at: iso(0) };
  await d.click(d.press(pane, "Try again"));
  const keys = d.calls.filter((c) => c.method === "POST" && c.path.endsWith("/reply/")).map((c) => c.body.idempotency_key);
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1], "the first attempt is on record as failed, so a retry is a new reply");
  assert.equal(d.all(d.$("ib-threadpane"), "ib-fail").length, 0);
  assert.equal(d.$("ib-rb").value, "");
});

test("a reply whose answer was lost is retried with the same key, so nothing can go twice", async () => {
  const d = boot();
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  d.$("ib-rb").value = "Hello"; d.$("ib-rb").fire("input");
  d.s.replyAnswer = { status: 0 };
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  assert.ok(d.all(d.$("ib-threadpane"), "ib-fail")[0].textContent.includes("it will not be sent twice"));
  d.s.replyAnswer = null;
  await d.click(d.press(d.$("ib-threadpane"), "Try again"));
  const keys = d.calls.filter((c) => c.method === "POST" && c.path.endsWith("/reply/")).map((c) => c.body.idempotency_key);
  assert.equal(keys[0], keys[1]);
});

test("a reply the API refuses shows the API's own sentence and keeps the text", async () => {
  const d = boot();
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  d.$("ib-rb").value = "Hello"; d.$("ib-rb").fire("input");
  d.s.replyAnswer = { status: 422, body: { error: { code: "invalid", message: "That reply is not allowed." } } };
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  assert.equal(d.all(d.$("ib-threadpane"), "ib-fail")[0].textContent, "Your reply was not sent. That reply is not allowed. Your text is still in the box.");
  assert.equal(d.$("ib-rb").value, "Hello");
});

test("the back link returns to the list on a phone; a thread that cannot be opened offers Try again", async () => {
  const d = boot();
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  await d.click(d.$("ib-back"));
  assert.equal(d.$("ib-listpane").classList.contains("is-hide-phone"), false);
  assert.equal(d.$("ib-threadpane").classList.contains("is-hide-phone"), true);

  const e = boot();
  e.s.threadAnswer = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
  await e.openInbox();
  await e.click(e.all(e.$("ib-list"), "ib-item")[0]);
  assert.ok(e.$("ib-threadpane").textContent.includes("This conversation is no longer available."));
  assert.ok(e.press(e.$("ib-threadpane"), "Try again"));
});

test("a customer's name, message and link reach the page as text only", async () => {
  const evil = "<img src=x onerror=alert(1)>";
  const d = boot({
    listing: list({ items: [{ ref: REF, display_name: evil, snippet: evil, updated_at: iso(1), channel: "webchat", source: "stored", status: "open", unread: false }] }),
    reading: thread({ display_name: evil, messages: [{ id: "x", direction: "in", sender_kind: "customer", text: evil, attachments: [], at: iso(1) }] })
  });
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  assert.equal(d.page.all((n) => n.tagName === "IMG").length, 0);
  assert.ok(d.$("ib-wrap").textContent.includes(evil));
});

test("leaving the page empties it and drops a late answer", async () => {
  const d = boot();
  d.window.NOInbox.show();
  d.window.NOInbox.hide();
  await settle();
  assert.equal(d.$("ib-root").childNodes.length, 0);
  assert.equal(d.refresh.hidden, true);
});

/* ---------- helpers, markup and routes ---------- */

test("helpers: days in Manila time, initials, key shape and failure text", async () => {
  const d = boot();
  const u = d.window.NOInbox.util, now = new Date("2026-11-14T04:00:00Z"); /* 12:00 PM in Manila */
  assert.equal(u.listTime("2026-11-14T02:38:00Z", now), "10:38 AM");
  assert.equal(u.listTime("2026-11-13T05:00:00Z", now), "Yesterday");
  assert.equal(u.listTime("2026-11-11T05:00:00Z", now), "Wed");
  assert.equal(u.listTime("2026-11-02T05:00:00Z", now), "Nov 2");
  assert.equal(u.listTime("2025-11-02T05:00:00Z", now), "Nov 2, 2025");
  assert.equal(u.listTime("not a date", now), "");
  assert.equal(u.dayLabel("2026-11-14T02:38:00Z", now), "Today");
  assert.equal(u.dayLabel("2026-11-12T02:38:00Z", now), "Nov 12");
  assert.equal(u.whenText("2026-11-15T02:38:00Z", now), "tomorrow, 10:38 AM");
  assert.equal(u.whenText("2026-11-12T07:05:00Z", now), "Nov 12, 3:05 PM");
  assert.equal(u.initialsOf("Maria Santos"), "MS");
  assert.equal(u.initialsOf("Jun Dela Cruz"), "JC");
  assert.equal(u.initialsOf("liza"), "L");
  assert.equal(u.initialsOf(""), "?");
  for (let i = 0; i < 5; i++) assert.match(u.newKey(), /^[A-Za-z0-9_-]{8,64}$/);
  assert.notEqual(u.newKey(), u.newKey());
  assert.equal(u.channelOf({ channel: "email" }), "email");
  assert.equal(u.channelOf({ ref: "wc_abc" }), "webchat");
  assert.equal(u.channelOf({ ref: "em_abc" }), "email");
  assert.equal(u.channelOf({ ref: "104829384756123_7000000000001" }), "", "a ref that names no stored channel has no channel");
  assert.equal(u.failure({ status: 404 }).kind, "gone");
  assert.equal(u.failure({ status: 502 }).kind, "down");
  assert.deepEqual(u.ordered([{ at: "2026-11-14T02:00:00Z", id: 2 }, { at: "2026-11-14T01:00:00Z", id: 1 }]).map((m) => m.id), [1, 2]);
  assert.deepEqual(u.ordered([{ at: null, id: 2 }, { at: "2026-11-14T01:00:00Z", id: 1 }]).map((m) => m.id), [2, 1], "no time on one message keeps the order given");
});

test("the markup: both views, the refresh header, the hidden Inbox links in all four places, and the scripts in order", () => {
  assert.ok(/<section class="view" id="view-inbox" aria-labelledby="h-inbox" hidden>/.test(HTML));
  assert.ok(/<section class="view" id="view-settings-inbox" aria-labelledby="h-settings-inbox" hidden>/.test(HTML));
  for (const id of ["h-inbox", "h-settings-inbox", "ib-root", "ib-live", "ib-refresh", "ib-upd", "ib-refresh-btn", "ibs-root", "ibs-live"]) assert.equal((HTML.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, id + " is in the page once");
  const navLinks = [...HTML.matchAll(/<a\b[^>]*data-inbox-nav[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(navLinks.map((a) => /href="([^"]+)"/.exec(a)[1]), ["/inbox/", "/settings/inbox/", "/inbox/", "/settings/inbox/"], "sidebar, Settings tab, bottom tabs and More tile");
  for (const a of navLinks) assert.ok(/\shidden[\s>]/.test(a), "starts hidden: " + a);
  assert.ok(HTML.indexOf("/assets/js/inbox.js") > HTML.indexOf("/assets/js/dashboard.js"));
  assert.ok(HTML.indexOf("/assets/js/inbox-settings.js") > HTML.indexOf("/assets/js/inbox.js"));
  assert.ok(HTML.includes('/assets/css/inbox.css?v='));
  assert.ok(!/<script>[^<]/.test(HTML), "no inline script");
});

test("the router knows both addresses and calls the pages' show and hide", () => {
  const DASH = read("dashboard.js");
  assert.ok(DASH.includes('"/inbox/": { view: "inbox"'));
  assert.ok(DASH.includes('"/settings/inbox/": { view: "settings-inbox"'));
  assert.ok(/VIEWS = \[[^\]]*"inbox"[^\]]*"settings-inbox"|VIEWS = \[[^\]]*"settings-inbox"[^\]]*"inbox"/.test(DASH.replace(/\s+/g, " ")));
  assert.ok(/TAB_VIEWS = \[[^\]]*"inbox"/.test(DASH));
  assert.ok(DASH.includes("IB.show()") && DASH.includes("IB.hide()") && DASH.includes("IS.show()") && DASH.includes("IS.hide()"));
  assert.ok(DASH.includes("window.NOInbox.probe()"));
});

test("the probe shows the Inbox links only when the channels read is not a 404", async () => {
  const on = boot({ channels: CHANNELS_ON });
  on.window.NOInbox.probe(); await settle();
  assert.deepEqual(on.nav.map((n) => n.hidden), [false, false, false]);
  assert.deepEqual(on.list(), ["GET /sites/", "GET " + BASE + "channels/"]);
  const off = boot({ off: true, channels: CHANNELS_ON });
  off.window.NOInbox.probe(); await settle();
  assert.deepEqual(off.nav.map((n) => n.hidden), [true, true, true]);
});

/* ---------- G3 PR3 (ClickUp z8uq9mfj12): website chat and email. Mockups d1 to d7. ---------- */

const MIXED = () => ({
  items: [
    { ref: WC, display_name: "Ana Reyes (test)", snippet: "Hi! Do you ship to Cebu?", updated_at: iso(5), channel: "webchat", source: "stored", status: "open", unread: true },
    { ref: EM, display_name: "Jun Dela Cruz (test)", snippet: "Order #1042 (test)", updated_at: iso(60), channel: "email", source: "stored", status: "open", unread: false },
    { ref: WC2, display_name: "Liza R. (test)", snippet: "Thank you!", updated_at: iso(60 * 30), channel: "webchat", source: "stored", status: "closed", unread: false }
  ], stored_next_cursor: null, sources: { stored: "ok" }
});
const CHANNELS_ON = { webchat_enabled: true, paused_until: null, chat_limit_reached: false, webchat_available: true };
const sthread = (over = {}) => ({
  ref: WC, display_name: "Ana Reyes (test)", channel: "webchat", source: "stored", status: "open", unread: true, contact_email: "",
  reply: { open: true, reason: "" }, replies: [],
  messages: [
    { id: "1", direction: "in", sender_kind: "customer", text: "Hi! Do you ship to Cebu?", attachments: [], at: iso(10), delivery_state: "" },
    { id: "2", direction: "out", sender_kind: "owner", text: "Yes, we ship to Cebu.", attachments: [], at: iso(5), delivery_state: "sent" }
  ], ...over
});
const emailThread = (over = {}) => sthread({ ref: EM, display_name: "Jun Dela Cruz (test)", channel: "email", contact_email: "jun.delacruz@example.test", unread: false, ...over });
const comboBox = (d, id) => d.$(id).parentNode.all((n) => n.classList.contains("ib-combo-box"))[0];
const comboInput = (d, id) => d.$(id).parentNode.all((n) => n.classList.contains("ib-combo-input"))[0];
const comboRows = (d, id) => d.$(id).parentNode.all((n) => n.classList.contains("ib-combo-opt")).map((n) => n.textContent);
const rowsOf = (d) => d.all(d.$("ib-list"), "ib-item");

test("d1: every row has a neutral channel badge (icon and words); an unread row has a dot with its own words; a closed one has a Closed chip", async () => {
  const d = boot({ listing: MIXED(), channels: CHANNELS_ON });
  await d.openInbox();
  const rows = rowsOf(d);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => d.all(r, "ib-ch")[0].textContent), ["Website chat", "Email", "Website chat"]);
  assert.ok(rows.every((r) => d.all(r, "ib-ch")[0].all((n) => n.tagName === "SVG").length === 1), "an icon in every badge");
  assert.ok(rows[0].classList.contains("ib-unread"));
  assert.equal(d.all(rows[0], "ib-dot")[0].textContent, "Unread. ");
  assert.equal(d.all(rows[1], "ib-dot").length, 0, "a read row has no unread flag");
  assert.deepEqual(rows.map((r) => d.all(r, "chip").map((c) => c.textContent)), [[], [], ["Closed"]]);
  assert.match(d.$("ib-wrap").textContent, /Conversations/);
});

test("d1: the Channel filter is the house dropdown showing All channels; Email shows only email; typing filters the options", async () => {
  const d = boot({ listing: MIXED(), channels: CHANNELS_ON });
  await d.openInbox();
  const sel = d.$("ib-filter");
  assert.ok(sel.parentNode.classList.contains("ib-combo"));
  assert.ok(sel.classList.contains("ib-combo-native"));
  assert.equal(sel.getAttribute("aria-hidden"), "true");
  assert.equal(comboInput(d, "ib-filter").getAttribute("role"), "combobox");
  assert.equal(comboInput(d, "ib-filter").value, "All channels", "a filter with a real default shows its value");
  assert.equal(d.all(d.$("ib-listbody"), "pm-label")[0].textContent, "Channel");
  comboBox(d, "ib-filter").fire("click");
  assert.deepEqual(comboRows(d, "ib-filter"), ["All channels", "Website chat", "Email", "Facebook Messenger"]);
  const input = comboInput(d, "ib-filter");
  input.value = "web"; input.fire("input");
  assert.deepEqual(comboRows(d, "ib-filter"), ["Website chat"]);
  input.value = "zzz"; input.fire("input");
  assert.deepEqual(comboRows(d, "ib-filter"), ["No matches"]);
  input.value = ""; input.fire("input");
  d.$("ib-filter").parentNode.all((n) => n.classList.contains("ib-combo-opt")).find((n) => n.textContent === "Email").fire("click");
  await settle();
  assert.deepEqual(rowsOf(d).map((r) => d.all(r, "ib-name")[0].textContent), ["Jun Dela Cruz (test)"]);
  assert.equal(comboInput(d, "ib-filter").value, "Email");
  assert.ok(!d.list().some((c) => /GET .*conversations\/$/.test(c) && d.list().filter((x) => x === c).length > 1), "filtering reads nothing again");
});

test("d1: a channel with no conversations says so, and Escape leaves the dropdown without choosing", async () => {
  const only = MIXED(); only.items = only.items.filter((i) => i.channel !== "email");
  const d = boot({ listing: only, channels: CHANNELS_ON });
  await d.openInbox();
  comboBox(d, "ib-filter").fire("click");
  comboInput(d, "ib-filter").fire("keydown", { key: "Escape", stopPropagation() {} });
  assert.equal(d.$("ib-filter").parentNode.classList.contains("is-open"), false);
  assert.equal(d.$("ib-filter").value, "all");
  comboBox(d, "ib-filter").fire("click");
  d.$("ib-filter").parentNode.all((n) => n.classList.contains("ib-combo-opt")).find((n) => n.textContent === "Email").fire("click");
  assert.ok(d.$("ib-listbody").textContent.includes("No conversations in this channel yet."));
});

test("d1: a list response with only the stored source, or none, shows no warning and no error", async () => {
  for (const sources of [{ stored: "ok" }, undefined]) {
    const listing = MIXED(); if (sources) listing.sources = sources; else delete listing.sources;
    const d = boot({ listing, channels: CHANNELS_ON });
    await d.openInbox();
    assert.equal(d.all(d.$("ib-listbody"), "ib-banner").length, 0, JSON.stringify(sources));
    assert.equal(d.all(d.$("ib-listbody"), "ib-err").length, 0);
    assert.equal(rowsOf(d).length, 3, "the stored conversations are listed");
  }
});

test("d5: paused and limit reached are one banner at a time, the limit first; none when chat is off, not live, or the pause is over", async () => {
  const until = new Date(Date.now() + 3 * 3600000).toISOString();
  const banners = async (channels) => { const d = boot({ listing: MIXED(), channels }); await d.openInbox(); return { d, list: d.all(d.$("ib-listbody"), "ib-banner") }; };
  const both = await banners({ ...CHANNELS_ON, paused_until: until, chat_limit_reached: true });
  assert.equal(both.list.length, 1);
  assert.ok(both.list[0].textContent.startsWith("Today's chat limit was reached. Visitors see that chat is not available. Website chat opens again tomorrow."));
  assert.equal(both.d.links(both.list[0]).length, 0);
  const paused = await banners({ ...CHANNELS_ON, paused_until: until });
  assert.equal(paused.list.length, 1);
  assert.match(paused.list[0].textContent, /^Website chat is paused until today, \d{1,2}:\d{2} [AP]M\. Visitors see that chat is not available and are pointed to the contact form\./);
  const link = paused.d.links(paused.list[0])[0];
  assert.equal(link.textContent, "Resume or change in Settings");
  assert.equal(link.getAttribute("href"), "/settings/inbox/");
  for (const ch of [{ ...CHANNELS_ON, webchat_enabled: false, paused_until: until, chat_limit_reached: true }, { ...CHANNELS_ON, webchat_available: false, paused_until: until },
    { ...CHANNELS_ON, paused_until: new Date(Date.now() - 60000).toISOString() }, CHANNELS_ON, null]) {
    assert.equal((await banners(ch)).list.length, 0, JSON.stringify(ch));
  }
});

test("a website chat thread: badge, Open chip, Close conversation, the no-email note, and the chat delivery chip on the owner's message", async () => {
  const d = boot({ listing: MIXED(), reading: sthread(), channels: CHANNELS_ON });
  await d.openInbox();
  await d.click(rowsOf(d)[0]);
  const pane = d.$("ib-threadpane");
  assert.equal(d.all(pane, "ib-tname")[0].all((n) => n.tagName === "H2")[0].textContent, "Ana Reyes (test)");
  assert.equal(d.all(pane, "ib-chrow")[0].textContent, "Website chatOpen");
  assert.ok(d.press(pane, "Close conversation"));
  assert.equal(d.all(pane, "ib-note")[0].textContent, "No email address was given. Your reply shows in the chat only while the visitor's browser keeps it.");
  assert.ok(d.all(pane, "ib-note")[0].classList.contains("ib-note-info"));
  assert.deepEqual(d.all(pane, "chip").map((c) => c.textContent).filter((t) => t !== "Open"), ["Delivered to chat when the visitor is online"]);
  assert.ok(d.all(pane, "ib-msg-out")[0].textContent.includes("Yes, we ship to Cebu."));
  assert.equal(d.all(pane, "ib-count")[0].textContent, "0 / 2000");
  assert.ok(d.list().includes("POST " + BASE + `conversations/${WC}/read/`), "opening an unread conversation marks it read");
  assert.ok(!rowsOf(d)[0].classList.contains("ib-unread"), "and the dot goes");
});

test("a chat visitor who gave an email has no no-email note", async () => {
  const d = boot({ listing: MIXED(), reading: sthread({ contact_email: "ana@example.test" }), channels: CHANNELS_ON });
  await d.openInbox();
  await d.click(rowsOf(d)[0]);
  assert.equal(d.all(d.$("ib-threadpane"), "ib-note").length, 0);
});

test("d3: an email thread shows the address, the unverified-sender note as a note only, and the Sent to the mail server chip", async () => {
  const reading = emailThread({ messages: [
    { id: "1", direction: "in", sender_kind: "customer", text: "Subject: Order #1042 (test)\n\nNo tracking number.", attachments: [], at: iso(30), delivery_state: "" },
    { id: "2", direction: "out", sender_kind: "owner", text: "Shipped yesterday.", attachments: [], at: iso(20), delivery_state: "sent" }] });
  const d = boot({ listing: MIXED(), reading, channels: CHANNELS_ON });
  await d.openInbox();
  await d.click(rowsOf(d)[1]);
  const pane = d.$("ib-threadpane");
  assert.equal(d.all(pane, "ib-sub")[0].textContent, "jun.delacruz@example.test");
  assert.equal(d.all(pane, "ib-note")[0].textContent, "This address was typed into your contact form and has not been confirmed.");
  assert.ok(!d.all(pane, "ib-note")[0].classList.contains("ib-note-info"));
  assert.deepEqual(d.all(pane, "chip").map((c) => c.textContent).filter((t) => t !== "Open"), ["Sent to the mail server"]);
  assert.ok(d.all(pane, "ib-msg-in")[0].textContent.includes("Contact form"), "the first message says it came from the contact form");
  assert.equal(d.press(pane, "Send").disabled, true, "replying needs no extra confirm click, only text (P1)");
  const ta = d.$("ib-rb"); ta.value = "More text"; ta.fire("input");
  assert.equal(d.press(pane, "Send").disabled, false);
  const verified = boot({ listing: MIXED(), reading: emailThread({ auth_flag: "" }), channels: CHANNELS_ON });
  await verified.openInbox(); await verified.click(rowsOf(verified)[1]);
  assert.equal(verified.all(verified.$("ib-threadpane"), "ib-note").length, 0, "no note once the API says the sender is verified");
});

test("d7: each reply failure code shows its fixed chip and its fixed notice, the text stays in the box, and Try again sends it again with a new key", async () => {
  const CODES = {
    sender_not_ready: "Email replies are not set up for this store.",
    no_recipient: "This conversation has no email address to reply to.",
    email_failed: "The email could not be sent. Please try again shortly.",
    rate_limited: "Too many emails have been sent from this store. Please wait and try again."
  };
  for (const [code, text] of Object.entries(CODES)) {
    const failedThread = emailThread({ messages: [{ id: "9", direction: "out", sender_kind: "owner", text: "Typed reply", attachments: [], at: iso(1), delivery_state: "failed" }],
      replies: [{ state: code === "rate_limited" ? "blocked_rate" : "failed", error_code: code, created_at: iso(1), message: text }] });
    const d = boot({ listing: MIXED(), reading: emailThread(), channels: CHANNELS_ON,
      reply: { state: code === "rate_limited" ? "blocked_rate" : "failed", error_code: code, message: text, created_at: iso(0) } });
    await d.openInbox();
    await d.click(rowsOf(d)[1]);
    const ta = d.$("ib-rb"); ta.value = "Typed reply"; ta.fire("input");
    d.s.reading = failedThread;
    await d.click(d.press(d.$("ib-threadpane"), "Send"));
    const pane = d.$("ib-threadpane");
    const fail = d.all(pane, "ib-fail")[0];
    assert.equal(fail.getAttribute("role"), "alert");
    assert.equal(fail.textContent, "Your reply was not sent. " + text + " Your text is still in the box.", code);
    assert.ok(d.all(pane, "chip").some((c) => c.textContent === "Failed: " + text), code);
    assert.equal(d.$("ib-rb").value, "Typed reply", "the text stays in the box");
    assert.ok(d.press(pane, "Try again"), "a Try again button");
    const keys = [d.calls.filter((c) => c.path.endsWith("/reply/")).at(-1).body.idempotency_key];
    d.s.reply = { state: "sent", error_code: "", created_at: iso(0) };
    d.s.reading = emailThread();
    await d.click(d.press(d.$("ib-threadpane"), "Try again"));
    keys.push(d.calls.filter((c) => c.path.endsWith("/reply/")).at(-1).body.idempotency_key);
    assert.notEqual(keys[0], keys[1], "a reply the API already answered is sent again with a new key");
    assert.equal(d.all(d.$("ib-threadpane"), "ib-fail").length, 0);
    assert.equal(d.$("ib-rb").value, "", "sent: the box empties");
  }
});

test("a reply to website chat shows Delivered to chat; sent is recorded by reading the thread again", async () => {
  const sent = sthread({ messages: [...sthread().messages, { id: "3", direction: "out", sender_kind: "owner", text: "One more thing.", attachments: [], at: iso(0), delivery_state: "sent" }] });
  const d = boot({ listing: MIXED(), reading: sthread(), channels: CHANNELS_ON });
  await d.openInbox(); await d.click(rowsOf(d)[0]);
  const ta = d.$("ib-rb"); ta.value = "One more thing."; ta.fire("input");
  d.s.reading = sent;
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  assert.deepEqual(d.calls.filter((c) => c.path.endsWith("/reply/")).map((c) => Object.keys(c.body).sort()), [["idempotency_key", "text"]]);
  assert.equal(d.all(d.$("ib-threadpane"), "chip").filter((c) => c.textContent === "Delivered to chat when the visitor is online").length, 2);
  assert.equal(d.$("ib-live").textContent, "Reply sent.");
});

test("d4: Close conversation closes it; the reply box is off with the reason, the chip says Closed and the button says Reopen conversation; Reopen turns it back", async () => {
  const d = boot({ listing: MIXED(), reading: sthread(), channels: CHANNELS_ON });
  await d.openInbox(); await d.click(rowsOf(d)[0]);
  await d.click(d.press(d.$("ib-threadpane"), "Close conversation"));
  assert.ok(d.list().includes("POST " + BASE + `conversations/${WC}/close/`));
  let pane = d.$("ib-threadpane");
  assert.equal(d.all(pane, "ib-chrow")[0].textContent, "Website chatClosed");
  assert.equal(d.$("ib-rb").disabled, true);
  assert.equal(d.all(pane, "ib-closed-t")[0].textContent, "This conversation is closed. Reopen it to reply.");
  assert.equal(d.press(pane, "Send").disabled, true);
  assert.equal(d.press(pane, "Send").getAttribute("aria-disabled"), "true");
  assert.ok(d.all(d.$("ib-listbody"), "chip").some((c) => c.textContent === "Closed"), "the list row says Closed too");
  assert.equal(d.$("ib-live").textContent, "Conversation closed.");
  await d.click(d.press(pane, "Reopen conversation"));
  assert.ok(d.list().includes("POST " + BASE + `conversations/${WC}/reopen/`));
  pane = d.$("ib-threadpane");
  assert.equal(d.all(pane, "ib-chrow")[0].textContent, "Website chatOpen");
  assert.equal(d.$("ib-rb").disabled, false);
  assert.ok(d.press(pane, "Close conversation"));
});

test("Reopen refused because the visitor has another open conversation: the API's line in a toast, the thread stays closed", async () => {
  const d = boot({ listing: MIXED(), reading: sthread({ status: "closed", reply: { open: false, reason: "closed" } }), channels: CHANNELS_ON });
  await d.openInbox(); await d.click(rowsOf(d)[2]);
  d.s.statusAnswer = { status: 409, body: { error: { code: "conflict", message: "That visitor already has another open conversation." } } };
  await d.click(d.press(d.$("ib-threadpane"), "Reopen conversation"));
  assert.deepEqual(d.toasts, ["That did not work: That visitor already has another open conversation."]);
  assert.ok(d.press(d.$("ib-threadpane"), "Reopen conversation"));
  assert.equal(d.$("ib-rb").disabled, true);
});

test("a reply to a conversation closed meanwhile (409 closed) turns the thread to the closed view", async () => {
  const d = boot({ listing: MIXED(), reading: sthread(), channels: CHANNELS_ON });
  await d.openInbox(); await d.click(rowsOf(d)[0]);
  const ta = d.$("ib-rb"); ta.value = "Late reply"; ta.fire("input");
  d.s.replyAnswer = { status: 409, body: { error: { code: "closed", message: "This conversation is closed. Reopen it to reply." } } };
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  assert.equal(d.$("ib-rb").disabled, true);
  assert.ok(d.press(d.$("ib-threadpane"), "Reopen conversation"));
});

test("a stored channel's text and names reach the page as text only, never as markup or a link", async () => {
  const evil = '<img src=x onerror=alert(1)> https://evil.example/x';
  const listing = MIXED(); listing.items[0].display_name = evil; listing.items[0].snippet = evil;
  const d = boot({ listing, reading: sthread({ display_name: evil, messages: [{ id: "1", direction: "in", sender_kind: "customer", text: evil, attachments: [], at: iso(1), delivery_state: "" }] }), channels: CHANNELS_ON });
  await d.openInbox(); await d.click(rowsOf(d)[0]);
  assert.ok(d.$("ib-threadpane").textContent.includes(evil));
  assert.equal(d.$("ib-threadpane").all((n) => n.tagName === "IMG").length, 0);
  assert.deepEqual(d.links(d.$("ib-threadpane")), [], "no auto-link");
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(read("inbox.js") + read("inbox-settings.js")));
});

test("the stored channels' own pages: Show more conversations follows stored_next_cursor", async () => {
  const listing = MIXED(); listing.stored_next_cursor = "1700000000000000_12";
  const d = boot({ listing, channels: CHANNELS_ON });
  await d.openInbox();
  await d.click(d.press(d.$("ib-listbody"), "Show more conversations"));
  assert.ok(d.list().includes("GET " + BASE + "conversations/?stored_cursor=1700000000000000_12") || d.list().some((c) => c.includes("stored_cursor=")), d.list().join("\n"));
});

/* ---------- Settings > Inbox channels (d6) ---------- */

const CH_OFF = { webchat_enabled: false, paused_until: null, chat_limit_reached: false, webchat_available: true };
const switchOf = (d, id) => d.$(id);

test("d6: the Inbox channels card, then Email, then How the inbox works; the web chat switch writes webchat_enabled", async () => {
  const d = boot({ channels: CH_OFF });
  await d.openSettings();
  const root = d.$("ibs-root");
  assert.deepEqual(root.all((n) => n.tagName === "H2").map((n) => n.textContent), ["Inbox channels", "Email", "How the inbox works"]);
  const sw = switchOf(d, "ibs-sw-chat");
  assert.equal(sw.getAttribute("role"), "switch");
  assert.equal(sw.getAttribute("aria-checked"), "false");
  assert.equal(sw.textContent, "Off");
  assert.equal(d.$("ibs-pause"), null, "no pause controls while chat is off");
  await d.click(sw);
  assert.deepEqual(d.calls.filter((c) => c.method === "PUT" && c.path.endsWith("channels/")).map((c) => c.body), [{ webchat_enabled: true }]);
  assert.equal(switchOf(d, "ibs-sw-chat").getAttribute("aria-checked"), "true");
  assert.equal(switchOf(d, "ibs-sw-chat").textContent, "On");
  assert.ok(d.$("ibs-pause"));
  assert.equal(d.doc.activeElement, switchOf(d, "ibs-sw-chat"), "focus stays on the switch");
  await d.click(switchOf(d, "ibs-sw-chat"));
  assert.deepEqual(d.calls.filter((c) => c.method === "PUT" && c.path.endsWith("channels/")).map((c) => c.body).at(-1), { webchat_enabled: false });
});

test("d6: Pause for is the house dropdown with a grey placeholder, nothing selected, the visible label reads Pause chat until, typing filters; Pause chat sends the time; Resume clears it", async () => {
  const d = boot({ channels: { ...CHANNELS_ON } });
  await d.openSettings();
  const root = d.$("ibs-root");
  const sel = d.$("ibs-pause");
  assert.ok(sel.parentNode.classList.contains("ib-combo"));
  assert.equal(sel.value, "", "nothing is selected on open");
  assert.equal(comboInput(d, "ibs-pause").value, "");
  assert.equal(comboInput(d, "ibs-pause").getAttribute("placeholder"), "Pause for");
  const labels = d.all(root, "pm-label").map((l) => l.textContent);
  assert.ok(labels.includes("Pause chat until"), "the visible label reads Pause chat until");
  assert.ok(root.textContent.includes("Pause for"), "the dropdown keeps its Pause for accessible name");
  assert.equal(d.press(root, "Pause chat").disabled, true, "Pause chat waits for a choice");
  comboBox(d, "ibs-pause").fire("click");
  assert.deepEqual(comboRows(d, "ibs-pause"), ["1 hour", "4 hours", "Until tomorrow", "Until I turn it back on"], "the placeholder is not an option");
  const input = comboInput(d, "ibs-pause");
  input.value = "hou"; input.fire("input");
  assert.deepEqual(comboRows(d, "ibs-pause"), ["1 hour", "4 hours"]);
  input.value = ""; input.fire("input");
  d.$("ibs-pause").parentNode.all((n) => n.classList.contains("ib-combo-opt")).find((n) => n.textContent === "4 hours").fire("click");
  assert.equal(d.$("ibs-pause").value, "4h");
  assert.equal(d.press(d.$("ibs-root"), "Pause chat").disabled, false);
  const before = Date.now();
  await d.click(d.press(d.$("ibs-root"), "Pause chat"));
  const put = d.calls.filter((c) => c.method === "PUT" && c.path.endsWith("channels/")).at(-1).body;
  assert.deepEqual(Object.keys(put), ["paused_until"]);
  assert.ok(Math.abs(Date.parse(put.paused_until) - (before + 4 * 3600000)) < 5000);
  const status = d.$("ibs-pause-status");
  assert.ok(status.classList.contains("chip-warn"));
  assert.match(status.textContent, /^Website chat is paused until today, \d{1,2}:\d{2} [AP]M\.$/);
  assert.equal(d.$("ibs-pause").value, "", "the dropdown is empty again after pausing");
  await d.click(d.$("ibs-resume"));
  assert.deepEqual(d.calls.filter((c) => c.method === "PUT" && c.path.endsWith("channels/")).at(-1).body, { paused_until: null });
  assert.ok(d.$("ibs-pause-status").classList.contains("chip-ok"));
  assert.equal(d.$("ibs-pause-status").textContent, "Website chat is on. Visitors can write to you.");
  assert.equal(d.$("ibs-resume"), null);
});

test("Pause for: each choice is a time the API accepts; Until tomorrow is 08:00 Manila the next day; Until I turn it back on is the 90-day maximum", () => {
  const u = (() => { const d = boot(); return d.window.NOInboxSettings.util; })();
  const now = new Date("2026-11-16T16:30:00Z"); // 00:30 on Nov 17 in Manila
  assert.equal(u.pauseUntil("1h", now), "2026-11-16T17:30:00.000Z");
  assert.equal(u.pauseUntil("4h", now), "2026-11-16T20:30:00.000Z");
  assert.equal(u.pauseUntil("tomorrow", now), "2026-11-18T00:00:00.000Z", "Nov 18, 08:00 in Manila");
  assert.equal(u.pauseUntil("tomorrow", new Date("2026-11-16T02:00:00Z")), "2026-11-17T00:00:00.000Z", "10:00 on Nov 16 in Manila: tomorrow is Nov 17 at 08:00");
  const manual = Date.parse(u.pauseUntil("manual", now)), max = now.getTime() + 90 * 86400000;
  assert.ok(manual < max && manual > max - 3600000, "just inside the API's 90 days");
  assert.equal(u.pauseUntil("", now), "");
  assert.equal(u.pauseUntil("nope", now), "");
});

test("a pause the API refuses shows its line in a toast and changes nothing on the page", async () => {
  const d = boot({ channels: { ...CHANNELS_ON } });
  await d.openSettings();
  d.s.channelsPut = { status: 422, body: { error: { code: "invalid", message: "Pick a time in the future, within 90 days.", fields: { paused_until: ["Pick a time in the future, within 90 days."] } } } };
  d.$("ibs-pause").value = "1h"; d.$("ibs-pause").fire("change");
  await d.click(d.$("ibs-pause-btn"));
  assert.deepEqual(d.toasts, ["That did not work: Pick a time in the future, within 90 days."]);
  assert.ok(d.$("ibs-pause-status").classList.contains("chip-ok"));
});

test("d6: Email card: the contact-form switch writes email_enabled and shows only when the API says contact_inbox_available; the help line sits under the coming-soon line only with the switch", async () => {
  const d = boot({ channels: { ...CHANNELS_ON, contact_inbox_available: true, email_enabled: false } });
  await d.openSettings();
  const root = d.$("ibs-root");
  const sw = switchOf(d, "ibs-sw-form");
  assert.equal(sw.getAttribute("aria-checked"), "false");
  assert.equal(d.$("ibs-sw-form-l").textContent, "Contact form messages appear in your Inbox");
  await d.click(sw);
  assert.deepEqual(d.calls.filter((c) => c.method === "PUT" && c.path.endsWith("channels/")).map((c) => c.body), [{ email_enabled: true }]);
  assert.equal(switchOf(d, "ibs-sw-form").getAttribute("aria-checked"), "true");
  assert.equal(root.textContent.match(/coming soon/gi).length, 2, "chip plus the help line");
  assert.ok(root.textContent.includes("Receiving email directly: coming soon."));
  assert.ok(root.textContent.includes("Receiving email directly"));
  assert.ok(root.textContent.includes("Coming soon"));
  for (const without of [{ ...CHANNELS_ON }, { ...CHANNELS_ON, contact_inbox_available: false }]) {
    const e = boot({ channels: without });
    await e.openSettings();
    assert.equal(e.$("ibs-sw-form"), null, "no contact-form switch");
    assert.equal(e.$("ibs-root").textContent.match(/coming soon/gi).length, 1);
    assert.ok(e.$("ibs-root").textContent.includes("Receiving email directly"));
  }
});

test("a switch the API refuses leaves it as it was and says so", async () => {
  const d = boot({ channels: CH_OFF });
  await d.openSettings();
  d.s.channelsPut = { status: 429, body: { error: { code: "rate_limited", message: "Too many changes. Please wait a moment." } } };
  await d.click(switchOf(d, "ibs-sw-chat"));
  assert.equal(switchOf(d, "ibs-sw-chat").getAttribute("aria-checked"), "false");
  assert.deepEqual(d.toasts, ["That did not work: Too many changes. Please wait a moment."]);
  assert.equal(switchOf(d, "ibs-sw-chat").disabled, false);
});

test("the page and its two scripts: no inline handler, the combo is the house dropdown, focus is light blue, versions bumped", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8");
  assert.match(css, /\.ib-combo-box:focus-within \{[^}]*border-color: var\(--link\)/);
  assert.doesNotMatch(css.slice(css.indexOf("G3 PR3")).replace(/\/\*[\s\S]*?\*\//g, ""), /gold|#C9A646|#D9B93F/i);
  assert.match(HTML, /inbox\.js\?v=20261117fm1/);
  assert.match(HTML, /inbox-settings\.js\?v=20261117fm2/);
  assert.match(HTML, /inbox\.css\?v=20261117pc1/);
  assert.match(HTML, /Facebook Messenger, website chat and email/);
});

/* ---------- Facebook Messenger (z8uq9mg1qe) ---------- */

const MBASE = BASE + "messenger/";
const M_UNSET = { status: "unset", page_id: null, page_name: null, connected_at: null, pick_pending: false };
const M_ACTIVE = { status: "active", page_id: "1001", page_name: "Santé Beauty", connected_at: iso(5), pick_pending: false };
const PAGES = [{ id: "1001", name: "Santé Beauty" }, { id: "1002", name: "Santé Spa" }];
const h2s = (d) => d.$("ibs-root").all((n) => n.tagName === "H2").map((n) => n.textContent);

test("messenger card is hidden when connection/ answers 404", async () => {
  const d = boot({ channels: CH_OFF });
  await d.openSettings();
  assert.ok(d.list().includes("GET " + MBASE + "connection/"));
  assert.deepEqual(h2s(d), ["Inbox channels", "Email", "How the inbox works"]);
});

test("messenger unset: Connect Facebook Page navigates to start/ and makes no fetch to it", async () => {
  const d = boot({ channels: CH_OFF, messenger: M_UNSET });
  await d.openSettings();
  assert.deepEqual(h2s(d), ["Inbox channels", "Facebook Messenger", "Email", "How the inbox works"]);
  const b = d.press(d.$("ibs-root"), "Connect Facebook Page");
  assert.ok(b);
  await d.click(b);
  assert.equal(d.where.href, "http://api.test/v1" + MBASE + "start/");
  assert.ok(d.calls.every((c) => !c.path.includes("start/")));
});

test("messenger picker: ?messenger=pick lists the Pages in the house dropdown, then Connect posts the chosen id", async () => {
  const d = boot({ channels: CH_OFF, messenger: { ...M_UNSET, pick_pending: true }, pages: PAGES, locSearch: "?messenger=pick" });
  await d.openSettings();
  assert.ok(d.list().includes("GET " + MBASE + "pages/"));
  const sel = d.$("ibs-m-page-sel");
  assert.ok(sel.parentNode.classList.contains("ib-combo"), "house dropdown, not native");
  assert.equal(comboInput(d, "ibs-m-page-sel").getAttribute("placeholder"), "Facebook Page");
  assert.equal(comboInput(d, "ibs-m-page-sel").value, "", "nothing selected on open");
  assert.equal(d.$("ibs-m-go").disabled, true);
  comboBox(d, "ibs-m-page-sel").fire("click");
  assert.deepEqual(comboRows(d, "ibs-m-page-sel"), ["Santé Beauty", "Santé Spa"]);
  const input = comboInput(d, "ibs-m-page-sel");
  input.value = "spa"; input.fire("input");
  assert.deepEqual(comboRows(d, "ibs-m-page-sel"), ["Santé Spa"], "typing filters");
  d.all(d.$("ibs-m-page-sel").parentNode, "ib-combo-opt")[0].fire("click");
  assert.equal(d.$("ibs-m-go").disabled, false);
  await d.click(d.$("ibs-m-go"));
  const post = d.calls.find((c) => c.method === "POST" && c.path === MBASE + "connect/");
  assert.deepEqual(post.body, { page_id: "1002" });
  assert.equal(d.$("ibs-m-page").textContent, "Santé Spa");
});

test("messenger picker: pick_pending without the query still shows the picker; an expired list says so", async () => {
  const a = boot({ channels: CH_OFF, messenger: { ...M_UNSET, pick_pending: true }, pages: PAGES });
  await a.openSettings();
  assert.ok(a.$("ibs-m-page-sel"));
  const b = boot({ channels: CH_OFF, messenger: { ...M_UNSET, pick_pending: true }, pages: null });
  await b.openSettings();
  assert.equal(b.$("ibs-m-page-sel"), null);
  assert.match(b.text("ibs-m-err"), /Page list expired/);
  assert.ok(b.press(b.$("ibs-root"), "Connect Facebook Page"));
});

test("messenger connect errors: page_taken is a plain line and the picker stays", async () => {
  const d = boot({ channels: CH_OFF, messenger: M_UNSET, pages: PAGES, locSearch: "?messenger=pick" });
  d.s.connectAnswer = { status: 409, body: { error: { code: "page_taken", message: "x" } } };
  await d.openSettings();
  d.$("ibs-m-page-sel").value = "1001"; d.$("ibs-m-page-sel").fire("change");
  await d.click(d.$("ibs-m-go"));
  assert.match(d.text("ibs-m-err"), /already connected to another site/);
  assert.ok(d.$("ibs-m-page-sel"));
});

test("messenger active: Page name, Connected, Disconnect asks first, then DELETE", async () => {
  const d = boot({ channels: CH_OFF, messenger: M_ACTIVE });
  await d.openSettings();
  assert.equal(d.$("ibs-m-page").textContent, "Santé Beauty");
  assert.ok(d.$("ibs-root").all((n) => n.textContent === "Connected").length);
  await d.click(d.$("ibs-m-disconnect"));
  assert.ok(d.calls.every((c) => c.method !== "DELETE"), "asks first");
  await d.click(d.$("ibs-m-no"));
  assert.ok(d.$("ibs-m-disconnect"));
  await d.click(d.$("ibs-m-disconnect"));
  await d.click(d.$("ibs-m-yes"));
  assert.ok(d.list().includes("DELETE " + MBASE + "connection/"));
  assert.ok(d.$("ibs-m-connect"), "back to Connect Facebook Page");
});

test("messenger invalid: Reconnect goes to start/; ?messenger=error&code shows one plain line", async () => {
  const d = boot({ channels: CH_OFF, messenger: { ...M_ACTIVE, status: "invalid" } });
  await d.openSettings();
  assert.equal(d.text("ibs-m-connect"), "Reconnect");
  await d.click(d.$("ibs-m-connect"));
  assert.equal(d.where.href, "http://api.test/v1" + MBASE + "start/");
  for (const code of ["cancelled", "state_invalid", "provider_down", "no_pages", "permission_missing"]) {
    const e = boot({ channels: CH_OFF, messenger: M_UNSET, locSearch: "?messenger=error&code=" + code });
    await e.openSettings();
    assert.equal(e.text("ibs-m-err"), e.window.NOInboxSettings.util.msgErrText(code));
    assert.ok(e.$("ibs-m-connect"));
  }
});

test("messenger: no token is ever in the script", () => {
  assert.ok(!/access_token|page_token|\btoken_value/.test(read("inbox-settings.js")));
});

/* ---------- Inbox: Facebook Messenger ---------- */

const FM = "fm_dddddddddddddddddddddddd";
function msgrList() {
  return { items: [
    { ref: FM, display_name: "Ana Reyes", snippet: "Hello", updated_at: iso(5), provider: "messenger", status: "open", unread: false },
    ...list().items ], stored_next_cursor: null };
}
function msgrThread(win) {
  return thread({ ref: FM, display_name: "Ana Reyes", provider: "messenger", channel: undefined, contact_email: "", reply_window: win });
}

test("inbox: a messenger row has the Facebook Messenger badge, and the Channel filter has the option", async () => {
  const d = boot({ listing: msgrList(), channels: CHANNELS_ON });
  await d.openInbox();
  const rows = d.all(d.$("ib-list"), "ib-item");
  assert.equal(rows.length, 3);
  assert.deepEqual(d.all(rows[0], "ib-ch").map((n) => n.textContent), ["Facebook Messenger"]);
  comboBox(d, "ib-filter").fire("click");
  assert.deepEqual(comboRows(d, "ib-filter"), ["All channels", "Website chat", "Email", "Facebook Messenger"]);
  const u = d.window.NOInbox.util;
  assert.equal(u.channelOf({ ref: FM }), "messenger");
  assert.equal(u.filterItems(msgrList().items, "messenger").length, 1);
});

test("inbox: messenger thread with the window open has a live reply box", async () => {
  const d = boot({ listing: msgrList(), reading: msgrThread({ open: true, closes_at: iso(-600) }), channels: CHANNELS_ON });
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  assert.equal(d.$("ib-rb").disabled, false);
  assert.ok(!d.$("ib-threadpane").all((n) => n.textContent === "You can reply within 24 hours of the customer's last message.").length);
});

test("inbox: messenger thread with the window closed turns the box off and says why", async () => {
  const d = boot({ listing: msgrList(), reading: msgrThread({ open: false, closes_at: null }), channels: CHANNELS_ON });
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  assert.equal(d.$("ib-rb").disabled, true);
  assert.equal(d.text("ib-rn"), "You can reply within 24 hours of the customer's last message.");
});

test("inbox: window_closed and token_invalid outcomes use the reply error UI", async () => {
  for (const [code, text] of [["window_closed", "You can reply within 24 hours of the customer's last message."], ["token_invalid", "Reconnect your Facebook Page in Settings > Inbox."]]) {
    const d = boot({ listing: msgrList(), reading: msgrThread({ open: true, closes_at: iso(-60) }), reply: { state: "failed", error_code: code, created_at: iso(0) }, channels: CHANNELS_ON });
    await d.openInbox();
    await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
    const ta = d.$("ib-rb"); ta.value = "Hi"; ta.fire("input");
    await d.click(d.press(d.$("ib-threadpane"), "Send"));
    const alert = d.$("ib-threadpane").all((n) => n.getAttribute && n.getAttribute("role") === "alert")[0];
    assert.ok(alert && alert.textContent.includes(text), code);
  }
});

test("inbox eyebrow names Messenger", () => {
  assert.ok(HTML.includes('<p class="dash-eyebrow">Facebook Messenger, website chat and email</p>'));
});

test("messenger return params are removed from the address once read, keeping the path and site", async () => {
  const d = boot({ channels: CH_OFF, messenger: M_UNSET, locSearch: "?site=" + A + "&messenger=error&code=cancelled" });
  await d.openSettings();
  assert.deepEqual(d.replaced, ["/inbox/?site=" + A]);
  assert.match(d.text("ibs-m-err"), /cancelled/);
  const p = boot({ channels: CH_OFF, messenger: { ...M_UNSET, pick_pending: true }, pages: PAGES, locSearch: "?messenger=pick" });
  await p.openSettings();
  assert.deepEqual(p.replaced, ["/inbox/"]);
  assert.ok(p.$("ibs-m-page-sel"));
  const n = boot({ channels: CH_OFF, messenger: M_UNSET });
  await n.openSettings();
  assert.deepEqual(n.replaced, []);
});

/* ---------- auto-refresh by polling (z8uq9mg799) ---------- */

/* A fake clock: timers fire only when advance() moves it, and the stand-in API answers between steps. */
function makeClock() {
  let now = 0, seq = 0, timers = [];
  const c = {
    setTimeout(fn, ms) { const id = ++seq; timers.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout(id) { timers = timers.filter((t) => t.id !== id); },
    pending: () => timers.length,
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = timers.filter((t) => t.at <= end).sort((x, y) => x.at - y.at || x.id - y.id)[0];
        if (!next) break;
        timers = timers.filter((t) => t !== next); now = next.at; next.fn(); await settle();
      }
      now = end; await settle();
    }
  };
  return c;
}
const THREAD_PATH = BASE + "conversations/" + REF + "/", LIST_PATH = BASE + "conversations/";
const gets = (d, p) => d.calls.filter((c) => c.method === "GET" && c.path === p).length;
/* Give every stand-in node the scroll numbers a browser has (a 300 px box over 1000 px of messages). */
function scrollable(d) {
  const make = d.doc.createElement;
  d.doc.createElement = (tag) => { const n = make(tag); n.scrollHeight = 1000; n.clientHeight = 300; n.scrollTop = 0; return n; };
}
async function polling(opts = {}) {
  const clock = makeClock(), d = boot({ clock, ...opts });
  scrollable(d);
  await d.openInbox();
  return { d, clock };
}
async function openFirst(d) { await d.click(d.all(d.$("ib-list"), "ib-item")[0]); }
const more = (extra) => thread({ messages: [...thread().messages, { id: "m9", direction: "in", sender_kind: "customer", text: "Meron pa po?", attachments: [], at: iso(0), delivery_state: "", ...extra }] });

test("poll: the open conversation is read every 5 s and the list every 15 s", async () => {
  const { d, clock } = await polling();
  await openFirst(d);
  const t0 = gets(d, THREAD_PATH), l0 = gets(d, LIST_PATH);
  await clock.advance(4999);
  assert.equal(gets(d, THREAD_PATH), t0, "not before 5 s");
  await clock.advance(1);
  assert.equal(gets(d, THREAD_PATH), t0 + 1);
  assert.equal(gets(d, LIST_PATH), l0);
  await clock.advance(10000);
  assert.equal(gets(d, THREAD_PATH), t0 + 3, "5, 10, 15 s");
  assert.equal(gets(d, LIST_PATH), l0 + 1, "the list at 15 s");
  await clock.advance(15000);
  assert.equal(gets(d, LIST_PATH), l0 + 2);
  assert.ok(d.text("ib-upd").startsWith("Updated today, "));
  assert.deepEqual(d.toasts, []);
});

test("poll: no conversation open means only the list is read", async () => {
  const { d, clock } = await polling();
  const t = d.calls.length;
  await clock.advance(15000);
  assert.deepEqual(d.calls.slice(t).map((c) => c.method + " " + c.path), ["GET " + LIST_PATH]);
});

test("poll: a hidden tab reads nothing; coming back (visibilitychange or focus) reads at once, then the timers run again", async () => {
  const { d, clock } = await polling();
  await openFirst(d);
  d.doc.hidden = true; d.doc.fire("visibilitychange");
  const n = d.calls.length;
  await clock.advance(120000);
  assert.equal(d.calls.length, n, "nothing while hidden");
  assert.equal(clock.pending(), 0, "no timer left running while hidden");
  d.doc.hidden = false; d.doc.fire("visibilitychange"); await settle();
  assert.deepEqual(d.calls.slice(n).map((c) => c.method + " " + c.path).sort(), ["GET " + LIST_PATH, "GET " + THREAD_PATH].sort(), "one read of each at once");
  const t = gets(d, THREAD_PATH);
  await clock.advance(5000);
  assert.equal(gets(d, THREAD_PATH), t + 1, "the 5 s timer runs again");
  /* window focus does the same */
  d.doc.hidden = true; d.doc.fire("visibilitychange"); await clock.advance(30000);
  d.doc.hidden = false; const m = d.calls.length;
  d.winListeners.focus.forEach((f) => f()); await settle();
  assert.ok(d.calls.length > m, "focus reads at once");
  assert.deepEqual(d.toasts, []);
});

test("poll: a new message shows without Refresh, and the typed draft, the box and the focus stay", async () => {
  const { d, clock } = await polling();
  await openFirst(d);
  const ta = d.$("ib-rb"); ta.value = "Opo, meron po"; ta.fire("input"); ta.focus();
  d.s.reading = more();
  const before = d.all(d.$("ib-threadpane"), "ib-msg").length;
  await clock.advance(5000);
  assert.equal(d.all(d.$("ib-threadpane"), "ib-msg").length, before + 1, "the new bubble is there");
  assert.ok(d.$("ib-threadpane").textContent.includes("Meron pa po?"));
  const now = d.$("ib-rb");
  assert.equal(now.value, "Opo, meron po", "the draft is kept");
  assert.equal(d.doc.activeElement, now, "the focus stays in the reply box");
  assert.equal(d.all(d.$("ib-threadpane"), "ib-count")[0].textContent, "13 / 2000");
  assert.equal(d.all(d.$("ib-threadpane"), "ib-loading").length, 0, "no loading state");
  assert.deepEqual(d.toasts, []);
  /* nothing changed: nothing is drawn again */
  const pane = d.all(d.$("ib-threadpane"), "ib-msgs")[0];
  await clock.advance(5000);
  assert.equal(d.all(d.$("ib-threadpane"), "ib-msgs")[0], pane);
});

test("poll: a thread scrolled up stays where it was; a thread at the bottom follows the new message", async () => {
  const { d, clock } = await polling();
  await openFirst(d);
  let msgs = d.all(d.$("ib-threadpane"), "ib-msgs")[0];
  msgs.scrollTop = 120; /* 1000 - 120 - 300 is far from the bottom */
  d.s.reading = more();
  await clock.advance(5000);
  msgs = d.all(d.$("ib-threadpane"), "ib-msgs")[0];
  assert.equal(msgs.scrollTop, 120, "the user's place is kept");
  msgs.scrollTop = 700; /* the bottom */
  d.s.reading = more({ id: "m10", text: "Hello?" });
  await clock.advance(5000);
  msgs = d.all(d.$("ib-threadpane"), "ib-msgs")[0];
  assert.equal(msgs.scrollTop, 1000, "at the bottom, it stays at the bottom");
});

test("poll: the selected conversation, the Show more pages and the open thread survive a list read", async () => {
  const { d, clock } = await polling({ listing: list({ stored_next_cursor: "30" }) });
  d.s.listing = { items: [{ ref: "wc_dddddddddddddddddddddddd", display_name: "Liza R.", snippet: "Thanks", updated_at: iso(90), channel: "webchat", source: "stored", status: "open", unread: false }], stored_next_cursor: null };
  await d.click(d.press(d.$("ib-listbody"), "Show more conversations"));
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 3);
  await openFirst(d);
  d.s.listing = list({ stored_next_cursor: "30" });
  d.s.listing.items.unshift({ ref: EM, display_name: "Pat Reyes", snippet: "Order?", updated_at: iso(1), channel: "email", source: "stored", status: "open", unread: false });
  const n = d.calls.length;
  await clock.advance(15000);
  assert.ok(d.calls.slice(n).some((c) => c.path === LIST_PATH), "the list was read again");
  assert.ok(!d.calls.slice(n).some((c) => c.path.includes("stored_cursor")), "the first page only");
  const rows = d.all(d.$("ib-list"), "ib-item");
  assert.equal(rows.length, 4, "the new one, the first page and the loaded page");
  assert.equal(d.all(rows[0], "ib-name")[0].textContent, "Pat Reyes");
  assert.equal(d.press(d.$("ib-listbody"), "Show more conversations"), undefined, "the loaded pages ended the cursor, and it stays ended");
  assert.equal(d.all(d.$("ib-list"), "is-sel").length, 1, "the selection stays");
  assert.equal(d.all(d.$("ib-threadpane"), "ib-msg").length, 3, "the open thread is still there");
  assert.equal(d.all(d.$("ib-listbody"), "ib-loading").length, 0);
  assert.deepEqual(d.toasts, []);
});

test("poll: an error is silent and backs off 5, 10, 20, 40, 60, 60 s, and one success resets it", async () => {
  const { d, clock } = await polling();
  await openFirst(d);
  d.s.threadAnswer = { status: 502, body: { error: { code: "server_error", message: "Please try again later." } } };
  const base = gets(d, THREAD_PATH);
  let at = 0;
  for (const [i, wait] of [5, 10, 20, 40, 60, 60].entries()) {
    await clock.advance(wait * 1000 - 1 - (i === 0 ? 0 : 0));
    at += wait * 1000;
    assert.equal(gets(d, THREAD_PATH), base + i, "not before " + wait + " s (read " + i + ")");
    await clock.advance(1);
    assert.equal(gets(d, THREAD_PATH), base + i + 1, "read " + (i + 1) + " at " + at / 1000 + " s");
  }
  assert.deepEqual(d.toasts, [], "no toast");
  assert.equal(d.all(d.$("ib-threadpane"), "ib-err").length, 0, "no error banner");
  assert.equal(d.all(d.$("ib-threadpane"), "ib-msg").length, 3, "the thread is still shown");
  d.s.threadAnswer = null;
  await clock.advance(60000);
  const after = gets(d, THREAD_PATH);
  assert.equal(after, base + 7, "one success");
  await clock.advance(5000);
  assert.equal(gets(d, THREAD_PATH), after + 1, "back to every 5 s");
});

test("poll: a list error is silent, keeps the list, and backs off 15, 30, 60 s", async () => {
  const { d, clock } = await polling();
  d.s.listAnswer = { status: 502, body: { error: { code: "server_error", message: "Please try again later." } } };
  const base = gets(d, LIST_PATH);
  await clock.advance(15000); assert.equal(gets(d, LIST_PATH), base + 1);
  await clock.advance(29999); assert.equal(gets(d, LIST_PATH), base + 1);
  await clock.advance(1); assert.equal(gets(d, LIST_PATH), base + 2);
  await clock.advance(59999); assert.equal(gets(d, LIST_PATH), base + 2);
  await clock.advance(1); assert.equal(gets(d, LIST_PATH), base + 3);
  await clock.advance(60000); assert.equal(gets(d, LIST_PATH), base + 4, "60 s at most");
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 2);
  assert.ok(!d.$("ib-listbody").textContent.includes("couldn't load"));
  assert.deepEqual(d.toasts, []);
  /* the manual Refresh still shows the error */
  await d.click(d.$("ib-refresh-btn"));
  assert.ok(d.$("ib-listbody").textContent.includes("We couldn't load your conversations"));
});

test("poll: a read still running blocks the next one of its kind, however often the tab comes back", async () => {
  const { d, clock } = await polling();
  await openFirst(d);
  let release; d.s.hold = { re: /conversations\/wc_a+\/$/, promise: new Promise((r) => { release = r; }) };
  const t = gets(d, THREAD_PATH);
  await clock.advance(5000);
  assert.equal(gets(d, THREAD_PATH), t + 1);
  await clock.advance(60000);
  d.doc.fire("visibilitychange"); d.winListeners.focus.forEach((f) => f()); await settle();
  assert.equal(gets(d, THREAD_PATH), t + 1, "still one, nothing overlaps");
  release(); await settle();
  await clock.advance(5000);
  assert.equal(gets(d, THREAD_PATH), t + 2, "the next one starts after the first ended");
});

test("poll: an answer for a conversation the user has left is ignored", async () => {
  const { d, clock } = await polling();
  await openFirst(d);
  d.s.reading = thread({ messages: [{ id: "x1", direction: "in", sender_kind: "customer", text: "STALE reply", attachments: [], at: iso(0), delivery_state: "" }] });
  let release; d.s.hold = { re: /conversations\/wc_a+\/$/, promise: new Promise((r) => { release = r; }) };
  await clock.advance(5000); /* the read of Maria's thread is held */
  d.s.reading = thread({ ref: REF2, display_name: "Jun Dela Cruz", messages: [{ id: "j1", direction: "in", sender_kind: "customer", text: "Magkano po?", attachments: [], at: iso(1), delivery_state: "" }] });
  await d.click(d.all(d.$("ib-list"), "ib-item")[1]);
  assert.ok(d.$("ib-threadpane").textContent.includes("Magkano po?"));
  release(); await settle();
  assert.ok(!d.$("ib-threadpane").textContent.includes("STALE reply"), "the late answer is dropped");
  assert.ok(d.$("ib-threadpane").textContent.includes("Magkano po?"));
});

test("poll: leaving the Inbox view stops it, and a read in flight is dropped", async () => {
  const { d, clock } = await polling();
  await openFirst(d);
  let release; d.s.hold = { re: /conversations\/wc_a+\/$/, promise: new Promise((r) => { release = r; }) };
  await clock.advance(5000);
  d.window.NOInbox.hide();
  assert.equal(clock.pending(), 0, "every timer is cleared");
  release(); await settle();
  const n = d.calls.length;
  await clock.advance(300000);
  assert.equal(d.calls.length, n, "no request after leaving");
  d.doc.fire("visibilitychange"); d.winListeners.focus.forEach((f) => f()); await settle();
  assert.equal(d.calls.length, n, "coming back to the tab does nothing while the view is closed");
  await d.openInbox();
  assert.ok(clock.pending() > 0, "opening the view again starts the timers");
});
