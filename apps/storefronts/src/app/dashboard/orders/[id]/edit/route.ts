/* Edit one order of the member's log, /dashboard/orders/<id>/edit/, with the delete confirm. */
import { dashGet, dashPost, others, textOf } from "../../../../../lib/dashboard-route.ts";
import { orderEditGet, orderEditPost } from "../../../../../lib/orders-flow.ts";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return dashGet(request, (d) => orderEditGet(d, id));
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return dashPost(request, (d, form) => orderEditPost(d, id, textOf(form)));
}

export const { PUT, PATCH, DELETE, OPTIONS } = others;
