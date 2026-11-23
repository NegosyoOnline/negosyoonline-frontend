/* subscribers.js: HQ Suspend / Resume of a store (ClickUp z8uq9mhpbf, contract z8uq9mhpbe). The hold card follows the boolean
   `held` the backend sends: absent means the switch is dark, so no card and no controls. A reason of 10 to 500 characters,
   a fresh code and the confirm box are required before any call. */
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
  "d-held", "d-hold", "d-hold-chip", "d-hold-copy", "d-hold-err", "d-hold-suspend", "d-hold-resume", "m-hold", "m-hold-h", "m-hold-sub", "hold-x",
  "hold-reason", "hold-count", "hold-code", "hold-confirm", "hold-confirm-text", "hold-err", "hold-go", "hold-cancel",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const LIST = "POST subscribers/list/", DETAIL = "POST subscribers/detail/", SUSPEND = "POST subscribers/suspend/", RESUME = "POST subscribers/resume/";
const row = (over = {}) => ({ site_id: "site_a", business_name: "Sample Store A", site_address: "sample-a.example.test", template: "classic", plan: "monthly",
  state: "active", owner_email: "owner.a@example.com", created_at: "2026-10-01T09:30:00+08:00", ...over });
const REASON = "Spam from this store";

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
const base = (rowOver, detailOver, extra = {}) => ({ "GET me/": [200, ME], [LIST]: [200, { rows: [row(rowOver)], next: null }],
  [DETAIL]: [200, { ...row(detailOver), payments: [], sms_line: null }], ...extra });
const fill = (p, reason, code, ticked = true) => { p.node["hold-reason"].value = reason; p.node["hold-code"].value = code; p.node["hold-confirm"].checked = ticked; };
const sent = (p, key) => p.calls.filter((c) => c.method + " " + c.url.slice(BASE.length + 1) === key);

test("held absent (switch dark): no hold card, no buttons, no chip", async () => {
  const p = await page(base());
  assert.equal(p.node["d-hold"].hidden, true);
  assert.equal(p.node["d-hold-suspend"].hidden, true);
  assert.equal(p.node["d-hold-resume"].hidden, true);
  assert.equal(p.node["d-held"].hidden, true);
});

test("a live store shows Live and Suspend only; a held one shows the chip in the detail and Resume only", async () => {
  let p = await page(base({ held: false }, { held: false }));
  assert.equal(p.node["d-hold"].hidden, false);
  assert.equal(p.node["d-hold-chip"].textContent, "Live");
  assert.equal(p.node["d-hold-suspend"].hidden, false);
  assert.equal(p.node["d-hold-resume"].hidden, true);
  assert.equal(p.node["d-held"].hidden, true);
  p = await page(base({ held: true }, { held: true }));
  assert.equal(p.node["d-held"].hidden, false);
  assert.equal(p.node["d-hold-chip"].textContent, "Suspended by HQ");
  assert.equal(p.node["d-hold-suspend"].hidden, true);
  assert.equal(p.node["d-hold-resume"].hidden, false);
});

test("the list row carries a Suspended by HQ chip for a held store only", async () => {
  const p = open(["hq.js", "shell.js", "finance-common.js", "subscribers.js"], { ids: IDS, pathname: "/subscribers/", answers: (call) =>
    call.url.endsWith("me/") ? [200, ME] : [200, { rows: [row({ held: true }), row({ site_id: "site_b", business_name: "Sample Store B", held: false })], next: null }] });
  await settle();
  const chips = (n) => p.node["s-body"].children[n].children[2].textContent;
  assert.match(chips(0), /Suspended by HQ/);
  assert.doesNotMatch(chips(1), /Suspended by HQ/);
});

