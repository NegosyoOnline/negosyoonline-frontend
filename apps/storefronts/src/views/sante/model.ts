/* What the Santé home shows, built from the storefront surface's answer. The names follow the
   approved template's own variables, so home.ts reads like the template. */
import type { Site } from "../../lib/django.ts";
import type { Markup } from "../../lib/html.ts";

export type ContactForm = {
  values: { name: string; email: string; subject: string; message: string };
  errors: { name?: string; email?: string; subject?: string; message?: string };
  sent: boolean;
  note: string;
};

export type HomeModel = {
  /* The Meta notice, or the Pixel's data block and script, just before </body> (src/lib/meta.ts). Only the home route sets it. */
  tracking?: Markup;
  store_name: string;
  /* A signed-in member sees "Dashboard" in the header CTA where a visitor sees "Login" (Coach Ed, 2026-11-12). */
  signed_in: boolean;
  free_shipping_banner: boolean;
  year: number;
  /* The basket: `lines` says whether it has rows, `rows` is their markup (the shop fills it; the home passes none). */
  drawer: { count: number; count_label: string; subtotal: string; lines: boolean; error: string; rows?: Markup };
  dist: { name: string; initials: string; tel: string; phone: string; photo: boolean };
  socials: { instagram: string; tiktok: string };
  contact_path: string;
  cf: ContactForm;
  policy_links: { label: string; path: string }[];
  biz: {
    registered_name: string;
    tin: string;
    dti_business_number: string;
    contact_email: string;
    has_seal: boolean;
  };
};

/* Where the form posts. The "#contact-form" part is not sent to the server: the browser posts to
   /contact/ and then scrolls the answer to the "Send a Message" card (id="contact-form" in
   home.ts), so the note under the form is in view, on a phone too. Without it the answer opens
   at the top of the page and the post looks like nothing happened. */
export const CONTACT_PATH = "/contact/#contact-form";
export const CONTACT_FAILED_NOTE = "We could not send your message. Please try again in a moment.";
export const CONTACT_LIMITED_NOTE = "Too many messages from this connection. Please try again later.";
/* Where a sent post goes next, as the approved site does: a fresh GET of the home, so a reload
   does not send the message twice. The home shows the thank-you line when it is asked this way. */
export const CONTACT_SENT_PATH = "/?contact=sent#contact-form";

const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 4000;

export function emptyContactForm(): ContactForm {
  return { values: { name: "", email: "", subject: "", message: "" }, errors: {}, sent: false, note: "" };
}

function oneLine(value: string): string {
  return value.replace(/\r/g, "\n").split("\n").join(" ").trim();
}

export type ContactErrors = ContactForm["errors"];

/** The four fields a visitor typed, cut to the form's own limits, as the form shows them again. */
function typedValues(posted: URLSearchParams): ContactForm["values"] {
  const field = (key: string) => posted.get(key) ?? "";
  return {
    name: oneLine(field("name")).slice(0, MAX_NAME),
    email: field("email").trim().toLowerCase().slice(0, MAX_EMAIL),
    subject: oneLine(field("subject")).slice(0, MAX_SUBJECT),
    message: field("message").trim().slice(0, MAX_MESSAGE),
  };
}

/** The form after a post that was not sent: the approved "could not send" note with the typed
    values kept. */
export function failedContactForm(posted: URLSearchParams): ContactForm {
  return { values: typedValues(posted), errors: {}, sent: false, note: CONTACT_FAILED_NOTE };
}

/** The form after a post over the limit of messages from one address: the approved site's own
    line for it, in the note's place, with the typed values kept. */
export function limitedContactForm(posted: URLSearchParams): ContactForm {
  return { values: typedValues(posted), errors: {}, sent: false, note: CONTACT_LIMITED_NOTE };
}

/** The form after a post the API refused for its fields: each error under its own field, the
    typed values kept, no note. */
export function invalidContactForm(posted: URLSearchParams, errors: ContactErrors): ContactForm {
  return { values: typedValues(posted), errors, sent: false, note: "" };
}

/** The form after a sent message: empty, with the approved thank-you line. */
export function sentContactForm(): ContactForm {
  return { ...emptyContactForm(), sent: true };
}

/** "Ana Reyes" -> "AR", "Ana" -> "A", "Ana Maria Reyes" -> "AR", "" -> "?". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  return picked.map((word) => [...word][0]).join("").toUpperCase() || "?";
}

/** "+639171234567" -> "+63 917 123 4567". Anything that is not a PH mobile in that form gives "". */
export function formatMobile(normalized: string): string {
  const match = /^\+63(9\d{2})(\d{3})(\d{4})$/.exec(normalized);
  return match ? `+63 ${match[1]} ${match[2]} ${match[3]}` : "";
}

/** A link a store set is shown only when it is a plain https address. */
function httpsUrl(value: string): string {
  return /^https:\/\/[^\s"'<>]+$/.test(value) ? value : "";
}

function year(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric" }).format(now));
}

export function homeModel(site: Site, cf: ContactForm = emptyContactForm(), now: Date = new Date(), signedIn = false): HomeModel {
  const phone = formatMobile(site.distributor.mobile);
  return {
    store_name: site.display_name,
    signed_in: signedIn,
    free_shipping_banner: site.free_shipping_banner,
    year: year(now),
    drawer: { count: 0, count_label: "0 items", subtotal: "0.00", lines: false, error: "" },
    dist: {
      name: site.distributor.name,
      initials: initials(site.distributor.name),
      tel: phone ? site.distributor.mobile : "",
      phone,
      photo: false, // no /distributor-photo/ route until private files exist: the design's no-photo state
    },
    socials: { instagram: httpsUrl(site.instagram_url), tiktok: httpsUrl(site.tiktok_url) },
    contact_path: CONTACT_PATH,
    cf,
    policy_links: site.policy_links.filter((link) => /^\/[^/\\]/.test(link.path)),
    biz: {
      registered_name: site.business.registered_name,
      tin: site.business.tin,
      dti_business_number: site.business.dti_business_number,
      contact_email: site.business.contact_email,
      has_seal: site.business.has_seal === true, // the owner's uploaded BIR badge, shown through /business-seal/
    },
  };
}
