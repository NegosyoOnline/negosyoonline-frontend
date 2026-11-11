/* contacts.js, the groups (plan 7, task 4). */
import test from "node:test";
import assert from "node:assert/strict";
import { settle } from "./page.mjs";
import { page, R, group, err, byText, buttons } from "./contacts-page.mjs";

const g = (opts) => page({}, { pathname: "/contacts/groups/", ...opts });

test("the list shows names and counts, singular for 1, and the Groups tab is current", async () => {
  const p = await g();
  assert.deepEqual(p.inner(), ["v-groups"]);
  assert.equal(p.node["seg-groups"].getAttribute("aria-current"), "true");
  assert.equal(p.node["list-actions"].hidden, true);
  assert.deepEqual(p.node["g-rows"].children.map((li) => li.children[0].textContent), ["Launch list A2 contacts", "Launch list B1 contact", "Resellers0 contacts"]);
  assert.equal(p.sent(R.list).length, 0);
});

test("Add posts the name and puts the answer in the list; the sentence for a name that exists", async () => {
  const p = await g();
  p.table[R.ga] = [201, group("n", "Aaa", 0)];
  p.node["g-name"].value = "Aaa";
  p.node["g-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(R.ga)[0].body, { name: "Aaa" });
  assert.equal(p.node["g-name"].value, "");
  assert.equal(p.node["g-rows"].children[0].children[0].children[0].textContent, "Aaa");
  p.table[R.ga] = [409, err("already_exists", "x", { group: "grp_a" })];
  p.node["g-name"].value = "launch list a";
  p.node["g-form"].fire("submit");
  await settle();
  assert.equal(p.node["g-err"].textContent, "A group with that name already exists.");
});

test("Rename turns the row into a field; Save posts the id from memory; Escape and the X post nothing", async () => {
  const p = await g();
  const row = () => p.node["g-rows"].children[0];
  byText(row(), "Rename").fire("click");
  const input = row().all((n) => n.tagName === "INPUT")[0];
  assert.equal(input.value, "Launch list A");
  input.fire("keydown", { key: "Escape" });
  assert.ok(byText(row(), "Rename"));
  byText(row(), "Rename").fire("click");
  row().all((n) => n.tagName === "BUTTON" && n.getAttribute("aria-label") === "Close")[0].fire("click");
  assert.equal(p.sent(R.gr).length, 0);
  byText(row(), "Rename").fire("click");
  const field = row().all((n) => n.tagName === "INPUT")[0];
  field.value = "Zulu";
  p.table[R.gr] = [200, group("a", "Zulu", 2)];
  row().all((n) => n.tagName === "FORM")[0].fire("submit");
  await settle();
  assert.deepEqual(p.sent(R.gr)[0].body, { group: "grp_a", name: "Zulu" });
  assert.deepEqual(p.node["g-rows"].children.map((li) => li.children[0].children[0].textContent), ["Launch list B", "Resellers", "Zulu"]);
});

test("Remove asks once; the X and Escape post nothing; there is no Cancel; the button posts the id and 204 removes the row", async () => {
  const p = await g();
  byText(p.node["g-rows"].children[0], "Remove").fire("click");
  assert.equal(p.node["pop-h"].textContent, "Remove this group?");
  assert.equal(p.node["pop-sub"].textContent, "Its 2 contacts stay in Contacts.");
  assert.equal(p.node["pop-go"].textContent, "Remove group");
  assert.equal(buttons(p.node["m-pop"]).some((b) => /cancel/i.test(b.textContent)), false);
  p.node["pop-x"].fire("click");
  byText(p.node["g-rows"].children[0], "Remove").fire("click");
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(p.sent(R.gx).length, 0);
  assert.equal(p.node["m-pop"].hidden, true);
  byText(p.node["g-rows"].children[1], "Remove").fire("click");
  assert.equal(p.node["pop-sub"].textContent, "Its 1 contact stays in Contacts.");
  p.table[R.gx] = [204];
  p.node["pop-go"].fire("click");
  await settle();
  assert.deepEqual(p.sent(R.gx)[0].body, { group: "grp_b" });
  assert.equal(p.node["g-rows"].children.length, 2);
  assert.equal(p.node["m-pop"].hidden, true);
});

test("read-only shows the groups with no Add, Rename or Remove", async () => {
  const p = await g({ change: false });
  assert.equal(p.node["g-form"].hidden, true);
  assert.equal(byText(p.node["g-rows"].children[0], "Rename"), undefined);
  assert.equal(byText(p.node["g-rows"].children[0], "Remove"), undefined);
  p.node["g-form"].fire("submit");
  await settle();
  assert.equal(p.sent(R.ga).length, 0);
});

test("a name holding markup appears as text; group_limit shows its message", async () => {
  const p = await g({ groups: [group("x", "<b>Hi</b>", 0)] });
  assert.equal(p.node["g-rows"].children[0].children[0].children[0].textContent, "<b>Hi</b>");
  assert.equal(p.node["g-rows"].all((n) => n.tagName === "B").length, 0);
  p.table[R.ga] = [400, err("group_limit", "There are as many groups as there can be.")];
  p.node["g-name"].value = "x";
  p.node["g-form"].fire("submit");
  await settle();
  assert.equal(p.node["g-err"].textContent, "There are as many groups as there can be.");
});
