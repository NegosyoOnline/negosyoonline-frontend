/* contacts.js, the two-step CSV upload (plan 7, task 5). The file's text is held in memory between the check and
   the save, sent twice, and never shown, stored or put in an address. All names and numbers here are made up. */
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { settle } from "./page.mjs";
import { page, R, GROUPS, err, everything } from "./contacts-page.mjs";

const CSV = "first,last,mobile\nZed,Madeup,0900 000 7777\nYan,Invented,0900 000 8888\nbad line\n";
const file = (text = CSV, size = text.length, name = "contacts.csv", type = "text/csv") => ({ name, type, size, text: () => Promise.resolve(text) });
const REASON = "The mobile number is not a Philippine mobile.";
const CHECK = { lines: 800, new: 748, existing: 40, repeated: 3, refused: [{ line: 14, reason: REASON }, { line: 203, reason: "This line has fewer than three columns." }, { line: 9, reason: "Something new" }], refused_count: 12 };
const up = (extra = {}, opts = {}) => page({ [R.uc]: [200, CHECK], ...extra }, { pathname: "/contacts/upload/", ...opts });
async function check(p, { f = file(), group = "grp_b" } = {}) {
  p.node["u-file"].files = [f];
  p.node["u-group"].value = group;
  p.node["u-form"].fire("submit");
  await settle();
}

test("step 1 shows the group choice and no step 2; nothing is saved at this step", async () => {
  const p = await up();
  assert.deepEqual(p.inner(), ["v-upload"]);
  assert.equal(p.node.title.textContent, "Upload contacts");
  assert.deepEqual(p.node["u-group"].children.map((o) => [o.getAttribute("value"), o.textContent]), GROUPS.map((g) => [g.id, g.name]));
  assert.equal(p.node["u-step2"].hidden, true);
  assert.equal(p.sent(R.uc).length, 0);
});

test("with no groups the page says Add a group first", async () => {
  const p = await up({}, { groups: [] });
  assert.equal(p.node["u-nogroup"].hidden, false);
  assert.equal(p.node["u-check"].disabled, true);
});

test("a file over 1,048,576 bytes sends nothing", async () => {
  const p = await up();
  await check(p, { f: file("x", 1048577) });
  assert.equal(p.sent(R.uc).length, 0);
  assert.equal(p.node["u-file-err"].textContent, "The file is over 1 MB.");
  await check(p, { f: file("a,b,c", 1048576) });
  assert.equal(p.sent(R.uc).length, 1);
});

test("no file or no group sends nothing", async () => {
  const p = await up();
  p.node["u-form"].fire("submit");
  await settle();
  assert.equal(p.node["u-file-err"].textContent, "Choose a CSV file.");
  p.node["u-file"].files = [file()];
  p.node["u-group"].value = "";
  p.node["u-form"].fire("submit");
  await settle();
  assert.equal(p.node["u-group-err"].textContent, "Choose a group.");
  assert.equal(p.sent(R.uc).length, 0);
});

test("Check the file posts {group, csv} with the file's text and step 2 shows the facts, the sentence and the refused lines", async () => {
  const p = await up();
  await check(p);
  assert.deepEqual(p.sent(R.uc)[0].body, { group: "grp_b", csv: CSV });
  assert.equal(p.node["u-step2"].hidden, false);
  assert.deepEqual(["f-lines", "f-new", "f-existing", "f-refused", "f-repeated"].map((id) => p.node[id].textContent), ["800", "748", "40", "12", "3"]);
  assert.equal(p.node["f-repeated-box"].hidden, false);
  assert.equal(p.node["u-sentence"].textContent, "748 new contacts will be added to Launch list B. The 40 numbers already in contacts are not added again; they are put in Launch list B and keep their names.");
  assert.deepEqual(p.node["u-results"].children.map((li) => li.textContent), ["Line 14Not a Philippine mobile number", "Line 203Fewer than three columns", "Line 9Refused"]);
  assert.equal(p.node["u-more"].textContent, "");
  assert.equal(p.node["u-save"].textContent, "Add 748 contacts");
});

test("the fifth fact only above 0; the more line says first 200 of N", async () => {
  const p = await up({ [R.uc]: [200, { ...CHECK, repeated: 0, refused_count: 450 }] });
  await check(p);
  assert.equal(p.node["f-repeated-box"].hidden, true);
  assert.equal(p.node["u-more"].textContent, "Showing the first 200 of 450 refused lines.");
});

