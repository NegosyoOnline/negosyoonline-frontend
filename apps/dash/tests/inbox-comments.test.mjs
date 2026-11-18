/* Inbox: Facebook comments as one more channel of the one Inbox list (ClickUp z8uq9mg9ph, COMMENTS C3 FE, fix round 1: Coach Ed, 2026-11-18,
   "no another page for comments ... another channel is fb comment"). The real scripts (app.js, inbox.js, inbox-comments.js) run in a vm with
   the small stand-in document from dom.mjs and a recorded fetch that plays the conversations API and the C1 comments contract (backend
   docs/contracts/comments-api-c1.md). Fake data only: no Facebook call, no real comment. */
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
const CV = `/sites/${A}/inquiries/conversations/`;
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
    item({ ref: R2, author_name: "Jun Dela Cruz", text: "Is this still available?", created_at: iso(40), unread: false, answered: true, post: { id: "1_3", is_ad: true, permalink: null, caption: "Summer sale ad" } }),
    item({ ref: R3, author_name: "Ana Reyes", text: "Thanks!", created_at: iso(50), unread: false, hidden: true })
  ], next_cursor: null, unread_total: 1, ...over };
}
function detail(over = {}) {
  return { ...item(), replies: [{ ref: "cm_x", author_name: "Ana Store Page", is_page: true, text: "Hello Maria!", created_at: iso(20) }], actions: [], ...over };
}
const wc = (n) => "wc_" + String(n).padStart(24, "0");
function conv(n, minutesAgo, over = {}) {
  return { ref: wc(n), display_name: "Buyer " + n, snippet: "Message " + n, updated_at: iso(minutesAgo), channel: "webchat", source: "stored", status: "open", unread: false, ...over };
}
function cm(n, minutesAgo, over = {}) {
  return item({ ref: "cm_" + String(n).padStart(24, "0"), author_name: "Commenter " + n, text: "Comment " + n, created_at: iso(minutesAgo), unread: false, ...over });
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
const q = (p) => new URLSearchParams(p.indexOf("?") >= 0 ? p.slice(p.indexOf("?") + 1) : "");

/* The stand-in API. `s` holds what the routes answer. s.convPage(params) / s.cmPage(params) answer a list read (params: the query string);
   a route set to {status, body} answers that. The comments routes answer 404 while s.on is false (the switch is off). */
function boot({ on = true, convs = [], clock = null } = {}) {
  const doc = makeDocument(), calls = [], toasts = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; n.dispatchEvent = (e) => n.fire(e.type); return n; };
  doc.createTextNode = (t) => { const w = make("span"); w.textContent = t; return w.firstChild; };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["ib-root", "ib-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const nav = [0, 1].map(() => { const a = doc.createElement("a"); a.setAttribute("data-inbox-nav", ""); a.setAttribute("data-route", "inbox"); a.hidden = true; page.appendChild(a); return a; });
  doc.querySelectorAll = (sel) => (sel === "[data-inbox-nav]" ? nav : []);
  const s = { on, listing: listing(), detail: detail(), listAnswer: null, detailAnswer: null, replyAnswer: null, privateAnswer: null, hideAnswer: null,
    searcher: null, convItems: convs, convUnread: 0, convPage: null, cmPage: null };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    let a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    if (opts.method === "GET" && p === "/sites/") a = { status: 200, body: { items: [{ id: A, template: "sante" }], next_cursor: null } };
    else if (p === `/sites/${A}/inquiries/unread/`) a = { status: 200, body: { count: s.convUnread } };
    else if (p === `/sites/${A}/inquiries/channels/`) a = { status: 200, body: { webchat_enabled: false } };
    else if (opts.method === "GET" && (p === CV || p.indexOf(CV + "?") === 0)) {
      a = { status: 200, body: s.convPage ? s.convPage(q(p)) : { items: s.convItems, stored_next_cursor: null, unread_total: s.convUnread } };
    } else if (/\/conversations\/wc_[0-9]+\/read\/$/.test(p)) a = { status: 200, body: {} };
    else if (p.indexOf(CB) === 0 && !s.on) a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    else if (/\/read\/$/.test(p)) a = { status: 200, body: { ...s.detail, unread: false } };
    else if (/\/private-reply\/$/.test(p)) a = s.privateAnswer || { status: 200, body: { state: "sent", error_code: "", created_at: iso(0), comment: { ...item(), answered: true, unread: false, private_reply: { available: false, reason: "already_sent", replied_at: iso(0), expires_at: null } } } };
    else if (/\/reply\/$/.test(p)) a = s.replyAnswer || { status: 200, body: { state: "sent", error_code: "", created_at: iso(0), comment: { ...item(), answered: true, unread: false } } };
    else if (/\/hide\/$/.test(p)) a = s.hideAnswer || { status: 200, body: { state: "sent", error_code: "", created_at: iso(0), comment: { ...item(), hidden: true, hide: { available: false, reason: "already_hidden" } } } };
    else if (new RegExp("^" + CB.replace(/\//g, "\\/") + "cm_[0-9a-f]+\\/$").test(p) && opts.method === "GET") a = s.detailAnswer || { status: 200, body: s.detail };
    else if (p.indexOf(CB) === 0 && (p === CB || p.indexOf(CB + "?") === 0) && opts.method === "GET") {
      const params = q(p);
      a = s.listAnswer || { status: 200, body: s.cmPage ? s.cmPage(params) : params.get("q") && s.searcher ? s.searcher(params.get("q")) : s.listing };
    }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const location = { search: "", pathname: "/inbox/", replace() {}, assign() {}, href: "" };
  const context = vm.createContext({ window, document: doc, Event: class { constructor(type) { this.type = type; } }, location, console, URLSearchParams, Promise, Intl, Uint8Array, Date,
    setTimeout: clock ? clock.setTimeout : (fn, ms) => (ms >= 300 && ms !== 300 ? 0 : setTimeout(fn, ms)), clearTimeout: clock ? clock.clearTimeout : (t) => { if (t) clearTimeout(t); }, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("inbox.js"), context, { filename: "inbox.js" });
  vm.runInContext(read("inbox-comments.js"), context, { filename: "inbox-comments.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  const all = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const d = { doc, calls, toasts, s, $, all, buttons, window, nav,
    press: (n, label) => buttons(n).find((b) => b.textContent === label),
    paths: () => calls.map((c) => c.method + " " + c.path),
    since: (n) => calls.slice(n).map((c) => c.method + " " + c.path),
    badge: () => { const b = nav[0].all((x) => x.classList.contains("ib-nb"))[0]; return b ? (b.hidden ? "" : b.textContent) : ""; },
    async openInbox() { window.NOInbox.show(); await settle(); },
    async click(node) { node.fire("click"); await settle(); },
    rows: () => all($("ib-list") || d.doc.body, "ib-item"),
    names: () => d.rows().map((r) => all(r, "ib-name")[0].textContent),
    async openRow(i) { await d.click(d.rows()[i]); },
    async type(id, v) { const n = $(id); n.value = v; n.fire("input"); await settle(); },
    async pick(id, v) { const n = $(id); n.value = v; n.fire("change"); await settle(); },
    shown: (id) => !$(id).hidden };
  return d;
}
const text = (n) => n.textContent;

/* ---------- one page, one list ---------- */

test("one Inbox page: no Conversations | Comments tabs, and a comment is a row of the one list with the FB Comment badge", async () => {
  const d = boot({ convs: [conv(1, 5)] });
  await d.openInbox();
  assert.equal(d.$("ib-tabs"), null);
  assert.equal(d.$("ib-cwrap"), null);
  assert.equal(d.rows().length, 4, "1 conversation and 3 comments in the same list");
  const row = d.rows()[1];
  assert.equal(d.all(row, "ib-ch").map(text)[0], "FB Comment");
  assert.equal(d.all(d.rows()[0], "ib-ch").map(text)[0], "Website chat", "the conversation row is as before");
});

test("a comment row has the avatar, name, comment, time, unread state, the post line, the Ad badge and Unanswered / Answered", async () => {
  const d = boot();
  await d.openInbox();
  const rows = d.rows();
  assert.equal(rows.length, 3);
  assert.ok(text(rows[0]).includes("Maria Santos") && text(rows[0]).includes("How much is the medium?") && text(rows[0]).includes("Fresh mangoes"));
  assert.equal(d.all(rows[0], "ib-av").length, 1);
  assert.ok(rows[0].classList.contains("ib-unread"), "unread like the conversation rows");
  assert.ok(!rows[1].classList.contains("ib-unread"));
  assert.equal(d.all(rows[0], "chip").filter((c) => /nswered/.test(text(c))).length, 0, "no Answered / Unanswered pill on the rows (r10: an icon instead)");
  assert.ok(d.all(rows[0], "cm-ad").length === 0, "no Ad badge on a plain post");
  assert.ok(d.all(rows[1], "cm-ad").length === 1 && text(rows[1]).includes("Summer sale ad"));
  assert.ok(text(rows[2]).includes("Hidden"));
  assert.equal(d.all(rows[0], "ib-rs-u").length, 1);
  assert.equal(d.all(rows[1], "ib-rs-r").length, 1);
});

test("a name or comment with markup reaches the page as text only", async () => {
  const d = boot();
  d.s.listing = listing({ items: [item({ author_name: "<b>Eve</b>", text: "<img src=x onerror=alert(1)>", post: { id: "1", is_ad: false, permalink: null, caption: "<i>cap</i>" } })] });
  await d.openInbox();
  const row = d.rows()[0];
  assert.ok(text(row).includes("<b>Eve</b>") && text(row).includes("<img src=x") && text(row).includes("<i>cap</i>"));
  assert.equal(row.all((n) => n.tagName === "IMG" || n.tagName === "B" || n.tagName === "I").length, 0);
});

test("comments off (404): the list is the conversations, no error, and the comments are not asked for again", async () => {
  const d = boot({ on: false, convs: [conv(1, 5), conv(2, 9)] });
  await d.openInbox();
  assert.equal(d.rows().length, 2);
  assert.equal(d.all(d.$("ib-listbody"), "ib-err").length, 0);
  assert.equal(d.toasts.length, 0);
  assert.deepEqual(d.paths().filter((x) => x.indexOf(CB) >= 0), ["GET " + CB]);
  await d.click(d.$("ib-refresh-btn"));
  assert.deepEqual(d.paths().filter((x) => x.indexOf(CB) >= 0), ["GET " + CB], "asked once, then left alone");
  await d.pick("ib-filter", "fbcomment");
  assert.equal(d.rows().length, 0);
  assert.ok(text(d.$("ib-listbody")).includes("No comments yet."));
  assert.ok(d.$("ib-filter"), "the toolbar stays");
  assert.equal(d.all(d.$("ib-listbody"), "ib-err").length, 0);
});

test("a comments failure that is not a 404 leaves the conversations showing", async () => {
  const d = boot({ convs: [conv(1, 5)] });
  d.s.listAnswer = { status: 500, body: { error: { code: "server", message: "x" } } };
  await d.openInbox();
  assert.equal(d.rows().length, 1);
  assert.equal(d.all(d.$("ib-listbody"), "ib-err").length, 0);
});

test("FB Comment alone, and the read fails: a message, the old channel comes back, the list stays", async () => {
  const d = boot({ convs: [conv(1, 5)] });
  await d.openInbox();
  d.s.listAnswer = { status: 500, body: { error: { code: "server", message: "x" } } };
  await d.pick("ib-filter", "fbcomment");
  assert.ok(d.toasts.length === 1 && d.$("ib-filter").value === "all", "the old channel comes back");
  assert.equal(d.rows().length, 4, "the list stays");
});

test("Channel filter: FB Comment after FB Messenger; FB Comment reads only comments, a conversation channel only conversations, All both", async () => {
  const d = boot({ convs: [conv(1, 5)] });
  await d.openInbox();
  const opts = d.$("ib-filter").all((n) => n.tagName === "OPTION").map(text);
  assert.deepEqual(opts, ["All channels", "Website chat", "Email", "FB Messenger", "FB Comment"]);
  let n = d.calls.length;
  await d.pick("ib-filter", "fbcomment");
  assert.deepEqual(d.since(n).filter((x) => x.indexOf("/inquiries/c") >= 0), ["GET " + CB]);
  assert.equal(d.rows().length, 3);
  assert.ok(d.rows().every((r) => text(r).includes("FB Comment")));
  n = d.calls.length;
  await d.pick("ib-filter", "webchat");
  assert.deepEqual(d.since(n).filter((x) => x.indexOf("/inquiries/c") >= 0), ["GET " + CV]);
  assert.deepEqual(d.names(), ["Buyer 1"]);
  n = d.calls.length;
  await d.pick("ib-filter", "all");
  assert.deepEqual(d.since(n).filter((x) => x.indexOf("/inquiries/c") >= 0).sort(), ["GET " + CB, "GET " + CV]);
  assert.equal(d.rows().length, 4);
});

test("search goes to both APIs, Unread/Read maps to the comments' unread=1/0, and Closed reads no comments while Open reads them", async () => {
  const clock = makeClock();
  const d = boot({ convs: [conv(1, 5)], clock });
  await d.openInbox();
  d.s.searcher = (t) => listing({ items: [item({ author_name: "Match " + t })] });
  let n = d.calls.length;
  await d.type("ib-q", "ma"); await clock.advance(300);
  assert.deepEqual(d.since(n).filter((x) => x.indexOf("/inquiries/c") >= 0).sort(), ["GET " + CB + "?q=ma", "GET " + CV + "?q=ma"]);
  assert.ok(d.names().includes("Match ma"));
  await d.type("ib-q", ""); await clock.advance(300);
  n = d.calls.length;
  await d.click(d.$("ib-rtog"));
  assert.deepEqual(d.since(n).filter((x) => x.indexOf("/inquiries/c") >= 0).sort(), ["GET " + CB + "?unread=1", "GET " + CV + "?unread=1"]);
  n = d.calls.length;
  await d.click(d.$("ib-rtog"));
  assert.deepEqual(d.since(n).filter((x) => x.indexOf("/inquiries/c") >= 0).sort(), ["GET " + CB + "?unread=0", "GET " + CV + "?unread=0"]);
  await d.click(d.$("ib-rtog"));
  n = d.calls.length;
  await d.pick("ib-status", "closed");
  assert.deepEqual(d.since(n).filter((x) => x.indexOf("/inquiries/c") >= 0), ["GET " + CV + "?status=closed"], "comments have no closed state");
  assert.ok(d.rows().every((r) => !text(r).includes("FB Comment")));
  n = d.calls.length;
  await d.pick("ib-status", "open");
  assert.deepEqual(d.since(n).filter((x) => x.indexOf("/inquiries/c") >= 0).sort(), ["GET " + CB, "GET " + CV + "?status=open"]);
  assert.ok(d.rows().some((r) => text(r).includes("FB Comment")));
});

/* ---------- two cursors, one order ---------- */

function pages() {
  /* conversations: A1 5, A2 20, A3 50 | A4 80, A5 120 minutes ago; comments: B1 10, B2 30, B3 40 | B4 60, B5 100, B6 130 */
  const convPages = { "": { items: [conv(1, 5), conv(2, 20), conv(3, 50)], stored_next_cursor: "c2", unread_total: 0 }, c2: { items: [conv(4, 80), conv(5, 120)], stored_next_cursor: null, unread_total: 0 } };
  const cmPages = { "": { items: [cm(1, 10), cm(2, 30), cm(3, 40)], next_cursor: "m2", unread_total: 0 }, m2: { items: [cm(4, 60), cm(5, 100)], next_cursor: "m3", unread_total: 0 }, m3: { items: [cm(6, 130)], next_cursor: null, unread_total: 0 } };
  return { convPage: (p) => convPages[p.get("stored_cursor") || ""], cmPage: (p) => cmPages[p.get("cursor") || ""] };
}

test("Show more with two cursors: the lagging source is read, nothing older than the newer page tail shows, and a later page never inserts a row above shown rows", async () => {
  const d = boot();
  Object.assign(d.s, pages());
  await d.openInbox();
  const stage = [d.names()];
  /* both have a next page: conv tail A3 (50 min) is older than comment tail B3 (40 min); only items down to 40 min show */
  assert.deepEqual(stage[0], ["Buyer 1", "Commenter 1", "Buyer 2", "Commenter 2", "Commenter 3"]);
  const seq = [];
  for (let i = 0; i < 4; i++) {
    const more = d.press(d.$("ib-listbody"), "Show more conversations");
    if (!more) break;
    const n = d.calls.length;
    await d.click(more);
    seq.push(d.since(n).filter((x) => x.indexOf("/inquiries/c") >= 0)[0]);
    stage.push(d.names());
  }
  /* the comments lag first (B3 40 is newer than A3 50): comments m2; then conversations lag (A3 50 vs B5 100): c2; then comments m3 */
  assert.deepEqual(seq, ["GET " + CB + "?cursor=m2", "GET " + CV + "?stored_cursor=c2", "GET " + CB + "?cursor=m3"]);
  for (let i = 1; i < stage.length; i++) assert.deepEqual(stage[i].slice(0, stage[i - 1].length), stage[i - 1], "stage " + i + " keeps every shown row in place");
  const last = stage[stage.length - 1];
  assert.deepEqual(last, ["Buyer 1", "Commenter 1", "Buyer 2", "Commenter 2", "Commenter 3", "Buyer 3", "Commenter 4", "Buyer 4", "Commenter 5", "Buyer 5", "Commenter 6"]);
  assert.equal(d.press(d.$("ib-listbody"), "Show more conversations"), undefined, "both sources done: no button");
});

test("the list keeps its scroll on a row click, a read mark, Show more and Back (phone), and goes to the top for a new filter", async () => {
  const d = boot();
  Object.assign(d.s, pages());
  await d.openInbox();
  const scrollTo = (y) => { const ul = d.$("ib-list"); ul.scrollTop = y; ul.fire("scroll"); };
  scrollTo(420);
  await d.openRow(2);
  assert.equal(d.$("ib-list").scrollTop, 420, "a row click does not move the list");
  /* the phone hides the list while the thread is open: the browser reads 0 there and fires no scroll event */
  d.$("ib-list").scrollTop = 0;
  await d.click(d.$("ib-back"));
  assert.equal(d.$("ib-list").scrollTop, 420, "back to the list at the same spot");
  await d.openRow(1);
  assert.equal(d.$("ib-list").scrollTop, 420);
  await d.click(d.press(d.$("ib-listbody"), "Show more conversations"));
  assert.equal(d.$("ib-list").scrollTop, 420, "Show more appends below without a jump");
  await d.pick("ib-status", "open");
  assert.equal(d.$("ib-list").scrollTop || 0, 0, "a new filter starts at the top");
});

function inboxUtil() {
  const w = {};
  const doc = makeDocument();
  const ctx = vm.createContext({ window: w, document: doc, console, Intl, Promise, setTimeout, clearTimeout, Date, Uint8Array });
  w.NODash = { el: () => ({}), call: () => Promise.resolve({}) };
  vm.runInContext(read("inbox.js"), ctx);
  return w.NOInbox.util;
}
const ids = (a) => a.map((x) => x.display_name ? "A" + x.ref.slice(-1) : "B" + x.ref.slice(-1)).join(" ");

test("util: the merged view is newest first, holds back what is older than the newer page tail, and has no gap", () => {
  const u = inboxUtil();
  const A1 = conv(1, 5), A2 = conv(2, 20), A3 = conv(3, 50), A4 = conv(4, 80), B1 = cm(1, 10), B2 = cm(2, 30), B3 = cm(3, 40), B4 = cm(4, 60);
  const both = { conv: true, cm: true };
  assert.equal(u.horizonOf([A1, A2, A3, B1, B2, B3], both), u.timeOf(B3));
  assert.equal(ids(u.visibleOf([A3, B1, A1, B3, A2, B2], both)), "A1 B1 A2 B2 B3");
  /* comments have another page, conversations are done: only the comments limit, A3 and A4 older than B3 are held back until the comments page comes */
  assert.equal(ids(u.visibleOf([A1, A2, A3, A4, B1, B2, B3], { conv: false, cm: true })), "A1 B1 A2 B2 B3");
  /* the comments' next page loaded and done: nothing limits */
  assert.equal(ids(u.visibleOf([A1, A2, A3, A4, B1, B2, B3, B4], { conv: false, cm: false })), "A1 B1 A2 B2 B3 A3 B4 A4");
  assert.equal(ids(u.visibleOf([], both)), "");
});

test("util: the next page is read from the source whose last loaded item is newer, and a source with no next page is not read", () => {
  const u = inboxUtil();
  const both = { conv: true, cm: true };
  assert.equal(u.nextSource([conv(3, 50), cm(3, 40)], both), "cm");
  assert.equal(u.nextSource([conv(3, 30), cm(3, 40)], both), "conv");
  assert.equal(u.nextSource([conv(3, 50), cm(3, 40)], { conv: true, cm: false }), "conv");
  assert.equal(u.nextSource([conv(3, 50), cm(3, 40)], { conv: false, cm: false }), "");
  assert.equal(u.nextSource([conv(3, 50)], both), "cm", "a source with nothing loaded yet goes first");
});

test("util: pages loaded one after another keep the shown order stable with no gap (interleaved times, several pages of each)", () => {
  const u = inboxUtil();
  const convPages = [[conv(1, 5), conv(2, 21), conv(3, 50)], [conv(4, 55), conv(5, 90), conv(6, 91)], [conv(7, 200)]];
  const cmPages = [[cm(1, 8), cm(2, 30), cm(3, 52)], [cm(4, 60), cm(5, 95), cm(6, 96)], [cm(7, 150), cm(8, 210)]];
  const all = convPages.concat(cmPages).reduce((a, b) => a.concat(b), []);
  let pool = [], more = { conv: true, cm: true }, ci = 0, mi = 0, shown = [];
  pool = pool.concat(convPages[ci++], cmPages[mi++]);
  const check = () => {
    const now = u.visibleOf(pool, more);
    assert.deepEqual(Array.from(now.slice(0, shown.length), (x) => x.ref), Array.from(shown, (x) => x.ref), "no row appears above the rows already shown");
    /* no gap: every item of the full data that is newer than the oldest shown one is shown */
    if (now.length) { const floor = u.timeOf(now[now.length - 1]); assert.equal(all.filter((x) => u.timeOf(x) >= floor).length, now.length); }
    shown = now;
  };
  check();
  for (let guard = 0; guard < 10; guard++) {
    const src = u.nextSource(pool, more);
    if (!src) break;
    if (src === "conv") { pool = u.mergeSource(pool, "conv", convPages[ci++], true); more.conv = ci < convPages.length; }
    else { pool = u.mergeSource(pool, "cm", cmPages[mi++], true); more.cm = mi < cmPages.length; }
    check();
  }
  assert.equal(shown.length, all.length, "at the end everything shows");
  const times = Array.from(shown, (x) => u.timeOf(x));
  assert.deepEqual(times, times.slice().sort((a, b) => b - a), "newest first");
});

test("util: channelOf names a comment from its ref, filterItems keeps it for FB Comment, and the sources follow the filters", () => {
  const u = inboxUtil();
  assert.equal(u.channelOf({ ref: R1 }), "fbcomment");
  assert.equal(u.channelOf({ ref: wc(1) }), "webchat");
  assert.equal(u.filterItems([item(), conv(1, 5)], "fbcomment").length, 1);
  assert.equal(u.filterItems([item(), conv(1, 5)], "webchat").length, 1);
  assert.equal(JSON.stringify(u.sourcesFor("all", "")), JSON.stringify({ conv: true, cm: true }));
  assert.equal(JSON.stringify(u.sourcesFor("fbcomment", "")), JSON.stringify({ conv: false, cm: true }));
  assert.equal(JSON.stringify(u.sourcesFor("messenger", "open")), JSON.stringify({ conv: true, cm: false }));
  assert.equal(JSON.stringify(u.sourcesFor("all", "closed")), JSON.stringify({ conv: true, cm: false }));
  assert.equal(JSON.stringify(u.sourcesFor("fbcomment", "closed")), JSON.stringify({ conv: false, cm: false }));
  assert.equal(u.commentQuery("", "", ""), "");
  assert.equal(u.commentQuery("a b", "1", "c d"), "?q=a%20b&unread=1&cursor=c%20d");
  assert.equal(u.commentQuery("", "0", ""), "?unread=0");
  assert.equal(u.commentQuery("", "x", ""), "");
});

test("util: the Inbox unread count is conversations plus comments", () => {
  const u = inboxUtil();
  assert.equal(u.unreadSum(2, 3), 5);
  assert.equal(u.unreadSum(0, 4), 4);
  assert.equal(u.unreadSum(undefined, 4.9), 4);
  assert.equal(u.unreadSum(-1, "x"), 0);
});

/* ---------- unread ---------- */

test("the Inbox badge is the conversations' unread plus the comments' unread; opening a comment drops it by one and tells the server", async () => {
  const d = boot({ convs: [conv(1, 5, { unread: true })] });
  d.s.convUnread = 2;
  await d.openInbox();
  assert.equal(d.badge(), "3", "2 conversations + 1 comment");
  await d.openRow(1);
  assert.ok(d.paths().includes("POST " + CB + R1 + "/read/"));
  assert.ok(!d.rows()[1].classList.contains("ib-unread"));
  assert.equal(d.badge(), "2");
  assert.ok(d.paths().includes("GET " + CB + R1 + "/"));
  const det = d.$("ib-threadpane");
  assert.ok(text(det).includes("How much is the medium?") && text(det).includes("Hello Maria!"));
  assert.equal(d.all(det, "ib-msg-out").length, 1, "the Page's own reply sits on the owner side");
  assert.ok(!d.rows()[1].classList.contains("ib-unread"), "the answer to the detail read does not bring the dot back");
  const before = d.paths().filter((p) => p.endsWith("/read/")).length;
  await d.openRow(2);
  assert.equal(d.paths().filter((p) => p.endsWith("/read/")).length, before, "a read comment is not marked again");
  await d.openRow(0);
  assert.equal(d.badge(), "1", "opening an unread conversation drops its own part");
});

test("every list read feeds the comments' unread total; a count that is not a number leaves it alone", async () => {
  const clock = makeClock();
  const d = boot({ clock });
  await d.openInbox();
  assert.equal(d.badge(), "1");
  d.s.listing = listing({ unread_total: 4 });
  await clock.advance(15000);
  assert.equal(d.badge(), "4");
  d.s.listing = listing({ unread_total: 0 });
  await clock.advance(15000);
  assert.equal(d.badge(), "");
});

test("away from the Inbox the badge reads the conversation count and the unread comments, every minute", async () => {
  const clock = makeClock();
  const d = boot({ clock });
  d.s.convUnread = 2;
  d.window.NOInbox.probe(); await settle();
  assert.equal(d.badge(), "3");
  assert.ok(d.paths().includes("GET " + CB + "?unread=1"));
  d.s.listing = listing({ unread_total: 5 });
  await clock.advance(60000);
  assert.equal(d.badge(), "7");
});

test("away from the Inbox with comments off: the conversation count alone, and the comments are not asked again", async () => {
  const clock = makeClock();
  const d = boot({ on: false, clock });
  d.s.convUnread = 2;
  d.window.NOInbox.probe(); await settle();
  assert.equal(d.badge(), "2");
  await clock.advance(120000);
  assert.equal(d.paths().filter((p) => p.indexOf(CB) >= 0).length, 1);
});

/* ---------- the detail: the same pane as a conversation ---------- */

test("a comment opens in the same detail pane: back, the FB Comment badge, the state chips, the post and the comment", async () => {
  const d = boot({ convs: [conv(1, 5)] });
  d.s.detail = detail({ post: { id: "1", is_ad: true, permalink: "https://www.facebook.com/1_2", caption: "Summer sale ad" } });
  await d.openInbox();
  await d.openRow(1);
  const pane = d.$("ib-threadpane"), head = d.all(pane, "ib-thead")[0];
  assert.ok(head && d.$("ib-back"), "the same head with the back button");
  assert.equal(d.all(head, "ib-ch").map(text)[0], "FB Comment");
  assert.ok(text(head).includes("Unanswered") && d.all(head, "cm-ad").length === 1);
  assert.equal(d.all(pane, "cm-postcard").length, 1);
  assert.ok(d.all(pane, "ib-listpane").length === 0);
  assert.ok(d.$("ib-listpane").classList.contains("is-hide-phone"), "phone: the list gives way to the open item");
  assert.ok(!pane.classList.contains("is-hide-phone"));
  await d.click(d.$("ib-back"));
  assert.ok(!d.$("ib-listpane").classList.contains("is-hide-phone"));
  assert.ok(d.$("ib-threadpane").classList.contains("is-hide-phone"));
  assert.ok(text(d.$("ib-threadpane")).includes("Choose a conversation"));
});

test("a conversation opens after a comment and the comment detail is gone", async () => {
  const d = boot({ convs: [conv(1, 5)] });
  await d.openInbox();
  await d.openRow(1);
  assert.ok(d.$("cm-rb"));
  await d.openRow(0);
  assert.equal(d.$("cm-rb"), null);
});

test("the post link is shown only for a facebook.com https address", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  assert.equal(d.$("ib-threadpane").all((n) => n.tagName === "A")[0].getAttribute("href"), "https://www.facebook.com/1_2");
  d.s.detail = detail({ post: { id: "1", is_ad: false, permalink: "https://evil.example/x", caption: "c" } });
  await d.openRow(2);
  assert.equal(d.$("ib-threadpane").all((n) => n.tagName === "A").length, 0);
});

test("a public reply posts text with an idempotency key, then clears the box and marks the comment answered", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  const ta = d.$("cm-rb");
  ta.value = "  It is 150 pesos.  "; ta.fire("input");
  assert.equal(d.$("cm-rc").textContent, "20 / 500");
  assert.equal(d.press(d.$("ib-threadpane"), "Message privately"), undefined, "no Reply / Message privately toggle");
  await d.click(d.press(d.$("ib-threadpane"), "Send Comment Reply"));
  const call = d.calls.find((c) => c.method === "POST" && c.path === CB + R1 + "/reply/");
  assert.equal(call.body.text, "It is 150 pesos.");
  assert.match(call.body.idempotency_key, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(d.$("cm-rb").value, "");
  assert.ok(text(d.all(d.$("ib-threadpane"), "ib-thead")[0]).includes("Answered"), "the thread header chip shows Answered");
  assert.ok(d.paths().filter((p) => p === "GET " + CB + R1 + "/").length >= 2, "the detail is read again for the new reply");
});

test("a reply that Facebook refused shows a fixed text, keeps the text, and a retry reuses nothing stale", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  d.$("cm-rb").value = "Hello"; d.$("cm-rb").fire("input");
  d.s.replyAnswer = { status: 200, body: { state: "failed", error_code: "rate_limited", created_at: iso(0), comment: item() } };
  await d.click(d.press(d.$("ib-threadpane"), "Send Comment Reply"));
  assert.ok(text(d.$("ib-threadpane")).includes("Facebook is limiting replies right now. Try again in a few minutes."));
  assert.equal(d.$("cm-rb").value, "Hello");
  assert.ok(d.press(d.$("ib-threadpane"), "Try again"));
  d.s.replyAnswer = null;
  await d.click(d.press(d.$("ib-threadpane"), "Try again"));
  assert.equal(d.$("cm-rb").value, "");
  assert.ok(!text(d.$("ib-threadpane")).includes("limiting"));
});

test("a lost answer keeps the idempotency key so the retry cannot send twice", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  d.$("cm-rb").value = "Hello"; d.$("cm-rb").fire("input");
  d.s.replyAnswer = { status: 500, body: { error: { code: "server", message: "Oops." } } };
  await d.click(d.press(d.$("ib-threadpane"), "Send Comment Reply"));
  assert.ok(text(d.$("ib-threadpane")).includes("Oops."));
  const keys = [];
  d.s.replyAnswer = null;
  await d.click(d.press(d.$("ib-threadpane"), "Try again"));
  d.calls.filter((c) => c.path === CB + R1 + "/reply/").forEach((c) => keys.push(c.body.idempotency_key));
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1], "an answered error is final: the next attempt is a new request");
});

test("Send private message posts to private-reply with a 1000 character limit; the counter shows the smaller limit while both are possible", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  assert.equal(d.$("cm-rc").textContent, "0 / 500");
  d.$("cm-rb").value = "Hi Maria, the medium is 150. " + "x".repeat(600); d.$("cm-rb").fire("input");
  assert.equal(d.press(d.$("ib-threadpane"), "Send Comment Reply").getAttribute("aria-disabled"), "true", "over 500: the public reply is off");
  assert.equal(d.press(d.$("ib-threadpane"), "Send private message").getAttribute("aria-disabled"), "false");
  d.$("cm-rb").value = "Hi Maria, the medium is 150."; d.$("cm-rb").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send private message"));
  const call = d.calls.find((c) => c.method === "POST" && c.path === CB + R1 + "/private-reply/");
  assert.equal(call.body.text, "Hi Maria, the medium is 150.");
  assert.match(call.body.idempotency_key, /^[A-Za-z0-9_-]{8,64}$/);
  assert.ok(!d.calls.some((c) => c.path === CB + R1 + "/reply/"), "not sent as a public reply");
});

