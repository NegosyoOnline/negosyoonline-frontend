/* The member Orders log pages: /dashboard/orders/ (the TWCinc merchant Orders layout, app/merchants/templates/merchants/orders.html:
   the hero with the month's figures, the status strip, the toolbar, the table), /dashboard/orders/add/ and /dashboard/orders/<id>/edit/.
   Ported to the member dashboard shell: no Accept, Book, Cancel or courier action, no script. Under 640px each row is a stacked card
   (a CSS table turned into blocks, the cell's data-label as the line's name), so the page never scrolls sideways. */
import { html, safe, type Markup } from "../../lib/html.ts";
import { STATUSES, type Filters, type LogOrder, type OrderFields, type OrderList, type OrderStatus } from "../../lib/orders-api.ts";
import { APP_ORDERS_LINE, appButton, pageHero } from "./member-dash.ts";

export const ORDERS_PATH = "/dashboard/orders/";
export const ORDERS_ADD_PATH = "/dashboard/orders/add/";
export const ORDERS_EXPORT_PATH = "/dashboard/orders/export.csv";
export const editPath = (id: string) => `/dashboard/orders/${id}/edit/`;
export const deletePath = (id: string) => `/dashboard/orders/${id}/delete/`;

export const OWN_LOG_LINE = "This is your own log. Add each order you placed in the app to track it here.";
export const EMPTY_LINE = "No orders in your log yet.";
export const NO_MATCH_LINE = "No orders match these filters.";
export const SAVED_NOTICES: Record<string, string> = { added: "Order added to your log.", updated: "Order updated.", deleted: "Order deleted from your log." };

