/* The Membership Pack calls to Django (backend apps/pack/api.py, apps/sante/pack_api.py), all under /storefront/v1/ of
   the storefront surface and all with the server credential. Same rules as src/lib/django.ts: a missing secret, a
   timeout, an answer of the wrong shape or any status not listed here is "failed"; 404 is "unavailable" (the pack is
   off, or the host is not a served Santé site). The checkout token and the member session travel as data. Nothing a
   visitor typed, no token, code or file is ever logged. */
import type { StorefrontEnv } from "./env.ts";
import { SECRET_MIN_LENGTH } from "./django.ts";

type Env = Pick<StorefrontEnv, "apiBase" | "secret">;
type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Log = (reason: string) => void;

const logPack: Log = (reason) => console.error(`storefront: pack call failed: ${reason}`);
const TIMEOUT_MS = 10000; // Django paces some steps; a place call stores a file
const PLACE_TIMEOUT_MS = 30000;

export const PROOF_MAX_BYTES = 4 * 1024 * 1024; // backend apps/pack/constants.py: a Vercel Function body is capped at 4.5 MB

export type PackRefusal = { state: "refused"; status: number; code: string; message: string; fields: Record<string, string> };
export type PackResult<T> = ({ state: "ok" } & T) | PackRefusal | { state: "unavailable" } | { state: "failed" };
export type Calls = { env: Env; fetchImpl?: Fetch; log?: Log };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refusal(status: number, body: unknown): PackRefusal {
  const error = record(body) && record(body.error) ? body.error : {};
  const fields: Record<string, string> = {};
  if (record(error.fields)) {
    for (const [key, list] of Object.entries(error.fields)) {
      if (Array.isArray(list) && typeof list[0] === "string") fields[key] = list[0];
      else if (typeof list === "string") fields[key] = list;
    }
  }
  return {
    state: "refused",
    status,
    code: typeof error.code === "string" ? error.code : "",
    message: typeof error.message === "string" ? error.message : "",
    fields,
  };
}

const REFUSED = new Set([400, 401, 403, 409, 413, 422, 429, 503]);