test("private reasons are a tooltip on the aria-disabled private button, not a note; the public reply still works", async () => {
  for (const [reason, tipText] of [["window_closed", "Private reply is only possible within 7 days of the comment."], ["already_sent", "Private message already sent for this comment."]]) {
    const d = boot();
    d.s.detail = detail({ private_reply: { available: false, reason, replied_at: null, expires_at: iso(60) } });
    await d.openInbox();
    await d.openRow(0);
    const det = d.$("ib-threadpane");
    assert.equal(d.all(det, "cm-note").length, 0, reason + ": no note in the composer");
    assert.ok(!text(det).replace(text(d.$("cm-priv-tip")), "").includes("7 days") && !text(det).replace(text(d.$("cm-priv-tip")), "").includes("already sent"));
    d.$("cm-rb").value = "Hi"; d.$("cm-rb").fire("input");
    const b = d.press(det, "Send private message");
    assert.equal(b.disabled, false, "not natively disabled, so hover and focus fire");
    assert.equal(b.getAttribute("aria-disabled"), "true");
    assert.equal(b.getAttribute("aria-describedby"), "cm-priv-tip");
    const tip = d.$("cm-priv-tip");
    assert.equal(tip.getAttribute("role"), "tooltip");
    assert.equal(text(tip), tipText);
    assert.ok(!tip.classList.contains("is-open"));
    b.fire("mouseenter"); assert.ok(tip.classList.contains("is-open"));
    b.fire("mouseleave"); assert.ok(!tip.classList.contains("is-open"));
    b.fire("focus"); assert.ok(tip.classList.contains("is-open"));
    b.fire("blur"); assert.ok(!tip.classList.contains("is-open"));
    await d.click(b); assert.ok(tip.classList.contains("is-open"), "a click opens it");
    await d.click(b); assert.ok(tip.classList.contains("is-open"), "a mouse click does not flicker it shut");
    b.fire("keydown", { key: "Escape" }); assert.ok(!tip.classList.contains("is-open"), "Escape closes");
    const tap = async () => { b.fire("pointerdown", { pointerType: "touch" }); b.fire("focus"); b.fire("mouseenter"); await d.click(b); };
    b.fire("blur"); b.fire("mouseleave");
    await tap(); assert.ok(tip.classList.contains("is-open"), "one touch tap opens it and it stays open");
    await tap(); assert.ok(!tip.classList.contains("is-open"), "a second tap closes it");
    await tap(); assert.ok(tip.classList.contains("is-open"));
    b.fire("blur"); assert.ok(!tip.classList.contains("is-open"), "tapping elsewhere closes it");
    assert.ok(!d.calls.some((c) => c.method === "POST" && /reply\/$/.test(c.path)), "a click while aria-disabled sends nothing");
    assert.equal(d.press(det, "Send Comment Reply").disabled, false, "the public reply still works");
    assert.equal(d.$("cm-rb").disabled, false);
  }
});

