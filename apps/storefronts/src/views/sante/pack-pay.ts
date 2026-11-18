/* The Xendit pages of the Membership Pack checkout (ClickUp z8uq9mgkp1).

   - The pay page, /funnel/membership-pack/checkout/pay/: a place post answers a redirect to this same-origin page, and the
     page opens the Xendit invoice (an automatic continue, the link as the fallback). The policy's form-action 'self' would
     block a post answered with a redirect off this host, so the browser leaves by navigation, never by a form.
   - The return page, /funnel/membership-pack/checkout/return/: Xendit sends the buyer back here. It waits and polls the
     status path (js/pack-return.js); it never marks anything paid, the webhook does.
   Transcribed from TWCinc's negosyoonline_sante_pack/return.html. Text, class names and order are the template's. Different
   from it, on purpose: no CSRF field (a post is checked for its origin); no inline script (js/pack-return.js reads data-
   attributes); the "still checking" line says email only (this site sends no text); the amount is the server's
   (pack.price_centavos). */
import { html, type Markup } from "../../lib/html.ts";
import type { PayState } from "../../lib/pack-api.ts";
import { ONBOARDING_PATH } from "./pack-onboarding.ts";
import { CHECKOUT_PATH, packDocument, pesos, type PackCtx } from "./pack-page.ts";

export const PAY_PATH = CHECKOUT_PATH + "pay/";
export const RETURN_PATH = CHECKOUT_PATH + "return/";
export const RETURN_STATUS_PATH = RETURN_PATH + "status/";

export const MSG_NOT_AVAILABLE_NOW = "Payment is not available right now.";

/** The panes of the return page; "waiting" is the one the buyer sees first. */
export type ReturnPane = "waiting" | "paid" | "checking" | "no_invoice" | "expired" | "mismatch";

/** The pane a server status opens on. A bank-transfer order (under_review, needs_attention) is not this page's; the route
    sends it on to the onboarding page before it gets here. */
export function paneFor(state: PayState): ReturnPane {
  switch (state) {
    case "waiting": return "waiting";
    case "paid": return "paid";
    case "no_invoice": return "no_invoice";
    case "mismatch": return "mismatch";
    default: return "expired"; // none, expired
  }
}

export function payDocument(c: PackCtx, payUrl: string): Markup {
  return packDocument(c, {
    title: "Continue to payment",
    content: html`
<div class="pp-co"><div class="pp-co-wrap"><div class="pp-narrow"><div class="card" id="pack-pay" data-pay-url="${payUrl}">
<div class="spin" aria-hidden="true"></div>
<h1>Continue to payment</h1>
<a class="btn" href="${payUrl}" rel="noopener">Continue to payment</a>
</div></div></div></div>
`,
    scripts: ["js/pack-pay.js"],
  });
}

export type ReturnModel = {
  pane: ReturnPane;
  /** The server's price for the mismatch line (centavos). */
  price_centavos: number;
  /** A refused retry: shown above the pane. */
  error_message: string;
};

export function returnDocument(c: PackCtx, m: ReturnModel): Markup {
  const show = (pane: ReturnPane): Markup => (m.pane === pane ? html`` : html` hidden`);
  return packDocument(c, {
    title: "Confirming your payment",
    content: html`
<div class="pp-co"><div class="pp-co-wrap"><div class="pp-narrow"><div class="card" id="pack-return" data-status-path="${RETURN_STATUS_PATH}" data-onboarding-path="${ONBOARDING_PATH}" data-poll="${m.pane === "waiting" ? "1" : "0"}">
${m.error_message ? html`<div class="note bad" role="alert">${m.error_message}</div>` : ""}
<div data-state="waiting"${show("waiting")}>
<div class="spin" aria-hidden="true"></div>
<h1>Confirming your payment</h1>
<p>This page updates by itself. Please keep it open.</p>
</div>
<div data-state="paid"${show("paid")}><h1>Payment confirmed. Taking you to the next step.</h1></div>
<div data-state="checking"${show("checking")}>
<h1>We're still checking your payment</h1>
<p>We will email you when Xendit confirms it. You can close this page.</p>
<a class="btn" data-continue href="${PAY_PATH}" hidden>Continue to payment</a>
</div>
<div data-state="no_invoice"${show("no_invoice")}>
<div class="note bad" role="alert">${MSG_NOT_AVAILABLE_NOW}</div>
<p>Your order is saved. Try again in a moment.</p>
<form method="post" action="${RETURN_PATH}"><input type="hidden" name="action" value="retry"><button class="btn" type="submit">Try again</button></form>
</div>
<div data-state="expired"${show("expired")}>
<h1>Your payment was not completed</h1>
<p>The payment page expired before payment. You can start again.</p>
<a class="btn" href="${CHECKOUT_PATH}">Try again</a>
</div>
<div data-state="mismatch"${show("mismatch")}>
<p>The payment we received does not match ${pesos(m.price_centavos)}. The store is checking it and will contact you.</p>
</div>
</div></div></div></div>
`,
    scripts: ["js/pack-return.js"],
  });
}
