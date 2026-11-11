/* Shared by the Bulk SMS tests: the ids of bulk.html, a page opened with made-up answers, and made-up batches.
   No real number or name is used anywhere. */
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import { open, settle, BASE } from "./page.mjs";

export { settle, BASE };
export const idsOf = () => [...fs.readFileSync(new URL("../public/bulk.html", import.meta.url), "utf8").matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
export const refusal = (code, message = "The backend's words.", fields = {}) => ({ error: { code, message, fields } });
export const BULK = { bulk: true, running: false, used_today: 610, left_today: 1090, reserved_for_codes: 300, opt_out_line: " Reply STOP to opt out", text_max: 138 };
export const GROUPS = [{ id: "grp_a", name: "Launch list A", count: 1600 }, { id: "grp_b", name: "Launch list B", count: 748 }];
export const batch = (over = {}) => ({ batch: "bulk_1", state: "finished", when: "2026-11-09T06:05:00+00:00", who: "sample.staff", source: "pasted",
  size: 1500, sent: 1490, failed: 2, not_sent: 8, waiting: 0, left_out: 0, text_length: 90, seconds_left: 0, ...over });
export const CHECK = { lines_read: 12, duplicates: 2, refused_count: 1, refused: [{ line: 3, reason: "The mobile number is not a Philippine mobile." }],
  opted_out: 1, eligible: 8, used_today: 610, left_today: 1090, size: 8, left_out: 0, seconds_min: 144, seconds_max: 200, text_length: 40, blocked: "" };

/* routes: { "bulk/list/": (body, n) => [200, {...}] }. A route not listed is a test failure. */
export function bulk(routes = {}, { globals = {} } = {}) {
  const base = { "me/": () => [200, { email: "sample.staff@example.com" }], "bulk/status/": () => [200, BULK],
    "contacts/groups/list/": () => [200, { results: GROUPS }], "bulk/list/": () => [200, { results: [], next: null }] };
  const table = { ...base, ...routes };
  const log = [], files = { made: [], freed: [] }, timers = [], logs = [];
  const URL = { createObjectURL(b) { files.made.push(b); return "blob:held/" + files.made.length; }, revokeObjectURL(u) { files.freed.push(u); } };
  const ids = [...new Set([...idsOf(), "acct-ini", "acct-btn", "acct-name", "menu-ini", "menu-name", "menu-email"])];
  const consoleStub = { log: (...a) => logs.push(a), warn: (...a) => logs.push(a), error: (...a) => logs.push(a) };
  const page = open(["hq.js", "shell.js", "bulk.js"], { ids, pathname: "/inbox/sms/bulk/",
    globals: { URL, Blob: class { constructor(parts, o) { this.parts = parts; this.type = o && o.type; } }, console: consoleStub,
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, ...globals },
    answers: (call) => {
      const r = call.url.slice(BASE.length + 1);
      log.push({ route: r, method: call.method, body: call.body, url: call.url });
      if (!table[r]) throw new Error("unexpected call: " + r);
      return table[r](call.body, log.filter((l) => l.route === r).length);
    } });
  page.window.crypto = webcrypto;
  Object.assign(page, { log, files, timers, logs });
  page.text = (id) => page.node[id].textContent;
  page.shown = (id) => !page.node[id].hidden;
  page.calls_to = (r) => log.filter((l) => l.route === r);
  page.type = (id, value) => { page.node[id].value = value; page.node[id].fire("input"); };
  page.click = (id) => page.node[id].fire("click");
  page.rows = () => page.node.rows.children;
  return page;
}
