/* contacts.js, one contact: open, edit, add, delete (plan 7, task 3). The number is in the form field only. */
import test from "node:test";
import assert from "node:assert/strict";
import { settle } from "./page.mjs";
import { page, R, ANA, BEN, FULL, err, byText, buttons, everything } from "./contacts-page.mjs";

const list = (items) => [200, { results: items, next: null }];
const FULL_ANA = { ...ANA, mobile: FULL };
const edit = async (extra = {}, opts = {}) => {
  const p = await page({ [R.list]: list([ANA, BEN]), [R.open]: [200, FULL_ANA], ...extra }, opts);
  byText(p.node.rows.children[0], opts.change === false ? "View" : "Edit").fire("click");
  await settle();
  return p;
};
const save = async (p) => { p.node["c-form"].fire("submit"); await settle(); };

test("Edit posts open with the id from memory and fills the form, the full number in the field only", async () => {
  const p = await edit();
  assert.deepEqual(p.sent(R.open)[0].body, { contact: "cont_1" });
  assert.deepEqual(p.inner(), ["v-form"]);
  assert.equal(p.node.title.textContent, "Edit contact");
  assert.equal(p.node["c-first"].value, "Ana");
  assert.equal(p.node["c-last"].value, "Sample");
  assert.equal(p.node["c-num"].value, FULL);
  const boxes = p.node["c-groups"].all((n) => n.tagName === "INPUT");
  assert.deepEqual(boxes.map((b) => [b.getAttribute("value"), b.checked]), [["grp_a", true], ["grp_b", false], ["grp_r", false]]);
  assert.equal(p.node["c-recorded"].hidden, false);
  assert.equal(p.node["c-delete"].hidden, false);
  /* the number is in no address, title or console call, and in no element but the field */
  assert.equal(p.pushed.concat(p.replaced).some((u) => u.includes("0101") || u.includes("cont_")), false);
  assert.equal(everything(p).includes(FULL), false);
  assert.equal(p.logs.length, 0);
});

test("opening pushes one history state with the page's own address and no data; Back closes it, a reload shows the list", async () => {
  const p = await edit();
  assert.deepEqual(p.pushed, ["/contacts/"]);
  p.history.back();
  await settle();
  assert.deepEqual(p.inner(), ["v-list"]);
  const again = await page({ [R.list]: list([ANA]) });
  assert.deepEqual(again.inner(), ["v-list"]);
});

test("the page's Back link closes the form too", async () => {
  const p = await edit();
  const e = p.node.back.fire("click");
  await settle();
  assert.equal(e.prevented, true);
  assert.deepEqual(p.inner(), ["v-list"]);
});

test("saving posts edit with the contact and the checked groups, clears the number, removes the form, updates the row", async () => {
  const p = await edit({ [R.edit]: [200, { ...ANA, first_name: "Anna" }] });
  p.node["c-first"].value = "Anna";
  p.node["c-groups"].all((n) => n.tagName === "INPUT")[1].checked = true;
  await save(p);
  assert.deepEqual(p.sent(R.edit)[0].body, { contact: "cont_1", first_name: "Anna", last_name: "Sample", mobile: FULL, groups: ["grp_a", "grp_b"] });
  assert.equal(p.node["c-num"].value, "");
  assert.deepEqual(p.inner(), ["v-list"]);
  assert.equal(p.node.msg.textContent, "Contact saved.");
  assert.equal(everything(p).includes(FULL), false);
});

test("Add at /contacts/new/ posts add and returns to the list with its message", async () => {
  const p = await page({ [R.add]: [201, DINO_ADDED()], [R.list]: list([ANA]) }, { pathname: "/contacts/new/" });
  assert.deepEqual(p.inner(), ["v-form"]);
  assert.equal(p.node.title.textContent, "Add contact");
  assert.equal(p.node["c-recorded"].hidden, true);
  assert.equal(p.node["c-delete"].hidden, true);
  assert.equal(p.sent(R.open).length, 0);
  p.node["c-first"].value = "Dino";
  p.node["c-num"].value = "0900 000 0104";
  await save(p);
  assert.deepEqual(p.sent(R.add)[0].body, { first_name: "Dino", last_name: "", mobile: "0900 000 0104", groups: [] });
  assert.deepEqual(p.inner(), ["v-list"]);
  assert.equal(p.node.msg.textContent, "Contact added.");
  assert.deepEqual(p.replaced, ["/contacts/"]);
});
function DINO_ADDED() { return { id: "cont_4", first_name: "Dino", last_name: "", mobile: "+63 900 ••• 0104", groups: [] }; }

test("only an empty first name or number is stopped in the page; nothing is sent", async () => {
  const p = await page({}, { pathname: "/contacts/new/" });
  await save(p);
  assert.equal(p.node["c-first-err"].hidden, false);
  assert.equal(p.node["c-num-err"].hidden, false);
  assert.equal(p.sent(R.add).length, 0);
});

