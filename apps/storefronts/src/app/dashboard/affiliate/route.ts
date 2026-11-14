/* The member Affiliate Hub page, /dashboard/affiliate/ (the Santé Mobile App line; no earnings, no referral link). Signed out it goes to the store home; a rejected order sends it to My Purchases. */
import { affiliatePage } from "../../../lib/dashboard-flow.ts";
import { dashGet } from "../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, affiliatePage);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
