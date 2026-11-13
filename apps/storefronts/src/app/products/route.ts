/* The product list, /products/. A site that is not a served Santé site, or whose shop is off, gets the neutral 404. */
import { productsGet } from "../../lib/shop-flow.ts";
import { others, shopGet } from "../../lib/shop-route.ts";
import { neutralNotFound } from "../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => shopGet(request, productsGet);

export const { PUT, PATCH, DELETE, OPTIONS } = others;
export { neutralNotFound as POST };
