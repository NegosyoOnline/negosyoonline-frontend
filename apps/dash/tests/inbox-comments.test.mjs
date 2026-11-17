/* Inbox > Comments (ClickUp z8uq9mg9ph, COMMENTS C3 FE). The real scripts (app.js, inbox.js, inbox-comments.js) run in a vm with the
   small stand-in document from dom.mjs and a recorded fetch that plays the C1 contract (backend docs/contracts/comments-api-c1.md).
   Fake data only: no Facebook call, no real comment. */
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
const CB = `/sites/${A}/inquiries/comments/`;
const R1 = "cm_000000000000000000000001", R2 = "cm_000000000000000000000002", R3 = "cm_000000000000000000000003";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const FIXED_NOW = Date.parse("2026-11-18T02:00:00Z");
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(FIXED_NOW); else super(...a); }
  static now() { return FIXED_NOW; }
};
const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();

const OK = { available: true, reason: "" };
function item(over = {}) {
  return { ref: R1, author_name: "Maria Santos", text: "How much is the medium?", created_at: iso(30), unread: true, answered: false, hidden: false, is_reply: false,
    post: { id: "1_2", is_ad: false, permalink: "https://www.facebook.com/1_2", caption: "Fresh mangoes, 3 kilos for 500 pesos" },
    public_reply: { ...OK, replied_at: null }, private_reply: { ...OK, replied_at: null, expires_at: iso(-60 * 24 * 6) }, hide: { ...OK }, ...over };
}
function listing(over = {}) {
  return { items: [
    item(),
    item({ ref: R2, author_name: "Jun Dela Cruz", text: "Is this still available?", unread: false, answered: true, post: { id: "1_3", is_ad: true, permalink: null, caption: "Summer sale ad" } }),
    item({ ref: R3, author_name: "Ana Reyes", text: "Thanks!", unread: false, hidden: true })
  ], next_cursor: null, unread_total: 1, ...over };
}
function detail(over = {}) {
  return { ...item(), replies: [{ ref: "cm_x", author_name: "Ana Store Page", is_page: true, text: "Hello Maria!", created_at: iso(20) }], actions: [], ...over };
}

