/* lifecycle.js: the Lifecycle page (ClickUp z8uq9mb22v, plan docs/plans/2026-11-13-hq-lifecycle-page-plan.md). The page
   decides nothing: the backend does. These tests drive it with fixture answers only, through the seven staff routes. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE, refused } from "./page.mjs";

const HTML = fs.readFileSync(new URL("../public/lifecycle.html", import.meta.url), "utf8");
const IDS = [...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const VIEWS = ["boot", "v-main", "v-batch", "v-closed", "v-down"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const R = (name) => "POST lifecycle/erasure/" + name + "/";
const LIST = R("list"), BATCHES = R("batches"), PROPOSE = R("propose"), APPROVE = R("approve"), CANCEL = R("cancel"), HOLD = R("hold"), RELEASE = R("hold/release");
const FAR = "2099-01-01T00:00:00+08:00", PAST = "2020-01-01T00:00:00+08:00";

const COUNTS = { sante_site_settings: 1, members: 214, shop_orders: 388, site_seal_files: 1, site_payment_qr_files: 2, a_table_without_words: 5 };
function el(site, over = {}) {
  return { site, template: "sante", account: "acc_1", state: "suspended", service_ended_at: "2026-09-24T09:00:00+08:00",
    deletion_due_at: "2026-12-24T09:00:00+08:00", days_overdue: 12, counts: COUNTS, private_files: 3, account_action: "dispose",
    account_reason: "", notice: "sent", notice_sent: true, usage_to_write_off: false, ...over };
}
const dry = (eligible = [], over = {}) => [200, { as_of: "2026-11-14T09:02:00+08:00", lifecycle_checked: true, retention_enabled: true, eligible, near: [], refused: [], ...over }];
function item(site, over = {}) {
  return { site, status: "pending", reason_code: "", attempts: 0, deletion_due_at: "2026-12-24T09:00:00+08:00",
    planned: { counts: COUNTS, private_files: 3, account_action: "dispose", account_reason: "" }, counts: {}, erased_at: null, account_disposed: false, ...over };
}
const batch = (id, status, items, over = {}) => ({ id, status, proposed_at: "2026-11-14T09:02:00+08:00", expires_at: FAR, approved_at: null,
  approval_reason: "", digest: "9f3a1c07d2be44aa0000", items, ...over });
const overview = (batches = [], holds = []) => [200, { batches, holds }];
const DONE = batch("ebt_m4", "done", [item("site_old", { status: "erased" })], { approved_at: "2026-11-07T09:20:00+08:00", approval_reason: "Weekly review" });

async function page(table, pathname = "/lifecycle/") {
  const p = open(["hq.js", "shell.js", "finance-common.js", "lifecycle.js"], { ids: IDS, pathname, answers: (call) => {
    const key = call.method + " " + call.url.slice(BASE.length + 1);
    const reply = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    assert.ok(reply !== undefined, "unexpected call: " + key);
    return typeof reply === "function" ? reply(call) : reply;
  } });
  /* The stand-in starts every element hidden; the page starts with only the ones its markup hides. */
  for (const id of IDS) {
    const tag = new RegExp(`<[^>]*\\sid="${id}"[^>]*>`).exec(HTML)[0];
    p.node[id].hidden = /\shidden(\s|>|=)/.test(tag);
  }
  await settle();
  const keyOf = (c) => c.method + " " + c.url.slice(BASE.length + 1);
  return { ...p, shown: () => VIEWS.filter((id) => !p.node[id].hidden), keys: () => p.calls.map(keyOf), sent: (key) => p.calls.filter((c) => keyOf(c) === key) };
}
const base = (over = {}) => ({ "GET me/": [200, ME], [LIST]: dry([el("site_a"), el("site_b")]), [BATCHES]: overview([DONE]), ...over });
const buttons = (n, text) => n.all((x) => x.tagName === "BUTTON" && x.textContent === text);
const boxes = (n) => n.all((x) => x.tagName === "INPUT");
const tick = (box, on) => { box.checked = on; box.fire("change"); };
const type = (n, text) => { n.value = text; n.fire("input"); };
const rowsText = (p, id) => p.node[id].children.map((li) => li.textContent);

/* Opens a proposed batch of the given sites through Propose. */
async function proposed(sites = ["site_a", "site_b"], over = {}) {
  const b = batch("ebt_x9", "proposed", sites.map((s) => item(s)));
  const p = await page(base({ [PROPOSE]: [200, b], ...over }));
  for (const bx of boxes(p.node["a-rows"])) tick(bx, true);
  p.node["propose"].fire("click");
  await settle();
  return p;
}
function approveWith(p, reason, line) {
  type(p.node["ap-reason"], reason);
  type(p.node["ap-confirm"], line);
  const e = p.node["approve-form"].fire("submit");
  return e;
}

