/* Text many members (store bulk SMS, ClickUp z8uq9mbreu): inbox-bulk.js and its toolbar button in inbox.js, run like inbox.test.mjs (the real
   scripts in a vm with the stand-in document and a recorded fetch). The stand-in API for the bulk routes is s.bulk(method, tail, body): it
   answers {status, body} or nothing (404). Fake data only. The Inbox screens, for the boot() below (ClickUp z8uq9md3n6 and z8uq9mfj12, Unified Inbox): /settings/inbox/ (inbox-settings.js, the channel cards)
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

const CHANNELS_ON = { webchat_enabled: true, paused_until: null, chat_limit_reached: false, webchat_available: true };
const CH_SMS = { ...CHANNELS_ON, sms_available: true, sms_enabled: true };
const SMS_STATUS = { phone_online: true, daily_limit: 50, left_today: 37, hourly_limit: 20, left_this_hour: 20, enabled: true, prefix: "Test Store: ", max_length: 148, incoming_ready: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const B = "/sites/" + A + "/inquiries/sms/bulk/";
const BULK_STATUS = { available: true, blocked: "", blocked_message: "", phone_online: true, daily_limit: 2000, used_today: 0, left_today: 2000, prefix: "Test Store: ", max_length: 147,
  window: { start: "08:00", end: "20:00", timezone: "Asia/Manila" }, in_window: true, seconds_between: { min: 18, max: 25 },
  cost_note: "Texts go out from your own phone and SIM. Your carrier's normal SMS rates apply.", active_batch: null };
const AUD_ALL = { audience: "all", total_members: 120, will_send: 95, left_out: { unverified: 10, invalid_number: 2, opted_out: 5, duplicates: 8 } };
const batch = (over = {}) => ({ id: "sbk_aaaaaaaa", state: "sending", created_at: "2026-11-23T10:00:00+08:00", audience: "all", text: "Test Store: Sale this weekend.",
  size: 95, sent: 10, failed: 1, not_sent: 0, waiting: 84, left_out: { unverified: 10, invalid_number: 0, opted_out: 5, duplicates: 0 },
  end_reason: "", end_message: "", paused_reason: "", seconds_left: 2042, stopped_at: null, finished_at: null, ...over });
const ok = (body, status = 200) => ({ status, body });
const bad = (status, code, message, fields) => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });

/* A stand-in bulk API; `o` overrides single answers. It records the bodies it got in `seen`. */
function api(o = {}) {
  const seen = { audience: [], preview: [], test: [], batches: [], stop: 0 };
  const fn = (method, tail, body) => {
    if (method === "GET" && tail === "status/") return o.status || ok({ ...BULK_STATUS });
    if (method === "POST" && tail === "audience/") { seen.audience.push(body); return o.audience ? o.audience(body, seen) : ok(AUD_ALL); }
    if (method === "POST" && tail === "preview/") {
      seen.preview.push(body);
      if (o.preview) return o.preview(body);
      if (/\.com|http/i.test(body.text)) return bad(422, "invalid", "The text must not contain a web link.", { text: ["The text must not contain a web link."] });
      const text = "Test Store: " + body.text;
      return ok({ text, length: text.length, max_length: 160, remaining: 160 - text.length });
    }
    if (method === "POST" && tail === "test/") { seen.test.push(body); return o.test ? o.test(body) : ok({ state: "queued", repeated: false }); }
    if (method === "POST" && tail === "batches/") { seen.batches.push(body); return o.create ? o.create(body, seen) : ok(batch({ text: "Test Store: " + body.text, sent: 0, failed: 0, waiting: 95, state: "waiting" }), 201); }
    if (method === "GET" && tail.indexOf("batches/?") === 0) return o.history ? o.history(tail) : ok({ items: [batch({ state: "finished", paused_reason: "", seconds_left: 0, waiting: 0, sent: 94, failed: 1 })], next_cursor: null });
    if (method === "GET" && /^batches\/[^/]+\/\?/.test(tail)) return o.detail ? o.detail(tail) : ok({ ...batch({ state: "finished" }), results: [{ name: "Maria Santos", mobile: "+63917***4567", state: "sent", reason: "", reason_text: "" }, { name: "Jun Cruz", mobile: "+63918***1111", state: "not_sent", reason: "opted_out", reason_text: "Asked for no more texts." }], next: null });
    if (method === "POST" && /\/stop\/$/.test(tail)) { seen.stop++; return o.stop || ok(batch({ state: "stopped", end_reason: "stopped", end_message: "You stopped this batch." })); }
    return null;
  };
  fn.seen = seen;
  return fn;
}
/* INBOX-FIX-7: the Bulk SMS tab of the SMS Marketing page (/sms/bulk/). opts.form: press Send Bulk SMS to open the compose form (default); { form: false } stays on the History. */
async function openBulk(o = {}, bootOpts = {}, opts = {}) {
  const d = boot({ listing: list(), channels: CH_SMS, ...bootOpts });
  d.s.smsStatus = SMS_STATUS;
  const bk = api(o); d.s.bulk = bk; d.bk = bk;
  d.window.NODash.go = (href) => d.window.NOInbox.setTab(/bulk/.test(href) ? "bulk" : /settings/.test(href) ? "settings" : "");
  d.window.NOInbox.show("sms", "bulk"); await settle(); await settle(); await settle();
  if (opts.form !== false && d.$("ib-bk-send")) { await d.click(d.$("ib-bk-send")); await settle(); await settle(); }
  /* nothing is preselected (z8uq9mjj05 fix 4): tests that need an audience choose All my members, unless opts.pick is false */
  if (opts.pick !== false && d.$("ib-bk-to")) { cBox(d, "ib-bk-to").fire("click"); pickRow(d, "ib-bk-to", "All my members"); await settle(); await settle(); }
  return d;
}
const pane = (d) => d.$("ib-bulkpane");
const typeText = async (d, t) => { d.$("ib-bk-t").value = t; d.$("ib-bk-t").fire("input"); await sleep(450); await settle(); };
const rowsOf = (d) => pane(d).all((n) => n.classList && n.classList.contains("ib-bk-tr"));
const viewBtns = (d) => pane(d).all((n) => n.classList && n.classList.contains("ib-bk-view"));

/* ---------- tests ---------- */

test("bulk: the Bulk SMS tab is hidden on a 404 (switch off), on an error, and when sms is off; no bulk route is asked for without sms", async () => {
  const off = boot({ listing: list(), channels: CH_SMS }); off.s.smsStatus = SMS_STATUS;
  await off.openInbox();
  assert.equal(off.$("ib-tab-bulk"), null);
  assert.ok(off.list().includes("GET " + B + "status/"), "probed once");
  assert.equal(off.list().filter((x) => x === "GET " + B + "status/").length, 1);
  const err = boot({ listing: list(), channels: CH_SMS }); err.s.smsStatus = SMS_STATUS; err.s.bulk = () => bad(500, "server_error", "Oops.");
  await err.openInbox(); assert.equal(err.$("ib-tab-bulk"), null);
  const nope = boot({ listing: list(), channels: CH_SMS }); nope.s.smsStatus = SMS_STATUS; nope.s.bulk = () => ok({ ...BULK_STATUS, available: false });
  await nope.openInbox(); assert.equal(nope.$("ib-tab-bulk"), null);
  const nosms = boot({ listing: list(), channels: CHANNELS_ON }); nosms.s.bulk = api();
  await nosms.openInbox();
  assert.equal(nosms.$("ib-tab-bulk"), null);
  assert.ok(!nosms.list().some((x) => x.includes("/sms/bulk/")), "not probed while sms is off");
});

test("bulk: with available:true the SMS page has the Bulk SMS tab and no Bulk SMS (or New SMS) button at the top right", async () => {
  const d = boot({ listing: list(), channels: CH_SMS }); d.s.smsStatus = SMS_STATUS; d.s.bulk = api();
  await d.openInbox();
  assert.ok(d.$("ib-tab-bulk"));
  assert.equal(d.$("ib-bulk-btn"), null, "the Bulk SMS button is gone");
  assert.equal(d.all(d.$("ib-tabs-host"), "ib-acts").length, 0);
});

test("INBOX-FIX-7: the Bulk SMS tab has no Back link; the History is a table with a View button at the right of each row and a primary Send Bulk SMS button above it", async () => {
  const d = await openBulk({}, {}, { form: false });
  assert.equal(d.$("ib-back"), null, "no < Back link");
  assert.ok(!/\bBack\b/.test(pane(d).textContent), "no Back words on the tab");
  assert.ok(!pane(d).textContent.includes("Your batches, newest first."), "the old page head is gone");
  const send = d.$("ib-bk-send");
  assert.ok(send && send.textContent === "Send Bulk SMS" && send.classList.contains("no-btn-primary"), "primary Send Bulk SMS");
  const tbl = pane(d).all((n) => n.tagName === "TABLE")[0];
  assert.ok(tbl, "a table");
  assert.deepEqual(tbl.all((n) => n.tagName === "TH").map((n) => n.textContent), ["Date", "Audience", "Sent / Failed / Not sent", "Status", "Message", "Details"].map((t, i) => (i === 5 ? "Details" : t)));
  const rows = rowsOf(d);
  assert.equal(rows.length, 1);
  const cells = rows[0].all((n) => n.tagName === "TD");
  assert.equal(cells.length, 6);
  assert.ok(cells[0].textContent.length > 4, "date");
  assert.equal(cells[1].textContent, "All my members");
  assert.equal(cells[2].textContent, "94 / 1 / 0", "sent / failed / not sent");
  assert.equal(cells[3].textContent, "Finished");
  assert.equal(cells[4].textContent, "Test Store: Sale this weekend.", "the message preview");
  assert.equal(cells[5].children[0].textContent, "View", "the View button is the last cell, at the right");
  assert.ok(send.parentNode.classList.contains("ib-bk-dh"), "the button is in the head of the History card, above the table");
  assert.equal(d.$("ib-bk-t"), null, "not the composer");
  assert.ok(d.list().some((c) => c.indexOf("GET " + B + "batches/?limit=20") === 0), "reads the history");
});

