/* The member dashboard Home and its posts, over the storefront API (TWCinc negosyoonline_sante_pack/dashboard.py).

   The member session is this server's `__Host-no_member` cookie, passed to Django as data. A 401 anywhere means the session is
   gone: the cookie is cleared and the visitor goes to the store home, as the Home route has always done. While the order is
   rejected the dashboard shows Home only (the lock): every other member page goes back to Home. Every refusal re-renders the Home
   with TWCinc's own words in the panel it came from. A 404 is the neutral page: the pack is off, or the host is not served. */
import { randomBytes } from "node:crypto";
import { MEMBER, clearCookie } from "./cookies.ts";
import { PROOF_TOO_LARGE } from "./checkout-flow.ts";
import { fetchPack, memberMe } from "./django.ts";
import type { Member } from "./django.ts";
import { html, htmlResponse } from "./html.ts";
import { redirect, type Call } from "./member.ts";
import {
  PROOF_MAX_BYTES, fetchOwnProof, memberHome, memberOrders, memberPack, memberPackResubmit, memberRegistration, registrationDetails,
  registrationMobileSend, registrationMobileVerify,
  type Calls, type MemberPack, type MobileCheck, type PackRefusal, type RegistrationCard,
} from "./pack-api.ts";
import { neutralDocument, neutralNotFound } from "../views/neutral.ts";
import { HOME_PATH, chrome, homeDocument } from "../views/sante/member.ts";
import { heroTiles, orderMonitor, ordersContent, viewAllLink } from "../views/sante/pack-orders.ts";
import { memberDocument } from "../views/sante/member.ts";
import { NO_ERRORS, homePanels, type PanelErrors, type TermsVersion } from "../views/sante/pack-member.ts";
import type { Site } from "../lib/django.ts";

export type Dash = { site: Site; call: Call; calls: Calls; now?: Date };

const TRY_AGAIN = "Please try again shortly.";
const NO_MOBILE: MobileCheck = { pending: false, mobile: "", locked: false, code_sent_to: "", resend_in: 0, attempts_left: 5 };
export const HOME_SCRIPTS = ["js/pack-lock.js"];
const TERMS_SCRIPT = "js/pack-terms-popup.js";

export const RESUBMIT_FIELDS = [
  "account_id", "sender_bank", "reference_number", "sender_name", "sender_account_number", "amount_sent", "transferred_at",
] as const;

function tryAgain(): Response {
  return htmlResponse(neutralDocument(TRY_AGAIN), 503);
}

function signedOut(d: Dash): Response {
  const response = redirect("/");
  clearCookie(response, d.call.request, MEMBER);
  return response;
}

type Session = { member: Member } | { response: Response };

/** The member of this session, or the answer that ends the request. */
export async function session(d: Dash): Promise<Session> {
  if (!d.call.member_token) return { response: redirect("/") };
  const me = await memberMe({ host: d.call.host, token: d.call.member_token }, d.calls);
  if (me.state === "ok") return { member: me.member };
  if (me.state === "refused" && me.status === 401) return { response: signedOut(d) };
  if (me.state === "failed") return { response: tryAgain() };
  return { response: neutralNotFound() }; // switched off, or not a served site
}

type Args = { host: string; visitor_ip: string; token: string };
const args = (d: Dash): Args => ({ host: d.call.host, visitor_ip: d.call.visitor_ip, token: d.call.member_token });

type Over = { pack_errors?: PanelErrors; reg_errors?: PanelErrors; posted?: Record<string, string> };

type Figures = Extract<Awaited<ReturnType<typeof memberHome>>, { state: "ok" }> | null;

