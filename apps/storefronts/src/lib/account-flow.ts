/* The member Account page, email verification and contact change over the storefront API (TWCinc negosyoonline_members
   site_views.account, verify_email, change_mobile, change_email). Same rules as dashboard-flow.ts: the member session is this
   server's cookie passed as data; a 401 clears it and goes to the store home; a rejected order locks the dashboard to Home;
   a 404 is the neutral page. A step's result is shown by the page itself (no redirect), as TWCinc renders it. */
import { MEMBER, clearCookie } from "./cookies.ts";
import { lockedHome, session, type Dash } from "./dashboard-flow.ts";
import { htmlResponse } from "./html.ts";
import { redirect } from "./member.ts";
import {
  memberAccount, memberChange, memberPreferencesRead, memberPreferencesSave, memberChangeAct, memberVerifyEmail, memberVerifyEmailSend, memberVerifyEmailVerify,
  type ChangeField, type PackRefusal,
} from "./pack-api.ts";
import { neutralDocument, neutralNotFound } from "../views/neutral.ts";
import { chrome, memberDocument } from "../views/sante/member.ts";
import {
  NO_STEP_ERRORS, accountContent, changeContent, changeDoneContent, changeDoneTitle, changeTitle, verifyEmailContent, type StepErrors,
} from "../views/sante/pack-account.ts";
import type { Markup } from "./html.ts";

const TRY_AGAIN = "Please try again shortly.";
const SCRIPTS = ["js/pack-dashboard.js"];

const tryAgain = () => htmlResponse(neutralDocument(TRY_AGAIN), 503);
const args = (d: Dash) => ({ host: d.call.host, visitor_ip: d.call.visitor_ip, token: d.call.member_token });
const errorsOf = (r: PackRefusal): StepErrors => ({ error_message: r.message, error_code: r.code, field_errors: r.fields });
const statusOf = (r: PackRefusal): number => (r.status === 429 ? 429 : r.status === 400 || r.status === 409 || r.status === 422 ? 400 : 200);

function signedOut(d: Dash): Response {
  const response = redirect("/");
  clearCookie(response, d.call.request, MEMBER);
  return response;
}

function page(d: Dash, name: string, title: string, content: Markup, status = 200): Response {
  return htmlResponse(memberDocument(chrome(d.site, d.now), { title, member: name, current: "account", content, scripts: SCRIPTS }), status);
}

type Gate = { name: string } | { response: Response };

/** The signed-in member of an Account page, or the answer that ends the request (sign-in, lock, neutral). */
async function gate(d: Dash): Promise<Gate> {
  const s = await session(d);
  if ("response" in s) return { response: s.response };
  const locked = await lockedHome(d);
  if (locked) return { response: locked };
  return { name: s.member.full_name };
}

/** Whatever ends a step that did not work out (the account page and the steps share these). */
function ended(d: Dash, r: { state: "unavailable" } | { state: "failed" } | PackRefusal): Response | null {
  if (r.state === "unavailable") return neutralNotFound();
  if (r.state === "failed") return tryAgain();
  if (r.state === "refused" && r.status === 401) return signedOut(d);
  return null;
}

/** The notice a toggle save leaves behind: the short marker on the redirect back to this page (a reload shows it again, resubmits nothing). */
const PROMO_NOTICES: Record<string, string> = {
  on: "Text promotions are on.",
  off: "Text promotions are off.",
  error: "We could not save that. Please try again.",
};
function promoNotice(d: Dash): string {
  const marker = new URL(d.call.request.url).searchParams.get("promo") ?? "";
  return Object.hasOwn(PROMO_NOTICES, marker) ? PROMO_NOTICES[marker] : "";
}

export async function accountPage(d: Dash): Promise<Response> {
  const notice = promoNotice(d);
  const g = await gate(d);
  if ("response" in g) return g.response;
  const a = await memberAccount(args(d), d.calls);
  if (a.state !== "ok") return ended(d, a) ?? tryAgain();
  /* PROMO-CONSENT: the toggle shows only when the preference read answers. A 404 (the backend's switch is off) or any
     failure hides it completely: the page is then exactly the page without the feature. */
  const prefs = await memberPreferencesRead(args(d), d.calls);
  const promo = prefs.state === "ok" ? { store: d.site.display_name, prefs: { promo_sms_ok: prefs.promo_sms_ok, promo_sms_at: prefs.promo_sms_at }, notice } : null;
  return page(d, g.name, "Account and security", accountContent(a, promo));
}

