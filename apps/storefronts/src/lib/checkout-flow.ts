/* The checkout's steps, from TWCinc's site_views.checkout_view / _checkout_post / _place, over the storefront API.

   Django keeps the checkout token; this server keeps it in its own cookie (src/lib/cookies.ts CHECKOUT, 2 hours,
   sliding) and passes it as data. The pages:
     contact  name, mobile, email, the one payment card with the transfer sheet, the three ticks. A first-time buyer
              does contact and place in this one post; a returning buyer's mobile needs a code first, so the post
              stops at the code step (an uploaded file cannot wait across it) and the payment step asks again.
     code     6-digit code by SMS, for a returning buyer only.
     payment  the transfer sheet alone, after the code.
   Placed: 303 to the onboarding page, the cookie stays (it binds the onboarding to this order).
   Every refusal renders the same page with TWCinc's own words, never a status page. A 429 keeps its status. */
import { randomBytes } from "node:crypto";
import { CHECKOUT, CHECKOUT_MAX_AGE, clearCookie, setCookie } from "./cookies.ts";
import type { Pack, Site } from "./django.ts";
import { htmlResponse, type Markup } from "./html.ts";
import { redirect } from "./member.ts";
import { placeFields } from "./meta.ts";
import {
  PROOF_MAX_BYTES, checkoutCodeSend, checkoutCodeVerify, checkoutContact, checkoutPlace, checkoutState,
  type Calls, type PackRefusal,
} from "./pack-api.ts";
import {
  AGREE_ERROR, MSG_CHECKOUT_EXPIRED, VERIFY_FIRST, checkoutDocument, checkoutModel,
  type CheckoutAccount, type CheckoutModel, type CheckoutStep,
} from "../views/sante/pack-checkout.ts";
import { packContext } from "../views/sante/pack-page.ts";
import { landingDocument } from "../views/sante/pack-landing.ts";

export { ONBOARDING_PATH } from "../views/sante/pack-onboarding.ts";
import { ONBOARDING_PATH } from "../views/sante/pack-onboarding.ts";

/** The fields of the transfer sheet, in the order the buyer sees them. */
export const TRANSFER_FIELDS = [
  "account_id", "sender_bank", "reference_number", "sender_first_name", "sender_last_name",
  "sender_account_number", "amount_sent", "transferred_at",
] as const;
const TRANSFER_NAMES = new Set<string>([...TRANSFER_FIELDS, "proof"]);
export const PROOF_TOO_LARGE = `The file is too large. The limit is ${PROOF_MAX_BYTES / (1024 * 1024)} MB.`;
const TRY_AGAIN = "Please try again shortly.";

export type Flow = {
  site: Site;
  pack: Pack;
  host: string;
  visitor_ip: string;
  token: string; // the checkout cookie's value, "" for none
  calls: Calls;
  request: Request;
  now?: Date;
  /** The Meta notice or Pixel markup (src/lib/meta.ts). Set by the route for a GET only, so a refused post that
      shows the page again never fires a second PageView. */
  tracking?: Markup;
};

/** The box shows 9XX XXX XXXX after a fixed +63; the services take 09XXXXXXXXX (TWCinc _local_mobile). */
export function localMobile(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 10 && digits.startsWith("9") ? `0${digits}` : raw;
}

/** The buyer's name box pair as one name (TWCinc _contact_data). */
export function fullName(first: string, last: string): string {
  return [first, last].map((p) => p.trim()).filter(Boolean).join(" ");
}

function accountsOf(pack: Pack): CheckoutAccount[] {
  return pack.payment_accounts.map((a) => ({
    id: String(a.id ?? ""), kind: String(a.kind ?? ""), account_type: String(a.account_type ?? ""),
    provider_name: String(a.provider_name ?? ""), account_name: String(a.account_name ?? ""),
    account_number: String(a.account_number ?? ""), has_qr: a.has_qr === true,
  }));
}

function submitKey(): string {
  return randomBytes(12).toString("base64url");
}

function model(flow: Flow, step: CheckoutStep, over: Partial<CheckoutModel> = {}): CheckoutModel {
  const posted = over.posted ?? {};
  return checkoutModel({
    step, submit_key: submitKey(), accounts: accountsOf(flow.pack),
    enrollment_held: posted.enrollment_authorized === "1",
    ...over,
  });
}

function page(flow: Flow, m: CheckoutModel, status = 200): Response {
  return htmlResponse(checkoutDocument({ ...packContext(flow.site, flow.pack, flow.now), tracking: flow.tracking }, m), status);
}

function slide(response: Response, flow: Flow, value: string): Response {
  if (value) setCookie(response, flow.request, CHECKOUT, value, CHECKOUT_MAX_AGE);
  return response;
}

