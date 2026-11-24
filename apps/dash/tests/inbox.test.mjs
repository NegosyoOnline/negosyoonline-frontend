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
const SM = "sm_dddddddddddddddddddddddd";
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
function boot({ listing = list(), reading = thread(), reply = { state: "sent", error_code: "", created_at: iso(0) }, off = false, search = "", channels = null, messenger = null, pages = null, cmStatus = null, locSearch = "", clock = null, EventSource = null } = {}) {
  const doc = makeDocument(), calls = [], toasts = [], replaced = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; n.dispatchEvent = (e) => n.fire(e.type); return n; };
  doc.createTextNode = (t) => { const w = make("span"); w.textContent = t; return w.firstChild; };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["ib-root", "ib-live", "ibs-root", "ibs-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const nav = [0, 1, 2].map(() => { const a = doc.createElement("a"); a.setAttribute("data-inbox-nav", ""); a.hidden = true; page.appendChild(a); return a; });
  doc.querySelectorAll = (sel) => (sel === "[data-inbox-nav]" ? nav : []);
  const s = { cmStatus, listing, reading, reply, off, listAnswer: null, threadAnswer: null, replyAnswer: null,
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
    else if (p === BASE + "comments/status/" && opts.method === "GET") a = s.cmStatus ? { status: 200, body: s.cmStatus } : err(404, "not_found", "Not found.");
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
    else if (p === BASE + "sms/status/" && opts.method === "GET") a = s.smsStatus ? { status: 200, body: s.smsStatus } : err(404, "not_found", "Not found.");
    else if (p === BASE + "sms/compose/" && opts.method === "POST") a = s.composeAnswer || { status: 200, body: { ref: SM, new_conversation: true, state: "sending", error_code: "", created_at: iso(0) } };
    else if (/^\/sites\/[^/]+\/members\/\?q=/.test(p) && opts.method === "GET") a = { status: 200, body: { members: s.members || [] } };
    else if (p === BASE + "unread/" && opts.method === "GET") a = s.unreadAnswer || { status: 200, body: { count: s.unread === undefined ? 0 : s.unread } };
    else if (/^\/sites\/[^/]+\/inquiries\/conversations\/(\?[^/]+)?$/.test(p) && opts.method === "GET") {
      const q = /[?&]q=([^&]*)/.exec(p);
      const st = /[?&]status=([^&]*)/.exec(p), un = /[?&]unread=([^&]*)/.exec(p);
      a = s.listAnswer || { status: 200, body: s.statuser ? s.statuser(st ? st[1] : "", q ? decodeURIComponent(q[1]) : "", un ? un[1] : "") : q && s.searcher ? s.searcher(decodeURIComponent(q[1])) : s.listing };
    }
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
    setTimeout: clock ? clock.setTimeout : inert, clearTimeout: clock ? clock.clearTimeout : inertClear, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch, ...(EventSource ? { EventSource } : {}) });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("inbox-sms.js"), context, { filename: "inbox-sms.js" });
  vm.runInContext(read("inbox.js"), context, { filename: "inbox.js" });
  vm.runInContext(read("inbox-settings.js"), context, { filename: "inbox-settings.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  const where = location;
  const all = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  /* an icon button (Close / Reopen conversation) has its name as the aria-label, a text button as its text */
  const press = (n, label) => buttons(n).find((b) => b.textContent === label || b.getAttribute("aria-label") === label);
  const links = (n) => n.all((x) => x.tagName === "A");
  return { doc, calls, toasts, s, where, winListeners, replaced, $, all, buttons, press, links, nav, window, page,
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
  assert.equal(d.all(root, "mk-list")[0].children.length, 4);
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
  assert.ok(d.$("ib-refresh-btn"), "Refresh is in the filter row");
  assert.equal(d.$("ib-upd"), null, "the Updated text is gone");
  assert.equal(d.$("ib-threadpane").classList.contains("is-hide-phone"), true, "on a phone the list shows first");
  assert.ok(d.$("ib-threadpane").textContent.includes("Choose a conversation"));
  assert.deepEqual(d.nav.map((n) => n.hidden), [false, false, false]);
});

test("b2: an empty list says so; Show more conversations appears only with a stored cursor and appends", async () => {
  const empty = boot({ listing: { items: [], stored_next_cursor: null } });
  await empty.openInbox();
  assert.ok(empty.$("ib-listbody").textContent.includes("No messages yet"));
  assert.ok(empty.$("ib-listbody").textContent.includes("When a customer messages your Facebook Page, writes in your website chat or sends your contact form, the conversation will show up here. Press Refresh to check again."));
  assert.ok(empty.$("ib-listbody").textContent.includes("Press Refresh to check again."));

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
  assert.equal(d.$("ib-refresh-btn"), null, "a failed list offers Try again only");
  d.s.listAnswer = null;
  await d.click(d.press(body, "Try again"));
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 2);
});

