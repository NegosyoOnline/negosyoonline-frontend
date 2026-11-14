/* Links to the approved Santé files in public/assets/sante. Each link carries ?v=<the first 8
   characters of the file's SHA-256>, so a changed file gets a new address and a browser never
   keeps the old one. The values are written here, not read from disk on a request, because a
   deployed server function does not hold the public folder. tests/assets.test.ts fails when a
   file and its value here disagree: change a file, then update its line.

   Only files a page links by name are listed. Images the stylesheets load (../img/...) are not. */

const VERSIONS: Record<string, string> = {
  "css/pack-home.css": "b95b223c",
  "css/pack-storefront.css": "db148253",
  "js/pack-home.js": "db367a6b",
  "js/pack-store.js": "96c0924d",
  "js/contact-form.js": "e1bebee9", // this storefront's own file, not one of the approved TWCinc files
  "css/pack-landing.min.css": "e84ee767",
  "css/pack-footer.min.css": "717c64da",
  "css/pack-registration.css": "488877e1",
  "css/pack-dashboard-shell.css": "189c31cc",
  "css/pack-dashboard.css": "877a70b1",
  "css/pack-shop-orders.css": "ad99690f", // this storefront's own file: the shop order card's photo, unit price and savings row
  "css/pack-focus.css": "2a7b1304", // this storefront's own file: Coach Ed's light-blue focus rule, over the TWCinc sheets
  "js/pack-phone.js": "8f9f894d",
  "js/pack-otp.js": "08e878d8",
  "js/pack-busy.js": "cd6351f6",
  "js/pack-code-timer.js": "b2ed15b7",
  "js/pack-dashboard.js": "582e7cca",
  "js/pack-lock.js": "ca426504", // this storefront's own file: the rejection dialog's script, inline in TWCinc
  "js/pack-nav-toggle.js": "8178357d", // this storefront's own file: the menu button the TWCinc shell wrote as an inline script
  "css/pack-forms.css": "80d50155",
  "css/pack-select.css": "096379bc",
  "css/pack-shop.css": "bc0c601f", // this storefront's own file: the checkout's dropdown and focus look, over the TWCinc sheets
  "js/pack-shop.js": "6e308a84", // this storefront's own file: the checkout's field checks, ship-mode cards, Copy and QR zoom
  "img/bg-package.avif": "50416d1b",
  "img/bundle-1.webp": "79f1b43a",
  "img/bundle-2.webp": "7e5a838a",
  "img/bundle-3.webp": "b8bc751e",
  "img/certifications/biogro-certified-organic.png": "147c9dfc",
  "img/certifications/halal-idcp.png": "b6a42b13",
  "img/certifications/superbrands-philippines-choice.png": "03f8b26e",
  "img/hero-nz-tall-40pct-1400.webp": "984af07f",
  "img/hero-nz-tall-40pct-2000.webp": "fc680919",
  "img/iqvia-seal.webp": "fd45835a",
  "img/sante-logo-white.webp": "095eff6a",
  "js/pack-select.js": "ff1d7b9e",
  "js/pack-checkout.js": "4027ca6d", // this storefront's own file: the checkout's inline scripts, moved out (the policy allows none)
  "css/pack-verify.css": "010f10a2",
  "js/pack-address.js": "5ba0f831",
  "js/pack-details-gate.js": "e52d9e8d",
  "js/pack-terms-popup.js": "7484a35f", // this storefront's own file: the TWCinc terms popup framed the PDF; this one draws it with PDF.js
  "data/provinces.json": "1926a7f7",
  "data/city-mun.json": "06b39d0d",
  "data/barangays.json": "4f4439a8",
  "img/order-summary-pack-640.webp": "66a9cf4a",
  "img/order-summary-pack-960.webp": "46396612",
  "js/pack-landing.js": "58741466", // this storefront's own file: the landing page's inline script, moved out (the policy allows none)
  "js/pack-policy-popup.js": "9d957133",
  "img/navbar-logo.webp": "c9c6702a",
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
  "js/meta-pixel.js": "6385c256", // this storefront's own file: the tracking notice and the Meta Pixel (home, landing, checkout; src/lib/meta.ts)
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
