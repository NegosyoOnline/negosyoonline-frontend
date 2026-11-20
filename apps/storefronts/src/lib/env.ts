/* What the storefronts server reads from its environment. Server only: nothing here is
   prefixed NEXT_PUBLIC_, so nothing here reaches browser code. Read on each request, so a
   build never holds a value.

   STOREFRONT_SERVER_SECRET  the one credential for the Django storefront surface. No default.
   STOREFRONT_API_BASE       the API origin. Defaults to staging, so a deploy with no
                             variables set never talks to production.
   STOREFRONT_HOST_ALIASES   local use only: "www.santetest.com=demo-store.negosyotest.com",
                             comma-separated. Unset on Vercel. */

export type StorefrontEnv = {
  apiBase: string;
  secret: string;
  hostAliases: string;
};

const STAGING_API = "https://api-staging.negosyonline.com";

export function storefrontEnv(source: Record<string, string | undefined> = process.env): StorefrontEnv {
  return {
    apiBase: (source.STOREFRONT_API_BASE || STAGING_API).trim().replace(/\/+$/, ""),
    secret: (source.STOREFRONT_SERVER_SECRET || "").trim(),
    hostAliases: source.STOREFRONT_HOST_ALIASES || "",
  };
}

/** STOREFRONT_MOBILE_APP_URL: where the Santé Mobile App can be opened or installed (a store link), shown to a signed-in member in place
    of the cart and checkout. Server only, read on each request. Anything but an https URL counts as not set (the notice then has no link). */
export function mobileAppUrl(source: Record<string, string | undefined> = process.env): string {
  return httpsLink(source.STOREFRONT_MOBILE_APP_URL);
}

function httpsLink(value: string | undefined): string {
  const raw = (value || "").trim();
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !/[\s"'<>]/.test(raw) ? url.toString() : "";
  } catch {
    return "";
  }
}

/** The Google Play link as an Android "open the app" link: an intent:// URL naming the app's package (the `id=` of the configured Play link)
    that falls back to the Play link itself when the app is not installed. "" when the id is missing or not a valid package name. */
function androidIntent(play: string): string {
  const id = play ? new URL(play).searchParams.get("id") ?? "" : "";
  if (!/^[A-Za-z0-9._]+$/.test(id)) return "";
  return `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${id};S.browser_fallback_url=${encodeURIComponent(play)};end`;
}

/** The app links: STOREFRONT_MOBILE_APP_URL_IOS (App Store), STOREFRONT_MOBILE_APP_URL_ANDROID (Google Play) and the single fallback
    STOREFRONT_MOBILE_APP_URL, each validated alike (https only; anything else counts as not set). For an Android visitor (`userAgent`
    names Android) the Google Play link becomes the intent:// link that opens the installed app; every other visitor keeps the plain links. */
export function mobileApps(source: Record<string, string | undefined> = process.env, userAgent = ""): { ios: string; android: string; fallback: string } {
  const android = httpsLink(source.STOREFRONT_MOBILE_APP_URL_ANDROID);
  return { ios: httpsLink(source.STOREFRONT_MOBILE_APP_URL_IOS), android: /Android/i.test(userAgent) ? androidIntent(android) || android : android, fallback: mobileAppUrl(source) };
}

/** The app links for this request, read from its User-Agent. */
export const mobileAppsFor = (request: Request) => mobileApps(process.env, request.headers.get("user-agent") ?? "");
