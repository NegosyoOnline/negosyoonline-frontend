/* Custom hostnames (ClickUp z8uq9mg8gw). Django alone decides which site a host serves; this file only acts on what it
   answers. A site that is served on an explicit custom hostname says so in its public answer (`custom_host`, the canonical
   apex). Nothing here knows a merchant, a platform parent host or a list of domains, and an answer without the key (an older
   backend, or a platform subdomain) changes nothing. */
import type { Site } from "./django.ts";
import { cleanHost, lookupHost } from "./host.ts";

const WWW = "www.";
const LANDING_PATH = "/funnel/membership-pack/landing-page/";

function bare(host: string): string {
  return host.replace(/:\d+$/, "");
}

/** The host a request for `www.<apex>` should be sent to (with its port kept), or "" when the host is not www.<something with a dot>. */
export function apexOfWww(raw: string | null | undefined): string {
  const host = cleanHost(raw);
  if (!host.startsWith(WWW)) return "";
  const apex = host.slice(WWW.length);
  return bare(apex).includes(".") && !apex.startsWith(WWW) ? apex : "";
}

/** True when this request was served on the site's own custom hostname (not a platform subdomain, not an alias of another site). */
export function onCustomHost(site: Pick<Site, "custom_host">, requestLookupHost: string): boolean {
  const custom = (site.custom_host ?? "").trim().toLowerCase();
  return custom !== "" && bare(requestLookupHost) === custom;
}

/** Where a request for www.<apex> goes: https://<apex> + the same path and query, but ONLY when Django says <apex> is a site's custom
    hostname. A platform host, an unknown host, a host with its own local alias or any failed lookup gives null (no redirect).
    The target can never start with "www.", so it cannot loop. */
export async function wwwRedirectTarget(args: {
  host: string | null;
  url: string;
  secure: boolean;
  aliases: Map<string, string>;
  lookup: (host: string) => Promise<Pick<Site, "custom_host"> | null>;
}): Promise<string | null> {
  const clean = cleanHost(args.host);
  if (!clean || args.aliases.has(bare(clean))) return null;
  const apex = apexOfWww(clean);
  if (!apex) return null;
  const asked = lookupHost(apex, args.aliases);
  const site = await args.lookup(asked);
  if (!site || !onCustomHost(site, asked)) return null;
  let parsed: URL;
  try {
    parsed = new URL(args.url);
  } catch {
    return null;
  }
  return `${args.secure ? "https" : "http"}://${apex}${parsed.pathname}${parsed.search}`;
}

/** Where `/` goes on a custom hostname: the existing membership landing, with the query string kept (campaign and click ids). A
    platform host keeps its shop home. */
export function homeRedirectTarget(site: Pick<Site, "custom_host">, requestLookupHost: string, search: string): string | null {
  return onCustomHost(site, requestLookupHost) ? `${LANDING_PATH}${search}` : null;
}
