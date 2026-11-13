/* The Contacts entry of the side menu (plan 7, 5.2 and 5.3): drawn only after contacts/status/ answers 200,
   after Inbox when there is one, current for every /contacts/ path; and the addresses of the Contacts pages. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE } from "./page.mjs";

const run = async (pathname, reply, { withClient = true } = {}) => {
  const files = withClient ? ["hq.js", "menu.js"] : ["menu.js"];
  const p = open(files, { ids: ["side-nav"], pathname, answers: (c) => (c.url.endsWith("/inbox/status/") ? [404] : reply) });
  await settle();
  return { ...p, nav: p.node["side-nav"], labels: () => p.node["side-nav"].children.map((a) => a.textContent) };
};

test("with contacts/status/ answering 200 the menu has Contacts after Finance, and the status call is one POST with nothing in the address", async () => {
  const p = await run("/", [200, { read: true, change: false }]);
  assert.deepEqual(p.labels(), ["Admin console", "Finance", "Contacts", "Settings"]);
  assert.equal(p.nav.children[2].getAttribute("href"), "/contacts/");
  assert.deepEqual(p.calls.filter((c) => c.url.endsWith("/contacts/status/")).map((c) => [c.method, c.url, c.body]), [["POST", BASE + "/contacts/status/", undefined]]);
});

test("every path that starts /contacts/ marks Contacts current, and no other entry", async () => {
  for (const path of ["/contacts/", "/contacts/new/", "/contacts/groups/", "/contacts/upload/"]) {
    const p = await run(path, [200, { read: true, change: true }]);
    assert.equal(p.nav.children[2].getAttribute("aria-current"), "page", path);
    assert.equal(p.nav.children[0].hasAttribute("aria-current"), false, path);
    assert.equal(p.nav.children[1].hasAttribute("aria-current"), false, path);
  }
  const home = await run("/", [200, { read: true, change: true }]);
  assert.equal(home.nav.children[2].hasAttribute("aria-current"), false);
});

test("with 404, 401, 503, an unreadable answer, offline or no client there is no Contacts entry and no error", async () => {
  for (const reply of [[404], [401, { error: { code: "unauthenticated", message: "x" } }], [503], [200, undefined], "offline"]) {
    if (reply[0] === 200) continue; /* a 200 is the only yes; its body is not read */
    const p = await run("/contacts/", reply);
    assert.deepEqual(p.labels(), ["Admin console", "Finance", "Settings"], String(reply[0] || reply));
    assert.equal(p.nav.hidden, false);
  }
  const bare = await run("/contacts/", [200, {}], { withClient: false });
  assert.deepEqual(bare.labels(), ["Admin console", "Finance", "Settings"]);
  assert.equal(bare.calls.length, 0);
});

test("the status call is made once per page load, after the plain entries are drawn", async () => {
  const p = open(["hq.js", "menu.js"], { ids: ["side-nav"], pathname: "/", answers: (c) => (c.url.endsWith("/inbox/status/") ? [404] : [200, {}]) });
  assert.deepEqual(p.node["side-nav"].children.map((a) => a.textContent), ["Admin console", "Finance", "Settings"]);
  await settle();
  assert.equal(p.calls.filter((c) => c.url.endsWith("/contacts/status/")).length, 1);
});

test("with Inbox and Contacts both answering 200, Inbox comes first", async () => {
  {
    const p = open(["hq.js", "menu.js"], { ids: ["side-nav", "search-btn", "search-btn-2", "bell-btn", "bell-btn-2"], pathname: "/",
      answers: (c) => (c.url.endsWith("/inbox/status/") ? [200, { unread: 0, change: false, read: true }] : [200, { read: true, change: false }]) });
    await settle();
    assert.deepEqual(p.node["side-nav"].children.map((a) => a.getAttribute("href")), ["/", "/finance/", "/inbox/sms/", "/contacts/", "/settings/"]);
  }
});

test("next.config.ts serves the four Contacts addresses from one file and sends /contacts.html back to /contacts/", () => {
  const cfg = fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  for (const a of ["/contacts/", "/contacts/new/", "/contacts/groups/", "/contacts/upload/"]) assert.ok(cfg.includes(`"${a}"`), a);
  assert.match(cfg, /destination: "\/contacts\.html"/);
  assert.match(cfg, /source: "\/contacts\.html", destination: "\/contacts\/"/);
  /* no rewrite holds a parameter: no value or id is in any Contacts address */
  assert.doesNotMatch(cfg, /contacts[^"\n]*:[a-z]/i);
});
