/* theme.js: the staff app opens in dark, as the dashboard does, unless this browser has a saved choice (Coach Ed's ruling, 2026-11-10, z8uq9mach5).
   The script is run in a bare context with a stand-in <html>, storage and device setting. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js", "theme.js");
const KEY = "no_hq_theme";

/* device: what prefers-color-scheme reports. saved: the stored choice, if any. storage: false blocks localStorage. */
function run({ device = "light", saved = null, storage = true } = {}) {
  const store = new Map(saved === null ? [] : [[KEY, saved]]);
  const root = { dataset: {}, style: {} };
  const document = { documentElement: root, readyState: "complete", querySelectorAll: () => [], addEventListener() {} };
  const window = {
    matchMedia: (q) => ({ media: q, matches: q.includes("dark") ? device === "dark" : device === "light",
      addEventListener() {}, addListener() {} }),
  };
  const context = { window, document };
  if (storage) {
    context.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } };
  } else {
    Object.defineProperty(context, "localStorage", { get() { throw new Error("blocked"); } });
  }
  vm.runInContext(fs.readFileSync(FILE, "utf8"), vm.createContext(context), { filename: "theme.js" });
  return { root, store, api: window.NOHqTheme };
}

test("no saved choice on a light device opens in dark", () => {
  const { root, api, store } = run({ device: "light" });
  assert.equal(root.dataset.theme, "dark");
  assert.equal(root.style.colorScheme, "dark");
  assert.equal(api.current(), "dark");
  assert.equal(store.has(KEY), false, "the default is not written as a choice");
});

test("no saved choice on a dark device opens in dark", () => {
  assert.equal(run({ device: "dark" }).root.dataset.theme, "dark");
});

test("a saved light choice opens in light, on either device setting", () => {
  for (const device of ["light", "dark"]) {
    const { root, api } = run({ device, saved: "light" });
    assert.equal(root.dataset.theme, "light");
    assert.equal(root.style.colorScheme, "light");
    assert.equal(api.current(), "light");
  }
});

test("a saved dark choice opens in dark", () => {
  assert.equal(run({ device: "light", saved: "dark" }).root.dataset.theme, "dark");
});

test("an unknown saved value is ignored and opens in dark", () => {
  assert.equal(run({ device: "light", saved: "blue" }).root.dataset.theme, "dark");
});

test("switching is applied at once, remembered, and reported to listeners", () => {
  const { root, api, store } = run({ device: "light" });
  const heard = [];
  api.onChange((t) => heard.push(t));
  api.set("light");
  assert.equal(root.dataset.theme, "light");
  assert.equal(store.get(KEY), "light");
  api.set("dark");
  assert.equal(root.dataset.theme, "dark");
  assert.equal(store.get(KEY), "dark");
  assert.deepEqual(heard, ["light", "dark"]);
});

test("blocked storage still opens in dark and the switch works for the view", () => {
  const { root, api } = run({ device: "light", storage: false });
  assert.equal(root.dataset.theme, "dark");
  api.set("light");
  assert.equal(root.dataset.theme, "light");
});