function forget(response: Response, flow: Flow): Response {
  if (flow.token) clearCookie(response, flow.request, CHECKOUT);
  return response;
}

function unavailable(flow: Flow): Response {
  return htmlResponse(landingDocument(packContext(flow.site, { ...flow.pack, available: false }, flow.now)));
}

/** A posted form's text fields, and its proof file. */
export async function readPost(request: Request): Promise<{ text: Record<string, string>; proof: File | null } | null> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return null;
  }
  const text: Record<string, string> = {};
  let proof: File | null = null;
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") text[key] = value;
    else if (key === "proof") proof = value;
  }
  return { text, proof };
}

function expiredPage(flow: Flow): Response {
  return forget(page(flow, model(flow, "contact", { error_code: "checkout_expired", error_message: MSG_CHECKOUT_EXPIRED })), flow);
}

function statusOf(r: PackRefusal): number {
  return r.status === 429 ? 429 : 200;
}

/* ---- GET ---------------------------------------------------------------------------------------------- */

export async function checkoutGet(flow: Flow): Promise<Response> {
  if (!flow.pack.available) return unavailable(flow);
  const base = { host: flow.host, visitor_ip: flow.visitor_ip };
  if (!flow.token) return page(flow, model(flow, "contact"));
  const state = await checkoutState({ ...base, token: flow.token }, flow.calls);
  if (state.state === "unavailable") return unavailable(flow);
  if (state.state === "failed") return page(flow, model(flow, "contact", { error_code: "unavailable", error_message: TRY_AGAIN }), 503);
  if (state.state === "refused") return forget(page(flow, model(flow, "contact")), flow); // a token that is gone or already used: start again
  const step: CheckoutStep = state.verified || !state.needs_code ? "payment" : "code";
  return slide(page(flow, model(flow, step, { mobile: state.mobile })), flow, flow.token);
}

/* ---- POST --------------------------------------------------------------------------------------------- */

function placeForm(flow: Flow, token: string, text: Record<string, string>, proof: File | null, key: string): FormData {
  const form = new FormData();
  form.append("host", flow.host);
  form.append("visitor_ip", flow.visitor_ip);
  form.append("token", token);
  form.append("submit_key", key);
  for (const name of TRANSFER_FIELDS) form.append(name, text[name] ?? "");
  /* The Meta identifiers (consent "1", _fbp, _fbc, user agent, page address) go only after Accept on a site with a
     Pixel; Django reads them only with the consent, and builds Purchase and AddPaymentInfo from the order itself. */
  for (const [name, value] of Object.entries(placeFields(flow.request, flow.site, flow.now))) form.append(name, value);
  if (proof) form.append("proof", proof, proof.name || "proof");
  return form;
}

/** A place refusal, shown where the buyer can fix it: on the sheet it came from, with a returning buyer's
    unverified mobile sent to the code step. */
async function refusedPlace(
  flow: Flow, r: PackRefusal, token: string, text: Record<string, string>, from: "contact" | "payment",
): Promise<Response> {
  const post = text;
  if (r.code === "checkout_expired" || r.code === "checkout_used" || r.code === "no_contact") return expiredPage(flow);
  if (r.code === "mobile_not_verified") {
    const state = await checkoutState({ host: flow.host, visitor_ip: flow.visitor_ip, token }, flow.calls);
    const mobile = state.state === "ok" ? state.mobile : "";
    return slide(page(flow, model(flow, "code", { mobile, error_code: r.code, error_message: VERIFY_FIRST, posted: post })), flow, token);
  }
  const onSheet = Object.keys(r.fields).some((k) => TRANSFER_NAMES.has(k));
  const step: CheckoutStep = from === "contact" ? "contact" : "payment";
  const m = model(flow, step, {
    error_code: r.code, error_message: onSheet ? "Check the highlighted fields." : r.message,
    field_errors: r.fields, posted: post,
  });
  return slide(page(flow, m, statusOf(r)), flow, token);
}

async function place(
  flow: Flow, token: string, text: Record<string, string>, proof: File | null, from: "contact" | "payment", key: string,
): Promise<Response> {
  if (proof && proof.size > PROOF_MAX_BYTES) {
    const m = model(flow, from, { error_code: "invalid_proof", error_message: "Check the highlighted fields.", field_errors: { proof: PROOF_TOO_LARGE }, posted: text });
    return slide(page(flow, m), flow, token);
  }
  const placed = await checkoutPlace(placeForm(flow, token, text, proof, key), flow.calls);
  if (placed.state === "ok") return slide(redirect(ONBOARDING_PATH), flow, token);
  if (placed.state === "unavailable") return unavailable(flow);
  if (placed.state === "failed") {
    return slide(page(flow, model(flow, from, { error_code: "unavailable", error_message: TRY_AGAIN, posted: text }), 503), flow, token);
  }
  return refusedPlace(flow, placed, token, text, from);
}

