/* The member dashboard Home, My Purchases and its posts, over the storefront API (TWCinc negosyoonline_sante_pack/dashboard.py).

   The member session is this server's `__Host-no_member` cookie, passed to Django as data. A 401 anywhere means the session is
   gone: the cookie is cleared and the visitor goes to the store home, as the Home route has always done. While the order is
   rejected the dashboard shows My Purchases only (the lock, whose panels moved off the Home): every other member page, the Home
   included, goes to /dashboard/purchases/. Every refusal re-renders My Purchases with TWCinc's own words in the panel it came from. A 404 is the neutral page: the pack is off, or the host is not served. */
import { randomBytes } from "node:crypto";
import { MEMBER, clearCookie } from "./cookies.ts";
import { PROOF_TOO_LARGE } from "./checkout-flow.ts";
import { fetchPack, memberMe } from "./django.ts";
import { mobileAppUrl } from "./env.ts";
import type { Member } from "./django.ts";
import { html, htmlResponse } from "./html.ts";
import { redirect, type Call } from "./member.ts";
import {
  PROOF_MAX_BYTES, fetchOwnProof, memberOrders, memberPack, memberPackResubmit, memberRegistration, registrationDetails,
  registrationMobileSend, registrationMobileVerify,
  type Calls, type MemberPack, type MobileCheck, type OrderCard, type PackRefusal, type RegistrationCard,
} from "./pack-api.ts";
import { memberNotices } from "./notices-api.ts";
import { fetchCatalog } from "./shop-api.ts";
import { memberCourses, memberLive } from "./training-api.ts";
import { ORDER_ID, readReviewForm, submitReview } from "./review-flow.ts";
import { neutralDocument, neutralNotFound } from "../views/neutral.ts";
import { PURCHASES_PATH, chrome, homeDocument, memberDocument } from "../views/sante/member.ts";
import { appOrdersContent, noPurchaseCard, noticesPanel, purchasesHero } from "../views/sante/member-dash.ts";
import { homeBody, termsHref, type Contacts, type HomeInput, type RegistrationInfo } from "../views/sante/member-home.ts";
import { helpContent, membershipContent, purchasesList } from "../views/sante/member-pages.ts";
import { NO_ERRORS, homePanels, type PanelErrors, type TermsVersion } from "../views/sante/pack-member.ts";
import type { Site } from "../lib/django.ts";
import type { Markup } from "./html.ts";

/** `appUrl` is the Santé Mobile App link for a test; a request reads STOREFRONT_MOBILE_APP_URL (src/lib/env.ts). */
export type Dash = { site: Site; call: Call; calls: Calls; now?: Date; appUrl?: string };

const TRY_AGAIN = "Please try again shortly.";
const NO_MOBILE: MobileCheck = { pending: false, mobile: "", locked: false, code_sent_to: "", resend_in: 0, attempts_left: 5 };
export const HOME_SCRIPTS = ["js/pack-lock.js"];
const TERMS_SCRIPT = "js/pack-terms-popup.js";

export const RESUBMIT_FIELDS = [
  "account_id", "sender_bank", "reference_number", "sender_name", "sender_account_number", "amount_sent", "transferred_at",
] as const;

export function tryAgain(): Response {
  return htmlResponse(neutralDocument(TRY_AGAIN), 503);
}

