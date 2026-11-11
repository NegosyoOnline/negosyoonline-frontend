import { onboardingPage } from "../../../../../lib/onboarding-flow.ts";
import { obGet } from "../../../../../lib/onboarding-route.ts";
import { neutralNotFound } from "../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => obGet(request, (f) => onboardingPage(f, "verify"));

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