function makeClock() {
  let now = 0, seq = 0, timers = [];
  return {
    setTimeout(fn, ms) { const id = ++seq; timers.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout(id) { timers = timers.filter((t) => t.id !== id); },
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
}

/* The stand-in API. `s` holds what the comment routes answer; a route set to {status, body} answers that. */
function boot({ on = true, status = { enabled: true, connected: true, page_name: "Ana Store Page", ready: true, reason: "" }, clock = null } = {}) {
  const doc = makeDocument(), calls = [], toasts = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; n.dispatchEvent = (e) => n.fire(e.type); return n; };
  doc.createTextNode = (t) => { const w = make("span"); w.textContent = t; return w.firstChild; };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["ib-root", "ib-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const nav = [0, 1].map(() => { const a = doc.createElement("a"); a.setAttribute("data-inbox-nav", ""); a.hidden = true; page.appendChild(a); return a; });
  doc.querySelectorAll = (sel) => (sel === "[data-inbox-nav]" ? nav : []);
  const s = { on, status, listing: listing(), detail: detail(), listAnswer: null, detailAnswer: null, replyAnswer: null, privateAnswer: null, hideAnswer: null,
    searcher: null };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    let a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    if (opts.method === "GET" && p === "/sites/") a = { status: 200, body: { items: [{ id: A, template: "sante" }], next_cursor: null } };
    else if (p === `/sites/${A}/inquiries/channels/`) a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    else if (p === `/sites/${A}/inquiries/conversations/` && opts.method === "GET") a = { status: 200, body: { items: [], stored_next_cursor: null } };
    else if (p.indexOf(CB) === 0 && !s.on) a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    else if (p === CB + "status/") a = { status: 200, body: s.status };
    else if (/\/read\/$/.test(p)) a = { status: 200, body: { ...s.detail, unread: false } };
    else if (/\/private-reply\/$/.test(p)) a = s.privateAnswer || { status: 200, body: { state: "sent", error_code: "", created_at: iso(0), comment: { ...item(), answered: true, unread: false, private_reply: { available: false, reason: "already_sent", replied_at: iso(0), expires_at: null } } } };
    else if (/\/reply\/$/.test(p)) a = s.replyAnswer || { status: 200, body: { state: "sent", error_code: "", created_at: iso(0), comment: { ...item(), answered: true, unread: false } } };
    else if (/\/hide\/$/.test(p)) a = s.hideAnswer || { status: 200, body: { state: "sent", error_code: "", created_at: iso(0), comment: { ...item(), hidden: true, hide: { available: false, reason: "already_hidden" } } } };
    else if (new RegExp("^" + CB.replace(/\//g, "\\/") + "cm_[0-9a-f]+\\/$").test(p) && opts.method === "GET") a = s.detailAnswer || { status: 200, body: s.detail };
    else if (p.indexOf(CB) === 0 && (p === CB || p.indexOf(CB + "?") === 0) && opts.method === "GET") {
      const q = /[?&]q=([^&]*)/.exec(p);
      a = s.listAnswer || { status: 200, body: q && s.searcher ? s.searcher(decodeURIComponent(q[1])) : s.listing };
    }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const inert = (fn, ms) => (ms >= 5000 ? 0 : setTimeout(fn, ms)), inertClear = (t) => { if (t) clearTimeout(t); };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const location = { search: "", pathname: "/inbox/", replace() {}, assign() {}, href: "" };
  const context = vm.createContext({ window, document: doc, Event: class { constructor(type) { this.type = type; } }, location, console, URLSearchParams, Promise, Intl, Uint8Array, Date,
    setTimeout: clock ? clock.setTimeout : (fn, ms) => (ms >= 300 && ms !== 300 ? 0 : setTimeout(fn, ms)), clearTimeout: clock ? clock.clearTimeout : inertClear, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  void inert;
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("inbox.js"), context, { filename: "inbox.js" });
  vm.runInContext(read("inbox-comments.js"), context, { filename: "inbox-comments.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  const all = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const d = { doc, calls, toasts, s, $, all, buttons, window,
    press: (n, label) => buttons(n).find((b) => b.textContent === label),
    paths: () => calls.map((c) => c.method + " " + c.path),
    async openInbox() { window.NOInbox.show(); await settle(); },
    async click(node) { node.fire("click"); await settle(); },
    async tab(name) { await d.click($("ib-tab-" + name)); },
    rows: () => all($("cm-list") || d.doc.body, "ib-item"),
    async openRow(i) { await d.click(d.rows()[i]); },
    async type(id, v) { const n = $(id); n.value = v; n.fire("input"); await settle(); },
    async pick(id, v) { const n = $(id); n.value = v; n.fire("change"); await settle(); },
    shown: (id) => !$(id).hidden };
  return d;
}
const text = (n) => n.textContent;

/* ---------- availability ---------- */

test("comments off (status 404): no tab, the conversations view as before, nothing else asked of the comments routes", async () => {
  const d = boot({ on: false });
  await d.openInbox();
  assert.equal(d.$("ib-tabs").hidden, true);
  assert.equal(d.$("ib-tab-comments"), null);
  assert.deepEqual(d.paths().filter((p) => p.indexOf(CB) >= 0), ["GET " + CB + "status/"]);
});

test("comments on: the Conversations and Comments tabs show, with the unread count on Comments", async () => {
  const d = boot();
  await d.openInbox();
  assert.equal(d.$("ib-tabs").hidden, false);
  assert.equal(text(d.$("ib-tab-chats")), "Conversations");
  assert.equal(text(d.$("ib-tab-comments")), "Comments1");
  assert.equal(d.$("ib-tab-chats").getAttribute("aria-selected"), "true");
  assert.equal(d.$("ib-cwrap").hidden, true);
});

test("status enabled false is treated as off", async () => {
  const d = boot({ status: { enabled: false } });
  await d.openInbox();
  assert.equal(d.$("ib-tabs").hidden, true);
});

/* ---------- list ---------- */

test("the Comments tab lists name, comment, post with the Ad badge, answered state, read and unread, newest as given", async () => {
  const d = boot();
  await d.openInbox();
  await d.tab("comments");
  assert.equal(d.$("ib-wrap").hidden, true);
  assert.equal(d.$("ib-cwrap").hidden, false);
  const rows = d.rows();
  assert.equal(rows.length, 3);
  assert.ok(text(rows[0]).includes("Maria Santos") && text(rows[0]).includes("How much is the medium?") && text(rows[0]).includes("Fresh mangoes"));
  assert.ok(rows[0].classList.contains("ib-unread"), "unread like the conversation list");
  assert.ok(!rows[1].classList.contains("ib-unread"));
  assert.ok(text(rows[0]).includes("Unanswered") && !text(rows[0]).includes("Ad"), "no Ad badge on a plain post");
  assert.ok(text(rows[1]).includes("Answered") && text(rows[1]).includes("Ad") && text(rows[1]).includes("Summer sale ad"));
  assert.ok(text(rows[2]).includes("Hidden"));
  assert.equal(d.all(rows[0], "ib-rs-u").length, 1);
  assert.equal(d.all(rows[1], "ib-rs-r").length, 1);
  assert.ok(d.paths().filter((p) => p === "GET " + CB).length >= 1 && !d.paths().some((p) => p.indexOf(CB + "?") === 4), "no filter, no query string");
});

test("a name or comment with markup reaches the page as text only", async () => {
  const d = boot();
  d.s.listing = listing({ items: [item({ author_name: "<b>Eve</b>", text: "<img src=x onerror=alert(1)>" })] });
  await d.openInbox(); await d.tab("comments");
  const row = d.rows()[0];
  assert.ok(text(row).includes("<b>Eve</b>") && text(row).includes("<img src=x"));
  assert.equal(row.all((n) => n.tagName === "IMG").length, 0);
});

test("an empty list says so and keeps the toolbar", async () => {
  const d = boot();
  d.s.listing = listing({ items: [], unread_total: 0 });
  await d.openInbox(); await d.tab("comments");
  assert.ok(text(d.$("cm-listbody")).includes("No comments yet."));
  assert.ok(d.$("cm-q") && d.$("cm-refresh-btn"));
});

test("a failed list read shows the error text and Refresh tries again", async () => {
  const d = boot();
  d.s.listAnswer = { status: 500, body: { error: { code: "server", message: "x" } } };
  await d.openInbox(); await d.tab("comments");
  assert.ok(text(d.$("cm-listbody")).includes("Comments could not be loaded. Try Refresh."));
  d.s.listAnswer = null;
  await d.click(d.$("cm-refresh-btn"));
  assert.equal(d.rows().length, 3);
});

test("Show more asks with the cursor and appends without duplicates", async () => {
  const d = boot();
  d.s.listing = listing({ next_cursor: "abc 1" });
  await d.openInbox(); await d.tab("comments");
  const more = d.press(d.$("cm-listbody"), "Show more comments");
  assert.ok(more);
  d.s.listing = listing({ items: [item({ ref: "cm_00000000000000000000000a", author_name: "Zed" }), item({ ref: R1 })], next_cursor: null });
  await d.click(more);
  assert.ok(d.paths().includes("GET " + CB + "?cursor=abc%201"));
  assert.equal(d.rows().length, 4);
  assert.equal(d.press(d.$("cm-listbody"), "Show more comments"), undefined);
});

/* ---------- toolbar: filters and search ---------- */

test("the filters show their real defaults and send nothing until changed", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  const inputs = d.$("cm-tools-host").all((n) => n.tagName === "INPUT" && n.classList.contains("ib-combo-input"));
  assert.deepEqual(inputs.map((i) => i.value), ["All posts", "All"]);
  assert.ok(inputs.every((i) => i.getAttribute("placeholder") === null));
  assert.equal(d.$("cm-tools-host").all((n) => n.tagName === "SELECT" && !n.classList.contains("ib-combo-native")).length, 0, "no visible native select");
});

test("Ads only, Posts only, Unanswered and Answered ask the API", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  await d.pick("cm-scope", "ad");
  await d.pick("cm-answered", "unanswered");
  assert.ok(d.paths().includes("GET " + CB + "?scope=ad"));
  assert.ok(d.paths().includes("GET " + CB + "?scope=ad&answered=unanswered"));
  await d.pick("cm-scope", "post");
  await d.pick("cm-answered", "answered");
  assert.ok(d.paths().includes("GET " + CB + "?scope=post&answered=unanswered"));
  assert.ok(d.paths().includes("GET " + CB + "?scope=post&answered=answered"));
  await d.pick("cm-scope", "all");
  await d.pick("cm-answered", "all");
  assert.equal(d.paths().at(-1), "GET " + CB);
});

test("a filter whose read fails puts the old value back and says so", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  d.s.listAnswer = { status: 500, body: { error: { code: "server", message: "Try later." } } };
  await d.pick("cm-scope", "ad");
  assert.equal(d.$("cm-scope").value, "all");
  assert.equal(d.toasts.length, 1);
  assert.equal(d.rows().length, 3, "the list stays");
});

test("search is live: 300 ms after the last key, 2 characters or more, no search button", async () => {
  const clock = makeClock();
  const d = boot({ clock });
  await d.openInbox(); await d.tab("comments");
  assert.equal(d.buttons(d.$("cm-tools-host")).filter((b) => /search/i.test(b.textContent)).length, 0);
  d.s.searcher = (q) => listing({ items: [item({ author_name: "Match " + q })] });
  await d.type("cm-q", "m");
  await clock.advance(400);
  assert.ok(!d.paths().some((p) => p.includes("q=")), "one character is the normal list");
  await d.type("cm-q", "ma");
  await clock.advance(299);
  assert.ok(!d.paths().some((p) => p.includes("q=")));
  await clock.advance(1);
  assert.ok(d.paths().includes("GET " + CB + "?q=ma"));
  assert.ok(text(d.rows()[0]).includes("Match ma"));
  await d.type("cm-q", "");
  await clock.advance(300);
  assert.equal(d.paths().at(-1), "GET " + CB, "cleared: the normal list again");
});

test("search and filters combine in one query", async () => {
  const clock = makeClock();
  const d = boot({ clock });
  await d.openInbox(); await d.tab("comments");
  await d.pick("cm-scope", "ad");
  await d.type("cm-q", "price");
  await clock.advance(300);
  assert.ok(d.paths().includes("GET " + CB + "?scope=ad&q=price"));
});

/* ---------- read, reply, private reply, hide ---------- */

test("opening an unread comment marks it read: the dot, the tab count and the server", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  assert.ok(d.paths().includes("POST " + CB + R1 + "/read/"));
  assert.ok(!d.rows()[0].classList.contains("ib-unread"));
  assert.equal(text(d.$("ib-tab-comments")), "Comments");
  assert.ok(d.paths().includes("GET " + CB + R1 + "/"));
  const det = d.$("cm-detail");
  assert.ok(text(det).includes("How much is the medium?") && text(det).includes("Hello Maria!"));
  assert.equal(d.all(det, "ib-msg-out").length, 1, "the Page's own reply sits on the owner side");
  const before = d.paths().filter((p) => p.endsWith("/read/")).length;
  await d.openRow(1);
  assert.equal(d.paths().filter((p) => p.endsWith("/read/")).length, before);
});

test("the post link is shown only for a facebook.com https address", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  assert.equal(d.$("cm-detail").all((n) => n.tagName === "A")[0].getAttribute("href"), "https://www.facebook.com/1_2");
  d.s.detail = detail({ post: { id: "1", is_ad: false, permalink: "https://evil.example/x", caption: "c" } });
  await d.openRow(2);
  assert.equal(d.$("cm-detail").all((n) => n.tagName === "A").length, 0);
});

test("a public reply posts text with an idempotency key, then clears the box and marks the comment answered", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  const ta = d.$("cm-rb");
  ta.value = "  It is 150 pesos.  "; ta.fire("input");
  assert.equal(d.$("cm-rc").textContent, "20 / 500");
  await d.click(d.press(d.$("cm-detail"), "Send"));
  const call = d.calls.find((c) => c.method === "POST" && c.path === CB + R1 + "/reply/");
  assert.equal(call.body.text, "It is 150 pesos.");
  assert.match(call.body.idempotency_key, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(d.$("cm-rb").value, "");
  assert.ok(text(d.rows()[0]).includes("Answered"));
  assert.ok(d.paths().filter((p) => p === "GET " + CB + R1 + "/").length >= 2, "the detail is read again for the new reply");
});

test("a reply that Facebook refused shows a fixed text, keeps the text, and a retry reuses nothing stale", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  d.$("cm-rb").value = "Hello"; d.$("cm-rb").fire("input");
  d.s.replyAnswer = { status: 200, body: { state: "failed", error_code: "rate_limited", created_at: iso(0), comment: item() } };
  await d.click(d.press(d.$("cm-detail"), "Send"));
  assert.ok(text(d.$("cm-detail")).includes("Facebook is limiting replies right now. Try again in a few minutes."));
  assert.equal(d.$("cm-rb").value, "Hello");
  assert.ok(d.press(d.$("cm-detail"), "Try again"));
  d.s.replyAnswer = null;
  await d.click(d.press(d.$("cm-detail"), "Try again"));
  assert.equal(d.$("cm-rb").value, "");
  assert.ok(!text(d.$("cm-detail")).includes("limiting"));
});

test("a lost answer keeps the idempotency key so the retry cannot send twice", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  d.$("cm-rb").value = "Hello"; d.$("cm-rb").fire("input");
  d.s.replyAnswer = { status: 500, body: { error: { code: "server", message: "Oops." } } };
  await d.click(d.press(d.$("cm-detail"), "Send"));
  assert.ok(text(d.$("cm-detail")).includes("Oops."));
  const keys = [];
  d.s.replyAnswer = null;
  await d.click(d.press(d.$("cm-detail"), "Try again"));
  d.calls.filter((c) => c.path === CB + R1 + "/reply/").forEach((c) => keys.push(c.body.idempotency_key));
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1], "an answered error is final: the next attempt is a new request");
});

