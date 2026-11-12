import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

/* The workspace label: first_site.display_name, else the first site's display_name from GET /sites/, else "My Business". */
const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js", "app.js");

function boot(sitesBody, sitesStatus = 200) {
  const label = { textContent: "" };
  const calls = [];
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {} };
  const document = { getElementById: () => null, querySelectorAll: (sel) => (sel === "[data-ws-name]" ? [label] : []), addEventListener() {},
    createElement: () => ({ setAttribute() {}, appendChild() {} }), cookie: "" };
  const location = { search: "", pathname: "/", replace() {}, assign() {} };
  const fetch = (url) => {
    calls.push(url);
    return Promise.resolve({ ok: sitesStatus === 200, status: sitesStatus, json: () => Promise.resolve(sitesBody) });
  };
  const context = vm.createContext({ window, document, location, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, fetch });
  vm.runInContext(fs.readFileSync(APP, "utf8"), context, { filename: "app.js" });
  return { D: window.NODash, label, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test("a site name from the setup answer is used and /sites/ is not asked", async () => {
  const { D, label, calls } = boot({ items: [{ display_name: "Other" }] });
  D.setWorkspace(" Live4More ");
  await tick();
  assert.equal(label.textContent, "Live4More");
  assert.equal(calls.length, 0);
});

test("an empty first_site falls back to the first site's display_name from /sites/", async () => {
  const { D, label, calls } = boot({ items: [{ display_name: " Live4More Online " }], next_cursor: null });
  D.setWorkspace("");
  assert.equal(label.textContent, "My Business");
  await tick();
  assert.equal(label.textContent, "Live4More Online");
  assert.deepEqual(calls, ["http://api.test/v1/sites/"]);
});

test("no site, a blank name, a failed read or askSites=false keeps \"My Business\"", async () => {
  for (const [body, status] of [[{ items: [] }, 200], [{ items: [{ display_name: "  " }] }, 200], [{}, 500]]) {
    const { D, label } = boot(body, status);
    D.setWorkspace(null);
    await tick();
    assert.equal(label.textContent, "My Business");
  }
  const { D, label, calls } = boot({ items: [{ display_name: "X" }] });
  D.setWorkspace("", false);
  await tick();
  assert.deepEqual([label.textContent, calls.length], ["My Business", 0]);
});

test("a name that arrives while /sites/ is pending wins", async () => {
  const { D, label } = boot({ items: [{ display_name: "Late" }] });
  D.setWorkspace("");
  D.setWorkspace("Setup Name");
  await tick();
  assert.equal(label.textContent, "Setup Name");
});