test("the page asks who is signed in, then calls list/ and batches/ as POSTs with no body, and paints the overview", async () => {
  const p = await page(base({ [LIST]: dry([el("site_a", { notice: "not_sent", usage_to_write_off: true })], { near: [{ site: "site_n", deletion_due_at: "2026-11-20T09:00:00+08:00", days_until: 6 }],
    refused: [{ site: "site_h", deletion_due_at: "2026-12-20T09:00:00+08:00", reason_code: "held", hold_reason: "legal" }] }) }));
  assert.deepEqual(p.keys(), ["GET me/", LIST, BATCHES]);
  assert.deepEqual(p.calls.slice(1).map((c) => [c.method, c.body]), [["POST", undefined], ["POST", undefined]]);
  assert.deepEqual(p.shown(), ["v-main"]);
  assert.equal(p.node["acct-name"].textContent, "sample.staff");
  assert.equal(p.node["l-asof"].textContent, "As of Nov 14, 2026, 9:02 AM");
  assert.equal(p.node["a-count"].textContent, "1 site");
  const row = p.node["a-rows"].children[0].textContent;
  assert.match(row, /site_a/);
  assert.match(row, /Sante · Ended Sep 24, 2026 · Due Dec 24, 2026 · 12 days overdue/);
  assert.match(row, /608 rows to blank or delete, 3 private files/);
  assert.match(row, /Account will be disposed of/);
  assert.match(row, /No service-end email was sent/);
  assert.match(row, /Open usage will be written off first/);
  assert.equal(p.node["b-count"].textContent, "1 stopped, 1 coming up");
  assert.match(rowsText(p, "b-rows").join("|"), /site_hHeld: legal.*Release hold/);
  assert.match(rowsText(p, "b-rows").join("|"), /site_nDue in 6 days.*Hold/);
  assert.equal(p.node["b-body"].hidden, false, "the stopped list is open when something is stopped");
  assert.equal(p.node["c-count"].textContent, "1");
  assert.match(p.node["c-rows"].children[0].textContent, /ebt_m4Done1 site · 1 erased, 0 skipped, 0 failed · proposed Nov 14, 2026, 9:02 AMOpen/);
  assert.equal(p.node["l-asof"].hidden, false);
  assert.equal(p.node["l-ret"].hidden, true);
});

test("the per-table counts open under a row in words, with a table the page has no words for summed into Other records", async () => {
  const p = await page(base());
  const first = p.node["a-rows"].children[0];
  const det = first.children[1];
  assert.equal(det.hidden, true);
  const btn = buttons(first, "Details")[0];
  assert.equal(btn.getAttribute("aria-expanded"), "false");
  assert.equal(btn.getAttribute("aria-controls"), det.getAttribute("id"));
  btn.click();
  assert.equal(det.hidden, false);
  assert.equal(btn.getAttribute("aria-expanded"), "true");
  assert.equal(det.textContent, "Site settings1Members214Shop orders388Seal files1Payment QR files2Other records5");
  assert.doesNotMatch(first.textContent, /a_table_without_words|sante_site_settings/);
});

test("nothing erased yet: the first batch is one site, and a second ticked site turns Propose off with the reason", async () => {
  const p = await page(base({ [BATCHES]: overview([]) }));
  assert.equal(p.node["l-asof"].textContent, "As of Nov 14, 2026, 9:02 AM");
  const [a, b] = boxes(p.node["a-rows"]);
  assert.equal(p.node["propose"].disabled, true);
  assert.equal(p.node["a-why"].textContent, "Select at least one site.");
  tick(a, true);
  assert.equal(p.node["propose"].disabled, false);
  assert.equal(p.node["a-sel"].textContent, "1 selected. The first batch is one site.");
  tick(b, true);
  assert.equal(p.node["propose"].disabled, true);
  assert.equal(p.node["a-why"].textContent, "The first batch in this environment is one site. Unselect the others.");
  assert.equal(p.node["a-why"].hidden, false);
});

test("after a batch has run, 25 ticked sites can be proposed and 26 cannot", async () => {
  const sites = Array.from({ length: 26 }, (_, i) => el("site_" + String(i).padStart(2, "0")));
  const p = await page(base({ [LIST]: dry(sites) }));
  const bx = boxes(p.node["a-rows"]);
  bx.slice(0, 25).forEach((b) => tick(b, true));
  assert.equal(p.node["a-sel"].textContent, "25 of 25 selected");
  assert.equal(p.node["propose"].disabled, false);
  tick(bx[25], true);
  assert.equal(p.node["propose"].disabled, true);
  assert.equal(p.node["a-why"].textContent, "A batch holds at most 25 sites.");
  tick(bx[25], false);
  assert.equal(p.node["propose"].disabled, false);
});

test("with account disposal switched off, a row whose account would be disposed of cannot be ticked and says why", async () => {
  const p = await page(base({ [LIST]: dry([el("site_a", { account_action: "keep", account_reason: "retention_switched_off" }), el("site_b", { account_action: "keep", account_reason: "other_live_site" })], { retention_enabled: false }) }));
  const [a, b] = boxes(p.node["a-rows"]);
  assert.equal(a.disabled, true);
  assert.equal(b.disabled, false);
  assert.equal(p.node["l-ret"].hidden, false);
  assert.match(p.node["a-rows"].children[0].textContent, /cannot be selected: its account would be disposed of and account disposal is switched off/);
  assert.match(p.node["a-rows"].children[0].textContent, /Account kept: account disposal is switched off/);
  assert.match(p.node["a-rows"].children[1].textContent, /Account kept: another site is live/);
});

test("with the switch off, list/ answering 404 shows only the not-switched-on card and makes no other call", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: [404, refused("not_found")], [BATCHES]: [404, refused("not_found")] });
  assert.deepEqual(p.shown(), ["v-closed"]);
  assert.deepEqual(p.keys(), ["GET me/", LIST, BATCHES]);
});

