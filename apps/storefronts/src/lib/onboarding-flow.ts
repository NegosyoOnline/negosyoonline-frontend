/* The buyer's steps after the order is placed, from TWCinc's site_views.funnel_member and the onboarding_*, completed_*
   and access_ views, over the storefront API.

   The page is bound to the checkout cookie (src/lib/cookies.ts CHECKOUT), which this server keeps and passes to Django as
   data; it holds no session. Every call slides the token two hours, so each page that reads the state sets the cookie again.
     no cookie, a token with no placed order, an old token   -> the sign-in page (the cookie is cleared)
     a token from before a recovery or contact change        -> the "contacts replaced" access page (cookie cleared)
     verify -> address -> details -> Completed               -> a step whose earlier step is open goes back to it
   Completed is the only page whose POST issues the member session: __Host-no_member, 30 days fixed. Every refusal re-renders
   the same page with TWCinc's own words, never a status page. A 429 keeps its status. A null answer is the neutral 404. */
import {
  CHECKOUT, CHECKOUT_MAX_AGE, MEMBER, MEMBER_MAX_AGE, clearCookie, setCookie,
} from "./cookies.ts";
import type { Pack, Site } from "./django.ts";
import { htmlResponse, type Markup } from "./html.ts";
import { localMobile } from "./checkout-flow.ts";
import { redirect } from "./member.ts";
import { onboardingPurchase } from "./meta.ts";
import {
  accessRead, accessRedeem, accessRenew, addressZip, onboardingAddress, onboardingCompleted, onboardingDetails,
  onboardingEmailSend, onboardingEmailVerify, onboardingMobileSend, onboardingMobileVerify, onboardingState,
  type Calls, type OnboardingState, type PackRefusal, type PackResult,
} from "./pack-api.ts";
import { neutralDocument } from "../views/neutral.ts";
import { SIGN_IN_PATH, HOME_PATH } from "../views/sante/member.ts";
import {
  COMPLETED_PATH, ONBOARDING_PATH, STEP_ORDER, STEP_PATHS,
  accessDocument, completedDocument, onboardingDocument, type AccessView, type ObView,
} from "../views/sante/pack-onboarding.ts";
import { packContext } from "../views/sante/pack-page.ts";

const TRY_AGAIN = "Please try again shortly.";

export type ObFlow = {
  site: Site;
  pack: Pack;
  host: string;
  visitor_ip: string;
  token: string; // the checkout cookie's value, "" for none
  calls: Calls;
  request: Request;
  now?: Date;
};

type Sub = ObView["sub"];
type Base = { host: string; visitor_ip: string };

const base = (f: ObFlow): Base => ({ host: f.host, visitor_ip: f.visitor_ip });

function slide(response: Response, f: ObFlow, token = f.token): Response {
  if (token) setCookie(response, f.request, CHECKOUT, token, CHECKOUT_MAX_AGE);
  return response;
}

function forget(response: Response, f: ObFlow): Response {
  if (f.token) clearCookie(response, f.request, CHECKOUT);
  return response;
}

function tryAgain(): Response {
  return htmlResponse(neutralDocument(TRY_AGAIN), 503);
}

function ctx(f: ObFlow) {
  return packContext(f.site, f.pack, f.now);
}

/** TWCinc _closed_checkout: a cookie from before a recovery or contact change reaches nothing and is cleared. */
function contactsReplaced(f: ObFlow): Response {
  const view: AccessView = { error_message: "", contacts_replaced: true, sent: false, link_open: false, renewable: false, sign_in_path: SIGN_IN_PATH };
  return forget(htmlResponse(accessDocument(ctx(f), view)), f);
}

/** What a refused state or step call means for the buyer's place in the funnel: null while the page may go on. */
function closedFunnel(r: PackRefusal, f: ObFlow): Response | null {
  if (r.code === "checkout_stale") return contactsReplaced(f);
  if (r.code === "checkout_closed" || r.code === "checkout_expired" || r.code === "checkout_used") return forget(redirect(SIGN_IN_PATH), f);
  return null;
}

type Loaded = { state: OnboardingState } | { response: Response | null };

/** funnel_member: the buyer's state, or the answer that sends them where they can continue. */
async function load(f: ObFlow): Promise<Loaded> {
  if (!f.token) return { response: redirect(SIGN_IN_PATH) };
  const r = await onboardingState({ ...base(f), token: f.token }, f.calls);
  if (r.state === "ok") return { state: r.ob };
  if (r.state === "unavailable") return { response: null };
  if (r.state === "failed") return { response: tryAgain() };
  return { response: closedFunnel(r, f) ?? redirect(SIGN_IN_PATH) };
}

function render(
  f: ObFlow, sub: Sub, state: OnboardingState, over: Partial<ObView> = {}, status = 200, tracking?: Markup,
): Response {
  const view: ObView = { sub, state, error_message: "", field_errors: {}, posted: {}, now: f.now ?? new Date(), ...over };
  return slide(htmlResponse(onboardingDocument({ ...ctx(f), tracking }, view, f.pack.agreement?.id ?? null), status), f);
}

