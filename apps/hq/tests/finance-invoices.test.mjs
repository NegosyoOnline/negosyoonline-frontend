/* finance-invoices.js: the Invoice register page, queue, one sale, record and Void (Billing HQ-F2, ClickUp z8uq9memvq,
   plan sections 4.3 and 6). The page decides nothing: the backend does, and the page follows its answer. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { settle, refused } from "./page.mjs";
import { ME, QUEUE, DETAIL, RECORD, VOID, entry, queue, grp, invoice, scan, detail, page, rows, button, chips, opened, facts, text } from "./finance-invoices-page.mjs";

function fill(p, over = {}) {
  const v = { "r-book": "0", "r-serial": "13", "r-issued": "2026-11-12", ...over };
  for (const [id, value] of Object.entries(v)) p.node[id].value = value;
}
const submit = async (p) => { p.node["rec-form"].fire("submit"); await settle(); };

test("the page asks who is signed in, tells the shell, then reads the Ready to write queue with a limit of 100", async () => {
  const p = await page({ "GET me/": [200, ME], [QUEUE]: queue([grp("2026-11-10", entry())]) });
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url.split("/staff/v1/")[1]), ["GET me/", "POST finance/invoices/queue/"]);
  assert.deepEqual(p.calls[1].body, { filter: "ready", limit: 100 });
  assert.deepEqual(p.shown(), ["v-queue"]);
  assert.equal(p.node["c-ready"].textContent, " (4)");
  assert.equal(p.node["tab-ready"].getAttribute("aria-pressed"), "true");
});

test("sales are grouped under a heading per paid date, with plan, amount, age, serial, TEST and exceptions in words", async () => {
  const p = await page({ "GET me/": [200, ME], [QUEUE]: queue([
    grp("2026-11-09", entry({ item: "ii_a", status: "recorded", site_name: "Sample Store E", serial: "SAMPLE-A0011", age_days: 4, exceptions: [{ code: "issued_late", days: 1 }, { code: "serial_gap" }] })),
    grp("2026-11-11", entry({ item: "ii_b", site_name: "Sample Store B", is_test: true, age_days: 1, plan: "launch_promo", total_centavos: 499900,
      exceptions: [{ code: "unknown_plan_wording" }, { code: "overdue", days: 1 }, { code: "made_up" }, { code: "overdue", days: "x" }] })),
  ]) });
  const heads = p.node["q-groups"].all((n) => n.tagName === "H2").map((n) => n.textContent);
  assert.deepEqual(heads, ["Paid Nov 9, 2026", "Paid Nov 11, 2026"]);
  const [a, b] = rows(p);
  assert.equal(a.all((n) => n.matches(".item-sub"))[0].textContent, "Monthly Plan · PHP 2,499.00 · 4 days old");
  assert.deepEqual(chips(a), ["SAMPLE-A0011", "Issued late by 1 day", "Serial gap"]);
  assert.equal(button(a).textContent, "Upload scan");
  assert.equal(b.all((n) => n.matches(".item-sub"))[0].textContent, "Launch Promo (6 Months) · PHP 4,999.00 · 1 day old");
  assert.deepEqual(chips(b), ["TEST", "Unknown plan wording", "Overdue by 1 day"], "an unknown code and a bad day count are left out");
  assert.equal(button(b).textContent, "Write");
});

test("each state has its own action word on a row", async () => {
  const p = await page({ "GET me/": [200, ME], [QUEUE]: queue([grp("2026-11-09",
    entry({ item: "a", status: "pending" }), entry({ item: "b", status: "recorded", serial: "S1" }), entry({ item: "c", status: "uploaded", serial: "S2" }),
    entry({ item: "d", status: "verified", serial: "S3" }), entry({ item: "e", status: "mystery" }))]) });
  assert.deepEqual(rows(p).map((li) => button(li).textContent), ["Write", "Upload scan", "Review scan", "View", "Open"]);
});

test("the five tabs call queue/ with their filter and the count stays on the first tab", async () => {
  const filters = [];
  const p = await page({ "GET me/": [200, ME], [QUEUE]: (call) => { filters.push(call.body.filter); return queue([grp("2026-11-10", entry())], { pending_count: 2, filter: call.body.filter }); } });
  for (const name of ["awaiting_upload", "awaiting_verification", "published", "exceptions", "ready"]) { p.node["tab-" + name].fire("click"); await settle(); }
  assert.deepEqual(filters, ["ready", "awaiting_upload", "awaiting_verification", "published", "exceptions", "ready"]);
  assert.equal(p.node["tab-ready"].getAttribute("aria-pressed"), "true");
  assert.equal(p.node["tab-exceptions"].getAttribute("aria-pressed"), "false");
  assert.equal(p.node["c-ready"].textContent, " (2)");
  p.node["tab-ready"].fire("click");
  await settle();
  assert.equal(p.sent(QUEUE).length, 6, "the tab already open is not loaded again");
});

test("an empty tab says so, and a full page of 100 says more may exist", async () => {
  const p = await page({ "GET me/": [200, ME], [QUEUE]: queue([]) });
  assert.equal(p.node["q-empty"].hidden, false);
  assert.equal(p.node["q-limit"].hidden, true);
  const many = await page({ "GET me/": [200, ME], [QUEUE]: queue([grp("2026-11-10", entry())], { count: 100 }) });
  assert.equal(many.node["q-limit"].hidden, false);
  assert.equal(many.node["q-empty"].hidden, true);
});

test("a 404 shows the not-switched-on card, any other failure the down view, and Try again reads again", async () => {
  const closed = await page({ "GET me/": [200, ME], [QUEUE]: [404, refused("not_found")] });
  assert.deepEqual(closed.shown(), ["v-closed"]);
  let n = 0;
  const down = await page({ "GET me/": [200, ME], [QUEUE]: () => (++n === 1 ? [500] : queue([])) });
  assert.deepEqual(down.shown(), ["v-down"]);
  down.node.retry.fire("click");
  await settle();
  assert.deepEqual(down.shown(), ["v-queue"]);
  const out = await page({ "GET me/": [401, refused("unauthenticated")] });
  assert.equal(out.location.replaced, "/sign-in/");
});

test("a sale ready to write shows the sale, its facts, its lines, what needs attention and its history", async () => {
  const p = await opened();
  assert.deepEqual(p.sent(DETAIL).map((c) => c.body), [{ item: "ii_one" }]);
  assert.deepEqual(p.shown(), ["v-sale"]);
  assert.equal(text(p, "s-site"), "Sample Store A");
  assert.equal(text(p, "s-status"), "Ready to write");
  assert.equal(p.node["s-test"].hidden, true);
  assert.equal(text(p, "s-amount-l"), "Amount paid");
  assert.equal(text(p, "s-amount"), "PHP 2,499.00");
  assert.deepEqual(facts(p), [["Plan", "Monthly Plan"], ["Period", "Nov 10, 2026 to Dec 9, 2026"], ["Paid date", "Nov 10, 2026"],
    ["Sale date", "Nov 10, 2026 (not the invoice issue date)"], ["Payment reference", "btp_ref_one"], ["Age", "3 days"]]);
  assert.match(text(p, "s-lines"), /Monthly Plan.*PHP 2,499\.00/);
  assert.deepEqual(chips(p.node["s-exc"]), ["Overdue by 3 days"]);
  assert.equal(p.node["s-exc-box"].hidden, false);
  assert.equal(text(p, "s-hist"), "Payment confirmedNov 10, 2026, 2:15 PMAdded to the invoice queueNov 10, 2026, 2:15 PM");
  assert.equal(p.node["s-void-row"].hidden, true, "nothing to void before an invoice is recorded");
  assert.equal(p.node["s-sees-box"].hidden, true);
});

test("a TEST sale shows the TEST chip, and an event this page has no words for is left out", async () => {
  const p = await opened(detail({ is_test: true, events: [{ code: "opened", at: "2026-11-10T14:15:00+08:00" }, { code: "weird", at: "2026-11-10T14:15:00+08:00" }] }));
  assert.equal(p.node["s-test"].hidden, false);
  assert.doesNotMatch(text(p, "s-hist"), /weird/);
});

test("the worksheet is headed WRITE THIS ON PAPER and follows the paper form's order, read only", async () => {
  const p = await opened();
  assert.equal(p.node["w-card"].hidden, false);
  assert.equal(p.node["sc-card"].hidden, true);
  const paper = p.node["w-paper"];
  assert.equal(paper.children[0].textContent, "WRITE THIS ON PAPER");
  const keys = paper.children.slice(1).map((s) => (s.all((n) => n.tagName === "DT" || (n.getAttribute("class") || "").split(" ").includes("k"))[0] || { textContent: "Total sales" }).textContent);
  assert.deepEqual(keys, ["Header (issuer)", "Number", "Payment date", "Cash or Charge", "Sold To", "Description", "Total sales", "Deductions", "Signature"]);
  const all = paper.textContent;
  assert.match(all, /Sample Issuer Legal Name.*Sample Trade Name · TIN 000-000-000-000 · Branch 000 · Non-VAT/);
  assert.match(all, /Type the preprinted serial from the paper/);
  assert.match(all, /2026-11-10.*There is no default/);
  assert.match(all, /Sample Buyer Name.*3 Sample Road, Sample City.*TIN 000-000-000-001/);
  assert.match(all, /Qty 1Unit PHP 2,499\.00Amount PHP 2,499\.00/);
  assert.equal(paper.all((n) => n.tagName === "INPUT" || n.tagName === "BUTTON").length, 0, "the worksheet has no control");
});

test("with no verified issuer the worksheet says so in plain words", async () => {
  const p = await opened(detail({ suggested: { ...detail().suggested, header: null } }));
  assert.match(p.node["w-paper"].textContent, /No issuer is verified yet/);
});

test("the form starts with the actual issue date and the serial empty, however the hint reads, and the rest prefilled from the sale", async () => {
  const p = await opened();
  assert.equal(p.node["rec-card"].hidden, false);
  assert.equal(p.node["r-serial"].value, "");
  assert.equal(p.node["r-issued"].value, "");
  assert.equal(p.node["r-book"].value, "");
  assert.equal(p.node["r-type"].value, "cash");
  assert.equal(p.node["r-bname"].value, "Sample Buyer Name");
  assert.equal(p.node["r-btin"].value, "000-000-000-001");
  assert.equal(p.node["r-baddr"].value, "3 Sample Road, Sample City");
  assert.match(p.node["r-desc"].value, /Monthly Plan/);
  assert.equal(p.node["r-sstart"].value, "2026-11-10");
  assert.equal(p.node["r-send"].value, "2026-12-09");
  assert.equal(p.node["r-total"].value, "2499.00");
  assert.equal(p.node["r-disc"].value, "");
  assert.equal(p.node["r-wh"].value, "");
  assert.equal(p.node["r-book-hint"].textContent, "Next expected: SAMPLE-A0013. A hint only; type the serial printed on the paper.");
  const options = p.node["r-book"].children.map((o) => o.textContent);
  assert.deepEqual(options, ["Choose a book", "Series SAMPLE-A, serials 0001 to 0050"]);
});

test("with no active book the hint says to add one", async () => {
  const p = await opened(detail({ books: [] }));
  assert.match(p.node["r-book-hint"].textContent, /No invoice book is active/);
});

test("recording with no serial, no issue date or no book calls nothing and says what is missing", async () => {
  const p = await opened();
  await submit(p);
  assert.equal(p.sent(RECORD).length, 0);
  assert.equal(p.node["r-book-e"].hidden, false);
  assert.equal(text(p, "r-serial-e"), "Type the serial printed on the paper.");
  assert.equal(text(p, "r-issued-e"), "Type the issue date as YYYY-MM-DD.");
  assert.equal(p.node["r-issued"].getAttribute("aria-invalid"), "true");
  fill(p, { "r-issued": "2026-02-31" });
  await submit(p);
  assert.equal(text(p, "r-issued-e"), "Type the issue date as YYYY-MM-DD.", "a date that is not on the calendar is refused");
  assert.equal(p.sent(RECORD).length, 0);
});

test("a total in pesos is sent as centavos, and a bad amount or a lopsided discount is refused in the page", async () => {
  const p = await opened();
  fill(p, { "r-total": "2,499.5x" });
  await submit(p);
  assert.match(text(p, "r-total-e"), /Type the total sales in pesos/);
  fill(p, { "r-total": "2499.00", "r-disc": "100" });
  await submit(p);
  assert.equal(text(p, "r-dkind-e"), "Choose the kind of discount.");
  fill(p, { "r-disc": "", "r-dkind": "pwd" });
  await submit(p);
  assert.match(text(p, "r-dkind-e"), /There is no discount/);
  fill(p, { "r-disc": "3000", "r-dkind": "other" });
  await submit(p);
  assert.equal(text(p, "r-disc-e"), "The deductions are more than the total.");
  fill(p, { "r-sstart": "2026-12-10" });
  p.node["r-disc"].value = ""; p.node["r-dkind"].value = "";
  await submit(p);
  assert.equal(text(p, "r-send-e"), "The service cannot end before it starts.");
  assert.equal(p.sent(RECORD).length, 0);
});

test("a recorded invoice is sent with the book, the typed serial and date, pesos as centavos, and the sale is read again", async () => {
  let recorded = false;
  const p = await opened(detail(), { [RECORD]: () => { recorded = true; return [201, invoice({ scans: [] })]; },
    [DETAIL]: () => [200, recorded ? detail({ status: "recorded", exceptions: [{ code: "issued_late", days: 2 }], invoices: [invoice()] }) : detail()] });
  fill(p, { "r-disc": "100", "r-dkind": "senior", "r-wh": "50.5" });
  p.node["r-total"].value = "2,499.00";
  await submit(p);
  assert.deepEqual(p.sent(RECORD)[0].body, { item: "ii_one", series: "SAMPLE-A", serial_from: 1, serial_number: 13, issued_on: "2026-11-12", sale_type: "cash",
    buyer_name: "Sample Buyer Name", buyer_tin: "000-000-000-001", buyer_address: "3 Sample Road, Sample City",
    description: "NegosyoOnline SaaS subscription — Monthly Plan, 10 Nov 2026 to 9 Dec 2026", service_start: "2026-11-10", service_end: "2026-12-09",
    total_sales_centavos: 249900, discount_centavos: 10000, withholding_centavos: 5050, discount_kind: "senior" });
  assert.equal(p.sent(DETAIL).length, 2);
  assert.equal(text(p, "s-msg"), "Recorded. The invoice now waits for its scan.");
  assert.equal(text(p, "s-status"), "Issued, awaiting upload");
  assert.equal(p.node["rec-card"].hidden, true, "no second record form for a recorded sale");
  assert.deepEqual(chips(p.node["s-exc"]), ["Issued late by 2 days"], "an exception found after recording is shown, not a block");
});

test("a charge sale is sent as charge, and no discount kind goes with no discount", async () => {
  const p = await opened(detail(), { [RECORD]: [201, invoice()] });
  fill(p);
  p.node["r-type"].value = "charge";
  await submit(p);
  const body = p.sent(RECORD)[0].body;
  assert.equal(body.sale_type, "charge");
  assert.equal(body.discount_centavos, 0);
  assert.equal(body.withholding_centavos, 0);
  assert.equal("discount_kind" in body, false);
});

test("the backend's refusals are worded: duplicate serial, amount mismatch, inactive book, not pending, already recorded, bad fields", async () => {
  const cases = [
    [[409, refused("duplicate_serial")], "That serial is already recorded in this book."],
    [[409, refused("amount_mismatch")], "The total on the invoice is not the amount paid."],
    [[409, refused("book_inactive")], "That invoice book is not active. Choose another."],
    [[409, refused("not_pending")], "This sale is not waiting for an invoice.", "s-msg"],
    [[409, refused("already_recorded")], "This sale already has an invoice.", "s-msg"],
    [[400, { error: { code: "invalid_request", message: "x", fields: { serial_number: ["x"], issued_on: ["y"], mystery: ["z"] } } }], "Check these fields: Serial number, Actual issue date."],
    [[400, { error: { code: "invalid_request", message: "x", fields: { mystery: ["z"] } } }], "Check the values and try again."],
    [[500], "That did not go through. Check the sale before trying again."],
  ];
  for (const [reply, words, where = "rec-err"] of cases) {
    const p = await opened(detail(), { [RECORD]: reply });
    fill(p);
    await submit(p);
    assert.equal(text(p, where), words, words);
    assert.doesNotMatch(p.node[where].textContent, /A message the page does not show/);
  }
});

test("recording a sale that is gone returns to the queue and says so", async () => {
  const p = await opened(detail(), { [RECORD]: [404, refused("not_found")] });
  fill(p);
  await submit(p);
  assert.deepEqual(p.shown(), ["v-queue"]);
  assert.equal(text(p, "q-msg"), "That sale is no longer there.");
});

test("a sale opened that is gone returns to the queue, and a failed read shows the down view", async () => {
  const gone = await opened(detail(), { [DETAIL]: [404, refused("not_found")] });
  assert.deepEqual(gone.shown(), ["v-queue"]);
  const down = await opened(detail(), { [DETAIL]: [500] });
  assert.deepEqual(down.shown(), ["v-down"]);
});

test("a recorded invoice shows its values, the Void control, the Subscriber's view and no record form", async () => {
  const p = await opened(detail({ status: "recorded", exceptions: [], invoices: [invoice()],
    events: [{ code: "opened", at: "2026-11-10T14:15:00+08:00" }, { code: "recorded", at: "2026-11-10T17:20:00+08:00" }] }));
  assert.equal(text(p, "s-status"), "Issued, awaiting upload");
  assert.equal(text(p, "s-serial"), "Invoice SAMPLE-A0012");
  assert.equal(text(p, "s-amount-l"), "Amount due");
  assert.deepEqual(facts(p), [["Serial", "SAMPLE-A0012"], ["Issue date", "Nov 10, 2026"], ["Sale date", "Nov 10, 2026"], ["Buyer", "Sample Buyer Name"],
    ["Plan", "Monthly Plan"], ["Payment reference", "btp_ref_one"]]);
  assert.equal(text(p, "s-sees"), "Payment received, invoice copy pending.");
  assert.equal(p.node["s-void-row"].hidden, false);
  assert.equal(p.node["rec-card"].hidden, true);
  assert.equal(p.node["w-card"].hidden, true);
  assert.equal(p.node["s-exc-box"].hidden, true);
});

test("Void needs a reason of at most 300 characters, sends the invoice and the reason, and the sale returns to Ready to write", async () => {
  let voided = false;
  const live = detail({ status: "recorded", invoices: [invoice()] });
  const p = await opened(live, { [VOID]: () => { voided = true; return [200, invoice({ status: "voided" })]; },
    [DETAIL]: () => [200, voided ? detail({ invoices: [invoice({ status: "voided" })] }) : live] });
  p.node["s-void"].fire("click");
  assert.equal(p.node["m-void"].hidden, false);
  assert.equal(p.doc.activeElement, p.node["void-f"]);
  p.node["void-form"].fire("submit");
  await settle();
  assert.equal(text(p, "void-e"), "Write a reason.");
  p.node["void-f"].value = "x".repeat(301);
  p.node["void-form"].fire("submit");
  await settle();
  assert.equal(text(p, "void-e"), "The reason is at most 300 characters.");
  assert.equal(p.sent(VOID).length, 0);
  p.node["void-f"].value = "  Wrote the wrong buyer  ";
  p.node["void-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(VOID)[0].body, { invoice: "inv_one", reason: "Wrote the wrong buyer" });
  assert.equal(p.node["m-void"].hidden, true);
  assert.equal(text(p, "s-msg"), "Invoice voided. The sale is back in Ready to write.");
  assert.equal(text(p, "s-status"), "Ready to write");
  assert.equal(p.node["rec-card"].hidden, false);
  assert.equal(p.node["s-void-row"].hidden, true);
});

test("Void refusals: a bad reason is worded, a missing invoice returns to the queue, any other failure reads the sale again", async () => {
  const live = detail({ status: "recorded", invoices: [invoice()] });
  const bad = await opened(live, { [VOID]: [400, refused("invalid_request")] });
  bad.node["s-void"].fire("click"); bad.node["void-f"].value = "r"; bad.node["void-form"].fire("submit"); await settle();
  assert.match(text(bad, "void-e"), /Check the reason/);
  const gone = await opened(live, { [VOID]: [404, refused("not_found")] });
  gone.node["s-void"].fire("click"); gone.node["void-f"].value = "r"; gone.node["void-form"].fire("submit"); await settle();
  assert.deepEqual(gone.shown(), ["v-queue"]);
  const failed = await opened(live, { [VOID]: [500] });
  failed.node["s-void"].fire("click"); failed.node["void-f"].value = "r"; failed.node["void-form"].fire("submit"); await settle();
  assert.match(text(failed, "void-e"), /did not go through/);
  assert.equal(failed.sent(DETAIL).length, 2);
});

test("Escape closes the Void dialog and Cancel does too", async () => {
  const live = detail({ status: "recorded", invoices: [invoice()] });
  const p = await opened(live);
  p.node["s-void"].fire("click");
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(p.node["m-void"].hidden, true);
  p.node["s-void"].fire("click");
  p.node["void-cancel"].fire("click");
  assert.equal(p.node["m-void"].hidden, true);
});

test("a verified sale has no record form, no upload, no verify or reject; only Void stays, and it keeps its history", async () => {
  const live = detail({ status: "verified", invoices: [invoice({ status: "verified", scans: [scan({ status: "verified" })] })] });
  const p = await opened(live, { [`POST finance/invoices/scan/`]: [200, { type: "image/png", size: 3 }] });
  assert.equal(text(p, "s-status"), "Verified");
  assert.equal(p.node["rec-card"].hidden, true);
  assert.equal(p.node["sc-upload"].hidden, true);
  assert.equal(p.node["sc-up-row"].hidden, true);
  assert.equal(p.node["sc-check"].hidden, true);
  assert.equal(p.node["sc-done"].hidden, false);
  assert.equal(text(p, "s-sees"), "The Subscriber can open this copy.");
  assert.equal(p.node["s-void-row"].hidden, false);
});

test("leaving the sale returns to the queue, and a reload holds nothing: no address, no storage", async () => {
  const p = await opened();
  assert.equal(p.location.pathname, "/finance/invoices/");
  p.node["s-back"].fire("click");
  await settle();
  assert.deepEqual(p.shown(), ["v-queue"]);
  assert.equal(p.location.pathname, "/finance/invoices/", "no id or filter is put in the address");
  const js = fs.readFileSync(new URL("../public/assets/js/finance-invoices.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /localStorage|sessionStorage|history\.|location\.(?:hash|search|assign)|console\./);
});

test("the page sends only the routes the plan names", async () => {
  const js = fs.readFileSync(new URL("../public/assets/js/finance-invoices.js", import.meta.url), "utf8");
  const routes = new Set([...js.matchAll(/"finance\/invoices\/([a-z]+)\/"/g)].map((m) => m[1]));
  const kinds = [...js.matchAll(/"finance\/invoices\/" \+ kind \+ "\/"/g)].length;
  assert.deepEqual([...routes].sort(), ["detail", "queue", "record", "scan", "upload", "void"]);
  assert.equal(kinds, 1, "verify and reject go through one call that names them");
  assert.doesNotMatch(js, /"finance\/invoices\/books|"finance\/statements|"finance\/issuer/);
});
