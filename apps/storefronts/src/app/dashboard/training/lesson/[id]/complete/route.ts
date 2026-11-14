/* "Mark complete", /dashboard/training/lesson/<lesson id>/complete/ (a same-origin form post). */
import { dashFor } from "../../../../../../lib/dashboard-route.ts";
import { lessonCompletePost } from "../../../../../../lib/training-flow.ts";
import { forbidden, postIsSameOrigin } from "../../../../../../lib/member.ts";
import { neutralNotFound } from "../../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const d = await dashFor(request);
  if (!d) return neutralNotFound();
  if (!postIsSameOrigin(request)) return forbidden();
  return lessonCompletePost(d, id);
}

export { neutralNotFound as GET, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
