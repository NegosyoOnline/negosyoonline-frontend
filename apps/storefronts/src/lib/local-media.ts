/* LOCAL DEVELOPMENT ONLY. STOREFRONT_LOCAL_MEDIA_ORIGIN lets a local preview show product photos that the local API serves from a
   stand-in for the media store (for example http://127.0.0.1:8141/files/...). It is read only when it is exactly a loopback http
   origin: http://127.0.0.1:<port> or http://localhost:<port>, no path, no credentials, no query, no trailing slash. Any other value
   (https, another host, a path, a malformed port) is ignored, and unset (every deployed environment) changes nothing: photos still
   come only from https://*.public.blob.vercel-storage.com. */

const LOOPBACK_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost):([0-9]{1,5})$/;

export function localMediaOrigin(source: Record<string, string | undefined> = process.env): string {
  const value = source.STOREFRONT_LOCAL_MEDIA_ORIGIN;
  if (typeof value !== "string") return "";
  const m = LOOPBACK_ORIGIN.exec(value);
  if (!m) return "";
  const port = Number(m[1]);
  return port >= 1 && port <= 65535 && String(port) === m[1] ? value : "";
}
