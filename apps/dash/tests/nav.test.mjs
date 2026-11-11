/* Where the two Settings entries live (Phase 7 B2, ClickUp z8uq9machp). The parent task's fixed rule: Account
   Settings is in the profile menu, never in the site sidebar; Settings (Business Settings) is in the site sidebar,
   never in the profile menu. The menus are static markup in index.html, so the markup is what is read. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const HTML = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const APP = fs.readFileSync(new URL("../public/assets/js/app.js", import.meta.url), "utf8");
const one = (re, what) => { const m = HTML.match(re); assert.equal(m && m.length, 1, what + " is in the page once"); return m[0]; };
/* Each link as [href, visible text], icons dropped. */
const links = (block) => [...block.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map((m) => [m[1], m[2].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").trim()]);

const PROFILE = one(/<div class="acct-menu" id="acct-menu"[\s\S]*?<\/div>\s*<button type="button" class="acct-row"/g, "the profile menu");
const SIDEBAR = one(/<nav class="side-nav"[\s\S]*?<\/nav>/g, "the sidebar navigation");
const TABS = one(/<nav class="tabs[^"]*" id="tabs"[\s\S]*?<\/nav>/g, "the bottom tabs");
const MORE = one(/<dialog[^>]*id="more-sheet"[\s\S]*?<\/dialog>/g, "the More sheet");
const SWITCHER = one(/<div class="ws-menu" id="ws-menu"[\s\S]*?<\/div>\s*<\/div>/g, "the site switcher menu");
const isAccount = ([href, text]) => href.indexOf("/account") === 0 || /account settings/i.test(text);
const isSettings = ([href, text]) => href.indexOf("/settings/") === 0 || /^(business )?settings$/i.test(text);

test("Account Settings is in the profile menu and not in the sidebar, bottom tabs or More sheet", () => {
  assert.deepEqual(links(PROFILE).filter(isAccount), [["/account/", "Account Settings"]]);
  for (const [name, block] of [["sidebar", SIDEBAR], ["bottom tabs", TABS], ["More sheet", MORE], ["site switcher", SWITCHER]]) {
    assert.deepEqual(links(block).filter(isAccount), [], "no Account Settings entry in the " + name);
    assert.ok(!/account settings/i.test(block), "the words are not in the " + name);
  }
  /* The whole page has one link to /account/: the profile menu's. */
  assert.equal((HTML.match(/href="\/account\/?"/g) || []).length, 1);
  /* On a phone the top bar's avatar opens a copy of that same menu, made by app.js; nothing else is added to it. */
  assert.ok(/getElementById\("acct-menu"\)[\s\S]{0,200}cloneNode\(true\)/.test(APP));
});

test("Settings is in the sidebar and not in the profile menu", () => {
  assert.deepEqual(links(SIDEBAR).filter(isSettings), [["/settings/business/", "Settings"]]);
  assert.deepEqual(links(PROFILE).filter(isSettings), [], "no Settings or Business Settings entry in the profile menu");
  assert.ok(!/\/settings\//.test(PROFILE), "no settings address in the profile menu");
  assert.ok(!/business settings/i.test(PROFILE));
  assert.deepEqual(links(PROFILE).map((l) => l[1]), ["My Subscription", "Account Settings", "Help Center"]);
  /* The phone's More sheet is the sidebar's stand-in: its Settings group opens Business Settings by that name. */
  assert.deepEqual(links(MORE).filter(([href]) => href === "/settings/business/"), [["/settings/business/", "Business Settings"]]);
});
