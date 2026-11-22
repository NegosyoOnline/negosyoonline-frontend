/* domains.js: the Domains page (ClickUp z8uq9mhgvh, design z8uq9mcyu0). The page decides nothing: the backend does. These tests
   drive it with fixture answers only, through the five staff routes under domains/. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE } from "./page.mjs";

const HTML = fs.readFileSync(new URL("../public/domains.html", import.meta.url), "utf8");
const IDS = [...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const VIEWS = ["boot", "v-main", "v-closed", "v-down"];
const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
const R = (name) => "POST domains/" + name + "/";
const LIST = R("list"), RETRY = R("retry"), DISCONNECT = R("disconnect"), CANCEL = R("cancel-request"), CONFIRM = R("confirmed-registered");

const claim = (over = {}) => ({ claim: "dom_a", site: "site_a", name: "shop.example.test", state: "live", reason: "", state_changed_at: "2026-11-20T09:00:00+08:00",
  registration: "succeeded", registration_name: "shop.example.test", email_state: "email_none", confirm: null, ...over });
const list = (claims, over = {}) => [200, { claims, eligible_sites: ["site_a", "site_z"],
  counters: { purchases_24h: 1, spend_24h_cents: 1234, purchase_cap: 3, spend_cap_cents: 5000, purchase_enabled: false }, ...over }];
const REFUSAL = (code, message, status = 409) => [status, { error: { code, message, fields: {} } }];

async function page(table) {
  const p = open(["hq.js", "shell.js", "finance-common.js", "domains.js"], { ids: IDS, pathname: "/domains/", answers: (call) => {
    const key = call.method + " " + call.url.slice(BASE.length + 1);
    const reply = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    assert.ok(reply !== undefined, "unexpected call: " + key);
    return typeof reply === "function" ? reply(call) : reply;
  } });
  for (const id of IDS) {
    const tag = new RegExp(`<[^>]*\\sid="${id}"[^>]*>`).exec(HTML)[0];
    p.node[id].hidden = /\shidden(\s|>|=)/.test(tag);
  }
  await settle();
  const keyOf = (c) => c.method + " " + c.url.slice(BASE.length + 1);
  return { ...p, shown: () => VIEWS.filter((id) => !p.node[id].hidden), keys: () => p.calls.map(keyOf), sent: (key) => p.calls.filter((c) => keyOf(c) === key) };
}
const base = (claims, over = {}) => ({ "GET me/": [200, ME], [LIST]: list(claims), ...over });
const buttons = (n, text) => n.all((x) => x.tagName === "BUTTON" && x.textContent === text);
const rows = (p) => p.node["d-rows"].children;
const chips = (tr) => tr.all((n) => n.classList.contains("chip")).map((n) => n.textContent);

test("a list that answers 404 shows 'Domains is not available' and nothing else, no controls", async () => {
  const p = await page({ "GET me/": [200, ME], [LIST]: [404, { error: { code: "not_found", message: "Not found." } }] });
  assert.deepEqual(p.shown(), ["v-closed"]);
  assert.match(HTML, /<h2 id="h-closed">Domains is not available\.<\/h2>/);
  assert.equal(p.keys().length, 2);
});

test("a server fault or no answer shows the could-not-be-reached card, and Try again reads the list again", async () => {
  let n = 0;
  const p = await page({ "GET me/": [200, ME], [LIST]: () => (++n === 1 ? [500, {}] : list([claim()])) });
  assert.deepEqual(p.shown(), ["v-down"]);
  p.node.retry.click();
  await settle();
  assert.deepEqual(p.shown(), ["v-main"]);
  const off = await page({ "GET me/": [200, ME], [LIST]: "offline" });
  assert.deepEqual(off.shown(), ["v-down"]);
});

test("the list shows site, claim, domain, state, registration, last change and the last confirm request, and no price", async () => {
  const p = await page(base([
    claim(),
    claim({ claim: "dom_b", site: "site_b", name: "b.example.test", state: "conflict", registration: "conflict", registration_name: "b.example.test",
      confirm: { state: "refused", reason: "not_in_our_account", at: "2026-11-21T10:00:00+08:00" } }),
  ]));
  assert.deepEqual(p.shown(), ["v-main"]);
  assert.equal(rows(p).length, 2);
  const first = rows(p)[0].textContent;
  assert.match(first, /site_a/); assert.match(first, /dom_a/); assert.match(first, /shop\.example\.test/);
  assert.deepEqual(chips(rows(p)[0]), ["Live", "Registered"]);
  assert.match(first, /Nov 20, 9:00 AM/);
  assert.doesNotMatch(first, /2026/);
  assert.deepEqual(chips(rows(p)[1]), ["Conflict", "Conflict", "Refused"]);
  assert.match(rows(p)[1].textContent, /The name is not in our registrar account\./);
  assert.doesNotMatch(rows(p)[1].textContent, /not_in_our_account/);
  assert.match(p.node["d-facts"].textContent, /Purchases in the last 24 hours: 1 of 3/);
  assert.match(p.node["d-facts"].textContent, /Buying is switched off/);
  assert.doesNotMatch(p.node["v-main"].textContent, /1,?234|12\.34|5,?000|PHP|\$|spend/i);
  assert.equal(p.node["d-elig-card"].hidden, false);
  assert.equal(p.node["d-elig"].children.length, 2);
  assert.equal(p.node["d-elig"].textContent, "site_asite_z");
});

test("a state or registration with no words is a fallback, never the raw code", async () => {
  const p = await page(base([claim({ state: "mystery_state", registration: "odd" })]));
  assert.deepEqual(chips(rows(p)[0]), ["A state this page has no words for", "A state this page has no words for"]);
  assert.doesNotMatch(p.node["d-rows"].textContent, /mystery_state|odd/);
});

test("a backend text is set as text, never as markup", async () => {
  const p = await page(base([claim({ reason: "<img src=x onerror=alert(1)>" })]));
  const td = rows(p)[0].children[2];
  assert.equal(td.all((n) => n.tagName === "IMG").length, 0);
  assert.match(td.textContent, /<img src=x/);
});

test("each action is drawn only where it can apply", async () => {
  const p = await page(base([
    claim({ claim: "d1", state: "live" }),
    claim({ claim: "d2", state: "failed" }),
    claim({ claim: "d3", state: "confirmed", registration: "intent" }),
    claim({ claim: "d4", state: "conflict", registration: "conflict" }),
    claim({ claim: "d5", state: "conflict", registration: "conflict", confirm: { state: "pending", reason: "", at: "2026-11-21T10:00:00+08:00" } }),
    claim({ claim: "d6", state: "ended", registration: "" }),
    claim({ claim: "d7", state: "removal_pending" }),
  ]));
  const names = (i) => rows(p)[i].all((n) => n.tagName === "BUTTON").map((b) => b.textContent);
  assert.deepEqual(names(0), ["Disconnect"]);
  assert.deepEqual(names(1), ["Retry", "Disconnect"]);
  assert.deepEqual(names(2), ["Cancel request", "Disconnect"]);
  assert.deepEqual(names(3), ["Confirmed registered", "Disconnect"]);
  assert.deepEqual(names(4), ["Disconnect"]);
  assert.deepEqual(names(5), []);
  assert.deepEqual(names(6), []);
  assert.deepEqual(chips(rows(p)[4]), ["Conflict", "Conflict", "Requested, waiting"]);
});

test("every action opens a confirm dialog first, Cancel sends nothing, and the dialog opens on Cancel", async () => {
  const p = await page(base([claim({ state: "failed" })]));
  buttons(rows(p)[0], "Retry")[0].click();
  assert.equal(p.node["m-act"].hidden, false);
  assert.equal(p.node["m-act-h"].textContent, "Retry this claim");
  assert.match(p.node["m-act-sub"].textContent, /shop\.example\.test/);
  assert.equal(p.doc.activeElement, p.node["act-cancel"]);
  assert.equal(p.sent(RETRY).length, 0);
  p.node["act-cancel"].click();
  assert.equal(p.node["m-act"].hidden, true);
  assert.equal(p.sent(RETRY).length, 0);
});

test("the four actions post the claim's public id to their own route, close, say what happened and read the list again", async () => {
  const cases = [
    ["Retry", RETRY, claim({ state: "failed" }), /Retry started/],
    ["Disconnect", DISCONNECT, claim(), /Disconnect started/],
    ["Cancel request", CANCEL, claim({ state: "confirmed", registration: "intent" }), /Request cancelled/],
    ["Confirmed registered", CONFIRM, claim({ state: "conflict", registration: "conflict" }), /Requested\. The registrar is read in the background/],
  ];
  for (const [text, route, row, said] of cases) {
    const answer = route === CONFIRM ? [202, { claim: "dom_a", status: "requested" }] : [200, { claim: "dom_a", state: "x" }];
    const p = await page(base([row], { [route]: answer }));
    buttons(rows(p)[0], text)[0].click();
    p.node["act-go"].click();
    await settle();
    assert.deepEqual(p.sent(route).map((c) => c.body), [{ claim: "dom_a" }], text);
    assert.equal(p.node["m-act"].hidden, true, text);
    assert.match(p.node["d-msg"].textContent, said, text);
    assert.equal(p.sent(LIST).length, 2, text);
  }
});

test("a second 'confirmed registered' while one waits says so", async () => {
  const p = await page(base([claim({ state: "conflict", registration: "conflict" })], { [CONFIRM]: [202, { claim: "dom_a", status: "pending" }] }));
  buttons(rows(p)[0], "Confirmed registered")[0].click();
  p.node["act-go"].click();
  await settle();
  assert.match(p.node["d-msg"].textContent, /already waiting/);
});

test("after 'requested', the result is read from the list: waiting, then confirmed or the refusal", async () => {
  let phase = 0;
  const answer = () => list([claim({ state: "conflict", registration: "conflict", confirm: phase === 0 ? null : phase === 1
    ? { state: "pending", reason: "", at: "2026-11-21T10:00:00+08:00" } : phase === 2
    ? { state: "refused", reason: "status_in_progress", at: "2026-11-21T10:01:00+08:00" } : { state: "done", reason: "", at: "2026-11-21T10:02:00+08:00" } })]);
  const p = await page({ "GET me/": [200, ME], [LIST]: answer, [CONFIRM]: () => { phase = 1; return [202, { claim: "dom_a", status: "requested" }]; } });
  buttons(rows(p)[0], "Confirmed registered")[0].click();
  p.node["act-go"].click();
  await settle();
  assert.deepEqual(chips(rows(p)[0]), ["Conflict", "Conflict", "Requested, waiting"]);
  assert.equal(buttons(rows(p)[0], "Confirmed registered").length, 0);
  phase = 2;
  p.node["d-refresh"].click();
  await settle();
  assert.deepEqual(chips(rows(p)[0]), ["Conflict", "Conflict", "Refused"]);
  assert.match(rows(p)[0].textContent, /The provider shows the registration as in progress\./);
  assert.equal(buttons(rows(p)[0], "Confirmed registered").length, 1);
  phase = 3;
  p.node["d-refresh"].click();
  await settle();
  assert.deepEqual(chips(rows(p)[0]), ["Conflict", "Conflict", "Confirmed"]);
});

test("a refusal shows the API's own message in the dialog, which stays open; a server fault gets the plain line", async () => {
  const p = await page(base([claim({ state: "failed" })], { [RETRY]: REFUSAL("nothing_to_retry", "Only a failed claim can be retried.") }));
  buttons(rows(p)[0], "Retry")[0].click();
  p.node["act-go"].click();
  await settle();
  assert.equal(p.node["m-act"].hidden, false);
  assert.equal(p.node["act-e"].hidden, false);
  assert.equal(p.node["act-e"].textContent, "Only a failed claim can be retried.");
  assert.equal(p.node["act-go"].disabled, false);
  assert.equal(p.sent(LIST).length, 1);
  const q = await page(base([claim()], { [DISCONNECT]: [500, {}] }));
  buttons(rows(q)[0], "Disconnect")[0].click();
  q.node["act-go"].click();
  await settle();
  assert.match(q.node["act-e"].textContent, /did not go through/);
  const off = await page(base([claim()], { [DISCONNECT]: "offline" }));
  buttons(rows(off)[0], "Disconnect")[0].click();
  off.node["act-go"].click();
  await settle();
  assert.match(off.node["act-e"].textContent, /did not go through/);
});

test("the cancel and confirm refusals are shown as the API wrote them", async () => {
  const c = await page(base([claim({ state: "confirmed", registration: "intent" })], { [CANCEL]: REFUSAL("not_cancellable", "Only a request that was never sent can be cancelled.") }));
  buttons(rows(c)[0], "Cancel request")[0].click();
  c.node["act-go"].click();
  await settle();
  assert.equal(c.node["act-e"].textContent, "Only a request that was never sent can be cancelled.");
  const r = await page(base([claim({ state: "conflict", registration: "conflict" })], { [CONFIRM]: REFUSAL("confirm_refused", "Only a registration in conflict can be confirmed.") }));
  buttons(rows(r)[0], "Confirmed registered")[0].click();
  r.node["act-go"].click();
  await settle();
  assert.equal(r.node["act-e"].textContent, "Only a registration in conflict can be confirmed.");
});

test("an action answered 404 (switched off meanwhile) closes the dialog and the list shows 'not available'", async () => {
  let n = 0;
  const p = await page({ "GET me/": [200, ME], [LIST]: () => (++n === 1 ? list([claim()]) : [404, {}]), [DISCONNECT]: [404, {}] });
  buttons(rows(p)[0], "Disconnect")[0].click();
  p.node["act-go"].click();
  await settle();
  assert.equal(p.node["m-act"].hidden, true);
  assert.deepEqual(p.shown(), ["v-closed"]);
});

test("no second submit while an action is on its way, and Escape closes nothing then", async () => {
  const p = await page(base([claim()], { [DISCONNECT]: () => "offline" }));
  buttons(rows(p)[0], "Disconnect")[0].click();
  p.node["act-go"].click();
  p.node["act-go"].click();
  await settle();
  assert.equal(p.sent(DISCONNECT).length, 1);
});

test("the state filter is the house dropdown, not a native select, and filters the rows", async () => {
  const p = await page(base([claim(), claim({ claim: "dom_b", site: "site_b", state: "failed" })]));
  const wrap = p.node["d-state"].parentNode;
  assert.ok(wrap.classList.contains("fin-combo"));
  assert.equal(p.node["d-state"].getAttribute("class"), "fin-combo-native");
  const input = wrap.all((n) => n.classList.contains("fin-combo-input"))[0];
  assert.equal(input.getAttribute("role"), "combobox");
  assert.equal(input.value, "All states");
  assert.equal(rows(p).length, 2);
  wrap.all((n) => n.classList.contains("fin-combo-box"))[0].click();
  const panel = wrap.all((n) => n.classList.contains("fin-combo-panel"))[0];
  const opt = (text) => panel.children.find((n) => n.textContent === text);
  assert.ok(opt("Failed") && opt("Live") && opt("All states"));
  opt("Failed").click();
  assert.equal(rows(p).length, 1);
  assert.match(rows(p)[0].textContent, /site_b/);
  assert.equal(input.value, "Failed");
  wrap.all((n) => n.classList.contains("fin-combo-box"))[0].click();
  panel.children.find((n) => n.textContent === "Ended").click();
  assert.equal(rows(p).length, 0);
  assert.equal(p.node["d-empty"].hidden, false);
  assert.match(p.node["d-empty"].textContent, /No claim is in that state/);
  wrap.all((n) => n.classList.contains("fin-combo-box"))[0].click();
  panel.children.find((n) => n.textContent === "All states").click();
  assert.equal(rows(p).length, 2);
});

test("with no claims the page says so and shows no table", async () => {
  const p = await page(base([], { [LIST]: list([], { eligible_sites: [] }) }));
  assert.equal(p.node["d-wrap"].hidden, true);
  assert.equal(p.node["d-empty"].hidden, false);
  assert.equal(p.node["d-elig-card"].hidden, true);
});

test("it asks me/ first and sends the signed-out to sign in", async () => {
  const p = await page({ "GET me/": [401, { error: { code: "unauthenticated", message: "x" } }] });
  assert.equal(p.location.replaced, "/sign-in/");
  assert.deepEqual(p.keys(), ["GET me/"]);
});

test("every call is a POST under domains/ (or me/), with the claim id in the body and nothing in the address", async () => {
  const p = await page(base([claim({ state: "failed" })], { [RETRY]: [200, { claim: "dom_a", state: "zone" }] }));
  buttons(rows(p)[0], "Retry")[0].click();
  p.node["act-go"].click();
  await settle();
  for (const c of p.calls) {
    assert.ok(c.url === BASE + "/me/" || c.url.startsWith(BASE + "/domains/"), c.url);
    assert.ok(!c.url.includes("?"), c.url);
  }
});

test("a code as a claim reason is spaced out as words; a sentence is left as written; a confirm code with no words is spaced out too", async () => {
  const p = await page(base([
    claim({ reason: "operator_disconnect" }),
    claim({ claim: "d2", reason: "The registrar answered action required." }),
    claim({ claim: "d3", state: "conflict", registration: "conflict", confirm: { state: "refused", reason: "read_failed_timeout", at: "2026-11-21T10:00:00+08:00" } }),
    claim({ claim: "d4", state: "conflict", registration: "conflict", confirm: { state: "refused", reason: "some_new_code", at: "2026-11-21T10:00:00+08:00" } }),
  ]));
  assert.match(rows(p)[0].textContent, /Operator disconnect/);
  assert.doesNotMatch(rows(p)[0].textContent, /operator_disconnect/);
  assert.match(rows(p)[1].textContent, /The registrar answered action required\./);
  assert.match(rows(p)[2].textContent, /The provider could not be read\./);
  assert.match(rows(p)[3].textContent, /Some new code/);
});

test("the store's name is the main line with the site id small under it; the id stands in when there is no name", async () => {
  const p = await page(base([claim({ store_name: "Nena's Wellness" }), claim({ claim: "dom_b", site: "site_b" })],
    { [LIST]: list([claim({ store_name: "Nena's Wellness" }), claim({ claim: "dom_b", site: "site_b" })], { eligible_sites: [{ site: "site_a", name: "Nena's Wellness" }, { site: "site_q", name: "" }] }) }));
  const cell0 = rows(p)[0].children[0];
  assert.equal(cell0.all((n) => n.classList.contains("lc-id"))[0].textContent, "Nena's Wellness");
  assert.match(cell0.all((n) => n.tagName === "SMALL")[0].textContent, /site_a/);
  assert.equal(rows(p)[1].children[0].all((n) => n.classList.contains("lc-id"))[0].textContent, "site_b");
  const items = p.node["d-elig"].children;
  assert.equal(items[0].textContent, "Nena's Wellnesssite_a");
  assert.equal(items[1].textContent, "site_q");
});
