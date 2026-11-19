/* Shared by the Inbox tests: the pages' element ids read from the served HTML, and a backend that answers by route. */
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import { open, settle, BASE } from "./page.mjs";

export { settle, BASE };
const read = (f) => fs.readFileSync(new URL("../public/" + f, import.meta.url), "utf8");
export const idsOf = (file) => [...read(file).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
export const route = (call) => call.url.slice(BASE.length + 1);

export const status = (over = {}) => ({ platform: "sms", read: true, send: true, phone_online: true, used_today: 610, cap: 2000,
  reserved_for_codes: 300, unread: 2, ...over });
export const conv = (over = {}) => ({ id: "conv_a", platform: "sms", contact: "+63 900 ••• 0142", can_reply: true, unread: 0,
  last_message_at: "2026-11-09T08:18:00+00:00", last_direction: "in", last_status: null, ...over });
export const msg = (over = {}) => ({ id: "msg_a", direction: "in", body: "Hello", clipped: false, kind: null, status: null,
  reason: null, author: null, at: "2026-11-09T08:18:00+00:00", ...over });
export const refusal = (code, message = "The backend's words.", fields = {}) => ({ error: { code, message, fields } });

/* routes: { "inbox/status/": (body) => [200, {...}] }. A route not listed is a test failure. */
/* A fake clock: timers fire only when advance() moves it. Without one, a timer of 5 s or more never fires (the polling of
   inbox.js, ClickUp z8uq9mgtf8), so a test sees no background read. */
export function makeClock() {
  let now = 0, seq = 0, timers = [];
  return {
    setTimeout(fn, ms) { const id = ++seq; timers.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout(id) { timers = timers.filter((t) => t.id !== id); },
    pending: () => timers.length,
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = timers.filter((t) => t.at <= end).sort((x, y) => x.at - y.at || x.id - y.id)[0];
        if (!next) break;
        timers = timers.filter((t) => t !== next); now = next.at; next.fn(); await settle();
      }
      now = end; await settle();
    },
  };
}
const inert = (fn, ms) => (ms >= 5000 ? 0 : setTimeout(fn, ms));

export function inbox(routes, { pathname = "/inbox/sms/", file = "inbox.html", scripts = ["hq.js", "shell.js", "inbox.js"], email = "sample.staff@example.com", clock = null } = {}) {
  const base = { "me/": () => [200, { email }], "inbox/status/": () => [200, status()],
    "inbox/conversations/list/": () => [200, { results: [], next: null }],
    "bulk/status/": () => [404, refusal("not_found")] };
  const table = { ...base, ...routes };
  const log = [];
  const ids = [...new Set([...idsOf(file), "acct-ini", "acct-btn", "acct-name", "menu-ini", "menu-name", "menu-email"])];
  const page = open(scripts, { ids, pathname, globals: { setTimeout: clock ? clock.setTimeout : inert, clearTimeout: clock ? clock.clearTimeout : clearTimeout }, answers: (call) => {
    const r = route(call);
    log.push({ route: r, method: call.method, body: call.body, url: call.url });
    if (!table[r]) throw new Error("unexpected call: " + r);
    return table[r](call.body, log.filter((l) => l.route === r).length);
  } });
  page.window.crypto = webcrypto;
  page.log = log;
  page.text = (id) => page.node[id].textContent;
  page.shown = (id) => !page.node[id].hidden;
  page.calls_to = (r) => log.filter((l) => l.route === r);
  return page;
}
