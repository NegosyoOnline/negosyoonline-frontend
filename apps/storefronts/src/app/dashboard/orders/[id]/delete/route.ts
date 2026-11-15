/* Delete one order from the member's log, POST /dashboard/orders/<id>/delete/ (the confirm is on the edit page). */
import { dashPost, others } from "../../../../../lib/dashboard-route.ts";
import { orderDeletePost } from "../../../../../lib/orders-flow.ts";
import { neutralNotFound } from "../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return dashPost(request, (d) => orderDeletePost(d, id));
}

export { neutralNotFound as GET };
export const { PUT, PATCH, DELETE, OPTIONS } = others;
