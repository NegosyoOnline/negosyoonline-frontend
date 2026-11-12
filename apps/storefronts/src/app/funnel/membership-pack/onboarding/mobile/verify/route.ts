import { mobileVerify } from "../../../../../../lib/onboarding-flow.ts";
import { obPost } from "../../../../../../lib/onboarding-route.ts";
import { neutralNotFound } from "../../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => obPost(request, mobileVerify);

export { neutralNotFound as GET, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
