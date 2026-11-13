/* finance-issuer.js: the Issuer and invoice books page (Billing HQ-F1, ClickUp z8uq9mektc, plan sections 4.2 and 6).
   A change never edits a profile; nothing is prefilled, defaulted or stored; the tax type is a fixed line that
   is not sent. The page decides nothing: the backend does, and the page follows its answer. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE, refused } from "./page.mjs";

const NEW = ["n-legal", "n-trade", "n-tin", "n-branch", "n-addr", "n-cor", "n-cordate", "n-mail"];
const BOOK = ["b-series", "b-from", "b-to", "b-width", "b-atp", "b-atpd", "b-printer"];
const IDS = ["boot", "v-main", "v-closed", "v-down", "retry", "i-msg", "i-chip", "i-cur", "i-cur-facts", "i-blocked", "i-pend", "i-pend-facts",
  "open-verify", "new-open", "f-new", ...NEW, "n-err", "n-go", "n-cancel",
  "b-msg", "b-off", "books", "b-empty", "b-tools", "book-open", "f-book", ...BOOK, "b-err", "b-go", "b-cancel",
  "m-verify", "verify-sub", "verify-form", "verify-f", "verify-count", "verify-e", "verify-go", "verify-x", "verify-cancel",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const VIEWS = ["boot", "v-main", "v-closed", "v-down"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const GET = "POST finance/issuer/get/", SET = "POST finance/issuer/set/", VERIFY = "POST finance/issuer/verify/",
  BOOKS = "POST finance/invoices/books/", ADD = "POST finance/invoices/books/set/", ACTIVE = "POST finance/invoices/books/active/";

function profile(over = {}) {
  return { issuer: "iss_one", legal_name: "Sample Issuer Legal Name", trade_name: "Sample Trade Name", tin: "000-000-000-000", branch_code: "000",
    registered_address: "1 Sample Street, Sample City", cor_number: "FIXTURE-COR-0001", contact_email: "issuer@example.test", tax_type: "non_vat",
    cor_date: "2026-01-15", created_at: "2026-11-09T09:00:00+08:00", verified_at: "2026-11-10T10:00:00+08:00", verification_note: "", ...over };
}
const pend = (over = {}) => profile({ issuer: "iss_two", legal_name: "Sample Issuer Legal Name (changed)", cor_number: "FIXTURE-COR-0002", cor_date: "2026-11-01",
  created_at: "2026-11-13T09:00:00+08:00", verified_at: null, ...over });
function book(over = {}) {
  return { series: "SAMPLE-A", serial_from: 1, serial_to: 50, serial_width: 4, atp_reference: "FIXTURE-ATP-0001", atp_date: "2026-02-01",
    printer_name: "Sample Printer", active: true, issuer: "iss_one", ...over };
}
const issuers = (current, pending) => [200, { current, pending }];
const books = (items) => [200, { items }];

async function page(table) {
  const p = open(["hq.js", "shell.js", "finance-common.js", "finance-issuer.js"], { ids: IDS, pathname: "/finance/issuer/", answers: (call) => {
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
const normal = (over = {}) => ({ "GET me/": [200, ME], [GET]: issuers(profile(), pend()), [BOOKS]: books([book(), book({ series: "SAMPLE-B", active: false, atp_reference: "FIXTURE-ATP-0002" })]), ...over });
const text = (p, id) => p.node[id].textContent;
const fill = (p, ids, values) => ids.forEach((id, i) => { p.node[id].value = values[i]; });
const GOOD = ["Sample Legal", "Sample Trade", "000-000-000-001", "001", "2 Sample Avenue", "FIXTURE-COR-0003", "2026-11-12", "issuer@example.test"];
const GOOD_BOOK = ["SAMPLE-C", "51", "100", "4", "FIXTURE-ATP-0003", "2026-11-12", "Sample Printer"];
function submitNew(p, values = GOOD) {
  p.node["new-open"].fire("click");
  fill(p, NEW, values);
  p.node["f-new"].fire("submit");
}
function submitBook(p, values = GOOD_BOOK) {
  p.node["book-open"].fire("click");
  fill(p, BOOK, values);
  p.node["f-book"].fire("submit");
}

test("the page asks who is signed in, then reads the issuer details and the books", async () => {
  const p = await page(normal());
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url.slice(BASE.length + 1)), ["GET me/", GET, BOOKS]);
  assert.deepEqual(p.shown(), ["v-main"]);
  assert.equal(p.node["acct-name"].textContent, "sample.staff");
});

test("the current verified profile and the pending one are shown in words, with Verify on the pending one", async () => {
  const p = await page(normal());
  assert.equal(p.node["i-chip"].hidden, false);
  assert.equal(p.node["i-cur"].hidden, false);
  assert.equal(p.node["i-blocked"].hidden, true);
  assert.equal(text(p, "i-cur-facts"), "Legal nameSample Issuer Legal NameTrade nameSample Trade NameTIN000-000-000-000Branch code000" +
    "Registered address1 Sample Street, Sample CityTax typeNon-VATCOR numberFIXTURE-COR-0001COR date2026-01-15" +
    "Contact emailissuer@example.testVerifiedNov 10, 2026");
  assert.equal(p.node["i-pend"].hidden, false);
  assert.match(text(p, "i-pend-facts"), /^Legal nameSample Issuer Legal Name \(changed\)/);
  assert.match(text(p, "i-pend-facts"), /COR numberFIXTURE-COR-0002COR date2026-11-01.*RecordedNov 13, 2026, not verified$/);
});

test("a verification note is shown when there is one", async () => {
  const p = await page(normal({ [GET]: issuers(profile({ verification_note: "Checked against the COR." }), null) }));
  assert.match(text(p, "i-cur-facts"), /Verification noteChecked against the COR\.$/);
  assert.equal(p.node["i-pend"].hidden, true);
});

test("with no verified profile the card says issuing is blocked, and a pending profile can still be verified", async () => {
  const p = await page(normal({ [GET]: issuers(null, pend()) }));
  assert.equal(p.node["i-blocked"].hidden, false);
  assert.equal(p.node["i-cur"].hidden, true);
  assert.equal(p.node["i-chip"].hidden, true);
  assert.equal(p.node["i-pend"].hidden, false);
  const none = await page(normal({ [GET]: issuers(null, null) }));
  assert.equal(none.node["i-blocked"].hidden, false);
  assert.equal(none.node["i-pend"].hidden, true);
});

test("an unknown tax type shows nothing raw", async () => {
  const p = await page(normal({ [GET]: issuers(profile({ tax_type: "a_new_tax" }), null) }));
  assert.doesNotMatch(text(p, "i-cur-facts"), /a_new/);
  assert.match(text(p, "i-cur-facts"), /Tax type COR number|Tax typeCOR number/);
});

test("a 404 from the issuer routes shows the not-switched-on view; another failure shows the down view with a retry", async () => {
  const closed = await page(normal({ [GET]: [404, refused("not_found")] }));
  assert.deepEqual(closed.shown(), ["v-closed"]);
  let answer = [500, {}];
  const down = await page(normal({ [GET]: () => answer }));
  assert.deepEqual(down.shown(), ["v-down"]);
  answer = issuers(profile(), null);
  down.node.retry.fire("click");
  await settle();
  assert.deepEqual(down.shown(), ["v-main"]);
  assert.equal(down.sent("GET me/").length, 1);
});

test("a person who is not signed in is sent to sign in", async () => {
  const p = await page({ "GET me/": [401, refused("unauthenticated")] });
  assert.equal(p.location.replaced, "/sign-in/");
});

test("when the books are not switched on the books card says so and offers nothing", async () => {
  const p = await page(normal({ [BOOKS]: [404, refused("not_found")] }));
  assert.deepEqual(p.shown(), ["v-main"]);
  assert.equal(p.node["b-off"].hidden, false);
  assert.equal(p.node["b-tools"].hidden, true);
  assert.equal(p.node.books.children.length, 0);
});

test("nothing is prefilled: the forms open empty, and empty again after typing and cancelling", async () => {
  const p = await page(normal());
  p.node["new-open"].fire("click");
  assert.equal(p.node["f-new"].hidden, false);
  for (const id of NEW) assert.equal(p.node[id].value, "", id);
  fill(p, NEW, GOOD);
  p.node["n-cancel"].fire("click");
  assert.equal(p.node["f-new"].hidden, true);
  p.node["new-open"].fire("click");
  for (const id of NEW) assert.equal(p.node[id].value, "", id);
  p.node["book-open"].fire("click");
  for (const id of BOOK) assert.equal(p.node[id].value, "", id);
  assert.equal(p.sent(SET).length, 0);
});

test("Record new details sends exactly the profile's fields, with cor_date as a date and no tax type", async () => {
  let calls = 0;
  const p = await page(normal({ [GET]: () => (++calls === 1 ? issuers(profile(), null) : issuers(profile(), pend())), [SET]: [201, pend()] }));
  submitNew(p, GOOD.map((v) => " " + v + " "));
  assert.equal(p.node["n-go"].disabled, true);
  await settle();
  assert.deepEqual(p.sent(SET)[0].body, { legal_name: "Sample Legal", trade_name: "Sample Trade", tin: "000-000-000-001", branch_code: "001",
    registered_address: "2 Sample Avenue", cor_number: "FIXTURE-COR-0003", contact_email: "issuer@example.test", cor_date: "2026-11-12" });
  assert.equal("tax_type" in p.sent(SET)[0].body, false);
  assert.equal(p.node["n-go"].disabled, false);
  assert.equal(p.node["f-new"].hidden, true);
  assert.equal(text(p, "i-msg"), "Saved as a new profile, waiting to be verified.");
  assert.equal(p.node["i-pend"].hidden, false, "the pending profile is read again");
  for (const id of NEW) assert.equal(p.node[id].value, "", id);
});

test("the trade name may be left empty; every other value is required, and the COR date must be a real date", async () => {
  const p = await page(normal({ [SET]: [201, pend()] }));
  const some = GOOD.slice();
  some[0] = "";
  submitNew(p, some);
  assert.equal(p.node["n-err"].hidden, false);
  assert.match(text(p, "n-err"), /^Fill in every required field/);
  for (const bad of ["2026-13-01", "2026-02-30", "12/11/2026", "20261112"]) {
    const v = GOOD.slice();
    v[6] = bad;
    fill(p, NEW, v);
    p.node["f-new"].fire("submit");
    assert.equal(text(p, "n-err"), "COR date is YYYY-MM-DD.", bad);
  }
  const noMail = GOOD.slice();
  noMail[7] = "not an email";
  fill(p, NEW, noMail);
  p.node["f-new"].fire("submit");
  assert.equal(text(p, "n-err"), "Enter an email address.");
  assert.equal(p.sent(SET).length, 0);
  const noTrade = GOOD.slice();
  noTrade[1] = "";
  fill(p, NEW, noTrade);
  p.node["f-new"].fire("submit");
  await settle();
  assert.equal(p.sent(SET).length, 1);
  assert.equal(p.sent(SET)[0].body.trade_name, "");
});

test("a refusal of the fields names them in words and never shows the backend's own words", async () => {
  const p = await page(normal({ [SET]: [400, { error: { code: "invalid_request", message: "Raw backend words.", fields: { tin: ["x"], legal_name: ["y"], odd_field: ["z"] } } }] }));
  submitNew(p);
  await settle();
  assert.equal(text(p, "n-err"), "Check these fields: TIN, Legal name.");
  assert.equal(p.node["f-new"].hidden, false, "the form stays open");
  const lost = await page(normal({ [SET]: [500, {}] }));
  submitNew(lost);
  await settle();
  assert.equal(text(lost, "n-err"), "That did not go through. Check the page before trying again.");
});

test("Verify opens a dialog naming the pending profile, and sends the issuer with its note", async () => {
  const p = await page(normal({ [VERIFY]: [200, pend({ verified_at: "2026-11-13T10:00:00+08:00" })] }));
  p.node["open-verify"].fire("click");
  assert.equal(p.node["m-verify"].hidden, false);
  assert.equal(text(p, "verify-sub"), "Sample Issuer Legal Name (changed), COR FIXTURE-COR-0002.");
  p.node["verify-f"].value = "  Checked against the COR.  ";
  p.node["verify-f"].fire("input");
  assert.equal(text(p, "verify-count"), "28 of 300");
  p.node["verify-form"].fire("submit");
  assert.equal(p.node["verify-go"].disabled, true);
  await settle();
  assert.deepEqual(p.sent(VERIFY)[0].body, { issuer: "iss_two", note: "Checked against the COR." });
  assert.equal(p.node["m-verify"].hidden, true);
  assert.equal(p.node["verify-go"].disabled, false);
  assert.equal(text(p, "i-msg"), "Issuer details verified.");
  assert.equal(p.sent(GET).length, 2, "the profiles are read again");
});

test("Verify works without a note", async () => {
  const p = await page(normal({ [VERIFY]: [200, pend()] }));
  p.node["open-verify"].fire("click");
  p.node["verify-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(VERIFY)[0].body, { issuer: "iss_two", note: "" });
});

test("a note over 300 characters is refused in the page", async () => {
  const p = await page(normal({ [VERIFY]: [200, pend()] }));
  p.node["open-verify"].fire("click");
  p.node["verify-f"].value = "n".repeat(301);
  p.node["verify-form"].fire("submit");
  assert.equal(text(p, "verify-e"), "The note is at most 300 characters.");
  assert.equal(p.sent(VERIFY).length, 0);
});

test("already_verified and superseded are worded, close the dialog and read the profiles again", async () => {
  for (const [code, words] of [["already_verified", "This profile was already verified."],
    ["superseded", "A newer profile is already verified. Record new details instead."]]) {
    const p = await page(normal({ [VERIFY]: [409, refused(code)] }));
    p.node["open-verify"].fire("click");
    p.node["verify-form"].fire("submit");
    await settle();
    assert.equal(p.node["m-verify"].hidden, true, code);
    assert.equal(text(p, "i-msg"), words, code);
    assert.equal(p.sent(GET).length, 2, code);
  }
  const lost = await page(normal({ [VERIFY]: [500, {}] }));
  lost.node["open-verify"].fire("click");
  lost.node["verify-form"].fire("submit");
  await settle();
  assert.equal(lost.node["m-verify"].hidden, false);
  assert.equal(text(lost, "verify-e"), "That did not go through. Check the page before trying again.");
});

test("the books are listed with their serials, authority and printer, and each has an Active switch only", async () => {
  const p = await page(normal());
  assert.equal(p.node.books.children.length, 2);
  assert.equal(p.node.books.children[0].textContent,
    "Series SAMPLE-ASerials 0001 to 0050 · width 4 digitsAuthority reference FIXTURE-ATP-0001 · dated 2026-02-01 · printer Sample PrinterActive");
  assert.match(p.node.books.children[1].textContent, /Series SAMPLE-B.*Not active$/);
  const sw = p.node.books.children[0].all((n) => n.tagName === "BUTTON");
  assert.equal(sw.length, 1, "no edit and no delete control");
  assert.equal(sw[0].getAttribute("role"), "switch");
  assert.equal(sw[0].getAttribute("aria-checked"), "true");
  assert.equal(p.node["b-empty"].hidden, true);
  const none = await page(normal({ [BOOKS]: books([]) }));
  assert.equal(none.node["b-empty"].hidden, false);
});

test("the Active switch sends the book's series and first serial and follows the answer", async () => {
  const p = await page(normal({ [ACTIVE]: (call) => [200, book({ active: call.body.active })] }));
  const sw = p.node.books.children[0].all((n) => n.tagName === "BUTTON")[0];
  sw.fire("click");
  assert.equal(sw.disabled, true);
  await settle();
  assert.deepEqual(p.sent(ACTIVE)[0].body, { series: "SAMPLE-A", serial_from: 1, active: false });
  assert.equal(sw.getAttribute("aria-checked"), "false");
  assert.match(p.node.books.children[0].textContent, /Not active$/);
  assert.equal(sw.disabled, false);
  const off = p.node.books.children[1].all((n) => n.tagName === "BUTTON")[0];
  off.fire("click");
  await settle();
  assert.deepEqual(p.sent(ACTIVE)[1].body, { series: "SAMPLE-B", serial_from: 1, active: true });
  assert.equal(off.getAttribute("aria-checked"), "true");
});

test("a switch that fails keeps its state and says so", async () => {
  const p = await page(normal({ [ACTIVE]: [500, {}] }));
  const sw = p.node.books.children[0].all((n) => n.tagName === "BUTTON")[0];
  sw.fire("click");
  await settle();
  assert.equal(sw.getAttribute("aria-checked"), "true");
  assert.equal(text(p, "b-msg"), "That did not go through. Check the page before trying again.");
});

test("Add a book sends the plan's fields with numbers as numbers and the authority date as a date", async () => {
  const p = await page(normal({ [ADD]: [201, book({ series: "SAMPLE-C", serial_from: 51, serial_to: 100 })] }));
  submitBook(p, GOOD_BOOK.map((v) => " " + v + " "));
  await settle();
  assert.deepEqual(p.sent(ADD)[0].body, { series: "SAMPLE-C", serial_from: 51, serial_to: 100, serial_width: 4,
    atp_reference: "FIXTURE-ATP-0003", atp_date: "2026-11-12", printer_name: "Sample Printer" });
  assert.equal(p.node["f-book"].hidden, true);
  assert.equal(text(p, "b-msg"), "Book added.");
  assert.equal(p.sent(BOOKS).length, 2, "the books are read again");
  for (const id of BOOK) assert.equal(p.node[id].value, "", id);
});

test("a book form with a missing, wrong or backwards value is refused in the page without a call", async () => {
  const p = await page(normal({ [ADD]: [201, book()] }));
  const cases = [[1, "", "Fill in every required field."], [1, "abc", "Serials and width are whole numbers."], [5, "12/11/2026", "Authority date is YYYY-MM-DD."],
    [2, "40", "The last serial cannot be before the first."]];
  p.node["book-open"].fire("click");
  for (const [at, value, words] of cases) {
    const v = GOOD_BOOK.slice();
    v[at] = value;
    fill(p, BOOK, v);
    p.node["f-book"].fire("submit");
    assert.equal(text(p, "b-err"), words, words);
  }
  assert.equal(p.sent(ADD).length, 0);
});

test("issuer_not_verified, serial_range_overlaps and a refused field are worded", async () => {
  for (const [reply, words] of [[[409, refused("issuer_not_verified")], "No issuer is verified yet. Verify one first."],
    [[409, refused("serial_range_overlaps")], "These serials overlap an existing book of the same series."],
    [[400, { error: { code: "invalid_request", message: "Raw.", fields: { atp_reference: ["x"] } } }], "Check these fields: Authority reference."],
    [[500, {}], "That did not go through. Check the page before trying again."]]) {
    const p = await page(normal({ [ADD]: reply }));
    submitBook(p);
    await settle();
    assert.equal(text(p, "b-err"), words);
    assert.doesNotMatch(text(p, "b-err"), /Raw|issuer_not_verified|serial_range_overlaps/);
    assert.equal(p.node["f-book"].hidden, false, "the form stays open");
    assert.equal(p.node["b-go"].disabled, false);
  }
});

test("the Printer name is required, plain, and refused when empty; Trade name and Series stay optional", async () => {
  const html = fs.readFileSync(new URL("../public/finance-issuer.html", import.meta.url), "utf8");
  assert.match(html, /<label for="b-printer">Printer name<\/label>/);
  assert.match(html, /<label for="n-trade">Trade name \(optional\)<\/label>/);
  assert.match(html, /<label for="b-series">Series \(optional\)<\/label>/);
  const p = await page(normal({ [ADD]: [201, book()] }));
  const v = GOOD_BOOK.slice();
  v[6] = "   ";
  p.node["book-open"].fire("click");
  fill(p, BOOK, v);
  p.node["f-book"].fire("submit");
  assert.equal(text(p, "b-err"), "Fill in every required field.");
  assert.equal(p.sent(ADD).length, 0);
});

test("every COR date and Authority date input has a label for its id, besides the placeholder", () => {
  const html = fs.readFileSync(new URL("../public/finance-issuer.html", import.meta.url), "utf8");
  for (const [id, name] of [["n-cordate", "COR date"], ["b-atpd", "Authority date"]]) {
    assert.match(html, new RegExp('<label for="' + id + '">' + name + "</label>"), id);
    assert.equal(html.split('id="' + id + '"').length, 2, id + " is one element");
  }
  for (const id of [...NEW, ...BOOK]) assert.match(html, new RegExp('<label for="' + id + '">'), id + " has a label");
});

test("verifying an issuer clears the Add a book form's no-issuer-verified line", async () => {
  let reads = 0;
  const p = await page(normal({ [GET]: () => (++reads === 1 ? issuers(null, pend()) : issuers(profile(), null)), [ADD]: [409, refused("issuer_not_verified")],
    [VERIFY]: [200, pend({ verified_at: "2026-11-13T10:00:00+08:00" })] }));
  submitBook(p);
  await settle();
  assert.equal(text(p, "b-err"), "No issuer is verified yet. Verify one first.");
  p.node["open-verify"].fire("click");
  p.node["verify-form"].fire("submit");
  await settle();
  assert.equal(p.node["f-book"].hidden, false, "the form is still open");
  assert.equal(p.node["b-err"].hidden, true);
  assert.equal(text(p, "b-err"), "");
});

test("a book error that is not about the issuer is kept when the issuer reloads", async () => {
  let reads = 0;
  const p = await page(normal({ [GET]: () => (++reads === 1 ? issuers(profile(), pend()) : issuers(profile(), null)), [ADD]: [409, refused("serial_range_overlaps")],
    [VERIFY]: [200, pend({ verified_at: "2026-11-13T10:00:00+08:00" })] }));
  submitBook(p);
  await settle();
  p.node["open-verify"].fire("click");
  p.node["verify-form"].fire("submit");
  await settle();
  assert.equal(text(p, "b-err"), "These serials overlap an existing book of the same series.");
});

test("an empty series is allowed and is shown as no series", async () => {
  const p = await page(normal({ [BOOKS]: books([book({ series: "" })]), [ADD]: [201, book({ series: "" })] }));
  assert.match(p.node.books.children[0].textContent, /^No series/);
  const v = GOOD_BOOK.slice();
  v[0] = "";
  submitBook(p, v);
  await settle();
  assert.equal(p.sent(ADD)[0].body.series, "");
});

test("the issuer files use no browser storage, and a reload reads everything from the backend", async () => {
  const js = fs.readFileSync(new URL("../public/assets/js/finance-issuer.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie|console\./);
  const again = await page(normal());
  assert.deepEqual(again.shown(), ["v-main"]);
  for (const id of NEW.concat(BOOK)) assert.equal(again.node[id].value, "", id);
});
