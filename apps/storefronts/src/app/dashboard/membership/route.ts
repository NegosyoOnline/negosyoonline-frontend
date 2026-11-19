/* My Membership, /dashboard/membership/: the registration state, the benefits Q&A, the Membership Terms and how to use the membership in the Santé Mobile App.
   Signed out it goes to the store home; a rejected order sends it to My Purchases. */
import { membershipPage } from "../../../lib/dashboard-flow.ts";
import { dashGet } from "../../../lib/dashboard-route.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, membershipPage);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
