/* inbox.js: the SMS list, a conversation with its reply form, and New SMS. Driven through the stand-in
   document with the backend's answers per route. They prove the page follows the answers and keeps the rules
   (no id or value in an address, nothing stored, only the quiet polling timers, no raw backend value). They do not prove the look. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { inbox, settle, status, conv, msg, refusal, makeClock } from "./inbox-page.mjs";

const src = fs.readFileSync(new URL("../public/assets/js/inbox.js", import.meta.url), "utf8");
const rowsOf = (p) => p.node.rows.children;
const buttonsIn = (n) => n.all((x) => x.tagName === "BUTTON");
const OPEN = { id: "conv_1", contact: "+63 900 ••• 0142", can_reply: true, messages: [], next: null };
const withOpen = (data = OPEN) => ({ "inbox/conversations/open/": () => [200, { ...OPEN, ...data }] });
const submit = (p, form) => p.node[form].fire("submit");
const type = (p, id, value) => { p.node[id].value = value; p.node[id].fire("input"); };

/* ---- boot and the three states ---- */

test("boot: me/ first, then the status, then the list; one call each, nothing in any address", async () => {
  const p = inbox({});
  await settle();
  assert.deepEqual(p.log.map((l) => [l.method, l.route]), [["GET", "me/"], ["POST", "inbox/status/"], ["POST", "inbox/conversations/list/"], ["POST", "bulk/status/"]]);
  assert.deepEqual(p.log[1].body, { platform: "sms" });
  assert.deepEqual(p.log[2].body, { platform: "sms", state: "all" });
  for (const l of p.log) assert.doesNotMatch(l.url, /[?#]|inbox\/[^/]+\/[^/]+\/.+/);
  assert.equal(p.shown("v-list"), true);
  assert.equal(p.shown("boot"), false);
  assert.equal(p.node["acct-name"].textContent, "sample.staff");
});

test("a 401 sends the person to sign in or to the second step; nothing else is called", async () => {
  const p = inbox({ "me/": () => [401, refusal("second_step_required")] });
  await settle();
  assert.equal(p.location.replaced, "/verify/");
  assert.equal(p.log.length, 1);
  const q = inbox({ "inbox/status/": () => [401, refusal("unauthenticated")] });
  await settle();
  assert.equal(q.location.replaced, "/sign-in/");
});

test("a 404 shows the closed card with no reason; offline or an error shows the try-again card", async () => {
  const closed = inbox({ "inbox/status/": () => [404, refusal("not_found")] });
  await settle();
  assert.equal(closed.shown("v-closed"), true);
  assert.match(fs.readFileSync(new URL("../public/inbox.html", import.meta.url), "utf8"), /<h2 id="h-closed">The Inbox is not available\.<\/h2>/);
  assert.equal(closed.shown("v-list"), false);
  assert.equal(closed.calls_to("inbox/conversations/list/").length, 0);
  for (const answer of ["offline", [500, {}]]) {
    const down = inbox({ "inbox/status/": () => answer });
    await settle();
    assert.equal(down.shown("v-down"), true);
    assert.equal(down.shown("v-closed"), false);
  }
});

test("try again starts over from me/", async () => {
  let n = 0;
  const p = inbox({ "inbox/status/": () => (++n === 1 ? "offline" : [200, status()]) });
  await settle();
  p.node.retry.fire("click");
  await settle();
  assert.equal(p.shown("v-list"), true);
  assert.equal(p.calls_to("me/").length, 2);
});

/* ---- the status line ---- */

test("the chips show the phone and the day's count; New SMS only for a user who may send", async () => {
  const p = inbox({ "inbox/status/": () => [200, status({ phone_online: false, used_today: 1610, cap: 2000, send: false, unread: 3 })] });
  await settle();
  assert.equal(p.text("chip-phone-text"), "Gateway phone offline");
  assert.equal(p.text("chip-used"), "1,610 of 2,000 texts used today");
  assert.equal(p.node["new-sms"].hidden, true);
  assert.equal(p.text("seg-unread-n"), "3");
  const q = inbox({});
  await settle();
  assert.equal(q.text("chip-phone-text"), "Gateway phone online");
  assert.equal(q.node["new-sms"].hidden, false);
  assert.equal(q.node["new-sms"].textContent, "");
});

test("the page holds no Contacts link, and its one Bulk SMS link is hidden until bulk/status/ answers 200", () => {
  const html = fs.readFileSync(new URL("../public/inbox.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /Contacts/);
  assert.match(html, /<a [^>]*id="bulk-link" href="\/inbox\/sms\/bulk\/" hidden>/);
  assert.equal((html.match(/bulk/gi) || []).length, 4);
});

/* ---- the list ---- */

const LIST = { results: [
  conv({ id: "conv_1", unread: 2, last_message_at: "2026-11-09T08:18:00+00:00" }),
  conv({ id: "conv_2", contact: "INFO", can_reply: false, last_direction: "in" }),
  conv({ id: "conv_3", last_direction: "out", last_status: "queued" }),
  conv({ id: "conv_4", last_direction: "out", last_status: "sent" }),
  conv({ id: "conv_5", last_direction: "out", last_status: "failed" }),
  conv({ id: "conv_6", last_direction: "out", last_status: null }),
], next: null };

test("a row shows the masked contact, the time, an unread pill or a status word, and never any text", async () => {
  const p = inbox({ "inbox/conversations/list/": () => [200, { results: LIST.results.map((c) => ({ ...c, body: "SECRET TEXT", preview: "SECRET TEXT" })), next: null }] });
  await settle();
  const rows = rowsOf(p);
  assert.equal(rows.length, 6);
  assert.doesNotMatch(p.text("rows"), /SECRET/);
  const words = rows.map((li) => li.textContent);
  assert.match(words[0], /\+63 900 ••• 0142/);
  assert.match(words[0], /2 unread/);
  assert.equal(rows[0].children[0].classList.contains("unread"), true);
  assert.match(words[1], /INFO.*Received.*Cannot reply/);
  assert.match(words[2], /Waiting/);
  assert.match(words[3], /Sent.*Sent/);
  assert.match(words[4], /Not sent/);
  assert.match(words[5], /Not sent/);
  assert.equal(rows[0].children[0].tagName, "BUTTON");
  assert.equal(p.shown("l-empty"), false);
});

test("an empty list says so, differently for All and Unread", async () => {
  const p = inbox({});
  await settle();
  assert.equal(p.text("l-empty"), "No conversations yet.");
  assert.equal(p.shown("l-empty"), true);
  p.node["seg-unread"].fire("click");
  await settle();
  assert.equal(p.text("l-empty"), "No unread conversations.");
  assert.deepEqual(p.calls_to("inbox/conversations/list/").at(-1).body, { platform: "sms", state: "unread" });
  assert.equal(p.node["seg-unread"].getAttribute("aria-current"), "true");
  assert.equal(p.node["seg-all"].getAttribute("aria-current"), "false");
});

test("Load more passes the cursor once per press and adds rows", async () => {
  let n = 0;
  const p = inbox({ "inbox/conversations/list/": () => [200, ++n === 1 ? { results: [conv({ id: "conv_1" })], next: "conv_1" } : { results: [conv({ id: "conv_2" })], next: null }] });
  await settle();
  assert.equal(p.shown("more"), true);
  p.node.more.fire("click");
  await settle();
  assert.deepEqual(p.calls_to("inbox/conversations/list/").at(-1).body, { platform: "sms", state: "all", cursor: "conv_1" });
  assert.equal(rowsOf(p).length, 2);
  assert.equal(p.shown("more"), false);
  assert.equal(p.calls_to("inbox/conversations/list/").length, 2);
});

test("Find posts the typed number in the body only, clears the field, and Show all returns", async () => {
  const found = { results: [conv({ id: "conv_f" })], next: null };
  const p = inbox({ "inbox/conversations/find/": () => [200, found] });
  await settle();
  p.node["find-number"].value = "0900 000 0142";
  submit(p, "find-form");
  assert.equal(p.node["find-number"].value, "");
  await settle();
  const call = p.calls_to("inbox/conversations/find/");
  assert.equal(call.length, 1);
  assert.deepEqual(call[0].body, { platform: "sms", number: "0900 000 0142" });
  assert.doesNotMatch(call[0].url, /0900/);
  assert.equal(rowsOf(p).length, 1);
  assert.equal(p.shown("found-line"), true);
  assert.equal(p.shown("more"), false);
  p.node["show-all"].fire("click");
  await settle();
  assert.equal(p.shown("found-line"), false);
  assert.equal(p.calls_to("inbox/conversations/list/").length, 2);
  assert.doesNotMatch(JSON.stringify(p.log.filter((l) => l.route !== "inbox/conversations/find/")), /0900 000 0142/);
});

test("Find with no match says so; an empty field calls nothing", async () => {
  const p = inbox({ "inbox/conversations/find/": () => [200, { results: [], next: null }] });
  await settle();
  submit(p, "find-form");
  await settle();
  assert.equal(p.calls_to("inbox/conversations/find/").length, 0);
  p.node["find-number"].value = "0900 000 0000";
  submit(p, "find-form");
  await settle();
  assert.equal(p.text("l-empty"), "No conversation with that number.");
  assert.equal(p.shown("l-empty"), true);
  assert.equal(p.shown("found-line"), false, "no lone Show all and no 'Showing the conversation' line above the empty answer");
  const html = fs.readFileSync(new URL("../public/inbox.html", import.meta.url), "utf8");
  assert.match(html, /<p class="dash-copy list-note" id="l-empty" hidden><\/p>/, "the empty line is padded like the notes beneath it");
  assert.doesNotMatch(html, /placeholder="Find a full number, for example/, "the Find placeholder fits a phone");
  assert.match(html, /id="find-number"[^>]*placeholder="Full mobile number"/);
});

test("Refresh calls the status and the list again, once each per press", async () => {
  const p = inbox({});
  await settle();
  p.node.refresh.fire("click");
  await settle();
  assert.equal(p.calls_to("inbox/status/").length, 2);
  assert.equal(p.calls_to("inbox/conversations/list/").length, 2);
});

test("a list that cannot be read keeps the page and says so", async () => {
  const p = inbox({ "inbox/conversations/list/": () => "offline" });
  await settle();
  assert.equal(p.shown("v-list"), true);
  assert.equal(p.text("l-msg"), "The conversations could not be loaded. Try again.");
});

test("#find puts the cursor in the Find field when the list opens, and on a later hash change", async () => {
  const p = inbox({});
  p.location.hash = "#find";
  await settle();
  p.location.hash = "";
  p.doc.activeElement = null;
  p.location.hash = "#find";
  p.heard.hashchange();
  assert.equal(p.doc.activeElement, p.node["find-number"]);
});

/* ---- a conversation ---- */

const THREAD = [
  msg({ id: "m1", at: "2026-11-09T08:18:00+00:00", body: "Hello, is this NegosyoOnline?" }),
  msg({ id: "m2", direction: "out", status: "failed", reason: "text_lost", author: "sample.staff", at: "2026-11-09T08:25:00+00:00", body: "Hi" }),
  msg({ id: "m3", direction: "out", status: "failed", reason: "unheard_of_reason", author: "sample.staff", at: "2026-11-09T08:26:00+00:00", body: "Hi again" }),
  msg({ id: "m4", direction: "out", status: "sent", author: "sample.staff", at: "2026-11-09T08:40:00+00:00", body: "Hi there" }),
  msg({ id: "m5", at: "2026-11-11T01:38:00+00:00", body: "Good morning", clipped: true }),
  msg({ id: "m6", direction: "out", status: "queued", author: "other.staff", at: "2026-11-11T01:44:00+00:00", body: "Open settings" }),
  msg({ id: "m7", direction: "out", status: "expired", reason: null, author: "other.staff", at: "2026-11-11T01:45:00+00:00", body: "Late" }),
];

async function opened(routes = {}, data = { messages: THREAD }, listed = LIST) {
  const p = inbox({ "inbox/conversations/list/": () => [200, listed], ...withOpen(data), ...routes });
  await settle();
  buttonsIn(rowsOf(p)[0])[0].fire("click");
  await settle();
  return p;
}

test("opening posts the id from memory in the body, shows the texts oldest first with day separators and status words", async () => {
  const p = await opened();
  const call = p.calls_to("inbox/conversations/open/");
  assert.equal(call.length, 1);
  assert.deepEqual(call[0].body, { platform: "sms", conversation: "conv_1" });
  assert.doesNotMatch(call[0].url, /conv_1/);
  assert.equal(p.shown("v-conv"), true);
  assert.equal(p.shown("v-list"), false);
  assert.equal(p.text("c-title"), "+63 900 ••• 0142");
  assert.equal(p.shown("c-chip"), true);
  const t = p.node.thread.children;
  assert.deepEqual(t.filter((n) => n.classList.contains("day")).map((n) => n.textContent), ["Monday, 9 November 2026", "Wednesday, 11 November 2026"]);
  const bubbles = t.filter((n) => n.classList.contains("msg"));
  assert.equal(bubbles.length, 7);
  assert.match(bubbles[0].textContent, /Hello, is this NegosyoOnline\?Received4:18 PM/);
  assert.match(bubbles[1].textContent, /Not sent: the text was lost before it could be sent.*sample\.staff/);
  assert.equal(bubbles[1].classList.contains("failed"), true);
  assert.equal(bubbles[2].textContent.includes("unheard_of_reason"), false);
  assert.match(bubbles[2].textContent, /Not sent.*sample\.staff/);
  assert.doesNotMatch(bubbles[2].textContent, /Not sent:/);
  assert.match(bubbles[3].textContent, /Sent.*sample\.staff/);
  assert.equal(bubbles[3].classList.contains("failed"), false);
  assert.match(bubbles[4].textContent, /Good morning \(cut short\)/);
  assert.match(bubbles[5].textContent, /Waiting to send.*other\.staff/);
  assert.match(bubbles[6].textContent, /Not sent: the phone did not take it in time/);
  assert.equal(bubbles[6].classList.contains("failed"), true);
});

test("one history entry with the page's own address and no data; Back closes the conversation and reloads the list", async () => {
  const p = await opened();
  assert.equal(p.location.pathname, "/inbox/sms/");
  p.heard.popstate();
  await settle();
  assert.equal(p.shown("v-list"), true);
  assert.equal(p.shown("v-conv"), false);
  assert.equal(p.calls_to("inbox/conversations/list/").length, 2);
  const q = await opened();
  q.node.back.fire("click");
  await settle();
  assert.equal(q.shown("v-list"), true);
});

test("Earlier texts passes the cursor once per press and puts the older page first", async () => {
  const older = [msg({ id: "o1", body: "Older text", at: "2026-11-08T08:00:00+00:00" })];
  let n = 0;
  const p = await opened({ "inbox/conversations/open/": () => [200, ++n === 1 ? { ...OPEN, messages: [THREAD[0]], next: "m1" } : { ...OPEN, messages: older, next: null }] });
  assert.equal(p.shown("earlier-row"), true);
  p.node.earlier.fire("click");
  await settle();
  assert.deepEqual(p.calls_to("inbox/conversations/open/").at(-1).body, { platform: "sms", conversation: "conv_1", cursor: "m1" });
  assert.equal(p.calls_to("inbox/conversations/open/").length, 2);
  const bubbles = p.node.thread.children.filter((x) => x.classList.contains("msg"));
  assert.match(bubbles[0].textContent, /Older text/);
  assert.match(bubbles[1].textContent, /Hello/);
  assert.equal(p.shown("earlier-row"), false);
});

test("Refresh in a conversation calls open once per press", async () => {
  const p = await opened();
  p.node["c-refresh"].fire("click");
  await settle();
  assert.equal(p.calls_to("inbox/conversations/open/").length, 2);
  assert.deepEqual(p.calls_to("inbox/conversations/open/")[1].body, { platform: "sms", conversation: "conv_1" });
});

test("a conversation that is gone closes with the list message; so does a refresh that finds it gone", async () => {
  const p = inbox({ "inbox/conversations/list/": () => [200, LIST], "inbox/conversations/open/": () => [404, refusal("not_found")] });
  await settle();
  buttonsIn(rowsOf(p)[0])[0].fire("click");
  await settle();
  assert.equal(p.shown("v-list"), true);
  assert.equal(p.shown("v-closed"), false);
  assert.equal(p.text("l-msg"), "That conversation is no longer available.");
});

test("the reply form shows only with can_reply and send; otherwise one of two sentences and no form", async () => {
  const a = await opened();
  assert.equal(a.shown("reply-form"), true);
  assert.equal(a.shown("c-noreply"), false);
  const b = await opened({}, { messages: [], can_reply: false, contact: "INFO" });
  assert.equal(b.shown("reply-form"), false);
  assert.equal(b.text("c-noreply"), "This sender is not a mobile number, so it cannot be replied to.");
  assert.equal(b.shown("c-chip"), false);
  const c = await opened({ "inbox/status/": () => [200, status({ send: false })] });
  assert.equal(c.shown("reply-form"), false);
  assert.equal(c.text("c-noreply"), "You can read the Inbox but not send texts.");
  assert.equal(c.shown("c-chip"), true);
  assert.equal(c.calls_to("inbox/conversations/reply/").length, 0);
});

test("the counter and Send: disabled at 0 and above 160, enabled between", async () => {
  const p = await opened();
  assert.equal(p.text("reply-count"), "0 / 160");
  assert.equal(p.node["reply-go"].disabled, true);
  type(p, "reply-text", "Hello");
  assert.equal(p.text("reply-count"), "5 / 160");
  assert.equal(p.node["reply-go"].disabled, false);
  type(p, "reply-text", "   ");
  assert.equal(p.node["reply-go"].disabled, true);
  type(p, "reply-text", "x".repeat(160));
  assert.equal(p.node["reply-go"].disabled, false);
  assert.equal(p.node["reply-count"].getAttribute("class"), "counter");
  type(p, "reply-text", "x".repeat(161));
  assert.equal(p.node["reply-go"].disabled, true);
  assert.equal(p.node["reply-count"].getAttribute("class"), "counter over");
});

test("a reply: 32 hex characters, the new text arrives as Waiting to send, the field is cleared, the id is replaced", async () => {
  const sent = [];
  const p = await opened({ "inbox/conversations/reply/": (b) => { sent.push(b); return [201, { conversation: "conv_1", message: msg({ id: "m9", direction: "out", status: "queued", author: "sample.staff", body: b.text }) }]; } });
  type(p, "reply-text", "On our way");
  submit(p, "reply-form");
  await settle();
  assert.match(sent[0].request_id, /^[0-9a-f]{32}$/);
  assert.deepEqual({ ...sent[0], request_id: "x" }, { platform: "sms", conversation: "conv_1", text: "On our way", request_id: "x" });
  const bubbles = p.node.thread.children.filter((x) => x.classList.contains("msg"));
  assert.match(bubbles.at(-1).textContent, /On our way.*Waiting to send/);
  assert.equal(p.node["reply-text"].value, "");
  assert.equal(p.text("reply-count"), "0 / 160");
  type(p, "reply-text", "Another");
  submit(p, "reply-form");
  await settle();
  assert.notEqual(sent[1].request_id, sent[0].request_id);
});

test("the same request id is kept after no answer, and after a refusal; the text stays", async () => {
  const ids = [];
  const answers = ["offline", [429, refusal("rate_limited", "Too many texts this hour.")], [409, refusal("request_in_progress")], [201, { conversation: "conv_1", message: msg({ direction: "out", status: "queued", body: "Hi" }) }]];
  const p = await opened({ "inbox/conversations/reply/": (b) => { ids.push(b.request_id); return answers.shift(); } });
  type(p, "reply-text", "Hi");
  submit(p, "reply-form");
  await settle();
  assert.equal(p.text("reply-box"), "We could not tell whether it was sent. Look at the conversation before you send again.");
  assert.equal(p.node["reply-text"].value, "Hi");
  submit(p, "reply-form");
  await settle();
  assert.equal(p.text("reply-box"), "Too many texts this hour.");
  assert.equal(p.node["reply-text"].value, "Hi");
  submit(p, "reply-form");
  await settle();
  assert.equal(p.text("reply-box"), "This text is already being sent. Check the conversation before you send it again.");
  submit(p, "reply-form");
  await settle();
  assert.equal(new Set(ids).size, 1);
  assert.equal(p.node["reply-text"].value, "");
  assert.equal(p.shown("reply-box"), false);
});

test("each refusal shows the right words in the right place, the text kept, and no raw backend value", async () => {
  const cases = [
    ["invalid_text", 400, "reply-err", "The text must not contain a web link."],
    ["cannot_reply", 400, "reply-box", "This sender cannot be replied to."],
    ["forbidden", 403, "reply-box", "Read-only access."],
    ["limit_reached", 429, "reply-box", "The daily limit is reached."],
    ["sms_paused", 503, "reply-box", "Texts are paused."],
  ];
  for (const [code, http, where, words] of cases) {
    const p = await opened({ "inbox/conversations/reply/": () => [http, refusal(code, words, code === "invalid_text" ? { text: [words] } : {})] });
    type(p, "reply-text", "Hi");
    submit(p, "reply-form");
    await settle();
    assert.equal(p.text(where), words, code);
    assert.equal(p.node["reply-text"].value, "Hi", code);
  }
  const unavailable = await opened({ "inbox/conversations/reply/": () => [503, refusal("sms_unavailable", "internal detail xyz")] });
  type(unavailable, "reply-text", "Hi");
  submit(unavailable, "reply-form");
  await settle();
  assert.equal(unavailable.text("reply-box"), "The text could not be sent right now. Try again later.");
  const odd = await opened({ "inbox/conversations/reply/": () => [500, refusal("something_new", "internal detail xyz")] });
  type(odd, "reply-text", "Hi");
  submit(odd, "reply-form");
  await settle();
  assert.equal(odd.text("reply-box"), "That did not go through. Check the conversation before trying again.");
  assert.doesNotMatch(odd.text("reply-box"), /internal/);
});

test("a reply to a conversation that went away closes it with the list message", async () => {
  const p = await opened({ "inbox/conversations/reply/": () => [404, refusal("not_found")] });
  type(p, "reply-text", "Hi");
  submit(p, "reply-form");
  await settle();
  assert.equal(p.shown("v-list"), true);
  assert.equal(p.text("l-msg"), "That conversation is no longer available.");
});

test("a reply 401 follows the sign-in rule", async () => {
  const p = await opened({ "inbox/conversations/reply/": () => [401, refusal("unauthenticated")] });
  type(p, "reply-text", "Hi");
  submit(p, "reply-form");
  await settle();
  assert.equal(p.location.replaced, "/sign-in/");
});

/* ---- New SMS ---- */

const NEW = { pathname: "/inbox/sms/new/" };
const newPage = async (routes = {}) => { const p = inbox(routes, NEW); await settle(); return p; };

test("New SMS opens straight on the form with the chips and the reserve sentence; the list is not called", async () => {
  const p = await newPage();
  assert.equal(p.shown("v-new"), true);
  assert.equal(p.shown("n-cols"), true);
  assert.equal(p.text("n-chip-used"), "610 of 2,000 texts used today");
  assert.equal(p.text("n-reserve"), "300 texts a day are kept for sign-in codes. Staff texts stop once 1,700 are used that day.");
  assert.equal(p.calls_to("inbox/conversations/list/").length, 0);
  assert.equal(p.node["new-go"].disabled, false, "Send SMS is never silently disabled");
  assert.equal(p.text("text-count"), "0 / 160 (160 left)");
});

test("New SMS: the form markup has the 160 limit, live error lines and an enabled button", () => {
  const html = fs.readFileSync(new URL("../public/inbox.html", import.meta.url), "utf8");
  assert.match(html, /id="text" maxlength="160"/);
  assert.match(html, /id="to-err" role="alert"/);
  assert.match(html, /id="text-err" role="alert"/);
  assert.match(html, /id="to"[^>]*aria-describedby="to-hint to-err"/);
  assert.doesNotMatch(html, /id="new-go" disabled/);
});

test("New SMS: an empty number and an empty message each say so by the field, focus goes to the number, and nothing is sent", async () => {
  const p = await newPage();
  submit(p, "new-form");
  await settle();
  assert.equal(p.text("to-err"), "Enter the mobile number to send to.");
  assert.equal(p.text("text-err"), "Write the message to send.");
  assert.equal(p.node.to.getAttribute("aria-invalid"), "true");
  assert.equal(p.node.text.getAttribute("aria-invalid"), "true");
  assert.equal(p.doc.activeElement, p.node.to);
  assert.equal(p.shown("n-box"), true);
  assert.equal(p.calls_to("inbox/compose/").length, 0);
  type(p, "to", "0900 000 0142");
  assert.equal(p.shown("to-err"), false);
  submit(p, "new-form");
  await settle();
  assert.equal(p.doc.activeElement, p.node.text, "focus goes to the first bad field");
  assert.equal(p.shown("to-err"), false);
  assert.equal(p.calls_to("inbox/compose/").length, 0);
});

test("New SMS: a message over 160 characters is flagged in the field, and the counter shows what is left", async () => {
  const p = await newPage();
  type(p, "to", "0900 000 0142");
  type(p, "text", "x".repeat(150));
  assert.equal(p.text("text-count"), "150 / 160 (10 left)");
  type(p, "text", "x".repeat(161));
  assert.equal(p.text("text-count"), "161 / 160 (0 left)");
  submit(p, "new-form");
  await settle();
  assert.equal(p.text("text-err"), "The message is over 160 characters. Shorten it to send.");
  assert.equal(p.node.text.getAttribute("aria-invalid"), "true");
  assert.equal(p.doc.activeElement, p.node.text);
  assert.equal(p.calls_to("inbox/compose/").length, 0);
});

test("New SMS: a number the backend refuses moves focus to the number", async () => {
  const p = await newPage({ "inbox/compose/": () => [400, refusal("invalid_mobile", "x", { to: ["Enter a valid Philippine mobile number."] })] });
  type(p, "to", "0123");
  type(p, "text", "Hi");
  p.doc.activeElement = null;
  submit(p, "new-form");
  await settle();
  assert.equal(p.doc.activeElement, p.node.to);
  assert.equal(p.node.to.getAttribute("aria-invalid"), "true");
});

test("Find: an empty or non-number submit says so, marks the field and calls nothing; typing clears it", async () => {
  const p = inbox({ "inbox/conversations/find/": () => [200, { results: [], next: null }] });
  await settle();
  submit(p, "find-form");
  await settle();
  assert.equal(p.text("l-msg"), "Enter a full mobile number to find.");
  assert.equal(p.node["find-number"].getAttribute("aria-invalid"), "true");
  assert.equal(p.node["find-number"].getAttribute("aria-describedby"), "l-msg");
  assert.equal(p.doc.activeElement, p.node["find-number"]);
  p.node["find-number"].value = "abc";
  submit(p, "find-form");
  await settle();
  assert.match(p.text("l-msg"), /^That is not a mobile number/);
  assert.equal(p.node["find-number"].value, "abc", "what was typed is kept");
  p.node["find-number"].fire("input");
  assert.equal(p.shown("l-msg"), false);
  assert.equal(p.node["find-number"].hasAttribute("aria-invalid"), false);
  assert.equal(p.calls_to("inbox/conversations/find/").length, 0);
});

test("Find: a number the backend refuses shows the same clear message", async () => {
  const p = inbox({ "inbox/conversations/find/": () => [400, refusal("invalid_mobile", "x")] });
  await settle();
  p.node["find-number"].value = "0900";
  submit(p, "find-form");
  await settle();
  assert.match(p.text("l-msg"), /^That is not a mobile number/);
  assert.equal(p.node["find-number"].getAttribute("aria-invalid"), "true");
});

test("without send there is no form, only the read-only card", async () => {
  const p = await newPage({ "inbox/status/": () => [200, status({ send: false })] });
  assert.equal(p.shown("n-cols"), false);
  assert.equal(p.shown("n-readonly"), true);
  assert.equal(p.calls_to("inbox/compose/").length, 0);
});

test("compose: the number goes in the body as typed; on 201 the conversation of the answer is opened and the address is replaced", async () => {
  const sent = [];
  const p = await newPage({
    "inbox/compose/": (b) => { sent.push(b); return [201, { conversation: "conv_n", message: msg({ direction: "out", status: "queued", body: b.text }) }]; },
    ...withOpen({ id: "conv_n", messages: [msg({ direction: "out", status: "queued", author: "sample.staff", body: "Welcome" })] }),
  });
  type(p, "to", "0900 000 0142");
  type(p, "text", "Welcome");
  assert.equal(p.node["new-go"].disabled, false);
  submit(p, "new-form");
  await settle();
  assert.match(sent[0].request_id, /^[0-9a-f]{32}$/);
  assert.deepEqual({ ...sent[0], request_id: "x" }, { platform: "sms", to: "0900 000 0142", text: "Welcome", request_id: "x" });
  assert.equal(p.node.to.value, "");
  assert.equal(p.node.text.value, "");
  assert.deepEqual(p.calls_to("inbox/conversations/open/")[0].body, { platform: "sms", conversation: "conv_n" });
  assert.equal(p.shown("v-conv"), true);
  assert.equal(p.location.pathname, "/inbox/sms/");
  assert.doesNotMatch(JSON.stringify(p.log.map((l) => l.url)), /0900|conv_n/);
  assert.match(p.text("thread"), /Welcome/);
});

test("compose errors: a bad number under the number, a bad text under the message, both with the box heading, text kept", async () => {
  const p = await newPage({ "inbox/compose/": (b) => (b.to === "0900" ? [400, refusal("invalid_mobile", "Enter a valid Philippine mobile number.", { to: ["Enter a valid Philippine mobile number."] })] : [400, refusal("invalid_text", "x", { text: ["The text must not contain a web link."] })]) });
  type(p, "to", "0900");
  type(p, "text", "see example.com");
  submit(p, "new-form");
  await settle();
  assert.equal(p.text("to-err"), "Enter a valid Philippine mobile number.");
  assert.equal(p.node.to.getAttribute("aria-invalid"), "true");
  assert.equal(p.text("n-box-text"), "Fix the field marked below, then send again.");
  assert.equal(p.node.to.value, "0900");
  assert.equal(p.node.text.value, "see example.com");
  type(p, "to", "0900 000 0000");
  submit(p, "new-form");
  await settle();
  assert.equal(p.shown("to-err"), false);
  assert.equal(p.node.to.hasAttribute("aria-invalid"), false);
  assert.equal(p.text("text-err"), "The text must not contain a web link.");
});

test("editing a field clears its own error, and the box goes with the last one", async () => {
  const p = await newPage({ "inbox/compose/": () => [400, refusal("invalid_mobile", "x", { to: ["Enter a valid Philippine mobile number."] })] });
  type(p, "to", "0123");
  type(p, "text", "Hi");
  submit(p, "new-form");
  await settle();
  assert.equal(p.shown("to-err"), true);
  assert.equal(p.shown("n-box"), true);
  type(p, "to", "0900 000 0098");
  assert.equal(p.shown("to-err"), false);
  assert.equal(p.shown("n-box"), false);
  assert.equal(p.node.to.hasAttribute("aria-invalid"), false);
});

test("compose keeps its request id after no answer and replaces it after a 201", async () => {
  const ids = [];
  const answers = ["offline", [201, { conversation: "conv_n", message: msg() }], [201, { conversation: "conv_n", message: msg() }]];
  const p = await newPage({ "inbox/compose/": (b) => { ids.push(b.request_id); return answers.shift(); }, ...withOpen() });
  type(p, "to", "0900 000 0142");
  type(p, "text", "Hi");
  submit(p, "new-form");
  await settle();
  assert.equal(p.text("n-box-text"), "We could not tell whether it was sent. Look at the conversation before you send again.");
  assert.equal(p.node.to.value, "0900 000 0142");
  submit(p, "new-form");
  await settle();
  assert.equal(ids[0], ids[1]);
});

/* ---- auto-refresh by polling (z8uq9mgtf8) ---- */

const LISTR = "inbox/conversations/list/", OPENR = "inbox/conversations/open/";
async function polling(routes = {}) {
  const clock = makeClock(), p = inbox(routes, { clock });
  await settle();
  return { p, clock };
}
const listing = (rows, next = null) => ({ [LISTR]: () => [200, { results: rows, next }] });
async function openFirstRow(p) { p.node.rows.children[0].all((x) => x.tagName === "BUTTON")[0].fire("click"); await settle(); }

test("poll: the open conversation is read every 5 s, the list every 15 s, and only on its own view", async () => {
  const { p, clock } = await polling({ ...listing([conv()]), ...withOpen() });
  const l0 = p.calls_to(LISTR).length;
  await clock.advance(14999);
  assert.equal(p.calls_to(LISTR).length, l0);
  await clock.advance(1);
  assert.equal(p.calls_to(LISTR).length, l0 + 1, "the list at 15 s");
  assert.equal(p.calls_to(OPENR).length, 0, "no conversation read on the list view");
  await openFirstRow(p);
  const o0 = p.calls_to(OPENR).length, l1 = p.calls_to(LISTR).length;
  await clock.advance(4999);
  assert.equal(p.calls_to(OPENR).length, o0);
  await clock.advance(1);
  assert.equal(p.calls_to(OPENR).length, o0 + 1, "the thread at 5 s");
  await clock.advance(10000);
  assert.equal(p.calls_to(OPENR).length, o0 + 3);
  assert.equal(p.calls_to(LISTR).length, l1, "no list read on the conversation view");
});

test("poll: a new text shows without Refresh; the reply text, the focus and the bottom scroll survive", async () => {
  let messages = [msg({ id: "m1" })];
  const { p, clock } = await polling({ ...listing([conv()]), [OPENR]: () => [200, { ...OPEN, messages }] });
  await openFirstRow(p);
  type(p, "reply-text", "Typing a reply");
  p.node["reply-text"].focus();
  const was = p.node.thread.children.length;
  messages = [msg({ id: "m1" }), msg({ id: "m2", body: "Are you open today?" })];
  p.window.scrollTo = (x, y) => { p.scrolled = y; };
  p.doc.documentElement = { scrollHeight: 1000 };
  p.window.scrollY = 600; p.window.innerHeight = 400;
  await clock.advance(5000);
  assert.equal(p.node.thread.children.length, was + 1);
  assert.match(p.node.thread.textContent, /Are you open today\?/);
  assert.equal(p.node["reply-text"].value, "Typing a reply");
  assert.equal(p.doc.activeElement, p.node["reply-text"]);
  assert.equal(p.scrolled, 1000, "at the bottom: stays at the bottom");
  messages = [...messages, msg({ id: "m3", body: "Hello again" })];
  p.window.scrollY = 100; p.scrolled = null;
  await clock.advance(5000);
  assert.match(p.node.thread.textContent, /Hello again/);
  assert.equal(p.scrolled, 100, "not at the bottom: the place is kept");
  assert.equal(p.shown("c-msg"), false, "no banner");
});

test("poll: earlier texts already loaded are kept when the newest page is read again", async () => {
  let newest = [msg({ id: "m5" }), msg({ id: "m6" })];
  const { p, clock } = await polling({ ...listing([conv()]),
    [OPENR]: (body) => [200, { ...OPEN, messages: body.cursor ? [msg({ id: "m1" }), msg({ id: "m2" })] : newest, next: body.cursor ? null : "m5" }] });
  await openFirstRow(p);
  p.node.earlier.fire("click");
  await settle();
  assert.equal(p.node.thread.children.filter((x) => x.classList.contains("msg")).length, 4);
  newest = [msg({ id: "m5" }), msg({ id: "m6" }), msg({ id: "m7" })];
  await clock.advance(5000);
  assert.equal(p.node.thread.children.filter((x) => x.classList.contains("msg")).length, 5);
  assert.equal(p.shown("earlier-row"), false, "the cursor of the older pages is kept");
});

test("poll: an unchanged answer redraws nothing", async () => {
  const { p, clock } = await polling({ ...listing([conv()]), ...withOpen({ messages: [msg()] }) });
  await openFirstRow(p);
  const first = p.node.thread.children[1];
  await clock.advance(5000);
  assert.equal(p.node.thread.children[1], first, "the same nodes");
});

test("poll: the list redraws on a change, keeps the focused row and the Show more page", async () => {
  let rows = [conv({ id: "conv_a" }), conv({ id: "conv_b", contact: "+63 900 ••• 0222" })];
  const { p, clock } = await polling({ [LISTR]: (body) => [200, body.cursor ? { results: [conv({ id: "conv_z", contact: "+63 900 ••• 0999" })], next: null } : { results: rows, next: "c2" }] });
  p.node.more.fire("click");
  await settle();
  assert.equal(rowsOf(p).length, 3);
  buttonsIn(rowsOf(p)[1])[0].focus();
  rows = [conv({ id: "conv_c", contact: "+63 900 ••• 0333", unread: 1 }), ...rows];
  await clock.advance(15000);
  assert.equal(rowsOf(p).length, 4, "the new row in front, the older page kept");
  assert.match(rowsOf(p)[0].textContent, /0333/);
  assert.match(rowsOf(p)[0].textContent, /1 unread/);
  assert.equal(p.doc.activeElement, buttonsIn(rowsOf(p)[2])[0], "focus stays on the same conversation");
  assert.equal(p.shown("more"), false, "the loaded page's end is kept");
});

test("poll: a hidden tab reads nothing; coming back (visibility or focus) reads at once", async () => {
  const { p, clock } = await polling({ ...listing([conv()]) });
  p.doc.hidden = true;
  p.doc.fire("visibilitychange");
  assert.equal(clock.pending(), 0, "no timer left");
  const n = p.log.length;
  await clock.advance(120000);
  assert.equal(p.log.length, n, "no request while hidden");
  p.doc.hidden = false;
  p.doc.fire("visibilitychange");
  await settle();
  assert.equal(p.log.length, n + 2, "the list and the status at once");
  p.doc.hidden = true; p.doc.fire("visibilitychange");
  p.doc.hidden = false; p.heard.focus();
  await settle();
  assert.equal(p.log.length, n + 4);
});

test("poll: errors double the wait (list 15, 30, 60 s) with no banner, and a success resets it", async () => {
  let fail = false;
  const { p, clock } = await polling({ [LISTR]: () => (fail ? [500, {}] : [200, { results: [], next: null }]), ...withOpen() });
  fail = true;
  const l0 = p.calls_to(LISTR).length;
  await clock.advance(15000);
  assert.equal(p.calls_to(LISTR).length, l0 + 1);
  await clock.advance(29999);
  assert.equal(p.calls_to(LISTR).length, l0 + 1);
  await clock.advance(1);
  assert.equal(p.calls_to(LISTR).length, l0 + 2, "30 s later");
  await clock.advance(60000);
  assert.equal(p.calls_to(LISTR).length, l0 + 3, "60 s later");
  await clock.advance(60000);
  assert.equal(p.calls_to(LISTR).length, l0 + 4, "never longer than 60 s");
  assert.equal(p.shown("l-msg"), false);
  fail = false;
  await clock.advance(60000);
  await clock.advance(15000);
  assert.equal(p.calls_to(LISTR).length, l0 + 6, "back to 15 s after a success");
});

test("poll: a conversation read that fails backs off silently", async () => {
  let fail = false;
  const { p, clock } = await polling({ ...listing([conv()]), [OPENR]: () => (fail ? [500, {}] : [200, { ...OPEN }]) });
  await openFirstRow(p);
  fail = true;
  const o0 = p.calls_to(OPENR).length;
  await clock.advance(5000);
  await clock.advance(9999);
  assert.equal(p.calls_to(OPENR).length, o0 + 1);
  await clock.advance(1);
  assert.equal(p.calls_to(OPENR).length, o0 + 2, "10 s after the first failure");
  assert.equal(p.shown("c-msg"), false);
});

test("poll: none on the New SMS view", async () => {
  const clock = makeClock(), p = inbox({}, { clock, pathname: "/inbox/sms/new/" });
  await settle();
  assert.equal(p.shown("v-new"), true);
  const n = p.log.length;
  await clock.advance(60000);
  assert.equal(p.log.length, n);
});

/* ---- rules ---- */

test("no interval, no storage, no console, no other host, no inline handler, no push stream in inbox.js", () => {
  assert.doesNotMatch(src, /setInterval|EventSource|requestAnimationFrame|localStorage|sessionStorage|document\.cookie|console\./);
  assert.doesNotMatch(src, /https?:\/\//);
});

test("an address is never built from a value: history gets the page's own address or the one constant; location only the two sign-in pages", () => {
  const push = [...src.matchAll(/history\.(pushState|replaceState)\(([^)]*)\)/g)].map((m) => m[2]);
  assert.deepEqual(push, ['null, "", location.pathname', 'null, "", "/inbox/sms/"']);
  const where = [...src.matchAll(/location\.(replace|assign|href)\b[^;]*/g)].map((m) => m[0]);
  for (const w of where) assert.match(w, /replace\("\/(verify|sign-in)\/"\)/);
});
