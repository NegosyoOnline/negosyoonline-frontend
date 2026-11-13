/* The buyer portal handlers, /portal/*: for a paid Membership Pack buyer of a Santé site that is off (backend apps/pack/portal.py).

   Every handler asks `portal/site/` for the host, never `siteFor`: a site that is served, unknown or past its closing
   instant answers 404 there, and every refusal here is the one neutral 404. GET pages, POST for sign-in and sign-out, as
   /dashboard/*. The session is the same host-only cookie the dashboard uses (src/lib/cookies.ts), passed to Django as data.
   Nothing here writes anything but the session and the sign-in steps; there is no checkout, resubmit or account page. */
import { MEMBER, MEMBER_MAX_AGE, MEMBER_PRE, MEMBER_PRE_MAX_AGE, CHECKOUT, clearCookie, newToken, setCookie } from "./cookies.ts";
import type { MemberRefusal } from "./django.ts";
import { postedForm } from "./form.ts";
import { htmlResponse } from "./html.ts";
import { callFor, contactOf, forbidden, maskEmail, postIsSameOrigin, redirect, type Call } from "./member.ts";
import {
  portalMe, portalOrders, portalProof, portalSignInAcceptEmail, portalSignInRequest, portalSignInResend, portalSignInVerify,
  portalSignOut, portalSite, type PortalCalls, type PortalSite,
} from "./portal-api.ts";
import { neutralNotFound } from "../views/neutral.ts";
import { EMAIL_HINT } from "../views/sante/member.ts";
import { ORDERS_PATH, PORTAL_PATH, ordersDocument, portalSignInDocument, signInModel } from "../views/sante/portal.ts";
import type { SignInModel } from "../views/sante/member.ts";

export type Portal = { site: PortalSite; call: Call; calls: PortalCalls };

const COUNTDOWN = 60;
const TRY_AGAIN = "Please try again shortly.";
const EXPIRED = "This code has expired. Request a new one.";
const PROOF_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/** The portal of this request's host, or null: the caller answers the neutral 404. */
export async function portalFor(request: Request, calls?: PortalCalls): Promise<Portal | null> {
  const call = callFor(request);
  const c: PortalCalls = calls ?? { env: call.env };
  const site = await portalSite(call.host, c);
  return site.state === "ok" ? { site, call, calls: c } : null;
}

const cleared = (response: Response, request: Request): Response => {
  clearCookie(response, request, MEMBER);
  return response;
};

/** GET /portal/: signed in, the orders; otherwise the sign-in. */
export async function homeGet(request: Request, calls?: PortalCalls): Promise<Response> {
  const p = await portalFor(request, calls);
  if (!p) return neutralNotFound();
  const { call } = p;
  if (call.member_token) {
    const me = await portalMe({ host: call.host, token: call.member_token }, p.calls);
    if (me.state === "ok") return redirect(ORDERS_PATH);
    if (me.state === "unavailable" || me.state === "failed") return neutralNotFound();
    // 401: the session is gone, the sign-in below clears the cookie
  }
  const response = htmlResponse(portalSignInDocument(p.site, signInModel()));
  if (call.member_token) clearCookie(response, request, MEMBER);
  if (call.binding) clearCookie(response, request, MEMBER_PRE); // opening the page always starts at the number box
  return response;
}

function refused(r: MemberRefusal, over: Partial<SignInModel>): { model: SignInModel; status: number } {
  const smsDown = r.code === "sms_paused" || r.code === "sms_unavailable";
  const fieldErrors = { ...(r.fields.contact ? { contact: r.fields.contact } : {}), ...(r.fields.code ? { code: r.fields.code } : {}) };
  return {
    model: signInModel({ ...over, error_code: r.code, error_message: r.message, field_errors: fieldErrors, hint: smsDown ? EMAIL_HINT : "" }),
    status: r.status === 429 ? 429 : 200,
  };
}

const failedModel = (over: Partial<SignInModel>): SignInModel => signInModel({ ...over, error_code: "unavailable", error_message: TRY_AGAIN });

const MASKED = /^[^\s@*]\*\*\*@[^\s@]{1,253}$/;
const sentTo = (posted: URLSearchParams): string => {
  const v = String(posted.get("sent_to") ?? "");
  return MASKED.test(v) ? v : "";
};