async function contactPost(flow: Flow, text: Record<string, string>, proof: File | null): Promise<Response> {
  const base = { host: flow.host, visitor_ip: flow.visitor_ip };
  const show = (over: Partial<CheckoutModel>, status = 200) => page(flow, model(flow, "contact", { posted: text, ...over }), status);
  if (!text.agree) {
    return show({ error_code: "agreement_required", error_message: AGREE_ERROR, field_errors: { agree: AGREE_ERROR } });
  }
  const contact = await checkoutContact({
    ...base, token: flow.token,
    full_name: fullName(text.first_name ?? "", text.last_name ?? ""),
    mobile: localMobile(text.mobile ?? ""), email: (text.email ?? "").trim(),
    enrollment_authorized: text.enrollment_authorized ?? "",
  }, flow.calls);
  if (contact.state === "unavailable") return unavailable(flow);
  if (contact.state === "failed") return show({ error_code: "unavailable", error_message: TRY_AGAIN }, 503);
  if (contact.state === "refused") {
    if (contact.code === "checkout_expired") return expiredPage(flow);
    return show({ error_code: contact.code, error_message: contact.message, field_errors: contact.fields }, statusOf(contact));
  }
  const token = contact.token || flow.token;
  const state = await checkoutState({ ...base, token }, flow.calls);
  if (state.state !== "ok") return state.state === "unavailable" ? unavailable(flow) : slide(show({ error_code: "unavailable", error_message: TRY_AGAIN }, 503), flow, token);
  if (state.needs_code && !state.verified) {
    const sent = await checkoutCodeSend({ ...base, token }, flow.calls);
    const m = model(flow, "code", { mobile: state.mobile, ...(sent.state === "refused" ? { error_code: sent.code, error_message: sent.message, field_errors: sent.fields } : {}) });
    return slide(page(flow, m, sent.state === "refused" ? statusOf(sent) : 200), flow, token);
  }
  return place(flow, token, text, proof, "contact", text.submit_key ?? "");
}

export async function checkoutPost(flow: Flow, text: Record<string, string>, proof: File | null): Promise<Response | null> {
  if (!flow.pack.available) return unavailable(flow);
  const action = text.action ?? "";
  const base = { host: flow.host, visitor_ip: flow.visitor_ip };
  if (action === "contact") return contactPost(flow, text, proof);
  if (!flow.token) return expiredPage(flow);
  if (action === "place") return place(flow, flow.token, text, proof, "payment", text.submit_key ?? "");
  if (action === "resend") {
    const sent = await checkoutCodeSend({ ...base, token: flow.token }, flow.calls);
    if (sent.state === "refused" && sent.code === "checkout_expired") return expiredPage(flow);
    const state = await checkoutState({ ...base, token: flow.token }, flow.calls);
    const mobile = state.state === "ok" ? state.mobile : "";
    const m = model(flow, "code", { mobile, ...(sent.state === "refused" ? { error_code: sent.code, error_message: sent.message, field_errors: sent.fields } : {}) });
    return slide(page(flow, m, sent.state === "refused" ? statusOf(sent) : 200), flow, flow.token);
  }
  if (action === "verify") {
    const verified = await checkoutCodeVerify({ ...base, token: flow.token, code: (text.code ?? "").trim() }, flow.calls);
    const state = await checkoutState({ ...base, token: flow.token }, flow.calls);
    if (state.state === "refused" && state.code === "checkout_expired") return expiredPage(flow);
    const mobile = state.state === "ok" ? state.mobile : "";
    if (verified.state === "ok") return slide(page(flow, model(flow, "payment", { mobile })), flow, flow.token);
    const over: Partial<CheckoutModel> =
      verified.state === "refused"
        ? { error_code: verified.code, error_message: verified.message, field_errors: verified.fields }
        : { error_code: "unavailable", error_message: TRY_AGAIN };
    return slide(page(flow, model(flow, "code", { mobile, ...over }), verified.state === "refused" ? statusOf(verified) : 200), flow, flow.token);
  }
  if (action === "change_number") {
    const state = await checkoutState({ ...base, token: flow.token }, flow.calls);
    return slide(page(flow, model(flow, "contact", { mobile: state.state === "ok" ? state.mobile : "" })), flow, flow.token);
  }
  return null; // an action this page does not know: the caller answers the neutral 404
}