/* ---- GET ---------------------------------------------------------------------------------------------------- */

/** /onboarding/: on to whichever of the three pages is next. */
export async function onboardingGo(f: ObFlow): Promise<Response | null> {
  const loaded = await load(f);
  if ("response" in loaded) return loaded.response;
  return slide(redirect(STEP_PATHS[loaded.state.step]), f);
}

/** _onboarding_gate: finished onboarding goes to Completed, and a step whose earlier step is still open goes back to it. */
function gate(state: OnboardingState, sub: Sub, f: ObFlow): Response | null {
  if (state.step === "done") return slide(redirect(COMPLETED_PATH), f);
  if (STEP_ORDER.indexOf(sub) > STEP_ORDER.indexOf(state.step)) return slide(redirect(STEP_PATHS[state.step]), f);
  return null;
}

export async function onboardingPage(f: ObFlow, sub: Sub): Promise<Response | null> {
  const loaded = await load(f);
  if ("response" in loaded) return loaded.response;
  const sent = gate(loaded.state, sub, f);
  if (sent) return sent;
  /* The one Meta event outside the home, landing and checkout pages: Purchase on the verify page's GET (src/lib/meta.ts).
     No other step, and no POST re-render, carries anything of Meta's. */
  const tracking = sub === "verify"
    ? await onboardingPurchase({
        request: f.request, site: f.site, host: f.host, token: f.token, visitorIp: f.visitor_ip, env: f.calls.env,
        fetchImpl: f.calls.fetchImpl, log: f.calls.log,
      })
    : undefined;
  return render(f, sub, loaded.state, {}, 200, tracking);
}

/* ---- POST: every step ------------------------------------------------------------------------------------------ */

/** A step's post: on to the next page when it worked, else the same page with the refusal where the buyer can fix it. */
async function step(
  f: ObFlow, sub: Sub, text: Record<string, string>,
  act: (token: string) => Promise<PackResult<{ ob: OnboardingState }>>,
  gateSub?: Sub,
): Promise<Response | null> {
  if (!f.token) return redirect(SIGN_IN_PATH);
  if (gateSub) {
    const loaded = await load(f); // a step whose earlier step is open goes back to it, as the GET does
    if ("response" in loaded) return loaded.response;
    const sent = gate(loaded.state, gateSub, f);
    if (sent) return sent;
  }
  const r = await act(f.token);
  if (r.state === "ok") return slide(redirect(STEP_PATHS[r.ob.step]), f);
  if (r.state === "unavailable") return null;
  if (r.state === "failed") return tryAgain();
  const closed = closedFunnel(r, f);
  if (closed) return closed;
  const loaded = await load(f);
  if ("response" in loaded) return loaded.response;
  const posted = { ...text };
  delete posted.code; // a wrong code is never put back
  if (r.code === "agreement_changed") delete posted.terms; // the terms moved on: the buyer agrees to the new version, not the one they ticked
  return render(f, sub, loaded.state, { error_message: r.message, field_errors: r.fields, posted }, r.status === 429 ? 429 : 200);
}

export const mobileSend = (f: ObFlow, text: Record<string, string>) =>
  step(f, "verify", text, (token) => onboardingMobileSend({ ...base(f), token }, f.calls));

export const mobileVerify = (f: ObFlow, text: Record<string, string>) =>
  step(f, "verify", text, (token) => onboardingMobileVerify({ ...base(f), token, code: (text.code ?? "").trim() }, f.calls));

export const emailSend = (f: ObFlow, text: Record<string, string>) =>
  step(f, "verify", text, (token) => onboardingEmailSend({ ...base(f), token }, f.calls));

export const emailVerify = (f: ObFlow, text: Record<string, string>) =>
  step(f, "verify", text, (token) => onboardingEmailVerify({ ...base(f), token, code: (text.code ?? "").trim() }, f.calls));

export const addressPost = (f: ObFlow, text: Record<string, string>) =>
  step(f, "address", text, (token) => onboardingAddress({
    ...base(f), token,
    receiver_name: text.receiver_name ?? "", receiver_mobile: localMobile(text.receiver_mobile ?? ""), line: text.line ?? "",
    province: text.province ?? "", city: text.city ?? "", barangay: text.barangay ?? "", landmark: text.landmark ?? "",
    postal_code: text.postal_code ?? "",
  }, f.calls), "address");

/** CA2-06: ASCII digits only and short, so nothing odd reaches the service; it refuses the rest. */
const digits = (v: string | undefined): string => (v !== undefined && /^[0-9]{1,4}$/.test(v) ? v : "");