test("with no answer, the page says it could not be reached, and Try again reads both lists again", async () => {
  let up = false;
  const p = await page({ "GET me/": [200, ME], [LIST]: () => (up ? dry([el("site_a")]) : "offline"), [BATCHES]: () => (up ? overview([]) : "offline") });
  assert.deepEqual(p.shown(), ["v-down"]);
  up = true;
  p.node["retry"].click();
  await settle();
  assert.deepEqual(p.shown(), ["v-main"]);
  assert.deepEqual(p.keys(), ["GET me/", LIST, BATCHES, LIST, BATCHES]);
});

test("a signed-out answer sends the person to sign in, and a missing second step to verify", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: [401, refused("unauthenticated")], [BATCHES]: [401, refused("unauthenticated")] });
  assert.equal(p.location.replaced, "/sign-in/");
  const q = await page({ "GET me/": [200, ME], [LIST]: [401, refused("second_step_required")], [BATCHES]: [401, refused("second_step_required")] });
  assert.equal(q.location.replaced, "/verify/");
});

test("when batches/ fails the due list still paints and the batch and hold sections say so", async () => {
  const p = await page(base({ [BATCHES]: [500, {}] }));
  assert.deepEqual(p.shown(), ["v-main"]);
  assert.equal(p.node["a-rows"].children.length, 2);
  assert.equal(p.node["c-err"].hidden, false);
  assert.equal(p.node["c-err"].textContent, "Could not load. Reload the page.");
  assert.equal(p.node["d-err"].hidden, false);
  assert.equal(p.node["c-empty"].hidden, true);
  const q = await page(base({ [LIST]: [500, {}] }));
  assert.equal(q.node["a-err"].textContent, "Could not load. Reload the page.");
  assert.equal(q.node["a-bar"].hidden, true);
  assert.equal(q.node["c-rows"].children.length, 1);
});

test("empty lists say so", async () => {
  const p = await page(base({ [LIST]: dry([]), [BATCHES]: overview([]) }));
  assert.equal(p.node["a-empty"].hidden, false);
  assert.equal(p.node["b-empty"].hidden, false);
  assert.equal(p.node["c-empty"].hidden, false);
  assert.equal(p.node["d-empty"].hidden, false);
  assert.equal(p.node["a-bar"].hidden, true);
});

test("the overview has no top Refresh button and no first-batch sentence; the As of line is plain page copy", async () => {
  const p = await page(base());
  assert.equal(p.node["refresh"], undefined);
  assert.equal(p.node["l-first"], undefined);
  assert.doesNotMatch(HTML, /id="refresh"|Nothing has been erased/);
  assert.match(HTML, /<p class="dash-copy" id="l-asof" hidden><\/p>/);
});

test("the As of line stays hidden when the list did not load", async () => {
  const p = await page(base({ [LIST]: [500, {}] }));
  assert.equal(p.node["l-asof"].hidden, true);
  assert.equal(p.node["l-asof"].textContent, "");
});

test("Propose sends exactly the ticked sites in list order, opens the frozen batch and puts focus in the Reason field", async () => {
  const p = await proposed(["site_a", "site_b"]);
  const [call] = p.sent(PROPOSE);
  assert.deepEqual(call.body, { sites: ["site_a", "site_b"] });
  assert.deepEqual(p.shown(), ["v-batch"]);
  assert.equal(p.node["bt-h"].textContent, "Batch ebt_x9");
  assert.equal(p.node["bt-msg"].textContent, "Batch ebt_x9 proposed. Nothing has been deleted.");
  assert.equal(p.node["bt-chip"].textContent, "Proposed");
  assert.equal(p.node["ap-area"].hidden, false);
  assert.equal(p.node["st-area"].hidden, true);
  assert.equal(p.doc.activeElement, p.node["ap-reason"]);
  assert.equal(p.node["ap-items"].children.length, 2);
  assert.match(p.node["bt-meta"].textContent, /List fingerprint 9f3a1c07d2be$/);
  assert.equal(p.node["ap-fp"].textContent, "9f3a1c07d2be");
});

test("a refused proposal lists each site with its reason in words, keeps the sites that are still due and reads the list again", async () => {
  let n = 0;
  const p = await page(base({ [PROPOSE]: [409, { error: { code: "not_proposable", message: "x", fields: { sites: ["site_a: already_in_batch", "site_b: a_code_nobody_knows", "site_c: held"] } } }],
    [LIST]: () => (++n === 1 ? dry([el("site_a"), el("site_b"), el("site_c")]) : dry([el("site_b")])) }));
  boxes(p.node["a-rows"]).forEach((b) => tick(b, true));
  p.node["propose"].click();
  await settle();
  assert.equal(p.node["pr-err"].textContent,
    "Some sites cannot be proposed: site_a is already in a batch. site_b is stopped for a reason this page has no words for. site_c is held. Nothing was proposed.");
  assert.doesNotMatch(p.node["pr-err"].textContent, /a_code_nobody_knows|already_in_batch/);
  assert.equal(p.node["pr-err"].hidden, false);
  assert.deepEqual(p.shown(), ["v-main"]);
  assert.equal(p.sent(LIST).length, 2);
  assert.equal(p.node["a-rows"].children.length, 1);
  assert.equal(boxes(p.node["a-rows"])[0].checked, true, "the site still due stays ticked");
  assert.equal(p.doc.activeElement, p.node["propose"]);
});