test("the dialog needs a reason of 10 to 500, a 6-digit code and the confirm box before any call", async () => {
  const p = await page(base({ held: false }, { held: false }));
  p.node["d-hold-suspend"].fire("click");
  assert.equal(p.node["m-hold"].hidden, false);
  assert.equal(p.node["m-hold-h"].textContent, "Suspend this store?");
  assert.equal(p.node["hold-confirm-text"].textContent, "The store's site and checkout go offline at once");
  fill(p, "short", "123456");
  p.node["hold-go"].fire("click");
  assert.match(p.node["hold-err"].textContent, /10 to 500/);
  assert.equal(p.node["hold-reason"].getAttribute("aria-invalid"), "true");
  fill(p, "x".repeat(501), "123456");
  p.node["hold-go"].fire("click");
  assert.match(p.node["hold-err"].textContent, /10 to 500/);
  fill(p, REASON, "12345");
  p.node["hold-go"].fire("click");
  assert.match(p.node["hold-err"].textContent, /6-digit code/);
  assert.equal(p.node["hold-code"].getAttribute("aria-invalid"), "true");
  fill(p, REASON, "123456", false);
  p.node["hold-go"].fire("click");
  assert.equal(p.node["hold-err"].textContent, "Tick the box to confirm.");
  assert.equal(p.node["hold-confirm"].getAttribute("aria-invalid"), "true");
  assert.equal(sent(p, SUSPEND).length, 0);
});

test("the counter follows the reason", async () => {
  const p = await page(base({ held: false }, { held: false }));
  p.node["d-hold-suspend"].fire("click");
  p.node["hold-reason"].value = "abcde";
  p.node["hold-reason"].fire("input");
  assert.equal(p.node["hold-count"].textContent, "5 of 500");
});

test("Suspend sends site, reason, code and confirm, then repaints the card from the 200 and closes", async () => {
  const p = await page(base({ held: false }, { held: false }, { [SUSPEND]: [200, { ...row({ held: true, state: "active" }), payments: [], sms_line: null }] }));
  p.node["d-hold-suspend"].fire("click");
  fill(p, "  " + REASON + "  ", "123456");
  p.node["hold-go"].fire("click");
  await settle();
  assert.deepEqual(sent(p, SUSPEND)[0].body, { site_id: "site_a", reason: REASON, code: "123456", confirm: true });
  assert.equal(p.node["m-hold"].hidden, true);
  assert.equal(p.node["hold-code"].value, "");
  assert.equal(sent(p, DETAIL).length, 1, "repainted from the answer, not re-read");
  assert.equal(p.node["d-held"].hidden, false);
  assert.equal(p.node["d-hold-resume"].hidden, false);
  assert.equal(p.node["d-hold-suspend"].hidden, true);
});

test("Resume is the same dialog without red, goes to the resume route and repaints", async () => {
  const p = await page(base({ held: true }, { held: true }, { [RESUME]: [200, { ...row({ held: false }), payments: [], sms_line: null }] }));
  p.node["d-hold-resume"].fire("click");
  assert.equal(p.node["m-hold-h"].textContent, "Resume this store?");
  assert.doesNotMatch(p.node["hold-go"].getAttribute("class"), /stop/);
  assert.equal(p.node["hold-go"].textContent, "Resume");
  fill(p, "Checked and resolved", "654321");
  p.node["hold-go"].fire("click");
  await settle();
  assert.equal(sent(p, RESUME).length, 1);
  assert.equal(p.node["d-held"].hidden, true);
  assert.equal(p.node["d-hold-chip"].textContent, "Live");
  assert.equal(p.node["d-hold-suspend"].hidden, false);
});

test("Suspend is red, and going back to the list reads the rows again after a change", async () => {
  const p = await page(base({ held: false }, { held: false }, { [SUSPEND]: [200, { ...row({ held: true }), payments: [] }] }));
  p.node["d-hold-suspend"].fire("click");
  assert.match(p.node["hold-go"].getAttribute("class"), /\bstop\b/);
  fill(p, REASON, "123456");
  p.node["hold-go"].fire("click");
  await settle();
  const before = sent(p, LIST).length;
  p.node["back"].fire("click", { preventDefault() {} });
  await settle();
  assert.equal(sent(p, LIST).length, before + 1);
});

