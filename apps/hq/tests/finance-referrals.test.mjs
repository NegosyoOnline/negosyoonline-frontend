/* finance-referrals.js: the HQ Referrals page (Billing B6 FE-1, ClickUp z8uq9mkfpx). Only made-up sample values. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE, refused } from "./page.mjs";

const IDS = ["boot", "v-main", "v-closed", "v-down", "retry", "r-msg", "r-form", "r-account", "r-err", "r-go", "r-result", "r-id", "r-code", "r-by", "r-bal", "r-res", "r-earned",
  "r-correct", "r-referred", "r-referred-empty", "r-ledger", "r-ledger-empty", "m-fix", "fix-sub", "fix-form", "fix-step1", "fix-step2", "fix-amount", "fix-reason", "fix-err", "fix-err2",
  "fix-next", "fix-cancel", "fix-x", "fix-sum", "fix-go", "fix-back",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const VIEW = "POST finance/referrals/view/", FIX = "POST finance/referrals/correct/";
const ACC = "acc_aaaaaaaaaaaaaaaaaaaa";
const data = (over = {}) => ({ account: ACC, referral_code: "AB12CD34", referred_by: "acc_bbbbbbbbbbbbbbbbbbbb", referred: [{ account: "acc_cccccccccccccccccccc", joined_at: "2026-11-20T10:00:00+08:00" }],
  balance_centavos: 100000, reserved_centavos: 20000, earned_count: 2,
  entries: [{ id: 2, kind: "apply", amount_centavos: -50000, payment: "btp_x", reason: "", operator: null, recorded_at: "2026-11-21T10:00:00+08:00" },
    { id: 1, kind: "earn", amount_centavos: 150000, payment: "btp_y", reason: "", operator: null, recorded_at: "2026-11-20T10:00:00+08:00" }], ...over });

async function page(table) {
  const p = open(["hq.js", "shell.js", "finance-common.js", "finance-referrals.js"], { ids: IDS, pathname: "/finance/referrals/", answers: (call) => {
    const key = call.method + " " + call.url.slice(BASE.length + 1);
    const reply = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    assert.ok(reply !== undefined, "unexpected call: " + key);
    return typeof reply === "function" ? reply(call) : reply;
  } });
  await settle();
  const sent = (key) => p.calls.filter((c) => c.method + " " + c.url.slice(BASE.length + 1) === key);
  return { ...p, sent };
}
async function find(p, id = ACC) { p.node["r-account"].value = id; p.node["r-form"].fire("submit"); await settle(); }

test("a staff user finds an account and reads its code, referrer, balance, referred businesses and ledger", async () => {
  const p = await page({ "GET me/": [200, ME], [VIEW]: [200, data()] });
  assert.equal(p.node["v-main"].hidden, false);
  await find(p);
  assert.deepEqual(p.sent(VIEW)[0].body, { account: ACC });
  assert.equal(p.node["r-result"].hidden, false);
  assert.equal(p.node["r-code"].textContent, "AB12CD34");
  assert.equal(p.node["r-bal"].textContent, "PHP 1,000.00");
  assert.equal(p.node["r-res"].textContent, "PHP 200.00");
  assert.equal(p.node["r-earned"].textContent, "2");
  assert.equal(p.node["r-referred"].children.length, 1);
  assert.equal(p.node["r-ledger"].children.length, 2);
  assert.match(p.node["r-ledger"].children[0].textContent, /Applied to a bill -PHP 500\.00/);
  assert.match(p.node["r-ledger"].children[1].textContent, /Earned \+PHP 1,500\.00/);
});

test("an id that is not an account id is refused in the page; a 404 is worded and hides the result", async () => {
  const p = await page({ "GET me/": [200, ME], [VIEW]: [404, refused("not_found")] });
  await find(p, "nonsense");
  assert.equal(p.sent(VIEW).length, 0);
  assert.equal(p.node["r-err"].hidden, false);
  await find(p);
  assert.equal(p.sent(VIEW).length, 1);
  assert.equal(p.node["r-result"].hidden, true);
  assert.match(p.node["r-err"].textContent, /No account with that id, or referrals are not switched on\./);
});

test("Correct balance: a reason is required, a confirm step shows the sum, and one send carries a request id", async () => {
  const p = await page({ "GET me/": [200, ME], [VIEW]: [200, data()], [FIX]: [200, { entry: 5, balance_centavos: 150000 }] });
  await find(p);
  p.node["r-correct"].fire("click");
  assert.equal(p.node["m-fix"].hidden, false);
  p.node["fix-amount"].value = "500"; p.node["fix-reason"].value = "  ";
  p.node["fix-form"].fire("submit");
  assert.equal(p.sent(FIX).length, 0, "no reason, nothing sent");
  assert.match(p.node["fix-err"].textContent, /A reason is required/);
  p.node["fix-reason"].value = "Owner approved a goodwill credit";
  p.node["fix-form"].fire("submit");
  assert.equal(p.sent(FIX).length, 0, "the first step only reviews");
  assert.equal(p.node["fix-step2"].hidden, false);
  assert.match(p.node["fix-sum"].textContent, /^Add PHP 500\.00 to the Subscription Credit of acc_a+\. Balance now PHP 1,000\.00\. Reason: Owner approved a goodwill credit$/);
  p.node["fix-form"].fire("submit");
  await settle();
  const body = p.sent(FIX)[0].body;
  assert.equal(body.account, ACC);
  assert.equal(body.amount_centavos, 50000);
  assert.equal(body.reason, "Owner approved a goodwill credit");
  assert.match(body.request_id, /^[0-9a-f]{32}$/);
  assert.equal(p.node["m-fix"].hidden, true);
});

test("a negative correction is sent as negative centavos; a refusal beyond the balance is worded and stays in the dialog", async () => {
  const p = await page({ "GET me/": [200, ME], [VIEW]: [200, data()], [FIX]: [409, refused("exceeds_balance")] });
  await find(p);
  p.node["r-correct"].fire("click");
  p.node["fix-amount"].value = "-5,000.50"; p.node["fix-reason"].value = "Wrong credit";
  p.node["fix-form"].fire("submit");
  assert.match(p.node["fix-sum"].textContent, /^Take PHP 5,000\.50 away from/);
  p.node["fix-form"].fire("submit");
  await settle();
  assert.equal(p.sent(FIX)[0].body.amount_centavos, -500050);
  assert.equal(p.node["m-fix"].hidden, false);
  assert.match(p.node["fix-err2"].textContent, /more than the spendable balance/);
});

test("a bad amount is refused before the confirm step", async () => {
  const p = await page({ "GET me/": [200, ME], [VIEW]: [200, data()] });
  await find(p);
  p.node["r-correct"].fire("click");
  for (const bad of ["", "abc", "0", "1.234"]) {
    p.node["fix-amount"].value = bad; p.node["fix-reason"].value = "x";
    p.node["fix-form"].fire("submit");
    assert.equal(p.node["fix-step2"].hidden, true, bad);
    assert.match(p.node["fix-err"].textContent, /Enter an amount in pesos/);
  }
});

test("page file: no storage, no console, all routes POST to finance/referrals, the tab is on every Finance page, next.config routes it", () => {
  const js = fs.readFileSync(new URL("../public/assets/js/finance-referrals.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie|console\.|innerHTML|location\.(?:search|hash)/);
  const html = fs.readFileSync(new URL("../public/finance-referrals.html", import.meta.url), "utf8");
  assert.match(html, /<title>Referrals \| NegosyoOnline HQ<\/title>/);
  assert.doesNotMatch(html, /<h[1-6][^>]*tabindex|<select/i);
  assert.deepEqual([...html.matchAll(/<script src="\/assets\/js\/([a-z-]+)\.js/g)].map((m) => m[1]), ["theme", "config", "hq", "menu", "shell", "finance-common", "finance-referrals"]);
  for (const f of ["finance", "finance-usage", "finance-issuer", "finance-invoices", "finance-reconcile", "finance-statements", "finance-accounts", "finance-referrals"]) {
    assert.match(fs.readFileSync(new URL("../public/" + f + ".html", import.meta.url), "utf8"), /<a href="\/finance\/referrals\/"[^>]*>Referrals<\/a><\/nav>/, f);
  }
  const cfg = fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(cfg, /\{ source: "\/finance\/referrals\/", destination: "\/finance-referrals\.html" \}/);
  assert.match(cfg, /\{ source: "\/finance-referrals\.html", destination: "\/finance\/referrals\/", permanent: false \}/);
});
