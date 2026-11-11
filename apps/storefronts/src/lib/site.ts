/* From a request to the site it is for: clean the host, apply a local alias, ask Django. */
import { fetchSite, type Site } from "./django.ts";
import { storefrontEnv } from "./env.ts";
import { lookupHost, parseAliases } from "./host.ts";

export async function siteFor(request: Request): Promise<Site | null> {
  const env = storefrontEnv();
  return fetchSite(lookupHost(request.headers.get("host"), parseAliases(env.hostAliases)), env);
}
