/* The notice that stands where Add to Cart and Checkout would be for a signed-in member. */
import { html, type Markup } from "../../lib/html.ts";
import { appButtons, type AppLinkInput } from "./app-links.ts";

/** What a signed-in member sees where Add to Cart and Checkout would be (ruling 1100430000523941: members order only in the app). */
export const APP_NOTICE = "Order in the Santé Mobile App";
export const APP_NOTICE_TEXT = "Members order through the Santé Mobile App.";

/** The notice with the app link where one is configured (`href` empty: no link). */
export function appNotice(href: AppLinkInput): Markup {
  return html`<div class="sf-app-notice" data-sf-app-notice>
  <strong>${APP_NOTICE}</strong>
  <p>${APP_NOTICE_TEXT}</p>
  ${appButtons(href, "btn-cart")}
</div>`;
}
