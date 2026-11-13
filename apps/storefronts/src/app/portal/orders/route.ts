/* The buyer's read-only orders, /portal/orders/: the cards, the banner and Logout. Signed out it goes to /portal/. */
import { ordersGet } from "../../../lib/portal-flow.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => ordersGet(request);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
