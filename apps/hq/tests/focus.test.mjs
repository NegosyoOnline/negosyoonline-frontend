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

test("the Finance usage and issuer pages follow the focus rule: no heading is focusable or given focus", () => {
  for (const f of ["finance-usage.html", "finance-issuer.html", "finance-accounts.html"]) assert.ok(pages.includes(f), f);
  for (const f of ["finance-common.js", "finance-usage.js", "finance-issuer.js", "finance-accounts.js"]) {
    assert.ok(scripts.includes(f), f);
    const js = fs.readFileSync(PUB + "assets/js/" + f, "utf8");
    assert.doesNotMatch(js, /\$\("(?:h-[a-z-]+|[a-z-]+-h|uo-site|u-h|i-h|b-h|a-h|pend-h|m-edit-h)"\)\.focus/, f);
  }
  /* The only controls that take focus when a dialog opens are fields. */
  assert.match(fs.readFileSync(PUB + "assets/js/finance-usage.js", "utf8"), /dlg\.open\("m-" \+ kind, \$\(open\), \$\(kind \+ "-f"\)\)/);
  assert.match(fs.readFileSync(PUB + "assets/js/finance-issuer.js", "utf8"), /dlg\.open\("m-verify", \$\("open-verify"\), \$\("verify-f"\)\)/);
  assert.match(fs.readFileSync(PUB + "assets/js/finance-accounts.js", "utf8"), /dlg\.open\("m-edit", from, \$\("e-provider"\)\)/);
});

test("the invoice register and reconciliation pages follow the focus rule: no heading is focusable or given focus", () => {
  for (const f of ["finance-invoices.html", "finance-reconcile.html"]) assert.ok(pages.includes(f), f);
  for (const f of ["finance-invoices.js", "finance-reconcile.js"]) {
    assert.ok(scripts.includes(f), f);
    const js = fs.readFileSync(PUB + "assets/js/" + f, "utf8");
    assert.doesNotMatch(js, /\$\("(?:h-[a-z-]+|[a-z-]+-h|s-site|w-h|rf-h|sc-h)"\)\.focus/, f);
  }
  /* The only controls that take focus when a dialog opens are a field, the reason list, or Cancel. */
  const js = fs.readFileSync(PUB + "assets/js/finance-invoices.js", "utf8");
  assert.match(js, /dlg\.open\("m-void", \$\("s-void"\), \$\("void-f"\)\)/);
  assert.match(js, /dlg\.open\("m-reject", \$\("sc-reject"\), rejectBox\.input\)/);
  assert.match(js, /dlg\.open\("m-verify", \$\("sc-verify"\), \$\("verify-cancel"\)\)/);
});

test("the Finance sub-navigation, switch and form styles use the HQ colours and no gold", () => {
  const block = css.slice(css.indexOf("Finance, usage review and issuer pages"));
  assert.ok(block.length > 200, "the HQ-F1 block is at the end of hq.css");
  assert.doesNotMatch(block, /#F2D99B|#C59A3B|var\(--gold\)|var\(--c-focus\)/i);
});
