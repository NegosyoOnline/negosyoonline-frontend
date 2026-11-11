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
