/* Help, /dashboard/help/: order, membership or app setup, and product questions, answered through this store's own contact details.
   Signed out it goes to the store home; a rejected order sends it to My Purchases. */
import { helpPage } from "../../../lib/dashboard-flow.ts";
import { dashGet } from "../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, helpPage);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
