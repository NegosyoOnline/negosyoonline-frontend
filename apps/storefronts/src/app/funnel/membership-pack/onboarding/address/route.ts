import { addressPost, onboardingPage } from "../../../../../lib/onboarding-flow.ts";
import { obGet, obPost } from "../../../../../lib/onboarding-route.ts";
import { neutralNotFound } from "../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => obGet(request, (f) => onboardingPage(f, "address"));
export const POST = (request: Request) => obPost(request, addressPost);

export { neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