export const detailsPost = (f: ObFlow, text: Record<string, string>) =>
  step(f, "details", text, (token) => onboardingDetails({
    ...base(f), token,
    dob_year: digits(text.dob_year), dob_month: digits(text.dob_month), dob_day: digits(text.dob_day),
    desired_username: text.desired_username ?? "", alternate_username: text.alternate_username ?? "", terms: !!text.terms,
    agreement_version_id: /^[0-9]{1,9}$/.test(text.agreement_version_id ?? "") ? text.agreement_version_id! : "",
  }, f.calls), "details");

/* ---- the delivery form's ZIP lookup ------------------------------------------------------------------------------ */

/** The JSON pack-address.js reads (TWCinc address_zip.zip_lookup), from the backend's own lookup. */
export async function zipLookup(f: Omit<ObFlow, "token" | "pack" | "site">, query: URLSearchParams): Promise<Response> {
  const province = (query.get("province") ?? "").trim();
  const city = (query.get("city") ?? "").trim();
  const barangay = (query.get("barangay") ?? "").trim();
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  if (!province || !city) return json({ success: false, message: "province and city are required." }, 400);
  const r = await addressZip({ host: f.host, visitor_ip: f.visitor_ip, province, city, barangay }, f.calls);
  if (r.state !== "ok") return json({ success: false });
  return json({ success: true, zip: r.zip_code || null, zip_precision: r.zip_precision || null });
}

/* ---- Completed -------------------------------------------------------------------------------------------------- */

export async function completedGet(f: ObFlow): Promise<Response | null> {
  const loaded = await load(f);
  if ("response" in loaded) return loaded.response;
  if (loaded.state.step !== "done") return slide(redirect(ONBOARDING_PATH), f);
  return slide(htmlResponse(completedDocument(ctx(f), loaded.state)), f);
}

/** The button's POST alone issues the session, once per checkout token (G-SESSION). */
export async function completedPost(f: ObFlow): Promise<Response | null> {
  if (!f.token) return redirect(SIGN_IN_PATH);
  const r = await onboardingCompleted({ ...base(f), token: f.token }, f.calls);
  if (r.state === "unavailable") return null;
  if (r.state === "failed") return tryAgain();
  if (r.state === "refused") return closedFunnel(r, f) ?? redirect(SIGN_IN_PATH);
  if (r.result === "open") return slide(redirect(ONBOARDING_PATH), f);
  if (r.result === "stale") return contactsReplaced(f);
  const response = redirect(HOME_PATH);
  if (r.result === "issued" && r.session_token) setCookie(response, f.request, MEMBER, r.session_token, MEMBER_MAX_AGE);
  clearCookie(response, f.request, CHECKOUT); // "issued" and "spent" both go to the dashboard, which asks for the session itself
  return response;
}

/* ---- the secure order-access link -------------------------------------------------------------------------------- */

const ACCESS_LINK = /^[A-Za-z0-9_:.-]{8,300}$/;

export function accessLinkOk(link: string): boolean {
  return ACCESS_LINK.test(link);
}

function accessPage(f: ObFlow, v: Partial<AccessView>, status = 200): Response {
  const view: AccessView = { error_message: "", contacts_replaced: false, sent: false, link_open: false, renewable: false, sign_in_path: SIGN_IN_PATH, ...v };
  const response = htmlResponse(accessDocument(ctx(f), view), status);
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function accessGet(f: ObFlow, link: string): Promise<Response | null> {
  const r = await accessRead({ ...base(f), link }, f.calls);
  if (r.state === "unavailable") return null;
  if (r.state === "failed") return tryAgain();
  if (r.state === "refused") return r.status === 429 ? accessPage(f, { error_message: r.message }, 429) : tryAgain();
  return accessPage(f, { link_open: r.link_open, renewable: r.renewable });
}

/** GET changes nothing; only the button's POST spends the link and starts the buyer on a fresh checkout cookie. */
export async function accessPost(f: ObFlow, link: string, text: Record<string, string>): Promise<Response | null> {
  const asked = { ...base(f), link };
  if (text.action === "renew") {
    const r = await accessRenew(asked, f.calls);
    if (r.state === "unavailable") return null;
    if (r.state === "failed") return tryAgain();
    if (r.state === "refused") return accessPage(f, { error_message: r.message }, r.status === 429 ? 429 : 200);
    return accessPage(f, { sent: r.sent, link_open: r.link_open, renewable: r.renewable });
  }
  const r = await accessRedeem(asked, f.calls);
  if (r.state === "unavailable") return null;
  if (r.state === "failed") return tryAgain();
  if (r.state === "refused") return accessPage(f, { error_message: r.message }, r.status === 429 ? 429 : 200);
  if (r.redeemed && r.token) {
    const response = redirect(ONBOARDING_PATH);
    setCookie(response, f.request, CHECKOUT, r.token, CHECKOUT_MAX_AGE);
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  const again = await accessRead(asked, f.calls); // a link already spent: say what it is now
  return again.state === "ok" ? accessPage(f, { link_open: again.link_open, renewable: again.renewable }) : tryAgain();
}
