/* contacts.js, the list and Find (plan 7, tasks 2 and 3 are in this file and in contacts-form.test.mjs). The page
   follows the backend's answers and decides nothing about access. */
import test from "node:test";
import assert from "node:assert/strict";
import { settle } from "./page.mjs";
import { page, R, ME, GROUPS, ANA, BEN, DINO, err, rowsText, byText, buttons, everything } from "./contacts-page.mjs";

const rows = (items, next = null) => [200, { results: items, next }];

test("boot: who is signed in, then the status, then the groups, then the list", async () => {
  const p = await page({ [R.list]: rows([ANA]) });
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url.split("/staff/v1/")[1]), ["GET me/", "POST contacts/status/", "POST contacts/groups/list/", "POST contacts/list/"]);
  assert.deepEqual(p.shown(), ["v-page"]);
  assert.deepEqual(p.inner(), ["v-list"]);
  assert.equal(p.node["acct-name"].textContent, "sample.staff");
  assert.equal(p.node.title.textContent, "Contacts");
  assert.equal(p.node["seg-contacts"].getAttribute("aria-current"), "true");
});

test("boot: a 401 goes to the sign-in or second step; a 404 shows the closed card; anything else the down card", async () => {
  const gone = await page({ [R.me]: [401, err("unauthenticated")] });
  assert.equal(gone.location.replaced, "/sign-in/");
  const step = await page({ [R.me]: [401, err("second_step_required")] });
  assert.equal(step.location.replaced, "/verify/");
  const closed = await page({ [R.status]: [404, err("not_found")] });
  assert.deepEqual(closed.shown(), ["v-closed"]);
  assert.equal(closed.sent(R.gl).length, 0);
  const off = await page({ [R.status]: "offline" });
  assert.deepEqual(off.shown(), ["v-down"]);
  const odd = await page({ [R.status]: [503] });
  assert.deepEqual(odd.shown(), ["v-down"]);
  const noGroups = await page({ [R.gl]: [500] });
  assert.deepEqual(noGroups.shown(), ["v-down"]);
});

test("the down card's button tries again", async () => {
  let up = false;
  const p = await page({ [R.status]: () => (up ? [200, { read: true, change: true }] : [503]), [R.list]: rows([ANA]) });
  assert.deepEqual(p.shown(), ["v-down"]);
  up = true;
  p.node.retry.fire("click");
  await settle();
  assert.deepEqual(p.shown(), ["v-page"]);
});

test("Add contact and Upload a CSV file only with change", async () => {
  const yes = await page({ [R.list]: rows([ANA]) });
  assert.equal(yes.node["list-actions"].hidden, false);
  const no = await page({ [R.list]: rows([ANA]) }, { change: false });
  assert.equal(no.node["list-actions"].hidden, true);
});

test("the filter holds All groups and one option per group; choosing one posts {group}", async () => {
  const p = await page({ [R.list]: rows([ANA]) });
  const opts = p.node["find-group"].children;
  assert.deepEqual(opts.map((o) => [o.getAttribute("value"), o.textContent]), [["", "All groups"], ["grp_a", "Launch list A"], ["grp_b", "Launch list B"], ["grp_r", "Resellers"]]);
  p.node["find-group"].value = "grp_b";
  p.node["find-group"].fire("change");
  await settle();
  assert.deepEqual(p.sent(R.list).at(-1).body, { group: "grp_b" });
});

test("rows show the name, the masked number and a chip per group, or No group; the page never asks for a full number", async () => {
  const p = await page({ [R.list]: rows([ANA, BEN, DINO]) });
  assert.equal(rowsText(p).length, 3);
  const first = p.node.rows.children[0];
  assert.match(first.textContent, /Ana Sample/);
  assert.match(first.textContent, /\+63 900 ••• 0101/);
  assert.equal(first.all((n) => n.classList.contains("chip-neutral")).length, 1);
  assert.equal(p.node.rows.children[1].all((n) => n.classList.contains("chip-neutral")).length, 2);
  assert.match(p.node.rows.children[2].textContent, /No group/);
  assert.equal(p.sent(R.open).length, 0);
  assert.equal(p.node["l-count"].textContent, "Showing 3 contacts. Numbers are masked.");
  assert.equal(byText(first, "Edit").tagName, "BUTTON");
});

test("a read-only person sees View in place of Edit", async () => {
  const p = await page({ [R.list]: rows([ANA]) }, { change: false });
  assert.ok(byText(p.node.rows.children[0], "View"));
});