export function signedOut(d: Dash): Response {
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

function render(
  d: Dash, member: Member, pack: MemberPack | null, reg: RegistrationCard | null, mobile: MobileCheck, over: Over, status = 200,
  terms: TermsVersion | null = null, order: OrderCard | null = null, all: OrderCard[] | null = [],
): Response {
  const posted = { ...(over.posted ?? {}), submit_key: randomBytes(12).toString("base64url") };
  const panels = homePanels({ pack, registration: reg, mobile, pack_errors: over.pack_errors, reg_errors: over.reg_errors, posted, terms, order });
  const locked = !!pack?.lock;
  const scripts = ["js/pack-dashboard.js", ...(locked ? ["js/pack-select.js", ...HOME_SCRIPTS] : []), ...(terms && reg?.terms_required && reg.details_form && !mobile.pending ? [TERMS_SCRIPT] : [])];
  const content = html`<div class="pd" id="pp-dash-purchases">${purchasesHero()}${pack ? panels : noPurchaseCard()}${purchasesList(all)}</div>`;
  return htmlResponse(memberDocument(chrome(d.site, d.now), { title: "My Purchases", member: member.full_name, current: "purchases", content, scripts, styles: locked ? ["css/pack-select.css"] : [] }), status);
}

/** The Home: the hero, the Announcements & promos panel (nothing when there are none) and the slots M3 fills. A member whose order
    is rejected goes to My Purchases, where the lock dialog is. */
export async function homePage(d: Dash): Promise<Response> {
  const s = await session(d);
  if ("response" in s) return s.response;
  const p = await memberPack(args(d), d.calls);
  if (p.state === "refused" && p.status === 401) return signedOut(d);
  if (p.state === "unavailable") return neutralNotFound();
  if (p.state === "ok" && p.pack?.lock) return redirect(PURCHASES_PATH);
  // Every other read is independent: the order update is critical (a failure is said plainly), the rest only hide their own section.
  const [o, n, catalog, agreement, live, courses] = await Promise.all([
    memberOrders(args(d), d.calls),
    memberNotices({ host: d.call.host, token: d.call.member_token }, d.calls),
    fetchCatalog(d.call.host, d.calls),
    fetchPack(d.call.host, d.calls.env, d.calls.fetchImpl, d.calls.log),
    memberLive(args(d), d.calls),
    memberCourses(args(d), d.calls),
  ]);
  const dead = (r: { state: string; status?: number }) => r.state === "refused" && r.status === 401;
  if (dead(o) || dead(n) || dead(live) || dead(courses)) return signedOut(d);
  const cards = o.state === "ok" ? o.cards : [];
  const input: HomeInput = {
    first_name: s.member.full_name.trim().split(/\s+/)[0] ?? "",
    orders: o.state === "ok" ? { state: "ok", cards } : { state: "failed" },
    registration: registrationOf(p),
    app_url: d.appUrl ?? mobileAppUrl(),
    terms_href: termsHref(agreement?.agreement?.id),
    products: catalog,
    notices: n.state === "ok" ? noticesPanel(n.notices) : html``,
    contacts: contactsOf(d),
    live: live.state === "ok" ? live.live : null,
    resume: courses.state === "ok" ? courses.resume : null,
  };
  return htmlResponse(homeDocument(chrome(d.site, d.now), s.member.full_name, homeBody(input)));
}

/** The registration of the member pack read, in the Home's shape; null while benefits are off or the read failed. */
function registrationOf(p: Awaited<ReturnType<typeof memberPack>>): RegistrationInfo | null {
  const r = p.state === "ok" ? p.registration : null;
  return r ? { label: r.label, line: r.line, registered: r.status === "registered", member_id: r.sante_member_id, act: r.details_form } : null;
}

function contactsOf(d: Dash): Contacts {
  const b = chrome(d.site, d.now).biz;
  return { email: b.contact_email, mobile: b.contact_mobile, mobile_raw: b.contact_mobile_raw };
}

/** My Membership: registration state, benefits Q&A, terms and app steps. */
export async function membershipPage(d: Dash): Promise<Response> {
  const s = await session(d);
  if ("response" in s) return s.response;
  const p = await memberPack(args(d), d.calls);
  if (p.state === "refused" && p.status === 401) return signedOut(d);
  if (p.state === "unavailable") return neutralNotFound();
  if (p.state === "ok" && p.pack?.lock) return redirect(PURCHASES_PATH);
  const [o, agreement] = await Promise.all([memberOrders(args(d), d.calls), fetchPack(d.call.host, d.calls.env, d.calls.fetchImpl, d.calls.log)]);
  if (o.state === "refused" && o.status === 401) return signedOut(d);
  const cards = o.state === "ok" ? o.cards : [];
  const fromCard = cards.find((c) => c.membership)?.membership;
  const registration = registrationOf(p) ?? (fromCard ? { label: fromCard.label, line: fromCard.line, registered: fromCard.registered, member_id: fromCard.sante_member_id, act: fromCard.act } : null);
  const content = membershipContent({ registration, has_order: (p.state === "ok" && !!p.pack) || cards.length > 0, app_url: d.appUrl ?? mobileAppUrl(), terms_href: termsHref(agreement?.agreement?.id) });
  return htmlResponse(memberDocument(chrome(d.site, d.now), { title: "My Membership", member: s.member.full_name, current: "membership", content, scripts: [] }));
}

/** Help: this store's own contact details. It reads nothing but the session and the lock, so it stays reachable when order or catalog reads fail. */
export const helpPage = (d: Dash) => plainPage(d, "help", "Help", (url) => helpContent(contactsOf(d), url));

/** My Purchases: the member's payment card, and the registration card with its mobile check while the form is open. */
export async function purchasesPage(d: Dash, over: Over = {}, status = 200): Promise<Response> {
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
  // The Shipment line is the same member/orders card the app shows for this order; if that read fails the card keeps its plain text.
  let order: OrderCard | null = null;
  const o = await memberOrders(args(d), d.calls);
  if (o.state === "refused" && o.status === 401) return signedOut(d);
  if (p.pack && p.pack.payment_status === "verified" && o.state === "ok") order = o.cards.find((c) => c.order_number === p.pack!.order_number) ?? null;
  return render(d, s.member, p.pack, p.registration, mobile, over, status, terms, order, o.state === "ok" ? o.cards : null);
}

/** A page with no data of its own (Affiliate Hub, Orders): the signed-in member, the lock rule, the content. */
async function plainPage(d: Dash, key: string, title: string, content: (appUrl: string) => Markup): Promise<Response> {
  const s = await session(d);
  if ("response" in s) return s.response;
  const locked = await lockedHome(d);
  if (locked) return locked;
  const doc = memberDocument(chrome(d.site, d.now), { title, member: s.member.full_name, current: key, content: content(d.appUrl ?? mobileAppUrl()), scripts: [] });
  return htmlResponse(doc);
}

/** Members order in the app; there is no earnings figure and no referral link here (held). */
export const affiliatePage = (d: Dash) => plainPage(d, "affiliate", "Affiliate Hub", (url) => appOrdersContent("Affiliate Hub", url));

/** POST /dashboard/orders/review/: the signed-in member reviews a line of their own delivered order. Django checks the order is theirs. */
export async function reviewPost(d: Dash, text: Record<string, string>): Promise<Response> {
  const s = await session(d);
  if ("response" in s) return s.response;
  const form = readReviewForm(text);
  const orderId = (text.order_id ?? "").trim();
  if (!form || !ORDER_ID.test(orderId)) return neutralNotFound();
  return submitReview({ host: d.call.host, visitor_ip: d.call.visitor_ip, order_id: orderId, view_token: "", member_token: d.call.member_token, calls: d.calls }, form, "/dashboard/orders/");
}

/** Whether the dashboard is locked to My Purchases (the order is rejected): other member pages use this. */
export async function lockedHome(d: Dash): Promise<Response | null> {
  const p = await memberPack(args(d), d.calls);
  if (p.state === "ok" && p.pack?.lock) return redirect(PURCHASES_PATH);
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
    return purchasesPage(d, { pack_errors: { error_message: "Check the highlighted fields.", field_errors: { proof: PROOF_TOO_LARGE } }, posted: text });
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
  if (r.state === "ok") return redirect(PURCHASES_PATH);
  if (r.state === "unavailable") return neutralNotFound();
  if (r.state === "failed") return tryAgain();
  if (r.status === 401) return signedOut(d);
  if (r.code === "not_rejected") return redirect(PURCHASES_PATH); // nothing to resubmit: My Purchases shows where the order stands
  const posted = { ...text };
  return purchasesPage(d, { pack_errors: errorsOf(r), posted }, statusOf(r));
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
  if (r.state === "ok") return redirect(PURCHASES_PATH);
  if (r.state === "unavailable") return neutralNotFound();
  if (r.state === "failed") return tryAgain();
  if (r.status === 401) return signedOut(d);
  const posted = { ...text };
  delete posted.code; // a wrong code is never put back
  if (r.code === "agreement_changed") delete posted.terms; // the terms moved on: the member agrees to the new version, not the one they ticked
  return purchasesPage(d, { reg_errors: errorsOf(r), posted }, statusOf(r));
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
