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
