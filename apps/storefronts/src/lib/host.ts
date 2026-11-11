/* The host a visitor asked for. It is untrusted: it is cleaned here and then used only as a
   lookup value for Django, which alone decides whether a site is served there. */

const HOST = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::\d{1,5})?$/;

/** The request's Host header, lowercased, or "" when it is not a plain host name. */
export function cleanHost(raw: string | null | undefined): string {
  const host = (raw || "").trim().toLowerCase();
  return HOST.test(host) && !host.includes("..") ? host : "";
}

function withoutPort(host: string): string {
  return host.replace(/:\d+$/, "");
}

/** Reads STOREFRONT_HOST_ALIASES: "from=to,from=to". A pair that is not two clean hosts is
    dropped. Ports are ignored on the "from" side. */
export function parseAliases(raw: string | undefined): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const pair of (raw || "").split(",")) {
    const [from, to, ...rest] = pair.split("=");
    const cleanFrom = cleanHost(from);
    const cleanTo = cleanHost(to);
    if (cleanFrom && cleanTo && rest.length === 0) aliases.set(withoutPort(cleanFrom), cleanTo);
  }
  return aliases;
}

/** The host to ask Django about: the cleaned request host, or its local alias when one is
    set. "" means there is nothing to look up. */
export function lookupHost(raw: string | null | undefined, aliases: Map<string, string>): string {
  const host = cleanHost(raw);
  if (!host) return "";
  return aliases.get(withoutPort(host)) ?? host;
}
