/* menu.js: the side menu of every signed-in page, from one list. A later page adds one line to that list
   and nothing else. It holds no entry for the Django Admin (R27). */
import test from "node:test";
import assert from "node:assert/strict";
import { open } from "./page.mjs";

const menu = (pathname) => open(["menu.js"], { ids: ["side-nav"], pathname }).node["side-nav"];

test("the menu holds Admin console, Finance, Training, then Settings, with the current page marked", () => {
  const nav = menu("/");
  assert.equal(nav.hidden, false);
  assert.deepEqual(nav.children.map((a) => [a.tagName, a.getAttribute("href"), a.textContent]), [["A", "/", "Admin console"], ["A", "/finance/", "Finance"], ["A", "/training/", "Training"], ["A", "/settings/", "Settings"]]);
  assert.equal(nav.children[0].getAttribute("aria-current"), "page");
  assert.equal(nav.children[1].hasAttribute("aria-current"), false);
  const finance = menu("/finance/");
  assert.equal(finance.children[1].getAttribute("aria-current"), "page");
  assert.equal(finance.children[0].hasAttribute("aria-current"), false);
});

test("on another page no entry is marked current", () => {
  const nav = menu("/somewhere-else/");
  assert.equal(nav.children.length, 4);
  for (const a of nav.children) assert.equal(a.hasAttribute("aria-current"), false);
});

test("each entry has an icon that a screen reader skips", () => {
  const icon = menu("/").children[0].children[0];
  assert.equal(icon.tagName, "SVG");
  assert.equal(icon.getAttribute("aria-hidden"), "true");
  assert.equal(icon.children[0].tagName, "PATH");
});

test("Finance is the current entry for every /finance/ address, and only for those", () => {
  for (const at of ["/finance/", "/finance/usage/", "/finance/issuer/", "/finance/invoices/", "/finance/invoices/reconcile/"]) {
    const nav = menu(at);
    assert.equal(nav.children[1].getAttribute("aria-current"), "page", at);
    assert.equal(nav.children[0].hasAttribute("aria-current"), false, at);
  }
  for (const at of ["/financex/", "/", "/inbox/sms/"]) assert.equal(menu(at).children[1].hasAttribute("aria-current"), false, at);
});

test("Settings is the last entry, current only on /settings/", () => {
  const nav = menu("/settings/");
  assert.equal(nav.children[3].getAttribute("href"), "/settings/");
  assert.equal(nav.children[3].getAttribute("aria-current"), "page");
  assert.equal(nav.children[1].hasAttribute("aria-current"), false);
  assert.equal(menu("/").children[3].hasAttribute("aria-current"), false);
});

test("Training is the current entry for every /training/ address, and only for those", () => {
  for (const at of ["/training/", "/training/course/", "/training/live/"]) {
    const nav = menu(at);
    assert.equal(nav.children[2].getAttribute("href"), "/training/", at);
    assert.equal(nav.children[2].getAttribute("aria-current"), "page", at);
    assert.equal(nav.children[1].hasAttribute("aria-current"), false, at);
  }
  for (const at of ["/trainingx/", "/", "/finance/"]) assert.equal(menu(at).children[2].hasAttribute("aria-current"), false, at);
});
