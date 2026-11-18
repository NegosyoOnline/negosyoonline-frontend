/* Where Xendit sends the buyer back (src/lib/pack-pay-flow.ts). GET shows the payment; POST (Try again) asks for a new invoice. */
import { obGet, obPost } from "../../../../../lib/onboarding-route.ts";
import { returnGet, returnPost } from "../../../../../lib/pack-pay-flow.ts";
import { neutralNotFound } from "../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => obGet(request, (f) => returnGet(f));
export const POST = (request: Request) => obPost(request, (f, text) => returnPost(f, text));

export { neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
