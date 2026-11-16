/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/* A small fake DOM, just enough to run the real PK Date component (public/assets/sante/js/pack-select.js). */

type Listener = (e: Record<string, unknown>) => void;

function el(tag = "div") {
  const listeners: Record<string, Listener[]> = {};
  const attrs: Record<string, string> = {};
  const classes = new Set<string>();
  const o: Record<string, unknown> = {
    tagName: tag, dataset: {} as Record<string, string>, style: {}, innerHTML: "", textContent: "", value: "", disabled: false, required: false,
    previousElementSibling: null, parentNode: null, type: "date",
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c), contains: (c: string) => classes.has(c), toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
    setAttribute: (k: string, v: string) => { attrs[k] = v; },
    getAttribute: (k: string) => (k in attrs ? attrs[k] : null),
    addEventListener: (t: string, f: Listener) => { (listeners[t] ??= []).push(f); },
    removeEventListener: () => {},
    dispatchEvent: (e: { type: string }) => { for (const f of listeners[e.type] ?? []) f(e as never); },
    appendChild: (c: Record<string, unknown>) => { c.parentNode = o; },
    insertBefore: (c: Record<string, unknown>) => { c.parentNode = o; },
    querySelector: () => el("span"),
    contains: () => false,
    getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 40 }),
    _fire: (t: string, e: Record<string, unknown>) => { for (const f of listeners[t] ?? []) f(e); },
  };
  Object.defineProperty(o, "className", { get: () => [...classes].join(" "), set: (v: string) => { classes.clear(); for (const c of v.split(" ")) if (c) classes.add(c); } });
  return o as Record<string, Any>;
}

function run(attrs: Record<string, string>, value: string) {
  const input = el("input");
  for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
  input.value = value;
  input.parentNode = el();
  const made: Record<string, Any>[] = [];
  const document = {
    createElement: (t: string) => { const e = el(t); made.push(e); return e; },
    querySelectorAll: () => ({ forEach: (f: (i: unknown) => void) => f(input) }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const window: Record<string, unknown> = { addEventListener: () => {}, removeEventListener: () => {}, innerHeight: 800 };
  class Event { type: string; constructor(t: string) { this.type = t; } }
  class MutationObserver { observe() {} }
  const src = readFileSync(path.join(process.cwd(), "public/assets/sante/js/pack-select.js"), "utf8");
  new Function("document", "window", "Event", "MutationObserver", src)(document, window, Event, MutationObserver);
  (window.PKDate as { init: () => void }).init();
  const box = made.find((m) => m.className.includes("pk-date-box"))!;
  const panel = made.find((m) => m.className.includes("pk-date-panel"))!;
  box._fire("click", {});
  const cell = (attr: string, key: string) => {
    const m = new RegExp(`<button type="button" class="([^"]*)" data-${attr}="${key}"([^>]*)>`).exec(panel.innerHTML as string);
    return m ? { cls: m[1], rest: m[2] } : null;
  };
  const click = (attr: string, key: string) => {
    const c = cell(attr, key)!;
    const node = { dataset: { [attr]: key } };
    panel._fire("click", { stopPropagation() {}, target: { closest: (sel: string) => (sel === ".is-disabled" ? (c.cls.split(" ").includes("is-disabled") ? node : null) : sel === `[data-${attr}]` ? node : null) } });
  };
  const foot = (action: string) => new RegExp(`<button type="button" class="([^"]*)" data-action="${action}"([^>]*)>`).exec(panel.innerHTML as string)!;
  return { input, panel, cell, click, foot };
}

test("PK Date: a day after the input's max is disabled and cannot be chosen; days inside the range still can", () => {
  const t = run({ min: "2007-01-01", max: "2026-11-15" }, "2026-11-10");
  assert.doesNotMatch(t.cell("day", "15")!.cls, /is-disabled/);
  for (const d of ["16", "17", "30"]) {
    const c = t.cell("day", d)!;
    assert.match(c.cls, /is-disabled/);
    assert.match(c.rest, /aria-disabled="true"/);
  }
  t.click("day", "17");
  assert.equal(t.input.value, "2026-11-10");
  t.click("day", "15");
  assert.equal(t.input.value, "2026-11-15");
});

test("PK Date: a day before the input's min is disabled", () => {
  const t = run({ min: "2026-11-05", max: "2026-11-30" }, "2026-11-10");
  assert.match(t.cell("day", "4")!.cls, /is-disabled/);
  assert.doesNotMatch(t.cell("day", "5")!.cls, /is-disabled/);
  t.click("day", "4");
  assert.equal(t.input.value, "2026-11-10");
});

test("PK Date: the month arrows past the range are disabled, and Today is disabled when today is out of range", () => {
  const t = run({ min: "2007-01-01", max: "2007-01-31" }, "2007-01-10");
  assert.match(t.panel.innerHTML as string, /pk-date-nav is-disabled" data-nav="-1" data-navunit="month" disabled aria-disabled="true"/);
  assert.match(t.panel.innerHTML as string, /pk-date-nav is-disabled" data-nav="1" data-navunit="month" disabled aria-disabled="true"/);
  const today = t.foot("today");
  assert.match(today[1], /is-disabled/);
  assert.match(today[2], /aria-disabled="true"/);
});

test("PK Date: an input without min or max is unchanged, nothing is disabled", () => {
  const t = run({}, "2026-11-10");
  assert.doesNotMatch(t.panel.innerHTML as string, /is-disabled|aria-disabled| disabled/);
  t.click("day", "28");
  assert.equal(t.input.value, "2026-11-28");
});