test("a 400 on propose shows the backend's own message", async () => {
  const p = await page(base({ [PROPOSE]: [400, { error: { code: "invalid_request", message: "Some values are missing or invalid.", fields: { sites: ["Give 1 to 25 different ids."] } } }] }));
  tick(boxes(p.node["a-rows"])[0], true);
  p.node["propose"].click();
  await settle();
  assert.equal(p.node["pr-err"].textContent, "Give 1 to 25 different ids.");
  assert.equal(p.node["propose"].disabled, false);
});

test("the approve step shows the totals, the notice from the dry run, and the line to type", async () => {
  const p = await page(base({ [LIST]: dry([el("site_a"), el("site_b", { notice: "not_sent", account_action: "keep", account_reason: "other_live_site" })]),
    [PROPOSE]: [200, batch("ebt_x9", "proposed", [item("site_a"), item("site_b"), item("site_gone")])] }));
  boxes(p.node["a-rows"]).forEach((b) => tick(b, true));
  p.node["propose"].click();
  await settle();
  assert.equal(p.node["ap-n"].textContent, "3");
  assert.equal(p.node["ap-rows"].textContent, "1,824");
  assert.equal(p.node["ap-files"].textContent, "9");
  assert.equal(p.node["ap-acc"].textContent, "3");
  assert.equal(p.node["ap-noemail"].textContent, "1 (1 not known)");
  assert.equal(p.node["ap-line"].textContent, "erase batch ebt_x9 3 sites");
  assert.equal(p.node["ap-exp"].textContent.startsWith("Jan 1, 2099, 12:00 AM"), true);
  assert.match(p.node["ap-items"].children[1].textContent, /No service-end email was sent/);
  assert.doesNotMatch(p.node["ap-items"].children[2].textContent, /service-end|notice/i, "a site gone from the dry run shows no notice");
  assert.match(p.node["ap-items"].children[0].textContent, /Keep site_a in this batch/);
});

test("unticking a row changes the totals and the line; Approve stays off until the typed line matches exactly (a trailing space is trimmed)", async () => {
  const p = await proposed(["site_a", "site_b"]);
  const [k1, k2] = boxes(p.node["ap-items"]);
  assert.equal(p.node["ap-go"].disabled, true);
  type(p.node["ap-confirm"], "erase batch ebt_x9 2 sites ");
  assert.equal(p.node["ap-go"].disabled, false, "a trailing space is trimmed");
  tick(k2, false);
  assert.equal(p.node["ap-n"].textContent, "1");
  assert.equal(p.node["ap-line"].textContent, "erase batch ebt_x9 1 sites");
  assert.equal(p.node["ap-go"].disabled, true, "the old line no longer matches");
  for (const wrong of ["erase batch ebt_x9 1 site", "Erase batch ebt_x9 1 sites", "erase batch ebt_x9  1 sites", "erase batch ebt_x9 1 sites."]) {
    type(p.node["ap-confirm"], wrong);
    assert.equal(p.node["ap-go"].disabled, true, wrong);
  }
  type(p.node["ap-confirm"], "erase batch ebt_x9 1 sites");
  assert.equal(p.node["ap-go"].disabled, false);
  tick(k1, false);
  assert.equal(p.node["ap-line"].textContent, "erase batch ebt_x9 0 sites");
  type(p.node["ap-confirm"], "erase batch ebt_x9 0 sites");
  assert.equal(p.node["ap-go"].disabled, true, "no site left: nothing to approve");
  assert.equal(p.node["ap-why"].textContent, "Keep at least one site, or cancel the batch.");
});

test("Approve sends exactly {batch, confirmation, exclude, reason}, repaints the batch as Approved and moves focus to Refresh", async () => {
  const done = batch("ebt_x9", "approved", [item("site_a"), item("site_b", { status: "excluded" })], { approved_at: "2026-11-14T09:20:00+08:00", approval_reason: "Weekly review <b>one</b>" });
  const p = await proposed(["site_a", "site_b"], { [APPROVE]: [200, done] });
  tick(boxes(p.node["ap-items"])[1], false);
  const e = approveWith(p, "  Weekly review <b>one</b> ", "erase batch ebt_x9 1 sites");
  assert.equal(e.prevented, true);
  await settle();
  assert.deepEqual(p.sent(APPROVE)[0].body, { batch: "ebt_x9", confirmation: "erase batch ebt_x9 1 sites", exclude: ["site_b"], reason: "Weekly review <b>one</b>" });
  assert.equal(p.node["ap-area"].hidden, true);
  assert.equal(p.node["st-area"].hidden, false);
  assert.equal(p.node["bt-chip"].textContent, "Approved");
  assert.equal(p.node["bt-msg"].textContent, "Approved. The run starts within about 5 minutes.");
  assert.equal(p.node["st-approved"].textContent, "Approved Nov 14, 2026, 9:20 AM. Reason: Weekly review <b>one</b>", "the reason is text, not markup");
  assert.equal(p.node["st-hint"].textContent, "Waiting for the next run. A run starts within about 5 minutes.");
  assert.equal(p.node["st-cancel"].hidden, false);
  assert.equal(p.doc.activeElement, p.node["st-refresh"]);
});

