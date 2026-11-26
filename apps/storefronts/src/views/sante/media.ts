/* The member Media Library (ClickUp z8uq9mezdk), after TWCinc's Media Library (app/media_library/): a filter rail (Type, Category,
   Product), search, Newest / Oldest, the count, a card grid with Copy caption and Download, "Load 12 more", a filter drawer on a
   phone and a preview popup. No Source filter (Santé only); the Product filter uses Santé's own product categories.
   Plain forms and links work with no script (the filters are a GET form, "Load 12 more" a link with a larger `shown`);
   js/pack-media.js adds the drawer, Copy, the popup and the in-place "Load 12 more". Every value from Django is escaped; a
   file is shown or linked only from the public media store (safeImage), never anything else. */
import { html, type Markup } from "../../lib/html.ts";
import type { MediaAsset, MediaList, MediaOption, MediaQuery } from "../../lib/media-api.ts";
import { safeImage } from "./shop-shell.ts";

export const MEDIA_PATH = "/dashboard/media/";
export const PAGE_SIZE = 12;
export const MAX_SHOWN = 120;
export const NO_MEDIA = "No media yet. New media will appear here.";
export const NO_MATCH = "No media matches these filters.";

/** The values Django accepts; anything else in the address is dropped before it is sent. */
export const TYPES = ["image", "video"] as const;
export const CATEGORIES = ["promo", "ad", "page"] as const;
export const PRODUCTS = ["barley", "drinks", "essentials", "beauty"] as const;
export const SORTS = ["newest", "oldest"] as const;

export type Filters = Omit<MediaQuery, "offset">;
export const NO_FILTERS: Filters = { type: "", category: "", product_category: "", search: "", sort: "newest" };

const pick = (value: string | null, allowed: readonly string[]): string => (value !== null && allowed.includes(value) ? value : "");