export async function packPost<T>(
  path: string,
  payload: Record<string, unknown> | FormData,
  parse: (body: unknown) => T | null,
  c: Calls,
  timeoutMs = TIMEOUT_MS,
): Promise<PackResult<T>> {
  const failed: PackResult<T> = { state: "failed" };
  const log = c.log ?? logPack;
  if (c.env.secret.length < SECRET_MIN_LENGTH) {
    log("STOREFRONT_SERVER_SECRET is not set");
    return failed;
  }
  const multipart = payload instanceof FormData;
  const headers: Record<string, string> = { Authorization: `Bearer ${c.env.secret}`, Accept: "application/json" };
  if (!multipart) headers["Content-Type"] = "application/json"; // a multipart body sets its own boundary
  let response: Response;
  try {
    response = await (c.fetchImpl ?? fetch)(`${c.env.apiBase}/storefront/v1/${path}/`, {
      method: "POST",
      headers,
      body: multipart ? payload : JSON.stringify(payload),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    log(name === "TimeoutError" || name === "AbortError" ? "the API did not answer in time" : "the API could not be reached");
    return failed;
  }
  if (response.status === 404) return { state: "unavailable" };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    log(`the API answered ${response.status} without JSON`);
    return failed;
  }
  if (response.status === 200) {
    const parsed = parse(body);
    if (parsed === null) {
      log("the API answer had the wrong shape");
      return failed;
    }
    return { state: "ok", ...parsed };
  }
  if (REFUSED.has(response.status)) return refusal(response.status, body);
  log(`the API answered ${response.status}`);
  return failed;
}

/* ---- checkout ------------------------------------------------------------------------------------------- */

type Base = { host: string; visitor_ip: string };

export type ContactArgs = Base & {
  token: string;
  full_name: string;
  mobile: string;
  email: string;
  agreement_version_id: string;
  agreement_accept: string;
  enrollment_authorized: string;
};

/** `token` is the raw checkout token on the first call, "" afterwards; `expires_at` slides the cookie. */
export function checkoutContact(args: ContactArgs, c: Calls) {
  return packPost(
    "checkout/contact",
    args,
    (b) => (record(b) && typeof b.token === "string" && typeof b.expires_at === "string" ? { token: b.token, expires_at: b.expires_at } : null),
    c,
  );
}

/** Field name -> first message, for the contact the buyer just finished typing. */
export function checkoutCheck(args: Base & { mobile: string; email: string }, c: Calls) {
  return packPost(
    "checkout/check",
    args,
    (b) => {
      if (!record(b) || !record(b.errors)) return null;
      const errors: Record<string, string> = {};
      for (const [key, list] of Object.entries(b.errors)) {
        if (Array.isArray(list) && typeof list[0] === "string") errors[key] = list[0];
      }
      return { errors };
    },
    c,
  );
}

export type CheckoutState = { needs_code: boolean; mobile: string; verified: boolean; expires_at: string };

export function checkoutState(args: Base & { token: string }, c: Calls) {
  return packPost(
    "checkout/state",
    args,
    (b): CheckoutState | null =>
      record(b) && typeof b.needs_code === "boolean" && typeof b.mobile === "string" && typeof b.verified === "boolean" && typeof b.expires_at === "string"
        ? { needs_code: b.needs_code, mobile: b.mobile, verified: b.verified, expires_at: b.expires_at }
        : null,
    c,
  );
}

export function checkoutCodeSend(args: Base & { token: string }, c: Calls) {
  return packPost("checkout/code/send", args, (b) => (record(b) && typeof b.status === "string" ? { status: b.status } : null), c);
}

export function checkoutCodeVerify(args: Base & { token: string; code: string }, c: Calls) {
  return packPost("checkout/code/verify", args, (b) => (record(b) && b.status === "verified" ? { status: "verified" } : null), c);
}

/** The place call is multipart: the form's fields as text, the proof as the file. */
export function checkoutPlace(form: FormData, c: Calls) {
  return packPost(
    "checkout/place",
    form,
    (b) => (record(b) && typeof b.order_number === "string" && typeof b.replay === "boolean" ? { order_number: b.order_number, replay: b.replay } : null),
    c,
    PLACE_TIMEOUT_MS,
  );
}

/* ---- the agreement PDF and a payment account's QR code: bytes, fetched here and sent on from this host ---- */

export type PackFile = { bytes: ArrayBuffer; contentType: string };

async function packFile(path: string, host: string, c: Calls): Promise<PackFile | null> {
  const log = c.log ?? logPack;
  if (!host || c.env.secret.length < SECRET_MIN_LENGTH) return null;
  try {
    const response = await (c.fetchImpl ?? fetch)(`${c.env.apiBase}/storefront/v1/${path}?host=${encodeURIComponent(host)}`, {
      headers: { Authorization: `Bearer ${c.env.secret}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return null;
    if (response.status !== 200) {
      log(`the API answered ${response.status} for a file`);
      return null;
    }
    return { bytes: await response.arrayBuffer(), contentType: response.headers.get("content-type") ?? "" };
  } catch {
    log("a file could not be read");
    return null;
  }
}

export function fetchAgreementPdf(id: number, host: string, c: Calls) {
  return packFile(`pack/agreement/${id}/pdf/`, host, c);
}

export function fetchAccountQr(id: string, host: string, c: Calls) {
  return packFile(`payment-accounts/${encodeURIComponent(id)}/qr/`, host, c);
}

/* ---- the store policy pages: GET /storefront/v1/policies/{slug}/?host= (routes doc, PK12) ----------------------------- */

export const POLICY_SLUGS = ["terms-and-conditions", "privacy-policy", "shipping-policy", "return-refund-policy", "payment-policy"] as const;

export type Policy = {
  slug: string; title: string; version: string; effective_date: string;
  business: { name: string; address: string; email: string; phone: string; website_url: string; privacy_email: string; complaints_contact: string; registration_details: string };
  shipping: Record<string, string>;
  privacy: Record<string, string>;
};

function strings(v: unknown): Record<string, string> {
  return record(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, str(x)])) : {};
}

/** One policy page's values, or null: the page is not live (the one 404), the slug or host is unknown, or the API failed. */
export async function fetchPolicy(slug: string, host: string, c: Calls): Promise<Policy | null> {
  const log = c.log ?? logPack;
  if (!host || !(POLICY_SLUGS as readonly string[]).includes(slug) || c.env.secret.length < SECRET_MIN_LENGTH) return null;
  try {
    const response = await (c.fetchImpl ?? fetch)(`${c.env.apiBase}/storefront/v1/policies/${slug}/?host=${encodeURIComponent(host)}`, {
      headers: { Authorization: `Bearer ${c.env.secret}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return null;
    if (response.status !== 200) {
      log(`the API answered ${response.status} for a policy`);
      return null;
    }
    const b: unknown = await response.json();
    if (!record(b) || typeof b.slug !== "string" || typeof b.title !== "string" || !record(b.business)) return null;
    const biz = strings(b.business);
    return {
      slug: b.slug, title: b.title, version: str(b.version), effective_date: str(b.effective_date),
      business: {
        name: biz.name ?? "", address: biz.address ?? "", email: biz.email ?? "", phone: biz.phone ?? "", website_url: biz.website_url ?? "",
        privacy_email: biz.privacy_email ?? "", complaints_contact: biz.complaints_contact ?? "", registration_details: biz.registration_details ?? "",
      },
      shipping: strings(b.shipping), privacy: strings(b.privacy),
    };
  } catch {
    log("a policy could not be read");
    return null;
  }
}

/* ---- onboarding after payment, the Completed step, the order-access link and the ZIP lookup ---------------------- */

export type OnboardingStep = "verify" | "address" | "details" | "done";

export type OnboardingState = {
  step: OnboardingStep;
  order_number: string;
  buyer_first_name: string;
  mobile_masked: string;
  mobile: { pending: boolean; mobile: string; locked: boolean; code_sent_to: string; resend_in: number; attempts_left: number };
  email: { verified: boolean; email: string; masked: string; code_sent: boolean; resend_in: number; attempts_left: number };
  address: { country: string; receiver_name: string; receiver_mobile: string; line: string; barangay: string; city: string; province: string; zip: string; landmark: string };
  details_erased: boolean;
  registration_held: { label: string; line: string } | null;
  expires_at: string;
};

const STEPS = new Set(["verify", "address", "details", "done"]);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function parseOnboardingState(b: unknown): OnboardingState | null {
  if (!record(b) || typeof b.step !== "string" || !STEPS.has(b.step) || typeof b.order_number !== "string") return null;
  const mobile = record(b.mobile) ? b.mobile : {};
  const email = record(b.email) ? b.email : {};
  const address = record(b.address) ? b.address : {};
  const held = record(b.registration_held) ? { label: str(b.registration_held.label), line: str(b.registration_held.line) } : null;
  return {
    step: b.step as OnboardingStep,
    order_number: b.order_number,
    buyer_first_name: str(b.buyer_first_name),
    mobile_masked: str(b.mobile_masked),
    mobile: {
      pending: mobile.pending === true, mobile: str(mobile.mobile), locked: mobile.locked === true,
      code_sent_to: str(mobile.code_sent_to), resend_in: num(mobile.resend_in, 0), attempts_left: num(mobile.attempts_left, 5),
    },
    email: {
      verified: email.verified === true, email: str(email.email), masked: str(email.masked), code_sent: email.code_sent === true,
      resend_in: num(email.resend_in, 0), attempts_left: num(email.attempts_left, 5),
    },
    address: {
      country: str(address.country) || "Philippines", receiver_name: str(address.receiver_name), receiver_mobile: str(address.receiver_mobile),
      line: str(address.line), barangay: str(address.barangay), city: str(address.city), province: str(address.province),
      zip: str(address.zip), landmark: str(address.landmark),
    },
    details_erased: b.details_erased === true,
    registration_held: held,
    expires_at: str(b.expires_at),
  };
}

const parseState = (b: unknown) => {
  const s = parseOnboardingState(b);
  return s ? { ob: s } : null;
};

type Token = Base & { token: string };

export function onboardingState(args: Token, c: Calls) {
  return packPost("onboarding/state", args, parseState, c);
}
export function onboardingMobileSend(args: Token & { mobile?: string }, c: Calls) {
  return packPost("onboarding/mobile/send", args, parseState, c);
}
export function onboardingMobileVerify(args: Token & { code: string }, c: Calls) {
  return packPost("onboarding/mobile/verify", args, parseState, c);
}
export function onboardingEmailSend(args: Token, c: Calls) {
  return packPost("onboarding/email/send", args, parseState, c);
}
export function onboardingEmailVerify(args: Token & { code: string }, c: Calls) {
  return packPost("onboarding/email/verify", args, parseState, c);
}
export function onboardingAddress(
  args: Token & { receiver_name: string; receiver_mobile: string; line: string; province: string; city: string; barangay: string; landmark: string; postal_code: string },
  c: Calls,
) {
  return packPost("onboarding/address", args, parseState, c);
}
export function onboardingDetails(
  args: Token & { dob_year: string; dob_month: string; dob_day: string; desired_username: string; alternate_username: string; terms: boolean },
  c: Calls,
) {
  return packPost("onboarding/details", args, parseState, c);
}

export type CompletedResult = "issued" | "open" | "stale" | "spent";
export function onboardingCompleted(args: Token, c: Calls) {
  return packPost(
    "onboarding/completed",
    args,
    (b) => {
      if (!record(b) || typeof b.result !== "string" || !["issued", "open", "stale", "spent"].includes(b.result)) return null;
      return { result: b.result as CompletedResult, session_token: str(b.session_token) };
    },
    c,
  );
}

export function addressZip(args: Base & { province: string; city: string; barangay: string }, c: Calls) {
  return packPost(
    "address/zip",
    args,
    (b) => (record(b) && typeof b.ok === "boolean" ? { ok: b.ok, zip_code: str(b.zip_code), zip_precision: str(b.zip_precision) } : null),
    c,
  );
}

export function accessRead(args: Base & { link: string }, c: Calls) {
  return packPost(
    "access/read",
    args,
    (b) => (record(b) && typeof b.link_open === "boolean" && typeof b.renewable === "boolean" ? { link_open: b.link_open, renewable: b.renewable } : null),
    c,
  );
}
export function accessRenew(args: Base & { link: string }, c: Calls) {
  return packPost(
    "access/renew",
    args,
    (b) => (record(b) && typeof b.sent === "boolean" ? { sent: b.sent, link_open: b.link_open === true, renewable: b.renewable === true } : null),
    c,
  );
}
export function accessRedeem(args: Base & { link: string }, c: Calls) {
  return packPost(
    "access/redeem",
    args,
    (b) => (record(b) && typeof b.redeemed === "boolean" ? { redeemed: b.redeemed, token: str(b.token), expires_at: str(b.expires_at) } : null),
    c,
  );
}

/* ---- the member's payment card, own proof, new proof, and the registration card (backend PK8) ---------------------- */

export type PackProof = { id: string; seq: number; submitted_at: string; reference_number: string; amount_sent_centavos: number; content_type: string };
export type LockAccount = { id: string; provider_name: string; account_name: string };
export type MemberPack = {
  order_number: string;
  payment_status: "pending_review" | "rejected" | "verified";
  payment_label: string;
  method_label: string;
  price_centavos: number;
  tone: string;
  benefits_off: boolean;
  lock: { reason_label: string; other_text: string; resubmitted: boolean; accounts: LockAccount[] } | null;
  proofs: PackProof[];
};
export type RegistrationCard = {
  status: string;
  label: string;
  line: string;
  tone: string;
  details_form: boolean;
  details_erased: boolean;
  state_version: string;
  sante_member_id: string;
  needs_address: boolean;
};
export type MobileCheck = { pending: boolean; mobile: string; locked: boolean; code_sent_to: string; resend_in: number; attempts_left: number };

function parseProof(v: unknown): PackProof | null {
  if (!record(v) || (typeof v.id !== "string" && typeof v.id !== "number")) return null;
  return {
    id: String(v.id), seq: num(v.seq, 0), submitted_at: str(v.submitted_at), reference_number: str(v.reference_number),
    amount_sent_centavos: num(v.amount_sent_centavos, 0), content_type: str(v.content_type),
  };
}

function parsePack(v: unknown): MemberPack | null {
  if (!record(v) || typeof v.order_number !== "string") return null;
  const status = v.payment_status;
  if (status !== "pending_review" && status !== "rejected" && status !== "verified") return null;
  let lock: MemberPack["lock"] = null;
  if (record(v.lock)) {
    const accounts = Array.isArray(v.lock.accounts) ? v.lock.accounts : [];
    lock = {
      reason_label: str(v.lock.reason_label), other_text: str(v.lock.other_text), resubmitted: v.lock.resubmitted === true,
      accounts: accounts.flatMap((a): LockAccount[] =>
        record(a) && (typeof a.id === "string" || typeof a.id === "number")
          ? [{ id: String(a.id), provider_name: str(a.provider_name), account_name: str(a.account_name) }] : []),
    };
  }
  const proofs = Array.isArray(v.proofs) ? v.proofs.flatMap((p) => { const x = parseProof(p); return x ? [x] : []; }) : [];
  return {
    order_number: v.order_number, payment_status: status, payment_label: str(v.payment_label), method_label: str(v.method_label),
    price_centavos: num(v.price_centavos, 0), tone: str(v.tone), benefits_off: v.benefits_off === true, lock, proofs,
  };
}

function parseRegistration(v: unknown): RegistrationCard | null {
  if (!record(v) || typeof v.status !== "string") return null;
  return {
    status: v.status, label: str(v.label), line: str(v.line), tone: str(v.tone), details_form: v.details_form === true,
    details_erased: v.details_erased === true, state_version: str(v.state_version), sante_member_id: str(v.sante_member_id),
    needs_address: v.needs_address === true,
  };
}

function parseMobile(v: unknown): MobileCheck {
  const m = record(v) ? v : {};
  return {
    pending: m.pending === true, mobile: str(m.mobile), locked: m.locked === true, code_sent_to: str(m.code_sent_to),
    resend_in: num(m.resend_in, 0), attempts_left: num(m.attempts_left, 5),
  };
}

/** member/pack/ and member/pack/resubmit/: `pack` is null with no order; `registration` null while benefits are off. */
const parsePackAnswer = (b: unknown) => {
  if (!record(b) || !("pack" in b)) return null;
  const pack = b.pack === null ? null : parsePack(b.pack);
  if (b.pack !== null && pack === null) return null;
  const registration = record(b.registration) ? parseRegistration(b.registration) : null;
  return { pack, registration };
};

type Member = Base & { token: string };

export function memberPack(args: Member, c: Calls) {
  return packPost("member/pack", args, parsePackAnswer, c);
}

export function memberPackResubmit(form: FormData, c: Calls) {
  return packPost("member/pack/resubmit", form, parsePackAnswer, c, PLACE_TIMEOUT_MS);
}

/** member/registration/*: the registration card and the mobile check, as the Home card and the lock dialog show them. */
const parseRegAnswer = (b: unknown) => {
  if (!record(b)) return null;
  const registration = record(b.registration) ? parseRegistration(b.registration) : null;
  return { registration, mobile: parseMobile(b.mobile) };
};

export const memberRegistration = (args: Member, c: Calls) => packPost("member/registration", args, parseRegAnswer, c);
export const registrationMobileSend = (args: Member & { mobile?: string }, c: Calls) =>
  packPost("member/registration/mobile/send", args, parseRegAnswer, c);
export const registrationMobileVerify = (args: Member & { code: string }, c: Calls) =>
  packPost("member/registration/mobile/verify", args, parseRegAnswer, c);
export const registrationDetails = (
  args: Member & { date_of_birth: string; desired_username: string; alternate_username: string; delivery_address?: { line: string; barangay: string; city: string; province: string; zip: string } },
  c: Calls,
) => packPost("member/registration/details", args, parseRegAnswer, c);

/** The member's own proof (an image or PDF), by the id the card lists. Fetched here and sent on: no URL reaches the browser. */
export async function fetchOwnProof(args: Member & { proof_id: string }, c: Calls): Promise<PackFile | null> {
  const log = c.log ?? logPack;
  if (!args.host || !args.token || c.env.secret.length < SECRET_MIN_LENGTH) return null;
  try {
    const response = await (c.fetchImpl ?? fetch)(`${c.env.apiBase}/storefront/v1/member/pack/proof/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.env.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status !== 200) {
      if (response.status !== 404 && response.status !== 401) log(`the API answered ${response.status} for a proof`);
      return null;
    }
    return { bytes: await response.arrayBuffer(), contentType: response.headers.get("content-type") ?? "" };
  } catch {
    log("a proof could not be read");
    return null;
  }
}

/* ---- the member Home figures and the My Orders cards (routes doc: member/home, member/orders) ----------------------------
   TWCinc's field names; money arrives already formatted ("1,488.00") beside its centavos. */

export type HomeSummary = { total_spent: string; total_orders: number; delivered: number; needs_attention: number };
export type OrderMonitor = {
  delta: number; awaiting_approval: number; for_booking: number; for_shipping: number; delivered: number;
  series: { label: string; count: number; h: number }[]; has_orders: boolean;
};
export type OrderStep = { state: string; num: number; label: string; date: string };
export type OrderCard = {
  order_number: string; created_at: string; total: string; payment_label: string; headline: string; chip_class: string; chip_label: string;
  problem: boolean; problem_line: string; note: string; awaiting_payment: boolean; under_review: boolean; steps: OrderStep[];
  courier: string; tracking: string; shipping_label: string; item_count: number; item_lines: { qty: number; name: string }[];
  address: string; receiver_name: string; receiver_mobile: string;
  membership: { label: string; line: string; registered: boolean; sante_member_id: string; act: boolean } | null;
};

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function parseMonitor(v: unknown): OrderMonitor | null {
  if (!record(v)) return null;
  return {
    delta: num(v.delta, 0), awaiting_approval: num(v.awaiting_approval, 0), for_booking: num(v.for_booking, 0),
    for_shipping: num(v.for_shipping, 0), delivered: num(v.delivered, 0), has_orders: v.has_orders === true,
    series: arr(v.series).flatMap((d) => (record(d) ? [{ label: str(d.label), count: num(d.count, 0), h: Math.min(100, Math.max(0, Math.round(num(d.h, 0)))) }] : [])),
  };
}

function parseCard(v: unknown): OrderCard | null {
  if (!record(v) || typeof v.order_number !== "string") return null;
  const m = record(v.membership) ? v.membership : null;
  return {
    order_number: v.order_number, created_at: str(v.created_at), total: str(v.total),
    payment_label: str(v.payment_label), headline: str(v.headline), chip_class: str(v.chip_class), chip_label: str(v.chip_label),
    problem: v.problem === true, problem_line: str(v.problem_line), note: str(v.note), awaiting_payment: v.awaiting_payment === true,
    under_review: v.under_review === true,
    steps: arr(v.steps).flatMap((s) => (record(s) ? [{ state: str(s.state), num: num(s.num, 0), label: str(s.label), date: str(s.date) }] : [])),
    courier: str(v.courier), tracking: str(v.tracking), shipping_label: str(v.shipping_label), item_count: num(v.item_count, 0),
    item_lines: arr(v.item_lines).flatMap((l) => (record(l) ? [{ qty: num(l.qty, 0), name: str(l.name) }] : [])),
    address: str(v.address), receiver_name: str(v.receiver_name), receiver_mobile: str(v.receiver_mobile),
    membership: m ? { label: str(m.label), line: str(m.line), registered: m.registered === true, sante_member_id: str(m.sante_member_id), act: m.act === true } : null,
  };
}

export function memberHome(args: Member, c: Calls) {
  return packPost("member/home", args, (b) => {
    if (!record(b) || !record(b.summary)) return null;
    const monitor = parseMonitor(b.order_monitor);
    if (!monitor) return null;
    const s = b.summary;
    return { summary: { total_spent: str(s.total_spent), total_orders: num(s.total_orders, 0), delivered: num(s.delivered, 0), needs_attention: num(s.needs_attention, 0) }, monitor };
  }, c);
}

export function memberOrders(args: Member, c: Calls) {
  return packPost("member/orders", args, (b) => (record(b) && Array.isArray(b.cards) ? { cards: b.cards.flatMap((x) => { const k = parseCard(x); return k ? [k] : []; }) } : null), c);
}

/* ---- the member Account page, verify-email and the contact change (routes doc, PK13) --------------------------------- */

export type AccountInfo = {
  member_name: string; mobile_masked: string; mobile_state: string; email_masked: string; email_state: string;
  default_channel: string; hold_banner: string;
};
export type VerifyEmailState = { step: "send" | "code" | "done"; email_masked: string; message: string };
export type ChangeStep = "current" | "current_code" | "replacement" | "replacement_code";
export type ChangeState = { field: "mobile" | "email"; current_masked: string; proof_channel: string; proof_masked: string; step: ChangeStep };
export type ChangeField = "mobile" | "email";

export const memberAccount = (args: Member, c: Calls) =>
  packPost("member/account", args, (b): AccountInfo | null => !record(b) ? null : {
    member_name: str(b.member_name), mobile_masked: str(b.mobile_masked), mobile_state: str(b.mobile_state), email_masked: str(b.email_masked),
    email_state: str(b.email_state), default_channel: str(b.default_channel), hold_banner: str(b.hold_banner),
  }, c);

function parseVerifyEmail(b: unknown): VerifyEmailState | null {
  if (!record(b) || (b.step !== "send" && b.step !== "code" && b.step !== "done")) return null;
  return { step: b.step, email_masked: str(b.email_masked), message: str(b.message) };
}
export const memberVerifyEmail = (args: Member, c: Calls) => packPost("member/account/verify-email", args, parseVerifyEmail, c);
export const memberVerifyEmailSend = (args: Member, c: Calls) => packPost("member/account/verify-email/send", args, parseVerifyEmail, c);
export const memberVerifyEmailVerify = (args: Member & { code: string }, c: Calls) => packPost("member/account/verify-email/verify", args, parseVerifyEmail, c);

const CHANGE_STEPS = new Set(["current", "current_code", "replacement", "replacement_code"]);
function parseChange(b: unknown): ChangeState | null {
  if (!record(b) || (b.field !== "mobile" && b.field !== "email") || typeof b.step !== "string" || !CHANGE_STEPS.has(b.step)) return null;
  return { field: b.field, current_masked: str(b.current_masked), proof_channel: str(b.proof_channel), proof_masked: str(b.proof_masked), step: b.step as ChangeStep };
}
export const memberChange = (field: ChangeField, args: Member, c: Calls) => packPost(`member/account/change/${field}`, args, parseChange, c);
export const memberChangeAct = (
  field: ChangeField,
  args: Member & { action: "send_current" | "verify_current" | "send_replacement" | "verify_replacement"; code?: string; new_value?: string },
  c: Calls,
) => packPost(`member/account/change/${field}/act`, args, (b) => (record(b) ? { changed: b.changed === true } : null), c);
