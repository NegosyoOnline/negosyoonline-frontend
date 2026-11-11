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

function isSite(value: unknown): value is Site {
  return (
    record(value) &&
    value.template === "sante" &&
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
  return body;
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