test("Message privately switches the box and posts to private-reply with a 1000 character limit", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  await d.click(d.press(d.$("cm-detail"), "Message privately"));
  assert.equal(d.$("cm-rc").textContent, "0 / 1000");
  assert.equal(d.press(d.$("cm-detail"), "Message privately").getAttribute("aria-pressed"), "true");
  d.$("cm-rb").value = "Hi Maria, the medium is 150."; d.$("cm-rb").fire("input");
  await d.click(d.press(d.$("cm-detail"), "Send"));
  const call = d.calls.find((c) => c.method === "POST" && c.path === CB + R1 + "/private-reply/");
  assert.equal(call.body.text, "Hi Maria, the medium is 150.");
  assert.match(call.body.idempotency_key, /^[A-Za-z0-9_-]{8,64}$/);
  assert.ok(!d.calls.some((c) => c.path === CB + R1 + "/reply/"), "not sent as a public reply");
});

test("private reply after 7 days: the mode is off with the plain note, and the public reply still works", async () => {
  const d = boot();
  d.s.detail = detail({ private_reply: { available: false, reason: "window_closed", replied_at: null, expires_at: iso(60) } });
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  const det = d.$("cm-detail");
  assert.ok(text(det).includes("Private reply is only possible within 7 days of the comment."));
  assert.equal(d.press(det, "Message privately").getAttribute("aria-disabled"), "true");
  assert.equal(d.$("cm-rb").disabled, false, "the public box is open");
  await d.click(d.press(det, "Message privately"));
  assert.equal(d.press(d.$("cm-detail"), "Message privately").getAttribute("aria-pressed"), "false", "the disabled mode does not open");
});