function render(
  d: Dash, member: Member, pack: MemberPack | null, reg: RegistrationCard | null, mobile: MobileCheck, over: Over, status = 200,
  figures: Figures = null, terms: TermsVersion | null = null,
): Response {
  const posted = { ...(over.posted ?? {}), submit_key: randomBytes(12).toString("base64url") };
  const panels = homePanels({ pack, registration: reg, mobile, pack_errors: over.pack_errors, reg_errors: over.reg_errors, posted, terms });
  const locked = !!pack?.lock;
  const scripts = [...(locked ? HOME_SCRIPTS : []), ...(terms && reg?.terms_required && reg.details_form && !mobile.pending ? [TERMS_SCRIPT] : [])];
  const tiles = figures ? heroTiles(figures.summary) : undefined;
  const after = figures && !locked ? html`${orderMonitor(figures.monitor)}${viewAllLink()}` : undefined;
  return htmlResponse(homeDocument(chrome(d.site, d.now), member.full_name, panels, scripts, tiles, after), status);
}

/** The Home: the member's payment card, and the registration card with its mobile check while the form is open. */
export async function homePage(d: Dash, over: Over = {}, status = 200): Promise<Response> {
  const s = await session(d);
  if ("response" in s) return s.response;
  const p = await memberPack(args(d), d.calls);
  if (p.state === "refused" && p.status === 401) return signedOut(d);
  if (p.state === "unavailable") return neutralNotFound();
  if (p.state !== "ok") return tryAgain();
  let mobile = NO_MOBILE;
  let terms: TermsVersion | null = null;
  if (p.registration?.details_form) {
    const r = await memberRegistration(args(d), d.calls);
    if (r.state === "ok") mobile = r.mobile;
    // The terms tick shows only while the order has no Membership Terms acceptance; the popup shows the active version.
    if (p.registration.terms_required) terms = { version: (await fetchPack(d.call.host, d.calls.env, d.calls.fetchImpl, d.calls.log))?.agreement?.id ?? null };
  }
  // The tiles and Order Monitoring are the backend's member/home figures; without them the Home still shows its cards.
  const h = await memberHome(args(d), d.calls);
  return render(d, s.member, p.pack, p.registration, mobile, over, status, h.state === "ok" ? h : null, terms);
}

/** My Orders: every order as a card, newest first. A rejected order locks the dashboard to Home, so it goes there. */
export async function ordersPage(d: Dash): Promise<Response> {
  const s = await session(d);
  if ("response" in s) return s.response;
  const locked = await lockedHome(d);
  if (locked) return locked;
  const o = await memberOrders(args(d), d.calls);
  if (o.state === "refused" && o.status === 401) return signedOut(d);
  if (o.state === "unavailable") return neutralNotFound();
  if (o.state !== "ok") return tryAgain();
  const content = ordersContent(s.member.full_name, o.cards);
  return htmlResponse(memberDocument(chrome(d.site, d.now), { title: "My Orders", member: s.member.full_name, current: "orders", content, scripts: ["js/pack-dashboard.js"] }));
}

/** Whether the dashboard is locked to Home (the order is rejected): other member pages use this. */
export async function lockedHome(d: Dash): Promise<Response | null> {
  const p = await memberPack(args(d), d.calls);
  if (p.state === "ok" && p.pack?.lock) return redirect(HOME_PATH);
  return null;
}

const statusOf = (r: PackRefusal): number => (r.status === 429 ? 429 : 200);

/** A refusal shown where it came from. `field_errors` carry the field messages; `message` the rest. */
function errorsOf(r: PackRefusal): PanelErrors {
  return { error_message: r.message, field_errors: r.fields };
}

