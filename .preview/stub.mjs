/* Local stub of the staff routes for the Receiving accounts page preview (z8uq9metz0). In memory, made-up data only.
   node stub.mjs <port> <hq-origin>   e.g. node stub.mjs 3562 http://hq.negosyotest.com:3561 */
import http from "node:http";
const port = Number(process.argv[2] || 3562), origin = process.argv[3] || "http://hq.negosyotest.com:3561";
const seed = () => [
  { id: "rca_stub_bank", kind: "bank", provider_name: "Sample Bank", account_name: "Sample Account Name", account_number: "0000 0000 01", active: true, sort_order: 0 },
  { id: "rca_stub_wallet", kind: "ewallet", provider_name: "Sample Wallet", account_name: "Sample Wallet Name", account_number: "0900 000 0002", active: true, sort_order: 1 },
];
let rows = seed(), n = 0;
const now = () => new Date().toISOString();
const full = (r) => ({ ...r, created_at: "2026-11-13T09:00:00+08:00", updated_at: now(), updated_by: "stub.staff@example.test" });
const err = (res, status, code, fields = {}) => send(res, status, { error: { code, message: "Stub message.", fields } });
function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Vary": "Origin" });
  res.end(JSON.stringify(body));
}
const TEXT = { provider_name: 60, account_name: 120, account_number: 40 };
function check(b, partial) {
  const f = {};
  if ((!partial || "kind" in b) && !["bank", "ewallet"].includes(b.kind)) f.kind = ["Choose bank or ewallet."];
  for (const [k, max] of Object.entries(TEXT)) if (!partial || k in b) if (typeof b[k] !== "string" || !b[k].trim() || b[k].trim().length > max) f[k] = ["Invalid."];
  if (typeof b.account_number === "string" && !/^[0-9 -]{6,40}$/.test(b.account_number.trim())) f.account_number = ["Digits, spaces and dashes, 6 to 40."];
  if ("sort_order" in b && !(Number.isInteger(b.sort_order) && b.sort_order >= 0 && b.sort_order <= 999)) f.sort_order = ["0 to 999."];
  return f;
}
const dup = (b, except) => rows.some((r) => r.id !== except && r.provider_name === b.provider_name.trim() && r.account_number === b.account_number.trim());
const active = () => rows.filter((r) => r.active).length;
const order = () => rows.sort((a, c) => a.sort_order - c.sort_order);
http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Vary": "Origin" });
    return res.end();
  }
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    const url = req.url.split("?")[0];
    let b = {};
    try { b = raw ? JSON.parse(raw) : {}; } catch { return err(res, 400, "invalid_request"); }
    if (req.method === "GET" && url === "/staff/v1/me/") return send(res, 200, { email: "stub.staff@example.test", expires_at: "2099-01-01T00:00:00+08:00" });
    if (req.method === "POST" && url === "/__reset") { rows = seed(); return send(res, 200, {}); }
    if (req.method !== "POST") return err(res, 404, "not_found");
    if (url === "/staff/v1/finance/accounts/list/") {
      return send(res, 200, { items: order().map(full), bank_transfer: { switch_on: true, store_available: true, active_accounts: active(), live: active() > 0 } });
    }
    if (url === "/staff/v1/finance/accounts/add/") {
      const f = check(b, false);
      if (Object.keys(f).length) return err(res, 400, "invalid_request", f);
      if (dup(b)) return err(res, 409, "account_exists");
      const r = { id: "rca_stub_" + (++n), kind: b.kind, provider_name: b.provider_name.trim(), account_name: b.account_name.trim(), account_number: b.account_number.trim(),
        active: b.active !== false, sort_order: b.sort_order ?? 0 };
      rows.push(r);
      return send(res, 200, full(r));
    }
    const r = rows.find((x) => x.id === b.account);
    if (url === "/staff/v1/finance/accounts/edit/") {
      if (!r) return err(res, 404, "not_found");
      const f = check(b, true);
      if (Object.keys(f).length) return err(res, 400, "invalid_request", f);
      const next = { ...r };
      for (const k of ["kind", "provider_name", "account_name", "account_number", "sort_order"]) if (k in b) next[k] = typeof b[k] === "string" ? b[k].trim() : b[k];
      if (dup(next, r.id)) return err(res, 409, "account_exists");
      Object.assign(r, next);
      return send(res, 200, full(r));
    }
    if (url === "/staff/v1/finance/accounts/active/") {
      if (!r || typeof b.active !== "boolean") return err(res, r ? 400 : 404, r ? "invalid_request" : "not_found");
      if (!b.active && r.active && active() === 1) return err(res, 409, "last_active_account");
      r.active = b.active;
      return send(res, 200, full(r));
    }
    return err(res, 404, "not_found");
  });
}).listen(port, () => console.log("stub on " + port + " for " + origin));