test("no name or number from the file is anywhere in the page", async () => {
  const p = await up();
  await check(p);
  const all = everything(p);
  for (const bit of ["Zed", "Madeup", "0900 000 7777", "Invented", "8888", "bad line"]) assert.equal(all.includes(bit), false, bit);
  assert.equal(p.logs.length, 0);
});

test("Save posts the same text, the same group and expected_new; 201 shows the counts and drops the file, the check and the text", async () => {
  const p = await up({ [R.us]: [201, { lines: 800, added: 748, existing: 40, refused: 12, repeated: 3 }] });
  await check(p);
  p.node["u-save"].fire("click");
  await settle();
  assert.deepEqual(p.sent(R.us)[0].body, { group: "grp_b", csv: CSV, expected_new: 748 });
  assert.equal(p.node["u-done"].hidden, false);
  assert.equal(p.node["u-done-text"].textContent, "748 contacts added to Launch list B. 40 were already contacts.");
  assert.equal(p.node["u-step2"].hidden, true);
  assert.equal(p.node["u-body"].hidden, true);
  assert.equal(p.node["u-file"].value, "");
  assert.match((await import("node:fs")).readFileSync(new URL("../public/contacts.html", import.meta.url), "utf8"), /<a class="no-btn no-btn-ghost" href="\/contacts\/" id="u-done-link">Back to Contacts<\/a>/);
  p.node["u-save"].fire("click");
  await settle();
  assert.equal(p.sent(R.us).length, 1, "a second press sends nothing: the text is gone");
});

test("the label changes when nothing is new, and Save is disabled when both are 0", async () => {
  const p = await up({ [R.uc]: [200, { ...CHECK, new: 0, existing: 5, refused: [], refused_count: 0, repeated: 0 }] });
  await check(p);
  assert.equal(p.node["u-save"].textContent, "Put 5 contacts in Launch list B");
  assert.equal(p.node["u-save"].disabled, false);
  const none = await up({ [R.uc]: [200, { ...CHECK, new: 0, existing: 0, refused: [], refused_count: 0 }] });
  await check(none);
  assert.equal(none.node["u-save"].textContent, "Nothing to add.");
  assert.equal(none.node["u-save"].disabled, true);
  none.node["u-save"].fire("click");
  await settle();
  assert.equal(none.sent(R.us).length, 0);
});

test("409 changed closes step 2 and says to check again", async () => {
  const p = await up({ [R.us]: [409, err("changed", "x")] });
  await check(p);
  p.node["u-save"].fire("click");
  await settle();
  assert.equal(p.node["u-step2"].hidden, true);
  assert.equal(p.node["u-err"].textContent, "The file or the list of contacts is not as it was when it was checked. Check it again.");
});

test("file_too_large, invalid_file and forbidden show the backend's message; anything else a fixed sentence", async () => {
  for (const [reply, shown] of [[[413, err("file_too_large", "The file is over 1 MB.")], "The file is over 1 MB."], [[400, err("invalid_file", "The file could not be read as a CSV file.")], "The file could not be read as a CSV file."],
    [[403, err("forbidden", "You may not change contacts.")], "You may not change contacts."], [[500, err("boom", "Secret.")], "That did not go through. Check the list before trying again."]]) {
    const p = await up({ [R.uc]: reply });
    await check(p);
    assert.equal(p.node["u-err"].textContent, shown);
    assert.equal(p.node["u-step2"].hidden, true);
  }
});

test("choosing another file or another group drops the check and the text", async () => {
  const p = await up({ [R.us]: [201, { added: 1, existing: 0 }] });
  await check(p);
  p.node["u-group"].fire("change");
  assert.equal(p.node["u-step2"].hidden, true);
  p.node["u-save"].fire("click");
  await settle();
  assert.equal(p.sent(R.us).length, 0);
  await check(p);
  p.node["u-file"].fire("change");
  assert.equal(p.node["u-step2"].hidden, true);
});

test("the refused-lines download holds only line numbers and reasons, from a blob address that is revoked at once", async () => {
  const clicks = [];
  const p = await up();
  const real = p.doc.createElement;
  p.doc.createElement = (tag) => { const n = real(tag); if (tag === "a") n.click = () => clicks.push({ href: n.getAttribute("href"), download: n.getAttribute("download") }); return n; };
  await check(p);
  assert.equal(p.node["u-download"].hidden, false);
  p.node["u-download"].fire("click");
  assert.deepEqual(clicks, [{ href: "blob:held/1", download: "refused-lines.csv" }]);
  assert.deepEqual(p.urls.freed, ["blob:held/1"]);
  assert.equal(p.urls.made[0].parts.join(""), "Line,Reason\r\n14,Not a Philippine mobile number\r\n203,Fewer than three columns\r\n9,Refused\r\n");
  assert.equal(p.sent(R.uc).length, 1, "the download is not a call");
});

