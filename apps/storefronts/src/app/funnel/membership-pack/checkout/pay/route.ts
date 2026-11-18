/* The pay page: opens the Xendit invoice from this host (src/lib/pack-pay-flow.ts). */
import { obGet } from "../../../../../lib/onboarding-route.ts";
import { payGet } from "../../../../../lib/pack-pay-flow.ts";
import { neutralNotFound } from "../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => obGet(request, (f) => payGet(f));

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
