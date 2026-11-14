/* Product reviews, CAT-1 r5b: the stars, the buyer's "Rate this product" form on an order's lines, and the product page's reviews.
   Every word a buyer wrote is text: the `html` tag escapes it, and nothing here marks a review `safe`. Nothing shows until the first
   real review: no empty stars and no "0 reviews". The form posts to a route of this storefront, which sends it to Django with the
   order's own proof (the placing buyer's key, or the member's session); Django decides whether the line can be reviewed. */
import { html, type Markup } from "../../lib/html.ts";
import type { BuyerOrder, BuyerReview, ReviewPage, StoreReview } from "../../lib/shop-api.ts";

export const REVIEW_BODY_MAX = 1000;
export const REVIEW_NAME_MAX = 40;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 12, 2026" in Manila time; "" for an unreadable date. */
function when(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 8 * 3600 * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Text with blank lines as paragraphs and single newlines as breaks, escaped. */
function paragraphs(text: string): Markup {
  const parts = text.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).filter(Boolean);
  return html`${parts.map((p) => html`<p>${p.split("\n").map((line, i) => (i === 0 ? html`${line}` : html`<br>${line}`))}</p>`)}`;
}

/** Five stars, `n` filled (rounded to a whole star, 0 to 5), with a text label for readers. */
export function stars(n: number): Markup {
  const on = Math.max(0, Math.min(5, Math.round(n)));
  return html`<span class="sf-stars" role="img" aria-label="${String(on)} out of 5 stars">${[1, 2, 3, 4, 5].map((i) => html`<span class="sf-star${i <= on ? " is-on" : ""}" aria-hidden="true">&#9733;</span>`)}</span>`;
}

/** The summary stars for an average: rounded to the nearest half star, a half star drawn as a half, so the stars never show more
    than the real average. The label states the real average to one decimal. Individual reviews use `stars` (whole stars). */
export function summaryStars(average: number): Markup {
  const avg = Number.isFinite(average) ? Math.max(0, Math.min(5, average)) : 0;
  const half = Math.round(avg * 2) / 2;
  return html`<span class="sf-stars" role="img" aria-label="${avg.toFixed(1)} out of 5 stars">${[1, 2, 3, 4, 5].map((i) => html`<span class="sf-star${i <= half ? " is-on" : i - 0.5 === half ? " is-half" : ""}" aria-hidden="true">&#9733;</span>`)}</span>`;
}

/* ---- the product page ---------------------------------------------------------------------------------------------- */

const plural = (n: number): string => `${String(n)} review${n === 1 ? "" : "s"}`;

/** The summary under the product name: stars, the average and the count, linking to the list. Nothing before the first review. */
export function ratingSummary(r: ReviewPage | null | undefined): Markup {
  if (!r || r.rating_count < 1 || !r.rating_average) return html``;
  return html`<a class="sf-rating-line" href="#reviews" data-sf-rating>${summaryStars(Number(r.rating_average))} <strong>${r.rating_average}</strong> <span>(${plural(r.rating_count)})</span></a>`;
}

function reviewItem(r: StoreReview): Markup {
  return html`<li class="sf-review">
        <div class="sf-review-head">${stars(r.rating)}<strong class="sf-review-name">${r.display_name}</strong><span class="sf-verified">Verified buyer</span></div>
        ${when(r.created_at) ? html`<div class="sf-review-date">${when(r.created_at)}${r.edited ? " (edited)" : ""}</div>` : ""}
        ${r.body.trim() ? html`<div class="sf-review-body">${paragraphs(r.body)}</div>` : ""}
      </li>`;
}

/** The reviews section: shown only when the store has at least one visible review. `moreHref` is the link that loads the next page. */
export function reviewsSection(r: ReviewPage | null | undefined, moreHref: string): Markup {
  if (!r || r.rating_count < 1 || r.reviews.length === 0) return html``;
  return html`
<section class="section sf-reviews" id="reviews" data-sf-reviews>
  <div class="section-inner">
    <h2 class="section-title">What Our Customers Say</h2>
    <div class="sf-reviews-sum">
      <span class="sf-reviews-avg">${r.rating_average ?? ""}</span>
      <div>${summaryStars(Number(r.rating_average ?? 0))}<div class="sf-reviews-count">Based on ${plural(r.rating_count)}</div></div>
    </div>
    <ul class="sf-review-list">
      ${r.reviews.map(reviewItem)}
    </ul>
    ${r.has_more ? html`<p class="sf-reviews-more"><a class="btn-cart" href="${moreHref}" data-sf-more-reviews>More reviews</a></p>` : ""}
  </div>
</section>`;
}

/* ---- the buyer's form on an order ---------------------------------------------------------------------------------- */

export type ReviewNotice = { order: string; position: number; outcome: string };

const NOTICES: Record<string, { ok: boolean; text: string }> = {
  saved: { ok: true, text: "Thank you! Your review is posted." },
  invalid: { ok: false, text: "Please choose a rating from 1 to 5 stars, and keep your words within the limits." },
  exists: { ok: false, text: "You already reviewed this product." },
  locked: { ok: false, text: "This review can no longer be changed." },
  not_delivered: { ok: false, text: "You can review a product once your order is delivered." },
  failed: { ok: false, text: "We could not save your review. Please try again shortly." },
};
export const REVIEW_OUTCOMES = Object.keys(NOTICES);

