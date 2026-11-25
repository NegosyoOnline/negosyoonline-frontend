/* Schedule SMS (INBOX-FIX-9, round 9, Coach Ed 2026-11-24): inbox-schedule.js and its tab in inbox.js, run like inbox-bulk.test.mjs (the real scripts in a vm
   with the stand-in document and a recorded fetch). The stand-in API for the bulk routes is s.bulk(method, tail, body): it answers {status, body} or nothing (404);
   the scheduled/ routes follow HQ's planned API (schedule-sms-api-r9). Fake data only. */
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
const BASE = `/sites/${A}/inquiries/`;
const SM = "sm_dddddddddddddddddddddddd";
const WC = "wc_aaaaaaaaaaaaaaaaaaaaaaaa", WC2 = "wc_bbbbbbbbbbbbbbbbbbbbbbbb";
const REF = WC;
const REF2 = WC2;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
/* A fixed clock for this whole file (task z8uq9mfvx7): the page shows "today, H:MM" or a date form depending on the Manila time of day,
   so a real clock made tests fail in the evening. Date() and Date.now() answer 10:00 Manila (02:00 UTC) on 2026-11-16 unless
   INBOX_TEST_NOW (an ISO instant) moves it, which is how the evening case is checked. Every test file runs in its own process. */
let FIXED_NOW = Date.parse(process.env.INBOX_TEST_NOW || "2026-11-16T02:00:00Z");
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
  const doc = makeDocument(), calls = [], toasts = [], kinds = [], replaced = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; n.dispatchEvent = (e) => n.fire(e.type); return n; };
  doc.createTextNode = (t) => { const w = make("span"); w.textContent = t; return w.firstChild; };
  const page = doc.body.appendChild(doc.createElement("div")); page.setAttribute("id", "view-inbox");
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
    else if (/^\/sites\/[^/]+\/contacts\//.test(p) && opts.method === "GET") a = s.contacts ? s.contacts(p) || err(404, "not_found", "Not found.") : err(404, "not_found", "Not found.");
    else if (p.indexOf(BASE + "sms/bulk/") === 0) a = s.bulk ? s.bulk(opts.method, p.slice((BASE + "sms/bulk/").length), body) || err(404, "not_found", "Not found.") : err(404, "not_found", "Not found.");
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
  vm.runInContext(read("inbox-bulk.js"), context, { filename: "inbox-bulk.js" });
  vm.runInContext(read("inbox-schedule.js"), context, { filename: "inbox-schedule.js" });
  vm.runInContext(read("inbox.js"), context, { filename: "inbox.js" });
  vm.runInContext(read("inbox-settings.js"), context, { filename: "inbox-settings.js" });
  window.NODash.toast = (title, text, kind) => { toasts.push(title + ": " + (text || "")); if (kind) kinds.push(kind); };
  const $ = (id) => doc.getElementById(id);
  const where = location;
  const all = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label) => buttons(n).find((b) => b.textContent === label);
  const links = (n) => n.all((x) => x.tagName === "A");
  return { doc, calls, toasts, kinds, s, where, winListeners, replaced, $, all, buttons, press, links, nav, window, page,
    list: () => calls.map((c) => c.method + " " + c.path),
    text: (id) => $(id).textContent,
    async openSettings() { window.NOInboxSettings.show(); await settle(); },
    async openInbox() { window.NOInbox.show("sms"); await settle(); },
    async click(node) { node.fire("click"); await settle(); } };
}

/* ---------- fixtures ---------- */

const CH_SMS = { webchat_enabled: true, paused_until: null, chat_limit_reached: false, webchat_available: true, sms_available: true, sms_enabled: true };
const SMS_STATUS = { phone_online: true, daily_limit: 50, left_today: 37, hourly_limit: 20, left_this_hour: 20, enabled: true, prefix: "Test Store: ", max_length: 148, incoming_ready: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const B = "/sites/" + A + "/inquiries/sms/bulk/";
const CT = "/sites/" + A + "/contacts/";
const BULK_STATUS = { available: true, blocked: "", blocked_message: "", phone_online: true, daily_limit: 2000, used_today: 0, left_today: 2000, max_length: 147, active_batch: null,
  window: { start: "08:00", end: "20:00", timezone: "Asia/Manila" }, in_window: true, cost_note: "Texts go out from your own phone and SIM." };
const AUD_ALL = { audience: "all", total_members: 120, will_send: 95, left_out: { unverified: 10, invalid_number: 2, opted_out: 5, duplicates: 8 } };
const AUD_PICK = { audience: "pick", will_send: 14, left_out: {} };
const GROUPS = [{ id: "g1", name: "Regulars", count: 12 }, { id: "g2", name: "VIP", count: 3 }];
const FOUND = { results: [{ id: "c1", first_name: "Lito", last_name: "Cruz", mobile_masked: "0918 *** 5678", opted_out: false }] };
const sched = (over = {}) => ({ id: "sch_aaaaaaaa", state: "scheduled", scheduled_at: "2026-11-17T09:30:00+08:00", audience: "all", text: "Sale this weekend.", size: 95, sent: 0, failed: 0, not_sent: 0, waiting: 0,
  end_reason: "", end_message: "", ...over });
const ok = (body, status = 200) => ({ status, body });
const bad = (status, code, message, fields) => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });

