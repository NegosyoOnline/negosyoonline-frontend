/* A payment account's QR code for the checkout, sent on from this host so the page's image policy stays 'self' and no
   private-media address reaches the browser. Only an image, only for an account of this site that Django names. */
import { storefrontEnv } from "../../../../lib/env.ts";
import { fetchShopAccountQr } from "../../../../lib/shop-api.ts";
import { requestHost, siteFor } from "../../../../lib/site.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!ID.test(id)) return neutralNotFound();
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  const file = await fetchShopAccountQr(id, requestHost(request), { env: storefrontEnv() });
  if (!file || !file.contentType.startsWith("image/")) return neutralNotFound();
  return new Response(file.bytes, {
    headers: { "Content-Type": file.contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" },
  });
}

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
