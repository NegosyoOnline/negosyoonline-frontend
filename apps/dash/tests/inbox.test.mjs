/* The Inbox screens (ClickUp z8uq9md3n6, G2 Unified Inbox, frontend F1): /settings/inbox/ (inbox-settings.js, mockups a1 to a3)
   and /inbox/ (inbox.js, mockups b1 to b3 and c1 to c3). Driven like payments.test.mjs: the real scripts run in a vm with the small
   stand-in document from dom.mjs and a recorded fetch that plays the API of apps/inquiries (api_owner.py). Fake data only: no
   Pancake token, no provider, no real message. */
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
const REF = "104829384756123_7000000000001";
const REF2 = "104829384756123_7000000000002";
const FAKE_TOKEN = "fake-token-0000000000000000000000";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();

const CONN_NONE = { provider: "pancake", status: "unset", page_id: "", label: "", token_set: false, last_test: null };
const CONN_OK = { provider: "pancake", status: "active", page_id: "104829384756123", label: "", token_set: true, last_test: { at: iso(5), outcome: "ok" } };
const CONN_BAD = { provider: "pancake", status: "invalid", page_id: "104829384756123", label: "", token_set: true, last_test: { at: iso(5), outcome: "invalid_credentials" } };

function thread(over = {}) {
  return { ref: REF, display_name: "Maria Santos", provider_url: null, next_cursor: null, replies: [],
    reply: { open: true, reason: "provider_open" },
    messages: [
      { id: "m2", direction: "out", sender_kind: "page", text: "Hello Maria!", attachments: [], at: iso(2) },
      { id: "m1", direction: "in", sender_kind: "customer", text: "Hi po, available pa ba?", attachments: [], at: iso(3) },
      { id: "m3", direction: "in", sender_kind: "customer", text: "", attachments: ["image"], at: iso(1) }
    ], ...over };
}
function list(over = {}) {
  return { items: [
    { ref: REF, display_name: "Maria Santos", snippet: "Hi po, available pa ba?", updated_at: iso(10), channel: "facebook" },
    { ref: REF2, display_name: "Jun Dela Cruz", snippet: "Magkano po?", updated_at: iso(60 * 30), channel: "facebook" }
  ], next_cursor: null, ...over };
}

