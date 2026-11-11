/* finance.js: the Finance page, where an operator reviews bank transfer proofs (Billing Build B2a, ClickUp
   z8uq9me581, plan section 6). The page settles nothing: the backend does, and the page follows its answer.
   The proof has no address: it is held in the tab's memory and shown from an object address that is released. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE, refused } from "./page.mjs";

const IDS = ["boot", "v-queue", "v-pay", "v-closed", "v-down", "retry",
  "tab-submitted", "tab-confirmed", "tab-rejected", "tab-replaced", "q-msg", "q-loading", "rows", "q-empty", "more-row", "more",
  "back", "p-loading", "p-body", "p-site", "p-site-id", "p-status", "p-amount", "p-plan", "p-date", "p-ref",
  "p-submitted", "p-email", "p-decided", "history-h", "history", "proof-h", "proof-loading", "proof-img", "proof-file", "proof-err",
  "proof-retry", "proof-preview", "act", "open-confirm", "open-reject",
  "m-confirm", "mc-h", "mc-sub", "confirm-form", "amount", "amount-group", "amount-err", "amount-hint", "confirm-err", "confirm-bar", "confirm-go", "confirm-x",
  "m-reject", "mr-h", "mr-sub", "reject-form", "reason", "note", "reject-err", "reject-go", "reject-x",
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
  const made = [], freed = [], timers = [];
  /* The two-second hold is driven by hand: tick() runs what was waiting. */
  const setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const tick = () => { timers.splice(0).forEach((t) => t.fn()); };
  const URL = { createObjectURL(blob) { made.push(blob); return "blob:held/" + made.length; }, revokeObjectURL(u) { freed.push(u); } };
  const p = open(["hq.js", "shell.js", "finance.js"], { ids: IDS, pathname: "/finance/", globals: { URL, setTimeout, clearTimeout() {} }, answers: (call) => {
    const key = call.method + " " + call.url.slice(BASE.length + 1);
    const reply = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    assert.ok(reply !== undefined, "unexpected call: " + key);
    return typeof reply === "function" ? reply(call) : reply;
  } });
  await settle();
  const shown = () => VIEWS.filter((id) => !p.node[id].hidden);
  const sent = (key) => p.calls.filter((c) => c.method + " " + c.url.slice(BASE.length + 1) === key);
  return { ...p, made, freed, timers, tick, shown, sent, table };
}
/* The queue with one payment under review, then that payment opened. */
async function opened(table = {}, one = detail()) {
  const p = await page({ "GET me/": [200, ME], [L]: list([payment(one)]), [D]: [200, one], [P]: [200, JPEG], ...table });
  p.node.rows.children[0].all((n) => n.tagName === "BUTTON")[0].fire("click");
  await settle();
  return p;
}
/* Opens the Confirm dialog, types an amount and submits it. */
function confirmDialog(p, typed) {
  p.node["open-confirm"].fire("click");
  p.node.amount.value = typed;
  p.node["confirm-form"].fire("submit");
}
function rejectDialog(p, reason, note = "") {
  p.node["open-reject"].fire("click");
  p.node.reason.value = reason;
  p.node.note.value = note;
  p.node["reject-form"].fire("submit");
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
  assert.equal(p.node["m-confirm"].hidden, true);
  assert.equal(p.node["m-reject"].hidden, true);
  assert.equal(p.node["p-body"].hidden, false);
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
  assert.match(no.node["p-status"].attrs.class, /chip-err/);
  assert.match(no.node["p-decided"].attrs.class, /is-rejected/);
  const old = await opened({}, detail({ status: "replaced" }));
  assert.equal(old.node["p-decided"].textContent, "The Subscriber sent a newer proof.");
  assert.match(old.node["p-status"].attrs.class, /chip-neutral/);
  assert.doesNotMatch(old.node["p-decided"].attrs.class, /is-rejected/);
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
    assert.equal(p.node["proof-file"].hidden, true);
    assert.equal(p.node["proof-loading"].hidden, true);
    assert.equal(p.node["proof-err"].hidden, true);
    assert.deepEqual(p.freed, []);
    p.node.back.fire("click");
    await settle();
    assert.deepEqual(p.freed, ["blob:held/1"]);
    assert.equal(p.node["proof-img"].hasAttribute("src"), false);
    assert.equal(p.node["proof-img"].hidden, true);
    assert.equal(p.node["proof-preview"].hidden, true);
  }
});

test("a PDF proof is not drawn in the page: it is a file tile, and Preview opens it in a new tab", async () => {
  const p = await opened({ [P]: [200, { type: "application/pdf", size: 3 }] });
  assert.equal(p.node["proof-img"].hidden, true);
  assert.equal(p.node["proof-img"].hasAttribute("src"), false);
  assert.equal(p.node["proof-file"].hidden, false);
  assert.equal(p.node["proof-preview"].hidden, false);
  assert.equal(p.node["proof-preview"].getAttribute("href"), "blob:held/1");
  p.node.back.fire("click");
  await settle();
  assert.deepEqual(p.freed, ["blob:held/1"]);
  assert.equal(p.node["proof-preview"].hasAttribute("href"), false);
  assert.equal(p.node["proof-preview"].hidden, true);
  assert.equal(p.node["proof-file"].hidden, true);
});

