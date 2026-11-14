/* The review post of My Orders, /dashboard/orders/review/: the signed-in member reviews a line of their own delivered order. */
import { reviewPost } from "../../../../lib/dashboard-flow.ts";
import { dashPost, others, textOf } from "../../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => dashPost(request, (d, form) => reviewPost(d, textOf(form)));

export { neutralNotFound as GET };
export const { PUT, PATCH, DELETE, OPTIONS } = others;