/* The stand-in API. `s` holds what each route answers; a route set to a number answers that status with a fixed error body. */
function boot({ conn = CONN_NONE, listing = list(), reading = thread(), reply = { state: "sent", error_code: "", created_at: iso(0) }, off = false, search = "" } = {}) {
  const doc = makeDocument(), calls = [], toasts = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; return n; };
  doc.createTextNode = (t) => { const w = make("span"); w.textContent = t; return w.firstChild; };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["ib-root", "ib-live", "ib-upd", "ibs-root", "ibs-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const refresh = doc.createElement("div"); refresh.setAttribute("id", "ib-refresh"); refresh.hidden = true; page.appendChild(refresh);
  const refreshBtn = doc.createElement("button"); refreshBtn.setAttribute("id", "ib-refresh-btn"); refresh.appendChild(refreshBtn);
  const nav = [0, 1, 2].map(() => { const a = doc.createElement("a"); a.setAttribute("data-inbox-nav", ""); a.hidden = true; page.appendChild(a); return a; });
  doc.querySelectorAll = (sel) => (sel === "[data-inbox-nav]" ? nav : []);
  const s = { conn: { ...conn }, listing, reading, reply, off, putAnswer: null, listAnswer: null, threadAnswer: null, replyAnswer: null, testOutcome: "ok" };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    let a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    const err = (status, code, message) => ({ status, body: { error: { code, message } } });
    if (opts.method === "GET" && p === "/sites/") a = { status: 200, body: { items: [{ id: A, template: "sante" }], next_cursor: null } };
    else if (s.off) a = err(404, "not_found", "Not found.");
    else if (p === BASE + "connection/" && opts.method === "GET") a = { status: 200, body: s.conn };
    else if (p === BASE + "connection/" && opts.method === "PUT") {
      if (s.putAnswer) a = s.putAnswer;
      else {
        if (body.page_id !== undefined) s.conn.page_id = body.page_id;
        if (body.access_token) { s.conn.token_set = true; s.conn.status = "active"; s.conn.last_test = null; }
        a = { status: 200, body: { ...s.conn } };
      }
    } else if (p === BASE + "connection/" && opts.method === "DELETE") { s.conn = { ...s.conn, token_set: false, status: "unset", last_test: null }; a = { status: 200, body: { ...s.conn } }; }
    else if (p === BASE + "connection/test/" && opts.method === "POST") {
      s.conn.last_test = { at: iso(0), outcome: s.testOutcome };
      if (s.testOutcome === "ok") s.conn.status = "active";
      a = { status: 200, body: { outcome: s.testOutcome } };
    } else if (/^\/sites\/[^/]+\/inquiries\/conversations\/(\?cursor=\d+)?$/.test(p) && opts.method === "GET") a = s.listAnswer || { status: 200, body: s.listing };
    else if (/\/reply\/$/.test(p) && opts.method === "POST") a = s.replyAnswer || { status: 200, body: s.reply };
    else if (/\/conversations\/[^/]+\/(\?cursor=\d+)?$/.test(p) && opts.method === "GET") a = s.threadAnswer || { status: 200, body: s.reading };
    if (a.status === 0) return Promise.reject(new Error("offline"));
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const location = { search, pathname: "/inbox/", replace() {}, assign() {} };
  const context = vm.createContext({ window, document: doc, location, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, Uint8Array, Date,
    localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("inbox.js"), context, { filename: "inbox.js" });
  vm.runInContext(read("inbox-settings.js"), context, { filename: "inbox-settings.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  const all = (n, c) => n.all((x) => x.classList.contains(c));
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label) => buttons(n).find((b) => b.textContent === label);
  const links = (n) => n.all((x) => x.tagName === "A");
  return { doc, calls, toasts, s, $, all, buttons, press, links, nav, window, page, refresh,
    list: () => calls.map((c) => c.method + " " + c.path),
    text: (id) => $(id).textContent,
    async openSettings() { window.NOInboxSettings.show(); await settle(); },
    async openInbox() { window.NOInbox.show(); await settle(); },
    async click(node) { node.fire("click"); await settle(); } };
}

/* ---------- /settings/inbox/ ---------- */

test("a1: not connected shows the empty form, a disabled Test button and the how-it-works card", async () => {
  const d = boot();
  await d.openSettings();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE + "connection/"]);
  const root = d.$("ibs-root");
  assert.equal(root.getAttribute("aria-busy"), null);
  assert.deepEqual(root.all((n) => n.tagName === "H2").map((n) => n.textContent), ["Facebook Messenger through Pancake", "How the inbox works"]);
  assert.equal(d.all(root, "chip")[0].textContent, "Not connected");
  assert.deepEqual(d.all(root, "pm-label").map((l) => l.textContent), ["Pancake page ID", "Page token"]);
  assert.equal(d.$("ibs-access_token").getAttribute("type"), "password");
  assert.equal(d.$("ibs-page_id").getAttribute("placeholder"), "For example 104829384756123");
  assert.deepEqual(d.buttons(root).map((b) => b.textContent), ["Save and connect", "Test connection"]);
  assert.equal(d.press(root, "Test connection").disabled, true);
  assert.equal(d.all(root, "mk-list")[0].children.length, 3);
  assert.deepEqual(d.nav.map((n) => n.hidden), [false, false, false], "the API answered, so the Inbox links show");
});

test("saving sends the page ID and token once, empties the token box, and shows the connected card without the token anywhere", async () => {
  const d = boot();
  await d.openSettings();
  d.$("ibs-page_id").value = " 104829384756123 ";
  d.$("ibs-access_token").value = FAKE_TOKEN;
  await d.click(d.press(d.$("ibs-root"), "Save and connect"));
  const put = d.calls.filter((c) => c.method === "PUT");
  assert.equal(put.length, 1);
  assert.deepEqual(put[0].body, { page_id: "104829384756123", access_token: FAKE_TOKEN });
  const root = d.$("ibs-root");
  assert.equal(d.all(root, "chip")[0].textContent, "Connected");
  assert.ok(root.textContent.includes("Token saved"));
  assert.ok(root.textContent.includes("The token is never shown again."));
  assert.ok(!root.textContent.includes(FAKE_TOKEN), "the token is not on the page");
  assert.equal(d.$("ibs-access_token"), null, "no token box while a token is saved");
  assert.equal(d.$("ibs-page_id").value, "104829384756123");
  assert.deepEqual(d.toasts, ["Saved: Your Pancake connection was saved."]);
  assert.ok(!JSON.stringify(d.calls.slice(2)).includes("page_id\":\"\""), "no empty value was sent");
});

