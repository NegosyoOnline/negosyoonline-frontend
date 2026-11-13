/* What the invoice register tests share (Billing HQ-F2, ClickUp z8uq9memvq): the page's element ids, the backend's
   answers as fixtures (shapes from apps/invoices/staff.py and services.py on backend main), and a page opener. Not a
   test file: node --test runs only *.test.mjs. */
import assert from "node:assert/strict";
import { open, settle, BASE } from "./page.mjs";

export const IDS = ["boot", "v-queue", "v-sale", "v-closed", "v-down", "retry",
  "tab-ready", "tab-awaiting_upload", "tab-awaiting_verification", "tab-published", "tab-exceptions", "c-ready", "q-msg", "q-loading", "q-groups", "q-empty", "q-limit",
  "s-back", "s-msg", "s-loading", "s-body", "s-site", "s-status", "s-test", "s-serial", "s-amount-l", "s-amount", "s-facts", "s-rejected", "s-lines-box", "s-lines-h", "s-lines",
  "s-exc-box", "s-exc-h", "s-exc", "s-sees-box", "s-sees-h", "s-sees", "s-hist-h", "s-hist", "s-void-row", "s-void",
  "w-card", "w-h", "w-paper", "sc-card", "sc-h", "sc-upload", "sc-file", "sc-hint", "up-err", "sc-loading", "sc-img", "sc-file-tile", "sc-err", "sc-retry", "sc-preview",
  "sc-up-row", "sc-up", "sc-check", "sc-kv", "sc-verify", "sc-reject", "sc-done",
  "rec-card", "rf-h", "rec-form", "r-book", "r-book-hint", "r-book-e", "r-serial", "r-serial-e", "r-issued", "r-issued-hint", "r-issued-e", "r-type", "r-bname", "r-bname-e",
  "r-btin", "r-btin-e", "r-baddr", "r-baddr-e", "r-desc", "r-desc-e", "r-sstart", "r-sstart-e", "r-send", "r-send-e", "r-total", "r-total-e", "r-dkind", "r-dkind-e",
  "r-disc", "r-disc-e", "r-wh", "r-wh-e", "rec-err", "rec-go", "rec-back",
  "m-void", "m-void-h", "m-void-sub", "void-x", "void-form", "void-f", "void-hint", "void-count", "void-e", "void-go", "void-cancel",
  "m-verify", "m-verify-h", "m-verify-sub", "verify-x", "verify-form", "verify-e", "verify-go", "verify-cancel",
  "m-reject", "m-reject-h", "m-reject-sub", "reject-x", "reject-form", "reject-f", "reject-hint", "reject-e", "reject-go", "reject-cancel",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
export const VIEWS = ["boot", "v-queue", "v-sale", "v-closed", "v-down"];
export const ME = { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" };
export const QUEUE = "POST finance/invoices/queue/", DETAIL = "POST finance/invoices/detail/", RECORD = "POST finance/invoices/record/",
  VOID = "POST finance/invoices/void/", SCAN = "POST finance/invoices/scan/", UPLOAD = "POST finance/invoices/upload/",
  VERIFY = "POST finance/invoices/verify/", REJECT = "POST finance/invoices/reject/";

export function entry(over = {}) {
  return { item: "ii_one", status: "pending", site: "site_a", site_name: "Sample Store A", plan: "monthly", total_centavos: 249900, age_days: 3,
    is_test: false, serial: null, exceptions: [{ code: "overdue", days: 3 }], ...over };
}
export const queue = (groups, over = {}) => [200, { notice: "x", filter: "ready", groups, count: groups.reduce((n, g) => n + g.items.length, 0), pending_count: 4, ...over }];
export const grp = (paid_date, ...items) => ({ paid_date, items });

export function invoice(over = {}) {
  return { invoice: "inv_one", serial: "SAMPLE-A0012", series: "SAMPLE-A", serial_number: 12, status: "recorded", issued_on: "2026-11-10", sale_type: "cash",
    buyer_name: "Sample Buyer Name", buyer_tin: "000-000-000-001", buyer_address: "3 Sample Road, Sample City", description: "Sample description",
    service_start: "2026-11-10", service_end: "2026-12-09", total_sales_centavos: 249900, discount_centavos: 0, discount_kind: "", withholding_centavos: 0,
    amount_due_centavos: 249900, void_reason: "", recorded_at: "2026-11-10T17:20:00+08:00", verified_at: null, scans: [], ...over };
}
export function scan(over = {}) {
  return { scan: "sc_one", status: "uploaded", reject_reason: "", content_type: "image/png", size_bytes: 2048, uploaded_at: "2026-11-12T09:02:00+08:00", decided_at: null, ...over };
}
export function detail(over = {}) {
  return { item: "ii_one", status: "pending", is_test: false, site: "site_a", site_name: "Sample Store A", plan: "monthly",
    period_start: "2026-11-10T00:00:00+08:00", period_end: "2026-12-09T00:00:00+08:00", paid_at: "2026-11-10T14:15:00+08:00", sale_date: "2026-11-10",
    age_days: 3, total_centavos: 249900,
    lines: [{ kind: "base", description: "NegosyoOnline SaaS subscription — Monthly Plan, 10 Nov 2026 to 9 Dec 2026", quantity: 1, unit_centavos: 249900, amount_centavos: 249900 }],
    payment: "btp_ref_one", statement: null, notice: "Not shown.",
    suggested: { label: "WRITE THIS ON PAPER",
      header: { legal_name: "Sample Issuer Legal Name", trade_name: "Sample Trade Name", tin: "000-000-000-000", branch_code: "000", address: "1 Sample Street", tax_type: "non_vat" },
      number: "Type the preprinted serial from the paper. The system never assigns one.",
      date: { payment_date: "2026-11-10", issue_date: "Write the day you actually write it. There is no default." },
      sale_type: "cash", sold_to: { name: "Sample Buyer Name", address: "3 Sample Road, Sample City", tin: "000-000-000-001" },
      rows: [{ description: "NegosyoOnline SaaS subscription — Monthly Plan, 10 Nov 2026 to 9 Dec 2026", quantity: 1, unit_centavos: 249900, amount_centavos: 249900 }],
      total_sales_centavos: 249900, deductions: "Leave the discount and withholding boxes empty unless the sale really has one.", signature: "Not filled by the system." },
    exceptions: [{ code: "overdue", days: 3 }], invoices: [],
    books: [{ series: "SAMPLE-A", serial_from: 1, serial_to: 50, serial_width: 4, next_expected_hint: 13 }],
    events: [{ code: "opened", at: "2026-11-10T14:15:00+08:00", by_staff: false }], ...over };
}

/* table: what each route answers, a reply or a function of the call. */
export async function page(table) {
  const made = [], freed = [];
  const URL = { createObjectURL(blob) { made.push(blob); return "blob:held/" + made.length; }, revokeObjectURL(u) { freed.push(u); } };
  const p = open(["hq.js", "shell.js", "finance-common.js", "finance-invoices.js"], { ids: IDS, pathname: "/finance/invoices/", globals: { URL }, answers: (call) => {
    const key = call.method + " " + call.url.slice(BASE.length + 1);
    const reply = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    assert.ok(reply !== undefined, "unexpected call: " + key);
    return typeof reply === "function" ? reply(call) : reply;
  } });
  await settle();
  const shown = () => VIEWS.filter((id) => !p.node[id].hidden);
  const sent = (key) => p.calls.filter((c) => c.method + " " + c.url.slice(BASE.length + 1) === key);
  return { ...p, shown, sent, made, freed };
}

export const rows = (p) => p.node["q-groups"].all((n) => n.tagName === "LI");
export const button = (li) => li.all((n) => n.tagName === "BUTTON")[0];
export const chips = (node) => node.all((n) => (n.getAttribute("class") || "").split(" ").includes("chip")).map((n) => n.textContent);
export async function opened(one = detail(), table = {}) {
  const p = await page({ "GET me/": [200, ME], [QUEUE]: queue([grp("2026-11-10", entry({ item: one.item, status: one.status }))]), [DETAIL]: [200, one], ...table });
  button(rows(p)[0]).fire("click");
  await settle();
  return p;
}
/* The sale's facts as [label, value] pairs. */
export const facts = (p, id = "s-facts") => p.node[id].children.map((d) => [d.children[0].textContent, d.children[1].textContent]);
export const text = (p, id) => p.node[id].textContent;
