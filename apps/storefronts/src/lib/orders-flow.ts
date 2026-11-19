/* The member Orders log: the list, the add and edit forms, the delete and the CSV export (plan z8uq9meze0, M5').
   The log is the member's own notebook of Santé app orders, shown here and kept by Django per member and site; nothing here creates a
   web order. Same rules as address-flow.ts: the member session is this server's cookie passed as data; a 401 clears it and goes to
   the store home; a rejected order locks the dashboard to My Purchases; a 404 (the log is off, the host is not served, or an id that
   is not this member's) is the neutral page. The filters are query parameters (q, status, from, to, page) carried into every link. */
import { lockedHome, session, signedOut, tryAgain, type Dash } from "./dashboard-flow.ts";
import { mobileApps } from "./env.ts";
import { htmlResponse } from "./html.ts";
import { redirect } from "./member.ts";
import {
  FIELDS, STATUSES, memberOrderCreate, memberOrderDelete, memberOrderGet, memberOrderList, memberOrderUpdate, memberOrdersCsv,
  type Filters, type OrderFields,
} from "./orders-api.ts";
import type { PackRefusal } from "./pack-api.ts";
import { MSG_CHECK_FIELDS } from "./shop-flow-text.ts";
import { neutralNotFound } from "../views/neutral.ts";
import { chrome, memberDocument } from "../views/sante/member.ts";
import { EMPTY_ORDER, ORDERS_PATH, SAVED_NOTICES, ordersContent, orderFormContent, type FormPage } from "../views/sante/member-orders.ts";
import type { Markup } from "./html.ts";

export const ORDER_ID = /^mol_[A-Za-z0-9_-]{1,60}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_SAVED = "Your order could not be saved. Please try again shortly.";
const PAYMENTS: string[] = ["cod", "prepaid"];
const FULL = "Your log is full.";

const manilaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
const todayOf = (d: Dash): string => manilaDay.format(d.now ?? new Date());

/** The filters of a request's query string; anything malformed is left out, so the backend is never sent a bad one. */
export function filtersOf(params: URLSearchParams): { filters: Filters; page: number } {
  const filters: Filters = {};
  const q = (params.get("q") ?? "").trim().slice(0, 60);
  if (q) filters.q = q;
  const status = params.get("status") ?? "";
  if ((STATUSES as readonly string[]).includes(status)) filters.status = status;
  const from = params.get("from") ?? "";
  if (DATE.test(from)) filters.date_from = from;
  const to = params.get("to") ?? "";
  if (DATE.test(to)) filters.date_to = to;
  const n = Number(params.get("page") ?? "1");
  return { filters, page: Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1 };
}

const who = (d: Dash) => ({ host: d.call.host, token: d.call.member_token });
const urlOf = (d: Dash) => new URL(d.call.request.url);

type Gate = { name: string } | { response: Response };

async function gate(d: Dash): Promise<Gate> {
  const s = await session(d);
  if ("response" in s) return { response: s.response };
  const locked = await lockedHome(d);
  if (locked) return { response: locked };
  return { name: s.member.full_name };
}

function page(d: Dash, name: string, title: string, content: Markup, status = 200): Response {
  const select = { scripts: ["js/pack-select.js"], styles: ["css/pack-select.css"] };
  return htmlResponse(memberDocument(chrome(d.site, d.now), { title, member: name, current: "orders", content, ...select }), status);
}

/** What a refused or failed call ends in, when the caller has nothing of its own to show. */
function ended(d: Dash, r: { state: "refused"; status: number } | { state: "unavailable" } | { state: "failed" }): Response {
  if (r.state === "unavailable") return neutralNotFound();
  if (r.state === "refused" && r.status === 401) return signedOut(d);
  return tryAgain();
}

/** GET /dashboard/orders/: the member's log, with the app line and the app button kept at the top. */
export async function ordersPage(d: Dash): Promise<Response> {
  const g = await gate(d);
  if ("response" in g) return g.response;
  const params = urlOf(d).searchParams;
  const { filters, page: n } = filtersOf(params);
  const r = await memberOrderList({ ...who(d), filters, page: n }, d.calls);
  if (r.state !== "ok") return ended(d, r);
  const saved = params.get("saved") ?? "";
  return page(d, g.name, "Orders", ordersContent({ list: r, filters, appUrl: d.appUrl ?? mobileApps(), saved: Object.hasOwn(SAVED_NOTICES, saved) ? saved : "", now: d.now ?? new Date() }));
}

function formPage(d: Dash, name: string, p: Partial<FormPage> & { id: string | null; values: OrderFields }, status = 200): Response {
  const full: FormPage = { field_errors: {}, error_message: "", today: todayOf(d), ...p };
  return page(d, name, p.id === null ? "Add order" : "Edit order", orderFormContent(full), status);
}

/** The typed values, as typed (trimmed): they go back into the form on an error and to the backend on a save. */
function typed(text: Record<string, string>): OrderFields {
  return Object.fromEntries(FIELDS.map((k) => [k, (text[k] ?? "").trim()])) as OrderFields;
}