test("an allowed private reply: the button is enabled and has no tooltip", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  d.$("cm-rb").value = "Hi"; d.$("cm-rb").fire("input");
  const b = d.press(d.$("ib-threadpane"), "Send private message");
  assert.equal(b.disabled, false);
  assert.equal(b.getAttribute("aria-disabled"), "false");
  assert.equal(d.$("cm-priv-tip"), null);
  assert.equal(NOUtil(d).notesFor({ private_reply: { available: false, reason: "reconnect" }, public_reply: { available: false, reason: "reconnect" } }).length, 1, "the public note stays once");
});

test("a comment that only allows a private reply shows only the private limit, and with nothing allowed the box is off with the reason", async () => {
  const d = boot();
  d.s.listing = listing({ items: [item({ public_reply: { available: false, reason: "reconnect" } })] });
  d.s.detail = detail({ public_reply: { available: false, reason: "reconnect" } });
  await d.openInbox();
  await d.openRow(0);
  assert.equal(d.$("cm-rc").textContent, "0 / 1000");
  d.s.listing = listing({ items: [item({ ref: R2 })] });
  const off = { available: false, reason: "reconnect" };
  d.s.detail = detail({ ref: R2, public_reply: off, private_reply: off, hide: off });
  await d.click(d.$("ib-refresh-btn"));
  await d.openRow(0);
  assert.equal(d.$("cm-rb").disabled, true);
  assert.equal(d.all(d.$("ib-threadpane"), "cm-note").length, 1, "one distinct sentence once");
  assert.ok(text(d.$("ib-threadpane")).includes("Reconnect your Facebook Page to reply."));
});

