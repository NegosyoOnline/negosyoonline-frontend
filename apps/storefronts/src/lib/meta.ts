/* Meta Pixel and Conversions API, storefront side (ClickUp z8uq9md3n5; backend apps/meta_ads).

   Only three pages carry it: the home page, the landing page and the checkout page. Never the one-time access link
   (/funnel/membership-pack/access/*), the member pages, the onboarding steps or the completed page: Meta's script
   sends the page address, and some of those addresses are secrets.

   Nothing loads and nothing is sent before the visitor presses Accept. The choice lives in one first-party cookie
   (no_meta_consent: "1" accepted, "0" declined), set by the notice's own button script (js/meta-pixel.js), which
   reloads the page. Declined or never answered: no Meta script, no data block, no server event, no identifiers on the
   checkout post.

   A page with a Pixel and consent gets:
     - a JSON data block (#no-meta; "<" escaped, so it can never close its tag) holding the Pixel ID and the page's
       events, each with a deduplication id (pv_, vc_ or ic_ + 16 hex): the browser Pixel sends them with eventID, and
       the same ids go to Django (POST /storefront/v1/meta/events/) so Meta pairs the two;
     - the first-party script js/meta-pixel.js (no inline code).
   The server call never delays or breaks a page: it runs after the response (the route passes `send` to Next's
   after()), has a 2 second timeout and swallows every failure. Purchase and AddPaymentInfo are never made here:
   Django builds them from an order. */
import { randomBytes } from "node:crypto";
import { asset } from "./assets.ts";
import { cookieName, isSecure, readCookieShaped } from "./cookies.ts";
import { SECRET_MIN_LENGTH, type Pack, type Site } from "./django.ts";
import type { StorefrontEnv } from "./env.ts";
import { html, safe, type Markup } from "./html.ts";
import { visitorIp } from "./visitor.ts";

export const CONSENT = "no_meta_consent";
export const CONSENT_MAX_AGE = 180 * 24 * 3600;

export type MetaEvent = "PageView" | "ViewContent" | "InitiateCheckout";
const PREFIX: Record<MetaEvent, string> = { PageView: "pv", ViewContent: "vc", InitiateCheckout: "ic" };
export const CONTENT_ID = "membership-pack"; // backend apps/meta_ads/events.py CONTENT_ID

const PIXEL_ID = /^[0-9]{8,20}$/; // the backend's own rule for a saved Pixel ID
const FBP = /^fb\.[0-9]\.[0-9]{10,14}\.[A-Za-z0-9_.-]{1,150}$/; // backend events.FBP_RE
const FBC = /^fb\.[0-9]\.[0-9]{10,14}\.[A-Za-z0-9_-]{1,200}$/; // backend events.FBC_RE
const FBCLID = /^[A-Za-z0-9_-]{1,200}$/;
const EVENTS_TIMEOUT_MS = 2000;

/** A fresh deduplication id: "pv_" + 16 hex (the backend accepts 16 to 32). */
export function metaEventId(name: MetaEvent): string {
  return `${PREFIX[name]}_${randomBytes(8).toString("hex")}`;
}

/** The JSON data block. "<", ">", "&" and the two line separators are escaped, so no value can end the tag or the line. */
export function dataBlock(data: unknown): Markup {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp("\\" + "u2028", "g"), "\\" + "u2028") // built from pieces so no line separator sits in this source
    .replace(new RegExp("\\" + "u2029", "g"), "\\" + "u2029");
  return safe(`<script type="application/json" id="no-meta">${json}</script>`);
}

/** Meta's click cookie value from a ?fbclid= (fb.1.<ms>.<fbclid>), or "" when there is none or it has an odd shape. */
export function buildFbc(fbclid: string | null | undefined, now: Date = new Date()): string {
  if (!fbclid || !FBCLID.test(fbclid)) return "";
  return `fb.1.${now.getTime()}.${fbclid}`;
}

/** The visitor's answer: "accepted", "declined", or "unset" (no cookie, or one with an odd value). */
export function consentChoice(request: Request): "accepted" | "declined" | "unset" {
  const value = readCookieShaped(request.headers.get("cookie"), cookieName(CONSENT, isSecure(request)), /^[01]$/);
  return value === "1" ? "accepted" : value === "0" ? "declined" : "unset";
}

/** True only after Accept. */
export function consentGiven(request: Request): boolean {
  return consentChoice(request) === "accepted";
}

/** The Pixel's own cookies, read from the request (first-party: the Pixel writes them on this host). A value of the
    wrong shape reads as "". */
export function metaCookies(request: Request, now: Date = new Date()): { fbp: string; fbc: string } {
  const header = request.headers.get("cookie");
  const fbp = readCookieShaped(header, "_fbp", FBP);
  let fbc = readCookieShaped(header, "_fbc", FBC);
  if (!fbc) {
    try {
      fbc = buildFbc(new URL(request.url).searchParams.get("fbclid"), now);
    } catch {
      fbc = "";
    }
  }
  return { fbp, fbc };
}