export async function orderAddGet(d: Dash): Promise<Response> {
  const g = await gate(d);
  if ("response" in g) return g.response;
  return formPage(d, g.name, { id: null, values: EMPTY_ORDER(todayOf(d)) });
}

/** A refused save, shown where it came from: the field messages beside their fields, the rest in a note above the form. */
function refusedForm(d: Dash, name: string, id: string | null, values: OrderFields, r: PackRefusal): Response {
  if (r.status === 401) return signedOut(d);
  const known = Object.fromEntries(Object.entries(r.fields).filter(([k]) => (FIELDS as readonly string[]).includes(k)));
  const message = r.code === "order_log_full" ? (r.message || FULL) : Object.keys(known).length ? MSG_CHECK_FIELDS : (r.message || NOT_SAVED);
  return formPage(d, name, { id, values, field_errors: known, error_message: message }, r.status === 429 ? 429 : r.status === 409 && r.code === "order_log_full" ? 409 : 400);
}

/** Payment and Status must be chosen: an empty choice is answered here with a plain message, with no call to the backend. */
function unchosen(values: OrderFields): Record<string, string> {
  const out: Record<string, string> = {};
  if (!PAYMENTS.includes(values.payment)) out.payment = "Choose a payment.";
  if (!(STATUSES as readonly string[]).includes(values.status)) out.status = "Choose a status.";
  return out;
}

export async function orderAddPost(d: Dash, text: Record<string, string>): Promise<Response> {
  const g = await gate(d);
  if ("response" in g) return g.response;
  const values = typed(text);
  const missing = unchosen(values);
  if (Object.keys(missing).length) return formPage(d, g.name, { id: null, values, field_errors: missing, error_message: MSG_CHECK_FIELDS }, 400);
  const r = await memberOrderCreate({ ...who(d), fields: values }, d.calls);
  if (r.state === "ok") return redirect(`${ORDERS_PATH}?saved=added`);
  if (r.state === "unavailable") return neutralNotFound();
  if (r.state === "failed") return formPage(d, g.name, { id: null, values, error_message: NOT_SAVED }, 503);
  return refusedForm(d, g.name, null, values, r);
}

export async function orderEditGet(d: Dash, id: string): Promise<Response> {
  if (!ORDER_ID.test(id)) return neutralNotFound();
  const g = await gate(d);
  if ("response" in g) return g.response;
  const r = await memberOrderGet({ ...who(d), id }, d.calls);
  if (r.state !== "ok") return ended(d, r);
  const o = r.order;
  return formPage(d, g.name, { id: o.id, values: { order_number: o.order_number, ordered_on: o.ordered_on, customer_first_name: o.customer_first_name, city: o.city, payment: o.payment, total: o.total, status: o.status } });
}

export async function orderEditPost(d: Dash, id: string, text: Record<string, string>): Promise<Response> {
  if (!ORDER_ID.test(id)) return neutralNotFound();
  const g = await gate(d);
  if ("response" in g) return g.response;
  const values = typed(text);
  const missing = unchosen(values);
  if (Object.keys(missing).length) return formPage(d, g.name, { id, values, field_errors: missing, error_message: MSG_CHECK_FIELDS }, 400);
  const r = await memberOrderUpdate({ ...who(d), id, fields: values }, d.calls);
  if (r.state === "ok") return redirect(`${ORDERS_PATH}?saved=updated`);
  if (r.state === "unavailable") return neutralNotFound(); // missing, or not this member's: the same answer
  if (r.state === "failed") return formPage(d, g.name, { id, values, error_message: NOT_SAVED }, 503);
  return refusedForm(d, g.name, id, values, r);
}

export async function orderDeletePost(d: Dash, id: string): Promise<Response> {
  if (!ORDER_ID.test(id)) return neutralNotFound();
  const g = await gate(d);
  if ("response" in g) return g.response;
  const r = await memberOrderDelete({ ...who(d), id }, d.calls);
  if (r.state === "ok") return redirect(`${ORDERS_PATH}?saved=deleted`);
  return ended(d, r);
}

const DISPOSITION = /^attachment; filename="orders-\d{4}-\d{2}-\d{2}\.csv"$/;

/** GET /dashboard/orders/export.csv: the backend's CSV of the filtered log, sent on as it came (BOM, escaping and all). */
export async function ordersExport(d: Dash): Promise<Response> {
  const g = await gate(d);
  if ("response" in g) return g.response;
  const { filters } = filtersOf(urlOf(d).searchParams);
  const r = await memberOrdersCsv({ ...who(d), filters }, d.calls);
  if (r.state !== "ok") return ended(d, r);
  const disposition = DISPOSITION.test(r.disposition) ? r.disposition : `attachment; filename="orders-${todayOf(d)}.csv"`;
  return new Response(r.bytes, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disposition, "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex",
    },
  });
}