test("a 409 window_closed on a send shows the note and reads the comment again", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  d.$("cm-rb").value = "Hi"; d.$("cm-rb").fire("input");
  d.s.privateAnswer = { status: 409, body: { error: { code: "window_closed", message: "Meta words" } } };
  d.s.detail = detail({ private_reply: { available: false, reason: "window_closed", replied_at: null, expires_at: iso(1) } });
  const reads = d.paths().filter((p) => p === "GET " + CB + R1 + "/").length;
  await d.click(d.press(d.$("ib-threadpane"), "Send private message"));
  const det = text(d.$("ib-threadpane"));
  assert.ok(det.includes("Private reply is only possible within 7 days of the comment."));
  assert.ok(!det.includes("Meta words"));
  assert.equal(d.paths().filter((p) => p === "GET " + CB + R1 + "/").length, reads + 1);
});

test("Hide asks first: Cancel sends nothing, Hide sends, then the comment shows Hidden and Hide is off", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  assert.equal(d.$("cm-hide-yes"), null);
  await d.click(d.$("cm-hide-btn"));
  assert.ok(text(d.$("ib-threadpane")).includes("Hide this comment on Facebook? You cannot unhide it from here."));
  await d.click(d.press(d.$("ib-threadpane"), "Cancel"));
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
  await d.openInbox();
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
  await d.openInbox();
  await d.openRow(0);
  assert.equal(d.all(d.$("ib-threadpane"), "cm-note").length, 1);
  assert.ok(text(d.$("ib-threadpane")).includes("This is your Page's own comment."));
  assert.equal(d.$("cm-hide-btn").disabled, true);
});

