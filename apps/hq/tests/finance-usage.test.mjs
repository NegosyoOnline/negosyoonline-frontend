/* finance-usage.js: the Usage review page (Billing HQ-F1, ClickUp z8uq9mektc, plan sections 4.1 and 6). The page
   decides nothing: the backend does, and the page follows its answer. A record that needs review is admitted
   (only when it arrived late) or dismissed, each with a required reason. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE, refused } from "./page.mjs";

const IDS = ["boot", "v-list", "v-one", "v-closed", "v-down", "retry", "u-msg", "u-h", "u-count", "u-loading", "u-rows", "u-empty", "u-more-err", "more-row", "more",
  "u-back", "uo-loading", "uo-body", "uo-site", "uo-reason", "uo-gb", "uo-cycle", "uo-pend", "uo-recv", "uo-hist-h", "uo-hist", "uo-admit", "uo-dismiss", "uo-note",
  "m-admit", "admit-x", "admit-form", "admit-f", "admit-hint", "admit-count", "admit-e", "admit-go", "admit-cancel",
  "m-dismiss", "dismiss-x", "dismiss-form", "dismiss-f", "dismiss-hint", "dismiss-count", "dismiss-e", "dismiss-go", "dismiss-cancel",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const VIEWS = ["boot", "v-list", "v-one", "v-closed", "v-down"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const GB = 1000000000;
const LIST = "POST finance/usage/review/list/", DETAIL = "POST finance/usage/review/detail/",
  ADMIT = "POST finance/usage/review/admit/", DISMISS = "POST finance/usage/review/dismiss/";

function entry(over = {}) {
  return { entry: "ue_one", kind: "storage", status: "needs_review", reason: "late_over_72h", site: { id: "site_a", name: "Sample Store A" },
    cycle: 3, period_index: 4, period_end_at: "2026-10-31T12:00:00+08:00", received_at: "2026-11-04T09:30:00+08:00", measured_bytes: 12.4 * GB, ...over };
}
const detail = (over = {}) => ({ ...entry(), history: [
  { code: "recorded_needs_review", actor: "intake", at: "2026-11-04T09:30:00+08:00" }], ...over });
const list = (items, over = {}) => [200, { items, next_cursor: null, needs_review_count: items.length, ...over }];

async function page(table) {
  const p = open(["hq.js", "shell.js", "finance-common.js", "finance-usage.js"], { ids: IDS, pathname: "/finance/usage/", answers: (call) => {
    const key = call.method + " " + call.url.slice(BASE.length + 1);
    const reply = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    assert.ok(reply !== undefined, "unexpected call: " + key);
    return typeof reply === "function" ? reply(call) : reply;
  } });
  await settle();
  const shown = () => VIEWS.filter((id) => !p.node[id].hidden);
  const sent = (key) => p.calls.filter((c) => c.method + " " + c.url.slice(BASE.length + 1) === key);
  return { ...p, shown, sent };
}
const review = (p, n = 0) => p.node["u-rows"].children[n].all((x) => x.tagName === "BUTTON")[0];
async function opened(one = detail(), table = {}) {
  const p = await page({ "GET me/": [200, ME], [LIST]: list([entry({ entry: one.entry, reason: one.reason })]), [DETAIL]: [200, one], ...table });
  review(p).fire("click");
  await settle();
  return p;
}
function dismissWith(p, text) {
  p.node["uo-dismiss"].fire("click");
  p.node["dismiss-f"].value = text;
  p.node["dismiss-form"].fire("submit");
}
function admitWith(p, text) {
  p.node["uo-admit"].fire("click");
  p.node["admit-f"].value = text;
  p.node["admit-form"].fire("submit");
}

test("the page asks who is signed in, tells the shell, then lists the records that need review", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: list([entry(), entry({ entry: "ue_two", reason: "no_cycle", site: { id: "s", name: "Sample Store B" }, measured_bytes: 3.05 * GB })], { needs_review_count: 4 }) });
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url.slice(BASE.length + 1)), ["GET me/", LIST]);
  assert.deepEqual(p.calls[1].body, {});
  assert.deepEqual(p.shown(), ["v-list"]);
  assert.equal(p.node["acct-name"].textContent, "sample.staff");
  assert.equal(p.node["u-count"].textContent, "4 need review");
  assert.equal(p.node["u-rows"].children.length, 2);
  assert.equal(p.node["u-rows"].children[0].textContent,
    "Sample Store AArrived more than 72 hours after the period ended12.40 GB measured · Period ended Oct 31, 2026Received Nov 4, 2026, 9:30 AMReview");
  assert.match(p.node["u-rows"].children[1].textContent, /^Sample Store BNo billing cycle3\.05 GB measured/);
  assert.equal(p.node["u-empty"].hidden, true);
  assert.equal(p.node["more-row"].hidden, true);
});

test("an empty list says nothing needs review", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: list([]) });
  assert.deepEqual(p.shown(), ["v-list"]);
  assert.equal(p.node["u-empty"].hidden, false);
});

test("Load more asks for the next page with the cursor and adds to the list", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: (call) => (call.body.cursor
    ? list([entry({ entry: "ue_two", site: { id: "s", name: "Sample Store C" } })], { needs_review_count: 2 })
    : list([entry()], { next_cursor: "ue_one", needs_review_count: 2 })) });
  assert.equal(p.node["more-row"].hidden, false);
  p.node.more.fire("click");
  assert.equal(p.node.more.disabled, true);
  await settle();
  assert.deepEqual(p.sent(LIST)[1].body, { cursor: "ue_one" });
  assert.equal(p.node["u-rows"].children.length, 2);
  assert.match(p.node["u-rows"].children[1].textContent, /^Sample Store C/);
  assert.equal(p.node["more-row"].hidden, true);
});

test("a failed Load more keeps the loaded rows, says so under them, and can be tried again", async () => {
  let fail = [400, refused("invalid_cursor")];
  const p = await page({ "GET me/": [200, ME], [LIST]: (call) => (call.body.cursor
    ? fail
    : list([entry()], { next_cursor: "ue_one", needs_review_count: 2 })) });
  p.node.more.fire("click");
  await settle();
  assert.deepEqual(p.shown(), ["v-list"], "the list stays, not the error card");
  assert.equal(p.node["u-rows"].children.length, 1);
  assert.equal(p.node["u-more-err"].hidden, false);
  assert.equal(p.node["u-more-err"].textContent, "More records could not be loaded. Try Load more again.");
  assert.doesNotMatch(p.node["u-more-err"].textContent, /invalid_cursor/);
  assert.equal(p.node["more-row"].hidden, false);
  assert.equal(p.node.more.disabled, false);
  fail = [500, {}];
  p.node.more.fire("click");
  await settle();
  assert.deepEqual(p.shown(), ["v-list"]);
  assert.equal(p.node["u-rows"].children.length, 1);
  assert.equal(p.node["u-more-err"].hidden, false);
  fail = list([entry({ entry: "ue_two", site: { id: "s", name: "Sample Store C" } })]);
  p.node.more.fire("click");
  await settle();
  assert.equal(p.node["u-rows"].children.length, 2);
  assert.equal(p.node["u-more-err"].hidden, true, "the error goes once a retry works");
});

test("a 404 shows the not-switched-on view and any other failure shows the down view with a retry", async () => {
  const closed = await page({ "GET me/": [200, ME], [LIST]: [404, refused("not_found")] });
  assert.deepEqual(closed.shown(), ["v-closed"]);
  let answer = [500, {}];
  const down = await page({ "GET me/": [200, ME], [LIST]: () => answer });
  assert.deepEqual(down.shown(), ["v-down"]);
  answer = list([entry()]);
  down.node.retry.fire("click");
  await settle();
  assert.deepEqual(down.shown(), ["v-list"]);
  assert.equal(down.sent("GET me/").length, 1, "who is signed in is asked once");
});

test("a person who is not signed in is sent to sign in, and one at the second step to verify", async () => {
  const a = await page({ "GET me/": [401, refused("unauthenticated")] });
  assert.equal(a.location.replaced, "/sign-in/");
  const b = await page({ "GET me/": [401, refused("second_step_required")] });
  assert.equal(b.location.replaced, "/verify/");
});

test("Review opens one record: its facts and history in words, with an address that holds nothing", async () => {
  const p = await opened(detail({ history: [
    { code: "recorded_needs_review", actor: "intake", at: "2026-11-04T09:30:00+08:00" },
    { code: "operator_held", actor: "operator", at: "2026-11-05T10:00:00+08:00" }] }));
  assert.deepEqual(p.sent(DETAIL)[0].body, { entry: "ue_one" });
  assert.deepEqual(p.shown(), ["v-one"]);
  assert.equal(p.node["uo-site"].textContent, "Sample Store A");
  assert.equal(p.node["uo-reason"].textContent, "Arrived more than 72 hours after the period ended");
  assert.equal(p.node["uo-gb"].textContent, "12.40 GB");
  assert.equal(p.node["uo-cycle"].textContent, "Cycle 3");
  assert.equal(p.node["uo-pend"].textContent, "Oct 31, 2026");
  assert.equal(p.node["uo-recv"].textContent, "Nov 4, 2026, 9:30 AM");
  assert.deepEqual(p.node["uo-hist"].children.map((li) => li.textContent),
    ["Held for review by the systemNov 4, 2026, 9:30 AM", "Held by an operatorNov 5, 2026, 10:00 AM"]);
  assert.equal(p.location.pathname, "/finance/usage/");
  assert.equal(p.location.assigned, null);
});

test("a record with no cycle says None, and shows no amount anywhere", async () => {
  const p = await opened(detail({ reason: "no_cycle", cycle: null }));
  assert.equal(p.node["uo-cycle"].textContent, "None");
  for (const id of ["uo-body", "u-rows"]) assert.doesNotMatch(p.node[id].textContent, /PHP|₱|\bamount\b/i);
});

test("Admit is offered only for a record that arrived late; Dismiss is offered for every record", async () => {
  const late = await opened(detail({ reason: "late_over_72h" }));
  assert.equal(late.node["uo-admit"].hidden, false);
  assert.equal(late.node["uo-note"].hidden, true);
  assert.equal(late.node["uo-dismiss"].hidden, false);
  for (const reason of ["no_cycle", "after_service_end"]) {
    const p = await opened(detail({ reason }));
    assert.equal(p.node["uo-admit"].hidden, true, reason);
    assert.equal(p.node["uo-note"].hidden, false, reason);
    assert.equal(p.node["uo-dismiss"].hidden, false, reason);
  }
});

test("an unknown reason, event or actor shows nothing raw", async () => {
  const p = await opened(detail({ reason: "a_new_reason_code", history: [
    { code: "a_new_event", actor: "operator", at: "2026-11-04T09:30:00+08:00" },
    { code: "operator_dismissed", actor: "a_new_actor", at: "2026-11-04T09:30:00+08:00" },
    { code: "operator_counted", actor: "operator", at: "2026-11-06T09:30:00+08:00" }] }));
  assert.equal(p.node["uo-reason"].textContent, "");
  assert.equal(p.node["uo-reason"].hidden, true);
  assert.deepEqual(p.node["uo-hist"].children.map((li) => li.textContent), ["Admitted, billed by an operatorNov 6, 2026, 9:30 AM"]);
  for (const id of ["uo-site", "uo-reason", "uo-hist"]) assert.doesNotMatch(p.node[id].textContent, /a_new|_/, id);
  const q = await page({ "GET me/": [200, ME], [LIST]: list([entry({ reason: "a_new_reason_code" })]) });
  assert.doesNotMatch(q.node["u-rows"].textContent, /a_new|_/);
  assert.equal(q.node["u-rows"].children[0].all((n) => n.classList.contains("chip")).length, 0);
});

test("the Dismiss dialog needs a reason of at most 300 characters, and nothing is sent without one", async () => {
  const p = await opened();
  dismissWith(p, "   ");
  assert.equal(p.node["m-dismiss"].hidden, false);
  assert.equal(p.node["dismiss-e"].hidden, false);
  assert.equal(p.node["dismiss-e"].textContent, "Write a reason.");
  assert.equal(p.sent(DISMISS).length, 0);
  p.node["dismiss-f"].value = "x".repeat(301);
  p.node["dismiss-form"].fire("submit");
  assert.equal(p.node["dismiss-e"].textContent, "The reason is at most 300 characters.");
  assert.equal(p.sent(DISMISS).length, 0);
  p.node["dismiss-f"].value = "x".repeat(7);
  p.node["dismiss-f"].fire("input");
  assert.equal(p.node["dismiss-count"].textContent, "7 of 300");
});

test("the Admit dialog needs a reason too, and nothing is sent without one", async () => {
  const p = await opened();
  admitWith(p, "");
  assert.equal(p.node["admit-e"].textContent, "Write a reason.");
  p.node["admit-f"].value = "y".repeat(301);
  p.node["admit-form"].fire("submit");
  assert.equal(p.node["admit-e"].textContent, "The reason is at most 300 characters.");
  assert.equal(p.sent(ADMIT).length, 0);
});

test("Dismiss sends the entry and the reason, then returns to the list with one line", async () => {
  const p = await opened(detail(), { [DISMISS]: [200, detail()] });
  dismissWith(p, " Measured twice. ");
  assert.equal(p.node["dismiss-go"].disabled, true, "one decision at a time");
  await settle();
  assert.deepEqual(p.sent(DISMISS)[0].body, { entry: "ue_one", reason: "Measured twice." });
  assert.equal(p.node["m-dismiss"].hidden, true);
  assert.equal(p.node["dismiss-go"].disabled, false);
  assert.deepEqual(p.shown(), ["v-list"]);
  assert.equal(p.node["u-msg"].textContent, "Dismissed, not billable");
  assert.equal(p.node["u-msg"].hidden, false);
  assert.equal(p.sent(LIST).length, 2, "the list is read again");
});

test("Admit sends the entry and the reason, then returns to the list with one line", async () => {
  const p = await opened(detail(), { [ADMIT]: [200, detail()] });
  admitWith(p, "Arrived late, confirmed with the producer.");
  await settle();
  assert.deepEqual(p.sent(ADMIT)[0].body, { entry: "ue_one", reason: "Arrived late, confirmed with the producer." });
  assert.equal(p.node["u-msg"].textContent, "Admitted");
  assert.deepEqual(p.shown(), ["v-list"]);
});

test("not_admissible is worded in the dialog, which stays open", async () => {
  const p = await opened(detail(), { [ADMIT]: [409, refused("not_admissible")] });
  admitWith(p, "A reason.");
  await settle();
  assert.equal(p.node["m-admit"].hidden, false);
  assert.equal(p.node["admit-e"].textContent, "Only a record that arrived more than 72 hours late can be admitted. Dismiss it instead.");
  assert.doesNotMatch(p.node["admit-e"].textContent, /not_admissible|A message the page does not show/);
  assert.equal(p.node["admit-go"].disabled, false);
  assert.deepEqual(p.shown(), ["v-one"]);
});

test("a 404 on a decision closes the dialog and returns to the list; not_under_review says so", async () => {
  const gone = await opened(detail(), { [DISMISS]: [404, refused("not_found")] });
  dismissWith(gone, "A reason.");
  await settle();
  assert.equal(gone.node["m-dismiss"].hidden, true);
  assert.deepEqual(gone.shown(), ["v-list"]);
  assert.equal(gone.node["u-msg"].hidden, true);
  const decided = await opened(detail(), { [DISMISS]: [409, refused("not_under_review")] });
  dismissWith(decided, "A reason.");
  await settle();
  assert.deepEqual(decided.shown(), ["v-list"]);
  assert.equal(decided.node["u-msg"].textContent, "This record is no longer waiting for review. It was already decided.");
});

test("when the list itself answers 404 after a decision, the not-switched-on view shows", async () => {
  let calls = 0;
  const p = await opened(detail(), { [DISMISS]: [404, refused("not_found")], [LIST]: () => (++calls === 1 ? list([entry()]) : [404, refused("not_found")]) });
  dismissWith(p, "A reason.");
  await settle();
  assert.deepEqual(p.shown(), ["v-closed"]);
});

test("a refusal of the reason, and a failure that is not understood, are worded without raw codes", async () => {
  const bad = await opened(detail(), { [DISMISS]: [400, { error: { code: "invalid_request", message: "Raw words.", fields: { reason: ["x"] } } }] });
  dismissWith(bad, "A reason.");
  await settle();
  assert.equal(bad.node["dismiss-e"].textContent, "Check the reason. It is required and at most 300 characters.");
  const lost = await opened(detail(), { [DISMISS]: [500, {}] });
  dismissWith(lost, "A reason.");
  await settle();
  assert.equal(lost.node["dismiss-e"].textContent, "That did not go through. Check the record before trying again.");
  assert.equal(lost.sent(DETAIL).length, 2, "the record is read again");
  assert.equal(lost.node["m-dismiss"].hidden, false);
});

test("Back to usage review returns to the list, and a reload opens the list again", async () => {
  const p = await opened();
  const e = p.node["u-back"].fire("click");
  assert.equal(e.prevented, true);
  await settle();
  assert.deepEqual(p.shown(), ["v-list"]);
  const again = await page({ "GET me/": [200, ME], [LIST]: list([entry()]) });
  assert.deepEqual(again.shown(), ["v-list"]);
  assert.equal(again.sent(DETAIL).length, 0);
});

test("the page uses no browser storage and the shared helpers use no console", () => {
  for (const f of ["finance-usage.js", "finance-common.js"]) {
    const js = fs.readFileSync(new URL("../public/assets/js/" + f, import.meta.url), "utf8");
    assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie|console\./, f);
  }
});
