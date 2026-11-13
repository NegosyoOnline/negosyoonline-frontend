/* finance-common.js: the helpers the Finance pages after Payments share (Billing HQ-F1, ClickUp z8uq9mektc,
   plan decision D5). They are copies of finance.js's, plus the mockup's date words. */
import test from "node:test";
import assert from "node:assert/strict";
import { open } from "./page.mjs";

function common(ids = []) {
  const p = open(["hq.js", "finance-common.js"], { ids, pathname: "/finance/usage/", answers: () => [200, {}] });
  return { ...p, F: p.window.NOFin };
}

test("it exposes the helpers the pages are built from", () => {
  const { F } = common();
  for (const name of ["el", "say", "money", "centavos", "day", "dayOf", "stamp", "waited", "gb", "words", "inside", "left", "combo", "dialogs"]) {
    assert.equal(typeof F[name], "function", name);
  }
});

test("money is written from whole centavos and centavos are read from typed pesos as text", () => {
  const { F } = common();
  assert.equal(F.money(499900), "PHP 4,999.00");
  assert.equal(F.money(5), "PHP 0.05");
  for (const bad of [-1, 1.5, "100", null, NaN, Infinity]) assert.equal(F.money(bad), "", String(bad));
  assert.equal(F.centavos("4,999.00"), 499900);
  assert.equal(F.centavos("0.1"), 10);
  assert.equal(F.centavos("1,00"), null);
  assert.equal(F.centavos("0"), null);
  assert.equal(F.centavos(""), null);
});

test("dates are written as the approved mockup writes them, in Manila time", () => {
  const { F } = common();
  assert.equal(F.day("2026-10-31"), "Oct 31, 2026");
  assert.equal(F.day("2026-11-04"), "Nov 4, 2026");
  for (const bad of ["", null, "2026-13-01", "31/10/2026", "2026-10-00"]) assert.equal(F.day(bad), "", String(bad));
  assert.equal(F.dayOf("2026-10-31T12:00:00+08:00"), "Oct 31, 2026");
  assert.equal(F.dayOf("2026-10-31T20:00:00Z"), "Nov 1, 2026", "Manila is eight hours ahead of UTC");
  assert.equal(F.stamp("2026-11-04T09:30:00+08:00"), "Nov 4, 2026, 9:30 AM");
  assert.equal(F.stamp("2026-11-04T21:05:00+08:00"), "Nov 4, 2026, 9:05 PM");
  assert.equal(F.stamp("not a time"), "");
  assert.equal(F.dayOf(null), "");
});

test("a size is shown in decimal gigabytes with two decimals", () => {
  const { F } = common();
  assert.equal(F.gb(12400000000), "12.40 GB");
  assert.equal(F.gb(0), "0.00 GB");
  assert.equal(F.gb(805000000), "0.81 GB");
  for (const bad of [-1, "5", null, NaN]) assert.equal(F.gb(bad), "", String(bad));
});

test("words answers only for a name in the map", () => {
  const { F } = common();
  assert.equal(F.words({ a: "A" }, "a"), "A");
  assert.equal(F.words({ a: "A" }, "toString"), "");
  assert.equal(F.words({ a: "A" }, "b"), "");
});

test("the house dropdown picks a value into the native select and filters as you type", () => {
  const { doc, F } = common(["holder"]);
  const select = doc.createElement("select");
  select.setAttribute("id", "reason");
  doc.getElementById("holder").appendChild(select);
  const box = F.combo(select, "Reason", [["", "Choose"], ["a", "Alpha"], ["b", "Beta"]], "reason-err");
  const wrap = select.parentNode;
  const rows = () => wrap.all((n) => n.classList.contains("fin-combo-opt"));
  assert.equal(box.input.getAttribute("aria-describedby"), "reason-err");
  assert.equal(select.getAttribute("aria-hidden"), "true");
  wrap.all((n) => n.classList.contains("fin-combo-box"))[0].click();
  assert.equal(wrap.classList.contains("is-open"), true);
  assert.deepEqual(rows().map((r) => r.textContent), ["Alpha", "Beta"]);
  box.input.value = "be";
  box.input.fire("input");
  assert.deepEqual(rows().map((r) => r.textContent), ["Beta"]);
  rows()[0].click();
  assert.equal(select.value, "b");
  assert.equal(box.input.value, "Beta");
  assert.equal(wrap.classList.contains("is-open"), false);
  select.value = "";
  box.sync();
  assert.equal(box.input.value, "");
});

test("Escape in the dropdown closes the list and not the dialog around it", () => {
  const { doc, F } = common(["holder"]);
  const select = doc.createElement("select");
  select.setAttribute("id", "r2");
  doc.getElementById("holder").appendChild(select);
  const box = F.combo(select, "Reason", [["", "Choose"], ["a", "Alpha"]]);
  box.input.fire("keydown", { key: "ArrowDown" });
  assert.equal(select.parentNode.classList.contains("is-open"), true);
  const e = box.input.fire("keydown", { key: "Escape" });
  assert.equal(select.parentNode.classList.contains("is-open"), false);
  assert.equal(e.stopped, true);
});

test("a dialog keeps focus inside, closes on Escape unless busy, and returns focus to its opener", () => {
  const { doc, F } = common(["m"]);
  const m = doc.getElementById("m"), opener = doc.createElement("button"), a = doc.createElement("button"), b = doc.createElement("textarea");
  doc.body.appendChild(opener);
  m.appendChild(b);
  m.appendChild(a);
  let busy = false;
  const dlg = F.dialogs(() => busy);
  dlg.open("m", opener, b);
  assert.equal(m.hidden, false);
  assert.equal(doc.activeElement, b);
  assert.equal(dlg.isOpen(), true);
  assert.equal(doc.body.classList.contains("modal-open"), true);
  doc.activeElement = a;
  let e = doc.fire("keydown", { key: "Tab", shiftKey: false });
  assert.equal(e.prevented, true);
  assert.equal(doc.activeElement, b, "Tab from the last control goes to the first");
  e = doc.fire("keydown", { key: "Tab", shiftKey: true });
  assert.equal(doc.activeElement, a, "Shift+Tab from the first goes to the last");
  doc.activeElement = opener;
  doc.fire("keydown", { key: "Tab", shiftKey: false });
  assert.equal(doc.activeElement, b, "focus outside the dialog is pulled back in");
  busy = true;
  doc.fire("keydown", { key: "Escape" });
  assert.equal(m.hidden, false, "Escape does nothing while a decision is on its way");
  busy = false;
  doc.fire("keydown", { key: "Escape" });
  assert.equal(m.hidden, true);
  assert.equal(dlg.isOpen(), false);
  assert.equal(doc.activeElement, opener);
  assert.equal(doc.body.classList.contains("modal-open"), false);
  assert.equal((doc.listeners.keydown || []).length, 0, "no listener stays once it is closed");
});