test("a page ID or token that cannot be right is refused on the page, before any request", async () => {
  const d = boot();
  await d.openSettings();
  await d.click(d.press(d.$("ibs-root"), "Save and connect"));
  assert.equal(d.text("ibs-page_id-err"), "Enter your Pancake page ID.");
  assert.equal(d.$("ibs-page_id").getAttribute("aria-invalid"), "true");
  assert.equal(d.doc.activeElement, d.$("ibs-page_id"));
  d.$("ibs-page_id").value = "104829384756123";
  d.$("ibs-access_token").value = "short token";
  await d.click(d.press(d.$("ibs-root"), "Save and connect"));
  assert.equal(d.$("ibs-page_id").getAttribute("aria-invalid"), null);
  assert.equal(d.text("ibs-access_token-err"), "That token does not look right. Copy it again from Pancake.");
  assert.equal(d.calls.filter((c) => c.method === "PUT").length, 0);
});

test("a field the API refuses is shown next to its box and the toast stays quiet", async () => {
  const d = boot();
  d.s.putAnswer = { status: 422, body: { error: { code: "invalid", message: "Bad", fields: { page_id: ["That page ID does not look right."] } } } };
  await d.openSettings();
  d.$("ibs-page_id").value = "104829384756123";
  d.$("ibs-access_token").value = FAKE_TOKEN;
  await d.click(d.press(d.$("ibs-root"), "Save and connect"));
  assert.equal(d.text("ibs-page_id-err"), "That page ID does not look right.");
  assert.equal(d.toasts.length, 0);
  assert.equal(d.$("ibs-access_token").value, "", "the token box is emptied even when the save is refused");
});

test("a2: connected shows the saved token row, a passed test and Test connection / Disconnect; Test runs the API test and reads again", async () => {
  const d = boot({ conn: CONN_OK });
  await d.openSettings();
  const root = d.$("ibs-root");
  assert.equal(d.all(root, "chip")[0].textContent, "Connected");
  assert.deepEqual(d.buttons(root).map((b) => b.textContent), ["Replace token", "Test connection", "Save page ID", "Disconnect"]);
  assert.equal(d.press(root, "Save page ID").hidden, true, "the page-ID save shows only after an edit");
  const block = d.all(root, "mk-test")[0];
  assert.equal(block.getAttribute("role"), "status");
  assert.ok(block.textContent.startsWith("Test passed" + "Pancake answered for this page. Last checked today, "), block.textContent);
  d.s.testOutcome = "provider_down";
  await d.click(d.press(root, "Test connection"));
  assert.deepEqual(d.list().slice(-2), ["POST " + BASE + "connection/test/", "GET " + BASE + "connection/"]);
  const bad = d.all(d.$("ibs-root"), "mk-test")[0];
  assert.equal(bad.getAttribute("role"), "alert");
  assert.ok(bad.textContent.startsWith("Test failedPancake did not answer. Try again in a moment."), bad.textContent);
  assert.equal(d.$("ibs-live").textContent, "Test failed.");
});

test("editing the saved page ID shows Save page ID, which sends the page ID alone", async () => {
  const d = boot({ conn: CONN_OK });
  await d.openSettings();
  const page = d.$("ibs-page_id");
  page.value = "104829384756999";
  page.fire("input");
  const save = d.press(d.$("ibs-root"), "Save page ID");
  assert.equal(save.hidden, false);
  await d.click(save);
  assert.deepEqual(d.calls.filter((c) => c.method === "PUT").map((c) => c.body), [{ page_id: "104829384756999" }]);
});

test("Replace token opens a new token box; Cancel puts the saved row back", async () => {
  const d = boot({ conn: CONN_OK });
  await d.openSettings();
  await d.click(d.press(d.$("ibs-root"), "Replace token"));
  assert.deepEqual(d.all(d.$("ibs-root"), "pm-label").map((l) => l.textContent), ["Pancake page ID", "New page token"]);
  assert.deepEqual(d.buttons(d.$("ibs-root")).map((b) => b.textContent), ["Save new token", "Cancel"]);
  await d.click(d.press(d.$("ibs-root"), "Cancel"));
  assert.ok(d.press(d.$("ibs-root"), "Replace token"));
  assert.equal(d.$("ibs-access_token"), null);
});

