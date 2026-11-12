/* One store policy page (TWCinc site_views.policy_view): GET only, the neutral 404 for a site that is not a served Santé site
   and for a page that is not live. Never indexed. */
import { storefrontEnv } from "./env.ts";
import { htmlResponse } from "./html.ts";
import { fetchPolicy } from "./pack-api.ts";
import { requestHost, siteFor } from "./site.ts";
import { neutralNotFound } from "../views/neutral.ts";
import { policyDocument } from "../views/sante/pack-policies.ts";
import { packContext } from "../views/sante/pack-page.ts";

export function policyRoute(slug: string): (request: Request) => Promise<Response> {
  return async (request) => {
    const site = await siteFor(request);
    if (!site) return neutralNotFound();
    const policy = await fetchPolicy(slug, requestHost(request), { env: storefrontEnv() });
    if (!policy) return neutralNotFound();
    // The page prints no price: the pack stand-in only completes the page context (its chrome and footer links are the site's).
    const doc = policyDocument(packContext(site, { price_centavos: 0, currency: "PHP", available: false, agreement: null, payment_accounts: [] }), policy);
    return doc ? htmlResponse(doc) : neutralNotFound();
  };
}