test("Preview opens the proof already loaded in a new tab: same object, no second call", async () => {
  const p = await opened();
  const a = p.node["proof-preview"];
  assert.equal(a.hidden, false);
  assert.equal(a.getAttribute("href"), "blob:held/1");
  assert.equal(a.getAttribute("href"), p.node["proof-img"].getAttribute("src"), "the image and the tab share one object");
  const html = fs.readFileSync(new URL("../public/finance.html", import.meta.url), "utf8");
  const tag = (html.match(/<a [^>]*id="proof-preview"[^>]*>/) || [""])[0];
  assert.match(tag, /target="_blank"/);
  assert.match(tag, /rel="noopener"/);
  assert.doesNotMatch(tag, /href=/, "no address in the file");
  assert.equal(p.made.length, 1);
  assert.equal(p.sent(P).length, 1, "Preview makes no backend call");
});

test("any other type is never shown or opened, and no object address is made for it", async () => {
  for (const type of ["text/html", "image/svg+xml", "application/octet-stream", "image/jpeg; charset=utf-8", "IMAGE/JPEG", ""]) {
    const p = await opened({ [P]: [200, { type, size: 3 }] });
    assert.equal(p.node["proof-err"].hidden, false, type);
    assert.equal(p.node["proof-img"].hidden, true, type);
    assert.equal(p.node["proof-file"].hidden, true, type);
    assert.equal(p.node["proof-preview"].hidden, true, type);
    assert.deepEqual(p.made, [], type);
  }
});