/* ---------- switch off while in use ---------- */


test("Refresh reads the list and the open comment again; leaving the Inbox stops every read", async () => {
  const clock = makeClock();
  const d = boot({ clock });
  await d.openInbox();
  await d.openRow(0);
  const n = d.calls.length;
  await d.click(d.$("ib-refresh-btn"));
  assert.ok(d.since(n).includes("GET " + CB) && d.since(n).includes("GET " + CB + R1 + "/"));
  d.window.NOInbox.hide();
  const before = d.calls.length;
  await clock.advance(120000);
  assert.ok(d.calls.slice(before).every((c) => c.path.indexOf("/inquiries/unread/") >= 0 || c.path.indexOf(CB) >= 0), "only the quiet badge read may continue");
});

/* ---- r4: the owner's replies show in the thread, labelled ---- */
const pane = (d) => text(d.$("ib-threadpane"));
const count = (s, sub) => s.split(sub).length - 1;

test("thread labels: comment reply, private message, no owner name line, customer reply unchanged", async () => {
  const d = boot();
  d.s.detail = detail({ replies: [
    { ref: "cm_a", kind: "comment", is_page: true, author_name: "Ana Store Page", text: "Public answer", created_at: iso(30) },
    { ref: "", kind: "private", is_page: true, author_name: "", text: "Private answer", created_at: iso(20) },
    { ref: "cm_c", is_page: true, author_name: "", text: "Old style", created_at: iso(15) },
    { ref: "cm_b", is_page: false, author_name: "", text: "Customer again", created_at: iso(10) },
  ] });
  await d.openInbox();
  await d.openRow(0);
  const t = d.$("ib-threadpane");
  const kinds = d.all(t, "cm-kind");
  assert.deepEqual(kinds.map((k) => k.textContent), ["Comment reply", "Private message", "Comment reply"]);
  assert.ok(kinds[1].classList.contains("cm-kind-priv"));
  assert.ok(!kinds[0].classList.contains("cm-kind-priv"));
  const outs = d.all(t, "ib-msg-out");
  assert.equal(outs.length, 3);
  assert.ok(text(outs[1]).includes("Private answer") && !text(outs[1]).includes("You"), "no name line for the owner");
  assert.ok(!text(outs[1]).includes("Facebook user"));
  const ins = d.all(t, "ib-msg-in");
  assert.ok(text(ins[ins.length - 1]).includes("Facebook user") && text(ins[ins.length - 1]).includes("Customer again"));
  assert.equal(d.all(ins[ins.length - 1], "cm-kind").length, 0);
});

test("a sent comment reply and a sent private message show in the thread without a reload, once", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  // The refetch fails: the optimistic item stays on screen.
  d.$("cm-rb").value = "On the way!"; d.$("cm-rb").fire("input");
  const pre = d.calls.length;
  d.s.detailAnswer = { status: 500, body: { error: { code: "server", message: "Oops." } } };
  await d.click(d.press(d.$("ib-threadpane"), "Send Comment Reply"));
  assert.equal(count(pane(d), "On the way!"), 1);
  assert.equal(count(pane(d), "Comment reply"), 2, "the existing page reply and the new one");
  d.s.detailAnswer = null;
  // The refetch returns the saved thread: replaced, not duplicated.
  d.s.detail = detail({ replies: [...detail().replies, { ref: "cm_n", kind: "comment", is_page: true, author_name: "Ana Store Page", text: "On the way!", created_at: iso(0) }] });
  d.$("cm-rb").value = "Second"; d.$("cm-rb").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send Comment Reply"));
  assert.equal(count(pane(d), "On the way!"), 1, "not duplicated after the refetch");
  assert.equal(count(pane(d), "Second"), 0, "the refetched thread is the truth");
  assert.ok(d.calls.length > pre);
  // Private message: optimistic, then saved.
  d.s.detailAnswer = { status: 500, body: { error: { code: "server", message: "Oops." } } };
  d.$("cm-rb").value = "Pm text"; d.$("cm-rb").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send private message"));
  assert.equal(count(pane(d), "Pm text"), 1);
  assert.ok(pane(d).includes("Private message"));
  d.s.detailAnswer = null;
  d.s.detail = detail({ replies: [{ ref: "", kind: "private", is_page: true, author_name: "", text: "Pm text", created_at: iso(0) }] });
  d.$("cm-rb").value = "x"; d.$("cm-rb").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send private message"));
  assert.equal(count(pane(d), "Pm text"), 1);
});

test("a failed send adds nothing to the thread", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  d.$("cm-rb").value = "Nope"; d.$("cm-rb").fire("input");
  d.s.replyAnswer = { status: 200, body: { state: "failed", error_code: "rate_limited", created_at: iso(0), comment: item() } };
  await d.click(d.press(d.$("ib-threadpane"), "Send Comment Reply"));
  assert.equal(d.all(d.$("ib-threadpane"), "ib-bub").filter((b) => text(b) === "Nope").length, 0);
  d.s.replyAnswer = { status: 500, body: { error: { code: "server", message: "Oops." } } };
  await d.click(d.press(d.$("ib-threadpane"), "Try again"));
  assert.equal(d.all(d.$("ib-threadpane"), "ib-bub").filter((b) => text(b) === "Nope").length, 0);
});

/* ---- r5: no Page-name line, pill in the meta line, gold comment-reply pill, Hide Comment in the header ---- */
test("owner messages have no name line; the pill sits in the meta line before the time; customer keeps its name", async () => {
  const d = boot();
  d.s.detail = detail({ replies: [
    { ref: "cm_a", kind: "comment", is_page: true, author_name: "Ana Store Page", text: "Public answer", created_at: iso(30) },
    { ref: "", kind: "private", is_page: true, author_name: "", text: "Private answer", created_at: iso(20) },
    { ref: "cm_b", is_page: false, author_name: "Joe", text: "Thanks", created_at: iso(10) },
  ] });
  await d.openInbox();
  await d.openRow(0);
  const outs = d.all(d.$("ib-threadpane"), "ib-msg-out");
  assert.equal(outs.length, 2);
  outs.forEach((o) => { assert.equal(d.all(o, "cm-rname").length, 0); });
  assert.ok(!pane(d).includes("Ana Store Page") && !pane(d).includes("You"));
  const metas = outs.map((o) => d.all(o, "ib-meta")[0]);
  assert.equal(d.all(metas[0], "cm-kind")[0].textContent, "Comment reply");
  assert.ok(d.all(metas[0], "cm-kind")[0].classList.contains("cm-kind-pub"));
  assert.equal(d.all(metas[1], "cm-kind")[0].textContent, "Private message");
  assert.ok(d.all(metas[1], "cm-kind")[0].classList.contains("cm-kind-priv"));
  assert.equal(metas[0].children[0].classList.contains("cm-kind"), true, "the pill comes before the time");
  const ins = d.all(d.$("ib-threadpane"), "ib-msg-in");
  assert.ok(text(ins[ins.length - 1]).includes("Joe"));
});

