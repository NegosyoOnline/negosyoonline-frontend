/* The "Bulk SMS" button and the "Sending" chip on the SMS list (plan 9, task 1). The button is drawn only when
   bulk/status/ answers 200; on every other answer nothing is drawn and no error shows. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { inbox, settle, status, refusal } from "./inbox-page.mjs";

const html = fs.readFileSync(new URL("../public/inbox.html", import.meta.url), "utf8");
const BULK = { bulk: true, running: false, used_today: 610, left_today: 1090, reserved_for_codes: 300, opt_out_line: " Reply STOP to opt out", text_max: 138 };
const withBulk = (reply = () => [200, BULK], over = {}) => inbox({ "bulk/status/": reply, ...over });
const chipShown = (p) => !p.node["bulk-chip"].hidden;

test("with a 200 the Bulk SMS button shows beside New SMS and links to the one bulk address", async () => {
  const p = withBulk();
  await settle();
  assert.equal(p.node["bulk-link"].hidden, false);
  assert.match(html, /<a class="no-btn no-btn-ghost" id="bulk-link" href="\/inbox\/sms\/bulk\/" hidden><span>Bulk SMS<\/span>/);
  assert.equal(chipShown(p), false);
});

test("the Sending chip shows only when inbox/status/ says a batch is running", async () => {
  const p = withBulk(() => [200, BULK], { "inbox/status/": () => [200, status({ bulk_running: true })] });
  await settle();
  assert.equal(p.node["bulk-link"].hidden, false);
  assert.equal(chipShown(p), true);
  assert.match(html, /id="bulk-chip" hidden>Sending<\/span>/);
});

test("with 404, 401, 503, an unreadable answer or offline there is no button and no error", async () => {
  for (const reply of [() => [404, refusal("not_found")], () => [401, refusal("unauthenticated")], () => [503, {}], () => [200, { bulk: false }], () => "offline"]) {
    const p = withBulk(reply);
    await settle();
    assert.equal(p.node["bulk-link"].hidden, true);
    assert.equal(p.location.replaced, null);
    assert.equal(p.node["v-list"].hidden, false);
    assert.equal(p.node["v-down"].hidden, true);
  }
});

test("the call is one POST bulk/status/ with no body and nothing in the address", async () => {
  const p = withBulk();
  await settle();
  const calls = p.calls_to("bulk/status/");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body, undefined);
  assert.doesNotMatch(calls[0].url, /[?#]/);
});

test("next.config.ts rewrites /inbox/sms/bulk/ to bulk.html and redirects /bulk.html", () => {
  const cfg = fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(cfg, /source: "\/inbox\/sms\/bulk\/", destination: "\/bulk\.html"/);
  assert.match(cfg, /source: "\/bulk\.html", destination: "\/inbox\/sms\/bulk\/"/);
});