test("a private message already sent: off with its note", async () => {
  const d = boot();
  d.s.detail = detail({ private_reply: { available: false, reason: "already_sent", replied_at: iso(5), expires_at: null } });
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  assert.ok(text(d.$("cm-detail")).includes("A private message was already sent for this comment."));
});

test("a comment that only allows a private reply opens in that mode, and with nothing allowed the box is off with the reason", async () => {
  const d = boot();
  d.s.listing = listing({ items: [item({ public_reply: { available: false, reason: "reconnect" } })] });
  d.s.detail = detail({ public_reply: { available: false, reason: "reconnect" } });
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  assert.equal(d.$("cm-rc").textContent, "0 / 1000");
  d.s.listing = listing({ items: [item({ ref: R2 })] });
  const off = { available: false, reason: "reconnect" };
  d.s.detail = detail({ ref: R2, public_reply: off, private_reply: off, hide: off });
  await d.click(d.$("cm-refresh-btn"));
  await d.openRow(0);
  assert.equal(d.$("cm-rb").disabled, true);
  assert.equal(d.all(d.$("cm-detail"), "cm-note").length, 1, "one distinct sentence once");
  assert.ok(text(d.$("cm-detail")).includes("Reconnect your Facebook Page to reply."));
});

test("a 409 window_closed on a send shows the note and reads the comment again", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  await d.click(d.press(d.$("cm-detail"), "Message privately"));
  d.$("cm-rb").value = "Hi"; d.$("cm-rb").fire("input");
  d.s.privateAnswer = { status: 409, body: { error: { code: "window_closed", message: "Meta words" } } };
  d.s.detail = detail({ private_reply: { available: false, reason: "window_closed", replied_at: null, expires_at: iso(1) } });
  const reads = d.paths().filter((p) => p === "GET " + CB + R1 + "/").length;
  await d.click(d.press(d.$("cm-detail"), "Send"));
  const det = text(d.$("cm-detail"));
  assert.ok(det.includes("Private reply is only possible within 7 days of the comment."));
  assert.ok(!det.includes("Meta words"));
  assert.equal(d.paths().filter((p) => p === "GET " + CB + R1 + "/").length, reads + 1);
});

