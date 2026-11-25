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
function boot({ contacts = false, listing = list(), reading = thread(), reply = { state: "sent", error_code: "", created_at: iso(0) }, off = false, search = "", channels = null, messenger = null, pages = null, cmStatus = null, locSearch = "", clock = null, EventSource = null, withComments = false } = {}) {
  const doc = makeDocument(), calls = [], toasts = [], replaced = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; n.dispatchEvent = (e) => n.fire(e.type); return n; };
  doc.createTextNode = (t) => { const w = make("span"); w.textContent = t; return w.firstChild; };
  const page = doc.body.appendChild(doc.createElement("div")); page.setAttribute("id", "view-inbox");
  const setBox = doc.createElement("div"); setBox.setAttribute("id", "ib-settings"); setBox.hidden = true;
  if (contacts) { const ds = doc.createElement("div"); ds.setAttribute("id", "ct-dialog-slot"); doc.body.appendChild(ds); }
  for (const id of ["ib-root", "ib-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  for (const id of ["ibs-root", "ibs-live", "ibs-sms-root", "sg-root", "sg-live", "sg-dialog-slot"]) { const n = doc.createElement("div"); n.setAttribute("id", id); if (id === "ibs-root" || id === "ibs-sms-root" || id === "sg-root") n.hidden = true; setBox.appendChild(n); }
  page.appendChild(setBox);
  const nav = [0, 1, 2].map(() => { const a = doc.createElement("a"); a.setAttribute("data-inbox-nav", ""); a.hidden = true; page.appendChild(a); return a; });
  const smsNav = [0, 1].map(() => { const a = doc.createElement("a"); a.setAttribute("data-sms-nav", ""); a.hidden = true; page.appendChild(a); return a; });
  doc.querySelectorAll = (sel) => (sel === "[data-inbox-nav]" ? nav : sel === "[data-sms-nav]" ? smsNav : []);
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
    else if (p === "/sites/" + A + "/contacts/status/" && opts.method === "GET") a = contacts ? { status: 200, body: { contacts: true, count: 1, max: 20000 } } : err(404, "not_found", "Not found.");
    else if (p === "/sites/" + A + "/contacts/groups/" && opts.method === "GET") a = { status: 200, body: s.groups || [{ id: "g1", name: "Regulars", count: 2 }, { id: "g2", name: "VIP", count: 0 }] };
    else if (/^\/sites\/[^/]+\/contacts\/\?q=/.test(p) && opts.method === "GET") a = { status: 200, body: { results: s.contactRows || [], count: (s.contactRows || []).length, next: null } };
    else if (p === "/sites/" + A + "/contacts/" && opts.method === "POST") a = s.contactPost || { status: 201, body: { id: "c9", first_name: body.first_name, last_name: body.last_name, mobile_masked: "0917 *** 2222", groups: [] } };
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
    else if (p.split("?")[0] === BASE + "unread/" && opts.method === "GET") a = s.unreadAnswer || { status: 200, body: { count: s.unread === undefined ? 0 : s.unread } };
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
  if (withComments) vm.runInContext(read("inbox-comments.js"), context, { filename: "inbox-comments.js" });
  vm.runInContext(read("inbox-settings.js"), context, { filename: "inbox-settings.js" });
  vm.runInContext(read("sms-gateway-settings.js"), context, { filename: "sms-gateway-settings.js" });
  if (contacts) vm.runInContext(read("contacts.js"), context, { filename: "contacts.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  const where = location;
  const all = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  /* an icon button (Close / Reopen conversation) has its name as the aria-label, a text button as its text */
  const press = (n, label) => buttons(n).find((b) => b.textContent === label || b.getAttribute("aria-label") === label);
  const links = (n) => n.all((x) => x.tagName === "A");
  return { doc, calls, toasts, s, where, winListeners, replaced, $, all, buttons, press, links, nav, smsNav, window, page,
    list: () => calls.map((c) => c.method + " " + c.path),
    text: (id) => $(id).textContent,
    async openSettings() { window.NOInboxSettings.show(); await settle(); },
    async openSmsSettings() { window.NOInboxSettings.show("sms"); await settle(); },
    async openInbox() { window.NOInbox.show(); await settle(); },
    async openSms() { window.NOInbox.show("sms"); await settle(); },
    async click(node) { node.fire("click"); await settle(); } };
}

/* ---------- /settings/inbox/ ---------- */

test("settings shows the channel cards (no how-it-works card), and asks only for the sites and the channels", async () => {
  const d = boot({ channels: CH_OFF });
  await d.openSettings();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE + "channels/", "GET " + BASE + "messenger/connection/"]);
  const root = d.$("ibs-root");
  assert.equal(root.getAttribute("aria-busy"), null);
  assert.deepEqual(root.all((n) => n.tagName === "H2").map((n) => n.textContent), ["Inbox channels", "Email"], "INBOX-FIX-7: no How the inbox works card");
  assert.equal(d.all(root, "mk-list").length, 0);
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
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE + "conversations/?channel=nosms&status=open", "GET " + BASE + "channels/"]);
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
  assert.ok(d.list().includes("GET " + BASE + "conversations/?channel=nosms&stored_cursor=30&status=open"));
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
  assert.ok(!/id="view-settings-inbox"/.test(HTML), "the Inbox settings view is gone: its card is the Settings tab of the Inbox page (INBOX-FIX-6)");
  for (const id of ["h-inbox", "ib-root", "ib-live", "ib-settings", "ibs-root", "ibs-live"]) assert.equal((HTML.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, id + " is in the page once");
  const navLinks = [...HTML.matchAll(/<a\b[^>]*data-inbox-nav[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(navLinks.map((a) => /href="([^"]+)"/.exec(a)[1]), ["/inbox/", "/inbox/"], "sidebar and bottom tabs (the Settings tab and the More tile for Inbox settings went with the card, INBOX-FIX-6)");
  for (const a of navLinks) assert.ok(/\shidden[\s>]/.test(a), "starts hidden: " + a);
  assert.ok(HTML.indexOf("/assets/js/inbox.js") > HTML.indexOf("/assets/js/dashboard.js"));
  assert.ok(HTML.indexOf("/assets/js/inbox-settings.js") > HTML.indexOf("/assets/js/inbox.js"));
  assert.ok(HTML.includes('/assets/css/inbox.css?v='));
  assert.ok(!/<script>[^<]/.test(HTML), "no inline script");
});

test("the router knows both addresses and calls the pages' show and hide", () => {
  const DASH = read("dashboard.js");
  assert.ok(DASH.includes('"/inbox/": { view: "inbox"'));
  assert.ok(DASH.includes('"/inbox/settings/": { view: "inbox", page: "inbox", tab: "settings"'));
  assert.ok(!/"settings-inbox"/.test(DASH), "no settings-inbox view any more");
  assert.ok(/TAB_VIEWS = \[[^\]]*"inbox"/.test(DASH));
  assert.ok(DASH.includes('"/sms/": { view: "inbox", page: "sms", nav: "sms"'), "SMS Marketing has its own route, in the inbox section");
  assert.ok(DASH.includes('IB.show(ibPage, r.tab || "")') && DASH.includes("IB.hide()") && DASH.includes("IB.setTab"));
  assert.ok(DASH.includes("window.NOInbox.probe()"));
});

test("the probe shows the Inbox links only when the channels read is not a 404", async () => {
  const on = boot({ channels: CHANNELS_ON });
  on.window.NOInbox.probe(); await settle();
  assert.deepEqual(on.nav.map((n) => n.hidden), [false, false, false]);
  assert.deepEqual(on.list(), ["GET /sites/", "GET " + BASE + "channels/", "GET " + BASE + "unread/?channel=nosms"], "and the Inbox count is read once (INBOX-UI U5), without the texts");
  assert.deepEqual(on.smsNav.map((n) => n.hidden), [true, true], "no sms_available: the SMS Marketing links stay hidden");
  const sms = boot({ channels: CH_SMS });
  sms.window.NOInbox.probe(); await settle();
  assert.deepEqual(sms.smsNav.map((n) => n.hidden), [false, false], "sms_available shows the SMS Marketing links (side nav and More sheet)");
  const off = boot({ off: true, channels: CHANNELS_ON });
  off.window.NOInbox.probe(); await settle();
  assert.deepEqual(off.nav.map((n) => n.hidden), [true, true, true]);
  assert.deepEqual(off.smsNav.map((n) => n.hidden), [true, true]);
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
const tabLabels = (d) => d.all(d.$("ib-tabs-host"), "ib-tab").map((t) => t.textContent);
const pickTab = async (d, v) => { d.$("ib-tab-" + v).fire("click"); await settle(); };
/* The filter buttons cycle (all -> first -> second -> all); `pickChip` clicks the right number of times to reach a state, `pickOff` back to all. */
const CYC = { answered: ["ib-b-answered", "answered"], unanswered: ["ib-b-answered", "unanswered"], unread: ["ib-b-read", "1"], read: ["ib-b-read", "0"], open: ["ib-b-status", "open"], closed: ["ib-b-status", "closed"] };
const ORDERS = { "ib-b-answered": ["", "unanswered", "answered"], "ib-b-read": ["", "1", "0"], "ib-b-status": ["open", "closed"] }; /* INBOX-FIX-7: Open is the default, there is no "all" */
const cycleTo = async (d, id, want) => { const o = ORDERS[id], b = d.$(id); if (want === "" && id === "ib-b-status") want = "open"; for (let n = (o.indexOf(want) - o.indexOf(b.getAttribute("data-v")) + o.length) % o.length; n > 0; n--) { b.fire("click"); await settle(); } };
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
  assert.deepEqual(tabLabels(d), ["All messages", "Website chat", "Email", "FB Messenger", "FB Comments", "Settings"]);
  const bar = d.all(d.$("ib-tabs-host"), "ib-tabs")[0];
  assert.ok(bar.classList.contains("set-tabs"), "the dash Settings menu class");
  assert.equal(bar.getAttribute("role"), "tablist");
  assert.equal(bar.getAttribute("aria-label"), "Channel");
  assert.deepEqual(d.all(bar, "ib-tab").map((t) => [t.getAttribute("role"), t.getAttribute("aria-selected"), t.getAttribute("tabindex")]), [["tab", "true", "0"], ["tab", "false", "-1"], ["tab", "false", "-1"], ["tab", "false", "-1"], ["tab", "false", "-1"], ["tab", "false", "-1"]]);
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
  assert.equal(link.getAttribute("href"), "/inbox/settings/");
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
  assert.ok(d.list().includes("GET " + BASE + "conversations/?channel=nosms&stored_cursor=1700000000000000_12&status=open") || d.list().some((c) => c.includes("stored_cursor=")), d.list().join("\n"));
});

/* ---------- Settings > Inbox channels (d6) ---------- */

const CH_OFF = { webchat_enabled: false, paused_until: null, chat_limit_reached: false, webchat_available: true };
const switchOf = (d, id) => d.$(id);

test("d6: the Inbox channels card, then Email; the web chat switch writes webchat_enabled", async () => {
  const d = boot({ channels: CH_OFF });
  await d.openSettings();
  const root = d.$("ibs-root");
  assert.deepEqual(root.all((n) => n.tagName === "H2").map((n) => n.textContent), ["Inbox channels", "Email"]);
  assert.equal(root.all((n) => n.tagName === "LI").length, 0, "the How the inbox works card is gone (INBOX-FIX-7)");
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
  assert.doesNotMatch(css.slice(css.indexOf("G3 PR3")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/var\(--ov-gold\)/g, ""), /gold|#C9A646|#D9B93F/i); /* the Bulk SMS progress card borrows the Site readiness card edge (INBOX-FIX-7); focus borders stay light blue */
  assert.match(HTML, /inbox\.js\?v=20261125f7/);
  assert.match(HTML, /inbox-sms\.js\?v=20261124ml13/);
  assert.match(HTML, /inbox-settings\.js\?v=20261124ml12/);
  assert.match(HTML, /inbox\.css\?v=20261125f7/);
  assert.match(HTML, /inbox-bulk\.js\?v=20261125g2/);
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
  assert.deepEqual(h2s(d), ["Inbox channels", "Email"]);
});

test("messenger unset: Connect Facebook Page navigates to start/ and makes no fetch to it", async () => {
  const d = boot({ channels: CH_OFF, messenger: M_UNSET });
  await d.openSettings();
  assert.deepEqual(h2s(d), ["Inbox channels", "Facebook Messenger", "Email"]);
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
  assert.deepEqual(tabLabels(d), ["All messages", "Website chat", "Email", "FB Messenger", "FB Comments", "Settings"]);
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

test("fix 4: the Inbox page shows no title or subtitle; the h1 stays for screen readers only", () => {
  const view = HTML.slice(HTML.indexOf('id="view-inbox"'), HTML.indexOf('id="view-storefront"'));
  assert.ok(!view.includes("dash-eyebrow"), "no eyebrow");
  assert.ok(!view.includes("Facebook Messenger, website chat and email"));
  assert.match(view, /<h1 class="bl-sr" id="h-inbox" tabindex="-1">Inbox<\/h1>/);
  assert.ok(!view.includes("ib-lede") && !view.includes("one place") && !view.includes('class="view-head'), "no visible title or subtitle");
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
const LIST_NOQ = BASE + "conversations/?channel=nosms";
const THREAD_PATH = BASE + "conversations/" + REF + "/", LIST_PATH = BASE + "conversations/?channel=nosms&status=open";
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
  const quiet = () => d.calls.filter((c) => !c.path.includes("/unread/")).length; /* the nav count (U5) is read on leaving, then every 60 s */
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
  const reads = () => d.calls.filter((c) => c.path === BASE + "unread/?channel=nosms").length;
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
  assert.deepEqual(qCalls().map((c) => c.path), [LIST_NOQ + "&q=Jun&status=open"], "one request, with the last text");
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
  assert.doesNotMatch(css.slice(css.indexOf("INBOX-UI (ClickUp")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/var\(--ov-gold\)/g, ""), /gold|#C9A646|#D9B93F/i); /* the Bulk SMS progress card borrows the Site readiness card edge (INBOX-FIX-7); focus borders stay light blue */
});

/* ---------- INBOX-UI round 2 (z8uq9mg7ux): the filter row in the Conversations card, the header text, phone height, closed-window note ---------- */

const row = (it, over = {}) => ({ ref: it.ref, display_name: it.display_name, snippet: it.snippet, updated_at: it.updated_at, channel: "webchat", source: "stored", status: "open", unread: false, ...over });
const byStatus = (st) => {
  const base = list().items, closed = [row(base[1], { status: "closed" })];
  return { items: st === "closed" ? closed : st === "open" ? [row(base[0])] : [row(base[0]), ...closed], stored_next_cursor: null };
};

test("C2: the toolbar is a row above the card: the channel tabs, then New SMS / Bulk SMS; the list column has the five icon buttons and the search box", async () => {
  const d = boot({ channels: CHANNELS_ON });
  await d.openInbox();
  const wrap = d.$("ib-wrap"), split = d.all(wrap, "ib-split")[0];
  assert.deepEqual(wrap.children.map((n) => n.id), ["ib-tabs-host", "ib-tools-host", "ib-split", "ib-bulkpane", "ib-schedpane", "ib-settings"], "the tabs at the top, the toolbar directly above the card; the Bulk SMS pane and the settings card are the other tab panels, hidden");
  assert.deepEqual(split.children.map((n) => n.id), ["ib-listpane", "ib-threadpane", "ib-cpane"], "list, thread, contact panel");
  assert.equal(d.all(split, "ib-rcol").length, 0);
  assert.equal(d.all(d.$("ib-tabs-host"), "ib-tabs").length, 1, "the tabs are in the top slot");
  assert.equal(d.all(d.$("ib-tools-host"), "ib-tabs").length, 0, "and no longer in the toolbar");
  assert.equal(d.all(d.$("ib-tools-host"), "ib-tools").length, 0, "no SMS: no action buttons, so no toolbar row; Refresh moved to the filter row");
  assert.equal(d.$("ib-tools-host").querySelector ? d.$("ib-tools-host").querySelector("#ib-refresh-btn") : null, null, "no Refresh in the toolbar");
  const head = d.$("ib-lhead");
  const bar = head.children[0];
  assert.deepEqual(bar.children.map((n) => (n.classList.contains("ib-frow") ? "buttons" : n.classList.contains("ib-search") ? "search" : n.id)), ["buttons", "search"]);
  assert.deepEqual(d.all(bar, "ib-fbtn").map((b) => b.id), ["ib-b-search", "ib-b-answered", "ib-b-read", "ib-b-status", "ib-refresh-btn"], "Search, Answered, Read, Open/Closed, Refresh");
  const rb = d.$("ib-refresh-btn");
  assert.equal(rb.parentNode, d.$("ib-frow"), "Refresh sits in the filter row, last");
  assert.deepEqual([rb.getAttribute("aria-label"), rb.getAttribute("title") === null, rb.textContent], ["Refresh", true, ""]);
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
  const reads = () => d.calls.filter((c) => c.method === "GET" && c.path.startsWith(LIST_NOQ) && !/conversations\/[^/?]+\/$/.test(c.path)).map((c) => c.path);
  assert.equal(reads().at(-1), LIST_PATH, "Open is the default: status=open is sent (INBOX-FIX-7)");
  assert.deepEqual([chipOn(d, "open"), chipOn(d, "closed")], ["true", "false"]);
  await pickChip(d, "closed");
  assert.equal(reads().at(-1), LIST_NOQ + "&status=closed");
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 1);
  assert.deepEqual([chipOn(d, "open"), chipOn(d, "closed")], ["false", "true"]);
  await pickChip(d, "open");
  assert.equal(reads().at(-1), LIST_PATH);
  assert.deepEqual([chipOn(d, "open"), chipOn(d, "closed")], ["true", "false"], "one status at a time, and there is no third (all) state");
  const inp = d.$("ib-q");
  inp.value = "Mar"; inp.fire("input"); await clock.advance(300);
  assert.equal(reads().at(-1), LIST_NOQ + "&q=Mar&status=open", "search and status together");
  assert.equal(d.$("ib-q"), inp, "the search box stays while the rows change");
  await clock.advance(15000);
  assert.equal(reads().at(-1), LIST_NOQ + "&q=Mar&status=open", "the list poll keeps both");
  await pickChip(d, "closed");
  await pickTab(d, "email");
  assert.ok(d.$("ib-listbody").textContent.includes("No conversations match \u201CMar\u201D."), "the channel is still a filter on the rows (and a search is on)");
  assert.equal(reads().at(-1), LIST_NOQ + "&q=Mar&status=closed", "the channel adds nothing to the address");
  assert.equal(d.calls.filter((c) => /status=[^&]*(all|invalid)/.test(c.path)).length, 0);
});

test("C2: a chip read that fails says so and puts the chip back; the nav count ignores a filtered list", async () => {
  const d = boot({ channels: CHANNELS_ON, listing: list({ unread_total: 4 }) });
  asInbox(d);
  await d.openInbox();
  d.s.listAnswer = { status: 502, body: { error: { code: "server_error", message: "Please try again later." } } };
  await pickChip(d, "closed");
  assert.equal(d.toasts.length, 1);
  assert.equal(chipOn(d, "open"), "true", "the button is back on Open");
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
  assert.equal(none.all(none.$("ib-tools-host"), "ib-tools").length, 0, "nothing to filter and no SMS: no toolbar row at all");
  assert.equal(none.$("ib-refresh-btn").parentNode.parentNode.parentNode, none.$("ib-lhead"), "Refresh alone in the list head");
  assert.equal(none.$("ib-q"), null);
  assert.equal(none.$("ib-b-status"), null);
  assert.ok(none.$("ib-tab-settings"), "the tabs stay while the list is empty, so Settings can be reached (INBOX-FIX-6)");
  assert.equal(none.all(none.$("ib-tabs-host"), "ib-tab").length, 6, "the tabs stay while the list is empty so Settings can be reached");
});

test("the list column starts with one row of five icon buttons (Search, Answered, Read, Open/Closed, Refresh), real buttons with words and their own icons", async () => {
  const d = boot({ channels: CHANNELS_ON });
  await d.openInbox();
  const btns = d.all(d.$("ib-lhead"), "ib-fbtn");
  assert.deepEqual(btns.map((c) => c.id), ["ib-b-search", "ib-b-answered", "ib-b-read", "ib-b-status", "ib-refresh-btn"]);
  assert.ok(btns.every((c) => c.tagName === "BUTTON" && c.getAttribute("type") === "button" && (c.id === "ib-refresh-btn" || c.getAttribute("aria-pressed") === "false") && !!c.getAttribute("aria-label") && c.getAttribute("title") === null));
  assert.deepEqual(btns.map((c) => c.getAttribute("aria-label")), ["Search", "Showing answered and unanswered", "Showing read and unread", "Showing open", "Refresh"]);
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
  assert.match(css, /\.ib-qs:focus-within \{[^}]*border-color: var\(--link/);
  assert.match(css, /#view-inbox \.ib-split \{ display: grid; grid-template-columns: minmax\(280px, 340px\) minmax\(0, 1fr\) auto;/, "three columns: list, thread, contact panel");
  assert.doesNotMatch(css, /ib-rcol/, "the right column is gone");
  const phone = css.slice(css.indexOf("@media (max-width: 899px)"));
  assert.match(phone, /\.ib-split \{ display: flex; flex-direction: column;/);
  assert.match(phone, /\.ib-split \.is-hide-phone \{ display: none/, "the toolbar goes with the list while a conversation is open");
  assert.match(phone, /\.ib-cpane, #view-inbox \.ib-ctog \{ display: none !important; \}/, "no contact panel on a phone");
  assert.doesNotMatch(css, /container-type|@container/, "containment would trap the fixed dropdown panel");
  assert.doesNotMatch(css.replace(/#view-inbox \.ib-bk-tbox \{[^}]*\}/, ""), /overflow-x: ?(scroll|auto)/, "no sideways scroll anywhere else (the Bulk SMS table scrolls inside its own box)");
  assert.match(css, /\.ib-combo-box:focus-within \{[^}]*border-color: var\(--link\)/);
  assert.match(css, /\.ib-fbtn:focus-visible \{[^}]*border-color: var\(--link\)/, "light-blue focus on the filter buttons");
  assert.match(css, /\.ib-fbtn \{[^}]*width: 44px; height: 44px;[^}]*border: 1px solid var\(--card-line\); border-radius: 8px/, "the top-bar button look");
  assert.match(css, /\.ib-fbtn\[aria-pressed="true"\][^{]*\{[^}]*var\(--link\)/, "light blue when a filter is on");
  assert.match(css, /\.ib-tabs button:focus-visible \{[^}]*var\(--link\)/, "and on the tabs");
});

test("the channel tabs sit at the top beside the top-bar icons, in the dash Settings menu look; no page header rules remain", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const dash = fs.readFileSync(path.join(JS, "..", "css", "dash.css"), "utf8");
  assert.doesNotMatch(css, /#view-inbox:not\(\[hidden\]\) \{ padding-top: 72px; \}/);
  assert.doesNotMatch(css, /ib-head|ib-lede/);
  assert.match(css, /body\.dash-app #view-inbox \.ib-tabs button \{[^}]*border-bottom: 2px solid transparent/, "the Settings menu underline look");
  assert.match(css, /body\.dash-app #view-inbox \.ib-tabs button\.is-on \{[^}]*border-bottom-color: var\(--primary/);
  assert.match(css, /@media \(min-width: 900px\) \{ #view-inbox \.ib-tabs-host \{ padding-right: 164px; margin-bottom: 24px; \} \}/, "clear of the search, theme and bell buttons");
  const dashCss = fs.readFileSync(path.join(JS, "..", "css", "dash.css"), "utf8");
  assert.match(dashCss, /body\.dash-app \.set-tabs:not\(\[hidden\]\) \{ display: flex;[^}]*overflow-x: auto/, "the shared menu scrolls sideways on a phone, not the page");
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
  const reads = () => d.calls.filter((c) => c.method === "GET" && c.path.startsWith(LIST_NOQ) && !/conversations\/[^/?]+\/$/.test(c.path)).map((c) => c.path);
  assert.equal(reads().at(-1), LIST_PATH, "no chip on: no unread parameter");
  await pickChip(d, "unread");
  assert.equal(reads().at(-1), LIST_PATH + "&unread=1");
  assert.deepEqual([chipOn(d, "unread"), chipOn(d, "read")], ["true", "false"]);
  assert.equal(reads().at(-1), LIST_NOQ + "&status=open&unread=1", "status and unread together");
  const inp = d.$("ib-q");
  inp.value = "Mar"; inp.fire("input"); await clock.advance(300);
  assert.equal(reads().at(-1), LIST_NOQ + "&q=Mar&status=open&unread=1", "search, status and unread together");
  await clock.advance(15000);
  assert.equal(reads().at(-1), LIST_NOQ + "&q=Mar&status=open&unread=1", "the list poll keeps all three");
  await pickChip(d, "read");
  assert.equal(reads().at(-1), LIST_NOQ + "&q=Mar&status=open&unread=0");
  assert.deepEqual([chipOn(d, "unread"), chipOn(d, "read")], ["false", "true"], "Read replaces Unread");
  assert.ok(d.$("ib-listbody").textContent.includes("No conversations match"), "an empty filtered list says so");
  await pickOff(d, "read");
  assert.equal(reads().at(-1), LIST_NOQ + "&q=Mar&status=open", "pressing it again drops the parameter");
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
const smsOpen = async (d) => { await d.openSms(); await d.click(d.all(d.$("ib-list"), "ib-item")[0]); };

test("INBOX-FIX-7 sms settings: the Text messages (SMS) card is gone from Inbox Settings and lives on the SMS Marketing Settings tab (same switch, same PUT)", async () => {
  /* Inbox > Settings never shows it, even with sms_available */
  const inb = boot({ channels: { ...CH_OFF, sms_available: true, sms_enabled: false } });
  await inb.openSettings();
  assert.ok(!inb.$("ibs-root").all((n) => n.tagName === "H2").some((n) => /Text messages/.test(n.textContent)), "no SMS card on the Inbox Settings tab");
  assert.equal(inb.$("ibs-sw-sms"), null);
  assert.ok(!inb.$("ibs-root").textContent.includes("For orders and member service only"));
  /* SMS Marketing > Settings: no card while sms_available is absent or false */
  for (const ch of [CH_OFF, { ...CH_OFF, sms_available: false, sms_enabled: false }]) {
    const d = boot({ channels: ch });
    await d.openSmsSettings();
    assert.equal(d.$("ibs-sw-sms"), null);
    assert.equal(d.$("ibs-sms-root").children.length, 0);
  }
  /* with it: the card with the switch, which PUTs sms_enabled; nothing of the Inbox cards, and no Messenger read */
  const d = boot({ channels: { ...CH_OFF, sms_available: true, sms_enabled: false } });
  await d.openSmsSettings();
  assert.deepEqual(d.$("ibs-sms-root").all((n) => n.tagName === "H2").map((n) => n.textContent), ["Text messages (SMS)"]);
  assert.equal(d.$("ibs-root").children.length, 0, "the Inbox cards are not drawn on the SMS page");
  assert.ok(!d.list().some((c) => c.includes("messenger/")), "the Messenger connection is not asked for");
  assert.ok(d.$("ibs-sms-root").textContent.includes("For orders and member service only. No promotions."));
  assert.equal(d.$("ibs-sw-sms").getAttribute("aria-checked"), "false");
  await d.click(d.$("ibs-sw-sms"));
  const put = d.calls.filter((c) => c.method === "PUT");
  assert.deepEqual(put.map((c) => c.body), [{ sms_enabled: true }]);
  assert.equal(d.$("ibs-sw-sms").getAttribute("aria-checked"), "true");
  d.window.NOInboxSettings.hide();
  assert.equal(d.$("ibs-sms-root").children.length, 0, "leaving the tab clears the card");
});

test("INBOX-FIX-7: the Inbox Settings tab has no How the inbox works card, with or without sms", async () => {
  for (const ch of [CH_OFF, { ...CH_OFF, sms_available: true, sms_enabled: false }]) {
    const d = boot({ channels: ch });
    await d.openSettings();
    assert.ok(!d.$("ibs-root").textContent.includes("How the inbox works"));
    assert.ok(!d.$("ibs-root").textContent.includes("Press Refresh to see new messages."));
  }
});

test("sms inbox: hidden while the feature is off (no New text, no Text tab, an sm_ row is not invented)", async () => {
  const d = boot({ channels: CHANNELS_ON });
  await d.openInbox();
  assert.equal(d.$("ib-newtext-btn"), null);
  assert.deepEqual(tabLabels(d), ["All messages", "Website chat", "Email", "FB Messenger", "FB Comments", "Settings"]);
  assert.equal(d.$("ib-tab-sms"), null);
  const off = boot({ off: true });
  await off.openInbox();
  assert.equal(off.$("ib-newtext-btn"), null);
  assert.ok(!off.list().some((c) => c.includes("/sms/")), "no text route is asked for");
});

test("sms inbox: with the feature on the SMS Marketing page lists only texts with the Text (SMS) badge and has New SMS; the Inbox has none of it", async () => {
  const d = boot({ listing: smsList(), channels: CH_SMS, smsStatus: SMS_STATUS });
  d.s.smsStatus = SMS_STATUS;
  await d.openSms();
  const rows = d.all(d.$("ib-list"), "ib-item");
  assert.equal(rows.length, 1, "the stand-in API ignores ?channel=sms, so the client-side filter keeps only the text");
  assert.deepEqual(d.all(rows[0], "ib-cdot").map((n) => n.textContent), ["Text (SMS)"]);
  assert.ok(d.$("ib-newtext-btn"));
  assert.ok(!/SMS Marketing/.test(d.$("ib-tabs-host").textContent), "no visible SMS Marketing title any more (INBOX-FIX-6)");
  assert.equal(d.$("ib-tab-all"), null, "no channel tabs");
  assert.deepEqual(d.all(d.$("ib-tabs-host"), "ib-tab").map((n) => n.textContent), ["Inbox", "Settings"], "Inbox | Bulk SMS | Settings; Bulk SMS only while the bulk probe says so");
  const inbox = boot({ listing: smsList(), channels: CH_SMS, smsStatus: SMS_STATUS });
  await inbox.openInbox();
  assert.equal(inbox.$("ib-newtext-btn"), null, "no New SMS in the Inbox");
  assert.equal(inbox.$("ib-bulk-btn"), null, "no Bulk SMS in the Inbox");
  assert.equal(inbox.$("ib-tab-sms"), null, "no Text (SMS) tab");
  assert.equal(inbox.all(inbox.$("ib-list"), "ib-item").length, 2, "the text is not listed in All messages");
  assert.ok(!inbox.all(inbox.$("ib-list"), "ib-cdot").some((n) => n.textContent === "Text (SMS)"));
  assert.equal(inbox.$("ib-tools-host").children.length, 0, "the row that held New SMS and Bulk SMS is empty (and hidden by CSS)");
  assert.equal(inbox.all(inbox.$("ib-tabs-host"), "ib-acts").length, 0, "and no buttons beside the Inbox tabs");
  const u = d.window.NOInbox.util;
  assert.equal(u.channelOf({ ref: SM }), "sms");
  assert.equal(u.channelOf({ provider: "sms" }), "sms");
});

test("sms thread: no mobile under the name, delivery chips (Sending, Sent, Not sent with the server's words), no prefix and no quota line, the counter 0 / 160", async () => {
  const d = boot({ listing: smsList(), reading: smsThread(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS;
  await smsOpen(d);
  const pane = d.$("ib-threadpane");
  assert.ok(!pane.textContent.includes("+63 9** *** 1234"), "INBOX-FIX-8: the thread head drops the masked mobile (the Contact panel keeps it)");
  assert.ok(!/\+639\d{9}/.test(pane.textContent), "no full number");
  assert.deepEqual(d.all(pane, "chip").map((n) => n.textContent).filter((t) => /Sent|Sending|Not sent/.test(t)), ["Sent", "Sending", "Not sent: The SMS phone is offline. Nothing was sent."]);
  assert.ok(!pane.textContent.includes("Every text starts with"), "no prefix line even though the thread still carries a prefix key");
  assert.ok(!pane.textContent.includes("Texts left today") && !pane.textContent.includes("This hour"), "no quota line");
  assert.equal(d.text("ib-rc"), "0 / 160", "the counter counts only the typed text against 160");
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
  box.value = "a".repeat(161); box.fire("input");
  assert.equal(go.disabled, true); assert.equal(d.text("ib-rp"), "The message is over 160 characters. Shorten it to send.");
  box.value = "a".repeat(160); box.fire("input");
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

/* ---------- New SMS (INBOX-FIX-8): ONE house dropdown for members and contacts, no prefix, no quota, 0 / 160, Add contact popup ---------- */
const CONTACT_ROWS = [{ id: "c1", first_name: "Lito", last_name: "Cruz", mobile_masked: "0918 *** 5678", groups: [{ id: "g1", name: "Regulars" }] }];
const pickCombo = (d) => d.$("ib-sms-pick").parentNode;
const pickRows = (d) => pickCombo(d).all((n) => n.classList.contains("ib-combo-opt"));
async function newSms(o = {}) {
  const d = boot({ listing: smsList(), reading: smsThread(), channels: CH_SMS, ...o });
  d.s.smsStatus = SMS_STATUS; d.s.members = MEMBERS; d.s.contactRows = CONTACT_ROWS;
  await d.openSms(); await d.click(d.$("ib-newtext-btn")); await settle();
  return d;
}
async function typePick(d, q) { const inp = comboInput(d, "ib-sms-pick"); inp.value = q; inp.fire("input"); await sleep(350); await settle(); }
const clickRow = (d, starts) => pickRows(d).find((n) => n.textContent.startsWith(starts)).fire("click");

test("sms New text: no prefix line, no quota line, no default words, counter 0 / 160 even when the status still carries a prefix and 148", async () => {
  const d = await newSms();
  const pane = d.$("ib-threadpane");
  assert.ok(pane.textContent.includes("For orders and member service only. No promotions."));
  assert.ok(!pane.textContent.includes("Every text starts with"), "no prefix line");
  assert.ok(!pane.textContent.includes("Texts left today") && !pane.textContent.includes("This hour"), "no quota line");
  assert.equal(d.$("ib-sms-t").value, "", "nothing is typed for the owner");
  assert.equal(d.text("ib-sms-c"), "0 / 160");
  d.$("ib-sms-t").value = "Hello"; d.$("ib-sms-t").fire("input");
  assert.equal(d.text("ib-sms-c"), "5 / 160", "only the typed text is counted");
  d.$("ib-sms-t").value = "a".repeat(161); d.$("ib-sms-t").fire("input");
  assert.equal(d.text("ib-sms-e"), "The message is over 160 characters. Shorten it to send.");
});

test("sms New text: the picker is ONE house dropdown (no separate search box); opening it selects nothing; members and contacts are tagged; short queries ask nothing", async () => {
  const d = await newSms({ contacts: true });
  assert.equal(d.$("ib-sms-q"), null, "no separate text box");
  const inputs = d.$("ib-threadpane").all((n) => n.tagName === "INPUT").map((n) => n.classList.contains("ib-combo-input"));
  assert.deepEqual(inputs, [true], "the only input is the combo's");
  const inp = comboInput(d, "ib-sms-pick");
  assert.equal(inp.getAttribute("placeholder"), "Choose a member or contact");
  assert.equal(inp.value, "");
  comboBox(d, "ib-sms-pick").fire("click");
  assert.equal(d.$("ib-sms-pick").value, "", "opening selects nothing");
  assert.ok(pickRows(d)[0].textContent.includes("Type at least 2 letters"));
  inp.value = "A"; inp.fire("input"); await sleep(350); await settle();
  assert.ok(!d.list().some((c) => c.includes("/members/?q=") || c.includes("/contacts/?q=")), "one letter asks nothing");
  await typePick(d, "Ana");
  assert.ok(d.list().includes("GET /sites/" + A + "/members/?q=Ana") && d.list().includes("GET /sites/" + A + "/contacts/?q=Ana"));
  const sel = d.$("ib-sms-pick");
  assert.deepEqual(sel.children.map((o) => o.textContent), ["Choose a member or contact", "Ana Reyes · +63 9** *** 1234", "Lito Cruz · 0918 *** 5678"]);
  assert.deepEqual(sel.children.map((o) => o.getAttribute("data-tag")), [null, "Member", "Contact"]);
  const rows = pickRows(d);
  assert.ok(rows[0].textContent.endsWith("Member") && rows[1].textContent.endsWith("Contact"));
  assert.equal(d.press(d.$("ib-threadpane"), "Send text").disabled, true);
});

test("sms New text: sending to a member posts member_id only; to a contact posts contact_id only; no number is ever sent", async () => {
  const d = await newSms({ contacts: true });
  await typePick(d, "Ana"); clickRow(d, "Ana Reyes");
  d.$("ib-sms-t").value = "Your order is ready"; d.$("ib-sms-t").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send text"));
  let post = d.calls.filter((c) => c.method === "POST" && c.path === BASE + "sms/compose/");
  assert.deepEqual(Object.keys(post[0].body).sort(), ["idempotency_key", "member_id", "text"]);
  assert.equal(post[0].body.member_id, "mem_1");
  assert.ok(d.list().includes("GET " + BASE + `conversations/${SM}/`), "the new conversation is opened");
  const c = await newSms({ contacts: true });
  await typePick(c, "Lito"); clickRow(c, "Lito Cruz");
  c.$("ib-sms-t").value = "Hi Lito"; c.$("ib-sms-t").fire("input");
  await c.click(c.press(c.$("ib-threadpane"), "Send text"));
  post = c.calls.filter((x) => x.method === "POST" && x.path === BASE + "sms/compose/");
  assert.deepEqual(Object.keys(post[0].body).sort(), ["contact_id", "idempotency_key", "text"]);
  assert.equal(post[0].body.contact_id, "c1");
});

test("sms New text: contacts are not searched and there is no Add contact button while the contacts status is off", async () => {
  const d = await newSms();
  assert.equal(d.$("ib-addc"), null);
  await typePick(d, "Ana");
  assert.ok(d.list().includes("GET /sites/" + A + "/members/?q=Ana"));
  assert.ok(!d.list().some((c) => c.includes("/contacts/")), "no contacts call at all (the status read is not even made without contacts.js)");
  assert.deepEqual(d.$("ib-sms-pick").children.map((o) => o.textContent), ["Choose a member or contact", "Ana Reyes · +63 9** *** 1234"]);
});

test("sms New text: Add contact at the right of the title opens the popup (first name required, last name, contact number, Group dropdown); Save posts and picks the new contact", async () => {
  const d = await newSms({ contacts: true });
  const add = d.$("ib-addc");
  assert.ok(add && add.textContent === "Add contact");
  assert.ok(add.parentNode.classList.contains("ib-hacts") && add.parentNode.parentNode.classList.contains("ib-thead"), "in the head, after the title");
  await d.click(add); await settle();
  const slot = d.$("ct-dialog-slot");
  assert.ok(slot.textContent.includes("First name") && slot.textContent.includes("Last name") && slot.textContent.includes("Contact number") && slot.textContent.includes("Group"));
  assert.equal(d.$("ct-agroup").tagName, "SELECT");
  assert.deepEqual(d.$("ct-agroup").children.map((o) => o.textContent), ["No group", "Regulars", "VIP"]);
  assert.ok(d.calls.some((c) => c.path === "/sites/" + A + "/contacts/groups/"));
  await d.click(d.press(slot, "Add contact"));
  assert.ok(slot.textContent.includes("Enter a first name"), "first name is required, inline");
  assert.equal(d.calls.filter((c) => c.method === "POST" && c.path === "/sites/" + A + "/contacts/").length, 0);
  d.$("ct-first").value = " Lito "; d.$("ct-mobile").value = "0917 111 2222"; d.$("ct-agroup").value = "g2";
  await d.click(d.press(slot, "Add contact")); await settle();
  const post = d.calls.find((c) => c.method === "POST" && c.path === "/sites/" + A + "/contacts/");
  assert.deepEqual(post.body, { first_name: "Lito", last_name: "", mobile: "0917 111 2222", groups: ["g2"] });
  assert.equal(slot.children.length, 0, "popup closed");
  assert.equal(d.$("ib-sms-pick").value, "c:c9", "the new contact is selected in the picker");
  assert.equal(comboInput(d, "ib-sms-pick").value, "Lito · 0917 *** 2222");
  d.$("ib-sms-t").value = "Welcome"; d.$("ib-sms-t").fire("input");
  assert.equal(d.press(d.$("ib-threadpane"), "Send text").disabled, false);
});

test("sms New text: a refused text (200 failed, any code) shows the server's words as-is and keeps the typed text; a 409 shows its message too; one 404 says only that the person cannot be texted", async () => {
  const d = await newSms();
  d.s.composeAnswer = { status: 200, body: { ref: SM, new_conversation: true, state: "failed", error_code: "site_limit", message: "Your store has used its texts for today.", created_at: iso(0) } };
  await typePick(d, "Ana"); clickRow(d, "Ana Reyes");
  d.$("ib-sms-t").value = "Hi"; d.$("ib-sms-t").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send text")); await settle();
  assert.ok(d.$("ib-threadpane").textContent.includes("Your store has used its texts for today."));
  assert.ok(!d.$("ib-threadpane").textContent.includes("site_limit"));
  assert.equal(d.$("ib-sms-t").value, "Hi", "the typed text stays for a retry");
  assert.equal(d.$("ib-sms-pick").value, "m:mem_1", "and so does the chosen person");
  d.s.composeAnswer = { status: 409, body: { error: { code: "site_held", message: "Texting is paused for your store." } } };
  await d.click(d.press(d.$("ib-threadpane"), "Send text")); await settle();
  assert.ok(d.$("ib-threadpane").textContent.includes("Texting is paused for your store."));
  d.s.composeAnswer = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
  await d.click(d.press(d.$("ib-threadpane"), "Send text")); await settle();
  assert.ok(d.$("ib-threadpane").textContent.includes("This person cannot be texted.") || d.$("ib-threadpane").textContent.includes("Not found."));
  const off = boot({ listing: smsList(), channels: CH_SMS });
  off.s.smsStatus = { ...SMS_STATUS, phone_online: false };
  await off.openSms(); await off.click(off.$("ib-newtext-btn"));
  assert.ok(off.$("ib-threadpane").textContent.includes("Your texting phone is offline. Texts can't be sent right now."));
  const sw = boot({ listing: smsList(), channels: CH_SMS });
  sw.s.smsStatus = { ...SMS_STATUS, enabled: false };
  await sw.openSms(); await sw.click(sw.$("ib-newtext-btn"));
  assert.ok(sw.$("ib-threadpane").textContent.includes("Text messages are off for your store."));
  assert.equal(sw.$("ib-sms-pick"), null);
});

test("sms util: problem, pickable, items, composeBody, 160 whatever the old data says, chip, offText, available", () => {
  const d = boot({});
  const u = d.window.NOInboxSms.util;
  assert.equal(u.problem("", 100), ""); assert.equal(u.problem("hello there", 100), "");
  assert.equal(u.problem("visit www.shop.ph", 100), "The text must not contain a web link.");
  assert.equal(u.problem("ip 10.0.0.1 here", 100), "The text must not contain a web link.");
  assert.equal(u.problem("call me", 3), "The message is over 3 characters. Shorten it to send.");
  assert.deepEqual([...u.pickable(MEMBERS).map((m) => m.id)], ["mem_1"]);
  assert.deepEqual([...u.memberItems(MEMBERS).map((m) => m.key)], ["m:mem_1"]);
  assert.deepEqual(JSON.parse(JSON.stringify(u.contactItems(CONTACT_ROWS))), [{ key: "c:c1", kind: "contact", id: "c1", name: "Lito Cruz", label: "Lito Cruz · 0918 *** 5678" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(u.composeBody({ kind: "member", id: "m1" }, "Hi", "k"))), { member_id: "m1", text: "Hi", idempotency_key: "k" });
  assert.deepEqual(JSON.parse(JSON.stringify(u.composeBody({ kind: "contact", id: "c1" }, "Hi", "k"))), { contact_id: "c1", text: "Hi", idempotency_key: "k" });
  assert.equal(u.quota, undefined, "no quota line any more"); assert.equal(u.prefixOf, undefined, "no prefix reader any more");
  assert.equal(u.chip({ direction: "in" }), null);
  assert.deepEqual([...u.chip({ direction: "out", delivery_state: "" })], ["info", "Sending"]);
  assert.equal(u.available({ sms_available: true }), true); assert.equal(u.available({}), false); assert.equal(u.available(null), false);
  assert.equal(u.maxOf({ max_length: null }), null); assert.equal(u.maxOf({ max_length: 128, prefix: "Store: " }), 160); assert.equal(u.maxOf({ max_length: 160, prefix: "" }), 160);
});

test("INBOX-FIX-8 look: the New SMS head and the thread head share the left divider's 69px at desktop; the body box has a border; the thread head has no mobile line", () => {
  const CSS = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8");
  assert.ok(/min-width: 900px\) \{[^}]*#view-inbox \.ib-lhead \{ box-sizing: border-box; min-height: 69px;/.test(CSS));
  assert.ok(/#view-inbox \.ib-thead \{ box-sizing: border-box; height: 69px; padding-top: 6px; padding-bottom: 6px; flex-wrap: nowrap; \}/.test(CSS), "every desktop head is exactly the divider's 69px");
  assert.ok(!/ib-thead\.ib-thead-new \{ height/.test(CSS), "no separate New SMS height any more");
  assert.ok(/#view-inbox \.ib-sms-new \.pm-input\.ib-ta \{[^}]*border: 1px solid var\(--bl-select-line\)/.test(CSS), "visible textarea border, the dash input token");
  assert.ok(!/ib-sms-prefix|ib-sms-quota/.test(CSS));
  const src = read("inbox.js") + read("inbox-sms.js") + read("inbox-bulk.js");
  assert.ok(!/Every text starts with|Texts left today|This hour:/.test(src));
  assert.ok(/function subOf\(channel, t\) \{\s*if \(channel === "sms"\) return "";/.test(read("inbox.js")));
});

/* ---------- Meta Business Inbox look (ClickUp z8uq9mj6ch): tabs, chips, placeholders, the contact panel ---------- */

test("util: tabsFor lists the channels, never Text (SMS); cycleNext/filterNext step one filter button; placeholderFor; contactOf", async () => {
  const d = boot({ channels: CHANNELS_ON });
  const u = d.window.NOInbox.util;
  const labels = (ch) => Array.from(u.tabsFor(ch), (t) => t[1]);
  assert.deepEqual(labels(null), ["All messages", "Website chat", "Email", "FB Messenger", "FB Comments"]);
  assert.deepEqual(labels(CHANNELS_ON), labels(null));
  assert.deepEqual(labels({ ...CHANNELS_ON, sms_available: false }), labels(null));
  assert.deepEqual(labels(CH_SMS), ["All messages", "Website chat", "Email", "FB Messenger", "FB Comments"], "no Text (SMS) tab even with sms_available: texts live on SMS Marketing");
  assert.deepEqual(Array.from(u.tabsFor(CH_SMS), (t) => t[0]), ["all", "webchat", "email", "messenger", "fbcomment"], "the filter values the dropdown used");
  assert.ok(!labels(CH_SMS).some((t) => /Instagram|WhatsApp/.test(t)));
  /* the filter buttons: exactly the existing filter values, in turn all -> first -> second -> all */
  assert.deepEqual(Array.from(u.cycles, (c) => [c.dim, Array.from(c.order)]), [["answered", ["", "unanswered", "answered"]], ["unread", ["", "1", "0"]], ["status", ["open", "closed"]]]);
  assert.deepEqual(["", "unanswered", "answered", ""].map((v) => u.cycleNext("answered", v)), ["unanswered", "answered", "", "unanswered"]);
  assert.deepEqual(["", "1", "0"].map((v) => u.cycleNext("unread", v)), ["1", "0", ""]);
  assert.deepEqual(["open", "closed", "open"].map((v) => u.cycleNext("status", v)), ["closed", "open", "closed"], "Open then Closed then Open: no all state (INBOX-FIX-7)");
  assert.equal(u.cycleNext("status", "weird"), "open", "an unknown value goes back to the default, Open");
  assert.equal(u.cycleNext("status", ""), "open");
  assert.equal(u.cycleDefault("status"), "open");
  assert.equal(u.cycleNext("nope", "x"), "");
  assert.deepEqual([u.cycleLook("unread", "1").text, u.cycleLook("unread", "0").text, u.cycleLook("unread", "").text], ["Unread only", "Read only", "Showing read and unread"]);
  assert.deepEqual([u.cycleLook("answered", "answered").text, u.cycleLook("answered", "unanswered").text], ["Answered only", "Unanswered only"]);
  assert.deepEqual([u.cycleLook("status", "open").text, u.cycleLook("status", "closed").text], ["Showing open", "Showing closed"]);
  assert.equal(u.cycleLook("status", "").text, "Showing open", "an unknown value reads as the default");
  assert.equal(new Set(["", "answered", "unanswered"].map((v) => u.cycleLook("answered", v).icon)).size, 3, "a distinct icon per state");
  assert.equal(new Set(["", "1", "0"].map((v) => u.cycleLook("unread", v).icon)).size, 3);
  assert.equal(new Set(["open", "closed"].map((v) => u.cycleLook("status", v).icon)).size, 2);
  const base = { q: "ma", status: "open", unread: "", answered: "", filter: "email" };
  assert.deepEqual({ ...u.filterNext(base, "unread") }, { q: "ma", status: "open", unread: "1", answered: "", filter: "email" });
  assert.deepEqual({ ...u.filterNext({ ...base, unread: "1" }, "unread") }, { ...base, unread: "0" });
  assert.deepEqual({ ...u.filterNext({ ...base, unread: "0" }, "unread") }, base, "the third press is back to all");
  assert.deepEqual({ ...u.filterNext({ ...base, status: "closed" }, "answered") }, { ...base, status: "closed", answered: "unanswered" }, "other dimensions are kept");
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

test("SMS-MENU: the channel param is sent (nosms in the Inbox, sms on SMS Marketing) and the client-side filter keeps each page to its own channel", async () => {
  const inbox = boot({ listing: smsList(), channels: CH_SMS });
  await inbox.openInbox();
  assert.ok(inbox.list().includes("GET " + BASE + "conversations/?channel=nosms&status=open"));
  assert.ok(!inbox.list().some((c) => c.includes("channel=sms")));
  assert.deepEqual(rowsOf(inbox).map((r) => inbox.all(r, "ib-name")[0].textContent), ["Maria Santos", "Jun Dela Cruz"], "a server that ignores the param still shows no text");
  const sms = boot({ listing: smsList(), channels: CH_SMS });
  sms.s.smsStatus = SMS_STATUS;
  await sms.openSms();
  assert.ok(sms.list().includes("GET " + BASE + "conversations/?channel=sms&status=open"));
  assert.ok(!sms.list().some((c) => c.includes("/comments/")), "no comments are asked for on SMS Marketing");
  assert.deepEqual(rowsOf(sms).map((r) => sms.all(r, "ib-name")[0].textContent), ["Ana Reyes"], "only the text is shown");
  /* search, filters and Show more keep the param */
  sms.$("ib-q").value = "Ana"; sms.$("ib-q").fire("input"); await sleep(350); await settle();
  assert.ok(sms.list().includes("GET " + BASE + "conversations/?channel=sms&q=Ana&status=open"));
  const u = sms.window.NOInbox.util;
  assert.equal(u.chanParam("sms"), "sms"); assert.equal(u.chanParam("inbox"), "nosms");
  assert.deepEqual(Array.from(u.modeItems([{ ref: SM }, { ref: WC }, { ref: "cm_x" }], "sms"), (i) => i.ref), [SM]);
  assert.deepEqual(Array.from(u.modeItems([{ ref: SM }, { ref: WC }, { ref: "cm_x" }, { channel: "sms", ref: "x" }], "inbox"), (i) => i.ref), [WC, "cm_x"]);
  assert.deepEqual({ ...u.sourcesFor("all", "", "sms") }, { conv: true, cm: false });
  assert.deepEqual({ ...u.sourcesFor("all", "", "inbox") }, { conv: true, cm: true });
  /* Show more filters too */
  const more = boot({ listing: { ...smsList(), stored_next_cursor: "30" }, channels: CH_SMS });
  more.s.smsStatus = SMS_STATUS;
  await more.openSms();
  more.s.listing = { items: [{ ref: WC, display_name: "Late chat", snippet: "x", updated_at: iso(90), channel: "webchat", status: "open", unread: false }, { ref: "sm_eeeeeeeeeeeeeeeeeeeeeeee", display_name: "Late text", snippet: "x", updated_at: iso(91), channel: "sms", status: "open", unread: false }], stored_next_cursor: null };
  await more.click(more.press(more.$("ib-listbody"), "Show more conversations"));
  assert.ok(more.list().includes("GET " + BASE + "conversations/?channel=sms&stored_cursor=30&status=open"));
  assert.deepEqual(rowsOf(more).map((r) => more.all(r, "ib-name")[0].textContent), ["Ana Reyes", "Late text"]);
});

test("SMS-MENU: the SMS Marketing page is locked like the 404 page when texts are off or unavailable, and no conversation is read", async () => {
  for (const channels of [CHANNELS_ON, { ...CH_SMS, sms_available: false }]) {
    const d = boot({ listing: smsList(), channels });
    await d.openSms();
    assert.deepEqual(d.all(d.$("ib-root"), "ib-state").map((n) => n.all((x) => x.tagName === "H2")[0].textContent), ["SMS Marketing is not available yet"]);
    assert.ok(!d.list().some((c) => c.includes("/conversations/")), "no list read while locked");
    assert.equal(d.$("ib-newtext-btn"), null);
    assert.deepEqual(d.smsNav.map((n) => n.hidden), [true, true], "the menu item is hidden too");
  }
  const gone = boot({ off: true });
  await gone.openSms();
  assert.deepEqual(gone.all(gone.$("ib-root"), "ib-state").map((n) => n.all((x) => x.tagName === "H2")[0].textContent), ["SMS Marketing is not available yet"]);
  const ok = boot({ listing: smsList(), channels: CH_SMS });
  ok.s.smsStatus = SMS_STATUS;
  await ok.openSms();
  assert.deepEqual(ok.smsNav.map((n) => n.hidden), [false, false]);
  assert.equal(ok.calls.filter((c) => c.path === BASE + "channels/").length, 1, "channels is read once on the way in");
  /* the Inbox count is not lowered by opening a text, and the page heading, back words and empty text name SMS Marketing */
  assert.equal(ok.window.NOInbox.util.pageName("sms"), "SMS Marketing");
  const e = boot({ listing: { items: [], stored_next_cursor: null }, channels: CH_SMS });
  await e.openSms();
  assert.ok(e.$("ib-listbody").textContent.includes("When a customer replies to your text"));
  assert.ok(e.$("ib-newtext-btn"), "New SMS is offered on an empty page");
});

test("SMS-MENU: the nav item, the More sheet tile and the route are in index.html under Inbox, gated and unreordered; cache keys ml13", () => {
  const side = HTML.slice(HTML.indexOf('<nav class="side-nav"'), HTML.indexOf("</nav>", HTML.indexOf('<nav class="side-nav"')));
  const order = [...side.matchAll(/data-route="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order.slice(0, 5), ["overview", "orders", "products", "inbox", "sms"], "right under Inbox, nothing reordered");
  assert.match(side, /<a href="\/sms\/" data-route="sms" data-sms-nav hidden>[\s\S]*?SMS Marketing<\/a>/);
  const sheet = HTML.slice(HTML.indexOf('id="more-sheet"'));
  assert.match(sheet, /<a class="sheet-tile" href="\/sms\/" data-sheet-close data-sms-nav hidden>/, "the phone bottom bar is full: SMS Marketing is in the More sheet");
  assert.ok(!/<nav class="tabs[\s\S]*?<\/nav>/.exec(HTML)[0].includes("/sms/"), "not in the bottom bar");
  assert.ok(read("dashboard.js").includes('"/sms/": { view: "inbox", page: "sms"'));
  assert.match(HTML, /inbox\.js\?v=20261125f7/); assert.match(HTML, /inbox-sms\.js\?v=20261124ml13/); assert.match(HTML, /inbox-bulk\.js\?v=20261125g2/); assert.match(HTML, /inbox\.css\?v=20261125f7/);
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

test("INBOX-FIX-7: the New SMS and Bulk SMS buttons are gone from the top right of the SMS page; the contact panel and its toggle are hidden by CSS on a phone", async () => {
  const d = boot({ listing: smsList(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS;
  d.s.bulkStatus = { available: true };
  await d.openSms();
  assert.equal(d.all(d.$("ib-tabs-host"), "ib-acts").length, 0, "no actions beside the tabs");
  const row = d.all(d.$("ib-tabs-host"), "ib-toprow")[0];
  assert.deepEqual(row.children.map((n) => n.classList.contains("ib-tabs") ? "tabs" : "?"), ["tabs"]);
  assert.equal(d.$("ib-bulk-btn"), null, "no Bulk SMS button (the Bulk SMS tab is the way in)");
  assert.ok(!d.all(row, "no-btn-primary").length);
  const css = cssText();
  assert.match(css, /@media \(max-width: 899px\) \{[^@]*\.ib-cpane, #view-inbox \.ib-ctog \{ display: none !important; \}/);
  assert.match(css, /@media \(max-width: 1099px\) \{ #view-inbox \.ib-cpane, #view-inbox \.ib-ctog \{ display: none !important;/, "too narrow for three columns");
});

test("INBOX-META-LOOK fix 1: on a phone the toolbar host hides with the list while a conversation is open", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const phone = css.slice(css.indexOf("@media (max-width: 899px)"));
  assert.match(phone, /#view-inbox \.ib-tools-host\.is-hide-phone, #view-inbox \.ib-tabs-host\.is-hide-phone \{ display: none; \}/);
  assert.doesNotMatch(css.split("@media")[0], /\.ib-tools-host\.is-hide-phone/);
});

/* ---------- Fix round 2 (Coach Ed 2026-11-24): the four icon buttons and the full-width search ---------- */

test("fix 2: the Answered / Read / Open-Closed buttons cycle all -> first -> second -> all, each with its own words, icon and aria-pressed", async () => {
  const d = boot({ channels: CHANNELS_ON });
  asInbox(d);
  d.s.statuser = (st) => byStatus(st);
  await d.openInbox();
  const look = (id) => { const b = d.$(id); return [b.getAttribute("data-v"), b.getAttribute("aria-label"), b.getAttribute("aria-label"), b.getAttribute("aria-pressed"), b.classList.contains("is-on"), b.innerHTML]; };
  for (const [id, steps] of [["ib-b-answered", [["", "Showing answered and unanswered"], ["unanswered", "Unanswered only"], ["answered", "Answered only"]]], ["ib-b-read", [["", "Showing read and unread"], ["1", "Unread only"], ["0", "Read only"]]], ["ib-b-status", [["open", "Showing open"], ["closed", "Showing closed"]]]]) {
    const seen = [], dflt = steps[0][0]; /* the first state is the default: not lit; Open/Closed has two states only (INBOX-FIX-7) */
    for (let i = 0; i <= steps.length; i++) {
      const l = look(id), [v, words] = steps[i % steps.length];
      assert.deepEqual([l[0], l[1], l[2], l[3], l[4]], [v, words, words, v !== dflt ? "true" : "false", v !== dflt], id + " step " + i);
      seen.push(d.$(id).children[0].children[0].getAttribute("d"));
      d.$(id).fire("click"); await settle();
    }
    assert.equal(new Set(seen.slice(0, steps.length)).size, steps.length, id + ": a distinct icon per state");
    assert.equal(seen[steps.length], seen[0], id + ": back to the first icon after a full turn");
  }
  const sent = d.calls.filter((c) => c.method === "GET" && c.path.startsWith(LIST_PATH)).map((c) => c.path.slice(LIST_PATH.length));
  assert.ok(sent.includes("?answered=answered") && sent.includes("?answered=unanswered") && sent.includes("?unread=1") && sent.includes("?unread=0") && sent.includes("?status=closed") || sent.some((p) => /answered=unanswered/.test(p)), "the same query values the chips sent");
});

test("fix 4: every filter-row button shows the house tooltip at once on hover (no delay, no native title); a click updates the open tooltip text in place", async () => {
  const d = boot({ channels: CHANNELS_ON });
  asInbox(d);
  d.s.statuser = (st) => byStatus(st);
  await d.openInbox();
  const ids = ["ib-b-search", "ib-b-answered", "ib-b-read", "ib-b-status", "ib-refresh-btn"];
  const tipOf = (id) => d.$(id + "-tip");
  for (const id of ids) {
    const b = d.$(id);
    assert.equal(b.getAttribute("title"), null, id + ": no native title");
    assert.ok(tipOf(id), id + ": has a house tooltip");
    assert.equal(tipOf(id).getAttribute("role"), "tooltip");
    for (let n = tipOf(id).parentNode; n; n = n.parentNode) assert.ok(!(n.classList && (n.classList.contains("ib-frow") || n.classList.contains("ib-fbar"))), id + ": the tip is outside the transformed, clipped filter row");
    assert.equal(tipOf(id).classList.contains("is-open"), false);
    b.fire("mouseenter"); /* no clock advance: it must open in the same tick */
    assert.equal(tipOf(id).classList.contains("is-open"), true, id + ": open at once");
    assert.equal(tipOf(id).textContent, b.getAttribute("aria-label"), id + ": the aria-label words");
    b.fire("mouseleave");
    assert.equal(tipOf(id).classList.contains("is-open"), false, id + ": closes on leave");
    b.fire("focus"); assert.equal(tipOf(id).classList.contains("is-open"), true, id + ": opens on focus"); b.fire("blur");
  }
  assert.deepEqual(["ib-b-answered", "ib-b-read", "ib-b-status"].map((id) => d.$(id).getAttribute("aria-label")), ["Showing answered and unanswered", "Showing read and unread", "Showing open"]);
  for (const [id, steps] of [["ib-b-answered", ["Unanswered only", "Answered only", "Showing answered and unanswered"]], ["ib-b-read", ["Unread only", "Read only", "Showing read and unread"]], ["ib-b-status", ["Showing closed", "Showing open"]]]) {
    d.$(id).fire("mouseenter");
    for (const words of steps) {
      d.$(id).fire("click"); await settle();
      assert.equal(tipOf(id).classList.contains("is-open"), true, id + ": still open after the click");
      assert.equal(tipOf(id).textContent, words, id + ": new words at once, pointer still on the button");
      assert.equal(d.$(id).getAttribute("aria-label"), words);
    }
    d.$(id).fire("mouseleave");
  }
});

test("fix 2: the three buttons combine, and a failed read puts each back to its previous state with a toast", async () => {
  const d = boot({ channels: CHANNELS_ON });
  asInbox(d);
  await d.openInbox();
  const reads = () => d.calls.filter((c) => c.method === "GET" && c.path.startsWith(LIST_NOQ) && !/conversations\/[^/?]+\/$/.test(c.path)).map((c) => c.path);
  await pickChip(d, "unread"); await pickChip(d, "answered"); await pickChip(d, "open");
  assert.equal(reads().at(-1), LIST_PATH + "&unread=1&answered=answered", "all three together (Open is the default and always sent)");
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
  assert.deepEqual([row.hidden, field.hidden, sb.getAttribute("aria-expanded")], [false, false, "true"], "both are in the layout while the motion runs");
  assert.equal(row.getAttribute("inert"), "", "the leaving buttons cannot be reached at once");
  await clock.advance(260);
  assert.deepEqual([row.hidden, field.hidden], [true, false], "after the transition the buttons are hidden, the box is shown");
  assert.equal(d.$("ib-refresh-btn").parentNode, row, "Refresh hides with the other buttons (it is inside the inert, hidden row)");
  assert.equal(d.doc.activeElement, inp, "the box has the focus");
  assert.ok(d.$("ib-lhead").children[0].classList.contains("is-search"));
  inp.value = "Jun"; inp.fire("input"); await clock.advance(300);
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 1, "the same debounced search as before");
  inp.fire("keydown", { key: "Escape", stopPropagation() {} }); await settle();
  assert.equal(d.$("ib-lhead").children[0].classList.contains("is-search"), false);
  assert.equal(field.getAttribute("inert"), "", "the closing box cannot be reached");
  assert.equal(row.getAttribute("inert"), null);
  await clock.advance(260);
  assert.deepEqual([row.hidden, field.hidden], [false, true], "Esc closes the box and brings the buttons back");
  assert.equal(row.contains ? row.contains(d.$("ib-refresh-btn")) : true, true, "Refresh is back with the buttons");
  assert.equal(inp.value, ""); assert.equal(d.all(d.$("ib-list"), "ib-item").length, 2, "an emptied text is the normal list again");
  assert.equal(d.doc.activeElement, sb, "the focus goes back to the Search button");
  assert.equal(sb.getAttribute("aria-pressed"), "false");
  /* closing with nothing typed changes no filter */
  await pickChip(d, "unread");
  const n = d.calls.length;
  await d.click(sb); await d.click(d.$("ib-sclose")); await clock.advance(260);
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
  assert.match(css, /\.ib-fbar\.is-search \.ib-search \{ width: 100%/);
  assert.match(css, /\.ib-frow\[hidden\], #view-inbox \.ib-search\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.ib-fbar \{[^}]*justify-content: flex-end/, "the buttons sit at the right");
  assert.match(css, /\.ib-frow \{ display: flex;[^}]*gap: 8px/);
  assert.doesNotMatch(css, /\.ib-chip\b|\.ib-chips\b/, "no chip rules are left");
});

test("fix 3: the CSS: transitions on the row and the box, a state class, a reduced-motion rule, light-blue focus", () => {
  const css = cssText();
  assert.match(css, /\.ib-frow \{[^}]*transition: max-width \.22s ease, opacity/);
  assert.match(css, /\.ib-search \{[^}]*width: 0;[^}]*transition: width \.22s ease/);
  assert.match(css, /\.ib-fbar\.is-search \.ib-frow \{ max-width: 0;[^}]*opacity: 0/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ #view-inbox \.ib-frow, #view-inbox \.ib-search \{ transition: none; \} \}/);
  assert.match(css, /\.ib-fbtn:focus-visible \{[^}]*var\(--link\)/);
});

test("fix 3: with reduced motion the switch is instant; focus moves to the box and back; closed parts are inert and then hidden", async () => {
  const clock = makeClock(), d = boot({ clock, channels: CHANNELS_ON });
  asInbox(d);
  d.window.matchMedia = (q) => ({ matches: q === "(prefers-reduced-motion: reduce)" });
  await d.openInbox();
  const sb = d.$("ib-b-search"), row = d.$("ib-frow"), field = d.all(d.$("ib-lhead"), "ib-search")[0], inp = d.$("ib-q");
  assert.equal(field.getAttribute("inert"), "", "the closed box is not reachable");
  await d.click(sb);
  assert.deepEqual([row.hidden, field.hidden, row.getAttribute("inert")], [true, false, ""], "instant, no timer");
  assert.equal(d.doc.activeElement, inp);
  await d.click(d.$("ib-sclose"));
  assert.deepEqual([row.hidden, field.hidden, row.getAttribute("inert"), field.getAttribute("inert")], [false, true, null, ""]);
  assert.equal(d.doc.activeElement, sb);
});

test("fix 4: the channel tabs are in the top slot (Settings menu look): no SMS tab, keyboard arrows, filter per channel, rebuilt with the SMS probe", async () => {
  const d = boot({ listing: smsList(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS;
  await d.openInbox();
  const bar = d.all(d.$("ib-tabs-host"), "ib-tabs")[0];
  assert.ok(bar.classList.contains("set-tabs"));
  assert.equal(bar.getAttribute("role"), "tablist");
  assert.equal(d.$("ib-tab-sms"), null, "no SMS tab, even when SMS is available");
  d.$("ib-tab-all").fire("keydown", { key: "ArrowRight", preventDefault() {} });
  assert.equal(d.doc.activeElement, d.$("ib-tab-webchat"), "arrow keys move between the tabs");
  await pickTab(d, "email");
  assert.equal(d.$("ib-tab-email").getAttribute("aria-selected"), "true");
  assert.equal(d.$("ib-newtext-btn"), null, "New SMS is not in the Inbox");
});

/* ---------- Round 5 addition (Coach Ed 2026-11-24): tooltip bubble with an arrow, shorter words, a divider under the filters, unanswered first ---------- */

test("round 5: the filter tooltip is centred on its button, above with the arrow down, below with the arrow up when there is no room, clamped with the arrow kept over the button", async () => {
  const d = boot({ channels: CHANNELS_ON });
  await d.openInbox();
  const b = d.$("ib-b-read"), tip = d.$("ib-b-read-tip");
  const rect = (left, top) => { b.getBoundingClientRect = () => ({ left, right: left + 44, top, bottom: top + 44, width: 44, height: 44 }); };
  tip.offsetWidth = 120; tip.offsetHeight = 34;
  const ax = () => (tip.style.getPropertyValue ? tip.style.getPropertyValue("--ax") : "") || tip.style["--ax"];
  rect(100, 120); b.fire("mouseenter");
  assert.equal(tip.classList.contains("is-above"), true); assert.equal(tip.classList.contains("is-below"), false);
  assert.equal(tip.style.left, "62px", "centred: 100 + 22 - 60");
  assert.equal(tip.style.top, "76px", "above the button: 120 - 34 - 10");
  assert.equal(ax(), "60px", "the arrow is at the middle of the bubble, over the button centre");
  b.fire("mouseleave");
  rect(100, 20); b.fire("mouseenter");
  assert.equal(tip.classList.contains("is-below"), true, "no room above: below, arrow up"); assert.equal(tip.classList.contains("is-above"), false);
  assert.equal(tip.style.top, "74px", "below the button: 20 + 44 + 10");
  b.fire("mouseleave");
  rect(0, 120); b.fire("mouseenter");
  assert.equal(tip.style.left, "8px", "clamped inside the viewport");
  assert.equal(ax(), "14px", "bubble left 8 + arrow 14 = 22, the button centre: the arrow does not move with the clamp");
});

test("round 5: the tooltip CSS is a dark bubble with a white text and a triangle arrow in the light theme (dark theme: see the next test); the list head has a 1px divider", () => {
  const css = cssText();
  const rule = /\n\.ib-ftip \{([^}]*)\}/.exec(css)[1];
  assert.match(rule, /background: #1B2236/); assert.match(rule, /color: #fff/); assert.match(rule, /border-radius: 10px/); assert.match(rule, /position: fixed/);
  assert.match(css, /\.ib-ftip::after \{[^}]*left: var\(--ax, 50%\)[^}]*border: 6px solid transparent/);
  assert.match(css, /\.ib-ftip\.is-above::after \{[^}]*top: 100%;[^}]*border-top-color: #1B2236/, "arrow down under a bubble above the button");
  assert.match(css, /\.ib-ftip\.is-below::after \{[^}]*bottom: 100%;[^}]*border-bottom-color: #1B2236/, "arrow up over a bubble below the button");
  assert.match(css, /#view-inbox \.ib-lhead \{[^}]*border-bottom: 1px solid var\(--bl-select-line\)/, "the divider: the select/input border token, which shows in dark (#6474B0) and light (#C5CDE0), unlike --card-line");
  assert.match(css, /#view-inbox \.ib-lhead:empty \{ display: none; \}/, "no divider when there is no filter row");
});

test("round 5: the filter words are short and Answered shows the unanswered first", async () => {
  const d = boot({ channels: CHANNELS_ON });
  asInbox(d);
  d.s.statuser = (st) => byStatus(st);
  await d.openInbox();
  const u = d.window.NOInbox.util;
  assert.deepEqual(["answered", "unread", "status"].map((k) => u.cycleLook(k, "").text), ["Showing answered and unanswered", "Showing read and unread", "Showing open"]);
  assert.ok(!["answered", "unread", "status"].some((k) => /messages/.test(u.cycleLook(k, "").text)), "no 'messages'");
  const b = d.$("ib-b-answered");
  await d.click(b); assert.equal(b.getAttribute("aria-label"), "Unanswered only"); assert.equal(b.getAttribute("data-v"), "unanswered");
  assert.ok(d.list().filter((c) => c.includes("answered=")).at(-1).includes("answered=unanswered"), "the filter sent matches the label");
  await d.click(b); assert.equal(b.getAttribute("aria-label"), "Answered only");
  assert.ok(d.list().filter((c) => c.includes("answered=")).at(-1).endsWith("answered=answered"));
  await d.click(b); assert.equal(b.getAttribute("aria-label"), "Showing answered and unanswered"); assert.equal(b.getAttribute("data-v"), "");
});

/* ---------- INBOX-FIX-6 (Coach Ed 2026-11-24) ---------- */
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test("INBOX-FIX-6 dark tooltip: in the dark theme the filter tooltip is a near-white bubble with navy text and a same-colour arrow; light stays the dark bubble", () => {
  const css = cssText();
  const dash = fs.readFileSync(path.join(JS, "..", "css", "dash.css"), "utf8");
  /* the dash is dark by default; light is html[data-theme="light"] or a light device with no theme: the dark rule is "not light", the light device restores the dark bubble */
  const dark = /html:not\(\[data-theme="light"\]\) body\.dash-app \.ib-ftip \{([^}]*)\}/.exec(css);
  assert.ok(dark, "a dark-theme rule");
  assert.match(dark[1], /background: var\(--bl-tip-bg, #F4F6FF\)/); assert.match(dark[1], /color: var\(--bl-tip-text, #0E1530\)/);
  assert.match(css, /html:not\(\[data-theme="light"\]\) body\.dash-app \.ib-ftip\.is-above::after \{ border-top-color: var\(--bl-tip-bg, #F4F6FF\); \}/);
  assert.match(css, /html:not\(\[data-theme="light"\]\) body\.dash-app \.ib-ftip\.is-below::after \{ border-bottom-color: var\(--bl-tip-bg, #F4F6FF\); \}/);
  assert.match(css, /@media \(prefers-color-scheme: light\) \{\s*html:not\(\[data-theme\]\) body\.dash-app \.ib-ftip \{ background: #1B2236; color: #fff;/, "a light device with no chosen theme keeps the dark bubble");
  /* the tokens the dash itself defines for the dark theme (body.dash-app default) */
  const m = /body\.dash-app \{\s*--bl-chip-warn-bg[^}]*--bl-tip-bg: (#[0-9A-Fa-f]{6}); --bl-tip-text: (#[0-9A-Fa-f]{6})/.exec(dash);
  assert.ok(m, "the dark tip tokens"); assert.deepEqual([m[1].toUpperCase(), m[2].toUpperCase()], ["#F4F6FF", "#0E1530"]);
  assert.ok(ratio(m[1], m[2]) >= 4.5, "text on the bubble: " + ratio(m[1], m[2]).toFixed(1) + ":1");
  assert.ok(ratio(m[1], "#111B44") >= 3 && ratio(m[1], "#0A1230") >= 3, "the bubble stands out from the dark card and the dark page");
  /* shape, placement and arrow stay the base rule's */
  const base = /\n\.ib-ftip \{([^}]*)\}/.exec(css)[1];
  assert.match(base, /border-radius: 10px/); assert.match(base, /position: fixed/);
});

test("INBOX-FIX-6 spacing and divider: the tab row leaves the dash's gap above the body (16, 24 from 900px); the divider uses the select border token", () => {
  const raw = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8"), css = cssText();
  assert.match(css, /#view-inbox \.ib-tabs-host \{[^}]*margin-bottom: 16px/);
  assert.match(css, /@media \(min-width: 900px\) \{ #view-inbox \.ib-tabs-host \{ padding-right: 164px; margin-bottom: 24px; \} \}/);
  const dash = fs.readFileSync(path.join(JS, "..", "css", "dash.css"), "utf8");
  assert.match(dash, /body\.dash-app \.col-main, body\.dash-app \.view \{ gap: 24px; \}/, "24px is the dash's own page gap from 900px");
  assert.match(dash, /body\.dash-app \.view \{ display: flex; flex-direction: column; gap: 16px; \}/);
  assert.doesNotMatch(raw.replace(/\/\*[\s\S]*?\*\//g, "").split("#view-inbox .ib-lhead {")[1].split("}")[0], /--card-line/, "not the barely visible card line");
  assert.match(dash, /--bl-select-line: #6474B0/); assert.ok(ratio("#6474B0", "#111B44") >= 3, "visible on the dark card");
});

test("INBOX-FIX-6 Inbox page: the tabs are the channels then Settings; Settings hides the filter row and list and shows the Inbox card; the address is /inbox/settings/", async () => {
  const d = boot({ listing: MIXED(), channels: CHANNELS_ON });
  const routed = [];
  d.window.NODash.go = (href) => { routed.push(href); d.window.NOInbox.setTab(/settings/.test(href) ? "settings" : ""); };
  await d.openInbox();
  assert.deepEqual(tabLabels(d), ["All messages", "Website chat", "Email", "FB Messenger", "FB Comments", "Settings"], "Settings is last, after FB Comments");
  assert.equal(d.$("ib-settings").hidden, true); assert.equal(d.$("ib-split").hidden, false);
  d.$("ib-tab-settings").fire("click"); await settle();
  assert.deepEqual(routed, ["/inbox/settings/"]);
  assert.equal(d.$("ib-tab-settings").getAttribute("aria-selected"), "true"); assert.equal(d.$("ib-tab-all").getAttribute("aria-selected"), "false");
  assert.equal(d.$("ib-split").hidden, true, "the list is hidden"); assert.equal(d.$("ib-tools-host").hidden, true);
  assert.equal(d.$("ib-settings").hidden, false); assert.equal(d.$("ibs-root").hidden, false); assert.equal(d.$("sg-root").hidden, true);
  assert.ok(d.list().some((c) => c === "GET " + BASE + "channels/"), "the Inbox settings card read its channels (same card, same calls)");
  assert.ok(d.$("ibs-root").textContent.includes("Inbox channels"), "the Inbox card is drawn into the tab");
  assert.equal(d.$("ib-settings").parentNode, d.$("ib-wrap"), "inside the page body, under the tabs");
  /* a channel tab on the settings tab goes back to the list with that channel on */
  d.$("ib-tab-email").fire("click"); await settle();
  assert.deepEqual(routed, ["/inbox/settings/", "/inbox/"]);
  assert.equal(d.$("ib-split").hidden, false); assert.equal(d.$("ib-settings").hidden, true); assert.equal(d.$("ibs-root").children.length, 0, "the card is emptied when its tab is left");
  assert.equal(d.$("ib-tab-email").getAttribute("aria-selected"), "true");
  d.window.NOInbox.hide(); await settle();
  assert.equal(d.$("ibs-root").children.length, 0);
});

test("INBOX-FIX-6 deep link: opening on the settings tab draws the tabs and the card straight away; the page scrolls (no ib-fixed) there", async () => {
  const d = boot({ listing: MIXED(), channels: CHANNELS_ON });
  d.window.NOInbox.show("inbox", "settings"); await settle();
  assert.equal(d.$("ib-tab-settings").getAttribute("aria-selected"), "true");
  assert.ok(d.$("ibs-root").textContent.includes("Inbox channels"));
  assert.equal(d.doc.body.classList.contains("ib-fixed"), false);
  d.window.NOInbox.setTab(""); await settle();
  assert.equal(d.doc.body.classList.contains("ib-fixed"), true);
  const u = d.window.NOInbox.util;
  assert.deepEqual([u.pathOf("inbox", ""), u.pathOf("inbox", "settings"), u.pathOf("inbox", "bulk")], ["/inbox/", "/inbox/settings/", "/inbox/"], "no Bulk SMS tab on the Inbox page");
  assert.deepEqual([u.pathOf("sms", ""), u.pathOf("sms", "bulk"), u.pathOf("sms", "settings")], ["/sms/", "/sms/bulk/", "/sms/settings/"]);
  assert.deepEqual(Array.from(u.pageTabs("sms"), (t) => t[1]), ["Inbox", "Bulk SMS", "Schedule SMS", "Settings"]);
  assert.equal(u.pathOf("sms", "schedule"), "/sms/schedule/"); assert.equal(u.pathOf("inbox", "schedule"), "/inbox/");
});

test("INBOX-FIX-6 SMS page: Inbox | Settings with Bulk SMS once the probe says so; New SMS and Bulk SMS on the same row; the SMS Gateway card in Settings", async () => {
  const d = boot({ listing: smsList(), channels: CH_SMS, smsStatus: SMS_STATUS });
  d.s.smsStatus = SMS_STATUS;
  d.s.bulkStatus = { available: true };
  const routed = [];
  d.window.NODash.go = (href) => { routed.push(href); d.window.NOInbox.setTab(/settings/.test(href) ? "settings" : /bulk/.test(href) ? "bulk" : ""); };
  await d.openSms();
  const row = d.all(d.$("ib-tabs-host"), "ib-toprow")[0];
  assert.deepEqual(row.children.map((n) => n.classList.contains("ib-tabs") ? "tabs" : n.classList.contains("ib-acts") ? "acts" : "?"), ["tabs"], "tabs only: New SMS and Bulk SMS left the top right (INBOX-FIX-7)");
  assert.equal(d.$("ib-tabs-host").textContent.includes("SMS Marketing"), false, "no visible page title");
  assert.deepEqual(d.all(row, "ib-tab").map((n) => n.textContent), d.$("ib-bulk-btn") ? ["Inbox", "Bulk SMS", "Settings"] : ["Inbox", "Settings"]);
  assert.equal(d.$("ib-tab-inbox").getAttribute("aria-selected"), "true");
  d.$("ib-tab-settings").fire("click"); await settle();
  assert.deepEqual(routed, ["/sms/settings/"]);
  assert.equal(d.$("sg-root").hidden, false); assert.equal(d.$("ibs-root").hidden, true); assert.equal(d.$("ibs-sms-root").hidden, false, "the Text messages (SMS) card sits with the gateway card"); assert.equal(d.$("ib-split").hidden, true);
  assert.ok(d.list().some((c) => c.includes("/sms-gateway/")), "the gateway card read its own API: same card, same calls");
  assert.ok(d.$("ibs-sw-sms"), "the SMS on/off switch is on the SMS Settings tab (INBOX-FIX-7)");
});

test("INBOX-FIX-6 router: the old Inbox and SMS Gateway addresses redirect to the tabs; the old views are gone; Settings has no empty tab", () => {
  const DASH = read("dashboard.js");
  assert.match(DASH, /"\/settings\/inbox\/": "\/inbox\/settings\/"/); assert.match(DASH, /"\/settings\/sms-gateway\/": "\/sms\/settings\/"/);
  assert.ok(DASH.includes('"/sms/bulk/": { view: "inbox", page: "sms", tab: "bulk", nav: "sms"'));
  assert.ok(DASH.includes('"/sms/settings/": { view: "inbox", page: "sms", tab: "settings", nav: "sms"'));
  assert.ok(!/ROUTES[\s\S]{0,3000}"\/settings\/(inbox|sms-gateway)\/": \{/.test(DASH.slice(0, DASH.indexOf("var MOVED"))), "no route of their own");
  assert.ok(!/settings-sms-gateway|settings-inbox/.test(DASH));
  assert.ok(!/id="view-settings-(inbox|sms-gateway)"/.test(HTML));
  assert.ok(!/data-sms-gateway-nav|href="\/settings\/(inbox|sms-gateway)\/"/.test(HTML), "no Settings tab, More tile or link points at the old addresses");
  assert.match(HTML, /<div class="pm-root" id="ibs-sms-root" hidden><\/div>/); assert.match(HTML, /<div class="sg-root" id="sg-root" hidden><\/div>/); assert.match(HTML, /<div class="pm-root" id="ibs-root" hidden><\/div>/);
  assert.match(HTML, /inbox\.js\?v=20261125f7/); assert.match(HTML, /dashboard\.js\?v=20261124r9b/); assert.match(HTML, /sms-gateway-settings\.css\?v=20261124ml11/);
  const css = cssText(), sg = fs.readFileSync(path.join(JS, "..", "css", "sms-gateway-settings.css"), "utf8");
  assert.ok(!/view-settings-(inbox|sms-gateway)/.test(css + sg), "the card styles follow the card to #ib-settings");
});

/* ---------- INBOX-FIX-7 (Coach Ed 2026-11-24) ---------- */

test("INBOX-FIX-7 bug 1: the split card no longer depends on a percentage height, so it fills the page again after the Settings tab (the list column is not squeezed)", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = /#view-inbox \.ib-split \{([^}]*)\}/.exec(css)[1];
  assert.match(rule, /grid-template-rows: minmax\(0, 1fr\)/, "the one row is as tall as the card, whatever stretch does");
  assert.doesNotMatch(rule, /height: 100%/, "no percentage height to resolve while the page was a normal (not fixed) page");
});

test("INBOX-FIX-7 bug 1: back from the Settings tab the list tab has its list, its filter row and the fixed layout again", async () => {
  const d = boot({ listing: MIXED(), channels: CHANNELS_ON });
  d.window.NODash.go = (href) => d.window.NOInbox.setTab(/settings/.test(href) ? "settings" : "");
  await d.openInbox();
  d.$("ib-tab-settings").fire("click"); await settle();
  assert.equal(d.$("ib-split").hidden, true);
  assert.equal(d.doc.body.classList.contains("ib-fixed"), false, "the settings tab is an ordinary page");
  d.$("ib-tab-all").fire("click"); await settle();
  assert.equal(d.$("ib-split").hidden, false);
  assert.equal(d.doc.body.classList.contains("ib-fixed"), true, "the fixed layout is back");
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 3);
  assert.equal(d.all(d.$("ib-lhead"), "ib-fbtn").length, 5);
  assert.equal(d.$("ib-settings").hidden, true);
});

test("INBOX-FIX-7 Refresh: it is the same as a fresh page load without reloading: filters at their defaults, search closed and empty, nothing selected, the list read again", async () => {
  const clock = makeClock(), d = boot({ clock, listing: MIXED(), reading: sthread(), channels: CHANNELS_ON });
  asInbox(d);
  d.s.statuser = (st) => byStatus(st);
  d.s.searcher = () => ({ items: [MIXED().items[0]], stored_next_cursor: null });
  await d.openInbox();
  await pickTab(d, "webchat");
  await d.click(d.$("ib-b-search")); await clock.advance(300);
  const inp = d.$("ib-q"); inp.value = "Ana"; inp.fire("input"); await clock.advance(300);
  await d.click(rowsOf(d)[0]);
  assert.ok(d.$("ib-threadpane").textContent.includes("Ana Reyes"), "a conversation is open");
  assert.equal(d.doc.body.classList.contains("ib-thread"), true);
  await pickChip(d, "unread"); await pickChip(d, "answered"); await pickChip(d, "closed");
  assert.deepEqual(["ib-b-answered", "ib-b-read", "ib-b-status"].map((id) => d.$(id).getAttribute("data-v")), ["answered", "1", "closed"], "the filters are off their defaults");
  const n = d.calls.length;
  await d.click(d.$("ib-refresh-btn")); await clock.advance(100);
  /* filters */
  assert.deepEqual(["ib-b-answered", "ib-b-read", "ib-b-status"].map((id) => d.$(id).getAttribute("data-v")), ["", "", "open"], "Answered all, Read all, Open");
  assert.equal(d.$("ib-b-status").getAttribute("aria-label"), "Showing open");
  assert.equal(d.$("ib-tab-all").getAttribute("aria-selected"), "true", "the channel tab is All messages again");
  /* the search */
  assert.equal(d.$("ib-b-search").getAttribute("aria-expanded"), "false", "the search is closed");
  assert.equal(d.$("ib-q").value, "", "and empty");
  assert.equal(d.all(d.$("ib-lhead"), "ib-search")[0].hidden, true);
  /* the pane */
  assert.ok(d.$("ib-threadpane").textContent.includes("Choose a conversation"), "no conversation selected");
  assert.ok(!d.$("ib-threadpane").textContent.includes("Ana Reyes"));
  assert.equal(d.doc.body.classList.contains("ib-thread"), false, "a phone is back on the list");
  assert.equal(d.all(d.$("ib-list"), "ib-item").some((r) => r.classList.contains("is-sel")), false);
  /* the list was read again with the default query only */
  const reads = d.calls.slice(n).filter((c) => c.method === "GET" && c.path.startsWith(LIST_NOQ) && !/conversations\/[^/?]+\/$/.test(c.path)).map((c) => c.path);
  assert.ok(reads.length >= 1 && reads.every((p) => p === LIST_PATH), "read again as a fresh load: " + reads.join(" "));
  assert.ok(!d.calls.slice(n).some((c) => c.path === THREAD_PATH), "the open conversation is not read again");
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 1, "the Open conversations (the stand-in answers one open row)");
});

test("INBOX-FIX-7 Open/Closed: two states only, Open (default) then Closed then Open; the words are Showing open / Showing closed; the default query is open", async () => {
  const d = boot({ listing: MIXED(), channels: CHANNELS_ON });
  asInbox(d);
  d.s.statuser = (st) => byStatus(st);
  await d.openInbox();
  const b = d.$("ib-b-status");
  assert.ok(d.list().includes("GET " + LIST_PATH), "the page loads with status=open");
  assert.deepEqual([b.getAttribute("data-v"), b.getAttribute("aria-label"), b.getAttribute("aria-pressed")], ["open", "Showing open", "false"]);
  await d.click(b);
  assert.deepEqual([b.getAttribute("data-v"), b.getAttribute("aria-label"), b.getAttribute("aria-pressed")], ["closed", "Showing closed", "true"]);
  assert.equal(d.calls.at(-1).path.includes("status=closed") || d.calls.some((c) => c.path.includes("status=closed")), true);
  await d.click(b);
  assert.deepEqual([b.getAttribute("data-v"), b.getAttribute("aria-label")], ["open", "Showing open"], "the next press is Open again, never all");
  assert.equal(d.calls.filter((c) => /status=(all|)(&|$)/.test(c.path)).length, 0);
  assert.ok(!d.calls.some((c) => c.method === "GET" && /conversations\/\?channel=nosms$/.test(c.path)), "no read without a status");
  /* the tooltip shows the state's words at once */
  b.fire("mouseenter");
  assert.equal(d.$("ib-b-status-tip").textContent, "Showing open");
  await d.click(b);
  assert.equal(d.$("ib-b-status-tip").textContent, "Showing closed", "live update, no delay");
});

test("INBOX-FIX-7 SMS Marketing: the empty right pane invites Send New SMS (primary), which opens the New SMS form; Back brings the invitation back", async () => {
  const d = boot({ listing: smsList(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS;
  await d.openSms();
  assert.equal(d.all(d.$("ib-tabs-host"), "ib-acts").length, 0, "no New SMS / Bulk SMS at the top right");
  const t = d.$("ib-threadpane");
  assert.ok(!t.textContent.includes("Choose a conversation"), "no Choose a conversation here");
  const cta = d.$("ib-newtext-btn");
  assert.ok(cta && cta.textContent === "Send New SMS" && cta.classList.contains("no-btn-primary"));
  assert.equal(cta.parentNode.parentNode.parentNode, t, "inside the right pane's empty box");
  await d.click(cta);
  assert.ok(d.$("ib-sms-t"), "the New SMS form is open");
  assert.equal(d.$("ib-newtext-btn"), null);
  await d.click(d.$("ib-back"));
  assert.ok(d.$("ib-newtext-btn"), "back to the invitation");
  /* the Inbox page keeps Choose a conversation */
  const inbox = boot({ listing: MIXED(), channels: CH_SMS });
  await inbox.openInbox();
  assert.ok(inbox.$("ib-threadpane").textContent.includes("Choose a conversation"));
  assert.equal(inbox.$("ib-newtext-btn"), null);
});

test("INBOX-FIX-7 SMS Marketing on a phone: Send New SMS also sits at the top of the list (the right pane is hidden there), hidden from 900 px up; no button without sms", async () => {
  const d = boot({ listing: smsList(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS;
  await d.openSms();
  const ph = d.$("ib-newtext-phone");
  assert.ok(ph && ph.textContent === "Send New SMS" && ph.classList.contains("ib-nt-phone"));
  assert.equal(ph.parentNode, d.$("ib-tools-host"), "in the row above the list");
  await d.click(ph);
  assert.ok(d.$("ib-sms-t"), "it opens the same New SMS form");
  const css = cssText();
  assert.match(css, /@media \(min-width: 900px\) \{ #view-inbox \.ib-nt-phone \{ display: none; \}/);
  const off = boot({ listing: MIXED(), channels: CHANNELS_ON });
  await off.openInbox();
  assert.equal(off.$("ib-newtext-phone"), null);
});

test("INBOX-FIX-7 Refresh on SMS Marketing: back to the empty state with Send New SMS, filters at their defaults", async () => {
  const d = boot({ listing: smsList(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS;
  await d.openSms();
  await d.click(d.$("ib-newtext-btn"));
  assert.ok(d.$("ib-sms-t"));
  await d.click(d.$("ib-b-status"));
  assert.equal(d.$("ib-b-status").getAttribute("data-v"), "closed");
  await d.click(d.$("ib-refresh-btn"));
  assert.equal(d.$("ib-sms-t"), null, "the New SMS form is closed");
  assert.ok(d.$("ib-newtext-btn"), "the invitation is back");
  assert.equal(d.$("ib-b-status").getAttribute("data-v"), "open");
});

/* ---------- Round 9 (Coach Ed 2026-11-24): a reply turns the Unanswered "!" into the check at once ---------- */
const stOf = (d, i) => d.all(rowsOf(d)[i], "cm-st")[0];
const unansList = () => list({ items: list().items.map((i) => ({ ...i, answered: false })) });
const bangs = (d) => rowsOf(d).filter((r) => d.all(r, "cm-st-no").length).length;

test("round 9: a reply sent in an Unanswered conversation turns its row's ! into the check without a list reload", async () => {
  const d = boot({ withComments: true, listing: unansList() });
  await d.openInbox();
  assert.equal(bangs(d), 2, "both rows start Unanswered");
  await d.click(rowsOf(d)[0]);
  d.$("ib-rb").value = "Opo, available pa."; d.$("ib-rb").fire("input");
  const lists = () => d.list().filter((c) => c.startsWith("GET " + BASE + "conversations/?")).length;
  const before = lists();
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  assert.equal(stOf(d, 0).getAttribute("aria-label"), "Answered");
  assert.ok(d.all(rowsOf(d)[0], "cm-st-ok").length === 1 && d.all(rowsOf(d)[0], "cm-st-no").length === 0, "the row shows the check");
  assert.equal(stOf(d, 1).getAttribute("aria-label"), "Unanswered", "the other row is untouched");
  assert.equal(bangs(d), 1, "the Unanswered count dropped by one");
  assert.equal(lists(), before, "no list read was needed");
});

test("round 9: a reply that failed leaves the row Unanswered", async () => {
  const d = boot({ withComments: true, listing: unansList(), reply: { state: "failed", error_code: "email_failed", created_at: iso(0) } });
  await d.openInbox();
  await d.click(rowsOf(d)[0]);
  d.$("ib-rb").value = "Opo."; d.$("ib-rb").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  assert.equal(bangs(d), 2);
  assert.equal(stOf(d, 0).getAttribute("aria-label"), "Unanswered");
});

test("round 9: a refused reply (HTTP error) leaves the row Unanswered", async () => {
  const d = boot({ withComments: true, listing: unansList() });
  await d.openInbox();
  await d.click(rowsOf(d)[0]);
  d.s.replyAnswer = { status: 422, body: { error: { code: "invalid", message: "No." } } };
  d.$("ib-rb").value = "Opo."; d.$("ib-rb").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  assert.equal(bangs(d), 2);
});

test("round 9: with the Unanswered filter on, the replied row stays (as a check) until the filter changes, and the count of ! drops", async () => {
  const d = boot({ withComments: true, listing: unansList() });
  await d.openInbox();
  await pickChip(d, "unanswered");
  assert.equal(bangs(d), 2);
  await d.click(rowsOf(d)[1]);
  d.$("ib-rb").value = "Opo."; d.$("ib-rb").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  assert.equal(rowsOf(d).length, 2, "the row is not yanked from under the user");
  assert.equal(bangs(d), 1);
  assert.equal(stOf(d, 1).getAttribute("aria-label"), "Answered");
});

test("INBOX-FIX-9 F4: an accepted reply puts the reply's words and the time of now in the row at once; a failed or refused reply changes nothing", async () => {
  const d = boot({ withComments: true, listing: unansList() });
  await d.openInbox();
  const oldSnip = d.all(rowsOf(d)[0], "ib-snip")[0].textContent, oldTime = d.all(rowsOf(d)[0], "ib-time")[0].textContent;
  assert.equal(oldSnip, "Hi po, available pa ba?");
  await d.click(rowsOf(d)[0]);
  d.$("ib-rb").value = "Opo, available pa."; d.$("ib-rb").fire("input");
  const lists = () => d.list().filter((c) => c.startsWith("GET " + BASE + "conversations/?")).length, before = lists();
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  assert.equal(d.all(rowsOf(d)[0], "ib-snip")[0].textContent, "Opo, available pa.", "the preview is the reply");
  assert.notEqual(d.all(rowsOf(d)[0], "ib-time")[0].textContent, oldTime, "the time is now, not the old message's");
  assert.equal(d.all(rowsOf(d)[0], "ib-snip")[0].textContent.includes("Hi po"), false);
  assert.equal(d.all(rowsOf(d)[1], "ib-snip")[0].textContent, "Magkano po?", "the other row is untouched");
  assert.equal(lists(), before, "no list read was needed");
  const f = boot({ withComments: true, listing: unansList(), reply: { state: "failed", error_code: "email_failed", created_at: iso(0) } });
  await f.openInbox(); await f.click(rowsOf(f)[0]);
  f.$("ib-rb").value = "Opo."; f.$("ib-rb").fire("input");
  await f.click(f.press(f.$("ib-threadpane"), "Send"));
  assert.equal(f.all(rowsOf(f)[0], "ib-snip")[0].textContent, "Hi po, available pa ba?", "a failed reply leaves the preview");
});

test("INBOX-FIX-9 F5: the conversation head keeps its 69px and its three lines fit inside it with explicit line heights", () => {
  const css = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /#view-inbox \.ib-thead \{ box-sizing: border-box; height: 69px;/, "the bottom line stays level with the list's");
  assert.match(css, /\.ib-thead:not\(\.ib-thead-new\) \.ib-tname h2 \{ font-size: 17px; line-height: 20px; \}/);
  assert.match(css, /\.ib-thead:not\(\.ib-thead-new\) \.ib-chrow \.chip \{ min-height: 22px; line-height: 20px; \}/);
  assert.match(css, /\.ib-thead:not\(\.ib-thead-new\) \.ib-sub \{ line-height: 16px; \}/);
  const pad = /\.ib-thead:not\(\.ib-thead-new\) \{ padding-top: (\d+)px; padding-bottom: (\d+)px; \}/.exec(css), gap = /\.ib-thead:not\(\.ib-thead-new\) \.ib-tname \{ gap: (\d+)px; \}/.exec(css);
  assert.ok(pad && gap);
  assert.ok(Number(pad[1]) + Number(pad[2]) + 1 + 20 + 22 + 16 + 2 * Number(gap[1]) <= 69, "name, chips and email plus padding and the border fit in 69px");
});
