/* Orders, /dashboard/orders/: the member's own log of Santé app orders, under the app line. Signed out it goes to the store home; a rejected order sends it to My Purchases. */
import { ordersPage } from "../../../lib/orders-flow.ts";
import { dashGet } from "../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, ordersPage);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
