/* The barangay's ZIP for the checkout's address form: the same read-only JSON the Membership Pack's form reads, here without
   needing a pack order (the lookup needs only the host). */
import { zipLookup } from "../../../lib/onboarding-flow.ts";
import { storefrontEnv } from "../../../lib/env.ts";
import { requestHost, siteFor } from "../../../lib/site.ts";
import { visitorIp } from "../../../lib/visitor.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const site = await siteFor(request);
  if (!site) return neutralNotFound();
  return zipLookup({ host: requestHost(request), visitor_ip: visitorIp(request.headers), request, calls: { env: storefrontEnv() } }, new URL(request.url).searchParams);
}

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
