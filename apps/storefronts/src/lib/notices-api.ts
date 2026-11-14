/* The member notices and the bell, over the storefront API (backend apps/members, routes under /storefront/v1/member/).
   Same rules as src/lib/pack-api.ts: the member session travels as data, a 404 is "unavailable" (members are off, or the host is
   not served, or the notification is not this member's), a 401 is "refused" (not signed in), and anything else is "failed". */
import { packPost, type Calls, type PackResult } from "./pack-api.ts";

type Args = { host: string; token: string };

export type Notice = {
  id: string; kind: "announcement" | "promo"; title: string; body: string; image_url: string; starts_at: string; ends_at: string;
};
export type Notification = { id: string; kind: string; title: string; url: string; created_at: string; read_at: string };
export type Bell = { notifications: Notification[]; unread_count: number };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function parseNotice(v: unknown): Notice[] {
  if (!record(v) || (v.kind !== "announcement" && v.kind !== "promo") || !str(v.id) || !str(v.title)) return [];
  return [{ id: str(v.id), kind: v.kind, title: str(v.title), body: str(v.body), image_url: str(v.image_url), starts_at: str(v.starts_at), ends_at: str(v.ends_at) }];
}

function parseNotification(v: unknown): Notification[] {
  if (!record(v) || !str(v.id)) return [];
  return [{ id: str(v.id), kind: str(v.kind), title: str(v.title), url: str(v.url), created_at: str(v.created_at), read_at: str(v.read_at) }];
}

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0);

/** The notices of the member's own site that are on now. */
export function memberNotices(args: Args, c: Calls): Promise<PackResult<{ notices: Notice[] }>> {
  return packPost("member/notices", args, (b) => (record(b) && Array.isArray(b.notices) ? { notices: b.notices.flatMap(parseNotice) } : null), c);
}

/** The bell: the newest entries with the unread count. */
export function memberNotifications(args: Args, c: Calls): Promise<PackResult<Bell>> {
  return packPost("member/notifications", args, (b) => (record(b) && Array.isArray(b.notifications)
    ? { notifications: b.notifications.flatMap(parseNotification), unread_count: count(b.unread_count) } : null), c);
}

export function memberNotificationRead(args: Args & { id: string }, c: Calls): Promise<PackResult<{ unread_count: number }>> {
  const { id, ...rest } = args;
  return packPost(`member/notifications/${encodeURIComponent(id)}/read`, rest, (b) => (record(b) ? { unread_count: count(b.unread_count) } : null), c);
}

export function memberNotificationsReadAll(args: Args, c: Calls): Promise<PackResult<{ unread_count: number }>> {
  return packPost("member/notifications/read-all", args, (b) => (record(b) ? { unread_count: count(b.unread_count) } : null), c);
}
