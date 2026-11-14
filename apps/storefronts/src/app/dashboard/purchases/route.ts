/* My Purchases, /dashboard/purchases/: the Membership Pack payment and registration panels. Signed out it goes to the store home; a rejected order sends it to My Purchases. */
import { purchasesPage } from "../../../lib/dashboard-flow.ts";
import { dashGet } from "../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, purchasesPage);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
