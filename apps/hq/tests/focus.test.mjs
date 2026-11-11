/* Focus in HQ is light blue, never gold, and a heading is never a focus target (Coach Ed's look rule, 2026-11-11). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PUB = new URL("../public/", import.meta.url).pathname;
const css = fs.readFileSync(PUB + "assets/css/hq.css", "utf8");
const pages = fs.readdirSync(PUB).filter((f) => f.endsWith(".html"));
const scripts = fs.readdirSync(PUB + "assets/js").filter((f) => f.endsWith(".js") && f !== "config.js");

test("no focus rule or focus colour in hq.css is gold", () => {
  assert.doesNotMatch(css, /--c-focus|--focus\b/, "the old gold focus variables are gone");
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => /:focus/.test(m[1]));
  assert.ok(rules.length >= 3, "the focus rules are there");
  for (const [, sel, body] of rules) assert.doesNotMatch(body, /#F2D99B|#C59A3B|var\(--gold\)|var\(--c-focus\)/i, sel.trim());
});

test("a field in focus has the dashboard's light blue border and 1px ring; other controls keep a blue ring", () => {
  assert.match(css, /\.input:focus, \.textarea:focus \{ outline: none; border-color: var\(--link\); box-shadow: 0 0 0 1px var\(--link\); \}/);
  assert.match(css, /body\.dash-app :focus-visible \{ outline: 2px solid var\(--link\);/);
  assert.match(css, /input:focus-visible, body\.dash-app textarea:focus-visible, body\.dash-app select:focus-visible \{ outline: none; \}/);
  assert.match(css, /--link: #9DB4FF/);
  assert.match(css, /--link: #173DB8/);
});

test("a heading never shows a ring, takes no tabindex and is never given focus by a script", () => {
  assert.match(css, /:is\(h1, h2, h3, h4, h5, h6\):focus, body\.dash-app :is\(h1, h2, h3, h4, h5, h6\):focus-visible \{ outline: none; \}/);
  for (const f of pages) {
    const html = fs.readFileSync(path.join(PUB, f), "utf8");
    assert.doesNotMatch(html, /<h[1-6][^>]*tabindex/i, f);
  }
  for (const f of scripts) {
    const js = fs.readFileSync(PUB + "assets/js/" + f, "utf8");
    assert.doesNotMatch(js, /\$\("(?:mc-h|mr-h|history-h|proof-h|p-site|h-closed|h-down|h-[a-z-]+)"\)\.focus|querySelector\("h[1-6][^"]*"\)\.focus|\btabindex\b|tabIndex/i, f);
  }
});
