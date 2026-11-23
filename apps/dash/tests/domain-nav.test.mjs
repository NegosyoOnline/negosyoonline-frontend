/* The Settings "Domain" tab (ClickUp z8uq9mhpc2). The real dashboard.js runs in a vm with a stand-in page; the real app.js (its API client)
   runs in a second vm with a recorded fetch that plays GET /sites/ and GET /sites/{id}/domain/. The tab shows only on a 200. Fake data only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const SITE = "site_aaaaaaaaaaaaaaaaaaaa";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };
const err = (status) => ({ status, body: { error: { code: "x", message: "x" } } });

async function boot({ sites = { status: 200, body: { items: [{ id: SITE, template: "sante" }], next_cursor: null } }, domain = { status: 200, body: { eligible: true } }, fail = false } = {}) {
  const calls = [];
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", "");
    calls.push(opts.method + " " + p);
    if (fail && p.endsWith("/domain/")) return Promise.reject(new Error("offline"));
    const a = p === "/sites/" ? sites : p === `/sites/${SITE}/domain/` ? domain : err(404);
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const appDoc = makeDocument(), storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const appWin = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {} };
  vm.runInContext(read("app.js"), vm.createContext({ window: appWin, document: appDoc, location: { search: "", pathname: "/", replace() {}, assign() {} }, console, URLSearchParams, Promise, Intl, Uint8Array, Date, JSON,
    setTimeout, clearTimeout, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch }), { filename: "app.js" });
  const real = appWin.NODash;

  const nav = { hidden: true, setAttribute() {}, removeAttribute() {}, addEventListener() {} };
  const node = (id) => ({ id, hidden: false, querySelector: () => node("q"), querySelectorAll: () => [], textContent: "", style: {}, className: "", focus() {}, setAttribute() {}, removeAttribute() {}, appendChild() {}, addEventListener() {} });
  const nodes = {};
  const document = { readyState: "complete", title: "", getElementById: (id) => (nodes[id] = nodes[id] || node(id)), createElement: () => node("x"), addEventListener() {},
    querySelectorAll: (sel) => (sel === "[data-domain-nav]" ? [nav] : []) };
  const location = { pathname: "/", search: "" };
  const history = { replaceState() {}, pushState() {} };
  const window = { addEventListener() {}, NODash: { el: () => node("x"), requireAccount: () => ({ then(fn) { window.start = fn; } }), cfg: {}, setWorkspace() {}, call: real.call, sitesOf: real.sitesOf, siteFromQuery: real.siteFromQuery } };
  vm.runInContext(read("dashboard.js"), vm.createContext({ window, document, location, history, console, Intl, Promise, setTimeout, clearTimeout }), { filename: "dashboard.js" });
  window.start({ first_name: "Nena" });
  await settle();
  return { nav, calls: calls.filter((c) => c !== "GET /account/setup/") };
}

test("the Domain tab is hidden in the markup, with its probe hook and route", () => {
  const html = fs.readFileSync(path.join(JS, "..", "..", "index.html"), "utf8");
  assert.ok(html.includes('<a href="/settings/domain/" data-route="settings-domain" data-domain-nav hidden>Domain</a>'));
});

test("200 shows the Domain tab", async () => {
  const d = await boot();
  assert.equal(d.nav.hidden, false);
  assert.deepEqual(d.calls, ["GET /sites/", `GET /sites/${SITE}/domain/`]);
});

test("404 (the switch is dark) hides the Domain tab", async () => {
  assert.equal((await boot({ domain: err(404) })).nav.hidden, true);
});

test("403, 500 and a failed call hide the Domain tab", async () => {
  for (const domain of [err(403), err(500)]) assert.equal((await boot({ domain })).nav.hidden, true, String(domain.status));
  assert.equal((await boot({ fail: true })).nav.hidden, true, "network failure");
});

test("signed out (401) or no site: the Domain tab stays hidden and the domain is never asked", async () => {
  for (const sites of [err(401), err(500), { status: 200, body: { items: [], next_cursor: null } }]) {
    const d = await boot({ sites });
    assert.equal(d.nav.hidden, true, String(sites.status));
    assert.deepEqual(d.calls, ["GET /sites/"]);
  }
});
