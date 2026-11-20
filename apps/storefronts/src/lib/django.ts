/* The one place that calls Django. Every call goes to the storefront surface
   (/storefront/v1/, backend apps/storefront) with the server credential.

   Unknown fails closed: a site that is not served, any other status, a timeout, an answer
   of the wrong shape or a missing secret all give null, and the caller answers the neutral
   404. The reason goes to the server log, never with the secret or the URL.

   The contact call fails closed the same way: anything but a clear "sent", a clear list of
   field errors or the limit's own answer is "failed". Nothing a visitor typed, and not their address, is ever logged. */
import type { StorefrontEnv } from "./env.ts";

export type Site = {
  id: string;
  template: "sante";
  display_name: string;
  accent_color: string;
  facebook_url: string;
  instagram_url: string;
  tiktok_url: string;
  business: {
    registered_name: string;
    tin: string;
    dti_business_number: string;
    contact_email: string;
    contact_mobile: string;
    has_seal: boolean;
  };
  distributor: { name: string; mobile: string; has_photo: boolean };
  policy_links: { label: string; path: string }[];
  free_shipping_banner: boolean;
  /* The site's Meta Pixel ID, "" for none. The backend sends it only while its Meta switch is on; an older backend
     sends no key at all, which reads as "" (src/lib/django.ts fetchSite). */
  meta_pixel_id: string;
  /* The explicit custom hostname the backend serves this site on (the canonical apex, e.g. "shop.example"), "" for none. It is
     sent only when the request host IS that hostname; an older backend sends no key at all, which reads as "" (fetchSite). */
  custom_host: string;
};

export const SECRET_MIN_LENGTH = 32; // the backend's own rule: shorter counts as not set
const TIMEOUT_MS = 5000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Log = (reason: string) => void;

const logReason: Log = (reason) => console.error(`storefront: site lookup failed: ${reason}`);
const logContact: Log = (reason) => console.error(`storefront: contact message not sent: ${reason}`);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function has(value: Record<string, unknown>, strings: string[], booleans: string[]): boolean {
  return (
    strings.every((key) => typeof value[key] === "string") &&
    booleans.every((key) => typeof value[key] === "boolean")
  );
}

/** The shape check. `meta_pixel_id` may be absent (an older backend), but a key of the wrong type is a wrong shape. */
export function isSite(value: unknown): value is Omit<Site, "meta_pixel_id" | "custom_host"> & { meta_pixel_id?: string; custom_host?: string } {
  return (
    record(value) &&
    value.template === "sante" &&
    (value.meta_pixel_id === undefined || typeof value.meta_pixel_id === "string") &&
    (value.custom_host === undefined || typeof value.custom_host === "string") &&
    has(
      value,
      ["id", "display_name", "accent_color", "facebook_url", "instagram_url", "tiktok_url"],
      ["free_shipping_banner"],
    ) &&
    record(value.business) &&
    has(
      value.business,
      ["registered_name", "tin", "dti_business_number", "contact_email", "contact_mobile"],
      ["has_seal"],
    ) &&
    record(value.distributor) &&
    has(value.distributor, ["name", "mobile"], ["has_photo"]) &&
    Array.isArray(value.policy_links) &&
    value.policy_links.every((link) => record(link) && has(link, ["label", "path"], []))
  );
}

