/* The member Training page, /dashboard/training/ (the University home). Signed out it goes to the store home; a rejected order sends it to My Purchases. */
import { dashGet } from "../../../lib/dashboard-route.ts";
import { trainingPage } from "../../../lib/training-flow.ts";
import { neutralNotFound } from "../../../views/neutral.ts";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dashGet(request, trainingPage);

export { neutralNotFound as POST, neutralNotFound as PUT, neutralNotFound as PATCH, neutralNotFound as DELETE, neutralNotFound as OPTIONS };
