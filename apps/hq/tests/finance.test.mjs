/* finance.js: the Finance page, where an operator reviews bank transfer proofs (Billing Build B2a, ClickUp
   z8uq9me581, plan section 6). The page settles nothing: the backend does, and the page follows its answer.
   The proof has no address: it is held in the tab's memory and shown from an object address that is released. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE, refused } from "./page.mjs";

const IDS = ["boot", "v-queue", "v-pay", "v-closed", "v-down", "retry",
  "tab-submitted", "tab-confirmed", "tab-rejected", "tab-replaced", "q-msg", "q-loading", "rows", "q-empty", "more-row", "more",
  "back", "p-loading", "p-body", "p-msg", "p-site", "p-site-id", "p-status", "p-amount", "p-plan", "p-date", "p-ref",
  "p-submitted", "p-email", "p-decided", "proof-loading", "proof-img", "proof-pdf", "proof-err", "proof-retry",
  "act", "confirm-form", "amount", "amount-err", "confirm-go", "confirm-step", "confirm-ask", "confirm-yes", "confirm-no",
  "reject-form", "reason", "note", "reject-err", "reject-go", "history",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const VIEWS = ["boot", "v-queue", "v-pay", "v-closed", "v-down"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const ago = (ms) => new Date(Date.now() - ms).toISOString();

function payment(over = {}) {
  return { id: "btp_one", status: "submitted", site: { id: "site_ana", name: "Ana's Store" },
    plan: { code: "launch_promo", name: "NegosyoOnline Launch Promo (6 Months)", months: 6 },
    amount_centavos: 499900, currency: "PHP", transferred_on: "2026-11-20", transfer_reference: "REF-7781",
    submitted_at: "2026-11-11T09:02:00+08:00", decided_at: null, decided_by: null, amount_received_centavos: null,
    reject_reason: null, reject_note: null, proof: { content_type: "image/jpeg", size_bytes: 412345 }, cycle: null, ...over };
}
function detail(over = {}) {
  return { ...payment(), subscriber_email: "ana@example.com",
    subscription: { state: "trial_active", trial_end_at: "2026-12-01T00:00:00+08:00", service_ended_at: null },
    history: [{ code: "submitted", actor: "owner", at: "2026-11-11T09:02:00+08:00" }], ...over };
}
const CONFIRMED = { status: "confirmed", decided_at: "2026-11-12T10:00:00+08:00", decided_by: "sample.staff",
  amount_received_centavos: 499900, cycle: { sequence: 1, start_at: "2026-12-01T00:00:00+08:00", end_at: "2027-06-01T00:00:00+08:00" } };
const list = (items, over = {}) => [200, { items, next_cursor: null, under_review_count: items.length, ...over }];
const JPEG = { type: "image/jpeg", size: 3 };
const L = "POST finance/payments/list/", D = "POST finance/payments/detail/", P = "POST finance/payments/proof/",
  C = "POST finance/payments/confirm/", R = "POST finance/payments/reject/";

/* table: what each route answers, a reply or a function of the call. */
async function page(table) {
  const made = [], freed = [];
  const URL = { createObjectURL(blob) { made.push(blob); return "blob:held/" + made.length; }, revokeObjectURL(u) { freed.push(u); } };
  const p = open(["hq.js", "shell.js", "finance.js"], { ids: IDS, pathname: "/finance/", globals: { URL }, answers: (call) => {
    const key = call.method + " " + call.url.slice(BASE.length + 1);
    const reply = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    assert.ok(reply !== undefined, "unexpected call: " + key);
    return typeof reply === "function" ? reply(call) : reply;
  } });
  await settle();
  const shown = () => VIEWS.filter((id) => !p.node[id].hidden);
  const sent = (key) => p.calls.filter((c) => c.method + " " + c.url.slice(BASE.length + 1) === key);
  return { ...p, made, freed, shown, sent, table };
}
/* The queue with one payment under review, then that payment opened. */
async function opened(table = {}, one = detail()) {
  const p = await page({ "GET me/": [200, ME], [L]: list([payment(one)]), [D]: [200, one], [P]: [200, JPEG], ...table });
  p.node.rows.children[0].all((n) => n.tagName === "BUTTON")[0].fire("click");
  await settle();
  return p;
}
async function confirmWith(p, typed) {
  p.node.amount.value = typed;
  p.node["confirm-form"].fire("submit");
  if (!p.node["confirm-step"].hidden) p.node["confirm-yes"].fire("click");
  await settle();
}

