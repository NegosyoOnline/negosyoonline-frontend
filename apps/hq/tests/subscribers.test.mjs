/* subscribers.js: the read-only Subscribers page (ClickUp z8uq9mhbdn). Mapping, the four tabs, search, Load more,
   one subscriber with payments, the closed (404) and down states, and that data is only ever set as text. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE } from "./page.mjs";

const IDS = ["boot", "v-list", "v-detail", "v-closed", "v-down", "retry", "tab-all", "tab-trial_ending", "tab-unpaid", "tab-suspended_ended",
  "s-form", "s-q", "s-go", "s-err", "s-card", "s-body", "s-loading", "s-empty", "s-more-row", "s-more", "back", "d-loading", "d-err", "d-retry",
  "d-body", "d-name", "d-state", "d-site-id", "d-facts", "d-pays", "d-pay-empty", "d-pay-h",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const VIEWS = ["boot", "v-list", "v-detail", "v-closed", "v-down"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const LIST = "POST subscribers/list/", DETAIL = "POST subscribers/detail/";

const row = (over = {}) => ({ site_id: "site_a", business_name: "Sample Store A", site_address: "sample-a.example.test", template: "classic",
  plan: "monthly", state: "active", trial_ends_at: "2026-11-30T00:00:00+08:00", next_due_at: "2026-12-05T00:00:00+08:00",
  last_payment_at: null, owner_email: "owner.a@example.com", created_at: "2026-10-01T09:30:00+08:00", ...over });
const pay = (over = {}) => ({ id: "btp_one", status: "confirmed", plan: "monthly", amount_centavos: 99900, amount_received_centavos: 99900,
  currency: "PHP", transferred_on: "2026-11-03", submitted_at: "2026-11-04T09:30:00+08:00", decided_at: "2026-11-05T10:00:00+08:00", ...over });
const rows = (r, next = null) => [200, { rows: r, next }];

async function page(table) {
  const p = open(["hq.js", "shell.js", "finance-common.js", "subscribers.js"], { ids: IDS, pathname: "/subscribers/", answers: (call) => {
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
const cells = (p, n = 0) => p.node["s-body"].children[n].children.map((td) => td.textContent);

test("the page asks who is signed in, then lists all subscribers, mapped for display", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: rows([row(), row({ site_id: "site_b", business_name: "Sample Store B", plan: null, state: null, trial_ends_at: null, next_due_at: null, site_address: "", owner_email: "" })]) });
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url.slice(BASE.length + 1)), ["GET me/", LIST]);
  assert.deepEqual(p.calls[1].body, { filter: "all" });
  assert.deepEqual(p.shown(), ["v-list"]);
  assert.equal(p.node["acct-name"].textContent, "sample.staff");
  assert.deepEqual(cells(p, 0), ["Sample Store Asample-a.example.test", "Monthly", "Active", "Dec 5, 2026", "owner.a@example.com", "Oct 1, 2026", "Open"]);
  assert.deepEqual(cells(p, 1), ["Sample Store B", "—", "—", "—", "—", "Oct 1, 2026", "Open"]);
  assert.equal(p.node["s-card"].hidden, false);
  assert.equal(p.node["s-more-row"].hidden, true);
});

test("each tab asks for its filter; a search adds q; the tab keeps the search", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: rows([row()]) });
  for (const t of ["trial_ending", "unpaid", "suspended_ended"]) {
    p.node["tab-" + t].fire("click");
    await settle();
    assert.equal(p.calls.at(-1).body.filter, t);
    assert.equal(p.node["tab-" + t].getAttribute("aria-pressed"), "true");
    assert.equal(p.node["tab-all"].getAttribute("aria-pressed"), "false");
  }
  p.node["s-q"].value = "  sample  ";
  p.node["s-form"].fire("submit");
  await settle();
  assert.deepEqual(p.calls.at(-1).body, { filter: "suspended_ended", q: "sample" });
  p.node["tab-all"].fire("click");
  await settle();
  assert.deepEqual(p.calls.at(-1).body, { filter: "all", q: "sample" });
});

test("an empty list says so; Load more sends the cursor and adds rows; a failed Load more keeps the rows", async () => {
  const empty = await page({ "GET me/": [200, ME], [LIST]: rows([]) });
  assert.equal(empty.node["s-empty"].hidden, false);
  assert.equal(empty.node["s-card"].hidden, true);

  let n = 0;
  const p = await page({ "GET me/": [200, ME], [LIST]: () => (++n === 1 ? rows([row()], "site_a") : n === 2 ? [503] : rows([row({ site_id: "site_c", business_name: "Sample Store C" })])) });
  assert.equal(p.node["s-more-row"].hidden, false);
  p.node["s-more"].fire("click");
  await settle();
  assert.deepEqual(p.calls.at(-1).body, { filter: "all", cursor: "site_a" });
  assert.equal(p.node["s-body"].children.length, 1);
  assert.equal(p.node["s-err"].hidden, false);
  assert.deepEqual(p.shown(), ["v-list"]);
  p.node["s-more"].fire("click");
  await settle();
  assert.equal(p.node["s-body"].children.length, 2);
  assert.equal(p.node["s-more-row"].hidden, true);
  assert.equal(p.node["s-err"].hidden, true);
});

test("a 404 on the list shows the closed view; any other failure shows the down view and Try again retries", async () => {
  const closed = await page({ "GET me/": [200, ME], [LIST]: [404, { error: { code: "not_found" } }] });
  assert.deepEqual(closed.shown(), ["v-closed"]);
  let n = 0;
  const down = await page({ "GET me/": [200, ME], [LIST]: () => (++n === 1 ? [500] : rows([row()])) });
  assert.deepEqual(down.shown(), ["v-down"]);
  down.node.retry.fire("click");
  await settle();
  assert.deepEqual(down.shown(), ["v-list"]);
});

test("a signed-out answer sends the person to sign in", async () => {
  const p = await page({ "GET me/": [401, { error: { code: "unauthenticated", message: "x" } }] });
  assert.equal(p.location.replaced, "/sign-in/");
});

test("Open reads one subscriber: facts, and payments whose ids link to Finance as text", async () => {
  const detail = { ...row(), payments: [pay(), pay({ id: "btp_two", status: "rejected", amount_received_centavos: null, decided_at: null })] };
  const p = await page({ "GET me/": [200, ME], [LIST]: rows([row()]), [DETAIL]: [200, detail] });
  p.node["s-body"].children[0].all((x) => x.tagName === "BUTTON")[0].fire("click");
  await settle();
  assert.deepEqual(p.sent(DETAIL).map((c) => c.body), [{ site_id: "site_a" }]);
  assert.deepEqual(p.shown(), ["v-detail"]);
  assert.equal(p.node["d-body"].hidden, false);
  assert.equal(p.node["d-name"].textContent, "Sample Store A");
  assert.equal(p.node["d-state"].textContent, "Active");
  assert.equal(p.node["d-site-id"].textContent, "site_a");
  assert.match(p.node["d-facts"].textContent, /Last payment—/);
  assert.equal(p.node["d-pays"].children.length, 2);
  const links = p.node["d-pays"].all((x) => x.tagName === "A");
  assert.deepEqual(links.map((a) => [a.getAttribute("href"), a.textContent]), [["/finance/", "btp_one"], ["/finance/", "btp_two"]]);
  assert.match(p.node["d-pays"].children[0].textContent, /PHP 999\.00/);
  assert.equal(p.node["d-pay-empty"].hidden, true);
  p.node.back.fire("click");
  assert.deepEqual(p.shown(), ["v-list"]);
});

test("a subscriber with no payments says so; a 404 returns to the list; a failure offers Try again", async () => {
  let mode = "none";
  const p = await page({ "GET me/": [200, ME], [LIST]: rows([row()]), [DETAIL]: () => (mode === "none" ? [200, { ...row(), payments: [] }] : mode === "gone" ? [404] : [500]) });
  const open1 = () => p.node["s-body"].children[0].all((x) => x.tagName === "BUTTON")[0].fire("click");
  open1(); await settle();
  assert.equal(p.node["d-pay-empty"].hidden, false);
  p.node.back.fire("click");
  mode = "fail"; open1(); await settle();
  assert.equal(p.node["d-err"].hidden, false);
  assert.equal(p.node["d-body"].hidden, true);
  mode = "none"; p.node["d-retry"].fire("click"); await settle();
  assert.equal(p.node["d-err"].hidden, true);
  assert.equal(p.node["d-body"].hidden, false);
  p.node.back.fire("click");
  mode = "gone"; open1(); await settle();
  assert.deepEqual(p.shown(), ["v-list"]);
});

test("a stale answer is dropped: a slow list does not overwrite a newer tab", async () => {
  const waiting = [];
  const p = await page({ "GET me/": [200, ME], [LIST]: (c) => (c.body.filter === "all" && waiting.length === 0 && !c.body.q ? rows([row()]) : rows([row({ site_id: "z", business_name: "Newest" })])) });
  p.node["tab-unpaid"].fire("click");
  p.node["tab-trial_ending"].fire("click");
  await settle();
  assert.equal(p.node["s-body"].children.length, 1);
  assert.equal(p.node["tab-trial_ending"].getAttribute("aria-pressed"), "true");
});

test("data is only ever text: markup in a value stays text, and the script never uses innerHTML", async () => {
  const evil = '<img src=x onerror="alert(1)">';
  const p = await page({ "GET me/": [200, ME], [LIST]: rows([row({ business_name: evil, owner_email: evil })]), [DETAIL]: [200, { ...row({ business_name: evil }), payments: [pay({ id: evil })] }] });
  assert.match(p.node["s-body"].children[0].children[0].textContent, /^<img/);
  assert.equal(p.node["s-body"].all((x) => x.tagName === "IMG").length, 0);
  p.node["s-body"].children[0].all((x) => x.tagName === "BUTTON")[0].fire("click");
  await settle();
  assert.equal(p.node["d-name"].textContent, evil);
  assert.equal(p.node["d-pays"].all((x) => x.tagName === "IMG").length, 0);
  const src = fs.readFileSync(new URL("../public/assets/js/subscribers.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test("the page and the address are wired: rewrite, redirect, scripts and the menu version", () => {
  const cfg = fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(cfg, /source: "\/subscribers\/", destination: "\/subscribers\.html"/);
  assert.match(cfg, /source: "\/subscribers\.html", destination: "\/subscribers\/"/);
  const html = fs.readFileSync(new URL("../public/subscribers.html", import.meta.url), "utf8");
  assert.match(html, /subscribers\.js\?v=\d+[a-z]/);
});

test("the menu draws Subscribers only after subscribers/list/ answers 200, after Contacts and before Settings", async () => {
  const run = async (reply, pathname = "/") => {
    const p = open(["hq.js", "menu.js"], { ids: ["side-nav"], pathname, answers: (c) => (c.url.endsWith("/subscribers/list/") ? reply : [404]) });
    await settle();
    return p;
  };
  const on = await run([200, { rows: [], next: null }], "/subscribers/");
  assert.deepEqual(on.node["side-nav"].children.map((a) => a.textContent), ["Admin console", "Finance", "Lifecycle", "Subscribers", "Settings"]);
  assert.equal(on.node["side-nav"].children[3].getAttribute("aria-current"), "page");
  assert.deepEqual(on.calls.filter((c) => c.url.endsWith("/subscribers/list/")).map((c) => c.body), [{ filter: "all" }]);
  for (const reply of [[404], [503], [401, { error: { code: "unauthenticated", message: "x" } }]]) {
    const off = await run(reply);
    assert.deepEqual(off.node["side-nav"].children.map((a) => a.textContent), ["Admin console", "Finance", "Lifecycle", "Settings"]);
  }
});

test("a trial end shows only while the state is trial_active, in Next due and in the detail", async () => {
  const trial = row({ state: "trial_active", next_due_at: null, trial_ends_at: "2026-11-25T00:00:00+08:00" });
  const p = await page({ "GET me/": [200, ME], [LIST]: rows([trial, row({ site_id: "s2", state: "suspended", next_due_at: null, trial_ends_at: "2026-11-25T00:00:00+08:00" })]),
    [DETAIL]: [200, { ...row({ state: "suspended", trial_ends_at: "2026-11-25T00:00:00+08:00" }), payments: [pay()] }] });
  assert.equal(cells(p, 0)[3], "Nov 25, 2026");
  assert.equal(cells(p, 1)[3], "\u2014");
  p.node["s-body"].children[1].all((x) => x.tagName === "BUTTON")[0].fire("click");
  await settle();
  assert.match(p.node["d-facts"].textContent, /Trial ends\u2014/);
  const sub = p.node["d-pays"].children[0].children.map((n) => n.tagName);
  assert.ok(sub.every((t) => t === "DIV"), "payment lines are blocks, not run together");
});

test("a long email and site address get break points after the at sign and before each dot, and the text is unchanged", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: rows([row({ owner_email: "owner.trial@example.test", site_address: "preview-trial.negosyotest.com" })]) });
  const tr = p.node["s-body"].children[0];
  assert.equal(cells(p, 0)[4], "owner.trial@example.test");
  assert.equal(cells(p, 0)[0], "Sample Store Apreview-trial.negosyotest.com");
  assert.equal(tr.all((x) => x.tagName === "WBR").length, 3 + 2);
  assert.equal(tr.children[4].getAttribute("class"), "sub-wrap");
  assert.equal(tr.children[4].children.length, 1, "one wrapper span in the cell");
});
