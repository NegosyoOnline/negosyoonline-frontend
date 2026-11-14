/* What the two review posts share (the order-done page's /checkout/done/review/ and My Orders' /dashboard/orders/review/): reading the
   form, calling Django with the order's own proof, and turning the answer into a fixed outcome word that the page shows from a
   fixed list. Nothing a buyer typed is stored here or put back in an address; only the outcome, the order id and the line travel
   in the redirect. */
import { saveReview, type Calls, type PackResult } from "./shop-api.ts";
import { redirect } from "./member.ts";

export const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export type ReviewForm = { position: number; edit: boolean; rating: number; body: string; display_name: string };

/** The form as the browser posted it, or null when the line is not a line number. The rating is 0 when it is not a whole 1 to 5. */
export function readReviewForm(text: Record<string, string>): ReviewForm | null {
  const position = Number(text.position ?? "");
  if (!Number.isInteger(position) || position < 1 || position > 999) return null;
  const rating = /^[1-5]$/.test((text.rating ?? "").trim()) ? Number(text.rating) : 0;
  return { position, edit: text.mode === "edit", rating, body: (text.body ?? "").slice(0, 4000), display_name: (text.display_name ?? "").trim() };
}

/** Django's answer as the outcome word the page knows. */
export function outcomeOf(r: PackResult<unknown>): string {
  if (r.state === "ok") return "saved";
  if (r.state !== "refused") return "failed";
  if (r.code === "not_delivered") return "not_delivered";
  if (r.code === "already_reviewed") return "exists";
  if (r.code === "review_locked") return "locked";
  if (r.code === "invalid_request" || r.status === 400 || r.status === 422) return "invalid";
  return "failed";
}

type Who = { host: string; visitor_ip: string; order_id: string; view_token: string; member_token: string; calls: Calls };

/** Save the review (or refuse a missing rating without calling Django) and redirect back to `page` with the outcome. */
export async function submitReview(who: Who, form: ReviewForm, page: string): Promise<Response> {
  let outcome = "invalid";
  if (form.rating > 0) {
    const r = await saveReview({
      host: who.host, visitor_ip: who.visitor_ip, order_id: who.order_id, position: form.position, view_token: who.view_token,
      member_token: who.member_token, edit: form.edit, rating: form.rating, body: form.body, display_name: form.display_name || undefined,
    }, who.calls);
    outcome = outcomeOf(r);
  }
  return redirect(`${page}?review=${outcome}&order=${encodeURIComponent(who.order_id)}&line=${form.position}#review-${who.order_id}-${form.position}`);
}
