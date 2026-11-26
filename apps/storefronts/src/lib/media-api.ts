/* The member's Media Library call to Django (backend apps/media_library/api.py, POST /storefront/v1/member/media/, with {host, token}
   and the filters). Same rules as src/lib/training-api.ts: the member session travels as data; a 404 is "unavailable"; a 401 is
   "refused"; anything else is "failed". Every field is read defensively: an asset the page cannot draw is left out, never
   half-drawn. The page never trusts a file address: views/sante/media.ts shows it only from the public media store. */
import { packPost, type Calls, type PackResult } from "./pack-api.ts";

export type MediaAsset = {
  id: string; title: string; asset_type: "image" | "video"; category: string; category_label: string;
  product_category: string; product_category_label: string; crop_ratio: string; caption: string;
  file_url: string; thumb_url: string; poster_url: string; width: number; height: number; file_size: number;
  duration_seconds: number; published_at: string; is_new: boolean;
  /** A video in the store's own Bunny library: the player address (then file_url is empty). Only a Bunny embed address is kept. */
  embed_url: string;
};
export type MediaOption = { value: string; label: string; count: number };
export type MediaOptions = { type: MediaOption[]; category: MediaOption[]; product_category: MediaOption[] };
export type MediaList = { items: MediaAsset[]; count: number; offset: number; next_offset: number | null; options: MediaOptions };
export type MediaQuery = { type: string; category: string; product_category: string; search: string; sort: string; offset: number };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const str = (v: unknown): string => (typeof v === "string" ? v : "");
/** The Bunny player address https://iframe.mediadelivery.net/embed/<library>/<video>, or "". Nothing else is ever framed. */
export const embedOf = (v: unknown): string => (typeof v === "string" && /^https:\/\/iframe\.mediadelivery\.net\/embed\/\d{1,12}\/[A-Za-z0-9-]{8,64}$/.test(v) ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0);

function asset(v: unknown): MediaAsset[] {
  if (!record(v) || !str(v.id) || !str(v.title) || (v.asset_type !== "image" && v.asset_type !== "video")) return [];
  return [{
    id: str(v.id), title: str(v.title), asset_type: v.asset_type, category: str(v.category), category_label: str(v.category_label),
    product_category: str(v.product_category), product_category_label: str(v.product_category_label), crop_ratio: str(v.crop_ratio),
    caption: str(v.caption), file_url: str(v.file_url), thumb_url: str(v.thumb_url), poster_url: str(v.poster_url),
    width: num(v.width), height: num(v.height), file_size: num(v.file_size), duration_seconds: num(v.duration_seconds),
    published_at: str(v.published_at), is_new: v.is_new === true, embed_url: embedOf(v.embed_url),
  }];
}
function options(v: unknown): MediaOption[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((o) => (record(o) && str(o.value) && str(o.label) ? [{ value: str(o.value), label: str(o.label), count: num(o.count) }] : []));
}

/** One page (12) of the visible assets for the filters, with the filter options and their counts. */
export function memberMedia(args: { host: string; token: string } & MediaQuery, c: Calls): Promise<PackResult<MediaList>> {
  const { type, category, product_category, search, sort, offset, ...session } = args;
  const filters: Record<string, unknown> = { offset };
  if (type) filters.type = type;
  if (category) filters.category = category;
  if (product_category) filters.product_category = product_category;
  if (search) filters.search = search;
  if (sort) filters.sort = sort;
  return packPost("member/media", { ...session, ...filters }, (b) => {
    if (!record(b) || !Array.isArray(b.items) || !record(b.options)) return null;
    return {
      items: b.items.flatMap(asset), count: num(b.count), offset: num(b.offset),
      next_offset: typeof b.next_offset === "number" && b.next_offset > 0 ? Math.trunc(b.next_offset) : null,
      options: { type: options(b.options.type), category: options(b.options.category), product_category: options(b.options.product_category) },
    };
  }, c);
}
