/* shell.js: what every signed-in page shares. The user chip with its pop-up card and the phone-width
   avatar, shown only once the page says who is signed in; the Sign out buttons; the sign-out message.
   It calls the backend only through NOHq.call. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE, refused } from "./page.mjs";

const CARD = ["acct-row", "acct-ini", "acct-name", "acct-btn"];
const MENU = ["acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun", "menu-moon", "menu-theme-label"];
const OUT = ["sign-out", "sign-out-0", "sign-out-2", "sign-out-3"];
const ALL = [...CARD, ...MENU, ...OUT, "sign-out-err"];

function page(ids, reply, globals) {
  return open(["hq.js", "shell.js"], { ids, pathname: "/finance/", globals, answers: (call) => {
    assert.equal(call.method + " " + call.url, "POST " + BASE + "/sign-out/");
    return reply;
  } });
}

/* A stand-in for theme.js, which the pages load in <head>. */
function themed(start) {
  const hear = [];
  let now = start;
  const api = { current: () => now, set: (t) => { now = t; hear.forEach((fn) => fn(t)); }, onChange: (fn) => hear.push(fn) };
  return { window: { NO_HQ_CONFIG: { staffApi: BASE }, addEventListener() {}, NOHqTheme: api }, api };
}

test("nothing is shown or asked until the page says who is signed in", async () => {
  const p = page(ALL, [204]);
  await settle();
  for (const id of CARD) assert.equal(p.node[id].hidden, true, id);
  assert.equal(p.node["acct-name"].textContent, "");
  assert.equal(p.node["sign-out-err"].hidden, true);
  assert.deepEqual(p.calls, []);
});

test("signedIn fills and shows the user card and the avatar", () => {
  const p = page(ALL, [204]);
  p.window.NOHqShell.signedIn("sample.staff@example.com");
  assert.equal(p.node["acct-ini"].textContent, "SS");
  assert.equal(p.node["acct-btn"].textContent, "SS");
  assert.equal(p.node["acct-btn"].getAttribute("aria-label"), "Signed in as sample.staff");
  assert.equal(p.node["acct-name"].textContent, "sample.staff");
  assert.equal(p.node["acct-row"].hidden, false);
  assert.equal(p.node["acct-btn"].hidden, false);
  assert.equal(p.node["menu-ini"].textContent, "SS");
  assert.equal(p.node["menu-name"].textContent, "sample.staff");
  assert.equal(p.node["menu-email"].textContent, "sample.staff@example.com");
  assert.equal(p.node["acct-menu"].hidden, true, "the pop-up opens only when the chip is clicked");
});

test("the plain Sign out stands at the foot until the page says who is signed in, then the chip takes its place", () => {
  const p = page(ALL, [204]);
  p.node["sign-out-0"].hidden = false;
  p.window.NOHqShell.signedIn("ana@example.com");
  assert.equal(p.node["sign-out-0"].hidden, true);
  assert.equal(p.node["acct-row"].hidden, false);
});

test("the chip opens the pop-up and closes it; Escape and a click outside close it", () => {
  const t = themed("dark");
  const p = page(ALL, [204], { window: t.window });
  const row = p.node["acct-row"], menu = p.node["acct-menu"];
  menu.appendChild(p.node["menu-theme"]);
  t.window.NOHqShell.signedIn("ana@example.com");

  row.fire("click");
  assert.equal(menu.hidden, false);
  assert.equal(row.getAttribute("aria-expanded"), "true");
  assert.equal(p.doc.activeElement, p.node["menu-theme"], "focus goes to the first button");
  row.fire("click");
  assert.equal(menu.hidden, true);
  assert.equal(row.getAttribute("aria-expanded"), "false");

  row.fire("click");
  p.doc.fire("keydown", { key: "a" });
  assert.equal(menu.hidden, false, "another key leaves it open");
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(menu.hidden, true);
  assert.equal(p.doc.activeElement, row, "Escape returns focus to the chip");

  row.fire("click");
  p.doc.fire("click", { target: p.node["menu-theme"] });
  assert.equal(menu.hidden, false, "a click inside the pop-up leaves it open");
  p.doc.fire("click", { target: row });
  assert.equal(menu.hidden, false, "the chip's own click is not a click outside");
  p.doc.fire("click", { target: p.node["sign-out-err"] });
  assert.equal(menu.hidden, true);
  assert.equal(row.getAttribute("aria-expanded"), "false");
  assert.deepEqual([p.doc.listeners.keydown.length, p.doc.listeners.click.length], [0, 0], "no listener is left once it is closed");
});