test("Hide asks first: Cancel sends nothing, Hide sends, then the comment shows Hidden and Hide is off", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  assert.equal(d.$("cm-hide-yes"), null);
  await d.click(d.$("cm-hide-btn"));
  assert.ok(text(d.$("cm-detail")).includes("Hide this comment on Facebook? You cannot unhide it from here."));
  await d.click(d.press(d.$("cm-detail"), "Cancel"));
  assert.equal(d.$("cm-hide-yes"), null);
  assert.ok(!d.calls.some((c) => c.path.endsWith("/hide/")));
  await d.click(d.$("cm-hide-btn"));
  await d.click(d.$("cm-hide-yes"));
  assert.ok(d.calls.some((c) => c.method === "POST" && c.path === CB + R1 + "/hide/"));
  assert.ok(text(d.rows()[0]).includes("Hidden"));
  assert.equal(d.$("cm-hide-btn").disabled, true);
  assert.equal(d.$("cm-hide-yes"), null);
});

test("a hide that failed says why and leaves the comment visible", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  d.s.hideAnswer = { status: 200, body: { state: "failed", error_code: "token_invalid", created_at: iso(0), comment: item() } };
  await d.click(d.$("cm-hide-btn")); await d.click(d.$("cm-hide-yes"));
  assert.deepEqual(d.toasts, ["That did not work: Reconnect your Facebook Page to reply."]);
  assert.ok(!text(d.rows()[0]).includes("Hidden"));
});