test("a proof that fails to load says so, and Try again reads it once more", async () => {
  for (const reply of ["offline", [500, refused("server_error")], [404, refused("not_found")]]) {
    const p = await opened({ [P]: reply });
    assert.equal(p.node["proof-err"].hidden, false);
    assert.equal(p.node["proof-loading"].hidden, true);
    assert.equal(p.node["proof-preview"].hidden, true, "no Preview when the proof did not load");
    assert.equal(p.node.act.hidden, false, "the payment stays open");
    p.table[P] = [200, JPEG];
    p.node["proof-retry"].fire("click");
    await settle();
    assert.equal(p.node["proof-err"].hidden, true);
    assert.equal(p.node["proof-img"].getAttribute("src"), "blob:held/1");
    assert.equal(p.node["proof-preview"].hidden, false);
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

const DUE = "Ana's Store · amount due PHP 4,999.00";

test("Confirm payment opens a dialog for the amount received; nothing is sent until it is submitted", async () => {
  const p = await opened();
  assert.equal(p.node["m-confirm"].hidden, true);
  p.node["open-confirm"].fire("click");
  assert.equal(p.node["m-confirm"].hidden, false);
  assert.equal(p.node["m-reject"].hidden, true);
  assert.equal(p.node["mc-sub"].textContent, DUE);
  assert.equal(p.node.amount.value, "", "the page never fills in the amount");
  assert.equal(p.doc.activeElement, p.node.amount, "focus goes into the dialog");
  assert.equal(p.doc.body.classList.contains("modal-open"), true, "the page behind does not scroll");
  assert.equal(p.node["confirm-bar"].hidden, true);
  assert.equal(p.sent(C).length, 0);
});

test("the confirm dialog closes with its X or Escape, and focus returns to the button that opened it", async () => {
  const p = await opened();
  const ways = [() => p.node["confirm-x"].fire("click"), () => p.doc.fire("keydown", { key: "Escape" })];
  for (const close of ways) {
    p.node["open-confirm"].fire("click");
    assert.equal(p.node["m-confirm"].hidden, false);
    close();
    assert.equal(p.node["m-confirm"].hidden, true);
    assert.equal(p.doc.body.classList.contains("modal-open"), false);
    assert.equal(p.doc.activeElement, p.node["open-confirm"]);
  }
  /* A click on the backdrop or inside the box does not close it. */
  p.node["open-confirm"].fire("click");
  p.node["m-confirm"].fire("click");
  p.node.amount.fire("click");
  assert.equal(p.node["m-confirm"].hidden, false, "outside click leaves it open");
  assert.equal(p.sent(C).length, 0);
  assert.deepEqual(p.doc.listeners.keydown.length, 1, "one key handler while open");
});

test("an amount that is not money is refused in the dialog and nothing is sent", async () => {
  const p = await opened({ [C]: [200, payment(CONFIRMED)] });
  p.node["open-confirm"].fire("click");
  for (const typed of ["", "abc", "4999.555", "0"]) {
    p.node.amount.value = typed;
    const e = p.node["confirm-form"].fire("submit");
    assert.equal(e.prevented, true);
    assert.equal(p.node["amount-err"].hidden, false, typed);
    assert.equal(p.node["amount-err"].textContent, "Enter the amount received, for example 4,999.00.");
    assert.equal(p.node.amount.getAttribute("aria-invalid"), "true");
    assert.equal(p.node["m-confirm"].hidden, false, typed);
    assert.equal(p.node["confirm-bar"].hidden, true, typed);
  }
  assert.equal(p.sent(C).length, 0);
  p.node.amount.value = "4999";
  p.node["confirm-form"].fire("submit");
  assert.equal(p.node["amount-err"].hidden, true);
  assert.equal(p.node.amount.hasAttribute("aria-invalid"), false);
});

test("a confirmation runs a progress bar for two seconds at least, then shows the result on the Under review list", async () => {
  const p = await opened({ [C]: [200, payment(CONFIRMED)] });
  confirmDialog(p, "4,999.00");
  await settle();
  assert.deepEqual(p.sent(C)[0].body, { payment: "btp_one", amount_received_centavos: 499900 });
  assert.deepEqual(p.timers.map((t) => t.ms), [2000], "the least time is two seconds");
  /* The backend has answered yes, but the two seconds are not over: the dialog stays, busy, with the bar. */
  assert.equal(p.node["m-confirm"].hidden, false);
  assert.equal(p.node["confirm-bar"].hidden, false);
  for (const id of ["confirm-go", "confirm-x", "reject-go", "reject-x"]) assert.equal(p.node[id].disabled, true, id);
  assert.deepEqual(p.shown(), ["v-pay"]);
  assert.equal(p.node["q-msg"].hidden, true, "no success is told before the time is up");
  p.doc.fire("keydown", { key: "Escape" });
  p.node["confirm-x"].fire("click");
  assert.equal(p.node["m-confirm"].hidden, false, "Escape and the X do nothing while the bar runs");
  p.table[L] = list([], { under_review_count: 0 });
  p.tick();
  await settle();
  assert.equal(p.node["m-confirm"].hidden, true);
  assert.equal(p.node["confirm-bar"].hidden, true);
  assert.equal(p.doc.body.classList.contains("modal-open"), false);
  assert.deepEqual(p.shown(), ["v-queue"]);
  assert.equal(p.node["q-msg"].textContent, "Payment confirmed: PHP 4,999.00 received for Ana's Store. The paid period runs 1 Dec 2026 to 1 Jun 2027.");
  assert.equal(p.node["q-msg"].hidden, false);
  assert.equal(p.node["tab-submitted"].textContent, "Under review (0)", "the count is read again");
  assert.equal(p.sent(L).length, 2);
  assert.deepEqual(p.freed, ["blob:held/1"], "the proof is released");
  assert.equal(p.sent(C).length, 1);
});

test("while a confirmation runs, a second submit, a reject submit and the Reject button do nothing", async () => {
  const p = await opened({ [C]: [200, payment(CONFIRMED)] });
  p.node["open-confirm"].fire("click");
  p.node.amount.value = "4999";
  p.node["confirm-form"].fire("submit");
  p.node["confirm-form"].fire("submit");
  p.node["reject-form"].fire("submit");
  p.node["open-reject"].fire("click");
  await settle();
  assert.equal(p.sent(C).length, 1);
  assert.equal(p.sent(R).length, 0);
  assert.equal(p.node["m-reject"].hidden, true, "a second dialog does not open over the first");
});

test("a refusal stops the bar and stays in the dialog: it is never shown as a success", async () => {
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
    confirmDialog(p, "5000");
    await settle();
    p.tick();
    await settle();
    assert.equal(p.node["confirm-err"].textContent, said, code);
    assert.equal(p.node["confirm-err"].hidden, false, code);
    assert.equal(p.node["m-confirm"].hidden, false, code);
    assert.equal(p.node["confirm-bar"].hidden, true, code);
    assert.equal(p.node["confirm-go"].disabled, false, code);
    assert.equal(p.node["confirm-x"].disabled, false, code);
    assert.deepEqual(p.shown(), ["v-pay"], code);
    assert.equal(p.node["q-msg"].hidden, true, code);
    assert.equal(p.sent(D).length, 1, code);
    assert.equal(p.node.act.hidden, false, code);
    assert.equal(p.node.reason.value, code === "plan_not_offered" ? "duplicate" : "", code);
  }
});

test("a refusal can be corrected and sent again from the same dialog", async () => {
  const p = await opened({ [C]: [409, refused("amount_mismatch")] });
  confirmDialog(p, "5000");
  await settle();
  assert.equal(p.node["confirm-err"].hidden, false);
  p.table[C] = [200, payment(CONFIRMED)];
  p.node.amount.value = "4999";
  p.node["confirm-form"].fire("submit");
  assert.equal(p.node["confirm-err"].hidden, true, "the old refusal is cleared when it is sent again");
  await settle();
  p.tick();
  await settle();
  assert.deepEqual(p.sent(C).map((c) => c.body.amount_received_centavos), [500000, 499900]);
  assert.deepEqual(p.shown(), ["v-queue"]);
});

test("a payment that is no longer under review says so and the queue is read again", async () => {
  for (const key of [C, R]) {
    const p = await opened({ [key]: [409, refused("not_under_review")] });
    if (key === C) confirmDialog(p, "4999"); else rejectDialog(p, "unreadable");
    await settle();
    p.tick();
    await settle();
    assert.deepEqual(p.shown(), ["v-queue"]);
    assert.equal(p.node["m-confirm"].hidden, true);
    assert.equal(p.node["m-reject"].hidden, true);
    assert.equal(p.node["q-msg"].textContent, "This payment is no longer under review. It was decided or replaced by a newer proof.");
    assert.equal(p.node["q-msg"].hidden, false);
    assert.equal(p.sent(L).length, 2);
    assert.deepEqual(p.freed, ["blob:held/1"]);
    p.node["tab-confirmed"].fire("click");
    await settle();
    assert.equal(p.node["q-msg"].hidden, true, "the message leaves with the next thing the operator does");
  }
});

test("a lost answer says so inside the dialog and reads the payment again, so the operator sees what was written", async () => {
  for (const reply of ["offline", [500, refused("server_error")]]) {
    const p = await opened({ [C]: reply });
    p.table[D] = [200, detail(CONFIRMED)];
    confirmDialog(p, "4999");
    await settle();
    assert.equal(p.node["confirm-err"].textContent, "That did not go through. Check the payment before trying again.");
    assert.equal(p.node["m-confirm"].hidden, false);
    assert.equal(p.node["confirm-bar"].hidden, true);
    assert.equal(p.sent(D).length, 2);
    assert.equal(p.node["p-status"].textContent, "Confirmed", "it was written after all");
    assert.equal(p.node.act.hidden, true);
    assert.equal(p.sent(P).length, 1);
  }
});

test("a confirmation the backend calls invalid shows the field's message in the dialog", async () => {
  const p = await opened({ [C]: [400, refused("invalid_request")] });
  confirmDialog(p, "4999");
  await settle();
  assert.equal(p.node["amount-err"].hidden, false);
  assert.equal(p.node["amount-err"].textContent, "Enter the amount received, for example 4,999.00.");
  assert.equal(p.node["m-confirm"].hidden, false);
  assert.equal(p.node["confirm-bar"].hidden, true);
});

test("signed out in the middle of an action goes to sign-in; the routes switched off shows the closed state", async () => {
  const out = await opened({ [C]: [401, refused("unauthenticated")] });
  confirmDialog(out, "4999");
  await settle();
  assert.equal(out.location.replaced, "/sign-in/");
  const off = await opened({ [C]: [404, refused("not_found")] });
  off.table[L] = [404, refused("not_found")];
  confirmDialog(off, "4999");
  await settle();
  assert.deepEqual(off.shown(), ["v-closed"]);
  assert.equal(off.node["m-confirm"].hidden, true);
});

/* ---- reject ---- */

test("Reject payment opens a dialog with the reason list at its first line and an empty note", async () => {
  const p = await opened();
  p.node["open-reject"].fire("click");
  assert.equal(p.node["m-reject"].hidden, false);
  assert.equal(p.node["m-confirm"].hidden, true);
  assert.equal(p.node["mr-sub"].textContent, "Ana's Store");
  assert.equal(p.node.reason.value, "");
  assert.equal(p.node.note.value, "");
  assert.equal(p.doc.activeElement, p.node.reason.parentNode.all((n) => n.tagName === "INPUT")[0], "focus lands in the dropdown's own box");
  assert.equal(p.doc.body.classList.contains("modal-open"), true);
  p.node["reject-x"].fire("click");
  assert.equal(p.node["m-reject"].hidden, true);
  assert.equal(p.doc.activeElement, p.node["open-reject"]);
  p.node["open-reject"].fire("click");
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(p.node["m-reject"].hidden, true);
  p.node["open-reject"].fire("click");
  p.node["m-reject"].fire("click");
  assert.equal(p.node["m-reject"].hidden, false, "a click outside leaves it open");
  p.node["reject-x"].fire("click");
  assert.equal(p.node["m-reject"].hidden, true);
  assert.equal(p.sent(R).length, 0);
});

test("a rejection needs a reason, a note for Another reason, and a note of 300 characters at most", async () => {
  const p = await opened({ [R]: [200, payment({ status: "rejected" })] });
  p.node["open-reject"].fire("click");
  const tries = [["", "", "Choose a reason."], ["other", " ", "Write a note for this reason."],
    ["unreadable", "x".repeat(301), "Keep the note to 300 characters."]];
  for (const [reason, note, said] of tries) {
    p.node.reason.value = reason;
    p.node.note.value = note;
    p.node["reject-form"].fire("submit");
    await settle();
    assert.equal(p.node["reject-err"].textContent, said);
    assert.equal(p.node["reject-err"].hidden, false);
    assert.equal(p.node["m-reject"].hidden, false);
  }
  assert.equal(p.sent(R).length, 0);
  p.node.reason.value = "other";
  p.node.note.value = " Paid to an old account. ";
  p.node["reject-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(R)[0].body, { payment: "btp_one", reason: "other", note: "Paid to an old account." });
  assert.equal(p.node["reject-err"].hidden, true);
});

test("rejecting sends the reason and the note, waits for nothing, and returns to the list with a confirmation", async () => {
  const p = await opened({ [R]: [200, payment({ status: "rejected" })] });
  p.table[L] = list([], { under_review_count: 0 });
  p.node["open-reject"].fire("click");
  p.node.reason.value = "unreadable";
  p.node.note.value = "  ";
  const e = p.node["reject-form"].fire("submit");
  assert.equal(e.prevented, true);
  assert.equal(p.node["reject-go"].disabled, true);
  await settle();
  assert.deepEqual(p.sent(R)[0].body, { payment: "btp_one", reason: "unreadable", note: "" });
  assert.deepEqual(p.timers, [], "no forced wait for a rejection");
  assert.equal(p.node["m-reject"].hidden, true);
  assert.deepEqual(p.shown(), ["v-queue"]);
  assert.equal(p.node["q-msg"].textContent, "Payment rejected. The Subscriber can send another.");
  assert.equal(p.node["q-msg"].hidden, false);
  assert.equal(p.node["tab-submitted"].textContent, "Under review (0)");
  assert.equal(p.sent(L).length, 2);
  assert.equal(p.sent(P).length, 1);
  assert.equal(p.doc.body.classList.contains("modal-open"), false);
});

test("a rejection the backend calls invalid, and a lost answer, are told apart, inside the dialog", async () => {
  const bad = await opened({ [R]: [400, refused("invalid_request")] });
  rejectDialog(bad, "duplicate");
  await settle();
  assert.equal(bad.node["reject-err"].textContent, "Check the reason and the note.");
  assert.equal(bad.node["m-reject"].hidden, false);
  assert.equal(bad.sent(D).length, 1);
  assert.equal(bad.node["reject-go"].disabled, false);
  const lost = await opened({ [R]: "offline" });
  rejectDialog(lost, "duplicate");
  await settle();
  assert.equal(lost.node["reject-err"].textContent, "That did not go through. Check the payment before trying again.");
  assert.equal(lost.node["m-reject"].hidden, false);
  assert.equal(lost.sent(D).length, 2);
  const refusedNow = await opened({ [R]: [409, refused("invalid_transition")] });
  rejectDialog(refusedNow, "duplicate");
  await settle();
  assert.equal(refusedNow.node["reject-err"].textContent, "This subscription cannot take a payment in its current state.");
  assert.equal(refusedNow.node["q-msg"].hidden, true, "a refusal is never a success");
});

test("a double submit of the reject dialog sends one call", async () => {
  const p = await opened({ [R]: [200, payment({ status: "rejected" })] });
  rejectDialog(p, "duplicate");
  p.node["reject-form"].fire("submit");
  p.node["confirm-form"].fire("submit");
  await settle();
  assert.equal(p.sent(R).length, 1);
  assert.equal(p.sent(C).length, 0);
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
  assert.doesNotMatch(tag("proof-preview"), /href=/);
  assert.match(tag("proof-preview"), /target="_blank"/);
  assert.match(tag("proof-preview"), /rel="noopener"/);
  for (const id of ["v-queue", "v-pay", "v-closed", "v-down", "act", "proof-img", "proof-file", "proof-preview", "m-confirm", "m-reject", "confirm-bar"]) assert.match(tag(id), / hidden>$/, id);
});

test("the page calls the backend only through NOHq, and keeps nothing: no storage, no address, no console", () => {
  const js = fs.readFileSync(new URL("../public/assets/js/finance.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|console\.|history\.|location\.(search|hash|href)|window\.open/);
  assert.match(js, /H\.file\("finance\/payments\/proof\/"/);
});

test("the page has no visible heading block: the tab row is the top of the body, with a heading for screen readers only", () => {
  const html = fs.readFileSync(new URL("../public/finance.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /view-head|view-sub|<p[^>]*>Bank transfer payments<\/p>/);
  assert.match(html, /<h1 class="sr-only">Finance[^<]*<\/h1>/);
  assert.equal(html.match(/<h1/g).length, 1);
  assert.ok(html.indexOf('class="fin-tabs"') < html.indexOf('id="v-pay"'), "the tabs lead the first view");
});

test("the one-payment view is two cards: details at 7/12 on the left, the proof at 5/12 on the right, details first", () => {
  const html = fs.readFileSync(new URL("../public/finance.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/assets/css/hq.css", import.meta.url), "utf8");
  const body = html.slice(html.indexOf('id="p-body"'), html.indexOf('<section class="dash-card" id="v-closed"'));
  assert.equal((body.match(/<section /g) || []).length, 2, "two cards, no third");
  assert.ok(body.indexOf("fin-pay") < body.indexOf("fin-proofcard"), "details come first, so they stack first on a phone");
  const pay = body.slice(body.indexOf("fin-pay"), body.indexOf("fin-proofcard"));
  assert.ok(pay.includes('id="open-confirm"') && pay.includes('id="open-reject"'), "the two buttons are in the details card");
  assert.ok(pay.includes('id="history"'), "History is inside the details card");
  assert.match(css, /\.fin-split\s*\{[^}]*grid-template-columns:\s*1fr[;\s]/);
  assert.match(css, /@media[^{]*min-width:\s*900px[^{]*\{[^@]*\.fin-split\s*\{[^}]*grid-template-columns:\s*7fr 5fr/);
  assert.match(css, /\.fin-proof\s*\{[^}]*object-fit:\s*contain/);
});

test("the dialogs are real dialogs: labelled, modal, and the confirm bar is a progress bar", () => {
  const html = fs.readFileSync(new URL("../public/finance.html", import.meta.url), "utf8");
  for (const [id, h] of [["m-confirm", "mc-h"], ["m-reject", "mr-h"]]) {
    const start = html.indexOf('id="' + id + '"');
    const box = html.slice(start, html.indexOf("</form>", start));
    assert.match(box, /role="dialog" aria-modal="true"/, id);
    assert.ok(box.includes('aria-labelledby="' + h + '"'), id);
  }
  assert.match(html, /id="confirm-bar" role="progressbar"/);
  assert.match(html.slice(html.indexOf('id="confirm-go"'), html.indexOf('id="confirm-go"') + 80), /Confirm payment/);
  assert.match(html.slice(html.indexOf('id="reject-go"'), html.indexOf('id="reject-go"') + 80), /Reject payment/);
});

test("while a rejection is in flight the X and Escape do nothing; after a refusal they close", async () => {
  const p = await opened({ [R]: [409, refused("invalid_transition")] });
  p.node["open-reject"].fire("click");
  p.node.reason.value = "duplicate";
  p.node["reject-form"].fire("submit");
  assert.equal(p.node["reject-x"].disabled, true);
  p.node["reject-x"].fire("click");
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(p.node["m-reject"].hidden, false, "no closing mid-call");
  await settle();
  assert.equal(p.node["reject-x"].disabled, false);
  assert.equal(p.node["m-reject"].hidden, false, "a refusal keeps it open");
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(p.node["m-reject"].hidden, true);
  assert.equal(p.doc.activeElement, p.node["open-reject"]);
});

test("neither dialog has a Cancel button; each has an X button labelled Close; the primary button is full width", () => {
  const html = fs.readFileSync(new URL("../public/finance.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/assets/css/hq.css", import.meta.url), "utf8");
  const dialogs = html.slice(html.indexOf('id="m-confirm"'), html.indexOf("/assets/js/config.js"));
  assert.doesNotMatch(dialogs, />\s*Cancel\s*</);
  assert.doesNotMatch(dialogs, /confirm-cancel|reject-cancel/);
  for (const [x, go] of [["confirm-x", "confirm-go"], ["reject-x", "reject-go"]]) {
    const xTag = (dialogs.match(new RegExp('<button [^>]*id="' + x + '"[^>]*>')) || [""])[0];
    assert.match(xTag, /type="button"/, x);
    assert.match(xTag, /aria-label="Close"/, x);
    assert.match(xTag, /class="icon-btn modal-x"/, x);
    const goTag = (dialogs.match(new RegExp('<button [^>]*id="' + go + '"[^>]*>')) || [""])[0];
    assert.match(goTag, /class="[^"]*fin-block/, go);
    assert.ok(dialogs.indexOf(x) < dialogs.indexOf(go), "the X is at the top");
  }
  assert.match(css, /\.fin-block \{ width: 100%; \}/);
  assert.match(css, /\.modal-head \{[^}]*justify-content: space-between/);
});

test("every destructive button on the Finance page is the same solid red with light text, and has a disabled look", () => {
  const html = fs.readFileSync(new URL("../public/finance.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/assets/css/hq.css", import.meta.url), "utf8");
  const stops = [...html.matchAll(/<button [^>]*class="[^"]*\bstop\b[^"]*"[^>]*id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(stops, ["open-reject", "reject-go"], "the two Reject payment buttons, and no other, are destructive");
  assert.match(css, /\.no-btn\.stop \{ background: var\(--red\); border-color: var\(--red\); color: var\(--on-red\); \}/);
  assert.match(css, /\.no-btn\.stop:disabled/);
  assert.doesNotMatch(css, /\.stop \{[^}]*var\(--err-h\)/, "the red outline look is gone");
});

test("the Rejected badge is solid red with light text and Replaced stays neutral", () => {
  const css = fs.readFileSync(new URL("../public/assets/css/hq.css", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../public/assets/js/finance.js", import.meta.url), "utf8");
  assert.match(css, /\.chip-err \{ background: var\(--red\); color: var\(--on-red\); \}/);
  assert.match(css, /\.dash-copy\.is-rejected \{ border-left: 3px solid var\(--red\)/);
  assert.match(js, /rejected: \["Rejected", "chip-err"\]/);
  assert.match(js, /replaced: \["Replaced", "chip-neutral"\]/);
});

test("one light red serves the Reject buttons, the badge and the rule, in both themes, with white text at 4.5:1", () => {
  const css = fs.readFileSync(new URL("../public/assets/css/hq.css", import.meta.url), "utf8");
  assert.equal((css.match(/--red: #DC3232; --red-h: #CF2C2C; --on-red: #FFFFFF;/g) || []).length, 2);
  assert.doesNotMatch(css, /#B42318/);
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  for (const bg of ["#DC3232", "#CF2C2C"]) assert.ok((lum("#FFFFFF") + 0.05) / (lum(bg) + 0.05) >= 4.5, bg);
});

/* ---- the reason dropdown: the house dropdown, not the browser's own list ---- */
function reasonBox(p) {
  const wrap = p.node.reason.parentNode;
  return { wrap, input: wrap.all((n) => n.tagName === "INPUT")[0], panel: wrap.all((n) => n.classList.contains("fin-combo-panel"))[0],
    rows: () => wrap.all((n) => n.classList.contains("fin-combo-opt")) };
}
const key = (b, k) => b.input.fire("keydown", { key: k });

test("the reason is the house dropdown: one box, the list directly below it, and no browser popup", async () => {
  const p = await opened();
  p.node["open-reject"].fire("click");
  const b = reasonBox(p);
  assert.ok(b.wrap.classList.contains("fin-combo"));
  assert.equal(p.node.reason.getAttribute("aria-hidden"), "true");
  assert.equal(b.input.getAttribute("placeholder"), "Choose a reason");
  assert.equal(b.wrap.classList.contains("is-open"), false);
  b.input.parentNode.fire("click");
  assert.equal(b.wrap.classList.contains("is-open"), true);
  assert.equal(b.input.getAttribute("aria-expanded"), "true");
  assert.deepEqual(b.rows().map((r) => r.textContent), ["The proof cannot be read", "The amount is not the amount due",
    "The money has not arrived", "Sent to a different account", "This payment was already counted", "Another reason (write a note)"]);
  assert.equal(b.panel.style.top, "250px", "6 pixels under the box, which ends at 244");
  assert.equal(b.panel.style.left, "20px");
  assert.equal(b.panel.style.width, "300px");
  assert.equal(b.panel.style.bottom, "auto");
  const css = fs.readFileSync(new URL("../public/assets/css/hq.css", import.meta.url), "utf8");
  assert.match(css, /\.fin-combo-panel \{ display: none; position: fixed;/);
  assert.match(css, /\.fin-combo\.is-open \.fin-combo-panel \{ display: block; \}/);
  assert.match(css, /\.fin-combo-box:focus-within \{ border-color: var\(--link\); box-shadow: 0 0 0 1px var\(--link\); \}/);
  assert.doesNotMatch(css, /fin-combo[^{]*\{[^}]*#(?:C8A24A|D4A93A)/i, "no gold");
});

test("choosing a reason sets it, closes the list and shows it in the box; the reason is then sent", async () => {
  const p = await opened({ [R]: [200, payment({ status: "rejected" })] });
  p.node["open-reject"].fire("click");
  const b = reasonBox(p);
  b.input.parentNode.fire("click");
  b.rows()[2].fire("click");
  assert.equal(p.node.reason.value, "not_received");
  assert.equal(b.input.value, "The money has not arrived");
  assert.equal(b.wrap.classList.contains("is-open"), false);
  p.node["reject-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(R)[0].body, { payment: "btp_one", reason: "not_received", note: "" });
});

test("the keyboard chooses: arrows move, Enter picks, and Escape closes the list but not the dialog", async () => {
  const p = await opened();
  p.node["open-reject"].fire("click");
  const b = reasonBox(p);
  key(b, "ArrowDown");
  assert.equal(b.wrap.classList.contains("is-open"), true);
  key(b, "ArrowDown"); key(b, "ArrowDown");
  assert.equal(b.rows()[1].classList.contains("is-active"), true);
  key(b, "ArrowUp");
  assert.equal(b.rows()[0].classList.contains("is-active"), true);
  key(b, "ArrowUp");
  assert.equal(b.rows()[5].classList.contains("is-active"), true, "it wraps");
  const esc = key(b, "Escape");
  assert.equal(esc.prevented, true);
  assert.equal(b.wrap.classList.contains("is-open"), false);
  assert.equal(p.node["m-reject"].hidden, false, "the dialog is still open");
  key(b, "ArrowDown"); key(b, "ArrowDown"); key(b, "ArrowDown");
  key(b, "Enter");
  assert.equal(p.node.reason.value, "amount_mismatch");
  assert.equal(b.input.value, "The amount is not the amount due");
  key(b, "Enter");
  assert.equal(b.wrap.classList.contains("is-open"), true, "Enter on a closed list opens it");
  key(b, "Escape");
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(p.node["m-reject"].hidden, true, "Escape with the list shut closes the dialog");
});

test("typing filters the reasons; a reopened dialog starts empty; a refused promo proof pre-fills Duplicate", async () => {
  const p = await opened();
  p.node["open-reject"].fire("click");
  const b = reasonBox(p);
  b.input.value = "ACCOUNT";
  b.input.fire("input");
  assert.deepEqual(b.rows().map((r) => r.textContent), ["Sent to a different account"]);
  b.input.value = "zzz";
  b.input.fire("input");
  assert.equal(b.rows()[0].textContent, "No matches");
  b.input.value = "";
  b.input.fire("input");
  b.rows()[0].fire("click");
  assert.equal(p.node.reason.value, "unreadable");
  p.node["reject-x"].fire("click");
  p.node["open-reject"].fire("click");
  assert.equal(p.node.reason.value, "");
  assert.equal(b.input.value, "", "the box is emptied with the value");
  const q = await opened({ [C]: [409, refused("plan_not_offered")] });
  confirmDialog(q, "4,999.00");
  await settle(); q.tick(); await settle();
  assert.equal(q.node.reason.value, "duplicate");
  assert.equal(reasonBox(q).input.value, "This payment was already counted");
});

test("the Finance page has no other native select, and the dropdown never takes the dialog's Tab stops", () => {
  const html = fs.readFileSync(new URL("../public/finance.html", import.meta.url), "utf8");
  assert.equal((html.match(/<select/g) || []).length, 1, "the one native select is the hidden source of truth");
  assert.match(html, /<select class="input" id="reason" tabindex="-1" aria-hidden="true"/);
  const js = fs.readFileSync(new URL("../public/assets/js/finance.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /tagName === "SELECT"/);
});

test("both pop-ups divide the title row from the body with the card line, edge to edge", () => {
  const html = fs.readFileSync(new URL("../public/finance.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/assets/css/hq.css", import.meta.url), "utf8");
  assert.equal((html.match(/<div class="modal-head">/g) || []).length, 2, "Confirm payment and Reject payment");
  const head = /\.modal-head \{([^}]*)\}/.exec(css)[1];
  assert.match(head, /border-bottom: 1px solid var\(--card-line\)/, "the line colour HQ cards already use");
  assert.match(head, /margin: -24px -24px 0/, "full width of the dialog, which pads 24px");
  assert.match(head, /padding: 16px 24px/, "balanced above and below the title");
  assert.match(css, /\.modal-box \{[^}]*padding: 24px/);
});

/* ---- the amount box: a peso sign, one input of whole pesos, a fixed .00 ---- */
function typedAmount(p, value, caret) {
  p.node["open-confirm"].fire("click");
  const box = p.node.amount;
  box.value = value;
  box.selectionStart = caret === undefined ? value.length : caret;
  box.setSelectionRange = (a) => { box.selectionStart = a; };
  box.fire("input");
  return box;
}

test("the amount takes digits only: letters and symbols are stripped as they are typed or pasted", async () => {
  const p = await opened();
  assert.equal(typedAmount(p, "abc").value, "");
  assert.equal(typedAmount(p, "12a4-5.6!").value, "12,456");
  assert.equal(typedAmount(p, "abc2,499x").value, "2,499", "a paste is cleaned the same way");
  assert.equal(typedAmount(p, "0002499").value, "2,499", "leading zeros go");
  assert.equal(typedAmount(p, "1234567890123").value, "123,456,789", "nine digits at most");
});

test("thousands commas appear as the digits are typed: 4, 5 and 7 digits", async () => {
  const p = await opened();
  for (const [typed, shown] of [["249", "249"], ["2499", "2,499"], ["12000", "12,000"], ["2,4999", "24,999"], ["1234567", "1,234,567"], ["12,00", "1,200"]]) {
    assert.equal(typedAmount(p, typed).value, shown, typed);
  }
});

test("the caret stays after the digit that was just typed while the commas move", async () => {
  const p = await opened();
  let box = typedAmount(p, "2,4991", 6);        /* a 1 typed at the end of 2,499 */
  assert.equal(box.value, "24,991");
  assert.equal(box.selectionStart, 6);
  box = typedAmount(p, "29,999", 2);            /* a 9 typed after the 2 of 2,999 */
  assert.equal(box.value, "29,999");
  assert.equal(box.selectionStart, 2);
  box = typedAmount(p, "12499", 2);             /* two digits typed in the middle of a number with no comma yet */
  assert.equal(box.value, "12,499");
  assert.equal(box.selectionStart, 2);
});

test("the peso sign and .00 are fixed parts of the group, not of the input, and a click on them focuses the input", async () => {
  const html = fs.readFileSync(new URL("../public/finance.html", import.meta.url), "utf8");
  const group = /<div class="fin-amt" id="amount-group">(.*?)<\/div>/.exec(html)[1];
  assert.match(group, /^<span class="fin-amt-fix" aria-hidden="true">\u20b1<\/span><input [^>]*id="amount"[^>]*><span class="fin-amt-fix" aria-hidden="true">\.00<\/span>$/);
  const input = /<input [^>]*id="amount"[^>]*>/.exec(group)[0];
  assert.match(input, /type="text"/);
  assert.match(input, /inputmode="numeric"/);
  assert.match(input, /autocomplete="off"/);
  assert.match(input, /placeholder="0"/);
  assert.doesNotMatch(input, /type="number"|maxlength|tabindex/);
  assert.doesNotMatch(group, /<span[^>]*tabindex/);
  const css = fs.readFileSync(new URL("../public/assets/css/hq.css", import.meta.url), "utf8");
  assert.match(css, /\.fin-amt:focus-within \{ border-color: var\(--link\); box-shadow: 0 0 0 1px var\(--link\); \}/);
  assert.match(css, /\.fin-amt-fix \{[^}]*user-select: none; -webkit-user-select: none; pointer-events: none;/);
  const p = await opened();
  p.node["open-confirm"].fire("click");
  p.doc.activeElement = null;
  p.node["amount-group"].fire("click");
  assert.equal(p.doc.activeElement, p.node.amount);
  assert.equal(p.node.amount.value, "", "neither the sign nor .00 is in the value");
});

test("the amount sent is the whole pesos typed, as centavos; Enter in the box submits the form", async () => {
  const p = await opened({ [C]: [200, payment(CONFIRMED)] });
  typedAmount(p, "2499");
  assert.equal(p.node.amount.value, "2,499");
  p.node["confirm-form"].fire("submit");     /* Enter in a text input submits its form */
  await settle(); p.tick(); await settle();
  assert.deepEqual(p.sent(C)[0].body, { payment: "btp_one", amount_received_centavos: 249900 });
  const html = fs.readFileSync(new URL("../public/finance.html", import.meta.url), "utf8");
  const form = /<form [^>]*id="confirm-form"[^>]*>(.*?)<\/form>/s.exec(html)[1];
  assert.match(form, /id="amount"/, "the input is inside the form");
  assert.match(form, /<button [^>]*type="submit"[^>]*id="confirm-go"/);
  const q = await opened();
  q.node["open-confirm"].fire("click");
  q.node["confirm-form"].fire("submit");
  assert.equal(q.node["amount-err"].hidden, false, "required: an empty box is refused");
  assert.equal(q.sent(C).length, 0);
});
