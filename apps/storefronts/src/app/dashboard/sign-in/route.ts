/* The member sign-in page, /dashboard/sign-in/, as TWCinc's Santé sign-in: a mobile number, then a one-time code.
   The answer is the same for a number that is not a member as for one that is (Django decides, this page shows
   its words). GET: a signed-in member goes to the dashboard; anyone else gets the number box, and an old code
   step is not resumed. POST: request, resend, email, verify or restart (and text, once PK2b merges).
   A good code puts the session in this host's own cookie (src/lib/cookies.ts); the sign-in attempt's binding
   lives in a second cookie for 10 minutes. Never cached, never indexed. */
import {
  CHECKOUT, MEMBER, MEMBER_MAX_AGE, MEMBER_PRE, MEMBER_PRE_MAX_AGE, clearCookie, newToken, setCookie,
} from "../../../lib/cookies.ts";
import {
  memberMe, memberSignInAcceptEmail, memberSignInRequest, memberSignInResend, memberSignInText, memberSignInVerify,
  type MemberRefusal, type SignInAnswer,
} from "../../../lib/django.ts";
import { postedForm } from "../../../lib/form.ts";
import { htmlResponse } from "../../../lib/html.ts";
import { callFor, contactOf, forbidden, postIsSameOrigin, redirect } from "../../../lib/member.ts";
import { siteFor } from "../../../lib/site.ts";
import { neutralNotFound } from "../../../views/neutral.ts";
import {
  HOME_PATH, TEXT_ME_ENABLED, EMAIL_HINT, chrome, nextKey, nextTarget, signInDocument, signInModel, type SignInModel,
} from "../../../views/sante/member.ts";

export const dynamic = "force-dynamic";

const COUNTDOWN = 60; // RESEND_SECONDS of TWCinc's otp.py: a code sent just now can be asked for again in a minute
const TRY_AGAIN = "Please try again shortly."; // TWCinc's own line for a service that is not answering
const EXPIRED = "This code has expired. Request a new one.";

function page(request: Request, site: NonNullable<Awaited<ReturnType<typeof siteFor>>>, model: SignInModel, status = 200): Response {
  return htmlResponse(signInDocument(chrome(site), model), status);
}

/** The refusal a person sees: TWCinc's _errors(exc) and _status(exc). */
function refused(r: MemberRefusal, over: Partial<SignInModel>): { model: SignInModel; status: number } {
  const smsDown = r.code === "sms_paused" || r.code === "sms_unavailable";
  const fieldErrors = { ...(r.fields.contact ? { contact: r.fields.contact } : {}), ...(r.fields.code ? { code: r.fields.code } : {}) };
  return {
    model: signInModel({ ...over, error_code: r.code, error_message: r.message, field_errors: fieldErrors, hint: smsDown ? EMAIL_HINT : "" }),
    status: r.status === 429 ? 429 : 200,
  };
}

function failedModel(over: Partial<SignInModel>): SignInModel {
  return signInModel({ ...over, error_code: "unavailable", error_message: TRY_AGAIN });
}

export async function GET(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  const call = callFor(request);
  /* An empty token is asked about too: Django answers 404 while members are switched off and 401 otherwise. */
  const me = await memberMe({ host: call.host, token: call.member_token }, { env: call.env });
  if (me.state === "ok") return redirect(HOME_PATH);
  if (me.state === "unavailable" || me.state === "failed") return neutralNotFound();
  const key = nextKey(new URL(request.url).searchParams.get("next"));
  const response = page(request, site, signInModel({ next: key }));
  if (call.member_token) clearCookie(response, request, MEMBER); // a session Django no longer knows
  if (call.binding) clearCookie(response, request, MEMBER_PRE); // opening the page always starts at the number box
  return response;
}

export async function POST(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  const call = callFor(request);
  const posted = await postedForm(request);
  const key = nextKey(posted.get("next"));
  const action = posted.get("action") ?? "request";
  const base = { host: call.host, visitor_ip: call.visitor_ip };
  const c = { env: call.env };

  if (action === "restart") {
    const response = page(request, site, signInModel({ next: key }));
    clearCookie(response, request, MEMBER_PRE);
    return response;
  }

  if (action === "verify") {
    if (!call.binding) return page(request, site, signInModel({ step: "code", next: key, error_code: "code_expired", error_message: EXPIRED, field_errors: { code: EXPIRED } }));
    const result = await memberSignInVerify({ ...base, binding: call.binding, code: posted.get("code") ?? "" }, c);
    if (result.state === "unavailable") return neutralNotFound();
    if (result.state === "failed") return page(request, site, failedModel({ step: "code", next: key }));
    if (result.state === "refused") {
      const { model, status } = refused(result, { step: "code", next: key });
      return page(request, site, model, status);
    }
    const response = redirect(nextTarget(key));
    setCookie(response, request, MEMBER, result.token, MEMBER_MAX_AGE);
    clearCookie(response, request, MEMBER_PRE);
    clearCookie(response, request, CHECKOUT);
    return response;
  }

  if (action === "text" && !TEXT_ME_ENABLED) return neutralNotFound();
  if (!["request", "resend", "email", "text"].includes(action)) return neutralNotFound();

  const binding = call.binding || newToken();
  const step = action === "request" ? "contact" : "code";
  const withBinding = { ...base, binding };
  let result;
  if (action === "request") result = await memberSignInRequest({ ...withBinding, contact: contactOf(posted.get("contact") ?? "") }, c);
  else if (action === "resend") result = await memberSignInResend(withBinding, c);
  else if (action === "text") result = await memberSignInText(withBinding, c);
  else result = await memberSignInAcceptEmail(withBinding, c);

  if (result.state === "unavailable") return neutralNotFound();
  let response: Response;
  if (result.state === "ok") {
    const answer: SignInAnswer = result;
    /* The code just went out by its channel, so that channel's button counts down; the other is open. */
    const byEmail = action === "email";
    response = page(request, site, signInModel({
      step: "code", next: key, message: answer.message, offer_email: answer.offer_email,
      sms_in: byEmail ? 0 : COUNTDOWN, email_in: byEmail ? COUNTDOWN : 0,
    }));
  } else if (result.state === "refused") {
    const { model, status } = refused(result, { step, next: key });
    response = page(request, site, model, status);
  } else {
    response = page(request, site, failedModel({ step, next: key }));
  }
  setCookie(response, request, MEMBER_PRE, binding, MEMBER_PRE_MAX_AGE);
  return response;
}

export { neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
