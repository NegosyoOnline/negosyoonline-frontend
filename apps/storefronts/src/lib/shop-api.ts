/* The shop calls to Django (backend apps/shop/api.py and apps/catalog/storefront_api.py), all under /storefront/v1/ of the
   storefront surface and all with the server credential. Same rules as src/lib/pack-api.ts: a missing secret, a timeout, an
   answer of the wrong shape or a status not listed there is "failed"; 404 is "unavailable" (the shop is off, or the host is
   not a served Santé site). The member session and the order's view token travel as data. The browser never sends a price:
   a quote or an order carries product ids, quantities, the ship mode and an address, and Django prices them.
   Nothing a visitor typed, no token and no file is ever logged. */
import { SECRET_MIN_LENGTH } from "./django.ts";
import { addressZip, packPost, type Calls, type PackResult } from "./pack-api.ts";

const TIMEOUT_MS = 10000;
const PLACE_TIMEOUT_MS = 30000;
const logShop = (reason: string) => console.error(`storefront: shop call failed: ${reason}`);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const int = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/* ---- the catalog ---------------------------------------------------------------------------------------------- */

export type CatalogProduct = {
  id: string; code: string; name: string; category: string; short_description: string; long_description: string;
  image_url: string; srp_centavos: number; unit_members_price_centavos: number; revision: number;
  /** The four detail texts and the five photo slots (slot 1 first, "" where empty). An older API without them gives empty ones. */
  features: string; specifications: string; advantages: string; benefits: string; image_urls: string[];
};

function parseProduct(v: unknown): CatalogProduct | null {
  if (!record(v) || typeof v.id !== "string" || typeof v.code !== "string" || typeof v.name !== "string" || typeof v.srp_centavos !== "number") return null;
  return {
    id: v.id, code: v.code, name: v.name, category: str(v.category), short_description: str(v.short_description),
    long_description: str(v.long_description), image_url: str(v.image_url), srp_centavos: int(v.srp_centavos),
    unit_members_price_centavos: int(v.unit_members_price_centavos), revision: int(v.revision),
    features: str(v.features), specifications: str(v.specifications), advantages: str(v.advantages), benefits: str(v.benefits),
    image_urls: Array.from({ length: 5 }, (_, i) => str(arr(v.image_urls)[i]) || (i === 0 ? str(v.image_url) : "")),
  };
}

