/* The checkout, /checkout/: the shipping-address step, the payment step and the order post (steps and words: src/lib/shop-flow.ts). */
import { checkoutGet, checkoutPost } from "../../lib/shop-flow.ts";
import { others, shopGet, shopPost } from "../../lib/shop-route.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => shopGet(request, checkoutGet);
export const POST = (request: Request) => shopPost(request, checkoutPost);

export const { PUT, PATCH, DELETE, OPTIONS } = others;
