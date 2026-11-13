/* The buyer portal calls to Django: the storefront surface under /storefront/v1/portal/ (backend apps/pack/api_portal.py).
   All POST, all with the server credential. The portal is for a paid Membership Pack buyer of a Santé site that is off,
   so it never asks about a site through siteFor: `portal/site/` answers for the host, and a 404 from any portal route is
   "not open" (the neutral page). Unknown fails closed: a bad shape, a timeout, a missing secret all read as failed.
   Nothing a visitor typed, no code, token or contact, is ever logged. */
import type { StorefrontEnv } from "./env.ts";
import { SECRET_MIN_LENGTH, type MemberRefusal, type MemberResult, type SignInAnswer } from "./django.ts";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Log = (reason: string) => void;
export type PortalCalls = { env: Pick<StorefrontEnv, "apiBase" | "secret">; fetchImpl?: Fetch; log?: Log };

const logPortal: Log = (reason) => console.error(`storefront: portal call failed: ${reason}`);
const TIMEOUT_MS = 5000;
const SIGNIN_TIMEOUT_MS = 10000; // Django paces every sign-in step to at least 1.5 s

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const text = (value: unknown): value is string => typeof value === "string";

/* ---- what the contract says (apps/pack/api_portal.py, apps/pack/portal.py `card()`) --------------------------- */

export type PortalSite = { display_name: string; accent_color: string; closes_at: string | null; banner: string };
export type PortalStep = { num: number; label: string; status: string; date: string | null };
export type PortalProof = {
  id: string; seq: number; submitted_at: string; amount_sent_centavos: number; reference_number: string; content_type: string;
};
export type PortalCard = {
  id: string; order_number: string; created_at: string; total_centavos: number; total_text: string;
  payment_method_label: string; payment_status: string; payment_label: string; verified_at: string | null;
  steps: PortalStep[]; courier: string; tracking: string; shipped_on: string | null; delivered_on: string | null;
  proofs: PortalProof[]; registration: { label: string; line: string } | null;
};
export type PortalOrders = { cards: PortalCard[]; closes_at: string | null; banner: string };

const nullable = (value: unknown): value is string | null => value === null || text(value);

function parseSite(body: unknown): PortalSite | null {
  if (!record(body) || !text(body.display_name) || !text(body.accent_color) || !nullable(body.closes_at) || !text(body.banner)) return null;
  return { display_name: body.display_name, accent_color: body.accent_color, closes_at: body.closes_at, banner: body.banner };
}

function parseStep(value: unknown): PortalStep | null {
  if (!record(value) || typeof value.num !== "number" || !text(value.label) || !text(value.status) || !nullable(value.date)) return null;
  return { num: value.num, label: value.label, status: value.status, date: value.date };
}

function parseProof(value: unknown): PortalProof | null {
  if (!record(value) || !text(value.id) || typeof value.seq !== "number" || !text(value.submitted_at) || typeof value.amount_sent_centavos !== "number"
    || !text(value.reference_number) || !text(value.content_type)) return null;
  return {
    id: value.id, seq: value.seq, submitted_at: value.submitted_at, amount_sent_centavos: value.amount_sent_centavos,
    reference_number: value.reference_number, content_type: value.content_type,
  };
}

function parseCard(value: unknown): PortalCard | null {
  if (!record(value) || !text(value.id) || !text(value.order_number) || !text(value.created_at) || typeof value.total_centavos !== "number"
    || !text(value.total_text) || !text(value.payment_method_label) || !text(value.payment_status) || !text(value.payment_label)
    || !nullable(value.verified_at) || !text(value.courier) || !text(value.tracking) || !nullable(value.shipped_on) || !nullable(value.delivered_on)
    || !Array.isArray(value.steps) || !Array.isArray(value.proofs)) return null;
  const steps = value.steps.map(parseStep);
  const proofs = value.proofs.map(parseProof);
  let registration: PortalCard["registration"] = null;
  if (value.registration !== null && value.registration !== undefined) {
    const r = value.registration;
    if (!record(r) || !text(r.label) || !text(r.line)) return null;
    registration = { label: r.label, line: r.line };
  }
  if (steps.some((s) => s === null) || proofs.some((p) => p === null)) return null;
  return {
    id: value.id, order_number: value.order_number, created_at: value.created_at, total_centavos: value.total_centavos, total_text: value.total_text,
    payment_method_label: value.payment_method_label, payment_status: value.payment_status, payment_label: value.payment_label,
    verified_at: value.verified_at, steps: steps as PortalStep[], courier: value.courier, tracking: value.tracking,
    shipped_on: value.shipped_on, delivered_on: value.delivered_on, proofs: proofs as PortalProof[], registration,
  };
}

