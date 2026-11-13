/* The shop basket: product ids and quantities only, held in the server-minted `no_cart` cookie (plan z8uq9mek5v R1).
   The browser never holds a price; Django prices the basket on every page (POST shop/quote). The cookie is
   "id.qty~id.qty". Every value read from it is checked again here, so a hand-edited cookie can only ever shrink to
   fewer valid lines.

   Limits are TWCinc's and Django's (backend apps/shop/constants.py): a quantity of 1 to 99 and 20 different products. */
import { CART, CART_MAX_AGE, clearCookie, cookieName, isSecure, readCookieShaped, setCookie } from "./cookies.ts";

export const QTY_MIN = 1;
export const QTY_MAX = 99;
export const MAX_LINES = 20;

export const MSG_BAD_QTY = "Enter a quantity from 1 to 99.";
export const MSG_TOO_MANY_LINES = "A cart holds up to 20 different products.";
export const MSG_BAD_LINE = "Check the products in your cart.";

export type CartLine = { id: string; qty: number };

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const SHAPE = /^[A-Za-z0-9_.~-]{0,1500}$/;

/** The lines of a cookie value: invalid or repeated entries are dropped, at most 20 are kept, a quantity is clamped to 1..99. */
export function parseCart(value: string): CartLine[] {
  const lines: CartLine[] = [];
  for (const part of value.split("~")) {
    const at = part.lastIndexOf(".");
    if (at < 1) continue;
    const id = part.slice(0, at);
    const qty = Number(part.slice(at + 1));
    if (!ID.test(id) || !Number.isInteger(qty) || qty < QTY_MIN) continue;
    if (lines.some((l) => l.id === id)) continue;
    if (lines.length >= MAX_LINES) break;
    lines.push({ id, qty: Math.min(qty, QTY_MAX) });
  }
  return lines;
}

export function serializeCart(lines: CartLine[]): string {
  return lines.map((l) => `${l.id}.${l.qty}`).join("~");
}

export function readCart(request: Request): CartLine[] {
  const raw = readCookieShaped(request.headers.get("cookie"), cookieName(CART, isSecure(request)), SHAPE);
  return raw ? parseCart(raw) : [];
}

/** Writes the basket's cookie (sliding 7 days), or clears it when the basket is empty. */
export function writeCart(response: Response, request: Request, lines: CartLine[]): void {
  if (lines.length === 0) clearCookie(response, request, CART);
  else setCookie(response, request, CART, serializeCart(lines), CART_MAX_AGE);
}

/** The number of items, as the drawer says it: "1 item", "3 items". */
export function countOf(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

export type CartChange = { action: "add" | "set" | "remove"; id: string; qty: number };

/** One change posted to /cart/. A refusal returns the lines untouched with the message to show. */
export function applyChange(lines: CartLine[], change: CartChange): { lines: CartLine[]; error: string } {
  if (!ID.test(change.id)) return { lines, error: MSG_BAD_LINE };
  const at = lines.findIndex((l) => l.id === change.id);
  if (change.action === "remove") return { lines: lines.filter((l) => l.id !== change.id), error: "" };
  if (!Number.isInteger(change.qty) || change.qty < QTY_MIN || change.qty > QTY_MAX) return { lines, error: MSG_BAD_QTY };
  if (change.action === "set") {
    if (at < 0) return { lines, error: MSG_BAD_LINE };
    return { lines: lines.map((l, i) => (i === at ? { id: l.id, qty: change.qty } : l)), error: "" };
  }
  // add: a product already in the basket takes the quantity on top (never above 99); a new one needs a free line
  if (at >= 0) return { lines: lines.map((l, i) => (i === at ? { id: l.id, qty: Math.min(QTY_MAX, l.qty + change.qty) } : l)), error: "" };
  if (lines.length >= MAX_LINES) return { lines, error: MSG_TOO_MANY_LINES };
  return { lines: [...lines, { id: change.id, qty: change.qty }], error: "" };
}
