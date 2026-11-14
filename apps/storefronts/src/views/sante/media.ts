/* The member Media Library (ClickUp z8uq9mezdk), after TWCinc's Media Library (app/media_library/): a filter rail (Type, Category,
   Product), search, Newest / Oldest, the count, a card grid with Copy caption and Download, "Load 12 more", a filter drawer on a
   phone and a preview popup. No Source filter (Santé only); the Product filter uses Santé's own product categories.
   Plain forms and links work with no script (the filters are a GET form, "Load 12 more" a link with a larger `shown`);
   js/pack-media.js adds the drawer, Copy, the popup and the in-place "Load 12 more". Every value from Django is escaped; a
   file is shown or linked only from the public media store (safeImage), never anything else. */
import { html, type Markup } from "../../lib/html.ts";
import type { MediaAsset, MediaList, MediaOption, MediaQuery } from "../../lib/media-api.ts";
import { pageHero } from "./member-dash.ts";
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

const RATIO: Record<string, string> = { "4:5": "ml-r45", "1:1": "ml-r11", "9:16": "ml-r916", "16:9": "ml-r169" };
const ICON = (path: string): Markup => html`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
const PLAY: Markup = html`<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z"/></svg>`;

/** "0:45", "1:05". */
export function clock(seconds: number): string {
  if (seconds <= 0) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function card(a: MediaAsset): Markup {
  const file = fileOf(a.file_url);
  const thumb = fileOf(a.thumb_url) || fileOf(a.poster_url) || (a.asset_type === "image" ? file : "");
  const download = downloadOf(a.file_url);
  const ratio = RATIO[a.crop_ratio] ?? "ml-r11";
  const kind = a.asset_type === "video" ? "Video" : "Image";
  const tags = [a.category_label, a.product_category_label].filter(Boolean).join(" · ");
  const length = a.asset_type === "video" ? clock(a.duration_seconds) : "";
  const picture = thumb ? html`<img src="${thumb}" alt="" loading="lazy">` : html`<span class="ml-blank" aria-hidden="true"></span>`;
  const preview = file
    ? html`<a class="ml-thumb ${ratio}" href="${file}" target="_blank" rel="noopener noreferrer" data-ml-open data-kind="${a.asset_type}" data-file="${file}" data-poster="${fileOf(a.poster_url) || thumb}" data-title="${a.title}" data-caption="${a.caption}" aria-label="Preview ${a.title}">${picture}${a.asset_type === "video" ? html`<span class="ml-play">${PLAY}</span>` : ""}${a.is_new ? html`<span class="ml-new">New</span>` : ""}${length ? html`<span class="ml-len">${length}</span>` : ""}</a>`
    : html`<span class="ml-thumb ${ratio}">${picture}</span>`;
  return html`<article class="ml-card" data-asset="${a.id}" data-type="${a.asset_type}">
  ${preview}
  <div class="ml-body">
    <h3 class="ml-title">${a.title}</h3>
    <p class="ml-tags"><span class="ml-kind">${kind}</span>${tags ? html` &middot; ${tags}` : ""}</p>
    <div class="ml-acts">
      ${a.caption ? html`<button type="button" class="ml-btn" data-ml-copy data-caption="${a.caption}">Copy caption</button>` : ""}
      ${download ? html`<a class="ml-btn ml-btn-go" href="${download}" rel="noopener noreferrer" download>Download</a>` : ""}
    </div>
  </div>
</article>`;
}

export const cards = (items: MediaAsset[]): Markup => html`${items.map(card)}`;

/** The "Load 12 more" link: the next page of the same filters, or nothing when all are shown. */
export function moreLink(f: Filters, shown: number, count: number, nextOffset: number | null): Markup {
  if (nextOffset === null || shown >= count || shown >= MAX_SHOWN) return html``;
  const left = Math.min(PAGE_SIZE, count - shown);
  return html`<p class="ml-more-row" data-ml-more-row><a class="ml-btn ml-btn-go ml-more" href="${hrefFor(f, shown + PAGE_SIZE)}" data-ml-more data-next="${nextOffset}">Load ${left === PAGE_SIZE ? PAGE_SIZE : left} more</a></p>`;
}

export const countText = (shown: number, count: number): string =>
  count === 0 ? "No items" : shown >= count ? `${count} ${count === 1 ? "item" : "items"}` : `Showing ${shown} of ${count} items`;

/** The in-place answer of "Load 12 more": the next cards and the next link, in one wrapper the script reads. */
export function fragment(f: Filters, items: MediaAsset[], shown: number, count: number, nextOffset: number | null): Markup {
  return html`<div data-ml-frag data-shown="${shown}" data-count="${count}" data-text="${countText(shown, count)}">${cards(items)}${moreLink(f, shown, count, nextOffset)}</div>`;
}

function group(name: string, label: string, options: MediaOption[], value: string): Markup {
  return html`<fieldset class="ml-group"><legend>${label}</legend>
  <label class="ml-opt"><input type="radio" name="${name}" value=""${value === "" ? html` checked` : ""}><span>All</span></label>
  ${options.map((o) => html`<label class="ml-opt"><input type="radio" name="${name}" value="${o.value}"${value === o.value ? html` checked` : ""}><span>${o.label}</span><em>${o.count}</em></label>`)}
</fieldset>`;
}

const hasFilter = (f: Filters): boolean => Boolean(f.type || f.category || f.product_category || f.search);

/** /dashboard/media/. `items` are every card shown so far (the first `shown`). */
export function mediaContent(f: Filters, list: MediaList, items: MediaAsset[], shown: number): Markup {
  const empty = items.length === 0;
  const total = list.options.type.reduce((n, o) => n + o.count, 0);
  return html`<div class="pd md-plain ml-page" data-md-page="media" data-ml-page>${pageHero("Media Library", "")}
  <form class="ml-layout" method="get" action="${MEDIA_PATH}" data-ml-form>
    <aside class="ml-rail" id="ml-rail" aria-label="Filters" data-ml-rail>
      <div class="ml-rail-head"><h2>Filters</h2><button type="button" class="ml-x" data-ml-close aria-label="Close filters">${ICON("M6 6l12 12M18 6L6 18")}</button></div>
      ${group("type", "Type", list.options.type, f.type)}
      ${group("category", "Category", list.options.category, f.category)}
      ${group("product_category", "Product", list.options.product_category, f.product_category)}
      <div class="ml-rail-foot"><button type="submit" class="ml-btn ml-btn-go">Apply filters</button>${hasFilter(f) ? html`<a class="ml-clear" href="${hrefFor({ ...NO_FILTERS, sort: f.sort })}">Clear filters</a>` : ""}</div>
    </aside>
    <div class="ml-scrim" data-ml-close hidden></div>
    <section class="ml-main" aria-labelledby="ml-count">
      <div class="ml-tools">
        <button type="button" class="ml-btn ml-filter-btn" data-ml-filters aria-controls="ml-rail" aria-expanded="false">${ICON("M4 6h16M7 12h10M10 18h4")} Filters</button>
        <label class="ml-search"><span class="sr-only">Search media</span><input type="search" name="search" value="${f.search}" maxlength="100" placeholder="Search title or caption" autocomplete="off"></label>
        <label class="ml-sort"><span class="sr-only">Sort</span><select name="sort"><option value="newest"${f.sort !== "oldest" ? html` selected` : ""}>Newest</option><option value="oldest"${f.sort === "oldest" ? html` selected` : ""}>Oldest</option></select></label>
        <button type="submit" class="ml-btn ml-search-go">Search</button>
      </div>
      <p class="ml-count" id="ml-count" role="status" aria-live="polite" data-ml-count>${countText(items.length, list.count)}</p>
      ${empty
        ? html`<section class="md-card" data-ml="empty"><p>${total === 0 && !hasFilter(f) ? NO_MEDIA : NO_MATCH}</p>${hasFilter(f) ? html`<p><a href="${MEDIA_PATH}">Clear filters</a></p>` : ""}</section>`
        : html`<div class="ml-grid" data-ml-grid>${cards(items)}</div>`}
      <div data-ml-more-slot>${moreLink(f, shown, list.count, list.next_offset)}</div>
      <p class="sr-only" role="status" aria-live="polite" data-ml-live></p>
    </section>
  </form>
  <dialog class="ml-dialog" data-ml-dialog aria-labelledby="ml-dialog-title">
    <div class="ml-dialog-box">
      <div class="ml-dialog-head"><h2 id="ml-dialog-title" data-ml-dialog-title></h2><button type="button" class="ml-x" data-ml-dialog-close aria-label="Close preview">${ICON("M6 6l12 12M18 6L6 18")}</button></div>
      <div class="ml-stage" data-ml-stage></div>
      <p class="ml-dialog-cap" data-ml-dialog-cap></p>
    </div>
  </dialog>
</div>`;
}