test("INBOX-FIX-7: View opens the batch details under its row (no route change); View again closes them; the recipients are masked and come 5 at a time", async () => {
  const routed = [];
  const d = await openBulk({}, {}, { form: false });
  d.window.NODash.go = (href) => routed.push(href);
  assert.equal(pane(d).all((n) => n.classList && n.classList.contains("ib-bk-dr")).length, 0);
  const v = viewBtns(d)[0];
  assert.equal(v.getAttribute("aria-expanded"), "false");
  await d.click(v);
  assert.deepEqual(routed, [], "no page change");
  assert.ok(d.list().includes("GET " + B + "batches/sbk_aaaaaaaa/?limit=5"), "the server pages 5 at a time");
  const dr = pane(d).all((n) => n.classList && n.classList.contains("ib-bk-dr"));
  assert.equal(dr.length, 1, "the details sit in a row under the batch");
  const t = dr[0].textContent;
  assert.ok(t.includes("Maria Santos") && t.includes("+63917***4567") && t.includes("Sent"));
  assert.ok(t.includes("Jun Cruz") && t.includes("Not sent") && t.includes("Asked for no more texts."));
  assert.ok(!/\+63\d{9}/.test(t), "no full number");
  assert.equal(viewBtns(d)[0].getAttribute("aria-expanded"), "true");
  await d.click(viewBtns(d)[0]);
  assert.equal(pane(d).all((n) => n.classList && n.classList.contains("ib-bk-dr")).length, 0, "toggles shut");
});

test("round 9 R9-2: the View top block is the icon and the state words with the date, the message, then the stat line; no caps line, no Left out line", async () => {
  const has = (n, c) => n.classList && n.classList.contains(c);
  const cases = [
    ["stopped", { stopped_at: "2026-11-24T08:08:00Z", end_message: "You stopped this batch." }, "Stopped by you on Nov 24, 2026"],
    ["finished", { finished_at: "2026-11-23T11:00:00Z" }, "Finished on Nov 23, 2026"],
    ["sending", {}, "Sending since Nov 23, 2026"],
    ["waiting", {}, "Waiting to start since Nov 23, 2026"],
    ["ended", { finished_at: "2026-11-23T11:00:00Z" }, "Ended on Nov 23, 2026"],
    ["ended", { finished_at: "2026-11-23T11:00:00Z", end_message: "Your phone went offline." }, "Ended on Nov 23, 2026, 7:00 PM: Your phone went offline."]];
  for (const [state, extra, want] of cases) {
    const b = batch({ state, sent: 2, failed: 0, not_sent: 7, waiting: 0, ...extra });
    const d = await openBulk({ history: () => ok({ items: [b], next_cursor: null }), detail: () => ok({ ...b, results: [], next: null }) }, {}, { form: false });
    await d.click(viewBtns(d)[0]);
    const box = pane(d).all((n) => has(n, "ib-bk-flat"))[0];
    assert.deepEqual(box.children.map((n) => n.classList.contains("ib-bk-fh") ? "head" : n.classList.contains("ib-bk-text") ? "text" : n.classList.contains("ib-bk-stat") ? "stat" : "?"), ["head", "text", "stat"], state);
    assert.ok(box.children[0].textContent.startsWith(want), box.children[0].textContent);
    assert.ok(box.children[0].all((n) => n.tagName === "SVG" || n.tagName === "svg" || (n.classList && n.classList.contains("ic")) || n.tagName === "PATH" || n.tagName === "path").length > 0 || box.children[0].children.length === 2, "an icon first");
    assert.equal(box.children[1].textContent, "Test Store: Sale this weekend.");
    assert.equal(box.children[2].textContent, "Sent 2 \u00B7 Failed 0 \u00B7 Not sent 7 \u00B7 Waiting 0");
    assert.ok(!/Left out/i.test(box.textContent), "no Left out line");
    assert.ok(!/STOPPED NOV|STOPPED\b/.test(box.textContent), "no caps line");
    assert.ok(!box.textContent.includes("You stopped this batch."), "only the three lines");
    if (!extra.end_message || state !== "ended") assert.ok(!box.children[0].textContent.includes(":") || /\d:\d\d/.test(box.children[0].textContent), "no reason after the date");
  }
  const CSS = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8");
  assert.ok(!/\.ib-bk-fh \{[^}]*uppercase/.test(CSS), "the head line is not capitalised");
});

test("round 9 R9-3: the recipients show 5, then View more adds 5 per click (the server's next cursor) and is gone when none are left; a divider above each row and none under the last", async () => {
  const has = (n, c) => n.classList && n.classList.contains(c);
  const all = Array.from({ length: 12 }, (_, i) => ({ name: "Person " + (i + 1), mobile: "+63917***" + String(1000 + i), state: "sent", reason: "", reason_text: "" }));
  const seen = [];
  const detail = (tail) => {
    seen.push(tail);
    const cur = /cursor=(\d+)/.exec(tail), from = cur ? Number(cur[1]) : 0, to = Math.min(12, from + 5);
    return ok({ ...batch({ state: "finished" }), results: all.slice(from, to), next: to < 12 ? String(to) : null });
  };
  const d = await openBulk({ detail }, {}, { form: false });
  await d.click(viewBtns(d)[0]);
  const recs = () => pane(d).all((n) => has(n, "ib-bk-recrow"));
  assert.equal(recs().length, 5);
  assert.ok(d.press(pane(d), "View more"));
  await d.click(d.press(pane(d), "View more"));
  assert.equal(recs().length, 10);
  await d.click(d.press(pane(d), "View more"));
  assert.equal(recs().length, 12);
  assert.equal(d.press(pane(d), "View more"), undefined, "hidden when none are left");
  assert.deepEqual(seen, ["batches/sbk_aaaaaaaa/?limit=5", "batches/sbk_aaaaaaaa/?limit=5&cursor=5", "batches/sbk_aaaaaaaa/?limit=5&cursor=10"]);
  const CSS = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8");
  assert.ok(/\.ib-bk-recrow \{[^}]*border-top: 1px solid/.test(CSS) && !/\.ib-bk-recrow \{[^}]*border-bottom/.test(CSS), "divider above each row, none under the last");
  assert.ok(!/\+63\d{9}/.test(pane(d).textContent));
});