/** The notice a review post redirected back with (`?review=<outcome>&order=<id>&line=<n>`), or null. Only known outcomes count. */
export function noticeFrom(params: URLSearchParams): ReviewNotice | null {
  const outcome = params.get("review") ?? "";
  const position = Number(params.get("line") ?? "");
  const order = params.get("order") ?? "";
  if (!(outcome in NOTICES) || !Number.isInteger(position) || position < 1 || position > 999 || !/^[A-Za-z0-9_-]{1,64}$/.test(order)) return null;
  return { order, position, outcome };
}

function ratingInput(id: string, current: number): Markup {
  return html`<fieldset class="sf-rate">
        <legend class="sf-rv-sr">Your rating</legend>
        ${[5, 4, 3, 2, 1].map((n) => html`<input class="sf-rate-in" type="radio" name="rating" id="${id}-r${String(n)}" value="${String(n)}"${n === current ? html` checked` : ""}${n === 5 ? html` required` : ""}><label class="sf-rate-star" for="${id}-r${String(n)}" title="${String(n)} star${n === 1 ? "" : "s"}"><span class="sf-rv-sr">${String(n)} star${n === 1 ? "" : "s"}</span><span aria-hidden="true">&#9733;</span></label>`)}
      </fieldset>`;
}

function reviewForm(o: BuyerOrder, position: number, action: string, withOrder: boolean, existing: BuyerReview | null): Markup {
  const id = `rv-${o.id}-${String(position)}${existing ? "-e" : ""}`;
  return html`<form class="sf-rv-form" method="post" action="${action}" data-sf-review-form>
      ${withOrder ? html`<input type="hidden" name="order_id" value="${o.id}">` : ""}
      <input type="hidden" name="position" value="${String(position)}">
      <input type="hidden" name="mode" value="${existing ? "edit" : "create"}">
      ${ratingInput(id, existing?.rating ?? 0)}
      <label class="sf-rv-label" for="${id}-body">Tell others what you think <span>(optional)</span></label>
      <textarea class="sf-rv-input" id="${id}-body" name="body" rows="3" maxlength="${String(REVIEW_BODY_MAX)}" placeholder="What did you like about it?">${existing?.body ?? ""}</textarea>
      <label class="sf-rv-label" for="${id}-name">Name shown with your review <span>(optional)</span></label>
      <input class="sf-rv-input" type="text" id="${id}-name" name="display_name" maxlength="${String(REVIEW_NAME_MAX)}" autocomplete="off" placeholder="Your first name and last initial" value="${existing?.display_name ?? ""}">
      <p class="sf-rv-note">Your review is shown on this store with your name and &ldquo;Verified buyer&rdquo;.</p>
      <button type="submit" class="btn-cart sf-rv-submit">${existing ? "Save changes" : "Post review"}</button>
    </form>`;
}

/** "Rate this product" for each delivered line of the buyer's own order, and the buyer's existing review with one allowed Edit. Empty when
    no line is reviewable and none has a review (an older backend, or an order not delivered yet). `withOrder` adds the order id for My Orders. */
export function buyerReviews(o: BuyerOrder, action: string, withOrder: boolean, notice: ReviewNotice | null): Markup {
  const lines = o.lines.filter((l) => l.position !== undefined && (l.can_review === true || (l.review ?? null) !== null));
  if (lines.length === 0) return html``;
  return html`<div class="sf-rv-buyer" data-sf-review-block>
    <h3 class="sf-rv-h">Rate your purchase</h3>
    ${lines.map((l) => {
      const position = l.position ?? 0;
      const note = notice && notice.order === o.id && notice.position === position ? NOTICES[notice.outcome] : undefined;
      return html`<div class="sf-rv-line" id="review-${o.id}-${String(position)}">
      <div class="sf-rv-pname">${l.name || "Product"}</div>
      ${note ? html`<p class="sf-rv-notice${note.ok ? " is-ok" : " is-err"}" role="status">${note.text}</p>` : ""}
      ${l.review ? html`<div class="sf-rv-mine" data-sf-my-review>
        <div>${stars(l.review.rating)} <strong>Your review</strong>${l.review.edited ? html` <span class="sf-rv-edited">(edited)</span>` : ""}</div>
        ${l.review.body.trim() ? html`<div class="sf-rv-mybody">${paragraphs(l.review.body)}</div>` : ""}
        ${l.review.can_edit ? html`<details class="sf-rv-edit"><summary>Edit your review</summary>
          <p class="sf-rv-note">You can change your review once.</p>
          ${reviewForm(o, position, action, withOrder, l.review)}
        </details>` : ""}
      </div>` : html`<p class="sf-rv-ask">Loved it? Rate this product and help other shoppers.</p>
      ${reviewForm(o, position, action, withOrder, null)}`}
    </div>`;
    })}
  </div>`;
}
