/* The cart, /cart/: GET draws it, POST adds, sets or removes one product (the basket cookie holds ids and quantities only). */
import { cartGet, cartPost } from "../../lib/shop-flow.ts";
import { others, shopGet, shopPost } from "../../lib/shop-route.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => shopGet(request, cartGet);
export const POST = (request: Request) => shopPost(request, (s, text) => cartPost(s, text));

export const { PUT, PATCH, DELETE, OPTIONS } = others;
