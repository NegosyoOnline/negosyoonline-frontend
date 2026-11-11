/* My Orders, /dashboard/orders/. Signed out it goes to the store home; a rejected order locks the dashboard to Home. */
import { ordersPage } from "../../../lib/dashboard-flow.ts";
import { dashGet } from "../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, ordersPage);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
