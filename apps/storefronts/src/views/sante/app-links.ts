/* The Santé Mobile App links, one shared helper (ClickUp z8uq9mgmjg). Wherever the app is offered, the page shows an "App Store" and a
   "Google Play" button for each link that is set; with neither, the single fallback link (STOREFRONT_MOBILE_APP_URL); with nothing set, no
   button and the caller's honest "Ask us for the Santé Mobile App link." text. No URL is written in code: the links come from src/lib/env.ts. */
import { html, type Markup } from "../../lib/html.ts";

export type AppLinks = { ios: string; android: string; fallback: string };
/** A plain string is the single fallback link (what tests and older callers pass). */
export type AppLinkInput = string | AppLinks;

export const NO_APP_LINKS: AppLinks = { ios: "", android: "", fallback: "" };

export function appLinks(input: AppLinkInput | null | undefined): AppLinks {
  if (!input) return NO_APP_LINKS;
  return typeof input === "string" ? { ios: "", android: "", fallback: input } : input;
}

/** Whether any link is set. */
export const hasAppLink = (input: AppLinkInput | null | undefined): boolean => { const a = appLinks(input); return !!(a.ios || a.android || a.fallback); };

/** The buttons: App Store and Google Play for the links set, else one "Open the Santé Mobile App" for the fallback, else nothing.
    `cls` is the button class of the place it stands in (each page style has its own). */
export function appButtons(input: AppLinkInput | null | undefined, cls: string): Markup {
  const a = appLinks(input);
  const link = (href: string, label: string) => html`<a class="${cls}" href="${href}" rel="noopener" target="_blank">${label}</a>`;
  if (a.ios || a.android) return html`${a.ios ? link(a.ios, "App Store") : ""}${a.android ? link(a.android, "Google Play") : ""}`;
  return a.fallback ? link(a.fallback, "Open the Santé Mobile App") : html``;
}