/* ---- the queue ---- */

test("the page asks who is signed in, tells the shell, then lists the payments under review", async () => {
  const p = await page({ "GET me/": [200, ME], [L]: list([payment({ submitted_at: ago(2 * 3600e3 + 60e3) })]) });
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url.slice(BASE.length + 1)), ["GET me/", L]);
  assert.deepEqual(p.calls[1].body, { status: "submitted" });
  assert.deepEqual(p.shown(), ["v-queue"]);
  assert.equal(p.node["acct-name"].textContent, "sample.staff");
  assert.equal(p.node["acct-row"].hidden, false);
  assert.equal(p.node["tab-submitted"].textContent, "Under review (1)");
  assert.equal(p.node["tab-submitted"].getAttribute("aria-pressed"), "true");
  assert.equal(p.node["tab-confirmed"].getAttribute("aria-pressed"), "false");
  const row = p.node.rows.children[0];
  assert.match(row.textContent, /^Ana's StoreWaiting 2 hoursNegosyoOnline Launch Promo \(6 Months\) · PHP 4,999\.00Transferred 20 Nov 2026 · Submitted /);
  assert.equal(row.all((n) => n.tagName === "BUTTON")[0].textContent, "Review");
  assert.equal(p.node["q-empty"].hidden, true);
  assert.equal(p.node["more-row"].hidden, true);
});

test("how long a payment has waited is said in minutes, hours or days", async () => {
  const waits = [[30e3, "1 minute"], [5 * 60e3, "5 minutes"], [3600e3 + 5e3, "1 hour"], [3 * 86400e3 + 5e3, "3 days"]];
  const p = await page({ "GET me/": [200, ME], [L]: list(waits.map(([ms], i) => payment({ id: "btp_" + i, submitted_at: ago(ms) }))) });
  assert.deepEqual(p.node.rows.children.map((li) => li.all((n) => n.classList.contains("chip"))[0].textContent),
    waits.map(([, words]) => "Waiting " + words));
});

test("each tab lists its own status, with View, no waiting time and its own empty words", async () => {
  const p = await page({ "GET me/": [200, ME], [L]: (call) => (call.body.status === "confirmed"
    ? list([payment({ ...CONFIRMED })], { under_review_count: 4 }) : list([])) });
  assert.equal(p.node["q-empty"].textContent, "No payments are waiting for review.");
  assert.equal(p.node["q-empty"].hidden, false);
  assert.equal(p.node["tab-submitted"].textContent, "Under review (0)");
  p.node["tab-confirmed"].fire("click");
  await settle();
  assert.deepEqual(p.sent(L)[1].body, { status: "confirmed" });
  assert.equal(p.node["tab-confirmed"].getAttribute("aria-pressed"), "true");
  assert.equal(p.node["tab-submitted"].getAttribute("aria-pressed"), "false");
  assert.equal(p.node["tab-submitted"].textContent, "Under review (4)");
  const row = p.node.rows.children[0];
  assert.equal(row.all((n) => n.tagName === "BUTTON")[0].textContent, "View");
  assert.equal(row.all((n) => n.classList.contains("chip")).length, 0);
  for (const id of ["tab-rejected", "tab-replaced"]) {
    p.node[id].fire("click");
    await settle();
    assert.equal(p.node["q-empty"].textContent, "No payments here yet.");
    assert.equal(p.node["q-empty"].hidden, false);
    assert.equal(p.node.rows.children.length, 0);
  }
  assert.deepEqual(p.sent(L).map((c) => c.body.status), ["submitted", "confirmed", "rejected", "replaced"]);
});

