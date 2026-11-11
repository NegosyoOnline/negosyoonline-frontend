/* Links to the approved Santé files in public/assets/sante. Each link carries ?v=<the first 8
   characters of the file's SHA-256>, so a changed file gets a new address and a browser never
   keeps the old one. The values are written here, not read from disk on a request, because a
   deployed server function does not hold the public folder. tests/assets.test.ts fails when a
   file and its value here disagree: change a file, then update its line.

   Only files a page links by name are listed. Images the stylesheets load (../img/...) are not. */

const VERSIONS: Record<string, string> = {
  "css/pack-home.css": "5ba10b0b",
  "css/pack-storefront.css": "dc54b2a8",
  "js/pack-home.js": "db367a6b",
  "js/pack-store.js": "6cc4f761",
  "js/contact-form.js": "e1bebee9", // this storefront's own file, not one of the approved TWCinc files
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
