/* menu.js: the side menu of every signed-in page, from one list. A later page adds one line to that list
   and nothing else. It holds no entry for the Django Admin (R27). */
import test from "node:test";
import assert from "node:assert/strict";
import { open } from "./page.mjs";

const menu = (pathname) => open(["menu.js"], { ids: ["side-nav"], pathname }).node["side-nav"];

test("the menu holds Admin console only, marked as the current page on /", () => {
  const nav = menu("/");
  assert.equal(nav.hidden, false);
  assert.deepEqual(nav.children.map((a) => [a.tagName, a.getAttribute("href"), a.textContent]), [["A", "/", "Admin console"]]);
  assert.equal(nav.children[0].getAttribute("aria-current"), "page");
});

test("on another page no entry is marked current", () => {
  const nav = menu("/somewhere-else/");
  assert.equal(nav.children.length, 1);
  assert.equal(nav.children[0].hasAttribute("aria-current"), false);
});

test("each entry has an icon that a screen reader skips", () => {
  const icon = menu("/").children[0].children[0];
  assert.equal(icon.tagName, "SVG");
  assert.equal(icon.getAttribute("aria-hidden"), "true");
  assert.equal(icon.children[0].tagName, "PATH");
});
