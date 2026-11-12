/* The owner's BIR registration badge, sent on from this host so the page's image policy stays 'self' and no storage
   address ever reaches the browser. Only an image, only for a served site that has one; otherwise the neutral 404. */
import { storefrontEnv } from "../../lib/env.ts";
import { fetchSeal } from "../../lib/pack-api.ts";
import { requestHost, siteFor } from "../../lib/site.ts";
import { neutralNotFound } from "../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  const file = await fetchSeal(requestHost(request), { env: storefrontEnv() });
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.contentType.split(";")[0].trim())) return neutralNotFound();
  return new Response(file.bytes, {
    headers: {
      "Content-Type": file.contentType.split(";")[0].trim(),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
