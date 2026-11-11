/* bulk.js: boot, the list of bulk sends, and Stop (plan 9, task 2). Driven through the stand-in document. They
   prove the page follows the backend's answers and keeps the rules; they do not prove the look. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bulk, settle, batch, refusal } from "./bulk-page.mjs";

const src = fs.readFileSync(new URL("../public/assets/js/bulk.js", import.meta.url), "utf8");
const SENDING = batch({ batch: "bulk_2", state: "sending", source: "groups", size: 1486, sent: 396, failed: 0, not_sent: 16, waiting: 1074, seconds_left: 23091 });
const WAITING = batch({ batch: "bulk_3", state: "waiting", size: 500, sent: 0, failed: 0, not_sent: 0, waiting: 500, seconds_left: 10750 });
const STOPPED = batch({ batch: "bulk_4", state: "stopped", size: 1500, sent: 236, failed: 1, not_sent: 3, waiting: 1260 });
const FINISHED = batch({ batch: "bulk_5", state: "finished", source: "file", size: 1640, sent: 1629, failed: 0, not_sent: 11, waiting: 0 });
const listOf = (...b) => ({ "bulk/list/": () => [200, { results: b, next: null }], "bulk/open/": (body) => [200, { ...b.find((x) => x.batch === body.batch), results: [], next: null }] });
const rowText = (p) => p.rows().map((li) => li.textContent);

test("boot: me/, bulk/status/, the groups, the list; one call each, nothing in any address", async () => {
  const p = bulk();
  await settle();
  assert.deepEqual(p.log.map((l) => [l.method, l.route]), [["GET", "me/"], ["POST", "bulk/status/"], ["POST", "contacts/groups/list/"], ["POST", "bulk/list/"]]);
  for (const l of p.log) assert.doesNotMatch(l.url, /[?#]|bulk\/[^/]+\/.+/);
  assert.equal(p.shown("v-page"), true);
  assert.equal(p.shown("boot"), false);
  assert.equal(p.text("acct-name"), "sample.staff");
  assert.equal(p.shown("l-empty"), true);
});

test("a 401 sends the person to sign in or the second step and calls nothing more", async () => {
  const p = bulk({ "me/": () => [401, refusal("second_step_required")] });
  await settle();
  assert.equal(p.location.replaced, "/verify/");
  assert.equal(p.log.length, 1);
  const q = bulk({ "bulk/status/": () => [401, refusal("unauthenticated")] });
  await settle();
  assert.equal(q.location.replaced, "/sign-in/");
});

test("a 404 shows the closed card with no reason; offline or another answer shows the try-again card", async () => {
  const p = bulk({ "bulk/status/": () => [404, refusal("not_found")] });
  await settle();
  assert.equal(p.shown("v-closed"), true);
  assert.equal(p.shown("v-page"), false);
  assert.equal(p.calls_to("bulk/list/").length, 0);
  for (const reply of [() => "offline", () => [503, {}]]) {
    const q = bulk({ "bulk/status/": reply });
    await settle();
    assert.equal(q.shown("v-down"), true);
  }
  const r = bulk({ "me/": () => "offline" });
  await settle();
  assert.equal(r.shown("v-down"), true);
});

test("the four states show their chip, counts line and buttons; no row holds a number or a text", async () => {
  const p = bulk(listOf(SENDING, WAITING, STOPPED, FINISHED));
  await settle();
  const [sending, waiting, stopped, finished] = p.rows();
  const chips = (li) => li.all((n) => n.classList.contains("chip")).map((n) => n.textContent);
  const btns = (li) => li.all((n) => n.tagName === "BUTTON").map((n) => n.textContent);
  assert.deepEqual(chips(sending), ["Still sending"]);
  assert.match(sending.textContent, /396 of 1,486 sent, 16 not sent, 1,074 waiting\. About 7 hours left\. Started by sample\.staff\./);
  assert.deepEqual(btns(sending), ["View", "Stop sending"]);
  assert.ok(sending.all((n) => n.classList.contains("bar")).length === 1);
  assert.deepEqual(chips(waiting), ["Waiting"]);
  assert.match(waiting.textContent, /500 texts\. Waiting for the phone\./);
  assert.deepEqual(btns(waiting), ["View", "Stop sending"]);
  assert.deepEqual(chips(stopped), ["Stopped"]);
  assert.match(stopped.textContent, /Stopped at 240 of 1,500 by sample\.staff: 236 sent, 4 not sent, 1,260 never sent\./);
  assert.deepEqual(btns(stopped), ["View"]);
  assert.deepEqual(chips(finished), ["Finished"]);
  assert.match(finished.textContent, /1,640 handled|1,640 of 1,640 handled: 1,629 sent, 11 not sent\. Started by sample\.staff\./);
  assert.deepEqual(btns(finished), ["View"]);
  assert.match(sending.textContent, /Groups/);
  assert.match(finished.textContent, /CSV file/);
  assert.match(waiting.textContent, /Pasted numbers/);
  assert.doesNotMatch(rowText(p).join("|"), /\+63|09\d\d|SECRET/);
});

test("a time left under an hour reads Under an hour, and the backend's figure is used when it sends none", async () => {
  const p = bulk(listOf(batch({ state: "sending", waiting: 100, seconds_left: 2150, size: 200, sent: 100 }), batch({ batch: "bulk_9", state: "sending", waiting: 3000, seconds_left: undefined, size: 3000, sent: 0 })));
  await settle();
  assert.match(p.rows()[0].textContent, /Under an hour left/);
  assert.match(p.rows()[1].textContent, /About 18 hours left/);
});

test("Load more passes the cursor and adds to the list", async () => {
  let n = 0;
  const p = bulk({ "bulk/list/": () => (++n === 1 ? [200, { results: [FINISHED], next: "c2" }] : [200, { results: [STOPPED], next: null }]) });
  await settle();
  assert.equal(p.shown("l-foot"), true);
  p.click("more");
  await settle();
  assert.deepEqual(p.calls_to("bulk/list/")[1].body, { cursor: "c2" });
  assert.equal(p.rows().length, 2);
  assert.equal(p.shown("l-foot"), false);
});

test("Stop asks once: the X and Escape post nothing, there is no Cancel, the primary is the red stop primary", async () => {
  const p = bulk(listOf(SENDING));
  await settle();
  const stop = p.rows()[0].all((n) => n.tagName === "BUTTON" && n.textContent === "Stop sending")[0];
  stop.fire("click");
  assert.equal(p.shown("m-pop"), true);
  assert.equal(p.text("pop-h"), "Stop this batch?");
  assert.match(p.text("pop-sub"), /Texts already sent stay sent\. 1,074 texts not yet with the phone will not be sent\./);
  assert.equal(p.text("pop-go"), "Stop sending");
  const html = fs.readFileSync(new URL("../public/bulk.html", import.meta.url), "utf8");
  assert.match(html, /class="no-btn no-btn-ghost stop fin-block" type="button" id="pop-go"/);
  assert.doesNotMatch(html, /Cancel/);
  p.click("pop-x");
  assert.equal(p.shown("m-pop"), false);
  stop.fire("click");
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(p.shown("m-pop"), false);
  assert.equal(p.calls_to("bulk/stop/").length, 0);
});

test("the primary posts bulk/stop/ with the id from memory and the list is read again", async () => {
  let stopped = false;
  const p = bulk({ ...listOf(SENDING), "bulk/stop/": () => { stopped = true; return [200, { ...SENDING, state: "stopped" }]; },
    "bulk/list/": () => [200, { results: [stopped ? { ...SENDING, state: "stopped", waiting: 0 } : SENDING], next: null }] });
  await settle();
  p.rows()[0].all((n) => n.tagName === "BUTTON" && n.textContent === "Stop sending")[0].fire("click");
  p.click("pop-go");
  await settle();
  assert.deepEqual(p.calls_to("bulk/stop/")[0].body, { batch: "bulk_2" });
  assert.equal(p.shown("m-pop"), false);
  assert.equal(p.text("msg"), "Batch stopped.");
  assert.deepEqual(p.rows()[0].all((n) => n.tagName === "BUTTON").map((n) => n.textContent), ["View"]);
});

test("not_running says so and refreshes; a failure stays in the pop-up in fixed words", async () => {
  const p = bulk({ ...listOf(SENDING), "bulk/stop/": () => [409, refusal("not_running", "RAW BACKEND WORDS")] });
  await settle();
  p.rows()[0].all((n) => n.tagName === "BUTTON" && n.textContent === "Stop sending")[0].fire("click");
  p.click("pop-go");
  await settle();
  assert.equal(p.text("msg"), "That batch is no longer sending.");
  const q = bulk({ ...listOf(SENDING), "bulk/stop/": () => [500, refusal("boom", "RAW BACKEND WORDS")] });
  await settle();
  q.rows()[0].all((n) => n.tagName === "BUTTON" && n.textContent === "Stop sending")[0].fire("click");
  q.click("pop-go");
  await settle();
  assert.equal(q.shown("m-pop"), true);
  assert.doesNotMatch(q.text("pop-err"), /RAW/);
});

test("no interval anywhere, no storage, no console, and one timer only (the revoke of a download)", () => {
  assert.doesNotMatch(src, /setInterval|requestAnimationFrame|localStorage|sessionStorage|console\.|document\.cookie|innerHTML|insertAdjacentHTML/);
  assert.equal((src.match(/setTimeout/g) || []).length, 1);
});
