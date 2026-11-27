/* settings.js: the Settings page (ClickUp z8uq9mek62). Santé catalog owner and SMS settings, each change behind a
   confirm dialog; a 404 on a card shows it is switched off and no controls. The page decides nothing. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE, refused } from "./page.mjs";

const IDS = ["boot", "v-main", "v-down", "retry", "o-load", "o-off", "o-down", "o-retry", "o-body", "o-msg", "o-cur", "o-name", "o-pid",
  "o-form", "o-site", "o-err", "o-save", "o-clear", "s-load", "s-off", "s-down", "s-retry", "s-body", "s-msg", "s-form", "s-stop", "s-stop-err",
  "s-platform", "s-platform-err", "s-site", "s-site-err", "s-bulk-field", "s-bulk", "s-bulk-err", "s-err", "s-save",
  "g-chip", "g-load", "g-off", "g-down", "g-retry", "g-body", "g-msg", "g-note", "g-addr", "g-addr-copy", "g-name", "g-enabled", "g-poll", "g-poll-at", "g-incoming",
  "g-register", "g-rotate", "g-disable", "g-refresh",
  "m-gw", "m-gw-h", "m-gw-sub", "gw-x", "gw-name-field", "gw-name", "gw-code-field", "gw-code", "gw-ack-field", "gw-ack", "gw-err", "gw-go", "gw-cancel",
  "m-token", "tk-token", "tk-copy", "tk-copied", "tk-addr", "tk-addr-copy", "tk-done",
  "m-confirm", "m-confirm-h", "m-confirm-sub", "confirm-x", "confirm-err", "confirm-go", "confirm-cancel",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const OGET = "POST sante/owner/get/", OSET = "POST sante/owner/set/", SGET = "POST sms/policy/get/", SSET = "POST sms/policy/set/", DGET = "POST sms/device/get/";
const CANDS = [{ id: "site_a", name: "Sample Store A" }, { id: "site_b", name: "Sample Store B" }];
const owner = (o = { id: "site_a", name: "Sample Store A" }) => [200, { owner: o, candidates: CANDS }];
const policy = (over = {}) => [200, { sending_stopped: false, platform_daily_limit: 1000, site_daily_limit: 100, updated_at: "2026-11-13T09:30:00+08:00", ...over }];

async function page(table) {
  const p = open(["hq.js", "shell.js", "finance-common.js", "settings.js"], { ids: IDS, pathname: "/settings/", answers: (call) => {
    const key = call.method + " " + call.url.slice(BASE.length + 1);
    const reply = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    assert.ok(reply !== undefined, "unexpected call: " + key);
    return typeof reply === "function" ? reply(call) : reply;
  } });
  await settle();
  return { ...p, sent: (key) => p.calls.filter((c) => c.method + " " + c.url.slice(BASE.length + 1) === key) };
}
const normal = (over = {}) => ({ "GET me/": [200, ME], [OGET]: owner(), [SGET]: policy(), [DGET]: [404, {}], ...over });
const text = (p, id) => p.node[id].textContent;
const confirm = async (p) => { p.node["confirm-go"].fire("click"); await settle(); };

test("the page asks who is signed in, then reads both cards", async () => {
  const p = await page(normal());
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url.slice(BASE.length + 1)), ["GET me/", OGET, SGET, DGET]);
  assert.equal(p.node["v-main"].hidden, false);
  assert.equal(p.node["o-body"].hidden, false);
  assert.equal(p.node["s-body"].hidden, false);
  assert.deepEqual(p.calls.slice(1).map((c) => c.body), [{}, {}, {}]);
});

test("the owner card shows the owner's name and small public id, and the candidates", async () => {
  const p = await page(normal());
  assert.equal(text(p, "o-name"), "Sample Store A");
  assert.equal(text(p, "o-pid"), "site_a");
  assert.equal(p.node["o-pid"].hidden, false);
  assert.deepEqual(p.node["o-site"].children.map((o) => [o.getAttribute("value"), o.textContent]), [["", "Choose a site"], ["site_a", "Sample Store A"], ["site_b", "Sample Store B"]]);
  assert.equal(p.node["o-site"].value, "site_a");
  assert.equal(p.node["o-clear"].disabled, false);
});

test("with no owner the card says so, selects nothing and Clear is off", async () => {
  const p = await page(normal({ [OGET]: owner(null) }));
  assert.equal(text(p, "o-name"), "No catalog owner");
  assert.equal(p.node["o-pid"].hidden, true);
  assert.equal(p.node["o-site"].value, "");
  assert.equal(p.node["o-clear"].disabled, true);
});

test("Save asks to confirm, then sends the site and shows the new owner", async () => {
  const p = await page(normal({ [OSET]: owner({ id: "site_b", name: "Sample Store B" }) }));
  p.node["o-site"].value = "site_b";
  p.node["o-form"].fire("submit");
  assert.equal(p.node["m-confirm"].hidden, false);
  assert.equal(text(p, "m-confirm-h"), "Change the catalog owner?");
  assert.match(text(p, "m-confirm-sub"), /Sample Store B/);
  assert.equal(p.sent(OSET).length, 0, "nothing is sent before the confirm");
  await confirm(p);
  assert.deepEqual(p.sent(OSET)[0].body, { site: "site_b" });
  assert.equal(p.node["m-confirm"].hidden, true);
  assert.equal(text(p, "o-name"), "Sample Store B");
  assert.equal(text(p, "o-msg"), "Catalog owner saved.");
});

test("Cancel in the dialog sends nothing", async () => {
  const p = await page(normal());
  p.node["o-site"].value = "site_b";
  p.node["o-form"].fire("submit");
  p.node["confirm-cancel"].fire("click");
  assert.equal(p.node["m-confirm"].hidden, true);
  assert.equal(p.sent(OSET).length, 0);
});

test("Save with no site chosen says so and opens no dialog", async () => {
  const p = await page(normal({ [OGET]: owner(null) }));
  p.node["o-form"].fire("submit");
  assert.equal(text(p, "o-err"), "Choose a site.");
  assert.equal(p.node["m-confirm"].hidden, true);
});

test("Clear confirms, then sends site null", async () => {
  const p = await page(normal({ [OSET]: owner(null) }));
  p.node["o-clear"].fire("click");
  assert.equal(text(p, "m-confirm-h"), "Clear the catalog owner?");
  await confirm(p);
  assert.deepEqual(p.sent(OSET)[0].body, { site: null });
  assert.equal(text(p, "o-name"), "No catalog owner");
  assert.equal(text(p, "o-msg"), "Catalog owner cleared.");
});

test("a 400 puts the site message under the select and closes the dialog", async () => {
  const p = await page(normal({ [OSET]: [400, { error: { code: "invalid_request", message: "x", fields: { site: ["That site cannot own the catalog."] } } }] }));
  p.node["o-site"].value = "site_b";
  p.node["o-form"].fire("submit");
  await confirm(p);
  assert.equal(text(p, "o-err"), "That site cannot own the catalog.");
  assert.equal(p.node["o-site"].getAttribute("aria-invalid"), "true");
  assert.equal(p.node["m-confirm"].hidden, true);
});

test("another failure on Save keeps the dialog open with a line to try again", async () => {
  const p = await page(normal({ [OSET]: [500, {}] }));
  p.node["o-site"].value = "site_b";
  p.node["o-form"].fire("submit");
  await confirm(p);
  assert.equal(p.node["m-confirm"].hidden, false);
  assert.equal(text(p, "confirm-err"), "That did not go through. Check the page before trying again.");
  assert.equal(p.node["confirm-go"].disabled, false);
});

test("a 404 on the owner routes shows the off line and no controls, and leaves the SMS card alone", async () => {
  const p = await page(normal({ [OGET]: [404, refused("not_found")] }));
  assert.equal(p.node["o-off"].hidden, false);
  assert.equal(p.node["o-body"].hidden, true);
  assert.equal(p.node["s-body"].hidden, false);
  const later = await page(normal({ [OSET]: [404, refused("not_found")] }));
  later.node["o-site"].value = "site_b";
  later.node["o-form"].fire("submit");
  await confirm(later);
  assert.equal(later.node["o-off"].hidden, false);
  assert.equal(later.node["o-body"].hidden, true);
  assert.equal(later.node["m-confirm"].hidden, true);
});

test("a failed read shows the card's own Try again", async () => {
  let answer = [500, {}];
  const p = await page(normal({ [OGET]: () => answer }));
  assert.equal(p.node["o-down"].hidden, false);
  assert.equal(p.node["o-body"].hidden, true);
  answer = owner();
  p.node["o-retry"].fire("click");
  await settle();
  assert.equal(p.node["o-body"].hidden, false);
});

test("the SMS card fills the switch and both limits, and says when it was changed", async () => {
  const p = await page(normal({ [SGET]: policy({ sending_stopped: true, platform_daily_limit: 5, site_daily_limit: 0 }) }));
  assert.equal(p.node["s-stop"].checked, true);
  assert.equal(p.node["s-platform"].value, "5");
  assert.equal(p.node["s-site"].value, "0");
});

test("Save confirms with plain wording, then sends all three fields", async () => {
  const p = await page(normal({ [SSET]: policy({ platform_daily_limit: 2000 }) }));
  p.node["s-platform"].value = " 2000 ";
  p.node["s-form"].fire("submit");
  assert.equal(text(p, "m-confirm-h"), "Save SMS settings?");
  assert.equal(p.sent(SSET).length, 0);
  await confirm(p);
  assert.deepEqual(p.sent(SSET)[0].body, { sending_stopped: false, platform_daily_limit: 2000, site_daily_limit: 100 });
  assert.equal(p.node["m-confirm"].hidden, true);
  assert.equal(text(p, "s-msg"), "SMS settings saved.");
  assert.equal(p.node["s-platform"].value, "2000");
});

test("turning sending off uses the stronger wording; leaving it on does not", async () => {
  const p = await page(normal({ [SSET]: policy({ sending_stopped: true }) }));
  p.node["s-stop"].checked = true;
  p.node["s-form"].fire("submit");
  assert.equal(text(p, "m-confirm-h"), "Stop all SMS sending?");
  assert.equal(text(p, "confirm-go"), "Stop sending");
  await confirm(p);
  assert.equal(p.sent(SSET)[0].body.sending_stopped, true);
  p.node["s-form"].fire("submit");
  assert.equal(text(p, "m-confirm-h"), "Save SMS settings?", "already stopped: a plain save");
});

test("limits are checked in the page: whole numbers 0 to 2147483647, nothing sent", async () => {
  for (const bad of ["", "abc", "-1", "1.5", "1,000", "2147483648", "99999999999"]) {
    const p = await page(normal());
    p.node["s-platform"].value = bad;
    p.node["s-form"].fire("submit");
    assert.match(text(p, "s-platform-err"), /^Enter a whole number from 0 to 2147483647\.$/, bad);
    assert.equal(p.node["s-platform"].getAttribute("aria-invalid"), "true", bad);
    assert.equal(p.node["m-confirm"].hidden, true, bad);
    assert.equal(p.sent(SSET).length, 0, bad);
  }
  const p = await page(normal({ [SSET]: policy() }));
  p.node["s-platform"].value = "0";
  p.node["s-site"].value = "2147483647";
  p.node["s-form"].fire("submit");
  assert.equal(p.node["m-confirm"].hidden, false);
  assert.equal(text(p, "s-site-err"), "");
});

test("a 400 puts each field's message under that field", async () => {
  const fields = { platform_daily_limit: ["Platform message."], site_daily_limit: ["Site message."], sending_stopped: ["Stop message."] };
  const p = await page(normal({ [SSET]: [400, { error: { code: "invalid_request", message: "x", fields } }] }));
  p.node["s-form"].fire("submit");
  await confirm(p);
  assert.equal(text(p, "s-platform-err"), "Platform message.");
  assert.equal(text(p, "s-site-err"), "Site message.");
  assert.equal(text(p, "s-stop-err"), "Stop message.");
  assert.equal(p.node["m-confirm"].hidden, true);
});

test("a 404 on the SMS routes shows the off line and no controls", async () => {
  const p = await page(normal({ [SGET]: [404, refused("not_found")] }));
  assert.equal(p.node["s-off"].hidden, false);
  assert.equal(p.node["s-body"].hidden, true);
  assert.equal(p.node["o-body"].hidden, false);
  const later = await page(normal({ [SSET]: [404, refused("not_found")] }));
  later.node["s-form"].fire("submit");
  await confirm(later);
  assert.equal(later.node["s-off"].hidden, false);
  assert.equal(later.node["s-body"].hidden, true);
});

test("a person who is not signed in is sent to sign in; me/ failing shows the down view", async () => {
  const p = await page({ "GET me/": [401, refused("unauthenticated")] });
  assert.equal(p.location.replaced, "/sign-in/");
  const down = await page({ "GET me/": [500, {}] });
  assert.equal(down.node["v-down"].hidden, false);
});

test("the page has a label for every field, light-blue focus only, alerts as role=alert, and unfocusable titles", () => {
  const html = fs.readFileSync(new URL("../public/settings.html", import.meta.url), "utf8");
  for (const id of ["o-site", "s-stop", "s-platform", "s-site"]) assert.match(html, new RegExp('<label for="' + id + '"'), id);
  for (const id of ["o-err", "s-stop-err", "s-platform-err", "s-site-err", "s-err", "confirm-err"]) assert.match(html, new RegExp('id="' + id + '" role="alert"'), id);
  assert.doesNotMatch(html, /<h[23][^>]*tabindex/);
  assert.match(html, /<h2 id="o-h">Santé catalog owner<\/h2>/);
  assert.match(html, /id="o-off"[^>]*>Santé settings are switched off\.</);
  assert.match(html, /id="s-off"[^>]*>SMS sending is switched off on this server\.</);
  assert.match(html, /<h2 id="s-h">SMS settings<\/h2>/);
});

test("the per-store text caps and the hourly note are gone, and the save body never carries them", async () => {
  const html = fs.readFileSync(new URL("../public/settings.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /Texts per store a day/);
  assert.doesNotMatch(html, /Texts from all stores a day/);
  assert.doesNotMatch(html, /20 an hour/);
  assert.doesNotMatch(html, /s-store|s-allstores/);
  // Even when an older server still sends the two numbers, nothing is shown or sent back.
  const p = await page(normal({ [SGET]: policy({ store_daily_limit: 50, all_stores_daily_limit: 1000 }), [SSET]: policy({ store_daily_limit: 50, all_stores_daily_limit: 1000 }) }));
  p.node["s-site"].value = "200";
  p.node["s-form"].fire("submit");
  await confirm(p);
  assert.deepEqual(p.sent(SSET)[0].body, { sending_stopped: false, platform_daily_limit: 1000, site_daily_limit: 200 });
});

test("the three SMS limits and Save share one four-column row; the stop switch is above, the error and last-changed below", () => {
  const html = fs.readFileSync(new URL("../public/settings.html", import.meta.url), "utf8");
  const row = html.match(/<div class="fgrid four">([\s\S]*?)\n              <\/div>\n              <p class="field-err" id="s-err"/);
  assert.ok(row, "one four-column row, closed before the form error");
  assert.deepEqual([...row[1].matchAll(/<input[^>]*id="([^"]+)"/g)].map((m) => m[1]), ["s-platform", "s-site", "s-bulk"]);
  assert.equal([...row[1].matchAll(/field-err/g)].length, 3, "each field keeps its error slot");
  assert.match(row[1], /<button type="submit"[^>]*id="s-save"/, "Save is the fourth item of the row");
  assert.ok(row[1].indexOf('id="s-bulk"') < row[1].indexOf('id="s-save"'), "Save comes after the bulk box");
  assert.ok(html.indexOf('id="s-stop"') < html.indexOf('fgrid four') && html.indexOf('id="s-save"') < html.indexOf('id="s-err"') && !html.includes('s-when') && !html.includes('Last changed'));
  const css = fs.readFileSync(new URL("../public/assets/css/hq.css", import.meta.url), "utf8");
  assert.match(css, /\.fgrid\.four \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) auto; align-items: start; \}/, "three input columns, Save column sized to the button");
  assert.match(css, /\.fgrid\.four label, \.fgrid\.four \.fgrid-save-gap \{ white-space: nowrap; \}/, "labels stay on one line");
  assert.match(css, /max-width: 1199\.98px\) \{\n  \.fgrid\.four label, \.fgrid\.four \.fgrid-save-gap \{ white-space: normal; min-height: 3\.2em; \}/, "narrow desktop: equal two-line label height keeps the boxes level");
  assert.match(css, /\.fgrid\.four \{ grid-template-columns: minmax\(0, 1fr\); \}/, "one column on a phone");
});

test("the bulk texts a day per store field shows with the default, saves with the other caps, and stays hidden when the server does not send it", async () => {
  const none = await page(normal());
  assert.equal(none.node["s-bulk-field"].hidden, true, "an older server: no bulk field");
  const p = await page(normal({ [SGET]: policy({ store_bulk_daily_limit: 2000 }), [SSET]: policy({ store_bulk_daily_limit: 1500 }) }));
  assert.equal(p.node["s-bulk-field"].hidden, false);
  assert.equal(p.node["s-bulk"].value, "2000");
  assert.match(fs.readFileSync(new URL("../public/settings.html", import.meta.url), "utf8"), /<label for="s-bulk">Bulk texts a day per store<\/label>/);
  p.node["s-bulk"].value = "1500";
  p.node["s-form"].fire("submit");
  await confirm(p);
  assert.deepEqual(p.sent(SSET)[0].body, { sending_stopped: false, platform_daily_limit: 1000, site_daily_limit: 100, store_bulk_daily_limit: 1500 });
  assert.equal(p.node["s-bulk"].value, "1500", "the saved answer is painted back");
  p.node["s-bulk"].value = "-1";
  p.node["s-form"].fire("submit");
  assert.match(text(p, "s-bulk-err"), /^Enter a whole number from 0 to 2147483647\.$/);
  assert.equal(p.node["s-bulk"].getAttribute("aria-invalid"), "true");
});

test("a 400 puts the bulk cap's message under the bulk field", async () => {
  const fields = { store_bulk_daily_limit: ["Bulk message."] };
  const p = await page(normal({ [SGET]: policy({ store_bulk_daily_limit: 2000 }), [SSET]: [400, { error: { code: "invalid_request", message: "x", fields } }] }));
  p.node["s-form"].fire("submit");
  await confirm(p);
  assert.equal(text(p, "s-bulk-err"), "Bulk message.");
});
