/* One course, /dashboard/training/<course id>/: its modules, progress and lessons. */
import { dashGet } from "../../../../lib/dashboard-route.ts";
import { coursePage } from "../../../../lib/training-flow.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ course: string }> }): Promise<Response> {
  const { course } = await context.params;
  return dashGet(request, (d) => coursePage(d, course));
}

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