/** The filters in an address, cleaned: unknown values become "all", the search is trimmed to 100 characters. */
export function filtersOf(params: URLSearchParams): Filters {
  return {
    type: pick(params.get("type"), TYPES), category: pick(params.get("category"), CATEGORIES),
    product_category: pick(params.get("product_category"), PRODUCTS), sort: pick(params.get("sort"), SORTS) || "newest",
    search: (params.get("search") ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
  };
}

/** The address of the same filters, with a count of how many to show. */
export function hrefFor(f: Filters, shown = 0): string {
  const q = new URLSearchParams();
  if (f.type) q.set("type", f.type);
  if (f.category) q.set("category", f.category);
  if (f.product_category) q.set("product_category", f.product_category);
  if (f.search) q.set("search", f.search);
  if (f.sort && f.sort !== "newest") q.set("sort", f.sort);
  if (shown > PAGE_SIZE) q.set("shown", String(shown));
  const text = q.toString();
  return text ? `${MEDIA_PATH}?${text}` : MEDIA_PATH;
}

/** A file address worth showing or linking: the public media store only. */
const fileOf = (url: string): string => safeImage(url);
/** Vercel Blob sends a file as a download when the address says so. */
const downloadOf = (url: string): string => {
  const safe = fileOf(url);
  return safe ? `${safe}${safe.includes("?") ? "&" : "?"}download=1` : "";
};

const SVG = (d: string, size = 16): Markup => html`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
const ICON = (path: string): Markup => SVG(path, 18);
/* Inline SVG stand-ins for the Font Awesome icons of TWCinc's Media Library (we do not load Font Awesome). */
const I = {
  all: "M12 2l10 5-10 5L2 7z M2 17l10 5 10-5 M2 12l10 5 10-5",
  image: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21",
  video: "M3 4h18v16H3z M7 4v16 M17 4v16 M3 12h18 M3 8h4 M3 16h4 M17 8h4 M17 16h4",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3",
  sort: "M3 6h13 M3 12h9 M3 18h5 M17 10v10 M14 17l3 3 3-3",
  chevron: "M6 9l6 6 6-6",
  filter: "M4 6h16M7 12h10M10 18h4",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
  download: "M12 3v12 M7 10l5 5 5-5 M4 21h16",
};
const TYPE_ICON: Record<string, string> = { "": I.all, image: I.image, video: I.video };
const PLAY: Markup = html`<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z"/></svg>`;

/** "0:45", "1:05". */
export function clock(seconds: number): string {
  if (seconds <= 0) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "315 KB", "3.2 MB". */
export function sizeText(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The file extension of an address, upper case ("JPG"), or "". */
const extOf = (url: string): string => {
  const m = /\.([A-Za-z0-9]{2,5})(?:[?#]|$)/.exec(url.split("?")[0] ?? "");
  return m ? m[1].toUpperCase() : "";
};

/** "JPG · Image · 1080 × 1350 (4:5) · 315 KB" or "MP4 · Video · 0:39 · 3.2 MB" (parts that are unknown are left out). */
export function fileLine(a: MediaAsset): string {
  const kind = a.asset_type === "video" ? "Video" : "Image";
  const middle = a.asset_type === "video" ? clock(a.duration_seconds)
    : a.width > 0 && a.height > 0 ? `${a.width} \u00d7 ${a.height}${a.crop_ratio ? ` (${a.crop_ratio})` : ""}` : "";
  return [extOf(a.file_url), kind, middle, sizeText(a.file_size)].filter(Boolean).join(" \u00b7 ");
}

/** "Jul 31, 2026" from an ISO time (the Philippines' calendar day), or "". */
export function dateText(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(d);
}

/** "1080 \u00d7 1350 (4:5)" for an image, "" when the size is not known. */
export const dimsText = (a: MediaAsset): string =>
  a.width > 0 && a.height > 0 ? `${a.width} \u00d7 ${a.height}${a.crop_ratio ? ` (${a.crop_ratio})` : ""}` : "";

/** The Copy caption label: all three words sit in one grid cell, so the button keeps one width and height in every state. */
const COPY_LABEL: Markup = html`<span class="ml-act-t"><span class="ml-t-copy">Copy caption</span><span class="ml-t-ok" aria-hidden="true">Copied</span><span class="ml-t-fail" aria-hidden="true">Copy failed</span></span>`;

function card(a: MediaAsset): Markup {
  const file = fileOf(a.file_url);
  const thumb = fileOf(a.thumb_url) || fileOf(a.poster_url) || (a.asset_type === "image" ? file : "");
  const download = downloadOf(a.file_url);
  const length = a.asset_type === "video" ? clock(a.duration_seconds) : "";
  const picture = thumb ? html`<img src="${thumb}" alt="" loading="lazy">` : html`<span class="ml-blank" aria-hidden="true"></span>`;
  const badges = html`${a.asset_type === "video" ? html`<span class="ml-play">${PLAY}</span>` : ""}${a.is_new ? html`<span class="ml-new">New</span>` : ""}${length ? html`<span class="ml-len">${length}</span>` : ""}`;
  const embed = a.asset_type === "video" && !file ? a.embed_url : "";
  const preview = file || embed
    ? html`<a class="ml-thumb" href="${file || embed}" target="_blank" rel="noopener noreferrer" data-ml-open data-kind="${a.asset_type}" data-file="${file}" data-embed="${embed}" data-poster="${fileOf(a.poster_url) || thumb}" data-title="${a.title}" data-caption="${a.caption}" data-cat="${a.category_label}" data-date="${dateText(a.published_at)}" data-format="${[extOf(a.file_url), a.asset_type === "video" ? "Video" : "Image"].filter(Boolean).join(" \u00b7 ")}" data-dims="${a.asset_type === "video" ? clock(a.duration_seconds) : dimsText(a)}" data-size="${sizeText(a.file_size)}" data-download="${download}" aria-label="Preview ${a.title}">${picture}${badges}</a>`
    : html`<span class="ml-thumb">${picture}${badges}</span>`;
  return html`<article class="ml-card" data-asset="${a.id}" data-type="${a.asset_type}">
  ${preview}
  <div class="ml-body">
    ${a.category_label ? html`<p class="ml-cat">${a.category_label}</p>` : ""}
    <h3 class="ml-name">${a.title}</h3>
    <p class="ml-meta">${fileLine(a)}</p>
  </div>
  <div class="ml-acts">
    ${a.caption ? html`<button type="button" class="ml-act" data-ml-copy data-caption="${a.caption}">${SVG(I.copy, 14)}${COPY_LABEL}</button>` : ""}
    ${download ? html`<a class="ml-act ml-act-go" href="${download}" rel="noopener noreferrer" download>${SVG(I.download, 14)}<span class="ml-act-t">Download</span></a>` : ""}
  </div>
</article>`;
}

export const cards = (items: MediaAsset[]): Markup => html`${items.map(card)}`;

/** The "Load 12 more" link: the next page of the same filters, or nothing when all are shown. */
export function moreLink(f: Filters, shown: number, count: number, nextOffset: number | null): Markup {
  if (nextOffset === null || shown >= count || shown >= MAX_SHOWN) return html``;
  const left = Math.min(PAGE_SIZE, count - shown);
  return html`<p class="ml-more-row" data-ml-more-row><a class="tr-btn tr-btn-go ml-btn ml-btn-go ml-more" href="${hrefFor(f, shown + PAGE_SIZE)}" data-ml-more data-next="${nextOffset}">Load ${left === PAGE_SIZE ? PAGE_SIZE : left} more</a></p>`;
}

export const countText = (shown: number, count: number): string =>
  count === 0 ? "No items" : shown >= count ? `${count} ${count === 1 ? "item" : "items"}` : `Showing ${shown} of ${count} items`;

/** The in-place answer of "Load 12 more": the next cards and the next link, in one wrapper the script reads. */
export function fragment(f: Filters, items: MediaAsset[], shown: number, count: number, nextOffset: number | null): Markup {
  return html`<div data-ml-frag data-shown="${shown}" data-count="${count}" data-text="${countText(shown, count)}">${cards(items)}${moreLink(f, shown, count, nextOffset)}</div>`;
}

function group(name: string, label: string, options: MediaOption[], value: string, icons = false): Markup {
  const chip = (v: string, text: string, count: number | null) => html`<label class="ml-chip"><input type="radio" name="${name}" value="${v}"${value === v ? html` checked` : ""}>${icons ? SVG(TYPE_ICON[v] ?? I.image, 15) : ""}<span>${text}</span>${count === null ? "" : html`<em>${count}</em>`}</label>`;
  return html`<fieldset class="ml-group"><legend>${label}</legend>
  ${chip("", name === "type" ? "All types" : name === "category" ? "All categories" : "All products", null)}
  ${options.map((o) => chip(o.value, name === "type" ? `${o.label}s` : o.label, o.count))}
</fieldset>`;
}

const hasFilter = (f: Filters): boolean => Boolean(f.type || f.category || f.product_category || f.search);

/** /dashboard/media/. `items` are every card shown so far (the first `shown`). */
export function mediaContent(f: Filters, list: MediaList, items: MediaAsset[], shown: number): Markup {
  const empty = items.length === 0;
  const total = list.options.type.reduce((n, o) => n + o.count, 0);
  return html`<div class="pd md-plain tr-page ml-page" data-md-page="media" data-ml-page>
  <header class="tr-ph ml-head"><p class="ml-eyebrow">Promotion materials</p><h1>Media Library</h1><p>Ready-to-post photos and videos for promoting Santé.</p></header>
  <form class="ml-layout" method="get" action="${MEDIA_PATH}" data-ml-form>
    <aside class="tr-card ml-rail" id="ml-rail" aria-label="Filters" data-ml-rail>
      <div class="ml-rail-head"><h2>Filters</h2><button type="button" class="ml-x" data-ml-close aria-label="Close filters">${ICON("M6 6l12 12M18 6L6 18")}</button></div>
      ${group("type", "Type", list.options.type, f.type, true)}
      ${group("category", "Category", list.options.category, f.category)}
      ${group("product_category", "Product", list.options.product_category, f.product_category)}
      <div class="ml-rail-foot"><button type="submit" class="tr-btn tr-btn-go ml-btn ml-btn-go">Apply filters</button><a class="ml-clear" href="${hrefFor({ ...NO_FILTERS, sort: f.sort })}">&times; Clear all filters</a></div>
    </aside>
    <div class="ml-scrim" data-ml-close hidden></div>
    <section class="ml-main" aria-labelledby="ml-count">
      <div class="ml-tools">
        <button type="button" class="ml-filter-btn" data-ml-filters aria-controls="ml-rail" aria-expanded="false">${SVG(I.filter, 15)} Filters</button>
        <label class="ml-search">${SVG(I.search, 16)}<span class="sr-only">Search media</span><input type="search" name="search" value="${f.search}" maxlength="100" placeholder="Search materials&hellip;" autocomplete="off"></label>
        <div class="ml-sort">${SVG(I.sort, 15)}<select name="sort" aria-label="Sort" data-pk-select data-pk-select-nofilter><option value="newest"${f.sort !== "oldest" ? html` selected` : ""}>Newest first</option><option value="oldest"${f.sort === "oldest" ? html` selected` : ""}>Oldest first</option></select></div>
        <p class="ml-count" id="ml-count" role="status" aria-live="polite" data-ml-count>${SVG(I.image, 15)}<span><b>${list.count}</b> ${list.count === 1 ? "asset" : "assets"}</span></p>
        <button type="submit" class="tr-btn tr-btn-go ml-btn ml-search-go">Search</button>
      </div>
      ${empty
        ? html`<section class="md-card" data-ml="empty"><p>${total === 0 && !hasFilter(f) ? NO_MEDIA : NO_MATCH}</p>${hasFilter(f) ? html`<p><a href="${MEDIA_PATH}">Clear filters</a></p>` : ""}</section>`
        : html`<div class="ml-grid" data-ml-grid>${cards(items)}</div>`}
      <div data-ml-more-slot>${moreLink(f, shown, list.count, list.next_offset)}</div>
      <p class="sr-only" role="status" aria-live="polite" data-ml-live></p>
    </section>
  </form>
  <dialog class="ml-dialog" data-ml-dialog aria-labelledby="ml-dialog-title">
    <div class="ml-m-media" data-ml-stage></div>
    <div class="ml-m-rail">
      <p class="ml-m-cat" data-ml-dialog-cat></p>
      <h2 class="ml-m-title" id="ml-dialog-title" data-ml-dialog-title></h2>
      <p class="ml-m-pub" data-ml-dialog-pub></p>
      <div class="ml-m-meta" data-ml-dialog-meta></div>
      <div class="ml-m-cap" data-ml-dialog-capbox><p class="ml-m-k">Ready-made caption</p><div class="ml-m-txt" data-ml-dialog-cap tabindex="0" role="region" aria-label="Ready-made caption"></div></div>
      <div class="ml-m-acts">
        <button type="button" class="ml-act" data-ml-dialog-copy>${SVG(I.copy, 14)}${COPY_LABEL}</button>
        <a class="ml-act ml-act-go" data-ml-dialog-dl href="#" rel="noopener noreferrer" download>${SVG(I.download, 14)}<span class="ml-act-t" data-ml-dialog-dl-t>Download original</span></a>
      </div>
    </div>
    <button type="button" class="ml-m-close" data-ml-dialog-close aria-label="Close preview">${ICON("M6 6l12 12M18 6L6 18")}</button>
  </dialog>
</div>`;
}
