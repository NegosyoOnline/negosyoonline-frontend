/* The order-done page, /checkout/done/: only the placing buyer opens it (the `no_order` cookie holds the key Django checks). */
import { doneGet } from "../../../lib/shop-flow.ts";
import { others, shopGet } from "../../../lib/shop-route.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => shopGet(request, doneGet);

export const { PUT, PATCH, DELETE, OPTIONS } = others;
export { neutralNotFound as POST };
