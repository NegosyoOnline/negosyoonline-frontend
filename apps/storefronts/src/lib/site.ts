/* From a request to the site it is for: clean the host, apply a local alias, ask Django. */
import { fetchSite, type Site } from "./django.ts";
import { storefrontEnv } from "./env.ts";
import { lookupHost, parseAliases } from "./host.ts";

/** The host to ask Django about for this request, or "" when there is nothing to look up. */
export function requestHost(request: Request): string {
  return lookupHost(request.headers.get("host"), parseAliases(storefrontEnv().hostAliases));
}

export async function siteFor(request: Request): Promise<Site | null> {
  return fetchSite(requestHost(request), storefrontEnv());
}