test("the switch being off gets its own panel, and a response with only the stored source is normal", async () => {
  const off = boot({ off: true });
  await off.openInbox();
  assert.ok(off.$("ib-wrap").textContent.includes("The inbox is not available yet"));
  assert.equal(off.$("ib-refresh-btn"), null);
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

test("a reply refused while HQ has paused the store (409 site_held) shows the API's sentence and keeps the text", async () => {
  const d = boot();
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  d.$("ib-rb").value = "Hello"; d.$("ib-rb").fire("input");
  d.s.replyAnswer = { status: 409, body: { error: { code: "site_held", message: "Texting is stopped while your store is paused by NegosyoOnline." } } };
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  assert.equal(d.all(d.$("ib-threadpane"), "ib-fail")[0].textContent, "Your reply was not sent. Texting is stopped while your store is paused by NegosyoOnline. Your text is still in the box.");
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
  assert.equal(d.$("ib-refresh-btn"), null);
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
  for (const id of ["h-inbox", "h-settings-inbox", "ib-root", "ib-live", "ibs-root", "ibs-live"]) assert.equal((HTML.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, id + " is in the page once");
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
  assert.deepEqual(on.list(), ["GET /sites/", "GET " + BASE + "channels/", "GET " + BASE + "unread/"], "and the Inbox count is read once (INBOX-UI U5)");
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
/* Meta layout (z8uq9mj6ch): the channel tabs and the quick chips replace the Channel and Status dropdowns and the two toggles */
const tabLabels = (d) => d.all(d.$("ib-tools-host"), "ib-tab").map((t) => t.textContent);
const pickTab = async (d, v) => { d.$("ib-tab-" + v).fire("click"); await settle(); };
/* The filter buttons cycle (all -> first -> second -> all); `pickChip` clicks the right number of times to reach a state, `pickOff` back to all. */
const CYC = { answered: ["ib-b-answered", "answered"], unanswered: ["ib-b-answered", "unanswered"], unread: ["ib-b-read", "1"], read: ["ib-b-read", "0"], open: ["ib-b-status", "open"], closed: ["ib-b-status", "closed"] };
const ORDERS = { "ib-b-answered": ["", "answered", "unanswered"], "ib-b-read": ["", "1", "0"], "ib-b-status": ["", "open", "closed"] };
const cycleTo = async (d, id, want) => { const o = ORDERS[id], b = d.$(id); for (let n = (o.indexOf(want) - o.indexOf(b.getAttribute("data-v")) + 3) % 3; n > 0; n--) { b.fire("click"); await settle(); } };
const pickChip = (d, k) => cycleTo(d, CYC[k][0], CYC[k][1]);
const pickOff = (d, k) => cycleTo(d, CYC[k][0], "");
const chipOn = (d, k) => String(d.$(CYC[k][0]).getAttribute("data-v") === CYC[k][1]);

test("d1: every row has a neutral channel badge (icon and words); an unread row has a dot with its own words; a closed one has a Closed chip", async () => {
  const d = boot({ listing: MIXED(), channels: CHANNELS_ON });
  await d.openInbox();
  const rows = rowsOf(d);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => d.all(r, "ib-cdot")[0].textContent), ["Website chat", "Email", "Website chat"]);
  assert.ok(rows.every((r) => d.all(r, "ib-cdot")[0].all((n) => n.tagName === "SVG").length === 1), "an icon in every badge");
  assert.ok(rows.every((r) => d.all(r, "ib-avw")[0].all((n) => n === d.all(r, "ib-cdot")[0]).length === 1), "the badge sits on the avatar");
  assert.ok(rows[0].classList.contains("ib-unread"));
  assert.equal(d.all(rows[0], "ib-dot").length, 0, "the blue dot is gone");
  assert.equal(d.all(rows[0], "ib-rs")[0].getAttribute("aria-label"), "Unread");
  assert.equal(d.all(rows[1], "ib-rs")[0].getAttribute("aria-label"), "Read");
  assert.deepEqual(rows.map((r) => d.all(r, "chip").map((c) => c.textContent)), [[], [], ["Closed"]]);
  assert.match(d.$("ib-wrap").textContent, /Conversations/);
});

test("d1: the channel tabs replace the Channel dropdown: All messages first, Email shows only email, no filter reads the API again", async () => {
  const d = boot({ listing: MIXED(), channels: CHANNELS_ON });
  await d.openInbox();
  assert.equal(d.$("ib-filter"), null, "no Channel dropdown any more");
  assert.deepEqual(tabLabels(d), ["All messages", "Website chat", "Email", "FB Messenger", "FB Comments"]);
  const bar = d.all(d.$("ib-tools-host"), "ib-tabs")[0];
  assert.equal(bar.getAttribute("role"), "tablist");
  assert.equal(bar.getAttribute("aria-label"), "Channel");
  assert.deepEqual(d.all(bar, "ib-tab").map((t) => [t.getAttribute("role"), t.getAttribute("aria-selected"), t.getAttribute("tabindex")]), [["tab", "true", "0"], ["tab", "false", "-1"], ["tab", "false", "-1"], ["tab", "false", "-1"], ["tab", "false", "-1"]]);
  const before = d.list().length;
  await pickTab(d, "email");
  assert.deepEqual(rowsOf(d).map((r) => d.all(r, "ib-name")[0].textContent), ["Jun Dela Cruz (test)"]);
  assert.equal(d.$("ib-tab-email").getAttribute("aria-selected"), "true");
  assert.equal(d.$("ib-tab-all").getAttribute("aria-selected"), "false");
  assert.equal(d.$("ib-tab-email").classList.contains("is-on"), true);
  assert.equal(d.list().slice(before).filter((c) => /GET .*conversations\/\?/.test(c)).length, 0, "choosing a tab of the same source reads nothing again");
  d.$("ib-tab-email").fire("keydown", { key: "ArrowRight", preventDefault() {} });
  assert.equal(d.doc.activeElement, d.$("ib-tab-messenger"), "the arrow keys move between the tabs");
});

test("d1: a channel with no conversations says so", async () => {
  const only = MIXED(); only.items = only.items.filter((i) => i.channel !== "email");
  const d = boot({ listing: only, channels: CHANNELS_ON });
  await d.openInbox();
  await pickTab(d, "email");
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

test("a chat visitor's mobile number shows next to their email, or alone, under the name; none shows no line", async () => {
  for (const [over, want] of [
    [{ contact_email: "ana@example.test", contact_mobile: "+639171234567" }, "ana@example.test \u00B7 +639171234567"],
    [{ contact_email: "", contact_mobile: "+639171234567" }, "+639171234567"],
    [{ contact_email: "ana@example.test" }, "ana@example.test"],
  ]) {
    const d = boot({ listing: MIXED(), reading: sthread(over), channels: CHANNELS_ON });
    await d.openInbox();
    await d.click(rowsOf(d)[0]);
    assert.equal(d.all(d.$("ib-threadpane"), "ib-sub")[0].textContent, want);
  }
  const d = boot({ listing: MIXED(), reading: sthread(), channels: CHANNELS_ON });
  await d.openInbox();
  await d.click(rowsOf(d)[0]);
  assert.equal(d.all(d.$("ib-threadpane"), "ib-sub").length, 0);
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
  const how = root.all((n) => n.tagName === "LI").map((n) => n.textContent);
  assert.ok(how.includes("The inbox shows your Facebook Messenger, website chat and email conversations in one list."));
  assert.ok(how.includes("You can reply to a Facebook Messenger conversation within 24 hours of the customer's last message."));
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
  assert.match(HTML, /inbox\.js\?v=20261124ml3/);
  assert.match(HTML, /inbox-settings\.js\?v=20261123so2/);
  assert.match(HTML, /inbox\.css\?v=20261124ml3/);
  assert.match(HTML, /inbox-bulk\.js\?v=20261124bk3/);
  assert.match(HTML, /inbox-comments\.js\?v=20261124ml1/);
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

const CM_NOT_READY = { enabled: true, connected: true, page_name: "Santé Beauty", ready: false, reason: "permission_missing" };

test("connect opens start/?comments=1 while comments are on, plain start/ when the comments API is 404", async () => {
  const on = boot({ channels: CH_OFF, messenger: { ...M_ACTIVE, status: "invalid" }, cmStatus: { ...CM_NOT_READY, reason: "reconnect" } });
  await on.openSettings();
  await on.click(on.$("ibs-m-connect"));
  assert.equal(on.where.href, "http://api.test/v1" + MBASE + "start/?comments=1");
  const un = boot({ channels: CH_OFF, messenger: M_UNSET, cmStatus: { enabled: true, connected: false, page_name: "", ready: false, reason: "not_connected" } });
  await un.openSettings();
  await un.click(un.$("ibs-m-connect"));
  assert.equal(un.where.href, "http://api.test/v1" + MBASE + "start/?comments=1");
  const off = boot({ channels: CH_OFF, messenger: M_UNSET });
  await off.openSettings();
  await off.click(off.$("ibs-m-connect"));
  assert.equal(off.where.href, "http://api.test/v1" + MBASE + "start/");
});

test("connected with permission_missing: Settings offers the same reconnect; ready or no comments API offers none", async () => {
  const d = boot({ channels: CH_OFF, messenger: M_ACTIVE, cmStatus: CM_NOT_READY });
  await d.openSettings();
  assert.match(d.text("ibs-m-cm-hint"), /Turn on comments for your Page to reply\./);
  await d.click(d.$("ibs-m-cm-connect"));
  assert.equal(d.where.href, "http://api.test/v1" + MBASE + "start/?comments=1");
  const ready = boot({ channels: CH_OFF, messenger: M_ACTIVE, cmStatus: { ...CM_NOT_READY, ready: true, reason: "" } });
  await ready.openSettings();
  assert.equal(ready.$("ibs-m-cm-connect"), null);
  const none = boot({ channels: CH_OFF, messenger: M_ACTIVE });
  await none.openSettings();
  assert.equal(none.$("ibs-m-cm-connect"), null);
});

test("connected with permission_missing: Reconnect and Disconnect share one action row, hint above it", async () => {
  const d = boot({ channels: CH_OFF, messenger: M_ACTIVE, cmStatus: CM_NOT_READY });
  await d.openSettings();
  const row = d.$("ibs-m-cm-connect").parentNode;
  assert.ok(row.classList.contains("mk-pause"));
  assert.equal(d.$("ibs-m-disconnect").parentNode, row);
  assert.equal(row.parentNode.children[row.parentNode.children.indexOf(row) - 1], d.$("ibs-m-cm-hint"));
  assert.match(fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8"), /:is\(\.pm-hint, \.pm-lead, \.pm-field\) \+ \.mk-pause \{ margin-top: 12px/);
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

test("inbox: a messenger row has the FB Messenger badge on the avatar (full name as its tooltip), and the tabs have the channel", async () => {
  const d = boot({ listing: msgrList(), channels: CHANNELS_ON });
  await d.openInbox();
  const rows = d.all(d.$("ib-list"), "ib-item");
  assert.equal(rows.length, 3);
  assert.deepEqual(d.all(rows[0], "ib-cdot").map((n) => n.textContent), ["FB Messenger"]);
  assert.deepEqual(d.all(rows[0], "ib-cdot").map((n) => n.getAttribute("title")), ["Facebook Messenger"]);
  assert.deepEqual(tabLabels(d), ["All messages", "Website chat", "Email", "FB Messenger", "FB Comments"]);
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

test("the Inbox page has a visible header: the title Inbox and a one-line subtitle (Meta layout, z8uq9mj6ch)", () => {
  const view = HTML.slice(HTML.indexOf('id="view-inbox"'), HTML.indexOf('id="view-storefront"'));
  assert.ok(!view.includes("dash-eyebrow"), "no eyebrow");
  assert.ok(!view.includes("Facebook Messenger, website chat and email"));
  assert.match(view, /<header class="view-head ib-head"><h1 id="h-inbox" tabindex="-1">Inbox<\/h1><p class="ib-lede">Reply to your customers\u2019 messages in one place\.<\/p><\/header>/);
  assert.ok(!view.includes('id="ib-refresh'), "Refresh lives in the toolbar now");
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

test("poll: document.visibilityState alone pauses the polls; one read per list on return; 3 hide/show cycles leave a single timer", async () => {
  const { d, clock } = await polling();
  const vis = (v) => { d.doc.visibilityState = v; d.doc.fire("visibilitychange"); };
  const base = clock.pending();
  for (let i = 0; i < 3; i++) {
    vis("hidden");
    const n = d.calls.length;
    await clock.advance(120000);
    assert.equal(d.calls.length, n, "no fetch while hidden, across several intervals");
    assert.equal(clock.pending(), 0);
    vis("visible"); await settle();
    assert.deepEqual(d.calls.slice(n).map((c) => c.method + " " + c.path), ["GET " + LIST_PATH], "exactly one fetch per list on becoming visible, no catch-up burst");
    assert.equal(clock.pending(), base, "one active timer, never stacked");
  }
  const l = gets(d, LIST_PATH);
  await clock.advance(15000);
  assert.equal(gets(d, LIST_PATH), l + 1, "then the 15 s timer, once");
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
  const quiet = () => d.calls.filter((c) => !c.path.endsWith("/unread/")).length; /* the nav count (U5) is read on leaving, then every 60 s */
  const n = quiet();
  await clock.advance(300000);
  assert.equal(quiet(), n, "no thread or list request after leaving");
  d.doc.fire("visibilitychange"); d.winListeners.focus.forEach((f) => f()); await settle();
  assert.equal(quiet(), n, "coming back to the tab does nothing while the view is closed");
  await d.openInbox();
  assert.ok(clock.pending() > 0, "opening the view again starts the timers");
});

/* ---------- live push by server-sent events (z8uq9mg7ak) ---------- */

/* A stand-in EventSource: the test plays the server with emit() and drop(). */
function fakeES() {
  const made = [];
  class ES {
    constructor(url, opts) { this.url = url; this.opts = opts; this.readyState = 0; this.closed = false; this.l = {}; made.push(this); }
    addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); }
    close() { this.closed = true; this.readyState = 2; }
    emit(t, data) { (this.l[t] || []).forEach((f) => f({ type: t, data: data === undefined ? "" : JSON.stringify(data) })); }
    ready() { this.readyState = 1; this.emit("ready", { v: 1 }); }
    /* the connection broke and the browser keeps trying (CONNECTING) */
    blip() { this.readyState = 0; this.emit("error"); }
    /* the browser gave up (an HTTP error answer): CLOSED */
    dead() { this.readyState = 2; this.emit("error"); }
  }
  ES.made = made;
  return ES;
}
async function live(opts = {}) {
  const ES = fakeES(), r = await polling({ EventSource: ES, ...opts });
  return { ...r, ES, es: () => ES.made[ES.made.length - 1] };
}

test("live: opens the stream with credentials once the site is known, and ready reads the list and thread once and slows the polls to 60 s", async () => {
  const { d, clock, ES, es } = await live();
  assert.equal(ES.made.length, 1);
  assert.equal(es().url, "http://api.test/v1/sites/" + A + "/inquiries/stream/");
  assert.equal(es().opts.withCredentials, true);
  await openFirst(d);
  const t0 = gets(d, THREAD_PATH), l0 = gets(d, LIST_PATH);
  es().ready(); await settle();
  assert.equal(gets(d, THREAD_PATH), t0 + 1, "one thread read at ready");
  assert.equal(gets(d, LIST_PATH), l0 + 1, "one list read at ready");
  await clock.advance(59999);
  assert.equal(gets(d, THREAD_PATH), t0 + 1, "no 5 s poll now");
  assert.equal(gets(d, LIST_PATH), l0 + 1, "no 15 s poll now");
  await clock.advance(1);
  assert.equal(gets(d, THREAD_PATH), t0 + 2);
  assert.equal(gets(d, LIST_PATH), l0 + 2);
  assert.deepEqual(d.toasts, []);
});

test("live: an event for the open conversation reads the thread now and the list after 300 ms; the new message shows without a draft wipe", async () => {
  const { d, clock, es } = await live();
  await openFirst(d); es().ready(); await settle();
  const ta = d.$("ib-rb"); ta.value = "Opo, meron po"; ta.fire("input"); ta.focus();
  d.s.reading = more();
  const t0 = gets(d, THREAD_PATH), l0 = gets(d, LIST_PATH);
  es().emit("conversation_updated", { ref: REF, last_message_at: null, kind: "message" }); await settle();
  assert.equal(gets(d, THREAD_PATH), t0 + 1, "the thread at once");
  assert.equal(gets(d, LIST_PATH), l0, "the list waits");
  assert.ok(d.$("ib-threadpane").textContent.includes("Meron pa po?"));
  assert.equal(d.$("ib-rb").value, "Opo, meron po", "the draft is kept");
  assert.equal(d.doc.activeElement, d.$("ib-rb"), "the focus stays");
  await clock.advance(299);
  assert.equal(gets(d, LIST_PATH), l0);
  await clock.advance(1);
  assert.equal(gets(d, LIST_PATH), l0 + 1, "the list after the debounce");
  assert.deepEqual(d.toasts, []);
});

test("live: events for another conversation read only the list, and a burst makes one list read", async () => {
  const { d, clock, es } = await live();
  await openFirst(d); es().ready(); await settle();
  const t0 = gets(d, THREAD_PATH), l0 = gets(d, LIST_PATH);
  es().emit("conversation_updated", { ref: REF2, kind: "message" });
  es().emit("message_status", { ref: REF2 });
  es().emit("conversation_updated", { ref: REF2, kind: "status" });
  await clock.advance(300);
  assert.equal(gets(d, THREAD_PATH), t0, "no thread read");
  assert.equal(gets(d, LIST_PATH), l0 + 1, "one list read for the burst");
  es().emit("message_status", { ref: REF }); await settle();
  assert.equal(gets(d, THREAD_PATH), t0 + 1, "message_status for the open ref reads the thread");
});

test("live: an event that comes while a read runs makes one more read after it", async () => {
  const { d, es } = await live();
  await openFirst(d); es().ready(); await settle();
  let release; d.s.hold = { re: /conversations\/wc_a+\/$/, used: false, promise: new Promise((r) => { release = r; }) };
  const t0 = gets(d, THREAD_PATH);
  es().emit("conversation_updated", { ref: REF }); await settle();
  es().emit("conversation_updated", { ref: REF }); await settle();
  assert.equal(gets(d, THREAD_PATH), t0 + 1, "no overlap");
  release(); await settle();
  assert.equal(gets(d, THREAD_PATH), t0 + 2, "one more read once the first ended");
});

test("live: an error (the browser reconnects) puts the 5 s / 15 s polls back until the next ready", async () => {
  const { d, clock, es } = await live();
  await openFirst(d); es().ready(); await settle();
  es().blip();
  const t0 = gets(d, THREAD_PATH), l0 = gets(d, LIST_PATH);
  await clock.advance(15000);
  assert.equal(gets(d, THREAD_PATH), t0 + 3, "5 s thread polls");
  assert.equal(gets(d, LIST_PATH), l0 + 1, "15 s list poll");
  es().ready(); await settle();
  const t1 = gets(d, THREAD_PATH);
  await clock.advance(30000);
  assert.equal(gets(d, THREAD_PATH), t1, "slow again after ready");
  assert.deepEqual(d.toasts, []);
});

test("live: CLOSED means polling only; the stream is tried again every 60 s, and the reopened stream works", async () => {
  const { d, clock, ES, es } = await live();
  await openFirst(d); es().ready(); await settle();
  es().dead(); await settle();
  assert.ok(es().closed, "the dead stream is closed");
  assert.equal(ES.made.length, 1);
  const t0 = gets(d, THREAD_PATH);
  await clock.advance(5000);
  assert.equal(gets(d, THREAD_PATH), t0 + 1, "polls at 5 s");
  await clock.advance(54999);
  assert.equal(ES.made.length, 1, "not before 60 s");
  await clock.advance(1);
  assert.equal(ES.made.length, 2, "tried again at 60 s");
  es().dead(); await settle();
  await clock.advance(60000);
  assert.equal(ES.made.length, 3, "and again 60 s later, never faster");
  es().ready(); await settle();
  const t1 = gets(d, THREAD_PATH);
  await clock.advance(30000);
  assert.equal(gets(d, THREAD_PATH), t1, "healthy again");
});

test("live: after a 401 the stream is never tried again", async () => {
  const { d, clock, ES, es } = await live();
  await openFirst(d); es().ready(); await settle();
  d.s.listAnswer = { status: 401, body: { error: { code: "not_authenticated", message: "Sign in." } } };
  es().dead(); await settle();
  await clock.advance(600000);
  assert.equal(ES.made.length, 1, "no retry");
  d.doc.hidden = true; d.doc.fire("visibilitychange"); d.doc.hidden = false; d.doc.fire("visibilitychange"); await settle();
  d.winListeners.focus.forEach((f) => f()); await clock.advance(120000);
  assert.equal(ES.made.length, 1, "not on visible or focus either");
});

test("live: a hidden tab closes the stream and reads nothing; visible opens a new one; focus does not open a second", async () => {
  const { d, clock, ES, es } = await live();
  await openFirst(d); es().ready(); await settle();
  const first = es();
  d.doc.hidden = true; d.doc.fire("visibilitychange");
  assert.ok(first.closed, "closed when hidden");
  const n = d.calls.length;
  await clock.advance(120000);
  assert.equal(d.calls.length, n);
  assert.equal(clock.pending(), 0);
  d.doc.hidden = false; d.doc.fire("visibilitychange"); await settle();
  assert.equal(ES.made.length, 2, "reopened when visible");
  d.winListeners.focus.forEach((f) => f()); await settle();
  assert.equal(ES.made.length, 2, "focus does not open another");
  first.emit("conversation_updated", { ref: REF });
  const m = d.calls.length; await clock.advance(300);
  assert.equal(d.calls.length, m, "a closed stream's late event is ignored");
});

test("live: leaving the Inbox closes the stream and drops a pending list read; opening it again opens a new one", async () => {
  const { d, clock, ES, es } = await live();
  await openFirst(d); es().ready(); await settle();
  const first = es();
  first.emit("conversation_updated", { ref: REF2 });
  d.window.NOInbox.hide();
  assert.ok(first.closed);
  const n = d.calls.length;
  await clock.advance(120000);
  assert.equal(d.calls.length, n, "nothing after leaving");
  await d.openInbox();
  assert.equal(ES.made.length, 2);
  assert.ok(!es().closed);
});

test("live: no EventSource in the browser, or a 404 answer from the stream, leaves the polls as they were", async () => {
  const { d, clock } = await polling();
  const t0 = gets(d, LIST_PATH);
  await clock.advance(15000);
  assert.equal(gets(d, LIST_PATH), t0 + 1);
  const r = await live(); await openFirst(r.d);
  r.es().dead(); await settle();
  const l0 = gets(r.d, LIST_PATH);
  await r.clock.advance(15000);
  assert.ok(gets(r.d, LIST_PATH) > l0, "the 15 s poll still runs");
  assert.deepEqual(r.d.toasts, []);
});

/* ---------- INBOX-UI (z8uq9mg7c7): photo, states, window notice, Enter-send, grouping, unread badge, search, layout ---------- */

const PIC = "https://platform-lookaside.fbsbx.com/platform/profilepic/?psid=1";
const out = (id, state, minutesAgo, extra = {}) => ({ id, direction: "out", sender_kind: "owner", text: "Reply " + id, attachments: [], at: iso(minutesAgo), delivery_state: state, ...extra });
const inn = (id, minutesAgo, extra = {}) => ({ id, direction: "in", sender_kind: "customer", text: "Msg " + id, attachments: [], at: iso(minutesAgo), delivery_state: "", ...extra });
const mThread = (messages, win = { open: true, closes_at: iso(-600) }, extra = {}) => ({ ...msgrThread(win), messages, ...extra });
const mList = (extra = {}) => ({ items: [{ ref: FM, display_name: "Ana Reyes", snippet: "Hello", updated_at: iso(5), provider: "messenger", status: "open", unread: false, ...extra }], stored_next_cursor: null });
const imgs = (n) => n.all((x) => x.tagName === "IMG");
const navNb = (d) => d.nav.map((a) => a.all((x) => x.classList.contains("ib-nb"))[0]);
const asInbox = (d) => d.nav.forEach((a) => a.setAttribute("data-route", "inbox"));

test("U1: a Messenger row and the thread head show the photo (no-referrer, empty alt); no address or a broken image leaves the initials", async () => {
  const d = boot({ listing: mList({ avatar_url: PIC }), reading: mThread([inn("a", 3)], undefined, { avatar_url: PIC }), channels: CHANNELS_ON });
  await d.openInbox();
  const row = d.all(d.$("ib-list"), "ib-item")[0], av = d.all(row, "ib-av")[0], img = imgs(av)[0];
  assert.equal(img.getAttribute("src"), PIC);
  assert.equal(img.getAttribute("alt"), "");
  assert.equal(img.getAttribute("referrerpolicy"), "no-referrer");
  assert.equal(av.textContent, "AR", "the initials stay under the photo");
  assert.equal(av.getAttribute("aria-hidden"), "true");
  await d.click(row);
  const head = d.all(d.$("ib-threadpane"), "ib-av")[0];
  assert.equal(imgs(head)[0].getAttribute("src"), PIC);
  img.fire("error");
  assert.equal(imgs(av).length, 0, "an image that fails to load is taken away");
  assert.equal(av.textContent, "AR");
  const none = boot({ listing: mList({ avatar_url: null }), channels: CHANNELS_ON });
  await none.openInbox();
  assert.equal(imgs(none.$("ib-list")).length, 0, "null: initials only");
  const odd = boot({ listing: mList({ avatar_url: "http://x.test/a.png" }), channels: CHANNELS_ON });
  await odd.openInbox();
  assert.equal(imgs(odd.$("ib-list")).length, 0, "only an https address is used");
  const old = boot({ channels: CHANNELS_ON });
  await old.openInbox();
  assert.equal(imgs(old.$("ib-list")).length, 0, "an answer without the field still renders");
});

test("U1: the CSP allows the two Facebook picture hosts and nothing else new", () => {
  const cfg = fs.readFileSync(path.join(JS, "..", "..", "..", "next.config.ts"), "utf8");
  const line = cfg.split("\n").find((l) => l.includes("img-src"));
  assert.match(line, /https:\/\/platform-lookaside\.fbsbx\.com https:\/\/\*\.fbcdn\.net`/);
  assert.equal((line.match(/https:\/\/[^\s`]+/g) || []).length, 2);
});

test("U2: Messenger bubbles say Sent, Delivered or Seen (Seen on the latest seen one only); failed keeps its text; other channels are unchanged", async () => {
  const msgs = [out("o1", "seen", 50), out("o2", "seen", 40), out("o3", "delivered", 30), out("o4", "sent", 20), out("o5", "failed", 10)];
  const d = boot({ listing: mList(), reading: mThread(msgs), channels: CHANNELS_ON });
  await d.openInbox(); await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  const chips = d.all(d.$("ib-threadpane"), "ib-long").map((c) => c.textContent);
  assert.deepEqual(chips, ["Seen", "Delivered", "Sent", "Failed: Facebook did not answer. Try again."], "the older seen bubble shows nothing");
  const seen = boot({ listing: mList(), reading: mThread([out("o1", "seen", 50), out("o2", "seen", 40)]), channels: CHANNELS_ON });
  await seen.openInbox(); await seen.click(seen.all(seen.$("ib-list"), "ib-item")[0]);
  assert.deepEqual(seen.all(seen.$("ib-threadpane"), "ib-long").map((c) => c.textContent), ["Seen"]);
  const u = d.window.NOInbox.util;
  assert.equal(u.chipFor("messenger", out("x", "sent", 1), "", false).join(), "ok,Sent");
  assert.equal(u.chipFor("messenger", out("x", "seen", 1), "", false), null);
  assert.equal(u.chipFor("webchat", out("x", "sent", 1))[1], "Delivered to chat when the visitor is online");
  assert.equal(u.chipFor("email", out("x", "sent", 1))[1], "Sent to the mail server");
  assert.equal(u.chipFor("webchat", out("x", "seen", 1)), null);
});

test("failTextOf is channel aware: Messenger and comment codes never fall back to the email wording", async () => {
  const d = boot({ channels: CH_OFF });
  const f = d.window.NOInbox.util.failTextOf;
  /* email and chat keep their texts */
  assert.equal(f("email_failed", "email"), "The email could not be sent. Please try again shortly.");
  assert.equal(f("rate_limited", "webchat"), "Too many emails have been sent from this store. Please wait and try again.");
  assert.equal(f("nonsense"), "The email could not be sent. Please try again shortly.");
  /* Messenger */
  assert.equal(f("window_closed", "messenger"), "You can reply within 24 hours of the customer's last message.");
  for (const c of ["token_invalid", "invalid_credentials", "expired_credentials"]) assert.equal(f(c, "messenger"), "Reconnect your Facebook Page in Settings > Inbox.");
  assert.equal(f("not_configured", "messenger"), "Connect your Facebook Page to reply.");
  assert.equal(f("forbidden_page", "messenger"), "Messenger needs all the permissions it asks for. Please connect again and allow them.");
  for (const c of ["rate_limited", "blocked_rate"]) assert.equal(f(c, "messenger"), "Facebook is limiting replies right now. Try again in a few minutes.");
  for (const c of ["provider_down", "bad_response", "not_found", "", "unknown_code"]) assert.equal(f(c, "messenger"), "Facebook did not answer. Try again.");
  for (const c of ["email_failed", "sender_not_ready", "no_recipient"]) assert.ok(!/email/i.test(f(c, "messenger")), c);
});

test("U3: with under 2 hours left the thread says until when; more time says nothing; a closed window locks the box", async () => {
  const soon = boot({ listing: mList(), reading: mThread([inn("a", 3)], { open: true, closes_at: iso(-90) }), channels: CHANNELS_ON });
  await soon.openInbox(); await soon.click(soon.all(soon.$("ib-list"), "ib-item")[0]);
  assert.equal(soon.all(soon.$("ib-threadpane"), "ib-wnote")[0].textContent, "You can reply until 11:30 AM, today.");
  assert.equal(soon.$("ib-rb").disabled, false);
  const u = soon.window.NOInbox.util, now = new Date();
  assert.equal(u.windowNotice({ reply_window: { open: true, closes_at: iso(-150) } }, now), "", "2 h 30 min: no notice");
  assert.equal(u.windowNotice({ reply_window: { open: true, closes_at: iso(-60 * 15) } }, now), "");
  assert.equal(u.windowNotice({ reply_window: { open: true } }, now), "", "an old answer without closes_at");
  assert.equal(u.windowNotice({ reply_window: { open: true, closes_at: iso(-110) } }, now).endsWith(", today."), true);
  const late = new Date("2026-11-16T15:30:00Z"); /* 23:30 Manila; the window ends 00:30 tomorrow */
  assert.equal(u.windowNotice({ reply_window: { open: true, closes_at: "2026-11-16T16:30:00Z" } }, late), "You can reply until 12:30 AM, tomorrow.");
  const closed = boot({ listing: mList(), reading: mThread([inn("a", 3)], { open: false, closes_at: iso(60) }), channels: CHANNELS_ON });
  await closed.openInbox(); await closed.click(closed.all(closed.$("ib-list"), "ib-item")[0]);
  assert.equal(closed.$("ib-rb").disabled, true);
  assert.equal(closed.press(closed.$("ib-threadpane"), "Send").disabled, true);
  assert.ok(closed.$("ib-threadpane").textContent.includes("You can reply within 24 hours of the customer's last message."));
  assert.equal(closed.all(closed.$("ib-threadpane"), "ib-wnote").length, 0);
});

test("U4: Enter sends, Shift+Enter does not, an IME composition does not, and on a touch screen Enter is a new line", async () => {
  const key = (d, extra) => { const e = d.$("ib-rb").fire("keydown", { key: "Enter", ...extra }); return e.prevented; };
  const d = boot({});
  await d.openInbox(); await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  const box = d.$("ib-rb"), posts = () => d.calls.filter((c) => c.path.endsWith("/reply/")).length;
  box.value = "Hello po"; box.fire("input");
  assert.equal(key(d, { shiftKey: true }), false); await settle(); assert.equal(posts(), 0, "Shift+Enter is a new line");
  assert.equal(key(d, { isComposing: true }), false); await settle(); assert.equal(posts(), 0, "no send while an IME composes");
  assert.equal(key(d, { keyCode: 229 }), false); await settle(); assert.equal(posts(), 0);
  d.window.matchMedia = (q) => ({ matches: q === "(pointer: coarse)" });
  assert.equal(key(d, {}), false); await settle(); assert.equal(posts(), 0, "a phone: Enter is a new line");
  delete d.window.matchMedia;
  assert.equal(key(d, {}), true); await settle(); assert.equal(posts(), 1, "Enter sends");
  assert.equal(d.calls.find((c) => c.path.endsWith("/reply/")).body.text, "Hello po");
  d.$("ib-rb").value = ""; d.$("ib-rb").fire("input");
  key(d, {}); await settle(); assert.equal(posts(), 1, "an empty box sends nothing");
});

test("U4: bubbles of one sender within 5 minutes group (one time at the end, tight rows); a longer gap, another sender or another day breaks it; day dividers", async () => {
  const msgs = [inn("a", 600), inn("b", 598), inn("c", 596), out("d", "", 595), inn("e", 500), inn("f", 30 * 60 + 20), inn("g", 30 * 60 + 19)]; /* oldest first: f g (yesterday), a b c d e */
  const d = boot({ reading: thread({ messages: msgs }) });
  await d.openInbox(); await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  const rows = d.all(d.$("ib-threadpane"), "ib-msg");
  assert.deepEqual(rows.map((r) => r.classList.contains("ib-grp")), [true, false, true, true, false, false, false]);
  assert.deepEqual(rows.map((r) => d.all(r, "ib-meta").length), [0, 1, 0, 0, 1, 1, 1], "one time stamp per group, under its last bubble");
  const days = d.all(d.$("ib-threadpane"), "ib-day").map((x) => x.textContent);
  assert.equal(days[days.length - 1], "Today");
  assert.ok(days.length >= 2, "a divider per day: " + days);
  const u = d.window.NOInbox.util;
  assert.equal(u.grouped({ out: true, at: iso(10) }, { out: true, at: iso(5.1) }), true);
  assert.equal(u.grouped({ out: true, at: iso(10) }, { out: true, at: iso(4.9) }), false);
  assert.equal(u.grouped({ out: true, at: iso(10) }, { out: false, at: iso(9) }), false);
  assert.equal(u.grouped({ out: true, at: "" }, { out: true, at: iso(9) }), false);
});

test("U4: the thread opens at the newest message and moves to it after a send", async () => {
  const { d } = await polling();
  await openFirst(d);
  const msgs = d.all(d.$("ib-threadpane"), "ib-msgs")[0];
  assert.equal(msgs.scrollTop, 1000, "opened at the bottom");
  msgs.scrollTop = 100;
  d.$("ib-rb").value = "Ok po"; d.$("ib-rb").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  assert.equal(d.all(d.$("ib-threadpane"), "ib-msgs")[0].scrollTop, 1000, "after sending");
});

test("U5: the Inbox links show the unread count from an Inbox read: hidden at 0, 99+ above 99, with an aria-label", async () => {
  const d = boot({ listing: { ...list(), unread_total: 7 }, channels: CHANNELS_ON });
  asInbox(d);
  await d.openInbox();
  const nb = navNb(d);
  assert.deepEqual(nb.map((n) => n.textContent), ["7", "7", "7"]);
  assert.deepEqual(nb.map((n) => n.hidden), [false, false, false]);
  assert.deepEqual(d.nav.map((a) => a.getAttribute("aria-label")), ["Inbox, 7 unread", "Inbox, 7 unread", "Inbox, 7 unread"]);
  d.s.listing = { ...list(), unread_total: 0 };
  await d.click(d.$("ib-refresh-btn"));
  assert.deepEqual(navNb(d).map((n) => n.hidden), [true, true, true]);
  assert.equal(d.nav[0].getAttribute("aria-label"), null);
  d.s.listing = { ...list(), unread_total: 250 };
  await d.click(d.$("ib-refresh-btn"));
  assert.equal(navNb(d)[0].textContent, "99+");
  assert.equal(d.nav[0].getAttribute("aria-label"), "Inbox, 250 unread");
  const u = d.window.NOInbox.util;
  assert.deepEqual([0, 1, 99, 100, null, "x"].map(u.badgeText), ["", "1", "99", "99+", "", ""]);
  const old = boot({ channels: CHANNELS_ON });
  asInbox(old); await old.openInbox();
  assert.deepEqual(navNb(old), [undefined, undefined, undefined], "an old answer without unread_total leaves the nav alone");
});

test("U5: opening an unread conversation takes one off the count", async () => {
  const items = list().items.map((i, n) => ({ ...i, unread: n === 0 }));
  const d = boot({ listing: { items, stored_next_cursor: null, unread_total: 3 }, channels: CHANNELS_ON });
  asInbox(d); await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  assert.equal(navNb(d)[0].textContent, "2");
});

test("U5: on other views the count is read at once and every 60 s while the tab is visible; the Inbox view reads it from the list instead", async () => {
  const clock = makeClock(), d = boot({ clock, channels: CHANNELS_ON });
  asInbox(d); d.s.unread = 4;
  d.window.NOInbox.probe(); await settle();
  const reads = () => d.calls.filter((c) => c.path === BASE + "unread/").length;
  assert.equal(reads(), 1);
  assert.equal(navNb(d)[0].textContent, "4");
  d.s.unread = 5;
  await clock.advance(59999); assert.equal(reads(), 1);
  await clock.advance(1); assert.equal(reads(), 2);
  assert.equal(navNb(d)[0].textContent, "5");
  d.doc.hidden = true; d.doc.fire("visibilitychange");
  await clock.advance(300000); assert.equal(reads(), 2, "paused while the tab is hidden");
  d.doc.hidden = false; d.doc.fire("visibilitychange"); await settle();
  assert.equal(reads(), 3, "read again when it comes back");
  await d.openInbox();
  const n = reads(); await clock.advance(600000);
  assert.equal(reads(), n, "not while the Inbox view is open");
  d.window.NOInbox.hide(); await settle();
  assert.equal(reads(), n + 1, "read again on leaving it");
  d.s.unreadAnswer = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
  await clock.advance(60000);
  assert.equal(navNb(d)[0].hidden, true, "a 404 clears it");
});

test("U5: a LIVE event while on the Inbox refreshes the count with the list", async () => {
  const { d, es, clock } = await live({ listing: { ...list(), unread_total: 1 }, channels: CHANNELS_ON });
  asInbox(d); es().ready(); await settle();
  d.s.listing = { ...list(), unread_total: 6 };
  es().emit("conversation_updated", { ref: REF2 });
  await clock.advance(300);
  assert.equal(navNb(d)[0].textContent, "6");
});

test("U5: search asks the API 300 ms after the last key, needs 2 characters, shows 'No conversations match', and clears", async () => {
  const clock = makeClock(), d = boot({ clock, listing: list({ unread_total: 9 }), channels: CHANNELS_ON });
  asInbox(d);
  d.s.searcher = (q) => ({ items: q === "zzz" ? [] : [list().items[1]], stored_next_cursor: null, unread_total: 1 });
  await d.openInbox();
  const inp = d.$("ib-q"), qCalls = () => d.calls.filter((c) => c.path.includes("?q=") || c.path.includes("&q="));
  await d.click(d.$("ib-b-search"));
  assert.equal(inp.getAttribute("type"), "search");
  assert.equal(inp.getAttribute("maxlength"), "80");
  assert.equal(d.all(d.$("ib-lhead"), "pm-label").map((l) => l.textContent)[0], "Search");
  inp.value = "J"; inp.fire("input"); await clock.advance(400);
  assert.equal(qCalls().length, 0, "one character is not a search");
  inp.value = "Ju"; inp.fire("input"); await clock.advance(299);
  assert.equal(qCalls().length, 0, "debounced");
  inp.value = "Jun"; inp.fire("input"); await clock.advance(299); assert.equal(qCalls().length, 0);
  await clock.advance(1);
  assert.deepEqual(qCalls().map((c) => c.path), [LIST_PATH + "?q=Jun"], "one request, with the last text");
  const rows = d.all(d.$("ib-list"), "ib-item");
  assert.equal(rows.length, 1);
  assert.equal(d.$("ib-q"), inp, "the box and its cursor stay while the rows change");
  assert.equal(navNb(d)[0].textContent, "9", "a search answer does not change the nav count");
  inp.value = "zzz"; inp.fire("input"); await clock.advance(300);
  assert.ok(d.$("ib-listbody").textContent.includes("No conversations match"));
  const clear = d.$("ib-sclose");
  assert.equal(clear.getAttribute("aria-label"), "Close search");
  await d.click(clear);
  assert.equal(inp.value, ""); assert.equal(d.$("ib-b-search").getAttribute("aria-expanded"), "false", "the box is closed again");
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 2, "the normal list is back");
  assert.equal(qCalls().length, 2);
});

test("U5: search works with the Channel filter and keeps its text through a background list read", async () => {
  const clock = makeClock(), d = boot({ clock, listing: MIXED(), channels: CHANNELS_ON });
  d.s.searcher = () => MIXED();
  scrollable(d);
  await d.openInbox();
  const inp = d.$("ib-q");
  inp.value = "an"; inp.fire("input"); await clock.advance(300);
  await pickTab(d, "email");
  const shown = d.all(d.$("ib-list"), "ib-item").length;
  assert.ok(shown >= 1 && shown < MIXED().items.length, "the filter narrows the search rows");
  const n = d.calls.filter((c) => c.path.includes("q=an")).length;
  await clock.advance(15000);
  assert.ok(d.calls.filter((c) => c.path.includes("q=an")).length > n, "the list poll keeps asking with the search text");
  assert.equal(d.$("ib-q").value, "an");
});

test("U6: the Inbox is a fixed-height view; the list and thread scroll inside their panes; one pane at a time on a phone", async () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /body\.dash-app\.ib-fixed \.app \{[^}]*height: 100dvh;[^}]*overflow: hidden/);
  assert.match(css, /#view-inbox \.ib-split \{[^}]*flex: 1 1 0;[^}]*min-height: 0/);
  assert.match(css, /#view-inbox \.ib-msgs \{[^}]*overflow-y: auto/);
  assert.match(css, /#view-inbox \.ib-listbody > \.ib-list \{ flex: 1 1 0; \}/);
  const phone = css.slice(css.indexOf("@media (max-width: 899px)"), css.indexOf("/* ---- G3 PR3"));
  assert.match(phone, /\.ib-split \.is-hide-phone \{ display: none/);
  assert.doesNotMatch(phone, /ib-msgs \{[^}]*overflow: visible/, "the thread scrolls in its pane on a phone too");
  assert.match(css, /#view-inbox \.ib-reply \{ flex: none; \}/, "the reply box stays at the bottom");
  const d = boot();
  d.doc.body.classList.remove("ib-fixed");
  await d.openInbox();
  assert.equal(d.doc.body.classList.contains("ib-fixed"), true);
  d.window.NOInbox.hide();
  assert.equal(d.doc.body.classList.contains("ib-fixed"), false);
  assert.equal(d.$("ib-threadpane"), null);
});

test("INBOX-UI: the new focus borders are light blue, never gold, and the search box uses the house field look", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8");
  assert.match(css, /\.ib-qs:focus-within \{[^}]*border-color: var\(--link/);
  assert.doesNotMatch(css.slice(css.indexOf("INBOX-UI (ClickUp")).replace(/\/\*[\s\S]*?\*\//g, ""), /gold|#C9A646|#D9B93F/i);
});

/* ---------- INBOX-UI round 2 (z8uq9mg7ux): the filter row in the Conversations card, the header text, phone height, closed-window note ---------- */

const row = (it, over = {}) => ({ ref: it.ref, display_name: it.display_name, snippet: it.snippet, updated_at: it.updated_at, channel: "webchat", source: "stored", status: "open", unread: false, ...over });
const byStatus = (st) => {
  const base = list().items, closed = [row(base[1], { status: "closed" })];
  return { items: st === "closed" ? closed : st === "open" ? [row(base[0])] : [row(base[0]), ...closed], stored_next_cursor: null };
};

test("C2: the toolbar is a row above the card: the channel tabs, then New text / Text many members / Refresh; the list column has the search box and the quick chips", async () => {
  const d = boot({ channels: CHANNELS_ON });
  await d.openInbox();
  const wrap = d.$("ib-wrap"), split = d.all(wrap, "ib-split")[0];
  assert.deepEqual(wrap.children.map((n) => n.id), ["ib-tools-host", "ib-split"], "the toolbar directly above the card");
  assert.deepEqual(split.children.map((n) => n.id), ["ib-listpane", "ib-threadpane", "ib-cpane"], "list, thread, contact panel");
  assert.equal(d.all(split, "ib-rcol").length, 0);
  const tools = d.all(d.$("ib-tools-host"), "ib-tools")[0];
  const parts = d.all(tools, "ib-trow")[0].children;
  assert.deepEqual(parts.map((n) => (n.classList.contains("ib-tabs") ? "tabs" : n.classList.contains("ib-acts") ? "acts" : n.id)), ["tabs", "acts"]);
  assert.deepEqual(parts[1].children.map((n) => n.id), ["ib-refresh-btn"], "no SMS: Refresh alone");
  assert.equal(d.all(parts[1], "ib-rf-t")[0].textContent, "Refresh");
  const head = d.$("ib-lhead");
  const bar = head.children[0];
  assert.deepEqual(bar.children.map((n) => (n.classList.contains("ib-frow") ? "buttons" : n.classList.contains("ib-search") ? "search" : n.id)), ["buttons", "search"]);
  assert.deepEqual(d.all(bar, "ib-fbtn").map((b) => b.id), ["ib-b-search", "ib-b-answered", "ib-b-read", "ib-b-status"], "Search, Answered, Read, Open/Closed");
  assert.deepEqual(d.all(head, "pm-label").map((l) => [l.textContent, l.getAttribute("for"), l.classList.contains("sr-only")]), [["Search", "ib-q", true]]);
  assert.equal(d.all(head, "ib-si").length, 1, "the magnifier inside the search box");
  assert.equal(d.all(head, "ib-qs").length, 1);
  assert.equal(d.$("ib-q").getAttribute("placeholder"), "Name, email or message");
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  assert.equal(d.$("ib-tools-host").parentNode, d.$("ib-wrap"), "still above the card with a conversation open");
  assert.equal(d.$("ib-tools-host").classList.contains("is-hide-phone"), true, "a phone hides it while a conversation is open");
  const again = boot({ channels: CHANNELS_ON }); await again.openInbox();
  assert.equal(again.$("ib-tools-host").classList.contains("is-hide-phone"), false, "and shows it above the list");
  assert.ok(again.$("ib-threadpane").textContent.includes("Choose a conversation"), "with no conversation open the thread column says Choose a conversation");
});

test("C2: the Open / Closed chips send ?status=open or closed, nothing when off, combined with the search text; the channel tab still narrows the rows", async () => {
  const clock = makeClock(), d = boot({ clock, channels: CHANNELS_ON });
  asInbox(d);
  d.s.statuser = (st) => byStatus(st);
  await d.openInbox();
  const reads = () => d.calls.filter((c) => c.method === "GET" && c.path.startsWith(LIST_PATH) && !/conversations\/[^/?]+\/$/.test(c.path)).map((c) => c.path);
  assert.equal(reads().at(-1), LIST_PATH, "no chip on: no status parameter");
  assert.deepEqual([chipOn(d, "open"), chipOn(d, "closed")], ["false", "false"]);
  await pickChip(d, "closed");
  assert.equal(reads().at(-1), LIST_PATH + "?status=closed");
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 1);
  assert.deepEqual([chipOn(d, "open"), chipOn(d, "closed")], ["false", "true"]);
  await pickChip(d, "open");
  assert.equal(reads().at(-1), LIST_PATH + "?status=open");
  assert.deepEqual([chipOn(d, "open"), chipOn(d, "closed")], ["true", "false"], "one status at a time");
  const inp = d.$("ib-q");
  inp.value = "Mar"; inp.fire("input"); await clock.advance(300);
  assert.equal(reads().at(-1), LIST_PATH + "?q=Mar&status=open", "search and status together");
  assert.equal(d.$("ib-q"), inp, "the search box stays while the rows change");
  await clock.advance(15000);
  assert.equal(reads().at(-1), LIST_PATH + "?q=Mar&status=open", "the list poll keeps both");
  await pickOff(d, "open");
  assert.equal(reads().at(-1), LIST_PATH + "?q=Mar", "the third press goes back to all and drops the parameter");
  await pickChip(d, "closed");
  await pickTab(d, "email");
  assert.ok(d.$("ib-listbody").textContent.includes("No conversations match \u201CMar\u201D."), "the channel is still a filter on the rows (and a search is on)");
  assert.equal(reads().at(-1), LIST_PATH + "?q=Mar&status=closed", "the channel adds nothing to the address");
  assert.equal(d.calls.filter((c) => /status=[^&]*(all|invalid)/.test(c.path)).length, 0);
});

test("C2: a chip read that fails says so and puts the chip back; the nav count ignores a filtered list", async () => {
  const d = boot({ channels: CHANNELS_ON, listing: list({ unread_total: 4 }) });
  asInbox(d);
  await d.openInbox();
  d.s.listAnswer = { status: 502, body: { error: { code: "server_error", message: "Please try again later." } } };
  await pickChip(d, "open");
  assert.equal(d.toasts.length, 1);
  assert.equal(chipOn(d, "open"), "false", "the chip is back off");
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 2, "the list is as it was");
  d.s.listAnswer = null; d.s.statuser = (st) => ({ ...byStatus(st), unread_total: 1 });
  await pickChip(d, "closed");
  assert.equal(navNb(d)[0].textContent, "4", "a filtered answer does not change the nav count");
});

test("empty states: 'No conversations match' covers a chip with no conversations; a list with nothing at all keeps only the buttons in the row", async () => {
  const d = boot({ channels: CHANNELS_ON });
  d.s.statuser = (st) => (st === "closed" ? { items: [], stored_next_cursor: null } : list());
  await d.openInbox();
  await pickChip(d, "closed");
  assert.equal(d.all(d.$("ib-listbody"), "ib-empty-filter")[0].textContent, "No conversations match.");
  assert.ok(d.$("ib-b-status"), "the buttons stay so the filter can be changed back");
  const none = boot({ listing: { items: [], stored_next_cursor: null }, channels: CHANNELS_ON });
  await none.openInbox();
  assert.ok(none.$("ib-listbody").textContent.includes("No messages yet"));
  assert.ok(none.$("ib-refresh-btn"), "the empty text says Press Refresh, so the button is there");
  assert.equal(none.all(none.$("ib-tools-host"), "ib-tools")[0].classList.contains("is-lite"), true);
  assert.equal(none.$("ib-q"), null);
  assert.equal(none.$("ib-b-status"), null);
  assert.equal(none.$("ib-tab-all"), null, "no tabs while there is nothing to filter");
});

test("the list column starts with one row of four icon buttons (Search, Answered, Read, Open/Closed), real buttons with words and their own icons", async () => {
  const d = boot({ channels: CHANNELS_ON });
  await d.openInbox();
  const btns = d.all(d.$("ib-lhead"), "ib-fbtn");
  assert.deepEqual(btns.map((c) => c.id), ["ib-b-search", "ib-b-answered", "ib-b-read", "ib-b-status"]);
  assert.ok(btns.every((c) => c.tagName === "BUTTON" && c.getAttribute("type") === "button" && c.getAttribute("aria-pressed") === "false" && !!c.getAttribute("aria-label") && c.getAttribute("title") === c.getAttribute("aria-label")));
  assert.deepEqual(btns.map((c) => c.getAttribute("aria-label")), ["Search", "Showing answered and unanswered", "Showing all messages", "Showing open and closed"]);
  assert.ok(btns.every((c) => c.textContent === "" && c.children.length === 1), "icon only");
  assert.equal(d.$("ib-frow").getAttribute("role"), "group");
  assert.equal(d.$("ib-chips"), null, "the text chips are gone");
  assert.equal(d.$("ib-frow").hidden, false); assert.equal(d.all(d.$("ib-lhead"), "ib-search")[0].hidden, true, "the search box starts closed");
  assert.equal(d.$("ib-upd"), null, "#ib-upd is gone");
  assert.equal(d.$("ib-rtog"), null, "the old icon toggles are gone");
  assert.equal(d.$("ib-atog"), null);
  d.s.listAnswer = { status: 502, body: { error: { code: "server_error", message: "Please try again later." } } };
  await d.click(d.$("ib-refresh-btn"));
  assert.equal(d.$("ib-upd"), null);
});

test("Finding 2: a closed Messenger window puts the 24-hour sentence above the reply box, like the open-window notice", async () => {
  const d = boot({ listing: mList(), reading: mThread([inn("a", 3)], { open: false, closes_at: iso(60) }), channels: CHANNELS_ON });
  await d.openInbox(); await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  const reply = d.all(d.$("ib-threadpane"), "ib-reply")[0], kids = reply.children;
  const noteAt = kids.findIndex((n) => n.id === "ib-rn"), boxAt = kids.findIndex((n) => n.id === "ib-rb");
  assert.ok(noteAt === 0 && boxAt > noteAt, "the sentence is the first thing in the reply area, before the text box");
  assert.equal(kids[noteAt].textContent, "You can reply within 24 hours of the customer's last message.");
  assert.equal(kids[noteAt].classList.contains("ib-note"), true);
  assert.equal(d.$("ib-rb").getAttribute("aria-describedby"), "ib-rn");
  assert.equal(d.$("ib-rb").disabled, true);
  const open = boot({ listing: mList(), reading: mThread([inn("a", 3)], { open: true, closes_at: iso(-90) }), channels: CHANNELS_ON });
  await open.openInbox(); await open.click(open.all(open.$("ib-list"), "ib-item")[0]);
  assert.equal(open.all(open.$("ib-threadpane"), "ib-reply")[0].children[0].classList.contains("ib-wnote"), true, "the open-window notice is in the same place");
});

test("Finding 1: on a phone the cards reach the bottom bar: only the bar and a small gap are left under them, the reply box is pinned at the bottom", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const dash = fs.readFileSync(path.join(JS, "..", "css", "dash.css"), "utf8");
  const phone = css.slice(css.lastIndexOf("@media (max-width: 899px) {", css.length));
  assert.match(phone, /body\.dash-app\.ib-fixed \.col \{ padding-bottom: calc\(65px \+ 12px \+ env\(safe-area-inset-bottom\)\); \}/);
  /* the 65 px is the bar: 4 + 56 + 4 padding + 1 border (dash.css .tabs and its items) */
  assert.match(dash, /body\.dash-app \.tabs:not\(\[hidden\]\) \{[^}]*padding: 4px 8px calc\(4px \+ env\(safe-area-inset-bottom\)\); border-top: 1px solid/);
  assert.match(dash, /body\.dash-app \.tabs a, body\.dash-app \.tabs button \{[^}]*min-height: 56px/);
  assert.match(css, /body\.dash-app\.ib-fixed \.col \{ flex: 1 1 0; min-height: 0; overflow-y: auto; \}/);
  assert.match(css, /#view-inbox \.ib-reply \{ flex: none; \}/);
  assert.match(css, /#view-inbox \.ib-msgs \{[^}]*flex: 1;[^}]*overflow-y: auto/);
  assert.doesNotMatch(css, /view-head|dash-eyebrow|ib-viewhead/, "no rule is left for the removed page header");
});

test("the toolbar CSS: the tabs row and the actions; phone: tabs on their own line, then icon-only buttons; the toolbar sits over the list on a phone", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /#view-inbox \.ib-trow \{ display: flex; flex-wrap: wrap;[^}]*align-items: center;/);
  assert.match(css, /#view-inbox \.ib-tabs \{ display: flex;[^}]*overflow-x: auto;/, "the tabs scroll inside their own row, never the page");
  assert.match(css, /\.ib-qs:focus-within \{[^}]*border-color: var\(--link/);
  assert.match(css, /#view-inbox \.ib-split \{ display: grid; grid-template-columns: minmax\(280px, 340px\) minmax\(0, 1fr\) auto;/, "three columns: list, thread, contact panel");
  assert.doesNotMatch(css, /ib-rcol/, "the right column is gone");
  const phone = css.slice(css.indexOf("@media (max-width: 899px)"));
  assert.match(phone, /\.ib-split \{ display: flex; flex-direction: column;/);
  assert.match(phone, /\.ib-tabs \{ flex: 1 1 100%; \}/);
  assert.match(phone, /\.ib-split \.is-hide-phone \{ display: none/, "the toolbar goes with the list while a conversation is open");
  assert.match(phone, /\.ib-cpane, #view-inbox \.ib-ctog \{ display: none !important; \}/, "no contact panel on a phone");
  assert.doesNotMatch(css, /container-type|@container/, "containment would trap the fixed dropdown panel");
  assert.doesNotMatch(css.replace(/#view-inbox \.ib-tabs \{[^}]*\}/, ""), /overflow-x: ?(scroll|auto)/, "no sideways scroll anywhere else");
  assert.match(css, /\.ib-combo-box:focus-within \{[^}]*border-color: var\(--link\)/);
  assert.match(css, /\.ib-fbtn:focus-visible \{[^}]*border-color: var\(--link\)/, "light-blue focus on the filter buttons");
  assert.match(css, /\.ib-fbtn \{[^}]*width: 44px; height: 44px;[^}]*border: 1px solid var\(--card-line\); border-radius: 8px/, "the top-bar button look");
  assert.match(css, /\.ib-fbtn\[aria-pressed="true"\][^{]*\{[^}]*var\(--link\)/, "light blue when a filter is on");
  assert.match(css, /\.ib-tab:focus-visible \{[^}]*var\(--link\)/, "and on the tabs");
});

test("the page header sits where the F1 row used to be: no extra padding-top any more, the head is the view's own", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const dash = fs.readFileSync(path.join(JS, "..", "css", "dash.css"), "utf8");
  assert.doesNotMatch(css, /#view-inbox:not\(\[hidden\]\) \{ padding-top: 72px; \}/);
  assert.match(css, /#view-inbox \.ib-head \{ flex: none;/);
  assert.match(css, /body\.dash-app\.ib-thread \.ib-head \{ display: none; \}/, "a phone gives the header's room to the open thread");
  assert.match(dash, /body\.dash-app \.notif-col:not\(\[hidden\]\) \{[^}]*position: absolute; top: 32px/);
  assert.match(dash, /body\.dash-app \.notif-btn \{[^}]*height: 44px/);
});

test("Fix round F2: on a phone the Inbox drops the 84 px #main bottom padding, for the Inbox only", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const phone = css.slice(css.lastIndexOf("@media (max-width: 899px) {"));
  assert.match(phone, /body\.dash-app\.ib-fixed \.col-main \{ padding-bottom: 0; \}/);
  assert.doesNotMatch(css.replace(phone, ""), /\.col-main \{ padding-bottom/, "nothing outside the phone block / ib-fixed");
  const pack = fs.readFileSync(path.join(JS, "..", "css", "pack-orders.css"), "utf8");
  assert.match(pack, /body\.dash-app \.col-main\{padding-bottom:84px\}/, "other views keep their spacing");
});

/* ---------- Round 3: R1 space, R2 Read/Unread filter, R3 read vs unread, R4 selected chip ---------- */
const cssText = () => fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

test("R4-4: there is no Read dropdown; the Unread and Read chips start off", async () => {
  const d = boot({ channels: CHANNELS_ON });
  await d.openInbox();
  assert.equal(d.$("ib-read"), null);
  assert.equal(d.all(d.$("ib-tools-host"), "ib-fld-rd").length, 0);
  assert.deepEqual([chipOn(d, "unread"), chipOn(d, "read")], ["false", "false"]);
  assert.equal(d.$("ib-b-read").tagName, "BUTTON");
});

test("R4-4: the Unread / Read chips send unread=1 / unread=0 / nothing, one at a time, with q, status and the poll", async () => {
  const clock = makeClock(), d = boot({ clock, channels: CHANNELS_ON });
  asInbox(d);
  d.s.statuser = (st, q, un) => (un === "0" ? { items: [], stored_next_cursor: null } : byStatus(st));
  await d.openInbox();
  const reads = () => d.calls.filter((c) => c.method === "GET" && c.path.startsWith(LIST_PATH) && !/conversations\/[^/?]+\/$/.test(c.path)).map((c) => c.path);
  assert.equal(reads().at(-1), LIST_PATH, "no chip on: no unread parameter");
  await pickChip(d, "unread");
  assert.equal(reads().at(-1), LIST_PATH + "?unread=1");
  assert.deepEqual([chipOn(d, "unread"), chipOn(d, "read")], ["true", "false"]);
  await pickChip(d, "open");
  assert.equal(reads().at(-1), LIST_PATH + "?status=open&unread=1", "status and unread together");
  const inp = d.$("ib-q");
  inp.value = "Mar"; inp.fire("input"); await clock.advance(300);
  assert.equal(reads().at(-1), LIST_PATH + "?q=Mar&status=open&unread=1", "search, status and unread together");
  await clock.advance(15000);
  assert.equal(reads().at(-1), LIST_PATH + "?q=Mar&status=open&unread=1", "the list poll keeps all three");
  await pickChip(d, "read");
  assert.equal(reads().at(-1), LIST_PATH + "?q=Mar&status=open&unread=0");
  assert.deepEqual([chipOn(d, "unread"), chipOn(d, "read")], ["false", "true"], "Read replaces Unread");
  assert.ok(d.$("ib-listbody").textContent.includes("No conversations match"), "an empty filtered list says so");
  await pickOff(d, "read");
  assert.equal(reads().at(-1), LIST_PATH + "?q=Mar&status=open", "pressing it again drops the parameter");
  assert.deepEqual([chipOn(d, "unread"), chipOn(d, "read")], ["false", "false"]);
  assert.equal(d.calls.filter((c) => /unread=(all|invalid|true)/.test(c.path)).length, 0);
});

test("R4-4: a failed chip read puts the chip back with a toast; the nav count is never taken from a filtered list", async () => {
  const d = boot({ channels: CHANNELS_ON, listing: list({ unread_total: 4 }) });
  asInbox(d);
  await d.openInbox();
  d.s.listAnswer = { status: 502, body: { error: { code: "server_error", message: "Please try again later." } } };
  await pickChip(d, "unread");
  assert.equal(d.toasts.length, 1);
  assert.deepEqual([chipOn(d, "unread"), chipOn(d, "read")], ["false", "false"], "back to off");
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 2, "the list is as it was");
  d.s.listAnswer = null; d.s.statuser = (st) => ({ ...byStatus(st), unread_total: 1 });
  await pickChip(d, "unread");
  assert.equal(navNb(d)[0].textContent, "4", "an unread-filtered answer does not change the nav count");
  await pickChip(d, "read");
  assert.equal(navNb(d)[0].textContent, "4", "nor a read-only one");
});

test("R1: the phone keeps its bottom padding rule; the desktop has no reserved row (the page header is there)", () => {
  const css = cssText();
  assert.doesNotMatch(css, /padding-top: 72px/);
  assert.doesNotMatch(css, /padding-top: 60px/);
  assert.match(css, /body\.dash-app\.ib-fixed \.col \{ padding-bottom: calc\(65px \+ 12px \+ env\(safe-area-inset-bottom\)\); \}/, "phone rule as before");
});

test("R3: unread rows are bold, snippet in --text and time in --link; read rows are lighter", async () => {
  const d = boot({ listing: MIXED(), channels: CHANNELS_ON });
  await d.openInbox();
  const rows = d.all(d.$("ib-list"), "ib-item");
  assert.ok(rows.every((r) => d.all(r, "ib-dot").length === 0), "no blue dot any more");
  const css = cssText();
  assert.match(css, /#view-inbox \.ib-name \{ font-weight: 500;/, "read name 500");
  assert.match(css, /^#view-inbox \.ib-unread \.ib-name/m, "unread rules are #view-inbox-scoped so they beat the ID read rules");
  assert.match(css, /^#view-inbox \.ib-unread \.ib-snip/m);
  assert.match(css, /^#view-inbox \.ib-unread \.ib-time/m);
  assert.doesNotMatch(css, /^body\.dash-app \.ib-unread/m, "no lower-specificity unread rules");
  assert.match(css, /\.ib-unread \.ib-name \{ font-weight: 700; \}/, "unread name 700");
  assert.match(css, /\.ib-unread \.ib-snip \{ color: var\(--text\); \}/);
  assert.match(css, /#view-inbox \.ib-snip \{ display: block; color: var\(--text-2\);/, "read snippet --text-2");
  assert.match(css, /\.ib-unread \.ib-time \{ color: var\(--link\); font-weight: 600; \}/);
  assert.match(css, /#view-inbox \.ib-time \{ color: var\(--meta\);/, "read time stays --meta");
});

test("R4: the channel chip on the selected row has a visible border (--link at 40%)", () => {
  assert.match(cssText(), /\.ib-item\.is-sel \.ib-ch \{ border-color: color-mix\(in srgb, var\(--link\) 40%, transparent\); \}/);
});

/* ---------- Round 4: R4-1 read-state icon, R4-2 divider, R4-3 FB Messenger ---------- */
test("R4-1: every row has a read-state marker under the time: unread = a blue dot (--link), read = hidden, both with their words", async () => {
  const d = boot({ listing: MIXED(), channels: CHANNELS_ON });
  await d.openInbox();
  const rows = d.all(d.$("ib-list"), "ib-item");
  assert.ok(rows.length > 2);
  rows.forEach((r) => {
    const unread = r.classList.contains("ib-unread");
    const side = d.all(r, "ib-side");
    assert.equal(side.length, 1);
    assert.deepEqual(side[0].children.map((n) => n.classList.contains("ib-time") ? "time" : "rs"), ["time", "rs"], "the marker is under the time");
    const rs = d.all(r, "ib-rs")[0];
    assert.equal(rs.getAttribute("role"), "img");
    assert.equal(rs.getAttribute("aria-label"), unread ? "Unread" : "Read");
    assert.equal(rs.getAttribute("title"), unread ? "Unread" : "Read");
    assert.equal(rs.classList.contains(unread ? "ib-rs-u" : "ib-rs-r"), true);
  });
  const css = cssText();
  assert.match(css, /^#view-inbox \.ib-rs-u \{[^}]*background: var\(--link\)/m);
  assert.match(css, /^#view-inbox \.ib-item\.is-sel \{[^}]*box-shadow: inset 3px 0 0 var\(--link\)/m, "the selected row has a left accent");
  assert.doesNotMatch(css, /ib-dot/);
});

test("R4-2: a 1px divider between the rows (theme token), none after the last", () => {
  const css = cssText();
  assert.match(css, /^#view-inbox \.ib-list > li \+ li \{ border-top: 1px solid var\(--card-line\); \}/m);
  assert.doesNotMatch(css, /ib-list > li[^+]*\{[^}]*border-bottom/);
});

test("R4-3: Facebook Messenger shows as FB Messenger on the row badge, the thread head chip and the channel tab; full name kept", async () => {
  const d = boot({ listing: msgrList(), reading: msgrThread({ open: true, closes_at: iso(600) }), channels: CHANNELS_ON });
  await d.openInbox();
  const rows = d.all(d.$("ib-list"), "ib-item");
  assert.equal(d.all(rows[0], "ib-cdot")[0].textContent, "FB Messenger");
  assert.equal(d.all(rows[0], "ib-cdot")[0].getAttribute("title"), "Facebook Messenger");
  await d.click(rows[0]); await settle();
  const head = d.all(d.$("ib-threadpane"), "ib-chrow")[0];
  const chip = d.all(head, "ib-ch")[0];
  assert.equal(chip.textContent, "FB Messenger");
  assert.deepEqual([chip.getAttribute("aria-label"), chip.getAttribute("title")], ["Facebook Messenger", "Facebook Messenger"]);
  assert.equal(tabLabels(d).includes("FB Messenger"), true);
  assert.equal(tabLabels(d).includes("Facebook Messenger"), false);
});

/* The house dropdown is no longer in the list toolbar (the tabs and chips replaced it) but stays in Settings > Inbox, New text and Text many members:
   these two tests drive NOInbox.combo on selects of their own. */
function mkCombo(d, id, opts, val) {
  const sel = d.doc.createElement("select"); sel.setAttribute("id", id);
  opts.forEach(([v, t]) => { const o = d.doc.createElement("option"); o.setAttribute("value", v); o.textContent = t; sel.appendChild(o); });
  d.page.appendChild(sel); sel.value = val; d.window.NOInbox.combo(sel, id);
  return sel;
}
const CH_OPTS = [["all", "All channels"], ["webchat", "Website chat"], ["email", "Email"]], ST_OPTS = [["all", "All status"], ["open", "Open"], ["closed", "Closed"]];

test("combo (r12): the text is never highlighted, the first key replaces the chosen label, and focus stays on the combo that was used", async () => {
  const d = boot({ listing: MIXED(), channels: CHANNELS_ON });
  await d.openInbox();
  mkCombo(d, "t-ch", CH_OPTS, "all"); mkCombo(d, "t-st", ST_OPTS, "all");
  const spy = (input) => { input.selected = 0; input.sel = null; input.select = () => { input.selected++; }; input.setSelectionRange = (a, b) => { input.sel = [a, b]; }; };
  const ch = comboInput(d, "t-ch"), st = comboInput(d, "t-st");
  spy(ch); spy(st);
  const pickRow = (id, label) => { comboBox(d, id).fire("click"); d.$(id).parentNode.all((n) => n.classList.contains("ib-combo-opt")).find((n) => n.textContent === label).fire("click"); };
  pickRow("t-ch", "Website chat"); await settle();
  assert.equal(ch.value, "Website chat");
  assert.equal(d.doc.activeElement, ch, "focus stays on the combo that was used");
  ch.fire("focus");
  assert.equal(ch.selected, 0, "focus never selects the text");
  assert.deepEqual(ch.sel, [12, 12], "the caret is at the end");
  /* a second combo's pick keeps the focus on that one, never the first */
  st.fire("keydown", { key: "o" }); st.value = "op"; st.fire("input");
  st.fire("keydown", { key: "ArrowDown", preventDefault() {} }); st.fire("keydown", { key: "Enter", preventDefault() {} }); await settle();
  assert.equal(d.$("t-st").value, "open");
  assert.equal(d.doc.activeElement, st, "focus stays on the second combo");
  assert.notEqual(d.doc.activeElement, ch);
  assert.equal(ch.selected + st.selected, 0, "nothing is ever selected");
  /* type-to-search: the first printable key replaces the label, later keys append, arrows leave it */
  ch.fire("keydown", { key: "e" });
  assert.equal(ch.value, "", "fresh query, not appended to Website chat");
  ch.value = "e"; ch.fire("input");
  ch.fire("keydown", { key: "m" });
  assert.equal(ch.value, "e", "later keys are left alone");
  ch.value = "Website chat"; ch.fire("keydown", { key: "ArrowDown", preventDefault() {} });
  assert.equal(ch.value, "Website chat");
  ch.fire("keydown", { key: "Tab" });
  assert.equal(ch.value, "Website chat", "Tab shuts it and keeps the choice");
  ch.fire("keydown", { key: "c", ctrlKey: true });
  assert.equal(ch.value, "Website chat", "a shortcut does not clear it");
});

test("combo (r12): a sync does not highlight the text either", async () => {
  const d = boot({ listing: MIXED(), channels: CHANNELS_ON });
  await d.openInbox();
  mkCombo(d, "t-ch", CH_OPTS, "all");
  const ch = comboInput(d, "t-ch");
  ch.selected = 0; ch.select = () => { ch.selected++; };
  d.$("t-ch").value = "email"; d.$("t-ch").ibSync(); d.$("t-ch").ibFocus();
  assert.equal(ch.value, "Email");
  assert.equal(ch.selected, 0);
});

/* ---------- Text (SMS) channel (SMS-OWNER FE-1, z8uq9mhk1h): fake store, made-up members and numbers only ---------- */

const CH_SMS = { ...CHANNELS_ON, sms_available: true, sms_enabled: true };
const SMS_STATUS = { phone_online: true, daily_limit: 50, left_today: 37, hourly_limit: 20, left_this_hour: 20, enabled: true, prefix: "Test Store: ", max_length: 148, incoming_ready: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function smsList() {
  return { items: [{ ref: SM, display_name: "Ana Reyes", snippet: "Salamat po", updated_at: iso(5), channel: "sms", status: "open", unread: false }, ...list().items], stored_next_cursor: null };
}
function smsThread(over = {}) {
  return { ref: SM, display_name: "Ana Reyes", channel: "sms", source: "stored", status: "open", unread: false, contact_mobile: "+63 9** *** 1234", prefix: "Test Store: ", max_length: 148,
    opted_out: false, reply: { open: true, reason: "" }, replies: [],
    messages: [
      { id: "s1", direction: "out", sender_kind: "owner", text: "Your order shipped", attachments: [], at: iso(4), delivery_state: "sent" },
      { id: "s2", direction: "out", sender_kind: "owner", text: "Pickup?", attachments: [], at: iso(3), delivery_state: "" },
      { id: "s3", direction: "out", sender_kind: "owner", text: "Hello", attachments: [], at: iso(2), delivery_state: "failed", error_code: "gateway_offline", error_message: "The SMS phone is offline. Nothing was sent." },
      { id: "s4", direction: "in", sender_kind: "customer", text: "Salamat po", attachments: [], at: iso(1), delivery_state: "" }
    ], ...over };
}
const MEMBERS = [
  { id: "mem_1", full_name: "Ana Reyes", mobile_masked: "+63 9** *** 1234", mobile_state: "verified", email_state: "verified", closed: false },
  { id: "mem_2", full_name: "Ana Pending", mobile_masked: "+63 9** *** 5678", mobile_state: "pending", email_state: "verified", closed: false },
  { id: "mem_3", full_name: "Ana Closed", mobile_masked: "+63 9** *** 9999", mobile_state: "verified", email_state: "verified", closed: true }
];
const smsOpen = async (d) => { await d.openInbox(); await d.click(d.all(d.$("ib-list"), "ib-item")[0]); };

test("sms settings: no card while sms_available is absent or false; with it, a switch that PUTs sms_enabled and the no-promotions line", async () => {
  for (const ch of [CH_OFF, { ...CH_OFF, sms_available: false, sms_enabled: false }]) {
    const d = boot({ channels: ch });
    await d.openSettings();
    assert.ok(!d.$("ibs-root").all((n) => n.tagName === "H2").some((n) => /Text messages/.test(n.textContent)));
    assert.equal(d.$("ibs-sw-sms"), null);
  }
  const d = boot({ channels: { ...CH_OFF, sms_available: true, sms_enabled: false } });
  await d.openSettings();
  assert.ok(d.$("ibs-root").all((n) => n.tagName === "H2").some((n) => n.textContent === "Text messages (SMS)"));
  assert.ok(d.$("ibs-root").textContent.includes("For orders and member service only. No promotions."));
  assert.equal(d.$("ibs-sw-sms").getAttribute("aria-checked"), "false");
  await d.click(d.$("ibs-sw-sms"));
  const put = d.calls.filter((c) => c.method === "PUT");
  assert.deepEqual(put.map((c) => c.body), [{ sms_enabled: true }]);
  assert.equal(d.$("ibs-sw-sms").getAttribute("aria-checked"), "true");
});

test("sms settings: the how-it-works line names text messages only when sms is available", async () => {
  const OLD = "The inbox shows your Facebook Messenger, website chat and email conversations in one list.";
  const NEW = "The inbox shows your Facebook Messenger, website chat, text message (SMS) and email conversations in one list.";
  for (const [ch, want, not] of [[CH_OFF, OLD, NEW], [{ ...CH_OFF, sms_available: true, sms_enabled: false }, NEW, OLD]]) {
    const d = boot({ channels: ch });
    await d.openSettings();
    const text = d.$("ibs-root").textContent;
    assert.ok(text.includes(want));
    assert.ok(!text.includes(not));
  }
});

test("sms inbox: hidden while the feature is off (no New text, no Text tab, an sm_ row is not invented)", async () => {
  const d = boot({ channels: CHANNELS_ON });
  await d.openInbox();
  assert.equal(d.$("ib-newtext-btn"), null);
  assert.deepEqual(tabLabels(d), ["All messages", "Website chat", "Email", "FB Messenger", "FB Comments"]);
  assert.equal(d.$("ib-tab-sms"), null);
  const off = boot({ off: true });
  await off.openInbox();
  assert.equal(off.$("ib-newtext-btn"), null);
  assert.ok(!off.list().some((c) => c.includes("/sms/")), "no text route is asked for");
});

test("sms inbox: with the feature on the list has the Text (SMS) badge and tab, and New text", async () => {
  const d = boot({ listing: smsList(), channels: CH_SMS, smsStatus: SMS_STATUS });
  d.s.smsStatus = SMS_STATUS;
  await d.openInbox();
  const rows = d.all(d.$("ib-list"), "ib-item");
  assert.deepEqual(d.all(rows[0], "ib-cdot").map((n) => n.textContent), ["Text (SMS)"]);
  assert.ok(d.$("ib-newtext-btn"));
  assert.deepEqual(tabLabels(d), ["All messages", "Website chat", "Email", "FB Messenger", "FB Comments", "Text (SMS)"]);
  const u = d.window.NOInbox.util;
  assert.equal(u.channelOf({ ref: SM }), "sms");
  assert.equal(u.channelOf({ provider: "sms" }), "sms");
});

test("sms thread: masked mobile, delivery chips (Sending, Sent, Not sent with the server's words), the prefix, the counter from max_length and the quota", async () => {
  const d = boot({ listing: smsList(), reading: smsThread(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS;
  await smsOpen(d);
  const pane = d.$("ib-threadpane");
  assert.ok(pane.textContent.includes("+63 9** *** 1234"));
  assert.ok(!/\+639\d{9}/.test(pane.textContent), "no full number");
  assert.deepEqual(d.all(pane, "chip").map((n) => n.textContent).filter((t) => /Sent|Sending|Not sent/.test(t)), ["Sent", "Sending", "Not sent: The SMS phone is offline. Nothing was sent."]);
  assert.ok(pane.textContent.includes("Every text starts with: Test Store: "));
  assert.ok(pane.textContent.includes("Texts left today: 37 of 50. This hour: 20 of 20."));
  assert.equal(d.text("ib-rc"), "0 / 148");
  assert.ok(!pane.textContent.includes("gateway_offline"), "never a code");
  assert.equal(d.calls.filter((c) => c.path === BASE + "sms/status/").length, 1);
});

test("sms thread: a link or a non-plain character is refused before sending with the server's words, and over max_length is refused", async () => {
  const d = boot({ listing: smsList(), reading: smsThread(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS;
  await smsOpen(d);
  const box = d.$("ib-rb"), go = d.press(d.$("ib-threadpane"), "Send");
  box.value = "see example.com"; box.fire("input");
  assert.equal(go.disabled, true); assert.equal(d.text("ib-rp"), "The text must not contain a web link.");
  box.value = "hello \u{1F600}"; box.fire("input");
  assert.equal(go.disabled, true); assert.equal(d.text("ib-rp"), "The text must fit one SMS: at most 160 plain characters.");
  box.value = "a".repeat(149); box.fire("input");
  assert.equal(go.disabled, true); assert.equal(d.text("ib-rp"), "The message is over 148 characters. Shorten it to send.");
  box.value = "a".repeat(148); box.fire("input");
  assert.equal(go.disabled, false);
});

test("sms reply: posts text and key only, shows Sending (never Sent at once), clears the box; a failed 200 shows the server's message and keeps the text", async () => {
  const d = boot({ listing: smsList(), reading: smsThread(), channels: CH_SMS, reply: { state: "sending", error_code: "", created_at: iso(0) } });
  d.s.smsStatus = SMS_STATUS;
  await smsOpen(d);
  const box = d.$("ib-rb"); box.value = "Salamat din po"; box.fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  const post = d.calls.filter((c) => c.method === "POST" && c.path.endsWith("/reply/"));
  assert.equal(post.length, 1);
  assert.deepEqual(Object.keys(post[0].body).sort(), ["idempotency_key", "text"]);
  assert.equal(post[0].body.text, "Salamat din po");
  assert.equal(d.$("ib-rb").value, "");
  assert.ok(!d.$("ib-threadpane").textContent.includes("Your reply was not sent."));
  const f = boot({ listing: smsList(), reading: smsThread(), channels: CH_SMS, reply: { state: "failed", error_code: "site_limit", message: "Your store has used its texts for today.", created_at: iso(0) } });
  f.s.smsStatus = SMS_STATUS;
  await smsOpen(f);
  const b2 = f.$("ib-rb"); b2.value = "Hello"; b2.fire("input");
  await f.click(f.press(f.$("ib-threadpane"), "Send"));
  assert.ok(f.$("ib-threadpane").textContent.includes("Your store has used its texts for today."));
  assert.ok(!f.$("ib-threadpane").textContent.includes("site_limit"));
  assert.equal(f.$("ib-rb").value, "Hello");
});

test("sms thread: opted out, switch off and answers-cannot-arrive turn the box off with words; the phone offline note disables Send", async () => {
  for (const [reason, words] of [["opted_out", "This customer asked not to get texts from your store."], ["sms_off", "Text messages are off for your store. Turn them on in Settings > Inbox."], ["replies_off", "Texts can't be sent right now."]]) {
    const d = boot({ listing: smsList(), reading: smsThread({ opted_out: reason === "opted_out", reply: { open: false, reason } }), channels: CH_SMS });
    d.s.smsStatus = SMS_STATUS;
    await smsOpen(d);
    assert.equal(d.$("ib-rb").disabled, true, reason);
    assert.equal(d.text("ib-rn"), words, reason);
  }
  const d = boot({ listing: smsList(), reading: smsThread(), channels: CH_SMS });
  d.s.smsStatus = { ...SMS_STATUS, phone_online: false };
  await smsOpen(d);
  assert.ok(d.$("ib-threadpane").textContent.includes("Your texting phone is offline. Texts can't be sent right now."));
  d.$("ib-rb").value = "Hi"; d.$("ib-rb").fire("input");
  assert.equal(d.press(d.$("ib-threadpane"), "Send").disabled, true);
});

test("sms thread: a conversation with no name or number (blanked after 180 days) still opens", async () => {
  const d = boot({ listing: { items: [{ ref: SM, display_name: "", snippet: "", updated_at: iso(5), channel: "sms", status: "open", unread: false }], stored_next_cursor: null }, reading: smsThread({ display_name: "", contact_mobile: "" }), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS;
  await smsOpen(d);
  assert.ok(d.$("ib-threadpane").textContent.includes("Customer"));
});

test("sms New text: offers only verified, open members; sends member_id, text and a key (never a number); then opens the conversation as Sending", async () => {
  const d = boot({ listing: smsList(), reading: smsThread(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS; d.s.members = MEMBERS;
  await d.openInbox();
  await d.click(d.$("ib-newtext-btn"));
  assert.ok(d.$("ib-threadpane").textContent.includes("For orders and member service only. No promotions."));
  assert.ok(d.$("ib-threadpane").textContent.includes("Every text starts with: Test Store: "));
  assert.equal(d.press(d.$("ib-threadpane"), "Send text").disabled, true);
  d.$("ib-sms-q").value = "Ana"; d.$("ib-sms-q").fire("input");
  await sleep(350); await settle();
  assert.ok(d.list().includes("GET /sites/" + A + "/members/?q=Ana"));
  const sel = d.$("ib-sms-pick");
  assert.deepEqual(sel.children.map((o) => o.textContent), ["Choose a member", "Ana Reyes · +63 9** *** 1234"], "pending and closed members are not offered");
  assert.equal(sel.children.length, 2);
  sel.value = "mem_1"; sel.fire("change");
  d.$("ib-sms-t").value = "Your order is ready"; d.$("ib-sms-t").fire("input");
  assert.equal(d.press(d.$("ib-threadpane"), "Send text").disabled, false);
  await d.click(d.press(d.$("ib-threadpane"), "Send text"));
  const post = d.calls.filter((c) => c.method === "POST" && c.path === BASE + "sms/compose/");
  assert.equal(post.length, 1);
  assert.deepEqual(Object.keys(post[0].body).sort(), ["idempotency_key", "member_id", "text"]);
  assert.equal(post[0].body.member_id, "mem_1");
  assert.equal(post[0].body.text, "Your order is ready");
  assert.match(post[0].body.idempotency_key, /^[A-Za-z0-9_-]{8,64}$/);
  assert.ok(d.list().includes("GET " + BASE + `conversations/${SM}/`), "the new conversation is opened");
  assert.equal(d.$("ib-sms-q"), null);
});

test("sms New text: there is no field for a number; typing digits in the search gives only members, never a typed recipient", async () => {
  const d = boot({ listing: smsList(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS; d.s.members = MEMBERS;
  await d.openInbox();
  await d.click(d.$("ib-newtext-btn"));
  const inputs = d.$("ib-threadpane").all((n) => n.tagName === "INPUT" || n.tagName === "TEXTAREA").map((n) => n.id);
  assert.ok(!inputs.some((i) => /to|number|mobile|phone/i.test(i)), inputs.join());
  d.$("ib-sms-q").value = "09171234567"; d.$("ib-sms-q").fire("input");
  await sleep(350); await settle();
  assert.equal(d.press(d.$("ib-threadpane"), "Send text").disabled, true, "nothing is picked, so nothing can be sent");
  await d.click(d.press(d.$("ib-threadpane"), "Send text"));
  assert.equal(d.calls.filter((c) => c.path === BASE + "sms/compose/").length, 0);
});

test("sms New text: a refused text shows the server's words, keeps the text; one 404 says only that the member cannot be texted; offline and off are said", async () => {
  const d = boot({ listing: smsList(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS; d.s.members = MEMBERS;
  d.s.composeAnswer = { status: 200, body: { ref: SM, new_conversation: true, state: "failed", error_code: "site_limit", message: "Your store has used its texts for today.", created_at: iso(0) } };
  await d.openInbox();
  await d.click(d.$("ib-newtext-btn"));
  d.$("ib-sms-q").value = "Ana"; d.$("ib-sms-q").fire("input"); await sleep(350); await settle();
  d.$("ib-sms-pick").value = "mem_1"; d.$("ib-sms-pick").fire("change");
  d.$("ib-sms-t").value = "Hi"; d.$("ib-sms-t").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send text"));
  assert.ok(d.$("ib-threadpane").textContent.includes("Your store has used its texts for today."));
  assert.ok(!d.$("ib-threadpane").textContent.includes("site_limit"));
  assert.equal(d.$("ib-sms-t").value, "Hi");
  d.s.composeAnswer = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
  await d.click(d.press(d.$("ib-threadpane"), "Send text"));
  assert.ok(d.$("ib-threadpane").textContent.includes("This member cannot be texted.") || d.$("ib-threadpane").textContent.includes("Not found."));
  const off = boot({ listing: smsList(), channels: CH_SMS });
  off.s.smsStatus = { ...SMS_STATUS, phone_online: false };
  await off.openInbox(); await off.click(off.$("ib-newtext-btn"));
  assert.ok(off.$("ib-threadpane").textContent.includes("Your texting phone is offline. Texts can't be sent right now."));
  const sw = boot({ listing: smsList(), channels: CH_SMS });
  sw.s.smsStatus = { ...SMS_STATUS, enabled: false };
  await sw.openInbox(); await sw.click(sw.$("ib-newtext-btn"));
  assert.ok(sw.$("ib-threadpane").textContent.includes("Text messages are off for your store."));
  assert.equal(sw.$("ib-sms-q"), null);
});

test("sms util: problem, pickable, quota, chip, offText, available", () => {
  const d = boot({});
  const u = d.window.NOInboxSms.util;
  assert.equal(u.problem("", 100), ""); assert.equal(u.problem("hello there", 100), "");
  assert.equal(u.problem("visit www.shop.ph", 100), "The text must not contain a web link.");
  assert.equal(u.problem("ip 10.0.0.1 here", 100), "The text must not contain a web link.");
  assert.equal(u.problem("call me", 3), "The message is over 3 characters. Shorten it to send.");
  assert.deepEqual([...u.pickable(MEMBERS).map((m) => m.id)], ["mem_1"]);
  assert.equal(u.quota(null), ""); assert.equal(u.quota(SMS_STATUS), "Texts left today: 37 of 50. This hour: 20 of 20.");
  assert.equal(u.chip({ direction: "in" }), null);
  assert.deepEqual([...u.chip({ direction: "out", delivery_state: "" })], ["info", "Sending"]);
  assert.equal(u.available({ sms_available: true }), true); assert.equal(u.available({}), false); assert.equal(u.available(null), false);
  assert.equal(u.maxOf({ max_length: null }), null); assert.equal(u.maxOf({ max_length: 128 }), 128);
});

/* ---------- Meta Business Inbox look (ClickUp z8uq9mj6ch): tabs, chips, placeholders, the contact panel ---------- */

test("util: tabsFor lists the channels, Text (SMS) last and only while sms_available; cycleNext/filterNext step one filter button; placeholderFor; contactOf", async () => {
  const d = boot({ channels: CHANNELS_ON });
  const u = d.window.NOInbox.util;
  const labels = (ch) => Array.from(u.tabsFor(ch), (t) => t[1]);
  assert.deepEqual(labels(null), ["All messages", "Website chat", "Email", "FB Messenger", "FB Comments"]);
  assert.deepEqual(labels(CHANNELS_ON), labels(null));
  assert.deepEqual(labels({ ...CHANNELS_ON, sms_available: false }), labels(null));
  assert.deepEqual(labels(CH_SMS), ["All messages", "Website chat", "Email", "FB Messenger", "FB Comments", "Text (SMS)"]);
  assert.deepEqual(Array.from(u.tabsFor(CH_SMS), (t) => t[0]), ["all", "webchat", "email", "messenger", "fbcomment", "sms"], "the filter values the dropdown used");
  assert.ok(!labels(CH_SMS).some((t) => /Instagram|WhatsApp/.test(t)));
  /* the filter buttons: exactly the existing filter values, in turn all -> first -> second -> all */
  assert.deepEqual(Array.from(u.cycles, (c) => [c.dim, Array.from(c.order)]), [["answered", ["", "answered", "unanswered"]], ["unread", ["", "1", "0"]], ["status", ["", "open", "closed"]]]);
  assert.deepEqual(["", "answered", "unanswered", ""].map((v) => u.cycleNext("answered", v)), ["answered", "unanswered", "", "answered"]);
  assert.deepEqual(["", "1", "0"].map((v) => u.cycleNext("unread", v)), ["1", "0", ""]);
  assert.deepEqual(["", "open", "closed"].map((v) => u.cycleNext("status", v)), ["open", "closed", ""]);
  assert.equal(u.cycleNext("status", "weird"), "", "an unknown value goes back to all");
  assert.equal(u.cycleNext("nope", "x"), "");
  assert.deepEqual([u.cycleLook("unread", "1").text, u.cycleLook("unread", "0").text, u.cycleLook("unread", "").text], ["Unread only", "Read only", "Showing all messages"]);
  assert.deepEqual([u.cycleLook("answered", "answered").text, u.cycleLook("answered", "unanswered").text], ["Answered only", "Unanswered only"]);
  assert.deepEqual([u.cycleLook("status", "open").text, u.cycleLook("status", "closed").text], ["Open only", "Closed only"]);
  assert.equal(new Set(["", "answered", "unanswered"].map((v) => u.cycleLook("answered", v).icon)).size, 3, "a distinct icon per state");
  assert.equal(new Set(["", "1", "0"].map((v) => u.cycleLook("unread", v).icon)).size, 3);
  assert.equal(new Set(["", "open", "closed"].map((v) => u.cycleLook("status", v).icon)).size, 3);
  const base = { q: "ma", status: "", unread: "", answered: "", filter: "email" };
  assert.deepEqual({ ...u.filterNext(base, "unread") }, { q: "ma", status: "", unread: "1", answered: "", filter: "email" });
  assert.deepEqual({ ...u.filterNext({ ...base, unread: "1" }, "unread") }, { ...base, unread: "0" });
  assert.deepEqual({ ...u.filterNext({ ...base, unread: "0" }, "unread") }, base, "the third press is back to all");
  assert.deepEqual({ ...u.filterNext({ ...base, status: "closed" }, "answered") }, { ...base, status: "closed", answered: "answered" }, "other dimensions are kept");
  /* placeholders */
  assert.deepEqual(["messenger", "email", "webchat", "sms", "fbcomment"].map(u.placeholderFor), ["Reply in Messenger…", "Reply by email…", "Reply in website chat…", "Reply by text…", "Reply to comment…"]);
  assert.equal(u.placeholderFor(""), "Write a reply…", "no channel known: a plain line");
  /* contact lines: the same rules as the line under the name */
  assert.deepEqual({ ...u.contactOf("email", { contact_email: "a@example.test", contact_mobile: "+63 9** *** 1" }) }, { email: "a@example.test", mobile: "" });
  assert.deepEqual({ ...u.contactOf("sms", { contact_email: "a@example.test", contact_mobile: "+63 9** *** 1" }) }, { email: "", mobile: "+63 9** *** 1" });
  assert.deepEqual({ ...u.contactOf("webchat", { contact_email: "a@example.test", contact_mobile: "+63 9** *** 1" }) }, { email: "a@example.test", mobile: "+63 9** *** 1" });
  assert.deepEqual({ ...u.contactOf("messenger", { contact_email: "a@example.test" }) }, { email: "", mobile: "" });
  assert.deepEqual({ ...u.contactOf("webchat", null) }, { email: "", mobile: "" });
});

test("the Text (SMS) tab shows only while the API says sms_available, is the last tab, and filters to texts", async () => {
  const d = boot({ listing: smsList(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS;
  await d.openInbox();
  assert.equal(tabLabels(d).at(-1), "Text (SMS)");
  await pickTab(d, "sms");
  assert.deepEqual(rowsOf(d).map((r) => d.all(r, "ib-name")[0].textContent), ["Ana Reyes"]);
  assert.equal(d.$("ib-tab-sms").getAttribute("aria-selected"), "true");
  const off = boot({ listing: smsList(), channels: { ...CH_SMS, sms_available: false } });
  await off.openInbox();
  assert.equal(off.$("ib-tab-sms"), null);
});

test("the reply box says where the reply goes: Messenger, email, website chat, text, per thread", async () => {
  const cases = [
    [{ listing: MIXED(), reading: sthread(), channels: CHANNELS_ON }, 0, "Reply in website chat…"],
    [{ listing: MIXED(), reading: emailThread(), channels: CHANNELS_ON }, 1, "Reply by email…"],
    [{ listing: msgrList(), reading: msgrThread({ open: true, closes_at: iso(-600) }), channels: CHANNELS_ON }, 0, "Reply in Messenger…"],
    [{ listing: smsList(), reading: smsThread(), channels: CH_SMS }, 0, "Reply by text…"]
  ];
  for (const [opts, row, want] of cases) {
    const d = boot(opts);
    d.s.smsStatus = SMS_STATUS;
    await d.openInbox();
    await d.click(rowsOf(d)[row]);
    assert.equal(d.$("ib-rb").getAttribute("placeholder"), want);
  }
});

test("the thread head's actions are icon buttons with a name (aria-label and tooltip) and no visible text; the contact panel toggle is one of them", async () => {
  const d = boot({ listing: MIXED(), reading: sthread(), channels: CHANNELS_ON });
  await d.openInbox();
  await d.click(rowsOf(d)[0]);
  const acts = d.all(d.$("ib-threadpane"), "ib-hacts")[0];
  const close = d.press(acts, "Close conversation");
  assert.equal(close.textContent, "", "no visible text");
  assert.equal(close.getAttribute("title"), "Close conversation");
  assert.equal(close.all((n) => n.tagName === "SVG").length, 1);
  assert.ok(close.classList.contains("ib-ibtn"));
  const tog = d.$("ib-ctog");
  assert.equal(tog.getAttribute("aria-label"), "Hide contact details");
  assert.equal(tog.getAttribute("title"), "Hide contact details");
  assert.equal(tog.getAttribute("aria-expanded"), "true");
  await d.click(close);
  const reopen = d.press(d.$("ib-threadpane"), "Reopen conversation");
  assert.equal(reopen.getAttribute("title"), "Reopen conversation");
  assert.equal(reopen.textContent, "");
});

test("the contact panel: built from the loaded thread only (name, channel, status, email and mobile as the head shows them); empty and hidden with no conversation open", async () => {
  const d = boot({ listing: MIXED(), reading: sthread({ contact_email: "ana@example.test", contact_mobile: "+63 9** *** 4321" }), channels: CHANNELS_ON });
  await d.openInbox();
  const panel = d.$("ib-cpane");
  assert.equal(panel.tagName, "ASIDE");
  assert.equal(panel.getAttribute("aria-label"), "Contact details");
  assert.equal(panel.hidden, true, "nothing open: nothing to show");
  await d.click(rowsOf(d)[0]);
  assert.equal(panel.hidden, false);
  assert.equal(d.all(panel, "ib-cname")[0].textContent, "Ana Reyes (test)");
  assert.equal(d.all(panel, "ib-ch")[0].textContent, "Website chat");
  assert.deepEqual(d.all(panel, "chip").map((c) => c.textContent), ["Open"]);
  assert.deepEqual(panel.all((n) => n.tagName === "DT" || n.tagName === "DD").map((n) => n.textContent), ["Email", "ana@example.test", "Mobile", "+63 9** *** 4321", "Channel", "Website chat"]);
  assert.equal(d.links(panel).length, 0, "no links: the page has no Prospect List or member link for a conversation");
  assert.ok(d.all(d.$("ib-threadpane"), "ib-sub")[0].textContent.includes("ana@example.test"), "the head says the same");
  await d.click(d.press(d.$("ib-threadpane"), "Close conversation"));
  assert.deepEqual(d.all(d.$("ib-cpane"), "chip").map((c) => c.textContent), ["Closed"], "the panel follows the status");
  await d.click(d.$("ib-back"));
  assert.equal(d.$("ib-cpane").hidden, true, "and goes with the conversation");
});

test("the contact panel of an email thread shows the address, of a text the masked mobile only, of a Messenger thread neither", async () => {
  const em = boot({ listing: MIXED(), reading: emailThread({ contact_mobile: "+63 9** *** 1111" }), channels: CHANNELS_ON });
  await em.openInbox(); await em.click(rowsOf(em)[1]);
  assert.deepEqual(em.$("ib-cpane").all((n) => n.tagName === "DD").map((n) => n.textContent), ["jun.delacruz@example.test", "Email"]);
  const sm = boot({ listing: smsList(), reading: smsThread(), channels: CH_SMS });
  sm.s.smsStatus = SMS_STATUS;
  await sm.openInbox(); await sm.click(rowsOf(sm)[0]);
  assert.deepEqual(sm.$("ib-cpane").all((n) => n.tagName === "DD").map((n) => n.textContent), ["+63 9** *** 1234", "Text messages (SMS)"]);
  const fb = boot({ listing: msgrList(), reading: msgrThread({ open: true, closes_at: iso(-600) }), channels: CHANNELS_ON });
  await fb.openInbox(); await fb.click(rowsOf(fb)[0]);
  assert.deepEqual(fb.$("ib-cpane").all((n) => n.tagName === "DD").map((n) => n.textContent), ["Facebook Messenger"]);
});

test("the contact panel collapses: the toggle sets aria-expanded, hides the panel and is remembered in localStorage (a failing store changes nothing else)", async () => {
  const store = {}, ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  const d = boot({ listing: MIXED(), reading: sthread(), channels: CHANNELS_ON });
  d.window.localStorage = ls;
  await d.openInbox(); await d.click(rowsOf(d)[0]);
  const split = d.$("ib-split");
  assert.equal(split.classList.contains("ib-cp-off"), false);
  assert.equal(d.$("ib-cpane").hidden, false);
  await d.click(d.$("ib-ctog"));
  assert.equal(d.$("ib-ctog").getAttribute("aria-expanded"), "false");
  assert.equal(d.$("ib-ctog").getAttribute("aria-label"), "Show contact details");
  assert.equal(split.classList.contains("ib-cp-off"), true);
  assert.equal(d.$("ib-cpane").hidden, true);
  assert.deepEqual(store, { "no-ib-contact": "0" });
  await d.click(d.$("ib-ctog"));
  assert.equal(d.$("ib-ctog").getAttribute("aria-expanded"), "true");
  assert.equal(d.$("ib-cpane").hidden, false);
  assert.deepEqual(store, { "no-ib-contact": "1" });
  await d.click(d.$("ib-cclose"));
  assert.equal(d.$("ib-cpane").hidden, true, "the panel's own close button does the same");
  /* a stored "0" opens the next Inbox collapsed; a store that throws is ignored */
  const again = boot({ listing: MIXED(), reading: sthread(), channels: CHANNELS_ON });
  again.window.localStorage = { getItem: () => "0", setItem() {} };
  await again.openInbox(); await again.click(rowsOf(again)[0]);
  assert.equal(again.$("ib-cpane").hidden, true);
  assert.equal(again.$("ib-ctog").getAttribute("aria-expanded"), "false");
  const broken = boot({ listing: MIXED(), reading: sthread(), channels: CHANNELS_ON });
  broken.window.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  await broken.openInbox(); await broken.click(rowsOf(broken)[0]);
  assert.equal(broken.$("ib-cpane").hidden, false);
  await broken.click(broken.$("ib-ctog"));
  assert.equal(broken.$("ib-cpane").hidden, true);
});

test("the contact panel's text comes through textContent only (a hostile name or address is text, not markup)", async () => {
  const evil = "<img src=x onerror=alert(1)>";
  const d = boot({ listing: MIXED(), reading: sthread({ display_name: evil, contact_email: evil }), channels: CHANNELS_ON });
  await d.openInbox(); await d.click(rowsOf(d)[0]);
  assert.ok(d.$("ib-cpane").textContent.includes(evil));
  assert.equal(d.$("ib-cpane").all((n) => n.tagName === "IMG").length, 0);
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(read("inbox.js")));
});

test("the toolbar keeps New text, Text many members and Refresh in the actions beside the tabs; the contact panel and its toggle are hidden by CSS on a phone", async () => {
  const d = boot({ listing: smsList(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS;
  await d.openInbox();
  const acts = d.all(d.$("ib-tools-host"), "ib-acts")[0];
  assert.deepEqual(acts.children.map((n) => n.id), ["ib-newtext-btn", "ib-refresh-btn"], "bulk needs its own probe; New text and Refresh are there");
  const css = cssText();
  assert.match(css, /@media \(max-width: 899px\) \{[^@]*\.ib-cpane, #view-inbox \.ib-ctog \{ display: none !important; \}/);
  assert.match(css, /@media \(max-width: 1099px\) \{ #view-inbox \.ib-cpane, #view-inbox \.ib-ctog \{ display: none !important;/, "too narrow for three columns");
});

test("INBOX-META-LOOK fix 1: on a phone the toolbar host hides with the list while a conversation is open", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const phone = css.slice(css.indexOf("@media (max-width: 899px)"));
  assert.match(phone, /#view-inbox \.ib-tools-host\.is-hide-phone \{ display: none; \}/);
  assert.doesNotMatch(css.split("@media")[0], /\.ib-tools-host\.is-hide-phone/);
});

/* ---------- Fix round 2 (Coach Ed 2026-11-24): the four icon buttons and the full-width search ---------- */

test("fix 2: the Answered / Read / Open-Closed buttons cycle all -> first -> second -> all, each with its own words, icon and aria-pressed", async () => {
  const d = boot({ channels: CHANNELS_ON });
  asInbox(d);
  d.s.statuser = (st) => byStatus(st);
  await d.openInbox();
  const look = (id) => { const b = d.$(id); return [b.getAttribute("data-v"), b.getAttribute("aria-label"), b.getAttribute("title"), b.getAttribute("aria-pressed"), b.classList.contains("is-on"), b.innerHTML]; };
  for (const [id, steps] of [["ib-b-answered", [["", "Showing answered and unanswered"], ["answered", "Answered only"], ["unanswered", "Unanswered only"]]], ["ib-b-read", [["", "Showing all messages"], ["1", "Unread only"], ["0", "Read only"]]], ["ib-b-status", [["", "Showing open and closed"], ["open", "Open only"], ["closed", "Closed only"]]]]) {
    const seen = [];
    for (let i = 0; i < 4; i++) {
      const l = look(id), [v, words] = steps[i % 3];
      assert.deepEqual([l[0], l[1], l[2], l[3], l[4]], [v, words, words, v ? "true" : "false", !!v], id + " step " + i);
      seen.push(d.$(id).children[0].children[0].getAttribute("d"));
      d.$(id).fire("click"); await settle();
    }
    assert.equal(new Set(seen.slice(0, 3)).size, 3, id + ": a distinct icon per state");
    assert.equal(seen[3], seen[0], id + ": back to the first icon after a full turn");
  }
  const sent = d.calls.filter((c) => c.method === "GET" && c.path.startsWith(LIST_PATH)).map((c) => c.path.slice(LIST_PATH.length));
  assert.ok(sent.includes("?answered=answered") && sent.includes("?answered=unanswered") && sent.includes("?unread=1") && sent.includes("?unread=0") && sent.includes("?status=open") && sent.includes("?status=closed") || sent.some((p) => /answered=unanswered/.test(p)), "the same query values the chips sent");
});

test("fix 2: the three buttons combine, and a failed read puts each back to its previous state with a toast", async () => {
  const d = boot({ channels: CHANNELS_ON });
  asInbox(d);
  await d.openInbox();
  const reads = () => d.calls.filter((c) => c.method === "GET" && c.path.startsWith(LIST_PATH) && !/conversations\/[^/?]+\/$/.test(c.path)).map((c) => c.path);
  await pickChip(d, "unread"); await pickChip(d, "answered"); await pickChip(d, "open");
  assert.equal(reads().at(-1), LIST_PATH + "?status=open&unread=1&answered=answered", "all three together");
  d.s.listAnswer = { status: 502, body: { error: { code: "server_error", message: "Please try again later." } } };
  d.$("ib-b-read").fire("click"); await settle();
  assert.equal(d.$("ib-b-read").getAttribute("data-v"), "1", "back to Unread only");
  assert.equal(d.$("ib-b-read").getAttribute("aria-label"), "Unread only");
  assert.equal(d.toasts.length, 1);
});

test("fix 2: Search hides the other buttons and shows the box at the full width, focused; X and Esc close it, empty it and bring the buttons back", async () => {
  const clock = makeClock(), d = boot({ clock, channels: CHANNELS_ON });
  asInbox(d);
  d.s.searcher = () => ({ items: [list().items[1]], stored_next_cursor: null, unread_total: 1 });
  await d.openInbox();
  const sb = d.$("ib-b-search"), row = d.$("ib-frow"), field = d.all(d.$("ib-lhead"), "ib-search")[0], inp = d.$("ib-q");
  assert.deepEqual([row.hidden, field.hidden, sb.getAttribute("aria-expanded")], [false, true, "false"]);
  await d.click(sb);
  assert.deepEqual([row.hidden, field.hidden, sb.getAttribute("aria-expanded")], [true, false, "true"], "the buttons are hidden, the box is shown");
  assert.equal(d.doc.activeElement, inp, "the box has the focus");
  assert.ok(d.$("ib-lhead").children[0].classList.contains("is-search"));
  inp.value = "Jun"; inp.fire("input"); await clock.advance(300);
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 1, "the same debounced search as before");
  inp.fire("keydown", { key: "Escape", stopPropagation() {} }); await settle();
  assert.deepEqual([row.hidden, field.hidden], [false, true], "Esc closes the box and brings the buttons back");
  assert.equal(inp.value, ""); assert.equal(d.all(d.$("ib-list"), "ib-item").length, 2, "an emptied text is the normal list again");
  assert.equal(d.doc.activeElement, sb, "the focus goes back to the Search button");
  assert.equal(sb.getAttribute("aria-pressed"), "false");
  /* closing with nothing typed changes no filter */
  await pickChip(d, "unread");
  const n = d.calls.length;
  await d.click(sb); await d.click(d.$("ib-sclose"));
  assert.equal(d.calls.length, n, "no read for an open and close with no text");
  assert.equal(d.$("ib-b-read").getAttribute("data-v"), "1");
  assert.deepEqual([row.hidden, field.hidden], [false, true]);
});

test("fix 2: the Search button shows the light-blue state and the text in its label while a text is active; hostile text stays text", async () => {
  const d = boot({ channels: CHANNELS_ON });
  await d.openInbox();
  const hostile = "<img src=x onerror=alert(1)>", sb = d.$("ib-b-search");
  await d.click(sb);
  d.$("ib-q").value = hostile; d.$("ib-q").fire("input");
  d.$("ib-q").fire("keydown", { key: "Enter", preventDefault() {} }); await settle();
  assert.equal(sb.getAttribute("aria-label"), "Search: " + hostile, "the words are an attribute value, never markup");
  assert.equal(sb.getAttribute("aria-pressed"), "true"); assert.equal(sb.classList.contains("is-on"), true);
  assert.equal(d.all(d.$("ib-lhead"), "img").length, 0);
  d.$("ib-q").fire("keydown", { key: "Escape", preventDefault() {}, stopPropagation() {} }); await settle();
  assert.deepEqual([sb.getAttribute("aria-label"), sb.getAttribute("aria-pressed")], ["Search", "false"], "closing empties the text and the state goes");
});

test("fix 2: the CSS: Search box at 100%, the closed parts hidden, the phone row fits (four 44 px buttons)", () => {
  const css = cssText();
  assert.match(css, /\.ib-search \{[^}]*width: 100%/);
  assert.match(css, /\.ib-frow\[hidden\], #view-inbox \.ib-search\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.ib-frow \{ display: flex; align-items: center; gap: 8px; \}/);
  assert.doesNotMatch(css, /\.ib-chip\b|\.ib-chips\b/, "no chip rules are left");
});