test("a reason that is empty, over 300 characters or holds an @, and a batch with every site excluded, are refused here and send no call", async () => {
  const p = await proposed();
  const line = "erase batch ebt_x9 2 sites";
  approveWith(p, "   ", line);
  assert.equal(p.node["ap-reason-e"].textContent, "Write a reason.");
  assert.equal(p.doc.activeElement, p.node["ap-reason"]);
  approveWith(p, "x".repeat(301), line);
  assert.equal(p.node["ap-reason-e"].textContent, "The reason is at most 300 characters.");
  approveWith(p, "ask me at a@b.test", line);
  assert.equal(p.node["ap-reason-e"].textContent, "The reason cannot hold an email address.");
  assert.equal(p.node["ap-reason"].getAttribute("aria-invalid"), "true");
  boxes(p.node["ap-items"]).forEach((b) => tick(b, false));
  approveWith(p, "fine", "erase batch ebt_x9 0 sites");
  assert.equal(p.node["ap-err"].textContent, "Every site was excluded. Cancel the batch instead.");
  assert.equal(p.sent(APPROVE).length, 0);
});

test("confirmation_mismatch keeps what was typed, says so under the field and focuses it; the button is not left busy", async () => {
  const p = await proposed(["site_a"], { [APPROVE]: [409, refused("confirmation_mismatch")] });
  approveWith(p, "Weekly review", "erase batch ebt_x9 1 sites");
  await settle();
  assert.equal(p.node["ap-err"].textContent, "That does not match the batch and the number of sites. Check the line above.");
  assert.equal(p.node["ap-confirm"].value, "erase batch ebt_x9 1 sites");
  assert.equal(p.doc.activeElement, p.node["ap-confirm"]);
  assert.equal(p.node["ap-go"].disabled, false);
  assert.equal(p.node["ap-reason"].disabled, false);
});

test("invalid_request puts the backend's reason message under the reason, or the excluded message under the list", async () => {
  const reason = [400, { error: { code: "invalid_request", message: "x", fields: { reason: ["At most 300 characters, and no email address."] } } }];
  const p = await proposed(["site_a"], { [APPROVE]: reason });
  approveWith(p, "Weekly review", "erase batch ebt_x9 1 sites");
  await settle();
  assert.equal(p.node["ap-reason-e"].textContent, "At most 300 characters, and no email address.");
  assert.equal(p.doc.activeElement, p.node["ap-reason"]);
  const ex = [400, { error: { code: "invalid_request", message: "x", fields: { exclude: ["Only sites of this batch can be excluded."] } } }];
  const q = await proposed(["site_a"], { [APPROVE]: ex });
  approveWith(q, "Weekly review", "erase batch ebt_x9 1 sites");
  await settle();
  assert.equal(q.node["ap-err"].textContent, "Only sites of this batch can be excluded.");
  assert.equal(q.doc.activeElement, boxes(q.node["ap-items"])[0]);
});

test("proposal_expired repaints the batch as Cancelled with the instruction to make the list again", async () => {
  const p = await proposed(["site_a"], { [APPROVE]: [409, refused("proposal_expired")] });
  approveWith(p, "Weekly review", "erase batch ebt_x9 1 sites");
  await settle();
  assert.equal(p.node["bt-chip"].textContent, "Cancelled");
  assert.equal(p.node["bt-msg"].textContent, "This proposal expired. Make the list again.");
  assert.equal(p.node["ap-area"].hidden, true);
  assert.deepEqual(p.shown(), ["v-batch"]);
});

test("wrong_status reads batches/ again and shows the batch as it now is", async () => {
  let reads = 0;
  const now = batch("ebt_x9", "approved", [item("site_a")], { approved_at: "2026-11-14T09:20:00+08:00", approval_reason: "Someone else" });
  const p = await proposed(["site_a"], { [APPROVE]: [409, refused("wrong_status")], [BATCHES]: () => (++reads < 2 ? overview([DONE]) : overview([now, DONE])) });
  approveWith(p, "Weekly review", "erase batch ebt_x9 1 sites");
  await settle();
  assert.equal(p.node["bt-chip"].textContent, "Approved");
  assert.equal(p.node["bt-msg"].textContent, "This batch was already decided.");
  assert.equal(p.node["ap-area"].hidden, true);
});

test("a 404 on approve reads batches/: a batch that is gone says so and returns to the overview; a switch that went off shows the off card", async () => {
  let reads = 0;
  const p = await proposed(["site_a"], { [APPROVE]: [404, refused("not_found")], [BATCHES]: () => (++reads < 2 ? overview([DONE]) : overview([DONE])) });
  approveWith(p, "Weekly review", "erase batch ebt_x9 1 sites");
  await settle();
  assert.deepEqual(p.shown(), ["v-main"]);
  assert.equal(p.node["l-msg"].textContent, "That batch no longer exists.");
  let n = 0;
  const q = await proposed(["site_a"], { [APPROVE]: [404, refused("not_found")], [BATCHES]: () => (++n < 2 ? overview([DONE]) : [404, refused("not_found")]) });
  approveWith(q, "Weekly review", "erase batch ebt_x9 1 sites");
  await settle();
  assert.deepEqual(q.shown(), ["v-closed"]);
});

test("no answer on approve keeps every typed value, says it did not go through, and leaves the button usable", async () => {
  const p = await proposed(["site_a"], { [APPROVE]: "offline" });
  approveWith(p, "Weekly review", "erase batch ebt_x9 1 sites");
  assert.equal(p.node["ap-go"].disabled, true, "busy while the call is on its way");
  await settle();
  assert.equal(p.node["ap-err"].textContent, "That did not go through. Check the batch before trying again.");
  assert.equal(p.node["ap-reason"].value, "Weekly review");
  assert.equal(p.node["ap-confirm"].value, "erase batch ebt_x9 1 sites");
  assert.equal(p.node["ap-go"].disabled, false);
  assert.deepEqual(p.shown(), ["v-batch"]);
});

