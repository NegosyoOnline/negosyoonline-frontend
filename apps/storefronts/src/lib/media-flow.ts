/* The member Media Library page (backend apps/media_library/api.py). Same rules as the Training pages
   (src/lib/training-flow.ts): a dead session clears the cookie and goes to the store home; a rejected order goes to My Purchases;
   a 404 is the neutral page; a read that fails shows "try again". The filters come from the address and are cleaned before they
   are sent. "Load 12 more" without a script is the same page with a larger `shown`; with the script it asks for `fragment=1`
   and one page at `offset`. */
import { htmlResponse } from "./html.ts";
import { lockedHome, session, signedOut, tryAgain, type Dash } from "./dashboard-flow.ts";
import { memberMedia, type MediaList } from "./media-api.ts";
import type { PackResult } from "./pack-api.ts";
import { neutralNotFound } from "../views/neutral.ts";
import { chrome, memberDocument } from "../views/sante/member.ts";
import { MAX_SHOWN, PAGE_SIZE, filtersOf, fragment, mediaContent } from "../views/sante/media.ts";

const whole = (text: string | null, max: number): number => {
  const n = text !== null && /^\d{1,6}$/.test(text) ? Number(text) : 0;
  return Math.min(n, max);
};

/** What a failed read becomes: signed out, not found, or try again. */
function ended(d: Dash, r: Exclude<PackResult<unknown>, { state: "ok" }>): Response {
  if (r.state === "refused" && r.status === 401) return signedOut(d);
  if (r.state === "unavailable") return neutralNotFound();
  return tryAgain();
}

/** GET /dashboard/media/ */
export async function mediaPage(d: Dash): Promise<Response> {
  const s = await session(d);
  if ("response" in s) return s.response;
  const locked = await lockedHome(d);
  if (locked) return locked;
  const params = new URL(d.call.request.url).searchParams;
  const f = filtersOf(params);
  const base = { host: d.call.host, token: d.call.member_token, ...f };

  if (params.get("fragment") === "1") {
    const offset = Math.floor(whole(params.get("offset"), MAX_SHOWN) / PAGE_SIZE) * PAGE_SIZE;
    const r = await memberMedia({ ...base, offset }, d.calls);
    if (r.state !== "ok") return ended(d, r);
    return htmlResponse(fragment(f, r.items, offset + r.items.length, r.count, r.next_offset));
  }

  const pages = Math.max(1, Math.ceil(whole(params.get("shown"), MAX_SHOWN) / PAGE_SIZE));
  const reads = await Promise.all(Array.from({ length: pages }, (_, i) => memberMedia({ ...base, offset: i * PAGE_SIZE }, d.calls)));
  const ok: Extract<(typeof reads)[number], { state: "ok" }>[] = [];
  for (const r of reads) {
    if (r.state !== "ok") return ended(d, r);
    ok.push(r);
  }
  const first = ok[0];
  const last = ok[ok.length - 1];
  const items = ok.flatMap((r) => r.items);
  const list: MediaList = { items, count: first.count, offset: 0, next_offset: last.next_offset, options: first.options };
  const doc = memberDocument(chrome(d.site, d.now), {
    title: "Media Library", member: s.member.full_name, current: "media", content: mediaContent(f, list, items, items.length),
    scripts: ["js/pack-select.js", "js/pack-media.js"], styles: ["css/pack-select.css", "css/pack-media.css"],
  });
  return htmlResponse(doc);
}
