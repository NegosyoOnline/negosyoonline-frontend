/* The website chat, between the widget (public/assets/sante/js/chat-widget.js) and Django (src/lib/django.ts).
   The browser posts here, same origin, as JSON; this server calls Django with the server credential. The browser never calls
   Django and never names a site: the site is the request's host, cleaned and looked up by Django alone (a host that is not a
   served Santé site, or chat switched off, is Django's 404 and the neutral 404 here).

   The visitor's secret is made by Django on the first message and kept here, in the HttpOnly cookie `no_chat` (host-only,
   SameSite=Lax, Secure with the __Host- prefix on https), 30 days idle: every answer for a known conversation sets it again.
   The page script never sees it. A wrong or stale secret gets the same empty answer as a visitor who has not written.

   What the browser gets is only {ok, state, available, messages} or {ok:false, error}: the error is one of a few kinds the widget
   has fixed texts for. Django's own words, the secret and the address are never passed on or logged. */
import { chatContact, chatPoll, chatSend, type ChatMessage, type ChatResult } from "./django.ts";
import { storefrontEnv } from "./env.ts";
import { CHAT, CHAT_MAX_AGE, clearCookie, readCookieShaped, cookieName, isSecure, sameOriginPost, setCookie } from "./cookies.ts";
import { cleanHost } from "./host.ts";
import { requestHost } from "./site.ts";
import { visitorIp } from "./visitor.ts";
import { neutralNotFound } from "../views/neutral.ts";

const VISIT_REF_SHAPE = /^[A-Za-z0-9_-]{16,32}$/; // what pack-visit.js keeps under "np:visit-ref"
const SECRET_SHAPE = /^[A-Za-z0-9_-]{43}$/; // what Django makes: token_urlsafe(32)
const MAX_BODY = 16 * 1024; // a 1,000-character message with its name and email is well under this
const MAX_AFTER = 2_000_000_000;

export type ChatError = "failed" | "limited" | "links" | "email" | "empty" | "too_long" | "too_fast" | "contact";

type Body = Record<string, unknown>;

function noStore(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

function problem(error: ChatError, status: number): Response {
  return noStore({ ok: false, error }, status);
}

async function readBody(request: Request): Promise<Body | null> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("application/json")) return null;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return null;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return null;
    const body: unknown = JSON.parse(text);
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Body) : null;
  } catch {
    return null;
  }
}

/** The optional visit ref as a one-key object: present only when well formed, so a bad or missing one is dropped, not passed on. */
function visitRef(value: unknown): { pack_visitor_ref?: string } {
  return typeof value === "string" && VISIT_REF_SHAPE.test(value) ? { pack_visitor_ref: value } : {};
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function afterId(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_AFTER ? value : 0;
}

/** The widget's "opened at" time as an ISO string, or null when it is missing or not a time. A time in the future counts as now. */
export function openedAt(value: unknown, now: Date = new Date()): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return (at.getTime() > now.getTime() ? now : at).toISOString();
}

function secretOf(request: Request): string {
  return readCookieShaped(request.headers.get("cookie"), cookieName(CHAT, isSecure(request)), SECRET_SHAPE);
}

/** Every request: a POST, as JSON, from a page of this same host, for a host that can be looked up. Otherwise the neutral 404. */
async function gate(request: Request): Promise<{ host: string; body: Body } | null> {
  const host = requestHost(request);
  if (!host) return null;
  const own = cleanHost(request.headers.get("host"));
  if (!own || !sameOriginPost(request, own)) return null;
  const body = await readBody(request);
  return body ? { host, body } : null;
}

function messagesOf(list: ChatMessage[]): ChatMessage[] {
  return list.slice(0, 50).map((m) => ({ id: m.id, text: m.text, at: m.at }));
}

/** Django's refusal of a message, as one of the widget's fixed error kinds. */
function refusedAs(result: Extract<ChatResult, { state: "refused" }>): ChatError {
  if (result.status === 429) return "limited";
  if (result.status === 422) {
    if (result.fields.email) return "email";
    const text = result.fields.text ?? "";
    if (/link/i.test(text)) return "links";
    if (text) return /at most/i.test(text) ? "too_long" : "empty";
    return "too_fast";
  }
  return "failed";
}

