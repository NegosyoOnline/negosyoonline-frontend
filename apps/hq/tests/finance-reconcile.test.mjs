/* finance-reconcile.js: the Reconciliation page (Billing HQ-F2, ClickUp z8uq9memvq, plan sections 4.5 and 6). Read only. */
import test from "node:test";
import assert from "node:assert/strict";
import { open, settle, BASE, refused } from "./page.mjs";

const IDS = ["boot", "v-main", "v-closed", "v-down", "retry", "r-h", "r-form", "r-from", "r-to", "r-go", "r-hint", "r-err", "r-loading", "r-card", "r-body", "r-empty", "r-count",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const VIEWS = ["boot", "v-main", "v-closed", "v-down"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const RECONCILE = "POST finance/invoices/reconcile/";

function line(over = {}) {
  return { serial: "SAMPLE-A0012", status: "verified", issued_on: "2026-11-09", total_sales_centavos: 2499000, amount_due_centavos: 2499000, payment_date: "2026-11-09",
    paid_centavos: 2499000, site: "site_f", site_name: "Sample Store F", item: "ii_f", statement: null, adjustments: [], exceptions: [], ...over };
}
const answer = (items) => [200, { items, count: items.length }];

async function page(table) {
  const p = open(["hq.js", "shell.js", "finance-common.js", "finance-reconcile.js"], { ids: IDS, pathname: "/finance/invoices/reconcile/", answers: (call) => {
    const key = call.method + " " + call.url.slice(BASE.length + 1);
    const reply = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    assert.ok(reply !== undefined, "unexpected call: " + key);
    return typeof reply === "function" ? reply(call) : reply;
  } });
  await settle();
  const shown = () => VIEWS.filter((id) => !p.node[id].hidden);
  const sent = () => p.calls.filter((c) => c.method + " " + c.url.slice(BASE.length + 1) === RECONCILE);
  return { ...p, shown, sent };
}
const cells = (p, n = 0) => p.node["r-body"].children[n].children.map((td) => [td.getAttribute("data-label"), td.textContent]);

test("the page asks who is signed in, then reads every invoice with no range", async () => {
  const p = await page({ "GET me/": [200, ME], [RECONCILE]: answer([line()]) });
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url.split("/staff/v1/")[1]), ["GET me/", "POST finance/invoices/reconcile/"]);
  assert.deepEqual(p.sent()[0].body, {}, "an empty range sends no dates");
  assert.deepEqual(p.shown(), ["v-main"]);
  assert.equal(p.node["r-count"].textContent, "Showing 1 invoice.");
  assert.equal(p.node["r-empty"].hidden, true);
});

test("a row shows the serial, the dates, the face amount and amount due against the payment, the site, the statement and the adjustments", async () => {
  const p = await page({ "GET me/": [200, ME], [RECONCILE]: answer([
    line({ total_sales_centavos: 249900, amount_due_centavos: 224910, paid_centavos: 224910, statement: "FIXTURE-STMT-1", adjustments: [{ number: "FIXTURE-NOCN-0001", total_centavos: 50000 }],
      exceptions: [{ code: "discount_or_withholding" }, { code: "issued_late", days: 1 }, { code: "made_up" }] }),
    line({ serial: "SAMPLE-A0013" })]) });
  assert.deepEqual(cells(p, 0), [["Serial", "SAMPLE-A0012"], ["Issued", "Nov 9, 2026"], ["Face amount", "PHP 2,499.00"], ["Amount due", "PHP 2,249.10"],
    ["Payment date", "Nov 9, 2026"], ["Amount paid", "PHP 2,249.10"], ["Site", "Sample Store F"], ["Statement", "FIXTURE-STMT-1"],
    ["Adjustments", "FIXTURE-NOCN-0001, −PHP 500.00"], ["Exceptions", "Discount or withholding presentIssued late by 1 day"]]);
  assert.doesNotMatch(p.node["r-body"].textContent, /made_up/, "an unknown exception is left out");
  assert.deepEqual(cells(p, 1).slice(-3), [["Statement", "None yet"], ["Adjustments", "None"], ["Exceptions", "None"]]);
  assert.equal(p.node["r-count"].textContent, "Showing 2 invoices.");
});

test("every cell carries its label for the stacked phone layout", async () => {
  const p = await page({ "GET me/": [200, ME], [RECONCILE]: answer([line()]) });
  assert.equal(cells(p, 0).length, 10);
  for (const [label] of cells(p, 0)) assert.ok(label);
});

test("a range of two dates is sent, and each date must be a real YYYY-MM-DD or the page calls nothing", async () => {
  const p = await page({ "GET me/": [200, ME], [RECONCILE]: answer([]) });
  p.node["r-from"].value = "2026-11-09"; p.node["r-to"].value = "2026-11-10";
  p.node["r-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent()[1].body, { from: "2026-11-09", to: "2026-11-10" });
  assert.equal(p.node["r-empty"].hidden, false);
  assert.equal(p.node["r-count"].textContent, "Showing 0 invoices.");
  for (const bad of ["09/11/2026", "2026-13-01", "2026-02-30", "x"]) {
    p.node["r-from"].value = bad; p.node["r-to"].value = "";
    p.node["r-form"].fire("submit");
    await settle();
    assert.equal(p.node["r-err"].textContent, "Use the form YYYY-MM-DD.", bad);
  }
  assert.equal(p.sent().length, 2, "no call for a bad date");
  p.node["r-from"].value = ""; p.node["r-to"].value = "2026-11-10";
  p.node["r-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent()[2].body, { to: "2026-11-10" });
  assert.equal(p.node["r-err"].hidden, true);
});

test("a 404 shows the not-switched-on card, a failed first read the down view with Try again, and a failed Show keeps the table", async () => {
  const closed = await page({ "GET me/": [200, ME], [RECONCILE]: [404, refused("not_found")] });
  assert.deepEqual(closed.shown(), ["v-closed"]);
  let n = 0;
  const down = await page({ "GET me/": [200, ME], [RECONCILE]: () => (++n === 1 ? [500] : answer([line()])) });
  assert.deepEqual(down.shown(), ["v-down"]);
  down.node.retry.fire("click");
  await settle();
  assert.deepEqual(down.shown(), ["v-main"]);
  assert.equal(down.node["r-body"].children.length, 1);
  let m = 0;
  const keep = await page({ "GET me/": [200, ME], [RECONCILE]: () => (++m === 1 ? answer([line()]) : [500]) });
  keep.node["r-form"].fire("submit");
  await settle();
  assert.deepEqual(keep.shown(), ["v-main"]);
  assert.equal(keep.node["r-body"].children.length, 1);
  assert.equal(keep.node["r-err"].textContent, "Reconciliation could not be loaded. Try Show again.");
});

test("it is read only: no control but the range and Show, and no storage, address or console use", async () => {
  const fs = await import("node:fs");
  const html = fs.readFileSync(new URL("../public/finance-reconcile.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../public/assets/js/finance-reconcile.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<textarea|type="file"|<select/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|history\.|location\.(?:hash|search)|console\./);
  assert.deepEqual([...js.matchAll(/"POST", "([^"]+)"/g)].map((m) => m[1]), ["finance/invoices/reconcile/"]);
});
