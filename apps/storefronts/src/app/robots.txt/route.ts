/* /robots.txt: allow the public pages, keep crawlers out of the private prefixes, point at the sitemap. Only a served Santé
   site answers; any other host gets the neutral 404 (ClickUp z8uq9mh8n9). */
import { robotsText, servedHost } from "../../lib/seo.ts";
import { siteFor } from "../../lib/site.ts";
import { neutralNotFound } from "../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const site = await siteFor(request);
  const host = servedHost(request);
  if (!site || !host) return neutralNotFound();
  return new Response(robotsText(host), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export {
  neutralNotFound as POST,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
