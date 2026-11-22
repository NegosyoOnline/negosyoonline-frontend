/* menu.js and the top buttons with the Inbox: the Inbox entry is drawn only when inbox/status/ answers 200, and
   then search and bell wake up. On any other answer nothing is drawn and the buttons stay as shipped. */
import test from "node:test";
import assert from "node:assert/strict";
import { open, settle } from "./page.mjs";
import { status, refusal } from "./inbox-page.mjs";

const IDS = ["side-nav", "search-btn", "search-btn-2", "bell-btn", "bell-btn-2"];
function menu(reply, { pathname = "/", noClient = false } = {}) {
  const p = open(noClient ? ["menu.js"] : ["hq.js", "menu.js"], { ids: IDS, pathname, answers: (c) => (c.url.endsWith("/contacts/status/") || c.url.endsWith("/subscribers/list/") ? [404] : reply(c)) }); /* Contacts says no here: its own tests are in contacts-menu.test.mjs */
  for (const id of IDS.slice(1)) p.node[id].setAttribute("aria-disabled", "true");
  return p;
}
const names = (p) => p.node["side-nav"].children.map((a) => a.textContent);
const inert = (p) => IDS.slice(1).every((id) => p.node[id].getAttribute("aria-disabled") === "true" && !p.node[id].listeners.click);

test("with a 200 the Inbox entry follows Finance, with the unread number", async () => {
  const p = menu(() => [200, status({ unread: 3 })]);
  await settle();
  assert.deepEqual(names(p), ["Admin console", "Finance", "Lifecycle", "Domains", "Inbox3", "Settings"]);
  const a = p.node["side-nav"].children[4];
  assert.equal(a.getAttribute("href"), "/inbox/sms/");
  const pill = a.children.find((n) => n.classList.contains("count"));
  assert.equal(pill.textContent, "3");
  assert.equal(pill.hidden, false);
});

test("the count is hidden at 0, and every /inbox/ path marks the entry current", async () => {
  const p = menu(() => [200, status({ unread: 0 })], { pathname: "/inbox/sms/new/" });
  await settle();
  const a = p.node["side-nav"].children[4];
  assert.equal(a.children.find((n) => n.classList.contains("count")).hidden, true);
  assert.equal(a.getAttribute("aria-current"), "page");
  assert.equal(p.node["side-nav"].children[0].hasAttribute("aria-current"), false);
  const q = menu(() => [200, status()], { pathname: "/inbox/messenger/" });
  await settle();
  assert.equal(q.node["side-nav"].children[4].getAttribute("aria-current"), "page");
});

test("with a 200, search and bell wake up, are labelled, and go to the Find field and the list", async () => {
  const p = menu(() => [200, status({ unread: 2 })]);
  await settle();
  for (const id of ["search-btn", "search-btn-2"]) {
    const b = p.node[id];
    assert.equal(b.hasAttribute("aria-disabled"), false);
    assert.equal(b.getAttribute("aria-label"), "Find a conversation by full number");
    assert.equal(b.getAttribute("title"), "Find a conversation by full number");
    b.fire("click");
    assert.equal(p.location.assigned, "/inbox/sms/#find");
  }
  for (const id of ["bell-btn", "bell-btn-2"]) {
    const b = p.node[id];
    assert.equal(b.hasAttribute("aria-disabled"), false);
    assert.equal(b.getAttribute("aria-label"), "Inbox, 2 unread");
    b.fire("click");
    assert.equal(p.location.assigned, "/inbox/sms/");
  }
});

test("the bell dot shows only while there are unread conversations, and follows setUnread", async () => {
  const dot = (p, id) => p.node[id].children.find((n) => n.classList.contains("bell-dot"));
  const p = menu(() => [200, status({ unread: 1 })]);
  await settle();
  assert.equal(dot(p, "bell-btn").hidden, false);
  p.window.NOHqMenu.setUnread(0);
  assert.equal(dot(p, "bell-btn").hidden, true);
  assert.equal(p.node["bell-btn"].getAttribute("aria-label"), "Inbox, no unread texts");
  const q = menu(() => [200, status({ unread: 0 })]);
  await settle();
  assert.equal(dot(q, "bell-btn").hidden, true);
  assert.equal(q.node["side-nav"].children[4].children.find((n) => n.classList.contains("count")).hidden, true);
});

test("on 404, 401, 503, offline, or with no client, no Inbox entry, both buttons inert, and nothing thrown", async () => {
  for (const reply of [() => [404, refusal("not_found")], () => [401, refusal("unauthenticated")], () => [503, {}], () => "offline"]) {
    const p = menu(reply);
    await settle();
    assert.deepEqual(names(p), ["Admin console", "Finance", "Lifecycle", "Domains", "Settings"]);
    assert.equal(inert(p), true);
  }
  const none = menu(() => { throw new Error("no call expected"); }, { noClient: true });
  assert.deepEqual(names(none), ["Admin console", "Finance", "Lifecycle", "Domains", "Settings"]);
  assert.equal(inert(none), true);
});

test("the one call is POST inbox/status/ with the platform in its body and nothing in the address", async () => {
  const p = menu(() => [200, status()]);
  await settle();
  const mine = p.calls.filter((c) => c.url.endsWith("/inbox/status/"));
  assert.equal(mine.length, 1);
  assert.equal(mine[0].method, "POST");
  assert.equal(mine[0].url, "http://hq-api.test/staff/v1/inbox/status/");
  assert.deepEqual(mine[0].body, { platform: "sms" });
});

test("a page with no side menu makes no call", async () => {
  const p = open(["hq.js", "menu.js"], { ids: [], answers: () => { throw new Error("no call expected"); } });
  await settle();
  assert.deepEqual(p.calls, []);
});
