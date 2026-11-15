/* Add an order to the member's log, /dashboard/orders/add/. */
import { dashGet, dashPost, others, textOf } from "../../../../lib/dashboard-route.ts";
import { orderAddGet, orderAddPost } from "../../../../lib/orders-flow.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, orderAddGet);
export const POST = (request: Request) => dashPost(request, (d, form) => orderAddPost(d, textOf(form)));

export const { PUT, PATCH, DELETE, OPTIONS } = others;
