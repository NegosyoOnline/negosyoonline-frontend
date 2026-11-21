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

/* The public Vercel Blob media host the CSP lets images load from. It must match the backend's public media host
   (PUBLIC_MEDIA_BASE_URL). Unset keeps today's staging store. Production sets SITE_MEDIA_ORIGIN to its own store.
   A value that is not exactly https://<store>.public.blob.vercel-storage.com fails the build rather than widening the CSP. */
export const DEFAULT_MEDIA_ORIGIN = "https://pemdcws76uzmwk7c.public.blob.vercel-storage.com";

export function readMediaOrigin(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return DEFAULT_MEDIA_ORIGIN;
  const bare = raw.replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(bare)) {
    throw new Error("SITE_MEDIA_ORIGIN must be an https://<store>.public.blob.vercel-storage.com origin with no path");
  }
  return bare;
}

export const mediaOrigin = readMediaOrigin(process.env.SITE_MEDIA_ORIGIN);

export const apiOrigin = new URL(siteEnv.apiBase).origin;