test("invalid_request shows each field's message under that field; others go in the error box", async () => {
  const p = await page({ [R.add]: [400, err("invalid_request", "Some values are missing or invalid.", { mobile: ["Enter a valid Philippine mobile number."], first_name: ["Enter a first name of up to 80 characters."] })] }, { pathname: "/contacts/new/" });
  p.node["c-first"].value = "x"; p.node["c-num"].value = "12";
  await save(p);
  assert.equal(p.node["c-num-err"].textContent, "Enter a valid Philippine mobile number.");
  assert.equal(p.node["c-first-err"].textContent, "Enter a first name of up to 80 characters.");
  assert.equal(p.node["c-err"].hidden, true);
  const q = await page({ [R.add]: [400, err("invalid_request", "Some values are missing or invalid.", { limit: ["x"] })] }, { pathname: "/contacts/new/" });
  q.node["c-first"].value = "x"; q.node["c-num"].value = "12";
  await save(q);
  assert.equal(q.node["c-err"].textContent, "Some values are missing or invalid.");
});

test("already_exists shows the sentence and Open that contact, which posts open with fields.contact and opens that contact", async () => {
  const p = await page({ [R.add]: [409, err("already_exists", "x", { contact: "cont_2" })], [R.open]: [200, { ...BEN, mobile: FULL }], [R.list]: list([]) }, { pathname: "/contacts/new/" });
  p.node["c-first"].value = "Z"; p.node["c-num"].value = FULL;
  await save(p);
  assert.equal(p.node["c-num-err"].textContent, "That number is already a contact.");
  assert.equal(p.node["c-existing"].hidden, false);
  p.node["c-existing"].fire("click");
  await settle();
  assert.deepEqual(p.sent(R.open)[0].body, { contact: "cont_2" });
  assert.equal(p.node["c-first"].value, "Ben");
  assert.equal(p.node.title.textContent, "Edit contact");
  assert.equal(p.node["c-existing"].hidden, true);
});

test("forbidden, group_limit and unknown answers: the message for the first two, a fixed sentence for the rest", async () => {
  for (const [reply, shown] of [[[403, err("forbidden", "You may not change contacts.")], "You may not change contacts."], [[400, err("group_limit", "Too many groups.")], "Too many groups."],
    [[500, err("boom", "Secret detail.")], "That did not go through. Check the list before trying again."], ["offline", "That did not go through. Check the list before trying again."]]) {
    const p = await page({ [R.add]: reply }, { pathname: "/contacts/new/" });
    p.node["c-first"].value = "x"; p.node["c-num"].value = "12";
    await save(p);
    assert.equal(p.node["c-err"].textContent, shown);
  }
});

test("a 404 on save closes the form with the list message", async () => {
  const p = await edit({ [R.edit]: [404, err("not_found")] });
  await save(p);
  assert.deepEqual(p.inner(), ["v-list"]);
  assert.equal(p.node.msg.textContent, "That contact is no longer available.");
});

test("Delete asks once; the X and Escape close the pop-up and post nothing; there is no Cancel button", async () => {
  const p = await edit({ [R.del]: [204] });
  p.node["c-delete"].fire("click");
  assert.equal(p.node["m-pop"].hidden, false);
  assert.equal(p.node["pop-h"].textContent, "Delete this contact?");
  assert.equal(p.node["pop-sub"].textContent, "Its name, number and group memberships are removed now. This cannot be undone.");
  assert.equal(p.node["pop-go"].textContent, "Delete contact");
  const html = (await import("node:fs")).readFileSync(new URL("../public/contacts.html", import.meta.url), "utf8");
  assert.match(html, /<button class="no-btn no-btn-ghost stop fin-block" type="button" id="pop-go">/);
  assert.match(html, /id="pop-x" aria-label="Close"/);
  assert.equal(buttons(p.node["m-pop"]).some((b) => /cancel/i.test(b.textContent)), false);
  p.node["pop-x"].fire("click");
  assert.equal(p.node["m-pop"].hidden, true);
  p.node["c-delete"].fire("click");
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(p.node["m-pop"].hidden, true);
  assert.equal(p.sent(R.del).length, 0);
  assert.deepEqual(p.inner(), ["v-form"]);
});

test("the pop-up's button posts delete and 204 returns to the list with Contact deleted.", async () => {
  const p = await edit({ [R.del]: [204] });
  p.node["c-delete"].fire("click");
  p.node["pop-go"].fire("click");
  await settle();
  assert.deepEqual(p.sent(R.del)[0].body, { contact: "cont_1" });
  assert.equal(p.node["m-pop"].hidden, true);
  assert.deepEqual(p.inner(), ["v-list"]);
  assert.equal(p.node.msg.textContent, "Contact deleted.");
});

test("a failed delete keeps the pop-up open with the fixed sentence", async () => {
  const p = await edit({ [R.del]: [500, err("boom", "Secret detail.")] });
  p.node["c-delete"].fire("click");
  p.node["pop-go"].fire("click");
  await settle();
  assert.equal(p.node["m-pop"].hidden, false);
  assert.equal(p.node["pop-err"].textContent, "That did not go through. Check the list before trying again.");
});

test("read-only: View opens the form with every field disabled, no Save, no Delete, and the line", async () => {
  const p = await edit({}, { change: false });
  for (const id of ["c-first", "c-last", "c-num"]) assert.equal(p.node[id].disabled, true, id);
  assert.equal(p.node["c-groups"].all((n) => n.tagName === "INPUT").every((b) => b.disabled), true);
  assert.equal(p.node["c-save"].hidden, true);
  assert.equal(p.node["c-delete"].hidden, true);
  assert.equal(p.node["c-ro"].hidden, false);
  p.node["c-form"].fire("submit");
  await settle();
  assert.equal(p.sent(R.edit).length, 0);
});
