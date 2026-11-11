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
