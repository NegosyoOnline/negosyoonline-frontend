import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CSS = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "css", "dash.css"),
  "utf8",
);

// Rules as [selector, body] pairs, comments removed. @media blocks flatten into their inner rules.
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  while ((m = re.exec(clean))) out.push([m[1].trim(), m[2]]);
  return out;
}

const GOLD = /#f2d99b|#c59a3b|#e8c16a|var\(--gold\)|var\(--cat\)|var\(--c-cat\)/i;

test("no :focus or :focus-visible rule of dash.css uses a gold value", () => {
  const focus = rules(CSS).filter(([sel]) => /:focus(-visible)?\b/.test(sel));
  assert.ok(focus.length > 20, "the focus rules were found");
  for (const [sel, body] of focus) {
    assert.ok(!GOLD.test(body), `gold in a focus rule: ${sel}`);
  }
});

test("the focus tokens are never gold, and the dark focus is the dash's light blue", () => {
  for (const [sel, body] of rules(CSS)) {
    for (const m of body.matchAll(/--(?:c-)?focus:\s*([^;]+);/g)) {
      assert.ok(!GOLD.test(m[1]), `gold focus token in ${sel}: ${m[1]}`);
    }
  }
  assert.match(CSS, /--c-focus:\s*#9DB4FF/);
  assert.match(CSS, /--focus:\s*var\(--link\);/);
  assert.match(CSS, /html\[data-theme="light"\] body\.dash-app \{[^}]*--focus:\s*#173DB8/);
});

test("the notification category and See all text keep their own colour token", () => {
  assert.match(CSS, /--c-cat:\s*#F2D99B/);
  assert.match(CSS, /\.notif-cat \{ font-weight: 700; color: var\(--c-cat\); \}/);
  assert.match(CSS, /\.notif-cat, body\.dash-app \.notif-all \{ color: var\(--cat\); \}/);
});