test("INBOX-FIX-8 B1-B4: no outer card around the history; the head row is above the table; the table box is the card; the View detail is flat (no tiles, no nested card)", async () => {
  const d = await openBulk({}, {}, { form: false });
  const has = (n, c) => n.classList && n.classList.contains(c);
  const hist = d.$("ib-bk-hist");
  assert.ok(!has(hist, "dash-card"), "no outer card");
  const kids = hist.children;
  assert.ok(has(kids[0], "ib-bk-dh") && kids[0].textContent.includes("Bulk SMS history") && kids[0].all((n) => n.id === "ib-bk-send").length === 1, "title and button in one row, above");
  assert.ok(has(kids[1], "ib-bk-tbox"), "the table box follows the head");
  await d.click(viewBtns(d)[0]);
  const dr = pane(d).all((n) => has(n, "ib-bk-dr"))[0];
  assert.equal(dr.all((n) => has(n, "ib-bk-card") || has(n, "ib-bk-counts") || has(n, "ib-bk-count") || has(n, "dash-card") || has(n, "ib-note")).length, 0, "no nested card, tiles or banner");
  const CSS = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8");
  assert.ok(/\.ib-bk-tbox \{[^}]*border-radius: 16px; background: var\(--card\)/.test(CSS), "the table is the card");
  assert.ok(/\.ib-bk-dr > td \{ background: color-mix/.test(CSS), "subtle row background");
  assert.ok(/\.ib-bk-histsec \.ib-bk-dh \{ padding-bottom: 0; border-bottom: 0; \}/.test(CSS));
});

test("bulk: history pages with the cursor; detail pages 5 a page with next; a number the API forgot to mask is masked", async () => {
  const u = loadUtil();
  assert.equal(u.maskMobile("+63917***4567"), "+63917***4567");
  assert.equal(u.maskMobile("+639171234567"), "+63917***4567");
  assert.equal(u.maskMobile(""), "");
  const pages = [], seen = [];
  const hist = (tail) => { pages.push(tail); return tail.includes("cursor=sbk_bbbb") ? ok({ items: [batch({ id: "sbk_cccccccc", state: "stopped" })], next_cursor: null }) : ok({ items: [batch({ state: "finished" })], next_cursor: "sbk_bbbb" }); };
  const detail = (tail) => { seen.push(tail); return ok({ ...batch({ state: "finished" }), results: [{ name: "Ana", mobile: "+639171234567", state: "sent", reason: "", reason_text: "" }], next: tail.includes("cursor=") ? null : "5" }); };
  const d = await openBulk({ history: hist, detail }, {}, { form: false });
  await d.click(d.press(pane(d), "Show more"));
  assert.deepEqual(pages, ["batches/?limit=20", "batches/?limit=20&cursor=sbk_bbbb"]);
  assert.equal(rowsOf(d).length, 2);
  await d.click(viewBtns(d)[0]);
  assert.ok(!pane(d).textContent.includes("+639171234567"));
  await d.click(d.press(pane(d), "View more"));
  assert.ok(seen[1].includes("cursor=5"));
});

test("bulk: the compose form: Send to above Message on the left, How bulk sending works on the right; no Check and confirm card, no Cancel", async () => {
  const d = await openBulk();
  const cols = pane(d).all((n) => n.classList && n.classList.contains("ib-bk-cols"))[0];
  assert.ok(cols, "two columns");
  assert.deepEqual(cols.children.map((n) => n.classList.contains("ib-bk-colmain") ? "form" : n.classList.contains("ib-bk-aside") ? "rules" : "?"), ["form", "rules"]);
  const h2s = pane(d).all((n) => n.tagName === "H2").map((n) => n.textContent);
  assert.deepEqual(h2s, ["New batch: write the text and choose who gets it", "How bulk sending works"], "no Check and confirm card");
  const rules = pane(d).all((n) => n.classList && n.classList.contains("ib-bk-rules"))[0].textContent;
  assert.ok(rules.includes("No web links.") && rules.includes("Members who replied STOP are skipped.") && rules.includes("8:00 am to 8:00 pm, Manila time"));
  assert.ok(rules.includes("Bulk texts left today: 2000 of 2000."));
  assert.equal(d.$("ib-bk-send"), null, "the History card is not shown with the form");
  assert.equal(d.$("ib-back"), null, "no Back link");
  assert.equal(d.$("ib-bk-cancel"), null, "no Cancel");
  assert.equal(d.press(pane(d), "Cancel"), undefined);
  const labels = pane(d).all((n) => n.tagName === "LABEL").map((n) => n.textContent);
  assert.ok(labels.indexOf("Send to") >= 0 && labels.indexOf("Send to") < labels.indexOf("Message"), "Send to is above Message: " + labels);
  const btns = d.$("ib-bk-test").parentNode.all((n) => n.tagName === "BUTTON" && !n.classList.contains("ib-fn")).map((n) => n.textContent);
  assert.deepEqual(btns, ["Send Test SMS", "Start Sending"], "exactly two buttons");
  assert.ok(!pane(d).textContent.includes("Check and confirm"));
});

test("bulk: Send to is ONE house dropdown, All my members offered first, read with all once chosen; no radios, no promo or consent wording", async () => {
  const d = await openBulk();
  assert.equal(pane(d).all((n) => n.tagName === "INPUT" && n.getAttribute("type") === "radio").length, 0, "no radios");
  assert.equal(d.$("ib-bk-to-all"), null);
  const sel = d.$("ib-bk-to");
  assert.equal(sel.tagName, "SELECT");
  assert.equal(sel.parentNode.classList.contains("ib-combo"), true, "the house combo, not native");
  assert.equal(pane(d).all((n) => n.tagName === "SELECT").length, 1, "one dropdown");
  assert.equal(sel.value, "", "All my members shows as a chip; the input keeps its placeholder");
  assert.equal(cInput(d, "ib-bk-to").value, "");
  assert.equal(cInput(d, "ib-bk-to").getAttribute("placeholder"), "Add a group or contact");
  assert.deepEqual(chips(d), ["All my members (95)\u00D7"], "the All chip carries the count and a remove");
  assert.equal(sel.children.filter((o) => o.value !== "")[0].textContent, "All my members", "first option");
  assert.deepEqual(d.bk.seen.audience, [{ audience: "all" }]);
  const all = pane(d).textContent;
  assert.ok(!/promo|consent|agree|warning|opt-in|permission|allowed to text/i.test(all), "no promo or consent wording: " + all);
  assert.ok(!d.calls.some((c) => c.path === CT + "groups/"), "no group asked while contacts are off");
});

test("bulk: there is no Will send to line; the chips carry the counts; no left-out list; never a list of numbers", async () => {
  const d = await openBulk();
  assert.equal(d.$("ib-bk-count"), null, "no count line");
  assert.ok(!/Will send to/.test(pane(d).textContent), "no Will send to text");
  assert.deepEqual(chips(d), ["All my members (95)\u00D7"]);
  assert.ok(!/Left out|not verified|Test number|no more texts|Repeated/.test(pane(d).textContent), "no left-out wording");
  assert.ok(!/\+?63\d{9}|09\d{9}/.test(pane(d).textContent));
  const u = d.window.NOInboxBulk.util; assert.equal(u.willSend, undefined, "the helper is gone");
});

test("bulk: no prefix line, the N / 160 counter (160, even from old data with a prefix) and the debounced preview call; no preview box, no Promotional tick", async () => {
  const d = await openBulk();
  assert.ok(!pane(d).textContent.includes("Every text starts with"), "no prefix line even though the status still carries a prefix key");
  assert.equal(d.$("ib-bk-c").textContent, "0 / 160");
  await typeText(d, "Sale this weekend");
  assert.equal(d.$("ib-bk-c").textContent, "17 / 160");
  assert.deepEqual(d.bk.seen.preview, [{ text: "Sale this weekend" }], "one preview call after the pause");
  assert.equal(d.$("ib-bk-preview"), null, "no preview box");
  assert.equal(d.$("ib-bk-promo"), null, "no Promotional tick");
  assert.ok(!/promotional|consent|warning/i.test(pane(d).textContent));
});

test("bulk: a link is refused inline (the server's words) and nothing can be tested or started", async () => {
  const d = await openBulk();
  await typeText(d, "Visit shop.example.com today");
  assert.equal(d.$("ib-bk-e").hidden, false);
  assert.equal(d.$("ib-bk-e").textContent, "The text must not contain a web link.");
  assert.equal(d.$("ib-bk-test").disabled, true);
  assert.equal(d.$("ib-bk-go").disabled, true);
  await d.click(d.$("ib-bk-go"));
  assert.equal(d.$("ib-bk-dlg"), null, "no dialog");
  const s2 = await openBulk({ preview: () => bad(422, "invalid", "Use plain characters only.", { text: ["Use plain characters only."] }) });
  await typeText(s2, "Hello");
  assert.equal(s2.$("ib-bk-e").textContent, "Use plain characters only.");
});

test("bulk: send a test to my phone posts text and a key", async () => {
  const d = await openBulk();
  assert.equal(d.$("ib-bk-test").disabled, true, "off until there is a text");
  await typeText(d, "Hello po");
  await d.click(d.$("ib-bk-test"));
  assert.equal(d.bk.seen.test.length, 1);
  assert.equal(d.bk.seen.test[0].text, "Hello po");
  assert.match(d.bk.seen.test[0].idempotency_key, /^[A-Za-z0-9_-]{8,64}$/);
  assert.deepEqual(d.bk.seen.test[0].audience, "all", "the test carries the audience");
  assert.deepEqual(d.toasts, ["A test text is on its way to your phone.: It counts as one of today's texts."], "a toast, with the same words");
  assert.equal(d.$("ib-bk-testnote"), null, "no line under the buttons");
  const e = await openBulk({ test: () => bad(409, "no_mobile", "Add a verified mobile number to your account first.") });
  await typeText(e, "Hello po"); await e.click(e.$("ib-bk-test"));
  assert.deepEqual(e.toasts, ["Add a verified mobile number to your account first.: "], "the server error is a toast");
  assert.deepEqual(e.kinds, ["error"], "in the error style");
});

test("bulk: Start Sending opens a confirm dialog first; Back sends nothing; confirm posts confirm:true, expected_count, audience and a key; the compact progress card then shows and Send Bulk SMS is hidden", async () => {
  const d = await openBulk();
  assert.equal(d.$("ib-bk-go").disabled, true, "not before there is a text");
  await typeText(d, "Sale this weekend");
  assert.equal(d.$("ib-bk-go").disabled, false);
  assert.equal(d.$("ib-bk-dlg"), null);
  await d.click(d.$("ib-bk-go"));
  const dlg = d.$("ib-bk-dlg");
  const box = dlg && dlg.all((n) => n.getAttribute("role") === "dialog")[0];
  assert.ok(box && box.getAttribute("aria-modal") === "true", "the dialog card sits inside the scrim");
  assert.ok(dlg.textContent.includes("Send to 95 members from your phone?"));
  assert.equal(d.bk.seen.batches.length, 0, "nothing sent yet");
  await d.click(d.$("ib-bk-dlg-back"));
  assert.equal(d.$("ib-bk-dlg"), null, "Back closes it");
  assert.equal(d.bk.seen.batches.length, 0);
  await d.click(d.$("ib-bk-go")); await d.click(d.$("ib-bk-dlg-go"));
  assert.equal(d.bk.seen.batches.length, 1);
  const p = d.bk.seen.batches[0];
  assert.deepEqual(Object.keys(p).sort(), ["audience", "confirm", "expected_count", "idempotency_key", "text"]);
  assert.equal(p.confirm, true); assert.equal(p.expected_count, 95); assert.equal(p.audience, "all"); assert.equal(p.text, "Sale this weekend");
  assert.match(p.idempotency_key, /^[A-Za-z0-9_-]{8,64}$/);
  assert.ok(d.$("ib-bk-progress"), "the progress card shows");
  assert.equal(d.$("ib-bk-dlg"), null);
  assert.equal(d.$("ib-bk-t"), null, "the form is gone while a batch runs");
  assert.equal(d.$("ib-bk-send"), null, "Send Bulk SMS is hidden while a batch is sending");
});

test("bulk: 409 audience_changed shows the server's words, reads the audience again and asks to confirm again", async () => {
  const d = await openBulk({ create: () => bad(409, "audience_changed", "Your member count changed to 97. Check it and send again.") });
  await typeText(d, "Sale this weekend");
  const before = d.bk.seen.audience.length;
  await d.click(d.$("ib-bk-go")); await d.click(d.$("ib-bk-dlg-go"));
  assert.equal(d.bk.seen.audience.length, before + 1, "the audience is read again");
  assert.deepEqual(d.toasts, ["Your member count changed to 97. Check it and send again.: "]); assert.deepEqual(d.kinds, ["error"]);
  assert.equal(d.$("ib-bk-dlg"), null, "the dialog is shut; Start Sending asks again");
  assert.equal(d.$("ib-bk-go").disabled, false);
});

test("INBOX-FIX-7: a running batch: the progress card is at the top in the Site readiness layout (title and chip, rows), Refresh instead of View, Stop sending kept, Send Bulk SMS hidden", async () => {
  const run = batch({ paused_reason: "outside_window" });
  const d = await openBulk({ status: ok({ ...BULK_STATUS, active_batch: run }), history: () => ok({ items: [run, batch({ id: "sbk_old", state: "finished", sent: 40, failed: 0, not_sent: 0, waiting: 0, size: 40 })], next_cursor: null }) }, {}, { form: false });
  const card = d.$("ib-bk-progress");
  assert.ok(card.classList.contains("dash-card") && card.classList.contains("ib-bk-run"));
  const body = pane(d).all((n) => n.classList && n.classList.contains("ib-bk-page"))[0];
  assert.equal(body.children[0], card, "the card is the first thing in the body");
  assert.deepEqual(card.all((n) => n.tagName === "H2").map((n) => n.textContent), ["Sending now"]);
  assert.equal(card.all((n) => n.classList && n.classList.contains("ib-bk-chip"))[0].textContent, "Sending", "the state chip");
  assert.equal(card.all((n) => n.tagName === "LI").length, 0, "no grid of Failed / Not sent / Waiting / Started / Who gets it rows");
  assert.ok(card.textContent.includes("Sent 10 of 95"));
  assert.ok(!/Failed|Not sent|Waiting|Started|Who gets it|Left out|Sale this weekend/.test(card.textContent.replace("Waiting to start", "")), "compact: only the bar, Sent x of N, time left and the buttons: " + card.textContent);
  assert.deepEqual(card.all((n) => n.tagName === "BUTTON").map((n) => n.textContent), ["Refresh", "Stop sending"]);
  assert.equal(card.all((n) => n.getAttribute && n.getAttribute("role") === "progressbar")[0].getAttribute("aria-valuenow"), "11", "sent + failed + not sent");
  assert.ok(d.$("ib-bk-pause").textContent.includes("outside sending hours (8:00 am to 8:00 pm, Manila time)"));
  assert.ok(card.textContent.includes("About 34 minutes left"));
  assert.equal(d.$("ib-bk-send"), null, "Send Bulk SMS is hidden");
  assert.equal(d.$("ib-bk-refresh").textContent, "Refresh");
  assert.equal(card.all((n) => n.classList && n.classList.contains("ib-bk-view")).length, 0, "no View button on the card");
  /* the running batch is not repeated in the table; the old one is */
  assert.equal(rowsOf(d).length, 1);
  assert.equal(rowsOf(d)[0].all((n) => n.tagName === "TD")[2].textContent, "40 / 0 / 0");
  /* Refresh reads the status (and the history) again */
  const n = d.calls.length;
  await d.click(d.$("ib-bk-refresh"));
  assert.ok(d.calls.slice(n).some((c) => c.path === B + "status/"), "Refresh reads the status");
  assert.ok(d.calls.slice(n).some((c) => c.path.indexOf(B + "batches/?limit=20") === 0), "and the history");
  await d.click(d.$("ib-bk-stop"));
  assert.equal(d.bk.seen.stop, 1, "one click stops it");
  assert.ok(d.list().includes("POST " + B + "batches/sbk_aaaaaaaa/stop/"));
});

test("INBOX-FIX-7: when the running batch ends, the card goes, the table has it and Send Bulk SMS is back (the Refresh button reads it)", async () => {
  let running = true;
  const run = batch(), fin = batch({ state: "finished", waiting: 0, sent: 94, failed: 1, seconds_left: 0 });
  const inner = api({ history: () => ok({ items: [running ? run : fin], next_cursor: null }) });
  const d = await openBulk({ status: ok({ ...BULK_STATUS, active_batch: run }) }, {}, { form: false });
  d.s.bulk = (method, tail, body) => (method === "GET" && tail === "status/" ? ok({ ...BULK_STATUS, active_batch: running ? run : null }) : inner(method, tail, body));
  assert.ok(d.$("ib-bk-progress"));
  running = false;
  await d.click(d.$("ib-bk-refresh")); await settle(); await settle();
  assert.equal(d.$("ib-bk-progress"), null, "the card is gone");
  assert.ok(d.$("ib-bk-send"), "Send Bulk SMS is back");
  assert.equal(rowsOf(d).length, 1);
  assert.equal(rowsOf(d)[0].all((n) => n.tagName === "TD")[3].textContent, "Finished");
  assert.ok(pane(d).textContent.includes("Your last batch is done."));
});

test("bulk: the pause reasons and the estimate in plain words", () => {
  const u = loadUtil();
  assert.ok(u.pauseText({ state: "sending", paused_reason: "daily_cap" }).includes("today's limit is reached"));
  assert.ok(u.pauseText({ state: "waiting", paused_reason: "phone_offline" }).includes("your phone is offline"));
  assert.equal(u.pauseText({ state: "finished", paused_reason: "daily_cap" }), "");
  assert.equal(u.estimate(0), ""); assert.equal(u.estimate(30), "Less than a minute left");
  assert.equal(u.estimate(3900), "About 1 hour 5 minutes left"); assert.equal(u.estimate(7200), "About 2 hours left");
});

test("bulk: blocked states show blocked_message; no_line adds the link to SMS Settings; Send Bulk SMS and the form are not offered", async () => {
  const d = await openBulk({ status: ok({ ...BULK_STATUS, blocked: "no_line", blocked_message: "Pair your phone in Settings → SMS Gateway to text many members." }) });
  assert.ok(pane(d).textContent.includes("Pair your phone in Settings → SMS Gateway to text many members."));
  assert.equal(d.$("ib-bk-gw").getAttribute("href"), "/sms/settings/");
  assert.equal(d.$("ib-bk-t"), null);
  assert.equal(d.$("ib-bk-send"), null);
  const h = await openBulk({ status: ok({ ...BULK_STATUS, blocked: "site_held", blocked_message: "Your store is on hold." }) });
  assert.ok(pane(h).textContent.includes("Your store is on hold."));
  assert.equal(h.$("ib-bk-gw"), null);
});

test("bulk: the cost line comes from cost_note; there is no web-link help text", async () => {
  const d = await openBulk();
  assert.ok(pane(d).textContent.includes("Your carrier's normal SMS rates apply."));
  assert.ok(!/web link|http|www/i.test(pane(d).textContent.replace("The text must not contain a web link.", "").replace("No web links.", "").replace("No web links", "")));
});

test("bulk: a 404 from any bulk route hides the tab and closes the screen", async () => {
  let gone = false;
  const d = await openBulk({ audience: () => { gone = true; return bad(404, "not_found", "Not found."); } });
  assert.ok(gone);
  assert.equal(d.$("ib-tab-bulk"), null);
  assert.equal(d.$("ib-split").hidden, false, "back on the Inbox tab");
});

test("INBOX-FIX-7: the table scrolls inside its own box on a phone, never the page", () => {
  const css = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /#view-inbox \.ib-bk-tbox \{[^}]*overflow-x: auto;/);
  assert.match(css, /#view-inbox \.ib-bk-table \{[^}]*min-width: 680px;/);
  assert.match(css, /#view-inbox \.ib-bk-cols \{ grid-template-columns: minmax\(0, 1fr\); \}/, "the form is one column on a phone");
});

test("INBOX-FIX-6: the Bulk SMS tab opens on the History (table) and the Send Bulk SMS button inside it opens the composer; a store without bulk has no tab", async () => {
  const d = boot({ listing: list(), channels: CH_SMS }); d.s.smsStatus = SMS_STATUS;
  const bk = api({}); d.s.bulk = bk; d.bk = bk;
  d.window.NODash.go = (href) => d.window.NOInbox.setTab(/bulk/.test(href) ? "bulk" : /settings/.test(href) ? "settings" : "");
  await d.openInbox(); await settle();
  const labels = () => d.all(d.$("ib-tabs-host"), "ib-tab").map((n) => n.textContent);
  assert.deepEqual(labels(), ["Inbox", "Bulk SMS", "Settings"], "order: Inbox | Bulk SMS | Settings");
  d.$("ib-tab-bulk").fire("click"); await settle(); await settle(); await settle();
  assert.equal(d.$("ib-tab-bulk").getAttribute("aria-selected"), "true");
  assert.equal(d.$("ib-bulkpane").hidden, false); assert.equal(d.$("ib-split").hidden, true);
  assert.ok(d.$("ib-bulkpane").textContent.includes("Bulk SMS history"), "the sends so far");
  assert.equal(d.$("ib-bk-t"), null, "not the composer");
  assert.ok(d.list().some((c) => c.indexOf("GET " + B + "batches/?limit=20") === 0), "reads the history");
  d.$("ib-bk-send").fire("click"); await settle(); await settle();
  assert.ok(d.$("ib-bk-t"), "Send Bulk SMS opens the composer");
  d.$("ib-tab-inbox").fire("click"); await settle();
  assert.equal(d.$("ib-split").hidden, false); assert.equal(d.$("ib-bulkpane").hidden, true);
  const none = boot({ listing: list(), channels: CH_SMS }); none.s.smsStatus = SMS_STATUS;
  await none.openInbox(); await settle();
  assert.deepEqual(none.all(none.$("ib-tabs-host"), "ib-tab").map((n) => n.textContent), ["Inbox", "Settings"], "bulk not open: no Bulk SMS tab");
});

test("INBOX-FIX-6: a deep link to /sms/bulk/ opens the History; if bulk is not open it falls back to the Inbox tab", async () => {
  const d = boot({ listing: list(), channels: CH_SMS }); d.s.smsStatus = SMS_STATUS;
  const bk = api({}); d.s.bulk = bk; d.bk = bk;
  d.window.NOInbox.show("sms", "bulk"); await settle(); await settle(); await settle();
  assert.ok(d.$("ib-bulkpane").textContent.includes("Bulk SMS history"));
  const off = boot({ listing: list(), channels: CH_SMS }); off.s.smsStatus = SMS_STATUS;
  off.window.NOInbox.show("sms", "bulk"); await settle(); await settle();
  assert.equal(off.$("ib-split").hidden, false, "back on the Inbox tab");
});

function loadUtil() {
  const ctx = vm.createContext({ window: {}, Date, Intl });
  vm.runInContext(read("inbox-bulk.js"), ctx);
  return ctx.window.NOInboxBulk.util;
}

/* ---------- Chosen groups and contacts (Coach Ed 2026-11-24, round 8) ---------- */

const CT = "/sites/" + A + "/contacts/";
const GROUPS = [{ id: "g1", name: "Regulars", count: 12 }, { id: "g2", name: "VIP", count: 3 }];
const FOUND = { results: [{ id: "c1", first_name: "Lito", last_name: "Cruz", mobile_masked: "0918 *** 5678", groups: [], opted_out: false }, { id: "c2", first_name: "Ana", last_name: "Reyes", mobile_masked: "0917 *** 1234", groups: ["g1"], opted_out: true }], next: null, count: 2 };
const AUD_PICK = { audience: "pick", will_send: 14, left_out: { unverified: 1, invalid_number: 0, opted_out: 1, duplicates: 0 } };
const contactsApi = (over = {}) => (p) => {
  if (p === CT + "status/") return ok({ contacts: true, count: 2, max: 20000 });
  if (p === CT + "groups/") return ok(over.groups || GROUPS);
  if (p.indexOf(CT + "?q=") === 0) return ok(over.found || FOUND);
  return null;
};
async function openPick(o = {}, contacts = contactsApi(), pickAll = true) {
  const d = boot({ listing: list(), channels: CH_SMS });
  d.s.smsStatus = SMS_STATUS; d.s.contacts = contacts;
  const bk = api({ audience: (b) => ok(b.audience === "pick" ? AUD_PICK : AUD_ALL), ...o }); d.s.bulk = bk; d.bk = bk;
  d.window.NODash.go = (href) => d.window.NOInbox.setTab(/bulk/.test(href) ? "bulk" : /settings/.test(href) ? "settings" : "");
  d.window.NOInbox.show("sms", "bulk"); await settle(); await settle(); await settle();
  await d.click(d.$("ib-bk-send")); await settle(); await settle();
  if (pickAll) { cBox(d, "ib-bk-to").fire("click"); pickRow(d, "ib-bk-to", "All my members"); await settle(); await settle(); }
  return d;
}
const cInput = (d, id) => d.$(id).parentNode.all((n) => n.classList && n.classList.contains("ib-combo-input"))[0];
const cRows = (d, id) => d.$(id).parentNode.all((n) => n.classList && n.classList.contains("ib-combo-opt"));
const cBox = (d, id) => d.$(id).parentNode.all((n) => n.classList && n.classList.contains("ib-combo-box"))[0];
const pickRow = (d, id, text) => { const r = cRows(d, id).find((n) => n.textContent.includes(text)); assert.ok(r, "row " + text); r.fire("click"); };
const chips = (d, id = "ib-bk-chips") => d.$(id).all((n) => n.classList && n.classList.contains("ib-bk-pchip")).map((n) => n.textContent);
const sendTo = (d) => cInput(d, "ib-bk-to");
const typeTo = async (d, q) => { cBox(d, "ib-bk-to").fire("click"); const i = sendTo(d); i.value = q; i.fire("input"); await sleep(350); await settle(); };
const pickTo = async (d, text) => { cBox(d, "ib-bk-to").fire("click"); pickRow(d, "ib-bk-to", text); await settle(); await settle(); };
const optLabels = (d) => cRows(d, "ib-bk-to").map((n) => n.textContent.replace(/(Group|Contact( \u00B7 No texts)?)$/, ""));

test("round 9 R9-4: one dropdown lists All my members first, then the groups, mixed with the contacts you search; All my members is selected by default and asks nothing more", async () => {
  const d = await openPick({}, undefined, false);
  assert.equal(pane(d).all((n) => n.tagName === "SELECT").length, 1, "ONE dropdown, not two");
  assert.equal(d.$("ib-bk-to").value, "", "nothing is preselected");
  assert.equal(sendTo(d).getAttribute("placeholder"), "Choose who gets it");
  assert.deepEqual(d.bk.seen.audience, [], "no count before a choice");
  await pickTo(d, "All my members");
  assert.equal(d.$("ib-bk-to").value, "", "the input keeps its placeholder; All my members is a chip");
  assert.equal(sendTo(d).value, "");
  assert.equal(sendTo(d).getAttribute("placeholder"), "Add a group or contact");
  assert.deepEqual(d.bk.seen.audience, [{ audience: "all" }]);
  await settle();
  assert.deepEqual(chips(d), ["All my members (95)\u00D7", "Regulars (12)", "VIP (3)"], "All, then every group; the groups have no remove");
  assert.equal(d.$("ib-bk-chips").all((q) => q.tagName === "BUTTON").length, 1, "only the All chip has a remove");
  assert.ok(d.calls.some((c) => c.method === "GET" && c.path === CT + "groups/"));
  cBox(d, "ib-bk-to").fire("click");
  assert.deepEqual(optLabels(d), ["All my members", "Regulars (12)", "VIP (3)"], "All my members first, then the groups");
  await typeTo(d, "Lito");
  assert.ok(d.list().includes("GET " + CT + "?q=Lito"));
  assert.ok(optLabels(d).some((t) => t.includes("Lito Cruz \u00B7 0918 *** 5678")), "contacts are in the same list, masked");
  assert.ok(!optLabels(d).some((t) => t.includes("Regulars")), "typing filters the groups too");
  assert.ok(!/consent|promo|agree/i.test(pane(d).textContent));
  assert.equal(pane(d).all((n) => n.tagName === "INPUT" && n.getAttribute("type") === "radio").length, 0);
});

test("bulk pick: with contacts off (404, or contacts:false, or no contacts field) the dropdown offers All my members and nothing else; no group is asked", async () => {
  const d = await openBulk();
  assert.ok(d.calls.some((c) => c.path === CT + "status/"), "the status was asked");
  assert.ok(!d.calls.some((c) => c.path === CT + "groups/"), "groups never asked");
  cBox(d, "ib-bk-to").fire("click");
  assert.deepEqual(optLabels(d), ["All my members"]);
  assert.ok(!pane(d).textContent.includes("Chosen groups and contacts"));
  for (const body of [{ contacts: false, count: 0, max: 20000 }, { count: 2, max: 20000 }]) {
    const e = await openPick({}, (p) => (p === CT + "status/" ? ok(body) : contactsApi()(p)));
    cBox(e, "ib-bk-to").fire("click");
    assert.deepEqual(optLabels(e), ["All my members"]);
    assert.ok(!e.calls.some((c) => c.path === CT + "groups/"));
  }
});

test("bulk pick: the count says recipients for chosen groups and contacts, members for all; the dialog matches", async () => {
  const d = await openPick();
  await typeText(d, "Sale");
  await pickTo(d, "Regulars");
  assert.equal(d.$("ib-bk-count"), null);
  await d.click(d.$("ib-bk-go"));
  assert.ok(d.$("ib-bk-dlg").textContent.includes("Send to 14 recipients from your phone?"));
});

test("bulk: the counter gets is-over above the limit and loses it when back under", async () => {
  const d = await openBulk();
  const c = d.$("ib-bk-c");
  assert.ok(!c.classList.contains("is-over"));
  await typeText(d, "x".repeat(161));
  assert.ok(d.$("ib-bk-c").classList.contains("is-over"));
  await typeText(d, "x".repeat(160));
  assert.ok(!d.$("ib-bk-c").classList.contains("is-over"));
  await typeText(d, "x".repeat(200));
  assert.ok(d.$("ib-bk-c").classList.contains("is-over"));
  await typeText(d, "short");
  assert.ok(!d.$("ib-bk-c").classList.contains("is-over"));
});

test("round 9 R9-4: picking groups and contacts shows chips (masked numbers only) and posts the pick body; All my members is dropped when something is picked", async () => {
  const d = await openPick();
  await typeText(d, "Sale this weekend");
  await pickTo(d, "Regulars");
  assert.deepEqual(chips(d).map((t) => t.replace("\u00D7", "")), ["Regulars (12)"]);
  assert.deepEqual(d.bk.seen.audience[1], { audience: "pick", groups: ["g1"], contacts: [] });
  assert.equal(sendTo(d).value, "", "the box no longer says All my members");
  cBox(d, "ib-bk-to").fire("click");
  assert.ok(!optLabels(d).some((t) => t === "Regulars (12)"), "a picked group leaves the list");
  const calls0 = d.calls.length;
  await typeTo(d, "L");
  assert.ok(!d.calls.slice(calls0).some((c) => c.path.indexOf(CT + "?q=") === 0), "one letter asks nothing");
  await typeTo(d, "Lito");
  pickRow(d, "ib-bk-to", "Lito Cruz"); await settle(); await settle();
  assert.deepEqual(chips(d).map((t) => t.replace("\u00D7", "")), ["Regulars (12)", "Lito Cruz \u00B7 0918 *** 5678"]);
  assert.deepEqual(d.bk.seen.audience[d.bk.seen.audience.length - 1], { audience: "pick", groups: ["g1"], contacts: ["c1"] });
  assert.ok(!/\+?63\d{9}|09\d{9}/.test(pane(d).textContent), "never a full number");
  await d.click(d.$("ib-bk-go")); await d.click(d.$("ib-bk-dlg-go"));
  const p = d.bk.seen.batches[0];
  assert.deepEqual(Object.keys(p).sort(), ["audience", "confirm", "contacts", "expected_count", "groups", "idempotency_key", "text"]);
  assert.equal(p.audience, "pick"); assert.deepEqual(p.groups, ["g1"]); assert.deepEqual(p.contacts, ["c1"]);
  assert.equal(p.confirm, true); assert.equal(p.expected_count, 14); assert.equal(p.text, "Sale this weekend");
});

test("round 9 R9-4: picking All my members clears the picks; removing every chip returns to All my members and counts all", async () => {
  const d = await openPick();
  await typeText(d, "Sale");
  await pickTo(d, "VIP");
  await pickTo(d, "Regulars");
  assert.deepEqual(d.bk.seen.audience[d.bk.seen.audience.length - 1], { audience: "pick", groups: ["g2", "g1"], contacts: [] });
  cBox(d, "ib-bk-to").fire("click");
  assert.equal(optLabels(d)[0], "All my members", "still offered first");
  pickRow(d, "ib-bk-to", "All my members"); await settle(); await settle();
  assert.equal(chips(d)[0], "All my members (95)\u00D7", "the picks are cleared; All is the one removable chip");
  assert.equal(d.$("ib-bk-chips").all((q) => q.tagName === "BUTTON").length, 1);
  assert.deepEqual(d.bk.seen.audience[d.bk.seen.audience.length - 1], { audience: "all" });
  assert.equal(sendTo(d).value, "");
  /* removing the last chip goes back to nothing chosen (no count, buttons off) */
  await pickTo(d, "VIP");
  const x = d.$("ib-bk-chips").all((q) => q.tagName === "BUTTON")[0];
  assert.equal(x.getAttribute("aria-label"), "Remove VIP");
  await d.click(x);
  assert.equal(chips(d).length, 0);
  assert.equal(d.$("ib-bk-to").value, "");
  assert.equal(sendTo(d).getAttribute("placeholder"), "Choose who gets it");
  assert.equal(d.$("ib-bk-go").disabled, true);
  /* the All chip's remove also returns to no audience */
  await pickTo(d, "All my members");
  await d.click(d.$("ib-bk-chips").all((q) => q.tagName === "BUTTON")[0]);
  assert.equal(chips(d).length, 0); assert.equal(sendTo(d).getAttribute("placeholder"), "Choose who gets it"); assert.equal(d.$("ib-bk-test").disabled, true);
});

test("bulk pick: closing the Send to box after typing without a pick shows the current choice again (Escape, or a click outside)", async () => {
  const d = await openPick();
  await typeTo(d, "zzz");
  assert.equal(d.$("ib-bk-to").value, "");
  sendTo(d).fire("keydown", { key: "Escape", stopPropagation() {} });
  assert.equal(sendTo(d).value, "", "Escape");
  assert.equal(chips(d)[0], "All my members (95)\u00D7", "the chip still shows the choice");
  assert.deepEqual(d.bk.seen.audience, [{ audience: "all" }], "nothing was picked");
  await typeTo(d, "Reg");
  d.doc.fire("click", { target: d.$("ib-bk-t") });
  assert.equal(sendTo(d).value, "", "click outside");
  cBox(d, "ib-bk-to").fire("click");
  assert.equal(optLabels(d)[0], "All my members", "the list is whole again");
  await typeText(d, "Sale"); await pickTo(d, "VIP");
  await typeTo(d, "xyz");
  sendTo(d).fire("keydown", { key: "Tab" });
  assert.equal(sendTo(d).value, "", "with a pick the box is empty with its placeholder, the chips show the choice");
  assert.deepEqual(chips(d).map((t) => t.replace("\u00D7", "")), ["VIP (3)"]);
});

test("bulk pick: removing one of two chips counts again and the last count is the one shown", async () => {
  const d = await openPick();
  await typeText(d, "Sale");
  await pickTo(d, "Regulars"); await pickTo(d, "VIP");
  const x = d.$("ib-bk-chips").all((q) => q.tagName === "BUTTON")[0];
  await d.click(x);
  assert.deepEqual(d.bk.seen.audience[d.bk.seen.audience.length - 1], { audience: "pick", groups: ["g2"], contacts: [] });
  assert.equal(d.$("ib-bk-count"), null);
});

test("bulk pick: 400 invalid_audience shows the server's message as it is; 409 audience_changed counts again", async () => {
  const d = await openPick({ create: () => bad(400, "invalid_audience", "Choose at least one group or contact.") });
  await typeText(d, "Sale");
  await pickTo(d, "Regulars");
  await d.click(d.$("ib-bk-go")); await d.click(d.$("ib-bk-dlg-go"));
  assert.deepEqual(d.toasts, ["Choose at least one group or contact.: "]); assert.deepEqual(d.kinds, ["error"], "the server's invalid_audience is the error toast");
  assert.deepEqual(chips(d).map((t) => t.replace("\u00D7", "")), ["Regulars (12)"], "the pick stays");
  const e = await openPick({ create: () => bad(409, "audience_changed", "Your count changed to 13. Check it and send again.") });
  await typeText(e, "Sale");
  await pickTo(e, "Regulars");
  const before = e.bk.seen.audience.length;
  await e.click(e.$("ib-bk-go")); await e.click(e.$("ib-bk-dlg-go"));
  assert.equal(e.bk.seen.audience.length, before + 1);
  assert.deepEqual(e.toasts, ["Your count changed to 13. Check it and send again.: "]);
});

test("bulk pick: History and View name a pick batch Chosen groups and contacts; the server's skip reasons show as they are", async () => {
  const U = (await openBulk({}, {}, { form: false })).window.NOInboxBulk.util;
  assert.equal(U.audienceName("pick"), "Chosen groups and contacts");
  assert.equal(U.audienceName("all"), "All my members");
  const pb = batch({ id: "sbk_pick", audience: "pick", state: "finished", waiting: 0 });
  const detail = () => ok({ ...pb, results: [{ name: "Lito Cruz", mobile: "0918 *** 5678", state: "not_sent", reason: "contact_removed", reason_text: "This contact was removed." }, { name: "Ana Reyes", mobile: "0917 *** 1234", state: "not_sent", reason: "number_changed", reason_text: "Their number changed." }], next: null });
  const d = await openBulk({ history: () => ok({ items: [pb], next_cursor: null }), detail }, {}, { form: false });
  assert.ok(rowsOf(d)[0].textContent.includes("Chosen groups and contacts"));
  await d.click(viewBtns(d)[0]); await settle();
  const t = pane(d).textContent;
  assert.ok(t.includes("This contact was removed.") && t.includes("Their number changed."));
});

/* ---------- INBOX-FIX-9 check fixes (Supervisor headless check, round 9) ---------- */

const CSS9 = () => fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const btnsIn = (n) => n.all((x) => x.tagName === "BUTTON");

test("INBOX-FIX-9 F1: Start Sending opens a real modal: a scrim, a title, the question, exactly Back and Yes, send; Escape and the scrim are Back; Tab stays inside; focus returns to Start Sending", async () => {
  const d = await openBulk();
  await typeText(d, "Sale this weekend");
  await d.click(d.$("ib-bk-go"));
  const over = d.$("ib-bk-dlg");
  assert.ok(over.classList.contains("ib-bk-dlg"), "the scrim is the outer layer");
  const box = over.all((n) => n.getAttribute("role") === "dialog")[0];
  assert.equal(box.getAttribute("aria-modal"), "true");
  assert.equal(box.all((n) => n.tagName === "H2")[0].textContent, "Start sending?");
  assert.equal(box.getAttribute("aria-labelledby"), "ib-bk-dlg-h");
  assert.ok(box.textContent.includes("Send to 95 members from your phone?"));
  assert.deepEqual(btnsIn(over).map((b) => b.textContent), ["Back", "Yes, send"], "exactly two buttons, no stray Close");
  assert.equal(d.doc.activeElement, d.$("ib-bk-dlg-back"), "focus starts on Back");
  /* Tab wraps inside the card */
  let e = d.doc.fire("keydown", { key: "Tab", shiftKey: false }); assert.equal(e.prevented, false, "Back to Yes, send is free");
  d.$("ib-bk-dlg-go").focus(); e = d.doc.fire("keydown", { key: "Tab", shiftKey: false });
  assert.ok(e.prevented); assert.equal(d.doc.activeElement, d.$("ib-bk-dlg-back"), "Tab from the last goes to the first");
  d.$("ib-bk-dlg-back").focus(); e = d.doc.fire("keydown", { key: "Tab", shiftKey: true });
  assert.ok(e.prevented); assert.equal(d.doc.activeElement, d.$("ib-bk-dlg-go"), "Shift+Tab from the first goes to the last");
  /* Escape is Back */
  d.doc.fire("keydown", { key: "Escape" });
  assert.equal(d.$("ib-bk-dlg"), null); assert.equal(d.doc.activeElement, d.$("ib-bk-go"), "focus returns to Start Sending");
  assert.equal(d.bk.seen.batches.length, 0);
  /* a click on the scrim is Back; a click inside the card is not */
  await d.click(d.$("ib-bk-go"));
  d.$("ib-bk-dlg").all((n) => n.getAttribute("role") === "dialog")[0].fire("click");
  assert.ok(d.$("ib-bk-dlg"), "a click inside the card keeps it open");
  d.$("ib-bk-dlg").fire("click");
  assert.equal(d.$("ib-bk-dlg"), null, "the scrim closes it"); assert.equal(d.bk.seen.batches.length, 0);
  /* the key listener is gone after closing: Escape does nothing and nothing throws */
  d.doc.fire("keydown", { key: "Escape" });
  const css = CSS9();
  assert.match(css, /#view-inbox \.ib-bk-dlg \{[^}]*position: fixed; inset: 0;[^}]*background: rgba\(5, 10, 30, \.66\);/, "the same scrim as the Add contact dialog");
  assert.match(css, /#view-inbox \.ib-bk-dlg-box \{[^}]*background: var\(--card\)/);
});

test("INBOX-FIX-9 F2: below 700px each History row is a stacked card row with no inner scroll, and the View detail spans the card; the desktop table is unchanged", () => {
  const raw = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const m = /@media \(width < 700px\) \{([\s\S]*?)\n\}\n/.exec(raw);
  assert.ok(m, "a phone block");
  const ph = m[1];
  assert.match(ph, /\.ib-bk-tbox \{ overflow: hidden; \}/, "no inner horizontal scroll");
  assert.match(ph, /\.ib-bk-table \{ display: block; min-width: 0; \}/);
  assert.match(ph, /tr\.ib-bk-tr \{ display: grid;[^}]*"when chip" "aud aud" "nums nums" "msg act"/, "date and status, audience, counts, message and View");
  assert.match(ph, /td\.ib-bk-rtext \{ grid-area: msg; max-width: none; \}/);
  assert.match(ph, /td\.ib-bk-act \{ grid-area: act;/);
  assert.match(ph, /\.ib-bk-dwrap \{ position: static; max-width: none; width: 100%; \}/, "the detail spans the card");
  assert.match(ph, /\.ib-bk-nums::before \{ content: "Sent \/ Failed \/ Not sent: "/);
  /* the desktop rules are the ones outside the block */
  assert.match(raw, /#view-inbox \.ib-bk-tbox \{[^}]*overflow-x: auto;/);
  assert.match(raw, /#view-inbox \.ib-bk-table \{[^}]*min-width: 680px;/);
  assert.match(raw, /#view-inbox \.ib-bk-table td\.ib-bk-rtext \{[^}]*text-overflow: ellipsis; white-space: nowrap;/, "the message stays one line, ellipsized");
});

test("INBOX-FIX-9 F2: each History row keeps its six cells in the order the phone grid relies on (date, audience, counts, status, message, View)", async () => {
  const d = await openBulk({}, {}, { form: false });
  const cells = rowsOf(d)[0].all((n) => n.tagName === "TD");
  assert.deepEqual(cells.map((c) => c.classList.contains("ib-bk-when") ? "when" : c.classList.contains("ib-bk-nums") ? "nums" : c.classList.contains("ib-bk-rtext") ? "msg" : c.classList.contains("ib-bk-act") ? "act" : "plain"),
    ["when", "plain", "nums", "plain", "msg", "act"]);
  assert.ok(cells[3].children[0].classList.contains("ib-bk-chip"), "the status chip is the 4th cell");
});

test("INBOX-FIX-9 F3: the View top block shows a round state icon (stop-circle, check-circle, clock, alert) in the state colour", async () => {
  const want = { stopped: "9.5 9.5h5v5h-5z", finished: "M8 12l3 3 5-6", sending: "M12 7v5l3 2", waiting: "M12 7v5l3 2", ended: "M12 7.5v5M12 16h.01" };
  for (const state of Object.keys(want)) {
    const b = batch({ state, sent: 2, failed: 0, not_sent: 7, waiting: 0, stopped_at: "2026-11-24T08:08:00Z", finished_at: "2026-11-23T11:00:00Z" });
    const d = await openBulk({ history: () => ok({ items: [b], next_cursor: null }), detail: () => ok({ ...b, results: [], next: null }) }, {}, { form: false });
    await d.click(viewBtns(d)[0]);
    const head = pane(d).all((n) => n.classList && n.classList.contains("ib-bk-fh"))[0];
    const svg = head.all((n) => String(n.tagName).toLowerCase() === "svg")[0];
    assert.ok(svg, state + ": an icon");
    assert.ok(svg.classList.contains("is-" + state), state + ": coloured by state");
    const dpath = svg.all((n) => String(n.tagName).toLowerCase() === "path")[0].getAttribute("d");
    assert.ok(dpath.startsWith("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"), state + ": the round frame");
    assert.ok(dpath.includes(want[state]), state + ": its own mark");
  }
  const css = CSS9();
  assert.match(css, /\.ib-bk-fh svg \{ width: 1\.25em; height: 1\.25em; \}/, "as tall as the text line");
  assert.match(css, /\.ib-bk-fh svg\.is-finished \{ color: var\(--chip-ok\); \}/);
  assert.match(css, /\.ib-bk-fh svg\.is-stopped, #view-inbox \.ib-bk-fh svg\.is-ended \{ color: var\(--bl-chip-warn\); \}/);
});

test("INBOX-FIX-9 F7: while a contact search is on its way the list says Searching, never No groups or contacts found; Rina is found by Rina even with a group picked; a failed search says so; the newest answer wins", async () => {
  const mk = (id, f, l, g) => ({ id, first_name: f, last_name: l, mobile_masked: "0917 *** 1234", groups: g || [], opted_out: false });
  const ALL = [mk("c1", "Ed", "Geronilla"), mk("c3", "Rina", "Menu12358", ["g1"])];
  let hold = null, fail = false;
  const contacts = (p) => {
    if (p === CT + "status/") return ok({ contacts: true, count: 2, max: 20000 });
    if (p === CT + "groups/") return ok(GROUPS);
    if (p.indexOf(CT + "?q=") === 0) {
      const q = decodeURIComponent(p.slice((CT + "?q=").length)).toLowerCase();
      if (fail) return bad(500, "server_error", "Oops.");
      return ok({ results: ALL.filter((c) => (c.first_name + " " + c.last_name).toLowerCase().includes(q)), next: null });
    }
    return null;
  };
  const d = await openPick({}, contacts);
  await typeText(d, "Sale"); await pickTo(d, "Regulars");
  const empties = () => cRows(d, "ib-bk-to").filter((n) => n.classList.contains("is-disabled")).map((n) => n.textContent);
  cBox(d, "ib-bk-to").fire("click");
  const i = sendTo(d); i.value = "Rina"; i.fire("input");
  assert.deepEqual(empties(), ["Searching\u2026"], "before the answer: Searching, not 'No groups or contacts found'");
  await sleep(350); await settle();
  assert.deepEqual(optLabels(d), ["Rina Menu12358 \u00B7 0917 *** 1234"], "found by first name although Rina is in the picked group");
  assert.deepEqual(empties(), []);
  /* a name that is nowhere: Searching, then the plain empty words */
  i.value = "Zzzz"; i.fire("input");
  assert.deepEqual(empties(), ["Searching\u2026"]);
  await sleep(350); await settle();
  assert.deepEqual(empties(), ["No groups or contacts found."]);
  /* a failed search says so */
  fail = true; i.value = "Rina"; i.fire("input"); await sleep(350); await settle();
  assert.deepEqual(empties(), ["We could not search just now. Please try again."]);
  fail = false;
  /* typing on: only the newest answer is used (Ri, Rin and Rina in quick succession ask once) */
  const before = d.list().filter((c) => c.includes("?q=")).length;
  for (const q of ["Ed", "Edx", "Ed"]) { i.value = q; i.fire("input"); }
  await sleep(350); await settle();
  assert.equal(d.list().filter((c) => c.includes("?q=")).length, before + 1);
  assert.ok(optLabels(d).some((t) => t.startsWith("Ed Geronilla")));
});

test("round 10 R10-1: only one batch View is open at a time: opening another closes the first; Hide closes; a late load of a closed one does not bring it back", async () => {
  const b1 = batch({ id: "sbk_aaaaaaaa", state: "finished" }), b2 = batch({ id: "sbk_bbbbbbbb", state: "finished", text: "Second batch." });
  const detail = (tail) => (ok({ ...(tail.includes("sbk_bbbbbbbb") ? b2 : b1), results: [{ name: tail.includes("sbk_bbbbbbbb") ? "Second Person" : "First Person", mobile: "+63917***4567", state: "sent", reason: "", reason_text: "" }], next: null }));
  const d = await openBulk({ history: () => ok({ items: [b1, b2], next_cursor: null }), detail }, {}, { form: false });
  const drows = () => pane(d).all((n) => n.classList && n.classList.contains("ib-bk-dr"));
  assert.equal(viewBtns(d).length, 2);
  await d.click(viewBtns(d)[0]); await settle();
  assert.equal(drows().length, 1); assert.ok(drows()[0].textContent.includes("First Person"));
  await d.click(viewBtns(d)[1]); await settle();
  assert.equal(drows().length, 1, "the first one closed when the second opened");
  assert.ok(drows()[0].textContent.includes("Second Person") && !pane(d).textContent.includes("First Person"));
  assert.deepEqual(viewBtns(d).map((v) => v.getAttribute("aria-expanded")), ["false", "true"]);
  assert.deepEqual(viewBtns(d).map((v) => v.textContent), ["View", "Hide"]);
  await d.click(viewBtns(d)[1]); await settle();
  assert.equal(drows().length, 0, "Hide closes it"); assert.deepEqual(viewBtns(d).map((v) => v.textContent), ["View", "View"]);
  /* both opened before either answers: the first load finds it was closed and must not bring it back */
  viewBtns(d)[0].fire("click"); viewBtns(d)[1].fire("click"); await settle(); await settle();
  assert.equal(drows().length, 1); assert.ok(drows()[0].textContent.includes("Second Person") && !pane(d).textContent.includes("First Person"), "the discarded load does not revive it");
});

test("round 11 R11-1: the Bulk history Audience cell names the groups then the contacts; missing fields keep the old label", async () => {
  const d = await openBulk({ history: () => ok({ items: [batch({ id: "sbk_aaaaaaaa", audience: "pick", groups: [{ id: "g1", name: "VIP" }], contacts: [{ id: "c1", first_name: "Maria", last_name: "Santos", mobile_masked: "0917 *** 1234" }, { id: "c2", first_name: "", last_name: "", mobile_masked: "0918 *** 5678" }] }), batch({ id: "sbk_bbbbbbbb", audience: "pick" }), batch({ id: "sbk_cccccccc", audience: "all" })], next_cursor: null }) }, {}, { form: false });
  const cells = rowsOf(d).map((r) => r.all((n) => n.tagName === "TD")[1]);
  assert.equal(cells[0].textContent, "VIP, Maria Santos, 0918 *** 5678"); assert.equal(cells[0].getAttribute("title"), cells[0].textContent);
  assert.ok(cells[0].classList.contains("ib-bk-aud"));
  assert.equal(cells[1].textContent, "Chosen groups and contacts"); assert.equal(cells[2].textContent, "All my members");
});

/* ---------- {first_name} (ClickUp z8uq9mjj05) ---------- */

test("first name: hasFirstName finds the exact lowercase placeholder only", () => {
  const u = loadUtil();
  assert.equal(u.hasFirstName("Hi {first_name}!"), true);
  assert.equal(u.hasFirstName("{first_name} and {first_name}"), true);
  assert.equal(u.hasFirstName("Hi {First_Name}!"), false);
  assert.equal(u.hasFirstName("Hi first_name"), false);
  assert.equal(u.hasFirstName(""), false);
  assert.equal(u.hasFirstName(null), false);
});

test("first name: insertAt puts {first_name} at the start, middle, end, over a selection, and refuses to go over 160", () => {
  const u = loadUtil(), T = "{first_name}";
  const at = (text, a, b, max = 160) => { const r = u.insertAt(text, a, b, T, max); return r && [r.text, r.caret]; };
  assert.deepEqual(at("Hello", 0, 0), [T + "Hello", 12]);
  assert.deepEqual(at("Hello", 2, 2), ["He" + T + "llo", 14]);
  assert.deepEqual(at("Hello", 5, 5), ["Hello" + T, 17]);
  assert.deepEqual(at("Hello world", 6, 11), ["Hello " + T, 18], "a selection is replaced");
  assert.deepEqual(at("", 0, 0), [T, 12]);
  assert.equal(at("a".repeat(149), 0, 0), null, "149 + 12 is 161");
  assert.deepEqual(at("a".repeat(148), 0, 0)[0].length, 160, "exactly 160 is allowed");
  assert.deepEqual(at("a".repeat(160), 0, 20)[0].length, 152, "a selection that frees room is allowed");
  assert.deepEqual(at("Hello", 99, 99), ["Hello" + T, 17], "a caret past the end is clamped");
});

test("first name: fillExample fills Maria then tidies; the same tidy turns a missing name into the fallback", () => {
  const u = loadUtil();
  assert.equal(u.fillExample("Hi {first_name}, sale", "Maria"), "Hi Maria, sale");
  assert.equal(u.fillExample("Hi {first_name}, sale", ""), "Hi, sale");
  assert.equal(u.fillExample("{first_name} {first_name}!", "Ana"), "Ana Ana!");
  assert.equal(u.fillExample("Hello  {first_name} ! Sale ?", ""), "Hello! Sale?");
  assert.equal(u.fillExample("  {first_name}  ", ""), "");
  assert.equal(u.tidy("a   b ,c ;d :e"), "a b,c;d:e");
});

test("first name: the + First name button sits on the Message label row and inserts at the caret, keeps focus, updates the counter and the buttons", async () => {
  const d = await openBulk();
  const ta = d.$("ib-bk-t"), btn = d.press(pane(d), "+ First name");
  assert.ok(btn && btn.classList.contains("no-btn"), "a house button");
  assert.ok(btn.parentNode.classList.contains("ib-fn-row"), "on the Message label row");
  await typeText(d, "Hi , sale");
  ta.selectionStart = 3; ta.selectionEnd = 3;
  await d.click(btn);
  assert.equal(ta.value, "Hi {first_name}, sale");
  assert.equal(ta.selectionStart, 15); assert.equal(ta.selectionEnd, 15);
  assert.equal(d.doc.activeElement, ta, "focus stays in the message");
  assert.equal(d.$("ib-bk-c").textContent, "21 / 160", "counts the text as typed");
  await sleep(450); await settle();
  assert.equal(d.bk.seen.preview[d.bk.seen.preview.length - 1].text, "Hi {first_name}, sale", "the preview and the send use the text as typed");
  assert.equal(d.$("ib-bk-test").disabled, false);
  assert.equal(d.$("ib-bk-go").disabled, false);
});

test("first name: with text selected the button replaces it; over 160 it does nothing", async () => {
  const d = await openBulk();
  const ta = d.$("ib-bk-t"), btn = d.press(pane(d), "+ First name");
  await typeText(d, "Hello world");
  ta.selectionStart = 6; ta.selectionEnd = 11;
  await d.click(btn);
  assert.equal(ta.value, "Hello {first_name}");
  await typeText(d, "a".repeat(150));
  ta.selectionStart = 0; ta.selectionEnd = 0;
  await d.click(btn);
  assert.equal(ta.value, "a".repeat(150), "no change");
  assert.equal(d.$("ib-bk-c").textContent, "150 / 160");
  assert.equal(d.doc.activeElement, ta, "focus is kept");
});

test("first name: the example line shows only while the text has the placeholder, and are built with textContent", async () => {
  const d = await openBulk();
  const lines = () => pane(d).all((n) => n.classList && n.classList.contains("ib-fn-help"));
  assert.equal(lines().length, 1);
  assert.ok(lines().every((n) => n.hidden), "hidden with no placeholder");
  await typeText(d, "Hi {first_name}, <b>sale</b>");
  assert.ok(lines().every((n) => !n.hidden));
  assert.equal(lines()[0].all((n) => n.classList.contains("ib-fn-outq"))[0].textContent, "Hi Maria, <b>sale</b>", "markup stays as plain text");
  await typeText(d, "Hi there");
  assert.ok(lines().every((n) => n.hidden && n.textContent === ""));
  const src = read("inbox-bulk.js"), kit = src.slice(src.indexOf("function firstNameKit"), src.indexOf("/* \"About 34 minutes left\""));
  assert.ok(kit.includes("textContent") && !/innerHTML|insertAdjacentHTML/.test(kit));
});

test("first name: a 422 on the text from the server shows on the message field", async () => {
  const msg = "Only {first_name} can go inside { }.";
  const d = await openBulk({ create: () => bad(422, "invalid", msg, { text: [msg] }) });
  await typeText(d, "Hi {first_name}");
  await d.click(d.$("ib-bk-go")); await d.click(d.$("ib-bk-dlg-go"));
  assert.equal(d.$("ib-bk-e").hidden, false);
  assert.equal(d.$("ib-bk-e").textContent, msg);
});

test("first name: problem() accepts {first_name} as plain text, still counts it as typed, and still refuses other braces", async () => {
  const d = await openBulk();
  const u = d.window.NOInboxBulk.util;
  assert.equal(u.problem("Hi {first_name}, sale", 160), "");
  assert.notEqual(u.problem("Hi {name}, sale", 160), "", "only {first_name} is allowed");
  assert.notEqual(u.problem("a".repeat(150) + "{first_name}", 160), "", "162 as typed is over");
});

test("first name: a { or } outside {first_name} shows the brace message; the length message still wins by typed length", () => {
  const ctx = vm.createContext({ window: {}, Date, Intl });
  vm.runInContext(read("inbox-sms.js"), ctx); vm.runInContext(read("inbox-bulk.js"), ctx);
  const u = ctx.window.NOInboxBulk.util, msg = "Only {first_name} can go inside { }.";
  for (const t of ["{name}", "{First_name}", "{first_name", "first_name}", "{}", "Hi {name}, sale"]) assert.equal(u.problem(t, 160), msg, t);
  for (const t of ["Hi {first_name}, x", "{first_name}{first_name}"]) assert.equal(u.problem(t, 160), "", t);
  const long = u.problem("a".repeat(161), 160);
  assert.ok(long && long !== msg);
  assert.equal(u.problem("{name}" + "a".repeat(160), 160), long, "length message by raw typed length");
});

test("first name: the always-visible hint (no example sentence) replaces the old limits line in Bulk", async () => {
  const d = await openBulk();
  const hint = "Press + First name to greet each person by name";
  const foot = pane(d).all((n) => n.classList && n.classList.contains("ib-rfoot"))[0];
  assert.ok(foot.all((n) => n.classList.contains("ib-bk-will") && n.textContent === hint).length === 1, "a label like the count");
  assert.ok(!pane(d).textContent.includes("One text for every number"));
});

test("fix 4: no count request before a pick; the count shows only after a choice, below Send to; the buttons stay off until then", async () => {
  const d = await openBulk({}, {}, { pick: false });
  await typeText(d, "Hello po");
  assert.equal(d.bk.seen.audience.length, 0, "no audience count asked");
  assert.equal(d.$("ib-bk-count"), null);
  assert.equal(chips(d).length, 0, "no chip before a choice");
  assert.equal(d.$("ib-bk-test").disabled, true); assert.equal(d.$("ib-bk-go").disabled, true);
  assert.equal(cInput(d, "ib-bk-to").getAttribute("placeholder"), "Choose who gets it");
  assert.deepEqual(cBox(d, "ib-bk-to") && (cBox(d, "ib-bk-to").fire("click"), cRows(d, "ib-bk-to").map((n) => n.textContent))[0], "All my members");
  pickRow(d, "ib-bk-to", "All my members"); await settle(); await settle();
  assert.deepEqual(d.bk.seen.audience, [{ audience: "all" }], "audience sent explicitly");
  assert.deepEqual(chips(d), ["All my members (95)\u00D7"]);
  assert.equal(d.$("ib-bk-test").disabled, false); assert.equal(d.$("ib-bk-go").disabled, false);
  await d.click(d.$("ib-bk-go"));
  assert.ok(d.$("ib-bk-dlg").textContent.includes("Send to 95 members from your phone?"), "the confirm keeps the total");
  await d.click(d.$("ib-bk-dlg-go"));
  assert.equal(d.bk.seen.batches[0].audience, "all", "the start body carries audience");
});

test("fix 4: a {first_name}-only text shows no error and asks no preview while composing; Output label and quote", async () => {
  const d = await openBulk();
  const before = d.bk.seen.preview.length;
  await d.click(d.press(pane(d), "+ First name"));
  await sleep(450); await settle();
  assert.equal(d.$("ib-bk-e").hidden, true, "no error shown");
  assert.equal(d.bk.seen.preview.length, before, "no preview asked");
  await typeText(d, "Hi {first_name}\nSale");
  const out = pane(d).all((n) => n.classList && n.classList.contains("ib-fn-help"))[0];
  assert.equal(out.hidden, false);
  assert.equal(out.all((n) => n.classList.contains("ib-fn-outl"))[0].textContent, "Output:");
  assert.equal(out.all((n) => n.classList.contains("ib-fn-outq"))[0].textContent, "Hi Maria\nSale");
  assert.ok(!/Example/.test(pane(d).textContent));
});

test("fix 4: + First name sits on the Message label row", async () => {
  const d = await openBulk();
  const row = d.$("ib-bk-t").parentNode.all((n) => n.classList && n.classList.contains("ib-fn-row"))[0];
  assert.ok(row.all((n) => n.classList.contains("ib-fn")).length === 1 && row.all((n) => n.tagName === "LABEL").length === 1);
});

test("fix 5: nothing is written below the buttons; the buttons are off until the form is complete; results are toasts", async () => {
  const d = await openBulk({}, {}, { pick: false });
  const form = d.$("ib-bk-go").parentNode.parentNode.parentNode;
  const after = (n) => { const out = []; let seen = false; for (const c of form.children) { if (seen) out.push(c); if (c.classList && c.classList.contains("ib-bk-actions")) seen = true; } return out; };
  assert.equal(after().length, 0, "no element after the buttons");
  assert.ok(!/Add a message|Choose who/.test(d.$("ib-bk-go").parentNode.parentNode.textContent));
  assert.equal(d.$("ib-bk-test").disabled, true); assert.equal(d.$("ib-bk-go").disabled, true, "no audience, no message");
  await typeText(d, "Hello po");
  assert.equal(d.$("ib-bk-test").disabled, true, "a message alone is not enough for the test: it needs an audience");
  assert.equal(d.bk.seen.audience.length, 0, "no count before a pick");
  cBox(d, "ib-bk-to").fire("click"); pickRow(d, "ib-bk-to", "All my members"); await settle(); await settle();
  assert.equal(d.$("ib-bk-test").disabled, false); assert.equal(d.$("ib-bk-go").disabled, false);
  await d.click(d.$("ib-bk-go")); await d.click(d.$("ib-bk-dlg-go"));
  assert.ok(d.toasts.some((t) => t.startsWith("Sending started")), "the result is a toast");
});

test("fix 5: the cost note is in the label format; a field error stays on the message", async () => {
  const d = await openBulk({ status: ok({ ...BULK_STATUS, cost_note: "Texts go out from your own phone and SIM. Your carrier's normal SMS rates apply." }) });
  const n = pane(d).all((x) => x.classList && x.classList.contains("ib-bk-cost"))[0];
  assert.ok(n.classList.contains("ib-fn-hint") && n.classList.contains("ib-bk-will"), "the same class as the first-name label");
  await typeText(d, "Hi {name}");
  assert.equal(d.$("ib-bk-e").hidden, false); assert.equal(d.$("ib-bk-e").textContent, "Only {first_name} can go inside { }.");
  assert.equal(d.$("ib-bk-test").disabled, true);
});