test("the refused-lines download uses the new chip words for shortened numbers", async () => {
  const p = await up({ [R.uc]: [200, { ...CHECK, refused: [{ line: 5, reason: "Excel shortened this mobile number." }], refused_count: 1, shortened: 1 }] });
  await check(p);
  p.node["u-download"].fire("click");
  assert.equal(p.urls.made[0].parts.join(""), "Line,Reason\r\n5,\"Excel shortened this number. Format the column as Number with 0 decimals, then save again.\"\r\n");
});

test("no download button without refused lines, or without Blob", async () => {
  const p = await up({ [R.uc]: [200, { ...CHECK, refused: [], refused_count: 0 }] });
  await check(p);
  assert.equal(p.node["u-download"].hidden, true);
  const q = await up({}, { globals: { Blob: undefined } });
  await check(q);
  assert.equal(q.node["u-download"].hidden, true);
});

test("the file text appears in no address, history entry or console call", async () => {
  const p = await up({ [R.us]: [201, { added: 1, existing: 0 }] });
  await check(p);
  p.node["u-save"].fire("click");
  await settle();
  assert.deepEqual(p.pushed.concat(p.replaced), []);
  assert.equal(p.logs.length, 0);
});

test("read-only shows no form, the line, and the link back", async () => {
  const p = await up({}, { change: false });
  assert.equal(p.node["u-ro"].hidden, false);
  assert.equal(p.node["u-body"].hidden, true);
  p.node["u-form"].fire("submit");
  await settle();
  assert.equal(p.sent(R.uc).length, 0);
});

/* ---- the sample CSV, the non-CSV refusal (L19) and the empty-file wording ---- */

const NOT_CSV = "This is not a CSV file. Save it as CSV UTF-8 and choose it again, or use the sample CSV.";
const here = dirname(fileURLToPath(import.meta.url));

test("the sample CSV is one header line, no data row, and the page links to it for download", () => {
  const sample = readFileSync(join(here, "../public/assets/sample-contacts.csv"));
  assert.equal(sample.toString("utf8"), "First name,Last name,Mobile number\n");
  const html = readFileSync(join(here, "../public/contacts.html"), "utf8");
  assert.match(html, /<a href="\/assets\/sample-contacts\.csv" download="sample-contacts\.csv" id="u-sample">Download sample CSV<\/a>/);
  assert.ok(html.indexOf('id="u-file-hint"') < html.indexOf('id="u-sample"'));
});

