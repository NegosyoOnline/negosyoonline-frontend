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
  const doc = makeDocument(), calls = [], toasts = [], replaced = [];
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
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  const where = location;
  const all = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label) => buttons(n).find((b) => b.textContent === label);
  const links = (n) => n.all((x) => x.tagName === "A");
  return { doc, calls, toasts, s, where, winListeners, replaced, $, all, buttons, press, links, nav, window, page,
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
async function openBulk(o = {}, bootOpts = {}) {
  const d = boot({ listing: list(), channels: CH_SMS, ...bootOpts });
  d.s.smsStatus = SMS_STATUS;
  const bk = api(o); d.s.bulk = bk; d.bk = bk;
  await d.openInbox();
  if (d.$("ib-bulk-btn")) { await d.click(d.$("ib-bulk-btn")); await settle(); await settle(); }
  return d;
}
const pane = (d) => d.$("ib-threadpane");
const typeText = async (d, t) => { d.$("ib-bk-t").value = t; d.$("ib-bk-t").fire("input"); await sleep(450); await settle(); };

/* ---------- tests ---------- */

test("bulk: the button is hidden on a 404 (switch off), on an error, and when sms is off; no bulk route is asked for without sms", async () => {
  const off = boot({ listing: list(), channels: CH_SMS }); off.s.smsStatus = SMS_STATUS;
  await off.openInbox();
  assert.equal(off.$("ib-bulk-btn"), null);
  assert.ok(off.list().includes("GET " + B + "status/"), "probed once");
  assert.equal(off.list().filter((x) => x === "GET " + B + "status/").length, 1);
  const err = boot({ listing: list(), channels: CH_SMS }); err.s.smsStatus = SMS_STATUS; err.s.bulk = () => bad(500, "server_error", "Oops.");
  await err.openInbox(); assert.equal(err.$("ib-bulk-btn"), null);
  const nope = boot({ listing: list(), channels: CH_SMS }); nope.s.smsStatus = SMS_STATUS; nope.s.bulk = () => ok({ ...BULK_STATUS, available: false });
  await nope.openInbox(); assert.equal(nope.$("ib-bulk-btn"), null);
  const nosms = boot({ listing: list(), channels: CHANNELS_ON }); nosms.s.bulk = api();
  await nosms.openInbox();
  assert.equal(nosms.$("ib-bulk-btn"), null);
  assert.ok(!nosms.list().some((x) => x.includes("/sms/bulk/")), "not probed while sms is off");
});

test("bulk: with available:true the toolbar shows Bulk SMS", async () => {
  const d = boot({ listing: list(), channels: CH_SMS }); d.s.smsStatus = SMS_STATUS; d.s.bulk = api();
  await d.openInbox();
  assert.ok(d.$("ib-bulk-btn"));
  assert.equal(d.$("ib-bulk-btn").textContent, "Bulk SMS");
});

test("bulk: the audience is a plain All my members line (no dropdown); it is read with all; no promo or consent wording anywhere", async () => {
  const d = await openBulk();
  assert.equal(d.$("ib-bk-aud"), null, "no audience dropdown");
  assert.ok(pane(d).textContent.includes("Who gets the text"));
  assert.ok(pane(d).textContent.includes("All my members"));
  assert.deepEqual(d.bk.seen.audience, [{ audience: "all" }]);
  const all = pane(d).textContent;
  assert.ok(!/promo|consent|agree|warning|opt-in|permission|allowed to text/i.test(all), "no promo or consent wording: " + all);
});

test("bulk: the count line and the left-out groups with plain labels; never a list of numbers", async () => {
  const d = await openBulk();
  const box = d.$("ib-bk-count").textContent;
  assert.ok(box.includes("Will send to 95 members"));
  assert.ok(box.includes("Mobile number not verified: 10"));
  assert.ok(box.includes("Test number: 2"));
  assert.ok(box.includes("Asked for no more texts (STOP): 5"));
  assert.ok(box.includes("Repeated number: 8"));
  assert.ok(!/promo/i.test(box), "no promo group");
  assert.ok(!/\+?63\d{9}|09\d{9}/.test(pane(d).textContent));
});

test("bulk: the prefix, the room-left counter and the debounced preview with the exact text; no Promotional tick", async () => {
  const d = await openBulk();
  assert.ok(pane(d).textContent.includes("Every text starts with: Test Store: "));
  assert.equal(d.$("ib-bk-c").textContent, "147 characters left");
  await typeText(d, "Sale this weekend");
  assert.equal(d.$("ib-bk-c").textContent, "130 characters left");
  assert.deepEqual(d.bk.seen.preview, [{ text: "Sale this weekend" }], "one preview call after the pause");
  assert.ok(d.$("ib-bk-preview").textContent.includes("Test Store: Sale this weekend"));
  assert.equal(d.$("ib-bk-promo"), null, "no Promotional tick");
  assert.ok(!/promotional|consent|warning/i.test(pane(d).textContent));
});

test("bulk: a link is refused inline (the server's words) and nothing can be tested or confirmed", async () => {
  const d = await openBulk();
  await typeText(d, "Visit shop.example.com today");
  assert.equal(d.$("ib-bk-e").hidden, false);
  assert.equal(d.$("ib-bk-e").textContent, "The text must not contain a web link.");
  assert.equal(d.$("ib-bk-sure"), null);
  assert.equal(d.$("ib-bk-test").disabled, true);
  assert.equal(d.press(pane(d), "Start sending"), undefined);
  /* a 422 only the server knows */
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
  assert.ok(d.$("ib-bk-testnote").textContent.includes("test text is on its way"));
  const e = await openBulk({ test: () => bad(409, "no_mobile", "Add a verified mobile number to your account first.") });
  await typeText(e, "Hello po"); await e.click(e.$("ib-bk-test"));
  assert.equal(e.$("ib-bk-testnote").textContent, "Add a verified mobile number to your account first.");
});

test("bulk: confirm needs the tick; the payload has confirm:true, expected_count, audience and a key; the progress card then shows", async () => {
  const d = await openBulk();
  await typeText(d, "Sale this weekend");
  assert.ok(d.$("ib-bk-confirm").textContent.includes("Send to 95 members from your phone?"));
  assert.equal(d.$("ib-bk-go").disabled, true, "not before the tick");
  d.$("ib-bk-sure").checked = true; d.$("ib-bk-sure").fire("change");
  assert.equal(d.$("ib-bk-go").disabled, false);
  await d.click(d.$("ib-bk-go"));
  assert.equal(d.bk.seen.batches.length, 1);
  const p = d.bk.seen.batches[0];
  assert.deepEqual(Object.keys(p).sort(), ["audience", "confirm", "expected_count", "idempotency_key", "text"]);
  assert.equal(p.confirm, true); assert.equal(p.expected_count, 95); assert.equal(p.audience, "all"); assert.equal(p.text, "Sale this weekend");
  assert.match(p.idempotency_key, /^[A-Za-z0-9_-]{8,64}$/);
  assert.ok(d.$("ib-bk-progress"), "the progress card shows");
  assert.equal(d.$("ib-bk-t"), null, "the form is gone while a batch runs");
});

test("bulk: 409 audience_changed shows the server's words, reads the audience again and asks for a new tick", async () => {
  const d = await openBulk({ create: () => bad(409, "audience_changed", "Your member count changed to 97. Check it and send again.") });
  await typeText(d, "Sale this weekend");
  d.$("ib-bk-sure").checked = true; d.$("ib-bk-sure").fire("change");
  const before = d.bk.seen.audience.length;
  await d.click(d.$("ib-bk-go"));
  assert.equal(d.bk.seen.audience.length, before + 1, "the audience is read again");
  assert.equal(d.$("ib-bk-e").textContent, "Your member count changed to 97. Check it and send again.");
  assert.equal(d.$("ib-bk-sure").checked, false);
  assert.equal(d.$("ib-bk-go").disabled, true);
});

test("bulk: the progress card shows the counts, the pause in plain words, the estimate and a direct Stop (no dialog)", async () => {
  const run = batch({ paused_reason: "outside_window" });
  const d = await openBulk({ status: ok({ ...BULK_STATUS, active_batch: run }) });
  const card = d.$("ib-bk-progress").textContent;
  assert.ok(card.includes("Sending"));
  for (const t of ["10", "Sent", "1", "Failed", "0", "Not sent", "84", "Waiting"]) assert.ok(card.includes(t), t);
  assert.ok(d.$("ib-bk-pause").textContent.includes("outside sending hours (8:00 am to 8:00 pm, Manila time)"));
  assert.ok(card.includes("About 34 minutes left"));
  assert.ok(card.includes("Asked for no more texts (STOP): 5"), "left-out labels keep their wording");
  assert.ok(card.includes("Mobile number not verified: 10"));
  await d.click(d.$("ib-bk-stop"));
  assert.equal(d.bk.seen.stop, 1, "one click stops it");
  assert.ok(d.list().includes("POST " + B + "batches/sbk_aaaaaaaa/stop/"));
});

test("bulk: the pause reasons and the estimate in plain words", () => {
  const u = loadUtil();
  assert.ok(u.pauseText({ state: "sending", paused_reason: "daily_cap" }).includes("today's limit is reached"));
  assert.ok(u.pauseText({ state: "waiting", paused_reason: "phone_offline" }).includes("your phone is offline"));
  assert.equal(u.pauseText({ state: "finished", paused_reason: "daily_cap" }), "");
  assert.equal(u.estimate(0), ""); assert.equal(u.estimate(30), "Less than a minute left");
  assert.equal(u.estimate(3900), "About 1 hour 5 minutes left"); assert.equal(u.estimate(7200), "About 2 hours left");
  assert.equal(u.willSend(1), "Will send to 1 member");
});

test("bulk: blocked states show blocked_message; no_line adds the link to SMS Settings; the form is not offered", async () => {
  const d = await openBulk({ status: ok({ ...BULK_STATUS, blocked: "no_line", blocked_message: "Pair your phone in Settings → SMS Gateway to text many members." }) });
  assert.ok(pane(d).textContent.includes("Pair your phone in Settings → SMS Gateway to text many members."));
  assert.equal(d.$("ib-bk-gw").getAttribute("href"), "/sms/settings/");
  assert.equal(d.$("ib-bk-t"), null);
  const h = await openBulk({ status: ok({ ...BULK_STATUS, blocked: "site_held", blocked_message: "Your store is on hold." }) });
  assert.ok(pane(h).textContent.includes("Your store is on hold."));
  assert.equal(h.$("ib-bk-gw"), null);
});

test("bulk: the cost line comes from cost_note; there is no web-link help text", async () => {
  const d = await openBulk();
  assert.ok(pane(d).textContent.includes("Your carrier's normal SMS rates apply."));
  assert.ok(!/web link|http|www/i.test(pane(d).textContent.replace("The text must not contain a web link.", "")));
});

test("bulk: history pages with the cursor and opens a batch; the recipients are masked, 50 a page, with the reasons", async () => {
  const pages = [];
  const hist = (tail) => { pages.push(tail); return tail.includes("cursor=sbk_bbbb") ? ok({ items: [batch({ id: "sbk_cccccccc", state: "stopped" })], next_cursor: null }) : ok({ items: [batch({ state: "finished" })], next_cursor: "sbk_bbbb" }); };
  const d = await openBulk({ history: hist });
  await d.click(d.$("ib-bk-history"));
  assert.ok(d.$("ib-back").parentNode.classList.contains("ib-bk-head"), "History's back button is marked to show at every width");
  assert.equal(d.$("ib-back").textContent, "Back");
  assert.ok(pane(d).textContent.includes("95 members"));
  assert.ok(pane(d).textContent.includes("Sent 10, Failed 1, Not sent 0"));
  await d.click(d.press(pane(d), "Show more"));
  assert.deepEqual(pages, ["batches/?limit=20", "batches/?limit=20&cursor=sbk_bbbb"]);
  assert.equal(pane(d).all((n) => n.classList.contains("ib-bk-row")).length, 2);
  await d.click(pane(d).all((n) => n.classList.contains("ib-bk-row"))[0]);
  assert.ok(d.$("ib-back").parentNode.classList.contains("ib-bk-head") && d.$("ib-back").textContent === "History", "Batch has a visible way back to History");
  const t = pane(d).textContent;
  assert.ok(d.list().includes("GET " + B + "batches/sbk_aaaaaaaa/?limit=50"));
  assert.ok(t.includes("Maria Santos") && t.includes("+63917***4567") && t.includes("Sent"));
  assert.ok(t.includes("Jun Cruz") && t.includes("Not sent") && t.includes("Asked for no more texts."));
  assert.ok(!/\+63\d{9}/.test(t), "no full number");
});

test("bulk: a number the API forgot to mask is masked on the page; detail pages with next", async () => {
  const u = loadUtil();
  assert.equal(u.maskMobile("+63917***4567"), "+63917***4567");
  assert.equal(u.maskMobile("+639171234567"), "+63917***4567");
  assert.equal(u.maskMobile(""), "");
  const seen = [];
  const d = await openBulk({ detail: (tail) => { seen.push(tail); return ok({ ...batch({ state: "finished" }), results: [{ name: "Ana", mobile: "+639171234567", state: "sent", reason: "", reason_text: "" }], next: tail.includes("cursor=") ? null : "50" }); } });
  await d.click(d.$("ib-bk-history"));
  await d.click(pane(d).all((n) => n.classList.contains("ib-bk-row"))[0]);
  assert.ok(!pane(d).textContent.includes("+639171234567"));
  await d.click(d.press(pane(d), "Show more"));
  assert.ok(seen[1].includes("cursor=50"));
});

test("bulk: a 404 from any bulk route hides the button and closes the screen", async () => {
  let gone = false;
  const d = await openBulk({ audience: () => { gone = true; return bad(404, "not_found", "Not found."); } });
  assert.ok(gone);
  assert.equal(d.$("ib-bulk-btn"), null);
  assert.ok(pane(d).textContent.includes("Choose a conversation"));
});

test("INBOX-FIX-6: the Bulk SMS tab opens on the sends so far (History), no composer; the Bulk SMS button on that tab opens the composer; a store without bulk has no tab", async () => {
  const d = boot({ listing: list(), channels: CH_SMS }); d.s.smsStatus = SMS_STATUS;
  const bk = api({}); d.s.bulk = bk; d.bk = bk;
  d.window.NODash.go = (href) => d.window.NOInbox.setTab(/bulk/.test(href) ? "bulk" : /settings/.test(href) ? "settings" : "");
  await d.openInbox(); await settle();
  const labels = () => d.all(d.$("ib-tabs-host"), "ib-tab").map((n) => n.textContent);
  assert.deepEqual(labels(), ["Inbox", "Bulk SMS", "Settings"], "order: Inbox | Bulk SMS | Settings, with New SMS and Bulk SMS in the same row");
  assert.ok(d.$("ib-newtext-btn") && d.$("ib-bulk-btn"));
  d.$("ib-tab-bulk").fire("click"); await settle(); await settle();
  assert.equal(d.$("ib-tab-bulk").getAttribute("aria-selected"), "true");
  assert.equal(d.$("ib-bulkpane").hidden, false); assert.equal(d.$("ib-split").hidden, true);
  assert.ok(d.$("ib-bulkpane").textContent.includes("History") && d.$("ib-bulkpane").textContent.includes("Your batches, newest first."), "the sends so far");
  assert.equal(d.$("ib-bk-t"), null, "not the composer");
  assert.ok(d.list().some((c) => c.indexOf("GET " + B + "batches/?limit=20") === 0), "reads the history only");
  d.$("ib-bulk-btn").fire("click"); await settle(); await settle();
  assert.ok(d.$("ib-bk-t"), "the Bulk SMS button opens the composer");
  d.$("ib-tab-inbox").fire("click"); await settle();
  assert.equal(d.$("ib-split").hidden, false); assert.equal(d.$("ib-bulkpane").hidden, true);
  const none = boot({ listing: list(), channels: CH_SMS }); none.s.smsStatus = SMS_STATUS;
  await none.openInbox(); await settle();
  assert.deepEqual(none.all(none.$("ib-tabs-host"), "ib-tab").map((n) => n.textContent), ["Inbox", "Settings"], "bulk not open: no Bulk SMS tab");
});

test("INBOX-FIX-6: a deep link to /sms/bulk/ opens the History; if bulk is not open it falls back to the Inbox tab", async () => {
  const d = boot({ listing: list(), channels: CH_SMS }); d.s.smsStatus = SMS_STATUS;
  const bk = api({}); d.s.bulk = bk; d.bk = bk;
  d.window.NOInbox.show("sms", "bulk"); await settle(); await settle();
  assert.ok(d.$("ib-bulkpane").textContent.includes("Your batches, newest first."));
  const off = boot({ listing: list(), channels: CH_SMS }); off.s.smsStatus = SMS_STATUS;
  off.window.NOInbox.show("sms", "bulk"); await settle(); await settle();
  assert.equal(off.$("ib-split").hidden, false, "back on the Inbox tab");
});

function loadUtil() {
  const ctx = vm.createContext({ window: {}, Date, Intl });
  vm.runInContext(read("inbox-bulk.js"), ctx);
  return ctx.window.NOInboxBulk.util;
}