test("a refused code keeps the dialog open, says so once and marks the code field", async () => {
  const p = await page(base({ held: false }, { held: false }, { [SUSPEND]: [403, refused("reauth_failed")] }));
  p.node["d-hold-suspend"].fire("click");
  fill(p, REASON, "111111");
  p.node["hold-go"].fire("click");
  await settle();
  assert.equal(p.node["m-hold"].hidden, false);
  assert.match(p.node["hold-err"].textContent, /That code was not accepted/);
  assert.equal(p.node["hold-code"].getAttribute("aria-invalid"), "true");
  assert.equal(p.node["hold-go"].disabled, false);
});

test("409 already_suspended closes the dialog, reads the store again and says why", async () => {
  const p = await page(base({ held: false }, { held: false }, { [SUSPEND]: [409, refused("already_suspended")] }));
  p.node["d-hold-suspend"].fire("click");
  fill(p, REASON, "123456");
  p.node["hold-go"].fire("click");
  await settle();
  assert.equal(p.node["m-hold"].hidden, true);
  assert.equal(sent(p, DETAIL).length, 2);
  assert.match(p.node["d-hold-err"].textContent, /already suspended/);
});

test("409 not_suspended closes the dialog, reads the store again and says why", async () => {
  const p = await page(base({ held: true }, { held: true }, { [RESUME]: [409, refused("not_suspended")] }));
  p.node["d-hold-resume"].fire("click");
  fill(p, REASON, "123456");
  p.node["hold-go"].fire("click");
  await settle();
  assert.equal(p.node["m-hold"].hidden, true);
  assert.equal(sent(p, DETAIL).length, 2);
  assert.match(p.node["d-hold-err"].textContent, /was not suspended/);
});

test("a 404 on the route (switch dark) hides the card and the controls", async () => {
  const p = await page(base({ held: false }, { held: false }, { [SUSPEND]: [404, refused("not_found")] }));
  p.node["d-hold-suspend"].fire("click");
  fill(p, REASON, "123456");
  p.node["hold-go"].fire("click");
  await settle();
  assert.equal(p.node["m-hold"].hidden, true);
  assert.equal(p.node["d-hold"].hidden, true);
});

test("a server refusal of the reason shows the reason message; a network failure keeps what was typed", async () => {
  let p = await page(base({ held: false }, { held: false }, { [SUSPEND]: [400, { error: { code: "invalid", message: "x", fields: { reason: ["bad"] } } }] }));
  p.node["d-hold-suspend"].fire("click");
  fill(p, REASON, "123456");
  p.node["hold-go"].fire("click");
  await settle();
  assert.equal(p.node["m-hold"].hidden, false);
  p = await page(base({ held: false }, { held: false }, { [SUSPEND]: "offline" }));
  p.node["d-hold-suspend"].fire("click");
  fill(p, REASON, "123456");
  p.node["hold-go"].fire("click");
  await settle();
  assert.equal(p.node["m-hold"].hidden, false);
  assert.match(p.node["hold-err"].textContent, /did not go through/);
  assert.equal(p.node["hold-reason"].value, REASON);
  assert.equal(p.node["hold-confirm"].checked, true);
});

test("the dialog markup: a 500-character reason box, a numeric code field, a confirm box, Cancel, no native dropdown", () => {
  const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "subscribers.html"), "utf8");
  assert.match(html, /id="hold-reason"[^>]*maxlength="500"/);
  assert.match(html, /id="hold-code"[^>]*inputmode="numeric"[^>]*maxlength="6"[^>]*autocomplete="one-time-code"/);
  assert.match(html, /<input type="checkbox" id="hold-confirm"/);
  assert.match(html, /id="d-hold-suspend"[^>]*>Suspend store</);
  assert.match(html, /id="d-hold-resume"[^>]*>Resume store</);
  assert.match(html, /id="d-held"[^>]*hidden>Suspended by HQ</);
  assert.match(html, /id="hold-cancel"/);
  assert.doesNotMatch(html, /<select/);
});