export const STATUS_LABELS: Record<OrderStatus, string> = {
  for_approval: "For approval", for_booking: "For booking", for_pickup: "For pickup", shipping: "Shipping", delivered: "Delivered", closed: "Closed/other",
};
const TILE_HINTS: Record<OrderStatus, string> = {
  for_approval: "Action needed", for_booking: "Waiting for waybill", for_pickup: "Ready for pickup", shipping: "In transit", delivered: "Delivered", closed: "Rejected, RTS, returned",
};
const TILE_ACCENT: Record<OrderStatus, string> = { for_approval: "gold", for_booking: "indigo", for_pickup: "blue", shipping: "teal", delivered: "green", closed: "dim" };
export const PAYMENT_LABELS: Record<string, string> = { cod: "COD", prepaid: "Prepaid" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-15" -> "Nov 15, 2026", written from the digits so no time zone can move the day. */
export function dateText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** "1450.5" -> "₱1,450.50": the pesos string of the backend, grouped without going through a float. */
export function pesoText(total: string): string {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(total.replace(/,/g, "").trim());
  if (!m) return `₱${total}`;
  return `₱${m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(m[2] ?? "").padEnd(2, "0")}`;
}

/* ---- links: the filters ride in every link ------------------------------------------------------------------------ */

/** The page's query string, from the filters (the URL names are q, status, from, to) and a page number. */
export function query(f: Filters, extra: { page?: number } = {}): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.status) p.set("status", f.status);
  if (f.date_from) p.set("from", f.date_from);
  if (f.date_to) p.set("to", f.date_to);
  if (extra.page && extra.page > 1) p.set("page", String(extra.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* ---- the styles (inline, as the member shell's base styles are) --------------------------------------------------- */

export const MEMBER_ORDERS_CSS = `
.mo-hero{display:grid;gap:16px;margin:0 0 16px;padding:22px 24px;border-radius:16px;background:linear-gradient(135deg,#0B3B24,#145C3A);color:#fff}
.mo-hero p{color:#fff}
.mo-head{display:grid;gap:4px}
.mo-eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.8}
.mo-hero-sub{font-size:14px;opacity:.85;margin:0}
.mo-kpis{display:grid;gap:12px}
.mo-kpi{border-radius:12px;background:rgba(255,255,255,.12);padding:12px 14px}
.mo-kpi-lab{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.85}
.mo-kpi-val{font-size:26px;font-weight:800;line-height:1.2;overflow-wrap:anywhere}
.mo-kpi-note{font-size:12px;opacity:.8}
.mo-kpi.has-work{background:#F2DC8C;color:#3A2A00}
.mo-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.mo-pipe{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 16px}
.mo-stage{display:block;padding:12px 14px;border-radius:12px;border:1px solid var(--line);border-left:5px solid #8A9791;background:var(--card);color:var(--ink);text-decoration:none}
.mo-stage[data-accent="gold"]{border-left-color:#C9A227}.mo-stage[data-accent="indigo"]{border-left-color:#5B5BD6}.mo-stage[data-accent="blue"]{border-left-color:#3B89E0}
.mo-stage[data-accent="teal"]{border-left-color:#1F9E8F}.mo-stage[data-accent="green"]{border-left-color:#1F7A5C}.mo-stage[data-accent="dim"]{border-left-color:#8A9791}
.mo-stage.active{box-shadow:0 0 0 2px var(--accent)}
.mo-stage-count{font-size:22px;font-weight:800;line-height:1.2}
.mo-stage-label{font-weight:700;font-size:14px}
.mo-stage-hint{font-size:12px;color:var(--muted)}
.mo-clear{margin:-6px 0 16px;font-size:14px}
.mo-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin:0 0 16px}
.mo-toolbar form{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;flex:1 1 320px;min-width:0}
.mo-toolbar .fld{margin:0;flex:1 1 150px;min-width:0}
.mo-toolbar .fld.mo-q{flex:2 1 220px}
.mo-toolbar label{font-size:13px}
.mo-toolbar .inp{height:44px}
.mo-actions{display:flex;flex-wrap:wrap;gap:10px}
.mo-wrap .btn{width:auto;min-height:44px}
.mo-tablewrap{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.mo-table{width:100%;border-collapse:collapse;font-size:15px}
.mo-table th{text-align:left;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding:12px 14px;border-bottom:1px solid var(--line)}
.mo-table td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
.mo-table tr:last-child td{border-bottom:0}
.mo-table .r{text-align:right}
.mo-num{font-weight:700}
.mo-status{display:inline-block;border-radius:999px;padding:2px 10px;font-size:13px;font-weight:700;background:#E8F2EE;color:#134A38}
.mo-status-for_approval{background:var(--warnbg);color:var(--warnink)}
.mo-status-delivered{background:#DCEFE6;color:#0F5238}
.mo-status-closed{background:#ECEFED;color:#4B5A53}
.mo-empty{padding:28px 20px;text-align:center}
.mo-pager{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:16px 0 0}
.mo-form{max-width:520px}
.mo-form select.inp{appearance:auto}
.mo-del{margin:20px 0 0;padding:14px 0 0;border-top:1px solid var(--line)}
.mo-del summary{cursor:pointer;color:var(--err);font-weight:600}
.mo-del form{margin:12px 0 0}
.btn.mo-danger{background:var(--err);border-color:var(--err);color:#fff}
@media (min-width:641px){
.mo-hero{grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);align-items:center}
.mo-pipe{grid-template-columns:repeat(6,minmax(0,1fr))}
}
@media (max-width:640px){
.mo-tiles{grid-template-columns:1fr 1fr}
.mo-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.mo-table,.mo-table tbody,.mo-table tr,.mo-table td{display:block;width:100%}
.mo-table tr{padding:12px 14px;border-bottom:1px solid var(--line)}
.mo-table tr:last-child{border-bottom:0}
.mo-table td{display:flex;justify-content:space-between;gap:12px;padding:4px 0;border:0;text-align:right;overflow-wrap:anywhere}
.mo-table td::before{content:attr(data-label);flex:none;color:var(--muted);font-size:13px;font-weight:600;text-align:left}
.mo-table .r{text-align:right}
.mo-actions .btn,.mo-toolbar .btn{flex:1 1 auto}
}
html[data-theme="dark"] .mo-status{background:#22302A;color:#8BE0B8}
html[data-theme="dark"] .mo-status-for_approval{background:var(--warnbg);color:var(--warnink)}
html[data-theme="dark"] .mo-status-delivered{background:#1F3A2D;color:#8BE0B8}
html[data-theme="dark"] .mo-status-closed{background:#242E29;color:#A9B8B0}
html[data-theme="dark"] .e4 .mo-hero{background:linear-gradient(135deg,#0B3B24,#0E4A2E)}
html[data-theme="dark"] .e4 .btn.ghost{background:#17201B;color:#8BE0B8;border-color:#3A4A42}
html[data-theme="dark"] .e4 .mo-del summary{color:#F0968F}
`;

const style = () => html`<style>${safe(MEMBER_ORDERS_CSS)}</style>`;

/* ---- the list --------------------------------------------------------------------------------------------------- */

export type ListPage = { list: OrderList; filters: Filters; appUrl: string; saved: string; now: Date };

const monthLabel = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "long", year: "numeric" });

function hero(p: ListPage): Markup {
  const h = p.list.header;
  return html`<section class="mo-hero" aria-label="This month">
  <div class="mo-head">
    <div class="mo-eyebrow">Your order log</div>
    <p class="mo-hero-sub">${String(p.list.count)} ${p.list.count === 1 ? "order" : "orders"} under current filters</p>
  </div>
  <div class="mo-kpis">
    <div class="mo-kpi"><div class="mo-kpi-lab">Sales this month</div><div class="mo-kpi-val">${pesoText(h.sales_this_month)}</div><div class="mo-kpi-note">${monthLabel.format(p.now)}</div></div>
    <div class="mo-tiles">
      <div class="mo-kpi"><div class="mo-kpi-lab">Orders</div><div class="mo-kpi-val">${String(h.orders_this_month)}</div><div class="mo-kpi-note">this month</div></div>
      <div class="mo-kpi"><div class="mo-kpi-lab">Delivered</div><div class="mo-kpi-val">${String(h.delivered_this_month)}</div><div class="mo-kpi-note">this month</div></div>
      <div class="mo-kpi${h.needs_action ? " has-work" : ""}"><div class="mo-kpi-lab">Needs action</div><div class="mo-kpi-val">${String(h.needs_action)}</div><div class="mo-kpi-note">to approve or book</div></div>
    </div>
  </div>
</section>`;
}

function strip(p: ListPage): Markup {
  const f = p.filters;
  return html`<nav class="mo-pipe" aria-label="Filter by status">${STATUSES.map((s) => {
    const active = f.status === s;
    // The active tile clears the status; the other filters stay.
    const href = ORDERS_PATH + query({ ...f, status: active ? undefined : s });
    return html`<a class="mo-stage${active ? " active" : ""}" data-accent="${TILE_ACCENT[s]}" data-status="${s}" href="${href}"${active ? safe(' aria-current="true"') : ""}>
    <div class="mo-stage-count">${String(p.list.tiles[s])}</div><div class="mo-stage-label">${STATUS_LABELS[s]}</div><div class="mo-stage-hint">${TILE_HINTS[s]}</div></a>`;
  })}</nav>${f.status ? html`<div class="mo-clear"><a class="lnk" href="${ORDERS_PATH + query({ ...f, status: undefined })}">&times; Clear status filter</a></div>` : ""}`;
}

function toolbar(p: ListPage): Markup {
  const f = p.filters;
  return html`<div class="mo-toolbar">
  <form method="get" action="${ORDERS_PATH}" role="search">
    ${f.status ? html`<input type="hidden" name="status" value="${f.status}">` : ""}
    <div class="fld mo-q"><label for="mo-q">Search</label><input id="mo-q" class="inp" type="search" name="q" maxlength="60" value="${f.q ?? ""}" placeholder="PH number or customer first name"></div>
    <div class="fld"><label for="mo-from">From</label><input id="mo-from" class="inp" type="date" name="from" value="${f.date_from ?? ""}" data-pk-date data-placeholder="From date"></div>
    <div class="fld"><label for="mo-to">To</label><input id="mo-to" class="inp" type="date" name="to" value="${f.date_to ?? ""}" data-pk-date data-placeholder="To date"></div>
    <button class="btn ghost" type="submit">Search</button>
  </form>
  <div class="mo-actions">
    <a class="btn ghost" href="${ORDERS_EXPORT_PATH + query(f)}" data-mo="export">Export CSV</a>
    <a class="btn" href="${ORDERS_ADD_PATH}" data-mo="add">Add order</a>
  </div>
</div>`;
}

function row(o: LogOrder): Markup {
  const label = (STATUS_LABELS as Record<string, string>)[o.status] ?? o.status;
  return html`<tr>
  <td data-label="PH #"><a class="lnk mo-num" href="${editPath(o.id)}">${o.order_number}</a></td>
  <td data-label="Date">${dateText(o.ordered_on)}</td>
  <td data-label="Customer">${o.customer_first_name}</td>
  <td data-label="City">${o.city}</td>
  <td data-label="Payment">${PAYMENT_LABELS[o.payment] ?? o.payment}</td>
  <td data-label="Total" class="r">${pesoText(o.total)}</td>
  <td data-label="Status"><span class="mo-status mo-status-${o.status}">${label}</span></td>
</tr>`;
}

function pager(p: ListPage): Markup {
  const { page, pages } = p.list;
  if (pages <= 1) return html``;
  return html`<div class="mo-pager">
  ${page > 1 ? html`<a class="btn ghost" rel="prev" href="${ORDERS_PATH + query(p.filters, { page: page - 1 })}">&larr; Previous</a>` : html`<span></span>`}
  <span>Page ${String(page)} of ${String(pages)}</span>
  ${page < pages ? html`<a class="btn ghost" rel="next" href="${ORDERS_PATH + query(p.filters, { page: page + 1 })}">Next &rarr;</a>` : html`<span></span>`}
</div>`;
}

function body(p: ListPage): Markup {
  const f = p.filters;
  const filtered = !!(f.q || f.status || f.date_from || f.date_to);
  const total = (Object.values(p.list.tiles) as number[]).reduce((a, b) => a + b, 0);
  if (p.list.orders.length === 0) {
    const none = total === 0 && !filtered;
    return html`<div class="mo-tablewrap mo-empty" data-mo="empty"><p>${none ? EMPTY_LINE : NO_MATCH_LINE}</p>${none ? html`<p><a class="btn" href="${ORDERS_ADD_PATH}">Add order</a></p>` : html`<p><a class="lnk" href="${ORDERS_PATH}">Clear all filters</a></p>`}</div>`;
  }
  return html`<div class="mo-tablewrap"><table class="mo-table">
  <thead><tr><th scope="col">PH #</th><th scope="col">Date</th><th scope="col">Customer</th><th scope="col">City</th><th scope="col">Payment</th><th scope="col" class="r">Total</th><th scope="col">Status</th></tr></thead>
  <tbody>${p.list.orders.map(row)}</tbody>
</table></div>${pager(p)}`;
}

export function ordersContent(p: ListPage): Markup {
  return html`${style()}<div class="pd md-plain mo-wrap" data-md-page="orders-log">${pageHero("Orders", "")}
<section class="md-card" data-mo="app">
  <p>${APP_ORDERS_LINE}</p>
  ${appButton(p.appUrl)}
  <p>${OWN_LOG_LINE}</p>
</section>
${SAVED_NOTICES[p.saved] ? html`<div class="note info" role="status">${SAVED_NOTICES[p.saved]}</div>` : ""}
${hero(p)}
${strip(p)}
${toolbar(p)}
${body(p)}
</div>`;
}

/* ---- the add and edit forms ------------------------------------------------------------------------------------- */

export type FormPage = {
  /** null for Add; the order's id for Edit. */
  id: string | null;
  values: OrderFields;
  field_errors: Record<string, string>;
  error_message: string;
  /** The latest date the date box allows (today, Asia/Manila). */
  today: string;
};

export const EMPTY_ORDER = (today: string): OrderFields => ({ order_number: "", ordered_on: today, customer_first_name: "", city: "", payment: "", total: "", status: "" });

const OPTIONS = {
  payment: [["cod", "COD"], ["prepaid", "Prepaid"]],
  status: STATUSES.map((s) => [s, STATUS_LABELS[s]]),
} as const;

function input(p: FormPage, name: keyof OrderFields, label: string, extra: Markup = html``): Markup {
  const msg = p.field_errors[name];
  const id = `mo-${name}`;
  const attrs = html`${msg ? html` aria-invalid="true" aria-describedby="${id}-msg"` : ""}`;
  return html`<div class="fld"><label for="${id}">${label}</label>
<input id="${id}" class="inp${msg ? " bad" : ""}" name="${name}" value="${p.values[name]}" required${extra}${attrs}>
${msg ? html`<p class="err" id="${id}-msg">${msg}</p>` : ""}</div>`;
}

function select(p: FormPage, name: "payment" | "status", label: string): Markup {
  const msg = p.field_errors[name];
  const id = `mo-${name}`;
  return html`<div class="fld"><label for="${id}">${label}</label>
<select id="${id}" class="inp${msg ? " bad" : ""}" name="${name}" data-pk-select data-pk-select-nofilter data-placeholder="${label}"${msg ? html` aria-invalid="true" aria-describedby="${id}-msg"` : ""}>
<option value="">${label}</option>
${OPTIONS[name].map(([v, l]) => html`<option value="${v}"${p.values[name] === v ? safe(" selected") : ""}>${l}</option>`)}
</select>
${msg ? html`<p class="err" id="${id}-msg">${msg}</p>` : ""}</div>`;
}

export function orderFormContent(p: FormPage): Markup {
  const edit = p.id !== null;
  const action = edit ? editPath(p.id as string) : ORDERS_ADD_PATH;
  return html`${style()}<div class="pd md-plain mo-wrap" data-md-page="${edit ? "orders-edit" : "orders-add"}">${pageHero(edit ? "Edit order" : "Add order", "Orders you placed in the Santé Mobile App.")}
<section class="md-card mo-form">
${p.error_message ? html`<div class="note bad" role="alert">${p.error_message}</div>` : ""}
<form method="post" action="${action}">
${input(p, "order_number", "PH #", html` maxlength="32" autocapitalize="characters" autocomplete="off" placeholder="PH-000123"`)}
${input(p, "ordered_on", "Order date", html` type="date" min="2007-01-01" max="${p.today}" data-pk-date data-placeholder="Order date"`)}
${input(p, "customer_first_name", "Customer first name", html` maxlength="60" autocomplete="off"`)}
${input(p, "city", "City", html` maxlength="80" autocomplete="off"`)}
${select(p, "payment", "Payment")}
${input(p, "total", "Total (pesos)", html` inputmode="decimal" autocomplete="off" placeholder="1450.00"`)}
${select(p, "status", "Status")}
<button class="btn" type="submit">${edit ? "Save changes" : "Add order"}</button>
</form>
${edit ? html`<details class="mo-del" data-mo="delete"><summary>Delete this order</summary>
<p>Delete this order from your log?</p>
<form method="post" action="${deletePath(p.id as string)}"><button class="btn mo-danger" type="submit">Yes, delete it</button></form>
</details>` : ""}
<p style="margin:14px 0 0"><a class="lnk" href="${ORDERS_PATH}">Back to orders</a></p>
</section></div>`;
}
