/* finance-statements.js: the Statements page (Billing HQ-F3, ClickUp z8uq9mewgk, plan sections 2 and 4). Only made-up sample values.
   The page decides nothing: the backend does, and the page follows its answer. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE, refused } from "./page.mjs";

const IDS = ["boot", "v-list", "v-one", "v-closed", "v-down", "retry", "tab-all", "tab-statement", "tab-adjustment", "tab-failed", "l-err", "l-loading",
  "l-card", "l-body", "l-empty", "l-count", "more-row", "more", "o-back", "o-msg", "o-loading", "o-body", "o-title", "o-kind", "o-test", "o-delivery",
  "o-facts", "o-pdf", "o-pdf-open", "o-pdf-load", "o-pdf-err", "o-resend", "o-adjust", "o-lines", "o-lines-empty", "o-adj-card", "o-adj", "o-adj-empty",
  "o-left", "o-del-card", "o-del", "o-del-empty", "m-resend", "resend-x", "resend-form", "resend-e", "resend-go", "resend-cancel",
  "m-adjust", "m-adjust-sub", "adjust-x", "adjust-form", "a-reason", "a-lines", "a-add", "a-sum", "a-e", "adjust-go", "adjust-cancel",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const VIEWS = ["boot", "v-list", "v-one", "v-closed", "v-down"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const LIST = "POST finance/statements/list/", DETAIL = "POST finance/statements/detail/", ADJUST = "POST finance/statements/adjust/",
  RESEND = "POST finance/statements/resend/", PDF = "POST finance/statements/pdf/";

const att = (over = {}) => ({ attempt: 1, status: "sent", error_code: "", at: "2026-11-10T09:00:00+08:00", ...over });
const stm = (over = {}) => ({ statement: "stm_one", number: "NOBS-2026-000001", document_type: "statement", kind: "monthly",
  site: { id: "site_a", name: "Sample Store A" }, total_centavos: 249900, currency: "PHP", is_test: false, issued_at: "2026-11-10T09:00:00+08:00",
  period_start: "2026-11-01", period_end: "2026-11-30", payment_reference: "btp_sample", original: null, original_number: null,
  adjustment_reason: "", delivery: att(), ...over });
const detail = (over = {}) => stm({ lines: [{ position: 1, kind: "plan", description: "Monthly Plan", quantity: 1, unit_centavos: 249900, amount_centavos: 249900 }],
  adjustments: [], remaining_centavos: 249900, reasons: ["billing_error", "goodwill", "other"], deliveries: [att(), att({ attempt: 2, status: "failed", error_code: "smtp_down" })], ...over });
const answer = (items, over = {}) => [200, { items, next_cursor: null, ...over }];

async function page(table, globals = {}) {
  const p = open(["hq.js", "shell.js", "finance-common.js", "finance-statements.js"], { ids: IDS, pathname: "/finance/statements/", globals, answers: (call) => {
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
const openOne = async (p) => { p.node["l-body"].children[0].children.at(-1).children[0].click(); await settle(); };
const cells = (p, n = 0) => p.node["l-body"].children[n].children.map((td) => [td.getAttribute("data-label"), td.textContent]);

test("the page asks who is signed in, then lists with no filter", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: answer([stm()]) });
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url.split("/staff/v1/")[1]), ["GET me/", "POST finance/statements/list/"]);
  assert.deepEqual(p.sent(LIST)[0].body, {});
  assert.deepEqual(p.shown(), ["v-list"]);
  assert.equal(p.node["l-count"].textContent, "Showing 1 statement.");
  assert.deepEqual(cells(p).map((c) => c[1]), ["NOBS-2026-000001", "Nov 10, 2026", "Sample Store A", "Monthly", "Nov 1, 2026 to Nov 30, 2026", "PHP 2,499.00", "Sent", "View"]);
});

test("a 404 shows the not-switched-on card; another failure shows the down card and retry works", async () => {
  const closed = await page({ "GET me/": [200, ME], [LIST]: [404, refused("not_found")] });
  assert.deepEqual(closed.shown(), ["v-closed"]);
  let fail = [500, {}];
  const p = await page({ "GET me/": [200, ME], [LIST]: () => fail });
  assert.deepEqual(p.shown(), ["v-down"]);
  fail = answer([stm()]);
  p.node.retry.click();
  await settle();
  assert.deepEqual(p.shown(), ["v-list"]);
});

test("a signed-out answer leaves the page", async () => {
  const p = await page({ "GET me/": [401, refused("unauthenticated")] });
  assert.equal(p.location.replaced, "/sign-in/");
});

test("each tab sends its own filter; an empty tab says so", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: answer([]) });
  assert.equal(p.node["l-empty"].textContent, "No statements yet.");
  for (const [tab, body] of [["tab-statement", { document_type: "statement" }], ["tab-adjustment", { document_type: "adjustment" }],
    ["tab-failed", { delivery_failed: true }], ["tab-all", {}]]) {
    p.node[tab].click();
    await settle();
    assert.deepEqual(p.sent(LIST).at(-1).body, body, tab);
  }
  p.node["tab-failed"].click();
  await settle();
  assert.equal(p.node["l-empty"].textContent, "No failed deliveries.");
  assert.equal(p.node["tab-failed"].getAttribute("aria-pressed"), "true");
});

test("delivery chips: failed, pending, none yet, and nothing for an adjustment; a test statement is marked", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: answer([
    stm({ delivery: att({ status: "failed" }) }), stm({ statement: "stm_b", delivery: att({ status: "pending" }) }),
    stm({ statement: "stm_c", delivery: null, is_test: true }),
    stm({ statement: "stm_d", document_type: "adjustment", kind: "adjustment", delivery: null, total_centavos: -50000 }),
    stm({ statement: "stm_e", delivery: att({ status: "bounced_oddly" }) })]) });
  const d = (n) => cells(p, n).find((c) => c[0] === "Delivery")[1];
  assert.deepEqual([0, 1, 2, 3, 4].map(d), ["Failed", "Pending", "Not sent yet", "", "Not sent yet"]);
  assert.match(cells(p, 2)[0][1], /Test$/);
  assert.equal(cells(p, 3).find((c) => c[0] === "Total")[1], "−PHP 500.00");
  assert.doesNotMatch(p.node["l-body"].textContent, /bounced_oddly/);
});

test("Load more passes the cursor and adds rows", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: (call) => (call.body.cursor ? answer([stm({ statement: "stm_two", number: "NOBS-2026-000002" })])
    : answer([stm()], { next_cursor: "stm_one" })) });
  assert.equal(p.node["more-row"].hidden, false);
  p.node.more.click();
  await settle();
  assert.deepEqual(p.sent(LIST)[1].body, { cursor: "stm_one" });
  assert.equal(p.node["l-body"].children.length, 2);
  assert.equal(p.node["more-row"].hidden, true);
});

test("a statement shows its facts, lines, adjustments and attempts newest first, as text only", async () => {
  const bad = "<img src=x onerror=alert(1)>";
  const p = await page({ "GET me/": [200, ME], [LIST]: answer([stm()]), [DETAIL]: [200, detail({ adjustments: [{ statement: "stm_adj", number: "NOCN-2026-000001", total_centavos: -50000, reason: "goodwill" }],
    remaining_centavos: 199900, lines: [{ position: 1, kind: "plan", description: bad, quantity: 1, unit_centavos: 249900, amount_centavos: 249900 }] })] });
  await openOne(p);
  assert.deepEqual(p.sent(DETAIL)[0].body, { statement: "stm_one" });
  assert.deepEqual(p.shown(), ["v-one"]);
  assert.equal(p.node["o-title"].textContent, "NOBS-2026-000001");
  assert.match(p.node["o-facts"].textContent, /Sample Store A/);
  assert.match(p.node["o-facts"].textContent, /btp_sample/);
  assert.equal(p.node["o-lines"].children[0].children[0].textContent, bad);
  assert.equal(p.node["o-lines"].children[0].children[0].children.length, 0, "no element was made from the text");
  assert.match(p.node["o-adj"].textContent, /NOCN-2026-000001, −PHP 500.00/);
  assert.match(p.node["o-adj"].textContent, /Goodwill reduction/);
  assert.equal(p.node["o-left"].textContent, "Left to adjust: PHP 1,999.00");
  assert.deepEqual(p.node["o-del"].children.map((li) => li.textContent.slice(0, 14)), ["Attempt 2Faile", "Attempt 1SentN"]);
  assert.doesNotMatch(p.node["o-body"].textContent, /smtp_down/);
  assert.equal(p.node["o-resend"].hidden, false);
  assert.equal(p.node["o-adjust"].hidden, false);
});

test("an adjustment hides Resend, Adjust, adjustments and attempts; a test statement hides Resend; nothing left hides Adjust", async () => {
  const adj = await page({ "GET me/": [200, ME], [LIST]: answer([stm({ document_type: "adjustment" })]), [DETAIL]: [200, detail({ document_type: "adjustment", kind: "adjustment",
    original: "stm_one", original_number: "NOBS-2026-000001", adjustment_reason: "billing_error", remaining_centavos: null, delivery: null, total_centavos: -50000 })] });
  await openOne(adj);
  assert.deepEqual([adj.node["o-resend"].hidden, adj.node["o-adjust"].hidden, adj.node["o-adj-card"].hidden, adj.node["o-del-card"].hidden], [true, true, true, true]);
  assert.match(adj.node["o-facts"].textContent, /AdjustsNOBS-2026-000001/);
  assert.match(adj.node["o-facts"].textContent, /Billing error/);
  const t = await page({ "GET me/": [200, ME], [LIST]: answer([stm()]), [DETAIL]: [200, detail({ is_test: true, remaining_centavos: 0 })] });
  await openOne(t);
  assert.deepEqual([t.node["o-resend"].hidden, t.node["o-adjust"].hidden, t.node["o-test"].hidden], [true, true, false]);
});

test("a missing statement returns to the list with a message", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: answer([stm()]), [DETAIL]: [404, refused("not_found")] });
  await openOne(p);
  assert.deepEqual(p.shown(), ["v-list"]);
  assert.equal(p.node["l-err"].textContent, "That statement was not found.");
});

test("Resend asks first, sends the statement id, and reports sent, failed and the test refusal", async () => {
  let reply = [200, att({ attempt: 3 })];
  const p = await page({ "GET me/": [200, ME], [LIST]: answer([stm()]), [DETAIL]: [200, detail()], [RESEND]: () => reply });
  await openOne(p);
  p.node["o-resend"].click();
  assert.equal(p.node["m-resend"].hidden, false);
  assert.equal(p.sent(RESEND).length, 0, "nothing is sent before the confirm");
  p.node["resend-form"].fire("submit");
  assert.equal(p.node["resend-go"].disabled, true);
  p.node["resend-form"].fire("submit");
  await settle();
  assert.equal(p.sent(RESEND).length, 1, "a second submit while busy sends nothing");
  assert.deepEqual(p.sent(RESEND)[0].body, { statement: "stm_one" });
  assert.equal(p.node["m-resend"].hidden, true);
  assert.equal(p.node["o-msg"].textContent, "The statement was sent.");
  assert.equal(p.sent(DETAIL).length, 2, "the attempts are read again");
  reply = [200, att({ attempt: 4, status: "failed" })];
  p.node["o-resend"].click();
  p.node["resend-form"].fire("submit");
  await settle();
  assert.equal(p.node["o-msg"].textContent, "The email could not be sent. The attempt is recorded.");
  reply = [409, refused("test_document")];
  p.node["o-resend"].click();
  p.node["resend-form"].fire("submit");
  await settle();
  assert.equal(p.node["resend-e"].textContent, "A test statement is never emailed.");
  assert.equal(p.node["m-resend"].hidden, false);
});

test("Adjust sends exactly the reason and negative lines from the typed pesos", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: answer([stm()]), [DETAIL]: [200, detail()], [ADJUST]: [201, stm({ statement: "stm_adj", number: "NOCN-2026-000001" })] });
  await openOne(p);
  p.node["o-adjust"].click();
  assert.equal(p.node["m-adjust"].hidden, false);
  const reasons = p.node["a-reason"].children.map((o) => o.textContent);
  assert.deepEqual(reasons, ["Choose a reason", "Billing error", "Goodwill reduction", "Other"]);
  p.node["adjust-form"].fire("submit");
  assert.equal(p.node["a-e"].textContent, "Choose a reason.");
  p.node["a-reason"].value = "goodwill";
  p.node["adjust-form"].fire("submit");
  assert.equal(p.node["a-e"].textContent, "Each line needs a description.");
  const line = () => p.node["a-lines"].children.at(-1).children;
  line()[1].value = "Goodwill credit";
  line()[3].value = "abc";
  p.node["adjust-form"].fire("submit");
  assert.match(p.node["a-e"].textContent, /Each amount/);
  line()[3].value = "1,000.50";
  line()[3].fire("input");
  assert.match(p.node["a-sum"].textContent, /Total reduction: PHP 1,000.50\. Left to adjust: PHP 2,499.00/);
  p.node["a-add"].click();
  assert.equal(p.node["a-lines"].children.length, 2);
  line()[1].value = "Second";
  line()[3].value = "0.5";
  p.node["adjust-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(ADJUST)[0].body, { statement: "stm_one", reason: "goodwill",
    lines: [{ description: "Goodwill credit", amount_centavos: -100050 }, { description: "Second", amount_centavos: -50 }] });
  assert.equal(p.node["m-adjust"].hidden, true);
  assert.equal(p.node["o-msg"].textContent, "Adjustment NOCN-2026-000001 was made.");
});

test("Adjust refuses a total above what is left, and words the 409, 400 and 503 answers", async () => {
  let reply = [409, refused("exceeds_remaining")];
  const p = await page({ "GET me/": [200, ME], [LIST]: answer([stm()]), [DETAIL]: [200, detail({ remaining_centavos: 10000 })], [ADJUST]: () => reply });
  await openOne(p);
  p.node["o-adjust"].click();
  p.node["a-reason"].value = "other";
  const line = p.node["a-lines"].children[0].children;
  line[1].value = "Too much";
  line[3].value = "100.01";
  p.node["adjust-form"].fire("submit");
  assert.equal(p.node["a-e"].textContent, "That is more than is left of the statement.");
  assert.equal(p.sent(ADJUST).length, 0, "nothing is sent");
  line[3].value = "100";
  for (const [r, words] of [[[409, refused("exceeds_remaining")], "That is more than is left of the statement."], [[409, refused("not_adjustable")], "An adjustment cannot be adjusted."],
    [[400, refused("invalid_request")], "Check the reason and the lines. Each line needs a description and an amount."],
    [[503, refused("store_unavailable")], "The statement store is not available now. Try again later."]]) {
    reply = r;
    p.node["adjust-form"].fire("submit");
    await settle();
    assert.equal(p.node["a-e"].textContent, words);
    assert.equal(p.node["m-adjust"].hidden, false);
  }
});

test("Adjust allows at most ten lines", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: answer([stm()]), [DETAIL]: [200, detail()] });
  await openOne(p);
  p.node["o-adjust"].click();
  for (let i = 0; i < 12; i++) p.node["a-add"].click();
  assert.equal(p.node["a-lines"].children.length, 10);
  assert.equal(p.node["a-add"].hidden, true);
});

test("View PDF reads the file, offers it only when it is a PDF, and releases it on closing", async () => {
  const made = [], freed = [];
  const URLish = { createObjectURL: (b) => { made.push(b); return "blob:sample-" + made.length; }, revokeObjectURL: (u) => freed.push(u) };
  let reply = [200, { type: "application/pdf" }];
  const p = await page({ "GET me/": [200, ME], [LIST]: answer([stm()]), [DETAIL]: [200, detail()], [PDF]: () => reply }, { URL: URLish });
  await openOne(p);
  p.node["o-pdf"].click();
  await settle();
  assert.deepEqual(p.sent(PDF)[0].body, { statement: "stm_one" });
  assert.equal(p.node["o-pdf-open"].getAttribute("href"), "blob:sample-1");
  assert.equal(p.node["o-pdf-open"].hidden, false);
  p.node["o-back"].fire("click");
  assert.deepEqual(freed, ["blob:sample-1"]);
  assert.equal(p.node["o-pdf-open"].getAttribute("href"), null);
  await settle();
  await openOne(p);
  reply = [200, { type: "text/html" }];
  p.node["o-pdf"].click();
  await settle();
  assert.equal(p.node["o-pdf-open"].hidden, true);
  assert.equal(p.node["o-pdf-err"].textContent, "The PDF could not be loaded.");
  reply = [503, refused("store_unavailable")];
  p.node["o-pdf"].click();
  await settle();
  assert.equal(p.node["o-pdf-err"].textContent, "The statement file is not available now.");
});

test("the page makes only the five statement calls, carries the sub-navigation and is routed", () => {
  const js = fs.readFileSync(new URL("../public/assets/js/finance-statements.js", import.meta.url), "utf8");
  assert.deepEqual([...new Set([...js.matchAll(/"(finance\/[^"]+)"/g)].map((m) => m[1]))].sort(), ["finance/statements/adjust/", "finance/statements/detail/", "finance/statements/list/",
    "finance/statements/pdf/", "finance/statements/resend/"]);
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|localStorage|sessionStorage/);
  for (const f of ["finance", "finance-usage", "finance-issuer", "finance-invoices", "finance-reconcile", "finance-accounts", "finance-statements"]) {
    const html = fs.readFileSync(new URL("../public/" + f + ".html", import.meta.url), "utf8");
    assert.match(html, /<a href="\/finance\/statements\/"[^>]*>Statements<\/a><a href="\/finance\/accounts\/"[^>]*>Accounts<\/a>/, f);
  }
  const html = fs.readFileSync(new URL("../public/finance-statements.html", import.meta.url), "utf8");
  assert.match(html, /<a href="\/finance\/statements\/" aria-current="page">Statements<\/a>/);
  assert.doesNotMatch(html, /<script>|<style|onclick=/);
  const cfg = fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(cfg, /\{ source: "\/finance\/statements\/", destination: "\/finance-statements\.html" \}/);
  assert.match(cfg, /\{ source: "\/finance-statements\.html", destination: "\/finance\/statements\/", permanent: false \}/);
  for (const id of IDS.filter((i) => !/^(acct-|menu-|sign-out|theme-toggle)/.test(i) && !["a-reason"].includes(i))) assert.ok(html.includes('id="' + id + '"'), id + " is in the page");
});