test("a non-CSV file is refused at step 1 with the hint, the alert and focus on the file field, and nothing is sent", async () => {
  const p = await up();
  const cases = [
    file("PK\u0003\u0004 binary", 20, "list.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    file("a,b,c\n", 6, "list.txt", "text/plain"),
    file("a,b,c\n", 6, "list", ""),
    file("a,b,c\n", 6, "list.csv.exe", "application/octet-stream")
  ];
  for (const f of cases) {
    p.node["u-err"].textContent = "";
    await check(p, { f });
    assert.equal(p.node["u-file-err"].textContent, NOT_CSV);
    assert.equal(p.node["u-file-err"].hidden, false);
    assert.equal(p.doc.activeElement, p.node["u-file"]);
    assert.equal(p.node["u-step2"].hidden, true);
  }
  assert.equal(p.sent(R.uc).length, 0);
});

test("a file named .csv is refused when its text is a ZIP, has a NUL byte, or no comma or semicolon on its first line", async () => {
  const p = await up();
  for (const t of ["PK\u0003\u0004zipped", "a,b\u0000c\n", "just some words\nand more\n", "\n\n  \nfirst name\n"]) {
    await check(p, { f: file(t) });
    assert.equal(p.node["u-file-err"].textContent, NOT_CSV, JSON.stringify(t));
    assert.equal(p.doc.activeElement, p.node["u-file"]);
  }
  assert.equal(p.sent(R.uc).length, 0);
  assert.equal(p.node["u-check"].disabled, false, "the button is usable again");
});

test("real CSVs get through: any case of .csv, an empty or spreadsheet type, a BOM, semicolons, leading blank lines", async () => {
  const p = await up();
  for (const f of [file(CSV, undefined, "LIST.CSV", ""), file(CSV, undefined, "list.csv", "application/vnd.ms-excel"), file("\uFEFFFirst name,Last name,Mobile number\n"),
    file("a;b;c\n"), file("\r\n\r\nfirst,last,mobile\r\n"), file(CSV, undefined, "noext", "text/csv")]) {
    await check(p, { f });
    assert.equal(p.node["u-file-err"].hidden, true);
  }
  assert.equal(p.sent(R.uc).length, 6);
});

test("the sample unchanged (no lines read) says the file has no contacts yet, not 0 new contacts", async () => {
  const p = await up({ [R.uc]: [200, { lines: 0, new: 0, existing: 0, repeated: 0, refused: [], refused_count: 0 }] });
  await check(p, { f: file("First name,Last name,Mobile number\n") });
  assert.equal(p.node["u-step2"].hidden, false);
  assert.equal(p.node["u-sentence"].textContent, "This file has no contacts yet. Add one line for each person under the header row, then check it again.");
  assert.equal(p.node["u-sentence"].textContent.includes("0 new"), false);
  assert.equal(p.node["u-save"].disabled, true);
});

const SHORT = "Excel shortened this mobile number.";
const CHIP = "Excel shortened this number. Format the column as Number with 0 decimals, then save again.";
const FIX = "Excel shortened the mobile numbers in this file. In Excel, select the mobile column, Format Cells \u2192 Number with 0 decimal places, save as CSV UTF-8, and upload again.";
const NONE = { lines: 3, new: 0, existing: 0, repeated: 0 };

test("no line can be added and the refusals are format failures: the save-as-CSV-UTF-8 summary", async () => {
  const p = await up({ [R.uc]: [200, { ...NONE, refused: [{ line: 2, reason: "This line has fewer than three columns." }], refused_count: 3, shortened: 0 }] });
  await check(p);
  assert.equal(p.node["u-sentence"].textContent, "No line could be read. Save the file as CSV UTF-8 and check it again.");
  assert.equal(p.node["u-sentence"].textContent.includes("already in contacts"), false);
  assert.equal(p.node["u-save"].disabled, true);
});

test("no line can be added and the refusals are other reasons: see the reasons below", async () => {
  const p = await up({ [R.uc]: [200, { ...NONE, refused: [{ line: 2, reason: REASON }], refused_count: 3 }] });
  await check(p);
  assert.equal(p.node["u-sentence"].textContent, "No line can be added. See the reasons below.");
});

test("no line can be added and most refused lines are shortened: the Excel fix; the chip and the download use the new words", async () => {
  const p = await up({ [R.uc]: [200, { ...NONE, lines: 4, refused: [{ line: 2, reason: SHORT }, { line: 3, reason: SHORT }, { line: 4, reason: REASON }], refused_count: 3, shortened: 2 }] });
  await check(p);
  assert.equal(p.node["u-sentence"].textContent, FIX);
  assert.deepEqual(p.node["u-results"].children.map((li) => li.textContent), ["Line 2" + CHIP, "Line 3" + CHIP, "Line 4Not a Philippine mobile number"]);
  const half = await up({ [R.uc]: [200, { ...NONE, refused: [{ line: 2, reason: SHORT }, { line: 3, reason: REASON }], refused_count: 2, shortened: 1 }] });
  await check(half);
  assert.equal(half.node["u-sentence"].textContent, "No line can be added. See the reasons below.");
});

test("some lines can be added and some are shortened: the normal summary and one extra line", async () => {
  const p = await up({ [R.uc]: [200, { ...CHECK, new: 5, existing: 1, refused: [{ line: 2, reason: SHORT }], refused_count: 3, shortened: 3 }] });
  await check(p);
  const t = p.node["u-sentence"].textContent;
  assert.equal(t.startsWith("5 new contacts will be added to Launch list B. The 1 numbers already in contacts"), true);
  assert.equal(t.endsWith(" Excel shortened 3 mobile numbers in this file, so those lines are not added. In Excel, select the mobile column, Format Cells \u2192 Number with 0 decimal places, save as CSV UTF-8, and upload again."), true);
  const none = await up({ [R.uc]: [200, { ...CHECK, shortened: 0 }] });
  await check(none);
  assert.equal(none.node["u-sentence"].textContent.includes("Excel"), false);
});

test("a long refused-line reason wraps inside the card on a phone", () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "css", "hq.css"), "utf8");
  assert.match(css, /#u-results \.chip, #b-refused \.chip \{[^}]*white-space: normal;[^}]*max-width: 100%;[^}]*overflow-wrap: anywhere/);
});
