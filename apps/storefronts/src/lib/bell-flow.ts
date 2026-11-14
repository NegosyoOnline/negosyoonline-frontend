/* The bell's three same-origin JSON routes (/dashboard/notifications/, .../read/, .../read-all/): the browser asks this server, this
   server asks Django with the storefront credential and the member token from the session cookie. The token never reaches the page.
   A post is checked by Origin / Sec-Fetch-Site like every dashboard post (src/lib/dashboard-route.ts). Answers are no-store JSON. */
import { dashFor } from "./dashboard-route.ts";
import type { Dash } from "./dashboard-flow.ts";
import { forbidden, postIsSameOrigin } from "./member.ts";
import { memberNotificationRead, memberNotifications, memberNotificationsReadAll } from "./notices-api.ts";
import type { PackResult } from "./pack-api.ts";
import { neutralNotFound } from "../views/neutral.ts";

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

/** The ids Django makes (UUIDs or numbers): nothing else is sent on. */
export const NOTIFICATION_ID = /^[A-Za-z0-9_-]{1,64}$/;

const args = (d: Dash) => ({ host: d.call.host, token: d.call.member_token });

/** A call that did not answer 200: signed out, off, or a failure. */
function ended(r: Exclude<PackResult<unknown>, { state: "ok" }>): Response {
  if (r.state === "refused" && r.status === 401) return json({ error: "signed_out" }, 401);
  if (r.state === "unavailable") return json({ error: "not_found" }, 404);
  return json({ error: "try_again" }, 503);
}

async function member(request: Request, post: boolean): Promise<Dash | Response> {
  const d = await dashFor(request);
  if (!d) return neutralNotFound();
  if (post && !postIsSameOrigin(request)) return forbidden();
  if (!d.call.member_token) return json({ error: "signed_out" }, 401);
  return d;
}

export async function bellGet(request: Request): Promise<Response> {
  const d = await member(request, false);
  if (d instanceof Response) return d;
  const r = await memberNotifications(args(d), d.calls);
  return r.state === "ok" ? json({ notifications: r.notifications, unread_count: r.unread_count }) : ended(r);
}

export async function bellRead(request: Request): Promise<Response> {
  const d = await member(request, true);
  if (d instanceof Response) return d;
  let id = "";
  try {
    const body: unknown = await request.json();
    id = typeof body === "object" && body !== null && typeof (body as { id?: unknown }).id === "string" ? (body as { id: string }).id : "";
  } catch {
    id = "";
  }
  if (!NOTIFICATION_ID.test(id)) return json({ error: "not_found" }, 404);
  const r = await memberNotificationRead({ ...args(d), id }, d.calls);
  return r.state === "ok" ? json({ unread_count: r.unread_count }) : ended(r);
}

export async function bellReadAll(request: Request): Promise<Response> {
  const d = await member(request, true);
  if (d instanceof Response) return d;
  const r = await memberNotificationsReadAll(args(d), d.calls);
  return r.state === "ok" ? json({ unread_count: r.unread_count }) : ended(r);
}

