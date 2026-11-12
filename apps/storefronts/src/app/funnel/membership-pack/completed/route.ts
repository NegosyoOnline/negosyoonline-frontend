import { completedGet, completedPost } from "../../../../lib/onboarding-flow.ts";
import { obGet, obPost } from "../../../../lib/onboarding-route.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => obGet(request, completedGet);
export const POST = (request: Request) => obPost(request, (f) => completedPost(f));

export { neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