test("Load more asks for the next page with the cursor and adds to the list", async () => {
  const p = await page({ "GET me/": [200, ME], [L]: (call) => (call.body.cursor
    ? list([payment({ id: "btp_two", site: { id: "site_b", name: "Ben's Shop" } })], { under_review_count: 2 })
    : list([payment()], { next_cursor: "btp_one", under_review_count: 2 })) });
  assert.equal(p.node["more-row"].hidden, false);
  p.node.more.fire("click");
  assert.equal(p.node.more.disabled, true);
  await settle();
  assert.deepEqual(p.sent(L)[1].body, { status: "submitted", cursor: "btp_one" });
  assert.equal(p.node.rows.children.length, 2);
  assert.match(p.node.rows.children[1].textContent, /^Ben's Shop/);
  assert.equal(p.node["more-row"].hidden, true);
});

test("a person who is not signed in is sent where the answer says, and no payment is asked for", async () => {
  const out = await page({ "GET me/": [401, refused("unauthenticated")] });
  assert.equal(out.location.replaced, "/sign-in/");
  assert.equal(out.calls.length, 1);
  assert.equal(out.node["acct-row"].hidden, true);
  const half = await page({ "GET me/": [401, refused("second_step_required")] });
  assert.equal(half.location.replaced, "/verify/");
  const later = await page({ "GET me/": [200, ME], [L]: [401, refused("unauthenticated")] });
  assert.equal(later.location.replaced, "/sign-in/");
  assert.equal(later.node["v-queue"].hidden, true);
});

test("the closed state when bank transfer is off, and the not-reached state with Try again", async () => {
  const closed = await page({ "GET me/": [200, ME], [L]: [404, refused("not_found")] });
  assert.deepEqual(closed.shown(), ["v-closed"]);
  for (const reply of ["offline", [500, refused("server_error")]]) {
    const down = await page({ "GET me/": [200, ME], [L]: reply });
    assert.deepEqual(down.shown(), ["v-down"]);
    down.table[L] = list([payment()]);
    down.node.retry.fire("click");
    await settle();
    assert.deepEqual(down.shown(), ["v-queue"]);
    assert.equal(down.sent("GET me/").length, 1, "who is signed in is asked once");
  }
  const none = await page({ "GET me/": "offline" });
  assert.deepEqual(none.shown(), ["v-down"]);
  assert.equal(none.node["acct-row"].hidden, true);
});

/* ---- one payment ---- */

test("a payment opens with its facts, the Subscriber's email, its history and the two actions", async () => {
  const p = await opened();
  assert.deepEqual(p.shown(), ["v-pay"]);
  assert.deepEqual(p.sent(D)[0].body, { payment: "btp_one" });
  assert.deepEqual(p.sent(P)[0].body, { payment: "btp_one" });
  assert.equal(p.node["p-site"].textContent, "Ana's Store");
  assert.equal(p.node["p-site-id"].textContent, "site_ana");
  assert.equal(p.node["p-status"].textContent, "Under review");
  assert.equal(p.node["p-amount"].textContent, "PHP 4,999.00");
  assert.equal(p.node["p-plan"].textContent, "NegosyoOnline Launch Promo (6 Months), 6 months");
  assert.equal(p.node["p-date"].textContent, "20 Nov 2026");
  assert.equal(p.node["p-ref"].textContent, "REF-7781");
  assert.equal(p.node["p-submitted"].textContent, "11 Nov 2026, 9:02 AM");
  assert.equal(p.node["p-email"].textContent, "ana@example.com");
  assert.equal(p.node["p-decided"].hidden, true);
  assert.deepEqual(p.node.history.children.map((li) => li.textContent), ["Submitted by the Subscriber, 11 Nov 2026, 9:02 AM"]);
  assert.equal(p.node.act.hidden, false);
  assert.equal(p.node.amount.value, "", "the page never fills in the amount");
  assert.equal(p.node["confirm-step"].hidden, true);
});

test("a payment with no reference says so, and a one-month plan is said in the singular", async () => {
  const p = await opened({}, detail({ transfer_reference: "", plan: { code: "monthly", name: "NegosyoOnline Monthly", months: 1 } }));
  assert.equal(p.node["p-ref"].textContent, "Not given");
  assert.equal(p.node["p-plan"].textContent, "NegosyoOnline Monthly, 1 month");
});

test("a decided or replaced payment says who decided and offers no action", async () => {
  const done = await opened({}, detail({ ...CONFIRMED, history: [
    { code: "submitted", actor: "owner", at: "2026-11-11T09:02:00+08:00" },
    { code: "confirmed", actor: "operator", at: "2026-11-12T10:00:00+08:00" },
    { code: "something_new", actor: "operator", at: "2026-11-12T10:01:00+08:00" }] }));
  assert.equal(done.node["p-status"].textContent, "Confirmed");
  assert.equal(done.node["p-decided"].textContent, "Confirmed by sample.staff, 12 Nov 2026, 10:00 AM. Paid period: 1 Dec 2026 to 1 Jun 2027.");
  assert.equal(done.node.act.hidden, true);
  assert.deepEqual(done.node.history.children.map((li) => li.textContent),
    ["Submitted by the Subscriber, 11 Nov 2026, 9:02 AM", "Confirmed by an operator, 12 Nov 2026, 10:00 AM"]);
  const no = await opened({}, detail({ status: "rejected", decided_at: "2026-11-12T10:00:00+08:00", decided_by: "sample.staff",
    reject_reason: "not_received", reject_note: "Nothing arrived by Friday." }));
  assert.equal(no.node["p-decided"].textContent,
    "Rejected by sample.staff, 12 Nov 2026, 10:00 AM. Reason: The money has not arrived. Nothing arrived by Friday.");
  assert.equal(no.node.act.hidden, true);
  const old = await opened({}, detail({ status: "replaced" }));
  assert.equal(old.node["p-decided"].textContent, "The Subscriber sent a newer proof.");
  assert.equal(old.node.act.hidden, true);
});

test("Back to payments returns to the queue and reads it again; a reload would too", async () => {
  const p = await opened();
  const e = p.node.back.fire("click");
  await settle();
  assert.equal(e.prevented, true);
  assert.deepEqual(p.shown(), ["v-queue"]);
  assert.equal(p.sent(L).length, 2);
});

/* ---- the proof ---- */

test("an image proof is shown from an object address, which is released when the payment is closed", async () => {
  for (const type of ["image/jpeg", "image/png"]) {
    const p = await opened({ [P]: [200, { type, size: 3 }] });
    assert.equal(p.made.length, 1);
    assert.equal(p.node["proof-img"].getAttribute("src"), "blob:held/1");
    assert.equal(p.node["proof-img"].hidden, false);
    assert.equal(p.node["proof-pdf"].hidden, true);
    assert.equal(p.node["proof-loading"].hidden, true);
    assert.equal(p.node["proof-err"].hidden, true);
    assert.deepEqual(p.freed, []);
    p.node.back.fire("click");
    await settle();
    assert.deepEqual(p.freed, ["blob:held/1"]);
    assert.equal(p.node["proof-img"].hasAttribute("src"), false);
    assert.equal(p.node["proof-img"].hidden, true);
  }
});

test("a PDF proof is not shown in the page: it is a link that opens in a new tab", async () => {
  const p = await opened({ [P]: [200, { type: "application/pdf", size: 3 }] });
  assert.equal(p.node["proof-img"].hidden, true);
  assert.equal(p.node["proof-img"].hasAttribute("src"), false);
  assert.equal(p.node["proof-pdf"].hidden, false);
  assert.equal(p.node["proof-pdf"].getAttribute("href"), "blob:held/1");
  p.node.back.fire("click");
  await settle();
  assert.deepEqual(p.freed, ["blob:held/1"]);
  assert.equal(p.node["proof-pdf"].hasAttribute("href"), false);
});

test("any other type is never shown or opened, and no object address is made for it", async () => {
  for (const type of ["text/html", "image/svg+xml", "application/octet-stream", "image/jpeg; charset=utf-8", "IMAGE/JPEG", ""]) {
    const p = await opened({ [P]: [200, { type, size: 3 }] });
    assert.equal(p.node["proof-err"].hidden, false, type);
    assert.equal(p.node["proof-img"].hidden, true, type);
    assert.equal(p.node["proof-pdf"].hidden, true, type);
    assert.deepEqual(p.made, [], type);
  }
});

test("a proof that fails to load says so, and Try again reads it once more", async () => {
  for (const reply of ["offline", [500, refused("server_error")], [404, refused("not_found")]]) {
    const p = await opened({ [P]: reply });
    assert.equal(p.node["proof-err"].hidden, false);
    assert.equal(p.node["proof-loading"].hidden, true);
    assert.equal(p.node.act.hidden, false, "the payment stays open");
    p.table[P] = [200, JPEG];
    p.node["proof-retry"].fire("click");
    await settle();
    assert.equal(p.node["proof-err"].hidden, true);
    assert.equal(p.node["proof-img"].getAttribute("src"), "blob:held/1");
    assert.equal(p.sent(P).length, 2);
  }
});

test("opening another payment releases the first proof", async () => {
  const p = await page({ "GET me/": [200, ME], [L]: list([payment(), payment({ id: "btp_two" })]),
    [D]: (call) => [200, detail({ id: call.body.payment })], [P]: [200, JPEG] });
  p.node.rows.children[0].all((n) => n.tagName === "BUTTON")[0].fire("click");
  await settle();
  p.node.back.fire("click");
  await settle();
  p.node.rows.children[1].all((n) => n.tagName === "BUTTON")[0].fire("click");
  await settle();
  assert.deepEqual(p.freed, ["blob:held/1"]);
  assert.equal(p.node["proof-img"].getAttribute("src"), "blob:held/2");
  assert.deepEqual(p.sent(P).map((c) => c.body.payment), ["btp_one", "btp_two"]);
});

/* ---- pesos typed, centavos sent ---- */

test("what is typed becomes centavos as text, never through a decimal number", async () => {
  const p = await page({ "GET me/": [200, ME], [L]: list([]) });
  const { centavos, money } = p.window.NOFinance;
  const cases = { "4,999": 499900, "4999": 499900, "4999.00": 499900, "4999.5": 499950, " 4999.05 ": 499905, "1,234,567.89": 123456789, "2,499.00": 249900,
    "0.29": 29, "1.1": 110, "8.2": 820, "0": null, "0.00": null, "4999.555": null, "4999.": null, ".50": null, "-4999": null,
    "4999,5": null, "49,99": null, "4 999": null, "PHP 4999": null, "four thousand": null, "1e3": null, "": null };
  for (const [typed, want] of Object.entries(cases)) assert.equal(centavos(typed), want, JSON.stringify(typed));
  assert.equal(money(499900), "PHP 4,999.00");
  assert.equal(money(249900), "PHP 2,499.00");
  assert.equal(money(123456789), "PHP 1,234,567.89");
  assert.equal(money(5), "PHP 0.05");
  for (const bad of [null, undefined, "499900", 12.5, -1, NaN]) assert.equal(money(bad), "");
});

/* ---- confirm ---- */

test("confirming asks once more in the page, then sends the amount typed and shows the paid period", async () => {
  const p = await opened({ [C]: [200, payment(CONFIRMED)] });
  p.node.amount.value = "4,999.00";
  p.node["confirm-form"].fire("submit");
  assert.equal(p.sent(C).length, 0, "nothing is sent before the second step");
  assert.equal(p.node["confirm-step"].hidden, false);
  assert.equal(p.node["confirm-form"].hidden, true);
  assert.equal(p.node["confirm-ask"].textContent,
    "Confirm PHP 4,999.00 received for Ana's Store? This starts the paid period and cannot be undone.");
  p.table[D] = [200, detail(CONFIRMED)];
  p.node["confirm-yes"].fire("click");
  await settle();
  assert.deepEqual(p.sent(C)[0].body, { payment: "btp_one", amount_received_centavos: 499900 });
  assert.equal(p.node["p-msg"].textContent, "Payment confirmed. The paid period runs 1 Dec 2026 to 1 Jun 2027.");
  assert.equal(p.node["p-msg"].hidden, false);
  assert.equal(p.node["p-status"].textContent, "Confirmed");
  assert.equal(p.node.act.hidden, true);
  assert.equal(p.sent(D).length, 2, "the payment is read again");
  assert.equal(p.sent(P).length, 1, "the proof is not read a second time");
  assert.deepEqual(p.freed, []);
});

test("Cancel in the second step sends nothing and returns to the field", async () => {
  const p = await opened();
  p.node.amount.value = "4999";
  p.node["confirm-form"].fire("submit");
  p.node["confirm-no"].fire("click");
  await settle();
  assert.equal(p.node["confirm-step"].hidden, true);
  assert.equal(p.node["confirm-form"].hidden, false);
  assert.equal(p.sent(C).length, 0);
});

test("an amount that is not money is refused in the page and nothing is sent", async () => {
  const p = await opened();
  for (const typed of ["", "abc", "4999.555", "0"]) {
    p.node.amount.value = typed;
    const e = p.node["confirm-form"].fire("submit");
    assert.equal(e.prevented, true);
    assert.equal(p.node["amount-err"].hidden, false, typed);
    assert.equal(p.node["amount-err"].textContent, "Enter the amount received, for example 4,999.00.");
    assert.equal(p.node.amount.getAttribute("aria-invalid"), "true");
    assert.equal(p.node["confirm-step"].hidden, true, typed);
  }
  assert.equal(p.sent(C).length, 0);
  p.node.amount.value = "4999";
  p.node["confirm-form"].fire("submit");
  assert.equal(p.node["amount-err"].hidden, true);
  assert.equal(p.node.amount.hasAttribute("aria-invalid"), false);
});

test("the buttons are disabled while a confirmation runs, so a double click sends one call", async () => {
  const p = await opened({ [C]: [200, payment(CONFIRMED)] });
  p.node.amount.value = "4999";
  p.node["confirm-form"].fire("submit");
  p.node["confirm-yes"].fire("click");
  for (const id of ["confirm-yes", "confirm-no", "confirm-go", "reject-go"]) assert.equal(p.node[id].disabled, true, id);
  p.node["confirm-yes"].fire("click");
  p.node["reject-form"].fire("submit");
  await settle();
  assert.equal(p.sent(C).length, 1);
  assert.equal(p.sent(R).length, 0);
  for (const id of ["confirm-yes", "confirm-no", "confirm-go", "reject-go"]) assert.equal(p.node[id].disabled, false, id);
});

test("what an action answers is brought into view, because the operator is at the forms below the message", async () => {
  for (const reply of [[409, refused("amount_mismatch")], [200, detail(CONFIRMED)], "offline"]) {
    const p = await opened({ [C]: reply });
    const seen = [];
    p.node["p-msg"].scrollIntoView = (how) => seen.push(how.block);
    await confirmWith(p, "4999");
    assert.equal(p.node["p-msg"].hidden, false, String(reply));
    assert.deepEqual(seen, ["center"], String(reply));
  }
});

test("each refusal of a confirmation has its own words, and the payment stays open", async () => {
  const words = {
    amount_mismatch: "That is not the amount due (PHP 4,999.00). If a different amount arrived, reject the proof.",
    plan_not_offered: "This site already used the Launch Promo. Reject this proof.",
    cancel_scheduled: "This subscription is cancelled and its paid period is still running. It cannot be paid for now.",
    paid_ahead: "The next period of this site is already paid.",
    past_deletion_date: "This site is past its deletion date and can no longer be paid for.",
    billing_exempt: "This site is exempt from billing.",
    invalid_transition: "This subscription cannot take a payment in its current state.",
  };
  for (const [code, said] of Object.entries(words)) {
    const p = await opened({ [C]: [409, refused(code)] });
    await confirmWith(p, "5000");
    assert.equal(p.node["p-msg"].textContent, said, code);
    assert.equal(p.node["p-msg"].hidden, false, code);
    assert.deepEqual(p.shown(), ["v-pay"], code);
    assert.equal(p.node.act.hidden, false, code);
    assert.equal(p.node["confirm-step"].hidden, true, code);
    assert.equal(p.node["confirm-form"].hidden, false, code);
    assert.equal(p.sent(D).length, 1, code);
    assert.equal(p.node.reason.value, code === "plan_not_offered" ? "duplicate" : "", code);
  }
});

test("a payment that is no longer under review says so and the queue is read again", async () => {
  for (const key of [C, R]) {
    const p = await opened({ [key]: [409, refused("not_under_review")] });
    if (key === C) await confirmWith(p, "4999");
    else { p.node.reason.value = "unreadable"; p.node["reject-form"].fire("submit"); await settle(); }
    assert.deepEqual(p.shown(), ["v-queue"]);
    assert.equal(p.node["q-msg"].textContent, "This payment is no longer under review. It was decided or replaced by a newer proof.");
    assert.equal(p.node["q-msg"].hidden, false);
    assert.equal(p.sent(L).length, 2);
    assert.deepEqual(p.freed, ["blob:held/1"]);
    p.node["tab-confirmed"].fire("click");
    await settle();
    assert.equal(p.node["q-msg"].hidden, true, "the message leaves with the next thing the operator does");
  }
});

test("a lost answer says so and reads the payment again, so the operator sees what was written", async () => {
  for (const reply of ["offline", [500, refused("server_error")]]) {
    const p = await opened({ [C]: reply });
    p.table[D] = [200, detail(CONFIRMED)];
    await confirmWith(p, "4999");
    assert.equal(p.node["p-msg"].textContent, "That did not go through. Check the payment before trying again.");
    assert.equal(p.sent(D).length, 2);
    assert.equal(p.node["p-status"].textContent, "Confirmed", "it was written after all");
    assert.equal(p.node.act.hidden, true);
    assert.equal(p.sent(P).length, 1);
  }
});

test("a confirmation the backend calls invalid shows the field's message", async () => {
  const p = await opened({ [C]: [400, refused("invalid_request")] });
  await confirmWith(p, "4999");
  assert.equal(p.node["amount-err"].hidden, false);
  assert.equal(p.node["amount-err"].textContent, "Enter the amount received, for example 4,999.00.");
  assert.equal(p.node["confirm-form"].hidden, false);
});

test("signed out in the middle of an action goes to sign-in; the routes switched off shows the closed state", async () => {
  const out = await opened({ [C]: [401, refused("unauthenticated")] });
  await confirmWith(out, "4999");
  assert.equal(out.location.replaced, "/sign-in/");
  const off = await opened({ [C]: [404, refused("not_found")] });
  off.table[L] = [404, refused("not_found")];
  await confirmWith(off, "4999");
  assert.deepEqual(off.shown(), ["v-closed"]);
});

/* ---- reject ---- */

test("rejecting sends the reason and the note, and says the Subscriber can send another", async () => {
  const p = await opened({ [R]: [200, payment({ status: "rejected" })] });
  p.table[D] = [200, detail({ status: "rejected", decided_at: "2026-11-12T10:00:00+08:00", decided_by: "sample.staff",
    reject_reason: "unreadable", reject_note: "" })];
  p.node.reason.value = "unreadable";
  p.node.note.value = "  ";
  const e = p.node["reject-form"].fire("submit");
  assert.equal(e.prevented, true);
  assert.equal(p.node["reject-go"].disabled, true);
  await settle();
  assert.deepEqual(p.sent(R)[0].body, { payment: "btp_one", reason: "unreadable", note: "" });
  assert.equal(p.node["p-msg"].textContent, "Proof rejected. The Subscriber can send another.");
  assert.equal(p.node["p-decided"].textContent, "Rejected by sample.staff, 12 Nov 2026, 10:00 AM. Reason: The proof cannot be read.");
  assert.equal(p.node.act.hidden, true);
  assert.equal(p.sent(P).length, 1);
});

test("a rejection needs a reason, a note for Another reason, and a note of 300 characters at most", async () => {
  const p = await opened({ [R]: [200, payment({ status: "rejected" })] });
  const tries = [["", "", "Choose a reason."], ["other", " ", "Write a note for this reason."],
    ["unreadable", "x".repeat(301), "Keep the note to 300 characters."]];
  for (const [reason, note, said] of tries) {
    p.node.reason.value = reason;
    p.node.note.value = note;
    p.node["reject-form"].fire("submit");
    await settle();
    assert.equal(p.node["reject-err"].textContent, said);
    assert.equal(p.node["reject-err"].hidden, false);
  }
  assert.equal(p.sent(R).length, 0);
  p.node.reason.value = "other";
  p.node.note.value = " Paid to an old account. ";
  p.node["reject-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(R)[0].body, { payment: "btp_one", reason: "other", note: "Paid to an old account." });
  assert.equal(p.node["reject-err"].hidden, true);
});

test("a rejection the backend calls invalid, and a lost answer, are told apart", async () => {
  const bad = await opened({ [R]: [400, refused("invalid_request")] });
  bad.node.reason.value = "duplicate";
  bad.node["reject-form"].fire("submit");
  await settle();
  assert.equal(bad.node["reject-err"].textContent, "Check the reason and the note.");
  assert.equal(bad.sent(D).length, 1);
  const lost = await opened({ [R]: "offline" });
  lost.node.reason.value = "duplicate";
  lost.node["reject-form"].fire("submit");
  await settle();
  assert.equal(lost.node["p-msg"].textContent, "That did not go through. Check the payment before trying again.");
  assert.equal(lost.sent(D).length, 2);
});

test("the six reasons are offered in the plan's words, after a first line that is no reason", () => {
  const html = fs.readFileSync(new URL("../public/finance.html", import.meta.url), "utf8");
  const select = html.slice(html.indexOf('<select'), html.indexOf("</select>"));
  const options = [...select.matchAll(/<option value="([a-z_]*)"[^>]*>([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(options, [["", "Choose a reason"], ["unreadable", "The proof cannot be read"],
    ["amount_mismatch", "The amount is not the amount due"], ["not_received", "The money has not arrived"],
    ["wrong_account", "Sent to a different account"], ["duplicate", "This payment was already counted"],
    ["other", "Another reason (write a note)"]]);
});

/* ---- the page file ---- */

test("the page has the shell's ids, loads the five scripts in order, and leaves the user card to shell.js", () => {
  const html = fs.readFileSync(new URL("../public/finance.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../public/assets/js/finance.js", import.meta.url), "utf8");
  const tag = (id) => (html.match(new RegExp("<[a-z0-9]+ [^>]*id=\"" + id + "\"[^>]*>")) || [""])[0];
  for (const id of IDS) assert.notEqual(tag(id), "", id + " is on the page");
  assert.match(tag("acct-row"), /class="acct-row"[^>]* hidden>$/);
  assert.match(tag("acct-btn"), / hidden>$/);
  assert.doesNotMatch(tag("sign-out"), /hidden/);
  assert.match(html, /<nav class="side-nav" id="side-nav"/);
  const order = ["config.js", "hq.js", "menu.js", "shell.js", "finance.js"].map((f) => html.indexOf("/assets/js/" + f));
  assert.ok(order.every((at) => at > 0), "all five scripts are loaded");
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.doesNotMatch(js, /sign-out|acct-/);
  assert.match(js, /NOHqShell\.signedIn\(/);
  /* The sign-out message and the phone-width Sign out are outside every view, so they show in every state. */
  assert.ok(html.indexOf('id="sign-out-err"') < html.indexOf('id="v-queue"'), "the message is before the first view");
  assert.ok(html.indexOf('id="sign-out-2"') > html.indexOf("</section>", html.indexOf('id="v-down"')), "Sign out is after the last view");
  assert.match(html, /<p><button type="button" class="no-btn no-btn-ghost phone-only" id="sign-out-2">Sign out<\/button><\/p>\s*<\/main>/);
  /* The proof image and link carry no address in the file; the action views start hidden. */
  assert.doesNotMatch(tag("proof-img"), /src=/);
  assert.doesNotMatch(tag("proof-pdf"), /href=/);
  assert.match(tag("proof-pdf"), /target="_blank"/);
  for (const id of ["v-queue", "v-pay", "v-closed", "v-down", "act", "confirm-step", "proof-img", "proof-pdf"]) assert.match(tag(id), / hidden>$/, id);
});

test("the page calls the backend only through NOHq, and keeps nothing: no storage, no address, no console", () => {
  const js = fs.readFileSync(new URL("../public/assets/js/finance.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|console\.|history\.|location\.(search|hash|href)|window\.open/);
  assert.match(js, /H\.file\("finance\/payments\/proof\/"/);
});