/** This page's address without its query string or fragment. */
export function pageUrl(request: Request): string {
  try {
    const url = new URL(request.url);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

/** The fields the checkout place call adds (backend apps/pack/api.py PlaceIn). "meta_consent" is "1" only after
    Accept; without it nothing else is sent. */
export function placeFields(request: Request, site: Site, now: Date = new Date()): Record<string, string> {
  if (!PIXEL_ID.test(site.meta_pixel_id) || !consentGiven(request)) return {};
  return {
    meta_consent: "1",
    ...metaCookies(request, now),
    user_agent: (request.headers.get("user-agent") ?? "").slice(0, 400),
    source_url: pageUrl(request),
  };
}

/* The notice. Provisional wording (the final words go with the Privacy Policy amendment, NPC task z8uq9md3n8): bare. */
export const NOTICE_TEXT = "We use Meta tools to measure visits and improve our ads. Allow this?";
export const NOTICE_ACCEPT = "Accept";
export const NOTICE_DECLINE = "Decline";
export const NOTICE_LABEL = "Tracking notice";

function notice(request: Request): Markup {
  const secure = isSecure(request);
  return html`
<div id="no-meta-notice" role="region" aria-label="${NOTICE_LABEL}" data-cookie="${cookieName(CONSENT, secure)}" data-max-age="${CONSENT_MAX_AGE}" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483000;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;padding:12px 16px;background:#fff;color:#1f2937;border-top:1px solid #d1d5db;font:14px/1.4 system-ui,sans-serif">
  <span>${NOTICE_TEXT}</span>
  <button type="button" data-meta-choice="1" style="padding:8px 18px;border:1px solid #03572d;border-radius:999px;background:#03572d;color:#fff;font:inherit;font-weight:600;cursor:pointer">${NOTICE_ACCEPT}</button>
  <button type="button" data-meta-choice="0" style="padding:8px 18px;border:1px solid #6b7280;border-radius:999px;background:#fff;color:#1f2937;font:inherit;font-weight:600;cursor:pointer">${NOTICE_DECLINE}</button>
</div>
<script src="${asset("js/meta-pixel.js")}"></script>
`;
}

export type MetaPage = {
  /** What the page adds just before </body>: the notice, or the data block and the script, or nothing. */
  markup: Markup;
  /** The server events call, to run after the response (Next's after()), or null when nothing is to be sent. */
  send: (() => Promise<void>) | null;
};

const NONE: MetaPage = { markup: safe(""), send: null };

export type MetaPageArgs = {
  request: Request;
  site: Site;
  host: string;
  env: Pick<StorefrontEnv, "apiBase" | "secret">;
  events: MetaEvent[];
  /** The pack, for the price on ViewContent and InitiateCheckout. */
  pack?: Pack;
  checkout?: boolean;
  now?: Date;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  log?: (reason: string) => void;
};

const logMeta = (reason: string) => console.error(`storefront: meta events not sent: ${reason}`);

export function metaPage(a: MetaPageArgs): MetaPage {
  if (!PIXEL_ID.test(a.site.meta_pixel_id)) return NONE;
  const choice = consentChoice(a.request);
  if (choice === "declined") return NONE;
  if (choice === "unset") return { markup: notice(a.request), send: null };
  const events = a.events.map((name) => {
    const id = metaEventId(name);
    const data =
      name === "PageView" || !a.pack
        ? {}
        : {
            content_type: "product", content_ids: [CONTENT_ID],
            value: Math.round(a.pack.price_centavos) / 100, currency: a.pack.currency,
          };
    return { name, id, data };
  });
  const block = dataBlock({ pixel_id: a.site.meta_pixel_id, checkout: a.checkout === true, events });
  const markup = html`${block}<script src="${asset("js/meta-pixel.js")}"></script>`;
  const cookies = metaCookies(a.request, a.now);
  const body = {
    host: a.host,
    events: events.map(({ name, id }) => ({ name, id })),
    url: pageUrl(a.request),
    fbp: cookies.fbp,
    fbc: cookies.fbc,
    ip: visitorIp(a.request.headers),
    user_agent: (a.request.headers.get("user-agent") ?? "").slice(0, 400),
    consent: true,
  };
  return { markup, send: () => sendEvents(body, a.env, a.fetchImpl, a.log) };
}

/** Runs the server events call after the response is sent (Next's after()). Next is imported here, not at the top,
    because the route tests run these handlers under plain Node, where "next/server" cannot be loaded; there, and
    anywhere after() is unavailable, the call simply starts without being waited for. It never throws. */
export async function afterResponse(send: () => Promise<void>): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(send);
  } catch {
    void send();
  }
}

/** POST /storefront/v1/meta/events/. Never throws, never waits longer than 2 seconds, logs a reason only (no value). */
export async function sendEvents(
  body: Record<string, unknown>,
  env: Pick<StorefrontEnv, "apiBase" | "secret">,
  fetchImpl: (url: string, init: RequestInit) => Promise<Response> = fetch,
  log: (reason: string) => void = logMeta,
): Promise<void> {
  if (env.secret.length < SECRET_MIN_LENGTH) return;
  try {
    const response = await fetchImpl(`${env.apiBase}/storefront/v1/meta/events/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.secret}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(EVENTS_TIMEOUT_MS),
    });
    if (response.status !== 200 && response.status !== 404) log(`the API answered ${response.status}`);
  } catch {
    log("the API could not be reached in time");
  }
}
