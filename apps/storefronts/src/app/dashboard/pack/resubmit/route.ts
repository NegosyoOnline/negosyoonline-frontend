import { resubmitPost } from "../../../../lib/dashboard-flow.ts";
import { dashPost } from "../../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => dashPost(request, resubmitPost);

export { neutralNotFound as GET, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
