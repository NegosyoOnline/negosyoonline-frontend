/* The CSV of the member's log, /dashboard/orders/export.csv, with the page's filters. */
import { dashGet } from "../../../../lib/dashboard-route.ts";
import { ordersExport } from "../../../../lib/orders-flow.ts";
import { neutralNotFound } from "../../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, ordersExport);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
