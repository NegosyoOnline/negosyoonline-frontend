/* finance-accounts.js: the Receiving accounts page (Billing HQ-RA, ClickUp z8uq9metz0, plan sections 4, 5 and 7). Only made-up sample values.
   The page decides nothing: the backend does, and the page follows its answer. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE, refused } from "./page.mjs";

const NEW = ["n-kind", "n-provider", "n-name", "n-number", "n-order"];
const EDIT = ["e-kind", "e-provider", "e-name", "e-number", "e-order"];
const IDS = ["boot", "v-main", "v-closed", "v-down", "retry", "a-status", "a-msg", "accounts", "a-empty", "acc-open", "f-acc", ...NEW, "n-err", "n-go", "n-cancel",
  "m-edit", "edit-sub", "edit-form", ...EDIT, "e-err", "e-go", "e-cancel", "edit-x",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const VIEWS = ["boot", "v-main", "v-closed", "v-down"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const LIST = "POST finance/accounts/list/", ADD = "POST finance/accounts/add/", EDITR = "POST finance/accounts/edit/", ACTIVE = "POST finance/accounts/active/";
const LAST = "Add the new account first, then switch this one off.";

const account = (over = {}) => ({ id: "rca_one", kind: "bank", provider_name: "Sample Bank", account_name: "Sample Account Name", account_number: "0000 0000 01",
  active: true, sort_order: 0, created_at: "2026-11-13T09:00:00+08:00", updated_at: "2026-11-13T09:00:00+08:00", updated_by: "sample.staff@example.com", ...over });
const wallet = (over = {}) => account({ id: "rca_two", kind: "ewallet", provider_name: "Sample Wallet", account_name: "Sample Wallet Name", account_number: "0900 000 0002", sort_order: 1, ...over });
const live = { switch_on: true, store_available: true, active_accounts: 2, live: true };
const listing = (items = [account(), wallet()], bank_transfer = live) => [200, { items, bank_transfer }];

async function page(table) {
  const p = open(["hq.js", "shell.js", "finance-common.js", "finance-accounts.js"], { ids: IDS, pathname: "/finance/accounts/", answers: (call) => {
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
const normal = (over = {}) => ({ "GET me/": [200, ME], [LIST]: listing(), ...over });
const text = (p, id) => (p.node[id] || p.doc.getElementById(id)).textContent;
const buttons = (p, i) => p.node.accounts.children[i].all((n) => n.tagName === "BUTTON");
const fill = (p, ids, values) => ids.forEach((id, i) => { p.node[id].value = values[i]; });
const GOOD = ["ewallet", "Sample Wallet", "Sample Wallet Name", "0900 000 0003", ""];
function submitNew(p, values = GOOD) {
  p.node["acc-open"].fire("click");
  fill(p, NEW, values);
  p.node["f-acc"].fire("submit");
}

test("the page asks who is signed in, then lists the accounts", async () => {
  const p = await page(normal());
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url.slice(BASE.length + 1)), ["GET me/", LIST]);
  assert.deepEqual(p.calls[1].body, {});
  assert.deepEqual(p.shown(), ["v-main"]);
  assert.equal(p.node["acct-name"].textContent, "sample.staff");
});

test("each account shows its kind, provider, name and full number, an Active switch and an Edit button", async () => {
  const p = await page(normal({ [LIST]: listing([account(), wallet({ active: false })]) }));
  assert.equal(p.node.accounts.children.length, 2);
  assert.equal(p.node.accounts.children[0].textContent, "Bank, Sample BankSample Account Name · 0000 0000 01Order 0ActiveEdit");
  assert.match(p.node.accounts.children[1].textContent, /^E-wallet, Sample Wallet.*0900 000 0002.*Order 1Not activeEdit$/);
  const [sw, edit] = buttons(p, 0);
  assert.equal(sw.getAttribute("role"), "switch");
  assert.equal(sw.getAttribute("aria-checked"), "true");
  assert.equal(edit.textContent, "Edit");
  assert.equal(buttons(p, 0).length, 2, "no delete control");
  assert.equal(p.node["a-empty"].hidden, true);
});

test("an empty list says so", async () => {
  const p = await page(normal({ [LIST]: listing([], { switch_on: true, store_available: true, active_accounts: 0, live: false }) }));
  assert.equal(p.node["a-empty"].hidden, false);
  assert.equal(text(p, "accounts"), "");
});

test("the status line says whether Subscribers can pay, and each reason they cannot", async () => {
  const cases = [[live, "Subscribers can pay by bank transfer."],
    [{ switch_on: false, store_available: true, active_accounts: 1, live: false }, "Subscribers cannot pay by bank transfer yet: the bank transfer switch is off."],
    [{ switch_on: true, store_available: true, active_accounts: 0, live: false }, "Subscribers cannot pay by bank transfer yet: no account is active."],
    [{ switch_on: true, store_available: false, active_accounts: 1, live: false }, "Subscribers cannot pay by bank transfer yet: the proof store is not available."]];
  for (const [block, words] of cases) {
    const p = await page(normal({ [LIST]: listing([account()], block) }));
    assert.equal(text(p, "a-status"), words);
  }
});

test("the page warns that a changed number reaches every Subscriber, and to add the new account then switch the old one off", () => {
  const html = fs.readFileSync(new URL("../public/finance-accounts.html", import.meta.url), "utf8");
  assert.match(html, /add the new one, then switch the old one off\./);
  assert.match(html, /takes effect for every Subscriber at once/);
});

test("Add sends exactly the typed fields, with the order as a number only when typed, and lists again", async () => {
  const p = await page(normal({ [ADD]: [200, wallet()] }));
  submitNew(p, ["ewallet", " Sample Wallet ", " Sample Wallet Name ", " 0900 000 0003 ", ""]);
  await settle();
  assert.deepEqual(p.sent(ADD)[0].body, { kind: "ewallet", provider_name: "Sample Wallet", account_name: "Sample Wallet Name", account_number: "0900 000 0003" });
  assert.equal(p.node["f-acc"].hidden, true);
  assert.equal(text(p, "a-msg"), "Account added.");
  assert.equal(p.sent(LIST).length, 2);
  submitNew(p, ["bank", "Sample Bank", "Sample Account Name", "0000 0000 09", "7"]);
  await settle();
  assert.deepEqual(p.sent(ADD)[1].body, { kind: "bank", provider_name: "Sample Bank", account_name: "Sample Account Name", account_number: "0000 0000 09", sort_order: 7 });
});

test("the Add form opens empty, and a missing value is refused in the page with its own line and no call", async () => {
  const p = await page(normal({ [ADD]: [200, account()] }));
  p.node["acc-open"].fire("click");
  for (const id of NEW) assert.equal(p.node[id].value, "", id);
  p.node["f-acc"].fire("submit");
  assert.equal(text(p, "n-err"), "Fill in every required field.");
  assert.equal(text(p, "n-kind-e"), "Choose a type.");
  assert.equal(p.node["n-kind"].getAttribute("aria-invalid"), "true");
  assert.equal(p.doc.activeElement, p.node["n-kind"]);
  p.node["n-kind"].value = "bank";
  p.node["n-kind"].fire("change");
  assert.equal(p.node["n-kind"].getAttribute("aria-invalid"), null);
  assert.equal(p.sent(ADD).length, 0);
});

test("a refused field is named in words, never in the backend's own words; account_exists is worded", async () => {
  for (const [reply, words] of [
    [[400, { error: { code: "invalid_request", message: "Raw.", fields: { account_number: ["x"], kind: ["y"] } } }], "Check these fields: Type, Account number."],
    [[400, { error: { code: "invalid_request", message: "Raw.", fields: {} } }], "Check the values and try again."],
    [[409, refused("account_exists")], "That account is already listed. Edit or reactivate that account instead."],
    [[500, {}], "That did not go through. Check the page before trying again."]]) {
    const p = await page(normal({ [ADD]: reply }));
    submitNew(p);
    await settle();
    assert.equal(text(p, "n-err"), words);
    assert.doesNotMatch(text(p, "n-err"), /Raw|account_exists/);
    assert.equal(p.node["f-acc"].hidden, false, "the form stays open");
    assert.equal(p.node["n-go"].disabled, false);
  }
  const p = await page(normal({ [ADD]: [400, { error: { code: "invalid_request", message: "Raw.", fields: { account_number: ["x"] } } }] }));
  submitNew(p);
  await settle();
  assert.equal(text(p, "n-number-e"), "Use 6 to 40 digits; spaces and dashes are allowed.");
  assert.equal(p.node["n-number"].getAttribute("aria-invalid"), "true");
});

test("Edit opens a dialog with the account's values and sends only the account and the changed fields", async () => {
  const p = await page(normal({ [EDITR]: [200, account({ account_number: "0000 0000 99" })] }));
  buttons(p, 0)[1].fire("click");
  assert.equal(p.node["m-edit"].hidden, false);
  assert.deepEqual(EDIT.map((id) => p.node[id].value), ["bank", "Sample Bank", "Sample Account Name", "0000 0000 01", "0"]);
  p.node["e-number"].value = " 0000 0000 99 ";
  p.node["edit-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(EDITR)[0].body, { account: "rca_one", account_number: "0000 0000 99" });
  assert.equal(p.node["m-edit"].hidden, true);
  assert.equal(text(p, "a-msg"), "Account saved.");
  assert.equal(p.sent(LIST).length, 2);
  buttons(p, 1)[1].fire("click");
  p.node["e-kind"].value = "bank";
  p.node["e-order"].value = "5";
  p.node["edit-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(EDITR)[1].body, { account: "rca_two", kind: "bank", sort_order: 5 });
});

test("Edit with nothing changed makes no call", async () => {
  const p = await page(normal());
  buttons(p, 0)[1].fire("click");
  p.node["edit-form"].fire("submit");
  await settle();
  assert.equal(p.sent(EDITR).length, 0);
  assert.equal(p.node["m-edit"].hidden, true);
  assert.equal(text(p, "a-msg"), "No changes to save.");
});

test("an emptied Edit field is refused in the page; a refusal keeps the dialog open and is worded", async () => {
  const p = await page(normal({ [EDITR]: [409, refused("account_exists")] }));
  buttons(p, 0)[1].fire("click");
  p.node["e-name"].value = "  ";
  p.node["edit-form"].fire("submit");
  assert.equal(text(p, "e-name-e"), "Account name is required.");
  assert.equal(p.sent(EDITR).length, 0);
  p.node["e-name"].value = "Sample Other Name";
  p.node["edit-form"].fire("submit");
  await settle();
  assert.equal(p.node["m-edit"].hidden, false);
  assert.equal(text(p, "e-err"), "That account is already listed. Edit or reactivate that account instead.");
  assert.equal(p.node["e-go"].disabled, false);
  p.node["e-cancel"].fire("click");
  assert.equal(p.node["m-edit"].hidden, true);
});

test("the Active switch sends {account, active}, disables while busy, repaints from the answer and reads the list again", async () => {
  let on = true;
  const p = await page(normal({ [ACTIVE]: (call) => { on = call.body.active; return [200, account({ active: on })]; },
    [LIST]: () => listing([account({ active: on }), wallet()], { ...live, active_accounts: on ? 2 : 1 }) }));
  const sw = buttons(p, 0)[0];
  sw.fire("click");
  assert.equal(sw.disabled, true);
  await settle();
  assert.deepEqual(p.sent(ACTIVE)[0].body, { account: "rca_one", active: false });
  assert.equal(sw.getAttribute("aria-checked"), "false");
  assert.equal(p.sent(LIST).length, 2);
  assert.match(p.node.accounts.children[0].textContent, /Not activeEdit$/);
  buttons(p, 0)[0].fire("click");
  await settle();
  assert.deepEqual(p.sent(ACTIVE)[1].body, { account: "rca_one", active: true });
});

test("deactivating the last active account shows the refusal, says to add the new one first, and keeps the switch on", async () => {
  const p = await page(normal({ [LIST]: listing([account()], { ...live, active_accounts: 1 }), [ACTIVE]: [409, refused("last_active_account")] }));
  const sw = buttons(p, 0)[0];
  sw.fire("click");
  await settle();
  const note = p.node.accounts.children[0].all((n) => n.tagName === "P")[0];
  assert.equal(note.textContent, LAST);
  assert.equal(note.hidden, false);
  assert.equal(note.getAttribute("role"), "alert");
  assert.equal(p.node["a-msg"].hidden, true, "not the status box at the top");
  assert.equal(p.doc.activeElement, sw);
  assert.equal(sw.getAttribute("aria-checked"), "true");
  assert.equal(sw.disabled, false);
  assert.doesNotMatch(note.textContent, /last_active_account|A message the page does not show/);
});

test("a switch that fails keeps its state and says so", async () => {
  const p = await page(normal({ [ACTIVE]: [500, {}] }));
  const sw = buttons(p, 0)[0];
  sw.fire("click");
  await settle();
  assert.equal(sw.getAttribute("aria-checked"), "true");
  assert.equal(p.node.accounts.children[0].all((n) => n.tagName === "P")[0].textContent, "That did not go through. Check the page before trying again.");
});

test("a 404 shows the not-switched-on view; another failure shows the down view and Try again retries", async () => {
  const closed = await page(normal({ [LIST]: [404, refused("not_found")] }));
  assert.deepEqual(closed.shown(), ["v-closed"]);
  let answer = [500, {}];
  const down = await page(normal({ [LIST]: () => answer }));
  assert.deepEqual(down.shown(), ["v-down"]);
  answer = listing();
  down.node.retry.fire("click");
  await settle();
  assert.deepEqual(down.shown(), ["v-main"]);
  assert.equal(down.sent("GET me/").length, 1);
  const offline = await page(normal({ [LIST]: "offline" }));
  assert.deepEqual(offline.shown(), ["v-down"]);
});

test("a lost session goes to sign in or to the second step", async () => {
  const out = await page({ "GET me/": [401, refused("unauthenticated")] });
  assert.equal(out.location.replaced, "/sign-in/");
  const step = await page({ "GET me/": [200, ME], [LIST]: [401, refused("second_step_required")] });
  assert.equal(step.location.replaced, "/verify/");
});

test("every call is a POST with the path only, and nothing is written to the browser", async () => {
  const p = await page(normal({ [ADD]: [200, account()], [ACTIVE]: [200, account()], [EDITR]: [200, account()] }));
  submitNew(p);
  buttons(p, 0)[0].fire("click");
  await settle();
  for (const c of p.calls.filter((x) => x.url !== BASE + "/me/")) {
    assert.equal(c.method, "POST");
    assert.match(c.url, /^http:\/\/hq-api\.test\/staff\/v1\/finance\/accounts\/(list|add|edit|active)\/$/);
    assert.equal(c.credentials, "include");
  }
  const js = fs.readFileSync(new URL("../public/assets/js/finance-accounts.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie|console\.|location\.(?:search|hash)/);
});

test("headings are not focusable and the page loads its scripts in order", () => {
  const html = fs.readFileSync(new URL("../public/finance-accounts.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<h[1-6][^>]*tabindex/i);
  assert.match(html, /<title>Receiving accounts \| NegosyoOnline HQ<\/title>/);
  assert.match(html, /<h1 class="sr-only">Finance, receiving accounts<\/h1>/);
  const order = [...html.matchAll(/<script src="\/assets\/js\/([a-z-]+)\.js/g)].map((m) => m[1]);
  assert.deepEqual(order, ["theme", "config", "hq", "menu", "shell", "finance-common", "finance-accounts"]);
  assert.doesNotMatch(html, /<input[^>]*\bvalue=/i);
  for (const id of [...NEW, ...EDIT]) assert.match(html, new RegExp('<label for="' + id + '">'), id + " has a label");
});

test("the five older Finance pages and the new one all carry the Accounts tab, and next.config routes the page", () => {
  for (const f of ["finance", "finance-usage", "finance-issuer", "finance-invoices", "finance-reconcile", "finance-statements", "finance-accounts"]) {
    const html = fs.readFileSync(new URL("../public/" + f + ".html", import.meta.url), "utf8");
    assert.match(html, /<a href="\/finance\/accounts\/"[^>]*>Accounts<\/a>/, f);
  }
  const cfg = fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(cfg, /\{ source: "\/finance\/accounts\/", destination: "\/finance-accounts\.html" \}/);
  assert.match(cfg, /\{ source: "\/finance-accounts\.html", destination: "\/finance\/accounts\/", permanent: false \}/);
});
