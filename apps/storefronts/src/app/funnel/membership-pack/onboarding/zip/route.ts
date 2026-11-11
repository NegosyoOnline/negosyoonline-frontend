/* The barangay's ZIP for the delivery form (TWCinc address_zip.zip_lookup): read-only GET, the JSON pack-address.js reads. */
import { zipLookup } from "../../../../../lib/onboarding-flow.ts";
import { obFlowFor } from "../../../../../lib/onboarding-route.ts";
import { neutralNotFound } from "../../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const f = await obFlowFor(request);
  if (!f) return neutralNotFound();
  return zipLookup(f, new URL(request.url).searchParams);
}

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