test("a3: a token the provider refused pauses the inbox, asks for a new token and still allows Test and Disconnect", async () => {
  const d = boot({ conn: CONN_BAD });
  await d.openSettings();
  const root = d.$("ibs-root");
  assert.equal(d.all(root, "chip")[0].textContent, "Token not accepted");
  assert.equal(d.all(root, "chip")[0].attrs["class"], "chip chip-danger");
  assert.equal(d.all(root, "pm-warn")[0].textContent, "Your inbox is paused. Messages cannot be read or sent until the token is replaced.");
  assert.deepEqual(d.all(root, "pm-label").map((l) => l.textContent), ["Pancake page ID", "New page token"]);
  assert.equal(d.text("ibs-access_token-err"), "The saved token no longer works. Paste a new one to reconnect.");
  assert.equal(d.$("ibs-access_token").getAttribute("aria-invalid"), "true");
  assert.deepEqual(d.buttons(root).map((b) => b.textContent), ["Save new token", "Test connection", "Disconnect"]);
  assert.ok(d.all(root, "mk-test")[0].textContent.startsWith("Test failedPancake did not accept the saved token."));
  d.$("ibs-access_token").value = FAKE_TOKEN;
  await d.click(d.press(root, "Save new token"));
  assert.deepEqual(d.calls.filter((c) => c.method === "PUT").map((c) => c.body), [{ page_id: "104829384756123", access_token: FAKE_TOKEN }]);
  assert.equal(d.all(d.$("ibs-root"), "chip")[0].textContent, "Connected");
});

test("Disconnect asks once more, then sends DELETE and shows the empty form again", async () => {
  const d = boot({ conn: CONN_OK });
  await d.openSettings();
  const b = d.press(d.$("ibs-root"), "Disconnect");
  await d.click(b);
  assert.equal(b.textContent, "Confirm disconnect");
  assert.equal(d.calls.filter((c) => c.method === "DELETE").length, 0);
  await d.click(b);
  assert.equal(d.calls.filter((c) => c.method === "DELETE").length, 1);
  assert.equal(d.all(d.$("ibs-root"), "chip")[0].textContent, "Not connected");
  assert.equal(d.$("ibs-page_id").value, "104829384756123", "the page ID stays so it need not be typed again");
});

test("settings while the API answers 404 (switch off): a plain note, no form, the Inbox links stay hidden", async () => {
  const d = boot({ off: true });
  await d.openSettings();
  const root = d.$("ibs-root");
  assert.deepEqual(root.all((n) => n.tagName === "H2").map((n) => n.textContent), ["The inbox is not available yet"]);
  assert.equal(root.all((n) => n.tagName === "INPUT").length, 0);
  assert.deepEqual(d.nav.map((n) => n.hidden), [true, true, true]);
});

/* ---------- /inbox/ ---------- */

test("b1: the list shows each customer with a snippet and time; no chip unless a row says reply_open is false", async () => {
  const d = boot({ conn: CONN_OK });
  await d.openInbox();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE + "conversations/"]);
  const rows = d.all(d.$("ib-list"), "ib-item");
  assert.equal(rows.length, 2);
  assert.deepEqual(d.all(rows[0], "ib-name").map((n) => n.textContent), ["Maria Santos"]);
  assert.deepEqual(d.all(rows[0], "ib-snip").map((n) => n.textContent), ["Hi po, available pa ba?"]);
  assert.equal(d.all(rows[0], "ib-av")[0].textContent, "MS");
  assert.equal(d.all(rows[0], "ib-time")[0].textContent.length > 0, true);
  assert.equal(d.all(d.$("ib-list"), "ib-mini").length, 0, "no Reply time ended chip without reply_open");
  assert.equal(d.refresh.hidden, false);
  assert.ok(d.text("ib-upd").startsWith("Updated today, "), d.text("ib-upd"));
  assert.equal(d.$("ib-threadpane").classList.contains("is-hide-phone"), true, "on a phone the list shows first");
  assert.ok(d.$("ib-threadpane").textContent.includes("Choose a conversation"));
  assert.deepEqual(d.nav.map((n) => n.hidden), [false, false, false]);
});

test("the Reply time ended chip appears only on a row that says reply_open is false", async () => {
  const items = list().items.map((i, n) => (n === 1 ? { ...i, reply_open: false } : { ...i, reply_open: true }));
  const d = boot({ listing: list({ items }) });
  await d.openInbox();
  const chips = d.all(d.$("ib-list"), "ib-mini");
  assert.equal(chips.length, 1);
  assert.equal(chips[0].textContent, "Reply time ended");
});

