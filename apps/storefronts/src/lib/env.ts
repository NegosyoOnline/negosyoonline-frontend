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