test("names and group names with markup or quotes appear as text only", async () => {
  const evil = { ...ANA, first_name: "<b>Ana</b>", last_name: '"Q" & <i>', groups: [{ id: "grp_x", name: "<img src=x onerror=1>" }] };
  const p = await page({ [R.list]: rows([evil]) });
  const li = p.node.rows.children[0];
  assert.match(li.textContent, /<b>Ana<\/b> "Q" & <i>/);
  assert.match(li.textContent, /<img src=x onerror=1>/);
  assert.equal(li.all((n) => ["B", "I", "IMG"].includes(n.tagName)).length, 0);
});

test("Load more passes the cursor, once per press, and adds to the list", async () => {
  let n = 0;
  const p = await page({ [R.list]: (c) => { n++; return c.body && c.body.cursor === "c1" ? rows([BEN], null) : rows([ANA], "c1"); } });
  assert.equal(p.node["more-row"].hidden, false);
  p.node.more.fire("click");
  await settle();
  assert.deepEqual(p.sent(R.list).map((c) => c.body), [{}, { cursor: "c1" }]);
  assert.equal(p.node.rows.children.length, 2);
  assert.equal(p.node["more-row"].hidden, true);
  assert.equal(p.node["l-count"].textContent, "Showing 2 contacts. Numbers are masked.");
});

test("an empty list says No contacts yet.", async () => {
  const p = await page({ [R.list]: rows([]) });
  assert.equal(p.node["l-empty"].hidden, false);
  assert.equal(p.node["l-empty"].textContent, "No contacts yet.");
});

test("Find posts {query}, clears the field, shows the match line, and Show all returns", async () => {
  const typed = "0911 000 0099";
  const p = await page({ [R.list]: (c) => (c.body.query ? rows([ANA]) : rows([ANA, BEN])) });
  p.node["find-q"].value = typed;
  p.node["find-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(R.list).at(-1).body, { query: typed });
  assert.equal(p.node["find-q"].value, "");
  assert.equal(p.node["find-note"].hidden, false);
  assert.equal(p.node.rows.children.length, 1);
  assert.equal(everything(p).includes(typed), false, "the typed query is in no element");
  assert.equal(p.logs.length, 0);
  p.node["show-all"].fire("click");
  await settle();
  assert.deepEqual(p.sent(R.list).at(-1).body, {});
  assert.equal(p.node["find-note"].hidden, true);
  assert.equal(p.node.rows.children.length, 2);
});

test("Find combined with a group, and Load more under a search, keep the query in memory only", async () => {
  const p = await page({ [R.list]: (c) => rows([ANA], c.body.cursor ? null : "c9") });
  p.node["find-q"].value = "Ana";
  p.node["find-form"].fire("submit");
  await settle();
  p.node["find-group"].value = "grp_a";
  p.node["find-group"].fire("change");
  await settle();
  assert.deepEqual(p.sent(R.list).at(-1).body, { query: "Ana", group: "grp_a" });
  p.node.more.fire("click");
  await settle();
  assert.deepEqual(p.sent(R.list).at(-1).body, { query: "Ana", group: "grp_a", cursor: "c9" });
});

test("a search with no answer says No contacts match.", async () => {
  const p = await page({ [R.list]: (c) => (c.body.query ? rows([]) : rows([ANA])) });
  p.node["find-q"].value = "Zed";
  p.node["find-form"].fire("submit");
  await settle();
  assert.equal(p.node["l-empty"].textContent, "No contacts match.");
});

test("a query of one character sends nothing", async () => {
  const p = await page({ [R.list]: rows([ANA]) });
  p.node["find-q"].value = "A";
  p.node["find-form"].fire("submit");
  await settle();
  assert.equal(p.sent(R.list).length, 1);
  assert.equal(p.node["find-err"].textContent, "Type at least 2 letters or a full number.");
  assert.equal(p.node["find-err"].hidden, false);
});

test("a failed list shows the fixed sentence, not the backend's", async () => {
  const p = await page({ [R.list]: [500, err("boom", "Secret detail.")] });
  assert.equal(everything(p).includes("Secret detail."), false);
  assert.deepEqual(p.shown(), ["v-down"]);
});

test("no timer or interval, no storage, no console, no address built from a value", async () => {
  const fs = await import("node:fs");
  const js = fs.readFileSync(new URL("../public/assets/js/contacts.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /setTimeout|setInterval|requestAnimationFrame/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie|console\./);
  for (const m of js.matchAll(/pushState\(([^)]*)\)/g)) assert.match(m[1], /^null, "", location\.pathname$/);
  for (const m of js.matchAll(/(?:href|location\.(?:assign|replace))[^;\n]*\+/g)) assert.fail("an address is built from a value: " + m[0]);
  for (const m of js.matchAll(/\.call\("POST", ("[^"]*")/g)) assert.match(m[1], /^"contacts\/[a-z/]+\/"$/);
});
