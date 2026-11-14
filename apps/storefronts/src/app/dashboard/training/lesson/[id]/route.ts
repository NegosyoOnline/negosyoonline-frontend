/* The lesson player, /dashboard/training/lesson/<lesson id>/ (this path alone may frame the allowlisted video hosts: next.config.ts). */
import { dashGet } from "../../../../../lib/dashboard-route.ts";
import { lessonPage } from "../../../../../lib/training-flow.ts";
import { neutralNotFound } from "../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const hint = new URL(request.url).searchParams.get("c") ?? "";
  return dashGet(request, (d) => lessonPage(d, id, hint));
}

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
