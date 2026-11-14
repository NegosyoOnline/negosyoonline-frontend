/* The review post of the order-done page, /checkout/done/review/: the placing buyer (the `no_order` cookie) reviews a line of their own order. */
import { reviewPost } from "../../../../lib/shop-flow.ts";
import { others, shopPost } from "../../../../lib/shop-route.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => shopPost(request, (s, text) => reviewPost(s, text));

export { neutralNotFound as GET };
export const { PUT, PATCH, DELETE, OPTIONS } = others;