test("b2: an empty list says so; Show more conversations appears only with a next cursor and appends", async () => {
  const empty = boot({ listing: { items: [], next_cursor: null } });
  await empty.openInbox();
  assert.ok(empty.$("ib-listbody").textContent.includes("No messages yet"));
  assert.ok(empty.$("ib-listbody").textContent.includes("Press Refresh to check again."));

  const d = boot({ listing: list({ next_cursor: "30" }) });
  await d.openInbox();
  d.s.listing = { items: [{ ref: "104829384756123_7000000000003", display_name: "Liza R.", snippet: "Thanks", updated_at: iso(90), channel: "facebook" }], next_cursor: null };
  await d.click(d.press(d.$("ib-listbody"), "Show more conversations"));
  assert.ok(d.list().includes("GET " + BASE + "conversations/?cursor=30"));
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 3);
  assert.equal(d.press(d.$("ib-listbody"), "Show more conversations"), undefined);
});

test("b3: when Pancake does not answer the list says so, keeps the last update time and Try again reads again", async () => {
  const d = boot();
  await d.openInbox();
  d.s.listAnswer = { status: 502, body: { error: { code: "provider_down", message: "Pancake is not answering right now. Please try again later." } } };
  await d.click(d.$("ib-refresh-btn"));
  const body = d.$("ib-listbody");
  assert.ok(body.textContent.includes("We couldn't reach Pancake"));
  assert.equal(d.all(body, "ib-err")[0].getAttribute("role"), "alert");
  assert.deepEqual(d.buttons(body).map((b) => b.textContent), ["Try again"]);
  assert.deepEqual(d.links(body).map((a) => [a.getAttribute("href"), a.textContent]), [["/settings/inbox/", "Check connection"]]);
  assert.ok(d.text("ib-upd").startsWith("Last updated today, "), d.text("ib-upd"));
  assert.equal(d.refresh.hidden, false);
  d.s.listAnswer = null;
  await d.click(d.press(body, "Try again"));
  assert.equal(d.all(d.$("ib-list"), "ib-item").length, 2);
  assert.ok(d.text("ib-upd").startsWith("Updated today, "), d.text("ib-upd"));
});

test("not connected, a token that was refused and the switch being off each get their own panel", async () => {
  const connect = boot();
  connect.s.listAnswer = { status: 409, body: { error: { code: "not_connected", message: "Connect your Pancake page first." } } };
  await connect.openInbox();
  assert.ok(connect.$("ib-wrap").textContent.includes("Connect your Pancake page"));
  assert.deepEqual(connect.links(connect.$("ib-wrap")).map((a) => a.getAttribute("href")), ["/settings/inbox/"]);
  assert.equal(connect.refresh.hidden, true);

  const bad = boot();
  bad.s.listAnswer = { status: 409, body: { error: { code: "reconnect", message: "Pancake did not accept the saved token. Save a new one." } } };
  await bad.openInbox();
  assert.ok(bad.$("ib-wrap").textContent.includes("Your inbox is paused"));
  assert.ok(bad.$("ib-wrap").textContent.includes("Pancake did not accept the saved token. Save a new one."));

  const off = boot({ off: true });
  await off.openInbox();
  assert.ok(off.$("ib-wrap").textContent.includes("The inbox is not available yet"));
  assert.equal(off.refresh.hidden, true);
  assert.deepEqual(off.nav.map((n) => n.hidden), [true, true, true]);
});

test("c1: opening a conversation shows the messages oldest first with a day heading, an attachment placeholder and no reply-until chip without expires_at", async () => {
  const d = boot();
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  assert.ok(d.list().includes("GET " + BASE + `conversations/${REF}/`));
  const pane = d.$("ib-threadpane");
  assert.equal(pane.classList.contains("is-hide-phone"), false);
  assert.equal(d.$("ib-listpane").classList.contains("is-hide-phone"), true);
  assert.equal(d.all(pane, "ib-tname")[0].children[0].textContent, "Maria Santos");
  assert.equal(d.all(pane, "chip").length, 0, "no chip: the thread carries no expires_at");
  assert.deepEqual(d.all(pane, "ib-bub").map((b) => b.textContent), ["Hi po, available pa ba?", "Hello Maria!", "[Photo]"]);
  assert.deepEqual(d.all(pane, "ib-msg").map((m) => m.classList.contains("ib-msg-out")), [false, true, false]);
  assert.equal(d.all(pane, "ib-day").map((x) => x.textContent).pop(), "Today");
  assert.equal(d.links(pane).length, 0, "no Open in Pancake link without a verified provider_url");
  assert.equal(d.$("ib-list").children[0].children[0].getAttribute("aria-current"), "true");
});