/** The toggle's save: set the choice, then redirect (303) to the account page, which reads the saved value back. */
export async function preferencesPost(d: Dash, text: Record<string, string>): Promise<Response> {
  const g = await gate(d);
  if ("response" in g) return g.response;
  if (text.promo_sms_ok !== "1" && text.promo_sms_ok !== "0") return neutralNotFound();
  const r = await memberPreferencesSave({ ...args(d), promo_sms_ok: text.promo_sms_ok === "1" }, d.calls);
  if (r.state === "ok") return redirect(r.promo_sms_ok ? "/dashboard/account/?promo=on" : "/dashboard/account/?promo=off");
  const out = ended(d, r);
  if (out) return out;
  return redirect("/dashboard/account/?promo=error");
}

export async function verifyEmailGet(d: Dash): Promise<Response> {
  const g = await gate(d);
  if ("response" in g) return g.response;
  const v = await memberVerifyEmail(args(d), d.calls);
  if (v.state !== "ok") return ended(d, v) ?? tryAgain();
  return page(d, g.name, "Verify your email", verifyEmailContent(v, NO_STEP_ERRORS));
}

export async function verifyEmailPost(d: Dash, text: Record<string, string>): Promise<Response> {
  const g = await gate(d);
  if ("response" in g) return g.response;
  const action = text.action;
  if (action !== "send" && action !== "verify") return neutralNotFound();
  const r = action === "send" ? await memberVerifyEmailSend(args(d), d.calls) : await memberVerifyEmailVerify({ ...args(d), code: (text.code ?? "").trim() }, d.calls);
  if (r.state === "ok") return page(d, g.name, "Verify your email", verifyEmailContent(r, NO_STEP_ERRORS));
  const out = ended(d, r);
  if (out) return out;
  // A refused step: the page of the step the member is on, with the refusal shown.
  const refusal = r as PackRefusal;
  const now = await memberVerifyEmail(args(d), d.calls);
  if (now.state !== "ok") return ended(d, now) ?? tryAgain();
  return page(d, g.name, "Verify your email", verifyEmailContent(now, errorsOf(refusal)), statusOf(refusal));
}

export async function changeGet(d: Dash, field: ChangeField): Promise<Response> {
  const g = await gate(d);
  if ("response" in g) return g.response;
  const s = await memberChange(field, args(d), d.calls);
  if (s.state !== "ok") return ended(d, s) ?? tryAgain();
  return page(d, g.name, changeTitle(field), changeContent(s, NO_STEP_ERRORS));
}

const ACTIONS = new Set(["send_current", "verify_current", "send_replacement", "verify_replacement"]);

export async function changePost(d: Dash, field: ChangeField, text: Record<string, string>): Promise<Response> {
  const g = await gate(d);
  if ("response" in g) return g.response;
  const action = text.action;
  if (!ACTIONS.has(action ?? "")) return neutralNotFound();
  const emptyCode = action?.startsWith("verify_") && !(text.code ?? "").trim();
  // An empty code is answered here, in words, instead of by the browser's own bubble or by nothing.
  const r = emptyCode ? null : await memberChangeAct(field, {
    ...args(d), action: action as "send_current", code: (text.code ?? "").trim(), new_value: (text.new_value ?? "").trim(),
  }, d.calls);
  let errors = emptyCode ? { error_message: "", error_code: "", field_errors: { code: "Enter the 6-digit code we sent you." } } : NO_STEP_ERRORS;
  let status = 200;
  let code = "";
  if (r && r.state === "ok" && r.changed) {
    // The contact was replaced and every session ended: this one's cookie goes, and the page is shown signed out.
    const done = htmlResponse(memberDocument(chrome(d.site, d.now), { title: changeDoneTitle(field), member: null, current: "account", content: changeDoneContent(field), scripts: [] }));
    clearCookie(done, d.call.request, MEMBER);
    return done;
  }
  if (r && r.state !== "ok") {
    const out = ended(d, r);
    if (out) return out;
    const refusal = r as PackRefusal;
    errors = errorsOf(refusal);
    status = statusOf(refusal);
    code = refusal.code;
  }
  const s = await memberChange(field, args(d), d.calls);
  if (s.state !== "ok") return ended(d, s) ?? tryAgain();
  return page(d, g.name, changeTitle(field), changeContent(s, errors, code), status);
}
