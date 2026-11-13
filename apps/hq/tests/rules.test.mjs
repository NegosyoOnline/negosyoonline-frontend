/* Rules of design section 21 and of R27 that a later edit could break without anyone seeing.
   They are checked on the files as they are served, in public/. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

function files(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files(full, out);
    else if (/\.(html|js|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const all = files(PUBLIC).map((file) => ({ name: path.relative(PUBLIC, file), text: fs.readFileSync(file, "utf8") }));
const named = (re) => all.filter((f) => re.test(f.text)).map((f) => f.name);

test("there are pages to check", () => {
  assert.ok(all.some((f) => f.name === "auth.html"));
  assert.ok(all.some((f) => f.name === path.join("assets", "js", "hq.js")));
});

test("no file names another host", () => {
  assert.deepEqual(named(/https?:\/\/|["'(]\/\/[a-z]/i), []);
});

test("no inline script, style attribute or style block, which the CSP would refuse", () => {
  const pages = all.filter((f) => f.name.endsWith(".html"));
  assert.deepEqual(pages.filter((f) => /<script(?![^>]*\bsrc=)[^>]*>/i.test(f.text)).map((f) => f.name), []);
  assert.deepEqual(pages.filter((f) => /\sstyle=|<style/i.test(f.text)).map((f) => f.name), []);
  assert.deepEqual(pages.filter((f) => /\son[a-z]+=/i.test(f.text)).map((f) => f.name), []);
});

test("only theme.js touches storage, and nothing reads cookies or writes to the console", () => {
  assert.deepEqual(named(/localStorage/), [path.join("assets", "js", "theme.js")]);
  assert.deepEqual(named(/sessionStorage|indexedDB|document\.cookie|console\.(log|info|warn|error|debug)/), []);
});

test("only hq.js calls the backend", () => {
  assert.deepEqual(named(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/), [path.join("assets", "js", "hq.js")]);
});

test("nothing links to or names the Django Admin (R27)", () => {
  assert.deepEqual(named(/admin lists|django admin|\/admin\/|>\s*Lists\s*</i), []);
});

test("the Bulk confirm field takes the full width at phone width, like the buttons", () => {
  const css = all.find((f) => f.name === path.join("assets", "css", "hq.css")).text;
  assert.match(css, /@media \(max-width: 600px\)\s*\{[^}]*\.input\.narrow\s*\{\s*max-width: none;/);
});

test("no page, script or style claims BIR compliance, PTI, EIS or ESP status, or names the Django admin", () => {
  assert.deepEqual(named(/\bBIR[- ]compliant\b|\bPTI\b|\bEIS\b|\bESP\b|django admin/i), []);
});

test("the Finance usage and issuer pages are covered, and load their scripts in order", () => {
  for (const f of ["finance-usage.html", "finance-issuer.html", path.join("assets", "js", "finance-common.js"),
    path.join("assets", "js", "finance-usage.js"), path.join("assets", "js", "finance-issuer.js"),
    "finance-accounts.html", path.join("assets", "js", "finance-accounts.js")]) {
    assert.ok(all.some((x) => x.name === f), f);
  }
  for (const [page, script] of [["finance-usage.html", "finance-usage.js"], ["finance-issuer.html", "finance-issuer.js"], ["finance-accounts.html", "finance-accounts.js"]]) {
    const html = all.find((x) => x.name === page).text;
    const order = [...html.matchAll(/<script src="\/assets\/js\/([a-z-]+)\.js/g)].map((m) => m[1]);
    assert.deepEqual(order, ["theme", "config", "hq", "menu", "shell", "finance-common", script.replace(".js", "")], page);
  }
});

test("the invoice register and reconciliation pages are covered, and load their scripts in order", () => {
  for (const f of ["finance-invoices.html", "finance-reconcile.html", path.join("assets", "js", "finance-invoices.js"), path.join("assets", "js", "finance-reconcile.js")]) {
    assert.ok(all.some((x) => x.name === f), f);
  }
  for (const [page, script] of [["finance-invoices.html", "finance-invoices"], ["finance-reconcile.html", "finance-reconcile"]]) {
    const html = all.find((x) => x.name === page).text;
    const order = [...html.matchAll(/<script src="\/assets\/js\/([a-z-]+)\.js/g)].map((m) => m[1]);
    assert.deepEqual(order, ["theme", "config", "hq", "menu", "shell", "finance-common", script], page);
  }
});

test("every Finance page carries the same sub-navigation: seven links, the page's own marked current", () => {
  const LINKS = ["/finance/", "/finance/usage/", "/finance/issuer/", "/finance/invoices/", "/finance/invoices/reconcile/", "/finance/statements/", "/finance/accounts/"];
  const OWN = { "finance.html": "/finance/", "finance-usage.html": "/finance/usage/", "finance-issuer.html": "/finance/issuer/",
    "finance-invoices.html": "/finance/invoices/", "finance-reconcile.html": "/finance/invoices/reconcile/", "finance-statements.html": "/finance/statements/", "finance-accounts.html": "/finance/accounts/" };
  for (const [page, own] of Object.entries(OWN)) {
    const html = all.find((x) => x.name === page).text;
    const nav = /<nav class="set-tabs fin-sub"[^>]*>(.*?)<\/nav>/.exec(html)[1];
    assert.deepEqual([...nav.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]), LINKS, page);
    assert.equal((nav.match(/aria-current="page"/g) || []).length, 1, page);
    assert.match(nav, new RegExp(`<a href="${own}" aria-current="page">`), page);
    assert.match(nav, /Payments.*Usage.*Issuer.*Invoices.*Reconcile.*Statements.*Accounts/, page);
  }
});

test("the invoice register page shows the two exact strings and never an inline value", () => {
  const html = all.find((x) => x.name === "finance-invoices.html").text;
  const js = all.find((x) => x.name === path.join("assets", "js", "finance-invoices.js")).text;
  assert.match(html, /DO NOT issue invoices in a single delayed Monday batch\./);
  assert.match(js, /"WRITE THIS ON PAPER"/);
  /* The form holds no default: the serial and the issue date have no value attribute. */
  assert.doesNotMatch(html, /<input[^>]*id="r-(?:serial|issued)"[^>]*\bvalue=/i);
  assert.doesNotMatch(html, /<input[^>]*type="file"[^>]*\bvalue=/i);
});

test("the issuer page offers no tax type choice and holds no default value", () => {
  const html = all.find((x) => x.name === "finance-issuer.html").text;
  assert.doesNotMatch(html, /<select/i);
  assert.doesNotMatch(html, /<input[^>]*\bvalue=/i);
  assert.doesNotMatch(html, /<textarea[^>]*>[^<]+<\/textarea>/i);
});

test("the Settings page loads its scripts in order, and nothing in it is prefilled or inline", () => {
  for (const f of ["settings.html", path.join("assets", "js", "settings.js")]) assert.ok(all.some((x) => x.name === f), f);
  const html = all.find((x) => x.name === "settings.html").text;
  const order = [...html.matchAll(/<script src="\/assets\/js\/([a-z-]+)\.js/g)].map((m) => m[1]);
  assert.deepEqual(order, ["theme", "config", "hq", "menu", "shell", "finance-common", "settings"]);
  assert.doesNotMatch(html, /<input[^>]*\bvalue=/i);
});
