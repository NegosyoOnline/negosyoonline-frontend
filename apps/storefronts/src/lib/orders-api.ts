/* The member Orders log over the storefront API (backend apps/members, routes under /storefront/v1/member/order-log/; contract
   z8uq9meze0). The log is the member's own notebook of Santé app orders: display only, nothing here creates a web order.
   Same rules as src/lib/pack-api.ts: the member session travels as data, a 404 is "unavailable" (members are off, the host is not
   served, or the id is not this member's: one neutral answer), a 401 is "refused", anything else is "failed". Every body holds
   only the keys the contract lists: the backend's schemas are strict. */
import { packPost, type Calls, type PackResult } from "./pack-api.ts";
import { SECRET_MIN_LENGTH } from "./django.ts";

type Who = { host: string; token: string };

export const STATUSES = ["for_approval", "for_booking", "for_pickup", "shipping", "delivered", "closed"] as const;
export type OrderStatus = (typeof STATUSES)[number];
export const PAYMENTS = ["cod", "prepaid"] as const;

export type LogOrder = {
  id: string; order_number: string; ordered_on: string; customer_first_name: string; city: string;
  payment: string; total: string; status: string;
};
export type Tiles = Record<OrderStatus, number>;
export type Header = { orders_this_month: number; sales_this_month: string; delivered_this_month: number; needs_action: number };
export type OrderList = { orders: LogOrder[]; page: number; pages: number; count: number; tiles: Tiles; header: Header };

/** The filters of the list and the export, as the backend names them. */
export type Filters = { q?: string; date_from?: string; date_to?: string; status?: string };
/** The fields of the add and edit forms, as the backend names them. */
export const FIELDS = ["order_number", "ordered_on", "customer_first_name", "city", "payment", "total", "status"] as const;
export type OrderFields = Record<(typeof FIELDS)[number], string>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0);

export function parseOrder(v: unknown): LogOrder | null {
  if (!record(v) || !str(v.id)) return null;
  return {
    id: str(v.id), order_number: str(v.order_number), ordered_on: str(v.ordered_on), customer_first_name: str(v.customer_first_name),
    city: str(v.city), payment: str(v.payment), total: str(v.total), status: str(v.status),
  };
}

function parseList(b: unknown): OrderList | null {
  if (!record(b) || !Array.isArray(b.orders) || !record(b.tiles) || !record(b.header)) return null;
  const tiles = Object.fromEntries(STATUSES.map((s) => [s, num((b.tiles as Record<string, unknown>)[s])])) as Tiles;
  const h = b.header;
  return {
    orders: b.orders.flatMap((o) => { const x = parseOrder(o); return x ? [x] : []; }),
    page: Math.max(1, num(b.page)), pages: Math.max(1, num(b.pages)), count: num(b.count), tiles,
    header: { orders_this_month: num(h.orders_this_month), sales_this_month: str(h.sales_this_month) || "0.00", delivered_this_month: num(h.delivered_this_month), needs_action: num(h.needs_action) },
  };
}

const parseOne = (b: unknown): { order: LogOrder } | null => {
  const order = record(b) ? parseOrder(b.order) : null;
  return order ? { order } : null;
};

/** Only the filters that are set go in the body. */
function filterBody(f: Filters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (v) out[k] = v;
  return out;
}

export function memberOrderList(args: Who & { filters: Filters; page: number }, c: Calls): Promise<PackResult<OrderList>> {
  const { filters, page, ...who } = args;
  return packPost("member/order-log", { ...who, ...filterBody(filters), ...(page > 1 ? { page } : {}) }, parseList, c);
}

export function memberOrderGet(args: Who & { id: string }, c: Calls) {
  const { id, ...who } = args;
  return packPost(`member/order-log/${encodeURIComponent(id)}`, who, parseOne, c);
}

export function memberOrderCreate(args: Who & { fields: OrderFields }, c: Calls) {
  return packPost("member/order-log/create", { host: args.host, token: args.token, ...args.fields }, parseOne, c);
}

export function memberOrderUpdate(args: Who & { id: string; fields: OrderFields }, c: Calls) {
  return packPost(`member/order-log/${encodeURIComponent(args.id)}/update`, { host: args.host, token: args.token, ...args.fields }, parseOne, c);
}

export function memberOrderDelete(args: Who & { id: string }, c: Calls) {
  return packPost(`member/order-log/${encodeURIComponent(args.id)}/delete`, { host: args.host, token: args.token }, (b) => (record(b) && b.deleted === true ? {} : null), c);
}

export type CsvFile = { state: "ok"; bytes: ArrayBuffer; disposition: string } | { state: "refused"; status: number } | { state: "unavailable" } | { state: "failed" };

/** The CSV of the filtered log, fetched here and sent on. */
export async function memberOrdersCsv(args: Who & { filters: Filters }, c: Calls): Promise<CsvFile> {
  const log = c.log ?? ((reason: string) => console.error(`storefront: orders export failed: ${reason}`));
  if (!args.host || !args.token || c.env.secret.length < SECRET_MIN_LENGTH) return { state: "failed" };
  try {
    const response = await (c.fetchImpl ?? fetch)(`${c.env.apiBase}/storefront/v1/member/order-log/export/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.env.secret}`, "Content-Type": "application/json", Accept: "text/csv" },
      body: JSON.stringify({ host: args.host, token: args.token, ...filterBody(args.filters) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 404) return { state: "unavailable" };
    if (response.status === 401 || response.status === 400 || response.status === 429) return { state: "refused", status: response.status };
    if (response.status !== 200) {
      log(`the API answered ${response.status}`);
      return { state: "failed" };
    }
    return { state: "ok", bytes: await response.arrayBuffer(), disposition: response.headers.get("content-disposition") ?? "" };
  } catch {
    log("the export could not be read");
    return { state: "failed" };
  }
}
