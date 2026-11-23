/* Meta Pixel and Conversions API, storefront side (ClickUp z8uq9md3n5; backend apps/meta_ads).

   Only three pages carry the notice and the page events: the home page, the landing page and the checkout page. Never the
   one-time access link (/funnel/membership-pack/access/*), the member pages, the onboarding steps or the completed page:
   Meta's script sends the page address, and some of those addresses are secrets.

   The one exception (ClickUp z8uq9mfh12, Coach Ed 2026-11-15, "Fire at onboarding"): the onboarding verify page
   (GET /funnel/membership-pack/onboarding/verify/) carries one Purchase event, once per order, and only when the
   consent cookie is already "1". Its address is a fixed path (the buyer's state is in the checkout cookie, not the URL),
   so no secret goes to Meta. It never shows the notice, and the other onboarding steps, the access link and the
   completed page stay free of Meta. See onboardingPurchase below.

   Nothing loads and nothing is sent before the visitor presses Accept. The choice lives in one first-party cookie
   (no_meta_consent: "1" accepted, "0" declined), set by the notice's own button script (js/meta-pixel.js), which
   reloads the page. Declined or never answered: no Meta script, no data block, no server event, no identifiers on the
   checkout post.

   A page with a Pixel and consent gets:
     - a JSON data block (#no-meta; "<" escaped, so it can never close its tag) holding the Pixel ID and the page's
       events, each with a deduplication id (pv_, vc_ or ic_ + 16 hex): the browser Pixel sends them with eventID, and
       the same ids go to Django (POST /storefront/v1/meta/events/) so Meta pairs the two. PageView is sent by both the
       browser and the server with one shared id and no custom data, like ViewContent and InitiateCheckout (Coach Ed,
       2026-11-17, ClickUp z8uq9mfzx3; this supersedes the browser-only PageView of 2026-11-15);
     - the first-party script js/meta-pixel.js (no inline code).
   The server call never delays or breaks a page: it runs after the response (the route passes `send` to Next's
   after()), has a 2 second timeout and swallows every failure. AddPaymentInfo is never made here, and Purchase only
   as onboardingPurchase says: Django builds both from an order.

   The visitor cookie (ClickUp z8uq9mg7h3, Coach Ed 2026-11-17, "EMQ-1 yes"): one first-party cookie, no_vid, holds the
   visit's visitor_ref (the server-issued id the page visitor script keeps in localStorage) so the server events call can
   carry it as external_id. It is written only by the visit route (src/app/funnel/membership-pack/visit/route.ts), only
   after Accept, HttpOnly, SameSite=Lax, Path=/, Secure with the __Host- prefix on https, for the same 180 days as the
   consent cookie. It is sent only with the server events, and only while the choice is Accept and the value has the
   ref's shape; every Meta page response clears it when the choice is Decline, unset or being reopened. The browser
   Pixel never sees it, and it is never logged.

   Meta's own ids (ClickUp z8uq9m92fv, META-DEDUP F1): Meta's script writes _fbp only after the first consented page has
   rendered, so that page's server event had no fbp, and an _fbc built from ?fbclid= was sent but not kept. Now, only
   with a Pixel, after Accept and not on ?cookie-settings=1, a Meta page response (finish) sets _fbp when it is absent or
   not sent at all (Meta's format fb.1.<ms>.<10 random digits>, the same value goes to Django) and _fbc when it is not
   sent and the URL has a fbclid. Meta's script re-writes both with a Domain, so from the second page two cookies of the
   same name can arrive: the first well-shaped value is read, and a cookie of any shape already sent is never set again. First-party, Path=/, SameSite=Lax, Secure on https, 90 days, not HttpOnly and no __Host-
   prefix, so the Pixel reads and keeps them. An existing cookie is never overwritten. Decline clears both. */
import { randomBytes, randomInt } from "node:crypto";
import { asset } from "./assets.ts";
import { clearCookie, cookieName, isSecure, readCookieShaped, setCookie } from "./cookies.ts";
import { SECRET_MIN_LENGTH, type Pack, type Site } from "./django.ts";
import type { StorefrontEnv } from "./env.ts";
import { html, safe, type Markup } from "./html.ts";
import { visitorIp } from "./visitor.ts";

