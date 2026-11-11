/* Opens the staff app's scripts in a bare context with a stand-in document, so a page can be driven with
   node --test: a list of element ids, the address, and what the backend answers. No DOM library. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
export const BASE = "http://hq-api.test/staff/v1";

/* answers(call) gives [status, body], or "offline" for a call that never gets an answer. */
/* globals: what a page needs that a bare context lacks, for example URL. */
export function open(files, { ids = [], pathname = "/sign-in/", answers, globals = {} } = {}) {
  const doc = makeDocument();
  const node = {};
  for (const id of ids) {
    const n = doc.createElement("div");
    n.setAttribute("id", id);
    n.hidden = true;
    doc.body.appendChild(n);
    node[id] = n;
  }
  const calls = [];
  const heard = {};
  const location = { pathname, assigned: null, replaced: null,
    assign(u) { this.assigned = u; }, replace(u) { this.replaced = u; } };
  const history = { pushState(s, t, u) { location.pathname = u; }, replaceState(s, t, u) { location.pathname = u; } };
  const window = { NO_HQ_CONFIG: { staffApi: BASE }, innerHeight: 800, addEventListener(type, fn) { heard[type] = fn; }, removeEventListener(type) { delete heard[type]; } };
  const fetch = (url, opts) => {
    const call = { url, method: opts.method, credentials: opts.credentials, headers: opts.headers,
      body: opts.body ? JSON.parse(opts.body) : undefined };
    calls.push(call);
    const reply = answers(call);
    if (reply === "offline") return Promise.reject(new Error("offline"));
    const [status, body] = reply;
    return Promise.resolve({ ok: status >= 200 && status < 300, status,
      json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)),
      blob: () => Promise.resolve(body) });
  };
  const context = vm.createContext({ window, document: doc, location, history, fetch, Intl, console, setTimeout, clearTimeout, ...globals });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), context, { filename: f });
  return { doc, node, calls, location, heard, window };
}

/* Lets every answered call and what follows it finish. */
export async function settle() {
  for (let i = 0; i < 8; i++) await new Promise((done) => setImmediate(done));
}

export const refused = (code) => ({ error: { code, message: "A message the page does not show." } });
