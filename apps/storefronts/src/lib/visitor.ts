/* The visitor's network address, for the API's count of messages per address. It is passed to
   Django with the contact form and nowhere else, and is never logged.

   Only Vercel's own header is read, and only on Vercel. There, the platform writes
   x-vercel-forwarded-for itself with the address of the client that connected, replacing
   whatever the visitor sent (vercel.com/docs/headers/request-headers), and nothing sits in
   front of Vercel that could rewrite it. Anywhere else (a local run) any header is just what
   the client typed, so none is believed and the answer is "": the API then counts every such
   visitor together. */
import { isIP } from "node:net";

export function visitorIp(
  headers: Headers,
  source: Record<string, string | undefined> = process.env,
): string {
  if (source.VERCEL !== "1") return "";
  const first = (headers.get("x-vercel-forwarded-for") ?? "").split(",")[0].trim();
  return isIP(first) ? first : "";
}