export const CONSENT = "no_meta_consent";
export const CONSENT_MAX_AGE = 180 * 24 * 3600;

export const VISITOR = "no_vid";
export const VISITOR_REF = /^[A-Za-z0-9_-]{16,32}$/; // backend apps/pack/visits.py REF_RE

/** The footer's "Cookie settings" link: the home page with this query reopens the notice (withdrawing consent, Privacy
    Policy section 12). The home page is the one place every store page can reach that carries the Pixel script, so
    the link needs no script of its own on the pages that do not. */
export const COOKIE_SETTINGS_QUERY = "cookie-settings";
export const COOKIE_SETTINGS_PATH = `/?${COOKIE_SETTINGS_QUERY}=1`;
export const COOKIE_SETTINGS_LABEL = "Cookie settings";

/** True when the site has a Pixel configured: the only case where there is anything to consent to. */
export function hasPixel(site: Pick<Site, "meta_pixel_id">): boolean {
  return /^[0-9]{8,20}$/.test(site.meta_pixel_id);
}

/** The footer list item for the link, or nothing when the site has no Pixel. A plain link, so it is keyboard reachable
    and takes the footer's own link style and focus ring. */
export function cookieSettingsItem(show: boolean | undefined): Markup {
  return show ? html`<li><a href="${COOKIE_SETTINGS_PATH}" class="footer-cookie-settings">${COOKIE_SETTINGS_LABEL}</a></li>` : safe("");
}

export type MetaEvent = "PageView" | "ViewContent" | "InitiateCheckout";
const PREFIX: Record<MetaEvent, string> = { PageView: "pv", ViewContent: "vc", InitiateCheckout: "ic" };
export const CONTENT_ID = "membership-pack"; // backend apps/meta_ads/events.py CONTENT_ID

const PIXEL_ID = /^[0-9]{8,20}$/; // the backend's own rule for a saved Pixel ID
const FBP = /^fb\.[0-9]\.[0-9]{10,14}\.[A-Za-z0-9_.-]{1,150}$/; // backend events.FBP_RE
const FBC = /^fb\.[0-9]\.[0-9]{10,14}\.[A-Za-z0-9_-]{1,200}$/; // backend events.FBC_RE
const FBCLID = /^[A-Za-z0-9_-]{1,200}$/;
const EVENTS_TIMEOUT_MS = 2000;
export const FBP_COOKIE = "_fbp";
export const FBC_COOKIE = "_fbc";
export const META_ID_MAX_AGE = 90 * 24 * 3600;

/** A fresh deduplication id: "pv_", "vc_" or "ic_" + 16 hex (the backend accepts 16 to 32). */
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

/** A fresh _fbp in Meta's documented format: fb.1.<unix ms>.<random 10-digit integer>. */
export function mintFbp(now: Date = new Date()): string {
  return `fb.1.${now.getTime()}.${randomInt(1_000_000_000, 10_000_000_000)}`;
}

