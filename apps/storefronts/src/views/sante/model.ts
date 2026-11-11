/* What the Santé home shows, built from the storefront surface's answer. The names follow the
   approved template's own variables, so home.ts reads like the template. */
import type { Site } from "../../lib/django.ts";

export type ContactForm = {
  values: { name: string; email: string; subject: string; message: string };
  errors: { name?: string; email?: string; message?: string };
  sent: boolean;
  note: string;
};

export type HomeModel = {
  store_name: string;
  free_shipping_banner: boolean;
  year: number;
  /* The basket. No product page exists yet, so it is always empty: `lines` says whether it has rows. */
  drawer: { count: number; count_label: string; subtotal: string; lines: boolean; error: string };
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

/* Where the form posts. The "#contact" part is not sent to the server: the browser posts to
   /contact/ and then scrolls the answer to the contact section, so the note under the form is in
   view. Without it the answer opens at the top of the page and the post looks like nothing
   happened. TWCinc's own answer after a sent message goes to the same place ("/?contact=sent#contact"). */
export const CONTACT_PATH = "/contact/#contact";
export const CONTACT_FAILED_NOTE = "We could not send your message. Please try again in a moment.";

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

/** The form after a post. Sending is not built in this slice, so every post gets the approved
    "could not send" note with the typed values kept, cut to the form's own limits. */
export function failedContactForm(posted: URLSearchParams): ContactForm {
  const field = (key: string) => posted.get(key) ?? "";
  return {
    values: {
      name: oneLine(field("name")).slice(0, MAX_NAME),
      email: field("email").trim().toLowerCase().slice(0, MAX_EMAIL),
      subject: oneLine(field("subject")).slice(0, MAX_SUBJECT),
      message: field("message").trim().slice(0, MAX_MESSAGE),
    },
    errors: {},
    sent: false,
    note: CONTACT_FAILED_NOTE,
  };
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

export function homeModel(site: Site, cf: ContactForm = emptyContactForm(), now: Date = new Date()): HomeModel {
  const phone = formatMobile(site.distributor.mobile);
  return {
    store_name: site.display_name,
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
      has_seal: false, // no /business-seal/ route until private files exist: the design's no-seal state
    },
  };
}