function setSecret(response: Response, request: Request, secret: string): Response {
  setCookie(response, request, CHAT, secret, CHAT_MAX_AGE);
  return response;
}

export async function chatSendPost(request: Request): Promise<Response> {
  const g = await gate(request);
  if (!g) return neutralNotFound();
  const secret = secretOf(request);
  const result = await chatSend(
    {
      host: g.host,
      visitor_ip: visitorIp(request.headers),
      visitor_secret: secret,
      name: str(g.body.name, 200),
      email: str(g.body.email, 300),
      text: str(g.body.text, 6000),
      website: str(g.body.website, 500),
      opened_at: openedAt(g.body.opened_at),
      after_id: afterId(g.body.after_id),
      ...visitRef(g.body.pack_visitor_ref),
    },
    storefrontEnv(),
  );
  if (result.state === "unavailable") return neutralNotFound();
  if (result.state === "failed") return problem("failed", 503);
  if (result.state === "refused") {
    const error = refusedAs(result);
    return problem(error, error === "limited" ? 429 : error === "failed" ? 503 : 422);
  }
  const chat = result.chat;
  const response = noStore({ ok: true, state: chat.state, available: chat.state !== "paused", messages: messagesOf(chat.messages) });
  if (chat.visitor_secret && SECRET_SHAPE.test(chat.visitor_secret)) return setSecret(response, request, chat.visitor_secret);
  if (secret && chat.state !== "none") return setSecret(response, request, secret); // idle runs from the last use
  return response;
}

export async function chatPollPost(request: Request): Promise<Response> {
  const g = await gate(request);
  if (!g) return neutralNotFound();
  const secret = secretOf(request);
  const result = await chatPoll(
    { host: g.host, visitor_ip: visitorIp(request.headers), visitor_secret: secret, after_id: afterId(g.body.after_id) },
    storefrontEnv(),
  );
  if (result.state === "unavailable") return neutralNotFound(); // chat is off here: the widget stays away
  if (result.state === "failed") return problem("failed", 503);
  if (result.state === "refused") return problem(result.status === 429 ? "limited" : "failed", result.status === 429 ? 429 : 503);
  /* "paused" is also what Django says while the owner has chat switched off, and it does not say which. A visitor who has never
     written has nothing to be told, so the launcher stays away; one who has a conversation is shown the paused panel. */
  const chat = result.chat;
  const available = chat.state !== "paused" || secret !== "";
  const response = noStore({ ok: true, state: chat.state, available, messages: messagesOf(chat.messages) });
  if (!secret) return response;
  if (chat.state === "none") {
    clearCookie(response, request, CHAT); // the secret matches nothing here any more
    return response;
  }
  return setSecret(response, request, secret);
}

/** The visitor's optional mobile number or email, saved to their conversation. The browser gets {ok:true, saved:true, kind} or
    {ok:false, error}: "contact" is Django's 422 on the value (the widget has its own friendly text), the rest are the usual kinds. */
export async function chatContactPost(request: Request): Promise<Response> {
  const g = await gate(request);
  if (!g) return neutralNotFound();
  const result = await chatContact(
    { host: g.host, visitor_ip: visitorIp(request.headers), visitor_secret: secretOf(request), contact: str(g.body.contact, 300), ...visitRef(g.body.pack_visitor_ref) },
    storefrontEnv(),
  );
  if (result.state === "unavailable") return neutralNotFound();
  if (result.state === "failed") return problem("failed", 503);
  if (result.state === "refused") {
    if (result.status === 429) return problem("limited", 429);
    if (result.status === 422 && result.fields.contact) return problem("contact", 422);
    return problem("failed", 503);
  }
  if (!result.chat.saved) return noStore({ ok: true, saved: false });
  return noStore({ ok: true, saved: true, kind: result.chat.kind });
}