/** Appends one of Meta's first-party cookies to a response: plain name, readable by the Pixel (not HttpOnly). */
function setMetaCookie(response: Response, request: Request, name: string, value: string, maxAge: number): void {
  const parts = [`${name}=${value}`, "Path=/", `Max-Age=${maxAge}`, "SameSite=Lax"];
  if (isSecure(request)) parts.push("Secure");
  response.headers.append("Set-Cookie", parts.join("; "));
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

/** The visit's ref from the visitor cookie, only after Accept and only with the ref's shape; otherwise "". */
export function visitorRef(request: Request): string {
  if (!consentGiven(request)) return "";
  return readCookieShaped(request.headers.get("cookie"), cookieName(VISITOR, isSecure(request)), VISITOR_REF);
}

/** Writes the visitor cookie on a response: only after Accept and only for a ref of the right shape. */
export function setVisitorCookie(response: Response, request: Request, ref: string): void {
  if (!consentGiven(request) || !VISITOR_REF.test(ref)) return;
  setCookie(response, request, VISITOR, ref, CONSENT_MAX_AGE);
}

/** True when the request carries a cookie of this name, whatever its value. */
function hasCookie(request: Request, name: string): boolean {
  return (request.headers.get("cookie") ?? "").split(";").some((part) => part.trim().startsWith(`${name}=`));
}

/** The first well-shaped value among the cookies of this exact name, however many are sent (Meta's script re-writes _fbp
    and _fbc with a Domain, so a host-only copy and a domain copy can arrive together); "" when none is well shaped.
    Only for Meta's two cookies: every other cookie read stays strict (readCookieShaped). */
function readMetaCookie(header: string | null, name: string, shape: RegExp): string {
  for (const part of (header ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    const value = part.slice(at + 1).trim();
    if (shape.test(value)) return value;
  }
  return "";
}

/** The Pixel's own cookies, read from the request (first-party: the Pixel writes them on this host). A value of the
    wrong shape reads as "". */
export function metaCookies(request: Request, now: Date = new Date()): { fbp: string; fbc: string } {
  const header = request.headers.get("cookie");
  const fbp = readMetaCookie(header, FBP_COOKIE, FBP);
  let fbc = readMetaCookie(header, FBC_COOKIE, FBC);
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

/* The notice: a centred, blocking popup (ClickUp z8uq9mfh05). Layout adapted from TWCinc
   app/static/plugins/twc_cookie_consent.js (scrim, card with header band, message, grey Decline beside a filled Accept), in Santé
   green. The script (js/meta-pixel.js) does the blocking: focus trap, Esc ignored, page scroll locked, focus rings. */
export const NOTICE_TEXT = "We use cookies to keep our store secure and working. With your OK, we also use Meta tools to measure visits and orders and improve our ads. Nothing goes to Meta unless you accept.";
export const NOTICE_ACCEPT = "Accept";
export const NOTICE_DECLINE = "Decline";
export const NOTICE_LABEL = "Tracking notice";
export const NOTICE_KICKER = "Cookies & privacy";
export const NOTICE_TITLE = "Let's Make Your Santé Experience Better and Secure";
export const NOTICE_POLICY_LABEL = "Privacy & Cookies Policy";
export const NOTICE_POLICY_PATH = "/privacy-policy/";
export const NOTICE_CHANGE = "You can change this anytime in Cookie settings at the bottom of the page.";
export const NOTICE_REMEMBER = "We'll remember your choice for 180 days.";

const BTN = "flex:1 1 140px;min-height:44px;box-sizing:border-box;padding:10px 18px;border-radius:8px;font:inherit;font-weight:700;font-size:15px;cursor:pointer";
const BTN_DECLINE = `${BTN};background:#f3f4f6;border:1px solid #9ca3af;color:#1f2937`;
const BTN_ACCEPT = `${BTN};background:#03572d;border:1px solid #03572d;color:#fff`;

function notice(request: Request): Markup {
  const secure = isSecure(request);
  return html`
<div id="no-meta-notice" data-cookie="${cookieName(CONSENT, secure)}" data-max-age="${CONSENT_MAX_AGE}" style="position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(17,24,39,0.82);overflow:auto;font-family:Manrope,system-ui,sans-serif;color:#1f2937">
  <div role="dialog" aria-modal="true" aria-labelledby="no-meta-title" tabindex="-1" style="outline:none;width:100%;max-width:460px;max-height:100%;overflow:auto;box-sizing:border-box;background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.35)">
    <div style="padding:18px 22px;background:#03572d;color:#fff">
      <div style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;opacity:0.85">${NOTICE_KICKER}</div>
      <h2 id="no-meta-title" style="margin:0;font-size:22px;line-height:1.25;font-weight:800;color:#fff">${NOTICE_TITLE}</h2>
    </div>
    <div style="padding:20px 22px 18px">
      <p style="margin:0 0 12px;font-size:15px;line-height:1.55">We use cookies to keep our store <strong>secure</strong> and working. With your OK, we also use <strong>Meta tools</strong> to <strong>measure visits and orders</strong> and <strong>improve our ads</strong>. Nothing goes to Meta unless you accept.</p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.5">Review our <a href="${NOTICE_POLICY_PATH}" target="_blank" rel="noopener" style="color:#03572d;font-weight:600">${NOTICE_POLICY_LABEL}</a>.</p>
      <div style="display:flex;align-items:flex-start;gap:10px;margin:0 0 18px;padding:10px 12px;background:#ecf6f0;border:1px solid #cfe5d8;border-radius:8px;font-size:13px;line-height:1.5;color:#1f2937">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false" style="flex:none;margin-top:1px"><circle cx="9" cy="9" r="9" fill="#03572d"/><rect x="8" y="4" width="2" height="6" rx="1" fill="#fff"/><circle cx="9" cy="13" r="1.2" fill="#fff"/></svg>
        <span>${NOTICE_CHANGE}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px">
        <button type="button" data-meta-choice="0" style="${BTN_DECLINE}">${NOTICE_DECLINE}</button>
        <button type="button" data-meta-choice="1" style="${BTN_ACCEPT}">${NOTICE_ACCEPT}</button>
      </div>
      <p style="margin:12px 0 0;font-size:12px;line-height:1.4;color:#4b5563;text-align:center">${NOTICE_REMEMBER}</p>
    </div>
  </div>
</div>
<script src="${asset("js/meta-pixel.js")}"></script>
`;
}

export type MetaPage = {
  /** What the page adds just before </body>: the notice, or the data block and the script, or nothing. */
  markup: Markup;
  /** The server events call, to run after the response (Next's after()), or null when nothing is to be sent. */
  send: (() => Promise<void>) | null;
  /** Adds the cookie changes to the response: the visitor-cookie clearing, _fbp/_fbc cleared on Decline, and _fbp/_fbc kept after Accept. */
  finish: (response: Response) => Response;
};

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

function reopenRequested(request: Request): boolean {
  try {
    return new URL(request.url).searchParams.get(COOKIE_SETTINGS_QUERY) === "1";
  } catch {
    return false;
  }
}

export function metaPage(a: MetaPageArgs): MetaPage {
  const choice = consentChoice(a.request);
  const pixel = PIXEL_ID.test(a.site.meta_pixel_id);
  const reopen = reopenRequested(a.request);
  const stale = (choice !== "accepted" || reopen) && hasCookie(a.request, cookieName(VISITOR, isSecure(a.request)));
  const dropIds = pixel && choice === "declined";
  const header = a.request.headers.get("cookie");
  const sent = { fbp: hasCookie(a.request, FBP_COOKIE), fbc: hasCookie(a.request, FBC_COOKIE) };
  const had = { fbp: readMetaCookie(header, FBP_COOKIE, FBP), fbc: readMetaCookie(header, FBC_COOKIE, FBC) };
  const keepIds = pixel && choice === "accepted" && !reopen;
  const mint = keepIds && !sent.fbp;
  const fbp = keepIds ? had.fbp || (mint ? mintFbp(a.now) : "") : "";
  const urlFbc = keepIds && !sent.fbc ? metaCookies(a.request, a.now).fbc : "";
  const finish = (response: Response) => {
    if (stale) clearCookie(response, a.request, VISITOR);
    if (dropIds) {
      if (hasCookie(a.request, FBP_COOKIE)) setMetaCookie(response, a.request, FBP_COOKIE, "", 0);
      if (hasCookie(a.request, FBC_COOKIE)) setMetaCookie(response, a.request, FBC_COOKIE, "", 0);
    }
    if (keepIds) {
      if (mint) setMetaCookie(response, a.request, FBP_COOKIE, fbp, META_ID_MAX_AGE);
      if (urlFbc) setMetaCookie(response, a.request, FBC_COOKIE, urlFbc, META_ID_MAX_AGE);
    }
    return response;
  };
  if (!PIXEL_ID.test(a.site.meta_pixel_id)) return { markup: safe(""), send: null, finish };
  /* "?cookie-settings=1": the visitor asked to choose again. Only the notice is drawn, whatever the cookie says, with no
     data block, no Pixel and no server call, so nothing goes to Meta from this page; the notice's script then writes
     the new answer and loads the page without the query. */
  if (reopenRequested(a.request)) return { markup: notice(a.request), send: null, finish };
  if (choice === "declined") return { markup: safe(""), send: null, finish };
  if (choice === "unset") return { markup: notice(a.request), send: null, finish };
  const events = a.events.map((name) => {
    const id = metaEventId(name);
    const data = !a.pack || name === "PageView"
      ? {}
      : {
          content_type: "product", content_ids: [CONTENT_ID],
          value: Math.round(a.pack.price_centavos) / 100, currency: a.pack.currency,
        };
    return { name, id, data };
  });
  const block = dataBlock({ pixel_id: a.site.meta_pixel_id, checkout: a.checkout === true, events });
  const markup = html`${block}<script src="${asset("js/meta-pixel.js")}"></script>`;
  const cookies = { fbp, fbc: had.fbc || urlFbc };
  const ref = visitorRef(a.request);
  const body = {
    host: a.host,
    events: events.map(({ name, id }) => ({ name, id })),
    url: pageUrl(a.request),
    fbp: cookies.fbp,
    fbc: cookies.fbc,
    ip: visitorIp(a.request.headers),
    user_agent: (a.request.headers.get("user-agent") ?? "").slice(0, 400),
    consent: true,
    ...(ref ? { visitor_ref: ref } : {}),
  };
  return { markup, send: events.length === 0 ? null : () => sendEvents(body, a.env, a.fetchImpl, a.log), finish };
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

/* ---- Purchase on the onboarding verify page (ClickUp z8uq9mfh12) ---------------------------------------------------- */

const PURCHASE_ID = /^pur_[A-Za-z0-9_-]{1,60}$/; // backend events.ORDER_EVENTS["Purchase"] + "_" + the order's public id
const CURRENCY = /^[A-Z]{3}$/;
const CONTENT_ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

export type PurchaseArgs = {
  request: Request;
  site: Site;
  host: string;
  /** The buyer's checkout cookie value: Django finds the order from it, filtered by site. */
  token: string;
  visitorIp: string;
  env: Pick<StorefrontEnv, "apiBase" | "secret">;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  log?: (reason: string) => void;
};

/** What the verify page adds just before </body>: the data block and the script with one Purchase, only when the site has
    a Pixel, the consent cookie is "1" on this visit and Django answers that this was the first Purchase for the order.
    Otherwise nothing, and never the notice. It waits for Django at most 2 seconds and swallows every failure, so the page
    is never broken or held longer. The browser event carries Django's event id, so Meta pairs it with the server's. */
export async function onboardingPurchase(a: PurchaseArgs): Promise<Markup> {
  const none = safe("");
  if (!hasPixel(a.site) || !consentGiven(a.request) || !a.token || a.env.secret.length < SECRET_MIN_LENGTH) return none;
  const log = a.log ?? logMeta;
  try {
    const response = await (a.fetchImpl ?? fetch)(`${a.env.apiBase}/storefront/v1/meta/purchase/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${a.env.secret}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ host: a.host, visitor_ip: a.visitorIp, token: a.token, consent: true }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(EVENTS_TIMEOUT_MS),
    });
    if (response.status !== 200) {
      if (response.status !== 404 && response.status !== 409) log(`the API answered ${response.status}`);
      return none;
    }
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return none;
    const v = body as Record<string, unknown>;
    if (v.first !== true || typeof v.event_id !== "string" || !PURCHASE_ID.test(v.event_id)) return none;
    if (typeof v.value !== "number" || !Number.isFinite(v.value) || v.value <= 0) return none;
    if (typeof v.currency !== "string" || !CURRENCY.test(v.currency)) return none;
    const ids = Array.isArray(v.content_ids) ? v.content_ids : [];
    if (ids.length === 0 || !ids.every((id) => typeof id === "string" && CONTENT_ID_SHAPE.test(id))) return none;
    const block = dataBlock({
      pixel_id: a.site.meta_pixel_id, checkout: true, // checkout: Meta's form reading stays off (OTP, email and mobile fields)
      events: [{ name: "Purchase", id: v.event_id, data: { value: v.value, currency: v.currency, content_ids: ids } }],
    });
    return html`${block}<script src="${asset("js/meta-pixel.js")}"></script>`;
  } catch {
    log("the API could not be reached in time");
    return none;
  }
}
