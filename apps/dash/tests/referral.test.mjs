/* The Overview referral card (ClickUp z8uq9mkfpx, B6 FE-1): which state it shows, from GET /account/referrals/ and the first site's billing state. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const SRC = fs.readFileSync(new URL("../public/assets/js/dashboard.js", import.meta.url), "utf8");
const start = SRC.indexOf("function referralOverview(");
const end = SRC.indexOf("function referralCard(");
const fStart = SRC.indexOf("function firstActiveBilling("), fEnd = SRC.indexOf("function loadReferral(");
const ctx = vm.createContext({});
vm.runInContext("function obj(v) { return v && typeof v === 'object' ? v : {}; }\n" + SRC.slice(start, end) + SRC.slice(fStart, fEnd) + "\nthis.f = referralOverview; this.first = firstActiveBilling;", ctx);
const f = (a, b) => JSON.parse(JSON.stringify(ctx.f(a, b)));
const ok = (data) => ({ ok: true, status: 200, data });
const REF = { started: true, code: "AB12CD34", link: "http://www.negosyotest.com/?ref=AB12CD34", balance: 100000, reserved: 0, earned_count: 1 };

test("programme off or unreadable: no card", () => {
  assert.equal(f(ok({ ...REF, started: false }), ok({ state: "active" })), null);
  assert.equal(f({ ok: false, status: 404, data: {} }, ok({ state: "active" })), null);
  assert.equal(f(null, null), null);
});
test("started but no active paid site: today's 'available once you have an active paid subscription' card", () => {
  for (const state of ["trial_active", "payment_requires_attention", "suspended", "cancelled"]) assert.deepEqual(f(ok(REF), ok({ state })), { pending: true });
  assert.deepEqual(f(ok(REF), { ok: false, status: 500, data: {} }), { pending: true });
});
test("started and an active paid site: the link, the credit balance and the credits earned", () => {
  assert.deepEqual(f(ok(REF), ok({ state: "active" })), { code: "AB12CD34", link: REF.link, balance: 100000, earned_count: 1 });
});
test("dashboard.js draws the credit from centavos and keeps every API string out of innerHTML", () => {
  assert.ok(SRC.includes('peso(ref.balance / 100)'));
  assert.ok(!/referralFigures[\s\S]{0,600}innerHTML/.test(SRC));
});

test("rule 6: ANY of the account's sites being active makes the card live; the search stops at the first active one", async () => {
  const read = []; const states = { site_1: "trial_active", site_2: "active", site_3: "active" };
  const found = await ctx.first(["site_1", "site_2", "site_3"], (id) => { read.push(id); return Promise.resolve(ok({ state: states[id] })); });
  assert.deepEqual(read, ["site_1", "site_2"], "an inactive first site, an active second one; the third is never read");
  assert.equal(found.data.state, "active");
  assert.deepEqual(f(ok(REF), found), { code: "AB12CD34", link: REF.link, balance: 100000, earned_count: 1 });
  const none = await ctx.first(["site_1"], () => Promise.resolve(ok({ state: "suspended" })));
  assert.equal(none, null);
  assert.deepEqual(f(ok(REF), none), { pending: true });
  const failed = await ctx.first(["site_1", "site_2"], (id) => Promise.resolve(id === "site_1" ? { ok: false, status: 500, data: {} } : ok({ state: "active" })));
  assert.equal(failed.data.state, "active", "a failed read of one site does not hide an active one");
});
