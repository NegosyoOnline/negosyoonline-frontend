/* Loads a browser script from public/assets/js into a bare context, so its pure helpers can be tested
   with node --test. No DOM library: only what the scripts touch while loading. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");

export function load(files, { config = {}, search = "", fetch } = {}) {
  const calls = [];
  const window = { NO_CONFIG: config, addEventListener() {} };
  const location = { search, pathname: "/", replaced: null, assigned: null,
    replace(u) { this.replaced = u; }, assign(u) { this.assigned = u; } };
  const document = { getElementById: () => null, querySelectorAll: () => [], addEventListener() {},
    createElement: () => ({ setAttribute() {}, appendChild() {} }), cookie: "" };
  const context = vm.createContext({ window, document, location, console, URLSearchParams, Promise, setTimeout,
    clearTimeout, Intl, fetch: (url, opts) => { calls.push({ url, opts }); return fetch(url, opts); } });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), context, { filename: f });
  return { window, location, calls };
}

export function answer(status, body) {
  return () => Promise.resolve({ ok: status >= 200 && status < 300, status,
    json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)) });
}