/** POST /portal/: request, resend, email, verify or restart. A good code sets the session and goes to the orders. */
export async function signInPost(request: Request, calls?: PortalCalls): Promise<Response> {
  const p = await portalFor(request, calls);
  if (!p) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  const { call, site } = p;
  const posted = await postedForm(request);
  const action = posted.get("action") ?? "request";
  const carried = action === "request" ? maskEmail(posted.get("contact") ?? "") : sentTo(posted);
  const base = { host: call.host, visitor_ip: call.visitor_ip };
  const page = (model: SignInModel, status = 200) => htmlResponse(portalSignInDocument(site, model), status);

  if (action === "restart") {
    const response = page(signInModel());
    clearCookie(response, request, MEMBER_PRE);
    return response;
  }

  if (action === "verify") {
    if (!call.binding) return page(signInModel({ step: "code", sent_to: carried, error_code: "code_expired", error_message: EXPIRED, field_errors: { code: EXPIRED } }));
    const result = await portalSignInVerify({ ...base, binding: call.binding, code: posted.get("code") ?? "" }, p.calls);
    if (result.state === "unavailable") return neutralNotFound();
    if (result.state === "failed") return page(failedModel({ step: "code", sent_to: carried }));
    if (result.state === "refused") {
      const { model, status } = refused(result, { step: "code", sent_to: carried });
      return page(model, status);
    }
    const response = redirect(ORDERS_PATH);
    setCookie(response, request, MEMBER, result.token, MEMBER_MAX_AGE);
    clearCookie(response, request, MEMBER_PRE);
    clearCookie(response, request, CHECKOUT);
    return response;
  }

  if (!["request", "resend", "email"].includes(action)) return neutralNotFound();
  const binding = call.binding || newToken();
  const step = action === "request" ? "contact" : "code";
  const withBinding = { ...base, binding };
  let result;
  if (action === "request") result = await portalSignInRequest({ ...withBinding, contact: contactOf(posted.get("contact") ?? "") }, p.calls);
  else if (action === "resend") result = await portalSignInResend(withBinding, p.calls);
  else result = await portalSignInAcceptEmail(withBinding, p.calls);

  if (result.state === "unavailable") return neutralNotFound();
  let response: Response;
  if (result.state === "ok") {
    response = page(signInModel({ step: "code", message: result.message, sent_to: carried, offer_email: result.offer_email, sms_in: 0, email_in: COUNTDOWN }));
  } else if (result.state === "refused") {
    const { model, status } = refused(result, { step, sent_to: carried });
    response = page(model, status);
  } else {
    response = page(failedModel({ step }));
  }
  setCookie(response, request, MEMBER_PRE, binding, MEMBER_PRE_MAX_AGE);
  return response;
}

/** GET /portal/orders/: the buyer's own read-only cards. No session goes to the sign-in; a gone session clears the cookie. */
export async function ordersGet(request: Request, calls?: PortalCalls): Promise<Response> {
  const p = await portalFor(request, calls);
  if (!p) return neutralNotFound();
  if (!p.call.member_token) return redirect(PORTAL_PATH);
  const orders = await portalOrders({ host: p.call.host, token: p.call.member_token }, p.calls);
  if (orders.state === "refused" && orders.status === 401) return cleared(redirect(PORTAL_PATH), request);
  if (orders.state !== "ok") return neutralNotFound();
  return htmlResponse(ordersDocument(p.site, orders));
}

/** GET /portal/proof/<id>/: the buyer's own proof, sent on from this host. */
export async function proofGet(request: Request, id: string, calls?: PortalCalls): Promise<Response> {
  const p = await portalFor(request, calls);
  if (!p) return neutralNotFound();
  if (!p.call.member_token || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return neutralNotFound();
  const file = await portalProof({ host: p.call.host, token: p.call.member_token, proof_id: id }, p.calls);
  if (!file) return neutralNotFound();
  const type = file.contentType.split(";")[0].trim().toLowerCase();
  if (!PROOF_TYPES.has(type)) return neutralNotFound();
  return new Response(file.bytes, {
    headers: {
      "Content-Type": type, "Content-Disposition": "inline", "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex",
    },
  });
}

/** POST /portal/sign-out/: Django ends the session, the cookies are cleared, and the visitor goes to the sign-in. */
export async function signOutPost(request: Request, calls?: PortalCalls): Promise<Response> {
  const p = await portalFor(request, calls);
  if (!p) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  if (p.call.member_token) await portalSignOut({ host: p.call.host, token: p.call.member_token }, p.calls);
  const response = redirect(PORTAL_PATH);
  clearCookie(response, request, MEMBER);
  clearCookie(response, request, MEMBER_PRE);
  clearCookie(response, request, CHECKOUT);
  return response;
}