test("an own comment: every action is off with the same single note", async () => {
  const d = boot();
  const off = { available: false, reason: "own_comment" };
  d.s.detail = detail({ public_reply: off, private_reply: off, hide: off });
  await d.openInbox(); await d.tab("comments");
  await d.openRow(0);
  assert.equal(d.all(d.$("cm-detail"), "cm-note").length, 1);
  assert.ok(text(d.$("cm-detail")).includes("This is your Page's own comment."));
  assert.equal(d.$("cm-hide-btn").disabled, true);
});

/* ---------- switch off while in use ---------- */

test("when the switch goes off while the tab is open, the tab goes and the conversations come back", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments");
  d.s.on = false;
  await d.click(d.$("cm-refresh-btn"));
  assert.equal(d.$("ib-tabs").hidden, true);
  assert.equal(d.$("ib-wrap").hidden, false);
  assert.equal(d.$("ib-cwrap").hidden, true);
});

test("the unread count is refreshed quietly every minute, even from the Conversations tab", async () => {
  const clock = makeClock();
  const d = boot({ clock });
  await d.openInbox();
  assert.equal(text(d.$("ib-tab-comments")), "Comments1");
  d.s.listing = listing({ unread_total: 4 });
  await clock.advance(60000);
  assert.equal(text(d.$("ib-tab-comments")), "Comments4");
  d.s.listing = listing({ unread_total: 0 });
  await clock.advance(60000);
  assert.equal(text(d.$("ib-tab-comments")), "Comments");
});