test("a second submit while the first is on its way sends nothing more", async () => {
  const p = await proposed(["site_a"], { [APPROVE]: [409, refused("confirmation_mismatch")] });
  type(p.node["ap-reason"], "Weekly review");
  type(p.node["ap-confirm"], "erase batch ebt_x9 1 sites");
  p.node["approve-form"].fire("submit");
  p.node["approve-form"].fire("submit");
  await settle();
  assert.equal(p.sent(APPROVE).length, 1);
});

test("Cancel batch needs a reason, sends {batch, reason}, repaints the batch as Cancelled and focuses Refresh", async () => {
  const gone = batch("ebt_x9", "cancelled", [item("site_a")]);
  const p = await proposed(["site_a"], { [CANCEL]: [200, gone] });
  p.node["ap-cancel"].click();
  assert.equal(p.node["m-cancel"].hidden, false);
  assert.equal(p.doc.activeElement, p.node["cancel-f"]);
  type(p.node["cancel-f"], "  ");
  p.node["cancel-form"].fire("submit");
  assert.equal(p.node["cancel-e"].textContent, "Write a reason.");
  type(p.node["cancel-f"], "mail me@x.test");
  p.node["cancel-form"].fire("submit");
  assert.equal(p.node["cancel-e"].textContent, "The reason cannot hold an email address.");
  assert.equal(p.sent(CANCEL).length, 0);
  type(p.node["cancel-f"], "Wrong list");
  p.node["cancel-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(CANCEL)[0].body, { batch: "ebt_x9", reason: "Wrong list" });
  assert.equal(p.node["m-cancel"].hidden, true);
  assert.equal(p.node["bt-chip"].textContent, "Cancelled");
  assert.equal(p.node["bt-msg"].textContent, "Batch cancelled.");
  assert.equal(p.doc.activeElement, p.node["st-refresh"]);
});

test("cancelling a running batch is refused with wrong_status and the dialog says so", async () => {
  const running = batch("ebt_r", "approved", [item("site_a")], { approved_at: "2026-11-14T09:20:00+08:00", approval_reason: "Go" });
  const asRunning = { ...running, status: "running" };
  let reads = 0;
  const p = await page(base({ [BATCHES]: () => (++reads < 2 ? overview([running, DONE]) : overview([asRunning, DONE])), [CANCEL]: [409, refused("wrong_status")] }));
  buttons(p.node["c-rows"].children[0], "Open")[0].click();
  assert.equal(p.node["st-cancel"].hidden, false);
  p.node["st-cancel"].click();
  type(p.node["cancel-f"], "Stop it");
  p.node["cancel-form"].fire("submit");
  await settle();
  assert.equal(p.node["cancel-e"].textContent, "This batch cannot be cancelled now.");
  assert.equal(p.node["bt-chip"].textContent, "Running");
  assert.equal(p.node["st-cancel"].hidden, true, "a running batch has no Cancel button");
});

test("Escape and the X close a dialog and give focus back to the button that opened it", async () => {
  const p = await proposed(["site_a"]);
  p.node["ap-cancel"].click();
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(p.node["m-cancel"].hidden, true);
  assert.equal(p.doc.activeElement, p.node["ap-cancel"]);
  p.node["ap-cancel"].click();
  p.node["cancel-x"].click();
  assert.equal(p.node["m-cancel"].hidden, true);
  assert.equal(p.doc.activeElement, p.node["ap-cancel"]);
});

test("each batch status paints its words, and a running, approved or needs-attention batch its hint; Refresh reads batches/ only", async () => {
  const items = [item("site_a", { status: "erased", counts: { members: 10, site_seal_files: 1 }, erased_at: "2026-11-14T09:25:00+08:00", account_disposed: true }),
    item("site_b", { status: "failed", reason_code: "store_unavailable", attempts: 5 }), item("site_c", { status: "skipped", reason_code: "held" }),
    item("site_d", { status: "failed", reason_code: "a_new_code", attempts: 2 }), item("site_e", { status: "excluded" }), item("site_f"), item("site_g", { status: "mystery" })];
  const na = batch("ebt_n", "needs_attention", items, { approved_at: "2026-11-14T09:20:00+08:00", approval_reason: "Go" });
  const p = await page(base({ [BATCHES]: overview([na, DONE]) }));
  buttons(p.node["c-rows"].children[0], "Open")[0].click();
  assert.equal(p.node["bt-chip"].textContent, "Needs attention");
  assert.equal(p.node["st-hint"].textContent, "Some sites failed 5 times and need attention. Cancel the batch or ask engineering.");
  const rows = rowsText(p, "st-items");
  assert.equal(rows[0], "site_aErased10 rows, 1 file · Nov 14, 2026, 9:25 AM · account disposed of");
  assert.equal(rows[1], "site_bFailedThe private file store could not be reached · 5 of 5 attempts");
  assert.equal(rows[2], "site_cSkippedHeld");
  assert.equal(rows[3], "site_dFailedA reason this page has no words for · 2 of 5 attempts");
  assert.equal(rows[4], "site_eExcluded");
  assert.equal(rows[5], "site_fWaiting");
  assert.equal(rows[6], "site_gA status this page has no words for");
  assert.doesNotMatch(rows.join("|"), /store_unavailable|a_new_code|mystery/);
  assert.equal(p.node["st-cancel"].hidden, false);
  const before = p.calls.length;
  p.node["st-refresh"].click();
  await settle();
  assert.deepEqual(p.keys().slice(before), [BATCHES]);
});

test("a proposal that has expired is read-only with no Approve step", async () => {
  const old = batch("ebt_old", "proposed", [item("site_a")], { expires_at: PAST });
  const p = await page(base({ [BATCHES]: overview([old]) }));
  assert.match(p.node["c-rows"].children[0].textContent, /expired/);
  buttons(p.node["c-rows"].children[0], "Open")[0].click();
  assert.equal(p.node["ap-area"].hidden, true);
  assert.equal(p.node["st-hint"].textContent, "This proposal expired. Make the list again.");
});

test("Back to Lifecycle returns to the overview and reads both lists again", async () => {
  const p = await proposed(["site_a"]);
  const before = p.calls.length;
  const e = p.node["bt-back"].fire("click");
  await settle();
  assert.equal(e.prevented, true);
  assert.deepEqual(p.shown(), ["v-main"]);
  assert.deepEqual(p.keys().slice(before), [LIST, BATCHES]);
});

test("Place a hold sends {site, reason_code, reference}, repaints the holds from the answer and reads the due list again", async () => {
  const after = overview([DONE], [{ site: "site_h", reason_code: "legal", reference: "LR-1 <i>x</i>", placed_at: "2026-11-14T09:30:00+08:00" }]);
  const p = await page(base({ [HOLD]: after }));
  buttons(p.node["a-rows"].children[0], "Hold")[0].click();
  assert.equal(p.node["m-hold"].hidden, false);
  assert.equal(p.node["hold-site"].value, "site_a");
  assert.equal(p.node["hold-site"].getAttribute("readonly"), "readonly");
  assert.equal(p.doc.activeElement, p.node["hold-reason"]);
  p.node["hold-form"].fire("submit");
  assert.equal(p.node["hold-reason-e"].textContent, "Choose a reason.");
  assert.equal(p.sent(HOLD).length, 0);
  p.node["hold-reason"].value = "legal";
  type(p.node["hold-ref"], "LR-1 <i>x</i>");
  p.node["hold-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(HOLD)[0].body, { site: "site_a", reason_code: "legal", reference: "LR-1 <i>x</i>" });
  assert.equal(p.node["m-hold"].hidden, true);
  assert.equal(p.node["l-msg"].textContent, "Hold placed on site_a.");
  assert.equal(p.node["d-rows"].children[0].textContent, "site_hLegalReference LR-1 <i>x</i> · placed Nov 14, 2026Release");
  assert.equal(p.sent(LIST).length, 2);
});

test("Place a hold from the Holds section lets the site be typed, and a reference with an @ or over 100 characters is refused here", async () => {
  const p = await page(base());
  p.node["d-place"].click();
  assert.equal(p.node["hold-site"].hasAttribute("readonly"), false);
  assert.equal(p.doc.activeElement, p.node["hold-site"]);
  p.node["hold-form"].fire("submit");
  assert.equal(p.node["hold-site-e"].textContent, "Write the site id.");
  type(p.node["hold-site"], "site_z");
  p.node["hold-reason"].value = "fraud";
  type(p.node["hold-ref"], "a@b.test");
  p.node["hold-form"].fire("submit");
  assert.equal(p.node["hold-ref-e"].textContent, "At most 100 characters, and no email address.");
  assert.equal(p.sent(HOLD).length, 0);
  p.node["hold-cancel"].click();
  assert.equal(p.doc.activeElement, p.node["d-place"]);
});

test("already_held and the backend's field errors show under their fields; the dialog stays open", async () => {
  const p = await page(base({ [HOLD]: [409, refused("already_held")] }));
  p.node["d-place"].click();
  type(p.node["hold-site"], "site_a");
  p.node["hold-reason"].value = "other";
  p.node["hold-form"].fire("submit");
  await settle();
  assert.equal(p.node["hold-site-e"].textContent, "This site already has a hold.");
  assert.equal(p.node["m-hold"].hidden, false);
  assert.equal(p.doc.activeElement, p.node["hold-site"]);
  assert.equal(p.node["hold-go"].disabled, false);
  const bad = [400, { error: { code: "invalid_request", message: "x", fields: { site: ["No such site."], reason_code: ["Choose one of the listed reasons."] } } }];
  const q = await page(base({ [HOLD]: bad }));
  q.node["d-place"].click();
  type(q.node["hold-site"], "nope");
  q.node["hold-reason"].value = "other";
  q.node["hold-form"].fire("submit");
  await settle();
  assert.equal(q.node["hold-site-e"].textContent, "No such site.");
  assert.equal(q.node["hold-reason-e"].textContent, "Choose one of the listed reasons.");
  assert.equal(q.doc.activeElement, q.node["hold-site"]);
});

test("Release hold names the site, its reason and reference, sends {site}, and repaints the holds", async () => {
  const held = { site: "site_h", reason_code: "legal", reference: "LR-1", placed_at: "2026-11-13T09:30:00+08:00" };
  const p = await page(base({ [BATCHES]: overview([DONE], [held]), [RELEASE]: overview([DONE], []) }));
  buttons(p.node["d-rows"].children[0], "Release")[0].click();
  assert.equal(p.node["m-release-sub"].textContent, "Release the hold on site_h? Reason: Legal. Reference: LR-1. The site can be proposed again once it is due.");
  assert.equal(p.doc.activeElement, p.node["release-cancel"]);
  p.node["release-go"].click();
  await settle();
  assert.deepEqual(p.sent(RELEASE)[0].body, { site: "site_h" });
  assert.equal(p.node["m-release"].hidden, true);
  assert.equal(p.node["d-rows"].children.length, 0);
  assert.equal(p.node["d-empty"].hidden, false);
  assert.equal(p.node["l-msg"].textContent, "Hold released on site_h.");
  assert.equal(p.sent(LIST).length, 2);
});

test("not_held says so in the dialog and reads the lists again; a stopped row for a held site offers Release and others Hold", async () => {
  const list = dry([], { refused: [{ site: "site_h", deletion_due_at: "2026-12-20T09:00:00+08:00", reason_code: "held", hold_reason: "fraud" },
    { site: "site_p", deletion_due_at: "2026-12-20T09:00:00+08:00", reason_code: "payment_under_review" }, { site: "site_e", deletion_due_at: "2026-12-20T09:00:00+08:00", reason_code: "already_erased" },
    { site: "site_u", deletion_due_at: "2026-12-20T09:00:00+08:00", reason_code: "unpaid_usage" }, { site: "site_x", deletion_due_at: "2026-12-20T09:00:00+08:00", reason_code: "brand_new" }] });
  const p = await page(base({ [LIST]: list, [RELEASE]: [409, refused("not_held")] }));
  const rows = p.node["b-rows"].children;
  assert.deepEqual(rows.map((r) => buttons(r, "Release hold").length + "/" + buttons(r, "Hold").length), ["1/0", "0/1", "0/0", "0/1", "0/1"]);
  assert.equal(rows[1].textContent.startsWith("site_pPayment proof under review"), true);
  assert.match(rows[3].textContent, /Open usage charges, an operator must decide/);
  assert.match(rows[4].textContent, /A reason this page has no words for/);
  assert.doesNotMatch(rows[4].textContent, /brand_new/);
  buttons(rows[0], "Release hold")[0].click();
  assert.match(p.node["m-release-sub"].textContent, /Reason: Fraud/);
  p.node["release-go"].click();
  await settle();
  assert.equal(p.node["release-e"].textContent, "This site has no hold.");
  assert.equal(p.node["release-go"].disabled, false);
  assert.equal(p.sent(BATCHES).length, 2);
  assert.equal(p.sent(LIST).length, 2);
});

test("a dialog cannot be closed by Escape while a call is on its way", async () => {
  const p = await page(base({ [HOLD]: "offline" }));
  p.node["d-place"].click();
  type(p.node["hold-site"], "site_a");
  p.node["hold-reason"].value = "other";
  p.node["hold-form"].fire("submit");
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(p.node["m-hold"].hidden, false);
  await settle();
  assert.equal(p.node["hold-e"].textContent, "That did not go through. Check the batch before trying again.");
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(p.node["m-hold"].hidden, true);
});

test("text from the backend is set as text, and no heading is ever given focus", async () => {
  const p = await page(base({ [BATCHES]: overview([DONE], [{ site: "site_<b>", reason_code: "other", reference: "<b>bold</b>", placed_at: "2026-11-13T09:30:00+08:00" }]) }));
  assert.equal(p.node["d-rows"].children[0].textContent, "site_<b>OtherReference <b>bold</b> · placed Nov 13, 2026Release");
  assert.equal(p.node["d-rows"].all((n) => n.tagName === "B").length, 0);
  const q = await proposed(["site_a"]);
  assert.ok(!/^H[1-6]$/.test(q.doc.activeElement.tagName));
});

test("the page makes no call other than me/ and the seven lifecycle routes, and sets no timer", async () => {
  const p = await proposed(["site_a"], { [APPROVE]: [200, batch("ebt_x9", "approved", [item("site_a")], { approved_at: "2026-11-14T09:20:00+08:00", approval_reason: "r" })] });
  approveWith(p, "Weekly review", "erase batch ebt_x9 1 sites");
  await settle();
  for (const k of p.keys()) assert.match(k, /^(GET me\/|POST lifecycle\/erasure\/(list|batches|propose|approve|cancel|hold|hold\/release)\/)$/);
  const js = fs.readFileSync(new URL("../public/assets/js/lifecycle.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /setInterval|setTimeout|localStorage|sessionStorage|document\.cookie|innerHTML/);
});

test("every field has a visible label, every error paragraph is an alert, and the confirmation field is described by the line and its hint", () => {
  for (const id of ["ap-reason", "ap-confirm", "cancel-f", "hold-site", "hold-reason", "hold-ref"]) assert.match(HTML, new RegExp(`<label for="${id}">`), id);
  const errs = [...HTML.matchAll(/<p class="field-err[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.ok(errs.length >= 12);
  for (const e of errs) assert.match(e, /role="alert"/, e);
  assert.match(HTML, /id="ap-confirm"[^>]*aria-describedby="ap-line ap-why ap-err"/);
  assert.match(HTML, /id="ap-confirm"[^>]*autocomplete="off"[^>]*spellcheck="false"/);
  assert.doesNotMatch(HTML, /id="ap-confirm"[^>]*\bvalue=/);
  assert.doesNotMatch(HTML, /<h[1-6][^>]*tabindex|id="bt-msg"[^>]*tabindex/i);
});
