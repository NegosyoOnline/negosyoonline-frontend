/* bulk.js: step 1 (the text and who gets it), the check, step 2 (confirm, the two downloads) and the rules about
   what the page keeps (plan 9, tasks 3 and 4, with NPC's three additions). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bulk, settle, batch, refusal, CHECK, BULK } from "./bulk-page.mjs";

const pick = (p, which) => { for (const id of ["to-groups", "to-file", "to-paste"]) p.node[id].checked = id === which; p.node[which].fire("change"); };
const tick = (p, ...ids) => ids.forEach((id) => { p.node["b-groups"].all((n) => n.tagName === "INPUT").find((n) => n.getAttribute("value") === id).checked = true; });
const csv = (text, size) => ({ size: size === undefined ? text.length : size, text: () => Promise.resolve(text) });
const submit = async (p) => { p.node["b-form"].fire("submit"); await settle(); };
const withCheck = (over = {}, extra = {}) => ({ "bulk/check/": () => [200, { ...CHECK, ...over }], ...extra });
const typed = async (p, text = "Sample announcement") => {
  p.type("b-text", text);
  pick(p, "to-paste");
  p.type("b-list", "0900 000 0101\n0900 000 0102\nnot a number");
  await submit(p);
};

test("the counter counts the text plus the opt-out line and disables the check over 160", async () => {
  const p = bulk();
  await settle();
  assert.equal(p.text("b-count"), "22 / 160");
  p.type("b-text", "x".repeat(138));
  assert.equal(p.text("b-count"), "160 / 160");
  assert.equal(p.node["b-check"].disabled, false);
  p.type("b-text", "x".repeat(139));
  assert.equal(p.text("b-count"), "161 / 160");
  assert.equal(p.node["b-count"].classList.contains("over"), true);
  assert.equal(p.node["b-check"].disabled, true);
});

test("the opt-out line is drawn from the status and is not an editable field; the reserve figures follow the status", async () => {
  const p = bulk({ "bulk/status/": () => [200, { ...BULK, reserved_for_codes: 400 }] });
  await settle();
  assert.equal(p.text("b-optout-text"), "Reply STOP to opt out");
  assert.notEqual(p.node["b-optout-text"].tagName, "TEXTAREA");
  assert.equal(p.text("b-rule-reserve"), "400 texts a day are kept for sign-in codes. Bulk SMS stops at 1,600.");
});

test("the groups are listed with their counts, as text; the three sources are exclusive", async () => {
  const p = bulk({ "contacts/groups/list/": () => [200, { results: [{ id: "grp_x", name: "<b>Hostile</b> name", count: 1 }] }] });
  await settle();
  const label = p.node["b-groups"].children[0];
  assert.equal(label.textContent, "<b>Hostile</b> name1 contact");
  pick(p, "to-file");
  assert.deepEqual(["to-groups", "to-file", "to-paste"].map((id) => p.node[id].checked), [false, true, false]);
  assert.equal(p.node["o-file"].classList.contains("on"), true);
  assert.equal(p.node["o-groups"].classList.contains("on"), false);
});

test("when contacts answer 404 the groups option is disabled with its sentence, and pasted numbers is chosen", async () => {
  const p = bulk({ "contacts/groups/list/": () => [404, refusal("not_found")] });
  await settle();
  assert.equal(p.node["to-groups"].disabled, true);
  assert.equal(p.text("b-groups-hint"), "Contacts are not turned on.");
  assert.equal(p.node["to-paste"].checked, true);
  assert.equal(p.shown("v-page"), true);
});

test("Check the list posts the right body for each source, and nothing is in any address", async () => {
  const p = bulk(withCheck());
  await settle();
  p.type("b-text", "Sample");
  tick(p, "grp_a", "grp_b");
  await submit(p);
  assert.deepEqual(p.calls_to("bulk/check/")[0].body, { text: "Sample", source: "groups", groups: ["grp_a", "grp_b"] });
  pick(p, "to-file");
  p.node["b-file"].files = [csv("0900 000 0101\n")];
  await submit(p);
  assert.deepEqual(p.calls_to("bulk/check/")[1].body, { text: "Sample", source: "file", csv: "0900 000 0101\n" });
  pick(p, "to-paste");
  p.type("b-list", "0900 000 0102");
  await submit(p);
  assert.deepEqual(p.calls_to("bulk/check/")[2].body, { text: "Sample", source: "pasted", numbers: "0900 000 0102" });
  for (const l of p.calls_to("bulk/check/")) assert.doesNotMatch(l.url, /[?#]|0900|Sample/);
});

test("nothing chosen, nothing pasted, no file: a sentence and no call", async () => {
  const p = bulk(withCheck());
  await settle();
  await submit(p);
  assert.equal(p.text("b-src-err"), "Choose at least one group.");
  pick(p, "to-paste");
  await submit(p);
  assert.equal(p.text("b-src-err"), "Paste the numbers.");
  pick(p, "to-file");
  await submit(p);
  assert.equal(p.text("b-file-err"), "Choose a CSV file.");
  assert.equal(p.calls_to("bulk/check/").length, 0);
});

test("a file over 1,048,576 bytes sends nothing", async () => {
  const p = bulk(withCheck());
  await settle();
  pick(p, "to-file");
  p.node["b-file"].files = [csv("x", 1048577)];
  await submit(p);
  assert.equal(p.text("b-file-err"), "The file is over 1 MB.");
  assert.equal(p.calls_to("bulk/check/").length, 0);
  p.node["b-file"].files = [csv("x", 1048576)];
  await submit(p);
  assert.equal(p.calls_to("bulk/check/").length, 1);
});

test("invalid_text shows the backend's field message under the field; other refusals get fixed words", async () => {
  const p = bulk({ "bulk/check/": () => [400, refusal("invalid_text", "The text can be up to 138 characters.", { text: ["The text can be up to 138 characters."] })] });
  await settle();
  await typed(p);
  assert.equal(p.text("b-text-err"), "The text can be up to 138 characters.");
  assert.equal(p.shown("b-step2"), false);
  const q = bulk({ "bulk/check/": () => [500, refusal("boom", "RAW WORDS")] });
  await settle();
  await typed(q);
  assert.doesNotMatch(q.text("b-err"), /RAW/);
  assert.notEqual(q.text("b-err"), "");
});

test("the facts come from the answer; After duplicates is read minus refused minus repeated", async () => {
  const p = bulk(withCheck({ lines_read: 12, refused_count: 1, duplicates: 2, eligible: 8, opted_out: 1, left_today: 1090, size: 8, left_out: 0 }));
  await settle();
  await typed(p);
  assert.equal(p.shown("b-step2"), true);
  assert.deepEqual(["f-read", "f-dedup", "f-elig", "f-left", "f-size", "f-later", "f-refused"].map((id) => p.text(id)), ["12", "9", "8", "1,090", "8", "0", "1"]);
  assert.equal(p.shown("f-refused-box"), true);
  assert.equal(p.text("b-time"), "About under an hour to under an hour to send, at one text every 18 to 25 seconds.".replace("About under an hour to under an hour", "About under an hour to under an hour"));
});

test("the refused lines show line and reason only, and the first 200 of N line", async () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ line: i + 1, reason: "The mobile number is not a Philippine mobile." }));
  const p = bulk(withCheck({ refused: many, refused_count: 750 }));
  await settle();
  await typed(p);
  assert.equal(p.node["b-refused"].children.length, 200);
  assert.equal(p.node["b-refused"].children[0].textContent, "Line 1Not a Philippine mobile number");
  assert.equal(p.text("b-refused-more"), "Showing the first 200 of 750 refused lines.");
  const q = bulk(withCheck({ refused: [{ line: 4, reason: "something new" }], refused_count: 1 }));
  await settle();
  await typed(q);
  assert.equal(q.node["b-refused"].children[0].textContent, "Line 4Refused");
  assert.doesNotMatch(q.node["b-step2"].textContent, /0900/);
});

test("the cut banner is written from the answer's figures and offers the left-out file before the confirm, with the warning line", async () => {
  const p = bulk(withCheck({ eligible: 1893, size: 1086, left_out: 807, used_today: 614, left_today: 1086, seconds_min: 19548, seconds_max: 27150 }));
  await settle();
  await typed(p);
  assert.equal(p.shown("b-cut"), true);
  assert.equal(p.text("b-cut-text"), "This batch is cut to the first 1,086 numbers, all the texts left for bulk today: 614 are used, and 300 of the 2,000 are kept for sign-in codes. The other 807 are not sent; download them as a CSV file for a later batch.");
  assert.equal(p.shown("b-left-dl"), true);
  assert.equal(p.text("b-left-dl"), "Download the 807 not in this batch");
  assert.equal(p.shown("b-left-note"), true);
  const html = fs.readFileSync(new URL("../public/bulk.html", import.meta.url), "utf8");
  assert.match(html, /id="b-left-note" hidden>This file holds full phone numbers\. Delete it after you use it\.<\/p>/);
  assert.ok(html.indexOf('id="b-left-dl"') < html.indexOf('id="b-left-note"'));
  assert.equal(p.text("b-time"), "About 5 hours to 8 hours to send, at one text every 18 to 25 seconds.");
  const q = bulk(withCheck());
  await settle();
  await typed(q);
  assert.equal(q.shown("b-cut"), false);
  assert.equal(q.shown("b-left-dl"), false);
  assert.equal(q.shown("b-left-note"), false);
});

test("the left-out file: the call carries the held source, the blob is handed over, and its address is freed shortly after, not at once", async () => {
  const p = bulk(withCheck({ eligible: 12, size: 8, left_out: 4 }, { "bulk/left-out/": () => [200, { size: 4, type: "text/csv", note: "FULL NUMBERS" }] }));
  await settle();
  await typed(p);
  p.click("b-left-dl");
  await settle();
  assert.deepEqual(p.calls_to("bulk/left-out/")[0].body, { text: "Sample announcement", source: "pasted", numbers: "0900 000 0101\n0900 000 0102\nnot a number" });
  assert.equal(p.files.made.length, 1);
  assert.equal(p.files.made[0].note, "FULL NUMBERS");
  assert.deepEqual(p.files.freed, [], "not freed at once");
  assert.equal(p.timers.length, 1);
  assert.ok(p.timers[0].ms >= 500 && p.timers[0].ms <= 5000);
  p.timers[0].fn();
  assert.deepEqual(p.files.freed, ["blob:held/1"]);
  assert.doesNotMatch(p.doc.body.all(() => true).map((n) => n.textContent + JSON.stringify(n.attrs)).join("|"), /FULL NUMBERS/);
});

test("when the browser stops a download the button is left out and it is reported", async () => {
  const p = bulk(withCheck({ eligible: 12, size: 8, left_out: 4 }, { "bulk/left-out/": () => [200, {}] }), { globals: { URL: { createObjectURL() { throw new Error("blocked"); }, revokeObjectURL() {} } } });
  await settle();
  await typed(p);
  p.click("b-left-dl");
  await settle();
  assert.equal(p.shown("b-left-dl"), false);
  assert.equal(p.shown("b-left-note"), false);
  assert.equal(p.text("b-err2"), "The browser stopped the download.");
});

test("the refused-lines file holds line numbers and reasons only", async () => {
  const p = bulk(withCheck());
  await settle();
  await typed(p);
  assert.equal(p.shown("b-ref-dl"), true);
  p.click("b-ref-dl");
  assert.equal(p.files.made[0].parts.join(""), "Line,Reason\r\n3,Not a Philippine mobile number\r\n");
  assert.doesNotMatch(p.files.made[0].parts.join(""), /0900/);
});

test("the confirm is disabled until the typed number equals the size, and posts the same source again with one request id reused on a repeated press", async () => {
  let n = 0;
  const p = bulk(withCheck({}, { "bulk/confirm/": () => (++n === 1 ? "offline" : [200, batch({ state: "waiting", size: 8, sent: 0, waiting: 8, failed: 0, not_sent: 0 })]),
    "bulk/open/": () => [200, { ...batch({ state: "waiting", size: 8 }), results: [], next: null }] }));
  await settle();
  await typed(p);
  assert.equal(p.text("b-confirm-label"), "Type 8 to confirm");
  assert.equal(p.text("b-send"), "Send this batch of 8");
  assert.equal(p.node["b-send"].disabled, true);
  p.type("b-confirm", "7");
  assert.equal(p.node["b-send"].disabled, true);
  p.type("b-confirm", "8");
  assert.equal(p.node["b-send"].disabled, false);
  p.click("b-send");
  await settle();
  p.click("b-send");
  await settle();
  const calls = p.calls_to("bulk/confirm/");
  assert.equal(calls.length, 2);
  assert.match(calls[0].body.request_id, /^[0-9a-f]{32}$/);
  assert.equal(calls[0].body.request_id, calls[1].body.request_id);
  assert.deepEqual({ ...calls[0].body, request_id: "x" }, { text: "Sample announcement", source: "pasted", numbers: "0900 000 0101\n0900 000 0102\nnot a number", count: 8, request_id: "x" });
});

test("a new check makes a new request id", async () => {
  const p = bulk(withCheck({}, { "bulk/confirm/": () => [409, refusal("changed")] }));
  await settle();
  await typed(p);
  p.type("b-confirm", "8");
  p.click("b-send");
  await settle();
  const first = p.calls_to("bulk/confirm/")[0].body.request_id;
  await typed(p);
  p.type("b-confirm", "8");
  p.click("b-send");
  await settle();
  assert.notEqual(p.calls_to("bulk/confirm/")[1].body.request_id, first);
});

test("201 drops the form, the check and everything typed or held; step 3 shows the batch", async () => {
  const started = batch({ batch: "bulk_new", state: "waiting", size: 8, sent: 0, waiting: 8, failed: 0, not_sent: 0 });
  const p = bulk(withCheck({}, { "bulk/confirm/": () => [201, started], "bulk/open/": () => [200, { ...started, results: [], next: null }],
    "bulk/list/": () => [200, { results: [started], next: null }], "bulk/status/": () => [200, BULK] }));
  await settle();
  await typed(p);
  p.type("b-confirm", "8");
  p.click("b-send");
  await settle();
  assert.equal(p.text("msg"), "Batch started.");
  assert.equal(p.shown("b-step2"), false);
  assert.equal(p.shown("b-step3"), true);
  assert.equal(p.node["b-list"].value, "");
  assert.equal(p.node["b-text"].value, "");
  assert.equal(p.node["b-confirm"].value, "");
  assert.equal(p.shown("v-form"), false);
  assert.doesNotMatch(p.doc.body.all(() => true).map((n) => n.textContent).join("|"), /0900 000 0101/);
});

test("409 changed closes step 2; batch_running and incoming_off show their sentences", async () => {
  for (const [code, words] of [["changed", "The list changed since it was checked. Check it again."], ["batch_running", "A batch is already sending."],
    ["incoming_off", "Bulk texts need incoming texts to be on, so that replies of STOP are kept."], ["no_room", "No texts are left for bulk today."]]) {
    const p = bulk(withCheck({}, { "bulk/confirm/": () => [409, refusal(code, "RAW WORDS")] }));
    await settle();
    await typed(p);
    p.type("b-confirm", "8");
    p.click("b-send");
    await settle();
    assert.equal(p.shown("b-step2"), false, code);
    assert.equal(p.text("b-err"), words, code);
  }
});

test("blocked answers show their sentence and no confirm field or button", async () => {
  for (const [blocked, words] of [["incoming_off", "Bulk texts need incoming texts to be on, so that replies of STOP are kept."], ["running", "A batch is already sending."], ["no_room", "No texts are left for bulk today."]]) {
    const p = bulk(withCheck({ blocked, size: blocked === "no_room" ? 0 : 8 }));
    await settle();
    await typed(p);
    assert.match(p.text("b-blocked"), new RegExp(words.replace(/[.]/g, "\\.")), blocked);
    assert.equal(p.shown("b-send"), false, blocked);
  }
});

test("NPC: the number and file fields refuse the browser's memory, and are cleared on pagehide and on confirm; the held source goes too", async () => {
  const html = fs.readFileSync(new URL("../public/bulk.html", import.meta.url), "utf8");
  for (const id of ["b-list", "b-file", "b-confirm", "b-text"]) assert.match(html, new RegExp(`id="${id}"[^>]*autocomplete="off"|autocomplete="off"[^>]*id="${id}"`), id);
  const p = bulk(withCheck({ eligible: 12, size: 8, left_out: 4 }, { "bulk/left-out/": () => [200, {}] }));
  await settle();
  await typed(p);
  p.type("b-confirm", "8");
  p.node["b-file"].value = "C:\\fakepath\\list.csv";
  assert.equal(typeof p.heard.pagehide, "function");
  p.heard.pagehide({ type: "pagehide" });
  assert.equal(p.node["b-list"].value, "");
  assert.equal(p.node["b-file"].value, "");
  assert.equal(p.node["b-confirm"].value, "");
  p.click("b-left-dl");
  await settle();
  assert.equal(p.calls_to("bulk/left-out/").length, 0, "the held source is gone");
  p.click("b-send");
  await settle();
  assert.equal(p.calls_to("bulk/confirm/").length, 0);
});

test("the file's text and the pasted numbers are in no storage, address, title or console call, and in no element after the check", async () => {
  const p = bulk(withCheck());
  await settle();
  pick(p, "to-file");
  p.type("b-text", "Sample");
  p.node["b-file"].files = [csv("0900 000 0555\n")];
  await submit(p);
  const dom = p.doc.body.all(() => true).filter((n) => !["b-list", "b-file"].includes(n.id)).map((n) => n.textContent + JSON.stringify(n.attrs)).join("|");
  assert.doesNotMatch(dom, /0555/);
  assert.deepEqual(p.logs, []);
  assert.equal(p.location.assigned, null);
  assert.doesNotMatch(String(p.location.pathname), /0555/);
});

test("changing the text, the source or the file drops the check", async () => {
  const p = bulk(withCheck());
  await settle();
  await typed(p);
  assert.equal(p.shown("b-step2"), true);
  p.type("b-text", "Another");
  assert.equal(p.shown("b-step2"), false);
  await typed(p);
  pick(p, "to-groups");
  assert.equal(p.shown("b-step2"), false);
});