/** POST /dashboard/pack/resubmit/: the new proof of a rejected order. */
export async function resubmitPost(d: Dash, form: FormData): Promise<Response> {
  const s = await session(d);
  if ("response" in s) return s.response;
  const text: Record<string, string> = {};
  let proof: File | null = null;
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") text[key] = value;
    else if (key === "proof") proof = value;
  }
  if (proof && proof.size > PROOF_MAX_BYTES) {
    return homePage(d, { pack_errors: { error_message: "Check the highlighted fields.", field_errors: { proof: PROOF_TOO_LARGE } }, posted: text });
  }
  const out = new FormData();
  const a = args(d);
  out.append("host", a.host);
  out.append("visitor_ip", a.visitor_ip);
  out.append("token", a.token);
  out.append("submit_key", text.submit_key ?? "");
  for (const name of RESUBMIT_FIELDS) out.append(name, text[name] ?? "");
  if (proof && proof.size > 0) out.append("proof", proof, proof.name || "proof");
  const r = await memberPackResubmit(out, d.calls);
  if (r.state === "ok") return redirect(HOME_PATH);
  if (r.state === "unavailable") return neutralNotFound();
  if (r.state === "failed") return tryAgain();
  if (r.status === 401) return signedOut(d);
  if (r.code === "not_rejected") return redirect(HOME_PATH); // nothing to resubmit: the Home shows where the order stands
  const posted = { ...text };
  return homePage(d, { pack_errors: errorsOf(r), posted }, statusOf(r));
}

type Kind = "mobile_send" | "mobile_verify" | "details";

/** POST /dashboard/registration/...: the mobile check and the details form, shown in the card or the lock dialog. */
export async function registrationPost(d: Dash, kind: Kind, text: Record<string, string>): Promise<Response> {
  const s = await session(d);
  if ("response" in s) return s.response;
  const a = args(d);
  const r =
    kind === "mobile_send" ? await registrationMobileSend({ ...a, mobile: (text.mobile ?? "").trim() || undefined }, d.calls)
    : kind === "mobile_verify" ? await registrationMobileVerify({ ...a, code: (text.code ?? "").trim() }, d.calls)
    : await registrationDetails({ ...a, date_of_birth: (text.date_of_birth ?? "").trim(), desired_username: text.desired_username ?? "", alternate_username: text.alternate_username ?? "", ...termsOf(text), ...addressOf(text) }, d.calls);
  if (r.state === "ok") return redirect(HOME_PATH);
  if (r.state === "unavailable") return neutralNotFound();
  if (r.state === "failed") return tryAgain();
  if (r.status === 401) return signedOut(d);
  const posted = { ...text };
  delete posted.code; // a wrong code is never put back
  if (r.code === "agreement_changed") delete posted.terms; // the terms moved on: the member agrees to the new version, not the one they ticked
  return homePage(d, { reg_errors: errorsOf(r), posted }, statusOf(r));
}

/** The terms tick and the version it was shown against, as the onboarding details step posts them. The form carries them
    only while the registration read says terms_required, so a form without them posts neither. */
export function termsOf(text: Record<string, string>): { terms?: boolean; agreement_version_id?: string } {
  if (!("agreement_version_id" in text)) return {};
  return { terms: !!text.terms, agreement_version_id: /^[0-9]{1,9}$/.test(text.agreement_version_id ?? "") ? text.agreement_version_id : "" };
}

const ADDRESS_FIELDS = ["line", "barangay", "city", "province", "zip"] as const;

/** The delivery address block of TWCinc's dashboard form (shown while the member has none); omitted when nothing was typed. */
export function addressOf(text: Record<string, string>): { delivery_address?: { line: string; barangay: string; city: string; province: string; zip: string } } {
  const a = Object.fromEntries(ADDRESS_FIELDS.map((k) => [k, (text[k] ?? "").trim()])) as Record<(typeof ADDRESS_FIELDS)[number], string>;
  return ADDRESS_FIELDS.some((k) => a[k]) ? { delivery_address: a } : {};
}

const PROOF_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/** GET /dashboard/pack/proof/<id>/: the member's own proof, sent on from this host with no store and no sniffing. */
export async function proofGet(d: Dash, id: string): Promise<Response> {
  if (!d.call.member_token || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return neutralNotFound();
  const file = await fetchOwnProof({ ...args(d), proof_id: id }, d.calls);
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

export { NO_ERRORS };