test("the reply-until chip shows only when reply.expires_at is present; the Open in Pancake link only for an https address", async () => {
  const soon = new Date(Date.now() + 5 * 3600000).toISOString();
  const d = boot({ reading: thread({ reply: { open: true, reason: "provider_open", expires_at: soon }, provider_url: "https://pancake.test/c/1" }) });
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  const pane = d.$("ib-threadpane");
  const chip = d.all(pane, "chip")[0];
  assert.ok(chip.textContent.startsWith("You can reply until "), chip.textContent);
  assert.equal(chip.attrs["class"], "chip chip-info");
  const a = d.links(pane)[0];
  assert.equal(a.getAttribute("href"), "https://pancake.test/c/1");
  assert.equal(a.getAttribute("target"), "_blank");
  assert.equal(a.getAttribute("rel"), "noopener noreferrer");

  const unsafe = boot({ reading: thread({ provider_url: "javascript:alert(1)" }) });
  await unsafe.openInbox();
  await unsafe.click(unsafe.all(unsafe.$("ib-list"), "ib-item")[0]);
  assert.equal(unsafe.links(unsafe.$("ib-threadpane")).length, 0);
});

test("c2: a closed window disables the box, explains why, and offers Open in Pancake when there is a link", async () => {
  const d = boot({ reading: thread({ reply: { open: false, reason: "provider_closed" }, provider_url: "https://pancake.test/c/1" }) });
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  const pane = d.$("ib-threadpane");
  assert.equal(d.all(pane, "chip")[0].textContent, "Reply time ended");
  const box = d.all(pane, "ib-reply")[0];
  assert.equal(box.classList.contains("is-closed"), true);
  assert.equal(d.all(box, "ib-closed-t")[0].textContent, "You can't reply here anymore. Facebook only allows a reply for a limited time after the customer's last message, and that time has ended.");
  assert.equal(d.all(box, "ib-closed-s")[0].textContent, "You can still answer this customer in Pancake.");
  assert.equal(d.$("ib-rb").disabled, true);
  assert.equal(d.$("ib-rb").getAttribute("placeholder"), "Replying is closed for this conversation");
  assert.equal(d.press(box, "Send").disabled, true);
  assert.equal(d.all(box, "ib-count")[0].textContent, "0 / 2000");
  assert.equal(d.links(box).map((a) => a.textContent).join(), "Open in Pancake");
});

test("c1: Send is off for an empty box, the counter follows the text, and a sent reply posts text and a valid idempotency key, clears the box and shows a Sent bubble", async () => {
  const d = boot();
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  const box = d.$("ib-rb"), send = d.press(d.$("ib-threadpane"), "Send");
  assert.equal(send.disabled, true);
  box.value = "  Ang total po ay PHP 2,450.  "; box.fire("input");
  assert.equal(d.text("ib-rc"), "30 / 2000");
  assert.equal(send.disabled, false);
  await d.click(send);
  const post = d.calls.filter((c) => c.method === "POST");
  assert.equal(post.length, 1);
  assert.equal(post[0].path, BASE + `conversations/${REF}/reply/`);
  assert.equal(post[0].body.text, "Ang total po ay PHP 2,450.");
  assert.match(post[0].body.idempotency_key, /^[A-Za-z0-9_-]{8,64}$/);
  assert.deepEqual(Object.keys(post[0].body).sort(), ["idempotency_key", "text"]);
  assert.equal(d.$("ib-rb").value, "");
  const bubbles = d.all(d.$("ib-threadpane"), "ib-bub").map((b) => b.textContent);
  assert.equal(bubbles[bubbles.length - 1], "Ang total po ay PHP 2,450.");
  assert.ok(d.all(d.$("ib-threadpane"), "chip-ok").some((c) => c.textContent === "Sent"));
  assert.equal(d.$("ib-live").textContent, "Reply sent.");
});

