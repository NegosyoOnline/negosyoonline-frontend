/* The website chat widget's two tags: its own stylesheet (in the head) and its own script (before </body>). The widget draws nothing
   until its first poll says chat is available for this host (src/lib/chat-flow.ts), so a page that links it looks the same while chat is
   off. The store's name reaches the script as a data attribute, escaped by the `html` tag. */
import { asset } from "../../lib/assets.ts";
import { html, type Markup } from "../../lib/html.ts";

export function chatWidgetCss(): Markup {
  return html`<link rel="stylesheet" href="${asset("css/chat-widget.css")}">`;
}

export function chatWidgetScript(storeName: string): Markup {
  return html`<script src="${asset("js/chat-widget.js")}" data-chat-widget data-store="${storeName}"></script>`;
}
