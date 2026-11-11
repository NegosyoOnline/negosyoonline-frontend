/* Shared by the Contacts tests: the ids of contacts.html, a page opened with made-up answers, and made-up people.
   No real name or number is used anywhere. */
import assert from "node:assert/strict";
import { open, settle, BASE } from "./page.mjs";

export const IDS = ["sign-out-err", "boot", "v-page", "back", "title", "msg", "seg-row", "seg-contacts", "seg-groups", "list-actions", "upload-link", "add-link",
  "v-list", "find-form", "find-q", "find-go", "find-group", "find-err", "find-note", "show-all", "l-loading", "rows", "l-empty", "l-foot", "l-count", "more-row", "more",
  "v-form", "c-form", "c-first", "c-last", "c-num", "c-first-err", "c-last-err", "c-num-err", "c-existing", "c-groups", "c-groups-err", "c-err", "c-ro", "c-recorded", "c-delete", "c-save",
  "v-groups", "g-form", "g-name", "g-add", "g-err", "g-rows", "g-empty",
  "v-upload", "u-ro", "u-body", "u-form", "u-file", "u-group", "u-nogroup", "u-group-err", "u-file-err", "u-err", "u-check",
  "u-step2", "f-lines", "f-new", "f-existing", "f-refused", "f-repeated-box", "f-repeated", "u-sentence", "u-results", "u-more", "u-err2", "u-download", "u-save",
  "u-done", "u-done-text", "u-done-link",
  "v-closed", "v-down", "retry", "m-pop", "pop-h", "pop-x", "pop-sub", "pop-err", "pop-go",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "theme-toggle", "theme-toggle-2"];
export const VIEWS = ["boot", "v-page", "v-closed", "v-down"];
export const INNER = ["v-list", "v-form", "v-groups", "v-upload"];
export const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };

export const group = (n, name, count = 0) => ({ id: "grp_" + n, name, count });
export const GROUPS = [group("a", "Launch list A", 2), group("b", "Launch list B", 1), group("r", "Resellers", 0)];
export const person = (n, first, last, groups = [], mobile = "+63 900 ••• 010" + n) => ({ id: "cont_" + n, first_name: first, last_name: last, mobile, groups });
export const ANA = person(1, "Ana", "Sample", [{ id: "grp_a", name: "Launch list A" }]);
export const BEN = person(2, "Ben", "Example", [{ id: "grp_a", name: "Launch list A" }, { id: "grp_r", name: "Resellers" }]);
export const DINO = person(4, "Dino", "Placeholder");
export const FULL = "0900 000 0101";

export const R = {
  me: "GET me/", status: "POST contacts/status/", list: "POST contacts/list/", open: "POST contacts/open/", add: "POST contacts/add/",
  edit: "POST contacts/edit/", del: "POST contacts/delete/", gl: "POST contacts/groups/list/", ga: "POST contacts/groups/add/",
  gr: "POST contacts/groups/rename/", gx: "POST contacts/groups/remove/", uc: "POST contacts/upload/check/", us: "POST contacts/upload/",
};
export const err = (code, message = "A backend message.", fields) => ({ error: { code, message, ...(fields ? { fields } : {}) } });
export const key = (call) => call.method + " " + call.url.slice(BASE.length + 1);

/* table: what each route answers, a reply or a function of the call. Unlisted routes fail the test. */
export async function page(table, { pathname = "/contacts/", globals = {}, change = true, groups = GROUPS, skipSettle = false } = {}) {
  const pushed = [], replaced = [], logs = [], urls = { made: [], freed: [] };
  const full = { [R.me]: [200, ME], [R.status]: [200, { read: true, change }], [R.gl]: [200, { results: groups }], ...table };
  const history = { pushState(s, t, u) { pushed.push(u); this.depth = (this.depth || 0) + 1; }, replaceState(s, t, u) { replaced.push(u); },
    back() { this.depth = Math.max(0, (this.depth || 0) - 1); if (p.heard.popstate) p.heard.popstate({ type: "popstate" }); } };
  const URL = { createObjectURL(b) { urls.made.push(b); return "blob:held/" + urls.made.length; }, revokeObjectURL(u) { urls.freed.push(u); } };
  const consoleStub = { log: (...a) => logs.push(a), warn: (...a) => logs.push(a), error: (...a) => logs.push(a) };
  const p = open(["hq.js", "shell.js", "contacts.js"], { ids: IDS, pathname, globals: { URL, Blob: class { constructor(parts, o) { this.parts = parts; this.type = o && o.type; } }, history, console: consoleStub, ...globals },
    answers: (call) => {
      const k = key(call);
      const reply = Object.prototype.hasOwnProperty.call(full, k) ? full[k] : undefined;
      assert.ok(reply !== undefined, "unexpected call: " + k);
      return typeof reply === "function" ? reply(call) : reply;
    } });
  if (!skipSettle) await settle();
  const sent = (k) => p.calls.filter((c) => key(c) === k);
  const shown = () => VIEWS.filter((id) => !p.node[id].hidden);
  const inner = () => INNER.filter((id) => !p.node[id].hidden);
  return { ...p, pushed, replaced, logs, urls, history, sent, shown, inner, table: full };
}

export const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
export const byText = (root, text, tag = "BUTTON") => root.all((x) => x.tagName === tag && x.textContent === text)[0];
export const rowsText = (p) => p.node.rows.children.map((li) => li.textContent);
export const everything = (p) => p.doc.body.all(() => true).map((n) => n.textContent + "|" + JSON.stringify(n.attrs)).join("\n");
export const reload = settle;