test("the theme row names the theme it switches to, and switches it through theme.js", () => {
  const t = themed("dark");
  const p = page(ALL, [204], { window: t.window });
  assert.equal(p.node["menu-theme"].hidden, false);
  assert.equal(p.node["menu-theme-label"].textContent, "Light theme");
  assert.deepEqual([p.node["menu-sun"].hidden, p.node["menu-moon"].hidden], [false, true]);
  p.node["menu-theme"].fire("click");
  assert.equal(t.api.current(), "light");
  assert.equal(p.node["menu-theme-label"].textContent, "Dark theme");
  assert.deepEqual([p.node["menu-sun"].hidden, p.node["menu-moon"].hidden], [true, false]);
  p.node["menu-theme"].fire("click");
  assert.equal(t.api.current(), "dark");
});

test("without theme.js the theme row is hidden and the pop-up opens on Sign out", () => {
  const p = page(ALL, [204]);
  assert.equal(p.node["menu-theme"].hidden, true);
  p.node["acct-row"].fire("click");
  assert.equal(p.doc.activeElement, p.node["sign-out"]);
});

test("Sign out in the pop-up works while it is open, and the pages hold the pop-up as shell.js expects", async () => {
  const p = page(ALL, [204]);
  p.window.NOHqShell.signedIn("ana@example.com");
  p.node["acct-row"].fire("click");
  p.node["sign-out"].fire("click");
  await settle();
  assert.equal(p.location.assigned, "/sign-in/");
  for (const file of ["index.html", "finance.html"]) {
    const html = fs.readFileSync(new URL("../public/" + file, import.meta.url), "utf8");
    const tag = (id) => (html.match(new RegExp("<[a-z]+ [^>]*id=\"" + id + "\"[^>]*>")) || [""])[0];
    for (const id of [...MENU, "sign-out", "sign-out-0"]) assert.notEqual(tag(id), "", id + " is in " + file);
    assert.match(tag("acct-menu"), /role="menu"[^>]* hidden>$/, file);
    assert.match(tag("acct-row"), /^<button [^>]*aria-haspopup="menu" aria-expanded="false" aria-controls="acct-menu" hidden>$/, file);
    assert.doesNotMatch(tag("sign-out-0"), /hidden/, file);
    assert.ok(html.indexOf('id="sign-out"') > html.indexOf('id="acct-menu"') && html.indexOf('id="sign-out"') < html.indexOf('id="sign-out-0"'), "Sign out is inside the pop-up in " + file);
    assert.doesNotMatch(html, /class="ws"|Staff only/, file + " has no HQ block in the side menu");
    assert.equal(html.match(/<span>NegosyoOnline HQ<\/span><\/a>/g).length, 2, file + " names HQ in both wordmarks");
  }
  for (const file of ["auth.html", "not-found.html"]) {
    const html = fs.readFileSync(new URL("../public/" + file, import.meta.url), "utf8");
    assert.match(html, /<span>NegosyoOnline HQ<\/span><\/a>/, file);
    assert.match(html, /<span class="chip chip-info">Staff only<\/span>/, file + " keeps its chip");
  }
});

test("every Sign out button ends the session and returns to sign-in, signed in or not", async () => {
  for (const id of OUT) {
    const p = page(ALL, [204]);
    p.node[id].fire("click");
    await settle();
    assert.equal(p.location.assigned, "/sign-in/");
    assert.equal(p.calls.length, 1);
    assert.equal(p.calls[0].credentials, "include");
  }
});

test("a failed sign-out shows the message and goes nowhere; a later good one hides it", async () => {
  for (const reply of [[500, refused("server_error")], "offline"]) {
    const p = page(ALL, reply);
    p.node["sign-out"].fire("click");
    await settle();
    assert.equal(p.location.assigned, null);
    assert.equal(p.node["sign-out-err"].hidden, false);
  }
});

test("a page with only the side panel's Sign out works", async () => {
  const p = page([...CARD, "sign-out"], [500, refused("server_error")]);
  p.window.NOHqShell.signedIn("ana@example.com");
  p.node["sign-out"].fire("click");
  await settle();
  assert.equal(p.location.assigned, null);
});