test("c3: a reply the provider failed keeps the text, shows a Failed chip and notice, and Try again uses a new key", async () => {
  const d = boot({ reply: { state: "failed", error_code: "provider_down", created_at: iso(0) } });
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  d.$("ib-rb").value = "Ang total po ay PHP 2,450."; d.$("ib-rb").fire("input");
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  const pane = d.$("ib-threadpane");
  const fail = d.all(pane, "ib-fail")[0];
  assert.equal(fail.getAttribute("role"), "alert");
  assert.equal(fail.textContent, "Your reply was not sent. Pancake did not answer. Nothing reached the customer. Your text is still in the box. Press Try again to send it again.");
  assert.equal(d.$("ib-rb").value, "Ang total po ay PHP 2,450.");
  assert.ok(d.all(pane, "chip-danger").some((c) => c.textContent === "Failed: Pancake did not answer"));
  assert.ok(d.press(pane, "Try again"));
  d.s.reply = { state: "sent", error_code: "", created_at: iso(0) };
  await d.click(d.press(pane, "Try again"));
  const keys = d.calls.filter((c) => c.method === "POST").map((c) => c.body.idempotency_key);
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1], "the first attempt is on record as failed, so a retry is a new reply");
  assert.equal(d.all(d.$("ib-threadpane"), "ib-fail").length, 0);
  assert.equal(d.all(d.$("ib-threadpane"), "chip-danger").length, 0, "the failed bubble is gone after a good retry");
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
  const keys = d.calls.filter((c) => c.method === "POST").map((c) => c.body.idempotency_key);
  assert.equal(keys[0], keys[1]);
});

test("a reply the API refuses shows the API's own sentence and keeps the text; blocked_window turns the box into the closed panel", async () => {
  const d = boot();
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  d.$("ib-rb").value = "Hello"; d.$("ib-rb").fire("input");
  d.s.replyAnswer = { status: 409, body: { error: { code: "reconnect", message: "Pancake did not accept the saved token. Save a new one." } } };
  await d.click(d.press(d.$("ib-threadpane"), "Send"));
  assert.ok(d.all(d.$("ib-threadpane"), "ib-fail")[0].textContent.includes("Pancake did not accept the saved token. Save a new one. Nothing reached the customer."));
  assert.equal(d.$("ib-rb").value, "Hello");
  d.s.replyAnswer = { status: 200, body: { state: "blocked_window", error_code: "window_closed", created_at: iso(0) } };
  await d.click(d.press(d.$("ib-threadpane"), "Try again"));
  assert.equal(d.all(d.$("ib-threadpane"), "ib-reply")[0].classList.contains("is-closed"), true);
  assert.equal(d.$("ib-rb").disabled, true);
});

test("Show earlier messages loads the older page and puts it above", async () => {
  const d = boot({ reading: thread({ next_cursor: "3" }) });
  await d.openInbox();
  await d.click(d.all(d.$("ib-list"), "ib-item")[0]);
  d.s.threadAnswer = { status: 200, body: thread({ messages: [{ id: "m0", direction: "in", sender_kind: "customer", text: "Earlier hello", attachments: [], at: iso(50) }], next_cursor: null }) };
  await d.click(d.press(d.$("ib-threadpane"), "Show earlier messages"));
  assert.ok(d.list().includes("GET " + BASE + `conversations/${REF}/?cursor=3`));
  assert.equal(d.all(d.$("ib-threadpane"), "ib-bub")[0].textContent, "Earlier hello");
  assert.equal(d.press(d.$("ib-threadpane"), "Show earlier messages"), undefined);
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
    listing: list({ items: [{ ref: REF, display_name: evil, snippet: evil, updated_at: iso(1), channel: "facebook" }] }),
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
  assert.equal(u.reasonOf("provider_down"), "Pancake did not answer");
  assert.equal(u.reasonOf("something_new"), "Pancake could not send it");
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

test("the probe shows the Inbox links only when the connection read is not a 404", async () => {
  const on = boot();
  on.window.NOInbox.probe(); await settle();
  assert.deepEqual(on.nav.map((n) => n.hidden), [false, false, false]);
  assert.deepEqual(on.list(), ["GET /sites/", "GET " + BASE + "connection/"]);
  const off = boot({ off: true });
  off.window.NOInbox.probe(); await settle();
  assert.deepEqual(off.nav.map((n) => n.hidden), [true, true, true]);
});
