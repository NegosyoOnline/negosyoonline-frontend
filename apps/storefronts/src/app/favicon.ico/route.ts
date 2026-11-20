/* /favicon.ico: browsers ask for it by name. A served Santé site sends them to its icon file; any other host gets the neutral
   404 (ClickUp z8uq9mh8n9). */
import { asset } from "../../lib/assets.ts";
import { siteFor } from "../../lib/site.ts";
import { neutralNotFound } from "../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  return new Response(null, { status: 302, headers: { Location: asset("img/sante-favicon-32.png"), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export {
  neutralNotFound as POST,
  neutralNotFound as PUT,
  neutralNotFound as PATCH,
  neutralNotFound as DELETE,
  neutralNotFound as OPTIONS,
};
