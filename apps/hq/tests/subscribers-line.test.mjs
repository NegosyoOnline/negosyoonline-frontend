/* subscribers.js: HQ Disable / Re-enable of a Site's SMS line (ClickUp z8uq9mhk1k). The card follows what the backend
   sends in sms_line: null means the switch is dark, so no card and no controls. A reason and a fresh code are required. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { open, settle, BASE, refused } from "./page.mjs";

const IDS = ["boot", "v-list", "v-detail", "v-closed", "v-down", "retry", "tab-all", "tab-trial_ending", "tab-unpaid", "tab-suspended_ended",
  "s-form", "s-q", "s-go", "s-err", "s-card", "s-body", "s-loading", "s-empty", "s-more-row", "s-more", "back", "d-loading", "d-err", "d-retry",
  "d-body", "d-name", "d-state", "d-site-id", "d-facts", "d-pays", "d-pay-empty", "d-pay-h",
  "d-line", "d-line-chip", "d-line-copy", "d-line-when", "d-line-err", "d-line-disable", "d-line-reenable", "m-line", "m-line-h", "m-line-sub", "line-x",
  "line-reason", "line-count", "line-code", "line-err", "line-go", "line-cancel",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const LIST = "POST subscribers/list/", DETAIL = "POST subscribers/detail/", OFF = "POST subscribers/sms-line/disable/", ON = "POST subscribers/sms-line/reenable/";
const row = { site_id: "site_a", business_name: "Sample Store A", site_address: "sample-a.example.test", template: "classic", plan: "monthly", state: "active",
  owner_email: "owner.a@example.com", created_at: "2026-10-01T09:30:00+08:00" };
const line = (over = {}) => ({ has_line: true, has_phone: true, disabled: false, reason: null, disabled_at: null, ...over });
const off = (over = {}) => line({ has_line: false, disabled: true, reason: "Spam from this store", disabled_at: "2026-11-23T09:00:00+08:00", ...over });

async function page(table) {
  const p = open(["hq.js", "shell.js", "finance-common.js", "subscribers.js"], { ids: IDS, pathname: "/subscribers/", answers: (call) => {
    const key = call.method + " " + call.url.slice(BASE.length + 1);
    assert.ok(Object.prototype.hasOwnProperty.call(table, key), "unexpected call: " + key);
    const reply = table[key];
    return typeof reply === "function" ? reply(call) : reply;
  } });
  await settle();
  p.node["s-body"].children[0].children.at(-1).children[0].fire("click");
  await settle();
  return p;
}
const base = (sms, extra = {}) => ({ "GET me/": [200, ME], [LIST]: [200, { rows: [row], next: null }], [DETAIL]: [200, { ...row, payments: [], sms_line: sms }], ...extra });
const fill = (p, reason, code) => { p.node["line-reason"].value = reason; p.node["line-code"].value = code; };
const sent = (p, key) => p.calls.filter((c) => c.method + " " + c.url.slice(BASE.length + 1) === key);

test("sms_line null (switch dark): no card and no buttons", async () => {
  const p = await page(base(null));
  assert.equal(p.node["d-line"].hidden, true);
  assert.equal(p.node["d-line-disable"].hidden, true);
  assert.equal(p.node["d-line-reenable"].hidden, true);
});

test("a serving line shows On and Disable only; a disabled one shows Disabled, the reason and Re-enable only", async () => {
  let p = await page(base(line()));
  assert.equal(p.node["d-line"].hidden, false);
  assert.equal(p.node["d-line-chip"].textContent, "On");
  assert.equal(p.node["d-line-disable"].hidden, false);
  assert.equal(p.node["d-line-reenable"].hidden, true);
  p = await page(base(off()));
  assert.equal(p.node["d-line-chip"].textContent, "Disabled");
  assert.match(p.node["d-line-when"].textContent, /Reason: Spam from this store/);
  assert.equal(p.node["d-line-disable"].hidden, true);
  assert.equal(p.node["d-line-reenable"].hidden, false);
  p = await page(base(line({ has_line: false })));
  assert.equal(p.node["d-line-chip"].textContent, "Not serving");
});

test("the dialog needs a reason and a 6-digit code before any call", async () => {
  const p = await page(base(line()));
  p.node["d-line-disable"].fire("click");
  assert.equal(p.node["m-line"].hidden, false);
  assert.equal(p.node["m-line-h"].textContent, "Disable SMS line?");
  fill(p, "  ", "123456");
  p.node["line-go"].fire("click");
  assert.equal(p.node["line-err"].textContent, "Give a reason.");
  fill(p, "Spam", "12345");
  p.node["line-go"].fire("click");
  assert.match(p.node["line-err"].textContent, /6-digit code/);
  assert.equal(sent(p, OFF).length, 0);
});

test("Disable sends the site, reason and code, then shows the new state and closes", async () => {
  const p = await page(base(line(), { [OFF]: [200, { sms_line: off() }] }));
  p.node["d-line-disable"].fire("click");
  fill(p, "  Spam from this store  ", "123456");
  p.node["line-go"].fire("click");
  await settle();
  assert.deepEqual(sent(p, OFF)[0].body, { site_id: "site_a", reason: "Spam from this store", code: "123456" });
  assert.equal(p.node["m-line"].hidden, true);
  assert.equal(p.node["line-code"].value, "");
  assert.equal(p.node["d-line-chip"].textContent, "Disabled");
  assert.equal(p.node["d-line-reenable"].hidden, false);
});

test("Re-enable sends to the re-enable route", async () => {
  const p = await page(base(off(), { [ON]: [200, { sms_line: line() }] }));
  p.node["d-line-reenable"].fire("click");
  assert.equal(p.node["m-line-h"].textContent, "Re-enable SMS line?");
  fill(p, "Resolved", "654321");
  p.node["line-go"].fire("click");
  await settle();
  assert.equal(sent(p, ON).length, 1);
  assert.equal(p.node["d-line-chip"].textContent, "On");
  assert.equal(p.node["d-line-disable"].hidden, false);
});

test("a refused code keeps the dialog open with one message and marks the code field", async () => {
  const p = await page(base(line(), { [OFF]: [403, refused("reauth_failed")] }));
  p.node["d-line-disable"].fire("click");
  fill(p, "Spam", "111111");
  p.node["line-go"].fire("click");
  await settle();
  assert.equal(p.node["m-line"].hidden, false);
  assert.match(p.node["line-err"].textContent, /That code was not accepted/);
  assert.equal(p.node["line-code"].getAttribute("aria-invalid"), "true");
  assert.equal(p.node["line-go"].disabled, false);
});

test("a 404 hides the card and the controls (the switch is dark)", async () => {
  const p = await page(base(line(), { [OFF]: [404, refused("not_found")] }));
  p.node["d-line-disable"].fire("click");
  fill(p, "Spam", "123456");
  p.node["line-go"].fire("click");
  await settle();
  assert.equal(p.node["m-line"].hidden, true);
  assert.equal(p.node["d-line"].hidden, true);
  assert.equal(p.node["d-line-disable"].hidden, true);
});

test("409 already_disabled closes the dialog and reads the subscriber again", async () => {
  const p = await page(base(line(), { [OFF]: [409, refused("already_disabled")] }));
  p.node["d-line-disable"].fire("click");
  fill(p, "Spam", "123456");
  p.node["line-go"].fire("click");
  await settle();
  assert.equal(p.node["m-line"].hidden, true);
  assert.equal(sent(p, DETAIL).length, 2);
});

test("a network failure says so and keeps what was typed", async () => {
  const p = await page(base(line(), { [OFF]: "offline" }));
  p.node["d-line-disable"].fire("click");
  fill(p, "Spam", "123456");
  p.node["line-go"].fire("click");
  await settle();
  assert.equal(p.node["m-line"].hidden, false);
  assert.match(p.node["line-err"].textContent, /did not go through/);
  assert.equal(p.node["line-reason"].value, "Spam");
});

test("the dialog markup: a reason box up to 300, a numeric one-time-code field, Cancel, and no native dropdown", () => {
  const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "subscribers.html"), "utf8");
  assert.match(html, /id="line-reason"[^>]*maxlength="300"/);
  assert.match(html, /id="line-code"[^>]*inputmode="numeric"[^>]*maxlength="6"[^>]*autocomplete="one-time-code"/);
  assert.match(html, /id="line-cancel"/);
  assert.doesNotMatch(html, /<select/);
});
