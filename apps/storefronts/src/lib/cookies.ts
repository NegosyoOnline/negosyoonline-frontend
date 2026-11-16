/* The member cookies, minted by this server, never by Django. They are host-only (no Domain), HttpOnly,
   SameSite=Lax, Path=/, and Secure with the __Host- prefix on https. Under a local http address the plain names
   are used (a browser refuses Secure and __Host- cookies there), as TWCinc's DEBUG branch does.

   no_member       the signed-in session, 30 days, fixed: use never extends it
   no_member_pre   the sign-in attempt's binding, 600 seconds: a code is good only in the browser it was asked from
   no_checkout     the checkout token, 2 hours, sliding (set by the checkout slice; the name and lifetime live here)
   no_cart         the shop basket: product id and quantity only ("id.qty~id.qty"), 7 days, sliding (src/lib/shop-cart.ts)
   no_order        the placing buyer's key to the order-done page ("orderid.token"), 2 hours (src/lib/shop-flow.ts)
   no_chat         the website chat visitor's secret (43 characters), 30 days idle: every chat answer sets it again (src/lib/chat-flow.ts)

   The raw value goes to Django as data, which stores only its SHA-256. Reading is by exact name: a name that
   arrives twice is refused (a sibling host could have set the second), and so is a value of the wrong shape. */
import { randomBytes } from "node:crypto";

export const MEMBER = "no_member";
export const MEMBER_PRE = "no_member_pre";
export const CHECKOUT = "no_checkout";

export const CART = "no_cart";
export const ORDER = "no_order";
export const CHAT = "no_chat";

export const MEMBER_MAX_AGE = 30 * 24 * 3600;
export const MEMBER_PRE_MAX_AGE = 600;
export const CHECKOUT_MAX_AGE = 2 * 3600;
export const CART_MAX_AGE = 7 * 24 * 3600;
export const ORDER_MAX_AGE = 2 * 3600;
export const CHAT_MAX_AGE = 30 * 24 * 3600;

const VALUE = /^[A-Za-z0-9_-]{16,200}$/; // what Django accepts as a binding, and what the tokens look like

/** True when the request came in over https. Vercel sets x-forwarded-proto; a local run has the plain url. */
export function isSecure(request: Request): boolean {
  const forwarded = (request.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function cookieName(base: string, secure: boolean): string {
  return secure ? `__Host-${base}` : base;
}

/** The value of the one cookie with exactly this name, or "" for none, a duplicate or a malformed value. */
export function readCookie(header: string | null, name: string): string {
  return readCookieShaped(header, name, VALUE);
}

/** The same exact-name, once-only read, for a value of another shape (the basket and order cookies). */
export function readCookieShaped(header: string | null, name: string, shape: RegExp): string {
  if (!header) return "";
  let found = "";
  let count = 0;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    if (part.slice(0, at).trim() !== name) continue;
    count += 1;
    found = part.slice(at + 1).trim();
  }
  if (count !== 1) return "";
  return shape.test(found) ? found : "";
}

export function readMemberCookie(request: Request, base: string): string {
  return readCookie(request.headers.get("cookie"), cookieName(base, isSecure(request)));
}

/** A fresh random value, long enough for Django's 16-character rule. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function serialize(name: string, value: string, maxAge: number, secure: boolean): string {
  const parts = [`${name}=${value}`, "Path=/", `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function setCookie(response: Response, request: Request, base: string, value: string, maxAge: number): void {
  const secure = isSecure(request);
  response.headers.append("Set-Cookie", serialize(cookieName(base, secure), value, maxAge, secure));
}

export function clearCookie(response: Response, request: Request, base: string): void {
  const secure = isSecure(request);
  response.headers.append("Set-Cookie", serialize(cookieName(base, secure), "", 0, secure));
}

/** Every POST: it must come from a page of this same host. Sec-Fetch-Site says so when the browser sends it;
    otherwise the Origin header must name this host. With neither, the post is refused. This is the protection
    Django's CSRF token gives its own forms, without a token in the page. */
export function sameOriginPost(request: Request, host: string): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (origin !== null) {
    try {
      return new URL(origin).host.toLowerCase() === host.toLowerCase();
    } catch {
      return false;
    }
  }
  return site === "same-origin";
}
