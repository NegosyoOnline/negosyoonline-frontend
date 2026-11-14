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
  const raw = (source.STOREFRONT_MOBILE_APP_URL || "").trim();
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !/[\s"'<>]/.test(raw) ? url.toString() : "";
  } catch {
    return "";
  }
}
