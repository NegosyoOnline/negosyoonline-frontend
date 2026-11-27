/* Links to the approved Santé files in public/assets/sante. Each link carries ?v=<the first 8
   characters of the file's SHA-256>, so a changed file gets a new address and a browser never
   keeps the old one. The values are written here, not read from disk on a request, because a
   deployed server function does not hold the public folder. tests/assets.test.ts fails when a
   file and its value here disagree: change a file, then update its line.

   Only files a page links by name are listed. Images the stylesheets load (../img/...) are not. */

const VERSIONS: Record<string, string> = {
  "css/pack-home.css": "7bf002d3",
  "css/pack-storefront.css": "06f9df31",
  "js/pack-home.js": "db367a6b",
  "js/pack-store.js": "3caf40e6",
  "js/contact-form.js": "e1bebee9", // this storefront's own file, not one of the approved TWCinc files
  "css/pack-landing.min.css": "e84ee767",
  "css/pack-footer.min.css": "717c64da",
  "css/pack-registration.css": "488877e1",
  "css/pack-dashboard-shell.css": "189c31cc",
  "css/pack-dashboard.css": "877a70b1",
  "css/pack-reviews.css": "351a9a33", // this storefront's own file: the stars, the order review form and the product page reviews
  "css/pack-shop-orders.css": "ad99690f", // this storefront's own file: the shop order card's photo, unit price and savings row
  "css/pack-focus.css": "bbc3d1a0", // this storefront's own file: Coach Ed's light-blue focus rule, over the TWCinc sheets
  "css/pack-member-bar.css": "cd1775a5", // this storefront's own file: the member bar's boxed width, bell, name dropdown, notices panel and dark theme
  "js/pack-member-bar.js": "b213a855", // this storefront's own file: the member bar's dropdowns (user, bell, Earn with Santé), theme switch and bell (loaded in the head)
  "css/pack-member-home.css": "2dad74b8", // this storefront's own file: the Home (v3 redesign), My Membership, Help, the My Purchases list and the More menu
  "js/pack-member-home.js": "fcaf50cc", // this storefront's own file: the Home's Copy button for the tracking number
  "js/pack-phone.js": "8f9f894d",
  "js/pack-otp.js": "08e878d8",
  "js/pack-busy.js": "cd6351f6",
  "js/pack-code-timer.js": "b2ed15b7",
  "js/pack-dashboard.js": "582e7cca",
  "js/pack-lock.js": "ca426504", // this storefront's own file: the rejection dialog's script, inline in TWCinc
  "js/pack-nav-toggle.js": "8178357d", // this storefront's own file: the menu button the TWCinc shell wrote as an inline script
  "css/pack-forms.css": "67b5ecba",
  "css/pack-select.css": "aac04c44",
  "css/pack-picker.css": "17a348c7", // this storefront's own file: the delivery address picker's field, tabbed panel and ZIP (ClickUp z8uq9mkmwb)
  "css/pack-shop.css": "baacd357", // this storefront's own file: the checkout's dropdown and focus look, over the TWCinc sheets
  "js/pack-shop.js": "a62f3b26", // this storefront's own file: the checkout's field checks, ship-mode cards, Copy and QR zoom
  "img/bg-package.avif": "50416d1b",
  "img/bundle-1.webp": "72508fd0",
  "img/bundle-2.webp": "26805437",
  "img/bundle-3.webp": "e38eb488",
  "img/certifications/biogro-certified-organic.png": "147c9dfc",
  "img/certifications/halal-idcp.png": "b6a42b13",
  "img/certifications/superbrands-philippines-choice.png": "03f8b26e",
  "img/hero-nz-clean-1400.webp": "934eb4d9",
  "img/hero-nz-clean-2000.webp": "6c73488a",
  "img/iqvia-seal.webp": "fd45835a",
  "img/sante-logo-white.webp": "095eff6a",
  "js/pack-select.js": "31a2768f",
  "js/pack-pay.js": "90cd387b", // the pay page opens the Xendit invoice (ClickUp z8uq9mgkp1)
  "js/pack-return.js": "15ab7bbb", // the return page polls the payment (ClickUp z8uq9mgkp1)
  "js/pack-checkout.js": "0de08ac6", // this storefront's own file: the checkout's inline scripts, moved out (the policy allows none)
  "css/pack-verify.css": "010f10a2",
  "js/pack-address.js": "2bae315e",
  "js/pack-details-gate.js": "e52d9e8d",
  "js/pack-terms-popup.js": "7484a35f", // this storefront's own file: the TWCinc terms popup framed the PDF; this one draws it with PDF.js
  "data/provinces.json": "1926a7f7",
  "data/city-mun.json": "06b39d0d",
  "data/barangays.json": "4f4439a8",
  // Member Home v3 corrections 1 (ClickUp z8uq9mgmjg): Coach Ed's four category photos (800px) and the brown parcel (400px, with alpha)
  "img/dash-category-barley-essentials.webp": "66454c47",
  "img/dash-category-daily-wellness.webp": "8dd1531f",
  "img/dash-category-coffee-beverages.webp": "2e3449e4",
  "img/dash-category-explore-range.webp": "520a5c1f",
  "img/dash-parcel-brown-box.webp": "ee40c908",
  "img/order-summary-pack-640.webp": "66a9cf4a",
  "img/order-summary-pack-960.webp": "46396612",
  "img/about/about-1.webp": "7bebaeeb",
  "img/about/about-2.webp": "8d3ec232",
  "img/about/about-3.webp": "f4e28038",
  "img/about/about-4.webp": "bc975708",
  "img/reels/reel-d49a0f2e.jpg": "b34a294d",
  "img/reels/reel-d7e40dca.jpg": "373da1c2",
  "img/reels/reel-41271ba0.jpg": "f77bdf0e",
  "img/reels/reel-d9de4a51.jpg": "69a5a925",
  "img/reels/reel-54990aa4.jpg": "3b642baf",
  "img/reels/reel-1.jpg": "cf79141a",
  "js/pack-visit.js": "3b49b61a", // this storefront's own file: the landing page visitor ref and the video marks (ClickUp z8uq9mfw14)
  "js/lesson-watch.js": "8b1f7f02", // this storefront's own file: the member lesson page's watch progress and live completion (ClickUp z8uq9mhbhd, CP-1 R2)
  "js/player.min.js": "48c4f991", // Player.js v0.0.11 (embedly, MIT), the copy TWCinc ships, self-hosted so script-src stays 'self'
  "js/pack-landing.js": "625c300d", // this storefront's own file: the landing page's inline script, moved out (the policy allows none)
  "js/pack-policy-popup.js": "9d957133",
  "img/navbar-logo.webp": "c9c6702a",
  "img/sante-share-1200x630.jpg": "d576a824", // this storefront's own file: the share image (og:image, twitter:image) of the home and the landing page (ClickUp z8uq9mh8n9)
  "img/live4more-share-1200x630.jpg": "6bbeb550", // this storefront's own file: Coach Ed's own share image for the Live4More stores only (ClickUp z8uq9mhbcq, ruling 1100430000604741)
  "img/sante-apple-touch-icon-180.png": "b7f52c18", // this storefront's own file: the apple-touch-icon, the Santé S on white
  "img/sante-favicon-32.png": "c417ab3c", // this storefront's own file: the favicon, the Santé S on white
  "img/fda-philippines.png": "ee97c331",
  "img/category_barley.png": "595b18ab",
  "img/category_drinks.png": "4f45e145",
  "img/category_essential.png": "7d7a7947",
  "img/category_beauty.png": "13a6b0f0",
  "img/about_1.png": "0157eac1",
  "img/about_2.png": "ad6f62ec",
  "img/about_3.png": "034252eb",
  "img/about_4.png": "4f6fcb39",
  "img/blog_1.png": "c2362ffc",
  "img/blog_2.png": "559075d2",
  "img/blog_3.png": "ba6adeb3",
  "img/category_barley.webp": "1913a511",
  "img/category_drinks.webp": "6659b3a5",
  "img/category_essential.webp": "032d1772",
  "img/category_beauty.webp": "e50e284a",
  "img/about_1.webp": "789fd579",
  "img/about_2.webp": "eb05a0ce",
  "img/about_3.webp": "07f4632f",
  "img/about_4.webp": "a903b606",
  "img/about_bg.webp": "6d5189a8",
  "img/blog_1.webp": "99d5623c",
  "img/blog_2.webp": "6870f46a",
  "img/blog_3.webp": "cc22ea9b",
  "css/pack-media.css": "30988ed0", // this storefront's own file: the member Media Library (filter rail, grid, drawer, preview popup)
  "js/pack-media.js": "20115d2f", // this storefront's own file: the Media Library's drawer, Copy caption, preview popup and in-place "Load 12 more"
  "css/chat-widget.css": "ff4f5d87", // this storefront's own file: the website chat launcher and panel (G3 PR3)
  "js/chat-widget.js": "149e34b6", // this storefront's own file: the website chat widget (G3 PR3; src/lib/chat-flow.ts)
  "js/meta-pixel.js": "1f1c4d5c", // this storefront's own file: the tracking notice and the Meta Pixel (home, landing, checkout; src/lib/meta.ts)
};

export const ASSET_BASE = "/assets/sante/";

export function assetVersions(): Readonly<Record<string, string>> {
  return VERSIONS;
}

/** "/assets/sante/css/pack-home.css?v=1a2b3c4d". An unlisted path is a programming error. */
export function asset(path: string): string {
  const version = VERSIONS[path];
  if (!version) throw new Error(`No such storefront asset: ${path}`);
  return `${ASSET_BASE}${path}?v=${version}`;
}
