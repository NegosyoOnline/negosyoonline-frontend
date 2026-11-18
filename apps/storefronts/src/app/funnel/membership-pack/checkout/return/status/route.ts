/* The return page's poll: the payment's state as JSON, never cached (src/lib/pack-pay-flow.ts). */
import { obFlowFor } from "../../../../../../lib/onboarding-route.ts";
import { returnStatus } from "../../../../../../lib/pack-pay-flow.ts";
import { neutralNotFound } from "../../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const f = await obFlowFor(request);
  if (!f) return neutralNotFound();
  return returnStatus(f);
}

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