/** The Santé site served at this host right now, or null. */
export async function fetchSite(
  host: string,
  env: Pick<StorefrontEnv, "apiBase" | "secret">,
  fetchImpl: Fetch = fetch,
  log: Log = logReason,
): Promise<Site | null> {
  if (!host) return null;
  if (env.secret.length < SECRET_MIN_LENGTH) {
    log("STOREFRONT_SERVER_SECRET is not set");
    return null;
  }
  let response: Response;
  try {
    response = await fetchImpl(`${env.apiBase}/storefront/v1/site/?host=${encodeURIComponent(host)}`, {
      headers: { Authorization: `Bearer ${env.secret}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    log(name === "TimeoutError" || name === "AbortError" ? "the API did not answer in time" : "the API could not be reached");
    return null;
  }
  if (response.status === 404) return null; // not served: the everyday answer, not logged
  if (response.status !== 200) {
    log(`the API answered ${response.status}`);
    return null;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    log("the API answer was not JSON");
    return null;
  }
  if (!isSite(body)) {
    log("the API answer was not a Santé site");
    return null;
  }
  return { ...body, meta_pixel_id: body.meta_pixel_id ?? "", custom_host: (body.custom_host ?? "").trim().toLowerCase() };
}

export type ContactMessage = {
  host: string;
  visitor_ip: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  website: string; // the form's hidden field, passed on as posted: the API decides what it means
};

export type ContactFieldErrors = { name?: string; email?: string; subject?: string; message?: string };

export type ContactResult =
  | { state: "sent" }
  | { state: "invalid"; errors: ContactFieldErrors }
  | { state: "limited" } // too many messages from this visitor's address in the last hour
  | { state: "failed" };

const FAILED: ContactResult = { state: "failed" };
const QUIET = [404, 409]; // not served, no contact email: everyday answers, not logged

function fieldErrors(body: unknown): ContactFieldErrors {
  const fields = record(body) && record(body.error) && record(body.error.fields) ? body.error.fields : {};
  const errors: ContactFieldErrors = {};
  for (const key of ["name", "email", "subject", "message"] as const) {
    const list = fields[key];
    const first = Array.isArray(list) ? list[0] : undefined;
    if (typeof first === "string" && first) errors[key] = first;
  }
  return errors;
}

/** Hands a visitor's "Send a Message" form to Django, which emails it to the store. */
export async function sendContact(
  message: ContactMessage,
  env: Pick<StorefrontEnv, "apiBase" | "secret">,
  fetchImpl: Fetch = fetch,
  log: Log = logContact,
): Promise<ContactResult> {
  if (!message.host) return FAILED;
  if (env.secret.length < SECRET_MIN_LENGTH) {
    log("STOREFRONT_SERVER_SECRET is not set");
    return FAILED;
  }
  let response: Response;
  try {
    response = await fetchImpl(`${env.apiBase}/storefront/v1/contact/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.secret}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    log(name === "TimeoutError" || name === "AbortError" ? "the API did not answer in time" : "the API could not be reached");
    return FAILED;
  }
  if (response.status === 429) return { state: "limited" }; // an everyday answer too, not logged
  if (QUIET.includes(response.status)) return FAILED;
  if (response.status !== 200 && response.status !== 400) {
    log(`the API answered ${response.status}`);
    return FAILED;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    log("the API answer was not JSON");
    return FAILED;
  }
  if (response.status === 200) {
    if (record(body) && body.status === "sent") return { state: "sent" };
    log("the API answer was not a sent message");
    return FAILED;
  }
  const errors = fieldErrors(body);
  if (Object.keys(errors).length === 0) {
    log("the API refused the form without naming a field");
    return FAILED;
  }
  return { state: "invalid", errors };
}

/* --- the member calls ------------------------------------------------------------------------
   Backend apps/members/api.py, under /storefront/v1/member/. The session token and the sign-in binding
   are passed as data: this server keeps them in its own cookies, Django only stores their SHA-256.
   Nothing a visitor typed, no code, token or contact, is ever logged. */

export type Member = {
  id: string;
  full_name: string;
  email: string;
  mobile: string;
  email_verified: boolean;
  mobile_verified: boolean;
};

export type SignInAnswer = { step: string; message: string; offer_email: boolean };

/** What Django refused with: its status, error code and message, and the first message of each field. */
export type MemberRefusal = { state: "refused"; status: number; code: string; message: string; fields: Record<string, string> };

export type MemberResult<T> =
  | ({ state: "ok" } & T)
  | MemberRefusal
  | { state: "unavailable" } // 404: members are switched off, or the host is not a served site
  | { state: "failed" };

const logMember: Log = (reason) => console.error(`storefront: member call failed: ${reason}`);

function isMember(value: unknown): value is Member {
  return record(value) && has(value, ["id", "full_name", "email", "mobile"], ["email_verified", "mobile_verified"]);
}

function refusal(status: number, body: unknown): MemberRefusal {
  const error = record(body) && record(body.error) ? body.error : {};
  const fields: Record<string, string> = {};
  if (record(error.fields)) {
    for (const [key, list] of Object.entries(error.fields)) {
      if (Array.isArray(list) && typeof list[0] === "string") fields[key] = list[0];
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

async function memberPost<T>(
  path: string,
  payload: Record<string, string>,
  parse: (body: unknown) => T | null,
  env: Pick<StorefrontEnv, "apiBase" | "secret">,
  fetchImpl: Fetch,
  log: Log,
): Promise<MemberResult<T>> {
  const failed: MemberResult<T> = { state: "failed" };
  if (env.secret.length < SECRET_MIN_LENGTH) {
    log("STOREFRONT_SERVER_SECRET is not set");
    return failed;
  }
  let response: Response;
  try {
    response = await fetchImpl(`${env.apiBase}/storefront/v1/member/${path}/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.secret}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(MEMBER_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    log(name === "TimeoutError" || name === "AbortError" ? "the API did not answer in time" : "the API could not be reached");
    return failed;
  }
  if (response.status === 404) return { state: "unavailable" }; // the everyday answer while the switch is off
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
  if ([400, 401, 429, 503].includes(response.status)) return refusal(response.status, body);
  log(`the API answered ${response.status}`);
  return failed;
}

// Django paces every sign-in step to at least 1.5 s, so the member calls wait longer than the site lookup.
const MEMBER_TIMEOUT_MS = 10000;

type Calls = { env: Pick<StorefrontEnv, "apiBase" | "secret">; fetchImpl?: Fetch; log?: Log };

function answer(body: unknown): SignInAnswer | null {
  return record(body) && has(body, ["step", "message"], ["offer_email"]) ? (body as SignInAnswer) : null;
}

type SignInStep = { host: string; visitor_ip: string; binding: string };

export function memberSignInRequest(args: SignInStep & { contact: string }, c: Calls) {
  return memberPost("signin/request", args, answer, c.env, c.fetchImpl ?? fetch, c.log ?? logMember);
}

export function memberSignInResend(args: SignInStep, c: Calls) {
  return memberPost("signin/resend", args, answer, c.env, c.fetchImpl ?? fetch, c.log ?? logMember);
}

export function memberSignInAcceptEmail(args: SignInStep, c: Calls) {
  return memberPost("signin/accept-email", args, answer, c.env, c.fetchImpl ?? fetch, c.log ?? logMember);
}

export function memberSignInVerify(args: SignInStep & { code: string }, c: Calls) {
  return memberPost(
    "signin/verify",
    args,
    (body) => (record(body) && typeof body.token === "string" && body.token && isMember(body.member) ? { token: body.token, member: body.member } : null),
    c.env, c.fetchImpl ?? fetch, c.log ?? logMember,
  );
}

/** The member of this session. A refusal with status 401 means not signed in. */
export function memberMe(args: { host: string; token: string }, c: Calls) {
  return memberPost("me", args, (body) => (record(body) && isMember(body.member) ? { member: body.member } : null), c.env, c.fetchImpl ?? fetch, c.log ?? logMember);
}

export function memberSignOut(args: { host: string; token: string }, c: Calls) {
  return memberPost("signout", args, (body) => (record(body) && body.status === "signed_out" ? {} : null), c.env, c.fetchImpl ?? fetch, c.log ?? logMember);
}

/** "Text me the code". NOT LIVE: the member SMS slice (PK2b) has not merged, so this route's name and shape are
    this file's guess, and nothing calls it while TEXT_ME_ENABLED (src/views/sante/member.ts) is false. Check it
    against the merged backend before enabling. */
export function memberSignInText(args: SignInStep, c: Calls) {
  return memberPost("signin/text", args, answer, c.env, c.fetchImpl ?? fetch, c.log ?? logMember);
}

/* ---- the Membership Pack read (GET /storefront/v1/pack/, backend apps/sante/pack_api.py) ------------------- */

export type Pack = {
  price_centavos: number;
  currency: string;
  available: boolean;
  agreement: { id: number; label: string; effective_date: string } | null;
  payment_accounts: Record<string, unknown>[];
  /** The payment methods the site offers at checkout (its owner's switches AND set up). Absent in an older API answer:
      then transfer only, as before Xendit. */
  methods?: { direct: boolean; xendit: boolean };
};

/** The methods a pack offers, with the answer of an API that does not send them read as transfer only. */
export function packMethods(pack: Pick<Pack, "methods">): { direct: boolean; xendit: boolean } {
  return pack.methods ?? { direct: true, xendit: false };
}

function isPack(value: unknown): value is Pack {
  return (
    record(value) &&
    typeof value.price_centavos === "number" &&
    Number.isInteger(value.price_centavos) &&
    value.price_centavos >= 0 &&
    typeof value.currency === "string" &&
    typeof value.available === "boolean" &&
    (value.agreement === null || (record(value.agreement) && typeof value.agreement.id === "number" && has(value.agreement, ["label", "effective_date"], []))) &&
    Array.isArray(value.payment_accounts) &&
    value.payment_accounts.every(record) &&
    (value.methods === undefined || (record(value.methods) && typeof value.methods.direct === "boolean" && typeof value.methods.xendit === "boolean"))
  );
}

/** The pack as this site's buyers see it, or null: the pack is switched off, the host is not a served Santé site,
    or the API did not answer sensibly. Callers answer the neutral 404 for null (fails closed). */
export async function fetchPack(
  host: string,
  env: Pick<StorefrontEnv, "apiBase" | "secret">,
  fetchImpl: Fetch = fetch,
  log: Log = (reason) => console.error(`storefront: pack read failed: ${reason}`),
): Promise<Pack | null> {
  if (!host) return null;
  if (env.secret.length < SECRET_MIN_LENGTH) {
    log("STOREFRONT_SERVER_SECRET is not set");
    return null;
  }
  let response: Response;
  try {
    response = await fetchImpl(`${env.apiBase}/storefront/v1/pack/?host=${encodeURIComponent(host)}`, {
      headers: { Authorization: `Bearer ${env.secret}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    log(name === "TimeoutError" || name === "AbortError" ? "the API did not answer in time" : "the API could not be reached");
    return null;
  }
  if (response.status === 404) return null; // the pack is off, or not this site's: the everyday answer, not logged
  if (response.status !== 200) {
    log(`the API answered ${response.status}`);
    return null;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    log("the API answer was not JSON");
    return null;
  }
  if (!isPack(body)) {
    log("the API answer was not a pack");
    return null;
  }
  return body;
}

/* ---- the website chat (POST /storefront/v1/chat/send/ and /chat/poll/, backend apps/inquiries/api_storefront.py) ------------
   Server to server only. The site comes from `host` alone. The visitor's secret is passed as data: this server keeps it in its own
   cookie, Django only stores its SHA-256. Nothing a visitor typed, no secret and no address is ever logged. */

export type ChatMessage = { id: number; text: string; at: string };

/** The chat's state for this visitor: "none" (no conversation), "open", "closed" or "paused". */
export type ChatAnswer = { state: "none" | "open" | "closed" | "paused"; visitor_secret: string; messages: ChatMessage[] };

export type ChatRefusal = { state: "refused"; status: number; code: string; message: string; fields: Record<string, string> };

export type ChatResult<T = ChatAnswer> =
  | { state: "ok"; chat: T }
  | ChatRefusal
  | { state: "unavailable" } // 404: chat is switched off, or the host is not a served site
  | { state: "failed" };

export type ChatSend = {
  host: string;
  visitor_ip: string;
  visitor_secret: string;
  name: string;
  email: string;
  text: string;
  website: string; // the widget's hidden field, passed on as posted: the API decides what it means
  opened_at: string | null;
  after_id: number;
  pack_visitor_ref?: string; // the Membership Pack visit ref, only when the widget sent a well-formed one
};

export type ChatPoll = { host: string; visitor_ip: string; visitor_secret: string; after_id: number };

/** The visitor's optional way to be reached: one mobile number or one email, checked and told apart by Django. */
export type ChatContact = { host: string; visitor_ip: string; visitor_secret: string; contact: string; pack_visitor_ref?: string };

/** Django's 200 for a saved contact. */
export type ChatContactSaved = { saved: true; kind: "email" | "mobile" } | { saved: false; kind: "" };

const logChat: Log = (reason) => console.error(`storefront: chat call failed: ${reason}`);
const CHAT_STATES = ["none", "open", "closed", "paused"];

function chatAnswer(body: unknown): ChatAnswer | null {
  if (!record(body) || typeof body.state !== "string" || !CHAT_STATES.includes(body.state)) return null;
  if (typeof body.visitor_secret !== "string" || !Array.isArray(body.messages)) return null;
  const messages: ChatMessage[] = [];
  for (const m of body.messages) {
    if (!record(m) || typeof m.id !== "number" || !Number.isInteger(m.id) || typeof m.text !== "string" || typeof m.at !== "string") return null;
    messages.push({ id: m.id, text: m.text, at: m.at });
  }
  return { state: body.state as ChatAnswer["state"], visitor_secret: body.visitor_secret, messages };
}

function contactAnswer(body: unknown): ChatContactSaved | null {
  if (!record(body)) return null;
  if (body.saved === false && body.kind === "") return { saved: false, kind: "" }; // chat is off or paused for the site: nothing was saved
  if (body.saved !== true || (body.kind !== "email" && body.kind !== "mobile")) return null;
  return { saved: true, kind: body.kind };
}

async function chatPost<T = ChatAnswer>(
  path: "send" | "poll" | "contact",
  payload: ChatSend | ChatPoll | ChatContact,
  env: Pick<StorefrontEnv, "apiBase" | "secret">,
  fetchImpl: Fetch,
  log: Log,
  parse: (body: unknown) => T | null = chatAnswer as unknown as (body: unknown) => T | null,
): Promise<ChatResult<T>> {
  const failed: ChatResult<T> = { state: "failed" };
  if (!payload.host) return failed;
  if (env.secret.length < SECRET_MIN_LENGTH) {
    log("STOREFRONT_SERVER_SECRET is not set");
    return failed;
  }
  let response: Response;
  try {
    response = await fetchImpl(`${env.apiBase}/storefront/v1/chat/${path}/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.secret}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    log(name === "TimeoutError" || name === "AbortError" ? "the API did not answer in time" : "the API could not be reached");
    return failed;
  }
  if (response.status === 404) return { state: "unavailable" }; // chat is off or the host is not served: the everyday answer, not logged
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
    return { state: "ok", chat: parsed };
  }
  if ([409, 422, 429].includes(response.status)) return refusal(response.status, body);
  log(`the API answered ${response.status}`);
  return failed;
}

/** One visitor message. */
export function chatSend(payload: ChatSend, env: Pick<StorefrontEnv, "apiBase" | "secret">, fetchImpl: Fetch = fetch, log: Log = logChat) {
  return chatPost("send", payload, env, fetchImpl, log);
}

/** The owner's replies since `after_id`, and the conversation's state. */
export function chatPoll(payload: ChatPoll, env: Pick<StorefrontEnv, "apiBase" | "secret">, fetchImpl: Fetch = fetch, log: Log = logChat) {
  return chatPost("poll", payload, env, fetchImpl, log);
}

/** The visitor's contact for their conversation (POST /storefront/v1/chat/contact/). The contact is never logged. */
export function chatContact(payload: ChatContact, env: Pick<StorefrontEnv, "apiBase" | "secret">, fetchImpl: Fetch = fetch, log: Log = logChat) {
  return chatPost<ChatContactSaved>("contact", payload, env, fetchImpl, log, contactAnswer);
}