/** The active products in the shop's own order, or null: the shop is off or not this host's (the everyday answer, not logged), or the API failed. */
export async function fetchCatalog(host: string, c: Calls): Promise<CatalogProduct[] | null> {
  const log = c.log ?? logShop;
  if (!host || c.env.secret.length < SECRET_MIN_LENGTH) return null;
  try {
    const response = await (c.fetchImpl ?? fetch)(`${c.env.apiBase}/storefront/v1/catalog/products/?host=${encodeURIComponent(host)}`, {
      headers: { Authorization: `Bearer ${c.env.secret}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return null;
    if (response.status !== 200) {
      log(`the API answered ${response.status} for the catalog`);
      return null;
    }
    const body: unknown = await response.json();
    if (!record(body) || !Array.isArray(body.products)) return null;
    return body.products.flatMap((p) => { const k = parseProduct(p); return k ? [k] : []; });
  } catch {
    log("the catalog could not be read");
    return null;
  }
}

/* ---- the quote ------------------------------------------------------------------------------------------------ */

export type QuoteLine = {
  id: string; code: string; name: string; quantity: number; available: boolean; error: string;
  unit_srp_centavos: number; unit_members_price_centavos: number | null; line_total_centavos: number;
};
export type Quote = {
  ok: boolean; member_price: boolean; ship_mode: string; lines: QuoteLine[]; subtotal_centavos: number;
  shipping: { charged_centavos: number; policy: string; estimated: boolean; available: boolean; error: string; note: string };
  total_centavos: number; fingerprint: string; errors: string[];
  /** The member's saved delivery address ("Ship to my address"); null when they have none, absent from an older backend. */
  home_address?: Address | null;
  /** Where that address came from: "profile", "pack_order" or "". */
  home_address_source?: string;
  /** True while the member's home address cannot be changed (a recovery hold); absent from an older backend, which means "not locked". */
  home_address_locked?: boolean;
};

export type Address = { line: string; barangay: string; city: string; province: string; zip: string; landmark: string };

/** An address with a street line, or null (absent, null, not an object or no line). */
function parseAddress(v: unknown): Address | null {
  if (!record(v) || str(v.line).trim() === "") return null;
  return { line: str(v.line), barangay: str(v.barangay), city: str(v.city), province: str(v.province), zip: str(v.zip), landmark: str(v.landmark) };
}

function parseQuote(b: unknown): Quote | null {
  if (!record(b) || !Array.isArray(b.lines) || !record(b.shipping) || typeof b.total_centavos !== "number" || typeof b.subtotal_centavos !== "number") return null;
  const s = b.shipping;
  const lines: QuoteLine[] = [];
  for (const l of b.lines) {
    if (!record(l) || typeof l.id !== "string" || typeof l.line_total_centavos !== "number") return null;
    lines.push({
      id: l.id, code: str(l.code), name: str(l.name), quantity: int(l.quantity), available: l.available === true, error: str(l.error),
      unit_srp_centavos: int(l.unit_srp_centavos), unit_members_price_centavos: typeof l.unit_members_price_centavos === "number" ? int(l.unit_members_price_centavos) : null,
      line_total_centavos: int(l.line_total_centavos),
    });
  }
  return {
    ok: b.ok === true, member_price: b.member_price === true, ship_mode: str(b.ship_mode), lines,
    subtotal_centavos: int(b.subtotal_centavos), total_centavos: int(b.total_centavos), fingerprint: str(b.fingerprint),
    errors: arr(b.errors).filter((e): e is string => typeof e === "string"),
    home_address: parseAddress(b.home_address), home_address_source: str(b.home_address_source),
    home_address_locked: b.home_address_locked === true,
    shipping: {
      charged_centavos: int(s.charged_centavos), policy: str(s.policy), estimated: s.estimated === true, available: s.available !== false,
      error: str(s.error), note: str(s.note),
    },
  };
}

export type QuoteArgs = {
  host: string; visitor_ip: string; lines: { id: string; qty: number }[]; member_token: string; ship_mode: string; address: Address | null;
};

export function shopQuote(args: QuoteArgs, c: Calls): Promise<PackResult<{ quote: Quote }>> {
  const payload: Record<string, unknown> = {
    host: args.host, visitor_ip: args.visitor_ip, lines: args.lines, member_token: args.member_token, ship_mode: args.ship_mode,
  };
  if (args.address) payload.address = args.address;
  return packPost("shop/quote", payload, (b) => { const quote = parseQuote(b); return quote ? { quote } : null; }, c);
}

/* ---- the member's own saved address ---------------------------------------------------------------------------- */

/** POST /storefront/v1/member/address/: the six address keys of the signed-in member. The member is Django's verified session for this
    host, never a field of this body. 422 invalid_address carries the field messages, 423 address_locked a recovery hold, 429 the throttle. */
export function saveHomeAddress(args: { host: string; visitor_ip: string; member_token: string; address: Address }, c: Calls) {
  const { line, barangay, city, province, zip, landmark } = args.address;
  return packPost(
    "member/address",
    { host: args.host, visitor_ip: args.visitor_ip, member_token: args.member_token, line, barangay, city, province, zip, landmark },
    (b) => {
      const address = record(b) ? parseAddress(b.home_address) : null;
      return address ? { address } : null;
    },
    c,
  );
}

/** The ZIP of an address posted without one. The checkout's address form hides the ZIP row while the barangay lookup is the authority
    (pack-address.js clears it), and orders get the ZIP from Django's lookup; the saved address is stored as posted, so the ZIP is filled
    here: the lookup's ZIP when it is exact for the barangay or the city, else the saved ZIP when province, city and barangay are
    unchanged, else left empty. A typed ZIP is never replaced. */
export async function withZip(
  a: Address, saved: Address | null, who: { host: string; visitor_ip: string }, c: Calls,
): Promise<Address> {
  if (a.zip || !a.province || !a.city || !a.barangay) return a;
  const r = await addressZip({ host: who.host, visitor_ip: who.visitor_ip, province: a.province, city: a.city, barangay: a.barangay }, c);
  if (r.state === "ok" && r.ok && /^\d{4}$/.test(r.zip_code) && (r.zip_precision === "barangay" || r.zip_precision === "city_unique")) return { ...a, zip: r.zip_code };
  const same = (x: string, y: string) => x.trim().toLowerCase() === y.trim().toLowerCase();
  if (saved && saved.zip && same(saved.province, a.province) && same(saved.city, a.city) && same(saved.barangay, a.barangay)) return { ...a, zip: saved.zip };
  return a;
}

/* ---- the store's payment accounts ----------------------------------------------------------------------------- */

export type ShopAccount = {
  id: string; kind: string; account_type: string; provider_name: string; account_name: string; account_number: string; has_qr: boolean;
};

/** The active accounts to pay to, [] when the store has none, null when the call failed or the shop is off. */
export async function fetchShopAccounts(host: string, c: Calls): Promise<ShopAccount[] | null> {
  const log = c.log ?? logShop;
  if (!host || c.env.secret.length < SECRET_MIN_LENGTH) return null;
  try {
    const response = await (c.fetchImpl ?? fetch)(`${c.env.apiBase}/storefront/v1/shop/payment-accounts/?host=${encodeURIComponent(host)}`, {
      headers: { Authorization: `Bearer ${c.env.secret}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return null;
    if (response.status !== 200) {
      log(`the API answered ${response.status} for the payment accounts`);
      return null;
    }
    const body: unknown = await response.json();
    if (!record(body) || !Array.isArray(body.accounts)) return null;
    return body.accounts.flatMap((a): ShopAccount[] => record(a) && typeof a.id === "string" ? [{
      id: a.id, kind: str(a.kind), account_type: str(a.account_type), provider_name: str(a.provider_name), account_name: str(a.account_name),
      account_number: str(a.account_number), has_qr: a.has_qr === true,
    }] : []);
  } catch {
    log("the payment accounts could not be read");
    return null;
  }
}

/** A payment account's QR code, sent on from this host. */
export async function fetchShopAccountQr(id: string, host: string, c: Calls): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  if (!host || c.env.secret.length < SECRET_MIN_LENGTH) return null;
  try {
    const response = await (c.fetchImpl ?? fetch)(`${c.env.apiBase}/storefront/v1/shop/payment-accounts/${encodeURIComponent(id)}/qr/?host=${encodeURIComponent(host)}`, {
      headers: { Authorization: `Bearer ${c.env.secret}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status !== 200) return null;
    return { bytes: await response.arrayBuffer(), contentType: response.headers.get("content-type") ?? "" };
  } catch {
    return null;
  }
}

/* ---- placing an order, the done page, My Orders --------------------------------------------------------------- */

export type Placed = { order_id: string; order_number: string; view_token: string; replay: boolean };

/** `form` is the multipart body of the order (src/lib/shop-flow.ts builds it); the proof file rides in it. */
export function shopPlace(form: FormData, c: Calls): Promise<PackResult<Placed>> {
  return packPost(
    "shop/orders", form,
    (b) => (record(b) && typeof b.order_id === "string" && typeof b.order_number === "string" && typeof b.view_token === "string"
      ? { order_id: b.order_id, order_number: b.order_number, view_token: b.view_token, replay: b.replay === true } : null),
    c, PLACE_TIMEOUT_MS,
  );
}

export type BuyerOrder = {
  id: string; order_number: string; status: string; status_label: string; tracker: string[]; cancelled: boolean; created_at: string;
  ship_mode: string; receiver_name: string; delivery_address: Partial<Address>;
  subtotal_centavos: number; shipping_charged_centavos: number; total_centavos: number;
  courier: string; tracking_no: string; shipped_on: string; delivered_on: string;
  lines: { code: string; name: string; quantity: number; line_charged_centavos: number; unit_centavos?: number; image_url?: string }[];
  /* From the parity backend; each is absent from an older one, and the pages then show what they showed before. */
  receiver_mobile?: string; receiver_email?: string; verified_at?: string;
  member_savings_centavos?: number; srp_subtotal_centavos?: number;
};

const optInt = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : undefined);

export function parseBuyerOrder(v: unknown): BuyerOrder | null {
  if (!record(v) || typeof v.id !== "string" || typeof v.order_number !== "string" || typeof v.total_centavos !== "number") return null;
  const a = record(v.delivery_address) ? v.delivery_address : {};
  return {
    id: v.id, order_number: v.order_number, status: str(v.status), status_label: str(v.status_label),
    tracker: arr(v.tracker).filter((t): t is string => typeof t === "string"), cancelled: v.cancelled === true, created_at: str(v.created_at),
    ship_mode: str(v.ship_mode), receiver_name: str(v.receiver_name),
    delivery_address: { line: str(a.line), barangay: str(a.barangay), city: str(a.city), province: str(a.province), zip: str(a.zip), landmark: str(a.landmark) },
    subtotal_centavos: int(v.subtotal_centavos), shipping_charged_centavos: int(v.shipping_charged_centavos), total_centavos: int(v.total_centavos),
    courier: str(v.courier), tracking_no: str(v.tracking_no), shipped_on: str(v.shipped_on), delivered_on: str(v.delivered_on),
    lines: arr(v.lines).flatMap((l) => record(l) ? [{
      code: str(l.code), name: str(l.name), quantity: int(l.quantity), line_charged_centavos: int(l.line_charged_centavos),
      unit_centavos: optInt(l.unit_centavos), image_url: str(l.image_url),
    }] : []),
    receiver_mobile: str(v.receiver_mobile), receiver_email: str(v.receiver_email), verified_at: str(v.verified_at),
    member_savings_centavos: optInt(v.member_savings_centavos), srp_subtotal_centavos: optInt(v.srp_subtotal_centavos),
  };
}

/** The placing buyer's order: the token must match the one Django hashed at placement. A wrong id or token is "unavailable" (404). */
export function shopOrderView(args: { host: string; visitor_ip: string; order_id: string; view_token: string }, c: Calls) {
  const { order_id, ...rest } = args;
  return packPost(`shop/orders/${encodeURIComponent(order_id)}/view`, rest, (b) => { const order = parseBuyerOrder(b); return order ? { order } : null; }, c);
}

/** My Orders: the member's own shop orders, newest first. */
export function memberShopOrders(args: { host: string; token: string }, c: Calls) {
  return packPost("member/shop-orders", args, (b) => (record(b) && Array.isArray(b.cards) ? { cards: b.cards.flatMap((x) => { const o = parseBuyerOrder(x); return o ? [o] : []; }) } : null), c);
}

export type { Calls, PackResult };