/* A stand-in bulk and scheduled API; `o` overrides single answers. It records what it got in `seen`. */
function api(o = {}) {
  const seen = { audience: [], preview: [], test: [], created: [], patched: [], cancelled: [], lists: [] };
  const fn = (method, tail, body) => {
    if (method === "GET" && tail === "status/") return o.status || ok({ ...BULK_STATUS });
    if (method === "POST" && tail === "audience/") { seen.audience.push(body); return ok(body.audience === "pick" ? AUD_PICK : AUD_ALL); }
    if (method === "POST" && tail === "preview/") {
      seen.preview.push(body);
      if (/\.com|http/i.test(body.text)) return bad(422, "invalid", "The text must not contain a web link.", { text: ["The text must not contain a web link."] });
      return ok({ text: body.text, length: body.text.length, max_length: 160, remaining: 160 - body.text.length });
    }
    if (method === "POST" && tail === "test/") { seen.test.push(body); return o.test ? o.test(body) : ok({ state: "queued", repeated: false }); }
    if (method === "POST" && tail === "scheduled/") { seen.created.push(body); return o.create ? o.create(body, seen) : ok(sched({ id: "sch_new", text: body.text, scheduled_at: body.scheduled_at }), 201); }
    if (method === "GET" && tail.indexOf("scheduled/?") === 0) { seen.lists.push(tail); return o.list ? o.list(tail) : ok({ items: [sched()], next_cursor: null }); }
    if (method === "GET" && /^scheduled\/[^/]+\/$/.test(tail)) return o.detail ? o.detail(tail) : ok(sched());
    if (method === "PATCH" && /^scheduled\/[^/]+\/$/.test(tail)) { seen.patched.push({ tail, body }); return o.patch ? o.patch(body, tail) : ok(sched({ ...body })); }
    if (method === "POST" && /^scheduled\/[^/]+\/cancel\/$/.test(tail)) { seen.cancelled.push(tail); return o.cancel ? o.cancel(tail) : ok(sched({ state: "cancelled" })); }
    return null;
  };
  fn.seen = seen;
  return fn;
}
const contactsApi = () => (p) => {
  if (p === CT + "status/") return ok({ contacts: true, count: 2, max: 20000 });
  if (p === CT + "groups/") return ok(GROUPS);
  if (p.indexOf(CT + "?q=") === 0) return ok(FOUND);
  return null;
};
/* The Schedule SMS tab (/sms/schedule/). opts.form: press Schedule SMS to open the form; default stays on the list. */
async function openSched(o = {}, opts = {}) {
  const d = boot({ listing: list(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS; if (opts.contacts !== false) d.s.contacts = contactsApi();
  const bk = api(o); d.s.bulk = bk; d.bk = bk;
  d.window.NODash.go = (href) => d.window.NOInbox.setTab(/schedule/.test(href) ? "schedule" : /bulk/.test(href) ? "bulk" : /settings/.test(href) ? "settings" : "");
  d.window.NOInbox.show("sms", "schedule"); await settle(); await settle(); await settle();
  if (opts.form && d.$("ib-sc-send")) { await d.click(d.$("ib-sc-send")); await settle(); await settle(); }
  if (opts.form && opts.pick !== false && d.$("ib-sc-to")) { cBox(d, "ib-sc-to").fire("click"); pickRow(d, "ib-sc-to", "All my members"); await settle(); await settle(); }
  return d;
}
const pane = (d) => d.$("ib-schedpane");
const has = (n, c) => n.classList && n.classList.contains(c);
const rowsOf = (d) => pane(d).all((n) => has(n, "ib-sc-tr"));
const cInput = (d, id) => d.$(id).parentNode.all((n) => has(n, "ib-combo-input"))[0];
const cRows = (d, id) => d.$(id).parentNode.all((n) => has(n, "ib-combo-opt"));
const cBox = (d, id) => d.$(id).parentNode.all((n) => has(n, "ib-combo-box"))[0];
const pickRow = (d, id, text) => { const r = cRows(d, id).find((n) => n.textContent.includes(text)); assert.ok(r, "row " + text); r.fire("click"); };
const pickTo = async (d, text) => { cBox(d, "ib-sc-to").fire("click"); pickRow(d, "ib-sc-to", text); await settle(); await settle(); };
const typeText = async (d, t) => { d.$("ib-sc-t").value = t; d.$("ib-sc-t").fire("input"); await sleep(450); await settle(); };
/* the clock stands at 10:00 Manila on 2026-11-16: tomorrow 09:30 is a good slot */
const setSlot = async (d, date = "2026-11-17", time = "09:30") => {
  d.$("ib-sc-date").value = date; d.$("ib-sc-date").fire("change"); d.$("ib-sc-time").value = time; d.$("ib-sc-time").fire("change"); await settle();
};
const fillOk = async (d, text = "Sale this weekend.") => { await typeText(d, text); await setSlot(d); };

/* ---------- tests ---------- */

test("schedule: the SMS page tabs are Inbox | Bulk SMS | Schedule SMS | Settings (only while bulk is on) and /sms/schedule/ is its address", async () => {
  const d = boot({ listing: list(), channels: CH_SMS }); d.s.smsStatus = SMS_STATUS; d.s.bulk = api();
  await d.openInbox();
  assert.deepEqual(d.all(d.$("ib-tabs-host"), "ib-tab").map((n) => n.textContent), ["Inbox", "Bulk SMS", "Schedule SMS", "Settings"]);
  assert.ok(d.$("ib-tab-schedule"));
  const off = boot({ listing: list(), channels: CH_SMS }); off.s.smsStatus = SMS_STATUS;
  await off.openInbox();
  assert.equal(off.$("ib-tab-schedule"), null, "hidden with the bulk switch off");
  const u = d.window.NOInbox.util;
  assert.equal(u.pathOf("sms", "schedule"), "/sms/schedule/");
  const routed = [];
  d.window.NODash.go = (href) => routed.push(href);
  await d.click(d.$("ib-tab-schedule"));
  assert.deepEqual(routed, ["/sms/schedule/"]);
  const HTML = fs.readFileSync(path.join(JS, "..", "..", "index.html"), "utf8");
  assert.match(HTML, /inbox-schedule\.js\?v=\w+/);
  assert.ok(HTML.indexOf("inbox-bulk.js") < HTML.indexOf("inbox-schedule.js") && HTML.indexOf("inbox-schedule.js") < HTML.indexOf("/inbox.js"), "loads after bulk and before inbox.js");
  assert.match(read("dashboard.js"), /"\/sms\/schedule\/": \{ view: "inbox", page: "sms", tab: "schedule"/);
});

test("schedule: a deep link to /sms/schedule/ opens the list; if bulk is not open it falls back to the Inbox tab", async () => {
  const d = await openSched();
  assert.equal(d.$("ib-tab-schedule").getAttribute("aria-selected"), "true");
  assert.equal(pane(d).hidden, false);
  assert.equal(d.$("ib-bulkpane").hidden, true);
  assert.ok(d.list().includes("GET " + B + "scheduled/?limit=20"));
  const off = boot({ listing: list(), channels: CH_SMS }); off.s.smsStatus = SMS_STATUS;
  off.window.NOInbox.show("sms", "schedule"); await settle(); await settle(); await settle();
  assert.equal(off.$("ib-tab-schedule"), null);
  assert.equal(off.$("ib-schedpane").hidden, true, "back on the Inbox tab");
});

test("schedule: the list is a title and a primary Schedule SMS button above a table box (no outer card), with Date, Audience, Message, Status columns", async () => {
  const d = await openSched();
  const hist = d.$("ib-sc-hist");
  assert.ok(!has(hist, "dash-card"), "no outer card");
  assert.ok(has(hist.children[0], "ib-bk-dh") && hist.children[0].textContent.includes("Scheduled SMS"));
  const send = d.$("ib-sc-send");
  assert.ok(send && send.textContent === "Schedule SMS" && has(send, "no-btn-primary") && send.parentNode === hist.children[0]);
  assert.ok(has(hist.children[1], "ib-bk-tbox"));
  const tbl = pane(d).all((n) => n.tagName === "TABLE")[0];
  assert.deepEqual(tbl.all((n) => n.tagName === "TH").map((n) => n.textContent), ["Date and time", "Audience", "Message", "Status", "Actions"]);
  const cells = rowsOf(d)[0].all((n) => n.tagName === "TD");
  assert.ok(/Nov 17, 2026/.test(cells[0].textContent) && /9:30/.test(cells[0].textContent) && /Manila/.test(cells[0].textContent), cells[0].textContent);
  assert.equal(cells[1].textContent, "All my members");
  assert.equal(cells[2].textContent, "Sale this weekend.");
  assert.equal(cells[3].textContent, "Scheduled");
});

test("schedule: the server states map to Scheduled / Sending / Sent / Cancelled / Not sent, with the end reason in muted small text", async () => {
  const items = [sched({ id: "s1", state: "scheduled" }), sched({ id: "s2", state: "waiting" }), sched({ id: "s3", state: "sending" }), sched({ id: "s4", state: "finished" }),
    sched({ id: "s5", state: "cancelled" }), sched({ id: "s6", state: "ended", end_reason: "phone_offline", end_message: "Your phone was offline at the start time." }),
    sched({ id: "s7", state: "stopped", audience: "pick" }), sched({ id: "s8", state: "ended", end_reason: "outside_window", end_message: "" })];
  const d = await openSched({ list: () => ok({ items, next_cursor: null }) });
  const status = (i) => rowsOf(d)[i].all((n) => n.tagName === "TD")[3];
  assert.deepEqual(rowsOf(d).map((_, i) => status(i).children[0].textContent), ["Scheduled", "Sending", "Sending", "Sent", "Cancelled", "Not sent", "Not sent", "Not sent"]);
  assert.equal(status(5).children[1].textContent, "Your phone was offline at the start time.");
  assert.ok(has(status(5).children[1], "ib-sc-why"));
  assert.ok(/start time came after texts may go out/.test(status(7).children[1].textContent), "a plain line for a known reason code when the server sends no words");
  assert.equal(status(3).children.length, 1, "no reason line on a Sent row");
  assert.equal(rowsOf(d)[6].all((n) => n.tagName === "TD")[1].textContent, "Chosen groups and contacts");
  const CSS = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8");
  assert.ok(/\.ib-sc-why \{[^}]*color: var\(--meta\)[^}]*font-size: 13px/.test(CSS), "muted and small");
});

test("schedule: Edit and Cancel show only on a Scheduled row", async () => {
  const items = ["scheduled", "waiting", "sending", "finished", "cancelled", "ended", "stopped"].map((state, i) => sched({ id: "s" + i, state }));
  const d = await openSched({ list: () => ok({ items, next_cursor: null }) });
  const labels = (i) => rowsOf(d)[i].all((n) => n.tagName === "BUTTON").map((n) => n.textContent);
  assert.deepEqual(labels(0), ["Edit", "Cancel"]);
  for (let i = 1; i < 7; i++) assert.deepEqual(labels(i), [], "no actions on " + items[i].state);
});

test("schedule: Cancel asks first; Keep it sends nothing; Yes posts cancel/ and the list is read again", async () => {
  let cancelled = false;
  const d = await openSched({ list: () => ok({ items: [sched({ state: cancelled ? "cancelled" : "scheduled" })], next_cursor: null }), cancel: () => { cancelled = true; return ok(sched({ state: "cancelled" })); } });
  await d.click(pane(d).all((n) => has(n, "ib-sc-cancel"))[0]);
  assert.ok(d.$("ib-sc-dlg") && d.$("ib-sc-dlg").getAttribute("role") === "dialog");
  assert.ok(/^Cancel the text scheduled for /.test(d.$("ib-sc-dlg-t").textContent));
  await d.click(d.$("ib-sc-dlg-back"));
  assert.equal(d.$("ib-sc-dlg"), null);
  assert.deepEqual(d.bk.seen.cancelled, [], "nothing was sent");
  await d.click(pane(d).all((n) => has(n, "ib-sc-cancel"))[0]);
  await d.click(d.$("ib-sc-dlg-go"));
  assert.deepEqual(d.bk.seen.cancelled, ["scheduled/sch_aaaaaaaa/cancel/"]);
  assert.ok(d.list().includes("POST " + B + "scheduled/sch_aaaaaaaa/cancel/"));
  assert.equal(d.$("ib-sc-dlg"), null);
  assert.equal(rowsOf(d)[0].all((n) => n.tagName === "TD")[3].children[0].textContent, "Cancelled");
  assert.equal(rowsOf(d)[0].all((n) => n.tagName === "BUTTON").length, 0);
  assert.ok(pane(d).textContent.includes("The scheduled text was cancelled."));
});

test("schedule: cancelling a text that already started (409 already_started) says so and reads the list again", async () => {
  let started = false;
  const d = await openSched({ list: () => ok({ items: [sched({ state: started ? "sending" : "scheduled" })], next_cursor: null }), cancel: () => { started = true; return bad(409, "already_started", ""); } });
  await d.click(pane(d).all((n) => has(n, "ib-sc-cancel"))[0]);
  await d.click(d.$("ib-sc-dlg-go"));
  assert.ok(/already started or was cancelled/.test(pane(d).textContent), "plain fallback by code");
  assert.equal(rowsOf(d)[0].all((n) => n.tagName === "TD")[3].children[0].textContent, "Sending");
  assert.equal(d.bk.seen.lists.length, 2, "the list was read again");
});

test("schedule: the list pages with the cursor (Show more), soonest first as the server sends it", async () => {
  const seen = [];
  const d = await openSched({ list: (tail) => { seen.push(tail); return /cursor=c2/.test(tail) ? ok({ items: [sched({ id: "s3", text: "Third" })], next_cursor: null }) : ok({ items: [sched({ id: "s1", text: "First" }), sched({ id: "s2", text: "Second" })], next_cursor: "c2" }); } });
  assert.equal(rowsOf(d).length, 2);
  await d.click(d.press(pane(d), "Show more"));
  assert.equal(rowsOf(d).length, 3);
  assert.deepEqual(seen, ["scheduled/?limit=20", "scheduled/?limit=20&cursor=c2"]);
  assert.equal(d.press(pane(d), "Show more"), undefined);
  assert.deepEqual(rowsOf(d).map((r) => r.all((n) => n.tagName === "TD")[2].textContent), ["First", "Second", "Third"]);
});

test("schedule: an empty list says nothing is scheduled; a failed read offers Try again", async () => {
  const d = await openSched({ list: () => ok({ items: [], next_cursor: null }) });
  assert.ok(pane(d).textContent.includes("Nothing is scheduled yet."));
  assert.ok(d.$("ib-sc-send"));
  const e = await openSched({ list: () => bad(500, "server_error", "Oops.") });
  assert.ok(pane(e).textContent.includes("We could not load your scheduled texts just now."));
  assert.ok(e.press(pane(e), "Try again"));
});

test("schedule form: Send to (one house dropdown, All my members first and selected) sits above Message; then the date and time; Send Test SMS and Schedule", async () => {
  const d = await openSched({}, { form: true });
  const form = d.$("ib-sc-t").parentNode.parentNode;
  const ids = form.children.map((n) => n.all((x) => x.id).map((x) => x.id)[0] || "");
  assert.ok(ids.indexOf("ib-sc-to") >= 0 && ids.indexOf("ib-sc-to") < ids.indexOf("ib-sc-t"), "Send to above Message");
  assert.ok(ids.indexOf("ib-sc-t") < ids.indexOf("ib-sc-date"), "the date and time come after the message");
  const sels = pane(d).all((n) => n.tagName === "SELECT");
  assert.deepEqual(sels.map((n) => n.id), ["ib-sc-to", "ib-sc-date", "ib-sc-time"], "the Send to dropdown is ONE; the date and time are house dropdowns too");
  for (const id of ["ib-sc-to", "ib-sc-date", "ib-sc-time"]) assert.ok(has(d.$(id).parentNode, "ib-combo"), id + " is the house combo, not native");
  assert.equal(pane(d).all((n) => n.tagName === "INPUT" && /date|time|radio/.test(n.getAttribute("type") || "")).length, 0, "no native date, time or radio inputs");
  assert.equal(d.$("ib-sc-to").value, "", "the input keeps its placeholder; All my members is a chip");
  assert.equal(cInput(d, "ib-sc-to").value, "");
  assert.deepEqual(d.$("ib-sc-chips").all((n) => has(n, "ib-bk-pchip")).map((n) => n.textContent), ["All my members (95)×"], "members only: exactly one chip");
  assert.equal(d.$("ib-sc-chips").all((n) => has(n, "ib-bk-pchip-x")).length, 1);
  assert.deepEqual(d.bk.seen.audience, [{ audience: "all" }]);
  cBox(d, "ib-sc-to").fire("click");
  assert.deepEqual(cRows(d, "ib-sc-to").map((n) => n.textContent.replace(/Group$/, "")), ["All my members", "Regulars (12)", "VIP (3)"]);
  assert.equal(d.$("ib-sc-test").textContent, "Send Test SMS");
  assert.equal(d.$("ib-sc-go").textContent, "Schedule");
  assert.ok(!/Will send to/.test(pane(d).textContent), "no count line");
  assert.ok(!/consent|promo|agree/i.test(pane(d).textContent));
  assert.ok(!pane(d).textContent.includes("Test Store:"), "no prefix text");
});

test("schedule form: the counter reads 0 / 160 and follows the typing; contacts stay hidden when the contacts switch is off", async () => {
  const d = await openSched({}, { form: true, contacts: false });
  assert.equal(d.$("ib-sc-c").textContent, "0 / 160");
  await typeText(d, "Hello po");
  assert.equal(d.$("ib-sc-c").textContent, "8 / 160");
  assert.ok(!d.calls.some((c) => c.path === CT + "groups/"), "no group is asked while contacts are off");
  cBox(d, "ib-sc-to").fire("click");
  assert.deepEqual(cRows(d, "ib-sc-to").map((n) => n.textContent), ["All my members"]);
});

test("schedule form: picking groups and contacts shows chips and asks the count for the pick; removing the last chip goes back to nothing chosen", async () => {
  const d = await openSched({}, { form: true });
  await pickTo(d, "Regulars");
  assert.deepEqual(d.$("ib-sc-chips").all((n) => has(n, "ib-bk-pchip")).map((n) => n.textContent.replace(/×$/, "")), ["Regulars (12)"]);
  assert.deepEqual(d.bk.seen.audience.at(-1), { audience: "pick", groups: ["g1"], contacts: [] });
  assert.ok(!/Will send to/.test(pane(d).textContent));
  cBox(d, "ib-sc-to").fire("click");
  const i = cInput(d, "ib-sc-to"); i.value = "Lito"; i.fire("input"); await sleep(350); await settle();
  pickRow(d, "ib-sc-to", "Lito Cruz"); await settle(); await settle();
  assert.deepEqual(d.bk.seen.audience.at(-1), { audience: "pick", groups: ["g1"], contacts: ["c1"] });
  for (const x of d.$("ib-sc-chips").all((n) => has(n, "ib-bk-pchip-x"))) { x.fire("click"); await settle(); await settle(); }
  assert.equal(d.$("ib-sc-to").value, "");
  assert.equal(d.$("ib-sc-chips").all((n) => has(n, "ib-bk-pchip")).length, 0, "no chip until a choice");
  assert.equal(d.$("ib-sc-go").disabled, true);
});

test("schedule form: the date and time pickers offer today and 30 days, and 8:00 am to 7:45 pm every 15 minutes (Manila)", async () => {
  const d = await openSched({}, { form: true });
  cBox(d, "ib-sc-date").fire("click");
  const dates = cRows(d, "ib-sc-date").map((n) => n.textContent);
  assert.equal(dates.length, 31);
  assert.equal(dates[0], "Today, Mon, Nov 16");
  assert.equal(dates[1], "Tomorrow, Tue, Nov 17");
  assert.equal(dates[30], "Wed, Dec 16");
  cBox(d, "ib-sc-time").fire("click");
  const times = cRows(d, "ib-sc-time").map((n) => n.textContent);
  assert.equal(times[0], "10:15 am", "Today: only times at least 10 minutes ahead (it is 10:00)"); assert.equal(times.at(-1), "7:45 pm"); assert.equal(times.length, 39);
  const all = d.window.NOInboxSchedule.util.timeOptions().map((o) => o[1]);
  assert.equal(all[0], "8:00 am"); assert.equal(all[1], "8:15 am"); assert.equal(all.at(-1), "7:45 pm"); assert.equal(all.length, 48, "20:00 is not offered: the window ends before it");
  assert.ok(pane(d).textContent.includes("Manila time, 8:00 am to 8:00 pm. At least 10 minutes from now and up to 30 days ahead."));
  const u = d.window.NOInboxSchedule.util, now = Date.now();
  assert.equal(u.slotProblem("2026-11-16", "10:05", now).code, "too_soon");
  assert.equal(u.slotProblem("2026-11-17", "07:45", now).code, "outside_window");
  assert.equal(u.slotProblem("2026-11-17", "20:00", now).code, "outside_window");
  assert.equal(u.slotProblem("2026-11-17", "20:15", now).code, "outside_window");
  assert.equal(u.slotProblem("2026-11-17", "19:45", now), null);
  assert.equal(u.slotProblem("2026-12-17", "09:00", now).code, "too_far");
  assert.equal(u.slotProblem("2026-11-16", "10:15", now), null);
  assert.equal(u.slotProblem("2026-12-16", "10:00", now), null);
  assert.equal(u.isoOf("2026-11-17", "09:30"), "2026-11-17T09:30:00+08:00");
});

test("schedule form: a slot that is too soon shows a hint on the date and time field and keeps Schedule off; a good slot turns it on", async () => {
  const d = await openSched({}, { form: true });
  await typeText(d, "Sale this weekend.");
  assert.equal(d.$("ib-sc-go").disabled, false, "the date and time start on the first good slot");
  await setSlot(d, "2026-11-16", "10:00");
  assert.ok(d.$("ib-sc-de").textContent.includes("at least 10 minutes from now") && d.$("ib-sc-de").hidden === false);
  assert.equal(d.$("ib-sc-go").disabled, true);
  await setSlot(d, "2026-12-30", "09:00");
  assert.ok(d.$("ib-sc-de").textContent.includes("within the next 30 days"));
  await setSlot(d, "2026-11-17", "07:30");
  assert.ok(d.$("ib-sc-de").textContent.includes("08:00 to 20:00 Manila"));
  await setSlot(d, "2026-11-17", "09:30");
  assert.equal(d.$("ib-sc-de").hidden, true);
  assert.equal(d.$("ib-sc-go").disabled, false);
});

test("schedule form: Schedule posts scheduled/ with the text, audience all, scheduled_at as ISO with +08:00, and one idempotency key; the list returns with a note", async () => {
  const d = await openSched({}, { form: true });
  await fillOk(d);
  await d.click(d.$("ib-sc-go"));
  const b = d.bk.seen.created[0];
  assert.deepEqual(Object.keys(b).sort(), ["audience", "idempotency_key", "scheduled_at", "text"]);
  assert.equal(b.audience, "all"); assert.equal(b.text, "Sale this weekend."); assert.equal(b.scheduled_at, "2026-11-17T09:30:00+08:00");
  assert.match(b.idempotency_key, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(d.$("ib-sc-t"), null, "back to the list");
  assert.ok(d.$("ib-sc-send"));
  assert.ok(d.toasts.some((t) => t.startsWith("Scheduled for ")), "the result is a toast");
  assert.equal(d.bk.seen.lists.length, 2, "the list was read again");
});

test("schedule form: a pick audience posts groups and contacts (ids only)", async () => {
  const d = await openSched({}, { form: true });
  await pickTo(d, "Regulars"); await pickTo(d, "VIP");
  await fillOk(d);
  await d.click(d.$("ib-sc-go"));
  const b = d.bk.seen.created[0];
  assert.equal(b.audience, "pick"); assert.deepEqual(b.groups, ["g1", "g2"]); assert.deepEqual(b.contacts, []);
});

test("schedule form: Send Test SMS posts bulk/test/ with the text and a key, and says so; it needs a valid text", async () => {
  const d = await openSched({}, { form: true });
  assert.equal(d.$("ib-sc-test").disabled, true);
  await typeText(d, "Sale this weekend.");
  assert.equal(d.$("ib-sc-test").disabled, false);
  await d.click(d.$("ib-sc-test"));
  assert.deepEqual(Object.keys(d.bk.seen.test[0]).sort(), ["idempotency_key", "text"], "the test sends only text and key");
  assert.equal(d.bk.seen.test.length, 1);
  assert.equal(d.bk.seen.test[0].text, "Sale this weekend."); assert.match(d.bk.seen.test[0].idempotency_key, /^[A-Za-z0-9_-]{8,64}$/);
  assert.ok(d.list().includes("POST " + B + "test/"));
  assert.deepEqual(d.toasts, ["A test text is on its way to your phone.: It counts as one of today's texts."], "a toast with the same words");
  assert.equal(d.$("ib-sc-testnote"), null, "no line under the buttons");
  assert.equal(d.bk.seen.created.length, 0, "a test never schedules");
  await typeText(d, "See https://x.com now");
  assert.equal(d.$("ib-sc-test").disabled, true);
  assert.ok(d.$("ib-sc-e").textContent.length > 0 && d.$("ib-sc-e").hidden === false);
});

test("schedule form: a text over 160 characters is refused on the field and keeps the buttons off", async () => {
  const d = await openSched({}, { form: true });
  await typeText(d, "a".repeat(161));
  assert.equal(d.$("ib-sc-c").textContent, "161 / 160");
  assert.ok(has(d.$("ib-sc-c"), "is-over"));
  assert.equal(d.$("ib-sc-e").hidden, false);
  await setSlot(d);
  assert.equal(d.$("ib-sc-go").disabled, true);
});

test("schedule form: 422 too_soon / outside_window / too_far show on the date and time field, with the server's words when it sends them", async () => {
  for (const [code, msg, want] of [["too_soon", "", "at least 10 minutes"], ["outside_window", "", "08:00 to 20:00 Manila"], ["too_far", "", "next 30 days"], ["too_soon", "Pick a later time, please.", "Pick a later time, please."]]) {
    const d = await openSched({ create: () => bad(422, code, msg) }, { form: true });
    await fillOk(d);
    await d.click(d.$("ib-sc-go"));
    assert.ok(d.toasts[0].includes(want), d.toasts[0]); assert.deepEqual(d.kinds, ["error"], "the server's refusal is the error toast");
    assert.ok(d.$("ib-sc-t"), "the form stays, nothing is lost");
    assert.equal(d.$("ib-sc-t").value, "Sale this weekend.");
    assert.equal(d.$("ib-sc-de").hidden, true, "no line under the buttons or the field for a server refusal");
  }
});

test("schedule form: 409 schedule_limit and empty_audience show plainly in the form; a text field error shows under the message", async () => {
  const d = await openSched({ create: () => bad(409, "schedule_limit", "") }, { form: true });
  await fillOk(d); await d.click(d.$("ib-sc-go"));
  assert.ok(d.toasts[0].includes("at most 20 scheduled texts") && d.kinds[0] === "error");
  assert.equal(d.$("ib-sc-fe"), null);
  const e = await openSched({ create: () => bad(409, "empty_audience", "Nobody to text in this group.") }, { form: true });
  await fillOk(e); await e.click(e.$("ib-sc-go"));
  assert.deepEqual(e.toasts, ["Nobody to text in this group.: "]);
  const t = await openSched({ create: () => bad(422, "invalid", "Text is not allowed.", { text: ["Text is not allowed."] }) }, { form: true });
  await fillOk(t); await t.click(t.$("ib-sc-go"));
  assert.equal(t.$("ib-sc-e").textContent, "Text is not allowed.");
  assert.equal(t.$("ib-sc-de").hidden, true);
});

test("schedule form: a lost answer keeps the idempotency key (nothing is scheduled twice); a refusal takes a new one", async () => {
  const answers = [{ status: 0, body: {} }, bad(409, "schedule_limit", ""), ok(sched(), 201)];
  const d = await openSched({ create: () => answers.shift() }, { form: true });
  await fillOk(d);
  await d.click(d.$("ib-sc-go")); await d.click(d.$("ib-sc-go")); await d.click(d.$("ib-sc-go"));
  const [k1, k2, k3] = d.bk.seen.created.map((b) => b.idempotency_key);
  assert.ok(k1 && k1 === k2, "after a lost answer the same key is sent again");
  assert.ok(k3 && k3 !== k2, "after a refusal (409) the next try has a new key");
});

test("schedule: Edit opens the same form filled in (text, date, time, audience), titled Edit, with Save changes; saving PATCHes scheduled/{id}/ (no idempotency key)", async () => {
  const d = await openSched({ detail: () => ok(sched({ text: "Old text", scheduled_at: "2026-11-18T14:00:00+08:00" })) });
  await d.click(pane(d).all((n) => has(n, "ib-sc-edit"))[0]);
  assert.ok(d.list().includes("GET " + B + "scheduled/sch_aaaaaaaa/"));
  assert.equal(d.$("ib-sc-t").value, "Old text");
  assert.equal(d.$("ib-sc-date").value, "2026-11-18"); assert.equal(cInput(d, "ib-sc-date").value, "Wed, Nov 18");
  assert.equal(d.$("ib-sc-time").value, "14:00"); assert.equal(cInput(d, "ib-sc-time").value, "2:00 pm");
  assert.equal(d.$("ib-sc-go").textContent, "Save changes");
  assert.ok(pane(d).textContent.includes("Edit scheduled text"));
  await typeText(d, "New text");
  await setSlot(d, "2026-11-19", "10:00");
  await d.click(d.$("ib-sc-go"));
  assert.equal(d.bk.seen.patched.length, 1);
  assert.equal(d.bk.seen.patched[0].tail, "scheduled/sch_aaaaaaaa/");
  assert.deepEqual(d.bk.seen.patched[0].body, { audience: "all", text: "New text", scheduled_at: "2026-11-19T10:00:00+08:00" }, "only the listed fields (the API refuses unknown ones)");
  assert.equal(d.bk.seen.created.length, 0);
  assert.ok(d.list().includes("PATCH " + B + "scheduled/sch_aaaaaaaa/"));
  assert.ok(d.$("ib-sc-send") && d.toasts.includes("Your changes were saved.: "));
});

test("schedule: Edit of a pick audience fills the chips when the API sends the picks; when it does not (the real one does not) they stay as saved and nothing becomes everyone", async () => {
  const d = await openSched({ list: () => ok({ items: [sched({ audience: "pick" })], next_cursor: null }), detail: () => ok(sched({ audience: "pick", groups: [{ id: "g1", name: "Regulars" }], contacts: ["c9"] })) });
  await d.click(pane(d).all((n) => has(n, "ib-sc-edit"))[0]);
  assert.deepEqual(d.$("ib-sc-chips").all((n) => has(n, "ib-bk-pchip")).map((n) => n.textContent.replace(/×$/, "")), ["Regulars", "Contact"]);
  assert.deepEqual(d.bk.seen.audience.at(-1), { audience: "pick", groups: ["g1"], contacts: ["c9"] });
  /* the real API does not send the picks back (batch_out has no groups or contacts): they stay as saved, and the PATCH leaves audience, groups and contacts out */
  const e = await openSched({ list: () => ok({ items: [sched({ audience: "pick" })], next_cursor: null }), detail: () => ok(sched({ audience: "pick" })) });
  await e.click(pane(e).all((n) => has(n, "ib-sc-edit"))[0]);
  assert.equal(e.$("ib-sc-to").value, "");
  assert.ok(e.$("ib-sc-count").textContent.includes("Staying with the groups and contacts you chose before."));
  assert.equal(e.$("ib-sc-go").disabled, false);
  await typeText(e, "Changed words");
  await e.click(e.$("ib-sc-go"));
  assert.deepEqual(e.bk.seen.patched[0].body, { text: "Changed words" }, "only the text: the saved time is not sent again, the saved audience is kept");
  const f = await openSched({ list: () => ok({ items: [sched({ audience: "pick" })], next_cursor: null }), detail: () => ok(sched({ audience: "pick" })) });
  await f.click(pane(f).all((n) => has(n, "ib-sc-edit"))[0]);
  await pickTo(f, "VIP");
  await f.click(f.$("ib-sc-go"));
  assert.deepEqual(f.bk.seen.patched[0].body, { audience: "pick", groups: ["g2"], contacts: [], text: "Sale this weekend." });
});

test("schedule: Edit that finds the text already started (409 already_started on save, or a state that is no longer scheduled) says so and refreshes the list", async () => {
  let started = false;
  const d = await openSched({ list: () => ok({ items: [sched({ state: started ? "sending" : "scheduled" })], next_cursor: null }), patch: () => { started = true; return bad(409, "already_started", ""); } });
  await d.click(pane(d).all((n) => has(n, "ib-sc-edit"))[0]);
  await setSlot(d, "2026-11-19", "10:00");
  await d.click(d.$("ib-sc-go"));
  assert.equal(d.$("ib-sc-t"), null, "back on the list");
  assert.ok(d.toasts.some((t) => t.includes("already started")) && d.kinds[0] === "error");
  assert.equal(rowsOf(d)[0].all((n) => n.tagName === "TD")[3].children[0].textContent, "Sending");
  const e = await openSched({ detail: () => ok(sched({ state: "sending" })) });
  await e.click(pane(e).all((n) => has(n, "ib-sc-edit"))[0]);
  assert.equal(e.$("ib-sc-t"), null);
  assert.ok(pane(e).textContent.includes("already started"), "a state that is no longer scheduled still says so on the list");
});

test("schedule: the form has exactly two buttons (Send Test SMS, Schedule); the way back is a small text link above the card, not a button; it returns to the list without asking the server; the page words come through textContent (no markup from the API)", async () => {
  const d = await openSched({ list: () => ok({ items: [sched({ text: "<b>Hi</b>" })], next_cursor: null }) }, { form: true });
  const btns = pane(d).all((n) => n.tagName === "BUTTON" && has(n, "no-btn") && !has(n, "ib-fn")).map((n) => n.textContent);
  assert.deepEqual(btns, ["Send Test SMS", "Schedule"], "exactly two CTAs");
  const link = d.$("ib-sc-back");
  assert.equal(link.tagName, "A"); assert.equal(link.textContent, "\u2190 Scheduled SMS"); assert.ok(!has(link, "no-btn"), "not styled as a button");
  const body = link.parentNode; assert.ok(body.children.indexOf(link) < body.children.findIndex((n) => has(n, "ib-bk-cols")), "above the form card");
  await d.click(link);
  assert.equal(d.$("ib-sc-t"), null);
  assert.equal(d.bk.seen.created.length, 0);
  assert.equal(rowsOf(d)[0].all((n) => n.tagName === "TD")[2].textContent, "<b>Hi</b>");
  const src = read("inbox-schedule.js");
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(src));
});

test("schedule: no gold focus, light blue only; no horizontal page scroll on a phone (the table scrolls inside its box); both themes use the app variables", () => {
  const CSS = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8");
  const mine = CSS.slice(CSS.indexOf("/* INBOX-FIX-9"));
  assert.ok(mine.length > 200);
  assert.doesNotMatch(mine.replace(/\/\*[\s\S]*?\*\//g, ""), /gold|#C9A646|#D9B93F|#[0-9a-fA-F]{6}\b/, "no gold and no fixed colour: the theme variables only");
  assert.ok(/\.ib-sc-when \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(mine));
  assert.ok(/@media \(width < 600px\) \{ #view-inbox \.ib-sc-when \{ grid-template-columns: minmax\(0, 1fr\); \} \}/.test(mine), "date and time stack on a phone");
  assert.doesNotMatch(mine, /overflow-x: ?(scroll|auto)/);
});

/* ---------- round 10 (Coach Ed 2026-11-24, R10-2): the Schedule form never starts on a slot that has already passed ---------- */
const withNow = async (iso, fn) => { const keep = FIXED_NOW; FIXED_NOW = Date.parse(iso); try { await fn(); } finally { FIXED_NOW = keep; } };
const timesOf = (d) => { cBox(d, "ib-sc-time").fire("click"); return cRows(d, "ib-sc-time").map((n) => n.textContent); };
const datesOf = (d) => { cBox(d, "ib-sc-date").fire("click"); return cRows(d, "ib-sc-date").map((n) => n.textContent); };

test("round 10: Today lists only times at least 10 minutes ahead; the date and time start on Today and its first time; 30 days stay", async () => {
  const u = (await openSched({}, {})).window.NOInboxSchedule.util, now = Date.now();
  assert.equal(u.timeOptions(now, "2026-11-16")[0][1], "10:15 am"); /* 10:00 now: 10:10 is the earliest, the grid is 15 minutes */
  assert.equal(u.timeOptions(now, "2026-11-16").length, 39);
  assert.equal(u.timeOptions(now, "2026-11-17").length, 48, "another day offers the whole window");
  assert.equal(u.timeOptions(Date.parse("2026-11-16T02:05:00Z"), "2026-11-16")[0][1], "10:15 am", "exactly 10 minutes ahead is allowed");
  assert.equal(u.timeOptions(Date.parse("2026-11-16T02:06:00Z"), "2026-11-16")[0][1], "10:30 am");
  const d = await openSched({}, { form: true });
  assert.equal(d.$("ib-sc-date").value, "2026-11-16"); assert.equal(cInput(d, "ib-sc-date").value, "Today, Mon, Nov 16");
  assert.equal(d.$("ib-sc-time").value, "10:15"); assert.equal(cInput(d, "ib-sc-time").value, "10:15 am");
  assert.equal(datesOf(d).length, 31);
});

test("round 10: Today is left out of the date list once no time is left today (after 7:35 pm Manila); Tomorrow keeps its label and is the default with its first time", async () => {
  await withNow("2026-11-16T11:36:00Z", async () => { /* 19:36 Manila: 19:46 is the earliest, past the last time 19:45 */
    const d = await openSched({}, { form: true });
    const dates = datesOf(d);
    assert.equal(dates[0], "Tomorrow, Tue, Nov 17"); assert.ok(!dates.some((x) => x.startsWith("Today")));
    assert.equal(d.$("ib-sc-date").value, "2026-11-17"); assert.equal(d.$("ib-sc-time").value, "08:00");
    assert.equal(timesOf(d).length, 48);
  });
  await withNow("2026-11-16T11:35:00Z", async () => { /* 19:35 Manila: 19:45 is still allowed */
    const d = await openSched({}, { form: true });
    assert.equal(datesOf(d)[0], "Today, Mon, Nov 16"); assert.equal(d.$("ib-sc-time").value, "19:45");
  });
});

test("round 10: changing the Date keeps the Time when that day offers it, else selects the first valid time of that day", async () => {
  const d = await openSched({}, { form: true });
  d.$("ib-sc-date").value = "2026-11-17"; d.$("ib-sc-date").fire("change"); await settle();
  assert.equal(d.$("ib-sc-time").value, "10:15", "tomorrow offers 10:15");
  d.$("ib-sc-time").value = "08:00"; d.$("ib-sc-time").fire("change"); await settle();
  assert.equal(d.$("ib-sc-time").value, "08:00");
  d.$("ib-sc-date").value = "2026-11-16"; d.$("ib-sc-date").fire("change"); await settle();
  assert.equal(d.$("ib-sc-time").value, "10:15", "today does not offer 8:00 am: the first valid time is chosen"); assert.equal(cInput(d, "ib-sc-time").value, "10:15 am");
});

test("round 10 / fix 5: nothing is written below the buttons; Schedule is off until audience, message and a valid time are in, and on after", async () => {
  const d = await openSched({}, { form: true });
  const after = (n) => { const out = []; let seen = false; for (const c of n.children) { if (seen) out.push(c); if (c.classList && c.classList.contains("ib-bk-actions")) seen = true; } return out; };
  const form = d.$("ib-sc-go").parentNode.parentNode.parentNode;
  assert.equal(after(form).length, 0, "no reason, error or hint after the buttons");
  assert.equal(d.$("ib-sc-why"), null); assert.equal(d.$("ib-sc-fe"), null);
  assert.ok(!/Add a message/.test(pane(d).textContent));
  assert.equal(d.$("ib-sc-go").disabled, true);
  await typeText(d, "Sale this weekend.");
  assert.equal(d.$("ib-sc-go").disabled, false);
  await setSlot(d, "2026-11-16", "10:00");
  assert.equal(d.$("ib-sc-go").disabled, true, "a time that is too soon keeps it off");
  assert.equal(d.$("ib-sc-de").hidden, false, "the time problem stays on the date and time field");
  await setSlot(d, "2026-11-17", "09:30");
  assert.equal(d.$("ib-sc-go").disabled, false);
  await typeText(d, "http://x.example.com");
  assert.equal(d.$("ib-sc-go").disabled, true); assert.ok(d.$("ib-sc-e").textContent.length > 0 && d.$("ib-sc-e").hidden === false, "a text problem stays on the message field");
  const lab = pane(d).all((n) => has(n, "ib-fn-hint") && n.textContent.startsWith("Manila time"))[0];
  assert.ok(lab && has(lab, "ib-bk-will"), "the Manila-time line is a label like the first-name one");
});

test("round 10: a slot that goes stale while the form is open is replaced on the next touch of the Date or Time; the button does not stay off silently", async () => {
  await withNow("2026-11-16T02:00:00Z", async () => {
    const d = await openSched({}, { form: true });
    await typeText(d, "Sale this weekend.");
    assert.equal(d.$("ib-sc-time").value, "10:15"); assert.equal(d.$("ib-sc-go").disabled, false);
    FIXED_NOW = Date.parse("2026-11-16T02:20:00Z"); /* 18 minutes later: 10:15 has passed */
    const row = pane(d).all((n) => has(n, "ib-sc-when"))[0];
    row.fire("focusin"); await settle();
    assert.equal(d.$("ib-sc-time").value, "10:30", "re-filtered: the first time 10 minutes ahead of 10:20");
    assert.equal(d.$("ib-sc-go").disabled, false);
    FIXED_NOW = Date.parse("2026-11-16T11:40:00Z"); /* the evening: Today has no time left */
    row.fire("focusin"); await settle();
    assert.equal(d.$("ib-sc-date").value, "2026-11-17"); assert.equal(d.$("ib-sc-time").value, "10:30", "Today is gone: the next day, the same time as that day offers it"); assert.equal(d.$("ib-sc-go").disabled, false);
    /* if the stale slot is still chosen when the button is checked, the reason shows */
    d.$("ib-sc-date").value = "2026-11-16"; d.$("ib-sc-date").fire("change"); await settle();
    assert.equal(d.$("ib-sc-go").disabled, true);
  });
});

test("round 10: editing keeps the saved date and time selectable and Save changes on, even when that time has passed or is not on the list", async () => {
  const d = await openSched({ detail: () => ok(sched({ text: "Old text", scheduled_at: "2026-11-16T09:40:00+08:00" })) });
  await d.click(pane(d).all((n) => has(n, "ib-sc-edit"))[0]);
  assert.equal(d.$("ib-sc-date").value, "2026-11-16"); assert.equal(d.$("ib-sc-time").value, "09:40");
  assert.equal(d.$("ib-sc-go").disabled, false);
  pane(d).all((n) => has(n, "ib-sc-when"))[0].fire("focusin"); await settle();
  assert.equal(d.$("ib-sc-time").value, "09:40", "a touch of the field does not move a saved time");
  await typeText(d, "New text"); await d.click(d.$("ib-sc-go"));
  assert.deepEqual(d.bk.seen.patched[0].body, { audience: "all", text: "New text" }, "the time is not sent when it did not change");
});

/* ---------- round 11 (Coach Ed 2026-11-24): the Audience column names the groups and the contacts; the two list headings are section-title size ---------- */
test("round 11 R11-1: the Audience cell is All my members, or the groups then the contacts (name, else masked number), one line with an ellipsis and the full list in the title", async () => {
  const rows = [
    sched({ id: "sch_1", audience: "all" }),
    sched({ id: "sch_2", audience: "pick", groups: [{ id: "g1", name: "VIP" }, { id: "g2", name: "Manila" }], contacts: [{ id: "c1", first_name: "Maria", last_name: "Santos", mobile_masked: "0917 *** 1234" }, { id: "c2", first_name: "", last_name: "", mobile_masked: "0918 *** 5678" }, { id: "c3", first_name: "Jun", last_name: "", mobile_masked: "x" }] }),
    sched({ id: "sch_3", audience: "pick" }),
    sched({ id: "sch_4", audience: "pick", groups: [], contacts: [] }),
    sched({ id: "sch_5", audience: "pick", groups: [{ id: "g9", name: "<img src=x onerror=alert(1)>" }], contacts: [] })
  ];
  const d = await openSched({ list: () => ok({ items: rows, next_cursor: null }) });
  const cells = rowsOf(d).map((r) => r.all((n) => n.tagName === "TD")[1]);
  assert.equal(cells[0].textContent, "All my members");
  assert.equal(cells[1].textContent, "VIP, Manila, Maria Santos, 0918 *** 5678, Jun");
  assert.equal(cells[1].getAttribute("title"), "VIP, Manila, Maria Santos, 0918 *** 5678, Jun");
  assert.ok(has(cells[1], "ib-bk-aud"), "the one-line ellipsis class");
  assert.equal(cells[2].textContent, "Chosen groups and contacts", "no names sent: the old label");
  assert.equal(cells[3].textContent, "Chosen groups and contacts", "empty lists: the old label");
  assert.equal(cells[4].textContent, "<img src=x onerror=alert(1)>", "text, never markup");
  assert.equal(cells[4].all((n) => n.tagName === "IMG").length, 0);
  const CSS = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8");
  assert.ok(/td\.ib-bk-aud \{[^}]*overflow: hidden[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/.test(CSS));
  assert.equal(d.window.NOInboxBulk.util.audienceText({ audience: "pick", groups: [{ name: "  " }], contacts: [null, { mobile_masked: " 0917 *** 1 " }] }), "0917 *** 1");
});

test("round 11 R11-2: the Scheduled SMS and Bulk SMS history headings are section-title size (18px, 700, 1.3), the same as the card title; nothing else changed", () => {
  const CSS = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8"), DASH = fs.readFileSync(path.join(JS, "..", "css", "dash.css"), "utf8");
  assert.ok(/dash-card h2 \{[^}]*font-size: 18px; font-weight: 700; line-height: 1\.3/.test(DASH), "the reference");
  assert.ok(/\.ib-bk-histsec h2 \{ font-size: 18px; font-weight: 700; line-height: 1\.3; \}/.test(CSS));
});

/* ---------- {first_name} (ClickUp z8uq9mjj05) ---------- */

test("schedule first name: the + First name button inserts at the caret, counts as typed, shows the help lines, and respects 160", async () => {
  const d = await openSched({}, { form: true });
  const ta = d.$("ib-sc-t"), btn = d.press(d.$("ib-sc-t").parentNode.parentNode, "+ First name");
  assert.ok(btn, "the button is on the Schedule form");
  assert.ok(has(btn.parentNode, "ib-fn-row"), "on the Message label row");
  const lines = () => d.$("ib-sc-t").parentNode.parentNode.all((n) => n.classList && n.classList.contains("ib-fn-help"));
  assert.ok(lines().every((n) => n.hidden));
  await typeText(d, "Hi , sale");
  ta.selectionStart = 3; ta.selectionEnd = 3;
  await d.click(btn);
  assert.equal(ta.value, "Hi {first_name}, sale");
  assert.equal(ta.selectionStart, 15);
  assert.equal(d.doc.activeElement, ta);
  assert.equal(d.$("ib-sc-c").textContent, "21 / 160");
  assert.equal(lines()[0].all((n) => has(n, "ib-fn-outq"))[0].textContent, "Hi Maria, sale");
  assert.equal(lines()[0].all((n) => has(n, "ib-fn-outl"))[0].textContent, "Output:");
  assert.ok(lines().every((n) => !n.hidden));
  await typeText(d, "a".repeat(150));
  await d.click(btn);
  assert.equal(ta.value, "a".repeat(150), "over 160: nothing happens");
  assert.ok(lines().every((n) => n.hidden));
});

test("schedule first name: a 422 on the text shows on the message field", async () => {
  const msg = "Only {first_name} can go inside { }.";
  const t = await openSched({ create: () => bad(422, "invalid", msg, { text: [msg] }) }, { form: true });
  await fillOk(t); await t.click(t.$("ib-sc-go"));
  assert.equal(t.$("ib-sc-e").textContent, msg);
});

test("schedule: typing a { or } outside {first_name} shows the brace message under the message", async () => {
  const msg = "Only {first_name} can go inside { }.";
  const d = await openSched({}, { form: true });
  const u = d.window.NOInboxBulk.util;
  for (const t of ["{name}", "{First_name}", "{first_name", "first_name}", "{}"]) assert.equal(u.problem(t, 160), msg, t);
  for (const t of ["Hi {first_name}, x", "{first_name}{first_name}"]) assert.equal(u.problem(t, 160), "", t);
  assert.notEqual(u.problem("a".repeat(161), 160), msg);
  assert.ok(u.problem("a".repeat(161), 160));
});

test("fix 5 (schedule): All my members shows chips for every group; the All chip removes to no audience; a pick while All is chosen switches to picks; the cost note is a label", async () => {
  const d = await openSched({ status: ok({ available: true, blocked: "", blocked_message: "", phone_online: true, daily_limit: 2000, left_today: 2000, max_length: 160, cost_note: "Texts go out from your own phone and SIM. Your carrier's normal SMS rates apply." }) }, { form: true });
  await settle();
  const cl = () => d.$("ib-sc-chips").all((n) => has(n, "ib-bk-pchip")).map((n) => n.textContent);
  assert.deepEqual(cl(), ["All my members (95)×"]);
  const cost = pane(d).all((n) => has(n, "ib-bk-cost"))[0];
  assert.ok(cost && has(cost, "ib-fn-hint") && has(cost, "ib-bk-will"));
  await pickTo(d, "VIP");
  assert.deepEqual(cl(), ["VIP (3)×"], "the chosen picks replace the All chips");
  assert.deepEqual(d.bk.seen.audience.at(-1), { audience: "pick", groups: ["g2"], contacts: [] });
  d.$("ib-sc-chips").all((n) => has(n, "ib-bk-pchip-x"))[0].fire("click"); await settle(); await settle();
  await pickTo(d, "All my members");
  d.$("ib-sc-chips").all((n) => has(n, "ib-bk-pchip-x"))[0].fire("click"); await settle(); await settle();
  assert.deepEqual(cl(), []); assert.equal(cInput(d, "ib-sc-to").getAttribute("placeholder"), "Choose who gets it");
  assert.equal(d.$("ib-sc-test").disabled, true);
});

test("fix 4 (schedule): no count before a pick; nothing preselected; buttons off until a pick; every body carries audience", async () => {
  const d = await openSched({}, { form: true, pick: false });
  await typeText(d, "Hello po");
  assert.equal(d.bk.seen.audience.length, 0, "no count asked");
  assert.equal(cInput(d, "ib-sc-to").getAttribute("placeholder"), "Choose who gets it");
  assert.equal(d.$("ib-sc-chips").all((n) => has(n, "ib-bk-pchip")).length, 0, "no chip before a choice");
  assert.equal(d.$("ib-sc-test").disabled, true); assert.equal(d.$("ib-sc-go").disabled, true);
  await pickTo(d, "All my members");
  assert.deepEqual(d.bk.seen.audience, [{ audience: "all" }]);
  assert.ok(!/Will send to/.test(pane(d).textContent));
  assert.equal(d.$("ib-sc-test").disabled, false);
  await setSlot(d); await d.click(d.$("ib-sc-go")); await settle();
  assert.equal(d.bk.seen.created[0].audience, "all", "the schedule body carries audience");
});

test("fix 5: the toast sits over the top bar icons (desktop: top 32px, right 40px, above them; phone: full width less the gutters), and the chips and gap are small and tidy", () => {
  const dash = fs.readFileSync(path.join(JS, "..", "css", "dash.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(dash, /body\.dash-app \.toast \{ top: 32px; bottom: auto; right: 40px; z-index: 60; \}/);
  assert.match(dash, /@media \(max-width: 899\.98px\) \{\s*body\.dash-app \.toast \{ top: calc\(8px \+ env\(safe-area-inset-top\)\); bottom: auto; left: 16px; right: 16px; width: auto;/);
  assert.ok(/\.notif-pop \{[^}]*z-index: 45/.test(dash), "the toast layer (60) is above the bell panel (45)");
  const CSS = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8");
  assert.match(CSS, /\.ib-bk-pchip \{[^}]*font-size: 12px/);
  assert.match(CSS, /\.ib-fn-row \{ margin-bottom: 8px; \}/);
});
