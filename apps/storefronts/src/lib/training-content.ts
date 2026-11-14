/* The content of the member Training area and the dashboard's announcements and promos panel (task z8uq9meyqh).
   Coach Ed owns every word and the video address here: all of it is a DRAFT until he approves it. Nothing here may
   promise income, guaranteed earnings or a feature that is not available. */

export type NoticeKind = "announcement" | "promo";
export type Notice = { id: string; kind: NoticeKind; title: string; body: string; until?: string };

/* The one address of the "How to use the Santé Mobile App" video. Empty until Coach Ed supplies it: while empty the page
   says "Video coming soon". Only an https address is ever linked. No hosting or provider work. */
export const MOBILE_APP_VIDEO_URL = "";

/* The Referral Program Terms page the Ways to Earn page links to. Empty until it is settled which page that is (the only
   Referral Program Terms page in the repository is NegosyoOnline's subscriber programme, apps/site referral-terms.html,
   which is not Santé's). While empty the page says the terms are not published yet and links nothing. */
export const REFERRAL_TERMS_URL = "";

/* The shipped announcements and promos, per Santé template. EMPTY on purpose: the panel is hidden while its list is
   empty. An approved item is added here, in code, in its own reviewed change. */
export const NOTICES: Readonly<Record<string, readonly Notice[]>> = {
  sante: [],
};

/* LOCAL PREVIEW ONLY. One test announcement and one test promo, so a reviewer can see the populated panel. Shown only when
   TRAINING_PREVIEW_FIXTURE=1 is in the server's environment AND NODE_ENV is not "production" (so never on a built and
   started server, never on Vercel). These strings are never part of NOTICES. */
export const PREVIEW_FIXTURE: readonly Notice[] = [
  { id: "preview-announcement", kind: "announcement", title: "Test announcement", body: "This is a test announcement shown only in the local preview. It is not real store news." },
  { id: "preview-promo", kind: "promo", title: "Test promo", body: "This is a test promo shown only in the local preview. It is not a real offer.", until: "Test date only" },
];

export function previewFixtureOn(source: Record<string, string | undefined> = process.env): boolean {
  return source.TRAINING_PREVIEW_FIXTURE === "1" && source.NODE_ENV !== "production";
}

/** The notices to show for a template: the shipped list, plus the test fixture only when it is switched on. */
export function noticesFor(template: string, source: Record<string, string | undefined> = process.env): Notice[] {
  const shipped = Object.prototype.hasOwnProperty.call(NOTICES, template) ? NOTICES[template] : [];
  return [...shipped, ...(previewFixtureOn(source) ? PREVIEW_FIXTURE : [])];
}

/** The video address, or "" when it is empty or not https. */
export function videoUrl(url: string = MOBILE_APP_VIDEO_URL): string {
  return /^https:\/\/[^\s"'<>]+$/.test(url.trim()) ? url.trim() : "";
}

export const TRAINING_MODULES: readonly { key: string; title: string; text: string; path: string }[] = [
  { key: "mobile-app", title: "How to use the Santé Mobile App", text: "A short video guide to the Santé Mobile App.", path: "/dashboard/training/mobile-app/" },
  { key: "products", title: "Product Trainings", text: "Get to know the Santé products: what they are and what they are for.", path: "/dashboard/training/products/" },
  { key: "ways-to-earn", title: "Ways to Earn in Santé", text: "An overview of how Santé members can take part in the Santé programs.", path: "/dashboard/training/ways-to-earn/" },
];
