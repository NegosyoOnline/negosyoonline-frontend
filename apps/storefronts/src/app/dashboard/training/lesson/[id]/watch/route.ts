/* How far a member has watched, /dashboard/training/lesson/<lesson id>/watch/ (a same-origin JSON post from js/lesson-watch.js). */
import { dashFor } from "../../../../../../lib/dashboard-route.ts";
import { lessonWatchPost } from "../../../../../../lib/training-flow.ts";
import { forbidden, postIsSameOrigin } from "../../../../../../lib/member.ts";
import { neutralNotFound } from "../../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const d = await dashFor(request);
  if (!d) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  return lessonWatchPost(d, id);
}

export { neutralNotFound as GET, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