function parseOrders(body: unknown): PortalOrders | null {
  if (!record(body) || !Array.isArray(body.cards) || !nullable(body.closes_at) || !text(body.banner)) return null;
  const cards = body.cards.map(parseCard);
  if (cards.some((c) => c === null)) return null;
  return { cards: cards as PortalCard[], closes_at: body.closes_at, banner: body.banner };
}

/* ---- the one POST ------------------------------------------------------------------------------------------- */

function refusal(status: number, body: unknown): MemberRefusal {
  const error = record(body) && record(body.error) ? body.error : {};
  const fields: Record<string, string> = {};
  if (record(error.fields)) {
    for (const [key, list] of Object.entries(error.fields)) if (Array.isArray(list) && text(list[0])) fields[key] = list[0];
  }
  return { state: "refused", status, code: text(error.code) ? error.code : "", message: text(error.message) ? error.message : "", fields };
}

async function portalPost<T>(path: string, payload: Record<string, string>, parse: (body: unknown) => T | null, c: PortalCalls, timeout = TIMEOUT_MS): Promise<MemberResult<T>> {
  const log = c.log ?? logPortal;
  if (c.env.secret.length < SECRET_MIN_LENGTH) {
    log("STOREFRONT_SERVER_SECRET is not set");
    return { state: "failed" };
  }
  let response: Response;
  try {
    response = await (c.fetchImpl ?? fetch)(`${c.env.apiBase}/storefront/v1/portal/${path}/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.env.secret}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    log(name === "TimeoutError" || name === "AbortError" ? "the API did not answer in time" : "the API could not be reached");
    return { state: "failed" };
  }
  if (response.status === 404) return { state: "unavailable" }; // not open: the everyday answer, not logged
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    log(`the API answered ${response.status} without JSON`);
    return { state: "failed" };
  }
  if (response.status === 200) {
    const parsed = parse(body);
    if (parsed === null) {
      log("the API answer had the wrong shape");
      return { state: "failed" };
    }
    return { state: "ok", ...parsed };
  }
  if ([400, 401, 429, 503].includes(response.status)) return refusal(response.status, body);
  log(`the API answered ${response.status}`);
  return { state: "failed" };
}

const answer = (body: unknown): SignInAnswer | null =>
  record(body) && text(body.step) && text(body.message) && typeof body.offer_email === "boolean" ? (body as SignInAnswer) : null;

type SignInStep = { host: string; visitor_ip: string; binding: string };

export const portalSite = (host: string, c: PortalCalls) => portalPost("site", { host }, parseSite, c);
export const portalSignInRequest = (a: SignInStep & { contact: string }, c: PortalCalls) => portalPost("signin/request", a, answer, c, SIGNIN_TIMEOUT_MS);
export const portalSignInResend = (a: SignInStep, c: PortalCalls) => portalPost("signin/resend", a, answer, c, SIGNIN_TIMEOUT_MS);
export const portalSignInAcceptEmail = (a: SignInStep, c: PortalCalls) => portalPost("signin/accept-email", a, answer, c, SIGNIN_TIMEOUT_MS);
export const portalSignInVerify = (a: SignInStep & { code: string }, c: PortalCalls) =>
  portalPost("signin/verify", a, (body) => (record(body) && text(body.token) && body.token ? { token: body.token } : null), c, SIGNIN_TIMEOUT_MS);
/** The signed-in buyer. A refusal with status 401 means not signed in; 404 is not open (or not a paid buyer). */
export const portalMe = (a: { host: string; token: string }, c: PortalCalls) =>
  portalPost("me", a, (body) => (record(body) && text(body.first_name) ? { first_name: body.first_name } : null), c);
export const portalSignOut = (a: { host: string; token: string }, c: PortalCalls) =>
  portalPost("signout", a, (body) => (record(body) && body.status === "signed_out" ? {} : null), c);
export const portalOrders = (a: { host: string; token: string }, c: PortalCalls) => portalPost("orders", a, parseOrders, c);

/** The buyer's own proof file, by the id the card lists. Fetched here and sent on: no URL of the file store reaches the browser. */
export async function portalProof(a: { host: string; token: string; proof_id: string }, c: PortalCalls): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const log = c.log ?? logPortal;
  if (!a.host || !a.token || c.env.secret.length < SECRET_MIN_LENGTH) return null;
  try {
    const response = await (c.fetchImpl ?? fetch)(`${c.env.apiBase}/storefront/v1/portal/proof/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.env.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(a),
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
