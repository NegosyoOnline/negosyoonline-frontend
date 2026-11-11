/* inbox-platform.js: the five platforms that are not built show one card, only to a staff member who can open
   the Inbox. The page calls me/ and inbox/status/ and nothing else. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { inbox, settle, refusal } from "./inbox-page.mjs";

const NAMES = { messenger: "Facebook Messenger", instagram: "Instagram", tiktok: "TikTok", email: "Email", webchat: "Web chat" };
const page = (slug, routes = {}) => inbox(routes, { file: "inbox-platform.html", pathname: `/inbox/${slug}/`, scripts: ["hq.js", "shell.js", "inbox-platform.js"] });

test("each of the five names shows its card and the fixed sentence", async () => {
  for (const [slug, name] of Object.entries(NAMES)) {
    const p = page(slug);
    await settle();
    assert.equal(p.shown("v-platform"), true, slug);
    assert.equal(p.text("p-title"), `${name} is not yet available`);
    assert.equal(p.text("p-h1"), `Inbox: ${name}`);
    assert.equal(p.shown("tabs"), true);
    assert.equal(p.shown("boot"), false);
  }
});

test("an unknown name is not shown", async () => {
  const p = page("fax");
  await settle();
  assert.equal(p.shown("v-platform"), false);
  assert.equal(p.log.length, 0);
});

test("with inbox/status/ answering 404 the closed card shows and no platform card", async () => {
  const p = page("email", { "inbox/status/": () => [404, refusal("not_found")] });
  await settle();
  assert.equal(p.shown("v-closed"), true);
  assert.equal(p.shown("v-platform"), false);
});

test("the page makes no call but me/ and inbox/status/", async () => {
  const p = page("tiktok");
  await settle();
  assert.deepEqual(p.log.map((l) => l.route), ["me/", "inbox/status/"]);
  assert.deepEqual(p.log[1].body, { platform: "sms" });
});

test("a 401 follows the sign-in rule; offline shows the try-again card", async () => {
  const a = page("email", { "me/": () => [401, refusal("unauthenticated")] });
  await settle();
  assert.equal(a.location.replaced, "/sign-in/");
  const b = page("email", { "inbox/status/": () => "offline" });
  await settle();
  assert.equal(b.shown("v-down"), true);
});

test("the Go to SMS link is /inbox/sms/ and the menu links the five platforms by path", () => {
  const html = fs.readFileSync(new URL("../public/inbox-platform.html", import.meta.url), "utf8");
  assert.match(html, /<a class="no-btn no-btn-ghost" href="\/inbox\/sms\/">Go to SMS<\/a>/);
  for (const slug of Object.keys(NAMES)) assert.match(html, new RegExp(`href="/inbox/${slug}/" data-p="${slug}"`));
});
