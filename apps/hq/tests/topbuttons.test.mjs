/* The top-right buttons of the signed-in pages: search, theme, bell, in the dashboard's order, on the desktop row
   (.desk-switch) and the phone top bar (.top-actions). Search and bell wait for the Inbox: real buttons, shown but
   not active, with no handler, no link and no unread dot. The theme button works. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open } from "./page.mjs";

const read = (f) => fs.readFileSync(new URL("../public/" + f, import.meta.url), "utf8");
const ids = (html, box) => {
  const start = html.indexOf(box), end = html.indexOf("</div>", start);
  return [...html.slice(start, end).matchAll(/<(?:button|span)\b[^>]*?id="([^"]+)"/g)].map((m) => m[1]);
};

for (const file of ["index.html", "finance.html"]) {
  test(file + ": search, theme and bell, in that order, on the desktop row and the phone bar", () => {
    const html = read(file);
    assert.deepEqual(ids(html, '<div class="desk-switch">'), ["search-btn-2", "theme-toggle-2", "bell-btn-2"]);
    assert.deepEqual(ids(html, '<div class="top-actions">'), ["search-btn", "theme-toggle", "bell-btn", "acct-btn"]);
  });

  test(file + ": search and bell are disabled buttons that name what they are and carry no link, handler or dot", () => {
    const html = read(file);
    for (const id of ["search-btn", "search-btn-2", "bell-btn", "bell-btn-2"]) {
      const tag = html.match(new RegExp("<button [^>]*id=\"" + id + "\"[^>]*>"))[0];
      assert.match(tag, /type="button"/, id);
      assert.match(tag, /aria-disabled="true"/, id);
      assert.match(tag, /title="[^"]*arrives? with the Inbox"/, id);
      assert.match(tag, /aria-label="(Search|Notifications), arrives? with the Inbox"/, id);
      assert.doesNotMatch(tag, /href=|onclick/, id);
    }
    assert.doesNotMatch(html, /bell-dot/);
  });
}

test("the theme button still switches the theme, and search and bell do nothing and call nothing", () => {
  const html = read("finance.html");
  const names = ["search-btn", "theme-toggle", "bell-btn", "search-btn-2", "theme-toggle-2", "bell-btn-2"];
  for (const id of names) assert.ok(html.includes('id="' + id + '"'), id);
  let now = "dark";
  const api = { current: () => now, set: (t) => { now = t; }, onChange() {} };
  const p = open(["hq.js"], { ids: names, answers: () => { throw new Error("no call expected"); },
    globals: { window: { NO_HQ_CONFIG: { staffApi: "x" }, addEventListener() {}, NOHqTheme: api } } });
  p.node["theme-toggle"].fire("click");
  assert.equal(now, "light");
  p.node["theme-toggle-2"].fire("click");
  assert.equal(now, "dark");
  for (const id of ["search-btn", "bell-btn", "search-btn-2", "bell-btn-2"]) {
    assert.deepEqual(p.node[id].listeners, {}, id + " has no handler");
    p.node[id].fire("click");
  }
  assert.equal(now, "dark");
  assert.deepEqual(p.calls, []);
});

test("the sign-in and not-found pages have no search or bell", () => {
  for (const f of ["auth.html", "not-found.html"]) assert.doesNotMatch(read(f), /search-btn|bell-btn/, f);
});
