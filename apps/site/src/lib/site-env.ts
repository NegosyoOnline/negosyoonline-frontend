/* Per-environment URLs for the public site. No secrets.
   Defaults are the staging hosts, so a deploy with no variables set never talks to production.
   Production must set all three in its Vercel project. Read at build time. */

function clean(value: string | undefined, fallback: string): string {
  return (value || fallback).trim().replace(/\/+$/, "");
}

export const siteEnv = {
  apiBase: clean(process.env.SITE_API_BASE, "https://api-staging.negosyonline.com/v1"),
  siteUrl: clean(process.env.SITE_URL, "https://www-staging.negosyonline.com"),
  dashUrl: clean(process.env.SITE_DASH_URL, "https://dash-staging.negosyonline.com"),
};

export const apiOrigin = new URL(siteEnv.apiBase).origin;
