/* The Membership Pack landing page. A site that is not a served Santé site, or whose pack is switched off, gets the
   neutral 404. Never cached. Indexable (the one funnel page that is). */
import { fetchPack } from "../../../../lib/django.ts";
import { storefrontEnv } from "../../../../lib/env.ts";
import { htmlResponse } from "../../../../lib/html.ts";
import { afterResponse, metaPage } from "../../../../lib/meta.ts";
import { servedHost } from "../../../../lib/seo.ts";
import { requestHost, siteFor } from "../../../../lib/site.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";
import { landingDocument, landingSeo } from "../../../../views/sante/pack-landing.ts";
import { packContext } from "../../../../views/sante/pack-page.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  const pack = await fetchPack(requestHost(request), storefrontEnv());
  if (!pack) return neutralNotFound();
  /* The Meta Pixel: the notice, or after Accept the data block, with the server events sent after the response. */
  const meta = metaPage({
    request, site, host: requestHost(request), env: storefrontEnv(), events: ["PageView", "ViewContent"], pack,
  });
  if (meta.send) await afterResponse(meta.send);
  /* Indexable (ClickUp z8uq9mh8n9, ruling 1100430000599937); the canonical drops the query string (utm, fbclid). */
  const host = servedHost(request);
  const context = packContext(site, pack);
  const index = host !== "";
  const seo = index ? landingSeo(context, host, pack) : undefined;
  return meta.finish(htmlResponse(landingDocument({ ...context, seo, tracking: meta.markup }), 200, { index }));
}

export {
  neutralNotFound as POST,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