test("switching back to Conversations shows the conversation list and leaves the comments view alone", async () => {
  const d = boot();
  await d.openInbox(); await d.tab("comments"); await d.tab("chats");
  assert.equal(d.$("ib-wrap").hidden, false);
  assert.equal(d.$("ib-cwrap").hidden, true);
  assert.equal(d.$("ib-tab-comments").getAttribute("aria-selected"), "false");
});

test("leaving the Inbox stops the comments view", async () => {
  const clock = makeClock();
  const d = boot({ clock });
  await d.openInbox();
  d.window.NOInbox.hide();
  const before = d.calls.length;
  await clock.advance(120000);
  assert.equal(d.calls.length, before);
});

/* ---------- pure helpers ---------- */

test("util: listQuery, safeLink, notesFor", () => {
  const w = {};
  const doc = makeDocument();
  const ctx = vm.createContext({ window: w, document: doc, console, Intl, Promise, setTimeout, clearTimeout, Date });
  w.NODash = { el: () => ({}), call: () => Promise.resolve({}) };
  w.NOInbox = { util: {}, combo() {} };
  vm.runInContext(read("inbox-comments.js"), ctx);
  const u = w.NOInboxComments.util;
  assert.equal(u.listQuery({ scope: "all", answered: "all", q: "" }), "");
  assert.equal(u.listQuery({ scope: "post", answered: "answered", q: "a b" }, "c"), "?scope=post&answered=answered&q=a%20b&cursor=c");
  assert.equal(u.listQuery({ scope: "bogus", answered: "bogus", q: "" }), "");
  assert.equal(u.safeLink("https://www.facebook.com/1_2"), "https://www.facebook.com/1_2");
  assert.equal(u.safeLink("http://www.facebook.com/1"), "");
  assert.equal(u.safeLink("https://facebook.com.evil.test/1"), "");
  assert.equal(u.safeLink("javascript:alert(1)"), "");
  assert.equal(u.safeLink(null), "");
  assert.equal(JSON.stringify(u.notesFor(item({ hide: { available: false, reason: "already_hidden" } }))), "[]");
  assert.equal(u.availableMode({ public_reply: { available: false }, private_reply: { available: true } }), "private");
  assert.equal(u.availableMode({ public_reply: { available: true } }), "public");
  assert.equal(u.failTextOf("unknown_code"), "Facebook did not answer. Try again.");
});
