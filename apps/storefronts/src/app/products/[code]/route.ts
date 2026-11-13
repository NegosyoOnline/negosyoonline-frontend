/* One product, /products/<code>/. An unknown or inactive product, a site that is not served and a switched-off shop all get the neutral 404. */
import { productGet } from "../../../lib/shop-flow.ts";
import { others, shopGet } from "../../../lib/shop-route.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

const CODE = /^[A-Za-z0-9._-]{1,40}$/;

export async function GET(request: Request, context: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await context.params;
  if (!CODE.test(code)) return neutralNotFound();
  return shopGet(request, (s) => productGet(s, code));
}

export const { PUT, PATCH, DELETE, OPTIONS } = others;
export { neutralNotFound as POST };
