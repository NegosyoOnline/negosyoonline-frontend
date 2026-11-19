/* The pay and return pages of a Xendit order, over the storefront API (ClickUp z8uq9mgkp1; views: pack-pay.ts).

   Django keeps the order and reads the invoice; this server only asks "how is the buyer's payment" with the checkout
   cookie's token (as data) and shows the answer. A browser never marks an order paid: only the status the API reports
   moves a buyer on. No cookie, or a token Django no longer knows, starts the checkout again.
   A bank-transfer answer (under_review, needs_attention) is not this page's: it goes to the onboarding page as before. */
import { CHECKOUT_PATH } from "../views/sante/pack-page.ts";
import { htmlResponse } from "./html.ts";
import { redirect } from "./member.ts";
import { checkoutPaymentStatus, type PayState } from "./pack-api.ts";
import type { ObFlow } from "./onboarding-flow.ts";
import { packContext } from "../views/sante/pack-page.ts";
import { ONBOARDING_PATH } from "../views/sante/pack-onboarding.ts";
import { PAY_PATH, RETURN_PATH, paneFor, payDocument, returnDocument, type ReturnPane } from "../views/sante/pack-pay.ts";

const TRY_SHORTLY = "Please try again shortly.";
const BANK: readonly PayState[] = ["under_review", "needs_attention"];

type Read = { kind: "ok"; state: PayState; pay_url: string } | { kind: "start" } | { kind: "busy"; status: number } | { kind: "none" };

async function read(f: ObFlow, retry = false): Promise<Read> {
  if (!f.token) return { kind: "start" };
  const answer = await checkoutPaymentStatus({ host: f.host, visitor_ip: f.visitor_ip, token: f.token, ...(retry ? { retry: true } : {}) }, f.calls);
  if (answer.state === "ok") return { kind: "ok", state: answer.payment_status, pay_url: answer.pay_url };
  if (answer.state === "unavailable") return { kind: "none" };
  if (answer.state === "refused") return answer.code === "checkout_expired" ? { kind: "start" } : { kind: "busy", status: answer.status === 429 ? 429 : 200 };
  return { kind: "busy", status: 200 };
}

function page(f: ObFlow, pane: ReturnPane, error = "", status = 200): Response {
  return htmlResponse(returnDocument(packContext(f.site, f.pack, f.now), { pane, price_centavos: f.pack.price_centavos, error_message: error }), status);
}

/** GET pay/: the interstitial that opens the invoice. Null is the neutral 404. */
export async function payGet(f: ObFlow): Promise<Response | null> {
  const r = await read(f);
  if (r.kind === "none") return null;
  if (r.kind === "start") return redirect(CHECKOUT_PATH);
  if (r.kind === "busy") return redirect(RETURN_PATH);
  if (r.state === "paid" || BANK.includes(r.state)) return redirect(ONBOARDING_PATH);
  if (r.state === "waiting" && r.pay_url) return htmlResponse(payDocument(packContext(f.site, f.pack, f.now), r.pay_url));
  return redirect(RETURN_PATH);
}

/** GET return/: where Xendit sends the buyer back. */
export async function returnGet(f: ObFlow): Promise<Response | null> {
  const r = await read(f);
  if (r.kind === "none") return null;
  if (r.kind === "start") return redirect(CHECKOUT_PATH);
  if (r.kind === "busy") return page(f, "waiting"); // the page polls; the API may be back by then
  if (r.state === "paid" || BANK.includes(r.state)) return redirect(ONBOARDING_PATH);
  return page(f, paneFor(r.state));
}

/** POST return/ (action=retry): ask for a new invoice. */
export async function returnPost(f: ObFlow, text: Record<string, string>): Promise<Response | null> {
  if (text.action !== "retry") return null;
  const r = await read(f, true);
  if (r.kind === "none") return null;
  if (r.kind === "start") return redirect(CHECKOUT_PATH);
  if (r.kind === "busy") return page(f, "no_invoice", TRY_SHORTLY, r.status);
  if (r.state === "paid" || BANK.includes(r.state)) return redirect(ONBOARDING_PATH);
  if (r.state === "waiting" && r.pay_url) return redirect(PAY_PATH);
  return page(f, paneFor(r.state));
}

/** GET return/status/: what js/pack-return.js polls. No answer from the API is a 503 without a state, and the page keeps waiting. */
export async function returnStatus(f: ObFlow): Promise<Response> {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  const r = await read(f);
  if (r.kind === "start") return Response.json({ state: "none" }, { headers });
  if (r.kind === "none") return Response.json({}, { status: 404, headers });
  if (r.kind === "busy") return Response.json({}, { status: 503, headers });
  return Response.json({ state: r.state, pay_url: r.state === "waiting" ? r.pay_url : "" }, { headers });
}
