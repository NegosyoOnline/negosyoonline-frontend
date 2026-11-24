/* bulk.js: step 3, the progress, and what refreshes it (plan 9, task 5). */
import test from "node:test";
import assert from "node:assert/strict";
import { bulk, settle, batch } from "./bulk-page.mjs";

const RUN = batch({ batch: "bulk_2", state: "sending", source: "groups", size: 1486, sent: 396, failed: 0, not_sent: 16, waiting: 1074, seconds_left: 23091 });
const R = [{ number: "+63 900 ••• 0101", state: "sent", reason: "" }, { number: "+63 900 ••• 0103", state: "not_sent", reason: "phone_failed" },
  { number: "+63 900 ••• 0104", state: "waiting", reason: "" }, { number: "+63 900 ••• 0105", state: "queued", reason: "" },
  { number: "+63 900 ••• 0106", state: "not_sent", reason: "a_new_reason" }, { number: "+63 900 ••• 0107", state: "failed", reason: "expired" }];
const run = (over = {}, results = R, next = null, extra = {}) => ({ "bulk/list/": () => [200, { results: [{ ...RUN, ...over }], next: null }],
  "bulk/open/": () => [200, { ...RUN, ...over, results, next }], ...extra });
const chips = (p, id) => p.node[id].all((n) => n.classList.contains("chip")).map((n) => n.textContent);

test("a running batch opens in step 3 at boot: the bar, the strip and the masked results", async () => {
  const p = bulk(run());
  await settle();
  assert.equal(p.shown("b-step3"), true);
  assert.deepEqual(p.calls_to("bulk/open/")[0].body, { batch: "bulk_2", limit: 100 });
  assert.equal(p.node["p-bar"].getAttribute("aria-valuenow"), "412");
  assert.equal(p.node["p-bar"].getAttribute("aria-valuemax"), "1486");
  assert.equal(p.node["p-bar"].getAttribute("aria-label"), "412 of 1,486 handled");
  assert.equal(p.node["p-fill"].style.width, "28%");
  assert.deepEqual(chips(p, "p-strip"), ["396 sent", "1,074 waiting", "16 not sent", "About 7 hours"]);
  assert.equal(p.shown("p-stop"), true);
  assert.equal(p.shown("v-form"), false, "the form is dropped while a batch is sending");
});

test("a reason chip for each reason in the table, and Not sent for an unknown one; no raw backend word is shown", async () => {
  const p = bulk(run());
  await settle();
  const rows = p.node["p-rows"].children.map((li) => li.textContent);
  assert.deepEqual(rows, ["+63 900 ••• 0101Sent", "+63 900 ••• 0103Not sent: the gateway phone could not send it", "+63 900 ••• 0104Waiting",
    "+63 900 ••• 0105With the phone", "+63 900 ••• 0106Not sent", "+63 900 ••• 0107Not sent: the phone did not take it in time"]);
  for (const [reason, words] of [["no_report", "the phone did not report back"], ["staff_limit", "today's limit was reached"], ["day_ended", "the day ended"],
    ["stopped", "the batch was stopped"], ["record_gone", "its record was gone"]]) {
    const q = bulk(run({}, [{ number: "+63 900 ••• 0100", state: "not_sent", reason }]));
    await settle();
    assert.equal(q.node["p-rows"].children[0].textContent, "+63 900 ••• 0100Not sent: " + words, reason);
  }
});

test("Load more passes the cursor", async () => {
  let n = 0;
  const p = bulk(run({}, R, "5", { "bulk/open/": () => (++n === 1 ? [200, { ...RUN, results: R, next: "5" }] : [200, { ...RUN, results: [{ number: "+63 900 ••• 0108", state: "sent", reason: "" }], next: null }]) }));
  await settle();
  assert.equal(p.shown("p-foot"), true);
  p.click("p-more");
  await settle();
  assert.deepEqual(p.calls_to("bulk/open/")[1].body, { batch: "bulk_2", limit: 100, cursor: "5" });
  assert.equal(p.node["p-rows"].children.length, 7);
  assert.equal(p.shown("p-foot"), false);
});

test("with no rows the page shows the counts and that the numbers are no longer kept", async () => {
  const done = batch({ batch: "bulk_8", state: "finished" });
  const p = bulk({ "bulk/list/": () => [200, { results: [done], next: null }], "bulk/open/": () => [200, { ...done, results: [], next: null }] });
  await settle();
  assert.equal(p.shown("b-step3"), false, "a finished batch does not open by itself");
  p.rows()[0].all((n) => n.tagName === "BUTTON" && n.textContent === "View")[0].fire("click");
  await settle();
  assert.equal(p.shown("b-step3"), true);
  assert.equal(p.shown("p-gone"), true);
  assert.equal(p.shown("p-stop"), false);
  assert.deepEqual(chips(p, "p-strip"), ["1,490 sent", "0 waiting", "10 not sent"]);
  assert.equal(p.shown("v-form"), true);
});

test("Refresh and the tab becoming visible read the status, the list and the open batch, and nothing else", async () => {
  const p = bulk(run());
  await settle();
  const before = p.log.length;
  p.click("refresh");
  await settle();
  p.doc.fire("visibilitychange");
  await settle();
  assert.deepEqual([...new Set(p.log.slice(before).map((l) => l.route))].sort(), ["bulk/list/", "bulk/open/", "bulk/status/"]);
  assert.equal(p.log.slice(before).filter((l) => l.route === "bulk/open/").length, 2);
});

test("a refresh that finds the batch finished brings the form back", async () => {
  let finished = false;
  const p = bulk({ "bulk/list/": () => [200, { results: [finished ? { ...RUN, state: "finished", waiting: 0 } : RUN], next: null }],
    "bulk/open/": () => [200, { ...RUN, state: finished ? "finished" : "sending", waiting: finished ? 0 : 1074, results: [], next: null }],
    "bulk/status/": () => [200, { bulk: true, running: !finished, used_today: 1, left_today: 2, reserved_for_codes: 300, text_max: 160 }] });
  await settle();
  assert.equal(p.shown("v-form"), false);
  finished = true;
  p.click("refresh");
  await settle();
  assert.equal(p.shown("v-form"), true);
  assert.equal(p.shown("p-stop"), false);
});

test("the Stop on the progress opens the same pop-up and posts the id from memory", async () => {
  const p = bulk(run({}, R, null, { "bulk/stop/": () => [200, { ...RUN, state: "stopped" }] }));
  await settle();
  p.click("p-stop");
  assert.equal(p.shown("m-pop"), true);
  p.click("pop-go");
  await settle();
  assert.deepEqual(p.calls_to("bulk/stop/")[0].body, { batch: "bulk_2" });
});

test("a 404 on the open batch drops step 3 with a fixed sentence", async () => {
  const p = bulk({ ...run(), "bulk/open/": () => [404, { error: { code: "not_found", message: "RAW", fields: {} } }] });
  await settle();
  assert.equal(p.shown("b-step3"), false);
  assert.equal(p.text("msg"), "That batch is no longer available.");
});