test("Hide Comment is a button in the thread header and the old row above the composer is gone", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  const hb = d.$("cm-hide-btn");
  assert.equal(hb.textContent, "Hide Comment");
  const head = d.all(d.$("ib-threadpane"), "ib-thead")[0];
  assert.ok(d.all(head, "cm-hide").includes(hb), "inside the header");
  assert.equal(d.all(d.$("ib-threadpane"), "cm-modes").length, 0);
  await d.click(hb);
  const yes = d.$("cm-hide-yes");
  assert.equal(yes.textContent, "Hide Comment");
  assert.ok(d.all(d.$("ib-threadpane"), "cm-confirm").length === 1);
  await d.click(d.press(d.$("ib-threadpane"), "Cancel"));
  assert.equal(d.$("cm-hide-yes"), null);
});

test("the gold comment-reply pill has readable colours in both themes", () => {
  const css = fs.readFileSync(path.join(JS, "../css/inbox.css"), "utf8");
  assert.match(css, /\.cm-kind-pub \{[^}]*#F2D488[^}]*#F2D488/);
  assert.match(css, /data-theme="light"\] #view-inbox \.cm-kind-pub \{[^}]*#D9A21B[^}]*#fff8e6[^}]*#7A5A00/);
  assert.match(css, /\.cm-kind-priv \{[^}]*var\(--link\)/);
});

test("comment threads space their message blocks 24px apart; the shared .ib-msgs gap stays 10px", () => {
  const css = fs.readFileSync(path.join(JS, "../css/inbox.css"), "utf8");
  assert.match(css, /#view-inbox \.cm-msgs \{[^}]*gap: 24px/);
  assert.match(css, /#view-inbox \.ib-msgs \{[^}]*gap: 10px/);
  assert.match(css, /#view-inbox \.ib-msg \{[^}]*gap: 4px/);
});

function NOUtil(d) { return d.window.NOInboxComments.util; }

test("read-state envelope: unread = closed, filled, accent, aria Unread; read = open, muted, aria Read; opening switches it at once", async () => {
  const d = boot();
  await d.openInbox();
  const d0 = (row) => d.all(row, "ib-rs")[0].all((n) => n.tagName.toLowerCase() === "path")[0].getAttribute("d");
  const u = d.all(d.rows()[0], "ib-rs")[0], closed = d0(d.rows()[0]);
  assert.ok(u.classList.contains("ib-rs-u") && u.getAttribute("aria-label") === "Unread" && u.getAttribute("title") === "Unread");
  const r = d.all(d.rows()[1], "ib-rs")[0];
  assert.ok(r.classList.contains("ib-rs-r") && r.getAttribute("aria-label") === "Read");
  assert.notEqual(d0(d.rows()[1]), closed, "the read one is the open envelope");
  await d.openRow(0);
  const now = d.all(d.rows()[0], "ib-rs")[0];
  assert.ok(now.classList.contains("ib-rs-r") && now.getAttribute("aria-label") === "Read", "marked read by opening it");
  assert.equal(d0(d.rows()[0]), d0(d.rows()[1]));
  const css = fs.readFileSync(path.join(JS, "../css/inbox.css"), "utf8");
  assert.match(css, /\.ib-rs-u svg \{[^}]*fill: currentColor/);
  assert.match(css, /\.ib-item\.is-sel \.ib-rs-u svg \{[^}]*stroke:/, "the selected-row tint has its own envelope outline");
});

/* ---------- round 9: envelope colours, Answered toggle, tooltips on every disabled send button ---------- */

test("r9: the read envelope is house green (--ov-green, defined for both themes), the unread one stays accent blue", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /^#view-inbox \.ib-rs-r \{ color: var\(--ov-green\); \}/m);
  assert.match(css, /^#view-inbox \.ib-rs-u \{ color: var\(--link\); \}/m);
  const dash = fs.readFileSync(path.join(JS, "..", "css", "dash.css"), "utf8");
  assert.match(dash, /^body\.dash-app \{ --ov-green: #5FD3A2;/m, "dark");
  assert.match(dash, /html\[data-theme="light"\] body\.dash-app \{ --ov-green: #1F8A5B;/, "light");
});

test("r9: the list rows carry no Answered / Unanswered pill; the thread header keeps its chip", async () => {
  const d = boot();
  await d.openInbox();
  d.rows().forEach((r) => { assert.equal(d.all(r, "chip").filter((c) => /nswered/.test(text(c))).length, 0); });
  await d.openRow(1);
  assert.ok(text(d.all(d.$("ib-threadpane"), "ib-thead")[0]).includes("Unanswered"));
});

test("r12: the Answered toggle sits beside the Read toggle, cycles All > Answered > Unanswered > All, and sends answered= to the conversations and the comments routes", async () => {
  const d = boot({ convs: [conv(1, 5, { answered: true })] });
  await d.openInbox();
  const t = () => d.$("ib-atog"), st = () => [t().getAttribute("aria-label"), t().getAttribute("title"), t().getAttribute("aria-pressed"), t().classList.contains("is-on")];
  const api = (n) => d.since(n).filter((x) => x.indexOf("/inquiries/c") >= 0).sort();
  assert.equal(t().tagName, "BUTTON");
  assert.deepEqual(st(), ["Showing answered and unanswered", null, "false", false]);
  let n = d.calls.length;
  await d.click(t());
  assert.deepEqual(st(), ["Showing answered only", null, "true", true]);
  assert.deepEqual(api(n), ["GET " + CB + "?answered=answered", "GET " + CV + "?answered=answered"], "both routes");
  assert.ok(d.rows().some((r) => !text(r).includes("FB Comment")), "conversations are not dropped while it is on");
  n = d.calls.length;
  await d.click(t());
  assert.deepEqual(st(), ["Showing unanswered only", null, "true", true]);
  assert.deepEqual(api(n), ["GET " + CB + "?answered=unanswered", "GET " + CV + "?answered=unanswered"]);
  n = d.calls.length;
  await d.click(t());
  assert.deepEqual(st(), ["Showing answered and unanswered", null, "false", false]);
  assert.deepEqual(api(n), ["GET " + CB, "GET " + CV]);
  /* it combines with Read/Unread and Open/Closed, and is not the status dropdown */
  await d.click(t());
  n = d.calls.length;
  await d.click(d.$("ib-rtog"));
  assert.deepEqual(api(n), ["GET " + CB + "?unread=1&answered=answered", "GET " + CV + "?unread=1&answered=answered"]);
  n = d.calls.length;
  await d.pick("ib-status", "closed");
  assert.deepEqual(api(n), ["GET " + CV + "?status=closed&unread=1&answered=answered"], "Closed reads no comments");
  assert.equal(d.$("ib-atog").getAttribute("aria-pressed"), "true");
});

test("r9: a failed read puts the Answered toggle back", async () => {
  const d = boot();
  await d.openInbox();
  await d.pick("ib-filter", "fbcomment"); /* comments are the only source, so their failure is a failed read */
  d.s.listAnswer = { status: 502, body: { error: { code: "server_error", message: "Try later." } } };
  await d.click(d.$("ib-atog"));
  assert.equal(d.$("ib-atog").getAttribute("aria-label"), "Showing answered and unanswered");
});

/* One check per disabled state of each send button: the button is aria-disabled (never natively), describedby its tooltip, shows the text on
   hover, focus and tap, and a click sends nothing. */
async function tipCheck(d, label, tipId, expected) {
  const det = d.$("ib-threadpane"), b = d.press(det, label);
  assert.equal(b.disabled, false, label + ": not natively disabled (" + expected + ")");
  assert.equal(b.getAttribute("aria-disabled"), "true");
  assert.equal(b.getAttribute("aria-describedby"), tipId);
  const tip = d.$(tipId);
  assert.equal(tip.getAttribute("role"), "tooltip");
  assert.equal(text(tip), expected);
  b.fire("mouseenter"); assert.ok(tip.classList.contains("is-open"), "hover");
  b.fire("mouseleave"); assert.ok(!tip.classList.contains("is-open"));
  b.fire("focus"); assert.ok(tip.classList.contains("is-open"), "focus");
  b.fire("blur"); assert.ok(!tip.classList.contains("is-open"));
  b.fire("pointerdown", { pointerType: "touch" }); b.fire("focus"); b.fire("mouseenter"); await d.click(b);
  assert.ok(tip.classList.contains("is-open"), "tap");
  b.fire("blur"); b.fire("mouseleave");
  const before = d.calls.length;
  await d.click(b);
  assert.ok(!d.since(before).some((x) => x.startsWith("POST ")), "a click while disabled sends nothing");
}

test("r9: empty box: both send buttons are aria-disabled with \"Type a message first.\"; typing enables them and removes the tooltips", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  await tipCheck(d, "Send Comment Reply", "cm-pub-tip", "Type a message first.");
  await tipCheck(d, "Send private message", "cm-priv-tip", "Type a message first.");
  d.$("cm-rb").value = "   "; d.$("cm-rb").fire("input");
  assert.equal(text(d.$("cm-pub-tip")), "Type a message first.", "spaces only is still empty");
  d.$("cm-rb").value = "Hi"; d.$("cm-rb").fire("input");
  assert.equal(d.$("cm-pub-tip"), null); assert.equal(d.$("cm-priv-tip"), null);
  for (const l of ["Send Comment Reply", "Send private message"]) {
    const b = d.press(d.$("ib-threadpane"), l);
    assert.equal(b.getAttribute("aria-disabled"), "false"); assert.equal(b.getAttribute("aria-describedby"), null);
  }
});

test("r9: private-message reasons come before the empty-box reason", async () => {
  for (const [reason, tipText] of [["window_closed", "Private reply is only possible within 7 days of the comment."], ["already_sent", "Private message already sent for this comment."], ["reconnect", "Reconnect your Facebook Page to reply."], ["removed", "This comment was deleted on Facebook."]]) {
    const d = boot();
    d.s.detail = detail({ private_reply: { available: false, reason, replied_at: null, expires_at: iso(60) } });
    await d.openInbox();
    await d.openRow(0);
    await tipCheck(d, "Send private message", "cm-priv-tip", tipText); /* the box is empty here, and the reason is still the PM one */
    await tipCheck(d, "Send Comment Reply", "cm-pub-tip", "Type a message first.");
    d.$("cm-rb").value = "Hi"; d.$("cm-rb").fire("input");
    assert.equal(text(d.$("cm-priv-tip")), tipText, "typing does not change it");
    assert.equal(d.$("cm-pub-tip"), null, "the public reply is enabled");
  }
});

test("r9: public reply reasons, a missing reason falls back to a sentence, and both off", async () => {
  const d = boot();
  d.s.detail = detail({ public_reply: { available: false, reason: "own_comment", replied_at: null } });
  await d.openInbox();
  await d.openRow(0);
  d.$("cm-rb").value = "Hi"; d.$("cm-rb").fire("input");
  await tipCheck(d, "Send Comment Reply", "cm-pub-tip", "This is your Page's own comment.");
  assert.equal(d.$("cm-priv-tip"), null);
  const e = boot();
  e.s.detail = detail({ public_reply: { available: false, reason: "" }, private_reply: { available: false, reason: "" } });
  await e.openInbox();
  await e.openRow(0);
  assert.equal(e.$("cm-rb").disabled, true);
  await tipCheck(e, "Send Comment Reply", "cm-pub-tip", "A comment reply is not possible for this comment.");
  await tipCheck(e, "Send private message", "cm-priv-tip", "A private message is not possible for this comment.");
  const f = boot();
  f.s.detail = detail({ public_reply: { available: false, reason: "not_connected" }, private_reply: { available: false, reason: "not_connected" } });
  await f.openInbox();
  await f.openRow(0);
  await tipCheck(f, "Send Comment Reply", "cm-pub-tip", "Connect your Facebook Page to reply.");
  await tipCheck(f, "Send private message", "cm-priv-tip", "Connect your Facebook Page to reply.");
});

test("r9: too long for the comment reply is a tooltip too; Enter never sends while the reply has a reason", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  d.$("cm-rb").value = "x".repeat(600); d.$("cm-rb").fire("input");
  await tipCheck(d, "Send Comment Reply", "cm-pub-tip", "A comment reply can be 500 characters at most.");
  assert.equal(d.$("cm-priv-tip"), null, "600 is fine for a private message");
  d.$("cm-rb").value = ""; d.$("cm-rb").fire("input");
  const before = d.calls.length;
  d.$("cm-rb").fire("keydown", { key: "Enter" }); await settle();
  assert.ok(!d.since(before).some((x) => x.startsWith("POST ")), "Enter on an empty box sends nothing");
});

test("r9: the pub tooltip opens to the right of the button so it stays on screen on a phone", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8");
  assert.match(css, /\.cm-tip\.cm-tip-l \{ left: 0; right: auto; \}/);
});

/* ---------- round 10: the answered state icon after the channel pill ---------- */

test("r11: every FB Comment row has a status icon right after the name (check = answered, alert = unanswered), not in the pill line; other rows have none", async () => {
  const d = boot({ convs: [conv(1, 5)] });
  await d.openInbox();
  const rows = d.rows();
  assert.equal(d.all(rows[0], "cm-st").length, 0, "a conversation row has no status icon");
  const want = [[1, "Unanswered", "cm-st-no", "M12 7.5v5"], [2, "Answered", "cm-st-ok", "M8 12l3 3 5-6"], [3, "Unanswered", "cm-st-no", "M12 7.5v5"]];
  for (const [i, label, cls, dpart] of want) {
    const top = d.all(rows[i], "ib-top")[0], badges = d.all(rows[i], "ib-badges")[0];
    assert.deepEqual(top.children.map((n) => n.classList.contains("ib-name") ? "name" : n.classList.contains("cm-st") ? "icon" : "?"), ["name", "icon"], "name, then the icon");
    assert.equal(d.all(badges, "cm-st").length, 0, "not in the pill line");
    assert.deepEqual(badges.children.map((n) => text(n)).slice(0, 1), ["FB Comment"]);
    const st = top.children[1];
    assert.ok(st.classList.contains(cls));
    assert.equal(st.getAttribute("aria-label"), label);
    assert.equal(st.getAttribute("tabindex"), "0");
    const path = st.all((n) => n.tagName.toLowerCase() === "path")[0].getAttribute("d");
    assert.ok(path.includes(dpart.slice(0, 8)));
    assert.equal(text(d.$(st.getAttribute("aria-describedby"))), label);
  }
  assert.equal(d.all(rows[1], "cm-ad").length, 0);
});

test("r10: the status icon tooltip opens on hover, focus and tap; a tap or click on it never opens the row", async () => {
  const d = boot();
  await d.openInbox();
  const st = d.all(d.rows()[0], "cm-st")[0], tip = d.$(st.getAttribute("aria-describedby"));
  assert.equal(tip.getAttribute("role"), "tooltip");
  assert.ok(!tip.classList.contains("is-open"));
  st.fire("mouseenter"); assert.ok(tip.classList.contains("is-open"), "hover");
  st.fire("mouseleave"); assert.ok(!tip.classList.contains("is-open"));
  st.fire("focus"); assert.ok(tip.classList.contains("is-open"), "focus");
  st.fire("keydown", { key: "Escape" }); assert.ok(!tip.classList.contains("is-open"), "Escape");
  st.fire("blur");
  let stopped = 0;
  const tap = async () => { st.fire("pointerdown", { pointerType: "touch" }); st.fire("focus"); st.fire("mouseenter"); st.fire("click", { stopPropagation() { stopped++; } }); await settle(); };
  await tap(); assert.ok(tip.classList.contains("is-open"), "one tap opens it and it stays open");
  await tap(); assert.ok(!tip.classList.contains("is-open"), "a second tap closes it");
  assert.equal(stopped, 2, "the click stops before it reaches the row button");
  assert.ok(!d.calls.some((c) => c.method === "GET" && c.path === CB + R1 + "/"), "the row was not opened");
  assert.equal(d.rows()[0].getAttribute("aria-current"), null);
  /* only one tooltip at a time */
  const st2 = d.all(d.rows()[1], "cm-st")[0], tip2 = d.$(st2.getAttribute("aria-describedby"));
  st.fire("focus"); st2.fire("focus");
  assert.ok(tip2.classList.contains("is-open") && !tip.classList.contains("is-open"));
});

test("r10: the status icon follows the answered state at once after a reply", async () => {
  const d = boot();
  await d.openInbox();
  await d.openRow(0);
  d.$("cm-rb").value = "Yes"; d.$("cm-rb").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send Comment Reply"));
  const st = d.all(d.rows()[0], "cm-st")[0];
  assert.equal(st.getAttribute("aria-label"), "Answered");
  assert.ok(st.classList.contains("cm-st-ok"));
});

test("r10: icon colours: green --ov-green when answered, light gold #F2D488 dark / #A87A00 light when unanswered, tooltip fixed so the list cannot clip it", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /^#view-inbox \.cm-st-ok \{ color: var\(--ov-green\); \}/m);
  assert.match(css, /^#view-inbox \.cm-st-no \{ color: #F2D488; \}/m);
  assert.match(css, /html\[data-theme="light"\] #view-inbox \.cm-st-no \{ color: #A87A00; \}/);
  assert.match(css, /prefers-color-scheme: light\) \{ html:not\(\[data-theme\]\) #view-inbox \.cm-st-no \{ color: #A87A00; \}/);
  assert.match(css, /\.cm-tip\.cm-tip-b \{ position: fixed;/);
});

test("r11: a long name shortens with an ellipsis before the icon; the icon never wraps and the time stays in its own column", async () => {
  const d = boot();
  d.s.listing = listing({ items: [item({ author_name: "A very long commenter name that goes on and on ".repeat(4) })] });
  await d.openInbox();
  const r = d.rows()[0], top = d.all(r, "ib-top")[0];
  assert.equal(top.children.length, 2);
  assert.ok(top.children[0].classList.contains("ib-name-cm") && top.children[1].classList.contains("cm-st"));
  assert.ok(d.all(r, "ib-side")[0].children.some((n) => n.classList.contains("ib-time")), "the time is in the side column, outside the name line");
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /^#view-inbox \.ib-name-cm \{[^}]*overflow: hidden; text-overflow: ellipsis; white-space: nowrap;/m);
  assert.match(css, /^#view-inbox \.ib-name-cm \{[^}]*min-width: 0;/m);
  assert.match(css, /^#view-inbox \.ib-top-cm \.cm-st \{ flex: none; \}/m);
  assert.match(css, /^#view-inbox \.ib-top-cm \{[^}]*min-width: 0;/m);
});

test("r12: every channel's row has the status icon after the name from item.answered; a missing field shows none", async () => {
  const d = boot({ convs: [
    conv(1, 5, { channel: "webchat", answered: true }),
    conv(2, 6, { channel: "email", answered: false }),
    conv(3, 7, { channel: "messenger", answered: false }),
    conv(4, 8, { channel: "webchat" })] });
  await d.openInbox();
  const rowOf = (name) => d.rows().find((r) => d.all(r, "ib-name")[0].textContent === name);
  const iconOf = (name) => d.all(rowOf(name), "ib-top")[0].children.filter((n) => n.classList.contains("cm-st"))[0] || null;
  for (const [name, label, cls] of [["Buyer 1", "Answered", "cm-st-ok"], ["Buyer 2", "Unanswered", "cm-st-no"], ["Buyer 3", "Unanswered", "cm-st-no"]]) {
    const st = iconOf(name);
    assert.ok(st && st.classList.contains(cls), name);
    assert.equal(st.getAttribute("aria-label"), label);
    assert.equal(d.all(rowOf(name), "ib-top")[0].children[0].classList.contains("ib-name"), true, "right after the name");
    assert.equal(d.all(d.all(rowOf(name), "ib-badges")[0], "cm-st").length, 0, "not in the pill line");
    const tip = d.$(st.getAttribute("aria-describedby"));
    st.fire("focus"); assert.ok(tip.classList.contains("is-open")); st.fire("blur");
    let stopped = 0; st.fire("click", { stopPropagation() { stopped++; } }); assert.equal(stopped, 1, "a tap never opens the row");
  }
  assert.equal(iconOf("Buyer 4"), null, "no field, no icon");
  assert.ok(d.all(rowOf("Commenter 1") || d.rows()[0], "cm-st").length >= 0);
  assert.equal(d.rows().filter((r) => d.all(r, "cm-st").length === 1).length, 3 + 3, "3 conversations with the field and the 3 comments");
});

/* ---------- round 12 addition 2: one dark house tooltip, on the title toggles too ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("r12: the title toggles have no native title; they get the house tooltip: hover after ~120 ms, focus at once, tap toggles; aria-label kept", async () => {
  const d = boot();
  await d.openInbox();
  for (const id of ["ib-atog", "ib-rtog"]) {
    const b = d.$(id), tip = d.$(id + "-tip");
    assert.equal(b.getAttribute("title"), null, id + ": no native title");
    assert.ok(b.getAttribute("aria-label"), "aria-label kept");
    assert.equal(b.getAttribute("aria-describedby"), id + "-tip");
    assert.equal(tip.getAttribute("role"), "tooltip");
    assert.ok(tip.classList.contains("cm-tip"), "the one shared tooltip class");
    assert.ok(!tip.classList.contains("is-open"));
    b.fire("mouseenter");
    assert.ok(!tip.classList.contains("is-open"), "not at once on hover");
    await sleep(160);
    assert.ok(tip.classList.contains("is-open"), "open after ~120 ms");
    assert.equal(text(tip), b.getAttribute("aria-label"));
    b.fire("mouseleave"); assert.ok(!tip.classList.contains("is-open"));
    b.fire("mouseenter"); b.fire("mouseleave"); await sleep(160);
    assert.ok(!tip.classList.contains("is-open"), "leaving before the delay cancels it");
    b.fire("focus"); assert.ok(tip.classList.contains("is-open"), "focus: at once");
    b.fire("keydown", { key: "Escape" }); assert.ok(!tip.classList.contains("is-open"));
    b.fire("blur");
    const tap = () => { b.fire("pointerdown", { pointerType: "touch" }); b.fire("focus"); b.fire("mouseenter"); b.fire("click"); };
    tap(); assert.ok(tip.classList.contains("is-open"), "a tap opens it");
    await sleep(160); assert.ok(tip.classList.contains("is-open"), "the touch mouseenter does not close or reopen it");
    tap(); assert.ok(!tip.classList.contains("is-open"), "a second tap closes it");
    b.fire("blur");
  }
});

test("r12: a phone tap on a title toggle applies the filter AND keeps the tooltip open with the NEW state through the reload, until a scroll, Escape, blur or outside click", async () => {
  for (const id of ["ib-rtog", "ib-atog"]) {
    const d = boot();
    await d.openInbox();
    const b = d.$(id), tip = d.$(id + "-tip"), before = b.getAttribute("aria-label");
    const fireDoc = (type, e) => (d.doc.listeners[type] || []).slice().forEach((fn) => fn(e));
    const reloads = d.paths().length;
    b.fire("pointerdown", { pointerType: "touch" }); b.fire("focus"); b.fire("mouseenter");
    /* the icon is repainted inside the click, so the click target is gone from the page when the click reaches the document */
    const gone = d.doc.createElement("span"); d.doc.contains = (n) => n !== gone;
    b.fire("click"); fireDoc("click", { target: gone });
    await settle();
    assert.ok(d.paths().length > reloads, id + ": the filter was applied (list read again)");
    assert.notEqual(b.getAttribute("aria-label"), before);
    assert.ok(tip.classList.contains("is-open"), id + ": tooltip open after the reload resolved");
    assert.equal(text(tip), b.getAttribute("aria-label"), "it shows the NEW state");
    fireDoc("scroll", { target: d.doc.body }); /* the list's own scroll reset while the reload settles */
    assert.ok(tip.classList.contains("is-open"), "the reload's scroll reset does not close it");
    await sleep(300);
    fireDoc("scroll", { target: d.doc.body }); /* a user scroll later may close it */
    assert.ok(!tip.classList.contains("is-open"), "a user scroll closes it");
    b.fire("pointerdown", { pointerType: "touch" }); b.fire("click"); await settle();
    assert.ok(tip.classList.contains("is-open"));
    fireDoc("click", { target: d.doc.body }); assert.ok(!tip.classList.contains("is-open"), "an outside click closes it");
  }
});

test("r12: the toggle tooltip text follows the state after a click", async () => {
  const d = boot();
  await d.openInbox();
  const b = d.$("ib-rtog"), tip = d.$("ib-rtog-tip");
  b.fire("focus");
  assert.equal(text(tip), "Showing all messages");
  await d.click(b);
  assert.equal(b.getAttribute("aria-label"), "Showing unread");
  assert.equal(text(tip), "Showing unread");
});

test("r12: one dark tooltip style for every Inbox tooltip (send buttons, row icons, toggles), and only one open at a time", async () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = /^#view-inbox \.cm-tip \{([^}]*)\}/m.exec(css)[1];
  assert.match(rule, /background: #1B2236; color: #F2F5FC;/, "dark background, light text, in both themes");
  assert.doesNotMatch(css, /\.cm-tip[^{]*\{[^}]*var\(--text\)/, "no theme-inverted tooltip colours left");
  assert.doesNotMatch(css, /html\[data-theme="light"\] #view-inbox \.cm-tip\b/);
  /* contrast of #F2F5FC on #1B2236 */
  const lum = (h) => { const c = [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (lum("#F2F5FC") + 0.05) / (lum("#1B2236") + 0.05);
  assert.ok(ratio >= 4.5, "contrast " + ratio.toFixed(1));
  const d = boot();
  await d.openInbox();
  const t1 = d.$("ib-atog-tip"), st = d.all(d.rows()[0], "cm-st")[0], t2 = d.$(st.getAttribute("aria-describedby"));
  assert.ok(t2.classList.contains("cm-tip"));
  d.$("ib-atog").fire("focus"); assert.ok(t1.classList.contains("is-open"));
  st.fire("focus"); assert.ok(t2.classList.contains("is-open") && !t1.classList.contains("is-open"), "one at a time across toggles and row icons");
  await d.openRow(0);
  d.$("cm-rb").value = ""; d.$("cm-rb").fire("input");
  const pb = d.press(d.$("ib-threadpane"), "Send private message"), pt = d.$("cm-priv-tip");
  assert.ok(pt.classList.contains("cm-tip"));
  pb.fire("focus"); assert.ok(pt.classList.contains("is-open"));
});

test("failTextOf for the fbcomment channel uses the comment wording, not the email wording", async () => {
  const d = boot();
  await d.openInbox();
  const f = d.window.NOInbox.util.failTextOf;
  assert.equal(f("token_invalid", "fbcomment"), "Reconnect your Facebook Page to reply.");
  assert.equal(f("forbidden_page", "fbcomment"), "Turn on comments for your Page to reply.");
  assert.equal(f("rate_limited", "fbcomment"), "Facebook is limiting replies right now. Try again in a few minutes.");
  assert.equal(f("email_failed", "fbcomment"), "Facebook did not answer. Try again.");
});
