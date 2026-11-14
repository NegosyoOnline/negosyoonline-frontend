/* The phone navigation (under 900 px the side menu is not shown): the avatar in the top bar opens a sheet that
   holds the same entries as the side menu (menu.js keeps both from one list), the signed-in name and Sign out
   (shell.js). Every signed-in page carries the same markup. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE } from "./page.mjs";
import { status } from "./inbox-page.mjs";

const PUB = new URL("../public/", import.meta.url).pathname;
const SIGNED_IN = ["index.html", "finance.html", "finance-invoices.html", "finance-reconcile.html", "inbox.html", "inbox-platform.html", "contacts.html", "bulk.html"];

test("every signed-in page has the avatar button, the sheet, its list, its name and its Sign out; the sign-in pages have none", () => {
  for (const f of SIGNED_IN) {
    const html = fs.readFileSync(PUB + f, "utf8");
    assert.match(html, /<button type="button" class="acct-btn" id="acct-btn"[^>]*aria-haspopup="true"[^>]*aria-expanded="false"[^>]*aria-controls="nav-sheet"[^>]*hidden>/, f);
    for (const id of ["nav-sheet", "sheet-nav", "sheet-name", "sheet-email", "sheet-out"]) assert.match(html, new RegExp(`id="${id}"`), f + " " + id);
    assert.match(html, /id="nav-sheet"[^>]*hidden/, f);
    assert.ok(html.indexOf('id="nav-sheet"') > html.indexOf('class="topbar'), f + ": the sheet is inside the top bar");
  }
  for (const f of ["auth.html", "not-found.html"]) assert.doesNotMatch(fs.readFileSync(PUB + f, "utf8"), /nav-sheet/, f);
});

test("the sheet is shown at phone width only, and its links and button follow the shared look and focus rule", () => {
  const css = fs.readFileSync(PUB + "assets/css/hq.css", "utf8");
  assert.match(css, /\.nav-sheet \{[^}]*position: absolute;/);
  assert.match(css, /\.side-nav a, \.sheet-nav a|\.sheet-nav a/);
  assert.doesNotMatch(css, /\.nav-sheet[^{]*:focus[^{]*\{[^}]*(gold|#C59A3B|#F2D99B)/i);
  /* the top bar, and with it the sheet, is hidden from 900 px up by the existing rule */
  assert.match(css, /\.side, \.topbar, \.tabs, \.desk-switch \{ display: none; \}/);
});

const IDS = ["side-nav", "sheet-nav"];
const menu = async (pathname, { inbox = true, contacts = true } = {}) => {
  const p = open(["hq.js", "menu.js"], { ids: IDS, pathname, answers: (c) => (c.url.endsWith("/inbox/status/") ? (inbox ? [200, status({ unread: 4 })] : [404]) : (contacts ? [200, { read: true, change: true }] : [404])) });
  await settle();
  return p;
};
const rows = (nav) => nav.children.map((a) => [a.getAttribute("href"), a.textContent, a.hasAttribute("aria-current")]);

test("the sheet holds the same entries as the side menu, in the same order, with the unread number, and marks the current page", async () => {
  const p = await menu("/inbox/sms/");
  assert.deepEqual(rows(p.node["sheet-nav"]), rows(p.node["side-nav"]));
  assert.deepEqual(rows(p.node["sheet-nav"]).map((r) => r[0]), ["/", "/finance/", "/lifecycle/", "/inbox/sms/", "/contacts/", "/settings/"]);
  assert.equal(p.node["sheet-nav"].children[3].hasAttribute("aria-current"), true);
  assert.equal(p.node["sheet-nav"].children[3].children.find((n) => n.classList.contains("count")).textContent, "4");
  assert.equal(p.node["sheet-nav"].children[0].children[0].tagName, "SVG");
});

test("a gated entry that is not allowed is in neither list", async () => {
  const p = await menu("/", { inbox: false, contacts: false });
  assert.deepEqual(rows(p.node["sheet-nav"]).map((r) => r[0]), ["/", "/finance/", "/lifecycle/", "/settings/"]);
  assert.deepEqual(rows(p.node["side-nav"]), rows(p.node["sheet-nav"]));
});

test("the unread number in the sheet follows setUnread, like the side menu's", async () => {
  const p = await menu("/inbox/sms/");
  p.window.NOHqMenu.setUnread(0);
  for (const nav of IDS) assert.equal(p.node[nav].children[3].children.find((n) => n.classList.contains("count")).hidden, true, nav);
});

test("a page with no sheet draws the side menu as before", () => {
  const p = open(["menu.js"], { ids: ["side-nav"], pathname: "/" });
  assert.equal(p.node["side-nav"].children.length, 4);
});

const SHELL = ["acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "nav-sheet", "sheet-nav", "sheet-name", "sheet-email", "sheet-out", "sign-out-err"];
const shell = (reply = [204]) => open(["hq.js", "shell.js"], { ids: SHELL, pathname: "/finance/", answers: (c) => { assert.equal(c.method + " " + c.url, "POST " + BASE + "/sign-out/"); return reply; } });

test("the avatar opens the sheet and closes it; its name and email are the signed-in person's", () => {
  const p = shell();
  const btn = p.node["acct-btn"], sheet = p.node["nav-sheet"];
  const link = p.doc.createElement("a"); p.node["sheet-nav"].appendChild(link);
  p.window.NOHqShell.signedIn("ana@example.com");
  assert.equal(p.node["sheet-name"].textContent, "ana");
  assert.equal(p.node["sheet-email"].textContent, "ana@example.com");
  assert.equal(sheet.hidden, true);
  btn.fire("click");
  assert.equal(sheet.hidden, false);
  assert.equal(btn.getAttribute("aria-expanded"), "true");
  assert.equal(p.doc.activeElement, link, "focus goes to the first entry");
  btn.fire("click");
  assert.equal(sheet.hidden, true);
  assert.equal(btn.getAttribute("aria-expanded"), "false");
});

test("Escape closes the sheet and returns focus to the avatar; a click outside closes it; a click inside does not", () => {
  const p = shell();
  const btn = p.node["acct-btn"], sheet = p.node["nav-sheet"];
  sheet.appendChild(p.node["sheet-out"]);
  p.window.NOHqShell.signedIn("ana@example.com");
  btn.fire("click");
  p.doc.fire("keydown", { key: "a" });
  assert.equal(sheet.hidden, false);
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(sheet.hidden, true);
  assert.equal(p.doc.activeElement, btn);
  btn.fire("click");
  p.doc.fire("click", { target: p.node["sheet-out"] });
  assert.equal(sheet.hidden, false, "inside");
  p.doc.fire("click", { target: btn });
  assert.equal(sheet.hidden, false, "the avatar's own click");
  p.doc.fire("click", { target: p.node["sign-out-err"] });
  assert.equal(sheet.hidden, true);
  assert.deepEqual([p.doc.listeners.keydown.length, p.doc.listeners.click.length], [0, 0]);
});

test("Sign out in the sheet signs out like the others", async () => {
  const p = shell([204]);
  p.node["sheet-out"].fire("click");
  await settle();
  assert.equal(p.calls.length, 1);
  assert.equal(p.location.assigned, "/sign-in/");
  const q = shell([500]);
  q.node["sheet-out"].fire("click");
  await settle();
  assert.equal(q.node["sign-out-err"].hidden, false);
});
